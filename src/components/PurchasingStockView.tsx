import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { 
  Boxes, PackagePlus, CheckCircle, Info, MapPin, 
  ShoppingCart, Clock, AlertTriangle, Truck, Tag, Send, Check,
  ArrowRight, ShieldCheck, FileCheck, Layers
} from 'lucide-react';
import { ROUTE_DEFINITIONS, Order } from '../types';

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
  const { orders, cutStock, updateOrderPOStatus, receivePOIntoStock } = useApp();
  const [billInputs, setBillInputs] = useState<Record<string, string>>({});
  const [supplierInputs, setSupplierInputs] = useState<Record<string, string>>({});
  const [poInputs, setPoInputs] = useState<Record<string, string>>({});
  const [prepNoteInputs, setPrepNoteInputs] = useState<Record<string, string>>({});
  const [activeTab, setActiveTab] = useState<'pending' | 'waiting_po' | 'po_received'>('pending');
  const [toast, setToast] = useState('');

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
      ? order.items_list.map(it => ({
          model_name: it.model_name,
          quantity: it.quantity,
          supplier: supplier,
          po_no: poNo,
          prep_note: prepNote
        }))
      : [{
          model_name: order._planned_model || 'BossComputech Core-i7 Workstation Pro',
          quantity: order._planned_quantity || 1,
          supplier: supplier,
          po_no: poNo,
          prep_note: prepNote
        }];

    cutStock(orderId, billNo, itemsToCut);

    const totalQty = itemsToCut.reduce((sum, item) => sum + item.quantity, 0);
    setToast(`ตัดสต๊อกบิล ${billNo} สำเร็จ! ปล่อยคิว ${totalQty} ชิ้นเข้าโต๊ะช่างเตรียมสินค้าแล้ว`);
    setTimeout(() => setToast(''), 4000);
  };

  const currentTabOrders = activeTab === 'pending'
    ? newOrders
    : activeTab === 'waiting_po'
      ? waitingPoOrders
      : poReceivedOrders;

  return (
    <div className="space-y-6">
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 p-4 rounded-2xl liquid-glass border border-[#FF6B00] text-white text-xs flex items-center gap-2 shadow-2xl">
          <CheckCircle className="w-4 h-4 text-[#FF6B00]" />
          <span>{toast}</span>
        </div>
      )}

      {/* Main Container */}
      <div className="liquid-glass rounded-3xl p-6 sm:p-7 shadow-2xl border border-white/[0.08]">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-6 pb-4 border-b border-white/[0.08]">
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <div className="p-2 rounded-xl bg-amber-500/15 text-amber-400 border border-amber-500/30">
                <Boxes className="w-5 h-5" />
              </div>
              <span>จัดซื้อ & ควบคุมสต๊อก (Purchasing & Stock Inventory - วงจร PO 3 ขั้นตอน)</span>
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              จัดการวงจรสินค้าสั่งซื้อ (PO) ตั้งแต่เปิดสั่งของ รับของเข้าสต๊อกร้าน จนถึงตัดสต๊อกส่งมอบต่อให้ช่างเตรียมสินค้า
            </p>
          </div>
        </div>

        {/* 3 Step Tabs Navigation */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 mb-6">
          <button
            onClick={() => setActiveTab('pending')}
            className={`p-3.5 rounded-2xl text-left transition-all border flex items-center justify-between cursor-pointer ${
              activeTab === 'pending'
                ? 'bg-blue-500/20 border-blue-500/50 shadow-lg text-white'
                : 'bg-white/[0.02] border-white/[0.06] text-slate-400 hover:text-white hover:bg-white/[0.05]'
            }`}
          >
            <div>
              <div className="text-xs font-bold flex items-center gap-1.5">
                <span className="w-5 h-5 rounded-full bg-blue-500/30 text-blue-400 flex items-center justify-center text-[10px] font-mono">1</span>
                <span>รายการใหม่จากเซล</span>
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5">รอเช็กสต๊อก / เปิดสั่งซื้อ PO</div>
            </div>
            <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
              newOrders.length > 0 ? 'bg-blue-500 text-black' : 'bg-white/10 text-slate-400'
            }`}>
              {newOrders.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('waiting_po')}
            className={`p-3.5 rounded-2xl text-left transition-all border flex items-center justify-between cursor-pointer ${
              activeTab === 'waiting_po'
                ? 'bg-purple-500/20 border-purple-500/50 shadow-lg text-white'
                : 'bg-white/[0.02] border-white/[0.06] text-slate-400 hover:text-white hover:bg-white/[0.05]'
            }`}
          >
            <div>
              <div className="text-xs font-bold flex items-center gap-1.5">
                <span className="w-5 h-5 rounded-full bg-purple-500/30 text-purple-400 flex items-center justify-center text-[10px] font-mono">2</span>
                <span>รอของเข้า (PO)</span>
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5">สั่งของแล้ว รอกดรับเข้าสต๊อกร้าน</div>
            </div>
            <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
              waitingPoOrders.length > 0 ? 'bg-purple-500 text-white' : 'bg-white/10 text-slate-400'
            }`}>
              {waitingPoOrders.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('po_received')}
            className={`p-3.5 rounded-2xl text-left transition-all border flex items-center justify-between cursor-pointer ${
              activeTab === 'po_received'
                ? 'bg-teal-500/20 border-teal-500/50 shadow-lg text-white'
                : 'bg-white/[0.02] border-white/[0.06] text-slate-400 hover:text-white hover:bg-white/[0.05]'
            }`}
          >
            <div>
              <div className="text-xs font-bold flex items-center gap-1.5">
                <span className="w-5 h-5 rounded-full bg-teal-500/30 text-teal-400 flex items-center justify-center text-[10px] font-mono">3</span>
                <span>ของเข้าสต๊อกแล้ว</span>
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5">ของพร้อมปล่อยให้ช่างเตรียม</div>
            </div>
            <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
              poReceivedOrders.length > 0 ? 'bg-teal-500 text-black' : 'bg-white/10 text-slate-400'
            }`}>
              {poReceivedOrders.length}
            </span>
          </button>
        </div>

        {/* Tab Content */}
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
          <div className="space-y-5">
            {currentTabOrders.map((order) => {
              const rMeta = order.route_code ? ROUTE_DEFINITIONS[order.route_code] : null;
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
                      <span className="px-2.5 py-1 rounded-xl text-xs bg-[#FF6B00] text-black font-extrabold font-mono shadow-md shadow-[#FF6B00]/25">
                        {order.sales_ref || 'SO'}
                      </span>
                      <h4 className="text-sm font-bold text-white">{order.customer_name}</h4>
                      {order.customer_phone && (
                        <span className="text-xs text-slate-400 font-mono">({order.customer_phone})</span>
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

                    <div className="flex items-center gap-2">
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

                  {/* Items in this Order */}
                  <div className="p-3.5 rounded-2xl bg-white/[0.02] border border-white/[0.06] text-xs">
                    <span className="text-slate-400 font-medium block mb-2">รายการสินค้า & บริการในบิล:</span>
                    <div className="space-y-1.5">
                      {order.items_list && order.items_list.length > 0 ? (
                        order.items_list.map((it, idx) => (
                          <div key={idx} className="flex justify-between items-center py-1 border-b border-white/[0.03] last:border-0">
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
                              <span className="text-white font-semibold">{it.model_name}</span>
                            </div>
                            <span className="px-2.5 py-0.5 rounded-md bg-[#FF6B00]/15 text-[#FF6B00] font-mono font-bold text-xs">
                              x{it.quantity} {it.item_type === 'service' ? 'รายการ' : 'เครื่อง'}
                            </span>
                          </div>
                        ))
                      ) : (
                        <div className="flex justify-between items-center">
                          <span className="text-white font-semibold">• {order._planned_model || 'BossComputech Workstation'}</span>
                          <span className="px-2.5 py-0.5 rounded-md bg-[#FF6B00]/15 text-[#FF6B00] font-mono font-bold text-xs">
                            x{order._planned_quantity || 1} เครื่อง
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

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
                    {/* Stage 1 Actions */}
                    {order.order_status === 'pending_purchasing' && (
                      <>
                        <button
                          type="button"
                          onClick={() => handleOrderPO(order.id, order.sales_ref)}
                          className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 font-semibold text-xs border border-purple-500/30 cursor-pointer flex items-center justify-center gap-1.5 transition"
                        >
                          <ShoppingCart className="w-4 h-4 text-purple-400" />
                          <span>สั่งซื้อ PO (รอของเข้า)</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleCutStockAndSendPrep(order.id)}
                          className="w-full sm:w-auto px-5 py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 text-black font-extrabold rounded-xl text-xs transition cursor-pointer flex items-center justify-center gap-1.5 shadow-lg shadow-amber-500/25 border border-white/20 active:scale-95"
                        >
                          <PackagePlus className="w-4 h-4" />
                          <span>มีของในสต๊อกเดิม &rarr; ตัดสต๊อก & ส่งช่างเตรียม</span>
                        </button>
                      </>
                    )}

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
    </div>
  );
};
