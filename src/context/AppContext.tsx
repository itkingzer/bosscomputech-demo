import React, { createContext, useContext, useState, useEffect } from 'react';
import { UserAccount, Order, Item, RepairTicket, RepairStatus, RouteCode, JobCategory, getRouteByDistrict } from '../types';
import { INITIAL_USERS, INITIAL_ORDERS, INITIAL_ITEMS, INITIAL_REPAIR_TICKETS } from '../data/initialData';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

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

  createOrder: (order: Omit<Order, 'id' | 'created_at' | 'order_status'> & { planned_model?: string; planned_quantity?: number }) => void;
  updateOrderPOStatus: (orderId: string, status: 'waiting_po' | 'pending_purchasing' | 'po_received_in_stock') => void;
  receivePOIntoStock: (orderId: string, supplier?: string, poNo?: string) => void;
  cutStock: (
    orderId: string,
    billNo: string,
    itemsToCut: { model_name: string; quantity: number; supplier?: string; po_no?: string; prep_note?: string }[]
  ) => void;

  // Prep operations
  acceptPrepTask: (itemId: string, techName: string) => void;
  prepFinishToStock: (itemId: string, serialNumber: string, prepNote?: string) => boolean;
  applyVoidAndDispatch: (itemId: string, voidDate: string) => void;
  prepInboundStock: (modelName: string, serialNumber: string, notes?: string) => boolean;
  prepOutboundDispatch: (itemId: string, serialNumber: string, voidDate: string) => boolean;

  assignOnsite: (itemId: string, techs: string[], jobCategory?: JobCategory) => void;
  assignRepairTicketOnsite: (ticketId: string, techs: string[], jobCategory?: JobCategory) => void;
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

  // Connect Supabase if configured
  useEffect(() => {
    if (supabaseUrl && supabaseKey) {
      try {
        const client = createClient(supabaseUrl, supabaseKey);
        setSupabaseClient(client);
        setIsSupabaseLive(true);

        const loadRemote = async () => {
          const [o, i, r] = await Promise.all([
            client.from('orders').select('*').order('created_at', { ascending: false }),
            client.from('items').select('*').order('created_at', { ascending: false }),
            client.from('repair_tickets').select('*').order('created_at', { ascending: false })
          ]);
          if (o.data) setOrders(o.data);
          if (i.data) setItems(i.data);
          if (r.data) setRepairTickets(r.data);
        };
        loadRemote();

        const channel = client.channel('schema-db-changes')
          .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => loadRemote())
          .on('postgres_changes', { event: '*', schema: 'public', table: 'items' }, () => loadRemote())
          .on('postgres_changes', { event: '*', schema: 'public', table: 'repair_tickets' }, () => loadRemote())
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

  // Actions
  const createOrder = async (orderData: Omit<Order, 'id' | 'created_at' | 'order_status'> & { planned_model?: string; planned_quantity?: number }) => {
    const routeCode = orderData.district ? getRouteByDistrict(orderData.district) : ('route_5' as RouteCode);

    const newOrder: Order = {
      id: 'ord-' + Date.now(),
      sales_ref: orderData.sales_ref,
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
      bill_no: null,
      order_status: 'pending_purchasing',
      created_at: new Date().toISOString(),
      _planned_model: orderData.planned_model || (orderData.items_list && orderData.items_list[0]?.model_name),
      _planned_quantity: orderData.planned_quantity || (orderData.items_list && orderData.items_list.reduce((sum, item) => sum + (item.quantity || 1), 0)) || 1
    };

    if (isSupabaseLive && supabaseClient) {
      await supabaseClient.from('orders').insert([newOrder]);
    } else {
      setOrders(prev => [newOrder, ...prev]);
    }
  };

  const updateOrderPOStatus = async (orderId: string, status: 'waiting_po' | 'pending_purchasing' | 'po_received_in_stock') => {
    if (isSupabaseLive && supabaseClient) {
      await supabaseClient.from('orders').update({ order_status: status }).eq('id', orderId);
    } else {
      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, order_status: status } : o));
    }
  };

  const receivePOIntoStock = async (orderId: string, supplier?: string, poNo?: string) => {
    const receivedAt = new Date().toISOString();
    if (isSupabaseLive && supabaseClient) {
      await supabaseClient.from('orders').update({
        order_status: 'po_received_in_stock',
        updated_at: receivedAt
      }).eq('id', orderId);
    } else {
      setOrders(prev => prev.map(o => o.id === orderId ? {
        ...o,
        order_status: 'po_received_in_stock',
        updated_at: receivedAt,
        items_list: o.items_list?.map(it => ({
          ...it,
          supplier: supplier || it.supplier,
          po_no: poNo || it.po_no
        }))
      } : o));
    }
  };

  const cutStock = async (
    orderId: string,
    billNo: string,
    itemsToCut: { model_name: string; quantity: number; supplier?: string; po_no?: string; prep_note?: string }[]
  ) => {
    const targetOrder = orders.find(o => o.id === orderId);
    const newItems: Item[] = [];

    itemsToCut.forEach((plan, planIdx) => {
      for (let i = 0; i < plan.quantity; i++) {
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
          created_at: new Date().toISOString()
        });
      }
    });

    if (isSupabaseLive && supabaseClient) {
      await supabaseClient.from('orders').update({ bill_no: billNo, order_status: 'approved_for_prep' }).eq('id', orderId);
      await supabaseClient.from('items').insert(newItems);
    } else {
      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, bill_no: billNo, order_status: 'approved_for_prep' } : o));
      setItems(prev => [...prev, ...newItems]);
    }
  };

  // ช่างเตรียมรับงาน
  const acceptPrepTask = async (itemId: string, techName: string) => {
    const acceptedAt = new Date().toISOString();
    if (isSupabaseLive && supabaseClient) {
      await supabaseClient.from('items').update({
        assigned_prep_tech: techName,
        prep_accepted_at: acceptedAt
      }).eq('id', itemId);
    } else {
      setItems(prev => prev.map(i => i.id === itemId ? {
        ...i,
        assigned_prep_tech: techName,
        prep_accepted_at: acceptedAt
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
    if (isSupabaseLive && supabaseClient) {
      supabaseClient.from('items').update({
        serial_number: serialNumber,
        status: 'prepped_in_stock',
        prepped_at: preppedAt,
        notes: prepNote || 'ประกอบ/ลงโปรแกรม/ยิง S/N เสร็จ เก็บเข้าสต๊อกรอแปะวอยปล่อยของ'
      }).eq('id', itemId);
    } else {
      setItems(prev => prev.map(i => i.id === itemId ? {
        ...i,
        serial_number: serialNumber,
        status: 'prepped_in_stock',
        prepped_at: preppedAt,
        notes: prepNote || 'ประกอบ/ลงโปรแกรม/ยิง S/N เสร็จ เก็บเข้าสต๊อกรอแปะวอยปล่อยของ'
      } : i));
    }
    return true;
  };

  // จังหวะที่ 2: แปะวอยประกัน & ยืนยันปล่อยของออก (ready_for_dispatch)
  const applyVoidAndDispatch = async (itemId: string, voidDate: string) => {
    if (isSupabaseLive && supabaseClient) {
      await supabaseClient.from('items').update({
        status: 'ready_for_dispatch',
        void_date: voidDate
      }).eq('id', itemId);
    } else {
      setItems(prev => prev.map(i => i.id === itemId ? {
        ...i,
        status: 'ready_for_dispatch',
        void_date: voidDate
      } : i));
    }
  };

  // 1. เตรียมของเข้าสต๊อก (Inbound Stock)
  const prepInboundStock = (modelName: string, serialNumber: string, notes?: string): boolean => {
    const existing = items.find(i => i.serial_number && i.serial_number.toLowerCase() === serialNumber.toLowerCase());
    if (existing) {
      return false;
    }

    const newItem: Item = {
      id: 'itm-' + Date.now(),
      order_id: null,
      model_name: modelName,
      serial_number: serialNumber,
      status: 'in_stock',
      prep_type: 'inbound_stock',
      assigned_techs: [],
      prepped_at: new Date().toISOString(),
      void_date: null,
      notes: notes || 'ประกอบเทสผ่าน ติดโลโก้ เก็บเข้าสต๊อกพร้อมขาย',
      created_at: new Date().toISOString()
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
    if (isSupabaseLive && supabaseClient) {
      supabaseClient.from('items').update({
        serial_number: serialNumber,
        status: 'ready_for_dispatch',
        void_date: voidDate,
        prepped_at: preppedAt
      }).eq('id', itemId);
    } else {
      setItems(prev => prev.map(i => i.id === itemId ? {
        ...i,
        serial_number: serialNumber,
        status: 'ready_for_dispatch',
        void_date: voidDate,
        prepped_at: preppedAt
      } : i));
    }
    return true;
  };

  const assignOnsite = async (itemId: string, techs: string[], jobCategory?: JobCategory) => {
    const techsArr = Array.isArray(techs) ? techs : [techs];
    const primaryTech = techsArr[0] || '';
    if (isSupabaseLive && supabaseClient) {
      await supabaseClient.from('items').update({
        status: 'assigned_onsite',
        assigned_techs: techsArr,
        job_category: jobCategory || 'delivery',
        assigned_onsite_tech: primaryTech // backward compat
      }).eq('id', itemId);
    } else {
      setItems(prev => prev.map(i => i.id === itemId ? {
        ...i,
        status: 'assigned_onsite',
        assigned_techs: techsArr,
        job_category: jobCategory || 'delivery',
        assigned_onsite_tech: primaryTech
      } : i));
    }
  };

  const assignRepairTicketOnsite = async (ticketId: string, techs: string[], jobCategory?: JobCategory) => {
    const techsArr = Array.isArray(techs) ? techs : [techs];
    const primaryTech = techsArr[0] || '';
    if (isSupabaseLive && supabaseClient) {
      await supabaseClient.from('repair_tickets').update({
        assigned_techs: techsArr,
        job_category: jobCategory || 'repair_pickup',
        assigned_onsite_tech: primaryTech
      }).eq('id', ticketId);
    } else {
      setRepairTickets(prev => prev.map(t => t.id === ticketId ? {
        ...t,
        assigned_techs: techsArr,
        job_category: jobCategory || 'repair_pickup',
        assigned_onsite_tech: primaryTech
      } : t));
    }
  };

  // 3. ช่าง Onsite ส่งมอบสินค้าถึงมือลูกค้า
  const confirmOnsiteDelivery = async (itemId: string, deliveryNotes?: string) => {
    const targetItem = items.find(i => i.id === itemId);
    const orderId = targetItem?.order_id;

    const updatedItems = items.map(i => i.id === itemId ? {
      ...i,
      status: 'delivered' as const,
      notes: deliveryNotes ? `${i.notes || ''} | ${deliveryNotes}` : i.notes
    } : i);

    const relatedOrderItems = updatedItems.filter(i => i.order_id === orderId);
    const allDelivered = relatedOrderItems.length > 0 && relatedOrderItems.every(i => i.status === 'delivered');

    if (isSupabaseLive && supabaseClient) {
      await supabaseClient.from('items').update({
        status: 'delivered'
      }).eq('id', itemId);

      if (orderId && allDelivered) {
        await supabaseClient.from('orders').update({ order_status: 'fulfilled' }).eq('id', orderId);
      }
    } else {
      setItems(updatedItems);
      if (orderId && allDelivered) {
        setOrders(prev => prev.map(o => o.id === orderId ? { ...o, order_status: 'fulfilled' } : o));
      }
    }
  };

  const createRepairTicket = async (ticketData: Omit<RepairTicket, 'id' | 'ticket_no' | 'created_at' | 'received_at' | 'status'>) => {
    const routeCode = ticketData.district ? getRouteByDistrict(ticketData.district) : ('route_5' as RouteCode);
    const thaiYear = new Date().getFullYear() + 543;
    const randomNum = Math.floor(100 + Math.random() * 900);
    const generatedTicketNo = `REP-${thaiYear}-${randomNum}`;

    const newTicket: RepairTicket = {
      ...ticketData,
      id: 'rep-' + Date.now(),
      ticket_no: generatedTicketNo,
      route_code: routeCode,
      status: 'open',
      received_at: new Date().toISOString(),
      finished_at: null,
      created_at: new Date().toISOString()
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
    if (isSupabaseLive && supabaseClient) {
      await supabaseClient.from('repair_tickets').update({
        status,
        repair_outcome: outcome,
        repair_detail: detail,
        parts_used: parts,
        finished_at: finishedAt
      }).eq('id', ticketId);
    } else {
      setRepairTickets(prev => prev.map(t => t.id === ticketId ? {
        ...t,
        status,
        repair_outcome: outcome,
        repair_detail: detail,
        parts_used: parts,
        finished_at: finishedAt
      } : t));
    }
  };

  const closeRepairTicket = async (ticketId: string) => {
    if (isSupabaseLive && supabaseClient) {
      await supabaseClient.from('repair_tickets').update({ status: 'returned_closed' }).eq('id', ticketId);
    } else {
      setRepairTickets(prev => prev.map(t => t.id === ticketId ? { ...t, status: 'returned_closed' } : t));
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
    setOrders(INITIAL_ORDERS);
    setItems(INITIAL_ITEMS);
    setRepairTickets(INITIAL_REPAIR_TICKETS);
    setUsers(INITIAL_USERS);
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
      createOrder,
      updateOrderPOStatus,
      receivePOIntoStock,
      cutStock,
      acceptPrepTask,
      prepFinishToStock,
      applyVoidAndDispatch,
      prepInboundStock,
      prepOutboundDispatch,
      assignOnsite,
      assignRepairTicketOnsite,
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
