import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { 
  PackageSearch, BadgeCheck, CheckCircle, RefreshCw, 
  Warehouse, Send, ShieldCheck, Plus, Hash, Layers, MapPin
} from 'lucide-react';
import { ROUTE_DEFINITIONS, RouteCode } from '../types';

export const PrepView: React.FC = () => {
  const { items, orders, prepInboundStock, prepOutboundDispatch } = useApp();
  
  // Tab state: 'outbound' (เตรียมของออกไปส่ง & ติดวอย) vs 'inbound' (เตรียมของเข้าสต๊อก)
  const [prepTab, setPrepTab] = useState<'outbound' | 'inbound'>('outbound');
  
  // Filter by route in outbound queue
  const [routeFilter, setRouteFilter] = useState<'all' | RouteCode>('all');

  // Outbound state
  const [snInputs, setSnInputs] = useState<Record<string, string>>({});
  const [voidDateInputs, setVoidDateInputs] = useState<Record<string, string>>({});
  
  // Inbound state
  const [inboundModel, setInboundModel] = useState('BossComputech Core-i7 Workstation Pro');
  const [inboundSn, setInboundSn] = useState(`BC-STOCK-${Math.floor(100 + Math.random() * 900)}`);
  const [inboundNotes, setInboundNotes] = useState('ประกอบเทสผ่าน ติดโลโก้ เก็บเข้าสต๊อกพร้อมขาย');
  
  const [toast, setToast] = useState('');
  const todayStr = new Date().toISOString().split('T')[0];

  const pendingOutbound = items.filter(i => i.status === 'pending_prep');
  const inStockItems = items.filter(i => i.status === 'in_stock');

  // Handle Outbound Prep (ติดวอยประกัน & ยิง S/N ก่อนส่ง)
  const handlePrepOutbound = (itemId: string) => {
    const defaultSn = `BC-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`;
    const sn = (snInputs[itemId] || defaultSn).trim();
    const voidDate = voidDateInputs[itemId] || todayStr;

    const success = prepOutboundDispatch(itemId, sn, voidDate);
    if (!success) {
      alert(`Serial Number "${sn}" นี้ถูกใช้งานแล้วในระบบ! โปรดใช้หมายเลขอื่น`);
      return;
    }

    setToast(`ติดวอยรับประกัน (${voidDate}) & ผูก S/N: ${sn} สำเร็จ ส่งต่อไปหน้าร้านจัดส่งแล้ว`);
    setTimeout(() => setToast(''), 3500);
  };

  // Handle Inbound Stock Prep (เตรียมของเข้าสต๊อก ยังไม่ติดวอย)
  const handlePrepInbound = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inboundModel || !inboundSn) return;

    const success = prepInboundStock(inboundModel, inboundSn.trim(), inboundNotes);
    if (!success) {
      alert(`Serial Number "${inboundSn}" นี้มีอยู่ในสต๊อกแล้ว`);
      return;
    }

    setToast(`เตรียมเครื่อง S/N: ${inboundSn} เข้าสต๊อกเรียบร้อยแล้ว (ยังไม่ติดวอย)`);
    setInboundSn(`BC-STOCK-${Math.floor(100 + Math.random() * 900)}`);
    setTimeout(() => setToast(''), 3500);
  };

  const generateNewSn = (itemId: string) => {
    const newSn = `BC-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`;
    setSnInputs({ ...snInputs, [itemId]: newSn });
  };

  return (
    <div className="space-y-6">
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 p-4 rounded-2xl liquid-glass border border-[#FF6B00] text-white text-xs flex items-center gap-2 shadow-2xl">
          <CheckCircle className="w-4 h-4 text-[#FF6B00]" />
          <span>{toast}</span>
        </div>
      )}

      {/* Role Rule & Logic Banner */}
      <div className="p-4 rounded-2xl liquid-glass border border-[#FF6B00]/40 flex items-start gap-3.5 text-[#FF6B00] relative overflow-hidden">
        <div className="p-2 rounded-xl bg-[#FF6B00]/20 text-[#FF6B00] border border-[#FF6B00]/30 flex-shrink-0">
          <ShieldCheck className="w-5 h-5" />
        </div>
        <div className="text-xs leading-relaxed">
          <strong className="font-bold text-sm block mb-0.5 text-white">หน้าที่หลักช่างเตรียมสินค้า (Hardware Prep Specialist):</strong>
          1. <strong>เตรียมของเข้าสต๊อก:</strong> ประกอบเครื่อง เทสระบบ ติดโลโก้ BossComputech และเก็บเข้าคลังสินค้า (ยังไม่ติดวอยประกัน)<br/>
          2. <strong>เตรียมของออกไปส่ง:</strong> เบิกเครื่องตามบิลบัญชี, ยิง S/N และ <span className="underline font-bold text-amber-300">เป็นผู้ติดวอยรับประกัน (Warranty Void)</span> พร้อมลงวันที่ส่งมอบจริง ก่อนแพ็คส่งต่อให้หน้าร้านและช่าง Onsite
        </div>
      </div>

      {/* Prep View Tabs: เตรียมของออกไปส่ง vs เตรียมของเข้าสต๊อก */}
      <div className="flex gap-2 pb-1 overflow-x-auto">
        <button
          onClick={() => setPrepTab('outbound')}
          className={`px-4 py-2.5 text-xs font-semibold rounded-2xl transition-all cursor-pointer flex items-center gap-2 ${
            prepTab === 'outbound'
              ? 'liquid-glass-active font-extrabold shadow-lg shadow-[#FF6B00]/25'
              : 'liquid-glass-card text-slate-400 hover:text-white'
          }`}
        >
          <Send className="w-4 h-4" />
          <span>1. เตรียมของออกไปส่ง & ติดวอยประกัน ({pendingOutbound.length})</span>
        </button>

        <button
          onClick={() => setPrepTab('inbound')}
          className={`px-4 py-2.5 text-xs font-semibold rounded-2xl transition-all cursor-pointer flex items-center gap-2 ${
            prepTab === 'inbound'
              ? 'liquid-glass-active font-extrabold shadow-lg shadow-[#FF6B00]/25'
              : 'liquid-glass-card text-slate-400 hover:text-white'
          }`}
        >
          <Warehouse className="w-4 h-4" />
          <span>2. เตรียมของเข้าสต๊อกสินค้า ({inStockItems.length})</span>
        </button>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: เตรียมของออกไปส่ง & ติดวอยรับประกัน (OUTBOUND DISPATCH) */}
      {/* ========================================================================= */}
      {prepTab === 'outbound' && (
        <div className="liquid-glass rounded-3xl p-6 sm:p-7 shadow-2xl border border-white/[0.08]">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <div className="p-2 rounded-xl bg-[#FF6B00]/15 text-[#FF6B00] border border-[#FF6B00]/30">
                  <PackageSearch className="w-5 h-5" />
                </div>
                <span>คิวเตรียมของออกไปส่งลูกค้า (Outbound Queue)</span>
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                ยิงบาร์โค้ด S/N จากตัวเครื่อง และ <span className="text-amber-300 font-semibold">ระบุวันที่ติดวอยรับประกัน</span> ก่อนส่งมอบให้ทีมจัดส่ง
              </p>
            </div>
            <span className="text-xs font-semibold px-3 py-1 rounded-full bg-[#FF6B00]/15 text-[#FF6B00] border border-[#FF6B00]/30">
              {pendingOutbound.length} เครื่องรอเตรียมส่ง
            </span>
          </div>

          {/* Quick Route Filter Bar */}
          <div className="flex items-center gap-1.5 mb-5 pb-1 overflow-x-auto">
            <span className="text-xs text-slate-400 whitespace-nowrap mr-1">แยกตามสายรถ:</span>
            <button
              onClick={() => setRouteFilter('all')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer whitespace-nowrap ${
                routeFilter === 'all'
                  ? 'bg-white/20 text-white border border-white/40 shadow-sm'
                  : 'bg-white/[0.04] text-slate-400 hover:text-white border border-white/[0.06]'
              }`}
            >
              ทั้งหมด ({pendingOutbound.length})
            </button>
            {(Object.keys(ROUTE_DEFINITIONS) as RouteCode[]).map((rCode) => {
              const r = ROUTE_DEFINITIONS[rCode];
              const count = pendingOutbound.filter(item => {
                const order = orders.find(o => o.id === item.order_id);
                return order?.route_code === rCode;
              }).length;

              return (
                <button
                  key={rCode}
                  onClick={() => setRouteFilter(rCode)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                    routeFilter === rCode
                      ? `${r.badgeBg} ${r.badgeText} ${r.badgeBorder} border shadow-md font-bold`
                      : 'bg-white/[0.04] text-slate-400 hover:text-slate-200 border border-white/[0.06]'
                  }`}
                >
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: r.color }}></span>
                  <span>{r.shortName}</span>
                  <span className="text-[10px] opacity-75">({count})</span>
                </button>
              );
            })}
          </div>

          {pendingOutbound.length === 0 ? (
            <div className="text-center py-12 text-slate-500 border border-dashed border-white/[0.1] rounded-2xl">
              <CheckCircle className="w-10 h-10 mx-auto mb-2 text-emerald-400 opacity-60" />
              <p className="text-sm font-medium text-slate-200">ไม่มีรายการสินค้าค้างเตรียมส่ง</p>
              <p className="text-xs text-slate-500 mt-0.5">สินค้าที่ถูกตัดสต๊อกได้รับการติดวอยและแพ็คส่งหมดแล้ว</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {pendingOutbound
                .filter(item => {
                  if (routeFilter === 'all') return true;
                  const order = orders.find(o => o.id === item.order_id);
                  return order?.route_code === routeFilter;
                })
                .map((item) => {
                const order = orders.find(o => o.id === item.order_id);
                const routeMeta = order?.route_code ? ROUTE_DEFINITIONS[order.route_code] : null;
                const currentSn = snInputs[item.id] !== undefined
                  ? snInputs[item.id]
                  : `BC-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`;
                const currentVoidDate = voidDateInputs[item.id] || todayStr;

                return (
                  <div
                    key={item.id}
                    className="p-5 rounded-2xl liquid-glass-card flex flex-col justify-between space-y-4 relative overflow-hidden"
                  >
                    {/* Top Accent bar based on route */}
                    {routeMeta && (
                      <div 
                        className="absolute top-0 left-0 right-0 h-1" 
                        style={{ backgroundColor: routeMeta.color }}
                      />
                    )}

                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30">
                          รอติดวอย & แพ็คส่ง
                        </span>
                        <span className="text-[10px] text-slate-500 font-mono">
                          บิล: {order && order.bill_no ? order.bill_no : '-'}
                        </span>
                      </div>

                      {/* Prominent Route Badge for Prep Prioritization */}
                      {routeMeta ? (
                        <div className={`mb-2.5 px-2.5 py-1 rounded-xl text-xs font-bold border flex items-center justify-between ${routeMeta.badgeBg} ${routeMeta.badgeBorder} ${routeMeta.badgeText}`}>
                          <span className="flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: routeMeta.color }}></span>
                            <span>{routeMeta.name}</span>
                          </span>
                          <span className="text-[10px] opacity-80">{order?.district || ''}</span>
                        </div>
                      ) : (
                        <div className="mb-2.5 px-2.5 py-1 rounded-xl text-xs font-semibold bg-white/[0.04] text-slate-400 border border-white/[0.06]">
                          ไม่ระบุสายรถ
                        </div>
                      )}

                      <h4 className="text-sm font-bold text-white mb-1">{item.model_name}</h4>
                      <p className="text-xs text-slate-300 font-medium">ลูกค้า: {order ? order.customer_name : '-'}</p>
                      <p className="text-xs text-slate-500 mt-1 flex items-start gap-1">
                        <MapPin className="w-3.5 h-3.5 text-slate-400 flex-shrink-0 mt-0.5" />
                        <span className="line-clamp-2">
                          {order ? `${order.delivery_location} (${order.district || 'ไม่ระบุอำเภอ'})` : '-'}
                        </span>
                      </p>
                    </div>

                    <div className="space-y-3 pt-2 border-t border-white/[0.08]">
                      {/* S/N Input */}
                      <div>
                        <label className="block text-[11px] font-medium text-slate-300 mb-1">
                          สแกน / กรอก Serial Number (S/N):
                        </label>
                        <div className="relative">
                          <input
                            type="text"
                            value={currentSn}
                            onChange={(e) => setSnInputs({ ...snInputs, [item.id]: e.target.value })}
                            className="w-full liquid-glass-input rounded-xl px-3 py-2 text-xs font-mono text-[#FF6B00] focus:outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => generateNewSn(item.id)}
                            title="สุ่ม S/N ใหม่"
                            className="absolute right-2.5 top-2.5 text-slate-400 hover:text-[#FF6B00] cursor-pointer"
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Void Date Input - ช่างเตรียมเป็นคนติดวอย */}
                      <div>
                        <label className="block text-[11px] font-medium text-amber-300 mb-1 flex items-center justify-between">
                          <span>วันที่ติดวอยรับประกัน (Void Date) *</span>
                          <span className="text-[10px] text-slate-400 font-normal">ช่างเตรียมติดวอย</span>
                        </label>
                        <input
                          type="date"
                          value={currentVoidDate}
                          onChange={(e) => setVoidDateInputs({ ...voidDateInputs, [item.id]: e.target.value })}
                          className="w-full liquid-glass-input rounded-xl px-3 py-2 text-xs font-mono text-white focus:outline-none"
                        />
                      </div>

                      <button
                        onClick={() => handlePrepOutbound(item.id)}
                        className="w-full py-2.5 bg-gradient-to-r from-[#FF6B00] to-[#E65A00] hover:from-[#FF8A24] hover:to-[#FF6B00] active:scale-95 text-black font-extrabold rounded-xl text-xs transition-all duration-200 cursor-pointer flex items-center justify-center gap-1.5 shadow-lg shadow-[#FF6B00]/25 border border-white/20"
                      >
                        <BadgeCheck className="w-4 h-4" />
                        <span>ติดวอยรับประกัน & แพ็คพร้อมส่ง</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: เตรียมของเข้าสต๊อก (INBOUND STOCK) */}
      {/* ========================================================================= */}
      {prepTab === 'inbound' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Inbound Form */}
          <div className="liquid-glass rounded-3xl p-6 shadow-2xl border border-white/[0.08]">
            <h3 className="text-sm font-bold text-white mb-1 flex items-center gap-2">
              <Warehouse className="w-4 h-4 text-[#FF6B00]" />
              เตรียมเครื่องเข้าสต๊อกสินค้า (Stock Inbound)
            </h3>
            <p className="text-xs text-slate-400 mb-4">ประกอบ, เทสระบบ, ติดโลโก้ BossComputech และเก็บเข้าคลังพร้อมขาย (ยังไม่ติดวอย)</p>

            <form onSubmit={handlePrepInbound} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-300 font-medium mb-1">รุ่นสินค้า (Hardware Model) *</label>
                <select
                  value={inboundModel}
                  onChange={(e) => setInboundModel(e.target.value)}
                  className="w-full liquid-glass-input rounded-2xl px-3.5 py-2 text-white focus:outline-none"
                >
                  <option value="BossComputech Core-i7 Workstation Pro" className="bg-[#12141A]">BossComputech Core-i7 Workstation Pro</option>
                  <option value="BossComputech Mini POS Terminal X1" className="bg-[#12141A]">BossComputech Mini POS Terminal X1</option>
                  <option value="BossComputech AI Edge Box Ultra" className="bg-[#12141A]">BossComputech AI Edge Box Ultra</option>
                  <option value="BossComputech All-in-One Touch 21.5&quot;" className="bg-[#12141A]">BossComputech All-in-One Touch 21.5"</option>
                  <option value="BossComputech Rack Server 1U Standard" className="bg-[#12141A]">BossComputech Rack Server 1U Standard</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Serial Number (S/N ประจำตัวเครื่อง) *</label>
                <div className="relative">
                  <input
                    type="text"
                    required
                    value={inboundSn}
                    onChange={(e) => setInboundSn(e.target.value)}
                    className="w-full liquid-glass-input rounded-2xl px-3.5 py-2 text-white font-mono focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setInboundSn(`BC-STOCK-${Math.floor(100 + Math.random() * 900)}`)}
                    title="สุ่ม S/N ใหม่"
                    className="absolute right-3 top-2.5 text-slate-400 hover:text-[#FF6B00]"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">ตำแหน่งจัดเก็บ / บันทึกช่าง</label>
                <input
                  type="text"
                  value={inboundNotes}
                  onChange={(e) => setInboundNotes(e.target.value)}
                  placeholder="เช่น เก็บเข้าชั้น A2, เทส Burn-in 24 ชม. ผ่าน"
                  className="w-full liquid-glass-input rounded-2xl px-3.5 py-2 text-white focus:outline-none"
                />
              </div>

              <div className="p-3 rounded-2xl bg-white/[0.03] border border-white/[0.06] text-slate-400 leading-relaxed text-[11px]">
                <p className="text-white font-semibold mb-1">📌 หมายเหตุ:</p>
                เครื่องที่เตรียมเข้าสต๊อกจะยังไม่มีการติดวอยรับประกัน จนกว่าจะมีออเดอร์ขายจริงและถูกเบิกออกไปส่ง
              </div>

              <button
                type="submit"
                className="w-full py-2.5 bg-gradient-to-r from-[#FF6B00] to-[#E65A00] hover:from-[#FF8A24] hover:to-[#FF6B00] text-black font-extrabold rounded-2xl text-xs transition-all duration-200 cursor-pointer flex items-center justify-center gap-1.5 shadow-xl shadow-[#FF6B00]/25 border border-white/20"
              >
                <Plus className="w-4 h-4" />
                <span>บันทึกเตรียมเข้าสต๊อกสินค้า</span>
              </button>
            </form>
          </div>

          {/* Current Stock Items List */}
          <div className="lg:col-span-2 liquid-glass rounded-3xl p-6 shadow-2xl border border-white/[0.08]">
            <h3 className="text-sm font-bold text-white mb-4 flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-[#FF6B00]" />
                สินค้าพร้อมขายในคลังสต๊อก (In Stock)
              </span>
              <span className="text-xs text-slate-500">{inStockItems.length} เครื่องในสต๊อก</span>
            </h3>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-white/[0.03] text-slate-400 border-b border-white/[0.06]">
                  <tr>
                    <th className="py-3 px-3">Serial Number</th>
                    <th className="py-3 px-3">รุ่นสินค้า</th>
                    <th className="py-3 px-3">เวลาเตรียมเสร็จ</th>
                    <th className="py-3 px-3">ตำแหน่ง / หมายเหตุ</th>
                    <th className="py-3 px-3 text-right">สถานะวอย</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.05]">
                  {inStockItems.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-slate-500">
                        ยังไม่มีสินค้าในสต๊อก (กรอกฟอร์มด้านซ้ายเพื่อเพิ่มเครื่องเข้าสต๊อก)
                      </td>
                    </tr>
                  ) : (
                    inStockItems.map((item) => (
                      <tr key={item.id} className="hover:bg-white/[0.03] transition">
                        <td className="py-3 px-3 font-mono font-bold text-[#FF6B00]">{item.serial_number}</td>
                        <td className="py-3 px-3 text-white font-medium">{item.model_name}</td>
                        <td className="py-3 px-3 text-slate-400 font-mono text-[11px]">
                          {item.prepped_at ? new Date(item.prepped_at).toLocaleDateString('th-TH') : '-'}
                        </td>
                        <td className="py-3 px-3 text-slate-300 max-w-xs truncate">{item.notes || '-'}</td>
                        <td className="py-3 px-3 text-right">
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] bg-white/[0.05] text-slate-400 border border-white/[0.08]">
                            รอขาย (ยังไม่ติดวอย)
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
