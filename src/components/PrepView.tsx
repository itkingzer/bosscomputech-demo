import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import {
  PackageSearch, BadgeCheck, CheckCircle, RefreshCw,
  Warehouse, Send, ShieldCheck, Plus, Hash, Layers, MapPin,
  Clock, UserCheck, AlertTriangle, ShieldAlert, Sparkles, Truck
} from 'lucide-react';
import { ROUTE_DEFINITIONS, RouteCode } from '../types';

export const PrepView: React.FC = () => {
  const {
    items, orders, prepInboundStock, acceptPrepTask,
    prepFinishToStock, applyVoidAndDispatch, currentUser
  } = useApp();

  // Tab state: 'stage1' (เตรียมของเข้าสต๊อก - ยังไม่ติดวอย) vs 'stage2' (เตรียมของออกไปส่ง - แปะวอยประกัน) vs 'stock' (สต๊อกทั่วไป)
  const [prepTab, setPrepTab] = useState<'stage1' | 'stage2' | 'stock'>('stage1');

  // Filter by route in outbound queue
  const [routeFilter, setRouteFilter] = useState<'all' | RouteCode>('all');

  // Stage 1: S/N inputs & notes
  const [snInputs, setSnInputs] = useState<Record<string, string>>({});
  const [prepNotesInputs, setPrepNotesInputs] = useState<Record<string, string>>({});

  // Stage 2: Void date inputs
  const [voidDateInputs, setVoidDateInputs] = useState<Record<string, string>>({});

  // Inbound stock general state
  const [inboundModel, setInboundModel] = useState('BossComputech Core-i7 Workstation Pro');
  const [inboundSn, setInboundSn] = useState(`BC-STOCK-${Math.floor(100 + Math.random() * 900)}`);
  const [inboundNotes, setInboundNotes] = useState('ประกอบเทสผ่าน ติดโลโก้ เก็บเข้าสต๊อกพร้อมขาย');

  const [toast, setToast] = useState('');
  const todayStr = new Date().toISOString().split('T')[0];

  // Items for Stage 1: pending_prep (รอช่างเตรียมของ/ลงโปรแกรม/ยิง S/N ยังไม่ติดวอย)
  const stage1Items = items.filter(i => i.status === 'pending_prep');

  // Items for Stage 2: prepped_in_stock (พร้อมส่งในสต๊อก - รอแปะวอยปล่อยของ)
  const stage2Items = items.filter(i => i.status === 'prepped_in_stock');

  // In stock items general
  const generalStockItems = items.filter(i => i.status === 'in_stock');

  const currentTechName = currentUser?.name || 'ช่างกอล์ฟ (ช่างเตรียมสินค้า)';

  // Handle Accept Prep Task (บันทึกชื่อผู้รับงานและเวลาอัตโนมัติ)
  const handleAcceptTask = (itemId: string) => {
    acceptPrepTask(itemId, currentTechName);
    setToast(`ช่าง "${currentTechName}" รับงานชิ้นนี้เรียบร้อยแล้ว`);
    setTimeout(() => setToast(''), 3500);
  };

  // Handle Stage 1 Finish: เตรียมเสร็จ / เก็บเข้าสต๊อกรอส่ง (ยังไม่ติดวอย)
  const handleFinishStage1 = (itemId: string) => {
    const defaultSn = `BC-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`;
    const sn = (snInputs[itemId] || defaultSn).trim();
    const note = prepNotesInputs[itemId] || 'ประกอบ/ลงโปรแกรม/ติดโลโก้ผ่าน เก็บเข้าสต๊อกรอแปะวอย';

    const success = prepFinishToStock(itemId, sn, note);
    if (!success) {
      alert(`Serial Number "${sn}" นี้ถูกใช้งานแล้วในระบบ! โปรดใช้หมายเลขอื่น`);
      return;
    }

    setToast(`ผูก S/N: ${sn} และเก็บเข้าสต๊อก "พร้อมส่ง - รอแปะวอย" เรียบร้อย (เด้งไปแท็บเตรียมปล่อยของแล้ว)`);
    setTimeout(() => setToast(''), 4000);
  };

  // Handle Stage 2 Finish: แปะวอยประกัน & ยืนยันปล่อยของออก (บันทึกวันที่ติดวอยผูกกับ S/N)
  const handleDispatchStage2 = (itemId: string, sn: string | null) => {
    const voidDate = voidDateInputs[itemId] || todayStr;
    applyVoidAndDispatch(itemId, voidDate);

    setToast(`แปะวอยรับประกัน (${voidDate}) ให้เครื่อง S/N: ${sn || '-'} เรียบร้อย! ปล่อยของให้ทีมจัดส่ง/หน้าร้านแล้ว`);
    setTimeout(() => setToast(''), 4000);
  };

  // Handle Inbound General Stock Prep
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

      {/* Role Rule & Logic Banner: 2 จังหวะตามหน้างานจริง */}
      <div className="p-4 rounded-2xl liquid-glass border border-[#FF6B00]/40 flex items-start gap-3.5 text-[#FF6B00] relative overflow-hidden">
        <div className="p-2 rounded-xl bg-[#FF6B00]/20 text-[#FF6B00] border border-[#FF6B00]/30 flex-shrink-0">
          <ShieldCheck className="w-5 h-5" />
        </div>
        <div className="text-xs leading-relaxed">
          <strong className="font-bold text-sm block mb-0.5 text-white">ขั้นตอนการทำงาน 2 จังหวะของช่างเตรียมสินค้า (Hardware Prep Specialist):</strong>
          1. <strong>จังหวะที่ 1 (เตรียมของเข้าสต๊อก):</strong> รับงานจากจัดซื้อ ดูหมายเหตุหน้างาน/การส่งมอบ ติดโลโก้ ลง Driver ยิง S/N และเก็บเข้าสต๊อก <span className="underline font-bold text-amber-300">(ยังไม่ติดวอยประกัน)</span><br />
          2. <strong>จังหวะที่ 2 (เตรียมของออกไปส่ง):</strong> เมื่อถึงรอบปล่อยของจริง แปะวอยประกัน (Warranty Void) ผูกกับ S/N พร้อมลงวันที่ส่งมอบจริง ก่อนส่งมอบให้ช่าง Onsite หรือหน้าร้าน
        </div>
      </div>

      {/* Prep View Tabs: จังหวะ 1 vs จังหวะ 2 vs สต๊อกทั่วไป */}
      <div className="flex gap-2 pb-1 overflow-x-auto">
        <button
          onClick={() => setPrepTab('stage1')}
          className={`px-4 py-2.5 text-xs font-semibold rounded-2xl transition-all cursor-pointer flex items-center gap-2 whitespace-nowrap ${prepTab === 'stage1'
            ? 'liquid-glass-active font-extrabold shadow-lg shadow-[#FF6B00]/25'
            : 'liquid-glass-card text-slate-400 hover:text-white'
            }`}
        >
          <PackageSearch className="w-4 h-4" />
          <span>จังหวะที่ 1: เตรียมของเข้าสต๊อก (ยังไม่ติดวอย) ({stage1Items.length})</span>
        </button>

        <button
          onClick={() => setPrepTab('stage2')}
          className={`px-4 py-2.5 text-xs font-semibold rounded-2xl transition-all cursor-pointer flex items-center gap-2 whitespace-nowrap ${prepTab === 'stage2'
            ? 'liquid-glass-active font-extrabold shadow-lg shadow-[#FF6B00]/25'
            : 'liquid-glass-card text-slate-400 hover:text-white'
            }`}
        >
          <Send className="w-4 h-4" />
          <span>จังหวะที่ 2: เตรียมของออกไปส่ง (แปะวอยประกัน) ({stage2Items.length})</span>
        </button>

        <button
          onClick={() => setPrepTab('stock')}
          className={`px-4 py-2.5 text-xs font-semibold rounded-2xl transition-all cursor-pointer flex items-center gap-2 whitespace-nowrap ${prepTab === 'stock'
            ? 'liquid-glass-active font-extrabold shadow-lg shadow-[#FF6B00]/25'
            : 'liquid-glass-card text-slate-400 hover:text-white'
            }`}
        >
          <Warehouse className="w-4 h-4" />
          <span>สต๊อกเครื่องประกอบสำเร็จในคลัง ({generalStockItems.length})</span>
        </button>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: จังหวะที่ 1 (เตรียมของเข้าสต๊อก - ยังไม่ติดวอย) */}
      {/* ========================================================================= */}
      {prepTab === 'stage1' && (
        <div className="liquid-glass rounded-3xl p-6 sm:p-7 shadow-2xl border border-white/[0.08]">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <div className="p-2 rounded-xl bg-amber-500/15 text-amber-400 border border-amber-500/30">
                  <PackageSearch className="w-5 h-5" />
                </div>
                <span>จังหวะที่ 1: คิวรับงานเตรียมสินค้า & ยิง S/N (ยังไม่ติดวอย)</span>
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                ตรวจหมายเหตุถึงช่างเตรียม ติดโลโก้ BossComputech ลง Driver ยิง S/N และกดเก็บเข้าสต๊อกรอส่ง
              </p>
            </div>
            <span className="text-xs font-semibold px-3 py-1 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30">
              {stage1Items.length} เครื่องรอเตรียม
            </span>
          </div>

          {stage1Items.length === 0 ? (
            <div className="text-center py-12 text-slate-500 border border-dashed border-white/[0.1] rounded-2xl">
              <CheckCircle className="w-10 h-10 mx-auto mb-2 text-emerald-400 opacity-60" />
              <p className="text-sm font-medium text-slate-200">ไม่มีรายการสินค้าค้างเตรียม</p>
              <p className="text-xs text-slate-500 mt-0.5">สินค้าทุกชิ้นถูกเตรียมเสร็จและเก็บเข้าสต๊อกรอปล่อยของแล้ว</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {stage1Items.map((item) => {
                const order = orders.find(o => o.id === item.order_id);
                const rMeta = order?.route_code ? ROUTE_DEFINITIONS[order.route_code] : null;
                const currentSn = snInputs[item.id] !== undefined
                  ? snInputs[item.id]
                  : `BC-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`;

                const isAccepted = !!item.assigned_prep_tech;

                return (
                  <div
                    key={item.id}
                    className="p-5 rounded-2xl liquid-glass-card flex flex-col justify-between space-y-4 relative overflow-hidden border border-white/[0.08]"
                  >
                    <div>
                      {/* Top Header */}
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30">
                          {isAccepted ? 'กำลังเตรียมของ' : 'รอช่างกดรับงาน'}
                        </span>
                        <span className="text-[10px] text-slate-500 font-mono">
                          บิล: {order?.bill_no || item.po_no || '-'}
                        </span>
                      </div>

                      {/* Route & Delivery Mode Badges */}
                      <div className="flex items-center gap-1.5 flex-wrap mb-2">
                        {rMeta && (
                          <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${rMeta.badgeBg} ${rMeta.badgeBorder} ${rMeta.badgeText}`}>
                            {rMeta.shortName} • {order?.district || '-'}
                          </span>
                        )}
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-blue-500/15 text-blue-300 border border-blue-500/30">
                          {item.delivery_mode === 'install' && 'ส่งพร้อมติดตั้ง'}
                          {item.delivery_mode === 'drop_off' && 'ส่งไม่ต้องติดตั้ง'}
                          {item.delivery_mode === 'customer_pickup' && 'ลูกค้ารับเองหน้าร้าน'}
                          {!item.delivery_mode && 'ส่งพร้อมติดตั้ง'}
                        </span>
                      </div>

                      <h4 className="text-sm font-bold text-white mb-1">{item.model_name}</h4>
                      <p className="text-xs text-slate-300">ลูกค้า: {order ? order.customer_name : '-'}</p>

                      {/* Prep Note Alert from Purchasing */}
                      {item.prep_note && (
                        <div className="mt-2 p-2.5 rounded-xl bg-[#FF6B00]/10 border border-[#FF6B00]/30 text-[11px] text-[#FF6B00]">
                          <strong>หมายเหตุถึงช่าง:</strong> {item.prep_note}
                        </div>
                      )}

                      {/* Supplier & PO info */}
                      {(item.supplier || item.po_no) && (
                        <div className="mt-2 text-[10px] text-slate-400 flex justify-between">
                          <span>แหล่ง: {item.supplier || 'สต๊อกร้าน'}</span>
                          <span>PO: {item.po_no || '-'}</span>
                        </div>
                      )}

                      {/* Accepted Status */}
                      {isAccepted ? (
                        <div className="mt-2 text-[10px] text-emerald-400 flex items-center gap-1">
                          <UserCheck className="w-3.5 h-3.5" />
                          <span>ผู้รับงาน: {item.assigned_prep_tech} ({new Date(item.prep_accepted_at || Date.now()).toLocaleTimeString('th-TH')})</span>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleAcceptTask(item.id)}
                          className="mt-2 w-full py-1.5 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] text-amber-300 text-[11px] font-semibold border border-amber-500/30 transition cursor-pointer flex items-center justify-center gap-1"
                        >
                          <UserCheck className="w-3.5 h-3.5" />
                          <span>กดรับงานเตรียมชิ้นนี้ (บันทึกเวลา)</span>
                        </button>
                      )}
                    </div>

                    {/* S/N Input & Finish Stage 1 */}
                    <div className="space-y-3 pt-2 border-t border-white/[0.08]">
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

                      <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-[10px] text-amber-300 text-center">
                        * จังหวะที่ 1 ยังไม่ติดวอยประกัน จะติดเมื่อปล่อยของออกในจังหวะที่ 2
                      </div>

                      <button
                        onClick={() => handleFinishStage1(item.id)}
                        className="w-full py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 text-black font-extrabold rounded-xl text-xs transition cursor-pointer flex items-center justify-center gap-1.5 shadow-lg shadow-amber-500/25 border border-white/20 active:scale-95"
                      >
                        <BadgeCheck className="w-4 h-4" />
                        <span>เตรียมเสร็จ / เก็บเข้าสต๊อกรอส่ง</span>
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
      {/* TAB 2: จังหวะที่ 2 (เตรียมของออกไปส่ง - แปะวอยประกัน) */}
      {/* ========================================================================= */}
      {prepTab === 'stage2' && (
        <div className="liquid-glass rounded-3xl p-6 sm:p-7 shadow-2xl border border-white/[0.08]">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <div className="p-2 rounded-xl bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                  <Send className="w-5 h-5" />
                </div>
                <span>จังหวะที่ 2: คิวพร้อมส่งในสต๊อก & แปะวอยประกันปล่อยของออก</span>
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                ของที่เตรียมเสร็จแล้วพร้อมส่ง (ทั้งสายรถ 1-6 และลูกค้ารับเอง) แปะวอยประกันและระบุวันที่ปล่อยของจริง
              </p>
            </div>
            <span className="text-xs font-semibold px-3 py-1 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
              {stage2Items.length} เครื่องพร้อมปล่อยของ
            </span>
          </div>

          {/* Route Filter Pills */}
          <div className="flex items-center gap-1.5 mb-5 pb-1 overflow-x-auto text-xs">
            <span className="text-slate-400 font-medium whitespace-nowrap mr-1">แยกตามสายรถ:</span>
            <button
              onClick={() => setRouteFilter('all')}
              className={`px-3 py-1.5 rounded-xl font-semibold transition cursor-pointer whitespace-nowrap ${routeFilter === 'all'
                ? 'bg-white/20 text-white border border-white/40 shadow-sm'
                : 'bg-white/[0.04] text-slate-400 hover:text-white border border-white/[0.06]'
                }`}
            >
              ทั้งหมด ({stage2Items.length})
            </button>
            {(Object.keys(ROUTE_DEFINITIONS) as RouteCode[]).map((rCode) => {
              const r = ROUTE_DEFINITIONS[rCode];
              const count = stage2Items.filter(item => {
                const order = orders.find(o => o.id === item.order_id);
                return order?.route_code === rCode;
              }).length;

              return (
                <button
                  key={rCode}
                  onClick={() => setRouteFilter(rCode)}
                  className={`px-3 py-1.5 rounded-xl font-semibold transition cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${routeFilter === rCode
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

          {stage2Items.length === 0 ? (
            <div className="text-center py-12 text-slate-500 border border-dashed border-white/[0.1] rounded-2xl">
              <CheckCircle className="w-10 h-10 mx-auto mb-2 text-emerald-400 opacity-60" />
              <p className="text-sm font-medium text-slate-200">ไม่มีสินค้าค้างแปะวอยปล่อยของ</p>
              <p className="text-xs text-slate-500 mt-0.5">สินค้าทุกชิ้นถูกส่งมอบให้ทีมรถ Onsite หรือส่งมอบให้ลูกค้าเรียบร้อยแล้ว</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {stage2Items
                .filter(item => {
                  if (routeFilter === 'all') return true;
                  const order = orders.find(o => o.id === item.order_id);
                  return order?.route_code === routeFilter;
                })
                .map((item) => {
                  const order = orders.find(o => o.id === item.order_id);
                  const routeMeta = order?.route_code ? ROUTE_DEFINITIONS[order.route_code] : null;
                  const currentVoidDate = voidDateInputs[item.id] || todayStr;

                  return (
                    <div
                      key={item.id}
                      className="p-5 rounded-2xl liquid-glass-card flex flex-col justify-between space-y-4 relative overflow-hidden border-emerald-500/30"
                    >
                      <div className="absolute top-0 left-0 right-0 h-1 bg-emerald-500" />

                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                            พร้อมส่งในสต๊อก (รอแปะวอย)
                          </span>
                          <span className="text-xs font-mono font-bold text-[#FF6B00]">
                            S/N: {item.serial_number}
                          </span>
                        </div>

                        {/* Route & Delivery Mode */}
                        <div className="flex items-center gap-1.5 flex-wrap mb-2">
                          {routeMeta && (
                            <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${routeMeta.badgeBg} ${routeMeta.badgeBorder} ${routeMeta.badgeText}`}>
                              {routeMeta.shortName} • {order?.district || ''}
                            </span>
                          )}
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-blue-500/15 text-blue-300 border border-blue-500/30">
                            {item.delivery_mode === 'install' && 'ส่งพร้อมติดตั้ง'}
                            {item.delivery_mode === 'drop_off' && 'ส่งไม่ต้องติดตั้ง'}
                            {item.delivery_mode === 'customer_pickup' && 'ลูกค้ารับเองหน้าร้าน'}
                            {!item.delivery_mode && 'ส่งพร้อมติดตั้ง'}
                          </span>
                        </div>

                        <h4 className="text-sm font-bold text-white mb-1">{item.model_name}</h4>
                        <p className="text-xs text-slate-300 font-medium">ลูกค้า: {order ? order.customer_name : '-'}</p>
                        <p className="text-xs text-slate-500 mt-1 flex items-start gap-1">
                          <MapPin className="w-3.5 h-3.5 text-slate-400 flex-shrink-0 mt-0.5" />
                          <span className="line-clamp-2">
                            {order ? `${order.delivery_location}` : '-'}
                          </span>
                        </p>
                      </div>

                      {/* Stage 2 Action: แปะวอย & ปล่อยของ */}
                      <div className="pt-3 border-t border-white/[0.08] space-y-3">
                        <div>
                          <label className="block text-[11px] font-medium text-amber-300 mb-1 flex items-center justify-between">
                            <span>วันที่ติดวอยรับประกันจริง (Void Date) *</span>
                            <span className="text-[10px] text-slate-400 font-normal">นับประกันจากวันนี้</span>
                          </label>
                          <input
                            type="date"
                            value={currentVoidDate}
                            onChange={(e) => setVoidDateInputs({ ...voidDateInputs, [item.id]: e.target.value })}
                            className="w-full liquid-glass-input rounded-xl px-3 py-2 text-xs font-mono text-white focus:outline-none"
                          />
                        </div>

                        <button
                          onClick={() => handleDispatchStage2(item.id, item.serial_number)}
                          className="w-full py-2.5 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 text-black font-extrabold rounded-xl text-xs transition cursor-pointer flex items-center justify-center gap-1.5 shadow-lg shadow-emerald-500/25 border border-white/20 active:scale-95"
                        >
                          <BadgeCheck className="w-4 h-4" />
                          <span>แปะวอยประกัน & ยืนยันปล่อยของออก</span>
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
      {/* TAB 3: สต๊อกเครื่องประกอบสำเร็จในคลัง */}
      {/* ========================================================================= */}
      {prepTab === 'stock' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="liquid-glass rounded-3xl p-6 shadow-2xl border border-white/[0.08]">
            <h3 className="text-sm font-bold text-white mb-1 flex items-center gap-2">
              <Warehouse className="w-4 h-4 text-[#FF6B00]" />
              เตรียมเครื่องเข้าสต๊อกสินค้า (Stock Inbound)
            </h3>
            <p className="text-xs text-slate-400 mb-4">ประกอบ เทสระบบ ติดโลโก้ BossComputech เก็บเข้าคลังพร้อมขาย (ยังไม่ติดวอย)</p>

            <form onSubmit={handlePrepInbound} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-300 font-medium mb-1">รุ่นสินค้า *</label>
                <input
                  type="text"
                  value={inboundModel}
                  onChange={(e) => setInboundModel(e.target.value)}
                  className="w-full liquid-glass-input rounded-2xl px-3.5 py-2 text-white focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Serial Number (S/N) *</label>
                <input
                  type="text"
                  value={inboundSn}
                  onChange={(e) => setInboundSn(e.target.value)}
                  className="w-full liquid-glass-input rounded-2xl px-3.5 py-2 text-white font-mono focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">หมายเหตุ</label>
                <input
                  type="text"
                  value={inboundNotes}
                  onChange={(e) => setInboundNotes(e.target.value)}
                  className="w-full liquid-glass-input rounded-2xl px-3.5 py-2 text-white focus:outline-none"
                />
              </div>

              <button
                type="submit"
                className="w-full py-2.5 bg-gradient-to-r from-[#FF6B00] to-[#E65A00] hover:from-[#FF8A24] text-black font-extrabold rounded-2xl text-xs transition cursor-pointer flex items-center justify-center gap-1.5 shadow-xl shadow-[#FF6B00]/25 border border-white/20"
              >
                <Plus className="w-4 h-4" />
                <span>บันทึกเครื่องเข้าสต๊อก</span>
              </button>
            </form>
          </div>

          <div className="lg:col-span-2 liquid-glass rounded-3xl p-6 shadow-2xl border border-white/[0.08]">
            <h3 className="text-sm font-bold text-white mb-4 flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Warehouse className="w-4 h-4 text-emerald-400" />
                <span>รายการเครื่องพร้อมขายในคลังสต๊อก</span>
              </span>
              <span className="text-xs text-slate-400">{generalStockItems.length} เครื่อง</span>
            </h3>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-white/[0.04] text-slate-400 border-b border-white/[0.06]">
                  <tr>
                    <th className="py-2.5 px-3">S/N</th>
                    <th className="py-2.5 px-3">รุ่นสินค้า</th>
                    <th className="py-2.5 px-3">หมายเหตุ</th>
                    <th className="py-2.5 px-3">เวลาที่เก็บเข้า</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04]">
                  {generalStockItems.map((item) => (
                    <tr key={item.id} className="hover:bg-white/[0.02]">
                      <td className="py-3 px-3 font-mono font-bold text-[#FF6B00]">{item.serial_number}</td>
                      <td className="py-3 px-3 text-white font-medium">{item.model_name}</td>
                      <td className="py-3 px-3 text-slate-400">{item.notes || '-'}</td>
                      <td className="py-3 px-3 text-slate-500 font-mono text-[11px]">
                        {item.prepped_at ? new Date(item.prepped_at).toLocaleDateString('th-TH') : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
