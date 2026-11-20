import React, { useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import {
    TrendingUp, TrendingDown, Wallet, Percent, Users, Trophy,
    AlertTriangle, Receipt, Coins, BarChart3, Lock, Crown
} from 'lucide-react';
import { Order, ROUTE_DEFINITIONS } from '../types';
import { ListControls, useListControls } from './ListControls';

const COMMISSION_RATE = 0.05; // ค่าคอมมิชชั่นเริ่มต้น 5% ของ GP
const LOW_MARGIN_THRESHOLD = 10; // GP ต่ำกว่า 10% = เสี่ยง/กำไรต่ำ

interface OrderMetrics {
    order: Order;
    revenue: number;
    cost: number;
    gp: number;
    gpPct: number;
    isLowMargin: boolean;
    hasCostData: boolean;
}

const computeMetrics = (order: Order): OrderMetrics => {
    const items = order.items_list || [];
    const revenue = items.reduce((sum, it) => sum + (it.unit_price || 0) * (it.quantity || 0), 0);
    const itemCost = items.reduce((sum, it) => sum + (it.unit_cost || 0) * (it.quantity || 0), 0);
    const cost = itemCost + (order.extra_cost || 0);
    const gp = revenue - cost;
    const gpPct = revenue > 0 ? (gp / revenue) * 100 : 0;
    const hasCostData = items.some(it => (it.unit_cost || 0) > 0) || (order.extra_cost || 0) > 0;
    return {
        order,
        revenue,
        cost,
        gp,
        gpPct,
        isLowMargin: revenue > 0 && gpPct < LOW_MARGIN_THRESHOLD,
        hasCostData
    };
};

const fmt = (n: number) => n.toLocaleString('th-TH', { maximumFractionDigits: 0 });

export const ProfitDashboardView: React.FC = () => {
    const { orders, currentUser } = useApp();
    const isSalesperson = currentUser?.role === 'sales';
    const [showOnlyLowMargin, setShowOnlyLowMargin] = useState(false);

    // Role-based filtering: เซลเห็นเฉพาะออเดอร์ของตัวเอง, Admin/Manager เห็นทั้งบริษัท
    const scopedOrders = useMemo(() => {
        if (isSalesperson && currentUser) {
            return orders.filter(o => o.salesperson === currentUser.name);
        }
        return orders;
    }, [orders, isSalesperson, currentUser]);

    const metrics = useMemo(() => scopedOrders.map(computeMetrics), [scopedOrders]);

    const totals = useMemo(() => {
        const revenue = metrics.reduce((s, m) => s + m.revenue, 0);
        const cost = metrics.reduce((s, m) => s + m.cost, 0);
        const gp = revenue - cost;
        const gpPct = revenue > 0 ? (gp / revenue) * 100 : 0;
        const commission = gp > 0 ? gp * COMMISSION_RATE : 0;
        const lowMarginCount = metrics.filter(m => m.isLowMargin).length;
        return { revenue, cost, gp, gpPct, commission, lowMarginCount, orderCount: metrics.length };
    }, [metrics]);

    // Salesperson breakdown (เฉพาะ Admin/Manager)
    const breakdown = useMemo(() => {
        const map = new Map<string, { name: string; orders: number; revenue: number; cost: number; gp: number; commission: number; lowMargin: number }>();
        metrics.forEach(m => {
            const name = m.order.salesperson || 'ไม่ระบุ';
            const row = map.get(name) || { name, orders: 0, revenue: 0, cost: 0, gp: 0, commission: 0, lowMargin: 0 };
            row.orders += 1;
            row.revenue += m.revenue;
            row.cost += m.cost;
            row.gp += m.gp;
            row.commission += m.gp > 0 ? m.gp * COMMISSION_RATE : 0;
            if (m.isLowMargin) row.lowMargin += 1;
            map.set(name, row);
        });
        return Array.from(map.values()).sort((a, b) => b.gp - a.gp);
    }, [metrics]);

    const visibleMetrics = showOnlyLowMargin ? metrics.filter(m => m.isLowMargin) : metrics;

    const metricsList = useListControls(visibleMetrics, {
        getDate: (m) => m.order.created_at,
        getValue: (m) => m.gp,
        initialSort: 'newest',
    });

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
            <div className="liquid-glass rounded-3xl p-6 sm:p-7 shadow-2xl border border-white/[0.08]">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                    <div>
                        <h2 className="text-base font-bold text-white flex items-center gap-2">
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
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
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
                <div className="rounded-2xl p-4 bg-amber-500/10 border border-amber-500/30 flex items-center justify-between gap-3">
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
                <div className="liquid-glass rounded-3xl p-6 sm:p-7 shadow-2xl border border-white/[0.08]">
                    <h3 className="text-sm font-bold text-white flex items-center gap-2 mb-4">
                        <Trophy className="w-4 h-4 text-[#FF6B00]" />
                        <span>ผลงานแยกตามพนักงานขาย (Salesperson Breakdown)</span>
                    </h3>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                            <thead className="bg-white/[0.04] text-slate-400 border-b border-white/[0.06]">
                                <tr>
                                    <th className="py-2.5 px-3 whitespace-nowrap">#</th>
                                    <th className="py-2.5 px-3 whitespace-nowrap">พนักงานขาย</th>
                                    <th className="py-2.5 px-3 text-right whitespace-nowrap">ออเดอร์</th>
                                    <th className="py-2.5 px-3 text-right whitespace-nowrap">ยอดขาย</th>
                                    <th className="py-2.5 px-3 text-right whitespace-nowrap">ต้นทุน</th>
                                    <th className="py-2.5 px-3 text-right whitespace-nowrap">GP</th>
                                    <th className="py-2.5 px-3 text-right whitespace-nowrap">GP %</th>
                                    <th className="py-2.5 px-3 text-right whitespace-nowrap">ค่าคอม (5%)</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/[0.04]">
                                {breakdown.map((row, idx) => {
                                    const gpPct = row.revenue > 0 ? (row.gp / row.revenue) * 100 : 0;
                                    return (
                                        <tr key={row.name} className="hover:bg-white/[0.02]">
                                            <td className="py-2.5 px-3 font-mono text-slate-500">{idx + 1}</td>
                                            <td className="py-2.5 px-3 text-base font-bold text-white whitespace-nowrap">
                                                {row.name}
                                                {row.lowMargin > 0 && (
                                                    <span className="ml-2 px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                                        {row.lowMargin} กำไรต่ำ
                                                    </span>
                                                )}
                                            </td>
                                            <td className="py-2.5 px-3 text-right font-mono text-slate-300 data-key">{row.orders}</td>
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

            {/* Order-level GP table */}
            <div className="liquid-glass rounded-3xl p-6 sm:p-7 shadow-2xl border border-white/[0.08]">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                        <TrendingUp className="w-4 h-4 text-[#FF6B00]" />
                        <span>รายละเอียดกำไรต่อออเดอร์ (Order-level GP)</span>
                    </h3>
                    <span className="text-xs text-slate-400">{visibleMetrics.length} ออเดอร์</span>
                </div>

                {visibleMetrics.length === 0 ? (
                    <div className="text-center py-12 text-slate-500 border border-dashed border-white/[0.1] rounded-2xl text-xs">
                        ยังไม่มีข้อมูลออเดอร์สำหรับแสดงผล
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
                            unit="ออเดอร์"
                            className="mb-3"
                        />
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-xs">
                                <thead className="bg-white/[0.04] text-slate-400 border-b border-white/[0.06]">
                                    <tr>
                                        <th className="py-2.5 px-3 whitespace-nowrap">เลขที่ SO</th>
                                        {!isSalesperson && <th className="py-2.5 px-3 whitespace-nowrap">ผู้ขาย</th>}
                                        <th className="py-2.5 px-3 whitespace-nowrap">ลูกค้า</th>
                                        <th className="py-2.5 px-3 whitespace-nowrap">สายรถ</th>
                                        <th className="py-2.5 px-3 text-right whitespace-nowrap">ยอดขาย</th>
                                        <th className="py-2.5 px-3 text-right whitespace-nowrap">ต้นทุน</th>
                                        <th className="py-2.5 px-3 text-right whitespace-nowrap">GP</th>
                                        <th className="py-2.5 px-3 text-right whitespace-nowrap">GP %</th>
                                        <th className="py-2.5 px-3 text-right whitespace-nowrap">ค่าคอม (5%)</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/[0.04]">
                                    {metricsList.pageItems.map((m) => {
                                        const rMeta = m.order.route_code ? ROUTE_DEFINITIONS[m.order.route_code] : null;
                                        const commission = m.gp > 0 ? m.gp * COMMISSION_RATE : 0;
                                        return (
                                            <tr
                                                key={m.order.id}
                                                className={`transition ${m.isLowMargin ? 'bg-rose-500/[0.06] hover:bg-rose-500/[0.1]' : 'hover:bg-white/[0.02]'}`}
                                            >
                                                <td className="py-2.5 px-3 font-mono font-extrabold text-[#FF6B00] whitespace-nowrap text-sm data-key">
                                                    {m.order.sales_ref || 'SO-AUTO'}
                                                </td>
                                                {!isSalesperson && (
                                                    <td className="py-2.5 px-3 whitespace-nowrap">
                                                        <span className="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                                                            {m.order.salesperson || '-'}
                                                        </span>
                                                    </td>
                                                )}
                                                <td className="py-2.5 px-3 text-white font-bold text-base whitespace-nowrap">{m.order.customer_name}</td>
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
        </div>
    );
};
