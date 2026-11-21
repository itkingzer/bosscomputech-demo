import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { UserAccount, Order, Item, RepairTicket, RepairStatus, RepairLifecycleStatus, ServiceType, RouteCode, JobCategory, Product, StockPO, ProductCategory, getRouteByDistrict, ActivityLog, computeWarrantyExpire, REPAIR_LIFECYCLE_META, ReceivedChannel, ROUTE_DEFINITIONS, WarrantyLookupResult, lookupWarrantyBySerial as lookupWarrantyHelper } from '../types';
import { INITIAL_USERS, INITIAL_ORDERS, INITIAL_ITEMS, INITIAL_REPAIR_TICKETS, INITIAL_PRODUCTS, INITIAL_STOCK_POS } from '../data/initialData';
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

// ------------------------------------------------------------------------------
// Onsite -> In-House Repair handoff payload
// ------------------------------------------------------------------------------
export interface OnsiteHandoffPayload {
  /** งาน Onsite ต้นทาง (ถ้ามี) — จะถูกปิดงานทันทีหลังส่งต่อ */
  origin?: {
    kind: 'item' | 'ticket';
    id: string;
  } | null;
  customer_name: string;
  customer_phone?: string;
  district: string;
  delivery_location?: string;
  province_custom?: string;
  device_model?: string;
  walkin_sn?: string;
  accessories?: string[];
  accessories_other?: string;
  fault_symptom: string;
  received_channel?: ReceivedChannel;
  send_to_repair_shop?: boolean;
}

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
  /**
   * ช่าง Onsite ส่งต่อเครื่องเข้าคิวซ่อมหน้าร้าน (Handoff to Repair Tech)
   * - สร้างใบรับซ่อมใหม่ (REP-...) ด้วย received_channel = 'onsite_pickup'
   * - ปิดงาน Onsite เดิมทันที (item -> delivered / ticket -> returned_closed)
   * - บันทึก activity log ฝั่งงาน Onsite ว่า "รับเครื่องกลับซ่อมและส่งต่อให้ช่างหน้าร้าน (ปิดงาน Onsite)"
   */
  completeOnsiteJobHandoff: (payload: OnsiteHandoffPayload) => Promise<{ ticketNo: string; ticket: RepairTicket }>;

  /**
   * รับแจ้งเหตุ / นัดช่างออกหน้างาน (Onsite Service / Pickup Call) จากฝ่ายหน้าร้าน
   * - สร้างใบงาน Onsite (REP-...) ด้วย intake_channel = 'onsite_pickup'
   * - มอบหมายทีมช่าง Onsite ทันที (assigned_techs + assigned_onsite_tech + assigned_at)
   * - งานจะไปปรากฏในคิว OnsiteView (assignedPickups) ให้ช่างกดรับงานต่อ
   * คืนค่า ticket ที่สร้างขึ้นเพื่อให้หน้าร้านพิมพ์ใบรับแจ้งงานได้ทันที
   */
  createOnsiteServiceCall: (payload: {
    customer_name: string;
    customer_phone?: string;
    district: string;
    delivery_location?: string;
    device_model?: string;
    walkin_sn?: string;
    fault_symptom: string;
    job_category?: JobCategory;
    assigned_techs: string[];
    accessories?: string[];
    accessories_other?: string;
  }) => Promise<RepairTicket>;

  createRepairTicket: (ticket: Omit<RepairTicket, 'id' | 'ticket_no' | 'created_at' | 'received_at' | 'status'>) => Promise<RepairTicket>;
  completeRepairTicket: (ticketId: string, status: RepairStatus, outcome: string, detail: string, parts: string) => void;
  closeRepairTicket: (ticketId: string) => void;
  /**
   * ส่งเครื่องซ่อมที่เสร็จแล้วเข้าคิวจัดสายรถ (Route & Technician Dispatch Queue)
   * - status = 'awaiting_dispatch', is_repair_return = true
   * - บันทึก activity log: "ส่งเข้าคิวจัดสายรถเพื่อมอบหมายช่าง Onsite ส่งคืนลูกค้า โดย [ชื่อพนักงาน]"
   */
  queueRepairTicketForDispatch: (ticketId: string) => void;
  updateOrderDeliveryDate: (orderId: string, deliveryDate: string) => void;
  updateRepairTicketDueDate: (ticketId: string, dueDate: string) => void;
  /**
   * ลูกค้ารับเครื่องซ่อมเองที่หน้าร้าน (ปิดงานทันที)
   * - repair_status = 'completed', status = 'returned_closed', returned_by = 'รับเองหน้าร้าน'
   * - บันทึก activity log + ย้ายเข้า CompletedLogsView
   */
  selfPickupRepairTicket: (ticketId: string, note?: string) => void;
  /**
   * มอบหมายช่าง Onsite นำเครื่องซ่อมที่ซ่อมเสร็จแล้วไปส่งคืนลูกค้า
   * - ตั้ง is_repair_return = true, assigned_techs, route_code, status = 'dispatched_onsite'
   * - งานจะไปปรากฏใน OnsiteView (คิวส่งคืนเครื่องซ่อม)
   */
  dispatchRepairReturnOnsite: (
    ticketId: string,
    techs: string[],
    routeCode?: RouteCode,
    note?: string
  ) => void;
  /**
   * ช่าง Onsite ยืนยันส่งมอบเครื่องซ่อมคืนลูกค้าเสร็จสิ้น
   * - repair_status = 'completed', status = 'returned_closed', returned_by = ชื่อช่าง Onsite
   * - บันทึก activity log + ย้ายเข้า CompletedLogsView
   */
  completeRepairReturnOnsite: (ticketId: string, note?: string) => void;
  /** อัปเดตสถานะวงจรชีวิตงานซ่อม/RMA + บันทึก activity log อัตโนมัติ */
  updateRepairLifecycle: (ticketId: string, repairStatus: RepairLifecycleStatus, note?: string) => void;
  /** อัปเดตข้อมูล RMA (Supplier / Tracking / วันที่ส่ง-รับคืน / S/N ใหม่) + activity log อัตโนมัติ */
  updateRmaTracking: (
    ticketId: string,
    patch: {
      service_type?: ServiceType;
      included_accessories?: string | null;
      rma_supplier?: string | null;
      rma_tracking_no?: string | null;
      rma_sent_date?: string | null;
      rma_returned_date?: string | null;
      replacement_sn?: string | null;
      repair_status?: RepairLifecycleStatus;
    },
    note?: string
  ) => void;
  /**
   * บันทึกข้อมูลงานซ่อมทั้งหมดในครั้งเดียว (สถานะ + RMA + รายละเอียด/อะไหล่/ค่าใช้จ่าย)
   * พร้อม append activity log เพียง 1 รายการ และ sync legacy status ให้ CompletedLogsView
   */
  saveRepairTicket: (
    ticketId: string,
    patch: {
      service_type?: ServiceType;
      included_accessories?: string | null;
      rma_supplier?: string | null;
      rma_tracking_no?: string | null;
      rma_sent_date?: string | null;
      rma_returned_date?: string | null;
      replacement_sn?: string | null;
      repair_status?: RepairLifecycleStatus;
      repair_detail?: string | null;
      parts_used?: string | null;
      repair_cost?: number | null;
      repaired_by?: string | null;
    }
  ) => void;
  /**
   * แก้ไขข้อมูลใบรับซ่อมเบื้องต้น (ลูกค้า / อุปกรณ์ / S/N / อาการเสีย / อุปกรณ์ที่ติดมา)
   * พร้อมบันทึก activity log "แก้ไขข้อมูลใบรับซ่อม"
   */
  updateRepairTicket: (
    ticketId: string,
    patch: {
      customer_name?: string;
      customer_phone?: string | null;
      device_model?: string | null;
      walkin_sn?: string;
      fault_symptom?: string;
      included_accessories?: string | null;
      accessories?: string[];
      accessories_other?: string | null;
    }
  ) => void;
  /** ลบใบรับซ่อมออกจาก state + localStorage / Supabase */
  deleteRepairTicket: (ticketId: string) => void;

  // Settings & DB
  isSupabaseLive: boolean;
  /** True while remote Supabase data is being fetched/refreshed (drives skeleton UI) */
  isSyncing: boolean;
  supabaseUrl: string;
  supabaseKey: string;
  updateSupabaseConfig: (url: string, key: string) => void;
  disconnectSupabase: () => void;
  resetAllDemoData: () => void;
  clearDemoKeepStock: () => void;

  // Theme Mode (Liquid Glass Dark / Light)
  theme: 'dark' | 'light';
  toggleTheme: () => void;

  // Print Repair Receipt Portal State
  printingRepairTicket: RepairTicket | null;
  triggerPrintRepairReceipt: (ticket: RepairTicket) => void;
  closePrintRepairReceipt: () => void;

  // S/N Warranty Lookup
  lookupWarrantyBySerial: (serialNumber: string | null | undefined) => WarrantyLookupResult;
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
  const [isSyncing, setIsSyncing] = useState(false);
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

  // Dedicated Print Repair Receipt State (mounts in #repair-print-root portal outside any closing modal)
  const [printingRepairTicket, setPrintingRepairTicket] = useState<RepairTicket | null>(null);

  const closePrintRepairReceipt = () => {
    setPrintingRepairTicket(null);
  };

  const triggerPrintRepairReceipt = (ticket: RepairTicket) => {
    if (!ticket) return;
    setPrintingRepairTicket(ticket);
    const cleanup = () => setPrintingRepairTicket(null);
    window.addEventListener('afterprint', cleanup, { once: true });
    // Double requestAnimationFrame guarantees the DOM inside #repair-print-root is fully painted before opening print dialog
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        window.print();
        // Clear after print dialog closes (for browsers where window.print() blocks synchronously)
        window.setTimeout(cleanup, 300);
      });
    });
  };

  const lookupWarrantyBySerial = (serialNumber: string | null | undefined): WarrantyLookupResult => {
    return lookupWarrantyHelper(serialNumber, items, orders);
  };

  useEffect(() => {
    localStorage.setItem('boss_theme', theme);
    const root = document.documentElement;
    if (theme === 'light') {
      root.classList.add('light');
      root.classList.remove('dark');
      root.setAttribute('data-theme', 'light');
    } else {
      root.classList.add('dark');
      root.classList.remove('light');
      root.setAttribute('data-theme', 'dark');
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
          setIsSyncing(true);
          try {
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
          } finally {
            setIsSyncing(false);
          }
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
      setIsSyncing(false);
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

        const matchedOrderItem = (targetOrder?.items_list || []).find(oi => oi.model_name === plan.model_name);
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
          warranty_years: matchedOrderItem?.warranty_years ?? 0,
          warranty_months: matchedOrderItem?.warranty_months ?? 0,
          warranty_void_date: null,
          warranty_expire_date: null,
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
        const matchedOrderItem = (targetOrder?.items_list || []).find(oi => oi.model_name === plan?.model_name);
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
          warranty_years: matchedOrderItem?.warranty_years ?? 0,
          warranty_months: matchedOrderItem?.warranty_months ?? 0,
          warranty_void_date: null,
          warranty_expire_date: null,
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
          const matchedOrderItem = (targetOrder?.items_list || []).find(oi => oi.model_name === it.model_name);
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
            warranty_years: matchedOrderItem?.warranty_years ?? 0,
            warranty_months: matchedOrderItem?.warranty_months ?? 0,
            warranty_void_date: null,
            warranty_expire_date: null,
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
        // ผูกระยะเวลาประกันจากรายการขาย (OrderItem) เข้ากับเครื่อง (Item)
        const matchedOrderItem = (targetOrder?.items_list || []).find(oi => oi.model_name === target?.model_name);
        await supabaseClient.from('items').update({
          order_id: orderId,
          status: isRaw ? 'pending_prep' : 'prepped_in_stock',
          prep_type: 'outbound_dispatch',
          delivery_mode: targetOrder?.delivery_mode || 'install',
          assigned_prep_tech: null,
          prep_accepted_at: null,
          void_date: null,
          warranty_years: matchedOrderItem?.warranty_years ?? 0,
          warranty_months: matchedOrderItem?.warranty_months ?? 0,
          warranty_void_date: null,
          warranty_expire_date: null,
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
        const matchedOrderItem = (targetOrder?.items_list || []).find(oi => oi.model_name === it.model_name);
        return {
          ...it,
          order_id: orderId,
          status: (isRaw ? 'pending_prep' : 'prepped_in_stock') as Item['status'],
          prep_type: 'outbound_dispatch' as const,
          delivery_mode: targetOrder?.delivery_mode || 'install',
          assigned_prep_tech: null,
          prep_accepted_at: null,
          void_date: null,
          warranty_years: matchedOrderItem?.warranty_years ?? 0,
          warranty_months: matchedOrderItem?.warranty_months ?? 0,
          warranty_void_date: null,
          warranty_expire_date: null,
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
    const target = items.find(i => i.id === itemId);
    // เริ่มนับประกันตั้งแต่วันแปะวอย (timestamp จริง) + คำนวณวันหมดประกัน
    const warrantyExpire = computeWarrantyExpire(preppedAt, target?.warranty_years, target?.warranty_months);
    const entry = makeLog('แปะวอยประกัน', actor?.name || 'ระบบ', actor?.role, `S/N: ${sn} | วอยประกัน: ${voidDate}`);
    if (isSupabaseLive && supabaseClient) {
      supabaseClient.from('items').update({
        serial_number: sn,
        status: 'ready_for_dispatch',
        void_date: voidDate,
        prepped_at: preppedAt,
        logo_scanned_at: preppedAt,
        warranty_applied_at: preppedAt,
        warranty_void_date: preppedAt,
        warranty_expire_date: warrantyExpire,
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
        warranty_void_date: preppedAt,
        warranty_expire_date: warrantyExpire,
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
    const target = items.find(i => i.id === itemId);
    // เริ่มนับประกันตั้งแต่วันแปะวอย (timestamp จริง) + คำนวณวันหมดประกัน
    const warrantyExpire = computeWarrantyExpire(now, target?.warranty_years, target?.warranty_months);
    const entry = makeLog('แปะวอยประกัน', actor?.name || 'ระบบ', actor?.role, `วอยประกัน: ${voidDate}`);
    if (isSupabaseLive && supabaseClient) {
      await supabaseClient.from('items').update({
        status: 'ready_for_dispatch',
        void_date: voidDate,
        warranty_applied_at: now,
        warranty_void_date: now,
        warranty_expire_date: warrantyExpire,
        activity_logs: appendLog(target?.activity_logs, entry)
      }).eq('id', itemId);
    } else {
      setItems(prev => prev.map(i => i.id === itemId ? {
        ...i,
        status: 'ready_for_dispatch',
        void_date: voidDate,
        warranty_applied_at: now,
        warranty_void_date: now,
        warranty_expire_date: warrantyExpire,
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
    const target = items.find(i => i.id === itemId);
    // เริ่มนับประกันตั้งแต่วันแปะวอย (timestamp จริง) + คำนวณวันหมดประกัน
    const warrantyExpire = computeWarrantyExpire(preppedAt, target?.warranty_years, target?.warranty_months);
    const entry = makeLog('แปะวอยประกัน', actor?.name || 'ระบบ', actor?.role, `S/N: ${serialNumber} | วอยประกัน: ${voidDate}`);
    if (isSupabaseLive && supabaseClient) {
      supabaseClient.from('items').update({
        serial_number: serialNumber,
        status: 'ready_for_dispatch',
        void_date: voidDate,
        prepped_at: preppedAt,
        warranty_applied_at: preppedAt,
        warranty_void_date: preppedAt,
        warranty_expire_date: warrantyExpire,
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
        warranty_void_date: preppedAt,
        warranty_expire_date: warrantyExpire,
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

  // ---------------------------------------------------------------------------
  // Onsite -> In-House Repair handoff
  // สร้างใบรับซ่อมใหม่ + ปิดงาน Onsite ต้นทางทันที (ย้ายเข้า CompletedLogsView)
  // ---------------------------------------------------------------------------
  const completeOnsiteJobHandoff = async (
    payload: OnsiteHandoffPayload
  ): Promise<{ ticketNo: string; ticket: RepairTicket }> => {
    const actor = currentUserRef.current;
    const now = new Date().toISOString();
    const techName = actor?.name || 'ช่าง Onsite';
    const thaiYear = new Date().getFullYear() + 543;
    const generatedTicketNo = `REP-${thaiYear}-${Math.floor(100 + Math.random() * 900)}`;
    const routeCode = payload.district ? getRouteByDistrict(payload.district) : ('route_5' as RouteCode);
    const finalSn = payload.walkin_sn?.trim() || `SN-ONSITE-${Math.floor(1000 + Math.random() * 9000)}`;
    const accessories = payload.accessories || [];
    const accessoriesOther = payload.accessories_other?.trim() || '';

    const receivedChannel: ReceivedChannel =
      payload.received_channel || (payload.origin ? 'onsite_pickup' : 'onsite_service_sheet');

    const logAction =
      receivedChannel === 'onsite_service_sheet'
        ? `ออกใบ Service Sheet รับฝาก/งานเพิ่มหน้างาน โดย ${techName}`
        : `รับเครื่องซ่อมจากหน้างาน โดย ${techName}`;

    const intakeLog = makeLog(
      logAction,
      techName,
      actor?.role,
      `ใบงาน: ${generatedTicketNo} | ลูกค้า: ${payload.customer_name}`
    );

    const newTicket: RepairTicket = {
      id: 'rep-' + Date.now(),
      item_id: null,
      ticket_no: generatedTicketNo,
      walkin_sn: finalSn,
      customer_name: payload.customer_name.trim(),
      customer_phone: payload.customer_phone?.trim() || null,
      // ใบรับซ่อมที่สร้างจากการส่งต่อ/ออก Service Sheet ถือเป็นงานส่งเข้าห้องช่างหน้าร้าน (in_house_repair)
      // ไม่ใช่คิว Onsite — จึงไม่ใช้ intake_channel = 'onsite_pickup' เพื่อไม่ให้การ์ดค้างในคิวช่าง Onsite
      intake_channel: 'front_desk_walkin',
      received_by: techName,
      received_channel: receivedChannel,
      device_model: payload.device_model?.trim() || null,
      accessories,
      accessories_other: accessoriesOther || null,
      picked_up_by: techName,
      fault_symptom: payload.fault_symptom.trim(),
      repair_detail:
        receivedChannel === 'onsite_service_sheet'
          ? `งาน Service Sheet เพิ่มเติมหน้างาน บันทึกโดย ${techName}`
          : `รับเครื่องจากหน้างานโดย ${techName} ส่งเข้าห้องช่างซ่อม`,
      parts_used: null,
      repair_outcome: null,
      district: payload.district,
      route_code: routeCode,
      delivery_location: payload.delivery_location?.trim() || '',
      province_custom: routeCode === 'route_6' ? payload.province_custom : undefined,
      job_category: 'repair_pickup',
      assigned_techs: [],
      assigned_onsite_tech: null,
      status: 'open',
      received_at: now,
      finished_at: null,
      created_at: now,
      started_at: now,
      activity_logs: [intakeLog],
      service_type: 'in_house_repair',
      included_accessories:
        [...accessories, accessoriesOther].filter(Boolean).join(', ') || null,
      repair_status: 'pending_check'
    };

    // 1) สร้างใบรับซ่อมใหม่ (REP-...) เข้าคิวช่างหน้าร้าน
    if (isSupabaseLive && supabaseClient) {
      await supabaseClient.from('repair_tickets').insert([newTicket]);
    } else {
      setRepairTickets(prev => [newTicket, ...prev]);
    }

    // 2) ปิดงาน Onsite ต้นทางทันที + บันทึก activity log
    //    ใช้ functional setState (prev) เพื่ออ่านข้อมูลล่าสุดเสมอ — ไม่ใช้ closure ที่อาจ stale
    const origin = payload.origin;
    if (origin) {
      const closeAction = `รับเครื่องกลับซ่อมและส่งต่อให้ช่างหน้าร้าน (ปิดงาน Onsite) โดย ${techName}`;
      const closeNote = `ส่งต่อเป็นใบรับซ่อม ${generatedTicketNo}`;
      const closeEntry = makeLog(closeAction, techName, actor?.role, closeNote);

      if (origin.kind === 'item') {
        if (isSupabaseLive && supabaseClient) {
          const { data: freshItem } = await supabaseClient
            .from('items').select('activity_logs').eq('id', origin.id).single();
          await supabaseClient.from('items').update({
            status: 'delivered',
            delivered_at: now,
            activity_logs: appendLog(freshItem?.activity_logs, closeEntry)
          }).eq('id', origin.id);
        } else {
          setItems(prev => prev.map(i => i.id === origin.id ? {
            ...i,
            status: 'delivered' as const,
            delivered_at: now,
            activity_logs: appendLog(i.activity_logs, closeEntry)
          } : i));
        }
      } else {
        if (isSupabaseLive && supabaseClient) {
          const { data: freshTicket } = await supabaseClient
            .from('repair_tickets').select('activity_logs').eq('id', origin.id).single();
          await supabaseClient.from('repair_tickets').update({
            status: 'returned_closed',
            repair_status: 'completed',
            delivered_at: now,
            activity_logs: appendLog(freshTicket?.activity_logs, closeEntry)
          }).eq('id', origin.id);
        } else {
          setRepairTickets(prev => prev.map(t => t.id === origin.id ? {
            ...t,
            status: 'returned_closed' as const,
            repair_status: 'completed' as const,
            delivered_at: now,
            activity_logs: appendLog(t.activity_logs, closeEntry)
          } : t));
        }
      }
    }

    return { ticketNo: generatedTicketNo, ticket: newTicket };
  };

  const createRepairTicket = async (ticketData: Omit<RepairTicket, 'id' | 'ticket_no' | 'created_at' | 'received_at' | 'status'>) => {
    const routeCode = ticketData.district ? getRouteByDistrict(ticketData.district) : ('route_5' as RouteCode);
    const thaiYear = new Date().getFullYear() + 543;
    const randomNum = Math.floor(100 + Math.random() * 900);
    const generatedTicketNo = `REP-${thaiYear}-${randomNum}`;

    const actor = currentUserRef.current;
    const now = new Date().toISOString();
    // ระบุช่องทางผู้รับเครื่อง: ช่าง Onsite รับกลับมาจากหน้างาน หรือ รับที่หน้าร้าน
    const receivedChannel: ReceivedChannel =
      ticketData.received_channel ||
      (ticketData.intake_channel === 'onsite_pickup' ? 'onsite_pickup' : 'front_desk');
    const receivedByName = ticketData.received_by || actor?.name || 'ระบบ';
    const intakeAction =
      receivedChannel === 'onsite_pickup'
        ? `รับเครื่องซ่อมจากหน้างาน โดย ${receivedByName}`
        : 'เริ่มปฏิบัติงาน / รับเครื่องซ่อม';
    const intakeLog = makeLog(
      intakeAction,
      receivedByName,
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
      received_by: receivedByName,
      received_channel: receivedChannel,
      started_at: now,
      // --- In-House Repair / RMA defaults ---
      service_type: ticketData.service_type || 'in_house_repair',
      included_accessories:
        ticketData.included_accessories ??
        [...(ticketData.accessories || []), ticketData.accessories_other || ''].filter(Boolean).join(', '),
      repair_status: ticketData.repair_status || 'pending_check'
    };

    if (isSupabaseLive && supabaseClient) {
      await supabaseClient.from('repair_tickets').insert([newTicket]);
    } else {
      setRepairTickets(prev => [newTicket, ...prev]);
    }
    return newTicket;
  };

  // ---------------------------------------------------------------------------
  // Front-Desk -> Onsite Service / Pickup Call
  // รับแจ้งเหตุทางโทรศัพท์/หน้าร้าน แล้วสร้างใบงาน Onsite + มอบหมายช่างทันที
  // ---------------------------------------------------------------------------
  const createOnsiteServiceCall = async (payload: {
    customer_name: string;
    customer_phone?: string;
    district: string;
    delivery_location?: string;
    device_model?: string;
    walkin_sn?: string;
    fault_symptom: string;
    job_category?: JobCategory;
    assigned_techs: string[];
    accessories?: string[];
    accessories_other?: string;
  }): Promise<RepairTicket> => {
    const routeCode = payload.district ? getRouteByDistrict(payload.district) : ('route_5' as RouteCode);
    const thaiYear = new Date().getFullYear() + 543;
    const randomNum = Math.floor(100 + Math.random() * 900);
    const generatedTicketNo = `REP-${thaiYear}-${randomNum}`;

    const actor = currentUserRef.current;
    const now = new Date().toISOString();
    const techsArr = Array.isArray(payload.assigned_techs) ? payload.assigned_techs : [];
    const primaryTech = techsArr[0] || '';
    const jobCategory: JobCategory = payload.job_category || 'repair_pickup';
    const receivedByName = actor?.name || 'ระบบ';

    const intakeLog = makeLog(
      'รับแจ้งเหตุ / นัดช่างออกหน้างาน',
      receivedByName,
      actor?.role,
      `ใบงาน: ${generatedTicketNo} | ลูกค้า: ${payload.customer_name} | ทีมช่าง: ${techsArr.join(', ') || '-'}`
    );
    const assignLog = makeLog(
      'จัดสายรถ & มอบหมายช่าง',
      receivedByName,
      actor?.role,
      `ทีมช่าง: ${techsArr.join(', ') || '-'}`
    );

    const newTicket: RepairTicket = {
      id: 'rep-' + Date.now(),
      item_id: null,
      ticket_no: generatedTicketNo,
      walkin_sn: payload.walkin_sn || '',
      customer_name: payload.customer_name,
      customer_phone: payload.customer_phone || null,
      intake_channel: 'onsite_pickup',
      device_model: payload.device_model || null,
      accessories: payload.accessories || [],
      accessories_other: payload.accessories_other || null,
      fault_symptom: payload.fault_symptom,
      repair_detail: null,
      parts_used: null,
      repair_outcome: null,
      district: payload.district,
      route_code: routeCode,
      delivery_location: payload.delivery_location || '',
      job_category: jobCategory,
      assigned_techs: techsArr,
      assigned_onsite_tech: primaryTech,
      status: 'open',
      received_at: now,
      finished_at: null,
      created_at: now,
      activity_logs: [intakeLog, assignLog],
      received_by: receivedByName,
      received_channel: 'onsite_pickup',
      started_at: now,
      assigned_at: now,
      service_type: 'in_house_repair',
      included_accessories:
        [...(payload.accessories || []), payload.accessories_other || ''].filter(Boolean).join(', '),
      repair_status: 'pending_check'
    };

    if (isSupabaseLive && supabaseClient) {
      await supabaseClient.from('repair_tickets').insert([newTicket]);
    } else {
      setRepairTickets(prev => [newTicket, ...prev]);
    }
    return newTicket;
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
    // ซ่อมเสร็จ / ส่งเคลม -> พร้อมส่งมอบ (รอลูกค้ารับ)
    const nextLifecycle: RepairLifecycleStatus =
      status === 'returned_closed' ? 'completed' : 'ready_pickup';
    if (isSupabaseLive && supabaseClient) {
      const target = repairTickets.find(t => t.id === ticketId);
      await supabaseClient.from('repair_tickets').update({
        status,
        repair_outcome: outcome,
        repair_detail: detail,
        parts_used: parts,
        finished_at: finishedAt,
        repair_status: nextLifecycle,
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
        repair_status: nextLifecycle,
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
        repair_status: 'completed',
        delivered_at: now,
        activity_logs: appendLog(target?.activity_logs, entry)
      }).eq('id', ticketId);
    } else {
      setRepairTickets(prev => prev.map(t => t.id === ticketId ? {
        ...t,
        status: 'returned_closed',
        repair_status: 'completed',
        delivered_at: now,
        activity_logs: appendLog(t.activity_logs, entry)
      } : t));
    }
  };

  // ---------------------------------------------------------------------------
  // Repair Return / Handover (ready_pickup -> completed)
  // 1) ส่งเข้าคิวจัดสายรถ  2) ลูกค้ารับเองหน้าร้าน  3) มอบหมายช่าง Onsite ไปส่งคืน  4) ช่าง Onsite ส่งมอบเสร็จ
  // ---------------------------------------------------------------------------
  const queueRepairTicketForDispatch = async (ticketId: string) => {
    const actor = currentUserRef.current;
    const actorName = actor?.name || 'หน้าร้าน';
    const entry = makeLog(
      `ส่งเข้าคิวจัดสายรถเพื่อมอบหมายช่าง Onsite ส่งคืนลูกค้า โดย ${actorName}`,
      actorName,
      actor?.role,
      'ย้ายเข้าคิวจัดสายรถ & มอบหมายช่าง Onsite'
    );
    const patch: Partial<RepairTicket> = {
      status: 'awaiting_dispatch',
      is_repair_return: true
    };
    if (isSupabaseLive && supabaseClient) {
      const target = repairTickets.find(t => t.id === ticketId);
      await supabaseClient.from('repair_tickets').update({
        ...patch,
        activity_logs: appendLog(target?.activity_logs, entry)
      }).eq('id', ticketId);
    } else {
      setRepairTickets(prev => prev.map(t => t.id === ticketId ? {
        ...t,
        ...patch,
        activity_logs: appendLog(t.activity_logs, entry)
      } : t));
    }
  };

  const updateOrderDeliveryDate = async (orderId: string, deliveryDate: string) => {
    const clean = deliveryDate.trim() || undefined;
    if (isSupabaseLive && supabaseClient) {
      await supabaseClient.from('orders').update({ delivery_date: clean || null }).eq('id', orderId);
    } else {
      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, delivery_date: clean } : o));
    }
  };

  const updateRepairTicketDueDate = async (ticketId: string, dueDate: string) => {
    const clean = dueDate.trim() || null;
    if (isSupabaseLive && supabaseClient) {
      await supabaseClient.from('repair_tickets').update({ due_date: clean }).eq('id', ticketId);
    } else {
      setRepairTickets(prev => prev.map(t => t.id === ticketId ? { ...t, due_date: clean } : t));
    }
  };

  const selfPickupRepairTicket = async (ticketId: string, note?: string) => {
    const actor = currentUserRef.current;
    const now = new Date().toISOString();
    const entry = makeLog(
      'ลูกค้ารับเครื่องซ่อมเองที่หน้าร้าน / ปิดงาน',
      actor?.name || 'ระบบ',
      actor?.role,
      note || 'ส่งมอบคืนลูกค้าเรียบร้อย (รับเองหน้าร้าน)'
    );
    if (isSupabaseLive && supabaseClient) {
      const target = repairTickets.find(t => t.id === ticketId);
      await supabaseClient.from('repair_tickets').update({
        status: 'returned_closed',
        repair_status: 'completed',
        returned_by: 'รับเองหน้าร้าน',
        delivered_at: now,
        activity_logs: appendLog(target?.activity_logs, entry)
      }).eq('id', ticketId);
    } else {
      setRepairTickets(prev => prev.map(t => t.id === ticketId ? {
        ...t,
        status: 'returned_closed',
        repair_status: 'completed',
        returned_by: 'รับเองหน้าร้าน',
        delivered_at: now,
        activity_logs: appendLog(t.activity_logs, entry)
      } : t));
    }
  };

  const dispatchRepairReturnOnsite = async (
    ticketId: string,
    techs: string[],
    routeCode?: RouteCode,
    note?: string
  ) => {
    const techsArr = Array.isArray(techs) ? techs : [techs];
    const primaryTech = techsArr[0] || '';
    const actor = currentUserRef.current;
    const now = new Date().toISOString();
    const routeLabel = routeCode ? (ROUTE_DEFINITIONS[routeCode]?.shortName || routeCode) : 'ไม่ระบุสายรถ';
    const entry = makeLog(
      `มอบหมายช่าง Onsite (${techsArr.join(', ') || '-'}) นำเครื่องซ่อมส่งคืนลูกค้า สายรถ ${routeLabel}`,
      actor?.name || 'ระบบ',
      actor?.role,
      note
    );
    const patch: Partial<RepairTicket> = {
      status: 'dispatched_onsite',
      is_repair_return: true,
      assigned_techs: techsArr,
      assigned_onsite_tech: primaryTech,
      job_category: 'repair_return',
      assigned_at: now
    };
    if (routeCode) patch.route_code = routeCode;
    if (isSupabaseLive && supabaseClient) {
      const target = repairTickets.find(t => t.id === ticketId);
      await supabaseClient.from('repair_tickets').update({
        ...patch,
        activity_logs: appendLog(target?.activity_logs, entry)
      }).eq('id', ticketId);
    } else {
      setRepairTickets(prev => prev.map(t => t.id === ticketId ? {
        ...t,
        ...patch,
        activity_logs: appendLog(t.activity_logs, entry)
      } : t));
    }
  };

  const completeRepairReturnOnsite = async (ticketId: string, note?: string) => {
    const actor = currentUserRef.current;
    const now = new Date().toISOString();
    const techName = actor?.name || 'ช่าง Onsite';
    const entry = makeLog(
      `ส่งมอบเครื่องซ่อมคืนลูกค้าเสร็จสิ้น โดย ${techName}`,
      techName,
      actor?.role,
      note || 'ช่าง Onsite ส่งคืนเครื่องซ่อมให้ลูกค้าเรียบร้อย'
    );
    if (isSupabaseLive && supabaseClient) {
      const target = repairTickets.find(t => t.id === ticketId);
      await supabaseClient.from('repair_tickets').update({
        status: 'returned_closed',
        repair_status: 'completed',
        returned_by: techName,
        delivered_at: now,
        activity_logs: appendLog(target?.activity_logs, entry)
      }).eq('id', ticketId);
    } else {
      setRepairTickets(prev => prev.map(t => t.id === ticketId ? {
        ...t,
        status: 'returned_closed',
        repair_status: 'completed',
        returned_by: techName,
        delivered_at: now,
        activity_logs: appendLog(t.activity_logs, entry)
      } : t));
    }
  };

  // อัปเดตสถานะวงจรชีวิตงานซ่อม/RMA (พร้อมบันทึก activity log อัตโนมัติ)
  const updateRepairLifecycle = async (
    ticketId: string,
    repairStatus: RepairLifecycleStatus,
    note?: string
  ) => {
    const actor = currentUserRef.current;
    const now = new Date().toISOString();
    const label = REPAIR_LIFECYCLE_META[repairStatus]?.label || repairStatus;
    const target = repairTickets.find(t => t.id === ticketId);

    // เมื่อช่างเริ่มลงมือซ่อม (repairing) และยังไม่มีช่างผู้ซ่อม -> มอบหมายให้ผู้ใช้ปัจจุบันเป็นช่างผู้ซ่อม
    const assignRepairedBy =
      (repairStatus === 'repairing' || repairStatus === 'waiting_parts') && !target?.repaired_by
        ? (actor?.name || null)
        : undefined;

    // ready_pickup = จบงานฝั่งช่าง ส่งเครื่องคืนห้องหน้าร้าน -> log ข้อความ handoff ที่ชัดเจน
    const techName = target?.repaired_by || actor?.name || 'ระบบ';
    const entry =
      repairStatus === 'ready_pickup'
        ? makeLog(
          `ซ่อม/เคลมเสร็จ ส่งเครื่องคืนห้องหน้าร้าน (จบงานฝั่งช่าง) โดย ${techName}`,
          actor?.name || 'ระบบ',
          actor?.role,
          note
        )
        : makeLog(`อัปเดตสถานะ: ${label}`, actor?.name || 'ระบบ', actor?.role, note);

    // สถานะซ่อมเสร็จ/ส่งมอบ -> sync กับ legacy status ให้หน้าร้าน/Onsite เห็นตรงกัน
    const legacyPatch: Partial<RepairTicket> = {};
    if (assignRepairedBy) legacyPatch.repaired_by = assignRepairedBy;
    if (repairStatus === 'ready_pickup') {
      legacyPatch.status = 'repaired';
      legacyPatch.finished_at = now;
    } else if (repairStatus === 'completed') {
      legacyPatch.status = 'returned_closed';
      legacyPatch.delivered_at = now;
    } else if (repairStatus === 'repairing' || repairStatus === 'waiting_parts') {
      legacyPatch.status = 'in_progress';
    } else if (repairStatus === 'pending_check') {
      legacyPatch.status = 'open';
    }

    if (isSupabaseLive && supabaseClient) {
      await supabaseClient.from('repair_tickets').update({
        repair_status: repairStatus,
        ...legacyPatch,
        activity_logs: appendLog(target?.activity_logs, entry)
      }).eq('id', ticketId);
    } else {
      setRepairTickets(prev => prev.map(t => t.id === ticketId ? {
        ...t,
        repair_status: repairStatus,
        ...legacyPatch,
        activity_logs: appendLog(t.activity_logs, entry)
      } : t));
    }
  };

  // อัปเดตข้อมูล RMA (Supplier / Tracking / วันที่ / S/N ใหม่) + activity log อัตโนมัติ
  const updateRmaTracking = async (
    ticketId: string,
    patch: {
      service_type?: ServiceType;
      included_accessories?: string | null;
      rma_supplier?: string | null;
      rma_tracking_no?: string | null;
      rma_sent_date?: string | null;
      rma_returned_date?: string | null;
      replacement_sn?: string | null;
      repair_status?: RepairLifecycleStatus;
    },
    note?: string
  ) => {
    const actor = currentUserRef.current;
    const target = repairTickets.find(t => t.id === ticketId);

    // สร้างข้อความ log อธิบายสิ่งที่เปลี่ยน
    const changes: string[] = [];
    if (patch.service_type && patch.service_type !== target?.service_type) {
      changes.push(patch.service_type === 'rma_claim' ? 'เปลี่ยนเป็นส่งเคลมประกัน (RMA)' : 'เปลี่ยนเป็นซ่อมเองหน้าร้าน');
    }
    if (patch.rma_supplier !== undefined && patch.rma_supplier !== target?.rma_supplier) {
      changes.push(`Supplier: ${patch.rma_supplier || '-'}`);
    }
    if (patch.rma_tracking_no !== undefined && patch.rma_tracking_no !== target?.rma_tracking_no) {
      changes.push(`เลขใบส่งเคลม: ${patch.rma_tracking_no || '-'}`);
    }
    if (patch.rma_sent_date !== undefined && patch.rma_sent_date !== target?.rma_sent_date) {
      changes.push(`วันที่ส่งเคลม: ${patch.rma_sent_date ? new Date(patch.rma_sent_date).toLocaleDateString('th-TH') : '-'}`);
    }
    if (patch.rma_returned_date !== undefined && patch.rma_returned_date !== target?.rma_returned_date) {
      changes.push(`วันที่ได้ของคืน: ${patch.rma_returned_date ? new Date(patch.rma_returned_date).toLocaleDateString('th-TH') : '-'}`);
    }
    if (patch.replacement_sn !== undefined && patch.replacement_sn !== target?.replacement_sn) {
      changes.push(`S/N ใหม่: ${patch.replacement_sn || '-'}`);
    }
    if (patch.repair_status && patch.repair_status !== target?.repair_status) {
      changes.push(`สถานะ: ${REPAIR_LIFECYCLE_META[patch.repair_status]?.label || patch.repair_status}`);
    }

    const entry = makeLog(
      'อัปเดตข้อมูล RMA / การส่งเคลม',
      actor?.name || 'ระบบ',
      actor?.role,
      note || changes.join(' | ') || 'อัปเดตข้อมูล RMA'
    );

    if (isSupabaseLive && supabaseClient) {
      await supabaseClient.from('repair_tickets').update({
        ...patch,
        activity_logs: appendLog(target?.activity_logs, entry)
      }).eq('id', ticketId);
    } else {
      setRepairTickets(prev => prev.map(t => t.id === ticketId ? {
        ...t,
        ...patch,
        activity_logs: appendLog(t.activity_logs, entry)
      } : t));
    }
  };

  // บันทึกข้อมูลงานซ่อมทั้งหมดในครั้งเดียว (สถานะ + RMA + รายละเอียด/อะไหล่/ค่าใช้จ่าย)
  // -> append activity log เพียง 1 รายการ และ sync legacy status ให้ CompletedLogsView
  const saveRepairTicket = async (
    ticketId: string,
    patch: {
      service_type?: ServiceType;
      included_accessories?: string | null;
      rma_supplier?: string | null;
      rma_tracking_no?: string | null;
      rma_sent_date?: string | null;
      rma_returned_date?: string | null;
      replacement_sn?: string | null;
      repair_status?: RepairLifecycleStatus;
      repair_detail?: string | null;
      parts_used?: string | null;
      repair_cost?: number | null;
      repaired_by?: string | null;
    }
  ) => {
    const actor = currentUserRef.current;
    const now = new Date().toISOString();
    const target = repairTickets.find(t => t.id === ticketId);

    // กำหนดช่างผู้ซ่อม: ใช้ค่าที่ส่งมา ถ้าไม่มีให้ใช้ผู้ใช้ปัจจุบัน (ช่างที่กดบันทึก)
    const repairedByName =
      patch.repaired_by !== undefined ? patch.repaired_by : (target?.repaired_by || actor?.name || null);

    // สรุปสิ่งที่เปลี่ยนแปลงเพื่อเขียน log เดียวให้อ่านง่าย
    const changes: string[] = [];
    if (patch.repaired_by !== undefined && patch.repaired_by !== target?.repaired_by) {
      changes.push(`ช่างผู้ซ่อม: ${patch.repaired_by || '-'}`);
    }
    if (patch.repair_status && patch.repair_status !== target?.repair_status) {
      changes.push(`สถานะ: ${REPAIR_LIFECYCLE_META[patch.repair_status]?.label || patch.repair_status}`);
    }
    if (patch.service_type && patch.service_type !== target?.service_type) {
      changes.push(patch.service_type === 'rma_claim' ? 'เปลี่ยนเป็นส่งเคลมประกัน (RMA)' : 'เปลี่ยนเป็นซ่อมเองหน้าร้าน');
    }
    if (patch.rma_supplier !== undefined && patch.rma_supplier !== target?.rma_supplier) {
      changes.push(`Supplier: ${patch.rma_supplier || '-'}`);
    }
    if (patch.rma_tracking_no !== undefined && patch.rma_tracking_no !== target?.rma_tracking_no) {
      changes.push(`เลขใบส่งเคลม: ${patch.rma_tracking_no || '-'}`);
    }
    if (patch.rma_sent_date !== undefined && patch.rma_sent_date !== target?.rma_sent_date) {
      changes.push(`วันที่ส่งเคลม: ${patch.rma_sent_date ? new Date(patch.rma_sent_date).toLocaleDateString('th-TH') : '-'}`);
    }
    if (patch.rma_returned_date !== undefined && patch.rma_returned_date !== target?.rma_returned_date) {
      changes.push(`วันที่ได้ของคืน: ${patch.rma_returned_date ? new Date(patch.rma_returned_date).toLocaleDateString('th-TH') : '-'}`);
    }
    if (patch.replacement_sn !== undefined && patch.replacement_sn !== target?.replacement_sn) {
      changes.push(`S/N ใหม่: ${patch.replacement_sn || '-'}`);
    }
    if (patch.repair_detail !== undefined && patch.repair_detail !== target?.repair_detail) {
      changes.push('อัปเดตรายละเอียดการซ่อม');
    }
    if (patch.parts_used !== undefined && patch.parts_used !== target?.parts_used) {
      changes.push(`อะไหล่: ${patch.parts_used || '-'}`);
    }
    if (patch.repair_cost !== undefined && patch.repair_cost !== target?.repair_cost) {
      changes.push(`ค่าใช้จ่าย: ${patch.repair_cost ?? 0} บาท`);
    }

    // ถ้ามีการรับช่วงซ่อม (ยังไม่มีช่างผู้ซ่อมเดิม หรือเปลี่ยนช่าง) ให้ log ชัดเจนว่า "รับช่วงซ่อม"
    const isTakeover = !target?.repaired_by || (patch.repaired_by !== undefined && patch.repaired_by !== target?.repaired_by);
    // ready_pickup = จบงานฝั่งช่าง ส่งเครื่องคืนห้องหน้าร้าน -> log ข้อความ handoff ที่ชัดเจน
    const isHandoffToFrontdesk =
      patch.repair_status === 'ready_pickup' && target?.repair_status !== 'ready_pickup';
    const entry = isHandoffToFrontdesk
      ? makeLog(
        `ซ่อม/เคลมเสร็จ ส่งเครื่องคืนห้องหน้าร้าน (จบงานฝั่งช่าง) โดย ${repairedByName || actor?.name || 'ระบบ'}`,
        actor?.name || 'ระบบ',
        actor?.role,
        changes.join(' | ') || undefined
      )
      : makeLog(
        isTakeover ? `รับช่วงซ่อม / อัปเดตงานซ่อม โดย ${repairedByName || actor?.name || 'ระบบ'}` : 'บันทึกข้อมูลงานซ่อม',
        actor?.name || 'ระบบ',
        actor?.role,
        changes.join(' | ') || 'บันทึกข้อมูลงานซ่อม'
      );

    // sync legacy status ให้หน้าร้าน / Onsite / CompletedLogsView เห็นตรงกัน
    const legacyPatch: Partial<RepairTicket> = {};
    const rs = patch.repair_status;
    if (rs === 'ready_pickup') {
      legacyPatch.status = 'repaired';
      legacyPatch.finished_at = now;
    } else if (rs === 'completed') {
      legacyPatch.status = 'returned_closed';
      legacyPatch.delivered_at = now;
      legacyPatch.finished_at = target?.finished_at || now;
    } else if (rs === 'repairing' || rs === 'waiting_parts') {
      legacyPatch.status = 'in_progress';
    } else if (rs === 'pending_check') {
      legacyPatch.status = 'open';
    }

    const fullPatch = { ...patch, ...legacyPatch, repaired_by: repairedByName, updated_at: now };

    if (isSupabaseLive && supabaseClient) {
      await supabaseClient.from('repair_tickets').update({
        ...fullPatch,
        activity_logs: appendLog(target?.activity_logs, entry)
      }).eq('id', ticketId);
    } else {
      setRepairTickets(prev => prev.map(t => t.id === ticketId ? {
        ...t,
        ...fullPatch,
        activity_logs: appendLog(t.activity_logs, entry)
      } : t));
    }
  };

  // แก้ไขข้อมูลใบรับซ่อมเบื้องต้น (ลูกค้า / อุปกรณ์ / S/N / อาการเสีย / อุปกรณ์ที่ติดมา)
  const updateRepairTicket = async (
    ticketId: string,
    patch: {
      customer_name?: string;
      customer_phone?: string | null;
      device_model?: string | null;
      walkin_sn?: string;
      fault_symptom?: string;
      included_accessories?: string | null;
      accessories?: string[];
      accessories_other?: string | null;
    }
  ) => {
    const actor = currentUserRef.current;
    const now = new Date().toISOString();
    const target = repairTickets.find(t => t.id === ticketId);

    const changes: string[] = [];
    if (patch.customer_name !== undefined && patch.customer_name !== target?.customer_name) {
      changes.push(`ลูกค้า: ${patch.customer_name}`);
    }
    if (patch.customer_phone !== undefined && patch.customer_phone !== target?.customer_phone) {
      changes.push(`โทร: ${patch.customer_phone || '-'}`);
    }
    if (patch.device_model !== undefined && patch.device_model !== target?.device_model) {
      changes.push(`อุปกรณ์: ${patch.device_model || '-'}`);
    }
    if (patch.walkin_sn !== undefined && patch.walkin_sn !== target?.walkin_sn) {
      changes.push(`S/N: ${patch.walkin_sn || '-'}`);
    }
    if (patch.fault_symptom !== undefined && patch.fault_symptom !== target?.fault_symptom) {
      changes.push('อัปเดตอาการเสีย');
    }
    if (patch.included_accessories !== undefined && patch.included_accessories !== target?.included_accessories) {
      changes.push('อัปเดตอุปกรณ์ที่ติดมา');
    }

    const entry = makeLog(
      'แก้ไขข้อมูลใบรับซ่อม',
      actor?.name || 'ระบบ',
      actor?.role,
      changes.join(' | ') || `แก้ไขข้อมูลใบรับซ่อม ${target?.ticket_no || ''}`.trim()
    );

    const fullPatch = { ...patch, updated_at: now };

    if (isSupabaseLive && supabaseClient) {
      await supabaseClient.from('repair_tickets').update({
        ...fullPatch,
        activity_logs: appendLog(target?.activity_logs, entry)
      }).eq('id', ticketId);
    } else {
      setRepairTickets(prev => prev.map(t => t.id === ticketId ? {
        ...t,
        ...fullPatch,
        activity_logs: appendLog(t.activity_logs, entry)
      } : t));
    }
  };

  // ลบใบรับซ่อมออกจากระบบ (state + localStorage / Supabase)
  const deleteRepairTicket = async (ticketId: string) => {
    if (isSupabaseLive && supabaseClient) {
      await supabaseClient.from('repair_tickets').delete().eq('id', ticketId);
    }
    setRepairTickets(prev => prev.filter(t => t.id !== ticketId));
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
    setStockPOs(INITIAL_STOCK_POS);
  };

  /**
   * ล้างข้อมูล Demo เชิงธุรกรรมทั้งหมด (บิลขาย, PO, คิวงานเตรียม/Onsite, งานซ่อม, ประวัติ Log)
   * โดยคง Product Catalog (`products`) และสต๊อกคลังสินค้า (`in_stock`, `raw_stock`) ไว้
   * พร้อมปลดล็อกการจองออเดอร์/แท็กงานเดิมให้พร้อมขายทันที
   */
  const clearDemoKeepStock = () => {
    const cleanedStockItems: Item[] = items
      .filter((item) => {
        const isWarehouseStock = item.status === 'in_stock' || item.status === 'raw_stock';
        const qty = (item as Item & { qty?: number }).qty;
        const hasPositiveQty = typeof qty === 'number' ? qty > 0 : true;
        return isWarehouseStock && hasPositiveQty;
      })
      .map((item) => ({
        ...item,
        order_id: null,
        stock_po_id: null,
        assigned_prep_tech: null,
        prep_accepted_at: null,
        assigned_techs: [],
        assigned_onsite_tech: null,
        void_date: null,
        warranty_void_date: null,
        warranty_expire_date: null,
        activity_logs: []
      }));

    localStorage.setItem('boss_orders', JSON.stringify([]));
    localStorage.setItem('boss_stock_pos', JSON.stringify([]));
    localStorage.setItem('boss_repair_tickets', JSON.stringify([]));
    localStorage.setItem('boss_items', JSON.stringify(cleanedStockItems));

    setOrders([]);
    setStockPOs([]);
    setRepairTickets([]);
    setItems(cleanedStockItems);
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
      completeOnsiteJobHandoff,
      createOnsiteServiceCall,
      createRepairTicket,
      completeRepairTicket,
      closeRepairTicket,
      queueRepairTicketForDispatch,
      updateOrderDeliveryDate,
      updateRepairTicketDueDate,
      selfPickupRepairTicket,
      dispatchRepairReturnOnsite,
      completeRepairReturnOnsite,
      updateRepairLifecycle,
      updateRmaTracking,
      saveRepairTicket,
      updateRepairTicket,
      deleteRepairTicket,
      isSupabaseLive,
      isSyncing,
      supabaseUrl,
      supabaseKey,
      updateSupabaseConfig,
      disconnectSupabase,
      resetAllDemoData,
      clearDemoKeepStock,
      theme,
      toggleTheme,
      printingRepairTicket,
      triggerPrintRepairReceipt,
      closePrintRepairReceipt,
      lookupWarrantyBySerial
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
