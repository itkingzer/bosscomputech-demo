import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useApp } from '../context/AppContext';
import {
  Boxes, PackagePlus, CheckCircle, Info, MapPin,
  ShoppingCart, Clock, AlertTriangle, Truck, Tag, Send, Check,
  ArrowRight, ShieldCheck, FileCheck, Layers, Lock, X, Warehouse, Zap,
  Timer, Wrench, ChevronDown, ChevronRight, ClipboardList, PackageSearch,
  Search, Filter, Trash2, ShoppingBag, Plus
} from 'lucide-react';
import { ROUTE_DEFINITIONS, Order, ProductCategory, PRODUCT_CATEGORY_LABELS, Product } from '../types';
import { ListControls, useListControls } from './ListControls';
import { ActivityTimeline, LatestUpdateBadge } from './ActivityTimeline';

const DOA_WARRANTY_DAYS = 7;

// คำนวณวันคงเหลือของประกัน DOA 7 วัน (นับจากวันที่รับของเข้าห้องสต๊อก)
const getDoaDaysLeft = (receivedAt?: string | null): number => {
  if (!receivedAt) return DOA_WARRANTY_DAYS;
  const start = new Date(receivedAt).getTime();
  const elapsedDays = Math.floor((Date.now() - start) / (1000 * 60 * 60 * 24));
  return Math.max(0, DOA_WARRANTY_DAYS - elapsedDays);
};

const SUPPLIER_PRESETS = [
  'สต๊อกร้าน (Main Store)',
  'SIS Distribution',
  'Synnex (Thailand)',
  'Abshop',
  'PKT Computer & Supply',
  'Ingram Micro',
  'Advice Wholesale'
];

export const PurchasingStockView: React.FC = () => {
  const {
    orders, items, cutStock, updateOrderPOStatus, receivePOIntoStock, updateOrderCosts,
    stockPOs, createStockPO, receiveStockPOToStorage, cancelStockPO, allocateStockToOrder,
    sendRawStockToPrep, products
  } = useApp();
  const [billInputs, setBillInputs] = useState<Record<string, string>>({});
  const [supplierInputs, setSupplierInputs] = useState<Record<string, string>>({});
  const [poInputs, setPoInputs] = useState<Record<string, string>>({});
  const [prepNoteInputs, setPrepNoteInputs] = useState<Record<string, string>>({});
  // จำนวนเครื่องที่ต้องการส่งช่างเทสต่อ batch (key = batch key) - default 1
  const [batchSendQty, setBatchSendQty] = useState<Record<string, number>>({});
  // เลือกดึงจากสต๊อกคลัง (in_stock) แทนการสร้างใหม่ - key = `${orderId}:${itemIndex}`
  const [stockPickInputs, setStockPickInputs] = useState<Record<string, string>>({});
  // ราคาทุนต่อหน่วย (INTERNAL ONLY) - key = `${orderId}:${itemIndex}`
  const [costInputs, setCostInputs] = useState<Record<string, number>>({});
  // ต้นทุนค่าแรง/ค่าดำเนินการอื่นต่อออเดอร์ (INTERNAL ONLY)
  const [extraCostInputs, setExtraCostInputs] = useState<Record<string, number>>({});
  const [activeTab, setActiveTab] = useState<'pending' | 'waiting_po' | 'po_received'>('pending');
  const [toast, setToast] = useState('');
  // แท็บหลัก 3 แท็บ: ใบสั่งขายรอจัดการ / ติดตาม PO / คลังสินค้าคงเหลือ
  const [mainTab, setMainTab] = useState<'incoming' | 'po_tracking' | 'inventory'>('incoming');
  // สถานะการกาง/พับรายละเอียดสินค้าของแต่ละออเดอร์ (key = orderId)
  const [expandedOrders, setExpandedOrders] = useState<Record<string, boolean>>({});
  // ตัวกรองหมวดหมู่ของรายการสต๊อกคงเหลือ (Inventory List)
  const [stockCategoryFilter, setStockCategoryFilter] = useState<'all' | ProductCategory>('all');

  // ---- Proactive Stock Replenishment (Stock PO) ----
  // รายการสินค้าใน Stock PO (ดึงจากแคตตาล็อกกลางที่ฝ่ายขายบันทึกไว้เท่านั้น)
  type StockPoLine = {
    product_id: string;
    product_name: string;
    category: ProductCategory;
    qty: number;
    unit_cost: number;
  };
  const [isStockPoModalOpen, setIsStockPoModalOpen] = useState(false);
  const [stockPoLines, setStockPoLines] = useState<StockPoLine[]>([]);
  const [stockPoMeta, setStockPoMeta] = useState(() => ({
    supplier: SUPPLIER_PRESETS[1],
    po_number: `SPO/${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`,
    notes: ''
  }));

  // ---- Catalog Multi-Select Modal (อ่านจาก Product Catalog กลางของฝ่ายขาย) ----
  const [isPoCatalogModalOpen, setIsPoCatalogModalOpen] = useState(false);
  const [poCatalogSearch, setPoCatalogSearch] = useState('');
  const [poCatalogCategory, setPoCatalogCategory] = useState<'all' | ProductCategory>('all');
  const [poCatalogSort, setPoCatalogSort] = useState<'name' | 'cost_desc' | 'cost_asc' | 'stock_desc'>('name');
  // mapping productId -> { qty, unit_cost }
  const [poCatalogPicks, setPoCatalogPicks] = useState<Record<string, { qty: number; unit_cost: number }>>({});

  // เลือกเครื่อง in_stock (พร้อมขาย) เพื่อตัดสต๊อกพร้อมส่ง - key = orderId -> Set ของ itemId
  const [allocateInputs, setAllocateInputs] = useState<Record<string, string[]>>({});

  const openStockPoModal = () => {
    setStockPoLines([]);
    setStockPoMeta({
      supplier: SUPPLIER_PRESETS[1],
      po_number: `SPO/${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`,
      notes: ''
    });
    setIsStockPoModalOpen(true);
  };

  // จำนวนคงเหลือในสต๊อกต่อชื่อสินค้า (normalize ชื่อ) - ใช้แสดงในตัวเลือกแคตตาล็อก
  const stockCountByName = useMemo(() => {
    const map: Record<string, number> = {};
    items.forEach(it => {
      const key = (it.model_name || '').trim().toLowerCase();
      if (!key) return;
      if (it.status === 'raw_stock' || it.status === 'in_stock') {
        map[key] = (map[key] || 0) + 1;
      }
    });
    return map;
  }, [items]);

  const openPoCatalogModal = () => {
    // prefill จากรายการที่เลือกไว้แล้วใน Stock PO
    const prefill: Record<string, { qty: number; unit_cost: number }> = {};
    stockPoLines.forEach(l => {
      prefill[l.product_id] = { qty: l.qty, unit_cost: l.unit_cost };
    });
    setPoCatalogPicks(prefill);
    setPoCatalogSearch('');
    setPoCatalogCategory('all');
    setPoCatalogSort('name');
    setIsPoCatalogModalOpen(true);
  };

  const togglePoCatalogPick = (product: Product) => {
    setPoCatalogPicks(prev => {
      const copy = { ...prev };
      if (copy[product.id]) {
        delete copy[product.id];
      } else {
        copy[product.id] = { qty: 1, unit_cost: Math.max(0, product.cost_price) };
      }
      return copy;
    });
  };

  const updatePoCatalogPick = (productId: string, patch: Partial<{ qty: number; unit_cost: number }>) => {
    setPoCatalogPicks(prev => {
      const current = prev[productId];
      if (!current) return prev;
      return {
        ...prev,
        [productId]: {
          qty: patch.qty !== undefined ? Math.max(1, patch.qty) : current.qty,
          unit_cost: patch.unit_cost !== undefined ? Math.max(0, patch.unit_cost) : current.unit_cost
        }
      };
    });
  };

  const handleConfirmPoCatalogSelection = () => {
    const pickedIds = Object.keys(poCatalogPicks);
    if (pickedIds.length === 0) {
      alert('กรุณาติ๊กเลือกสินค้าจากแคตตาล็อกอย่างน้อย 1 รายการ');
      return;
    }
    const lines: StockPoLine[] = [];
    pickedIds.forEach(id => {
      const catItem = products.find(p => p.id === id);
      if (!catItem) return;
      const pick = poCatalogPicks[id];
      lines.push({
        product_id: catItem.id,
        product_name: catItem.name,
        category: catItem.category,
        qty: Math.max(1, pick.qty),
        unit_cost: Math.max(0, pick.unit_cost)
      });
    });
    setStockPoLines(lines);
    setIsPoCatalogModalOpen(false);
  };

  const handleUpdateStockPoLine = (productId: string, patch: Partial<Pick<StockPoLine, 'qty' | 'unit_cost'>>) => {
    setStockPoLines(prev => prev.map(l => l.product_id === productId
      ? {
        ...l,
        qty: patch.qty !== undefined ? Math.max(1, patch.qty) : l.qty,
        unit_cost: patch.unit_cost !== undefined ? Math.max(0, patch.unit_cost) : l.unit_cost
      }
      : l));
  };

  const handleRemoveStockPoLine = (productId: string) => {
    setStockPoLines(prev => prev.filter(l => l.product_id !== productId));
  };

  const handleSubmitStockPo = (e: React.FormEvent) => {
    e.preventDefault();
    if (stockPoLines.length === 0) {
      alert('กรุณาเลือกสินค้าจากแคตตาล็อกเพื่อสั่งซื้อ PO อย่างน้อย 1 รายการ');
      return;
    }
    const basePoNumber = stockPoMeta.po_number.trim() || `SPO/${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`;
    // สร้าง Stock PO 1 ใบต่อ 1 รายการสินค้า (อ้างอิง product_id + ชื่อตรงกับแคตตาล็อกกลาง 100%)
    stockPoLines.forEach((line, idx) => {
      createStockPO({
        product_name: line.product_name,
        category: line.category,
        qty: Math.max(1, line.qty),
        unit_cost: Math.max(0, line.unit_cost),
        supplier: stockPoMeta.supplier,
        po_number: stockPoLines.length > 1 ? `${basePoNumber}-${idx + 1}` : basePoNumber,
        notes: stockPoMeta.notes.trim() || null
      });
    });
    const totalQty = stockPoLines.reduce((sum, l) => sum + Math.max(1, l.qty), 0);
    setIsStockPoModalOpen(false);
    setToast(`เปิด Stock PO ${stockPoLines.length} รายการ รวม ${totalQty} ชิ้น เรียบร้อย (รอของเข้า)`);
    setTimeout(() => setToast(''), 4000);
  };

  const handleReceiveStockPo = (poId: string, productName: string, qty: number) => {
    receiveStockPOToStorage(poId);
    setToast(`รับของ Stock PO "${productName}" ${qty} ชิ้น เข้าห้องสต๊อกแล้ว (raw_stock) - นับถอยหลังเทส 7 วัน DOA`);
    setTimeout(() => setToast(''), 4500);
  };

  const handleSendRawToPrep = (itemId: string, modelName: string) => {
    sendRawStockToPrep(itemId);
    setToast(`ส่ง "${modelName}" ให้ช่างเทส & ติดโลโก้ล่วงหน้าแล้ว -> เข้าคิว PrepView (pending_prep)`);
    setTimeout(() => setToast(''), 4500);
  };

  // ส่งหลายเครื่องจาก batch เดียวกันเข้าช่างเทส (สูงสุด = จำนวนใน batch)
  const handleSendBatchToPrep = (batchKey: string, modelName: string, itemIds: string[], qty: number) => {
    const toSend = itemIds.slice(0, Math.max(1, Math.min(qty, itemIds.length)));
    toSend.forEach(id => sendRawStockToPrep(id));
    setBatchSendQty(prev => ({ ...prev, [batchKey]: 1 }));
    setToast(`ส่ง "${modelName}" ${toSend.length} เครื่อง ให้ช่างเทส & ติดโลโก้ล่วงหน้าแล้ว -> เข้าคิว PrepView (pending_prep)`);
    setTimeout(() => setToast(''), 4500);
  };

  const toggleAllocatePick = (orderId: string, itemId: string) => {
    setAllocateInputs(prev => {
      const current = prev[orderId] || [];
      const next = current.includes(itemId)
        ? current.filter(id => id !== itemId)
        : [...current, itemId];
      return { ...prev, [orderId]: next };
    });
  };

  const handleAllocateStock = (orderId: string, salesRef: string | null) => {
    const picked = allocateInputs[orderId] || [];
    if (picked.length === 0) {
      alert('กรุณาเลือกเครื่อง S/N ที่จะตัดสต๊อกพร้อมส่งอย่างน้อย 1 เครื่อง');
      return;
    }
    const defaultBill = `INV-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`;
    const billNo = (billInputs[orderId] || defaultBill).trim();
    allocateStockToOrder(orderId, billNo, picked);
    setAllocateInputs(prev => ({ ...prev, [orderId]: [] }));
    setToast(`ตัดสต๊อกพร้อมส่งบิล ${billNo} สำเร็จ! ${picked.length} เครื่อง (ข้ามขั้นประกอบ -> รอแปะวอย & ปล่อยของ)`);
    setTimeout(() => setToast(''), 4500);
  };

  // ---- Smart Stock Auto-Detection ----
  // นับจำนวนเครื่องที่มีในสต๊อก (raw_stock + in_stock) ที่ชื่อรุ่นตรงกัน (normalize แล้ว)
  const getAvailableStock = (modelName: string): number => {
    const normalized = (modelName || '').trim().toLowerCase();
    if (!normalized) return 0;
    return items.filter(
      s => (s.status === 'raw_stock' || s.status === 'in_stock')
        && (s.model_name || '').trim().toLowerCase() === normalized
    ).length;
  };

  // ตรวจสอบความพร้อมของสต๊อกทั้งออเดอร์ (เฉพาะรายการอุปกรณ์ ไม่นับบริการ)
  const getOrderStockStatus = (order: Order) => {
    const equipmentItems = order.items_list && order.items_list.length > 0
      ? order.items_list.filter(it => it.item_type !== 'service')
      : [{ model_name: order._planned_model || 'BossComputech Workstation', quantity: order._planned_quantity || 1, item_type: 'hardware' as const }];

    let totalShortage = 0;
    const rows = equipmentItems.map(it => {
      const available = getAvailableStock(it.model_name);
      const ordered = it.quantity || 1;
      const shortage = Math.max(0, ordered - available);
      totalShortage += shortage;
      return { model_name: it.model_name, available, ordered, shortage, sufficient: available >= ordered };
    });

    return {
      rows,
      allSufficient: rows.length > 0 && rows.every(r => r.sufficient),
      hasShortage: totalShortage > 0,
      totalShortage
    };
  };

  const orderedStockPOs = stockPOs.filter(p => p.status === 'ordered');
  const receivedStockPOs = stockPOs.filter(p => p.status === 'received');
  const rawStockItems = items.filter(i => i.status === 'raw_stock');

  // ---- Batch Grouping: รวม raw_stock ที่เหมือนกัน (ชื่อรุ่น + PO + supplier + วันรับเข้า) ----
  const rawStockBatches = (() => {
    const map = new Map<string, {
      key: string;
      model_name: string;
      po_no: string;
      supplier: string;
      received_at: string | null;
      itemIds: string[];
      serials: string[];
    }>();

    rawStockItems.forEach(i => {
      const receivedKey = i.received_at ? new Date(i.received_at).toISOString().slice(0, 10) : '-';
      const key = [
        (i.model_name || '').trim().toLowerCase(),
        (i.po_no || '-').trim().toLowerCase(),
        (i.supplier || '-').trim().toLowerCase(),
        receivedKey
      ].join('|');
      const existing = map.get(key);
      const batch = existing || {
        key,
        model_name: i.model_name,
        po_no: i.po_no || '-',
        supplier: i.supplier || 'สต๊อกร้าน',
        received_at: i.received_at || null,
        itemIds: [],
        serials: []
      };
      batch.itemIds.push(i.id);
      if (i.serial_number) batch.serials.push(i.serial_number);
      map.set(key, batch);
    });

    return Array.from(map.values()).sort((a, b) => b.itemIds.length - a.itemIds.length);
  })();
  const pendingPrepStockCount = items.filter(i => i.status === 'pending_prep_stock' || i.status === 'pending_prep').length;
  const readyStockCount = items.filter(i => i.status === 'in_stock').length;

  // ---- Inventory List: รวมของคงเหลือ (raw_stock + in_stock) แยกตามรุ่นสินค้า ----
  // แสดงเฉพาะสินค้าที่มีของจริง (qty > 0) และเรียงจากจำนวนมาก -> น้อย
  const inventoryGroups = (() => {
    const map = new Map<string, {
      key: string;
      model_name: string;
      category: ProductCategory;
      rawCount: number;
      readyCount: number;
      serials: string[];
    }>();

    items
      .filter(i => i.status === 'raw_stock' || i.status === 'in_stock')
      .forEach(i => {
        const key = (i.model_name || '').trim().toLowerCase();
        if (!key) return;
        const existing = map.get(key);
        const group = existing || {
          key,
          model_name: i.model_name,
          category: (i.category || 'general') as ProductCategory,
          rawCount: 0,
          readyCount: 0,
          serials: []
        };
        if (i.status === 'raw_stock') group.rawCount += 1;
        else group.readyCount += 1;
        if (i.serial_number) group.serials.push(i.serial_number);
        map.set(key, group);
      });

    return Array.from(map.values())
      .map(g => ({ ...g, qty: g.rawCount + g.readyCount }))
      .filter(g => g.qty > 0)
      .sort((a, b) => b.qty - a.qty);
  })();

  const inventoryCategoryCounts = inventoryGroups.reduce<Record<string, number>>((acc, g) => {
    acc[g.category] = (acc[g.category] || 0) + 1;
    return acc;
  }, {});

  const filteredInventoryGroups = stockCategoryFilter === 'all'
    ? inventoryGroups
    : inventoryGroups.filter(g => g.category === stockCategoryFilter);

  const inventoryCategoryOptions: { value: 'all' | ProductCategory; label: string }[] = [
    { value: 'all', label: 'ทั้งหมด' },
    { value: 'pc_notebook', label: 'PC / Notebook' },
    { value: 'printer', label: 'Printer' },
    { value: 'cctv_network', label: 'CCTV / Network' },
    { value: 'general', label: 'อะไหล่ / อุปกรณ์เสริม' }
  ];

  const getItemCost = (orderId: string, idx: number, fallback?: number) => {
    const key = `${orderId}:${idx}`;
    return costInputs[key] !== undefined ? costInputs[key] : (fallback || 0);
  };

  const getExtraCost = (orderId: string, fallback?: number) => {
    return extraCostInputs[orderId] !== undefined ? extraCostInputs[orderId] : (fallback || 0);
  };

  // บันทึกราคาทุนของออเดอร์นี้ (internal only)
  const handleSaveCosts = (orderId: string, salesRef: string | null) => {
    const order = orders.find(o => o.id === orderId);
    if (!order) return;
    const itemCosts: Record<number, number> = {};
    (order.items_list || []).forEach((it, idx) => {
      itemCosts[idx] = getItemCost(orderId, idx, it.unit_cost);
    });
    updateOrderCosts(orderId, getExtraCost(orderId, order.extra_cost), itemCosts);
    setToast(`บันทึกราคาทุน (ภายใน) ของออเดอร์ ${salesRef || orderId} เรียบร้อยแล้ว`);
    setTimeout(() => setToast(''), 3500);
  };

  // 3 distinct subsets of orders
  const newOrders = orders.filter(o => o.order_status === 'pending_purchasing');
  const waitingPoOrders = orders.filter(o => o.order_status === 'waiting_po');
  const poReceivedOrders = orders.filter(o => o.order_status === 'po_received_in_stock');

  // Step 1: สั่งซื้อของเข้า (รอ PO)
  const handleOrderPO = (orderId: string, salesRef: string | null) => {
    const supplier = supplierInputs[orderId] || 'SIS Distribution';
    const poNo = poInputs[orderId] || `PKT/${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`;

    updateOrderPOStatus(orderId, 'waiting_po');
    setToast(`สั่งซื้อ PO เรียบร้อย! ออเดอร์ ${salesRef || orderId} -> รอของเข้าจาก Supplier (waiting_po)`);
    setTimeout(() => setToast(''), 3500);
  };

  // Step 2: รับของ PO เข้าสต๊อกร้าน
  const handleReceivePO = (orderId: string, salesRef: string | null) => {
    const supplier = supplierInputs[orderId];
    const poNo = poInputs[orderId];
    receivePOIntoStock(orderId, supplier, poNo);
    setToast(`รับของ PO เข้าสต๊อกร้านเรียบร้อย! ออเดอร์ ${salesRef || orderId} พร้อมส่งต่อให้ช่างเตรียม`);
    setTimeout(() => setToast(''), 3500);
  };

  // Step 3: ปล่อยของ / ตัดสต๊อกให้ช่างเตรียมสินค้า
  const handleCutStockAndSendPrep = (orderId: string) => {
    const order = orders.find(o => o.id === orderId);
    if (!order) return;

    const defaultBill = `INV-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`;
    const billNo = (billInputs[orderId] || defaultBill).trim();
    const supplier = supplierInputs[orderId] || 'สต๊อกร้าน (Main Store)';
    const poNo = poInputs[orderId] || `PO-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`;
    const prepNote = prepNoteInputs[orderId] || '';

    // Convert items_list or fallback to planned model
    const itemsToCut = order.items_list && order.items_list.length > 0
      ? order.items_list.map((it, idx) => ({
        model_name: it.model_name,
        quantity: it.quantity,
        supplier: supplier,
        po_no: poNo,
        prep_note: prepNote,
        unit_cost: getItemCost(orderId, idx, it.unit_cost),
        stockItemId: stockPickInputs[`${orderId}:${idx}`] || undefined
      }))
      : [{
        model_name: order._planned_model || 'BossComputech Core-i7 Workstation Pro',
        quantity: order._planned_quantity || 1,
        supplier: supplier,
        po_no: poNo,
        prep_note: prepNote,
        unit_cost: getItemCost(orderId, 0, undefined),
        stockItemId: stockPickInputs[`${orderId}:0`] || undefined
      }];

    cutStock(orderId, billNo, itemsToCut);

    const totalQty = itemsToCut.reduce((sum, item) => sum + item.quantity, 0);
    const fromStockCount = itemsToCut.filter(p => p.stockItemId).length;
    setToast(
      fromStockCount > 0
        ? `ตัดสต๊อกบิล ${billNo} สำเร็จ! ดึงจากคลัง ${fromStockCount} รายการ + ปล่อยคิว ${totalQty} ชิ้นเข้าโต๊ะช่างเตรียมสินค้าแล้ว`
        : `ตัดสต๊อกบิล ${billNo} สำเร็จ! ปล่อยคิว ${totalQty} ชิ้นเข้าโต๊ะช่างเตรียมสินค้าแล้ว`
    );
    setTimeout(() => setToast(''), 4000);
  };

  const currentTabOrders = activeTab === 'pending'
    ? newOrders
    : activeTab === 'waiting_po'
      ? waitingPoOrders
      : poReceivedOrders;

  // ---- List Controls (sort + page size + pagination) ----
  const inventoryList = useListControls(filteredInventoryGroups, {
    getValue: (g) => g.qty,
    initialSort: 'high'
  });

  const poTrackingList = useListControls(waitingPoOrders, {
    getDate: (o) => o.updated_at || o.created_at,
    initialSort: 'newest'
  });

  const incomingList = useListControls(currentTabOrders, {
    getDate: (o) => o.created_at,
    initialSort: 'newest'
  });

  const toggleOrderExpanded = (orderId: string) => {
    setExpandedOrders(prev => ({ ...prev, [orderId]: !prev[orderId] }));
  };

  const mainTabs: { key: 'incoming' | 'po_tracking' | 'inventory'; label: string; sub: string; count: number; icon: React.ElementType; accent: string }[] = [
    {
      key: 'incoming',
      label: 'ใบสั่งขายรอจัดการ',
      sub: 'Incoming Orders',
      count: newOrders.length + waitingPoOrders.length + poReceivedOrders.length,
      icon: ClipboardList,
      accent: 'blue'
    },
    {
      key: 'po_tracking',
      label: 'ติดตามใบสั่งซื้อ PO',
      sub: 'PO Tracking',
      count: waitingPoOrders.length + rawStockBatches.length + orderedStockPOs.length,
      icon: Truck,
      accent: 'purple'
    },
    {
      key: 'inventory',
      label: 'คลังสินค้าคงเหลือ',
      sub: 'Inventory',
      count: inventoryGroups.length,
      icon: Warehouse,
      accent: 'emerald'
    }
  ];

  // ---- Catalog list for PO multi-select modal (search + category + sort) ----
  const poCatalogFiltered = useMemo(() => {
    const q = poCatalogSearch.trim().toLowerCase();
    const list = products.filter(p => {
      const matchesSearch = !q || p.name.toLowerCase().includes(q);
      const matchesCategory = poCatalogCategory === 'all' || p.category === poCatalogCategory;
      return matchesSearch && matchesCategory;
    });
    const stockOf = (name: string) => stockCountByName[(name || '').trim().toLowerCase()] || 0;
    switch (poCatalogSort) {
      case 'cost_desc':
        return [...list].sort((a, b) => b.cost_price - a.cost_price);
      case 'cost_asc':
        return [...list].sort((a, b) => a.cost_price - b.cost_price);
      case 'stock_desc':
        return [...list].sort((a, b) => stockOf(b.name) - stockOf(a.name));
      default:
        return [...list].sort((a, b) => a.name.localeCompare(b.name, 'th'));
    }
  }, [products, poCatalogSearch, poCatalogCategory, poCatalogSort, stockCountByName]);

  const poCatalogSelectedCount = Object.keys(poCatalogPicks).length;

  const accentClasses: Record<string, { active: string; badge: string; icon: string }> = {
    blue: {
      active: 'bg-blue-500/20 border-blue-500/50 text-white shadow-lg',
      badge: 'bg-blue-500 text-black',
      icon: 'bg-blue-500/20 text-blue-400 border-blue-500/30'
    },
    purple: {
      active: 'bg-purple-500/20 border-purple-500/50 text-white shadow-lg',
      badge: 'bg-purple-500 text-white',
      icon: 'bg-purple-500/20 text-purple-400 border-purple-500/30'
    },
    emerald: {
      active: 'bg-emerald-500/20 border-emerald-500/50 text-white shadow-lg',
      badge: 'bg-emerald-500 text-black',
      icon: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
    }
  };

  return (
    <div className="space-y-6">
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 p-4 rounded-2xl liquid-glass border border-[#FF6B00] text-white text-xs flex items-center gap-2 shadow-2xl">
          <CheckCircle className="w-4 h-4 text-[#FF6B00]" />
          <span>{toast}</span>
        </div>
      )}

      {/* Main Container */}
      <div className="liquid-glass rounded-3xl p-5 sm:p-7 shadow-2xl border border-white/[0.08]">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-5">
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <div className="p-2 rounded-xl bg-amber-500/15 text-amber-400 border border-amber-500/30">
                <Boxes className="w-5 h-5" />
              </div>
              <span>จัดซื้อ & ควบคุมสต๊อก</span>
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              วงจรสั่งซื้อ (PO) ตั้งแต่เปิดสั่งของ รับเข้าสต๊อก จนถึงตัดสต๊อกส่งช่างเตรียมสินค้า
            </p>
          </div>
          <button
            type="button"
            onClick={openStockPoModal}
            className="w-full md:w-auto px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 text-black font-extrabold text-xs transition cursor-pointer flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/25 border border-white/20 active:scale-95"
          >
            <PackagePlus className="w-4 h-4" />
            <span>สร้างใบสั่งซื้อเข้าสต๊อก (Stock PO)</span>
          </button>
        </div>

        {/* Compact KPI Summary Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-5">
          <div className="px-3 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-between gap-2">
            <span className="text-[10px] text-slate-400 leading-tight">พร้อมขาย<br />(in_stock)</span>
            <span className="text-base font-extrabold font-mono text-emerald-400">{readyStockCount}</span>
          </div>
          <div className="px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/25 flex items-center justify-between gap-2">
            <span className="text-[10px] text-slate-400 leading-tight">ในห้องสต๊อก<br />(raw_stock)</span>
            <span className="text-base font-extrabold font-mono text-amber-400">{rawStockItems.length}</span>
          </div>
          <div className="px-3 py-2 rounded-xl bg-purple-500/10 border border-purple-500/25 flex items-center justify-between gap-2">
            <span className="text-[10px] text-slate-400 leading-tight">Stock PO<br />รอของเข้า</span>
            <span className="text-base font-extrabold font-mono text-purple-400">{orderedStockPOs.length}</span>
          </div>
          <div className="px-3 py-2 rounded-xl bg-teal-500/10 border border-teal-500/25 flex items-center justify-between gap-2">
            <span className="text-[10px] text-slate-400 leading-tight">รอช่างเทส<br />(Prep)</span>
            <span className="text-base font-extrabold font-mono text-teal-400">{pendingPrepStockCount}</span>
          </div>
        </div>

        {/* Main 3-Tab Navigation */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-5">
          {mainTabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = mainTab === tab.key;
            const accent = accentClasses[tab.accent];
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setMainTab(tab.key)}
                className={`p-3 rounded-2xl text-left transition-all border flex items-center gap-2.5 cursor-pointer ${isActive
                  ? accent.active
                  : 'bg-white/[0.02] border-white/[0.06] text-slate-400 hover:text-white hover:bg-white/[0.05]'
                  }`}
              >
                <div className={`p-2 rounded-xl border flex-shrink-0 ${isActive ? accent.icon : 'bg-white/[0.04] text-slate-400 border-white/[0.08]'}`}>
                  <Icon className="w-4 h-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-bold truncate">{tab.label}</div>
                  <div className="text-[10px] text-slate-400 truncate">{tab.sub}</div>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold flex-shrink-0 ${isActive ? accent.badge : 'bg-white/10 text-slate-400'
                  }`}>
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>

        {/* ================= TAB 1: INCOMING ORDERS ================= */}
        {mainTab === 'incoming' && (
          <div className="space-y-4">
            {/* Sub-tabs: 3 PO stages */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <button
                onClick={() => setActiveTab('pending')}
                className={`p-2.5 rounded-xl text-left transition-all duration-150 active:scale-[0.97] border flex items-center justify-between cursor-pointer ${activeTab === 'pending'
                  ? 'bg-blue-500/20 border-blue-500/50 text-white'
                  : 'bg-white/[0.02] border-white/[0.06] text-slate-400 hover:text-white hover:bg-white/[0.05]'
                  }`}
              >
                <div className="flex items-center gap-1.5 text-[11px] font-bold">
                  <span className="w-4 h-4 rounded-full bg-blue-500/30 text-blue-400 flex items-center justify-center text-[9px] font-mono">1</span>
                  <span>รายการใหม่จากเซล</span>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${newOrders.length > 0 ? 'bg-blue-500 text-black' : 'bg-white/10 text-slate-400'}`}>
                  {newOrders.length}
                </span>
              </button>
              <button
                onClick={() => setActiveTab('waiting_po')}
                className={`p-2.5 rounded-xl text-left transition-all duration-150 active:scale-[0.97] border flex items-center justify-between cursor-pointer ${activeTab === 'waiting_po'
                  ? 'bg-purple-500/20 border-purple-500/50 text-white'
                  : 'bg-white/[0.02] border-white/[0.06] text-slate-400 hover:text-white hover:bg-white/[0.05]'
                  }`}
              >
                <div className="flex items-center gap-1.5 text-[11px] font-bold">
                  <span className="w-4 h-4 rounded-full bg-purple-500/30 text-purple-400 flex items-center justify-center text-[9px] font-mono">2</span>
                  <span>รอของเข้า (PO)</span>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${waitingPoOrders.length > 0 ? 'bg-purple-500 text-white' : 'bg-white/10 text-slate-400'}`}>
                  {waitingPoOrders.length}
                </span>
              </button>
              <button
                onClick={() => setActiveTab('po_received')}
                className={`p-2.5 rounded-xl text-left transition-all duration-150 active:scale-[0.97] border flex items-center justify-between cursor-pointer ${activeTab === 'po_received'
                  ? 'bg-teal-500/20 border-teal-500/50 text-white'
                  : 'bg-white/[0.02] border-white/[0.06] text-slate-400 hover:text-white hover:bg-white/[0.05]'
                  }`}
              >
                <div className="flex items-center gap-1.5 text-[11px] font-bold">
                  <span className="w-4 h-4 rounded-full bg-teal-500/30 text-teal-400 flex items-center justify-center text-[9px] font-mono">3</span>
                  <span>ของเข้าสต๊อกแล้ว</span>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${poReceivedOrders.length > 0 ? 'bg-teal-500 text-black' : 'bg-white/10 text-slate-400'}`}>
                  {poReceivedOrders.length}
                </span>
              </button>
            </div>

            {currentTabOrders.length > 0 && (
              <ListControls
                from={incomingList.from}
                to={incomingList.to}
                total={incomingList.total}
                page={incomingList.page}
                totalPages={incomingList.totalPages}
                pageSize={incomingList.pageSize}
                sort={incomingList.sort}
                onSortChange={incomingList.setSort}
                onPageSizeChange={incomingList.setPageSize}
                onPageChange={incomingList.setPage}
                unit="ออเดอร์"
              />
            )}

            {currentTabOrders.length === 0 ? (
              <div className="text-center py-12 text-slate-500 border border-dashed border-white/[0.1] rounded-2xl">
                <CheckCircle className="w-10 h-10 mx-auto mb-2 text-emerald-400 opacity-60" />
                <p className="text-sm font-medium text-slate-200">
                  {activeTab === 'pending' && 'ไม่มีออเดอร์ใหม่ค้างเช็กสต๊อก'}
                  {activeTab === 'waiting_po' && 'ไม่มีรายการที่รอของเข้าจาก Supplier'}
                  {activeTab === 'po_received' && 'ไม่มีรายการของเข้าสต๊อกที่ค้างส่งต่อให้ช่างเตรียม'}
                </p>
                <p className="text-xs text-slate-500 mt-0.5">ทุกขั้นตอนได้รับการดำเนินการเรียบร้อย</p>
              </div>
            ) : (
              <div className="space-y-4">
                {incomingList.pageItems.map((order) => {
                  const rMeta = order.route_code ? ROUTE_DEFINITIONS[order.route_code] : null;
                  const isExpanded = !!expandedOrders[order.id];
                  const itemCount = (order.items_list && order.items_list.length > 0)
                    ? order.items_list.reduce((sum, it) => sum + (it.quantity || 1), 0)
                    : (order._planned_quantity || 1);
                  const suggestedBillNo = billInputs[order.id] !== undefined
                    ? billInputs[order.id]
                    : `INV-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`;
                  const selectedSupplier = supplierInputs[order.id] || order.items_list?.[0]?.supplier || 'สต๊อกร้าน (Main Store)';
                  const suggestedPo = poInputs[order.id] || order.items_list?.[0]?.po_no || `PKT/${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`;

                  return (
                    <div
                      key={order.id}
                      className="p-5 sm:p-6 rounded-2xl liquid-glass-card space-y-4 border border-white/[0.08]"
                    >
                      {/* Order Header */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-white/[0.06]">
                        <div className="flex items-center gap-2.5 flex-wrap">
                          <span className="px-2.5 py-1 rounded-xl text-sm bg-[#FF6B00] text-black font-extrabold font-mono shadow-md shadow-[#FF6B00]/25 data-key">
                            {order.sales_ref || 'SO'}
                          </span>
                          <h4 className="text-base font-bold text-white">{order.customer_name}</h4>
                          {order.customer_phone && (
                            <span className="text-xs text-slate-400 font-mono data-meta">({order.customer_phone})</span>
                          )}
                          {rMeta && (
                            <span className={`px-2 py-0.5 rounded-lg text-[10px] font-bold border ${rMeta.badgeBg} ${rMeta.badgeBorder} ${rMeta.badgeText}`}>
                              {rMeta.shortName} • {order.district || '-'}
                            </span>
                          )}
                          {order.delivery_mode === 'project' && (
                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-gradient-to-r from-purple-500/25 to-orange-500/25 text-purple-300 border border-purple-500/40 shadow-sm animate-pulse">
                              ⚡ งานโครงการ (Project)
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-2 flex-wrap">
                          {order.salesperson && (
                            <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                              <Tag className="w-3.5 h-3.5 text-emerald-400" />
                              <span>เซลล์ผู้ขาย: {order.salesperson}</span>
                            </span>
                          )}
                          {order.order_status === 'waiting_po' && (
                            <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-purple-500/15 text-purple-400 border border-purple-500/30 flex items-center gap-1">
                              <Clock className="w-3.5 h-3.5 text-purple-400" />
                              <span>รอของเข้าจาก Supplier (waiting_po)</span>
                            </span>
                          )}
                          {order.order_status === 'po_received_in_stock' && (
                            <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-teal-500/15 text-teal-400 border border-teal-500/30 flex items-center gap-1">
                              <CheckCircle className="w-3.5 h-3.5 text-teal-400" />
                              <span>ของเข้าสต๊อกร้านแล้ว - รอปล่อยให้ช่างเตรียม</span>
                            </span>
                          )}
                          {order.order_status === 'pending_purchasing' && (
                            <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-blue-500/15 text-blue-400 border border-blue-500/30">
                              รอจัดซื้อ/เช็กสต๊อก (ใบขาวใหม่)
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Order Context Details */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs text-slate-300">
                        <div>
                          <span className="text-slate-400">จุดส่งของ: </span>
                          <span className="font-medium text-white">{order.delivery_location}</span>
                        </div>
                        <div>
                          <span className="text-slate-400">วันที่ส่งมอบ: </span>
                          <span className="font-mono text-amber-300 font-semibold">
                            {order.delivery_date ? new Date(order.delivery_date).toLocaleDateString('th-TH') : '-'}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-400">การส่งมอบ: </span>
                          <span className="font-semibold text-emerald-400">
                            {order.delivery_mode === 'install' && 'ส่งพร้อมติดตั้ง'}
                            {order.delivery_mode === 'drop_off' && 'ส่งไม่ต้องติดตั้ง'}
                            {order.delivery_mode === 'customer_pickup' && 'ลูกค้ารับเองหน้าร้าน'}
                            {order.delivery_mode === 'project' && 'งานโครงการ / รับเหมาติดตั้ง'}
                            {!order.delivery_mode && 'ส่งพร้อมติดตั้ง'}
                          </span>
                        </div>
                        {order.site_notes && (
                          <div className="sm:col-span-3 p-2 rounded-xl bg-white/[0.02] border border-white/[0.05] text-[11px]">
                            <span className="text-slate-400">หมายเหตุหน้างานจากเซล: </span>
                            <span className="text-amber-200">{order.site_notes}</span>
                          </div>
                        )}
                      </div>

                      {/* Items in this Order (collapsible) */}
                      <div className="rounded-2xl bg-white/[0.02] border border-white/[0.06] text-xs overflow-hidden">
                        <button
                          type="button"
                          onClick={() => toggleOrderExpanded(order.id)}
                          aria-expanded={isExpanded}
                          className="w-full p-3.5 flex items-center justify-between gap-2 cursor-pointer hover:bg-white/[0.03] transition text-left"
                        >
                          <span className="flex items-center gap-2 text-slate-300 font-medium">
                            {isExpanded ? <ChevronDown className="w-4 h-4 text-[#FF6B00]" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
                            <span>รายการสินค้า & บริการในบิล</span>
                            <span className="px-2 py-0.5 rounded-full bg-[#FF6B00]/15 text-[#FF6B00] font-mono font-bold text-[10px]">
                              {itemCount} ชิ้น
                            </span>
                          </span>
                          <span className="text-[10px] text-slate-500">{isExpanded ? 'ซ่อนรายละเอียด' : 'ดูรายละเอียด'}</span>
                        </button>
                        {isExpanded && (
                          <div className="px-3.5 pb-3.5 space-y-1.5 border-t border-white/[0.05] pt-2.5">
                            {order.items_list && order.items_list.length > 0 ? (
                              order.items_list.map((it, idx) => {
                                // หาเครื่อง in_stock ในคลังที่รุ่นตรงกัน (พร้อมขาย)
                                const matchingStock = items.filter(
                                  s => s.status === 'in_stock' && s.model_name === it.model_name
                                );
                                const pickedStockId = stockPickInputs[`${order.id}:${idx}`] || '';
                                const canPickStock = it.item_type !== 'service' && matchingStock.length > 0;
                                // Smart Stock Auto-Detection: เทียบของในสต๊อก (raw_stock + in_stock) กับจำนวนที่สั่ง
                                const availableStock = getAvailableStock(it.model_name);
                                const orderedQty = it.quantity || 1;
                                const shortage = Math.max(0, orderedQty - availableStock);
                                const isSufficient = availableStock >= orderedQty;

                                return (
                                  <div key={idx} className="py-1 border-b border-white/[0.03] last:border-0 space-y-1.5">
                                    <div className="flex justify-between items-center">
                                      <div className="flex items-center gap-2">
                                        {it.item_type === 'service' ? (
                                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30">
                                            บริการ
                                          </span>
                                        ) : (
                                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30">
                                            อุปกรณ์
                                          </span>
                                        )}
                                        <span className="text-white font-bold text-base">{it.model_name}</span>
                                      </div>
                                      <span className="px-2.5 py-0.5 rounded-md bg-[#FF6B00]/15 text-[#FF6B00] font-mono font-extrabold text-sm data-key">
                                        x{it.quantity} {it.item_type === 'service' ? 'รายการ' : 'เครื่อง'}
                                      </span>
                                    </div>

                                    {/* Smart Stock Auto-Detection Badge */}
                                    {it.item_type !== 'service' && (
                                      <div className="pl-1">
                                        {isSufficient ? (
                                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                                            ✅ มีของในสต๊อกเดิม (พร้อมตัด {availableStock} ชิ้น)
                                          </span>
                                        ) : (
                                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${availableStock === 0
                                            ? 'bg-rose-500/15 text-rose-300 border-rose-500/30'
                                            : 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                                            }`}>
                                            ⚠️ ของไม่พอในสต๊อก (ขาดอีก {shortage} ชิ้น)
                                          </span>
                                        )}
                                      </div>
                                    )}

                                    {/* ตัวเลือกดึงจากสต๊อกคลัง (in_stock) ถ้ามีของรุ่นตรงกัน */}
                                    {canPickStock && (
                                      <div className="flex items-center gap-2 pl-1">
                                        <span className="text-[10px] text-emerald-300 whitespace-nowrap flex items-center gap-1">
                                          <Boxes className="w-3 h-3" />
                                          มีในคลัง {matchingStock.length} เครื่อง:
                                        </span>
                                        <select
                                          value={pickedStockId}
                                          onChange={(e) => setStockPickInputs({ ...stockPickInputs, [`${order.id}:${idx}`]: e.target.value })}
                                          className="flex-1 liquid-glass-input rounded-lg px-2 py-1 text-[11px] text-emerald-200 font-mono focus:outline-none"
                                        >
                                          <option value="" className="bg-[#12141A]">— สั่งใหม่ / ไม่ดึงจากคลัง —</option>
                                          {matchingStock.map((s) => (
                                            <option key={s.id} value={s.id} className="bg-[#12141A]">
                                              {s.serial_number || '(ไม่มี S/N)'} • {s.notes || 'พร้อมขาย'}
                                            </option>
                                          ))}
                                        </select>
                                      </div>
                                    )}
                                  </div>
                                );
                              })
                            ) : (
                              (() => {
                                const plannedModel = order._planned_model || 'BossComputech Workstation';
                                const matchingStock = items.filter(
                                  s => s.status === 'in_stock' && s.model_name === plannedModel
                                );
                                const pickedStockId = stockPickInputs[`${order.id}:0`] || '';
                                const availableStock = getAvailableStock(plannedModel);
                                const orderedQty = order._planned_quantity || 1;
                                const shortage = Math.max(0, orderedQty - availableStock);
                                const isSufficient = availableStock >= orderedQty;
                                return (
                                  <div className="space-y-1.5">
                                    <div className="flex justify-between items-center">
                                      <span className="text-white font-semibold">• {plannedModel}</span>
                                      <span className="px-2.5 py-0.5 rounded-md bg-[#FF6B00]/15 text-[#FF6B00] font-mono font-bold text-xs">
                                        x{order._planned_quantity || 1} เครื่อง
                                      </span>
                                    </div>
                                    {/* Smart Stock Auto-Detection Badge */}
                                    <div className="pl-1">
                                      {isSufficient ? (
                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                                          ✅ มีของในสต๊อกเดิม (พร้อมตัด {availableStock} ชิ้น)
                                        </span>
                                      ) : (
                                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${availableStock === 0
                                          ? 'bg-rose-500/15 text-rose-300 border-rose-500/30'
                                          : 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                                          }`}>
                                          ⚠️ ของไม่พอในสต๊อก (ขาดอีก {shortage} ชิ้น)
                                        </span>
                                      )}
                                    </div>
                                    {matchingStock.length > 0 && (
                                      <div className="flex items-center gap-2 pl-1">
                                        <span className="text-[10px] text-emerald-300 whitespace-nowrap flex items-center gap-1">
                                          <Boxes className="w-3 h-3" />
                                          มีในคลัง {matchingStock.length} เครื่อง:
                                        </span>
                                        <select
                                          value={pickedStockId}
                                          onChange={(e) => setStockPickInputs({ ...stockPickInputs, [`${order.id}:0`]: e.target.value })}
                                          className="flex-1 liquid-glass-input rounded-lg px-2 py-1 text-[11px] text-emerald-200 font-mono focus:outline-none"
                                        >
                                          <option value="" className="bg-[#12141A]">— สั่งใหม่ / ไม่ดึงจากคลัง —</option>
                                          {matchingStock.map((s) => (
                                            <option key={s.id} value={s.id} className="bg-[#12141A]">
                                              {s.serial_number || '(ไม่มี S/N)'} • {s.notes || 'พร้อมขาย'}
                                            </option>
                                          ))}
                                        </select>
                                      </div>
                                    )}
                                  </div>
                                );
                              })()
                            )}
                          </div>
                        )}
                      </div>

                      {/* Cost Price (INTERNAL ONLY) - ราคาทุนต่อหน่วย + ต้นทุนค่าแรง/ค่าดำเนินการอื่น */}
                      <div className="p-4 rounded-2xl bg-rose-500/[0.04] border border-rose-500/20 space-y-3 text-xs">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11px] font-bold text-rose-300 flex items-center gap-1.5">
                            <Lock className="w-3.5 h-3.5" />
                            <span>ราคาทุน & ต้นทุน (ภายในเท่านั้น - ไม่แสดงในเอกสารลูกค้า)</span>
                          </span>
                          <button
                            type="button"
                            onClick={() => handleSaveCosts(order.id, order.sales_ref)}
                            className="px-3 py-1.5 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 border border-rose-500/30 text-[11px] font-semibold transition cursor-pointer flex items-center justify-center gap-1"
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>บันทึกราคาทุน</span>
                          </button>
                        </div>

                        <div className="space-y-2">
                          {(order.items_list && order.items_list.length > 0
                            ? order.items_list
                            : [{ model_name: order._planned_model || 'BossComputech Workstation', quantity: order._planned_quantity || 1 }]
                          ).map((it, idx) => (
                            <div key={idx} className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2 items-center">
                              <div className="text-[11px] text-slate-300 truncate">
                                <span className="text-slate-500 font-mono mr-1">{idx + 1}.</span>
                                {it.model_name} <span className="text-slate-500">(x{it.quantity})</span>
                                {it.unit_cost !== undefined && it.unit_cost > 0 && (
                                  <span className="ml-1.5 text-[10px] text-amber-300/80">
                                    • เซลล์ประเมิน ฿{it.unit_cost.toLocaleString('th-TH')}/หน่วย
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-1.5">
                                <label className="text-[10px] text-slate-400 whitespace-nowrap">ราคาทุนจริง/หน่วย</label>
                                <input
                                  type="number"
                                  min={0}
                                  placeholder="0"
                                  value={getItemCost(order.id, idx, it.unit_cost) || ''}
                                  onChange={(e) => setCostInputs({ ...costInputs, [`${order.id}:${idx}`]: parseFloat(e.target.value) || 0 })}
                                  className="w-28 liquid-glass-input rounded-lg px-2 py-1 text-xs text-rose-300 font-mono font-bold focus:outline-none"
                                />
                              </div>
                            </div>
                          ))}
                        </div>

                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2 border-t border-rose-500/15">
                          <label className="text-[11px] text-slate-300 flex items-center gap-1.5">
                            <span>ต้นทุนค่าแรง/ค่าดำเนินการอื่น (Extra Job Cost)</span>
                          </label>
                          <input
                            type="number"
                            min={0}
                            placeholder="0"
                            value={getExtraCost(order.id, order.extra_cost) || ''}
                            onChange={(e) => setExtraCostInputs({ ...extraCostInputs, [order.id]: parseFloat(e.target.value) || 0 })}
                            className="w-full sm:w-40 liquid-glass-input rounded-lg px-2 py-1 text-xs text-rose-300 font-mono font-bold focus:outline-none"
                          />
                        </div>
                      </div>

                      {/* Fast-Track Allocation from Ready Stock (in_stock) */}
                      {(() => {
                        const orderModelNames = new Set(
                          (order.items_list && order.items_list.length > 0
                            ? order.items_list.filter(it => it.item_type !== 'service').map(it => it.model_name)
                            : [order._planned_model || 'BossComputech Workstation'])
                        );
                        const readyUnits = items.filter(
                          s => (s.status === 'in_stock' || s.status === 'raw_stock') && orderModelNames.has(s.model_name)
                        );
                        if (readyUnits.length === 0) return null;
                        const picked = allocateInputs[order.id] || [];
                        return (
                          <div className="p-4 rounded-2xl bg-emerald-500/[0.05] border border-emerald-500/25 space-y-2.5 text-xs">
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                              <span className="text-[11px] font-bold text-emerald-300 flex items-center gap-1.5">
                                <Zap className="w-3.5 h-3.5" />
                                <span>จัดสรรสต๊อกให้ออเดอร์ - มีเครื่องในคลัง {readyUnits.length} เครื่อง</span>
                              </span>
                              <button
                                type="button"
                                onClick={() => handleAllocateStock(order.id, order.sales_ref)}
                                disabled={picked.length === 0}
                                className={`px-3 py-1.5 rounded-xl text-[11px] font-extrabold transition flex items-center gap-1 ${picked.length > 0
                                  ? 'bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 text-black cursor-pointer active:scale-95'
                                  : 'bg-white/10 text-slate-500 cursor-not-allowed'
                                  }`}
                              >
                                <Zap className="w-3.5 h-3.5" />
                                <span>จัดสรรสต๊อกให้ออเดอร์ (Allocate) {picked.length > 0 ? `(${picked.length})` : ''}</span>
                              </button>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                              {readyUnits.map((s) => {
                                const isPicked = picked.includes(s.id);
                                return (
                                  <button
                                    key={s.id}
                                    type="button"
                                    onClick={() => toggleAllocatePick(order.id, s.id)}
                                    className={`text-left px-2.5 py-1.5 rounded-lg border transition cursor-pointer flex items-center justify-between gap-2 ${isPicked
                                      ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-200'
                                      : 'bg-white/[0.02] border-white/[0.08] text-slate-300 hover:bg-white/[0.05]'
                                      }`}
                                  >
                                    <span className="font-mono text-[11px] font-bold truncate">
                                      {s.serial_number || (s.status === 'raw_stock' ? 'ยังไม่เตรียม' : '(ไม่มี S/N)')}
                                    </span>
                                    <span className="text-[10px] text-slate-400 truncate">
                                      {s.status === 'raw_stock' ? 'raw_stock' : 'พร้อมขาย'}
                                    </span>
                                    {isPicked && <Check className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />}
                                  </button>
                                );
                              })}
                            </div>
                            <p className="text-[10px] text-emerald-300/70">
                              * raw_stock (ยังไม่เตรียม) จะถูกส่งเข้า PrepView ให้ช่างเทส/ติดโลโก้/ยิง S/N &nbsp;|&nbsp; in_stock (เตรียมแล้ว) จะข้ามไป "พร้อมส่งรอแปะวอย" ทันที
                            </p>
                          </div>
                        );
                      })()}

                      {/* Supplier & PO & Prep Notes Form Row */}
                      <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.06] grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                        <div>
                          <label className="block text-[11px] text-slate-400 mb-1">แหล่งที่มา / Supplier *</label>
                          <select
                            value={selectedSupplier}
                            onChange={(e) => setSupplierInputs({ ...supplierInputs, [order.id]: e.target.value })}
                            className="w-full liquid-glass-input rounded-xl px-2.5 py-1.5 text-xs text-white focus:outline-none"
                          >
                            {SUPPLIER_PRESETS.map((s) => (
                              <option key={s} value={s} className="bg-[#12141A]">{s}</option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="block text-[11px] text-slate-400 mb-1">เลขที่ PO / ใบสั่งซื้อ (Supplier)</label>
                          <input
                            type="text"
                            placeholder="เช่น PKT/2569-083"
                            value={suggestedPo}
                            onChange={(e) => setPoInputs({ ...poInputs, [order.id]: e.target.value })}
                            className="w-full liquid-glass-input rounded-xl px-2.5 py-1.5 text-xs text-white font-mono focus:outline-none"
                          />
                        </div>

                        <div>
                          <label className="block text-[11px] text-slate-400 mb-1">เลขที่บิล / ใบเบิกบัญชี (INV)</label>
                          <input
                            type="text"
                            value={suggestedBillNo}
                            onChange={(e) => setBillInputs({ ...billInputs, [order.id]: e.target.value })}
                            className="w-full liquid-glass-input rounded-xl px-2.5 py-1.5 text-xs text-[#FF6B00] font-mono font-bold focus:outline-none"
                          />
                        </div>

                        <div>
                          <label className="block text-[11px] text-slate-400 mb-1">หมายเหตุถึงช่างเตรียม (Prep Note)</label>
                          <input
                            type="text"
                            placeholder="เช่น มีกล่องพร้อมลง Driver, ประกอบด่วน"
                            value={prepNoteInputs[order.id] || ''}
                            onChange={(e) => setPrepNoteInputs({ ...prepNoteInputs, [order.id]: e.target.value })}
                            className="w-full liquid-glass-input rounded-xl px-2.5 py-1.5 text-xs text-white focus:outline-none"
                          />
                        </div>
                      </div>

                      {/* Dynamic Action Buttons according to Tab/Stage */}
                      <div className="flex flex-col sm:flex-row items-center justify-end gap-3 pt-2">
                        {/* Stage 1 Actions - Smart Conditional (แสดงเฉพาะปุ่มที่เกี่ยวข้อง) */}
                        {order.order_status === 'pending_purchasing' && (() => {
                          const stockStatus = getOrderStockStatus(order);
                          if (stockStatus.allSufficient) {
                            // มีของครบทุกชิ้น -> แสดงเฉพาะปุ่มตัดสต๊อก (ซ่อนปุ่มสั่ง PO)
                            return (
                              <div className="w-full sm:w-auto flex flex-col items-stretch sm:items-end gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => handleCutStockAndSendPrep(order.id)}
                                  className="w-full sm:w-auto px-5 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 text-black font-extrabold rounded-xl text-xs transition cursor-pointer flex items-center justify-center gap-1.5 shadow-lg shadow-emerald-500/25 border border-white/20 active:scale-95"
                                >
                                  <PackagePlus className="w-4 h-4" />
                                  <span>มีของในสต๊อกเดิม &rarr; ตัดสต๊อก & ส่งช่างเตรียม</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleOrderPO(order.id, order.sales_ref)}
                                  className="text-[10px] text-slate-500 hover:text-purple-300 underline underline-offset-2 transition cursor-pointer self-center sm:self-end"
                                >
                                  หรือบังคับสั่ง PO ใหม่
                                </button>
                              </div>
                            );
                          }
                          // ของไม่พอ -> แสดงเฉพาะปุ่มสั่ง PO (ซ่อนปุ่มตัดสต๊อก)
                          return (
                            <div className="w-full sm:w-auto flex flex-col items-stretch sm:items-end gap-1.5">
                              <span className="text-[10px] text-amber-300/80 self-center sm:self-end">
                                ⚠️ ของไม่พอ (ขาดอีก {stockStatus.totalShortage} ชิ้น) - ต้องสั่งซื้อของเข้า
                              </span>
                              <button
                                type="button"
                                onClick={() => handleOrderPO(order.id, order.sales_ref)}
                                className="w-full sm:w-auto px-5 py-2.5 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 text-black font-extrabold rounded-xl text-xs transition cursor-pointer flex items-center justify-center gap-1.5 shadow-lg shadow-amber-500/25 border border-white/20 active:scale-95"
                              >
                                <ShoppingCart className="w-4 h-4" />
                                <span>รอสั่ง PO (สั่งซื้อของเข้า)</span>
                              </button>
                            </div>
                          );
                        })()}

                        {/* Stage 2 Action: Waiting PO -> Receive Into Stock */}
                        {order.order_status === 'waiting_po' && (
                          <button
                            type="button"
                            onClick={() => handleReceivePO(order.id, order.sales_ref)}
                            className="w-full sm:w-auto px-5 py-2.5 bg-gradient-to-r from-teal-500 to-emerald-600 hover:from-teal-400 text-black font-extrabold rounded-xl text-xs transition cursor-pointer flex items-center justify-center gap-1.5 shadow-lg shadow-teal-500/25 border border-white/20 active:scale-95"
                          >
                            <ShieldCheck className="w-4 h-4" />
                            <span>รับของ PO เข้าสต๊อกแล้ว (บันทึกรับเข้า)</span>
                          </button>
                        )}

                        {/* Stage 3 Action: In Stock -> Cut & Send Prep */}
                        {order.order_status === 'po_received_in_stock' && (
                          <button
                            type="button"
                            onClick={() => handleCutStockAndSendPrep(order.id)}
                            className="w-full sm:w-auto px-6 py-2.5 bg-gradient-to-r from-[#FF6B00] to-[#E65A00] hover:from-[#FF8A24] text-black font-extrabold rounded-xl text-xs transition cursor-pointer flex items-center justify-center gap-1.5 shadow-lg shadow-[#FF6B00]/25 border border-white/20 active:scale-95"
                          >
                            <Send className="w-4 h-4" />
                            <span>ปล่อยของ & ตัดสต๊อกส่งให้ช่างเตรียมสินค้า (Pending Prep)</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ================= TAB 2: PO TRACKING ================= */}
        {mainTab === 'po_tracking' && (
          <div className="space-y-4">
            {/* Stock PO list */}
            <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/[0.06]">
              <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                <span className="text-xs font-bold text-white flex items-center gap-1.5">
                  <PackageSearch className="w-4 h-4 text-emerald-400" />
                  <span>ใบสั่งซื้อเข้าสต๊อก (Stock PO)</span>
                </span>
                <button
                  type="button"
                  onClick={openStockPoModal}
                  className="px-3 py-1.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-200 border border-emerald-500/30 text-[11px] font-bold transition cursor-pointer flex items-center gap-1"
                >
                  <PackagePlus className="w-3.5 h-3.5" />
                  <span>สร้าง Stock PO</span>
                </button>
              </div>
              {stockPOs.length === 0 ? (
                <div className="text-center py-8 text-slate-500 border border-dashed border-white/[0.1] rounded-xl">
                  <PackageSearch className="w-8 h-8 mx-auto mb-2 text-slate-600" />
                  <p className="text-xs font-medium text-slate-300">ยังไม่มีใบสั่งซื้อเข้าสต๊อก</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {stockPOs.map((po) => (
                    <div
                      key={po.id}
                      className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                    >
                      <div className="flex items-center gap-2 flex-wrap min-w-0">
                        <span className="px-2 py-0.5 rounded-md bg-purple-500/15 text-purple-300 border border-purple-500/30 font-mono text-[10px] font-bold">
                          {po.po_number}
                        </span>
                        <span className="text-white font-bold text-sm truncate">{po.product_name}</span>
                        <span className="px-2 py-0.5 rounded-md bg-[#FF6B00]/15 text-[#FF6B00] font-mono font-extrabold text-[11px] data-key">
                          x{po.qty}
                        </span>
                        <span className="text-[10px] text-slate-400 data-meta">{PRODUCT_CATEGORY_LABELS[po.category]}</span>
                        <span className="text-[10px] text-slate-500 data-meta">• {po.supplier || '-'}</span>
                        <span className="text-[10px] text-rose-300/80 font-mono font-bold data-key">ทุน ฿{po.unit_cost.toLocaleString('th-TH')}/หน่วย</span>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {po.status === 'ordered' && (
                          <>
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-500/15 text-purple-300 border border-purple-500/30">
                              รอของเข้า
                            </span>
                            <button
                              type="button"
                              onClick={() => handleReceiveStockPo(po.id, po.product_name, po.qty)}
                              className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-teal-500 to-emerald-600 hover:from-teal-400 text-black font-extrabold text-[11px] transition cursor-pointer flex items-center gap-1 active:scale-95"
                            >
                              <ShieldCheck className="w-3.5 h-3.5" />
                              <span>รับของเข้าห้องสต๊อก</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => cancelStockPO(po.id)}
                              className="px-2 py-1.5 rounded-lg bg-white/[0.04] hover:bg-rose-500/20 text-slate-400 hover:text-rose-300 text-[11px] transition cursor-pointer"
                              title="ยกเลิกใบสั่งซื้อ"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                        {po.status === 'received' && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-teal-500/15 text-teal-300 border border-teal-500/30 flex items-center gap-1">
                            <CheckCircle className="w-3 h-3" />
                            รับเข้าห้องสต๊อกแล้ว
                          </span>
                        )}
                        {po.status === 'cancelled' && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-white/10 text-slate-400">
                            ยกเลิกแล้ว
                          </span>
                        )}
                      </div>
                      <div className="w-full">
                        <LatestUpdateBadge
                          logs={po.activity_logs}
                          fallbackTimestamp={po.received_at || po.created_at}
                          fallbackActor={po.created_by}
                        />
                        <ActivityTimeline logs={po.activity_logs} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Active POs waiting for delivery */}
            <div className="p-4 rounded-2xl bg-purple-500/[0.05] border border-purple-500/25">
              <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                <span className="text-xs font-bold text-white flex items-center gap-1.5">
                  <Truck className="w-4 h-4 text-purple-400" />
                  <span>ใบสั่งซื้อที่รอของเข้า (waiting_po)</span>
                </span>
                <span className="text-[11px] text-slate-400">{waitingPoOrders.length} ออเดอร์</span>
              </div>

              {waitingPoOrders.length === 0 ? (
                <div className="text-center py-8 text-slate-500 border border-dashed border-white/[0.1] rounded-xl">
                  <Truck className="w-8 h-8 mx-auto mb-2 text-slate-600" />
                  <p className="text-xs font-medium text-slate-300">ไม่มีใบสั่งซื้อที่รอของเข้า</p>
                </div>
              ) : (
                <>
                  <ListControls
                    from={poTrackingList.from}
                    to={poTrackingList.to}
                    total={poTrackingList.total}
                    page={poTrackingList.page}
                    totalPages={poTrackingList.totalPages}
                    pageSize={poTrackingList.pageSize}
                    sort={poTrackingList.sort}
                    onSortChange={poTrackingList.setSort}
                    onPageSizeChange={poTrackingList.setPageSize}
                    onPageChange={poTrackingList.setPage}
                    unit="ออเดอร์"
                    className="mb-3"
                  />
                  <div className="space-y-2">
                    {poTrackingList.pageItems.map((order) => {
                      const rMeta = order.route_code ? ROUTE_DEFINITIONS[order.route_code] : null;
                      const supplier = supplierInputs[order.id] || order.items_list?.[0]?.supplier || 'สต๊อกร้าน (Main Store)';
                      const poNo = poInputs[order.id] || order.items_list?.[0]?.po_no || '-';
                      return (
                        <div key={order.id} className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] text-xs space-y-2">
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <div className="flex items-center gap-2 flex-wrap min-w-0">
                              <span className="px-2 py-0.5 rounded-lg bg-[#FF6B00] text-black font-extrabold font-mono text-[10px]">
                                {order.sales_ref || 'SO'}
                              </span>
                              <span className="text-white font-semibold truncate">{order.customer_name}</span>
                              {rMeta && (
                                <span className={`px-2 py-0.5 rounded-lg text-[10px] font-bold border ${rMeta.badgeBg} ${rMeta.badgeBorder} ${rMeta.badgeText}`}>
                                  {rMeta.shortName}
                                </span>
                              )}
                            </div>
                            <button
                              type="button"
                              onClick={() => handleReceivePO(order.id, order.sales_ref)}
                              className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-teal-500 to-emerald-600 hover:from-teal-400 text-black font-extrabold text-[11px] transition cursor-pointer flex items-center gap-1 active:scale-95"
                            >
                              <ShieldCheck className="w-3.5 h-3.5" />
                              <span>รับของเข้าสต๊อก</span>
                            </button>
                          </div>
                          <div className="flex items-center gap-2 flex-wrap text-[10px] text-slate-400">
                            <span className="font-mono text-purple-300">PO: {poNo}</span>
                            <span>• {supplier}</span>
                            <span>• ส่งมอบ {order.delivery_date ? new Date(order.delivery_date).toLocaleDateString('th-TH') : '-'}</span>
                          </div>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {(order.items_list || []).map((it, idx) => (
                              <span key={idx} className="px-2 py-0.5 rounded-md bg-white/[0.04] border border-white/[0.08] text-[10px] text-slate-300">
                                {it.model_name} <span className="text-[#FF6B00] font-mono">x{it.quantity}</span>
                              </span>
                            ))}
                          </div>
                          <LatestUpdateBadge
                            logs={order.activity_logs}
                            fallbackTimestamp={order.updated_at || order.created_at}
                            fallbackActor={order.salesperson}
                          />
                          <ActivityTimeline logs={order.activity_logs} />
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* ================= TAB 3: INVENTORY ================= */}
        {mainTab === 'inventory' && (
          <div className="space-y-4">
            {/* Storage Room batches with 7-day DOA countdown */}
            <div className="p-4 rounded-2xl bg-amber-500/[0.05] border border-amber-500/25">
              <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                <span className="text-xs font-bold text-white flex items-center gap-1.5">
                  <Warehouse className="w-4 h-4 text-amber-400" />
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse shrink-0" aria-hidden="true" />
                  <span>ห้องสต๊อก - ของรับเข้าแล้ว ยังไม่เตรียม (นับถอยหลังเทส 7 วัน DOA)</span>
                </span>
                <span className="text-[11px] text-slate-400">
                  {rawStockBatches.length} batch • รวม {rawStockItems.length} เครื่อง
                </span>
              </div>
              {rawStockBatches.length === 0 ? (
                <div className="text-center py-8 text-slate-500 border border-dashed border-white/[0.1] rounded-xl">
                  <Warehouse className="w-8 h-8 mx-auto mb-2 text-slate-600" />
                  <p className="text-xs font-medium text-slate-300">ห้องสต๊อกว่าง ไม่มีของรอเตรียม</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {rawStockBatches.map((batch) => {
                    const daysLeft = getDoaDaysLeft(batch.received_at);
                    const expired = daysLeft === 0;
                    const batchCount = batch.itemIds.length;
                    const sendQty = Math.min(Math.max(1, batchSendQty[batch.key] ?? 1), batchCount);
                    return (
                      <div
                        key={batch.key}
                        className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-2 text-xs"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="text-white font-bold text-base truncate">{batch.model_name}</div>
                            <div className="text-[10px] text-slate-400 font-mono truncate data-meta">
                              PO: {batch.po_no} • {batch.supplier}
                            </div>
                          </div>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap flex items-center gap-1 ${expired
                            ? 'bg-rose-500/15 text-rose-300 border border-rose-500/30'
                            : daysLeft <= 2
                              ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                              : 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                            }`}>
                            <Timer className="w-3 h-3" />
                            {expired ? 'ครบ 7 วันแล้ว' : `เหลือ ${daysLeft} วัน`}
                          </span>
                        </div>

                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="px-2 py-0.5 rounded-md text-[11px] font-extrabold bg-[#FF6B00]/15 text-[#FF6B00] border border-[#FF6B00]/30 whitespace-nowrap data-key">
                            จำนวน {batchCount} เครื่อง
                          </span>
                          <span className="text-[10px] text-slate-500 data-meta">
                            รับเข้า: {batch.received_at ? new Date(batch.received_at).toLocaleDateString('th-TH') : '-'}
                          </span>
                        </div>

                        {batch.serials.length > 0 && (
                          <div className="text-[10px] text-slate-500 font-mono truncate data-meta">
                            S/N: {batch.serials.join(', ')}
                          </div>
                        )}

                        <div className="flex items-center gap-1.5">
                          <div className="flex items-center rounded-lg bg-white/[0.04] border border-white/[0.08] overflow-hidden flex-shrink-0">
                            <button
                              type="button"
                              onClick={() => setBatchSendQty(prev => ({ ...prev, [batch.key]: Math.max(1, sendQty - 1) }))}
                              disabled={sendQty <= 1}
                              className="px-2 py-1.5 text-slate-300 hover:text-white hover:bg-white/[0.08] disabled:opacity-30 disabled:cursor-not-allowed transition cursor-pointer"
                              title="ลดจำนวน"
                            >
                              −
                            </button>
                            <input
                              type="number"
                              min={1}
                              max={batchCount}
                              value={sendQty}
                              onChange={(e) => {
                                const v = parseInt(e.target.value) || 1;
                                setBatchSendQty(prev => ({ ...prev, [batch.key]: Math.min(Math.max(1, v), batchCount) }));
                              }}
                              className="w-10 bg-transparent text-center text-[11px] font-mono font-bold text-[#FF6B00] focus:outline-none"
                            />
                            <button
                              type="button"
                              onClick={() => setBatchSendQty(prev => ({ ...prev, [batch.key]: Math.min(batchCount, sendQty + 1) }))}
                              disabled={sendQty >= batchCount}
                              className="px-2 py-1.5 text-slate-300 hover:text-white hover:bg-white/[0.08] disabled:opacity-30 disabled:cursor-not-allowed transition cursor-pointer"
                              title="เพิ่มจำนวน"
                            >
                              +
                            </button>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleSendBatchToPrep(batch.key, batch.model_name, batch.itemIds, sendQty)}
                            className="flex-1 py-1.5 rounded-lg bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 text-black font-extrabold text-[11px] transition cursor-pointer flex items-center justify-center gap-1 active:scale-95"
                          >
                            <Wrench className="w-3.5 h-3.5" />
                            <span>ส่งช่างเทส & ติดโลโก้</span>
                          </button>
                        </div>
                        {batchCount > 1 && (
                          <button
                            type="button"
                            onClick={() => handleSendBatchToPrep(batch.key, batch.model_name, batch.itemIds, batchCount)}
                            className="w-full py-1 rounded-lg bg-white/[0.04] hover:bg-amber-500/20 text-amber-300 hover:text-amber-200 border border-white/[0.08] text-[10px] font-bold transition cursor-pointer flex items-center justify-center gap-1 active:scale-95"
                          >
                            <Layers className="w-3 h-3" />
                            <span>ส่งทั้งหมด ({batchCount} เครื่อง)</span>
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Inventory list */}
            <div className="rounded-2xl bg-white/[0.02] border border-white/[0.06] p-4">
              <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
                <span className="text-xs font-bold text-white flex items-center gap-1.5">
                  <Boxes className="w-4 h-4 text-emerald-400" />
                  <span>สินค้าคงเหลือพร้อมใช้ (Inventory)</span>
                </span>
                <span className="text-[11px] text-slate-400">
                  {filteredInventoryGroups.length} รุ่น • รวม {filteredInventoryGroups.reduce((sum, g) => sum + g.qty, 0)} เครื่อง
                </span>
              </div>

              {/* Category Filter Bar */}
              <div className="flex items-center gap-1.5 mb-3 overflow-x-auto pb-1">
                {inventoryCategoryOptions.map(opt => {
                  const isActive = stockCategoryFilter === opt.value;
                  const count = opt.value === 'all'
                    ? inventoryGroups.length
                    : (inventoryCategoryCounts[opt.value] || 0);
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setStockCategoryFilter(opt.value)}
                      className={`px-3 py-1.5 rounded-full text-[11px] font-bold whitespace-nowrap transition border cursor-pointer flex items-center gap-1.5 ${isActive
                        ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-200'
                        : 'bg-white/[0.02] border-white/[0.08] text-slate-400 hover:text-white hover:bg-white/[0.05]'
                        }`}
                    >
                      <span>{opt.label}</span>
                      <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono ${isActive ? 'bg-emerald-500/30 text-emerald-100' : 'bg-white/10 text-slate-400'
                        }`}>{count}</span>
                    </button>
                  );
                })}
              </div>

              {filteredInventoryGroups.length === 0 ? (
                <div className="text-center py-8 text-slate-500 border border-dashed border-white/[0.1] rounded-xl">
                  <Boxes className="w-8 h-8 mx-auto mb-2 text-slate-600" />
                  <p className="text-xs font-medium text-slate-300">ไม่มีสินค้าคงเหลือในหมวดนี้</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">สินค้าที่สต๊อกหมด (0 ชิ้น) จะไม่แสดงในรายการนี้</p>
                </div>
              ) : (
                <>
                  <ListControls
                    from={inventoryList.from}
                    to={inventoryList.to}
                    total={inventoryList.total}
                    page={inventoryList.page}
                    totalPages={inventoryList.totalPages}
                    pageSize={inventoryList.pageSize}
                    sort={inventoryList.sort}
                    onSortChange={inventoryList.setSort}
                    onPageSizeChange={inventoryList.setPageSize}
                    onPageChange={inventoryList.setPage}
                    unit="รุ่น"
                    className="mb-3"
                  />
                  <div className="space-y-2">
                    {inventoryList.pageItems.map(g => (
                      <div
                        key={g.key}
                        className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] flex items-center justify-between gap-3"
                      >
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-white font-semibold text-xs truncate">{g.model_name}</span>
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-blue-500/15 text-blue-300 border border-blue-500/30 whitespace-nowrap">
                              {PRODUCT_CATEGORY_LABELS[g.category]}
                            </span>
                          </div>
                          <div className="text-[10px] text-slate-400 flex items-center gap-1.5 flex-wrap">
                            <span className="text-amber-300">ในห้องสต๊อก {g.rawCount}</span>
                            <span className="text-slate-600">/</span>
                            <span className="text-emerald-300">เตรียมแล้ว {g.readyCount}</span>
                          </div>
                          {g.serials.length > 0 && (
                            <div className="text-[10px] text-slate-500 font-mono truncate">
                              S/N: {g.serials.join(', ')}
                            </div>
                          )}
                        </div>
                        <div className="flex-shrink-0 text-right">
                          <div className="px-3 py-1.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30">
                            <span className="text-lg font-extrabold font-mono text-emerald-300 leading-none">{g.qty}</span>
                            <span className="text-[10px] text-emerald-400/80 ml-1">เครื่อง</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* STOCK PO MODAL (Proactive Stock Replenishment)                            */}
      {/* ========================================================================= */}
      {isStockPoModalOpen && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center sm:p-4 bg-black/75 backdrop-blur-md animate-fade-in">
          <div className="liquid-glass rounded-t-3xl sm:rounded-3xl w-full sm:w-[90vw] max-w-2xl max-h-[92dvh] sm:max-h-[90vh] flex flex-col shadow-2xl border border-white/[0.12] overflow-hidden pb-[env(safe-area-inset-bottom)] animate-modal-pop">
            <div className="sm:hidden flex justify-center pt-2.5 pb-1 flex-shrink-0">
              <span className="h-1.5 w-10 rounded-full bg-white/20" />
            </div>
            <div className="p-4 sm:p-6 border-b border-white/[0.08] flex items-center justify-between gap-2 flex-shrink-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="p-2.5 rounded-2xl bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                  <PackagePlus className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm sm:text-base font-bold text-white leading-tight">สั่งซื้อเข้าสต๊อก (Stock PO)</h3>
                  <p className="text-[11px] text-slate-400">สั่งของล่วงหน้าเพื่อสต๊อกพร้อมขาย ไม่ผูกกับออเดอร์ลูกค้า</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsStockPoModalOpen(false)}
                className="p-2.5 rounded-xl text-slate-400 hover:text-white bg-white/[0.04] hover:bg-white/[0.08] transition min-w-[44px] min-h-[44px] flex items-center justify-center flex-shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitStockPo} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 text-xs">
              {/* เลือกสินค้าจากแคตตาล็อกกลาง (ฝ่ายขายบันทึกไว้) */}
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <label className="block text-[11px] text-slate-300">
                    รายการสินค้าที่จะสั่งซื้อ PO * <span className="text-slate-500">({stockPoLines.length} รายการ)</span>
                  </label>
                  <button
                    type="button"
                    onClick={openPoCatalogModal}
                    className="px-3 py-2 rounded-xl bg-gradient-to-r from-[#FF6B00] to-[#E65A00] hover:from-[#FF8A24] text-black font-extrabold text-[11px] transition cursor-pointer flex items-center gap-1.5 shadow-lg shadow-[#FF6B00]/25 border border-white/20 active:scale-95"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>+ เลือกสินค้าจากแคตตาล็อกเพื่อสั่งซื้อ PO</span>
                  </button>
                </div>

                {stockPoLines.length === 0 ? (
                  <div className="text-center py-8 text-slate-500 border border-dashed border-white/[0.1] rounded-xl text-[11px]">
                    ยังไม่มีรายการสั่งซื้อ กดปุ่มด้านบนเพื่อเลือกสินค้าจากแคตตาล็อกกลาง
                  </div>
                ) : (
                  <div className="space-y-2">
                    {stockPoLines.map((line) => (
                      <div
                        key={line.product_id}
                        className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-2"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="text-white font-semibold text-xs truncate">{line.product_name}</div>
                            <div className="text-[10px] text-slate-400">
                              {PRODUCT_CATEGORY_LABELS[line.category]}
                              <span className="ml-1.5 text-emerald-400/80 font-mono">
                                • ในสต๊อก {stockCountByName[line.product_name.trim().toLowerCase()] || 0}
                              </span>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleRemoveStockPoLine(line.product_id)}
                            className="text-slate-500 hover:text-rose-400 transition cursor-pointer p-1 flex-shrink-0"
                            title="ลบรายการนี้"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="block text-[10px] text-slate-400 mb-0.5">จำนวน (ชิ้น)</label>
                            <input
                              type="number"
                              min={1}
                              value={line.qty}
                              onChange={(e) => handleUpdateStockPoLine(line.product_id, { qty: parseInt(e.target.value) || 1 })}
                              className="w-full liquid-glass-input rounded-lg px-2 py-1 text-xs text-[#FF6B00] font-mono font-bold focus:outline-none"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] text-rose-300 mb-0.5">ราคาทุน/หน่วย (ภายใน)</label>
                            <input
                              type="number"
                              min={0}
                              value={line.unit_cost || ''}
                              onChange={(e) => handleUpdateStockPoLine(line.product_id, { unit_cost: parseFloat(e.target.value) || 0 })}
                              className="w-full liquid-glass-input rounded-lg px-2 py-1 text-xs text-rose-300 font-mono font-bold focus:outline-none"
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] text-slate-300 mb-1">Supplier</label>
                  <select
                    value={stockPoMeta.supplier}
                    onChange={(e) => setStockPoMeta({ ...stockPoMeta, supplier: e.target.value })}
                    className="w-full liquid-glass-input rounded-xl px-2.5 py-2 text-xs text-white focus:outline-none"
                  >
                    {SUPPLIER_PRESETS.map((s) => (
                      <option key={s} value={s} className="bg-[#12141A]">{s}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] text-slate-300 mb-1">เลขที่ PO / ใบสั่งซื้อ</label>
                  <input
                    type="text"
                    value={stockPoMeta.po_number}
                    onChange={(e) => setStockPoMeta({ ...stockPoMeta, po_number: e.target.value })}
                    className="w-full liquid-glass-input rounded-xl px-3 py-2 text-xs text-purple-300 font-mono font-bold focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] text-slate-300 mb-1">หมายเหตุ</label>
                <input
                  type="text"
                  placeholder="เช่น สั่งด่วน, ต้องติดโลโก้ก่อนเข้าสต๊อก"
                  value={stockPoMeta.notes}
                  onChange={(e) => setStockPoMeta({ ...stockPoMeta, notes: e.target.value })}
                  className="w-full liquid-glass-input rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
                />
              </div>

              <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-[11px] text-emerald-300">
                เมื่อของมาถึง กด "รับของเข้าห้องสต๊อก" ระบบจะสร้าง {stockPoLines.reduce((sum, l) => sum + Math.max(1, l.qty), 0)} ชิ้นในสถานะ <strong>raw_stock</strong> เก็บในห้องสต๊อก (ยังไม่เตรียม) พร้อมนับถอยหลังเทส 7 วัน DOA — จัดซื้อสามารถกดส่งช่างเทส/ติดโลโก้ล่วงหน้าได้ทุกเมื่อ
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setIsStockPoModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs text-slate-400 hover:text-white bg-white/[0.04] hover:bg-white/[0.08] transition"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={stockPoLines.length === 0}
                  className={`px-5 py-2 rounded-xl font-extrabold text-xs transition flex items-center gap-1.5 ${stockPoLines.length > 0
                    ? 'bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 text-black cursor-pointer active:scale-95'
                    : 'bg-white/10 text-slate-500 cursor-not-allowed'
                    }`}
                >
                  <ShoppingCart className="w-4 h-4" />
                  <span>บันทึก Stock PO ({stockPoLines.length})</span>
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* ========================================================================= */}
      {/* CATALOG MULTI-SELECT MODAL (สำหรับสั่งซื้อ PO - อ่านแคตตาล็อกกลางของฝ่ายขาย) */}
      {/* ========================================================================= */}
      {isPoCatalogModalOpen && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center sm:p-4 bg-black/75 backdrop-blur-md animate-fade-in">
          <div className="liquid-glass rounded-t-3xl sm:rounded-3xl w-full sm:w-[90vw] max-w-4xl max-h-[92dvh] sm:max-h-[88vh] flex flex-col shadow-2xl border border-white/[0.12] overflow-hidden pb-[env(safe-area-inset-bottom)] animate-modal-pop">
            <div className="sm:hidden flex justify-center pt-2.5 pb-1 flex-shrink-0">
              <span className="h-1.5 w-10 rounded-full bg-white/20" />
            </div>
            {/* Header */}
            <div className="p-4 sm:p-5 border-b border-white/[0.08] flex items-center justify-between gap-2 flex-shrink-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="p-2.5 rounded-2xl bg-[#FF6B00]/15 text-[#FF6B00] border border-[#FF6B00]/30">
                  <ShoppingBag className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm sm:text-base font-bold text-white leading-tight">เลือกสินค้าจากแคตตาล็อกเพื่อสั่งซื้อ PO</h3>
                  <p className="text-[11px] text-slate-400">ติ๊กเลือกได้หลายรายการ ตั้งจำนวน & ราคาทุนก่อนยืนยัน</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsPoCatalogModalOpen(false)}
                className="p-2.5 rounded-xl text-slate-400 hover:text-white bg-white/[0.04] hover:bg-white/[0.08] transition min-w-[44px] min-h-[44px] flex items-center justify-center flex-shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Controls: Search / Sort / Category */}
            <div className="p-4 sm:p-5 border-b border-white/[0.06] space-y-3 bg-white/[0.02] flex-shrink-0">
              <div className="flex flex-col sm:flex-row items-center gap-2.5">
                <div className="relative flex-1 w-full">
                  <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                  <input
                    type="text"
                    placeholder="ค้นหาชื่อสินค้า..."
                    value={poCatalogSearch}
                    onChange={(e) => setPoCatalogSearch(e.target.value)}
                    className="w-full liquid-glass-input rounded-xl pl-9 pr-3 py-2 text-xs text-white focus:outline-none"
                  />
                </div>
                <select
                  value={poCatalogSort}
                  onChange={(e) => setPoCatalogSort(e.target.value as typeof poCatalogSort)}
                  aria-label="เรียงลำดับสินค้า"
                  className="w-full sm:w-auto liquid-glass-input rounded-xl px-3 py-2 text-xs text-white focus:outline-none cursor-pointer"
                >
                  <option value="name" className="bg-[#12141A]">ชื่อสินค้า: ก → ฮ</option>
                  <option value="cost_desc" className="bg-[#12141A]">ราคาทุน: มาก → น้อย</option>
                  <option value="cost_asc" className="bg-[#12141A]">ราคาทุน: น้อย → มาก</option>
                  <option value="stock_desc" className="bg-[#12141A]">สต๊อกคงเหลือ: มาก → น้อย</option>
                </select>
              </div>

              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
                <span className="text-slate-400 text-[11px] mr-1 flex items-center gap-1">
                  <Filter className="w-3 h-3" />
                  หมวดหมู่:
                </span>
                {([
                  { id: 'all', label: 'ทั้งหมด' },
                  { id: 'pc_notebook', label: 'คอมพิวเตอร์ / โน้ตบุ๊ก' },
                  { id: 'printer', label: 'เครื่องพิมพ์ / สแกนเนอร์' },
                  { id: 'cctv_network', label: 'กล้องวงจรปิด / เครือข่าย' },
                  { id: 'general', label: 'สินค้าทั่วไป' },
                  { id: 'service', label: 'ค่าแรง / บริการ' }
                ] as { id: 'all' | ProductCategory; label: string }[]).map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setPoCatalogCategory(cat.id)}
                    className={`px-3 py-1 rounded-xl text-[11px] font-semibold whitespace-nowrap transition cursor-pointer ${poCatalogCategory === cat.id
                      ? 'bg-[#FF6B00] text-black shadow-md shadow-[#FF6B00]/25'
                      : 'bg-white/[0.04] text-slate-300 hover:text-white hover:bg-white/[0.08]'
                      }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>

              <div className="flex items-start gap-1.5 text-[10px] text-emerald-300/80">
                <Info className="w-3 h-3 mt-0.5 flex-shrink-0" />
                <span>รายการสินค้าอ้างอิงจากแคตตาล็อกกลางที่ฝ่ายขายบันทึกไว้</span>
              </div>
            </div>

            {/* Body: multi-select table */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-5">
              {poCatalogFiltered.length === 0 ? (
                <div className="text-center py-12 text-slate-500 border border-dashed border-white/[0.08] rounded-2xl text-xs">
                  ไม่พบสินค้าที่ตรงกับเงื่อนไข — ให้ฝ่ายขายเพิ่มสินค้าเข้าแคตตาล็อกก่อน
                </div>
              ) : (
                <div className="overflow-x-auto rounded-2xl border border-white/[0.06]">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-white/[0.04] text-slate-400 border-b border-white/[0.06]">
                      <tr>
                        <th className="py-2.5 px-3 w-10 text-center">เลือก</th>
                        <th className="py-2.5 px-3">ชื่อสินค้า</th>
                        <th className="py-2.5 px-3 text-right">ราคาทุน</th>
                        <th className="py-2.5 px-3 text-center w-24">จำนวน</th>
                        <th className="py-2.5 px-3 text-right w-28">ราคาทุน/หน่วย</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.04]">
                      {poCatalogFiltered.map((item) => {
                        const pick = poCatalogPicks[item.id];
                        const isSelected = !!pick;
                        const inStock = stockCountByName[item.name.trim().toLowerCase()] || 0;
                        return (
                          <tr
                            key={item.id}
                            onClick={() => togglePoCatalogPick(item)}
                            className={`transition cursor-pointer ${isSelected
                              ? 'bg-[#FF6B00]/10 hover:bg-[#FF6B00]/15'
                              : 'hover:bg-white/[0.02]'
                              }`}
                          >
                            <td className="py-2.5 px-3 text-center">
                              <div className="flex items-center justify-center">
                                {isSelected ? (
                                  <div className="w-5 h-5 rounded-md bg-[#FF6B00] text-black flex items-center justify-center font-bold">
                                    <Check className="w-3.5 h-3.5" />
                                  </div>
                                ) : (
                                  <div className="w-5 h-5 rounded-md border border-white/20 bg-white/[0.03]" />
                                )}
                              </div>
                            </td>
                            <td className="py-2.5 px-3 font-semibold text-white">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-base font-bold text-white">
                                  {item.name}
                                  <span className="ml-1 text-[10px] text-slate-500 font-medium data-meta">/ {item.unit}</span>
                                </span>
                                <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-blue-500/15 text-blue-300 border border-blue-500/30 whitespace-nowrap">
                                  {PRODUCT_CATEGORY_LABELS[item.category]}
                                </span>
                                {item.item_type !== 'service' && (
                                  <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold whitespace-nowrap border ${inStock > 0
                                    ? 'bg-teal-500/15 text-teal-300 border-teal-500/30'
                                    : 'bg-slate-500/15 text-slate-400 border-slate-500/30'
                                    }`}>
                                    ในสต๊อก: {inStock}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono font-extrabold text-rose-300 text-sm data-key">
                              {item.cost_price.toLocaleString('th-TH')}
                            </td>
                            <td className="py-2.5 px-3 text-center" onClick={(e) => e.stopPropagation()}>
                              {isSelected ? (
                                <input
                                  type="number"
                                  min={1}
                                  value={pick.qty}
                                  onChange={(e) => updatePoCatalogPick(item.id, { qty: parseInt(e.target.value) || 1 })}
                                  className="w-16 text-center liquid-glass-input rounded-lg px-2 py-1 text-xs text-[#FF6B00] font-bold"
                                />
                              ) : (
                                <span className="text-slate-600 font-mono">-</span>
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-right" onClick={(e) => e.stopPropagation()}>
                              {isSelected ? (
                                <input
                                  type="number"
                                  min={0}
                                  value={pick.unit_cost || ''}
                                  onChange={(e) => updatePoCatalogPick(item.id, { unit_cost: parseFloat(e.target.value) || 0 })}
                                  className="w-24 text-right liquid-glass-input rounded-lg px-2 py-1 text-xs text-rose-300 font-mono font-bold"
                                />
                              ) : (
                                <span className="text-slate-600 font-mono">-</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-3 sm:p-5 border-t border-white/[0.08] flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 bg-white/[0.02] flex-shrink-0">
              <div className="text-xs text-slate-300 text-center sm:text-left">
                เลือกแล้ว <strong className="text-[#FF6B00] font-mono text-sm">{poCatalogSelectedCount}</strong> รายการ
              </div>
              <div className="flex items-center gap-2.5 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => setIsPoCatalogModalOpen(false)}
                  className="w-full sm:w-auto px-4 py-2.5 rounded-xl text-xs text-slate-400 hover:text-white bg-white/[0.04] hover:bg-white/[0.08] transition min-h-[44px]"
                >
                  ยกเลิก
                </button>
                <button
                  type="button"
                  onClick={handleConfirmPoCatalogSelection}
                  disabled={poCatalogSelectedCount === 0}
                  className={`w-full sm:w-auto px-6 py-2.5 rounded-xl text-xs font-extrabold transition flex items-center justify-center gap-2 shadow-xl min-h-[44px] ${poCatalogSelectedCount > 0
                    ? 'bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 text-black cursor-pointer active:scale-95'
                    : 'bg-white/10 text-slate-500 cursor-not-allowed'
                    }`}
                >
                  <Check className="w-4 h-4" />
                  <span>ยืนยันรายการที่ติ๊ก ({poCatalogSelectedCount})</span>
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};
