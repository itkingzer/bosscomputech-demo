import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { 
  MapPin, ShieldCheck, CheckCircle, Truck, Package, 
  RotateCcw, Wrench, Navigation, Filter
} from 'lucide-react';
import { ROUTE_DEFINITIONS, RouteCode } from '../types';

export const OnsiteView: React.FC = () => {
  const { 
    items, orders, repairTickets, confirmOnsiteDelivery, 
    completeRepairTicket, closeRepairTicket, currentUser 
  } = useApp();

  // If user has assigned route, default to it, otherwise 'all'
  const defaultRoute = (currentUser?.assigned_route && currentUser.assigned_route !== 'all') 
    ? currentUser.assigned_route 
    : 'all';

  const [selectedRouteFilter, setSelectedRouteFilter] = useState<'all' | RouteCode>(defaultRoute);
  const [selectedCategory, setSelectedCategory] = useState<'all' | 'new_goods' | 'repair_return' | 'pickup'>('all');
  const [deliveryNotes, setDeliveryNotes] = useState<Record<string, string>>({});
  const [repairActionNotes, setRepairActionNotes] = useState<Record<string, string>>({});
  const [toast, setToast] = useState('');

  // 1. New goods assigned to onsite
  const assignedNewGoods = items.filter(i => {
    if (i.status !== 'assigned_onsite') return false;
    if (currentUser?.role === 'onsite' && i.assigned_onsite_tech && i.assigned_onsite_tech !== currentUser.name) {
      return false;
    }
    const order = orders.find(o => o.id === i.order_id);
    if (selectedRouteFilter !== 'all' && order?.route_code !== selectedRouteFilter) {
      return false;
    }
    return true;
  });

  // 2. Repaired items assigned to onsite for return delivery
  const assignedRepairedReturns = repairTickets.filter(t => {
    if (t.status !== 'repaired' || !t.assigned_onsite_tech) return false;
    if (currentUser?.role === 'onsite' && t.assigned_onsite_tech !== currentUser.name) {
      return false;
    }
    if (selectedRouteFilter !== 'all' && t.route_code !== selectedRouteFilter) {
      return false;
    }
    return true;
  });

  // 3. Onsite pickup tickets assigned
  const assignedPickups = repairTickets.filter(t => {
    if (t.intake_channel !== 'onsite_pickup' || !t.assigned_onsite_tech) return false;
    if (t.status !== 'open' && t.status !== 'in_progress') return false;
    if (currentUser?.role === 'onsite' && t.assigned_onsite_tech !== currentUser.name) {
      return false;
    }
    if (selectedRouteFilter !== 'all' && t.route_code !== selectedRouteFilter) {
      return false;
    }
    return true;
  });

  const totalAssignedCount = assignedNewGoods.length + assignedRepairedReturns.length + assignedPickups.length;

  const handleDeliveryConfirm = (itemId: string, sn: string | null) => {
    const note = deliveryNotes[itemId] || 'ติดตั้งและส่งมอบถึงมือลูกค้าเรียบร้อย';
    confirmOnsiteDelivery(itemId, note);

    setToast(`ส่งมอบสินค้าใหม่ S/N: ${sn || '-'} สำเร็จ และปิดงานเรียบร้อยแล้ว`);
    setTimeout(() => setToast(''), 3500);
  };

  const handleReturnConfirm = (ticketId: string, ticketNo: string) => {
    closeRepairTicket(ticketId);
    setToast(`ส่งคืนเครื่องงานซ่อม ${ticketNo} ถึงมือลูกค้าและปิดงานเรียบร้อยแล้ว`);
    setTimeout(() => setToast(''), 3500);
  };

  const handlePickupConfirm = (ticketId: string, ticketNo: string) => {
    const note = repairActionNotes[ticketId] || 'รับเครื่องจากหน้างาน นำกลับถึงร้านเรียบร้อย';
    completeRepairTicket(ticketId, 'in_progress', 'รับเครื่องกลับร้านแล้ว กำลังตรวจเช็ค', note, '');
    setToast(`รับเครื่อง ${ticketNo} กลับมาถึงร้านแล้ว ส่งต่อให้ช่างตรวจเช็ค`);
    setTimeout(() => setToast(''), 3500);
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
      <div className="liquid-glass rounded-3xl p-6 sm:p-7 shadow-2xl border border-white/[0.08]">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6 pb-4 border-b border-white/[0.08]">
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <div className="p-2 rounded-xl bg-purple-500/15 text-purple-400 border border-purple-500/30">
                <Truck className="w-5 h-5" />
              </div>
              <span>คิวงานทีมรถ Onsite ประจำสาย (Vehicle Route Ops)</span>
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              {currentUser?.name ? `เข้าสู่ระบบในชื่อ: ${currentUser.name}` : ''}
              {currentUser?.assigned_route && currentUser.assigned_route !== 'all' 
                ? ` | วิ่งประจำ: ${ROUTE_DEFINITIONS[currentUser.assigned_route].name}`
                : ' | วิ่งได้ทุกสายรถ'}
            </p>
          </div>

          {/* Route Selector Filter for Technician */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            <span className="text-xs text-slate-400 whitespace-nowrap">เลือกสายรถ:</span>
            <button
              onClick={() => setSelectedRouteFilter('all')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer whitespace-nowrap ${
                selectedRouteFilter === 'all'
                  ? 'bg-white/20 text-white border border-white/40 shadow-sm font-bold'
                  : 'bg-white/[0.04] text-slate-400 hover:text-white border border-white/[0.06]'
              }`}
            >
              ทั้งหมด
            </button>
            {(Object.keys(ROUTE_DEFINITIONS) as RouteCode[]).map((rCode) => {
              const r = ROUTE_DEFINITIONS[rCode];
              return (
                <button
                  key={rCode}
                  onClick={() => setSelectedRouteFilter(rCode)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                    selectedRouteFilter === rCode
                      ? `${r.badgeBg} ${r.badgeText} ${r.badgeBorder} border shadow-md font-bold`
                      : 'bg-white/[0.04] text-slate-400 hover:text-slate-200 border border-white/[0.06]'
                  }`}
                >
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: r.color }}></span>
                  <span>{r.shortName}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Category Pills Filter */}
        <div className="flex items-center gap-2 pb-4 overflow-x-auto">
          <button
            onClick={() => setSelectedCategory('all')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-xl transition cursor-pointer whitespace-nowrap ${
              selectedCategory === 'all'
                ? 'bg-white/20 text-white border border-white/40 font-bold'
                : 'bg-white/[0.03] text-slate-400 hover:text-white border border-white/[0.05]'
            }`}
          >
            รวมทุกประเภท ({totalAssignedCount})
          </button>
          <button
            onClick={() => setSelectedCategory('new_goods')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-xl transition cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
              selectedCategory === 'new_goods'
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 font-bold'
                : 'bg-white/[0.03] text-slate-400 hover:text-emerald-300 border border-white/[0.05]'
            }`}
          >
            <Package className="w-3.5 h-3.5" />
            <span>[ส่งของใหม่ - วอยติดแล้ว] ({assignedNewGoods.length})</span>
          </button>
          <button
            onClick={() => setSelectedCategory('repair_return')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-xl transition cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
              selectedCategory === 'repair_return'
                ? 'bg-purple-500/20 text-purple-400 border border-purple-500/40 font-bold'
                : 'bg-white/[0.03] text-slate-400 hover:text-purple-300 border border-white/[0.05]'
            }`}
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>[ส่งคืนงานซ่อม] ({assignedRepairedReturns.length})</span>
          </button>
          <button
            onClick={() => setSelectedCategory('pickup')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-xl transition cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
              selectedCategory === 'pickup'
                ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40 font-bold'
                : 'bg-white/[0.03] text-slate-400 hover:text-amber-300 border border-white/[0.05]'
            }`}
          >
            <Wrench className="w-3.5 h-3.5" />
            <span>[ออกซ่อม/รับเครื่องกลับร้าน] ({assignedPickups.length})</span>
          </button>
        </div>

        {totalAssignedCount === 0 ? (
          <div className="text-center py-12 text-slate-500 border border-dashed border-white/[0.1] rounded-2xl">
            <Truck className="w-10 h-10 mx-auto mb-2 text-purple-400 opacity-60" />
            <p className="text-sm font-medium text-slate-200">ไม่มีคิวงานที่ต้องวิ่งในสายรถนี้</p>
            <p className="text-xs text-slate-500 mt-0.5">หน้าร้านยังไม่ได้จ่ายงาน หรือทีมรถได้ส่งมอบเสร็จสิ้นหมดแล้ว</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* 1. CARDS: NEW GOODS */}
            {(selectedCategory === 'all' || selectedCategory === 'new_goods') &&
              assignedNewGoods.map((item) => {
                const order = orders.find(o => o.id === item.order_id);
                const rMeta = order?.route_code ? ROUTE_DEFINITIONS[order.route_code] : null;

                return (
                  <div
                    key={'new-' + item.id}
                    className="p-5 rounded-2xl liquid-glass-card flex flex-col justify-between space-y-4 relative overflow-hidden border-emerald-500/30"
                  >
                    {/* Top color accent */}
                    <div className="absolute top-0 left-0 right-0 h-1 bg-emerald-500" />

                    <div>
                      <div className="flex items-center justify-between mb-2">
                        {/* Clear Category Badge */}
                        <span className="text-[11px] font-extrabold px-2.5 py-1 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 flex items-center gap-1">
                          <Package className="w-3 h-3" />
                          <span>[ส่งของใหม่ - อย่าลืมเช็ควอย]</span>
                        </span>
                        <span className="text-xs font-mono font-bold text-[#FF6B00]">{item.serial_number}</span>
                      </div>

                      {/* Route Tag */}
                      {rMeta && (
                        <div className={`mb-2 px-2 py-0.5 rounded-md text-[10px] font-bold border inline-flex items-center gap-1 ${rMeta.badgeBg} ${rMeta.badgeBorder} ${rMeta.badgeText}`}>
                          <span>{rMeta.name}</span>
                          <span>• {order?.district || ''}</span>
                        </div>
                      )}

                      <h4 className="text-sm font-bold text-white mb-1">{item.model_name}</h4>
                      <p className="text-xs text-slate-300 font-medium">ลูกค้า: {order ? order.customer_name : '-'}</p>
                      <p className="text-xs text-slate-500 mt-1 flex items-start gap-1">
                        <MapPin className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0 mt-0.5" />
                        <span>{order ? order.delivery_location : '-'}</span>
                      </p>
                    </div>

                    <div className="pt-3 border-t border-white/[0.08] space-y-3">
                      {/* Reminder: Prep Tech void status */}
                      <div className="p-2.5 rounded-xl bg-white/[0.03] border border-white/[0.06] text-[11px] text-slate-300 flex items-center justify-between">
                        <span className="text-slate-400">วอยรับประกัน:</span>
                        <span className="font-mono text-emerald-400 font-bold flex items-center gap-1">
                          <ShieldCheck className="w-3.5 h-3.5" />
                          <span>ช่างเตรียมติดแล้ว ({item.void_date || 'ระบุแล้ว'})</span>
                        </span>
                      </div>

                      <div>
                        <label className="block text-[11px] font-medium text-slate-400 mb-1">
                          บันทึกการส่งมอบ / เซ็นรับ:
                        </label>
                        <input
                          type="text"
                          placeholder="เช่น ลูกค้าตรวจรับครบถ้วน, ทดสอบเปิดเครื่องติดปกติ"
                          value={deliveryNotes[item.id] || ''}
                          onChange={(e) => setDeliveryNotes({ ...deliveryNotes, [item.id]: e.target.value })}
                          className="w-full liquid-glass-input rounded-xl px-2.5 py-1.5 text-xs text-white focus:outline-none"
                        />
                      </div>

                      <button
                        onClick={() => handleDeliveryConfirm(item.id, item.serial_number)}
                        className="w-full py-2.5 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 active:scale-95 text-black font-extrabold rounded-xl text-xs transition cursor-pointer flex items-center justify-center gap-1.5 shadow-lg shadow-emerald-500/25 border border-white/20"
                      >
                        <CheckCircle className="w-4 h-4" />
                        <span>ส่งมอบของใหม่สำเร็จ (ปิดงาน)</span>
                      </button>
                    </div>
                  </div>
                );
              })}

            {/* 2. CARDS: REPAIRED RETURN */}
            {(selectedCategory === 'all' || selectedCategory === 'repair_return') &&
              assignedRepairedReturns.map((ticket) => {
                const rMeta = ticket.route_code ? ROUTE_DEFINITIONS[ticket.route_code] : null;

                return (
                  <div
                    key={'rep-return-' + ticket.id}
                    className="p-5 rounded-2xl liquid-glass-card flex flex-col justify-between space-y-4 relative overflow-hidden border-purple-500/30"
                  >
                    <div className="absolute top-0 left-0 right-0 h-1 bg-purple-500" />

                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[11px] font-extrabold px-2.5 py-1 rounded-lg bg-purple-500/20 text-purple-400 border border-purple-500/40 flex items-center gap-1">
                          <RotateCcw className="w-3 h-3" />
                          <span>[ส่งคืนงานซ่อม]</span>
                        </span>
                        <span className="text-xs font-mono font-bold text-slate-300">{ticket.ticket_no}</span>
                      </div>

                      {rMeta && (
                        <div className={`mb-2 px-2 py-0.5 rounded-md text-[10px] font-bold border inline-flex items-center gap-1 ${rMeta.badgeBg} ${rMeta.badgeBorder} ${rMeta.badgeText}`}>
                          <span>{rMeta.name}</span>
                          <span>• {ticket.district || ''}</span>
                        </div>
                      )}

                      <h4 className="text-sm font-bold text-white mb-0.5">S/N: {ticket.walkin_sn}</h4>
                      <p className="text-xs text-slate-300 font-medium">ลูกค้า: {ticket.customer_name}</p>
                      <p className="text-xs text-slate-500 mt-1 flex items-start gap-1">
                        <MapPin className="w-3.5 h-3.5 text-purple-400 flex-shrink-0 mt-0.5" />
                        <span>{ticket.delivery_location || ticket.customer_phone || '-'}</span>
                      </p>
                      <div className="mt-2 p-2 rounded-xl bg-purple-500/10 border border-purple-500/20 text-[11px] text-purple-300">
                        <strong>ผลการซ่อม:</strong> {ticket.repair_detail || 'เปลี่ยนอะไหล่และเทสผ่านแล้ว'}
                      </div>
                    </div>

                    <div className="pt-3 border-t border-white/[0.08] space-y-3">
                      <button
                        onClick={() => handleReturnConfirm(ticket.id, ticket.ticket_no)}
                        className="w-full py-2.5 bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-500 active:scale-95 text-white font-bold rounded-xl text-xs transition cursor-pointer flex items-center justify-center gap-1.5 shadow-lg shadow-purple-600/25 border border-white/20"
                      >
                        <CheckCircle className="w-4 h-4" />
                        <span>ส่งคืนเครื่องซ่อมถึงมือลูกค้า (ปิดงาน)</span>
                      </button>
                    </div>
                  </div>
                );
              })}

            {/* 3. CARDS: ONSITE PICKUP */}
            {(selectedCategory === 'all' || selectedCategory === 'pickup') &&
              assignedPickups.map((ticket) => {
                const rMeta = ticket.route_code ? ROUTE_DEFINITIONS[ticket.route_code] : null;

                return (
                  <div
                    key={'pickup-' + ticket.id}
                    className="p-5 rounded-2xl liquid-glass-card flex flex-col justify-between space-y-4 relative overflow-hidden border-amber-500/30"
                  >
                    <div className="absolute top-0 left-0 right-0 h-1 bg-amber-500" />

                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[11px] font-extrabold px-2.5 py-1 rounded-lg bg-amber-500/20 text-amber-400 border border-amber-500/40 flex items-center gap-1">
                          <Wrench className="w-3 h-3" />
                          <span>[ออกซ่อม/รับเครื่องกลับร้าน]</span>
                        </span>
                        <span className="text-xs font-mono font-bold text-amber-400">{ticket.ticket_no}</span>
                      </div>

                      {rMeta && (
                        <div className={`mb-2 px-2 py-0.5 rounded-md text-[10px] font-bold border inline-flex items-center gap-1 ${rMeta.badgeBg} ${rMeta.badgeBorder} ${rMeta.badgeText}`}>
                          <span>{rMeta.name}</span>
                          <span>• {ticket.district || ''}</span>
                        </div>
                      )}

                      <h4 className="text-sm font-bold text-white mb-0.5">S/N: {ticket.walkin_sn}</h4>
                      <p className="text-xs text-slate-300 font-medium">ลูกค้า: {ticket.customer_name}</p>
                      <p className="text-xs text-slate-500 mt-1 flex items-start gap-1">
                        <MapPin className="w-3.5 h-3.5 text-amber-400 flex-shrink-0 mt-0.5" />
                        <span>{ticket.delivery_location || ticket.customer_phone || '-'}</span>
                      </p>
                      <div className="mt-2 p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-300">
                        <strong>อาการเสีย:</strong> {ticket.fault_symptom}
                      </div>
                    </div>

                    <div className="pt-3 border-t border-white/[0.08] space-y-3">
                      <div>
                        <label className="block text-[11px] font-medium text-slate-400 mb-1">
                          บันทึกการรับเครื่องกลับ:
                        </label>
                        <input
                          type="text"
                          placeholder="เช่น รับเครื่องและสายชาร์จกลับมาตรวจเช็คที่ร้าน"
                          value={repairActionNotes[ticket.id] || ''}
                          onChange={(e) => setRepairActionNotes({ ...repairActionNotes, [ticket.id]: e.target.value })}
                          className="w-full liquid-glass-input rounded-xl px-2.5 py-1.5 text-xs text-white focus:outline-none"
                        />
                      </div>

                      <button
                        onClick={() => handlePickupConfirm(ticket.id, ticket.ticket_no)}
                        className="w-full py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 active:scale-95 text-black font-extrabold rounded-xl text-xs transition cursor-pointer flex items-center justify-center gap-1.5 shadow-lg shadow-amber-500/25 border border-white/20"
                      >
                        <CheckCircle className="w-4 h-4" />
                        <span>รับเครื่องกลับถึงร้านเรียบร้อย</span>
                      </button>
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
