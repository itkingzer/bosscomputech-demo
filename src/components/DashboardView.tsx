import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import {
  Clock, Package, ClipboardList, Truck, Wrench, CheckCircle2,
  Search, ShieldAlert, CheckCircle, Hash, Warehouse
} from 'lucide-react';
import { ItemStatus } from '../types';

export const DashboardView: React.FC = () => {
  const { orders, items, repairTickets, isSyncing } = useApp();
  const [searchTerm, setSearchTerm] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const pendingPurchasing = orders.filter(o => o.order_status === 'pending_purchasing' || o.order_status === 'waiting_po' || o.order_status === 'po_received_in_stock').length;
  const pendingPrep = items.filter(i => i.status === 'pending_prep').length;
  const readyDispatch = items.filter(i => i.status === 'ready_for_dispatch').length;
  const assignedOnsite = items.filter(i => i.status === 'assigned_onsite').length;
  const inRepair = repairTickets.filter(r => r.status === 'in_progress' || r.status === 'open').length;
  const delivered = items.filter(i => i.status === 'delivered').length;

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearchQuery(searchTerm.trim());
  };

  const searchedItem = searchQuery ? items.find(i => i.serial_number && i.serial_number.toLowerCase() === searchQuery.toLowerCase()) : null;
  const searchedOrder = searchQuery
    ? orders.find(o => (o.bill_no && o.bill_no.toLowerCase() === searchQuery.toLowerCase()) || (searchedItem && searchedItem.order_id === o.id))
    : null;
  const searchedRepairs = searchQuery ? repairTickets.filter(r => r.walkin_sn && r.walkin_sn.toLowerCase() === searchQuery.toLowerCase()) : [];

  const hasSearchResult = searchedItem || searchedOrder || searchedRepairs.length > 0;

  // Warranty calculation
  let warrantyText = 'ยังไม่เริ่มนับประกัน (ยังไม่ติดวอย)';
  let isWarrantyActive = false;
  let isExpired = false;

  if (searchedItem && searchedItem.void_date) {
    const vDate = new Date(searchedItem.void_date);
    const expDate = new Date(vDate);
    expDate.setFullYear(expDate.getFullYear() + 1);
    isExpired = new Date() > expDate;
    isWarrantyActive = !isExpired;
    warrantyText = isExpired
      ? `หมดประกันแล้ว (สิ้นสุด ${expDate.toLocaleDateString('th-TH')})`
      : `อยู่ในประกัน 1 ปี (คุ้มครองถึง ${expDate.toLocaleDateString('th-TH')})`;
  }

  // Beautiful, non-overlapping Thai status badge for items
  const renderItemStatusBadge = (status: ItemStatus) => {
    switch (status) {
      case 'in_stock':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
            <span>ในสต๊อก (พร้อมขาย)</span>
          </span>
        );
      case 'pending_prep':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap bg-amber-500/15 text-amber-400 border border-amber-500/30">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse"></span>
            <span>รอช่างติดวอย & เตรียม</span>
          </span>
        );
      case 'prepped_in_stock':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap bg-teal-500/15 text-teal-400 border border-teal-500/30">
            <span className="w-1.5 h-1.5 rounded-full bg-teal-400"></span>
            <span>เตรียมพร้อมในสต๊อก (รอปล่อย)</span>
          </span>
        );
      case 'ready_for_dispatch':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap bg-blue-500/15 text-blue-400 border border-blue-500/30">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400"></span>
            <span>ติดวอยแล้ว (รอจัดส่ง)</span>
          </span>
        );
      case 'assigned_onsite':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap bg-purple-500/15 text-purple-400 border border-purple-500/30">
            <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse"></span>
            <span>กำลังส่ง Onsite</span>
          </span>
        );
      case 'delivered':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
            <span>ส่งมอบเรียบร้อย</span>
          </span>
        );
      case 'in_repair':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap bg-rose-500/15 text-rose-400 border border-rose-500/30">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-pulse"></span>
            <span>อยู่ระหว่างซ่อม</span>
          </span>
        );
      case 'repaired_ready_return':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap bg-cyan-500/15 text-cyan-400 border border-cyan-500/30">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400"></span>
            <span>ซ่อมเสร็จรอส่งคืน</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap bg-white/[0.05] text-slate-300 border border-white/[0.08]">
            {status}
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Metrics Cards with Liquid Glass */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3.5">
        {isSyncing ? (
          /* Skeleton placeholders while Supabase data is being fetched */
          Array.from({ length: 6 }).map((_, idx) => (
            <div key={`sk-${idx}`} className="liquid-glass-card p-4 rounded-2xl relative overflow-hidden">
              <div className="skeleton h-3 w-3/4 mb-2.5" />
              <div className="skeleton h-6 w-1/2 mb-2" />
              <div className="skeleton h-2.5 w-2/3" />
            </div>
          ))
        ) : (
          <>
            <div className="liquid-glass-card p-4 rounded-2xl relative overflow-hidden group">
              <div className="text-xs text-slate-400 font-medium mb-1 flex items-center justify-between">
                <span>รอจัดซื้อ/เช็กสต๊อก</span>
                <Clock className="w-3.5 h-3.5 text-amber-400" />
              </div>
              <div className="text-2xl font-extrabold text-amber-400 data-key">{pendingPurchasing}</div>
              <div className="text-xs font-medium text-slate-500 mt-1 data-meta">ออเดอร์ใหม่ฝ่ายขาย</div>
            </div>

            <div className="liquid-glass-card p-4 rounded-2xl relative overflow-hidden group">
              <div className="text-xs text-slate-400 font-medium mb-1 flex items-center justify-between">
                <span>รอช่างเตรียม</span>
                <Package className="w-3.5 h-3.5 text-[#FF6B00]" />
              </div>
              <div className="text-2xl font-extrabold text-[#FF6B00] data-key">{pendingPrep}</div>
              <div className="text-xs font-medium text-slate-500 mt-1 data-meta">ชิ้น รอใส่ S/N</div>
            </div>

            <div className="liquid-glass-card p-4 rounded-2xl relative overflow-hidden group">
              <div className="text-xs text-slate-400 font-medium mb-1 flex items-center justify-between">
                <span>พร้อมจัดคิวส่ง</span>
                <ClipboardList className="w-3.5 h-3.5 text-blue-400" />
              </div>
              <div className="text-2xl font-extrabold text-blue-400 data-key">{readyDispatch}</div>
              <div className="text-xs font-medium text-slate-500 mt-1 data-meta">หน้าร้านรอจ่ายงาน</div>
            </div>

            <div className="liquid-glass-card p-4 rounded-2xl relative overflow-hidden group">
              <div className="text-xs text-slate-400 font-medium mb-1 flex items-center justify-between">
                <span>กำลังส่ง Onsite</span>
                <Truck className="w-3.5 h-3.5 text-purple-400" />
              </div>
              <div className="text-2xl font-extrabold text-purple-400 data-key">{assignedOnsite}</div>
              <div className="text-xs font-medium text-slate-500 mt-1 data-meta">ช่างกำลังไปส่ง/ติดวอย</div>
            </div>

            <div className="liquid-glass-card p-4 rounded-2xl relative overflow-hidden group">
              <div className="text-xs text-slate-400 font-medium mb-1 flex items-center justify-between">
                <span>กำลังซ่อมในร้าน</span>
                <Wrench className="w-3.5 h-3.5 text-rose-400" />
              </div>
              <div className="text-2xl font-extrabold text-rose-400 data-key">{inRepair}</div>
              <div className="text-xs font-medium text-slate-500 mt-1 data-meta">ตรวจเช็คบนโต๊ะช่าง</div>
            </div>

            <div className="liquid-glass-card p-4 rounded-2xl relative overflow-hidden group">
              <div className="text-xs text-slate-400 font-medium mb-1 flex items-center justify-between">
                <span>ส่งมอบสมบูรณ์</span>
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              </div>
              <div className="text-2xl font-extrabold text-emerald-400 data-key">{delivered}</div>
              <div className="text-xs font-medium text-slate-500 mt-1 data-meta">ติดวอย & ปิดงานแล้ว</div>
            </div>
          </>
        )}
      </div>

      {/* S/N Traceability Card in Liquid Glass Container */}
      <div className="liquid-glass rounded-3xl p-6 sm:p-7 shadow-2xl border border-white/[0.08] relative">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <div className="p-2 rounded-xl bg-[#FF6B00]/15 text-[#FF6B00] border border-[#FF6B00]/30">
                <Hash className="w-5 h-5" />
              </div>
              <span>ระบบสืบค้นประวัติสินค้าครบวงจร (S/N & Bill Traceability)</span>
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              สืบค้นด้วย Serial Number หรือ เลขที่บิล เพื่อตรวจสอบไทม์ไลน์ 6 ขั้นตอน และสถานะรับประกัน
            </p>
          </div>

          <form onSubmit={handleSearch} className="w-full md:w-96 relative">
            <input
              type="text"
              placeholder="พิมพ์ S/N เช่น BC-2026-001 หรือเลขที่บิล..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full liquid-glass-input rounded-2xl px-4 py-2.5 pl-10 text-sm text-white placeholder-slate-500 focus:outline-none transition"
            />
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
            <button
              type="submit"
              className="absolute right-1.5 top-1.5 px-3 py-1.5 bg-[#FF6B00] hover:bg-[#E65A00] hover:brightness-105 text-black font-bold rounded-xl text-xs transition-all duration-150 active:scale-[0.97] cursor-pointer shadow-md shadow-[#FF6B00]/25"
            >
              ค้นหา
            </button>
          </form>
        </div>

        {/* Quick Sample Chips */}
        <div className="flex flex-wrap gap-2 mb-4">
          <span className="text-xs text-slate-400 self-center">คลิกตัวอย่าง:</span>
          {['BC-2026-001', 'BC-2026-002', 'BC-2026-003', 'INV-2026-088'].map((s) => (
            <button
              key={s}
              onClick={() => {
                setSearchTerm(s);
                setSearchQuery(s);
              }}
              className="text-xs px-2.5 py-1 rounded-xl bg-white/[0.04] border border-white/[0.08] hover:border-[#FF6B00]/50 text-[#FF6B00] font-mono transition-all duration-150 active:scale-[0.97] cursor-pointer"
            >
              {s}
            </button>
          ))}
        </div>

        {/* Search Result Visualizer */}
        <div className="rounded-2xl liquid-glass-card p-5 min-h-[140px] flex items-center justify-center">
          {!searchQuery ? (
            <div className="text-center text-slate-500 py-6">
              <Search className="w-8 h-8 mx-auto mb-2 opacity-40 text-slate-400" />
              <p className="text-xs">ระบุหมายเลขเครื่องหรือคลิกตัวอย่างด้านบนเพื่อเริ่มตรวจสอบ</p>
            </div>
          ) : !hasSearchResult ? (
            <div className="text-center text-slate-400 py-6">
              <ShieldAlert className="w-8 h-8 mx-auto mb-2 text-rose-400" />
              <p className="text-sm font-medium text-white">ไม่พบข้อมูลสำหรับ "{searchQuery}"</p>
              <p className="text-xs text-slate-500 mt-1">โปรดตรวจสอบตัวสะกด หรือลองค้นหาด้วยหมายเลขอื่น</p>
            </div>
          ) : (
            <div className="w-full space-y-5">
              {/* Info Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-white/[0.08] gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs uppercase font-mono px-2.5 py-1 bg-[#FF6B00] text-black font-extrabold rounded-xl shadow-md shadow-[#FF6B00]/25">
                      S/N: {searchedItem ? searchedItem.serial_number : searchQuery}
                    </span>
                    <span className="text-sm font-bold text-white">
                      {searchedItem ? searchedItem.model_name : 'ข้อมูลประวัติการรับซ่อม'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1.5">
                    ลูกค้า: <strong className="text-slate-200">{searchedOrder ? searchedOrder.customer_name : (searchedRepairs[0] ? searchedRepairs[0].customer_name : '-')}</strong>
                  </p>
                </div>
                <div>
                  <span className={`px-3 py-1 rounded-xl text-xs font-semibold border ${isWarrantyActive
                    ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                    : isExpired
                      ? 'bg-rose-500/15 text-rose-400 border-rose-500/30'
                      : 'bg-amber-500/15 text-amber-400 border-amber-500/30'
                    }`}>
                    {warrantyText}
                  </span>
                </div>
              </div>

              {/* 5-Stage Lifecycle Timeline */}
              <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                <div className={`p-3.5 rounded-2xl border ${searchedOrder ? 'border-emerald-500/40 bg-emerald-950/20' : 'border-white/[0.06] bg-white/[0.02] opacity-40'}`}>
                  <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-400 mb-1">
                    <CheckCircle className="w-3.5 h-3.5" />
                    <span>1. ฝ่ายขายเปิดดีล</span>
                  </div>
                  <p className="text-[11px] text-slate-400">{searchedOrder ? `Ref: ${searchedOrder.sales_ref || '-'}` : 'ยังไม่มีข้อมูล'}</p>
                  <p className="text-[10px] text-slate-500 mt-1">{searchedOrder ? new Date(searchedOrder.created_at).toLocaleDateString('th-TH') : ''}</p>
                </div>

                <div className={`p-3.5 rounded-2xl border ${searchedOrder && searchedOrder.bill_no ? 'border-emerald-500/40 bg-emerald-950/20' : 'border-white/[0.06] bg-white/[0.02] opacity-40'}`}>
                  <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-400 mb-1">
                    <CheckCircle className="w-3.5 h-3.5" />
                    <span>2. บัญชีตัดสต๊อก</span>
                  </div>
                  <p className="text-[11px] font-mono text-[#FF6B00]">{searchedOrder && searchedOrder.bill_no ? searchedOrder.bill_no : 'รอออกบิล'}</p>
                  <p className="text-[10px] text-slate-500 mt-1">อนุมัติเบิกของแล้ว</p>
                </div>

                <div className={`p-3.5 rounded-2xl border ${searchedItem && searchedItem.prepped_at ? 'border-emerald-500/40 bg-emerald-950/20' : 'border-white/[0.06] bg-white/[0.02] opacity-40'}`}>
                  <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-400 mb-1">
                    <CheckCircle className="w-3.5 h-3.5" />
                    <span>3. ช่างติดวอย & S/N</span>
                  </div>
                  <p className="text-[11px] text-slate-300">{searchedItem && searchedItem.prepped_at ? 'ช่างติดวอยเสร็จ' : 'รอช่างเตรียม'}</p>
                  <p className="text-[10px] text-emerald-400/90 mt-1">วอยติดโดยช่างเตรียม</p>
                </div>

                <div className={`p-3.5 rounded-2xl border ${searchedItem && searchedItem.status === 'delivered' ? 'border-emerald-500/40 bg-emerald-950/20' : 'border-white/[0.06] bg-white/[0.02] opacity-40'}`}>
                  <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-400 mb-1">
                    <CheckCircle className="w-3.5 h-3.5" />
                    <span>4. Onsite ส่งมอบ</span>
                  </div>
                  <p className="text-[11px] font-mono text-white font-bold">{searchedItem?.status === 'delivered' ? 'ส่งมอบแล้ว' : 'รอดำเนินการ'}</p>
                  <p className="text-[10px] text-purple-400 mt-1">{searchedItem?.assigned_onsite_tech || 'รอจ่ายงาน'}</p>
                </div>

                <div className={`p-3.5 rounded-2xl border ${searchedRepairs.length > 0 ? 'border-rose-500/40 bg-rose-950/20' : 'border-white/[0.06] bg-white/[0.02]'}`}>
                  <div className={`flex items-center gap-1.5 text-xs font-bold ${searchedRepairs.length > 0 ? 'text-rose-400' : 'text-slate-400'} mb-1`}>
                    <Wrench className="w-3.5 h-3.5" />
                    <span>5. ประวัติการซ่อม</span>
                  </div>
                  <p className="text-[11px] text-slate-300">{searchedRepairs.length > 0 ? `${searchedRepairs.length} งานซ่อม` : 'ไม่มีประวัติส่งซ่อม'}</p>
                  <p className="text-[10px] text-slate-500 mt-1">{searchedRepairs.length > 0 ? (searchedRepairs[0].repair_outcome || searchedRepairs[0].status) : 'สภาพสมบูรณ์'}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Live Units Table in Liquid Glass */}
      <div className="liquid-glass rounded-3xl p-6 shadow-2xl border border-white/[0.08]">
        <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
          <Package className="w-4 h-4 text-[#FF6B00]" />
          รายการสินค้าหมุนเวียนในระบบล่าสุด ({items.length} ชิ้น)
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-white/[0.03] text-slate-400 border-b border-white/[0.06]">
              <tr>
                <th className="py-3 px-4 whitespace-nowrap">Serial Number</th>
                <th className="py-3 px-4 whitespace-nowrap">รุ่นสินค้า</th>
                <th className="py-3 px-4 whitespace-nowrap">ลูกค้า</th>
                <th className="py-3 px-4 whitespace-nowrap min-w-[170px]">สถานะสินค้า</th>
                <th className="py-3 px-4 whitespace-nowrap">ช่าง Onsite</th>
                <th className="py-3 px-4 whitespace-nowrap">วันที่ติดวอย (Void)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.05]">
              {items.map((i) => {
                const ord = orders.find(o => o.id === i.order_id);
                return (
                  <tr key={i.id} className="hover:bg-white/[0.03] transition">
                    <td className="py-3.5 px-4 font-mono font-extrabold text-sm text-[#FF6B00] whitespace-nowrap data-key">
                      {i.serial_number || <span className="text-slate-500 font-normal italic">รอใส่ S/N</span>}
                    </td>
                    <td className="py-3.5 px-4 text-base font-bold text-white whitespace-nowrap">{i.model_name}</td>
                    <td className="py-3.5 px-4 text-slate-300 font-medium whitespace-nowrap">{ord ? ord.customer_name : (i.status === 'in_stock' ? <span className="text-emerald-400">สต๊อกร้าน BossComputech</span> : '-')}</td>
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      {renderItemStatusBadge(i.status)}
                    </td>
                    <td className="py-3.5 px-4 text-slate-400 whitespace-nowrap">{i.assigned_onsite_tech || '-'}</td>
                    <td className="py-3.5 px-4 font-mono text-slate-300 whitespace-nowrap">
                      {i.void_date ? (
                        <span className="text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                          {i.void_date}
                        </span>
                      ) : (
                        <span className="text-slate-500 text-[11px] italic">ยังไม่ติดวอย</span>
                      )}
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
