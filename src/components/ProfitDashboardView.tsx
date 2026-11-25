import React, { useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import {
    TrendingUp, Wallet, Percent, Users, Trophy,
    AlertTriangle, Receipt, Coins, BarChart3, Lock, Crown,
    Search, Hash, X, CalendarDays
} from 'lucide-react';
import { Order, Project, ROUTE_DEFINITIONS } from '../types';
import { ListControls, useListControls } from './ListControls';
import { SnSearchMatch, searchSnRecords, getToneClasses } from '../utils/snLookup';
import { SnDetailModal } from './SnDetailModal';
import { ProfitCharts, ProfitProducts, profitMonth } from './ProfitDashboardCharts';
import './ProfitDashboardView.css';

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

const fmt = (n: number) => n.toLocaleString('th-TH', { maximumFractionDigits: 2 });

export const ProfitDashboardView: React.FC = () => {
    const { orders, projects, items, repairTickets, currentUser } = useApp();
    const role = currentUser?.role as string | undefined;
    const isSalesperson = role === 'sales';
    const isExecutive = role === 'admin' || role === 'manager' || role === 'accounting' || role === 'finance';
    const [showOnlyLowMargin, setShowOnlyLowMargin] = useState(false);
    const [typeFilter, setTypeFilter] = useState<'all' | 'order' | 'project'>('all');
    const [yearFilter, setYearFilter] = useState('');
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

    const years = useMemo(() => Array.from(new Set(allEntries
        .map(entry => profitMonth(entry.createdAt).slice(0, 4)).filter(Boolean))).sort().reverse(), [allEntries]);
    const selectedYear = years.includes(yearFilter) ? yearFilter : '';
    const filteredByType = useMemo(() => allEntries.filter(entry =>
        (typeFilter === 'all' || entry.kind === typeFilter) &&
        (!selectedYear || profitMonth(entry.createdAt).startsWith(selectedYear))
    ), [allEntries, typeFilter, selectedYear]);

    const totals = useMemo(() => {
        const revenue = filteredByType.reduce((s, m) => s + m.revenue, 0);
        const cost = filteredByType.reduce((s, m) => s + m.cost, 0);
        const gp = revenue - cost;
        const gpPct = revenue > 0 ? (gp / revenue) * 100 : 0;
        const commission = gp > 0 ? gp * COMMISSION_RATE : 0;
        const lowMarginCount = filteredByType.filter(m => m.isLowMargin).length;
        return { revenue, cost, gp, gpPct, commission, lowMarginCount, orderCount: filteredByType.length };
    }, [filteredByType]);

    // Salesperson breakdown (คิดทั้งยอดบิล SO + ยอดตั้งต้นโปรเจกต์ให้เจ้าของโปรเจกต์ + ยอด Add-on ให้เซลล์คนที่แอดเพิ่ม!)
    const breakdown = useMemo(() => {
        if (!isExecutive) return [];
        const map = new Map<string, { name: string; orders: number; projects: number; addonCount: number; revenue: number; cost: number; gp: number; commission: number; lowMargin: number }>();
        const ensureRow = (name: string) => {
            const existing = map.get(name);
            if (existing) return existing;
            const created = { name, orders: 0, projects: 0, addonCount: 0, revenue: 0, cost: 0, gp: 0, commission: 0, lowMargin: 0 };
            map.set(name, created);
            return created;
        };

        filteredByType.forEach(m => {
            if (!m.order) return;
            const row = ensureRow(m.leadSalesperson);
            row.orders += 1;
            row.revenue += m.revenue;
            row.cost += m.cost;
            row.gp += m.gp;
            row.commission += m.gp > 0 ? m.gp * COMMISSION_RATE : 0;
            if (m.isLowMargin) row.lowMargin += 1;
        });

        filteredByType.forEach(entry => {
            const p = entry.project;
            if (!p) return;
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
    }, [filteredByType, isExecutive]);

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
            <div className="liquid-glass rounded-3xl p-8 text-center border border-stone-200 dark:border-white/[0.08]">
                <AlertTriangle className="w-10 h-10 mx-auto mb-3 text-amber-500" />
                <h2 className="text-base font-bold text-stone-900 dark:text-white">ไม่มีสิทธิ์เข้าถึงข้อมูลการเงินและกำไร (GP)</h2>
                <p className="text-xs text-stone-500 dark:text-stone-400 mt-1">
                    หน้านี้สงวนสิทธิ์เฉพาะฝ่ายขาย ผู้บริหาร และฝ่ายบัญชี/จัดซื้อเท่านั้น
                </p>
            </div>
        );
    }

    const kpiCards = [
        { label: 'ยอดขายรวม', value: `฿${fmt(totals.revenue)}`, icon: Receipt, tone: 'sales', note: `${totals.orderCount} เอกสาร` },
        { label: 'ต้นทุนรวม', value: `฿${fmt(totals.cost)}`, icon: Coins, tone: 'cost', note: 'รวมค่าใช้จ่ายเพิ่มเติมของบิล' },
        { label: 'กำไรขั้นต้น', value: `฿${fmt(totals.gp)}`, icon: TrendingUp, tone: totals.gp < 0 ? 'loss' : 'gp', note: 'ยอดขายหักต้นทุน' },
        { label: 'อัตรากำไร', value: totals.revenue > 0 ? `${totals.gpPct.toFixed(1)}%` : '—', icon: Percent, tone: totals.gpPct < 0 ? 'loss' : 'margin', note: 'กำไรขั้นต้นเทียบยอดขาย' },
        { label: 'ค่าคอมมิชชั่นประมาณการ', value: `฿${fmt(totals.commission)}`, icon: Wallet, tone: 'project', note: '5% ของกำไรขั้นต้นรวมที่เป็นบวก' },
    ];

    const showSerial = (serial: string) => {
        setSnQuery(serial);
        document.getElementById('profit-serial-search')?.focus();
    };

    return (
        <div className="profit-dashboard">
            <header className="profit-header">
                <div className="profit-header-icon" aria-hidden="true"><BarChart3 /></div>
                <div>
                    <h2>สรุปยอดขายและกำไร</h2>
                    <p>{isSalesperson ? `พนักงานขาย · ${currentUser?.name}` : 'ภาพรวมทั้งบริษัท'} · บาท (THB)</p>
                </div>
                <div className="profit-scope">{isSalesperson ? <Users /> : <Crown />}{isSalesperson ? 'มุมมองฝ่ายขาย' : 'มุมมองผู้บริหาร'}</div>
            </header>

            <div className="profit-filters">
                <div className="profit-filter-icon" aria-hidden="true"><CalendarDays /></div>
                <label className="profit-control">ปีที่สร้างเอกสาร
                    <select value={selectedYear} onChange={event => setYearFilter(event.target.value)}>
                        <option value="">ทุกปี</option>
                        {years.map(year => <option key={year} value={year}>{Number(year) + 543}</option>)}
                    </select>
                </label>
                <label className="profit-control">ประเภทเอกสาร
                    <select value={typeFilter} onChange={event => setTypeFilter(event.target.value as typeof typeFilter)}>
                        <option value="all">ทุกประเภท</option>
                        <option value="order">บิลขาย (SO)</option>
                        <option value="project">โปรเจกต์ (PRJ)</option>
                    </select>
                </label>
            </div>

            <div className="profit-kpis">
                {kpiCards.map(({ label, value, icon: Icon, tone, note }) => (
                    <div className={`profit-panel profit-kpi profit-tone-${tone}`} key={label}>
                        <div className="profit-kpi-icon"><Icon aria-hidden="true" /></div>
                        <div className="profit-kpi-label">{label}</div>
                        <strong>{value}</strong>
                        <span className="profit-muted">{note}</span>
                    </div>
                ))}
            </div>

            <ProfitCharts entries={filteredByType} />
            <ProfitProducts entries={filteredByType} />

            {/* Salesperson Breakdown (Admin/Manager only) */}
            {!isSalesperson && (
                <div className="profit-panel profit-detail">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
                        <h3 className="text-sm font-bold text-stone-900 dark:text-white flex items-center gap-2">
                            <Trophy className="w-4 h-4 text-[#FF6B00] flex-shrink-0" />
                            <span>ผลงานแยกตามพนักงานขาย (รวมบิลขาย SO + โปรเจกต์ PRJ + ยอดแอดเพิ่มข้ามเซลล์)</span>
                        </h3>
                        <span className="text-[11px] text-stone-500 dark:text-stone-400">
                            คิดยอด Add-on ของโปรเจกต์ให้เซลล์ผู้แอดรายการเพิ่มโดยอัตโนมัติ
                        </span>
                    </div>

                    {/* Mobile Cards (< md) */}
                    <div className="md:hidden space-y-2.5">
                        {breakdown.map((row, idx) => {
                            const gpPct = row.revenue > 0 ? (row.gp / row.revenue) * 100 : 0;
                            return (
                                <div key={row.name} className="p-3.5 rounded-2xl border border-stone-200 dark:border-white/[0.08] bg-white/80 dark:bg-white/[0.03] space-y-2.5">
                                    <div className="flex items-center justify-between gap-2">
                                        <div className="flex items-center gap-2 min-w-0">
                                            <span className="w-6 h-6 rounded-lg bg-[#FF6B00]/15 text-[#FF6B00] font-mono font-bold text-xs flex items-center justify-center flex-shrink-0">
                                                {idx + 1}
                                            </span>
                                            <span className="text-sm font-bold text-stone-900 dark:text-white truncate">{row.name}</span>
                                        </div>
                                        {row.lowMargin > 0 && (
                                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300 dark:bg-amber-500/20 dark:text-amber-300 dark:border-amber-500/30 flex-shrink-0">
                                                {row.lowMargin} กำไรต่ำ
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex flex-wrap items-center gap-2 text-[11px] text-stone-500 dark:text-stone-400">
                                        <span>บิล SO: <strong className="font-mono text-stone-800 dark:text-stone-200">{row.orders}</strong></span>
                                        <span>•</span>
                                        <span className="text-stone-600 dark:text-stone-300 font-mono">
                                            {row.projects} โปรเจกต์{row.addonCount > 0 ? ` (+${row.addonCount} Add-on)` : ''}
                                        </span>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2 pt-2 border-t border-stone-100 dark:border-white/[0.06] text-xs">
                                        <div>
                                            <div className="text-[10px] text-stone-700 dark:text-stone-300">ยอดขายรวม</div>
                                            <div className="font-mono font-extrabold profit-accent">{fmt(row.revenue)}</div>
                                        </div>
                                        <div>
                                            <div className="text-[10px] text-stone-700 dark:text-stone-300">ต้นทุนรวม</div>
                                            <div className="font-mono font-extrabold profit-cost">{fmt(row.cost)}</div>
                                        </div>
                                        <div>
                                            <div className="text-[10px] text-stone-700 dark:text-stone-300">GP สุทธิ ({gpPct.toFixed(1)}%)</div>
                                            <div className={`font-mono font-extrabold ${row.gp < 0 ? 'profit-loss' : 'profit-gain'}`}>{fmt(row.gp)}</div>
                                        </div>
                                        <div>
                                            <div className="text-[10px] text-stone-700 dark:text-stone-300">ค่าคอม (5%)</div>
                                            <div className="font-mono font-extrabold profit-commission">{fmt(row.commission)}</div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* Desktop Table (>= md) */}
                    <div className="hidden md:block overflow-x-auto">
                        <table className="w-full text-left text-xs">
                            <thead className="bg-stone-100 dark:bg-white/[0.04] text-stone-600 dark:text-stone-400 border-b border-stone-200 dark:border-white/[0.06]">
                                <tr>
                                    <th className="py-2.5 px-3 whitespace-nowrap">#</th>
                                    <th className="py-2.5 px-3 whitespace-nowrap">พนักงานขาย</th>
                                    <th className="py-2.5 px-3 text-right whitespace-nowrap">บิล SO</th>
                                    <th className="py-2.5 px-3 text-right whitespace-nowrap">โปรเจกต์ / Add-on</th>
                                    <th className="py-2.5 px-3 text-right whitespace-nowrap profit-accent">ยอดขายรวม</th>
                                    <th className="py-2.5 px-3 text-right whitespace-nowrap profit-cost">ต้นทุนรวม</th>
                                    <th className="py-2.5 px-3 text-right whitespace-nowrap profit-gain">GP สุทธิ</th>
                                    <th className="py-2.5 px-3 text-right whitespace-nowrap profit-margin">GP %</th>
                                    <th className="py-2.5 px-3 text-right whitespace-nowrap profit-commission">ค่าคอม (5%)</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-stone-100 dark:divide-white/[0.06]">
                                {breakdown.map((row, idx) => {
                                    const gpPct = row.revenue > 0 ? (row.gp / row.revenue) * 100 : 0;
                                    return (
                                        <tr key={row.name} className="hover:bg-stone-50 dark:hover:bg-white/[0.02]">
                                            <td className="py-2.5 px-3 font-mono text-stone-500">{idx + 1}</td>
                                            <td className="py-2.5 px-3 text-base font-bold text-stone-900 dark:text-white whitespace-nowrap">
                                                {row.name}
                                                {row.lowMargin > 0 && (
                                                    <span className="ml-2 px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-100 text-amber-800 border border-amber-300 dark:bg-amber-500/20 dark:text-amber-300 dark:border-amber-500/30">
                                                        {row.lowMargin} กำไรต่ำ
                                                    </span>
                                                )}
                                            </td>
                                            <td className="py-2.5 px-3 text-right font-mono text-stone-700 dark:text-stone-300 data-key">{row.orders}</td>
                                            <td className="py-2.5 px-3 text-right font-mono text-stone-700 dark:text-stone-300 data-key">
                                                {row.projects} โปรเจกต์{row.addonCount > 0 ? ` (+${row.addonCount} Add-on)` : ''}
                                            </td>
                                            <td className="py-2.5 px-3 text-right font-mono profit-accent text-sm font-extrabold data-key">{fmt(row.revenue)}</td>
                                            <td className="py-2.5 px-3 text-right font-mono profit-cost text-sm font-extrabold data-key">{fmt(row.cost)}</td>
                                            <td className={`py-2.5 px-3 text-right font-mono text-sm font-extrabold data-key ${row.gp < 0 ? 'profit-loss' : 'profit-gain'}`}>
                                                {fmt(row.gp)}
                                            </td>
                                            <td className={`py-2.5 px-3 text-right font-mono text-sm font-extrabold data-key ${gpPct < 0 ? 'profit-loss' : 'profit-margin'}`}>
                                                {gpPct.toFixed(1)}%
                                            </td>
                                            <td className="py-2.5 px-3 text-right font-mono profit-commission text-sm font-extrabold data-key">{fmt(row.commission)}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Order & Project GP table */}
            <div className="profit-panel profit-detail">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                    <h3 className="text-sm font-bold text-stone-900 dark:text-white flex items-center gap-2">
                        <TrendingUp className="w-4 h-4 text-[#FF6B00]" />
                        <span>รายละเอียดกำไรต่อบิลขาย & โปรเจกต์รับเหมา (Net Project & Order GP)</span>
                    </h3>
                    <label className="profit-checkbox">
                        <input type="checkbox" checked={showOnlyLowMargin} onChange={event => setShowOnlyLowMargin(event.target.checked)} />
                        กำไรต่ำกว่า {LOW_MARGIN_THRESHOLD}% ({totals.lowMarginCount})
                    </label>
                </div>

                {visibleMetrics.length === 0 ? (
                    <div className="text-center py-12 text-stone-500 border border-dashed border-white/[0.1] rounded-2xl text-xs">
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
                                            : 'border-stone-200 dark:border-white/[0.08] bg-white/80 dark:bg-white/[0.03]'
                                            }`}
                                    >
                                        <div className="flex items-start justify-between gap-2">
                                            <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                                                <span className={`font-mono font-extrabold text-sm ${m.kind === 'project' ? 'text-stone-700 dark:text-stone-300' : 'text-[#FF6B00]'}`}>
                                                    {m.refCode}
                                                </span>
                                                {m.kind === 'project' && (
                                                    <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-stone-500/20 text-stone-700 dark:text-stone-300 border border-stone-500/30">
                                                        PROJECT
                                                    </span>
                                                )}
                                                {rMeta && (
                                                    <span className={`px-2 py-0.5 rounded-lg text-[10px] font-bold border ${rMeta.badgeBg} ${rMeta.badgeBorder} ${rMeta.badgeText}`}>
                                                        {rMeta.shortName}
                                                    </span>
                                                )}
                                            </div>
                                            <span className={`px-2 py-0.5 rounded-lg text-[10px] font-bold border profit-rate flex-shrink-0 ${m.gpPct < 0
                                                ? 'profit-loss'
                                                : 'profit-margin'
                                                }`}>
                                                GP {m.gpPct.toFixed(1)}%
                                            </span>
                                        </div>

                                        <div>
                                            <div className="text-sm font-bold text-stone-900 dark:text-white">{m.title}</div>
                                            {m.kind === 'project' && (
                                                <div className="text-[11px] text-stone-500 dark:text-stone-400 mt-0.5 flex flex-wrap items-center gap-2">
                                                    <span>ยอดตั้งต้น ฿{fmt(m.baseRevenue)}</span>
                                                    {m.addonRevenue > 0 && (
                                                        <span className="text-stone-700 dark:text-stone-300 font-semibold">+ Add-on ฿{fmt(m.addonRevenue)}</span>
                                                    )}
                                                    {m.serialNumbers.length > 0 && (
                                                        <button
                                                            type="button"
                                                            onClick={() => showSerial(m.serialNumbers[0])}
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
                                                <span className="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-orange-500/15 text-orange-700 dark:text-orange-300 border border-orange-500/30">
                                                    {m.leadSalesperson}
                                                </span>
                                                {m.addonSalespeople.map(sp => (
                                                    <span key={sp} className="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-stone-500/15 text-stone-700 dark:text-stone-300 border border-stone-500/30">
                                                        +Add-on: {sp}
                                                    </span>
                                                ))}
                                            </div>
                                        )}

                                        <div className="grid grid-cols-2 gap-2 pt-2 border-t border-stone-100 dark:border-white/[0.06] text-xs">
                                            <div>
                                                <div className="text-[10px] text-stone-700 dark:text-stone-300">ยอดขายรวม</div>
                                                <div className="font-mono font-extrabold profit-accent">{fmt(m.revenue)}</div>
                                            </div>
                                            <div>
                                                <div className="text-[10px] text-stone-700 dark:text-stone-300">ต้นทุนรวม</div>
                                                <div className="font-mono font-extrabold profit-cost">{fmt(m.cost)}</div>
                                            </div>
                                            <div>
                                                <div className="text-[10px] text-stone-700 dark:text-stone-300">GP สุทธิ</div>
                                                <div className={`font-mono font-extrabold ${m.gp < 0 ? 'profit-loss' : 'profit-gain'}`}>{fmt(m.gp)}</div>
                                            </div>
                                            <div>
                                                <div className="text-[10px] text-stone-700 dark:text-stone-300">ค่าคอม (5%)</div>
                                                <div className="font-mono font-extrabold profit-commission">{fmt(commission)}</div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        {/* Desktop Table (>= md) */}
                        <div className="hidden md:block overflow-x-auto">
                            <table className="w-full text-left text-xs">
                                <thead className="bg-stone-100 text-stone-600 dark:bg-white/[0.04] dark:text-stone-300 border-b border-stone-200 dark:border-white/[0.06]">
                                    <tr>
                                        <th className="py-2.5 px-3 whitespace-nowrap">เลขที่เอกสาร</th>
                                        {!isSalesperson && <th className="py-2.5 px-3 whitespace-nowrap">ผู้ขาย / ผู้แอดเพิ่ม</th>}
                                        <th className="py-2.5 px-3 whitespace-nowrap">ลูกค้า / ไซต์งาน</th>
                                        <th className="py-2.5 px-3 whitespace-nowrap">สายรถ</th>
                                        <th className="py-2.5 px-3 text-right whitespace-nowrap profit-accent">ยอดขายรวม</th>
                                        <th className="py-2.5 px-3 text-right whitespace-nowrap profit-cost">ต้นทุนรวม</th>
                                        <th className="py-2.5 px-3 text-right whitespace-nowrap profit-gain">GP สุทธิ</th>
                                        <th className="py-2.5 px-3 text-right whitespace-nowrap profit-margin">GP %</th>
                                        <th className="py-2.5 px-3 text-right whitespace-nowrap profit-commission">ค่าคอม (5%)</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-stone-100 dark:divide-white/[0.06]">
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
                                                        <span className={m.kind === 'project' ? 'text-stone-700 dark:text-stone-300' : 'text-[#FF6B00]'}>
                                                            {m.refCode}
                                                        </span>
                                                        {m.kind === 'project' && (
                                                            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-stone-500/20 text-stone-700 dark:text-stone-300 border border-stone-500/30">
                                                                PROJECT
                                                            </span>
                                                        )}
                                                    </div>
                                                </td>
                                                {!isSalesperson && (
                                                    <td className="py-2.5 px-3 whitespace-nowrap">
                                                        <div className="flex flex-wrap items-center gap-1">
                                                            <span className="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-orange-500/15 text-orange-700 dark:text-orange-300 border border-orange-500/30">
                                                                {m.leadSalesperson}
                                                            </span>
                                                            {m.addonSalespeople.map(sp => (
                                                                <span key={sp} className="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-stone-500/15 text-stone-700 dark:text-stone-300 border border-stone-500/30">
                                                                    +Add-on: {sp}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    </td>
                                                )}
                                                <td className="py-2.5 px-3 text-stone-900 dark:text-white font-bold text-sm">
                                                    <div>{m.title}</div>
                                                    {m.kind === 'project' && (
                                                        <div className="text-[10px] text-stone-700 dark:text-stone-300 font-normal mt-0.5 flex flex-wrap items-center gap-2">
                                                            <span>ยอดตั้งต้น ฿{fmt(m.baseRevenue)}</span>
                                                            {m.addonRevenue > 0 && (
                                                                <span className="text-stone-700 dark:text-stone-300 font-semibold">+ ยอดแอดเพิ่ม ฿{fmt(m.addonRevenue)}</span>
                                                            )}
                                                            {m.serialNumbers.length > 0 && (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => showSerial(m.serialNumbers[0])}
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
                                                <td className="py-2.5 px-3 text-right font-mono profit-accent text-sm font-extrabold data-key">{fmt(m.revenue)}</td>
                                                <td className="py-2.5 px-3 text-right font-mono profit-cost text-sm font-extrabold data-key">{fmt(m.cost)}</td>
                                                <td className={`py-2.5 px-3 text-right font-mono text-sm font-extrabold data-key ${m.gp < 0 ? 'profit-loss' : 'profit-gain'}`}>
                                                    {fmt(m.gp)}
                                                </td>
                                                <td className="py-2.5 px-3 text-right whitespace-nowrap">
                                                    <span className={`px-2 py-0.5 rounded-lg text-[10px] font-bold border profit-rate ${m.gpPct < 0
                                                        ? 'profit-loss'
                                                        : 'profit-margin'
                                                        }`}>
                                                        {m.gpPct.toFixed(1)}%
                                                    </span>
                                                </td>
                                                <td className="py-2.5 px-3 text-right font-mono profit-commission text-sm font-extrabold data-key">{fmt(commission)}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </>
                )}

                <div className="mt-4 flex items-center gap-2 text-[10px] text-stone-500">
                    <Lock className="w-3 h-3" />
                    <span>ข้อมูลราคาทุนเป็นข้อมูลภายในของบริษัท ห้ามเผยแพร่ในเอกสารที่ส่งให้ลูกค้า</span>
                </div>
            </div>

            {/* Live S/N & Project Site History Lookup */}
            <div className="profit-panel profit-detail space-y-4">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                    <div>
                        <h3 className="text-sm font-bold text-stone-900 dark:text-white flex items-center gap-2">
                            <Hash className="w-4 h-4 text-[#FF6B00]" />
                            <span>ตรวจสอบ S/N & ประวัติไซต์งานโปรเจกต์ (Live S/N & Project Site History Lookup)</span>
                        </h3>
                        <p className="text-xs text-stone-700 dark:text-stone-300 mt-0.5">
                            ค้นหา S/N อุปกรณ์ในโปรเจกต์ (เช่น HW-S220-PRJ01), รหัส PRJ-2026-XXX หรือบิลขาย เพื่อดูประวัติหน้างาน วอยประกัน และ GP รายการ
                        </p>
                    </div>
                    <div className="relative w-full md:w-80">
                        <Search className="w-4 h-4 text-stone-700 dark:text-stone-300 absolute left-3.5 top-2.5" />
                        <input
                            type="text"
                            value={snQuery}
                            onChange={(e) => setSnQuery(e.target.value)}
                            placeholder="ค้นหา S/N หรือรหัส PRJ-2026-XXX..."
                            className="w-full liquid-glass-input rounded-xl pl-9 pr-8 py-2 text-sm text-stone-900 dark:text-white"
                        />
                        {snQuery && (
                            <button
                                type="button"
                                onClick={() => setSnQuery('')}
                                className="absolute right-2.5 top-2 profit-accent-hover cursor-pointer"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        )}
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[11px] text-stone-700 dark:text-stone-300">คลิก S/N โปรเจกต์ตัวอย่าง:</span>
                    {projectSnSamples.map((sample) => (
                        <button
                            key={sample}
                            type="button"
                            onClick={() => setSnQuery(sample)}
                            className="px-2.5 py-1 rounded-xl text-xs font-mono font-bold bg-stone-500/15 hover:bg-stone-500/25 text-stone-700 dark:text-stone-300 border border-stone-500/30 transition cursor-pointer"
                        >
                            {sample}
                        </button>
                    ))}
                </div>

                {snQuery.trim() && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                        {snMatches.length === 0 ? (
                            <div className="md:col-span-2 text-center py-6 text-xs text-stone-700 dark:text-stone-300 border border-dashed border-white/10 rounded-2xl">
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
                                        className="profit-serial-result text-left p-3.5 rounded-2xl transition cursor-pointer flex items-start justify-between gap-3"
                                    >
                                        <div className="min-w-0 space-y-1">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className="font-mono font-extrabold text-sm profit-accent">{m.primarySn}</span>
                                                {m.project && (
                                                    <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-stone-500/20 text-stone-700 dark:text-stone-300 border border-stone-500/40 font-mono">
                                                        {m.project.id}
                                                    </span>
                                                )}
                                            </div>
                                            <div className="text-xs font-bold truncate">{m.modelName}</div>
                                            <div className="text-[11px] text-stone-700 dark:text-stone-300 truncate">ลูกค้า: {m.customerName}</div>
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

            <SnDetailModal match={selectedSnMatch} onClose={() => setSelectedSnMatch(null)} />
        </div>
    );
};
