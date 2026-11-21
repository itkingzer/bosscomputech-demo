import React, { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useApp } from '../context/AppContext';
import {
  Boxes, PackagePlus, CheckCircle, Info, MapPin,
  ShoppingCart, Clock, AlertTriangle, Truck, Tag, Send, Check,
  ArrowRight, ShieldCheck, FileCheck, Layers, Lock, X, Warehouse, Zap,
  Timer, Wrench, ChevronDown, ChevronRight, ClipboardList, PackageSearch,
  Search, Filter, Trash2, ShoppingBag, Plus, Receipt, History, Hash
} from 'lucide-react';
import { ROUTE_DEFINITIONS, Order, ProductCategory, PRODUCT_CATEGORY_LABELS, Product, StockPO, formatThaiDateTime } from '../types';
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

const fmt = (n: number): string => (n || 0).toLocaleString('th-TH');

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

  // ---- Compact Card-to-Modal: modal state ----
  // Stock Action Modal (ออเดอร์รอดำเนินการ)
  const [actionOrder, setActionOrder] = useState<Order | null>(null);
  // Batch Detail Modal (ห้องสต๊อก DOA)
  const [batchDetail, setBatchDetail] = useState<{ key: string; model_name: string; po_no: string; supplier: string; received_at: string | null; itemIds: string[]; serials: string[] } | null>(null);
  // Inventory Detail Modal (คลังสินค้าคงเหลือ)
  const [inventoryDetail, setInventoryDetail] = useState<{ key: string; model_name: string; category: ProductCategory; rawCount: number; readyCount: number; serials: string[]; qty: number } | null>(null);
  // Stock PO Detail Modal (ติดตาม PO)
  const [poDetail, setPoDetail] = useState<StockPO | null>(null);
  // Search filters for compact card lists
  const [incomingSearch, setIncomingSearch] = useState('');
  const [inventorySearch, setInventorySearch] = useState('');

  // Lock background scroll while any modal is open
  const anyModalOpen = isStockPoModalOpen || isPoCatalogModalOpen || !!actionOrder || !!batchDetail || !!inventoryDetail || !!poDetail;
  useEffect(() => {
    if (!anyModalOpen) return;
    const htmlEl = document.documentElement;
    const bodyEl = document.body;
    const mainEl = document.querySelector('main');
    const prevHtmlOverflow = htmlEl.style.overflow;
    const prevBodyOverflow = bodyEl.style.overflow;
    const prevMainOverflow = mainEl ? mainEl.style.overflow : '';
    htmlEl.style.overflow = 'hidden';
    bodyEl.style.overflow = 'hidden';
    if (mainEl) mainEl.style.overflow = 'hidden';
    return () => {
      htmlEl.style.overflow = prevHtmlOverflow;
      bodyEl.style.overflow = prevBodyOverflow;
      if (mainEl) mainEl.style.overflow = prevMainOverflow;
    };
  }, [anyModalOpen]);

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

  // ตรวจสอบความพร้อมก่อนส่งช่างเตรียม:
  // 1) สต๊อก (raw_stock + in_stock) เพียงพอทุกรายการ
  // 2) ออเดอร์ไม่อยู่ในสถานะ waiting_po และไม่มี Stock PO ที่ยังค้างรับ (status === 'ordered')
  const getOrderPrepReadiness = (order: Order) => {
    const stockStatus = getOrderStockStatus(order);
    const orderedModelKeys = new Set(
      stockStatus.rows.map(r => (r.model_name || '').trim().toLowerCase()).filter(Boolean)
    );
    const pendingLinkedStockPOs = stockPOs.filter(
      p => p.status === 'ordered' && orderedModelKeys.has((p.product_name || '').trim().toLowerCase())
    );
    const isOrderWaitingPo = order.order_status === 'waiting_po';
    const hasPendingPo = isOrderWaitingPo || pendingLinkedStockPOs.length > 0;
    const canSendToPrep = stockStatus.allSufficient && !hasPendingPo;
    return {
      stockStatus,
      pendingLinkedStockPOs,
      isOrderWaitingPo,
      hasPendingPo,
      canSendToPrep
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

    const readiness = getOrderPrepReadiness(order);
    if (!readiness.canSendToPrep) {
      setToast('รอสั่ง PO / รอรับของเข้าคลังก่อนจึงจะส่งช่างเตรียมได้');
      setTimeout(() => setToast(''), 4000);
      return;
    }

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

  const searchedIncomingOrders = useMemo(() => {
    const q = incomingSearch.trim().toLowerCase();
    if (!q) return currentTabOrders;
    return currentTabOrders.filter(o =>
      (o.sales_ref || '').toLowerCase().includes(q)
      || (o.customer_name || '').toLowerCase().includes(q)
      || (o.customer_phone || '').toLowerCase().includes(q)
    );
  }, [currentTabOrders, incomingSearch]);

  const searchedInventoryGroups = useMemo(() => {
    const q = inventorySearch.trim().toLowerCase();
    const list = !q
      ? filteredInventoryGroups
      : filteredInventoryGroups.filter(g => (g.model_name || '').toLowerCase().includes(q));
    return [...list].sort((a, b) => b.qty - a.qty);
  }, [filteredInventoryGroups, inventorySearch]);

  // ---- List Controls (sort + page size + pagination) ----
  const inventoryList = useListControls(searchedInventoryGroups, {
    getValue: (g) => g.qty,
    initialSort: 'high',
    initialPageSize: 10
  });

  const poTrackingList = useListControls(waitingPoOrders, {
    getDate: (o) => o.updated_at || o.created_at,
    initialSort: 'newest',
    initialPageSize: 10
  });

  const incomingList = useListControls(searchedIncomingOrders, {
    getDate: (o) => o.created_at,
    initialSort: 'newest',
    initialPageSize: 10
  });

  const toggleOrderExpanded = (orderId: string) => {
    setExpandedOrders(prev => ({ ...prev, [orderId]: !prev[orderId] }));
  };

  const mainTabs: { key: 'incoming' | 'po_tracking' | 'inventory'; label: string; sub: string; count: number; icon: React.ElementType; accent: string }[] = [
    {
      key: 'incoming',
      label: 'ออเดอร์รอดำเนินการ',
      sub: 'Incoming',
      count: newOrders.length + waitingPoOrders.length + poReceivedOrders.length,
      icon: ClipboardList,
      accent: 'blue'
    },
    {
      key: 'po_tracking',
      label: 'รอรับของ PO / ห้องสต๊อก DOA',
      sub: 'PO / DOA',
      count: waitingPoOrders.length + rawStockBatches.length + orderedStockPOs.length,
      icon: Truck,
      accent: 'purple'
    },
    {
      key: 'inventory',
      label: 'คลังสต๊อกพร้อมขาย',
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

  // ---- Compact incoming order cards ----
  const incomingCards = incomingList.pageItems;

  // ---- Compact inventory cards ----
  const inventoryCards = inventoryList.pageItems;

  // ---- Stock status badge for an order card ----
  const renderStockStatusBadge = (order: Order) => {
    const { stockStatus, hasPendingPo, canSendToPrep } = getOrderPrepReadiness(order);
    if (canSendToPrep) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/35">
          <CheckCircle className="w-3 h-3" />
          สต๊อกพร้อมตัด
        </span>
      );
    }
    if (hasPendingPo) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-500/40">
          <Clock className="w-3 h-3" />
          รอรับของ PO เข้าคลัง
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/35">
        <AlertTriangle className="w-3 h-3" />
        สต๊อกไม่พอ (ขาด {stockStatus.totalShortage}) - รอสั่ง PO
      </span>
    );
  };

  const renderOrderStatusBadge = (status: string) => {
    switch (status) {
      case 'pending_purchasing':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/15 text-blue-300 border border-blue-500/30">รอจัดซื้อ</span>;
      case 'waiting_po':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-500/15 text-purple-300 border border-purple-500/30">รอของเข้า</span>;
      case 'po_received_in_stock':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-teal-500/15 text-teal-300 border border-teal-500/30">ของเข้าแล้ว</span>;
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      {toast && (
        <div className="fixed bottom-6 right-6 z-[10001] p-4 rounded-2xl liquid-glass border border-[#FF6B00] text-white text-xs flex items-center gap-2 shadow-2xl animate-modal-pop">
          <CheckCircle className="w-4 h-4 text-[#FF6B00]" />
          <span>{toast}</span>
        </div>
      )}

      {/* Main Container */}
      <div className="liquid-glass rounded-3xl p-5 sm:p-6 shadow-2xl border border-white/[0.08]">
        {/* Top Action Bar */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-amber-500/15 text-amber-400 border border-amber-500/30">
              <Boxes className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">จัดซื้อ & ควบคุมสต๊อก</h2>
              <p className="text-[11px] text-slate-400 mt-0.5">วงจรสั่งซื้อ (PO) ตั้งแต่เปิดสั่งของ รับเข้าสต๊อก จนถึงตัดสต๊อกส่งช่างเตรียม</p>
            </div>
          </div>
          <button
            type="button"
            onClick={openStockPoModal}
            className="w-full lg:w-auto px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 text-black font-extrabold text-xs transition cursor-pointer flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/25 border border-white/20 active:scale-[0.97]"
          >
            <PackagePlus className="w-4 h-4" />
            <span>+ สั่งซื้อเข้าสต๊อก (สร้างใบ Stock PO)</span>
          </button>
        </div>

        {/* Compact KPI Pills */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4">
          <div className="px-3 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-between gap-2">
            <span className="text-[10px] text-slate-400 leading-tight">พร้อมขาย<br />(in_stock)</span>
            <span className="text-base font-extrabold font-mono text-emerald-400 tabular-nums">{readyStockCount}</span>
          </div>
          <div className="px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/25 flex items-center justify-between gap-2">
            <span className="text-[10px] text-slate-400 leading-tight">ในห้องสต๊อก<br />(raw_stock)</span>
            <span className="text-base font-extrabold font-mono text-amber-400 tabular-nums">{rawStockItems.length}</span>
          </div>
          <div className="px-3 py-2 rounded-xl bg-purple-500/10 border border-purple-500/25 flex items-center justify-between gap-2">
            <span className="text-[10px] text-slate-400 leading-tight">Stock PO<br />รอของเข้า</span>
            <span className="text-base font-extrabold font-mono text-purple-400 tabular-nums">{orderedStockPOs.length}</span>
          </div>
          <div className="px-3 py-2 rounded-xl bg-teal-500/10 border border-teal-500/25 flex items-center justify-between gap-2">
            <span className="text-[10px] text-slate-400 leading-tight">รอช่างเทส<br />(Prep)</span>
            <span className="text-base font-extrabold font-mono text-teal-400 tabular-nums">{pendingPrepStockCount}</span>
          </div>
        </div>

        {/* Compact Segmented Tab Bar */}
        <div className="flex items-center gap-1.5 p-1 rounded-2xl bg-white/[0.03] border border-white/[0.06] mt-4 overflow-x-auto">
          {mainTabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = mainTab === tab.key;
            const accent = accentClasses[tab.accent];
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setMainTab(tab.key)}
                className={`flex-1 min-w-fit px-3 py-2 rounded-xl text-[11px] font-bold transition-all flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer active:scale-[0.97] ${isActive
                  ? accent.active
                  : 'text-slate-400 hover:text-white hover:bg-white/[0.05]'
                  }`}
              >
                <Icon className="w-3.5 h-3.5 flex-shrink-0" />
                <span className="hidden sm:inline">{tab.label}</span>
                <span className="sm:hidden">{tab.sub}</span>
                <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono ${isActive ? accent.badge : 'bg-white/10 text-slate-400'
                  }`}>
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>

        {/* ================= TAB 1: INCOMING ORDERS ================= */}
        {mainTab === 'incoming' && (
          <div className="space-y-3 mt-4">
            {/* Sub-tabs: 3 PO stages */}
            <div className="grid grid-cols-3 gap-1.5">
              <button
                onClick={() => setActiveTab('pending')}
                className={`px-2 py-2 rounded-xl text-[11px] font-bold transition active:scale-[0.97] border flex items-center justify-center gap-1.5 cursor-pointer ${activeTab === 'pending'
                  ? 'bg-blue-500/20 border-blue-500/50 text-white'
                  : 'bg-white/[0.02] border-white/[0.06] text-slate-400 hover:text-white'
                  }`}
              >
                <span>รายการใหม่</span>
                <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono ${newOrders.length > 0 ? 'bg-blue-500 text-black' : 'bg-white/10 text-slate-400'}`}>{newOrders.length}</span>
              </button>
              <button
                onClick={() => setActiveTab('waiting_po')}
                className={`px-2 py-2 rounded-xl text-[11px] font-bold transition active:scale-[0.97] border flex items-center justify-center gap-1.5 cursor-pointer ${activeTab === 'waiting_po'
                  ? 'bg-purple-500/20 border-purple-500/50 text-white'
                  : 'bg-white/[0.02] border-white/[0.06] text-slate-400 hover:text-white'
                  }`}
              >
                <span>รอของเข้า</span>
                <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono ${waitingPoOrders.length > 0 ? 'bg-purple-500 text-white' : 'bg-white/10 text-slate-400'}`}>{waitingPoOrders.length}</span>
              </button>
              <button
                onClick={() => setActiveTab('po_received')}
                className={`px-2 py-2 rounded-xl text-[11px] font-bold transition active:scale-[0.97] border flex items-center justify-center gap-1.5 cursor-pointer ${activeTab === 'po_received'
                  ? 'bg-teal-500/20 border-teal-500/50 text-white'
                  : 'bg-white/[0.02] border-white/[0.06] text-slate-400 hover:text-white'
                  }`}
              >
                <span>ของเข้าแล้ว</span>
                <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono ${poReceivedOrders.length > 0 ? 'bg-teal-500 text-black' : 'bg-white/10 text-slate-400'}`}>{poReceivedOrders.length}</span>
              </button>
            </div>

            {/* Search */}
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                placeholder="ค้นหาเลขบิล / ชื่อลูกค้า / เบอร์โทร..."
                value={incomingSearch}
                onChange={(e) => setIncomingSearch(e.target.value)}
                className="w-full liquid-glass-input rounded-xl pl-9 pr-3 py-2 text-xs text-white focus:outline-none"
              />
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
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2.5">
                {incomingCards.map((order) => {
                  const rMeta = order.route_code ? ROUTE_DEFINITIONS[order.route_code] : null;
                  const itemCount = (order.items_list && order.items_list.length > 0)
                    ? order.items_list.reduce((sum, it) => sum + (it.quantity || 1), 0)
                    : (order._planned_quantity || 1);
                  return (
                    <button
                      key={order.id}
                      type="button"
                      onClick={() => setActionOrder(order)}
                      className="text-left p-3.5 rounded-2xl liquid-glass-card border border-white/[0.08] hover:border-[#FF6B00]/40 transition active:scale-[0.98] cursor-pointer flex flex-col gap-2 min-h-[132px]"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="px-2 py-0.5 rounded-lg text-[11px] bg-[#FF6B00] text-black font-extrabold font-mono data-key">
                          {order.sales_ref || 'SO'}
                        </span>
                        {renderOrderStatusBadge(order.order_status)}
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-bold text-white truncate">{order.customer_name}</div>
                        <div className="text-[10px] text-slate-400 truncate">
                          {rMeta ? `${rMeta.shortName} • ${order.district || '-'}` : order.delivery_location}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap mt-auto">
                        <span className="px-2 py-0.5 rounded-md bg-white/[0.05] text-[10px] text-slate-300 font-mono">{itemCount} ชิ้น</span>
                        {order.delivery_mode === 'project' && (
                          <span className="px-2 py-0.5 rounded-md bg-purple-500/15 text-purple-700 dark:text-purple-300 border border-purple-500/30 text-[10px] font-bold">⚡ โครงการ</span>
                        )}
                        {renderStockStatusBadge(order)}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ================= TAB 2: PO TRACKING ================= */}
        {mainTab === 'po_tracking' && (
          <div className="space-y-4 mt-4">
            {/* Stock PO list */}
            <div>
              <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                <span className="text-xs font-bold text-white flex items-center gap-1.5">
                  <PackageSearch className="w-4 h-4 text-emerald-400" />
                  <span>ใบสั่งซื้อเข้าสต๊อก (Stock PO)</span>
                </span>
                <button
                  type="button"
                  onClick={openStockPoModal}
                  className="px-3 py-1.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-200 border border-emerald-500/30 text-[11px] font-bold transition cursor-pointer flex items-center gap-1 active:scale-95"
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
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2.5">
                  {stockPOs.map((po) => (
                    <button
                      key={po.id}
                      type="button"
                      onClick={() => setPoDetail(po)}
                      className="text-left p-3.5 rounded-2xl liquid-glass-card border border-white/[0.08] hover:border-purple-500/40 transition active:scale-[0.98] cursor-pointer flex flex-col gap-2 min-h-[120px]"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="px-2 py-0.5 rounded-md bg-purple-500/15 text-purple-300 border border-purple-500/30 font-mono text-[10px] font-bold truncate">
                          {po.po_number}
                        </span>
                        {po.status === 'ordered' && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-500/15 text-purple-300 border border-purple-500/30 whitespace-nowrap">รอของเข้า</span>
                        )}
                        {po.status === 'received' && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-teal-500/15 text-teal-300 border border-teal-500/30 whitespace-nowrap">รับเข้าแล้ว</span>
                        )}
                        {po.status === 'cancelled' && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-white/10 text-slate-400 whitespace-nowrap">ยกเลิก</span>
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-bold text-white truncate">{po.product_name}</div>
                        <div className="text-[10px] text-slate-400 truncate">{PRODUCT_CATEGORY_LABELS[po.category]} • {po.supplier || '-'}</div>
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap mt-auto">
                        <span className="px-2 py-0.5 rounded-md bg-[#FF6B00]/15 text-[#FF6B00] font-mono font-extrabold text-[11px] data-key">x{po.qty}</span>
                        <span className="text-[10px] text-rose-300/80 font-mono font-bold data-key">ทุน ฿{fmt(po.unit_cost)}/หน่วย</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Active POs waiting for delivery */}
            <div>
              <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
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
                    className="mb-2"
                  />
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2.5">
                    {poTrackingList.pageItems.map((order) => {
                      const rMeta = order.route_code ? ROUTE_DEFINITIONS[order.route_code] : null;
                      const supplier = supplierInputs[order.id] || order.items_list?.[0]?.supplier || 'สต๊อกร้าน (Main Store)';
                      const poNo = poInputs[order.id] || order.items_list?.[0]?.po_no || '-';
                      const itemCount = (order.items_list || []).reduce((sum, it) => sum + (it.quantity || 1), 0);
                      return (
                        <button
                          key={order.id}
                          type="button"
                          onClick={() => setActionOrder(order)}
                          className="text-left p-3.5 rounded-2xl liquid-glass-card border border-white/[0.08] hover:border-purple-500/40 transition active:scale-[0.98] cursor-pointer flex flex-col gap-2 min-h-[120px]"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="px-2 py-0.5 rounded-lg bg-[#FF6B00] text-black font-extrabold font-mono text-[10px]">{order.sales_ref || 'SO'}</span>
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-500/15 text-purple-300 border border-purple-500/30 whitespace-nowrap">รอของเข้า</span>
                          </div>
                          <div className="min-w-0">
                            <div className="text-sm font-bold text-white truncate">{order.customer_name}</div>
                            <div className="text-[10px] text-slate-400 truncate font-mono">PO: {poNo} • {supplier}</div>
                          </div>
                          <div className="flex items-center gap-1.5 flex-wrap mt-auto">
                            <span className="px-2 py-0.5 rounded-md bg-white/[0.05] text-[10px] text-slate-300 font-mono">{itemCount} ชิ้น</span>
                            {rMeta && <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${rMeta.badgeBg} ${rMeta.badgeBorder} ${rMeta.badgeText}`}>{rMeta.shortName}</span>}
                          </div>
                        </button>
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
          <div className="space-y-4 mt-4">
            {/* Storage Room batches with 7-day DOA countdown */}
            <div>
              <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                <span className="text-xs font-bold text-white flex items-center gap-1.5">
                  <Warehouse className="w-4 h-4 text-amber-400" />
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse shrink-0" aria-hidden="true" />
                  <span>ห้องสต๊อก - ของรับเข้าแล้ว ยังไม่เตรียม (DOA 7 วัน)</span>
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
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2.5">
                  {rawStockBatches.map((batch) => {
                    const daysLeft = getDoaDaysLeft(batch.received_at);
                    const expired = daysLeft === 0;
                    const batchCount = batch.itemIds.length;
                    return (
                      <button
                        key={batch.key}
                        type="button"
                        onClick={() => setBatchDetail(batch)}
                        className="text-left p-3.5 rounded-2xl liquid-glass-card border border-white/[0.08] hover:border-amber-500/40 transition active:scale-[0.98] cursor-pointer flex flex-col gap-2 min-h-[120px]"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="text-sm font-bold text-white truncate">{batch.model_name}</div>
                            <div className="text-[10px] text-slate-400 font-mono truncate data-meta">PO: {batch.po_no} • {batch.supplier}</div>
                          </div>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap flex items-center gap-1 ${expired
                            ? 'bg-rose-500/15 text-rose-300 border border-rose-500/30'
                            : daysLeft <= 2
                              ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                              : 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                            }`}>
                            <Timer className="w-3 h-3" />
                            {expired ? 'ครบ 7 วัน' : `เหลือ ${daysLeft} วัน`}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 flex-wrap mt-auto">
                          <span className="px-2 py-0.5 rounded-md text-[11px] font-extrabold bg-[#FF6B00]/15 text-[#FF6B00] border border-[#FF6B00]/30 whitespace-nowrap data-key">
                            {batchCount} เครื่อง
                          </span>
                          <span className="text-[10px] text-slate-500 data-meta">
                            รับเข้า: {batch.received_at ? new Date(batch.received_at).toLocaleDateString('th-TH') : '-'}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Inventory list */}
            <div>
              <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
                <span className="text-xs font-bold text-white flex items-center gap-1.5">
                  <Boxes className="w-4 h-4 text-emerald-400" />
                  <span>สินค้าคงเหลือพร้อมใช้ (Inventory)</span>
                </span>
                <span className="text-[11px] text-slate-400">
                  {filteredInventoryGroups.length} รุ่น • รวม {filteredInventoryGroups.reduce((sum, g) => sum + g.qty, 0)} เครื่อง
                </span>
              </div>

              {/* Search */}
              <div className="relative mb-2">
                <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="ค้นหารุ่นสินค้า..."
                  value={inventorySearch}
                  onChange={(e) => setInventorySearch(e.target.value)}
                  className="w-full liquid-glass-input rounded-xl pl-9 pr-3 py-2 text-xs text-white focus:outline-none"
                />
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
                      className={`px-3 py-1.5 rounded-full text-[11px] font-bold whitespace-nowrap transition border cursor-pointer flex items-center gap-1.5 active:scale-95 ${isActive
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
                    className="mb-2"
                  />
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2.5">
                    {inventoryCards.map(g => (
                      <button
                        key={g.key}
                        type="button"
                        onClick={() => setInventoryDetail(g)}
                        className="text-left p-3.5 rounded-2xl liquid-glass-card border border-white/[0.08] hover:border-emerald-500/40 transition active:scale-[0.98] cursor-pointer flex items-center justify-between gap-3 min-h-[96px]"
                      >
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="text-sm font-bold text-white truncate">{g.model_name}</div>
                          <span className="inline-block px-2 py-0.5 rounded-md text-[10px] font-bold bg-blue-500/15 text-blue-300 border border-blue-500/30 whitespace-nowrap">
                            {PRODUCT_CATEGORY_LABELS[g.category]}
                          </span>
                          <div className="text-[10px] text-slate-400 flex items-center gap-1.5 flex-wrap">
                            <span className="text-amber-300">สต๊อก {g.rawCount}</span>
                            <span className="text-slate-600">/</span>
                            <span className="text-emerald-300">พร้อม {g.readyCount}</span>
                          </div>
                        </div>
                        <div className="flex-shrink-0 text-right">
                          <div className="px-3 py-1.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30">
                            <span className="text-lg font-extrabold font-mono text-emerald-300 leading-none tabular-nums">{g.qty}</span>
                            <span className="text-[10px] text-emerald-400/80 ml-1">เครื่อง</span>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* STOCK ACTION MODAL (ออเดอร์รอดำเนินการ - เปรียบเทียบสต๊อก & ปุ่มดำเนินการ)   */}
      {/* ========================================================================= */}
      {actionOrder && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center sm:p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-800 shadow-2xl rounded-t-3xl sm:rounded-3xl w-full sm:w-[92vw] max-w-3xl max-h-[92dvh] sm:max-h-[90vh] flex flex-col overflow-hidden pb-[env(safe-area-inset-bottom)] animate-modal-pop">
            <div className="sm:hidden flex justify-center pt-2.5 pb-1 flex-shrink-0">
              <span className="h-1.5 w-10 rounded-full bg-slate-300 dark:bg-white/20" />
            </div>
            <div className="p-4 sm:p-5 bg-slate-50/90 dark:bg-slate-900/95 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 flex-shrink-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="p-2.5 rounded-2xl bg-[#FF6B00]/15 text-[#E65A00] dark:text-[#FF6B00] border border-[#FF6B00]/30">
                  <ClipboardList className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white leading-tight truncate">
                    {actionOrder.sales_ref || 'SO'} • {actionOrder.customer_name}
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{actionOrder.delivery_location}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActionOrder(null)}
                className="p-2.5 rounded-xl text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white bg-slate-100 dark:bg-white/[0.04] hover:bg-slate-200 dark:hover:bg-white/[0.08] transition min-w-[44px] min-h-[44px] flex items-center justify-center flex-shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 text-xs">
              {/* Order meta */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700">
                  <div className="text-[10px] text-slate-500 dark:text-slate-400">วันที่ส่งมอบ</div>
                  <div className="font-mono text-amber-700 dark:text-amber-300 font-semibold">
                    {actionOrder.delivery_date ? new Date(actionOrder.delivery_date).toLocaleDateString('th-TH') : '-'}
                  </div>
                </div>
                <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700">
                  <div className="text-[10px] text-slate-500 dark:text-slate-400">การส่งมอบ</div>
                  <div className="font-semibold text-emerald-700 dark:text-emerald-400">
                    {actionOrder.delivery_mode === 'install' && 'ส่งพร้อมติดตั้ง'}
                    {actionOrder.delivery_mode === 'drop_off' && 'ส่งไม่ต้องติดตั้ง'}
                    {actionOrder.delivery_mode === 'customer_pickup' && 'ลูกค้ารับเองหน้าร้าน'}
                    {actionOrder.delivery_mode === 'project' && 'งานโครงการ / รับเหมา'}
                    {!actionOrder.delivery_mode && 'ส่งพร้อมติดตั้ง'}
                  </div>
                </div>
                <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700">
                  <div className="text-[10px] text-slate-500 dark:text-slate-400">เซลล์ผู้ขาย</div>
                  <div className="font-semibold text-slate-900 dark:text-white truncate">{actionOrder.salesperson || '-'}</div>
                </div>
                {actionOrder.site_notes && (
                  <div className="sm:col-span-3 p-2.5 rounded-xl bg-amber-50 dark:bg-white/[0.02] border border-amber-200 dark:border-white/[0.05] text-[11px]">
                    <span className="text-slate-600 dark:text-slate-400">หมายเหตุหน้างาน: </span>
                    <span className="text-amber-900 dark:text-amber-200">{actionOrder.site_notes}</span>
                  </div>
                )}
              </div>

              {/* Item-by-item stock comparison */}
              <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 overflow-hidden">
                <div className="p-3 border-b border-slate-200 dark:border-slate-700 flex items-center gap-2 text-[11px] font-bold text-slate-700 dark:text-slate-300">
                  <Boxes className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  <span>เปรียบเทียบสต๊อกกับรายการในบิล</span>
                </div>
                <div className="p-3 space-y-2">
                  {(actionOrder.items_list && actionOrder.items_list.length > 0
                    ? actionOrder.items_list
                    : [{ model_name: actionOrder._planned_model || 'BossComputech Workstation', quantity: actionOrder._planned_quantity || 1, item_type: 'hardware' as const }]
                  ).map((it, idx) => {
                    const available = getAvailableStock(it.model_name);
                    const ordered = it.quantity || 1;
                    const shortage = Math.max(0, ordered - available);
                    const sufficient = available >= ordered;
                    const matchingStock = items.filter(s => s.status === 'in_stock' && s.model_name === it.model_name);
                    const pickedStockId = stockPickInputs[`${actionOrder.id}:${idx}`] || '';
                    return (
                      <div key={idx} className="p-2.5 rounded-xl bg-white dark:bg-white/[0.02] border border-slate-200 dark:border-white/[0.05] space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 min-w-0">
                            {it.item_type === 'service' ? (
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-purple-100 text-purple-900 border border-purple-300 dark:bg-purple-500/20 dark:text-purple-300 dark:border-purple-500/30">บริการ</span>
                            ) : (
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-blue-100 text-blue-900 border border-blue-300 dark:bg-blue-500/20 dark:text-blue-300 dark:border-blue-500/30">อุปกรณ์</span>
                            )}
                            <span className="text-slate-900 dark:text-white font-bold truncate">{it.model_name}</span>
                          </div>
                          <span className="px-2 py-0.5 rounded-md bg-[#FF6B00]/15 text-[#C2410C] dark:text-[#FF6B00] font-mono font-extrabold text-[11px] whitespace-nowrap">x{ordered}</span>
                        </div>
                        {it.item_type !== 'service' && (
                          <div className="flex items-center gap-2 flex-wrap">
                            {sufficient ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-900 border border-emerald-300 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30">
                                <CheckCircle className="w-3 h-3" /> มีของ {available} ชิ้น
                              </span>
                            ) : (
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${available === 0
                                ? 'bg-rose-100 text-rose-900 border-rose-300 dark:bg-rose-500/15 dark:text-rose-300 dark:border-rose-500/30'
                                : 'bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30'
                                }`}>
                                <AlertTriangle className="w-3 h-3" /> ขาดอีก {shortage} ชิ้น
                              </span>
                            )}
                          </div>
                        )}
                        {matchingStock.length > 0 && (
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-emerald-700 dark:text-emerald-300 whitespace-nowrap flex items-center gap-1">
                              <Boxes className="w-3 h-3" /> คลัง {matchingStock.length}:
                            </span>
                            <select
                              value={pickedStockId}
                              onChange={(e) => setStockPickInputs({ ...stockPickInputs, [`${actionOrder.id}:${idx}`]: e.target.value })}
                              className="flex-1 rounded-lg px-2 py-1 text-[11px] bg-white dark:bg-slate-800 text-emerald-800 dark:text-emerald-200 border border-slate-300 dark:border-slate-700 font-mono focus:outline-none focus:border-blue-500"
                            >
                              <option value="" className="bg-white dark:bg-[#12141A]">— สั่งใหม่ / ไม่ดึงจากคลัง —</option>
                              {matchingStock.map((s) => (
                                <option key={s.id} value={s.id} className="bg-white dark:bg-[#12141A]">
                                  {s.serial_number || '(ไม่มี S/N)'} • {s.notes || 'พร้อมขาย'}
                                </option>
                              ))}
                            </select>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Cost Price (INTERNAL ONLY) */}
              <div className="p-3 rounded-2xl bg-rose-50 border border-rose-200 dark:bg-rose-500/[0.04] dark:border-rose-500/20 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-bold text-rose-800 dark:text-rose-300 flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5" />
                    <span>ราคาทุน & ต้นทุน (ภายใน)</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => handleSaveCosts(actionOrder.id, actionOrder.sales_ref)}
                    className="px-3 py-1.5 rounded-xl bg-rose-100 hover:bg-rose-200 text-rose-900 border border-rose-300 dark:bg-rose-500/20 dark:hover:bg-rose-500/30 dark:text-rose-200 dark:border-rose-500/30 text-[11px] font-semibold transition cursor-pointer flex items-center gap-1 active:scale-95"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>บันทึก</span>
                  </button>
                </div>
                <div className="space-y-1.5">
                  {(actionOrder.items_list && actionOrder.items_list.length > 0
                    ? actionOrder.items_list
                    : [{ model_name: actionOrder._planned_model || 'BossComputech Workstation', quantity: actionOrder._planned_quantity || 1 }]
                  ).map((it, idx) => (
                    <div key={idx} className="grid grid-cols-[1fr_auto] gap-2 items-center">
                      <div className="text-[11px] text-slate-700 dark:text-slate-300 truncate">
                        <span className="text-slate-500 font-mono mr-1">{idx + 1}.</span>
                        {it.model_name} <span className="text-slate-500">(x{it.quantity})</span>
                      </div>
                      <input
                        type="number"
                        min={0}
                        placeholder="ราคาทุน/หน่วย"
                        value={getItemCost(actionOrder.id, idx, it.unit_cost) || ''}
                        onChange={(e) => setCostInputs({ ...costInputs, [`${actionOrder.id}:${idx}`]: parseFloat(e.target.value) || 0 })}
                        className="w-28 rounded-lg px-2 py-1 text-xs bg-white dark:bg-slate-800 text-rose-700 dark:text-rose-300 border border-slate-300 dark:border-slate-700 placeholder-slate-400 font-mono font-bold focus:outline-none focus:border-blue-500"
                      />
                    </div>
                  ))}
                </div>
                <div className="flex items-center justify-between gap-2 pt-2 border-t border-rose-200 dark:border-rose-500/15">
                  <label className="text-[11px] text-slate-700 dark:text-slate-300">ต้นทุนค่าแรง/อื่นๆ (Extra Job Cost)</label>
                  <input
                    type="number"
                    min={0}
                    placeholder="0"
                    value={getExtraCost(actionOrder.id, actionOrder.extra_cost) || ''}
                    onChange={(e) => setExtraCostInputs({ ...extraCostInputs, [actionOrder.id]: parseFloat(e.target.value) || 0 })}
                    className="w-32 rounded-lg px-2 py-1 text-xs bg-white dark:bg-slate-800 text-rose-700 dark:text-rose-300 border border-slate-300 dark:border-slate-700 placeholder-slate-400 font-mono font-bold focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              {/* Fast-Track Allocation from Ready Stock */}
              {(() => {
                const orderModelNames = new Set(
                  (actionOrder.items_list && actionOrder.items_list.length > 0
                    ? actionOrder.items_list.filter(it => it.item_type !== 'service').map(it => it.model_name)
                    : [actionOrder._planned_model || 'BossComputech Workstation'])
                );
                const readyUnits = items.filter(
                  s => (s.status === 'in_stock' || s.status === 'raw_stock') && orderModelNames.has(s.model_name)
                );
                if (readyUnits.length === 0) return null;
                const picked = allocateInputs[actionOrder.id] || [];
                return (
                  <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-200 dark:bg-emerald-500/[0.05] dark:border-emerald-500/25 space-y-2">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <span className="text-[11px] font-bold text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5">
                        <Zap className="w-3.5 h-3.5" />
                        <span>จัดสรรสต๊อก - มีในคลัง {readyUnits.length} เครื่อง</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => handleAllocateStock(actionOrder.id, actionOrder.sales_ref)}
                        disabled={picked.length === 0}
                        className={`px-3 py-1.5 rounded-xl text-[11px] font-extrabold transition flex items-center gap-1 ${picked.length > 0
                          ? 'bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 text-black cursor-pointer active:scale-95'
                          : 'bg-slate-200 dark:bg-white/10 text-slate-500 cursor-not-allowed'
                          }`}
                      >
                        <Zap className="w-3.5 h-3.5" />
                        <span>Allocate {picked.length > 0 ? `(${picked.length})` : ''}</span>
                      </button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                      {readyUnits.map((s) => {
                        const isPicked = picked.includes(s.id);
                        return (
                          <button
                            key={s.id}
                            type="button"
                            onClick={() => toggleAllocatePick(actionOrder.id, s.id)}
                            className={`text-left px-2.5 py-1.5 rounded-lg border transition cursor-pointer flex items-center justify-between gap-2 ${isPicked
                              ? 'bg-emerald-100 border-emerald-400 text-emerald-900 dark:bg-emerald-500/20 dark:border-emerald-500/50 dark:text-emerald-200'
                              : 'bg-white dark:bg-white/[0.02] border-slate-200 dark:border-white/[0.08] text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/[0.05]'
                              }`}
                          >
                            <span className="font-mono text-[11px] font-bold truncate">
                              {s.serial_number || (s.status === 'raw_stock' ? 'ยังไม่เตรียม' : '(ไม่มี S/N)')}
                            </span>
                            <span className="text-[10px] text-slate-500 dark:text-slate-400 truncate">{s.status === 'raw_stock' ? 'raw_stock' : 'พร้อมขาย'}</span>
                            {isPicked && <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

              {/* Supplier & PO & Prep Notes */}
              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[10px] text-slate-600 dark:text-slate-400 mb-1">Supplier</label>
                  <select
                    value={supplierInputs[actionOrder.id] || actionOrder.items_list?.[0]?.supplier || 'สต๊อกร้าน (Main Store)'}
                    onChange={(e) => setSupplierInputs({ ...supplierInputs, [actionOrder.id]: e.target.value })}
                    className="w-full rounded-xl px-2.5 py-1.5 text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-300 dark:border-slate-700 focus:outline-none focus:border-blue-500"
                  >
                    {SUPPLIER_PRESETS.map((s) => (
                      <option key={s} value={s} className="bg-white dark:bg-[#12141A]">{s}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] text-slate-600 dark:text-slate-400 mb-1">เลขที่ PO</label>
                  <input
                    type="text"
                    placeholder="เช่น PKT/2569-083"
                    value={poInputs[actionOrder.id] || actionOrder.items_list?.[0]?.po_no || ''}
                    onChange={(e) => setPoInputs({ ...poInputs, [actionOrder.id]: e.target.value })}
                    className="w-full rounded-xl px-2.5 py-1.5 text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-300 dark:border-slate-700 placeholder-slate-400 font-mono focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-slate-600 dark:text-slate-400 mb-1">เลขที่บิล (INV)</label>
                  <input
                    type="text"
                    value={billInputs[actionOrder.id] || ''}
                    onChange={(e) => setBillInputs({ ...billInputs, [actionOrder.id]: e.target.value })}
                    className="w-full rounded-xl px-2.5 py-1.5 text-xs bg-white dark:bg-slate-800 text-[#C2410C] dark:text-[#FF6B00] border border-slate-300 dark:border-slate-700 font-mono font-bold focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-slate-600 dark:text-slate-400 mb-1">Prep Note</label>
                  <input
                    type="text"
                    placeholder="เช่น ประกอบด่วน"
                    value={prepNoteInputs[actionOrder.id] || ''}
                    onChange={(e) => setPrepNoteInputs({ ...prepNoteInputs, [actionOrder.id]: e.target.value })}
                    className="w-full rounded-xl px-2.5 py-1.5 text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-300 dark:border-slate-700 placeholder-slate-400 focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>
            </div>

            {/* Footer: strictly enforce stock sufficiency & PO receipt before sending to Prep Tech */}
            <div className="p-3 sm:p-4 bg-slate-50/90 dark:bg-slate-900/95 border-t border-slate-200 dark:border-slate-800 flex-shrink-0 space-y-2.5">
              {(() => {
                const readiness = getOrderPrepReadiness(actionOrder);
                const { stockStatus, pendingLinkedStockPOs, canSendToPrep } = readiness;

                if (actionOrder.order_status === 'waiting_po') {
                  return (
                    <>
                      <div className="px-3 py-2 rounded-xl bg-amber-500/15 border border-amber-500/40 text-amber-800 dark:text-amber-200 text-xs font-bold flex items-center gap-2">
                        <Clock className="w-4 h-4 flex-shrink-0" />
                        <span>รอสั่ง PO / รอรับของเข้าคลังก่อนจึงจะส่งช่างเตรียมได้</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => { handleReceivePO(actionOrder.id, actionOrder.sales_ref); setActionOrder(null); }}
                        className="w-full px-5 py-3 bg-gradient-to-r from-teal-500 to-emerald-600 hover:from-teal-400 text-black font-extrabold rounded-xl text-xs transition cursor-pointer flex items-center justify-center gap-1.5 shadow-lg shadow-teal-500/25 border border-white/20 active:scale-95"
                      >
                        <ShieldCheck className="w-4 h-4" />
                        <span>รับของ PO เข้าสต๊อกแล้ว</span>
                      </button>
                    </>
                  );
                }

                if (!canSendToPrep) {
                  return (
                    <>
                      <div className="px-3 py-2.5 rounded-xl bg-amber-500/15 border border-amber-500/40 text-amber-800 dark:text-amber-200 text-xs font-bold space-y-1">
                        <div className="flex items-center gap-2">
                          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                          <span>รอสั่ง PO / รอรับของเข้าคลังก่อนจึงจะส่งช่างเตรียมได้</span>
                        </div>
                        {pendingLinkedStockPOs.length > 0 && (
                          <div className="text-[11px] font-medium pl-6 opacity-90">
                            มี Stock PO ค้างรับเข้าคลัง: {pendingLinkedStockPOs.map(p => `${p.po_number} (${p.product_name} x${p.qty})`).join(', ')}
                          </div>
                        )}
                      </div>
                      {actionOrder.order_status === 'pending_purchasing' && !stockStatus.allSufficient && pendingLinkedStockPOs.length === 0 ? (
                        <button
                          type="button"
                          onClick={() => { handleOrderPO(actionOrder.id, actionOrder.sales_ref); setActionOrder(null); }}
                          className="w-full px-5 py-3 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 text-black font-extrabold rounded-xl text-xs transition cursor-pointer flex items-center justify-center gap-1.5 shadow-lg shadow-amber-500/25 border border-white/20 active:scale-95"
                        >
                          <ShoppingCart className="w-4 h-4" />
                          <span>สร้าง PO สั่งซื้อตามออเดอร์ (ขาด {stockStatus.totalShortage} ชิ้น)</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => { setActionOrder(null); setMainTab('po_tracking'); }}
                          className="w-full px-5 py-2.5 rounded-xl bg-purple-500/20 hover:bg-purple-500/30 text-purple-700 dark:text-purple-200 border border-purple-500/40 font-bold text-xs transition cursor-pointer flex items-center justify-center gap-1.5 active:scale-[0.98]"
                        >
                          <Truck className="w-4 h-4" />
                          <span>ไปที่หน้า รอรับของ PO เพื่อกดรับของเข้าคลัง</span>
                        </button>
                      )}
                    </>
                  );
                }

                // Ready: stock sufficient AND all linked POs received into stock
                return (
                  <button
                    type="button"
                    onClick={() => { handleCutStockAndSendPrep(actionOrder.id); setActionOrder(null); }}
                    className={`w-full px-5 py-3 font-extrabold rounded-xl text-xs transition cursor-pointer flex items-center justify-center gap-1.5 shadow-lg border border-white/20 active:scale-95 ${actionOrder.order_status === 'po_received_in_stock'
                      ? 'bg-gradient-to-r from-[#FF6B00] to-[#E65A00] hover:from-[#FF8A24] text-black shadow-[#FF6B00]/25'
                      : 'bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 text-black shadow-emerald-500/25'
                      }`}
                  >
                    {actionOrder.order_status === 'po_received_in_stock' ? <Send className="w-4 h-4" /> : <PackagePlus className="w-4 h-4" />}
                    <span>{actionOrder.order_status === 'po_received_in_stock' ? 'ปล่อยของ & ตัดสต๊อกส่งช่างเตรียม' : 'ตัดสต๊อก & ส่งช่างเตรียม'}</span>
                  </button>
                );
              })()}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ===== BATCH DETAIL MODAL ===== */}
      {batchDetail && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-sm animate-fade-in" onClick={() => setBatchDetail(null)}>
          <div className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-800 shadow-2xl rounded-3xl w-full max-w-lg max-h-[90vh] overflow-y-auto animate-modal-pop" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 z-10 flex items-start justify-between gap-3 p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-900/95 backdrop-blur-xl rounded-t-3xl">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-teal-100 text-teal-900 border border-teal-300 dark:bg-teal-500/15 dark:text-teal-300 dark:border-teal-500/25 tabular-nums">{batchDetail.po_no || 'PO'}</span>
                  {(() => {
                    const daysLeft = getDoaDaysLeft(batchDetail.received_at);
                    const expired = daysLeft <= 0;
                    return (
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border tabular-nums ${expired ? 'bg-rose-100 text-rose-900 border-rose-300 dark:bg-rose-500/15 dark:text-rose-300 dark:border-rose-500/25' : daysLeft <= 2 ? 'bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/25' : 'bg-emerald-100 text-emerald-900 border-emerald-300 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/25'}`}>
                        DOA {expired ? 'หมดอายุ' : `เหลือ ${daysLeft} วัน`}
                      </span>
                    );
                  })()}
                </div>
                <h3 className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-white mt-1.5 truncate">{batchDetail.model_name}</h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">Supplier: {batchDetail.supplier || '-'} · รับเข้า {formatThaiDateTime(batchDetail.received_at)}</p>
              </div>
              <button type="button" onClick={() => setBatchDetail(null)} className="shrink-0 p-2 rounded-xl bg-slate-100 dark:bg-white/[0.04] hover:bg-slate-200 dark:hover:bg-white/[0.08] text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition cursor-pointer active:scale-95">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 sm:p-5 space-y-4">
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 p-2.5 text-center">
                  <p className="text-[10px] text-slate-500 dark:text-slate-400">คงเหลือ</p>
                  <p className="text-lg font-extrabold text-slate-900 dark:text-white tabular-nums">{fmt(batchDetail.itemIds.length)}</p>
                </div>
                <div className="rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 p-2.5 text-center">
                  <p className="text-[10px] text-slate-500 dark:text-slate-400">มี S/N</p>
                  <p className="text-lg font-extrabold text-teal-700 dark:text-teal-300 tabular-nums">{batchDetail.serials.length}</p>
                </div>
                <div className="rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 p-2.5 text-center">
                  <p className="text-[10px] text-slate-500 dark:text-slate-400">DOA</p>
                  <p className="text-lg font-extrabold text-amber-700 dark:text-amber-300 tabular-nums">{getDoaDaysLeft(batchDetail.received_at)} วัน</p>
                </div>
              </div>

              {batchDetail.serials.length > 0 && (
                <div>
                  <p className="text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center gap-1"><Hash className="w-3 h-3" /> Serial Numbers</p>
                  <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
                    {batchDetail.serials.map((sn, i) => (
                      <span key={i} className="text-[10px] font-mono px-2 py-1 rounded-md bg-slate-100 dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.06] text-slate-700 dark:text-slate-300">{sn}</span>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1.5">จำนวนที่ส่งช่างเทส & ติดโลโก้</label>
                <input
                  type="number"
                  min={1}
                  max={batchDetail.itemIds.length}
                  value={batchSendQty[batchDetail.key] ?? batchDetail.itemIds.length}
                  onChange={(e) => setBatchSendQty(prev => ({ ...prev, [batchDetail.key]: Math.max(1, Math.min(batchDetail.itemIds.length, Number(e.target.value) || 1)) }))}
                  className="w-full px-3 py-2 rounded-xl text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-300 dark:border-slate-700 focus:outline-none focus:border-blue-500 tabular-nums"
                />
              </div>

              <div className="flex flex-col gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => { handleSendBatchToPrep(batchDetail.key, batchDetail.model_name, batchDetail.itemIds, batchSendQty[batchDetail.key] ?? batchDetail.itemIds.length); setBatchDetail(null); }}
                  className="w-full px-5 py-3 bg-gradient-to-r from-[#FF6B00] to-[#E65A00] hover:from-[#FF8A24] text-black font-extrabold rounded-xl text-xs transition cursor-pointer flex items-center justify-center gap-1.5 shadow-lg shadow-[#FF6B00]/25 border border-white/20 active:scale-95"
                >
                  <Send className="w-4 h-4" />
                  <span>ส่งช่างเทส & ติดโลโก้ล่วงหน้า</span>
                </button>
                <button
                  type="button"
                  onClick={() => { handleReceiveStockPo(batchDetail.key, batchDetail.model_name, batchDetail.itemIds.length); setBatchDetail(null); }}
                  className="w-full px-5 py-3 bg-slate-100 dark:bg-white/[0.04] hover:bg-slate-200 dark:hover:bg-white/[0.08] text-slate-700 dark:text-slate-200 font-bold rounded-xl text-xs transition cursor-pointer flex items-center justify-center gap-1.5 border border-slate-300 dark:border-slate-700 active:scale-95"
                >
                  <ShieldCheck className="w-4 h-4" />
                  <span>ยืนยันรับของเข้าห้องสต๊อก</span>
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ===== INVENTORY DETAIL MODAL ===== */}
      {inventoryDetail && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-sm animate-fade-in" onClick={() => setInventoryDetail(null)}>
          <div className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-800 shadow-2xl rounded-3xl w-full max-w-lg max-h-[90vh] overflow-y-auto animate-modal-pop" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 z-10 flex items-start justify-between gap-3 p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-900/95 backdrop-blur-xl rounded-t-3xl">
              <div className="min-w-0">
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-indigo-100 text-indigo-900 border border-indigo-300 dark:bg-indigo-500/15 dark:text-indigo-300 dark:border-indigo-500/25">{PRODUCT_CATEGORY_LABELS[inventoryDetail.category as ProductCategory] || inventoryDetail.category}</span>
                <h3 className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-white mt-1.5 truncate">{inventoryDetail.model_name}</h3>
              </div>
              <button type="button" onClick={() => setInventoryDetail(null)} className="shrink-0 p-2 rounded-xl bg-slate-100 dark:bg-white/[0.04] hover:bg-slate-200 dark:hover:bg-white/[0.08] text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition cursor-pointer active:scale-95">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 sm:p-5 space-y-4">
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 p-2.5 text-center">
                  <p className="text-[10px] text-slate-500 dark:text-slate-400">พร้อมขาย</p>
                  <p className="text-lg font-extrabold text-emerald-700 dark:text-emerald-300 tabular-nums">{fmt(inventoryDetail.readyCount)}</p>
                </div>
                <div className="rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 p-2.5 text-center">
                  <p className="text-[10px] text-slate-500 dark:text-slate-400">ห้องสต๊อก</p>
                  <p className="text-lg font-extrabold text-amber-700 dark:text-amber-300 tabular-nums">{fmt(inventoryDetail.rawCount)}</p>
                </div>
                <div className="rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 p-2.5 text-center">
                  <p className="text-[10px] text-slate-500 dark:text-slate-400">รวม</p>
                  <p className="text-lg font-extrabold text-slate-900 dark:text-white tabular-nums">{fmt(inventoryDetail.qty)}</p>
                </div>
              </div>

              {inventoryDetail.serials.length > 0 && (
                <div>
                  <p className="text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center gap-1"><Hash className="w-3 h-3" /> Serial Numbers ({inventoryDetail.serials.length})</p>
                  <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto">
                    {inventoryDetail.serials.map((sn, i) => (
                      <span key={i} className="text-[10px] font-mono px-2 py-1 rounded-md bg-slate-100 dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.06] text-slate-700 dark:text-slate-300">{sn}</span>
                    ))}
                  </div>
                </div>
              )}

              <button
                type="button"
                onClick={() => setInventoryDetail(null)}
                className="w-full px-5 py-2.5 bg-slate-100 dark:bg-white/[0.04] hover:bg-slate-200 dark:hover:bg-white/[0.08] text-slate-700 dark:text-slate-200 font-bold rounded-xl text-xs transition cursor-pointer border border-slate-300 dark:border-slate-700 active:scale-95"
              >
                ปิด
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ===== PO DETAIL MODAL ===== */}
      {poDetail && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-sm animate-fade-in" onClick={() => setPoDetail(null)}>
          <div className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-800 shadow-2xl rounded-3xl w-full max-w-lg max-h-[90vh] overflow-y-auto animate-modal-pop" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 z-10 flex items-start justify-between gap-3 p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-900/95 backdrop-blur-xl rounded-t-3xl">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-purple-100 text-purple-900 border border-purple-300 dark:bg-purple-500/15 dark:text-purple-300 dark:border-purple-500/25 font-mono">{poDetail.po_number}</span>
                  {poDetail.status === 'ordered' && <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-purple-100 text-purple-900 border border-purple-300 dark:bg-purple-500/15 dark:text-purple-300 dark:border-purple-500/25">รอของเข้า</span>}
                  {poDetail.status === 'received' && <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-teal-100 text-teal-900 border border-teal-300 dark:bg-teal-500/15 dark:text-teal-300 dark:border-teal-500/25">รับเข้าแล้ว</span>}
                  {poDetail.status === 'cancelled' && <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-200 text-slate-700 border border-slate-300 dark:bg-white/10 dark:text-slate-400 dark:border-white/10">ยกเลิก</span>}
                </div>
                <h3 className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-white mt-1.5 truncate">{poDetail.product_name}</h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{PRODUCT_CATEGORY_LABELS[poDetail.category]} · {poDetail.supplier || '-'}</p>
              </div>
              <button type="button" onClick={() => setPoDetail(null)} className="shrink-0 p-2 rounded-xl bg-slate-100 dark:bg-white/[0.04] hover:bg-slate-200 dark:hover:bg-white/[0.08] text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition cursor-pointer active:scale-95">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 sm:p-5 space-y-4">
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 p-2.5 text-center">
                  <p className="text-[10px] text-slate-500 dark:text-slate-400">จำนวน</p>
                  <p className="text-lg font-extrabold text-slate-900 dark:text-white tabular-nums">{fmt(poDetail.qty)}</p>
                </div>
                <div className="rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 p-2.5 text-center">
                  <p className="text-[10px] text-slate-500 dark:text-slate-400">ทุน/หน่วย</p>
                  <p className="text-lg font-extrabold text-rose-700 dark:text-rose-300 tabular-nums">฿{fmt(poDetail.unit_cost)}</p>
                </div>
                <div className="rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 p-2.5 text-center">
                  <p className="text-[10px] text-slate-500 dark:text-slate-400">รวม</p>
                  <p className="text-lg font-extrabold text-[#C2410C] dark:text-[#FF6B00] tabular-nums">฿{fmt(poDetail.qty * poDetail.unit_cost)}</p>
                </div>
              </div>

              <div className="text-[11px] text-slate-500 dark:text-slate-400 space-y-1">
                <p>สร้างเมื่อ: {formatThaiDateTime(poDetail.created_at)}</p>
                {poDetail.received_at && <p>รับเข้าเมื่อ: {formatThaiDateTime(poDetail.received_at)}</p>}
                {poDetail.notes && <p className="text-slate-700 dark:text-slate-300">หมายเหตุ: {poDetail.notes}</p>}
              </div>

              {poDetail.activity_logs && poDetail.activity_logs.length > 0 && (
                <details className="rounded-2xl bg-slate-50 dark:bg-white/[0.02] border border-slate-200 dark:border-white/[0.08] overflow-hidden">
                  <summary className="px-3 py-2 text-[11px] font-bold text-slate-700 dark:text-slate-300 cursor-pointer flex items-center gap-1.5">
                    <History className="w-3.5 h-3.5" /> ประวัติ ({poDetail.activity_logs.length})
                  </summary>
                  <div className="p-3 border-t border-slate-200 dark:border-white/[0.06]">
                    <ActivityTimeline logs={poDetail.activity_logs} />
                  </div>
                </details>
              )}

              <div className="flex flex-col gap-2 pt-1">
                {poDetail.status === 'ordered' && (
                  <button
                    type="button"
                    onClick={() => { handleReceiveStockPo(poDetail.id, poDetail.product_name, poDetail.qty); setPoDetail(null); }}
                    className="w-full px-5 py-3 bg-gradient-to-r from-teal-500 to-emerald-600 hover:from-teal-400 text-black font-extrabold rounded-xl text-xs transition cursor-pointer flex items-center justify-center gap-1.5 shadow-lg shadow-teal-500/25 border border-white/20 active:scale-95"
                  >
                    <ShieldCheck className="w-4 h-4" />
                    <span>ยืนยันรับของเข้า (เข้าห้องสต๊อก)</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setPoDetail(null)}
                  className="w-full px-5 py-2.5 bg-slate-100 dark:bg-white/[0.04] hover:bg-slate-200 dark:hover:bg-white/[0.08] text-slate-700 dark:text-slate-200 font-bold rounded-xl text-xs transition cursor-pointer border border-slate-300 dark:border-slate-700 active:scale-95"
                >
                  ปิด
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ===== STOCK PO MODAL ===== */}
      {isStockPoModalOpen && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-sm animate-fade-in" onClick={() => setIsStockPoModalOpen(false)}>
          <div className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-800 shadow-2xl rounded-3xl w-full max-w-2xl max-h-[90vh] overflow-y-auto animate-modal-pop" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 z-10 flex items-start justify-between gap-3 p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-900/95 backdrop-blur-xl rounded-t-3xl">
              <div>
                <h3 className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-white flex items-center gap-2"><ShoppingCart className="w-4 h-4 text-[#FF6B00]" /> สร้างใบ Stock PO</h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">สั่งซื้อเข้าสต๊อกล่วงหน้า (Proactive Replenishment)</p>
              </div>
              <button type="button" onClick={() => setIsStockPoModalOpen(false)} className="shrink-0 p-2 rounded-xl bg-slate-100 dark:bg-white/[0.04] hover:bg-slate-200 dark:hover:bg-white/[0.08] text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition cursor-pointer active:scale-95">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmitStockPo} className="p-4 sm:p-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1.5">Supplier</label>
                  <select
                    value={stockPoMeta.supplier}
                    onChange={(e) => setStockPoMeta(prev => ({ ...prev, supplier: e.target.value }))}
                    className="w-full px-3 py-2 rounded-xl text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-300 dark:border-slate-700 focus:outline-none focus:border-blue-500"
                  >
                    {SUPPLIER_PRESETS.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1.5">เลขที่ PO</label>
                  <input
                    type="text"
                    value={stockPoMeta.po_number}
                    onChange={(e) => setStockPoMeta(prev => ({ ...prev, po_number: e.target.value }))}
                    className="w-full px-3 py-2 rounded-xl text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-300 dark:border-slate-700 font-mono focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300">รายการสินค้า ({stockPoLines.length})</label>
                  <button
                    type="button"
                    onClick={openPoCatalogModal}
                    className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-[#FF6B00]/15 text-[#C2410C] dark:text-[#FF6B00] border border-[#FF6B00]/30 hover:bg-[#FF6B00]/25 transition cursor-pointer active:scale-95 flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3" /> เลือกจากแคตตาล็อก
                  </button>
                </div>
                {stockPoLines.length === 0 ? (
                  <div className="rounded-xl bg-slate-50 dark:bg-white/[0.02] border border-dashed border-slate-300 dark:border-white/[0.1] p-6 text-center">
                    <PackageSearch className="w-8 h-8 text-slate-400 dark:text-slate-600 mx-auto mb-2" />
                    <p className="text-[11px] text-slate-500">ยังไม่มีรายการ — กด "เลือกจากแคตตาล็อก" เพื่อเพิ่มสินค้า</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {stockPoLines.map((line) => (
                      <div key={line.product_id} className="rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 p-2.5 flex items-center gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-bold text-slate-900 dark:text-white truncate">{line.product_name}</p>
                          <p className="text-[10px] text-slate-500 dark:text-slate-400">{PRODUCT_CATEGORY_LABELS[line.category]}</p>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <input
                            type="number"
                            min={1}
                            value={line.qty}
                            onChange={(e) => handleUpdateStockPoLine(line.product_id, { qty: Math.max(1, Number(e.target.value) || 1) })}
                            className="w-14 px-2 py-1 rounded-lg text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-300 dark:border-slate-700 text-center tabular-nums focus:outline-none focus:border-blue-500"
                            title="จำนวน"
                          />
                          <input
                            type="number"
                            min={0}
                            value={line.unit_cost}
                            onChange={(e) => handleUpdateStockPoLine(line.product_id, { unit_cost: Math.max(0, Number(e.target.value) || 0) })}
                            className="w-20 px-2 py-1 rounded-lg text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-300 dark:border-slate-700 text-right tabular-nums focus:outline-none focus:border-blue-500"
                            title="ทุน/หน่วย"
                          />
                          <button
                            type="button"
                            onClick={() => handleRemoveStockPoLine(line.product_id)}
                            className="p-1.5 rounded-lg bg-rose-100 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 hover:bg-rose-200 dark:hover:bg-rose-500/20 transition cursor-pointer active:scale-95"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1.5">หมายเหตุ</label>
                <textarea
                  value={stockPoMeta.notes}
                  onChange={(e) => setStockPoMeta(prev => ({ ...prev, notes: e.target.value }))}
                  rows={2}
                  className="w-full px-3 py-2 rounded-xl text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-300 dark:border-slate-700 placeholder-slate-400 focus:outline-none focus:border-blue-500 resize-none"
                  placeholder="เช่น สั่งสำรองสต๊อกประจำเดือน..."
                />
              </div>

              {stockPoLines.length > 0 && (
                <div className="rounded-xl bg-amber-50 dark:bg-[#FF6B00]/10 border border-amber-200 dark:border-[#FF6B00]/25 p-3 flex items-center justify-between">
                  <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300">ยอดรวมทั้งใบ</span>
                  <span className="text-base font-extrabold text-[#C2410C] dark:text-[#FF6B00] tabular-nums">
                    ฿{fmt(stockPoLines.reduce((s, l) => s + l.qty * l.unit_cost, 0))}
                  </span>
                </div>
              )}

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setIsStockPoModalOpen(false)}
                  className="flex-1 px-4 py-2.5 bg-slate-100 dark:bg-white/[0.04] hover:bg-slate-200 dark:hover:bg-white/[0.08] text-slate-700 dark:text-slate-200 font-bold rounded-xl text-xs transition cursor-pointer border border-slate-300 dark:border-slate-700 active:scale-95"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={stockPoLines.length === 0}
                  className="flex-1 px-4 py-2.5 bg-gradient-to-r from-[#FF6B00] to-[#E65A00] hover:from-[#FF8A24] text-black font-extrabold rounded-xl text-xs transition cursor-pointer shadow-lg shadow-[#FF6B00]/25 border border-white/20 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  บันทึก Stock PO
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* ===== CATALOG MULTI-SELECT MODAL ===== */}
      {isPoCatalogModalOpen && createPortal(
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-sm animate-fade-in" onClick={() => setIsPoCatalogModalOpen(false)}>
          <div className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-800 shadow-2xl rounded-3xl w-full max-w-2xl max-h-[90vh] flex flex-col animate-modal-pop" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3 p-4 sm:p-5 bg-slate-50/90 dark:bg-slate-900/95 border-b border-slate-200 dark:border-slate-800 rounded-t-3xl">
              <div>
                <h3 className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-white flex items-center gap-2"><PackageSearch className="w-4 h-4 text-[#FF6B00]" /> เลือกสินค้าจากแคตตาล็อก</h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">เลือกแล้ว {poCatalogSelectedCount} รายการ</p>
              </div>
              <button type="button" onClick={() => setIsPoCatalogModalOpen(false)} className="shrink-0 p-2 rounded-xl bg-slate-100 dark:bg-white/[0.04] hover:bg-slate-200 dark:hover:bg-white/[0.08] text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition cursor-pointer active:scale-95">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 sm:p-4 border-b border-slate-200 dark:border-white/[0.06] space-y-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-500" />
                <input
                  type="text"
                  value={poCatalogSearch}
                  onChange={(e) => setPoCatalogSearch(e.target.value)}
                  placeholder="ค้นหาชื่อสินค้า..."
                  className="w-full pl-9 pr-3 py-2 rounded-xl text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-300 dark:border-slate-700 placeholder-slate-400 focus:outline-none focus:border-blue-500"
                />
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <select
                  value={poCatalogCategory}
                  onChange={(e) => setPoCatalogCategory(e.target.value as 'all' | ProductCategory)}
                  className="px-2.5 py-1.5 rounded-lg text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-300 dark:border-slate-700 focus:outline-none focus:border-blue-500"
                >
                  <option value="all">ทุกหมวดหมู่</option>
                  {(Object.keys(PRODUCT_CATEGORY_LABELS) as ProductCategory[]).map(c => (
                    <option key={c} value={c}>{PRODUCT_CATEGORY_LABELS[c]}</option>
                  ))}
                </select>
                <select
                  value={poCatalogSort}
                  onChange={(e) => setPoCatalogSort(e.target.value as 'name' | 'cost_desc' | 'cost_asc' | 'stock_desc')}
                  className="px-2.5 py-1.5 rounded-lg text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-300 dark:border-slate-700 focus:outline-none focus:border-blue-500"
                >
                  <option value="name">ชื่อ A-Z</option>
                  <option value="cost_desc">ทุนสูง→ต่ำ</option>
                  <option value="cost_asc">ทุนต่ำ→สูง</option>
                  <option value="stock_desc">สต๊อกมาก→น้อย</option>
                </select>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-2">
              {poCatalogFiltered.length === 0 ? (
                <div className="py-10 text-center">
                  <PackageSearch className="w-10 h-10 text-slate-400 dark:text-slate-600 mx-auto mb-2" />
                  <p className="text-xs text-slate-500">ไม่พบสินค้าในแคตตาล็อก</p>
                </div>
              ) : (
                poCatalogFiltered.map((product) => {
                  const picked = poCatalogPicks[product.id];
                  const stock = stockCountByName[(product.name || '').trim().toLowerCase()] || 0;
                  return (
                    <div
                      key={product.id}
                      className={`rounded-xl border p-2.5 transition ${picked ? 'bg-[#FF6B00]/10 border-[#FF6B00]/40' : 'bg-slate-50 dark:bg-slate-800/70 border-slate-200 dark:border-slate-700'}`}
                    >
                      <div className="flex items-center gap-2.5">
                        <button
                          type="button"
                          onClick={() => togglePoCatalogPick(product)}
                          className={`shrink-0 w-5 h-5 rounded-md border flex items-center justify-center transition cursor-pointer active:scale-90 ${picked ? 'bg-[#FF6B00] border-[#FF6B00]' : 'bg-white dark:bg-transparent border-slate-300 dark:border-white/20'}`}
                        >
                          {picked && <Check className="w-3.5 h-3.5 text-black" />}
                        </button>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-bold text-slate-900 dark:text-white truncate">{product.name}</p>
                          <p className="text-[10px] text-slate-500 dark:text-slate-400">{PRODUCT_CATEGORY_LABELS[product.category]} · สต๊อก {stock} · ทุน ฿{fmt(product.cost_price)}</p>
                        </div>
                      </div>
                      {picked && (
                        <div className="flex items-center gap-2 mt-2 pl-7">
                          <label className="text-[10px] text-slate-600 dark:text-slate-400">จำนวน</label>
                          <input
                            type="number"
                            min={1}
                            value={picked.qty}
                            onChange={(e) => updatePoCatalogPick(product.id, { qty: Math.max(1, Number(e.target.value) || 1) })}
                            className="w-16 px-2 py-1 rounded-lg text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-300 dark:border-slate-700 text-center tabular-nums focus:outline-none focus:border-blue-500"
                          />
                          <label className="text-[10px] text-slate-600 dark:text-slate-400">ทุน/หน่วย</label>
                          <input
                            type="number"
                            min={0}
                            value={picked.unit_cost}
                            onChange={(e) => updatePoCatalogPick(product.id, { unit_cost: Math.max(0, Number(e.target.value) || 0) })}
                            className="w-20 px-2 py-1 rounded-lg text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-300 dark:border-slate-700 text-right tabular-nums focus:outline-none focus:border-blue-500"
                          />
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            <div className="p-3 sm:p-4 bg-slate-50/90 dark:bg-slate-900/95 border-t border-slate-200 dark:border-slate-800 rounded-b-3xl flex gap-2">
              <button
                type="button"
                onClick={() => setIsPoCatalogModalOpen(false)}
                className="flex-1 px-4 py-2.5 bg-slate-100 dark:bg-white/[0.04] hover:bg-slate-200 dark:hover:bg-white/[0.08] text-slate-700 dark:text-slate-200 font-bold rounded-xl text-xs transition cursor-pointer border border-slate-300 dark:border-slate-700 active:scale-95"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleConfirmPoCatalogSelection}
                disabled={poCatalogSelectedCount === 0}
                className="flex-1 px-4 py-2.5 bg-gradient-to-r from-[#FF6B00] to-[#E65A00] hover:from-[#FF8A24] text-black font-extrabold rounded-xl text-xs transition cursor-pointer shadow-lg shadow-[#FF6B00]/25 border border-white/20 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                ยืนยันเลือก ({poCatalogSelectedCount})
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};
