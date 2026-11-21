import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useApp } from '../context/AppContext';
import {
  FilePlus2, Send, ListOrdered, CheckCircle, Plus,
  Sparkles, Layers, Trash2, Calendar, CreditCard,
  FileText, Truck, Search, Filter, ShoppingBag, X, Check,
  UserCheck, Pencil, Lock, TrendingUp, AlertTriangle, ShieldCheck,
  Receipt, Package
} from 'lucide-react';
import {
  ROUTE_DEFINITIONS, getRouteByDistrict, RouteCode, BillType, PaymentTerm, DeliveryMode, OrderItem,
  Product, ProductCategory, ProductUnit, PRODUCT_CATEGORY_LABELS, PRODUCT_UNIT_OPTIONS,
  WARRANTY_PRESET_YEARS, formatWarrantyDuration, formatDateDMY, formatThaiDateTime, Order
} from '../types';
import { ListControls, useListControls } from './ListControls';
import { ActivityTimeline, LatestUpdateBadge } from './ActivityTimeline';

const DISTRICT_OPTIONS = [
  // สาย 1 (โซนเหนือ)
  { district: 'พุนพิน', zone: 'สาย 1 (โซนเหนือ)' },
  { district: 'ท่าฉาง', zone: 'สาย 1 (โซนเหนือ)' },
  { district: 'ไชยา', zone: 'สาย 1 (โซนเหนือ)' },
  { district: 'ท่าชนะ', zone: 'สาย 1 (โซนเหนือ)' },
  // สาย 2 (โซนตะวันตก)
  { district: 'คีรีรัฐนิคม', zone: 'สาย 2 (โซนตะวันตก)' },
  { district: 'บ้านตาขุน', zone: 'สาย 2 (โซนตะวันตก)' },
  { district: 'พนม', zone: 'สาย 2 (โซนตะวันตก)' },
  // สาย 3 (โซนใต้)
  { district: 'บ้านนาเดิม', zone: 'สาย 3 (โซนใต้)' },
  { district: 'บ้านนาสาร', zone: 'สาย 3 (โซนใต้)' },
  { district: 'เวียงสระ', zone: 'สาย 3 (โซนใต้)' },
  { district: 'พระแสง', zone: 'สาย 3 (โซนใต้)' },
  // สาย 4 (โซนตะวันออก)
  { district: 'กาญจนดิษฐ์', zone: 'สาย 4 (โซนตะวันออก)' },
  { district: 'ดอนสัก', zone: 'สาย 4 (โซนตะวันออก)' },
  { district: 'ขนอม', zone: 'สาย 4 (โซนตะวันออก)' },
  // สาย 5 (ในเมือง / รอบเมือง)
  { district: 'เมืองสุราษฎร์ธานี', zone: 'สาย 5 (ในเมือง / รอบเมือง)' },
  // สาย 6 (ต่างจังหวัด / งานเหมาพิเศษ)
  { district: 'ต่างจังหวัด / งานเหมาพิเศษ', zone: 'สาย 6 (ต่างจังหวัด / ชั่วคราว)' }
];

const LOW_MARGIN_THRESHOLD = 10; // GP ต่ำกว่า 10% = เตือน

const fmt = (n: number) => n.toLocaleString('th-TH', { maximumFractionDigits: 0 });

const emptyProductForm = () => ({
  name: '',
  category: 'pc_notebook' as ProductCategory,
  item_type: 'hardware' as 'hardware' | 'service',
  unit: 'เครื่อง' as ProductUnit,
  cost_price: 0,
  sell_price: 0
});

// คำนวณยอดเงินรวมของออเดอร์ (จาก items_list)
const orderTotal = (ord: Order): number => {
  if (ord.items_list && ord.items_list.length > 0) {
    return ord.items_list.reduce((s, it) => s + (it.unit_price || 0) * (it.quantity || 1), 0);
  }
  return 0;
};

const orderGp = (ord: Order): number => {
  if (ord.items_list && ord.items_list.length > 0) {
    const revenue = ord.items_list.reduce((s, it) => s + (it.unit_price || 0) * (it.quantity || 1), 0);
    const cost = ord.items_list.reduce((s, it) => s + (it.unit_cost || 0) * (it.quantity || 1), 0) + Math.max(0, ord.extra_cost || 0);
    return revenue - cost;
  }
  return 0;
};

const orderItemCount = (ord: Order): number => {
  if (ord.items_list && ord.items_list.length > 0) {
    return ord.items_list.reduce((s, it) => s + (it.quantity || 1), 0);
  }
  return ord._planned_quantity || 1;
};

const DELIVERY_MODE_META: Record<DeliveryMode, { label: string; cls: string }> = {
  install: { label: 'ส่งพร้อมติดตั้ง', cls: 'bg-blue-500/15 text-blue-300 border-blue-500/30' },
  drop_off: { label: 'ส่งอย่างเดียว', cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
  customer_pickup: { label: 'รับเองหน้าร้าน', cls: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
  project: { label: 'งานโครงการ/รับเหมา', cls: 'bg-purple-500/15 text-purple-300 border-purple-500/30' }
};

export const SalesView: React.FC = () => {
  const { orders, createOrder, currentUser, products, addProduct, updateProduct, deleteProduct, items } = useApp();

  // ชื่อพนักงานขายที่ล็อกอินอยู่ (auto-tag ลงทุกออเดอร์ ไม่ต้องเลือกเอง)
  const salespersonName = currentUser?.name || 'ไม่ระบุตัวตน';

  // Sales Order Form Inputs (แทนใบขาว ORDER FORM 2026)
  const [salesRef, setSalesRef] = useState(`SO-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [district, setDistrict] = useState('เมืองสุราษฎร์ธานี');
  const [provinceCustom, setProvinceCustom] = useState('');
  const [deliveryLoc, setDeliveryLoc] = useState('');
  const [deliveryDate, setDeliveryDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().split('T')[0];
  });
  const [billType, setBillType] = useState<BillType>('tax_invoice');
  const [paymentTerm, setPaymentTerm] = useState<PaymentTerm>('cash');
  const [deliveryMode, setDeliveryMode] = useState<DeliveryMode>('install');
  const [siteNotes, setSiteNotes] = useState('');
  // ต้นทุนแฝง / ค่าดำเนินการหน้างาน (INTERNAL ONLY)
  const [extraJobCost, setExtraJobCost] = useState<number>(0);

  // Multi-item Order List on White Sheet
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);

  // Modal State: Create Order Modal + Catalog Modal + Order Detail Modal
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isCatalogModalOpen, setIsCatalogModalOpen] = useState(false);
  const [detailOrder, setDetailOrder] = useState<Order | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showCustomerSuggestions, setShowCustomerSuggestions] = useState(false);
  const [autoFilledCustomer, setAutoFilledCustomer] = useState<string | null>(null);

  // Build deduplicated directory of returning customers / companies from past orders (latest order wins)
  const customerDirectory = useMemo(() => {
    const map = new Map<string, {
      name: string;
      phone: string;
      district: string;
      deliveryLocation: string;
      provinceCustom: string;
      orderCount: number;
      latestAt: number;
    }>();
    const sorted = [...orders].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
    sorted.forEach(o => {
      const name = (o.customer_name || '').trim();
      if (!name) return;
      const key = name.toLowerCase();
      const existing = map.get(key);
      if (!existing) {
        map.set(key, {
          name,
          phone: (o.customer_phone || '').trim(),
          district: o.district || '',
          deliveryLocation: (o.delivery_location || '').trim(),
          provinceCustom: (o.province_custom || '').trim(),
          orderCount: 1,
          latestAt: new Date(o.created_at).getTime()
        });
      } else {
        existing.orderCount += 1;
        if (!existing.phone && o.customer_phone) existing.phone = o.customer_phone.trim();
        if (!existing.deliveryLocation && o.delivery_location) existing.deliveryLocation = o.delivery_location.trim();
      }
    });
    return Array.from(map.values());
  }, [orders]);

  const customerSuggestions = useMemo(() => {
    const q = customerName.trim().toLowerCase();
    if (!q) return customerDirectory.slice(0, 5);
    return customerDirectory
      .filter(c => c.name.toLowerCase().includes(q) || c.phone.toLowerCase().includes(q))
      .slice(0, 6);
  }, [customerDirectory, customerName]);

  const applyReturningCustomer = (cust: typeof customerDirectory[number]) => {
    setCustomerName(cust.name);
    if (cust.phone) setCustomerPhone(cust.phone);
    if (cust.district && DISTRICT_OPTIONS.some(d => d.district === cust.district)) {
      setDistrict(cust.district);
    }
    if (cust.deliveryLocation) setDeliveryLoc(cust.deliveryLocation);
    if (cust.provinceCustom) setProvinceCustom(cust.provinceCustom);
    setAutoFilledCustomer(cust.name);
    setShowCustomerSuggestions(false);
  };

  const handleCustomerNameChange = (val: string) => {
    setCustomerName(val);
    setShowCustomerSuggestions(true);
    const exact = customerDirectory.find(c => c.name.toLowerCase() === val.trim().toLowerCase());
    if (exact) {
      if (!customerPhone.trim() && exact.phone) setCustomerPhone(exact.phone);
      if (exact.district && DISTRICT_OPTIONS.some(d => d.district === exact.district)) {
        setDistrict(exact.district);
      }
      if (!deliveryLoc.trim() && exact.deliveryLocation) setDeliveryLoc(exact.deliveryLocation);
      if (!provinceCustom.trim() && exact.provinceCustom) setProvinceCustom(exact.provinceCustom);
      setAutoFilledCustomer(exact.name);
    } else if (autoFilledCustomer && val.trim().toLowerCase() !== autoFilledCustomer.toLowerCase()) {
      setAutoFilledCustomer(null);
    }
  };
  const [categoryFilter, setCategoryFilter] = useState<'all' | ProductCategory>('all');
  const [sortBy, setSortBy] = useState<'stock_desc' | 'stock_asc' | 'price_desc' | 'price_asc' | 'name'>('stock_desc');

  // Selected items inside the Modal: mapping productId -> quantity
  const [modalSelectedMap, setModalSelectedMap] = useState<Record<string, number>>({});

  // Inline Add / Edit Product Form within Modal
  const [isAddingNewToCatalog, setIsAddingNewToCatalog] = useState(false);
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [productForm, setProductForm] = useState(emptyProductForm());

  // Order list search
  const [orderSearch, setOrderSearch] = useState('');

  const [toast, setToast] = useState('');

  // คำนวณสายรถอัตโนมัติตามอำเภอที่เลือก
  const currentRouteCode: RouteCode = getRouteByDistrict(district);
  const routeMeta = ROUTE_DEFINITIONS[currentRouteCode];

  // Lock background scroll while any modal is open
  const anyModalOpen = isCreateModalOpen || isCatalogModalOpen || !!detailOrder;
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

  // ---- Create Order Modal ----
  const handleOpenCreateModal = () => {
    setSalesRef(`SO-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`);
    setCustomerName('');
    setCustomerPhone('');
    setDistrict('เมืองสุราษฎร์ธานี');
    setProvinceCustom('');
    setDeliveryLoc('');
    setSiteNotes('');
    setExtraJobCost(0);
    setOrderItems([]);
    setIsCreateModalOpen(true);
  };

  const handleCloseCreateModal = () => setIsCreateModalOpen(false);

  // Open Catalog Modal
  const handleOpenCatalogModal = () => {
    setModalSelectedMap({});
    setSearchQuery('');
    setCategoryFilter('all');
    setSortBy('stock_desc');
    setIsAddingNewToCatalog(false);
    setEditingProductId(null);
    setProductForm(emptyProductForm());
    setIsCatalogModalOpen(true);
  };

  // Toggle selection in Modal
  const handleToggleSelectModalItem = (item: Product) => {
    setModalSelectedMap(prev => {
      const copy = { ...prev };
      if (copy[item.id] !== undefined) {
        delete copy[item.id];
      } else {
        copy[item.id] = 1;
      }
      return copy;
    });
  };

  const handleUpdateModalItemQty = (itemId: string, qty: number) => {
    const validQty = Math.max(1, qty);
    setModalSelectedMap(prev => ({ ...prev, [itemId]: validQty }));
  };

  // Save (create or update) product in catalog
  const handleSaveProduct = (e: React.FormEvent) => {
    e.preventDefault();
    if (!productForm.name.trim()) {
      alert('กรุณาระบุชื่อสินค้าหรือบริการ');
      return;
    }

    const payload = {
      name: productForm.name.trim(),
      category: productForm.category,
      item_type: productForm.item_type,
      unit: productForm.unit,
      cost_price: Math.max(0, productForm.cost_price),
      sell_price: Math.max(0, productForm.sell_price)
    };

    if (editingProductId) {
      updateProduct(editingProductId, payload);
      setToast(`อัปเดต "${payload.name}" ในแคตตาล็อกแล้ว`);
    } else {
      addProduct(payload);
      setToast(`เพิ่ม "${payload.name}" เข้าแคตตาล็อกแล้ว`);
    }

    setProductForm(emptyProductForm());
    setEditingProductId(null);
    setIsAddingNewToCatalog(false);
    setTimeout(() => setToast(''), 3000);
  };

  const handleStartEditProduct = (item: Product, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingProductId(item.id);
    setProductForm({
      name: item.name,
      category: item.category,
      item_type: item.item_type,
      unit: item.unit,
      cost_price: item.cost_price,
      sell_price: item.sell_price
    });
    setIsAddingNewToCatalog(true);
  };

  const handleCancelProductForm = () => {
    setIsAddingNewToCatalog(false);
    setEditingProductId(null);
    setProductForm(emptyProductForm());
  };

  // Delete item from Catalog
  const handleDeleteCatalogItem = (itemId: string, itemName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm(`ต้องการลบ "${itemName}" ออกจากแคตตาล็อกหรือไม่?`)) {
      deleteProduct(itemId);
      setModalSelectedMap(prev => {
        const copy = { ...prev };
        delete copy[itemId];
        return copy;
      });
    }
  };

  // Confirm selected items from Modal back to Order Form
  const handleConfirmModalSelection = () => {
    const selectedIds = Object.keys(modalSelectedMap);
    if (selectedIds.length === 0) {
      alert('กรุณาติ๊กเลือกสินค้าหรือบริการอย่างน้อย 1 รายการ');
      return;
    }

    const itemsToAdd: OrderItem[] = [];
    selectedIds.forEach(id => {
      const catItem = products.find(c => c.id === id);
      if (catItem) {
        itemsToAdd.push({
          model_name: catItem.name,
          quantity: modalSelectedMap[id] || 1,
          item_type: catItem.item_type,
          unit: catItem.unit,
          unit_price: catItem.sell_price,
          unit_cost: catItem.cost_price,
          // ค่าเริ่มต้น: อุปกรณ์ฮาร์ดแวร์ 1 ปี / บริการ 0 ปี (ไม่มีประกัน)
          warranty_years: catItem.item_type === 'service' ? 0 : 1
        });
      }
    });

    setOrderItems(prev => [...prev, ...itemsToAdd]);

    setIsCatalogModalOpen(false);
    setToast(`เพิ่ม ${itemsToAdd.length} รายการเข้าบิลเรียบร้อยแล้ว`);
    setTimeout(() => setToast(''), 3500);
  };

  const handleRemoveItemFromOrder = (index: number) => {
    setOrderItems(prev => prev.filter((_, i) => i !== index));
  };

  const handleUpdateItemQuantity = (index: number, newQty: number) => {
    const validQty = Math.max(1, newQty);
    setOrderItems(prev => prev.map((item, i) => i === index ? { ...item, quantity: validQty } : item));
  };

  const handleUpdateItemUnitPrice = (index: number, price: number) => {
    const validPrice = Math.max(0, price);
    setOrderItems(prev => prev.map((item, i) => i === index ? { ...item, unit_price: validPrice } : item));
  };

  const handleUpdateItemUnitCost = (index: number, cost: number) => {
    const validCost = Math.max(0, cost);
    setOrderItems(prev => prev.map((item, i) => i === index ? { ...item, unit_cost: validCost } : item));
  };

  const handleUpdateItemWarranty = (index: number, years: number) => {
    const validYears = Math.max(0, Math.floor(years) || 0);
    setOrderItems(prev => prev.map((item, i) => i === index ? { ...item, warranty_years: validYears } : item));
  };

  const handleSubmitOrder = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerName.trim() || orderItems.length === 0) {
      alert('กรุณากรอกชื่อลูกค้าและเพิ่มรายการสินค้า');
      return;
    }

    const totalQty = orderItems.reduce((acc, curr) => acc + curr.quantity, 0);

    createOrder({
      sales_ref: salesRef,
      salesperson: salespersonName,
      customer_name: customerName.trim(),
      customer_phone: customerPhone.trim(),
      delivery_location: deliveryLoc.trim() || `อ.${district}`,
      district: district,
      route_code: currentRouteCode,
      province_custom: currentRouteCode === 'route_6' ? provinceCustom.trim() : undefined,
      delivery_date: deliveryDate,
      bill_type: billType,
      payment_term: paymentTerm,
      delivery_mode: deliveryMode,
      site_notes: siteNotes.trim(),
      items_list: orderItems,
      extra_cost: Math.max(0, extraJobCost),
      planned_model: orderItems[0]?.model_name || '',
      planned_quantity: totalQty,
      bill_no: null
    });

    setToast(`สร้างใบสั่งขายรหัส ${salesRef} รวม ${totalQty} ชิ้น ส่งต่อจัดซื้อ & สต๊อกแล้ว`);
    setIsCreateModalOpen(false);
    setCustomerName('');
    setCustomerPhone('');
    setDeliveryLoc('');
    setSiteNotes('');
    setExtraJobCost(0);
    setOrderItems([]);
    setAutoFilledCustomer(null);
    setShowCustomerSuggestions(false);
    setSalesRef(`SO-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`);
    setTimeout(() => setToast(''), 4500);
  };

  const getOrderStatusBadge = (status: string) => {
    switch (status) {
      case 'pending_purchasing':
        return <span className="px-2.5 py-1 rounded-full text-[10px] font-semibold bg-blue-500/15 text-blue-400 border border-blue-500/30 whitespace-nowrap">รอจัดซื้อ/เช็กสต๊อก</span>;
      case 'waiting_po':
        return <span className="px-2.5 py-1 rounded-full text-[10px] font-semibold bg-purple-500/15 text-purple-400 border border-purple-500/30 whitespace-nowrap">รอสั่งซื้อของเข้า (รอ PO)</span>;
      case 'po_received_in_stock':
        return <span className="px-2.5 py-1 rounded-full text-[10px] font-semibold bg-teal-500/15 text-teal-400 border border-teal-500/30 whitespace-nowrap">ของเข้าสต๊อกแล้ว (รอช่างเตรียม)</span>;
      case 'approved_for_prep':
        return <span className="px-2.5 py-1 rounded-full text-[10px] font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30 whitespace-nowrap">ตัดสต๊อกแล้ว (ช่างกำลังเตรียม)</span>;
      case 'fulfilled':
        return <span className="px-2.5 py-1 rounded-full text-[10px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 whitespace-nowrap">ส่งมอบสมบูรณ์แล้ว</span>;
      default:
        return <span className="px-2.5 py-1 rounded-full text-[10px] font-semibold bg-white/10 text-slate-300 whitespace-nowrap">{status}</span>;
    }
  };

  // Filtered Catalog Items for Modal (before sorting)
  const filteredCatalogBase = products.filter(item => {
    const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = categoryFilter === 'all' || item.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  // Live stock counts per product name (normalized name.trim().toLowerCase())
  const stockByName = useMemo(() => {
    const map: Record<string, { inStock: number; incoming: number }> = {};
    items.forEach(it => {
      const key = (it.model_name || '').trim().toLowerCase();
      if (!key) return;
      if (!map[key]) map[key] = { inStock: 0, incoming: 0 };
      if (it.status === 'raw_stock' || it.status === 'in_stock') map[key].inStock += 1;
    });
    orders.forEach(o => {
      if (o.order_status !== 'waiting_po') return;
      (o.items_list || []).forEach(it => {
        if (it.item_type === 'service') return;
        const key = (it.model_name || '').trim().toLowerCase();
        if (!key) return;
        if (!map[key]) map[key] = { inStock: 0, incoming: 0 };
        map[key].incoming += it.quantity || 1;
      });
    });
    return map;
  }, [items, orders]);

  const getStockInfo = (productName: string) =>
    stockByName[(productName || '').trim().toLowerCase()] || { inStock: 0, incoming: 0 };

  // Sorted Catalog Items for Modal
  const filteredCatalog = useMemo(() => {
    const list = [...filteredCatalogBase];
    const stockOf = (name: string) =>
      stockByName[(name || '').trim().toLowerCase()]?.inStock || 0;

    switch (sortBy) {
      case 'stock_desc':
        return list.sort((a, b) => stockOf(b.name) - stockOf(a.name));
      case 'stock_asc':
        return list.sort((a, b) => stockOf(a.name) - stockOf(b.name));
      case 'price_desc':
        return list.sort((a, b) => b.sell_price - a.sell_price);
      case 'price_asc':
        return list.sort((a, b) => a.sell_price - b.sell_price);
      case 'name':
        return list.sort((a, b) => a.name.localeCompare(b.name, 'th'));
      default:
        return list;
    }
  }, [filteredCatalogBase, stockByName, sortBy]);

  // Sort + pagination สำหรับการ์ดติดตามออเดอร์
  const ordersList = useListControls(orders, {
    getDate: (o) => o.created_at,
    getValue: (o) => (o.items_list || []).reduce((s, it) => s + (it.unit_price || 0) * it.quantity, 0),
    initialSort: 'newest',
  });

  // Filter orders by search (customer / ref)
  const searchedOrders = useMemo(() => {
    const q = orderSearch.trim().toLowerCase();
    if (!q) return ordersList.pageItems;
    return ordersList.pageItems.filter(o =>
      (o.customer_name || '').toLowerCase().includes(q) ||
      (o.sales_ref || '').toLowerCase().includes(q)
    );
  }, [ordersList.pageItems, orderSearch]);

  const selectedCount = Object.keys(modalSelectedMap).length;
  const modalTotalAmount = Object.keys(modalSelectedMap).reduce((sum, id) => {
    const item = products.find(c => c.id === id);
    const qty = modalSelectedMap[id] || 1;
    return sum + (item ? item.sell_price * qty : 0);
  }, 0);

  // Live Order Financials (INTERNAL ONLY)
  const financials = useMemo(() => {
    const revenue = orderItems.reduce((sum, it) => sum + (it.unit_price || 0) * it.quantity, 0);
    const itemCost = orderItems.reduce((sum, it) => sum + (it.unit_cost || 0) * it.quantity, 0);
    const totalCost = itemCost + Math.max(0, extraJobCost);
    const gp = revenue - totalCost;
    const marginPct = revenue > 0 ? (gp / revenue) * 100 : 0;
    const belowCost = revenue > 0 && gp < 0;
    const lowMargin = revenue > 0 && !belowCost && marginPct < LOW_MARGIN_THRESHOLD;
    return { revenue, itemCost, totalCost, gp, marginPct, belowCost, lowMargin };
  }, [orderItems, extraJobCost]);

  // KPI Summary
  const kpi = useMemo(() => {
    const totalRevenue = orders.reduce((s, o) => s + orderTotal(o), 0);
    const totalGp = orders.reduce((s, o) => s + orderGp(o), 0);
    return { count: orders.length, totalRevenue, totalGp };
  }, [orders]);

  return (
    <div className="space-y-6">
      {toast && (
        <div className="fixed bottom-6 right-6 z-[10001] p-4 rounded-2xl liquid-glass border border-[#FF6B00] text-white text-xs flex items-center gap-2 shadow-2xl animate-fade-in">
          <CheckCircle className="w-4 h-4 text-[#FF6B00]" />
          <span>{toast}</span>
        </div>
      )}

      {/* ================= TOP ACTION BAR + KPI ================= */}
      <div className="liquid-glass rounded-3xl p-5 sm:p-6 shadow-2xl border border-white/[0.08]">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-[#FF6B00]/15 text-[#FF6B00] border border-[#FF6B00]/30">
              <FilePlus2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">ฝ่ายขาย (Sales)</h2>
              <p className="text-[11px] text-slate-400 mt-0.5">เปิดบิลขาย เลือกสินค้าจากแคตตาล็อก และติดตามสถานะออเดอร์</p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <button
              type="button"
              onClick={handleOpenCreateModal}
              className="px-4 py-2.5 min-h-[44px] rounded-xl bg-gradient-to-r from-[#FF6B00] to-[#E65A00] hover:from-[#FF8A24] hover:brightness-105 text-black font-extrabold text-xs transition-all duration-150 cursor-pointer flex items-center justify-center gap-2 shadow-lg shadow-[#FF6B00]/25 border border-white/20 active:scale-[0.97]"
            >
              <Plus className="w-4 h-4" />
              <span>เปิดบิลขายใหม่ (New Sales Order)</span>
            </button>
            <button
              type="button"
              onClick={handleOpenCatalogModal}
              className="px-4 py-2.5 min-h-[44px] rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-slate-200 border border-white/[0.1] font-bold text-xs transition-all duration-150 cursor-pointer flex items-center justify-center gap-2 active:scale-[0.97]"
            >
              <ShoppingBag className="w-4 h-4 text-[#FF6B00]" />
              <span>เพิ่ม/จัดการสินค้าแคตตาล็อก</span>
            </button>
          </div>
        </div>

        {/* KPI Pills */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-4">
          <div className="px-3.5 py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.08] flex items-center justify-between gap-2">
            <span className="text-[11px] text-slate-400 flex items-center gap-1.5">
              <ListOrdered className="w-3.5 h-3.5 text-blue-400" />
              จำนวนบิลทั้งหมด
            </span>
            <span className="text-base font-extrabold font-mono text-white tabular-nums">{fmt(kpi.count)}</span>
          </div>
          <div className="px-3.5 py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-between gap-2">
            <span className="text-[11px] text-slate-400 flex items-center gap-1.5">
              <Receipt className="w-3.5 h-3.5 text-emerald-400" />
              ยอดขายรวม
            </span>
            <span className="text-base font-extrabold font-mono text-emerald-400 tabular-nums">฿{fmt(kpi.totalRevenue)}</span>
          </div>
          <div className="px-3.5 py-2.5 rounded-xl bg-[#FF6B00]/10 border border-[#FF6B00]/25 flex items-center justify-between gap-2">
            <span className="text-[11px] text-slate-400 flex items-center gap-1.5">
              <TrendingUp className="w-3.5 h-3.5 text-[#FF6B00]" />
              กำไรขั้นต้น GP
            </span>
            <span className={`text-base font-extrabold font-mono tabular-nums ${kpi.totalGp >= 0 ? 'text-[#FF6B00]' : 'text-rose-400'}`}>฿{fmt(kpi.totalGp)}</span>
          </div>
        </div>
      </div>

      {/* ================= COMPACT ORDER CARDS ================= */}
      <div className="liquid-glass rounded-3xl p-5 sm:p-6 shadow-2xl border border-white/[0.08]">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <ListOrdered className="w-4 h-4 text-[#FF6B00]" />
            <span>รายการออเดอร์ฝ่ายขาย</span>
            <span className="text-[11px] font-normal text-slate-400">({orders.length})</span>
          </h3>
          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="ค้นหาลูกค้า / เลขที่บิล..."
              value={orderSearch}
              onChange={(e) => setOrderSearch(e.target.value)}
              className="w-full liquid-glass-input rounded-xl pl-9 pr-3 py-2 text-xs text-white focus:outline-none"
            />
          </div>
        </div>

        <ListControls
          from={ordersList.from}
          to={ordersList.to}
          total={ordersList.total}
          page={ordersList.page}
          totalPages={ordersList.totalPages}
          pageSize={ordersList.pageSize}
          sort={ordersList.sort}
          onSortChange={ordersList.setSort}
          onPageSizeChange={ordersList.setPageSize}
          onPageChange={ordersList.setPage}
          unit="ออเดอร์"
          className="mb-3"
        />

        {searchedOrders.length === 0 ? (
          <div className="text-center py-12 text-slate-500 border border-dashed border-white/[0.1] rounded-2xl text-xs">
            <Package className="w-9 h-9 mx-auto mb-2 text-slate-600" />
            ยังไม่มีออเดอร์ หรือไม่พบรายการที่ค้นหา
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {searchedOrders.map((ord) => {
              const total = orderTotal(ord);
              const gp = orderGp(ord);
              const modeMeta = ord.delivery_mode ? DELIVERY_MODE_META[ord.delivery_mode] : null;
              return (
                <button
                  key={ord.id}
                  type="button"
                  onClick={() => setDetailOrder(ord)}
                  className="text-left p-4 rounded-2xl bg-white/[0.02] hover:bg-white/[0.05] border border-white/[0.08] hover:border-[#FF6B00]/40 transition-all duration-150 cursor-pointer active:scale-[0.97] flex flex-col gap-2.5 min-h-[148px]"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono font-extrabold text-[#FF6B00] text-sm tabular-nums truncate">
                      {ord.sales_ref || 'SO-AUTO'}
                    </span>
                    {getOrderStatusBadge(ord.order_status)}
                  </div>

                  <div className="text-white font-bold text-sm truncate">{ord.customer_name}</div>

                  <div className="flex items-center gap-1.5 flex-wrap">
                    {modeMeta && (
                      <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${modeMeta.cls}`}>
                        {modeMeta.label}
                      </span>
                    )}
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-white/[0.05] text-slate-300 border border-white/[0.08]">
                      {orderItemCount(ord)} ชิ้น
                    </span>
                  </div>

                  <div className="mt-auto flex items-center justify-between gap-2 pt-2 border-t border-white/[0.06]">
                    <span className="font-mono font-extrabold text-white text-sm tabular-nums">฿{fmt(total)}</span>
                    <span className={`px-2 py-0.5 rounded-md text-[10px] font-extrabold font-mono tabular-nums border ${gp >= 0
                      ? 'bg-[#FF6B00]/15 text-[#FF6B00] border-[#FF6B00]/30'
                      : 'bg-rose-500/15 text-rose-300 border-rose-500/30'
                      }`}>
                      GP ฿{fmt(gp)}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* CREATE SALES ORDER MODAL                                                  */}
      {/* ========================================================================= */}
      {isCreateModalOpen && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center sm:p-4 bg-black/60 backdrop-blur-sm animate-fade-in overscroll-contain">
          <div className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-800 shadow-2xl rounded-t-3xl sm:rounded-3xl w-full sm:w-[92vw] max-w-5xl max-h-[94dvh] sm:max-h-[90vh] flex flex-col overflow-hidden pb-[env(safe-area-inset-bottom)] animate-modal-pop">
            <div className="sm:hidden flex justify-center pt-2.5 pb-1 flex-shrink-0">
              <span className="h-1.5 w-10 rounded-full bg-slate-300 dark:bg-white/20" />
            </div>

            {/* Modal Header */}
            <div className="p-4 sm:p-5 bg-slate-50/90 dark:bg-slate-900/95 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 flex-shrink-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="p-2.5 rounded-2xl bg-[#FF6B00]/15 text-[#E65A00] dark:text-[#FF6B00] border border-[#FF6B00]/30">
                  <FilePlus2 className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white leading-tight">เปิดบิลขายใหม่ (New Sales Order)</h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">เลขที่เอกสาร: <strong className="text-[#E65A00] dark:text-[#FF6B00]">{salesRef}</strong></p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleCloseCreateModal}
                aria-label="ปิดหน้าต่างเปิดบิลขาย"
                className="p-2.5 rounded-xl text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white bg-slate-100 dark:bg-white/[0.04] hover:bg-slate-200 dark:hover:bg-white/[0.08] transition min-w-[44px] min-h-[44px] flex items-center justify-center flex-shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitOrder} className="flex-1 overflow-y-auto overscroll-contain p-4 sm:p-6 space-y-5">
              {/* Salesperson badge */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-100 text-emerald-900 border border-emerald-300 dark:bg-emerald-500/10 dark:border-emerald-500/30 text-[11px] font-semibold dark:text-emerald-300">
                  <UserCheck className="w-3.5 h-3.5" />
                  <span>ผู้เปิดบิล: <strong className="text-emerald-950 dark:text-emerald-200">{salespersonName}</strong></span>
                </span>
              </div>

              {/* Section 1: Customer Details */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="relative">
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    ชื่อลูกค้า / บริษัท * <span className="text-[10px] text-slate-400 font-normal">(พิมพ์เพื่อค้นหาลูกค้าเดิม)</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="เช่น บจก. ซีทรานเฟอร์รี่ ดอนสัก"
                    value={customerName}
                    onFocus={() => setShowCustomerSuggestions(true)}
                    onBlur={() => window.setTimeout(() => setShowCustomerSuggestions(false), 160)}
                    onChange={(e) => handleCustomerNameChange(e.target.value)}
                    className="w-full rounded-xl px-3 py-2 text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-300 dark:border-slate-700 placeholder-slate-400 focus:outline-none focus:border-blue-500"
                    autoComplete="off"
                  />

                  {/* Returning Customer Suggestions Dropdown */}
                  {showCustomerSuggestions && customerSuggestions.length > 0 && (
                    <div className="absolute left-0 right-0 top-full mt-1 z-30 rounded-2xl border border-slate-200 dark:border-white/[0.12] bg-white dark:bg-[#1A1D26] shadow-2xl overflow-hidden max-h-56 overflow-y-auto">
                      <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-white/[0.03] border-b border-slate-200 dark:border-white/[0.08]">
                        แนะนำลูกค้าเดิม / บริษัทเดิม ({customerSuggestions.length})
                      </div>
                      {customerSuggestions.map((cust) => (
                        <button
                          key={cust.name}
                          type="button"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            applyReturningCustomer(cust);
                          }}
                          className="w-full text-left px-3 py-2 hover:bg-blue-50 dark:hover:bg-white/[0.06] border-b last:border-b-0 border-slate-100 dark:border-white/[0.05] transition cursor-pointer"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-bold text-slate-900 dark:text-white truncate">
                              {cust.name}
                            </span>
                            <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 shrink-0">
                              ลูกค้าเดิม • {cust.orderCount} บิล
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 flex flex-wrap gap-x-3">
                            <span className="font-mono">{cust.phone || 'ไม่มีเบอร์'}</span>
                            {cust.district && <span>อ.{cust.district}</span>}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}

                  {autoFilledCustomer && (
                    <div className="mt-1.5 flex items-center justify-between gap-2 px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 text-[11px] text-emerald-800 dark:text-emerald-200">
                      <span className="font-semibold truncate">ดึงเบอร์ & ที่อยู่ลูกค้าเดิมอัตโนมัติแล้ว</span>
                      <button
                        type="button"
                        onClick={() => {
                          setCustomerName('');
                          setCustomerPhone('');
                          setDeliveryLoc('');
                          setAutoFilledCustomer(null);
                        }}
                        className="font-bold underline shrink-0 cursor-pointer"
                      >
                        ล้าง
                      </button>
                    </div>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">เบอร์โทรติดต่อลูกค้า *</label>
                  <input
                    type="text"
                    required
                    placeholder="08x-xxx-xxxx"
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    className="w-full rounded-xl px-3 py-2 text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-300 dark:border-slate-700 placeholder-slate-400 focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">อำเภอ / พื้นที่ (จัดสายรถอัตโนมัติ) *</label>
                  <select
                    value={district}
                    onChange={(e) => setDistrict(e.target.value)}
                    className="w-full rounded-xl px-3 py-2 text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-300 dark:border-slate-700 focus:outline-none focus:border-blue-500"
                  >
                    {DISTRICT_OPTIONS.map(opt => (
                      <option key={opt.district} value={opt.district} className="bg-white dark:bg-[#12141A]">
                        {opt.district} - [{opt.zone}]
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Route Badge & Custom Province */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className={`p-3 rounded-2xl border flex items-center justify-between ${routeMeta.badgeBg} ${routeMeta.badgeBorder} ${routeMeta.badgeText}`}>
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: routeMeta.color }}></span>
                    <span className="text-xs font-extrabold">{routeMeta.name}</span>
                    <span className="text-[11px] opacity-80">({district})</span>
                  </div>
                  <span className="text-[10px] uppercase font-mono tracking-wider opacity-90">Auto-Routing</span>
                </div>

                {currentRouteCode === 'route_6' && (
                  <div>
                    <input
                      type="text"
                      required
                      placeholder="ระบุจังหวัด / รายละเอียดพื้นที่พิเศษ เช่น ชุมพร, ระนอง"
                      value={provinceCustom}
                      onChange={(e) => setProvinceCustom(e.target.value)}
                      className="w-full rounded-2xl px-3 py-2.5 text-xs bg-white dark:bg-slate-800 text-amber-800 dark:text-amber-300 border border-amber-400 dark:border-amber-500/50 placeholder-slate-400 focus:outline-none focus:border-blue-500"
                    />
                  </div>
                )}
              </div>

              {/* Section 2: Delivery Mode (4 modes) */}
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5 flex items-center gap-1">
                  <Truck className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
                  <span>ประเภทการส่งมอบ (Delivery Mode) *</span>
                </label>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                  {([
                    { id: 'install', label: 'ส่งพร้อมติดตั้ง' },
                    { id: 'drop_off', label: 'ส่งอย่างเดียว' },
                    { id: 'customer_pickup', label: 'รับเองหน้าร้าน' },
                    { id: 'project', label: 'งานโครงการ/รับเหมา' }
                  ] as { id: DeliveryMode; label: string }[]).map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setDeliveryMode(m.id)}
                      className={`px-3 py-2.5 rounded-xl text-[11px] font-bold border transition-all duration-150 cursor-pointer active:scale-[0.97] ${deliveryMode === m.id
                        ? 'bg-[#FF6B00]/15 dark:bg-[#FF6B00]/20 border-[#FF6B00]/60 dark:border-[#FF6B00]/50 text-[#C2410C] dark:text-[#FF6B00]'
                        : 'bg-slate-50 dark:bg-white/[0.02] border-slate-200 dark:border-white/[0.08] text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/[0.05]'
                        }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Section 3: Delivery & Payment Details */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 pt-3 border-t border-slate-200 dark:border-white/[0.06]">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
                    <span>วันที่ต้องการส่งมอบ *</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={deliveryDate}
                    onChange={(e) => setDeliveryDate(e.target.value)}
                    className="w-full rounded-xl px-3 py-2 text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-300 dark:border-slate-700 font-mono focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1">
                    <FileText className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
                    <span>ประเภทบิล *</span>
                  </label>
                  <select
                    value={billType}
                    onChange={(e) => setBillType(e.target.value as BillType)}
                    className="w-full rounded-xl px-3 py-2 text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-300 dark:border-slate-700 focus:outline-none focus:border-blue-500"
                  >
                    <option value="tax_invoice" className="bg-white dark:bg-[#12141A]">ใบกำกับภาษีเต็มรูป (VAT 7%)</option>
                    <option value="cash_bill_quotation" className="bg-white dark:bg-[#12141A]">ใบเสนอราคา / บิลเงินสด</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1">
                    <CreditCard className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
                    <span>เงื่อนไขชำระเงิน *</span>
                  </label>
                  <select
                    value={paymentTerm}
                    onChange={(e) => setPaymentTerm(e.target.value as PaymentTerm)}
                    className="w-full rounded-xl px-3 py-2 text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-300 dark:border-slate-700 focus:outline-none focus:border-blue-500"
                  >
                    <option value="cash" className="bg-white dark:bg-[#12141A]">เงินสด / โอนเงิน (Cash/Transfer)</option>
                    <option value="credit_30" className="bg-white dark:bg-[#12141A]">เครดิต 30 วัน (Credit 30 Days)</option>
                    <option value="project" className="bg-white dark:bg-[#12141A]">งานโครงการ / มัดจำตามงวด (PROJECT)</option>
                  </select>
                </div>
              </div>

              {/* Section 4: Delivery Location & Site Notes */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">ที่อยู่จัดส่ง / แผนที่หน้างาน *</label>
                  <input
                    type="text"
                    required
                    placeholder="เช่น เลขที่ 123 หมู่ 2 ถ.สุราษฎร์-พุนพิน ต.ท่าข้าม"
                    value={deliveryLoc}
                    onChange={(e) => setDeliveryLoc(e.target.value)}
                    className="w-full rounded-xl px-3 py-2 text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-300 dark:border-slate-700 placeholder-slate-400 focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">หมายเหตุหน้างาน (Site Notes)</label>
                  <input
                    type="text"
                    placeholder="เช่น อาคาร 3 ชั้น 2 ต้องมีบันได 2 เมตร"
                    value={siteNotes}
                    onChange={(e) => setSiteNotes(e.target.value)}
                    className="w-full rounded-xl px-3 py-2 text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-300 dark:border-slate-700 placeholder-slate-400 focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              {/* Section 5: Items in this Order */}
              <div className="pt-3 border-t border-slate-200 dark:border-white/[0.06]">
                <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
                  <label className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                    <Package className="w-3.5 h-3.5 text-[#FF6B00]" />
                    <span>รายการสินค้าในบิลนี้</span>
                    <span className="px-1.5 py-0.5 rounded-md bg-slate-100 dark:bg-white/[0.06] text-[10px] font-mono text-slate-700 dark:text-slate-300">{orderItems.length} รายการ</span>
                  </label>
                  <button
                    type="button"
                    onClick={handleOpenCatalogModal}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#FF6B00]/15 hover:bg-[#FF6B00]/25 border border-[#FF6B00]/40 text-[#C2410C] dark:text-[#FF6B00] text-[11px] font-bold transition active:scale-[0.97] cursor-pointer"
                  >
                    <Layers className="w-3.5 h-3.5" />
                    <span>เลือกจากแคตตาล็อก</span>
                  </button>
                </div>

                {orderItems.length === 0 ? (
                  <div className="p-6 rounded-2xl border border-dashed border-slate-300 dark:border-white/[0.12] bg-slate-50 dark:bg-white/[0.02] text-center">
                    <ShoppingBag className="w-8 h-8 text-slate-400 dark:text-slate-600 mx-auto mb-2" />
                    <p className="text-xs text-slate-500 dark:text-slate-400">ยังไม่มีสินค้าในบิล — กด "เลือกจากแคตตาล็อก" เพื่อเพิ่มสินค้า</p>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {orderItems.map((it, idx) => {
                      const lineRevenue = (it.unit_price || 0) * (it.quantity || 1);
                      const lineCost = (it.unit_cost || 0) * (it.quantity || 1);
                      const lineGp = lineRevenue - lineCost;
                      const isBelowCost = lineGp < 0;
                      return (
                        <div key={`${it.model_name}-${idx}`} className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 space-y-2.5">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-bold text-slate-900 dark:text-white leading-snug truncate">{it.model_name}</p>
                              <p className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">{it.item_type === 'service' ? 'ค่าบริการ/ค่าแรง' : (it.unit || 'เครื่อง')}</p>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleRemoveItemFromOrder(idx)}
                              aria-label="ลบรายการสินค้า"
                              className="p-1.5 rounded-lg text-rose-600 dark:text-rose-400 hover:text-rose-700 dark:hover:text-rose-300 bg-rose-100 dark:bg-rose-500/10 hover:bg-rose-200 dark:hover:bg-rose-500/20 transition flex-shrink-0 cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                            <div>
                              <label className="block text-[10px] text-slate-600 dark:text-slate-400 mb-0.5">จำนวน</label>
                              <input
                                type="number"
                                min={1}
                                value={it.quantity}
                                onChange={(e) => handleUpdateItemQuantity(idx, parseInt(e.target.value) || 1)}
                                className="w-full rounded-lg px-2 py-1.5 text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-300 dark:border-slate-700 font-mono tabular-nums focus:outline-none focus:border-blue-500"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] text-slate-600 dark:text-slate-400 mb-0.5">ต้นทุน/หน่วย</label>
                              <input
                                type="number"
                                min={0}
                                step="0.01"
                                value={it.unit_cost ?? 0}
                                onChange={(e) => handleUpdateItemUnitCost(idx, parseFloat(e.target.value) || 0)}
                                className="w-full rounded-lg px-2 py-1.5 text-xs bg-white dark:bg-slate-800 text-amber-700 dark:text-amber-300 border border-slate-300 dark:border-slate-700 font-mono tabular-nums focus:outline-none focus:border-blue-500"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] text-slate-600 dark:text-slate-400 mb-0.5">ราคาขาย/หน่วย</label>
                              <input
                                type="number"
                                min={0}
                                step="0.01"
                                value={it.unit_price ?? 0}
                                onChange={(e) => handleUpdateItemUnitPrice(idx, parseFloat(e.target.value) || 0)}
                                className="w-full rounded-lg px-2 py-1.5 text-xs bg-white dark:bg-slate-800 text-emerald-700 dark:text-emerald-300 border border-slate-300 dark:border-slate-700 font-mono tabular-nums focus:outline-none focus:border-blue-500"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] text-slate-600 dark:text-slate-400 mb-0.5">GP รายการ</label>
                              <div className={`w-full rounded-lg px-2 py-1.5 text-xs font-mono font-bold tabular-nums border ${isBelowCost
                                ? 'bg-rose-100 border-rose-300 text-rose-900 dark:bg-rose-500/10 dark:border-rose-500/30 dark:text-rose-300'
                                : 'bg-emerald-100 border-emerald-300 text-emerald-900 dark:bg-emerald-500/10 dark:border-emerald-500/30 dark:text-emerald-300'
                                }`}>
                                ฿{lineGp.toLocaleString('th-TH', { maximumFractionDigits: 0 })}
                              </div>
                            </div>
                          </div>

                          {/* Warranty selector */}
                          <div className="flex items-center gap-2 flex-wrap pt-1">
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-600 dark:text-slate-400">
                              <ShieldCheck className="w-3 h-3 text-blue-600 dark:text-blue-400" />
                              <span>ประกัน:</span>
                            </span>
                            {WARRANTY_PRESET_YEARS.map((y) => (
                              <button
                                key={y}
                                type="button"
                                onClick={() => handleUpdateItemWarranty(idx, y)}
                                className={`px-2 py-1 rounded-lg text-[10px] font-bold border transition active:scale-[0.97] cursor-pointer ${(it.warranty_years ?? 0) === y
                                  ? 'bg-blue-100 border-blue-400 text-blue-900 dark:bg-blue-500/20 dark:border-blue-500/50 dark:text-blue-300'
                                  : 'bg-white dark:bg-white/[0.02] border-slate-300 dark:border-white/[0.08] text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                                  }`}
                              >
                                {y} ปี
                              </button>
                            ))}
                            <input
                              type="number"
                              min={0}
                              value={it.warranty_years ?? 0}
                              onChange={(e) => handleUpdateItemWarranty(idx, parseInt(e.target.value) || 0)}
                              className="w-16 rounded-lg px-2 py-1 text-[10px] bg-white dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-300 dark:border-slate-700 font-mono tabular-nums focus:outline-none focus:border-blue-500"
                            />
                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-amber-100 border border-amber-300 text-amber-900 dark:bg-amber-500/10 dark:border-amber-500/30 text-[9px] font-semibold dark:text-amber-300">
                              <Calendar className="w-2.5 h-2.5" />
                              เริ่มนับประกันตั้งแต่วันแปะวอย
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Extra Job Cost */}
                <div className="mt-3">
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">ค่าใช้จ่ายเพิ่มเติม / ค่าดำเนินการ (Extra Cost)</label>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={extraJobCost}
                    onChange={(e) => setExtraJobCost(parseFloat(e.target.value) || 0)}
                    className="w-full rounded-xl px-3 py-2 text-xs bg-white dark:bg-slate-800 text-amber-700 dark:text-amber-300 border border-slate-300 dark:border-slate-700 font-mono tabular-nums focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              {/* Section 6: Live GP Summary */}
              <div className="pt-3 border-t border-slate-200 dark:border-white/[0.06]">
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
                  <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700">
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 mb-0.5">ยอดขายรวม (Revenue)</p>
                    <p className="text-sm font-extrabold text-slate-900 dark:text-white font-mono tabular-nums">฿{modalTotalAmount.toLocaleString('th-TH', { maximumFractionDigits: 0 })}</p>
                  </div>
                  <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700">
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 mb-0.5">ต้นทุนรวม (Cost)</p>
                    <p className="text-sm font-extrabold text-amber-700 dark:text-amber-300 font-mono tabular-nums">฿{financials.totalCost.toLocaleString('th-TH', { maximumFractionDigits: 0 })}</p>
                  </div>
                  <div className={`p-3 rounded-2xl border ${financials.gp < 0 ? 'bg-rose-100 border-rose-300 dark:bg-rose-500/10 dark:border-rose-500/30' : 'bg-emerald-100 border-emerald-300 dark:bg-emerald-500/10 dark:border-emerald-500/30'}`}>
                    <p className="text-[10px] text-slate-600 dark:text-slate-400 mb-0.5">กำไรขั้นต้น (GP)</p>
                    <p className={`text-sm font-extrabold font-mono tabular-nums ${financials.gp < 0 ? 'text-rose-800 dark:text-rose-300' : 'text-emerald-800 dark:text-emerald-300'}`}>฿{financials.gp.toLocaleString('th-TH', { maximumFractionDigits: 0 })}</p>
                  </div>
                  <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700">
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 mb-0.5">อัตรากำไร (Margin)</p>
                    <p className={`text-sm font-extrabold font-mono tabular-nums ${financials.marginPct < 0 ? 'text-rose-700 dark:text-rose-300' : 'text-blue-700 dark:text-blue-300'}`}>{financials.marginPct.toFixed(1)}%</p>
                  </div>
                </div>

                {financials.belowCost && (
                  <div className="mt-2.5 p-2.5 rounded-xl bg-rose-100 border border-rose-300 text-rose-900 dark:bg-rose-500/10 dark:border-rose-500/30 dark:text-rose-300 flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400 flex-shrink-0 mt-0.5" />
                    <p className="text-[11px]">ราคาขายต่ำกว่าต้นทุน — ตรวจสอบราคาก่อนยืนยันบิล</p>
                  </div>
                )}
                {financials.lowMargin && (
                  <div className="mt-2.5 p-2.5 rounded-xl bg-amber-100 border border-amber-300 text-amber-900 dark:bg-amber-500/10 dark:border-amber-500/30 dark:text-amber-300 flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                    <p className="text-[11px]">อัตรากำไรต่ำกว่า 10% — พิจารณาปรับราคาขาย</p>
                  </div>
                )}
              </div>

              {/* Footer Actions */}
              <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={handleCloseCreateModal}
                  className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-white/[0.04] hover:bg-slate-200 dark:hover:bg-white/[0.08] border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold transition active:scale-[0.97] cursor-pointer"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={orderItems.length === 0}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-[#FF6B00] hover:bg-[#FF8A33] disabled:opacity-40 disabled:cursor-not-allowed text-black dark:text-white text-xs font-bold shadow-lg shadow-[#FF6B00]/30 transition active:scale-[0.97] cursor-pointer"
                >
                  <Send className="w-4 h-4" />
                  <span>ส่งใบสั่งขาย (Create Order)</span>
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* ========================================================================= */}
      {/* PRODUCT CATALOG MODAL (nested, z-[10000])                                  */}
      {/* ========================================================================= */}
      {isCatalogModalOpen && createPortal(
        <div className="fixed inset-0 z-[10000] flex items-end sm:items-center justify-center sm:p-4 bg-black/60 backdrop-blur-sm animate-fade-in overscroll-contain">
          <div className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-800 shadow-2xl rounded-t-3xl sm:rounded-3xl w-full sm:w-[94vw] max-w-6xl max-h-[94dvh] sm:max-h-[90vh] flex flex-col overflow-hidden pb-[env(safe-area-inset-bottom)] animate-modal-pop">
            <div className="sm:hidden flex justify-center pt-2.5 pb-1 flex-shrink-0">
              <span className="h-1.5 w-10 rounded-full bg-slate-300 dark:bg-white/20" />
            </div>

            {/* Header */}
            <div className="p-4 sm:p-5 bg-slate-50/90 dark:bg-slate-900/95 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 flex-shrink-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="p-2.5 rounded-2xl bg-[#FF6B00]/15 text-[#E65A00] dark:text-[#FF6B00] border border-[#FF6B00]/30">
                  <Layers className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white leading-tight">แคตตาล็อกสินค้า & บริการ</h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">เลือกสินค้าเข้าบิล หรือเพิ่ม/แก้ไขสินค้าในแคตตาล็อก</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsCatalogModalOpen(false)}
                aria-label="ปิดแคตตาล็อก"
                className="p-2.5 rounded-xl text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white bg-slate-100 dark:bg-white/[0.04] hover:bg-slate-200 dark:hover:bg-white/[0.08] transition min-w-[44px] min-h-[44px] flex items-center justify-center flex-shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Toolbar: search / category / sort / add */}
            <div className="p-3 sm:p-4 border-b border-slate-200 dark:border-white/[0.06] space-y-2.5 flex-shrink-0">
              <div className="flex flex-col sm:flex-row gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-500" />
                  <input
                    type="text"
                    placeholder="ค้นหาชื่อสินค้า..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full rounded-xl pl-9 pr-3 py-2 text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-300 dark:border-slate-700 placeholder-slate-400 focus:outline-none focus:border-blue-500"
                  />
                </div>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                  className="rounded-xl px-3 py-2 text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-300 dark:border-slate-700 focus:outline-none focus:border-blue-500"
                >
                  <option value="stock_desc" className="bg-white dark:bg-[#12141A]">สต๊อกมาก → น้อย</option>
                  <option value="stock_asc" className="bg-white dark:bg-[#12141A]">สต๊อกน้อย → มาก</option>
                  <option value="price_desc" className="bg-white dark:bg-[#12141A]">ราคาแพง → ถูก</option>
                  <option value="price_asc" className="bg-white dark:bg-[#12141A]">ราคาถูก → แพง</option>
                  <option value="name" className="bg-white dark:bg-[#12141A]">ชื่อ ก-ฮ</option>
                </select>
                <button
                  type="button"
                  onClick={() => { setIsAddingNewToCatalog(true); setEditingProductId(null); setProductForm(emptyProductForm()); }}
                  className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-100 hover:bg-emerald-200 border border-emerald-300 text-emerald-900 dark:bg-emerald-500/15 dark:hover:bg-emerald-500/25 dark:border-emerald-500/40 dark:text-emerald-300 text-[11px] font-bold transition active:scale-[0.97] cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>เพิ่มสินค้าใหม่</span>
                </button>
              </div>

              <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
                {(['all', 'pc_notebook', 'printer', 'cctv_network', 'service', 'general'] as ('all' | ProductCategory)[]).map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setCategoryFilter(cat)}
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border whitespace-nowrap transition active:scale-[0.97] cursor-pointer ${categoryFilter === cat
                      ? 'bg-[#FF6B00]/15 dark:bg-[#FF6B00]/20 border-[#FF6B00]/60 dark:border-[#FF6B00]/50 text-[#C2410C] dark:text-[#FF6B00]'
                      : 'bg-slate-100 dark:bg-white/[0.02] border-slate-200 dark:border-white/[0.08] text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                      }`}
                  >
                    {cat === 'all' ? 'ทั้งหมด' : PRODUCT_CATEGORY_LABELS[cat]}
                  </button>
                ))}
              </div>
            </div>

            {/* Add / Edit product form */}
            {isAddingNewToCatalog && (
              <form onSubmit={handleSaveProduct} className="p-3 sm:p-4 border-b border-slate-200 dark:border-white/[0.06] bg-slate-50 dark:bg-white/[0.02] space-y-2.5 flex-shrink-0">
                <p className="text-xs font-bold text-slate-900 dark:text-white">{editingProductId ? 'แก้ไขสินค้าในแคตตาล็อก' : 'เพิ่มสินค้าใหม่เข้าแคตตาล็อก'}</p>
                <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
                  <input
                    type="text"
                    required
                    placeholder="ชื่อสินค้า / บริการ *"
                    value={productForm.name}
                    onChange={(e) => setProductForm(p => ({ ...p, name: e.target.value }))}
                    className="col-span-2 lg:col-span-1 rounded-lg px-2.5 py-1.5 text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-300 dark:border-slate-700 placeholder-slate-400 focus:outline-none focus:border-blue-500"
                  />
                  <select
                    value={productForm.category}
                    onChange={(e) => setProductForm(p => ({ ...p, category: e.target.value as ProductCategory }))}
                    className="rounded-lg px-2.5 py-1.5 text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-300 dark:border-slate-700 focus:outline-none focus:border-blue-500"
                  >
                    {(Object.keys(PRODUCT_CATEGORY_LABELS) as ProductCategory[]).map((c) => (
                      <option key={c} value={c} className="bg-white dark:bg-[#12141A]">{PRODUCT_CATEGORY_LABELS[c]}</option>
                    ))}
                  </select>
                  <select
                    value={productForm.item_type}
                    onChange={(e) => setProductForm(p => ({ ...p, item_type: e.target.value as 'hardware' | 'service' }))}
                    className="rounded-lg px-2.5 py-1.5 text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-300 dark:border-slate-700 focus:outline-none focus:border-blue-500"
                  >
                    <option value="hardware" className="bg-white dark:bg-[#12141A]">อุปกรณ์ (Hardware)</option>
                    <option value="service" className="bg-white dark:bg-[#12141A]">ค่าบริการ (Service)</option>
                  </select>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    placeholder="ราคาทุน"
                    value={productForm.cost_price}
                    onChange={(e) => setProductForm(p => ({ ...p, cost_price: parseFloat(e.target.value) || 0 }))}
                    className="rounded-lg px-2.5 py-1.5 text-xs bg-white dark:bg-slate-800 text-amber-700 dark:text-amber-300 border border-slate-300 dark:border-slate-700 font-mono focus:outline-none focus:border-blue-500"
                  />
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    placeholder="ราคาขาย"
                    value={productForm.sell_price}
                    onChange={(e) => setProductForm(p => ({ ...p, sell_price: parseFloat(e.target.value) || 0 }))}
                    className="rounded-lg px-2.5 py-1.5 text-xs bg-white dark:bg-slate-800 text-emerald-700 dark:text-emerald-300 border border-slate-300 dark:border-slate-700 font-mono focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={handleCancelProductForm}
                    className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-white/[0.04] hover:bg-slate-200 dark:hover:bg-white/[0.08] border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-[11px] font-bold transition cursor-pointer"
                  >
                    ยกเลิก
                  </button>
                  <button
                    type="submit"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold transition active:scale-[0.97] cursor-pointer"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>{editingProductId ? 'บันทึกการแก้ไข' : 'เพิ่มสินค้า'}</span>
                  </button>
                </div>
              </form>
            )}

            {/* Product list */}
            <div className="flex-1 overflow-y-auto overscroll-contain p-3 sm:p-4">
              {filteredCatalog.length === 0 ? (
                <div className="p-8 text-center">
                  <ShoppingBag className="w-10 h-10 text-slate-400 dark:text-slate-600 mx-auto mb-2" />
                  <p className="text-xs text-slate-500 dark:text-slate-400">ไม่พบสินค้าที่ตรงกับเงื่อนไข</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                  {filteredCatalog.map((item) => {
                    const isSelected = modalSelectedMap[item.id] !== undefined;
                    const stockInfo = getStockInfo(item.name);
                    return (
                      <div
                        key={item.id}
                        onClick={() => handleToggleSelectModalItem(item)}
                        className={`p-3 rounded-2xl border transition-all duration-150 cursor-pointer active:scale-[0.98] ${isSelected
                          ? 'bg-[#FF6B00]/10 border-[#FF6B00]/50'
                          : 'bg-slate-50 dark:bg-slate-800/70 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-white/[0.05]'
                          }`}
                      >
                        <div className="flex items-start justify-between gap-2 mb-1.5">
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-bold text-slate-900 dark:text-white leading-snug truncate">{item.name}</p>
                            <p className="text-[10px] text-slate-500 dark:text-slate-400">{item.item_type === 'service' ? 'ค่าบริการ' : 'อุปกรณ์'} • {item.unit}</p>
                          </div>
                          <div className={`w-5 h-5 rounded-md border flex items-center justify-center flex-shrink-0 ${isSelected ? 'bg-[#FF6B00] border-[#FF6B00]' : 'border-slate-300 dark:border-white/20'
                            }`}>
                            {isSelected && <Check className="w-3.5 h-3.5 text-white" />}
                          </div>
                        </div>
                        <div className="flex items-center justify-between gap-2 text-[10px]">
                          <span className="text-emerald-700 dark:text-emerald-300 font-mono font-bold tabular-nums">฿{item.sell_price.toLocaleString('th-TH')}</span>
                          <span className={`font-mono tabular-nums ${stockInfo.inStock > 0 ? 'text-blue-700 dark:text-blue-300' : 'text-slate-500'}`}>
                            สต๊อก: {stockInfo.inStock}
                          </span>
                        </div>
                        {isSelected && (
                          <div className="mt-2 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                            <span className="text-[10px] text-slate-600 dark:text-slate-400">จำนวน:</span>
                            <input
                              type="number"
                              min={1}
                              value={modalSelectedMap[item.id]}
                              onChange={(e) => handleUpdateModalItemQty(item.id, parseInt(e.target.value) || 1)}
                              className="w-16 rounded-lg px-2 py-1 text-[11px] bg-white dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-300 dark:border-slate-700 font-mono tabular-nums focus:outline-none focus:border-blue-500"
                            />
                            <div className="ml-auto flex items-center gap-1">
                              <button
                                type="button"
                                onClick={(e) => handleStartEditProduct(item, e)}
                                aria-label="แก้ไขสินค้า"
                                className="p-1 rounded-md text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white bg-slate-200 dark:bg-white/[0.04] hover:bg-slate-300 dark:hover:bg-white/[0.08] transition cursor-pointer"
                              >
                                <Pencil className="w-3 h-3" />
                              </button>
                              <button
                                type="button"
                                onClick={(e) => handleDeleteCatalogItem(item.id, item.name, e)}
                                aria-label="ลบสินค้า"
                                className="p-1 rounded-md text-rose-600 dark:text-rose-400 hover:text-rose-700 dark:hover:text-rose-300 bg-rose-100 dark:bg-rose-500/10 hover:bg-rose-200 dark:hover:bg-rose-500/20 transition cursor-pointer"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-3 sm:p-4 bg-slate-50/90 dark:bg-slate-900/95 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 flex-shrink-0">
              <div className="text-[11px] text-slate-600 dark:text-slate-400">
                เลือกแล้ว <strong className="text-[#E65A00] dark:text-[#FF6B00] font-mono">{selectedCount}</strong> รายการ
                {selectedCount > 0 && <span className="ml-1 font-mono text-emerald-700 dark:text-emerald-300">• ฿{modalTotalAmount.toLocaleString('th-TH', { maximumFractionDigits: 0 })}</span>}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsCatalogModalOpen(false)}
                  className="px-3 py-2 rounded-xl bg-slate-100 dark:bg-white/[0.04] hover:bg-slate-200 dark:hover:bg-white/[0.08] border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold transition active:scale-[0.97] cursor-pointer"
                >
                  ยกเลิก
                </button>
                <button
                  type="button"
                  onClick={handleConfirmModalSelection}
                  disabled={selectedCount === 0}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#FF6B00] hover:bg-[#FF8A33] disabled:opacity-40 disabled:cursor-not-allowed text-black dark:text-white text-xs font-bold shadow-lg shadow-[#FF6B00]/30 transition active:scale-[0.97] cursor-pointer"
                >
                  <Check className="w-4 h-4" />
                  <span>เพิ่มเข้าบิล ({selectedCount})</span>
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ========================================================================= */}
      {/* SALES ORDER DETAIL & TIMELINE MODAL (z-[9999])                             */}
      {/* ========================================================================= */}
      {detailOrder && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center sm:p-4 bg-black/60 backdrop-blur-sm animate-fade-in overscroll-contain">
          <div className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-800 shadow-2xl rounded-t-3xl sm:rounded-3xl w-full sm:w-[92vw] max-w-3xl max-h-[94dvh] sm:max-h-[90vh] flex flex-col overflow-hidden pb-[env(safe-area-inset-bottom)] animate-modal-pop">
            <div className="sm:hidden flex justify-center pt-2.5 pb-1 flex-shrink-0">
              <span className="h-1.5 w-10 rounded-full bg-slate-300 dark:bg-white/20" />
            </div>

            {/* Header */}
            <div className="p-4 sm:p-5 bg-slate-50/90 dark:bg-slate-900/95 border-b border-slate-200 dark:border-slate-800 flex items-start justify-between gap-2 flex-shrink-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="p-2.5 rounded-2xl bg-[#FF6B00]/15 text-[#E65A00] dark:text-[#FF6B00] border border-[#FF6B00]/30">
                  <Receipt className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white leading-tight truncate">{detailOrder.customer_name}</h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">{detailOrder.sales_ref || detailOrder.id}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDetailOrder(null)}
                aria-label="ปิดรายละเอียดออเดอร์"
                className="p-2.5 rounded-xl text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white bg-slate-100 dark:bg-white/[0.04] hover:bg-slate-200 dark:hover:bg-white/[0.08] transition min-w-[44px] min-h-[44px] flex items-center justify-center flex-shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto overscroll-contain p-4 sm:p-5 space-y-4">
              {/* Status + meta badges */}
              <div className="flex items-center gap-2 flex-wrap">
                {getOrderStatusBadge(detailOrder.order_status)}
                {detailOrder.delivery_mode && (
                  <span className={`px-2.5 py-1 rounded-full text-[10px] font-semibold border ${DELIVERY_MODE_META[detailOrder.delivery_mode].cls}`}>
                    {DELIVERY_MODE_META[detailOrder.delivery_mode].label}
                  </span>
                )}
                {detailOrder.route_code && (
                  <span className="px-2.5 py-1 rounded-full text-[10px] font-semibold bg-slate-100 dark:bg-white/[0.06] text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-white/[0.1]">
                    {ROUTE_DEFINITIONS[detailOrder.route_code].name}
                  </span>
                )}
              </div>

              {/* Customer info grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700">
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 mb-0.5">เบอร์โทรลูกค้า</p>
                  <p className="text-xs font-semibold text-slate-900 dark:text-white font-mono">{detailOrder.customer_phone || '-'}</p>
                </div>
                <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700">
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 mb-0.5">วันที่ส่งมอบ</p>
                  <p className="text-xs font-semibold text-slate-900 dark:text-white font-mono">{detailOrder.delivery_date || '-'}</p>
                </div>
                <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 sm:col-span-2">
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 mb-0.5">ที่อยู่จัดส่ง / หน้างาน</p>
                  <p className="text-xs font-semibold text-slate-900 dark:text-white">{detailOrder.delivery_location || '-'}</p>
                  {detailOrder.site_notes && <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-1">หมายเหตุ: {detailOrder.site_notes}</p>}
                </div>
                <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700">
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 mb-0.5">ผู้เปิดบิล</p>
                  <p className="text-xs font-semibold text-slate-900 dark:text-white">{detailOrder.salesperson || detailOrder.created_by || '-'}</p>
                </div>
                <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700">
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 mb-0.5">เปิดบิลเมื่อ</p>
                  <p className="text-xs font-semibold text-slate-900 dark:text-white font-mono">{formatThaiDateTime(detailOrder.created_at_log || detailOrder.created_at)}</p>
                </div>
              </div>

              {/* Itemized breakdown */}
              <div>
                <p className="text-xs font-bold text-slate-900 dark:text-white mb-2 flex items-center gap-1.5">
                  <Package className="w-3.5 h-3.5 text-[#FF6B00]" />
                  <span>รายการสินค้า ({(detailOrder.items_list || []).length} รายการ)</span>
                </p>
                <div className="space-y-2">
                  {(detailOrder.items_list || []).map((it, idx) => {
                    const lineTotal = (it.unit_price || 0) * (it.quantity || 1);
                    const lineGp = lineTotal - (it.unit_cost || 0) * (it.quantity || 1);
                    return (
                      <div key={idx} className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-bold text-slate-900 dark:text-white truncate">{it.model_name}</p>
                            <p className="text-[10px] text-slate-500 dark:text-slate-400">
                              {it.quantity} × ฿{(it.unit_price || 0).toLocaleString('th-TH')}
                              {it.warranty_years ? ` • ประกัน ${it.warranty_years} ปี` : ' • ไม่มีประกัน'}
                            </p>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <p className="text-xs font-bold text-slate-900 dark:text-white font-mono tabular-nums">฿{lineTotal.toLocaleString('th-TH', { maximumFractionDigits: 0 })}</p>
                            <p className={`text-[10px] font-mono tabular-nums ${lineGp < 0 ? 'text-rose-700 dark:text-rose-400' : 'text-emerald-700 dark:text-emerald-400'}`}>GP ฿{lineGp.toLocaleString('th-TH', { maximumFractionDigits: 0 })}</p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Financial summary */}
              <div className="grid grid-cols-2 gap-2.5">
                <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700">
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 mb-0.5">ยอดขายรวม</p>
                  <p className="text-sm font-extrabold text-slate-900 dark:text-white font-mono tabular-nums">฿{orderTotal(detailOrder).toLocaleString('th-TH', { maximumFractionDigits: 0 })}</p>
                </div>
                <div className="p-3 rounded-2xl bg-emerald-100 border border-emerald-300 dark:bg-emerald-500/10 dark:border-emerald-500/30">
                  <p className="text-[10px] text-slate-600 dark:text-slate-400 mb-0.5">กำไรขั้นต้น (GP)</p>
                  <p className="text-sm font-extrabold text-emerald-800 dark:text-emerald-300 font-mono tabular-nums">฿{orderGp(detailOrder).toLocaleString('th-TH', { maximumFractionDigits: 0 })}</p>
                </div>
              </div>

              {/* Activity logs (collapsible) */}
              {detailOrder.activity_logs && detailOrder.activity_logs.length > 0 && (
                <details className="rounded-2xl bg-slate-50 dark:bg-white/[0.02] border border-slate-200 dark:border-white/[0.08] overflow-hidden">
                  <summary className="px-3 py-2.5 text-xs font-bold text-slate-700 dark:text-slate-300 cursor-pointer hover:text-slate-900 dark:hover:text-white transition select-none">
                    ประวัติการดำเนินการ ({detailOrder.activity_logs.length})
                  </summary>
                  <div className="px-3 pb-3">
                    <ActivityTimeline logs={detailOrder.activity_logs} />
                  </div>
                </details>
              )}
            </div>

            {/* Footer */}
            <div className="p-3 sm:p-4 bg-slate-50/90 dark:bg-slate-900/95 border-t border-slate-200 dark:border-slate-800 flex justify-end flex-shrink-0">
              <button
                type="button"
                onClick={() => setDetailOrder(null)}
                className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-white/[0.04] hover:bg-slate-200 dark:hover:bg-white/[0.08] border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold transition active:scale-[0.97] cursor-pointer"
              >
                ปิด
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};
