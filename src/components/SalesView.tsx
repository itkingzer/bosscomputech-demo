import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useApp } from '../context/AppContext';
import {
  FilePlus2, Send, ListOrdered, CheckCircle, Plus,
  Sparkles, Layers, Trash2, Calendar, CreditCard,
  FileText, Truck, Search, Filter, ShoppingBag, X, Check,
  UserCheck, Pencil, Lock, TrendingUp, AlertTriangle, Package
} from 'lucide-react';
import {
  ROUTE_DEFINITIONS, getRouteByDistrict, RouteCode, BillType, PaymentTerm, DeliveryMode, OrderItem,
  Product, ProductCategory, ProductUnit, PRODUCT_CATEGORY_LABELS, PRODUCT_UNIT_OPTIONS
} from '../types';

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

export const SalesView: React.FC = () => {
  const { orders, createOrder, currentUser, products, addProduct, updateProduct, deleteProduct } = useApp();

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

  // Modal State for Product Selection & Catalog Management
  const [isCatalogModalOpen, setIsCatalogModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'all' | ProductCategory>('all');

  // Selected items inside the Modal: mapping productId -> quantity
  const [modalSelectedMap, setModalSelectedMap] = useState<Record<string, number>>({});

  // Inline Add / Edit Product Form within Modal
  const [isAddingNewToCatalog, setIsAddingNewToCatalog] = useState(false);
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [productForm, setProductForm] = useState(emptyProductForm());

  const [toast, setToast] = useState('');

  // คำนวณสายรถอัตโนมัติตามอำเภอที่เลือก
  const currentRouteCode: RouteCode = getRouteByDistrict(district);
  const routeMeta = ROUTE_DEFINITIONS[currentRouteCode];

  // Lock background scroll while the catalog modal is open
  useEffect(() => {
    if (!isCatalogModalOpen) return;

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
  }, [isCatalogModalOpen]);

  // Open Modal
  const handleOpenCatalogModal = () => {
    setModalSelectedMap({});
    setSearchQuery('');
    setCategoryFilter('all');
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

  // Confirm selected items from Modal back to White Sheet
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
          unit_cost: catItem.cost_price
        });
      }
    });

    setOrderItems(prev => [...prev, ...itemsToAdd]);

    setIsCatalogModalOpen(false);
    setToast(`เพิ่ม ${itemsToAdd.length} รายการเข้าตารางใบขาวเรียบร้อยแล้ว`);
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

    setToast(`สร้างใบสั่งขาย (ใบขาว) รหัส ${salesRef} รวม ${totalQty} ชิ้น ส่งต่อจัดซื้อ & สต๊อกแล้ว`);
    setCustomerName('');
    setCustomerPhone('');
    setDeliveryLoc('');
    setSiteNotes('');
    setExtraJobCost(0);
    setOrderItems([]);
    setSalesRef(`SO-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`);
    setTimeout(() => setToast(''), 4500);
  };

  const getOrderStatusBadge = (status: string) => {
    switch (status) {
      case 'pending_purchasing':
        return <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-500/15 text-blue-400 border border-blue-500/30">รอจัดซื้อ/เช็กสต๊อก</span>;
      case 'waiting_po':
        return <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-purple-500/15 text-purple-400 border border-purple-500/30">รอสั่งซื้อของเข้า (รอ PO)</span>;
      case 'po_received_in_stock':
        return <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-teal-500/15 text-teal-400 border border-teal-500/30">ของเข้าสต๊อกแล้ว (รอช่างเตรียม)</span>;
      case 'approved_for_prep':
        return <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30">ตัดสต๊อกแล้ว (ช่างกำลังเตรียม)</span>;
      case 'fulfilled':
        return <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">ส่งมอบสมบูรณ์แล้ว</span>;
      default:
        return <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-white/10 text-slate-300">{status}</span>;
    }
  };

  // Filtered Catalog Items for Modal
  const filteredCatalog = products.filter(item => {
    const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = categoryFilter === 'all' || item.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

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

  return (
    <div className="space-y-6">
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 p-4 rounded-2xl liquid-glass border border-[#FF6B00] text-white text-xs flex items-center gap-2 shadow-2xl animate-fade-in">
          <CheckCircle className="w-4 h-4 text-[#FF6B00]" />
          <span>{toast}</span>
        </div>
      )}

      {/* Header Form */}
      <div className="liquid-glass rounded-3xl p-6 sm:p-7 shadow-2xl border border-white/[0.08]">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 pb-4 border-b border-white/[0.08]">
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <div className="p-2 rounded-xl bg-[#FF6B00]/15 text-[#FF6B00] border border-[#FF6B00]/30">
                <FilePlus2 className="w-5 h-5" />
              </div>
              <span>ฝ่ายขาย (Sales) - ใบสั่งขาย / ORDER FORM 2026 (ใบขาว)</span>
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              สร้างใบสั่งขาย เลือกลิสต์สินค้า/บริการจากแคตตาล็อก ระบุราคาทุน-ราคาขาย และดูกำไร (GP) แบบเรียลไทม์
            </p>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            {/* Read-only salesperson badge (auto-tag จากผู้ใช้ที่ล็อกอิน) */}
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-[11px] font-semibold text-emerald-300">
              <UserCheck className="w-3.5 h-3.5" />
              <span>ผู้เปิดบิล: <strong className="text-emerald-200">{salespersonName}</strong></span>
            </span>
            <span className="font-mono text-xs px-3 py-1.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-slate-300">
              เลขที่เอกสาร: <strong className="text-[#FF6B00]">{salesRef}</strong>
            </span>
          </div>
        </div>

        <form onSubmit={handleSubmitOrder} className="space-y-5">
          {/* Section 1: Customer Details */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">ชื่อลูกค้า / บริษัท *</label>
              <input
                type="text"
                required
                placeholder="เช่น บจก. ซีทรานเฟอร์รี่ ดอนสัก"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                className="w-full liquid-glass-input rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">เบอร์โทรติดต่อลูกค้า *</label>
              <input
                type="text"
                required
                placeholder="08x-xxx-xxxx"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                className="w-full liquid-glass-input rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">อำเภอ / พื้นที่ (จัดสายรถอัตโนมัติ) *</label>
              <select
                value={district}
                onChange={(e) => setDistrict(e.target.value)}
                className="w-full liquid-glass-input rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
              >
                {DISTRICT_OPTIONS.map(opt => (
                  <option key={opt.district} value={opt.district} className="bg-[#12141A]">
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
                  className="w-full liquid-glass-input rounded-2xl px-3 py-2.5 text-xs text-amber-300 border-amber-500/50 focus:outline-none"
                />
              </div>
            )}
          </div>

          {/* Section 2: Delivery & Payment Details */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-3 border-t border-white/[0.06]">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1 flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                <span>วันที่ต้องการส่งมอบ *</span>
              </label>
              <input
                type="date"
                required
                value={deliveryDate}
                onChange={(e) => setDeliveryDate(e.target.value)}
                className="w-full liquid-glass-input rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1 flex items-center gap-1">
                <Truck className="w-3.5 h-3.5 text-slate-400" />
                <span>ประเภทการส่งมอบ (Delivery Mode) *</span>
              </label>
              <select
                value={deliveryMode}
                onChange={(e) => setDeliveryMode(e.target.value as DeliveryMode)}
                className="w-full liquid-glass-input rounded-xl px-3 py-2 text-xs text-white focus:outline-none font-semibold"
              >
                <option value="install" className="bg-[#12141A]">1. ส่งของพร้อมติดตั้ง (Onsite Install)</option>
                <option value="drop_off" className="bg-[#12141A]">2. ส่งของไม่ต้องติดตั้ง (Drop-off)</option>
                <option value="customer_pickup" className="bg-[#12141A]">3. ลูกค้ารับเองหน้าร้าน (Store Pickup)</option>
                <option value="project" className="bg-[#12141A]">4. งานโครงการ / รับเหมาติดตั้ง (Project)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1 flex items-center gap-1">
                <FileText className="w-3.5 h-3.5 text-slate-400" />
                <span>ประเภทบิล *</span>
              </label>
              <select
                value={billType}
                onChange={(e) => setBillType(e.target.value as BillType)}
                className="w-full liquid-glass-input rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
              >
                <option value="tax_invoice" className="bg-[#12141A]">ใบกำกับภาษีเต็มรูป (VAT 7%)</option>
                <option value="cash_bill_quotation" className="bg-[#12141A]">ใบเสนอราคา / บิลเงินสด</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1 flex items-center gap-1">
                <CreditCard className="w-3.5 h-3.5 text-slate-400" />
                <span>เงื่อนไขชำระเงิน *</span>
              </label>
              <select
                value={paymentTerm}
                onChange={(e) => setPaymentTerm(e.target.value as PaymentTerm)}
                className="w-full liquid-glass-input rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
              >
                <option value="cash" className="bg-[#12141A]">เงินสด / โอนเงิน (Cash/Transfer)</option>
                <option value="credit_30" className="bg-[#12141A]">เครดิต 30 วัน (Credit 30 Days)</option>
                <option value="project" className="bg-[#12141A]">งานโครงการ / มัดจำตามงวด (PROJECT)</option>
              </select>
            </div>
          </div>

          {/* Section 3: Delivery Location & Site Notes */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">ที่อยู่จัดส่ง / แผนที่หน้างาน *</label>
              <input
                type="text"
                required
                placeholder="เช่น เลขที่ 123 หมู่ 2 ถ.สุราษฎร์-พุนพิน ต.ท่าข้าม"
                value={deliveryLoc}
                onChange={(e) => setDeliveryLoc(e.target.value)}
                className="w-full liquid-glass-input rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">หมายเหตุหน้างาน (Site Notes)</label>
              <input
                type="text"
                placeholder="เช่น อาคาร 3 ชั้น 2 ต้องมีบันได 2 เมตร, เข้าติดตั้งก่อน 10:00 น."
                value={siteNotes}
                onChange={(e) => setSiteNotes(e.target.value)}
                className="w-full liquid-glass-input rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
              />
            </div>
          </div>

          {/* Section 4: Items in this Order (ใบขาวมีหลายรายการ) */}
          <div className="p-5 rounded-2xl bg-white/[0.02] border border-white/[0.06] space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <span className="text-xs font-bold text-white flex items-center gap-1.5">
                  <Layers className="w-4 h-4 text-[#FF6B00]" />
                  <span>รายการสินค้า & บริการในบิลนี้ ({orderItems.length} รายการ)</span>
                </span>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  รวม {orderItems.reduce((sum, item) => sum + item.quantity, 0)} หน่วย | ยอดขายรวม: <strong className="text-emerald-400 font-mono">{fmt(financials.revenue)} บาท</strong>
                </p>
              </div>

              {/* Big Button to open Product Selection Modal */}
              <button
                type="button"
                onClick={handleOpenCatalogModal}
                className="w-full sm:w-auto px-4 py-2.5 min-h-[44px] rounded-xl bg-gradient-to-r from-[#FF6B00] to-[#E65A00] hover:from-[#FF8A24] text-black font-extrabold text-xs transition cursor-pointer flex items-center justify-center gap-2 shadow-lg shadow-[#FF6B00]/25 border border-white/20 active:scale-95"
              >
                <Plus className="w-4 h-4" />
                <span>+ เลือกสินค้า / จัดการแคตตาล็อก</span>
              </button>
            </div>

            {/* Existing Items Table */}
            {orderItems.length === 0 ? (
              <div className="text-center py-8 text-slate-500 border border-dashed border-white/[0.1] rounded-xl text-xs">
                ยังไม่มีรายการในบิล กดปุ่มด้านบนเพื่อเลือกสินค้า/บริการจากแคตตาล็อก
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-white/[0.06]">
                <table className="w-full text-left text-xs">
                  <thead className="bg-white/[0.04] text-slate-400 border-b border-white/[0.06]">
                    <tr>
                      <th className="py-2.5 px-3">#</th>
                      <th className="py-2.5 px-3">ประเภท</th>
                      <th className="py-2.5 px-3">รุ่นสินค้า / รายการบริการ</th>
                      <th className="py-2.5 px-3 text-right">ราคาทุน/หน่วย</th>
                      <th className="py-2.5 px-3 text-right">ราคาขาย/หน่วย</th>
                      <th className="py-2.5 px-3 text-center w-24">จำนวน</th>
                      <th className="py-2.5 px-3 text-right">กำไร/รายการ</th>
                      <th className="py-2.5 px-3 text-right">รวมเงิน</th>
                      <th className="py-2.5 px-3 text-right w-12">ลบ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.04]">
                    {orderItems.map((item, idx) => {
                      const rowTotal = (item.unit_price || 0) * item.quantity;
                      const rowProfit = ((item.unit_price || 0) - (item.unit_cost || 0)) * item.quantity;
                      return (
                        <tr key={idx} className="hover:bg-white/[0.02]">
                          <td className="py-2.5 px-3 text-slate-500 font-mono">{idx + 1}</td>
                          <td className="py-2.5 px-3 whitespace-nowrap">
                            {item.item_type === 'service' ? (
                              <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-purple-500/15 text-purple-400 border border-purple-500/30">
                                🛠️ ค่าแรง/บริการ
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-blue-500/15 text-blue-400 border border-blue-500/30">
                                📦 วัสดุ/อุปกรณ์
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 font-semibold text-white">
                            {item.model_name}
                            {item.unit && <span className="ml-1 text-[10px] text-slate-500">({item.unit})</span>}
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            <input
                              type="number"
                              min={0}
                              value={item.unit_cost !== undefined ? item.unit_cost : 0}
                              onChange={(e) => handleUpdateItemUnitCost(idx, parseFloat(e.target.value) || 0)}
                              className="w-24 text-right liquid-glass-input rounded-lg px-2 py-1 text-xs text-rose-300 font-mono font-bold"
                            />
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            <input
                              type="number"
                              min={0}
                              value={item.unit_price !== undefined ? item.unit_price : 0}
                              onChange={(e) => handleUpdateItemUnitPrice(idx, parseFloat(e.target.value) || 0)}
                              className="w-24 text-right liquid-glass-input rounded-lg px-2 py-1 text-xs text-emerald-400 font-mono font-bold"
                            />
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <input
                              type="number"
                              min={1}
                              value={item.quantity}
                              onChange={(e) => handleUpdateItemQuantity(idx, parseInt(e.target.value) || 1)}
                              className="w-16 text-center liquid-glass-input rounded-lg px-2 py-1 text-xs text-[#FF6B00] font-bold"
                            />
                          </td>
                          <td className={`py-2.5 px-3 text-right font-mono font-bold ${rowProfit >= 0 ? 'text-[#FF6B00]' : 'text-rose-400'}`}>
                            {fmt(rowProfit)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono font-bold text-white">
                            {fmt(rowTotal)}
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            <button
                              type="button"
                              onClick={() => handleRemoveItemFromOrder(idx)}
                              className="text-slate-500 hover:text-rose-400 transition cursor-pointer p-1"
                              title="ลบรายการ"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Extra Job Cost */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2 border-t border-white/[0.06]">
              <label className="text-[11px] text-slate-300 flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-rose-400" />
                <span>ต้นทุนแฝง / ค่าดำเนินการหน้างาน (Extra Job Cost) - ภายในเท่านั้น</span>
              </label>
              <input
                type="number"
                min={0}
                placeholder="0"
                value={extraJobCost || ''}
                onChange={(e) => setExtraJobCost(parseFloat(e.target.value) || 0)}
                className="w-full sm:w-40 liquid-glass-input rounded-lg px-2 py-1 text-xs text-rose-300 font-mono font-bold focus:outline-none"
              />
            </div>
          </div>

          {/* Section 5: Live Order Financial Summary (INTERNAL ONLY) */}
          <div className="p-5 rounded-2xl bg-gradient-to-br from-white/[0.04] to-white/[0.01] border border-white/[0.08] space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-white flex items-center gap-1.5">
                <TrendingUp className="w-4 h-4 text-[#FF6B00]" />
                <span>สรุปการเงินออเดอร์ (ภายในเท่านั้น - ไม่แสดงในเอกสารลูกค้า)</span>
              </span>
              {financials.belowCost ? (
                <span className="px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-rose-500/20 text-rose-300 border border-rose-500/40 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  ขายต่ำกว่าทุน!
                </span>
              ) : financials.lowMargin ? (
                <span className="px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  กำไรต่ำกว่า {LOW_MARGIN_THRESHOLD}%
                </span>
              ) : financials.revenue > 0 ? (
                <span className="px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                  กำไรปกติ
                </span>
              ) : null}
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="rounded-xl p-3 bg-emerald-500/10 border border-emerald-500/25">
                <div className="text-[10px] text-slate-400 uppercase tracking-wide">ยอดขาย (ex-VAT)</div>
                <div className="text-base font-extrabold font-mono text-emerald-400">฿{fmt(financials.revenue)}</div>
              </div>
              <div className="rounded-xl p-3 bg-rose-500/10 border border-rose-500/25">
                <div className="text-[10px] text-slate-400 uppercase tracking-wide">ต้นทุนรวม</div>
                <div className="text-base font-extrabold font-mono text-rose-400">฿{fmt(financials.totalCost)}</div>
              </div>
              <div className={`rounded-xl p-3 border ${financials.gp >= 0 ? 'bg-[#FF6B00]/10 border-[#FF6B00]/25' : 'bg-rose-500/15 border-rose-500/40'}`}>
                <div className="text-[10px] text-slate-400 uppercase tracking-wide">กำไรขั้นต้น (GP)</div>
                <div className={`text-base font-extrabold font-mono ${financials.gp >= 0 ? 'text-[#FF6B00]' : 'text-rose-400'}`}>฿{fmt(financials.gp)}</div>
              </div>
              <div className={`rounded-xl p-3 border ${financials.belowCost || financials.lowMargin ? 'bg-amber-500/10 border-amber-500/30' : 'bg-sky-500/10 border-sky-500/25'}`}>
                <div className="text-[10px] text-slate-400 uppercase tracking-wide">Margin (%)</div>
                <div className={`text-base font-extrabold font-mono ${financials.belowCost ? 'text-rose-400' : financials.lowMargin ? 'text-amber-400' : 'text-sky-400'}`}>
                  {financials.marginPct.toFixed(1)}%
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              className="w-full sm:w-auto px-6 py-3 min-h-[44px] bg-gradient-to-r from-[#FF6B00] to-[#E65A00] hover:from-[#FF8A24] text-black font-extrabold rounded-2xl text-xs transition cursor-pointer flex items-center justify-center gap-2 shadow-xl shadow-[#FF6B00]/25 border border-white/20 active:scale-95"
            >
              <Send className="w-4 h-4" />
              <span>ส่งใบสั่งขาย (ใบขาว) เข้าฝ่ายจัดซื้อ & สต๊อก</span>
            </button>
          </div>
        </form>
      </div>

      {/* ========================================================================= */}
      {/* PRODUCT SELECTION & CATALOG MANAGEMENT MODAL                              */}
      {/* ========================================================================= */}
      {isCatalogModalOpen && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/75 backdrop-blur-md animate-fade-in overscroll-contain touch-none">
          <div className="liquid-glass rounded-2xl sm:rounded-3xl w-[95vw] sm:w-[90vw] max-w-4xl max-h-[85vh] flex flex-col shadow-2xl border border-white/[0.12] overflow-hidden">

            {/* Modal Header (sticky) */}
            <div className="sticky top-0 z-10 bg-white/95 dark:bg-[#12141A]/95 backdrop-blur-md p-4 sm:p-6 border-b border-slate-200 dark:border-white/[0.08] flex items-start sm:items-center justify-between gap-2 flex-shrink-0">
              <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                <div className="p-2.5 rounded-2xl bg-[#FF6B00]/15 text-[#FF6B00] border border-[#FF6B00]/30">
                  <ShoppingBag className="w-6 h-6" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm sm:text-base font-bold text-white leading-tight">แคตตาล็อกสินค้า & บริการ</h3>
                  <p className="text-[11px] sm:text-xs text-slate-400 hidden sm:block">
                    เพิ่ม/แก้ไข/ลบสินค้าพร้อมราคาทุน-ราคาขาย ติ๊กเลือกหลายรายการเข้าบิล
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsCatalogModalOpen(false)}
                aria-label="ปิดหน้าต่างเลือกสินค้า"
                className="p-2.5 rounded-xl text-slate-400 hover:text-white bg-white/[0.04] hover:bg-white/[0.08] transition min-w-[44px] min-h-[44px] flex items-center justify-center flex-shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Controls: Search, Filter, and Toggle New Item */}
            <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-white/[0.06] space-y-3 bg-slate-50 dark:bg-white/[0.02] flex-shrink-0">
              <div className="flex flex-col sm:flex-row items-center gap-3">
                <div className="relative flex-1 w-full">
                  <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                  <input
                    type="text"
                    placeholder="ค้นหาชื่อรุ่นสินค้า, รายการบริการ..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full liquid-glass-input rounded-xl pl-9 pr-3 py-2 text-xs text-white focus:outline-none"
                  />
                </div>

                <button
                  type="button"
                  onClick={() => {
                    if (isAddingNewToCatalog) {
                      handleCancelProductForm();
                    } else {
                      setEditingProductId(null);
                      setProductForm(emptyProductForm());
                      setIsAddingNewToCatalog(true);
                    }
                  }}
                  className="w-full sm:w-auto px-4 py-2 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 text-xs font-semibold whitespace-nowrap transition cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <Plus className="w-4 h-4" />
                  <span>{isAddingNewToCatalog ? 'ปิดฟอร์ม' : '+ เพิ่มสินค้า/บริการใหม่'}</span>
                </button>
              </div>

              {/* Category Filter Pills */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
                <span className="text-slate-400 text-[11px] mr-1 flex items-center gap-1">
                  <Filter className="w-3 h-3" />
                  หมวดหมู่:
                </span>
                {[
                  { id: 'all', label: 'ทั้งหมด' },
                  { id: 'pc_notebook', label: 'คอมพิวเตอร์ / โน้ตบุ๊ก' },
                  { id: 'printer', label: 'เครื่องพิมพ์ / สแกนเนอร์' },
                  { id: 'cctv_network', label: 'กล้องวงจรปิด / ระบบเครือข่าย' },
                  { id: 'service', label: 'ค่าแรง / บริการติดตั้ง' }
                ].map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setCategoryFilter(cat.id as any)}
                    className={`px-3 py-1 rounded-xl text-[11px] font-semibold whitespace-nowrap transition cursor-pointer ${categoryFilter === cat.id
                      ? 'bg-[#FF6B00] text-black shadow-md shadow-[#FF6B00]/25'
                      : 'bg-white/[0.04] text-slate-300 hover:text-white hover:bg-white/[0.08]'
                      }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>

              {/* Inline Form to Add / Edit Product */}
              {isAddingNewToCatalog && (
                <form onSubmit={handleSaveProduct} className="p-4 rounded-2xl bg-amber-50 dark:bg-white/[0.03] border border-amber-500/30 space-y-3 animate-fade-in">
                  <div className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-amber-400" />
                    <span>{editingProductId ? 'แก้ไขสินค้า/บริการในแคตตาล็อก' : 'เพิ่มสินค้า/บริการใหม่เข้าแคตตาล็อก'}</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 text-xs">
                    <div className="sm:col-span-2 lg:col-span-3">
                      <label className="block text-[11px] text-slate-300 mb-1">ชื่อรุ่น / รายการสินค้าหรือบริการ *</label>
                      <input
                        type="text"
                        required
                        placeholder="เช่น Dell OptiPlex 7010 Micro หรือ ค่าบริการลากสายไฟ 30m"
                        value={productForm.name}
                        onChange={(e) => setProductForm({ ...productForm, name: e.target.value })}
                        className="w-full liquid-glass-input rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-300 mb-1">หมวดหมู่</label>
                      <select
                        value={productForm.category}
                        onChange={(e) => {
                          const val = e.target.value as ProductCategory;
                          setProductForm({
                            ...productForm,
                            category: val,
                            item_type: val === 'service' ? 'service' : 'hardware'
                          });
                        }}
                        className="w-full liquid-glass-input rounded-xl px-2.5 py-1.5 text-xs text-white focus:outline-none"
                      >
                        {(Object.keys(PRODUCT_CATEGORY_LABELS) as ProductCategory[]).map((cat) => (
                          <option key={cat} value={cat} className="bg-white dark:bg-[#12141A]">{PRODUCT_CATEGORY_LABELS[cat]}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-300 mb-1">หน่วยนับ</label>
                      <select
                        value={productForm.unit}
                        onChange={(e) => setProductForm({ ...productForm, unit: e.target.value as ProductUnit })}
                        className="w-full liquid-glass-input rounded-xl px-2.5 py-1.5 text-xs text-white focus:outline-none"
                      >
                        {PRODUCT_UNIT_OPTIONS.map((u) => (
                          <option key={u} value={u} className="bg-white dark:bg-[#12141A]">{u}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] text-rose-300 mb-1">ราคาทุน (บาท)</label>
                      <input
                        type="number"
                        min={0}
                        placeholder="0"
                        value={productForm.cost_price || ''}
                        onChange={(e) => setProductForm({ ...productForm, cost_price: parseFloat(e.target.value) || 0 })}
                        className="w-full liquid-glass-input rounded-xl px-3 py-1.5 text-xs text-rose-300 font-mono font-bold focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-emerald-300 mb-1">ราคาขาย (บาท)</label>
                      <input
                        type="number"
                        min={0}
                        placeholder="0"
                        value={productForm.sell_price || ''}
                        onChange={(e) => setProductForm({ ...productForm, sell_price: parseFloat(e.target.value) || 0 })}
                        className="w-full liquid-glass-input rounded-xl px-3 py-1.5 text-xs text-emerald-400 font-mono font-bold focus:outline-none"
                      />
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={handleCancelProductForm}
                      className="px-3 py-1.5 rounded-xl text-xs text-slate-400 hover:text-white"
                    >
                      ยกเลิก
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-extrabold text-xs transition cursor-pointer"
                    >
                      {editingProductId ? 'บันทึกการแก้ไข' : 'บันทึกเข้าแคตตาล็อก'}
                    </button>
                  </div>
                </form>
              )}
            </div>

            {/* Modal Body: Multi-Select Table */}
            <div className="flex-1 overflow-y-auto overscroll-contain p-4 sm:p-5">
              {filteredCatalog.length === 0 ? (
                <div className="text-center py-12 text-slate-500 border border-dashed border-slate-300 dark:border-white/[0.08] rounded-2xl text-xs">
                  ไม่พบสินค้าหรือบริการที่ตรงกับเงื่อนไขการค้นหา
                </div>
              ) : (
                <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-white/[0.06]">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-100 dark:bg-white/[0.04] text-slate-600 dark:text-slate-400 border-b border-slate-200 dark:border-white/[0.06]">
                      <tr>
                        <th className="py-2.5 px-3 w-10 text-center">เลือก</th>
                        <th className="py-2.5 px-3">หมวดหมู่</th>
                        <th className="py-2.5 px-3">ชื่อสินค้า / บริการ</th>
                        <th className="py-2.5 px-3 text-right">ราคาทุน</th>
                        <th className="py-2.5 px-3 text-right">ราคาขาย</th>
                        <th className="py-2.5 px-3 text-center w-24">จำนวน</th>
                        <th className="py-2.5 px-3 text-right w-20">จัดการ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-white/[0.04]">
                      {filteredCatalog.map((item) => {
                        const isSelected = modalSelectedMap[item.id] !== undefined;
                        const qty = modalSelectedMap[item.id] || 1;

                        return (
                          <tr
                            key={item.id}
                            onClick={() => handleToggleSelectModalItem(item)}
                            className={`transition cursor-pointer ${isSelected
                              ? 'bg-[#FF6B00]/10 hover:bg-[#FF6B00]/15'
                              : 'hover:bg-slate-100 dark:hover:bg-white/[0.02]'
                              }`}
                          >
                            <td className="py-2.5 px-3 text-center">
                              <div className="flex items-center justify-center">
                                {isSelected ? (
                                  <div className="w-5 h-5 rounded-md bg-[#FF6B00] text-black flex items-center justify-center font-bold">
                                    <Check className="w-3.5 h-3.5" />
                                  </div>
                                ) : (
                                  <div className="w-5 h-5 rounded-md border border-slate-300 dark:border-white/20 bg-slate-100 dark:bg-white/[0.03]" />
                                )}
                              </div>
                            </td>
                            <td className="py-2.5 px-3 whitespace-nowrap">
                              {item.item_type === 'service' ? (
                                <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-purple-500/15 text-purple-400 border border-purple-500/30">
                                  🛠️ บริการ
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-blue-500/15 text-blue-400 border border-blue-500/30">
                                  📦 อุปกรณ์
                                </span>
                              )}
                            </td>
                            <td className="py-2.5 px-3 font-semibold text-white">
                              {item.name}
                              <span className="ml-1 text-[10px] text-slate-500">/ {item.unit}</span>
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono font-bold text-rose-300">
                              {fmt(item.cost_price)}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-400">
                              {fmt(item.sell_price)}
                            </td>
                            <td className="py-2.5 px-3 text-center" onClick={(e) => e.stopPropagation()}>
                              {isSelected ? (
                                <input
                                  type="number"
                                  min={1}
                                  value={qty}
                                  onChange={(e) => handleUpdateModalItemQty(item.id, parseInt(e.target.value) || 1)}
                                  className="w-16 text-center liquid-glass-input rounded-lg px-2 py-1 text-xs text-[#FF6B00] font-bold"
                                />
                              ) : (
                                <span className="text-slate-600 font-mono">-</span>
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-right" onClick={(e) => e.stopPropagation()}>
                              <div className="flex items-center justify-end gap-1">
                                <button
                                  type="button"
                                  onClick={(e) => handleStartEditProduct(item, e)}
                                  className="text-slate-500 hover:text-amber-400 transition cursor-pointer p-1"
                                  title="แก้ไขสินค้านี้"
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => handleDeleteCatalogItem(item.id, item.name, e)}
                                  className="text-slate-500 hover:text-rose-400 transition cursor-pointer p-1"
                                  title="ลบรายการนี้ออกจากแคตตาล็อก"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Modal Footer (sticky) */}
            <div className="sticky bottom-0 z-10 p-3 sm:p-5 border-t border-slate-200 dark:border-white/[0.08] flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 bg-white/95 dark:bg-[#12141A]/95 backdrop-blur-md pb-[max(0.75rem,env(safe-area-inset-bottom))] flex-shrink-0">
              <div className="text-xs text-slate-300 text-center sm:text-left">
                เลือกแล้ว <strong className="text-[#FF6B00] font-mono text-sm">{selectedCount}</strong> รายการ | ยอดขายรวม: <strong className="text-emerald-400 font-mono text-sm">{fmt(modalTotalAmount)} บาท</strong>
              </div>

              <div className="flex items-center gap-2.5 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => setIsCatalogModalOpen(false)}
                  className="w-full sm:w-auto px-4 py-2.5 rounded-xl text-xs text-slate-400 hover:text-white bg-white/[0.04] hover:bg-white/[0.08] transition min-h-[44px]"
                >
                  ยกเลิก
                </button>
                <button
                  type="button"
                  onClick={handleConfirmModalSelection}
                  disabled={selectedCount === 0}
                  className={`w-full sm:w-auto px-6 py-2.5 rounded-xl text-xs font-extrabold transition cursor-pointer flex items-center justify-center gap-2 shadow-xl min-h-[44px] ${selectedCount > 0
                    ? 'bg-gradient-to-r from-[#FF6B00] to-[#E65A00] hover:from-[#FF8A24] text-black shadow-[#FF6B00]/25 active:scale-95'
                    : 'bg-slate-200 dark:bg-white/10 text-slate-500 cursor-not-allowed'
                    }`}
                >
                  <Check className="w-4 h-4" />
                  <span>เพิ่มรายการที่ติ๊ก ({selectedCount}) เข้าใบขาว</span>
                </button>
              </div>
            </div>

          </div>
        </div>,
        document.body
      )}

      {/* Orders Tracking Table for Sales */}
      <div className="liquid-glass rounded-3xl p-6 sm:p-7 shadow-2xl border border-white/[0.08]">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <ListOrdered className="w-4 h-4 text-[#FF6B00]" />
            <span>ตารางติดตามสถานะออเดอร์ของฝ่ายขาย (Sales Order Tracking)</span>
          </h3>
          <span className="text-xs text-slate-400">{orders.length} ออเดอร์ทั้งหมด</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-white/[0.04] text-slate-400 border-b border-white/[0.06]">
              <tr>
                <th className="py-3 px-3 whitespace-nowrap">เลขที่ SO</th>
                <th className="py-3 px-3 whitespace-nowrap">ผู้เปิดบิล</th>
                <th className="py-3 px-3 whitespace-nowrap">ลูกค้า</th>
                <th className="py-3 px-3 whitespace-nowrap">สายรถ / อำเภอ</th>
                <th className="py-3 px-3 whitespace-nowrap">วันที่ส่งมอบ</th>
                <th className="py-3 px-3 whitespace-nowrap">การส่งมอบ</th>
                <th className="py-3 px-3 whitespace-nowrap">รายการสินค้า</th>
                <th className="py-3 px-3 whitespace-nowrap">เลขที่บิล</th>
                <th className="py-3 px-3 whitespace-nowrap text-right">สถานะ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {orders.map((ord) => {
                const rMeta = ord.route_code ? ROUTE_DEFINITIONS[ord.route_code] : null;
                return (
                  <tr key={ord.id} className="hover:bg-white/[0.02] transition">
                    <td className="py-3 px-3 font-mono font-bold text-[#FF6B00] whitespace-nowrap">
                      {ord.sales_ref || 'SO-AUTO'}
                    </td>
                    <td className="py-3 px-3 whitespace-nowrap">
                      <span className="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                        {ord.salesperson || '-'}
                      </span>
                    </td>
                    <td className="py-3 px-3 whitespace-nowrap">
                      <div className="font-semibold text-white">{ord.customer_name}</div>
                      <div className="text-[10px] text-slate-500">{ord.customer_phone || '-'}</div>
                    </td>
                    <td className="py-3 px-3 whitespace-nowrap">
                      {rMeta ? (
                        <span className={`px-2 py-0.5 rounded-lg text-[10px] font-bold border ${rMeta.badgeBg} ${rMeta.badgeBorder} ${rMeta.badgeText}`}>
                          {rMeta.shortName} ({ord.district || '-'})
                        </span>
                      ) : '-'}
                    </td>
                    <td className="py-3 px-3 font-mono text-slate-300 whitespace-nowrap">
                      {ord.delivery_date ? new Date(ord.delivery_date).toLocaleDateString('th-TH') : '-'}
                    </td>
                    <td className="py-3 px-3 whitespace-nowrap text-[11px]">
                      {ord.delivery_mode === 'install' && <span className="text-blue-400 font-semibold">ส่งพร้อมติดตั้ง</span>}
                      {ord.delivery_mode === 'drop_off' && <span className="text-emerald-400 font-semibold">ส่งไม่ต้องติดตั้ง</span>}
                      {ord.delivery_mode === 'customer_pickup' && <span className="text-amber-400 font-semibold">ลูกค้ารับเอง</span>}
                      {ord.delivery_mode === 'project' && (
                        <span className="px-2.5 py-0.5 rounded-full bg-gradient-to-r from-purple-500/20 to-orange-500/20 text-purple-300 border border-purple-500/40 font-extrabold shadow-sm">
                          ⚡ งานโครงการ (Project)
                        </span>
                      )}
                      {!ord.delivery_mode && <span className="text-slate-400">-</span>}
                    </td>
                    <td className="py-3 px-3 text-slate-300 max-w-xs truncate">
                      {ord.items_list && ord.items_list.length > 0
                        ? ord.items_list.map(it => `${it.model_name} (x${it.quantity})`).join(', ')
                        : (ord._planned_model ? `${ord._planned_model} (x${ord._planned_quantity || 1})` : '-')}
                    </td>
                    <td className="py-3 px-3 font-mono text-slate-400 whitespace-nowrap">
                      {ord.bill_no || <span className="text-slate-600">ยังไม่ออกบิล</span>}
                    </td>
                    <td className="py-3 px-3 text-right whitespace-nowrap">
                      {getOrderStatusBadge(ord.order_status)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
