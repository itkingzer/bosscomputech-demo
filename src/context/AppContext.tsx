import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { UserAccount, Order, Item, RepairTicket, RepairStatus, RouteCode, JobCategory, Product, StockPO, ProductCategory, getRouteByDistrict, ActivityLog } from '../types';
import { INITIAL_USERS, INITIAL_ORDERS, INITIAL_ITEMS, INITIAL_REPAIR_TICKETS, INITIAL_PRODUCTS } from '../data/initialData';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

// ==============================================================================
// Activity & Audit Log helpers
// สร้าง log entry ใหม่ (ISO timestamp + ชื่อพนักงานผู้กระทำ + บทบาท + หมายเหตุ)
// ==============================================================================
const makeLog = (
  action: string,
  actor: string,
  role: string | undefined,
  note?: string
): ActivityLog => ({
  timestamp: new Date().toISOString(),
  action,
  actor: actor || 'ระบบ',
  role: role as ActivityLog['role'],
  note
});

// ต่อ log ใหม่เข้ากับ array เดิม (immutable)
const appendLog = (logs: ActivityLog[] | undefined | null, entry: ActivityLog): ActivityLog[] => [
  ...(logs || []),
  entry
];

interface AppContextType {
  currentUser: UserAccount | null;
  login: (username: string, role?: string) => boolean;
  logout: () => void;
  users: UserAccount[];
  addUser: (user: Omit<UserAccount, 'id'>) => void;
  deleteUser: (id: string) => void;

  orders: Order[];
  items: Item[];
  repairTickets: RepairTicket[];
  products: Product[];
  stockPOs: StockPO[];

  // Product Catalog CRUD (สินค้า/บริการที่ใช้ซ้ำได้)
  addProduct: (product: Omit<Product, 'id' | 'created_at' | 'updated_at'>) => void;
  updateProduct: (id: string, patch: Partial<Omit<Product, 'id'>>) => void;
  deleteProduct: (id: string) => void;

  createOrder: (order: Omit<Order, 'id' | 'created_at' | 'order_status'> & { planned_model?: string; planned_quantity?: number }) => void;
  updateOrderPOStatus: (orderId: string, status: 'waiting_po' | 'pending_purchasing' | 'po_received_in_stock') => void;
  receivePOIntoStock: (orderId: string, supplier?: string, poNo?: string) => void;
  updateOrderCosts: (orderId: string, extraCost: number, itemCosts: Record<number, number>) => void;
  cutStock: (
    orderId: string,
    billNo: string,
    itemsToCut: { model_name: string; quantity: number; supplier?: string; po_no?: string; prep_note?: string; unit_cost?: number; stockItemId?: string }[]
  ) => void;

  // Proactive Stock Replenishment (Stock PO -> Storage Room raw_stock -> Prep -> In-Stock Ready -> Sales)
  createStockPO: (po: Omit<StockPO, 'id' | 'status' | 'created_at' | 'received_at'>) => void;
  receiveStockPOToStorage: (stockPoId: string) => void;
  cancelStockPO: (stockPoId: string) => void;
  sendRawStockToPrep: (itemId: string) => void;
  movePrepStockToReady: (itemId: string, serialNumber: string, notes?: string) => boolean;
  allocateStockToOrder: (orderId: string, billNo: string, stockItemIds: string[]) => void;

  // Prep operations
  acceptPrepTask: (itemId: string, techName: string) => void;
  prepFinishToStock: (itemId: string, serialNumber: string, prepNote?: string) => boolean;
  prepFinishToReadyStock: (itemId: string, serialNumber: string, prepNote?: string) => boolean;
  prepFinishAndDispatch: (itemId: string, serialNumber: string, voidDate: string, prepNote?: string) => boolean;
  applyVoidAndDispatch: (itemId: string, voidDate: string) => void;
  prepInboundStock: (modelName: string, serialNumber: string, notes?: string) => boolean;
  prepOutboundDispatch: (itemId: string, serialNumber: string, voidDate: string) => boolean;

  assignOnsite: (itemId: string, techs: string[], jobCategory?: JobCategory) => void;
  assignRepairTicketOnsite: (ticketId: string, techs: string[], jobCategory?: JobCategory) => void;
  acceptOnsiteJob: (itemId: string, techName: string) => void;
  confirmOnsiteDelivery: (itemId: string, deliveryNotes?: string) => void;

  createRepairTicket: (ticket: Omit<RepairTicket, 'id' | 'ticket_no' | 'created_at' | 'received_at' | 'status'>) => void;
  completeRepairTicket: (ticketId: string, status: RepairStatus, outcome: string, detail: string, parts: string) => void;
  closeRepairTicket: (ticketId: string) => void;

  // Settings & DB
  isSupabaseLive: boolean;
  supabaseUrl: string;
  supabaseKey: string;
  updateSupabaseConfig: (url: string, key: string) => void;
  disconnectSupabase: () => void;
  resetAllDemoData: () => void;

  // Theme Mode (Liquid Glass Dark / Light)
  theme: 'dark' | 'light';
  toggleTheme: () => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Auth state
  const [currentUser, setCurrentUser] = useState<UserAccount | null>(() => {
    const saved = localStorage.getItem('boss_current_user');
    return saved ? JSON.parse(saved) : null;
  });

  // Ref เก็บผู้ใช้ปัจจุบัน เพื่อให้ async action บันทึกชื่อผู้กระทำได้ถูกต้องเสมอ
  const currentUserRef = useRef<UserAccount | null>(currentUser);
  useEffect(() => {
    currentUserRef.current = currentUser;
  }, [currentUser]);

  // Users state
  const [users, setUsers] = useState<UserAccount[]>(() => {
    const saved = localStorage.getItem('boss_users');
    return saved ? JSON.parse(saved) : INITIAL_USERS;
  });

  // Data states
  const [orders, setOrders] = useState<Order[]>(() => {
    const saved = localStorage.getItem('boss_orders');
    return saved ? JSON.parse(saved) : INITIAL_ORDERS;
  });

  const [items, setItems] = useState<Item[]>(() => {
    const saved = localStorage.getItem('boss_items');
    return saved ? JSON.parse(saved) : INITIAL_ITEMS;
  });

  const [repairTickets, setRepairTickets] = useState<RepairTicket[]>(() => {
    const saved = localStorage.getItem('boss_repair_tickets');
    return saved ? JSON.parse(saved) : INITIAL_REPAIR_TICKETS;
  });

  // Product Catalog (localStorage Demo Mode + Supabase `products` sync)
  const [products, setProducts] = useState<Product[]>(() => {
    const saved = localStorage.getItem('boss_products');
    return saved ? JSON.parse(saved) : INITIAL_PRODUCTS;
  });

  // Stock POs (Proactive Stock Replenishment - localStorage Demo Mode + Supabase `stock_pos` sync)
  const [stockPOs, setStockPOs] = useState<StockPO[]>(() => {
    const saved = localStorage.getItem('boss_stock_pos');
    return saved ? JSON.parse(saved) : [];
  });

  // Supabase state
  const [supabaseUrl, setSupabaseUrl] = useState(() => localStorage.getItem('boss_sb_url') || '');
  const [supabaseKey, setSupabaseKey] = useState(() => localStorage.getItem('boss_sb_key') || '');
  const [isSupabaseLive, setIsSupabaseLive] = useState(false);
  const [supabaseClient, setSupabaseClient] = useState<SupabaseClient | null>(null);

  // Theme state: dark / light
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    const saved = localStorage.getItem('boss_theme');
    if (saved === 'light' || saved === 'dark') return saved;
    return 'dark';
  });

  const toggleTheme = () => {
    setTheme(prev => (prev === 'dark' ? 'light' : 'dark'));
  };

  useEffect(() => {
    localStorage.setItem('boss_theme', theme);
    if (theme === 'light') {
      document.documentElement.classList.add('light');
      document.documentElement.classList.remove('dark');
    } else {
      document.documentElement.classList.add('dark');
      document.documentElement.classList.remove('light');
    }
  }, [theme]);

  // Sync to localStorage
  useEffect(() => {
    if (currentUser) {
      localStorage.setItem('boss_current_user', JSON.stringify(currentUser));
    } else {
      localStorage.removeItem('boss_current_user');
    }
  }, [currentUser]);

  useEffect(() => {
    localStorage.setItem('boss_users', JSON.stringify(users));
  }, [users]);

  useEffect(() => {
    localStorage.setItem('boss_orders', JSON.stringify(orders));
  }, [orders]);

  useEffect(() => {
    localStorage.setItem('boss_items', JSON.stringify(items));
  }, [items]);

  useEffect(() => {
    localStorage.setItem('boss_repair_tickets', JSON.stringify(repairTickets));
  }, [repairTickets]);

  useEffect(() => {
    localStorage.setItem('boss_products', JSON.stringify(products));
  }, [products]);

  useEffect(() => {
    localStorage.setItem('boss_stock_pos', JSON.stringify(stockPOs));
  }, [stockPOs]);

  // Connect Supabase if configured
  useEffect(() => {
    if (supabaseUrl && supabaseKey) {
      try {
        const client = createClient(supabaseUrl, supabaseKey);
        setSupabaseClient(client);
        setIsSupabaseLive(true);

        const loadRemote = async () => {
          const [o, i, r, p, sp] = await Promise.all([
            client.from('orders').select('*').order('created_at', { ascending: false }),
            client.from('items').select('*').order('created_at', { ascending: false }),
            client.from('repair_tickets').select('*').order('created_at', { ascending: false }),
            client.from('products').select('*').order('created_at', { ascending: false }),
            client.from('stock_pos').select('*').order('created_at', { ascending: false })
          ]);
          if (o.data) setOrders(o.data);
          if (i.data) setItems(i.data);
          if (r.data) setRepairTickets(r.data);
          if (p.data) setProducts(p.data as Product[]);
          if (sp.data) setStockPOs(sp.data as StockPO[]);
        };
        loadRemote();

        const channel = client.channel('schema-db-changes')
          .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => loadRemote())
          .on('postgres_changes', { event: '*', schema: 'public', table: 'items' }, () => loadRemote())
          .on('postgres_changes', { event: '*', schema: 'public', table: 'repair_tickets' }, () => loadRemote())
          .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, () => loadRemote())
          .on('postgres_changes', { event: '*', schema: 'public', table: 'stock_pos' }, () => loadRemote())
          .subscribe();

        return () => {
          client.removeChannel(channel);
        };
      } catch (e) {
        console.error('Supabase connect error:', e);
        setIsSupabaseLive(false);
      }
    } else {
      setIsSupabaseLive(false);
      setSupabaseClient(null);
    }
  }, [supabaseUrl, supabaseKey]);

  // Auth functions
  const login = (username: string) => {
    const user = users.find(u => u.username.toLowerCase() === username.toLowerCase());
    if (user) {
      setCurrentUser(user);
      return true;
    }
    return false;
  };

  const logout = () => {
    setCurrentUser(null);
  };

  const addUser = (userData: Omit<UserAccount, 'id'>) => {
    const newUser: UserAccount = {
      ...userData,
      id: 'u-' + Date.now()
    };
    setUsers(prev => [...prev, newUser]);
  };

  const deleteUser = (id: string) => {
    if (id === 'u-admin') return;
    setUsers(prev => prev.filter(u => u.id !== id));
  };

  // Product Catalog CRUD
  const addProduct = async (productData: Omit<Product, 'id' | 'created_at' | 'updated_at'>) => {
    const newProduct: Product = {
      ...productData,
      id: 'prod-' + Date.now(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    if (isSupabaseLive && supabaseClient) {
      const { data } = await supabaseClient.from('products').insert([{
        name: newProduct.name,
        category: newProduct.category,
        item_type: newProduct.item_type,
        unit: newProduct.unit,
        cost_price: newProduct.cost_price,
        sell_price: newProduct.sell_price
      }]).select();
      if (data && data[0]) setProducts(prev => [data[0] as Product, ...prev]);
    } else {
      setProducts(prev => [newProduct, ...prev]);
    }
  };

  const updateProduct = async (id: string, patch: Partial<Omit<Product, 'id'>>) => {
    const updatedAt = new Date().toISOString();
    if (isSupabaseLive && supabaseClient) {
      await supabaseClient.from('products').update({ ...patch, updated_at: updatedAt }).eq('id', id);
    }
    setProducts(prev => prev.map(p => p.id === id ? { ...p, ...patch, updated_at: updatedAt } : p));
  };

  const deleteProduct = async (id: string) => {
    if (isSupabaseLive && supabaseClient) {
      await supabaseClient.from('products').delete().eq('id', id);
    }
    setProducts(prev => prev.filter(p => p.id !== id));
  };

  // Actions
  const createOrder = async (orderData: Omit<Order, 'id' | 'created_at' | 'order_status'> & { planned_model?: string; planned_quantity?: number }) => {
    const routeCode = orderData.district ? getRouteByDistrict(orderData.district) : ('route_5' as RouteCode);
    const actor = currentUserRef.current;
    const now = new Date().toISOString();
    const createdLog = makeLog(
      'เปิดบิลขาย',
      actor?.name || orderData.salesperson || 'ระบบ',
      actor?.role,
      `ลูกค้า: ${orderData.customer_name}${orderData.district ? ` | พื้นที่: ${orderData.district}` : ''}`
    );

    const newOrder: Order = {
      id: 'ord-' + Date.now(),
      sales_ref: orderData.sales_ref,
      salesperson: orderData.salesperson || currentUser?.name,
      customer_name: orderData.customer_name,
      customer_phone: orderData.customer_phone,
      delivery_location: orderData.delivery_location,
      district: orderData.district,
      route_code: routeCode,
      province_custom: orderData.province_custom,
      delivery_date: orderData.delivery_date,
      bill_type: orderData.bill_type || 'tax_invoice',
      payment_term: orderData.payment_term || 'cash',
      delivery_mode: orderData.delivery_mode || 'install',
      site_notes: orderData.site_notes,
      items_list: orderData.items_list || (orderData.planned_model ? [{ model_name: orderData.planned_model, quantity: orderData.planned_quantity || 1 }] : []),
      extra_cost: orderData.extra_cost || 0,
      bill_no: null,
      order_status: 'pending_purchasing',
      created_at: now,
      _planned_model: orderData.planned_model || (orderData.items_list && orderData.items_list[0]?.model_name),
      _planned_quantity: orderData.planned_quantity || (orderData.items_list && orderData.items_list.reduce((sum, item) => sum + (item.quantity || 1), 0)) || 1,
      activity_logs: [createdLog],
      created_by: createdLog.actor,
      created_at_log: now
    };

    if (isSupabaseLive && supabaseClient) {
      await supabaseClient.from('orders').insert([newOrder]);
    } else {
      setOrders(prev => [newOrder, ...prev]);
    }
  };

  const updateOrderPOStatus = async (orderId: string, status: 'waiting_po' | 'pending_purchasing' | 'po_received_in_stock') => {
    const actor = currentUserRef.current;
    const now = new Date().toISOString();
    const actionLabel = status === 'waiting_po' ? 'สั่งซื้อ PO' : status === 'po_received_in_stock' ? 'รับของเข้าสต๊อก' : 'อัปเดตสถานะจัดซื้อ';
    const entry = makeLog(actionLabel, actor?.name || 'ระบบ', actor?.role);
    if (isSupabaseLive && supabaseClient) {
      const target = orders.find(o => o.id === orderId);
      await supabaseClient.from('orders').update({
        order_status: status,
        activity_logs: appendLog(target?.activity_logs, entry),
        ...(status === 'waiting_po' ? { po_created_at: now } : {}),
        ...(status === 'po_received_in_stock' ? { po_received_at: now } : {})
      }).eq('id', orderId);
    } else {
      setOrders(prev => prev.map(o => o.id === orderId ? {
        ...o,
        order_status: status,
        activity_logs: appendLog(o.activity_logs, entry),
        ...(status === 'waiting_po' ? { po_created_at: now } : {}),
        ...(status === 'po_received_in_stock' ? { po_received_at: now } : {})
      } : o));
    }
  };

  const receivePOIntoStock = async (orderId: string, supplier?: string, poNo?: string) => {
    const receivedAt = new Date().toISOString();
    const actor = currentUserRef.current;
    const entry = makeLog(
      'รับของเข้าสต๊อก',
      actor?.name || 'ระบบ',
      actor?.role,
      [supplier ? `Supplier: ${supplier}` : '', poNo ? `PO: ${poNo}` : ''].filter(Boolean).join(' | ') || undefined
    );
    if (isSupabaseLive && supabaseClient) {
      const target = orders.find(o => o.id === orderId);
      await supabaseClient.from('orders').update({
        order_status: 'po_received_in_stock',
        updated_at: receivedAt,
        po_received_at: receivedAt,
        activity_logs: appendLog(target?.activity_logs, entry)
      }).eq('id', orderId);
    } else {
      setOrders(prev => prev.map(o => o.id === orderId ? {
        ...o,
        order_status: 'po_received_in_stock',
        updated_at: receivedAt,
        po_received_at: receivedAt,
        activity_logs: appendLog(o.activity_logs, entry),
        items_list: o.items_list?.map(it => ({
          ...it,
          supplier: supplier || it.supplier,
          po_no: poNo || it.po_no
        }))
      } : o));
    }
  };

  // บันทึกราคาทุน (INTERNAL ONLY) - ต้นทุนต่อหน่วยของแต่ละรายการ + ต้นทุนค่าแรง/ค่าดำเนินการอื่นต่อออเดอร์
  const updateOrderCosts = async (orderId: string, extraCost: number, itemCosts: Record<number, number>) => {
    const updatedAt = new Date().toISOString();
    const actor = currentUserRef.current;
    const entry = makeLog(
      'แก้ไขราคา/ต้นทุน',
      actor?.name || 'ระบบ',
      actor?.role,
      `ต้นทุนค่าแรง/ดำเนินการ: ${extraCost.toLocaleString('th-TH')} บาท`
    );
    if (isSupabaseLive && supabaseClient) {
      const target = orders.find(o => o.id === orderId);
      const nextItems = (target?.items_list || []).map((it, idx) => ({
        ...it,
        unit_cost: itemCosts[idx] !== undefined ? itemCosts[idx] : it.unit_cost
      }));
      await supabaseClient.from('orders').update({
        extra_cost: extraCost,
        items_list: nextItems,
        updated_at: updatedAt,
        activity_logs: appendLog(target?.activity_logs, entry)
      }).eq('id', orderId);
    } else {
      setOrders(prev => prev.map(o => o.id === orderId ? {
        ...o,
        extra_cost: extraCost,
        updated_at: updatedAt,
        activity_logs: appendLog(o.activity_logs, entry),
        items_list: o.items_list?.map((it, idx) => ({
          ...it,
          unit_cost: itemCosts[idx] !== undefined ? itemCosts[idx] : it.unit_cost
        }))
      } : o));
    }
  };

  const cutStock = async (
    orderId: string,
    billNo: string,
    itemsToCut: { model_name: string; quantity: number; supplier?: string; po_no?: string; prep_note?: string; unit_cost?: number; stockItemId?: string }[]
  ) => {
    const targetOrder = orders.find(o => o.id === orderId);
    const newItems: Item[] = [];
    // รายการที่ดึงจากสต๊อก in_stock ที่มีอยู่แล้ว (ไม่สร้างใหม่ แต่แปลงสถานะ)
    const consumedStockIds: string[] = [];
    const actor = currentUserRef.current;
    const cutAt = new Date().toISOString();
    const cutLog = makeLog(
      'ตัดสต๊อกส่งช่างเตรียม',
      actor?.name || 'ระบบ',
      actor?.role,
      `บิล: ${billNo} | จำนวนรายการ: ${itemsToCut.reduce((s, p) => s + (p.quantity || 1), 0)} ชิ้น`
    );

    itemsToCut.forEach((plan, planIdx) => {
      for (let i = 0; i < plan.quantity; i++) {
        // ถ้าเป็นชิ้นแรกของแผน และมี stockItemId (ดึงจากคลัง) → ใช้ item เดิม
        if (i === 0 && plan.stockItemId) {
          consumedStockIds.push(plan.stockItemId);
          continue;
        }

        newItems.push({
          id: 'itm-' + Date.now() + '-' + planIdx + '-' + i,
          order_id: orderId,
          model_name: plan.model_name,
          serial_number: null,
          status: 'pending_prep',
          prep_type: 'outbound_dispatch',
          supplier: plan.supplier || 'สต๊อกร้าน',
          po_no: plan.po_no || billNo,
          prep_note: plan.prep_note || '',
          delivery_mode: targetOrder?.delivery_mode || 'install',
          assigned_prep_tech: null,
          prep_accepted_at: null,
          assigned_techs: [],
          prepped_at: null,
          void_date: null,
          notes: `เบิกตัดสต๊อกตามบิล ${billNo} | PO: ${plan.po_no || '-'} | แหล่ง: ${plan.supplier || 'สต๊อก'}`,
          created_at: cutAt,
          activity_logs: [makeLog('ตัดสต๊อกส่งช่างเตรียม', actor?.name || 'ระบบ', actor?.role, `บิล: ${billNo}`)]
        });
      }
    });

    if (isSupabaseLive && supabaseClient) {
      await supabaseClient.from('orders').update({
        bill_no: billNo,
        order_status: 'approved_for_prep',
        stock_cut_at: cutAt,
        activity_logs: appendLog(targetOrder?.activity_logs, cutLog)
      }).eq('id', orderId);
      if (newItems.length > 0) {
        await supabaseClient.from('items').insert(newItems);
      }
      // แปลง item in_stock ที่มีอยู่ → pending_prep ผูกกับออเดอร์ (ตัดสต๊อกจริง)
      for (const stockId of consumedStockIds) {
        const plan = itemsToCut.find(p => p.stockItemId === stockId);
        await supabaseClient.from('items').update({
          order_id: orderId,
          status: 'pending_prep',
          prep_type: 'outbound_dispatch',
          supplier: plan?.supplier || 'สต๊อกร้าน',
          po_no: plan?.po_no || billNo,
          prep_note: plan?.prep_note || '',
          delivery_mode: targetOrder?.delivery_mode || 'install',
          assigned_prep_tech: null,
          prep_accepted_at: null,
          prepped_at: null,
          void_date: null,
          notes: `ดึงจากสต๊อกคลังตามบิล ${billNo} | PO: ${plan?.po_no || '-'}`
        }).eq('id', stockId);
      }
    } else {
      setOrders(prev => prev.map(o => o.id === orderId ? {
        ...o,
        bill_no: billNo,
        order_status: 'approved_for_prep',
        stock_cut_at: cutAt,
        activity_logs: appendLog(o.activity_logs, cutLog)
      } : o));
      setItems(prev => {
        const consumedSet = new Set(consumedStockIds);
        const updated = prev.map(it => {
          if (!consumedSet.has(it.id)) return it;
          const plan = itemsToCut.find(p => p.stockItemId === it.id);
          return {
            ...it,
            order_id: orderId,
            status: 'pending_prep' as const,
            prep_type: 'outbound_dispatch' as const,
            supplier: plan?.supplier || 'สต๊อกร้าน',
            po_no: plan?.po_no || billNo,
            prep_note: plan?.prep_note || '',
            delivery_mode: targetOrder?.delivery_mode || 'install',
            assigned_prep_tech: null,
            prep_accepted_at: null,
            prepped_at: null,
            void_date: null,
            notes: `ดึงจากสต๊อกคลังตามบิล ${billNo} | PO: ${plan?.po_no || '-'}`,
            activity_logs: appendLog(it.activity_logs, makeLog('ตัดสต๊อกส่งช่างเตรียม', actor?.name || 'ระบบ', actor?.role, `บิล: ${billNo}`))
          };
        });
        return [...updated, ...newItems];
      });
    }
  };

  // ==========================================================================
  // Proactive Stock Replenishment: Stock PO -> Prep Staging -> In-Stock Ready
  // ==========================================================================

  // 1. จัดซื้อเปิดใบสั่งซื้อเข้าสต๊อก (Stock PO) ล่วงหน้า ไม่ผูกกับออเดอร์ลูกค้า
  const createStockPO = async (poData: Omit<StockPO, 'id' | 'status' | 'created_at' | 'received_at'>) => {
    const actor = currentUserRef.current;
    const now = new Date().toISOString();
    const poLog = makeLog(
      'สั่งซื้อ PO',
      actor?.name || 'ระบบ',
      actor?.role,
      `PO: ${poData.po_number} | ${poData.product_name} x${poData.qty} | Supplier: ${poData.supplier || '-'}`
    );
    const newPO: StockPO = {
      ...poData,
      id: 'spo-' + Date.now(),
      status: 'ordered',
      received_at: null,
      created_at: now,
      activity_logs: [poLog],
      created_by: poLog.actor,
      ordered_at: now
    };
    if (isSupabaseLive && supabaseClient) {
      await supabaseClient.from('stock_pos').insert([{
        po_number: newPO.po_number,
        product_name: newPO.product_name,
        category: newPO.category,
        qty: newPO.qty,
        unit_cost: newPO.unit_cost,
        supplier: newPO.supplier,
        status: newPO.status,
        notes: newPO.notes || null,
        activity_logs: newPO.activity_logs,
        created_by: newPO.created_by,
        ordered_at: newPO.ordered_at
      }]);
    } else {
      setStockPOs(prev => [newPO, ...prev]);
    }
  };

  // 2. รับของ Stock PO เข้าห้องสต๊อกตรงๆ -> สร้าง item จำนวน qty ชิ้น สถานะ raw_stock (ยังไม่เตรียม)
  //    ไม่ส่งเข้า PrepView อัตโนมัติ - นับถอยหลังเทส 7 วัน (DOA) ก่อน
  const receiveStockPOToStorage = async (stockPoId: string) => {
    const po = stockPOs.find(p => p.id === stockPoId);
    if (!po || po.status !== 'ordered') return;

    const receivedAt = new Date().toISOString();
    const actor = currentUserRef.current;
    const receiveLog = makeLog(
      'รับของเข้าห้องสต๊อก / เริ่มนับ DOA 7 วัน',
      actor?.name || 'ระบบ',
      actor?.role,
      `PO: ${po.po_number} | ${po.product_name} x${po.qty}`
    );
    const newItems: Item[] = Array.from({ length: Math.max(1, po.qty) }).map((_, i) => ({
      id: 'itm-spo-' + Date.now() + '-' + i,
      order_id: null,
      model_name: po.product_name,
      serial_number: null,
      status: 'raw_stock',
      prep_type: 'stock_po',
      category: po.category,
      stock_po_id: po.id,
      unit_cost: po.unit_cost,
      supplier: po.supplier,
      po_no: po.po_number,
      received_at: receivedAt,
      prep_note: 'เก็บในห้องสต๊อก - ยังไม่เตรียม (นับถอยหลังเทส 7 วัน DOA)',
      assigned_prep_tech: null,
      prep_accepted_at: null,
      assigned_techs: [],
      prepped_at: null,
      void_date: null,
      notes: `รับของจาก Stock PO ${po.po_number} (${po.supplier || '-'}) เข้าห้องสต๊อก`,
      created_at: receivedAt,
      activity_logs: [receiveLog],
      received_into_storage_at: receivedAt
    }));

    if (isSupabaseLive && supabaseClient) {
      await supabaseClient.from('stock_pos').update({
        status: 'received',
        received_at: receivedAt,
        activity_logs: appendLog(po.activity_logs, receiveLog)
      }).eq('id', stockPoId);
      await supabaseClient.from('items').insert(newItems.map(it => ({
        model_name: it.model_name,
        status: it.status,
        prep_type: it.prep_type,
        category: it.category,
        stock_po_id: it.stock_po_id,
        unit_cost: it.unit_cost,
        supplier: it.supplier,
        po_no: it.po_no,
        received_at: it.received_at,
        prep_note: it.prep_note,
        notes: it.notes,
        activity_logs: it.activity_logs,
        received_into_storage_at: it.received_into_storage_at
      })));
    } else {
      setStockPOs(prev => prev.map(p => p.id === stockPoId ? {
        ...p,
        status: 'received' as const,
        received_at: receivedAt,
        activity_logs: appendLog(p.activity_logs, receiveLog)
      } : p));
      setItems(prev => [...newItems, ...prev]);
    }
  };

  // 2.1 จัดซื้อสั่งส่งช่างเทส & ติดโลโก้ล่วงหน้า (ก่อนครบ 7 วัน) -> raw_stock => pending_prep
  const sendRawStockToPrep = async (itemId: string) => {
    const actor = currentUserRef.current;
    const entry = makeLog('ส่งช่างเตรียม (ก่อนครบ DOA)', actor?.name || 'ระบบ', actor?.role, 'จัดซื้อส่งช่างเทส & ติดโลโก้ล่วงหน้า');
    if (isSupabaseLive && supabaseClient) {
      const target = items.find(i => i.id === itemId);
      await supabaseClient.from('items').update({
        status: 'pending_prep',
        prep_type: 'stock_po',
        prep_note: 'จัดซื้อส่งช่างเทส & ติดโลโก้ล่วงหน้า (ก่อนครบ 7 วัน DOA)',
        assigned_prep_tech: null,
        prep_accepted_at: null,
        activity_logs: appendLog(target?.activity_logs, entry)
      }).eq('id', itemId);
    } else {
      setItems(prev => prev.map(i => i.id === itemId ? {
        ...i,
        status: 'pending_prep' as const,
        prep_type: 'stock_po' as const,
        prep_note: 'จัดซื้อส่งช่างเทส & ติดโลโก้ล่วงหน้า (ก่อนครบ 7 วัน DOA)',
        assigned_prep_tech: null,
        prep_accepted_at: null,
        activity_logs: appendLog(i.activity_logs, entry)
      } : i));
    }
  };

  const cancelStockPO = async (stockPoId: string) => {
    const actor = currentUserRef.current;
    const entry = makeLog('ยกเลิก PO', actor?.name || 'ระบบ', actor?.role);
    if (isSupabaseLive && supabaseClient) {
      const target = stockPOs.find(p => p.id === stockPoId);
      await supabaseClient.from('stock_pos').update({
        status: 'cancelled',
        activity_logs: appendLog(target?.activity_logs, entry)
      }).eq('id', stockPoId);
    } else {
      setStockPOs(prev => prev.map(p => p.id === stockPoId ? {
        ...p,
        status: 'cancelled' as const,
        activity_logs: appendLog(p.activity_logs, entry)
      } : p));
    }
  };

  // 3. ช่างเตรียมตรวจเช็ก + ติดโลโก้ + ยิง S/N -> ย้ายเข้าสต๊อกพร้อมขาย (in_stock, ยังไม่ติดวอย)
  const movePrepStockToReady = (itemId: string, serialNumber: string, notes?: string): boolean => {
    const sn = serialNumber.trim();
    if (!sn) return false;
    const existing = items.find(i => i.id !== itemId && i.serial_number && i.serial_number.toLowerCase() === sn.toLowerCase());
    if (existing) return false;

    const preppedAt = new Date().toISOString();
    const actor = currentUserRef.current;
    const entry = makeLog('ติดโลโก้ & สแกน S/N', actor?.name || 'ระบบ', actor?.role, `S/N: ${sn} | เก็บเข้าคลังพร้อมขาย`);
    if (isSupabaseLive && supabaseClient) {
      const target = items.find(i => i.id === itemId);
      supabaseClient.from('items').update({
        serial_number: sn,
        status: 'in_stock',
        prepped_at: preppedAt,
        logo_scanned_at: preppedAt,
        moved_to_ready_at: preppedAt,
        notes: notes || 'ตรวจเช็ก/ติดโลโก้/ยิง S/N ผ่าน เก็บเข้าสต๊อกพร้อมขาย (ยังไม่ติดวอย)',
        activity_logs: appendLog(target?.activity_logs, entry)
      }).eq('id', itemId);
    } else {
      setItems(prev => prev.map(i => i.id === itemId ? {
        ...i,
        serial_number: sn,
        status: 'in_stock' as const,
        prepped_at: preppedAt,
        logo_scanned_at: preppedAt,
        moved_to_ready_at: preppedAt,
        notes: notes || 'ตรวจเช็ก/ติดโลโก้/ยิง S/N ผ่าน เก็บเข้าสต๊อกพร้อมขาย (ยังไม่ติดวอย)',
        activity_logs: appendLog(i.activity_logs, entry)
      } : i));
    }
    return true;
  };

  // 4. จัดสรรสต๊อกให้ออเดอร์ลูกค้า (Allocation)
  //    - raw_stock (ยังไม่เตรียม) => pending_prep (ส่งเข้า PrepView ให้ช่างเทส/ติดโลโก้/ยิง S/N)
  //    - in_stock / prepped_in_stock (เตรียมแล้ว) => prepped_in_stock (รอแปะวอย & ปล่อยของ)
  const allocateStockToOrder = async (orderId: string, billNo: string, stockItemIds: string[]) => {
    if (stockItemIds.length === 0) return;
    const targetOrder = orders.find(o => o.id === orderId);
    const idSet = new Set(stockItemIds);
    const rawIds = new Set(
      items.filter(i => idSet.has(i.id) && i.status === 'raw_stock').map(i => i.id)
    );

    const actor = currentUserRef.current;
    const allocAt = new Date().toISOString();
    const allocLog = makeLog('ตัดสต๊อกส่งช่างเตรียม', actor?.name || 'ระบบ', actor?.role, `จัดสรรสต๊อกตามบิล ${billNo} | ${stockItemIds.length} ชิ้น`);

    if (isSupabaseLive && supabaseClient) {
      await supabaseClient.from('orders').update({
        bill_no: billNo,
        order_status: 'approved_for_prep',
        stock_cut_at: allocAt,
        activity_logs: appendLog(targetOrder?.activity_logs, allocLog)
      }).eq('id', orderId);
      for (const stockId of stockItemIds) {
        const isRaw = rawIds.has(stockId);
        const target = items.find(i => i.id === stockId);
        await supabaseClient.from('items').update({
          order_id: orderId,
          status: isRaw ? 'pending_prep' : 'prepped_in_stock',
          prep_type: 'outbound_dispatch',
          delivery_mode: targetOrder?.delivery_mode || 'install',
          assigned_prep_tech: null,
          prep_accepted_at: null,
          void_date: null,
          notes: isRaw
            ? `จัดสรรจากห้องสต๊อกตามบิล ${billNo} -> ส่งช่างเทส/ติดโลโก้/ยิง S/N`
            : `ตัดสต๊อกพร้อมส่งตามบิล ${billNo} (เครื่องเตรียมแล้ว - รอแปะวอย)`,
          activity_logs: appendLog(target?.activity_logs, makeLog('ตัดสต๊อกส่งช่างเตรียม', actor?.name || 'ระบบ', actor?.role, `บิล: ${billNo}`))
        }).eq('id', stockId);
      }
    } else {
      setOrders(prev => prev.map(o => o.id === orderId ? {
        ...o,
        bill_no: billNo,
        order_status: 'approved_for_prep',
        stock_cut_at: allocAt,
        activity_logs: appendLog(o.activity_logs, allocLog)
      } : o));
      setItems(prev => prev.map(it => {
        if (!idSet.has(it.id)) return it;
        const isRaw = it.status === 'raw_stock';
        return {
          ...it,
          order_id: orderId,
          status: (isRaw ? 'pending_prep' : 'prepped_in_stock') as Item['status'],
          prep_type: 'outbound_dispatch' as const,
          delivery_mode: targetOrder?.delivery_mode || 'install',
          assigned_prep_tech: null,
          prep_accepted_at: null,
          void_date: null,
          notes: isRaw
            ? `จัดสรรจากห้องสต๊อกตามบิล ${billNo} -> ส่งช่างเทส/ติดโลโก้/ยิง S/N`
            : `ตัดสต๊อกพร้อมส่งตามบิล ${billNo} (เครื่องเตรียมแล้ว - รอแปะวอย)`,
          activity_logs: appendLog(it.activity_logs, makeLog('ตัดสต๊อกส่งช่างเตรียม', actor?.name || 'ระบบ', actor?.role, `บิล: ${billNo}`))
        };
      }));
    }
  };

  // ช่างเตรียมรับงาน
  const acceptPrepTask = async (itemId: string, techName: string) => {
    const acceptedAt = new Date().toISOString();
    const actor = currentUserRef.current;
    const entry = makeLog('ช่างกดรับงาน', actor?.name || techName || 'ระบบ', actor?.role, `ช่างผู้รับงาน: ${techName}`);
    if (isSupabaseLive && supabaseClient) {
      const target = items.find(i => i.id === itemId);
      await supabaseClient.from('items').update({
        assigned_prep_tech: techName,
        prep_accepted_at: acceptedAt,
        prep_accepted_log_at: acceptedAt,
        activity_logs: appendLog(target?.activity_logs, entry)
      }).eq('id', itemId);
    } else {
      setItems(prev => prev.map(i => i.id === itemId ? {
        ...i,
        assigned_prep_tech: techName,
        prep_accepted_at: acceptedAt,
        prep_accepted_log_at: acceptedAt,
        activity_logs: appendLog(i.activity_logs, entry)
      } : i));
    }
  };

  // จังหวะที่ 1: ช่างเตรียมเสร็จ / เก็บเข้าสต๊อกรอส่ง (ยังไม่ติดวอย)
  const prepFinishToStock = (itemId: string, serialNumber: string, prepNote?: string): boolean => {
    const existing = items.find(i => i.id !== itemId && i.serial_number && i.serial_number.toLowerCase() === serialNumber.toLowerCase());
    if (existing) {
      return false;
    }

    const preppedAt = new Date().toISOString();
    const actor = currentUserRef.current;
    const entry = makeLog('ติดโลโก้ & สแกน S/N', actor?.name || 'ระบบ', actor?.role, `S/N: ${serialNumber} | เก็บรอส่งมอบ`);
    if (isSupabaseLive && supabaseClient) {
      const target = items.find(i => i.id === itemId);
      supabaseClient.from('items').update({
        serial_number: serialNumber,
        status: 'prepped_in_stock',
        prepped_at: preppedAt,
        logo_scanned_at: preppedAt,
        moved_to_ready_at: preppedAt,
        notes: prepNote || 'ประกอบ/ลงโปรแกรม/ยิง S/N เสร็จ เก็บเข้าสต๊อกรอแปะวอยปล่อยของ',
        activity_logs: appendLog(target?.activity_logs, entry)
      }).eq('id', itemId);
    } else {
      setItems(prev => prev.map(i => i.id === itemId ? {
        ...i,
        serial_number: serialNumber,
        status: 'prepped_in_stock',
        prepped_at: preppedAt,
        logo_scanned_at: preppedAt,
        moved_to_ready_at: preppedAt,
        notes: prepNote || 'ประกอบ/ลงโปรแกรม/ยิง S/N เสร็จ เก็บเข้าสต๊อกรอแปะวอยปล่อยของ',
        activity_logs: appendLog(i.activity_logs, entry)
      } : i));
    }
    return true;
  };

  // จังหวะที่ 1 (ทางเลือกสำหรับของสต๊อก): ติดโลโก้ + ยิง S/N เสร็จ -> เก็บเข้าคลังพร้อมขาย (in_stock, ยังไม่ติดวอย)
  // ปลดผูกออเดอร์ออก (order_id = null) เพื่อให้เครื่องไปโผล่ในสต๊อกพร้อมขายให้ฝ่ายขาย/จัดซื้อดึงไปขายภายหลัง
  const prepFinishToReadyStock = (itemId: string, serialNumber: string, prepNote?: string): boolean => {
    const sn = serialNumber.trim();
    if (!sn) return false;
    const existing = items.find(i => i.id !== itemId && i.serial_number && i.serial_number.toLowerCase() === sn.toLowerCase());
    if (existing) return false;

    const preppedAt = new Date().toISOString();
    const defaultNote = 'ติดโลโก้ & ยิง S/N เสร็จ เก็บเข้าคลังพร้อมขาย (ยังไม่ติดวอย)';
    const actor = currentUserRef.current;
    const entry = makeLog('เก็บเข้าคลังพร้อมขาย / เก็บรอส่งมอบ', actor?.name || 'ระบบ', actor?.role, `S/N: ${sn} | ติดโลโก้ & สแกน S/N เสร็จ`);
    if (isSupabaseLive && supabaseClient) {
      const target = items.find(i => i.id === itemId);
      supabaseClient.from('items').update({
        serial_number: sn,
        status: 'in_stock',
        order_id: null,
        prepped_at: preppedAt,
        logo_scanned_at: preppedAt,
        moved_to_ready_at: preppedAt,
        notes: prepNote || defaultNote,
        activity_logs: appendLog(target?.activity_logs, entry)
      }).eq('id', itemId);
    } else {
      setItems(prev => prev.map(i => i.id === itemId ? {
        ...i,
        serial_number: sn,
        status: 'in_stock' as const,
        order_id: null,
        prepped_at: preppedAt,
        logo_scanned_at: preppedAt,
        moved_to_ready_at: preppedAt,
        notes: prepNote || defaultNote,
        activity_logs: appendLog(i.activity_logs, entry)
      } : i));
    }
    return true;
  };

  // ช่างเตรียมเสร็จ + ติดโลโก้ + แปะวอยทันที -> ส่งตรงไปหน้าร้าน/จัดส่ง (ready_for_dispatch)
  const prepFinishAndDispatch = (itemId: string, serialNumber: string, voidDate: string, prepNote?: string): boolean => {
    const sn = serialNumber.trim();
    if (!sn) return false;
    const existing = items.find(i => i.id !== itemId && i.serial_number && i.serial_number.toLowerCase() === sn.toLowerCase());
    if (existing) return false;

    const preppedAt = new Date().toISOString();
    const actor = currentUserRef.current;
    const entry = makeLog('แปะวอยประกัน', actor?.name || 'ระบบ', actor?.role, `S/N: ${sn} | วอยประกัน: ${voidDate}`);
    if (isSupabaseLive && supabaseClient) {
      const target = items.find(i => i.id === itemId);
      supabaseClient.from('items').update({
        serial_number: sn,
        status: 'ready_for_dispatch',
        void_date: voidDate,
        prepped_at: preppedAt,
        logo_scanned_at: preppedAt,
        warranty_applied_at: preppedAt,
        notes: prepNote || 'ติดโลโก้ & แปะวอยพร้อมส่งออกเลย (ส่งตรงหน้าร้าน/จัดส่ง)',
        activity_logs: appendLog(target?.activity_logs, entry)
      }).eq('id', itemId);
    } else {
      setItems(prev => prev.map(i => i.id === itemId ? {
        ...i,
        serial_number: sn,
        status: 'ready_for_dispatch' as const,
        void_date: voidDate,
        prepped_at: preppedAt,
        logo_scanned_at: preppedAt,
        warranty_applied_at: preppedAt,
        notes: prepNote || 'ติดโลโก้ & แปะวอยพร้อมส่งออกเลย (ส่งตรงหน้าร้าน/จัดส่ง)',
        activity_logs: appendLog(i.activity_logs, entry)
      } : i));
    }
    return true;
  };

  // จังหวะที่ 2: แปะวอยประกัน & ยืนยันปล่อยของออก (ready_for_dispatch)
  const applyVoidAndDispatch = async (itemId: string, voidDate: string) => {
    const actor = currentUserRef.current;
    const now = new Date().toISOString();
    const entry = makeLog('แปะวอยประกัน', actor?.name || 'ระบบ', actor?.role, `วอยประกัน: ${voidDate}`);
    if (isSupabaseLive && supabaseClient) {
      const target = items.find(i => i.id === itemId);
      await supabaseClient.from('items').update({
        status: 'ready_for_dispatch',
        void_date: voidDate,
        warranty_applied_at: now,
        activity_logs: appendLog(target?.activity_logs, entry)
      }).eq('id', itemId);
    } else {
      setItems(prev => prev.map(i => i.id === itemId ? {
        ...i,
        status: 'ready_for_dispatch',
        void_date: voidDate,
        warranty_applied_at: now,
        activity_logs: appendLog(i.activity_logs, entry)
      } : i));
    }
  };

  // 1. เตรียมของเข้าสต๊อก (Inbound Stock)
  const prepInboundStock = (modelName: string, serialNumber: string, notes?: string): boolean => {
    const existing = items.find(i => i.serial_number && i.serial_number.toLowerCase() === serialNumber.toLowerCase());
    if (existing) {
      return false;
    }

    const actor = currentUserRef.current;
    const now = new Date().toISOString();
    const newItem: Item = {
      id: 'itm-' + Date.now(),
      order_id: null,
      model_name: modelName,
      serial_number: serialNumber,
      status: 'in_stock',
      prep_type: 'inbound_stock',
      assigned_techs: [],
      prepped_at: now,
      void_date: null,
      notes: notes || 'ประกอบเทสผ่าน ติดโลโก้ เก็บเข้าสต๊อกพร้อมขาย',
      created_at: now,
      logo_scanned_at: now,
      moved_to_ready_at: now,
      activity_logs: [makeLog('ติดโลโก้ & สแกน S/N', actor?.name || 'ระบบ', actor?.role, `S/N: ${serialNumber} | เก็บเข้าคลังพร้อมขาย`)]
    };

    if (isSupabaseLive && supabaseClient) {
      supabaseClient.from('items').insert([newItem]);
    } else {
      setItems(prev => [newItem, ...prev]);
    }
    return true;
  };

  // 2. เตรียมของออกไปส่ง (Outbound Dispatch + ช่างเตรียมเป็นคนติดวอยประกันที่นี่)
  const prepOutboundDispatch = (itemId: string, serialNumber: string, voidDate: string): boolean => {
    const existing = items.find(i => i.id !== itemId && i.serial_number && i.serial_number.toLowerCase() === serialNumber.toLowerCase());
    if (existing) {
      return false;
    }

    const preppedAt = new Date().toISOString();
    const actor = currentUserRef.current;
    const entry = makeLog('แปะวอยประกัน', actor?.name || 'ระบบ', actor?.role, `S/N: ${serialNumber} | วอยประกัน: ${voidDate}`);
    if (isSupabaseLive && supabaseClient) {
      const target = items.find(i => i.id === itemId);
      supabaseClient.from('items').update({
        serial_number: serialNumber,
        status: 'ready_for_dispatch',
        void_date: voidDate,
        prepped_at: preppedAt,
        warranty_applied_at: preppedAt,
        activity_logs: appendLog(target?.activity_logs, entry)
      }).eq('id', itemId);
    } else {
      setItems(prev => prev.map(i => i.id === itemId ? {
        ...i,
        serial_number: serialNumber,
        status: 'ready_for_dispatch',
        void_date: voidDate,
        prepped_at: preppedAt,
        warranty_applied_at: preppedAt,
        activity_logs: appendLog(i.activity_logs, entry)
      } : i));
    }
    return true;
  };

  const assignOnsite = async (itemId: string, techs: string[], jobCategory?: JobCategory) => {
    const techsArr = Array.isArray(techs) ? techs : [techs];
    const primaryTech = techsArr[0] || '';
    const actor = currentUserRef.current;
    const now = new Date().toISOString();
    const entry = makeLog('จัดสายรถ & มอบหมายช่าง', actor?.name || 'ระบบ', actor?.role, `ทีมช่าง: ${techsArr.join(', ') || '-'}`);
    if (isSupabaseLive && supabaseClient) {
      const target = items.find(i => i.id === itemId);
      await supabaseClient.from('items').update({
        status: 'assigned_onsite',
        assigned_techs: techsArr,
        job_category: jobCategory || 'delivery',
        assigned_onsite_tech: primaryTech, // backward compat
        assigned_at: now,
        activity_logs: appendLog(target?.activity_logs, entry)
      }).eq('id', itemId);
    } else {
      setItems(prev => prev.map(i => i.id === itemId ? {
        ...i,
        status: 'assigned_onsite',
        assigned_techs: techsArr,
        job_category: jobCategory || 'delivery',
        assigned_onsite_tech: primaryTech,
        assigned_at: now,
        activity_logs: appendLog(i.activity_logs, entry)
      } : i));
    }
  };

  // ช่าง Onsite กดรับงานก่อนเริ่มทำ (บันทึกชื่อช่างผู้รับงาน + เวลา)
  const acceptOnsiteJob = async (itemId: string, techName: string) => {
    const acceptedAt = new Date().toISOString();
    const actor = currentUserRef.current;
    const entry = makeLog('เริ่มปฏิบัติงาน / รับเครื่องซ่อม', actor?.name || techName || 'ระบบ', actor?.role, `ช่างผู้รับงาน: ${techName}`);
    if (isSupabaseLive && supabaseClient) {
      const target = items.find(i => i.id === itemId);
      await supabaseClient.from('items').update({
        assigned_prep_tech: techName,
        prep_accepted_at: acceptedAt,
        prep_accepted_log_at: acceptedAt,
        activity_logs: appendLog(target?.activity_logs, entry)
      }).eq('id', itemId);
    } else {
      setItems(prev => prev.map(i => i.id === itemId ? {
        ...i,
        assigned_prep_tech: techName,
        prep_accepted_at: acceptedAt,
        prep_accepted_log_at: acceptedAt,
        activity_logs: appendLog(i.activity_logs, entry)
      } : i));
    }
  };

  const assignRepairTicketOnsite = async (ticketId: string, techs: string[], jobCategory?: JobCategory) => {
    const techsArr = Array.isArray(techs) ? techs : [techs];
    const primaryTech = techsArr[0] || '';
    const actor = currentUserRef.current;
    const now = new Date().toISOString();
    const entry = makeLog('จัดสายรถ & มอบหมายช่าง', actor?.name || 'ระบบ', actor?.role, `ทีมช่าง: ${techsArr.join(', ') || '-'}`);
    if (isSupabaseLive && supabaseClient) {
      const target = repairTickets.find(t => t.id === ticketId);
      await supabaseClient.from('repair_tickets').update({
        assigned_techs: techsArr,
        job_category: jobCategory || 'repair_pickup',
        assigned_onsite_tech: primaryTech,
        assigned_at: now,
        activity_logs: appendLog(target?.activity_logs, entry)
      }).eq('id', ticketId);
    } else {
      setRepairTickets(prev => prev.map(t => t.id === ticketId ? {
        ...t,
        assigned_techs: techsArr,
        job_category: jobCategory || 'repair_pickup',
        assigned_onsite_tech: primaryTech,
        assigned_at: now,
        activity_logs: appendLog(t.activity_logs, entry)
      } : t));
    }
  };

  // 3. ช่าง Onsite ส่งมอบสินค้าถึงมือลูกค้า
  const confirmOnsiteDelivery = async (itemId: string, deliveryNotes?: string) => {
    const targetItem = items.find(i => i.id === itemId);
    const orderId = targetItem?.order_id;
    const actor = currentUserRef.current;
    const now = new Date().toISOString();
    const itemEntry = makeLog('ส่งมอบติดตั้งเสร็จสิ้น', actor?.name || 'ระบบ', actor?.role, deliveryNotes || undefined);

    const updatedItems = items.map(i => i.id === itemId ? {
      ...i,
      status: 'delivered' as const,
      delivered_at: now,
      notes: deliveryNotes ? `${i.notes || ''} | ${deliveryNotes}` : i.notes,
      activity_logs: appendLog(i.activity_logs, itemEntry)
    } : i);

    const relatedOrderItems = updatedItems.filter(i => i.order_id === orderId);
    const allDelivered = relatedOrderItems.length > 0 && relatedOrderItems.every(i => i.status === 'delivered');
    const orderEntry = makeLog('ส่งมอบติดตั้งเสร็จสิ้น', actor?.name || 'ระบบ', actor?.role, 'ออเดอร์ส่งมอบครบทุกชิ้น');

    if (isSupabaseLive && supabaseClient) {
      await supabaseClient.from('items').update({
        status: 'delivered',
        delivered_at: now,
        activity_logs: appendLog(targetItem?.activity_logs, itemEntry)
      }).eq('id', itemId);

      if (orderId && allDelivered) {
        const targetOrder = orders.find(o => o.id === orderId);
        await supabaseClient.from('orders').update({
          order_status: 'fulfilled',
          fulfilled_at: now,
          activity_logs: appendLog(targetOrder?.activity_logs, orderEntry)
        }).eq('id', orderId);
      }
    } else {
      setItems(updatedItems);
      if (orderId && allDelivered) {
        setOrders(prev => prev.map(o => o.id === orderId ? {
          ...o,
          order_status: 'fulfilled',
          fulfilled_at: now,
          activity_logs: appendLog(o.activity_logs, orderEntry)
        } : o));
      }
    }
  };

  const createRepairTicket = async (ticketData: Omit<RepairTicket, 'id' | 'ticket_no' | 'created_at' | 'received_at' | 'status'>) => {
    const routeCode = ticketData.district ? getRouteByDistrict(ticketData.district) : ('route_5' as RouteCode);
    const thaiYear = new Date().getFullYear() + 543;
    const randomNum = Math.floor(100 + Math.random() * 900);
    const generatedTicketNo = `REP-${thaiYear}-${randomNum}`;

    const actor = currentUserRef.current;
    const now = new Date().toISOString();
    const intakeLog = makeLog(
      'เริ่มปฏิบัติงาน / รับเครื่องซ่อม',
      actor?.name || 'ระบบ',
      actor?.role,
      `ใบงาน: ${generatedTicketNo} | ลูกค้า: ${ticketData.customer_name}`
    );
    const newTicket: RepairTicket = {
      ...ticketData,
      id: 'rep-' + Date.now(),
      ticket_no: generatedTicketNo,
      route_code: routeCode,
      status: 'open',
      received_at: now,
      finished_at: null,
      created_at: now,
      activity_logs: [intakeLog],
      received_by: intakeLog.actor,
      started_at: now
    };

    if (isSupabaseLive && supabaseClient) {
      await supabaseClient.from('repair_tickets').insert([newTicket]);
    } else {
      setRepairTickets(prev => [newTicket, ...prev]);
    }
  };

  const completeRepairTicket = async (
    ticketId: string,
    status: RepairStatus,
    outcome: string,
    detail: string,
    parts: string
  ) => {
    const finishedAt = new Date().toISOString();
    const actor = currentUserRef.current;
    const entry = makeLog('ปิดงานซ่อม', actor?.name || 'ระบบ', actor?.role, `ผล: ${outcome}${parts ? ` | อะไหล่: ${parts}` : ''}`);
    if (isSupabaseLive && supabaseClient) {
      const target = repairTickets.find(t => t.id === ticketId);
      await supabaseClient.from('repair_tickets').update({
        status,
        repair_outcome: outcome,
        repair_detail: detail,
        parts_used: parts,
        finished_at: finishedAt,
        activity_logs: appendLog(target?.activity_logs, entry)
      }).eq('id', ticketId);
    } else {
      setRepairTickets(prev => prev.map(t => t.id === ticketId ? {
        ...t,
        status,
        repair_outcome: outcome,
        repair_detail: detail,
        parts_used: parts,
        finished_at: finishedAt,
        activity_logs: appendLog(t.activity_logs, entry)
      } : t));
    }
  };

  const closeRepairTicket = async (ticketId: string) => {
    const actor = currentUserRef.current;
    const now = new Date().toISOString();
    const entry = makeLog('ส่งมอบติดตั้งเสร็จสิ้น / ปิดงานซ่อม', actor?.name || 'ระบบ', actor?.role, 'ส่งมอบคืนลูกค้าเรียบร้อย');
    if (isSupabaseLive && supabaseClient) {
      const target = repairTickets.find(t => t.id === ticketId);
      await supabaseClient.from('repair_tickets').update({
        status: 'returned_closed',
        delivered_at: now,
        activity_logs: appendLog(target?.activity_logs, entry)
      }).eq('id', ticketId);
    } else {
      setRepairTickets(prev => prev.map(t => t.id === ticketId ? {
        ...t,
        status: 'returned_closed',
        delivered_at: now,
        activity_logs: appendLog(t.activity_logs, entry)
      } : t));
    }
  };

  const updateSupabaseConfig = (url: string, key: string) => {
    localStorage.setItem('boss_sb_url', url);
    localStorage.setItem('boss_sb_key', key);
    setSupabaseUrl(url);
    setSupabaseKey(key);
  };

  const disconnectSupabase = () => {
    localStorage.removeItem('boss_sb_url');
    localStorage.removeItem('boss_sb_key');
    setSupabaseUrl('');
    setSupabaseKey('');
    setIsSupabaseLive(false);
    setSupabaseClient(null);
  };

  const resetAllDemoData = () => {
    localStorage.removeItem('boss_orders');
    localStorage.removeItem('boss_items');
    localStorage.removeItem('boss_repair_tickets');
    localStorage.removeItem('boss_users');
    localStorage.removeItem('boss_products');
    localStorage.removeItem('boss_stock_pos');
    setOrders(INITIAL_ORDERS);
    setItems(INITIAL_ITEMS);
    setRepairTickets(INITIAL_REPAIR_TICKETS);
    setUsers(INITIAL_USERS);
    setProducts(INITIAL_PRODUCTS);
    setStockPOs([]);
  };

  return (
    <AppContext.Provider value={{
      currentUser,
      login,
      logout,
      users,
      addUser,
      deleteUser,
      orders,
      items,
      repairTickets,
      products,
      stockPOs,
      addProduct,
      updateProduct,
      deleteProduct,
      createOrder,
      updateOrderPOStatus,
      receivePOIntoStock,
      updateOrderCosts,
      cutStock,
      createStockPO,
      receiveStockPOToStorage,
      cancelStockPO,
      sendRawStockToPrep,
      movePrepStockToReady,
      allocateStockToOrder,
      acceptPrepTask,
      prepFinishToStock,
      prepFinishToReadyStock,
      prepFinishAndDispatch,
      applyVoidAndDispatch,
      prepInboundStock,
      prepOutboundDispatch,
      assignOnsite,
      assignRepairTicketOnsite,
      acceptOnsiteJob,
      confirmOnsiteDelivery,
      createRepairTicket,
      completeRepairTicket,
      closeRepairTicket,
      isSupabaseLive,
      supabaseUrl,
      supabaseKey,
      updateSupabaseConfig,
      disconnectSupabase,
      resetAllDemoData,
      theme,
      toggleTheme
    }}>
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used within AppProvider');
  return context;
};
