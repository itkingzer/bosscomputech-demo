import React, { useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import {
    History, Search, FileCheck2, Truck, Store, Wrench, PackageCheck,
    Clock, User, MapPin, ChevronDown, ChevronUp, CalendarClock, Timer, ShieldCheck
} from 'lucide-react';
import {
    ActivityLog, Order, RepairTicket, formatThaiDateTime, getLatestLog,
    formatWarrantyDuration, formatDateDMY, getWarrantyState, WarrantyState
} from '../types';
import { ActivityTimeline } from './ActivityTimeline';

// ==============================================================================
// CompletedLogsView — "ประวัติปิดงาน & Log ย้อนหลัง (Completed Job Logs)"
// รวมงานที่ปิดแล้วทั้งหมด (Sales/Onsite ส่งมอบ, รับเองหน้าร้าน, งานซ่อม)
// พร้อมไทม์ไลน์ตรวจสอบย้อนหลังแบบครบขั้นตอน
// ==============================================================================

type JobKind = 'sales' | 'pickup' | 'repair';

interface CompletedJob {
    id: string;                 // unique key
    kind: JobKind;
    refNo: string;              // ORD-... / REP-...
    customerName: string;
    productName: string;        // ชื่อสินค้า/รุ่น หรืออาการเสีย
    serialNumber?: string | null;
    techs: string[];            // ช่าง/ผู้ปิดงาน
    completedAt: string;        // ISO timestamp ปิดงาน
    startedAt?: string | null;  // ISO timestamp เริ่มงาน (สำหรับคำนวณ turnaround)
    location?: string;
    typeLabel: string;          // ป้ายประเภทงาน
    logs: ActivityLog[];
    // --- Warranty coverage ---
    warrantyYears?: number;
    warrantyMonths?: number;
    warrantyVoidDate?: string | null;
    warrantyExpireDate?: string | null;
    warrantyState?: WarrantyState;
    // --- RMA / service type (repair jobs only) ---
    serviceType?: 'in_house_repair' | 'rma_claim';
    rmaSupplier?: string | null;
    rmaTrackingNo?: string | null;
    rmaSentDate?: string | null;
    rmaReturnedDate?: string | null;
    replacementSn?: string | null;
    includedAccessories?: string | null;
}

const KIND_META: Record<JobKind, { label: string; badge: string; icon: React.ElementType }> = {
    sales: {
        label: 'ส่งมอบ & ติดตั้ง',
        badge: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
        icon: Truck
    },
    pickup: {
        label: 'รับเองหน้าร้าน',
        badge: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
        icon: Store
    },
    repair: {
        label: 'งานซ่อมหน้าร้าน',
        badge: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
        icon: Wrench
    }
};

type FilterTab = 'all' | 'sales' | 'pickup' | 'repair';

const FILTER_TABS: { id: FilterTab; label: string }[] = [
    { id: 'all', label: 'ทั้งหมด (All)' },
    { id: 'sales', label: 'ส่งมอบ & ติดตั้ง (Sales/Onsite)' },
    { id: 'pickup', label: 'รับเองหน้าร้าน (Pickup)' },
    { id: 'repair', label: 'งานซ่อมหน้าร้าน (Repair)' }
];

// คำนวณระยะเวลา turnaround แบบอ่านง่าย (เช่น "2 วัน 3 ชม." / "45 นาที")
const formatDuration = (startIso?: string | null, endIso?: string | null): string => {
    if (!startIso || !endIso) return '-';
    const start = new Date(startIso).getTime();
    const end = new Date(endIso).getTime();
    if (isNaN(start) || isNaN(end) || end < start) return '-';
    const diffMs = end - start;
    const mins = Math.floor(diffMs / 60000);
    const days = Math.floor(mins / 1440);
    const hours = Math.floor((mins % 1440) / 60);
    const remMins = mins % 60;
    if (days > 0) return `${days} วัน ${hours} ชม.`;
    if (hours > 0) return `${hours} ชม. ${remMins} นาที`;
    return `${remMins} นาที`;
};

const isSalesCompleted = (o: Order): boolean =>
    o.order_status === 'fulfilled' || !!o.fulfilled_at;

const isPickupCompleted = (o: Order): boolean =>
    (o.order_status === 'fulfilled' || !!o.fulfilled_at) &&
    o.delivery_mode === 'customer_pickup';

const isRepairCompleted = (t: RepairTicket): boolean =>
    t.status === 'returned_closed' || !!t.delivered_at;

export const CompletedLogsView: React.FC = () => {
    const { orders, items, repairTickets } = useApp();

    const [search, setSearch] = useState('');
    const [activeTab, setActiveTab] = useState<FilterTab>('all');
    const [sortDir, setSortDir] = useState<'newest' | 'oldest'>('newest');
    const [expanded, setExpanded] = useState<Record<string, boolean>>({});

    // ---- Aggregate completed jobs from all sources ----
    const allJobs = useMemo<CompletedJob[]>(() => {
        const jobs: CompletedJob[] = [];

        // 1) Sales / Onsite deliveries (fulfilled orders)
        orders.forEach((o) => {
            if (!isSalesCompleted(o)) return;
            const pickup = isPickupCompleted(o);
            const relatedItems = items.filter((it) => it.order_id === o.id);
            const techs = Array.from(
                new Set(
                    relatedItems
                        .flatMap((it) => [
                            ...(it.assigned_techs || []),
                            it.assigned_onsite_tech || '',
                            it.assigned_prep_tech || ''
                        ])
                        .filter(Boolean)
                )
            );
            const productName =
                (o.items_list || []).map((it) => it.model_name).filter(Boolean).join(', ') ||
                relatedItems.map((it) => it.model_name).join(', ') ||
                '-';
            const serialNumber = relatedItems.map((it) => it.serial_number).filter(Boolean).join(', ') || null;
            // Warranty: ใช้ข้อมูลจากเครื่องที่แปะวอยแล้ว (ถ้ามี) หรือจากรายการขาย
            const warrantyItem = relatedItems.find((it) => it.warranty_void_date) || relatedItems[0];
            const firstOrderItem = (o.items_list || [])[0];
            const warrantyYears = warrantyItem?.warranty_years ?? firstOrderItem?.warranty_years ?? 0;
            const warrantyMonths = warrantyItem?.warranty_months ?? firstOrderItem?.warranty_months ?? 0;

            jobs.push({
                id: `order-${o.id}`,
                kind: pickup ? 'pickup' : 'sales',
                refNo: o.bill_no || o.sales_ref || o.id,
                customerName: o.customer_name,
                productName,
                serialNumber,
                techs,
                completedAt: o.fulfilled_at || o.updated_at || o.created_at,
                startedAt: o.created_at_log || o.created_at,
                location: o.delivery_location,
                typeLabel: pickup ? 'ลูกค้ารับเองหน้าร้าน' : 'ส่งมอบ & ติดตั้ง',
                logs: o.activity_logs || [],
                warrantyYears,
                warrantyMonths,
                warrantyVoidDate: warrantyItem?.warranty_void_date || null,
                warrantyExpireDate: warrantyItem?.warranty_expire_date || null,
                warrantyState: getWarrantyState({
                    warranty_years: warrantyYears,
                    warranty_months: warrantyMonths,
                    warranty_void_date: warrantyItem?.warranty_void_date || null,
                    warranty_expire_date: warrantyItem?.warranty_expire_date || null
                })
            });
        });

        // 2) Repair tickets (closed / delivered)
        repairTickets.forEach((t) => {
            if (!isRepairCompleted(t)) return;
            const techs = Array.from(
                new Set(
                    [
                        ...(t.assigned_techs || []),
                        t.assigned_onsite_tech || '',
                        t.received_by || ''
                    ].filter(Boolean)
                )
            );
            const isRma = t.service_type === 'rma_claim' || !!t.rma_supplier || !!t.rma_tracking_no;
            jobs.push({
                id: `repair-${t.id}`,
                kind: 'repair',
                refNo: t.ticket_no,
                customerName: t.customer_name,
                productName: t.device_model || t.fault_symptom || 'งานซ่อม',
                serialNumber: t.walkin_sn || null,
                techs,
                completedAt: t.delivered_at || t.finished_at || t.updated_at || t.created_at,
                startedAt: t.started_at || t.received_at || t.created_at,
                location: t.delivery_location || t.district,
                typeLabel: isRma ? 'งานส่งเคลม (RMA)' : 'งานซ่อมหน้าร้าน',
                logs: t.activity_logs || [],
                serviceType: isRma ? 'rma_claim' : 'in_house_repair',
                rmaSupplier: t.rma_supplier || null,
                rmaTrackingNo: t.rma_tracking_no || null,
                rmaSentDate: t.rma_sent_date || null,
                rmaReturnedDate: t.rma_returned_date || null,
                replacementSn: t.replacement_sn || null,
                includedAccessories: t.included_accessories || null
            });
        });

        return jobs;
    }, [orders, items, repairTickets]);

    // ---- Filter + search + sort ----
    const filteredJobs = useMemo(() => {
        const q = search.trim().toLowerCase();
        let list = allJobs;

        if (activeTab !== 'all') {
            list = list.filter((j) => j.kind === activeTab);
        }

        if (q) {
            list = list.filter((j) => {
                const haystack = [
                    j.customerName,
                    j.refNo,
                    j.productName,
                    j.serialNumber || '',
                    ...j.techs
                ]
                    .join(' ')
                    .toLowerCase();
                return haystack.includes(q);
            });
        }

        const sorted = [...list].sort((a, b) => {
            const da = new Date(a.completedAt).getTime();
            const db = new Date(b.completedAt).getTime();
            return sortDir === 'newest' ? db - da : da - db;
        });

        return sorted;
    }, [allJobs, activeTab, search, sortDir]);

    const toggleExpanded = (id: string) =>
        setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));

    const tabCount = (tab: FilterTab) =>
        tab === 'all' ? allJobs.length : allJobs.filter((j) => j.kind === tab).length;

    return (
        <div className="space-y-5">
            {/* Header */}
            <div className="liquid-glass rounded-3xl p-5 sm:p-6 shadow-2xl border border-white/[0.08]">
                <div className="flex items-center gap-3 mb-1">
                    <div className="p-2.5 rounded-2xl bg-[#FF6B00]/20 text-[#FF6B00] border border-[#FF6B00]/30">
                        <History className="w-5 h-5" />
                    </div>
                    <div>
                        <h2 className="text-base sm:text-lg font-extrabold text-white flex items-center gap-2">
                            ประวัติปิดงาน & Log ย้อนหลัง
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/[0.06] text-slate-400 border border-white/[0.08] font-normal">
                                Completed Job Logs
                            </span>
                        </h2>
                        <p className="text-xs text-slate-400">
                            ตรวจสอบงานที่ปิดแล้วทั้งหมด พร้อมไทม์ไลน์การดำเนินงานแบบครบขั้นตอน
                        </p>
                    </div>
                </div>

                {/* Search + Sort */}
                <div className="mt-4 flex flex-col sm:flex-row gap-2.5">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                            type="text"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="ค้นหา: ชื่อลูกค้า, เลขที่บิล (ORD-/REP-), ชื่อสินค้า, S/N, ชื่อช่าง..."
                            className="w-full liquid-glass-input rounded-2xl pl-9 pr-3 py-2.5 text-xs text-white focus:outline-none"
                        />
                    </div>
                    <div className="flex items-center gap-1.5">
                        <CalendarClock className="w-4 h-4 text-slate-400 flex-shrink-0" />
                        <select
                            value={sortDir}
                            onChange={(e) => setSortDir(e.target.value as 'newest' | 'oldest')}
                            aria-label="เรียงลำดับ"
                            className="liquid-glass-input rounded-2xl px-3 py-2.5 text-xs text-white focus:outline-none cursor-pointer min-h-[42px]"
                        >
                            <option value="newest" className="bg-[#12141A]">ปิดงานล่าสุด → เก่าสุด</option>
                            <option value="oldest" className="bg-[#12141A]">เก่าสุด → ล่าสุด</option>
                        </select>
                    </div>
                </div>

                {/* Filter tabs */}
                <div className="mt-3 flex flex-wrap gap-1.5">
                    {FILTER_TABS.map((tab) => {
                        const isActive = activeTab === tab.id;
                        return (
                            <button
                                key={tab.id}
                                type="button"
                                onClick={() => setActiveTab(tab.id)}
                                className={`px-3 py-1.5 rounded-xl text-[11px] font-semibold border transition-all duration-150 active:scale-[0.97] cursor-pointer inline-flex items-center gap-1.5 ${isActive
                                    ? 'bg-[#FF6B00] text-black border-[#FF6B00] shadow-md shadow-[#FF6B00]/25'
                                    : 'bg-white/[0.04] text-slate-300 border-white/[0.08] hover:bg-white/[0.08]'
                                    }`}
                            >
                                {tab.label}
                                <span
                                    className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${isActive ? 'bg-black/20 text-black' : 'bg-white/[0.08] text-slate-400'
                                        }`}
                                >
                                    {tabCount(tab.id)}
                                </span>
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Results */}
            {filteredJobs.length === 0 ? (
                <div className="liquid-glass rounded-3xl p-10 text-center border border-white/[0.08]">
                    <FileCheck2 className="w-10 h-10 text-slate-500 mx-auto mb-3" />
                    <p className="text-sm text-slate-400">ยังไม่มีงานที่ปิดแล้วตรงกับเงื่อนไขการค้นหา</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {filteredJobs.map((job) => {
                        const meta = KIND_META[job.kind];
                        const Icon = meta.icon;
                        const isOpen = !!expanded[job.id];
                        const latest = getLatestLog(job.logs);
                        const duration = formatDuration(job.startedAt, job.completedAt);

                        return (
                            <div
                                key={job.id}
                                className="liquid-glass-card rounded-2xl p-4 sm:p-5 border border-white/[0.08] space-y-3"
                            >
                                {/* Summary row */}
                                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2 flex-wrap mb-1">
                                            <span className={`px-2 py-0.5 rounded-lg text-[10px] font-bold border inline-flex items-center gap-1 ${meta.badge}`}>
                                                <Icon className="w-3 h-3" />
                                                {job.typeLabel}
                                            </span>
                                            <span className="font-mono font-extrabold text-xs text-[#FF6B00] data-key">
                                                {job.refNo}
                                            </span>
                                        </div>
                                        <h3 className="text-sm sm:text-base font-extrabold text-white truncate">
                                            {job.customerName}
                                        </h3>
                                        <p className="text-[11px] text-slate-400 truncate data-meta">
                                            {job.productName}
                                            {job.serialNumber ? ` • S/N: ${job.serialNumber}` : ''}
                                        </p>
                                    </div>

                                    <div className="flex flex-col items-start sm:items-end gap-1 flex-shrink-0">
                                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-400">
                                            <Clock className="w-3.5 h-3.5" />
                                            ปิดงานเมื่อ: {formatThaiDateTime(job.completedAt)}
                                        </span>
                                        <span className="inline-flex items-center gap-1 text-[10px] text-slate-400">
                                            <Timer className="w-3 h-3" />
                                            ระยะเวลา: {duration}
                                        </span>
                                    </div>
                                </div>

                                {/* Meta chips */}
                                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-400">
                                    {job.techs.length > 0 && (
                                        <span className="inline-flex items-center gap-1">
                                            <User className="w-3.5 h-3.5 text-slate-500" />
                                            ช่างผู้ปิดงาน: <span className="text-slate-200 font-semibold">{job.techs.join(', ')}</span>
                                        </span>
                                    )}
                                    {job.location && (
                                        <span className="inline-flex items-center gap-1 truncate max-w-full">
                                            <MapPin className="w-3.5 h-3.5 text-slate-500" />
                                            {job.location}
                                        </span>
                                    )}
                                    {latest && (
                                        <span className="inline-flex items-center gap-1">
                                            <PackageCheck className="w-3.5 h-3.5 text-slate-500" />
                                            ขั้นตอนล่าสุด: <span className="text-slate-200 font-semibold">{latest.action}</span>
                                        </span>
                                    )}
                                </div>

                                {/* Warranty coverage (เฉพาะงานขาย/รับเองที่มีข้อมูลประกัน) */}
                                {job.kind !== 'repair' && job.warrantyState && job.warrantyState !== 'none' && (
                                    <div className={`rounded-xl p-2.5 border text-[11px] font-semibold flex flex-wrap items-center gap-x-3 gap-y-1 ${job.warrantyState === 'expired'
                                        ? 'bg-rose-500/10 border-rose-500/30 text-rose-600 dark:text-rose-400'
                                        : job.warrantyState === 'waiting'
                                            ? 'bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-300'
                                            : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
                                        }`}>
                                        <span className="inline-flex items-center gap-1">
                                            <ShieldCheck className="w-3.5 h-3.5" />
                                            {formatWarrantyDuration(job.warrantyYears, job.warrantyMonths)}
                                        </span>
                                        {job.warrantyVoidDate ? (
                                            <>
                                                <span className="text-slate-500 dark:text-slate-400">เริ่มนับวอย: <span className="font-bold">{formatDateDMY(job.warrantyVoidDate)}</span></span>
                                                <span className="text-slate-500 dark:text-slate-400">หมดประกัน: <span className="font-bold">{formatDateDMY(job.warrantyExpireDate)}</span></span>
                                                <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-extrabold border ${job.warrantyState === 'expired'
                                                    ? 'bg-rose-500/20 border-rose-500/40'
                                                    : 'bg-emerald-500/20 border-emerald-500/40'
                                                    }`}>
                                                    {job.warrantyState === 'expired' ? 'หมดประกันแล้ว' : 'อยู่ในประกัน'}
                                                </span>
                                            </>
                                        ) : (
                                            <span>รอแปะวอยเพื่อเริ่มนับประกัน</span>
                                        )}
                                    </div>
                                )}

                                {/* RMA / service info (repair jobs) */}
                                {job.kind === 'repair' && job.serviceType === 'rma_claim' && (
                                    <div className="rounded-xl p-2.5 border text-[11px] bg-violet-500/10 border-violet-500/30 text-violet-600 dark:text-violet-300 flex flex-wrap items-center gap-x-3 gap-y-1">
                                        <span className="inline-flex items-center gap-1 font-bold">
                                            <Truck className="w-3.5 h-3.5" />
                                            ส่งเคลม: {job.rmaSupplier || 'ศูนย์'}
                                        </span>
                                        {job.rmaTrackingNo && (
                                            <span className="text-slate-500 dark:text-slate-400">เลขใบเคลม: <span className="font-mono font-bold">{job.rmaTrackingNo}</span></span>
                                        )}
                                        {job.rmaSentDate && (
                                            <span className="text-slate-500 dark:text-slate-400">ส่งเมื่อ: <span className="font-bold">{formatDateDMY(job.rmaSentDate)}</span></span>
                                        )}
                                        {job.rmaReturnedDate && (
                                            <span className="text-slate-500 dark:text-slate-400">ได้กลับ: <span className="font-bold">{formatDateDMY(job.rmaReturnedDate)}</span></span>
                                        )}
                                        {job.replacementSn && (
                                            <span className="px-1.5 py-0.5 rounded-md text-[10px] font-extrabold border bg-cyan-500/20 border-cyan-500/40 text-cyan-600 dark:text-cyan-300">
                                                S/N ใหม่: {job.replacementSn}
                                            </span>
                                        )}
                                    </div>
                                )}

                                {/* Expand toggle + timeline */}
                                <div className="pt-2 border-t border-white/[0.08]">
                                    <button
                                        type="button"
                                        onClick={() => toggleExpanded(job.id)}
                                        aria-expanded={isOpen}
                                        className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-lg
                      bg-slate-100 hover:bg-slate-200 text-slate-600
                      dark:bg-white/5 dark:hover:bg-white/10 dark:text-slate-300
                      border border-slate-200 dark:border-white/10 transition-colors cursor-pointer"
                                    >
                                        {isOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                                        ดูประวัติไทม์ไลน์ (Log)
                                        <span className="ml-0.5 px-1.5 py-0.5 rounded-full bg-slate-200 dark:bg-white/10 text-[10px] font-bold">
                                            {job.logs.length}
                                        </span>
                                    </button>

                                    {isOpen && (
                                        <div className="mt-2">
                                            <ActivityTimeline logs={job.logs} defaultOpen />
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default CompletedLogsView;
