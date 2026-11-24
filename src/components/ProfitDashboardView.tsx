import React, { useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import {
    TrendingUp, Wallet, Percent, Users, Trophy,
    AlertTriangle, Receipt, Coins, BarChart3, Lock, Crown,
    Search, Hash, X
} from 'lucide-react';
import { Order, Project, ROUTE_DEFINITIONS } from '../types';
import { ListControls, useListControls } from './ListControls';
import { SnSearchMatch, searchSnRecords, getToneClasses } from '../utils/snLookup';
import { SnDetailModal } from './SnDetailModal';

const COMMISSION_RATE = 0.05; // ค่าคอมมิชชั่นเริ่มต้น 5% ของ GP
const LOW_MARGIN_THRESHOLD = 10; // GP ต่ำกว่า 10% = เสี่ยง/กำไรต่ำ

interface UnifiedProfitEntry {
    id: string;
    kind: 'order' | 'project';
    refCode: string;
    title: string;
    customerName: string;
    leadSalesperson: string;
    addonSalespeople: string[];
    routeCode?: Order['route_code'];
    baseRevenue: number;
    addonRevenue: number;
    revenue: number;
    cost: number;
    gp: number;
    gpPct: number;
    isLowMargin: boolean;
    createdAt: string;
    serialNumbers: string[];
    order?: Order;
    project?: Project;
}

const computeOrderEntry = (order: Order): UnifiedProfitEntry => {
    const items = order.items_list || [];
    const revenue = items.reduce((sum, it) => sum + (it.unit_price || 0) * (it.quantity || 0), 0);
    const itemCost = items.reduce((sum, it) => sum + (it.unit_cost || 0) * (it.quantity || 0), 0);
    const cost = itemCost + (order.extra_cost || 0);
    const gp = revenue - cost;
    const gpPct = revenue > 0 ? (gp / revenue) * 100 : 0;
    return {
        id: order.id,
        kind: 'order',
        refCode: order.sales_ref || 'SO-AUTO',
        title: order.customer_name,
        customerName: order.customer_name,
        leadSalesperson: order.salesperson || 'ไม่ระบุ',
        addonSalespeople: [],
        routeCode: order.route_code,
        baseRevenue: revenue,
        addonRevenue: 0,
        revenue,
        cost,
        gp,
        gpPct,
        isLowMargin: revenue > 0 && gpPct < LOW_MARGIN_THRESHOLD,
        createdAt: order.created_at,
        serialNumbers: [],
        order
    };
};

const computeProjectEntry = (project: Project): UnifiedProfitEntry => {
    const items = project.items || [];
    const baseItems = items.filter(it => !it.is_addon);
    const addonItems = items.filter(it => it.is_addon);
    const baseRevenue = baseItems.reduce((s, it) => s + (it.unit_price || 0) * (it.qty_required || 0), 0);
    const addonRevenue = addonItems.reduce((s, it) => s + (it.unit_price || 0) * (it.qty_required || 0), 0);
    const revenue = baseRevenue + addonRevenue;
    const cost = items.reduce((s, it) => s + (it.unit_cost || 0) * (it.qty_required || 0), 0);
    const gp = revenue - cost;
    const gpPct = revenue > 0 ? (gp / revenue) * 100 : 0;
    const addonSalespeople = Array.from(
        new Set(addonItems.map(it => it.added_by).filter((v): v is string => !!v))
    );
    const serialNumbers = items.flatMap(it => it.serial_numbers || []);
    return {
        id: project.id,
        kind: 'project',
        refCode: project.id,
        title: `${project.customer_name} • ${project.site_name}`,
        customerName: project.customer_name,
        leadSalesperson: project.created_by || 'ไม่ระบุ',
        addonSalespeople,
        routeCode: project.route_code,
        baseRevenue,
        addonRevenue,
        revenue,
        cost,
        gp,
        gpPct,
        isLowMargin: revenue > 0 && gpPct < LOW_MARGIN_THRESHOLD,
        createdAt: project.created_at,
        serialNumbers,
        project
    };
};

const fmt = (n: number) => n.toLocaleString('th-TH', { maximumFractionDigits: 0 });

export const ProfitDashboardView: React.FC = () => {
    const { orders, projects, items, repairTickets, currentUser } = useApp();
    const role = currentUser?.role as string | undefined;
    const isSalesperson = role === 'sales';
    const isExecutive = role === 'admin' || role === 'manager' || role === 'accounting' || role === 'finance';
    const [showOnlyLowMargin, setShowOnlyLowMargin] = useState(false);
    const [typeFilter, setTypeFilter] = useState<'all' | 'order' | 'project'>('all');
    const [snQuery, setSnQuery] = useState('');
    const [selectedSnMatch, setSelectedSnMatch] = useState<SnSearchMatch | null>(null);

    const visibleOrders = useMemo(() => {
        if (!isSalesperson || !currentUser) return orders;
        return orders.filter(o => o.salesperson === currentUser.name);
    }, [orders, isSalesperson, currentUser]);

    const visibleProjects = useMemo(() => {
        if (!isSalesperson || !currentUser) return projects;
        return projects.filter(
            p => p.created_by === currentUser.name || p.items.some(it => it.is_addon && it.added_by === currentUser.name)
        );
    }, [projects, isSalesperson, currentUser]);

    // Role-based filtering: เซลเห็นออเดอร์ตัวเอง + โปรเจกต์ที่ตัวเองเป็นเจ้าของหรือแอดรายการเพิ่ม (Add-on)
    const allEntries = useMemo(() => {
        const ordEntries = visibleOrders.map(computeOrderEntry);
        const prjEntries = visibleProjects.map(computeProjectEntry);
        return [...prjEntries, ...ordEntries];
    }, [visibleOrders, visibleProjects]);

    const filteredByType = useMemo(() => {
        if (typeFilter === 'all') return allEntries;
        return allEntries.filter(e => e.kind === typeFilter);
    }, [allEntries, typeFilter]);

    const totals = useMemo(() => {
        const revenue = filteredByType.reduce((s, m) => s + m.revenue, 0);
        const cost = filteredByType.reduce((s, m) => s + m.cost, 0);
        const projectRevenue = filteredByType.filter(m => m.kind === 'project').reduce((s, m) => s + m.revenue, 0);
        const addonRevenue = filteredByType.filter(m => m.kind === 'project').reduce((s, m) => s + m.addonRevenue, 0);
        const gp = revenue - cost;
        const gpPct = revenue > 0 ? (gp / revenue) * 100 : 0;
        const commission = gp > 0 ? gp * COMMISSION_RATE : 0;
        const lowMarginCount = filteredByType.filter(m => m.isLowMargin).length;
        return { revenue, cost, projectRevenue, addonRevenue, gp, gpPct, commission, lowMarginCount, orderCount: filteredByType.length };
    }, [filteredByType]);

    // Salesperson breakdown (คิดทั้งยอดบิล SO + ยอดตั้งต้นโปรเจกต์ให้เจ้าของโปรเจกต์ + ยอด Add-on ให้เซลล์คนที่แอดเพิ่ม!)
    const breakdown = useMemo(() => {
        const map = new Map<string, { name: string; orders: number; projects: number; addonCount: number; revenue: number; cost: number; gp: number; commission: number; lowMargin: number }>();
        const ensureRow = (name: string) => {
            const existing = map.get(name);
            if (existing) return existing;
            const created = { name, orders: 0, projects: 0, addonCount: 0, revenue: 0, cost: 0, gp: 0, commission: 0, lowMargin: 0 };
            map.set(name, created);
            return created;
        };

        orders.forEach(o => {
            const m = computeOrderEntry(o);
            const row = ensureRow(m.leadSalesperson);
            row.orders += 1;
            row.revenue += m.revenue;
            row.cost += m.cost;
            row.gp += m.gp;
            row.commission += m.gp > 0 ? m.gp * COMMISSION_RATE : 0;
            if (m.isLowMargin) row.lowMargin += 1;
        });

        projects.forEach(p => {
            const leadRow = ensureRow(p.created_by || 'ไม่ระบุ');
            leadRow.projects += 1;
            (p.items || []).forEach(it => {
                const lineRev = (it.unit_price || 0) * (it.qty_required || 0);
                const lineCost = (it.unit_cost || 0) * (it.qty_required || 0);
                const lineGp = lineRev - lineCost;
                const ownerName = it.is_addon && it.added_by ? it.added_by : (p.created_by || 'ไม่ระบุ');
                const row = ensureRow(ownerName);
                if (it.is_addon) row.addonCount += 1;
                row.revenue += lineRev;
                row.cost += lineCost;
                row.gp += lineGp;
                row.commission += lineGp > 0 ? lineGp * COMMISSION_RATE : 0;
            });
        });

        return Array.from(map.values()).sort((a, b) => b.gp - a.gp);
    }, [orders, projects]);

    const visibleMetrics = showOnlyLowMargin ? filteredByType.filter(m => m.isLowMargin) : filteredByType;

    const metricsList = useListControls(visibleMetrics, {
        getDate: (m) => m.createdAt,
        getValue: (m) => m.gp,
        initialSort: 'newest',
    });

    // Live S/N & Project Site History Lookup inside Profit Dashboard (scoped for salesperson)
    const visibleItems = useMemo(() => {
        if (!isSalesperson) return items;
        const allowedOrderIds = new Set(visibleOrders.map(o => o.id));
        const allowedPrjIds = new Set(visibleProjects.map(p => p.id));
        return items.filter(it => (it.order_id && allowedOrderIds.has(it.order_id)) || (it.project_id && allowedPrjIds.has(it.project_id)));
    }, [items, isSalesperson, visibleOrders, visibleProjects]);

    const snMatches = useMemo(
        () => searchSnRecords(snQuery, visibleItems, visibleOrders, isSalesperson ? [] : repairTickets, visibleProjects),
        [snQuery, visibleItems, visibleOrders, isSalesperson, repairTickets, visibleProjects]
    );
    const projectSnSamples = useMemo(() => {
        const prjSns = visibleProjects.flatMap(p => [
            p.id,
            ...p.items.flatMap(i => i.serial_numbers || [])
        ]);
        return Array.from(new Set(prjSns)).slice(0, 5);
    }, [visibleProjects]);

    if (!isExecutive && !isSalesperson) {
        return (
            <div className="liquid-glass rounded-3xl p-8 text-center border border-slate-200 dark:border-white/[0.08]">
                <AlertTriangle className="w-10 h-10 mx-auto mb-3 text-amber-500" />
                <h2 className="text-base font-bold text-slate-900 dark:text-white">ไม่มีสิทธิ์เข้าถึงข้อมูลการเงินและกำไร (GP)</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    หน้านี้สงวนสิทธิ์เฉพาะฝ่ายขาย ผู้บริหาร และฝ่ายบัญชี/จัดซื้อเท่านั้น
                </p>
            </div>
        );
    }

    const kpiCards = [
        {
            label: 'ยอดขายรวม (Revenue)',
            value: `฿${fmt(totals.revenue)}`,
            icon: Receipt,
            color: 'text-emerald-400',
            bg: 'bg-emerald-500/10',
            border: 'border-emerald-500/30'
        },
        {
            label: 'ต้นทุนรวม (Cost)',
            value: `฿${fmt(totals.cost)}`,
            icon: Coins,
            color: 'text-rose-400',
            bg: 'bg-rose-500/10',
            border: 'border-rose-500/30'
        },
        {
            label: 'กำไรขั้นต้น (GP)',
            value: `฿${fmt(totals.gp)}`,
            icon: TrendingUp,
            color: totals.gp >= 0 ? 'text-[#FF6B00]' : 'text-rose-400',
            bg: 'bg-[#FF6B00]/10',
            border: 'border-[#FF6B00]/30'
        },
        {
            label: 'อัตรากำไร (GP %)',
            value: `${totals.gpPct.toFixed(1)}%`,
            icon: Percent,
            color: totals.gpPct < LOW_MARGIN_THRESHOLD ? 'text-amber-400' : 'text-sky-400',
            bg: totals.gpPct < LOW_MARGIN_THRESHOLD ? 'bg-amber-500/10' : 'bg-sky-500/10',
            border: totals.gpPct < LOW_MARGIN_THRESHOLD ? 'border-amber-500/30' : 'border-sky-500/30'
        },
        {
            label: isSalesperson ? 'ค่าคอมมิชชั่นประมาณการ (5%)' : 'ค่าคอมรวมทั้งบริษัท (5%)',
            value: `฿${fmt(totals.commission)}`,
            icon: Wallet,
            color: 'text-purple-400',
            bg: 'bg-purple-500/10',
            border: 'border-purple-500/30'
        }
    ];

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="liquid-glass rounded-3xl p-4 sm:p-6 lg:p-7 shadow-2xl border border-slate-200 dark:border-white/[0.08]">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                    <div>
                        <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                            <div className="p-2 rounded-xl bg-[#FF6B00]/15 text-[#FF6B00] border border-[#FF6B00]/30">
                                <BarChart3 className="w-5 h-5" />
                            </div>
                            <span>สรุปยอดขาย & กำไรขั้นต้น (Sales & GP Analytics)</span>
                        </h2>
                        <p className="text-xs text-slate-400 mt-1">
                            {isSalesperson
                                ? `แสดงเฉพาะผลงานของ ${currentUser?.name} (ออเดอร์, ยอดขาย, GP และค่าคอมมิชชั่นประมาณการ)`
                                : 'ภาพรวมทั้งบริษัท พร้อมตารางเปรียบเทียบผลงานแยกตามพนักงานขาย'}
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className={`px-3 py-1.5 rounded-xl text-[11px] font-bold border flex items-center gap-1.5 ${isSalesperson
                            ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                            : 'bg-[#FF6B00]/10 text-[#FF6B00] border-[#FF6B00]/30'
                            }`}>
                            {isSalesperson ? <Users className="w-3.5 h-3.5" /> : <Crown className="w-3.5 h-3.5" />}
                            <span>{isSalesperson ? 'มุมมองพนักงานขาย' : 'มุมมองผู้บริหาร (ทั้งบริษัท)'}</span>
                        </span>
                    </div>
                </div>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
                {kpiCards.map((card) => {
                    const Icon = card.icon;
                    return (
                        <div key={card.label} className={`rounded-2xl p-4 border ${card.bg} ${card.border} liquid-glass-card`}>
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide data-meta">{card.label}</span>
                                <Icon className={`w-4 h-4 ${card.color}`} />
                            </div>
                            <div className={`text-lg sm:text-xl font-extrabold font-mono data-key ${card.color}`}>{card.value}</div>
                        </div>
                    );
                })}
            </div>

            {/* Low margin alert */}
            {totals.lowMarginCount > 0 && (
                <div className="rounded-2xl p-4 bg-amber-500/10 border border-amber-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-amber-300 text-xs font-semibold">
                        <AlertTriangle className="w-4 h-4" />
                        <span>พบออเดอร์กำไรต่ำ (GP ต่ำกว่า {LOW_MARGIN_THRESHOLD}%) จำนวน {totals.lowMarginCount} รายการ</span>
                    </div>
                    <button
                        onClick={() => setShowOnlyLowMargin(v => !v)}
                        className="px-3 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-500/30 text-[11px] font-semibold transition cursor-pointer"
                    >
                        {showOnlyLowMargin ? 'แสดงทั้งหมด' : 'ดูเฉพาะกำไรต่ำ'}
                    </button>
                </div>
            )}

            {/* Salesperson Breakdown (Admin/Manager only) */}
            {!isSalesperson && (
                <div className="liquid-glass rounded-3xl p-4 sm:p-7 shadow-2xl border border-slate-200 dark:border-white/[0.08]">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
                        <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                            <Trophy className="w-4 h-4 text-[#FF6B00] flex-shrink-0" />
                            <span>ผลงานแยกตามพนักงานขาย (รวมบิลขาย SO + โปรเจกต์ PRJ + ยอดแอดเพิ่มข้ามเซลล์)</span>
                        </h3>
                        <span className="text-[11px] text-slate-500 dark:text-slate-400">
                            คิดยอด Add-on ของโปรเจกต์ให้เซลล์ผู้แอดรายการเพิ่มโดยอัตโนมัติ
                        </span>
                    </div>

                    {/* Mobile Cards (< md) */}
                    <div className="md:hidden space-y-2.5">
                        {breakdown.map((row, idx) => {
                            const gpPct = row.revenue > 0 ? (row.gp / row.revenue) * 100 : 0;
                            return (
                                <div key={row.name} className="p-3.5 rounded-2xl border border-slate-200 dark:border-white/[0.08] bg-white/80 dark:bg-white/[0.03] space-y-2.5">
                                    <div className="flex items-center justify-between gap-2">
                                        <div className="flex items-center gap-2 min-w-0">
                                            <span className="w-6 h-6 rounded-lg bg-[#FF6B00]/15 text-[#FF6B00] font-mono font-bold text-xs flex items-center justify-center flex-shrink-0">
                                                {idx + 1}
                                            </span>
                                            <span className="text-sm font-bold text-slate-900 dark:text-white truncate">{row.name}</span>
                                        </div>
                                        {row.lowMargin > 0 && (
                                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300 dark:bg-amber-500/20 dark:text-amber-300 dark:border-amber-500/30 flex-shrink-0">
                                                {row.lowMargin} กำไรต่ำ
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                                        <span>บิล SO: <strong className="font-mono text-slate-800 dark:text-slate-200">{row.orders}</strong></span>
                                        <span>•</span>
                                        <span className="text-purple-600 dark:text-purple-300 font-mono">
                                            {row.projects} โปรเจกต์{row.addonCount > 0 ? ` (+${row.addonCount} Add-on)` : ''}
                                        </span>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100 dark:border-white/[0.06] text-xs">
                                        <div>
                                            <div className="text-[10px] text-slate-400">ยอดขายรวม</div>
                                            <div className="font-mono font-extrabold text-emerald-500 dark:text-emerald-400">{fmt(row.revenue)}</div>
                                        </div>
                                        <div>
                                            <div className="text-[10px] text-slate-400">ต้นทุนรวม</div>
                                            <div className="font-mono font-extrabold text-rose-500 dark:text-rose-400">{fmt(row.cost)}</div>
                                        </div>
                                        <div>
                                            <div className="text-[10px] text-slate-400">GP สุทธิ ({gpPct.toFixed(1)}%)</div>
                                            <div className={`font-mono font-extrabold ${row.gp >= 0 ? 'text-[#FF6B00]' : 'text-rose-400'}`}>{fmt(row.gp)}</div>
                                        </div>
                                        <div>
                                            <div className="text-[10px] text-slate-400">ค่าคอม (5%)</div>
                                            <div className="font-mono font-extrabold text-purple-500 dark:text-purple-400">{fmt(row.commission)}</div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* Desktop Table (>= md) */}
                    <div className="hidden md:block overflow-x-auto">
                        <table className="w-full text-left text-xs">
                            <thead className="bg-slate-100 dark:bg-white/[0.04] text-slate-600 dark:text-slate-400 border-b border-slate-200 dark:border-white/[0.06]">
                                <tr>
                                    <th className="py-2.5 px-3 whitespace-nowrap">#</th>
                                    <th className="py-2.5 px-3 whitespace-nowrap">พนักงานขาย</th>
                                    <th className="py-2.5 px-3 text-right whitespace-nowrap">บิล SO</th>
                                    <th className="py-2.5 px-3 text-right whitespace-nowrap">โปรเจกต์ / Add-on</th>
                                    <th className="py-2.5 px-3 text-right whitespace-nowrap">ยอดขายรวม</th>
                                    <th className="py-2.5 px-3 text-right whitespace-nowrap">ต้นทุนรวม</th>
                                    <th className="py-2.5 px-3 text-right whitespace-nowrap">GP สุทธิ</th>
                                    <th className="py-2.5 px-3 text-right whitespace-nowrap">GP %</th>
                                    <th className="py-2.5 px-3 text-right whitespace-nowrap">ค่าคอม (5%)</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/[0.04]">
                                {breakdown.map((row, idx) => {
                                    const gpPct = row.revenue > 0 ? (row.gp / row.revenue) * 100 : 0;
                                    return (
                                        <tr key={row.name} className="hover:bg-slate-50 dark:hover:bg-white/[0.02]">
                                            <td className="py-2.5 px-3 font-mono text-slate-500">{idx + 1}</td>
                                            <td className="py-2.5 px-3 text-base font-bold text-slate-900 dark:text-white whitespace-nowrap">
                                                {row.name}
                                                {row.lowMargin > 0 && (
                                                    <span className="ml-2 px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-100 text-amber-800 border border-amber-300 dark:bg-amber-500/20 dark:text-amber-300 dark:border-amber-500/30">
                                                        {row.lowMargin} กำไรต่ำ
                                                    </span>
                                                )}
                                            </td>
                                            <td className="py-2.5 px-3 text-right font-mono text-slate-700 dark:text-slate-300 data-key">{row.orders}</td>
                                            <td className="py-2.5 px-3 text-right font-mono text-purple-700 dark:text-purple-300 data-key">
                                                {row.projects} โปรเจกต์{row.addonCount > 0 ? ` (+${row.addonCount} Add-on)` : ''}
                                            </td>
                                            <td className="py-2.5 px-3 text-right font-mono text-emerald-400 text-sm font-extrabold data-key">{fmt(row.revenue)}</td>
                                            <td className="py-2.5 px-3 text-right font-mono text-rose-400 text-sm font-extrabold data-key">{fmt(row.cost)}</td>
                                            <td className={`py-2.5 px-3 text-right font-mono text-sm font-extrabold data-key ${row.gp >= 0 ? 'text-[#FF6B00]' : 'text-rose-400'}`}>
                                                {fmt(row.gp)}
                                            </td>
                                            <td className={`py-2.5 px-3 text-right font-mono text-sm font-extrabold data-key ${gpPct < LOW_MARGIN_THRESHOLD ? 'text-amber-400' : 'text-sky-400'}`}>
                                                {gpPct.toFixed(1)}%
                                            </td>
                                            <td className="py-2.5 px-3 text-right font-mono text-purple-400 text-sm font-extrabold data-key">{fmt(row.commission)}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Live S/N & Project Site History Lookup */}
            <div className="liquid-glass rounded-3xl p-6 sm:p-7 shadow-2xl border border-white/[0.08] space-y-4">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                    <div>
                        <h3 className="text-sm font-bold text-white flex items-center gap-2">
                            <Hash className="w-4 h-4 text-[#FF6B00]" />
                            <span>ตรวจสอบ S/N & ประวัติไซต์งานโปรเจกต์ (Live S/N & Project Site History Lookup)</span>
                        </h3>
                        <p className="text-xs text-slate-400 mt-0.5">
                            ค้นหา S/N อุปกรณ์ในโปรเจกต์ (เช่น HW-S220-PRJ01), รหัส PRJ-2026-XXX หรือบิลขาย เพื่อดูประวัติหน้างาน วอยประกัน และ GP รายการ
                        </p>
                    </div>
                    <div className="relative w-full md:w-80">
                        <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-2.5" />
                        <input
                            type="text"
                            value={snQuery}
                            onChange={(e) => setSnQuery(e.target.value)}
                            placeholder="ค้นหา S/N หรือรหัส PRJ-2026-XXX..."
                            className="w-full liquid-glass-input rounded-xl pl-9 pr-8 py-2 text-xs text-white focus:outline-none"
                        />
                        {snQuery && (
                            <button
                                type="button"
                                onClick={() => setSnQuery('')}
                                className="absolute right-2.5 top-2 text-slate-400 hover:text-white cursor-pointer"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        )}
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[11px] text-slate-400">คลิก S/N โปรเจกต์ตัวอย่าง:</span>
                    {projectSnSamples.map((sample) => (
                        <button
                            key={sample}
                            type="button"
                            onClick={() => setSnQuery(sample)}
                            className="px-2.5 py-1 rounded-xl text-xs font-mono font-bold bg-purple-500/15 hover:bg-purple-500/25 text-purple-300 border border-purple-500/30 transition cursor-pointer"
                        >
                            {sample}
                        </button>
                    ))}
                </div>

                {snQuery.trim() && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                        {snMatches.length === 0 ? (
                            <div className="md:col-span-2 text-center py-6 text-xs text-slate-400 border border-dashed border-white/10 rounded-2xl">
                                ไม่พบข้อมูล S/N หรือโปรเจกต์ที่ตรงกับ "{snQuery}"
                            </div>
                        ) : (
                            snMatches.slice(0, 6).map((m) => {
                                const tone = getToneClasses(m.liveStatus.tone);
                                return (
                                    <button
                                        key={m.id}
                                        type="button"
                                        onClick={() => setSelectedSnMatch(m)}
                                        className="text-left p-3.5 rounded-2xl bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.08] hover:border-[#FF6B00]/40 transition cursor-pointer flex items-start justify-between gap-3"
                                    >
                                        <div className="min-w-0 space-y-1">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className="font-mono font-extrabold text-sm text-[#FF6B00]">{m.primarySn}</span>
                                                {m.project && (
                                                    <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/40 font-mono">
                                                        {m.project.id}
                                                    </span>
                                                )}
                                            </div>
                                            <div className="text-xs font-bold text-white truncate">{m.modelName}</div>
                                            <div className="text-[11px] text-slate-400 truncate">ลูกค้า: {m.customerName}</div>
                                        </div>
                                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold border shrink-0 ${tone.badge}`}>
                                            {m.liveStatus.label}
                                        </span>
                                    </button>
                                );
                            })
                        )}
                    </div>
                )}
            </div>

            {/* Order & Project GP table */}
            <div className="liquid-glass rounded-3xl p-6 sm:p-7 shadow-2xl border border-white/[0.08]">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                        <TrendingUp className="w-4 h-4 text-[#FF6B00]" />
                        <span>รายละเอียดกำไรต่อบิลขาย & โปรเจกต์รับเหมา (Net Project & Order GP)</span>
                    </h3>
                    <div className="flex items-center gap-1.5 flex-wrap">
                        {([
                            { id: 'all', label: `ทั้งหมด (${allEntries.length})` },
                            { id: 'project', label: `งานโปรเจกต์ PRJ (${allEntries.filter(e => e.kind === 'project').length})` },
                            { id: 'order', label: `บิลขาย SO (${allEntries.filter(e => e.kind === 'order').length})` }
                        ] as const).map(tab => (
                            <button
                                key={tab.id}
                                type="button"
                                onClick={() => setTypeFilter(tab.id)}
                                className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition cursor-pointer ${
                                    typeFilter === tab.id
                                        ? 'bg-[#FF6B00] text-black border-[#FF6B00]'
                                        : 'bg-white/[0.04] text-slate-300 border-white/[0.08] hover:text-white'
                                }`}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </div>
                </div>

                {visibleMetrics.length === 0 ? (
                    <div className="text-center py-12 text-slate-500 border border-dashed border-white/[0.1] rounded-2xl text-xs">
                        ยังไม่มีข้อมูลออเดอร์หรือโปรเจกต์สำหรับแสดงผล
                    </div>
                ) : (
                    <>
                        <ListControls
                            from={metricsList.from}
                            to={metricsList.to}
                            total={metricsList.total}
                            page={metricsList.page}
                            totalPages={metricsList.totalPages}
                            pageSize={metricsList.pageSize}
                            sort={metricsList.sort}
                            onSortChange={metricsList.setSort}
                            onPageSizeChange={metricsList.setPageSize}
                            onPageChange={metricsList.setPage}
                            unit="รายการ"
                            className="mb-3"
                        />
                        {/* Mobile Cards (< md) */}
                        <div className="md:hidden space-y-2.5">
                            {metricsList.pageItems.map((m) => {
                                const rMeta = m.routeCode ? ROUTE_DEFINITIONS[m.routeCode] : null;
                                const commission = m.gp > 0 ? m.gp * COMMISSION_RATE : 0;
                                return (
                                    <div
                                        key={`${m.kind}-${m.id}`}
                                        className={`p-3.5 rounded-2xl border space-y-2.5 ${m.isLowMargin
                                            ? 'border-rose-500/30 bg-rose-500/[0.06]'
                                            : 'border-slate-200 dark:border-white/[0.08] bg-white/80 dark:bg-white/[0.03]'
                                            }`}
                                    >
                                        <div className="flex items-start justify-between gap-2">
                                            <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                                                <span className={`font-mono font-extrabold text-sm ${m.kind === 'project' ? 'text-purple-400' : 'text-[#FF6B00]'}`}>
                                                    {m.refCode}
                                                </span>
                                                {m.kind === 'project' && (
                                                    <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30">
                                                        PROJECT
                                                    </span>
                                                )}
                                                {rMeta && (
                                                    <span className={`px-2 py-0.5 rounded-lg text-[10px] font-bold border ${rMeta.badgeBg} ${rMeta.badgeBorder} ${rMeta.badgeText}`}>
                                                        {rMeta.shortName}
                                                    </span>
                                                )}
                                            </div>
                                            <span className={`px-2 py-0.5 rounded-lg text-[10px] font-bold border flex-shrink-0 ${m.isLowMargin
                                                ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                                                : 'bg-sky-500/15 text-sky-300 border-sky-500/30'
                                                }`}>
                                                GP {m.gpPct.toFixed(1)}%
                                            </span>
                                        </div>

                                        <div>
                                            <div className="text-sm font-bold text-slate-900 dark:text-white">{m.title}</div>
                                            {m.kind === 'project' && (
                                                <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 flex flex-wrap items-center gap-2">
                                                    <span>ยอดตั้งต้น ฿{fmt(m.baseRevenue)}</span>
                                                    {m.addonRevenue > 0 && (
                                                        <span className="text-purple-400 font-semibold">+ Add-on ฿{fmt(m.addonRevenue)}</span>
                                                    )}
                                                    {m.serialNumbers.length > 0 && (
                                                        <button
                                                            type="button"
                                                            onClick={() => setSnQuery(m.serialNumbers[0])}
                                                            className="font-mono text-[#FF6B00] underline cursor-pointer text-left"
                                                        >
                                                            S/N: {m.serialNumbers.join(', ')}
                                                        </button>
                                                    )}
                                                </div>
                                            )}
                                        </div>

                                        {!isSalesperson && (
                                            <div className="flex flex-wrap items-center gap-1">
                                                <span className="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                                                    {m.leadSalesperson}
                                                </span>
                                                {m.addonSalespeople.map(sp => (
                                                    <span key={sp} className="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-purple-500/15 text-purple-300 border border-purple-500/30">
                                                        +Add-on: {sp}
                                                    </span>
                                                ))}
                                            </div>
                                        )}

                                        <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100 dark:border-white/[0.06] text-xs">
                                            <div>
                                                <div className="text-[10px] text-slate-400">ยอดขายรวม</div>
                                                <div className="font-mono font-extrabold text-emerald-500 dark:text-emerald-400">{fmt(m.revenue)}</div>
                                            </div>
                                            <div>
                                                <div className="text-[10px] text-slate-400">ต้นทุนรวม</div>
                                                <div className="font-mono font-extrabold text-rose-500 dark:text-rose-400">{fmt(m.cost)}</div>
                                            </div>
                                            <div>
                                                <div className="text-[10px] text-slate-400">GP สุทธิ</div>
                                                <div className={`font-mono font-extrabold ${m.gp >= 0 ? 'text-[#FF6B00]' : 'text-rose-400'}`}>{fmt(m.gp)}</div>
                                            </div>
                                            <div>
                                                <div className="text-[10px] text-slate-400">ค่าคอม (5%)</div>
                                                <div className="font-mono font-extrabold text-purple-500 dark:text-purple-400">{fmt(commission)}</div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        {/* Desktop Table (>= md) */}
                        <div className="hidden md:block overflow-x-auto">
                            <table className="w-full text-left text-xs">
                                <thead className="bg-white/[0.04] text-slate-400 border-b border-white/[0.06]">
                                    <tr>
                                        <th className="py-2.5 px-3 whitespace-nowrap">เลขที่เอกสาร</th>
                                        {!isSalesperson && <th className="py-2.5 px-3 whitespace-nowrap">ผู้ขาย / ผู้แอดเพิ่ม</th>}
                                        <th className="py-2.5 px-3 whitespace-nowrap">ลูกค้า / ไซต์งาน</th>
                                        <th className="py-2.5 px-3 whitespace-nowrap">สายรถ</th>
                                        <th className="py-2.5 px-3 text-right whitespace-nowrap">ยอดขายรวม</th>
                                        <th className="py-2.5 px-3 text-right whitespace-nowrap">ต้นทุนรวม</th>
                                        <th className="py-2.5 px-3 text-right whitespace-nowrap">GP สุทธิ</th>
                                        <th className="py-2.5 px-3 text-right whitespace-nowrap">GP %</th>
                                        <th className="py-2.5 px-3 text-right whitespace-nowrap">ค่าคอม (5%)</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/[0.04]">
                                    {metricsList.pageItems.map((m) => {
                                        const rMeta = m.routeCode ? ROUTE_DEFINITIONS[m.routeCode] : null;
                                        const commission = m.gp > 0 ? m.gp * COMMISSION_RATE : 0;
                                        return (
                                            <tr
                                                key={`${m.kind}-${m.id}`}
                                                className={`transition ${m.isLowMargin ? 'bg-rose-500/[0.06] hover:bg-rose-500/[0.1]' : 'hover:bg-white/[0.02]'}`}
                                            >
                                                <td className="py-2.5 px-3 font-mono font-extrabold whitespace-nowrap text-sm data-key">
                                                    <div className="flex items-center gap-1.5">
                                                        <span className={m.kind === 'project' ? 'text-purple-400' : 'text-[#FF6B00]'}>
                                                            {m.refCode}
                                                        </span>
                                                        {m.kind === 'project' && (
                                                            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30">
                                                                PROJECT
                                                            </span>
                                                        )}
                                                    </div>
                                                </td>
                                                {!isSalesperson && (
                                                    <td className="py-2.5 px-3 whitespace-nowrap">
                                                        <div className="flex flex-wrap items-center gap-1">
                                                            <span className="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                                                                {m.leadSalesperson}
                                                            </span>
                                                            {m.addonSalespeople.map(sp => (
                                                                <span key={sp} className="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-purple-500/15 text-purple-300 border border-purple-500/30">
                                                                    +Add-on: {sp}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    </td>
                                                )}
                                                <td className="py-2.5 px-3 text-white font-bold text-sm">
                                                    <div>{m.title}</div>
                                                    {m.kind === 'project' && (
                                                        <div className="text-[10px] text-slate-400 font-normal mt-0.5 flex flex-wrap items-center gap-2">
                                                            <span>ยอดตั้งต้น ฿{fmt(m.baseRevenue)}</span>
                                                            {m.addonRevenue > 0 && (
                                                                <span className="text-purple-300 font-semibold">+ ยอดแอดเพิ่ม ฿{fmt(m.addonRevenue)}</span>
                                                            )}
                                                            {m.serialNumbers.length > 0 && (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setSnQuery(m.serialNumbers[0])}
                                                                    className="font-mono text-[#FF6B00] underline cursor-pointer"
                                                                >
                                                                    S/N: {m.serialNumbers.join(', ')}
                                                                </button>
                                                            )}
                                                        </div>
                                                    )}
                                                </td>
                                                <td className="py-2.5 px-3 whitespace-nowrap">
                                                    {rMeta ? (
                                                        <span className={`px-2 py-0.5 rounded-lg text-[10px] font-bold border ${rMeta.badgeBg} ${rMeta.badgeBorder} ${rMeta.badgeText}`}>
                                                            {rMeta.shortName}
                                                        </span>
                                                    ) : '-'}
                                                </td>
                                                <td className="py-2.5 px-3 text-right font-mono text-emerald-400 text-sm font-extrabold data-key">{fmt(m.revenue)}</td>
                                                <td className="py-2.5 px-3 text-right font-mono text-rose-400 text-sm font-extrabold data-key">{fmt(m.cost)}</td>
                                                <td className={`py-2.5 px-3 text-right font-mono text-sm font-extrabold data-key ${m.gp >= 0 ? 'text-[#FF6B00]' : 'text-rose-400'}`}>
                                                    {fmt(m.gp)}
                                                </td>
                                                <td className="py-2.5 px-3 text-right whitespace-nowrap">
                                                    <span className={`px-2 py-0.5 rounded-lg text-[10px] font-bold border ${m.isLowMargin
                                                        ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                                                        : 'bg-sky-500/15 text-sky-300 border-sky-500/30'
                                                        }`}>
                                                        {m.gpPct.toFixed(1)}%
                                                    </span>
                                                </td>
                                                <td className="py-2.5 px-3 text-right font-mono text-purple-400 text-sm font-extrabold data-key">{fmt(commission)}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </>
                )}

                <div className="mt-4 flex items-center gap-2 text-[10px] text-slate-500">
                    <Lock className="w-3 h-3" />
                    <span>ข้อมูลราคาทุนเป็นข้อมูลภายในของบริษัท ห้ามเผยแพร่ในเอกสารที่ส่งให้ลูกค้า</span>
                </div>
            </div>

            <SnDetailModal match={selectedSnMatch} onClose={() => setSelectedSnMatch(null)} />
        </div>
    );
};
