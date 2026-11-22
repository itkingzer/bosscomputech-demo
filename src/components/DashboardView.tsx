import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import {
  Clock, Package, ClipboardList, Truck, Wrench, CheckCircle2,
  Search, ShieldAlert, ShieldCheck, Hash, ChevronRight,
  FileText, ShoppingCart, X
} from 'lucide-react';
import { formatDateDMY, formatThaiDateTime } from '../types';
import {
  SnSearchMatch,
  getToneClasses,
  resolveDeliveryStatus,
  resolveLiveOrderStatus,
  resolveLiveSnStatus,
  resolveLiveStockPOStatus,
  resolveRepairStatus,
  searchSnRecords,
} from '../utils/snLookup';
import { SnDetailModal } from './SnDetailModal';
import { DocumentDetailModal, DocumentDetailTarget } from './DocumentDetailModal';

type UnifiedSearchFilter = 'all' | 'sn' | 'so' | 'po' | 'repair';

export const DashboardView: React.FC = () => {
  const { orders, items, repairTickets, stockPOs, isSyncing } = useApp();
  const [searchTerm, setSearchTerm] = useState('');
  const [searchFilter, setSearchFilter] = useState<UnifiedSearchFilter>('all');
  const [selectedMatch, setSelectedMatch] = useState<SnSearchMatch | null>(null);
  const [selectedDoc, setSelectedDoc] = useState<DocumentDetailTarget>(null);

  const pendingPurchasing = orders.filter(o => o.order_status === 'pending_purchasing' || o.order_status === 'waiting_po' || o.order_status === 'po_received_in_stock').length;
  const pendingPrep = items.filter(i => i.status === 'pending_prep').length;
  const readyDispatch = items.filter(i => i.status === 'ready_for_dispatch').length;
  const assignedOnsite = items.filter(i => i.status === 'assigned_onsite').length;
  const inRepair = repairTickets.filter(r => r.status !== 'returned_closed' && r.repair_status !== 'completed' && !r.delivered_at).length;
  const delivered = items.filter(i => {
    const ord = i.order_id ? orders.find(o => o.id === i.order_id) || null : null;
    return resolveLiveSnStatus(i, ord, []).isCompleted;
  }).length;

  const searchQuery = searchTerm.trim();
  const qLower = searchQuery.toLowerCase();

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearchTerm((prev) => prev.trim());
  };

  const snMatches = useMemo(
    () => searchSnRecords(searchQuery, items, orders, repairTickets),
    [searchQuery, items, orders, repairTickets]
  );

  const repairMatches = useMemo(
    () => snMatches.filter((m) => m.matchKind === 'repair' || m.linkedRepairs.length > 0),
    [snMatches]
  );

  // Quick sample chips from live items/tickets/orders (fallback to defaults)
  const sampleChips = useMemo(() => {
    const liveSns = items
      .map((i) => i.serial_number)
      .filter((sn): sn is string => !!sn && sn.trim().length > 0)
      .slice(0, 2);
    const liveSo = orders
      .map((o) => o.bill_no || o.sales_ref)
      .filter((v): v is string => !!v && v.trim().length > 0)
      .slice(0, 1);
    const livePo = stockPOs
      .map((p) => p.po_number)
      .filter((v): v is string => !!v && v.trim().length > 0)
      .slice(0, 1);
    const liveRep = repairTickets
      .map((t) => t.replacement_sn || t.ticket_no)
      .filter((v): v is string => !!v && v.trim().length > 0)
      .slice(0, 1);
    const combined = Array.from(new Set([...liveSns, ...liveSo, ...livePo, ...liveRep]));
    return combined.length > 0 ? combined : ['BC-2026-001', 'SO-2026-001', 'PO-2026-001', 'INV-2026-088'];
  }, [items, orders, stockPOs, repairTickets]);

  // --- SO (Sales Order) & Purchase Bill (Stock PO) matches from the same unified query ---
  const matchedOrders = useMemo(() => {
    if (!qLower) return [];
    return orders.filter(o => {
      const haystack = [
        o.sales_ref,
        o.bill_no,
        o.customer_name,
        o.customer_phone,
        o.salesperson,
        o.delivery_location,
        ...(o.items_list || []).map(it => it.model_name),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(qLower);
    });
  }, [orders, qLower]);

  const matchedStockPOs = useMemo(() => {
    if (!qLower) return [];
    return stockPOs.filter(p => {
      const haystack = [p.po_number, p.product_name, p.supplier, p.notes]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(qLower);
    });
  }, [stockPOs, qLower]);

  const renderLiveStatusBadge = (live: ReturnType<typeof resolveLiveSnStatus>) => {
    const tone = getToneClasses(live.tone);
    const shouldPulse = !live.isCompleted && (live.tone === 'amber' || live.tone === 'purple' || live.tone === 'rose');
    return (
      <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap border ${tone.badge}`}>
        <span className={`w-1.5 h-1.5 rounded-full ${tone.dot} ${shouldPulse ? 'animate-pulse' : ''}`} />
        <span>{live.label}</span>
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Top Metrics Cards with Liquid Glass */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 sm:gap-3.5">
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

      {/* Unified Global Search (S/N, RMA, SO, Bill, PO, Customer) */}
      <div className="liquid-glass rounded-3xl p-4 sm:p-6 lg:p-7 shadow-2xl border border-white/[0.08] relative">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-5">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <div className="p-2 rounded-xl bg-[#FF6B00]/15 text-[#FF6B00] border border-[#FF6B00]/30">
                <Hash className="w-5 h-5" />
              </div>
              <span>ค้นหาครบวงจร (S/N, ใบสั่งขาย SO, ใบสั่งซื้อ PO & งานซ่อม RMA)</span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              พิมพ์ช่องเดียวค้นได้ทั้ง S/N, S/N ทดแทน, เลขที่บิล, SO, PO, REP-..., ชื่อลูกค้า หรือ Supplier พร้อมสถานะ Real-Time และประกัน
            </p>
          </div>

          <form onSubmit={handleSearch} className="w-full md:w-80 lg:w-96 xl:w-[28rem] flex-shrink-0 relative">
            <input
              type="text"
              placeholder="พิมพ์ S/N, เลขบิล, SO, PO, REP-... หรือชื่อลูกค้า..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full liquid-glass-input rounded-2xl px-4 py-2.5 pl-10 pr-24 text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none transition"
            />
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute right-16 top-3 text-slate-400 hover:text-slate-900 dark:hover:text-white transition cursor-pointer"
                aria-label="ล้างคำค้นหา"
              >
                <X className="w-4 h-4" />
              </button>
            )}
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
          <span className="text-xs text-slate-500 dark:text-slate-400 self-center">คลิกตัวอย่าง:</span>
          {sampleChips.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSearchTerm(s)}
              className="text-xs px-2.5 py-1 rounded-xl bg-slate-100 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] hover:border-[#FF6B00]/50 text-[#FF6B00] font-mono font-semibold transition-all duration-150 active:scale-[0.97] cursor-pointer"
            >
              {s}
            </button>
          ))}
        </div>

        {/* Filter Tabs (when searching) */}
        {searchQuery && (
          <div className="flex flex-wrap items-center gap-2 mb-4">
            {(
              [
                {
                  id: 'all',
                  label: 'ทั้งหมด',
                  count: snMatches.length + matchedOrders.length + matchedStockPOs.length,
                },
                { id: 'sn', label: 'S/N & สินค้า', count: snMatches.length },
                { id: 'so', label: 'ใบสั่งขาย (SO)', count: matchedOrders.length },
                { id: 'po', label: 'ใบสั่งซื้อ (PO)', count: matchedStockPOs.length },
                { id: 'repair', label: 'งานซ่อม / RMA', count: repairMatches.length },
              ] as const
            ).map((tab) => {
              const active = searchFilter === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setSearchFilter(tab.id)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition cursor-pointer ${active
                    ? 'bg-[#FF6B00] text-black border-[#FF6B00] shadow-sm shadow-[#FF6B00]/25'
                    : 'bg-slate-100 dark:bg-white/[0.04] text-slate-700 dark:text-slate-300 border-slate-200 dark:border-white/[0.08] hover:border-[#FF6B00]/40'
                    }`}
                >
                  <span>{tab.label}</span>
                  <span
                    className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono ${active
                      ? 'bg-black/15 text-black'
                      : 'bg-slate-200 dark:bg-white/10 text-slate-700 dark:text-slate-300'
                      }`}
                  >
                    {tab.count}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* Unified Search Results */}
        <div className="rounded-2xl liquid-glass-card p-4 sm:p-5 min-h-[140px]">
          {!searchQuery ? (
            <div className="text-center text-slate-500 py-8">
              <Search className="w-8 h-8 mx-auto mb-2 opacity-40 text-slate-400" />
              <p className="text-xs">
                ระบุ S/N, เลขที่บิล, SO, PO, REP-... หรือชื่อลูกค้า เพื่อตรวจสอบสถานะเรียลไทม์ ประกัน และประวัติทั้งหมด
              </p>
            </div>
          ) : snMatches.length === 0 && matchedOrders.length === 0 && matchedStockPOs.length === 0 ? (
            <div className="text-center text-slate-500 dark:text-slate-400 py-8">
              <ShieldAlert className="w-8 h-8 mx-auto mb-2 text-rose-500 dark:text-rose-400" />
              <p className="text-sm font-bold text-slate-900 dark:text-white">ไม่พบข้อมูลสำหรับ "{searchQuery}"</p>
              <p className="text-xs text-slate-500 mt-1">
                ลองค้นหาด้วย S/N, เลขบิล, SO, PO, REP-..., ชื่อลูกค้า หรือ Supplier
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* 1) S/N & Repair Matches */}
              {(searchFilter === 'all' || searchFilter === 'sn' || searchFilter === 'repair') &&
                (searchFilter === 'repair' ? repairMatches : snMatches).length > 0 && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-400 px-1">
                      <span className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                        <Hash className="w-3.5 h-3.5 text-[#FF6B00]" />
                        {searchFilter === 'repair'
                          ? `งานซ่อม / เคลม RMA (${repairMatches.length} รายการ)`
                          : `S/N & ประวัติสินค้า (${snMatches.length} รายการ)`}
                      </span>
                      <span className="text-[11px] text-[#FF6B00] font-semibold">
                        คลิกที่รายการเพื่อดูรายละเอียด & สรุปยอดทั้งหมด
                      </span>
                    </div>

                    <div className="grid grid-cols-1 gap-3">
                      {(searchFilter === 'repair' ? repairMatches : snMatches).map((m) => {
                        const w = m.warranty;
                        return (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => setSelectedMatch(m)}
                            className="w-full text-left rounded-2xl p-4 border transition-all duration-150 cursor-pointer
                              bg-white hover:bg-slate-50 border-slate-200 hover:border-[#FF6B00]/50 shadow-sm
                              dark:bg-white/[0.03] dark:hover:bg-white/[0.06] dark:border-white/[0.08] dark:hover:border-[#FF6B00]/50"
                          >
                            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                              <div className="space-y-1.5 min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="text-xs font-mono px-2.5 py-1 bg-[#FF6B00] text-black font-extrabold rounded-xl shadow-sm shadow-[#FF6B00]/20">
                                    S/N: {m.primarySn}
                                  </span>
                                  {m.matchedViaReplacementSn && m.replacementSn && (
                                    <span className="text-[11px] font-mono px-2 py-0.5 rounded-lg bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 border border-cyan-500/30 font-bold">
                                      S/N ทดแทน (RMA): {m.replacementSn}
                                    </span>
                                  )}
                                  <span className="text-sm sm:text-base font-bold text-slate-900 dark:text-white truncate">
                                    {m.modelName}
                                  </span>
                                </div>

                                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600 dark:text-slate-300">
                                  <span>
                                    ลูกค้า: <strong className="text-slate-900 dark:text-white">{m.customerName}</strong>
                                  </span>
                                  {m.refNo && (
                                    <span className="font-mono text-slate-500 dark:text-slate-400">
                                      เอกสาร: <strong className="text-slate-800 dark:text-slate-200">{m.refNo}</strong>
                                    </span>
                                  )}
                                  {m.liveStatus.isCompleted && m.liveStatus.completedAt ? (
                                    <span className="text-emerald-700 dark:text-emerald-300 font-semibold">
                                      ปิดงาน: <span className="font-mono">{formatThaiDateTime(m.liveStatus.completedAt)}</span>
                                      {m.liveStatus.completedBy ? ` โดย ${m.liveStatus.completedBy}` : ''}
                                    </span>
                                  ) : m.liveStatus.latestTimestamp ? (
                                    <span className="text-slate-500 dark:text-slate-400">
                                      อัปเดต: <span className="font-mono">{formatThaiDateTime(m.liveStatus.latestTimestamp)}</span>
                                      {m.liveStatus.latestActor ? ` โดย ${m.liveStatus.latestActor}` : ''}
                                    </span>
                                  ) : null}
                                </div>
                              </div>

                              <div className="flex flex-wrap items-center gap-2 shrink-0">
                                {m.deliveryStatus && renderLiveStatusBadge(m.deliveryStatus)}

                                {m.repairSummary && (() => {
                                  const repTone = getToneClasses(m.repairSummary.status.tone);
                                  const isRepActive = m.repairSummary.activeCount > 0;
                                  return (
                                    <span
                                      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap border ${repTone.badge}`}
                                      title={`${m.repairSummary.latestTicket.ticket_no} (${m.repairSummary.totalCount} ครั้ง)`}
                                    >
                                      <Wrench className="w-3 h-3 shrink-0" />
                                      <span>
                                        งานซ่อม{m.repairSummary.totalCount > 1 ? ` (${m.repairSummary.totalCount} ครั้ง)` : ''}: {m.repairSummary.status.label}
                                      </span>
                                      {isRepActive && <span className={`w-1.5 h-1.5 rounded-full ${repTone.dot} animate-pulse`} />}
                                    </span>
                                  );
                                })()}

                                <span
                                  className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${w.state === 'active'
                                    ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30'
                                    : w.state === 'expired'
                                      ? 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30'
                                      : w.state === 'waiting'
                                        ? 'bg-amber-500/15 text-amber-800 dark:text-amber-300 border-amber-500/30'
                                        : 'bg-slate-200/80 dark:bg-white/[0.06] text-slate-700 dark:text-slate-300 border-slate-300 dark:border-white/[0.1]'
                                    }`}
                                >
                                  {w.state === 'active' ? (
                                    <ShieldCheck className="w-3.5 h-3.5" />
                                  ) : (
                                    <ShieldAlert className="w-3.5 h-3.5" />
                                  )}
                                  <span>
                                    {w.state === 'active'
                                      ? `อยู่ในประกัน (${w.durationLabel}${w.expireDate ? ` • หมด ${formatDateDMY(w.expireDate)}` : ''})`
                                      : w.state === 'expired'
                                        ? `หมดประกันแล้ว (${formatDateDMY(w.expireDate)})`
                                        : w.state === 'waiting'
                                          ? `รอแปะวอย (${w.durationLabel})`
                                          : 'ไม่มีข้อมูลประกันในระบบ'}
                                  </span>
                                </span>

                                <span className="inline-flex items-center gap-1 text-xs font-bold text-[#FF6B00] pl-1">
                                  <span className="hidden sm:inline">รายละเอียด</span>
                                  <ChevronRight className="w-4 h-4" />
                                </span>
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

              {/* 2) Sales Orders (SO) */}
              {(searchFilter === 'all' || searchFilter === 'so') && matchedOrders.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-xs font-bold text-blue-600 dark:text-blue-400 flex items-center gap-1.5">
                      <ShoppingCart className="w-3.5 h-3.5" />
                      ใบสั่งขาย (SO) — {matchedOrders.length} รายการ
                    </h3>
                    <span className="text-[11px] text-[#FF6B00] font-semibold">คลิกแถวเพื่อดูรายละเอียด & GP</span>
                  </div>
                  <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-transparent">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-100 dark:bg-white/[0.04] text-slate-600 dark:text-slate-400 border-b border-slate-200 dark:border-white/[0.06]">
                        <tr>
                          <th className="py-2.5 px-3 whitespace-nowrap">SO / บิล</th>
                          <th className="py-2.5 px-3 whitespace-nowrap">ลูกค้า</th>
                          <th className="py-2.5 px-3 whitespace-nowrap">พนักงานขาย</th>
                          <th className="py-2.5 px-3 whitespace-nowrap">สถานะ (Real-Time)</th>
                          <th className="py-2.5 px-3 whitespace-nowrap">วันที่เปิดบิล</th>
                          <th className="py-2.5 px-3 text-right whitespace-nowrap">รายละเอียด</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 dark:divide-white/[0.04]">
                        {matchedOrders.map((o) => {
                          const orderItems = items.filter((it) => it.order_id === o.id);
                          const orderRepairs = repairTickets.filter((t) =>
                            orderItems.some(
                              (it) =>
                                t.item_id === it.id ||
                                (it.serial_number &&
                                  (t.walkin_sn === it.serial_number || t.replacement_sn === it.serial_number))
                            )
                          );
                          const live = resolveLiveOrderStatus(o, orderItems, orderRepairs);
                          return (
                            <tr
                              key={o.id}
                              onClick={() => setSelectedDoc({ kind: 'order', order: o })}
                              className="hover:bg-slate-50 dark:hover:bg-white/[0.04] transition cursor-pointer"
                            >
                              <td className="py-2.5 px-3 whitespace-nowrap">
                                <div className="font-mono font-bold text-[#FF6B00]">{o.sales_ref || '-'}</div>
                                <div className="font-mono text-[11px] text-slate-500 dark:text-slate-400">{o.bill_no || 'รอออกบิล'}</div>
                              </td>
                              <td className="py-2.5 px-3 font-semibold text-slate-900 dark:text-slate-200 whitespace-nowrap">{o.customer_name}</td>
                              <td className="py-2.5 px-3 text-slate-600 dark:text-slate-400 whitespace-nowrap">{o.salesperson || '-'}</td>
                              <td className="py-2.5 px-3 whitespace-nowrap">
                                {renderLiveStatusBadge(live)}
                              </td>
                              <td className="py-2.5 px-3 font-mono text-slate-600 dark:text-slate-400 whitespace-nowrap">
                                {formatThaiDateTime(o.created_at_log || o.created_at)}
                              </td>
                              <td className="py-2.5 px-3 text-right whitespace-nowrap">
                                <span className="inline-flex items-center gap-0.5 text-[#FF6B00] font-bold text-[11px]">
                                  เปิดดู <ChevronRight className="w-3.5 h-3.5" />
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* 3) Purchase Bills (Stock PO) */}
              {(searchFilter === 'all' || searchFilter === 'po') && matchedStockPOs.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-xs font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                      <Package className="w-3.5 h-3.5" />
                      ใบสั่งซื้อ (Purchase Bill) — {matchedStockPOs.length} รายการ
                    </h3>
                    <span className="text-[11px] text-[#FF6B00] font-semibold">คลิกแถวเพื่อดูรายการรับเข้า & ประวัติ</span>
                  </div>
                  <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-transparent">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-100 dark:bg-white/[0.04] text-slate-600 dark:text-slate-400 border-b border-slate-200 dark:border-white/[0.06]">
                        <tr>
                          <th className="py-2.5 px-3 whitespace-nowrap">เลขที่ PO</th>
                          <th className="py-2.5 px-3 whitespace-nowrap">สินค้า</th>
                          <th className="py-2.5 px-3 whitespace-nowrap">Supplier</th>
                          <th className="py-2.5 px-3 whitespace-nowrap">จำนวน</th>
                          <th className="py-2.5 px-3 whitespace-nowrap">สถานะ (Real-Time)</th>
                          <th className="py-2.5 px-3 whitespace-nowrap">วันที่สั่งซื้อ</th>
                          <th className="py-2.5 px-3 text-right whitespace-nowrap">รายละเอียด</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 dark:divide-white/[0.04]">
                        {matchedStockPOs.map((p) => {
                          const poItems = items.filter((it) => it.stock_po_id === p.id);
                          const live = resolveLiveStockPOStatus(p, poItems);
                          return (
                            <tr
                              key={p.id}
                              onClick={() => setSelectedDoc({ kind: 'stock_po', stockPO: p })}
                              className="hover:bg-slate-50 dark:hover:bg-white/[0.04] transition cursor-pointer"
                            >
                              <td className="py-2.5 px-3 font-mono font-bold text-emerald-600 dark:text-emerald-400 whitespace-nowrap">{p.po_number}</td>
                              <td className="py-2.5 px-3 font-semibold text-slate-900 dark:text-slate-200 whitespace-nowrap">{p.product_name}</td>
                              <td className="py-2.5 px-3 text-slate-600 dark:text-slate-400 whitespace-nowrap">{p.supplier || '-'}</td>
                              <td className="py-2.5 px-3 font-mono text-slate-700 dark:text-slate-300 whitespace-nowrap">{p.qty}</td>
                              <td className="py-2.5 px-3 whitespace-nowrap">
                                {renderLiveStatusBadge(live)}
                              </td>
                              <td className="py-2.5 px-3 font-mono text-slate-600 dark:text-slate-400 whitespace-nowrap">
                                {formatThaiDateTime(p.ordered_at || p.created_at)}
                              </td>
                              <td className="py-2.5 px-3 text-right whitespace-nowrap">
                                <span className="inline-flex items-center gap-0.5 text-[#FF6B00] font-bold text-[11px]">
                                  เปิดดู <ChevronRight className="w-3.5 h-3.5" />
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Empty state for specific filter tab */}
              {((searchFilter === 'sn' && snMatches.length === 0) ||
                (searchFilter === 'repair' && repairMatches.length === 0) ||
                (searchFilter === 'so' && matchedOrders.length === 0) ||
                (searchFilter === 'po' && matchedStockPOs.length === 0)) && (
                  <div className="text-center text-slate-500 dark:text-slate-400 py-6 text-xs">
                    ไม่พบรายการในหมวดที่เลือกสำหรับ "{searchQuery}"
                  </div>
                )}
            </div>
          )}
        </div>
      </div>

      {/* Live Units Table in Liquid Glass */}
      <div className="liquid-glass rounded-3xl p-6 shadow-2xl border border-white/[0.08]">
        <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
          <Package className="w-4 h-4 text-[#FF6B00]" />
          รายการสินค้าหมุนเวียนในระบบล่าสุด ({items.length} ชิ้น)
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-100 dark:bg-white/[0.03] text-slate-600 dark:text-slate-400 border-b border-slate-200 dark:border-white/[0.06]">
              <tr>
                <th className="py-3 px-4 whitespace-nowrap">Serial Number</th>
                <th className="py-3 px-4 whitespace-nowrap">รุ่นสินค้า</th>
                <th className="py-3 px-4 whitespace-nowrap">ลูกค้า</th>
                <th className="py-3 px-4 whitespace-nowrap min-w-[170px]">สถานะสินค้า (Real-Time)</th>
                <th className="py-3 px-4 whitespace-nowrap">ช่าง Onsite</th>
                <th className="py-3 px-4 whitespace-nowrap">วันที่ติดวอย (Void)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-white/[0.05]">
              {items.map((i) => {
                const ord = i.order_id ? orders.find(o => o.id === i.order_id) || null : null;
                const linkedRepairs = repairTickets.filter(
                  t => t.item_id === i.id || (i.serial_number && (t.walkin_sn === i.serial_number || t.replacement_sn === i.serial_number))
                );
                const liveDelivery = resolveDeliveryStatus(i, ord);
                const repSummary = resolveRepairStatus(linkedRepairs);
                return (
                  <tr
                    key={i.id}
                    onClick={() => {
                      const matches = searchSnRecords(i.serial_number || i.id, [i], ord ? [ord] : [], linkedRepairs);
                      if (matches[0]) setSelectedMatch(matches[0]);
                    }}
                    className="hover:bg-slate-50 dark:hover:bg-white/[0.03] transition cursor-pointer"
                  >
                    <td className="py-3.5 px-4 font-mono font-extrabold text-sm text-[#FF6B00] whitespace-nowrap data-key">
                      {i.serial_number || <span className="text-slate-400 dark:text-slate-500 font-normal italic">รอใส่ S/N</span>}
                    </td>
                    <td className="py-3.5 px-4 text-sm sm:text-base font-bold text-slate-900 dark:text-white whitespace-nowrap">{i.model_name}</td>
                    <td className="py-3.5 px-4 text-slate-700 dark:text-slate-300 font-medium whitespace-nowrap">
                      {ord ? ord.customer_name : (i.status === 'in_stock' ? <span className="text-emerald-600 dark:text-emerald-400">สต๊อกร้าน BossComputech</span> : '-')}
                    </td>
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {renderLiveStatusBadge(liveDelivery)}
                        {repSummary && (() => {
                          const repTone = getToneClasses(repSummary.status.tone);
                          return (
                            <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${repTone.badge}`}>
                              <Wrench className="w-3 h-3" />
                              <span>ซ่อม{repSummary.totalCount > 1 ? ` (${repSummary.totalCount})` : ''}: {repSummary.status.label}</span>
                            </span>
                          );
                        })()}
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-slate-600 dark:text-slate-400 whitespace-nowrap">{i.assigned_onsite_tech || i.assigned_techs?.[0] || '-'}</td>
                    <td className="py-3.5 px-4 font-mono text-slate-700 dark:text-slate-300 whitespace-nowrap">
                      {i.void_date || i.warranty_void_date ? (
                        <span className="text-emerald-700 dark:text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                          {i.void_date || formatDateDMY(i.warranty_void_date)}
                        </span>
                      ) : (
                        <span className="text-slate-400 dark:text-slate-500 text-[11px] italic">ยังไม่ติดวอย</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* S/N & Order/Job Detail Modal */}
      <SnDetailModal match={selectedMatch} onClose={() => setSelectedMatch(null)} />

      {/* SO / Purchase Bill Detail Modal */}
      <DocumentDetailModal
        target={selectedDoc}
        items={items}
        repairTickets={repairTickets}
        onClose={() => setSelectedDoc(null)}
      />
    </div>
  );
};
