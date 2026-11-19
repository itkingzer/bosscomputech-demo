import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import {
  FilePlus2, Send, ListOrdered, CheckCircle, Plus,
  Sparkles, Tag, Layers, MapPin, Navigation
} from 'lucide-react';
import { ROUTE_DEFINITIONS, getRouteByDistrict, RouteCode } from '../types';

const DISTRICT_OPTIONS = [
  // สาย 1 (โซนเหนือ)
  { district: 'พุนพิน', zone: 'สาย 1' },
  { district: 'ท่าฉาง', zone: 'สาย 1' },
  { district: 'ไชยา', zone: 'สาย 1' },
  { district: 'ท่าชนะ', zone: 'สาย 1' },
  // สาย 2 (โซนตะวันตก)
  { district: 'คีรีรัฐนิคม', zone: 'สาย 2' },
  { district: 'บ้านตาขุน', zone: 'สาย 2' },
  { district: 'พนม', zone: 'สาย 2' },
  // สาย 3 (โซนใต้)
  { district: 'บ้านนาเดิม', zone: 'สาย 3' },
  { district: 'บ้านนาสาร', zone: 'สาย 3' },
  { district: 'เวียงสระ', zone: 'สาย 3' },
  { district: 'พระแสง', zone: 'สาย 3' },
  // สาย 4 (โซนตะวันออก)
  { district: 'กาญจนดิษฐ์', zone: 'สาย 4' },
  { district: 'ดอนสัก', zone: 'สาย 4' },
  { district: 'ขนอม', zone: 'สาย 4' },
  // สาย 5 (ในเมือง / รอบเมือง)
  { district: 'เมืองสุราษฎร์ธานี', zone: 'สาย 5 (ในเมือง / รอบเมือง)' },
  // สาย 6 (ต่างจังหวัด / งานเหมาพิเศษ)
  { district: 'ต่างจังหวัด / งานเหมาพิเศษ', zone: 'สาย 6 (ต่างจังหวัด / ชั่วคราว)' }
];

const DEFAULT_PRESET_MODELS = [
  'BossComputech Core-i7 Workstation Pro',
  'BossComputech Mini POS Terminal X1',
  'BossComputech AI Edge Box Ultra',
  'BossComputech All-in-One Touch 21.5"',
  'BossComputech Rack Server 1U Standard'
];

export const SalesView: React.FC = () => {
  const { orders, items, createOrder } = useApp();

  // Custom Product Catalog
  const [productCatalog, setProductCatalog] = useState<string[]>(() => {
    const saved = localStorage.getItem('boss_custom_product_catalog');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        return DEFAULT_PRESET_MODELS;
      }
    }
    return DEFAULT_PRESET_MODELS;
  });

  // Sales Order Form Inputs
  const [customerName, setCustomerName] = useState('');
  const [district, setDistrict] = useState('เมืองสุราษฎร์ธานี');
  const [provinceCustom, setProvinceCustom] = useState('');
  const [deliveryLoc, setDeliveryLoc] = useState('');
  const [selectedModel, setSelectedModel] = useState(productCatalog[0] || '');
  const [quantity, setQuantity] = useState(1);
  const [salesRef, setSalesRef] = useState('');

  // Mode: เลือกจากรายการ หรือ พิมพ์สินค้าใหม่ที่ฝ่ายขายหามาได้ทันที
  const [isCustomNewProduct, setIsCustomNewProduct] = useState(false);
  const [customNewProductName, setCustomNewProductName] = useState('');

  // Modal จัดการแคตตาล็อก
  const [showCatalogModal, setShowCatalogModal] = useState(false);
  const [modalNewProductInput, setModalNewProductInput] = useState('');

  const [toast, setToast] = useState('');

  // คำนวณสายรถอัตโนมัติตามอำเภอที่เลือก
  const currentRouteCode: RouteCode = getRouteByDistrict(district);
  const routeMeta = ROUTE_DEFINITIONS[currentRouteCode];

  // Persist custom catalog
  useEffect(() => {
    localStorage.setItem('boss_custom_product_catalog', JSON.stringify(productCatalog));
  }, [productCatalog]);

  const handleAddProductToCatalog = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (productCatalog.some(p => p.toLowerCase() === trimmed.toLowerCase())) {
      alert('สินค้ารุ่นนี้มีอยู่ในรายการแล้ว');
      return;
    }
    const updated = [trimmed, ...productCatalog];
    setProductCatalog(updated);
    setSelectedModel(trimmed);
  };

  const handleRemoveProductFromCatalog = (name: string) => {
    if (productCatalog.length <= 1) {
      alert('ต้องมีสินค้าอย่างน้อย 1 รายการในระบบ');
      return;
    }
    const updated = productCatalog.filter(p => p !== name);
    setProductCatalog(updated);
    if (selectedModel === name) {
      setSelectedModel(updated[0]);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerName || !deliveryLoc) return;

    let finalModel = selectedModel;
    if (isCustomNewProduct) {
      if (!customNewProductName.trim()) {
        alert('กรุณากรอกชื่อสินค้าที่ฝ่ายขายหามาขาย');
        return;
      }
      finalModel = customNewProductName.trim();
      handleAddProductToCatalog(finalModel);
    }

    const ref = salesRef.trim() || `QT-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`;

    createOrder({
      sales_ref: ref,
      customer_name: customerName.trim(),
      delivery_location: deliveryLoc.trim(),
      district,
      province_custom: district === 'ต่างจังหวัด / งานเหมาพิเศษ' ? provinceCustom.trim() : undefined,
      bill_no: null,
      planned_model: finalModel,
      planned_quantity: quantity
    });

    setCustomerName('');
    setDeliveryLoc('');
    setProvinceCustom('');
    setSalesRef('');
    setQuantity(1);
    setCustomNewProductName('');
    setIsCustomNewProduct(false);

    setToast(`สร้างออเดอร์ ${ref} (${routeMeta.name}) ส่งต่อฝ่ายบัญชีเรียบร้อยแล้ว`);
    setTimeout(() => setToast(''), 3500);
  };

  // Helper render order status badge
  const renderOrderStatusBadge = (orderId: string, orderStatus: string) => {
    const relatedItems = items.filter(i => i.order_id === orderId);

    if (orderStatus === 'pending_accounting') {
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap bg-amber-500/15 text-amber-400 border border-amber-500/30">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse"></span>
          <span>รอตัดสต๊อก</span>
        </span>
      );
    }

    if (orderStatus === 'fulfilled' || (relatedItems.length > 0 && relatedItems.every(i => i.status === 'delivered'))) {
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
          <span>ส่งมอบสมบูรณ์</span>
        </span>
      );
    }

    if (relatedItems.length > 0) {
      const anyDelivering = relatedItems.some(i => i.status === 'assigned_onsite');
      if (anyDelivering) {
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap bg-purple-500/15 text-purple-400 border border-purple-500/30">
            <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse"></span>
            <span>ช่างกำลังส่ง Onsite</span>
          </span>
        );
      }

      const anyReady = relatedItems.some(i => i.status === 'ready_for_dispatch');
      if (anyReady) {
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap bg-blue-500/15 text-blue-400 border border-blue-500/30">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400"></span>
            <span>เตรียมเสร็จ รอจัดส่ง</span>
          </span>
        );
      }

      const anyPrepping = relatedItems.some(i => i.status === 'pending_prep');
      if (anyPrepping) {
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap bg-[#FF6B00]/15 text-[#FF6B00] border border-[#FF6B00]/30">
            <span className="w-1.5 h-1.5 rounded-full bg-[#FF6B00] animate-pulse"></span>
            <span>ช่างกำลังเตรียมสินค้า</span>
          </span>
        );
      }
    }

    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap bg-[#FF6B00]/15 text-[#FF6B00] border border-[#FF6B00]/30">
        <span className="w-1.5 h-1.5 rounded-full bg-[#FF6B00]"></span>
        <span>ส่งช่างเตรียมแล้ว</span>
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 p-4 rounded-2xl liquid-glass border border-[#FF6B00] text-white text-xs flex items-center gap-2 shadow-2xl">
          <CheckCircle className="w-4 h-4 text-[#FF6B00]" />
          <span>{toast}</span>
        </div>
      )}

      {/* Info Banner with Route Zoning */}
      <div className="p-4 rounded-2xl liquid-glass border border-[#FF6B00]/40 flex items-start gap-3.5 text-[#FF6B00] relative overflow-hidden">
        <div className="p-2 rounded-xl bg-[#FF6B00]/20 text-[#FF6B00] border border-[#FF6B00]/30 flex-shrink-0">
          <Navigation className="w-5 h-5" />
        </div>
        <div className="text-xs leading-relaxed">
          <strong className="font-bold text-sm block mb-0.5 text-white">ระบบจัดสายวิ่งรถ 6 สายอัตโนมัติ (Route Zoning Auto-Logic):</strong>
          เมื่อฝ่ายขายเลือก <strong>"อำเภอ/พื้นที่"</strong> ระบบจะคำนวณและติดป้ายกำกับ <strong>สายรถ (สาย 1 - สาย 6)</strong> ให้อัตโนมัติทันที เพื่อให้ช่างเตรียมสินค้าจัดรอบแพ็คของ และหน้าร้านสามารถจ่ายงานให้ทีมช่าง Onsite สายนั้นได้ในคลิกเดียว
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Sales Order Form in Liquid Glass */}
        <div className="liquid-glass rounded-3xl p-6 sm:p-7 shadow-2xl border border-white/[0.08]">
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-white/[0.08]">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-xl bg-[#FF6B00]/15 text-[#FF6B00] border border-[#FF6B00]/30">
                <FilePlus2 className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-white">เปิดใบสั่งขาย (Sales Order)</h2>
                <p className="text-xs text-slate-400">ปิดดีลลูกค้า & เลือกรุ่นสินค้า</p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowCatalogModal(true)}
              className="p-1.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-slate-300 hover:text-[#FF6B00] border border-white/[0.08] text-xs transition cursor-pointer flex items-center gap-1"
              title="จัดการรายการสินค้าที่หามาขาย"
            >
              <Layers className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">คลังสเปก</span>
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4 text-xs">
            <div>
              <label className="block font-medium text-slate-300 mb-1">
                ชื่อลูกค้า / บริษัทคู่ค้า <span className="text-[#FF6B00]">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="เช่น สหกรณ์การเกษตรพุนพิน จำกัด"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                className="w-full liquid-glass-input rounded-2xl px-3.5 py-2 text-white focus:outline-none"
              />
            </div>

            {/* ROUTE ZONING SECTION (Auto-calculated Badge) */}
            <div className="p-3.5 rounded-2xl bg-white/[0.02] border border-white/[0.06] space-y-2.5">
              <div className="flex items-center justify-between">
                <label className="font-bold text-slate-200 flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-[#FF6B00]" />
                  <span>อำเภอ / พื้นที่จัดส่ง <span className="text-[#FF6B00]">*</span></span>
                </label>

                {/* Auto Route Badge */}
                <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${routeMeta.badgeBg} ${routeMeta.badgeBorder} ${routeMeta.badgeText}`}>
                  <Navigation className="w-3 h-3" />
                  <span>{routeMeta.name}</span>
                </span>
              </div>

              <select
                value={district}
                onChange={(e) => setDistrict(e.target.value)}
                className="w-full liquid-glass-input rounded-2xl px-3.5 py-2 text-white focus:outline-none"
              >
                {DISTRICT_OPTIONS.map((opt, idx) => (
                  <option key={idx} value={opt.district} className="bg-[#12141A]">
                    {opt.district} — {opt.zone}
                  </option>
                ))}
              </select>

              {/* Extra input if Route 6 (ต่างจังหวัด) */}
              {district === 'ต่างจังหวัด / งานเหมาพิเศษ' && (
                <div className="pt-1">
                  <label className="block text-[11px] font-medium text-amber-400 mb-1">
                    ระบุจังหวัด / พื้นที่พิเศษ *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="เช่น ชุมพร (อ.หลังสวน), นครศรีธรรมราช..."
                    value={provinceCustom}
                    onChange={(e) => setProvinceCustom(e.target.value)}
                    className="w-full liquid-glass-input rounded-2xl px-3.5 py-2 text-white focus:outline-none border-amber-500/40"
                  />
                </div>
              )}

              <div>
                <label className="block font-medium text-slate-400 mb-1">
                  รายละเอียดที่อยู่ / จุดสังเกตหน้างาน <span className="text-[#FF6B00]">*</span>
                </label>
                <textarea
                  required
                  rows={2}
                  placeholder="เช่น 142 หมู่ 3 ถ.พุนพิน-สุราษฎร์ ต.ท่าข้าม อ.พุนพิน"
                  value={deliveryLoc}
                  onChange={(e) => setDeliveryLoc(e.target.value)}
                  className="w-full liquid-glass-input rounded-2xl px-3.5 py-2 text-white focus:outline-none"
                />
              </div>
            </div>

            {/* PRODUCT SELECTION OR DYNAMIC NEW PRODUCT INPUT */}
            <div className="p-3.5 rounded-2xl bg-white/[0.02] border border-white/[0.06] space-y-2.5">
              <div className="flex items-center justify-between">
                <label className="font-bold text-slate-200 flex items-center gap-1.5">
                  <Tag className="w-3.5 h-3.5 text-[#FF6B00]" />
                  <span>รุ่นสินค้าที่ปิดดีลขาย <span className="text-[#FF6B00]">*</span></span>
                </label>

                <button
                  type="button"
                  onClick={() => setIsCustomNewProduct(!isCustomNewProduct)}
                  className="text-[11px] font-semibold text-[#FF6B00] hover:underline cursor-pointer flex items-center gap-1"
                >
                  {isCustomNewProduct ? '← เลือกจากรายการที่มี' : '+ เพิ่มรุ่นใหม่ที่หามา'}
                </button>
              </div>

              {!isCustomNewProduct ? (
                <div>
                  <select
                    value={selectedModel}
                    onChange={(e) => setSelectedModel(e.target.value)}
                    className="w-full liquid-glass-input rounded-2xl px-3.5 py-2 text-white focus:outline-none"
                  >
                    {productCatalog.map((prod, idx) => (
                      <option key={idx} value={prod} className="bg-[#12141A]">
                        {prod}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <input
                    type="text"
                    required
                    placeholder="พิมพ์ชื่อรุ่น / สเปกสินค้าที่จัดหามาขาย..."
                    value={customNewProductName}
                    onChange={(e) => setCustomNewProductName(e.target.value)}
                    className="w-full liquid-glass-input rounded-2xl px-3.5 py-2 text-white border border-[#FF6B00]/40 focus:outline-none placeholder-slate-500"
                    autoFocus
                  />
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-medium text-slate-300 mb-1">
                  จำนวน (เครื่อง) <span className="text-[#FF6B00]">*</span>
                </label>
                <input
                  type="number"
                  min={1}
                  max={100}
                  required
                  value={quantity}
                  onChange={(e) => setQuantity(parseInt(e.target.value, 10) || 1)}
                  className="w-full liquid-glass-input rounded-2xl px-3.5 py-2 text-white focus:outline-none"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-300 mb-1">เลขที่ใบเสนอราคา</label>
                <input
                  type="text"
                  placeholder="QT-2026-..."
                  value={salesRef}
                  onChange={(e) => setSalesRef(e.target.value)}
                  className="w-full liquid-glass-input rounded-2xl px-3.5 py-2 text-white focus:outline-none"
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full mt-2 py-3 px-4 bg-gradient-to-r from-[#FF6B00] to-[#E65A00] hover:from-[#FF8A24] hover:to-[#FF6B00] active:scale-95 text-black font-extrabold rounded-2xl text-xs transition-all duration-200 cursor-pointer flex items-center justify-center gap-2 shadow-xl shadow-[#FF6B00]/25 border border-white/20"
            >
              <Send className="w-4 h-4" />
              <span>ส่งต่อให้ฝ่ายบัญชีตัดสต๊อก ({routeMeta.shortName})</span>
            </button>
          </form>
        </div>

        {/* Orders Queue with Route Badge Column */}
        <div className="lg:col-span-2 liquid-glass rounded-3xl p-6 shadow-2xl border border-white/[0.08]">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <ListOrdered className="w-4 h-4 text-[#FF6B00]" />
              ประวัติรายการสั่งขายล่าสุด ({orders.length} รายการ)
            </h3>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-white/[0.03] text-slate-400 border-b border-white/[0.06]">
                <tr>
                  <th className="py-3 px-3 whitespace-nowrap">เวลาสั่งซื้อ</th>
                  <th className="py-3 px-3 whitespace-nowrap">ลูกค้า</th>
                  <th className="py-3 px-3 whitespace-nowrap">สายวิ่งรถ</th>
                  <th className="py-3 px-3 whitespace-nowrap">สถานที่ส่ง</th>
                  <th className="py-3 px-3 whitespace-nowrap">เลขที่บิลบัญชี</th>
                  <th className="py-3 px-3 whitespace-nowrap min-w-[170px]">สถานะออเดอร์</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.05]">
                {orders.map((o) => {
                  const rCode = o.route_code || (o.district ? getRouteByDistrict(o.district) : 'route_5');
                  const rMeta = ROUTE_DEFINITIONS[rCode];

                  return (
                    <tr key={o.id} className="hover:bg-white/[0.03] transition">
                      <td className="py-3.5 px-3 text-slate-400 font-mono text-[11px] whitespace-nowrap">
                        {new Date(o.created_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })} น.
                      </td>
                      <td className="py-3.5 px-3 whitespace-nowrap">
                        <div className="text-white font-medium">{o.customer_name}</div>
                        <div className="text-[10px] text-[#FF6B00] font-mono">{o.sales_ref || '-'}</div>
                      </td>
                      <td className="py-3.5 px-3 whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${rMeta.badgeBg} ${rMeta.badgeBorder} ${rMeta.badgeText}`}>
                          <Navigation className="w-2.5 h-2.5" />
                          <span>{rMeta.shortName}</span>
                        </span>
                      </td>
                      <td className="py-3.5 px-3 text-slate-300 max-w-xs truncate">
                        <span className="text-white font-medium">{o.district ? `${o.district} — ` : ''}</span>
                        <span>{o.delivery_location}</span>
                      </td>
                      <td className="py-3.5 px-3 font-mono text-slate-300 whitespace-nowrap">
                        {o.bill_no ? (
                          <span className="font-semibold text-slate-200">{o.bill_no}</span>
                        ) : (
                          <span className="text-slate-500 italic">รอออกบิล</span>
                        )}
                      </td>
                      <td className="py-3.5 px-3 whitespace-nowrap">
                        {renderOrderStatusBadge(o.id, o.order_status)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* MODAL: จัดการแคตตาล็อกสินค้าของฝ่ายขาย */}
      {showCatalogModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-center justify-center p-4">
          <div className="liquid-glass rounded-3xl max-w-lg w-full p-6 sm:p-7 shadow-2xl border border-white/[0.12] relative space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-white/[0.08]">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-[#FF6B00]/15 text-[#FF6B00] border border-[#FF6B00]/30">
                  <Layers className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">จัดการแคตตาล็อกสินค้าฝ่ายขาย</h3>
                  <p className="text-xs text-slate-400">รายการสเปกและรุ่นสินค้าที่ฝ่ายขายหามาจำหน่าย</p>
                </div>
              </div>
              <button
                onClick={() => setShowCatalogModal(false)}
                className="text-slate-400 hover:text-white cursor-pointer text-sm"
              >
                ✕
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleAddProductToCatalog(modalNewProductInput);
                setModalNewProductInput('');
              }}
              className="flex gap-2"
            >
              <input
                type="text"
                placeholder="เพิ่มชื่อรุ่นสินค้าที่หามาขายใหม่..."
                value={modalNewProductInput}
                onChange={(e) => setModalNewProductInput(e.target.value)}
                className="flex-1 liquid-glass-input rounded-2xl px-3.5 py-2 text-xs text-white focus:outline-none"
              />
              <button
                type="submit"
                className="px-4 py-2 bg-[#FF6B00] hover:bg-[#E65A00] text-black font-extrabold rounded-2xl text-xs transition cursor-pointer flex items-center gap-1 shadow-md shadow-[#FF6B00]/25"
              >
                <Plus className="w-4 h-4" />
                <span>เพิ่ม</span>
              </button>
            </form>

            <div className="max-h-60 overflow-y-auto space-y-2 pr-1">
              {productCatalog.map((p, idx) => (
                <div
                  key={idx}
                  className="p-3 rounded-2xl liquid-glass-card flex items-center justify-between text-xs"
                >
                  <span className="text-white font-medium">{p}</span>
                  <button
                    onClick={() => handleRemoveProductFromCatalog(p)}
                    className="text-slate-500 hover:text-rose-400 transition cursor-pointer p-1"
                    title="ลบออกจากรายการ"
                  >
                    ลบ
                  </button>
                </div>
              ))}
            </div>

            <div className="pt-2 text-right">
              <button
                onClick={() => setShowCatalogModal(false)}
                className="px-5 py-2 rounded-2xl border border-white/[0.08] text-slate-300 hover:text-white text-xs cursor-pointer"
              >
                เสร็จสิ้น
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
