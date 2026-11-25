import { useState } from 'react';
import { BarChart3, Package, PieChart } from 'lucide-react';
import type { Order, Project } from '../types';

export interface ProfitChartEntry {
    kind: 'order' | 'project';
    createdAt: string;
    revenue: number;
    gp: number;
    order?: Order;
    project?: Project;
}

const number = new Intl.NumberFormat('th-TH', { maximumFractionDigits: 2 });
const compactNumber = new Intl.NumberFormat('th-TH', { notation: 'compact', maximumFractionDigits: 1 });
const monthLabel = new Intl.DateTimeFormat('th-TH', {
    month: 'short', year: '2-digit', timeZone: 'Asia/Bangkok',
});
const monthKey = new Intl.DateTimeFormat('sv-SE', {
    year: 'numeric', month: '2-digit', timeZone: 'Asia/Bangkok',
});

export function profitMonth(value: string) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '' : monthKey.format(date);
}

const money = (value: number) => `฿${number.format(value)}`;

export function ProfitCharts({ entries }: { entries: ProfitChartEntry[] }) {
    const [selectedMonth, setSelectedMonth] = useState('');
    const months = new Map<string, { revenue: number; gp: number }>();
    let latest = '';
    const source = { order: 0, project: 0 };
    for (const entry of entries) {
        source[entry.kind] += entry.revenue;
        const key = profitMonth(entry.createdAt);
        if (!key) continue;
        if (key > latest) latest = key;
        const month = months.get(key) ?? { revenue: 0, gp: 0 };
        month.revenue += entry.revenue;
        month.gp += entry.gp;
        months.set(key, month);
    }

    const [year, month] = latest.split('-').map(Number);
    const points = latest ? Array.from({ length: 6 }, (_, index) => {
        const date = new Date(Date.UTC(year, month - 6 + index, 1));
        const key = monthKey.format(date);
        return { key, label: monthLabel.format(date), ...(months.get(key) ?? { revenue: 0, gp: 0 }) };
    }) : [];
    const active = points.find(point => point.key === selectedMonth) ?? points[points.length - 1];
    const highest = Math.max(0, ...points.flatMap(point => [point.revenue, point.gp]));
    const lowest = Math.min(0, ...points.flatMap(point => [point.revenue, point.gp]));
    const range = highest - lowest || 1;
    const zero = highest === lowest ? 100 : highest / range * 100;
    const total = source.order + source.project;
    const hasMix = total > 0 && source.order >= 0 && source.project >= 0;
    const orderShare = hasMix ? source.order / total * 100 : 0;
    const shares = [
        { label: 'บิลขาย (SO)', value: source.order, share: orderShare, color: 'var(--profit-sales)' },
        { label: 'โปรเจกต์ (PRJ)', value: source.project, share: 100 - orderShare, color: 'var(--profit-project)' },
    ];

    return (
        <div className="profit-charts">
            <section className="profit-panel">
                <h3><BarChart3 /> แนวโน้มยอดขายและกำไร</h3>
                <p className="profit-muted">6 เดือนถึงเดือนล่าสุดที่มีเอกสารในช่วงที่เลือก · ตามวันที่สร้างเอกสาร</p>
                {active ? (
                    <>
                        <div className="profit-chart-readout" aria-live="polite">
                            <strong>{active.label}</strong>
                            <span><i className="profit-dot profit-sales" />ยอดขาย <b>{money(active.revenue)}</b></span>
                            <span><i className={`profit-dot ${active.gp < 0 ? 'profit-gp-negative' : 'profit-gp'}`} />กำไรขั้นต้น <b className={active.gp < 0 ? 'profit-loss' : 'profit-gain'}>{money(active.gp)}</b></span>
                        </div>
                        <div className="profit-plot">
                            <div className="profit-axis" aria-hidden="true">
                                {highest === lowest
                                    ? <span className="profit-axis-zero">0</span>
                                    : [highest, (highest + lowest) / 2, lowest].map(tick => <span key={tick}>{compactNumber.format(tick)}</span>)}
                            </div>
                            <div className="profit-columns">
                                {points.map(point => (
                                    <button key={point.key} type="button" className="profit-month" aria-pressed={active.key === point.key}
                                        aria-label={`${point.label} ยอดขาย ${money(point.revenue)} กำไรขั้นต้น ${money(point.gp)}`}
                                        onClick={() => setSelectedMonth(point.key)}
                                    >
                                        <span className="profit-bars" aria-hidden="true">
                                            <i className="profit-zero" style={{ top: `${zero}%` }} />
                                            {[point.revenue, point.gp].map((value, index) => (
                                                <i key={index} className={`profit-bar ${index === 0 ? 'profit-sales' : value < 0 ? 'profit-gp-negative' : 'profit-gp'}`}
                                                    style={{ height: `${Math.abs(value) / range * 100}%`, top: `${zero - Math.max(0, value) / range * 100}%` }}
                                                />
                                            ))}
                                        </span>
                                        <span>{point.label}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    </>
                ) : <p className="profit-empty">ไม่มีข้อมูลตามวันที่สำหรับแสดงกราฟ</p>}
            </section>

            <section className="profit-panel">
                <h3><PieChart /> สัดส่วนยอดขาย</h3>
                <p className="profit-muted">บิลขายและโปรเจกต์ในช่วงที่เลือก</p>
                <div className="profit-ring" style={hasMix ? {
                    background: `conic-gradient(var(--profit-sales) 0 ${orderShare}%, var(--profit-project) ${orderShare}% 100%)`,
                } : undefined}>
                    <div><span>ยอดขายรวม</span><strong>{money(total)}</strong></div>
                </div>
                <ul className="profit-shares">
                    {shares.map(share => (
                        <li key={share.label}>
                            <span><i className="profit-dot" style={{ background: share.color }} />{share.label}</span>
                            <strong>{money(share.value)}</strong>
                            <span>{hasMix ? `${share.share.toFixed(1)}%` : '—'}</span>
                        </li>
                    ))}
                </ul>
                {!hasMix && <p className="profit-muted">{source.order < 0 || source.project < 0 ? 'มีหมวดที่ยอดขายติดลบ จึงแสดงเฉพาะยอดเงิน' : 'ยังไม่มียอดขายสำหรับคำนวณสัดส่วน'}</p>}
            </section>
        </div>
    );
}

function rankProducts(entries: ProfitChartEntry[]) {
    const products = new Map<string, { name: string; unit: string; quantity: number; revenue: number; cost: number; gp: number; documents: Set<ProfitChartEntry> }>();
    for (const entry of entries) {
        const lines = entry.order
            ? (entry.order.items_list ?? []).filter(line => line.item_type !== 'service')
                .map(line => ({ ...line, qty: line.quantity }))
            : (entry.project?.items ?? []).map(line => ({ ...line, qty: line.qty_required }));
        for (const line of lines) {
            const name = line.model_name?.trim().replace(/\s+/g, ' ') || 'ไม่ระบุชื่อสินค้า';
            const unit = line.unit || 'หน่วย';
            const key = JSON.stringify([name.toLowerCase(), unit]);
            const row = products.get(key) ?? { name, unit, quantity: 0, revenue: 0, cost: 0, gp: 0, documents: new Set() };
            const qty = line.qty || 0;
            row.quantity += qty;
            row.revenue += qty * (line.unit_price || 0);
            row.cost += qty * (line.unit_cost || 0);
            row.gp = row.revenue - row.cost;
            row.documents.add(entry);
            products.set(key, row);
        }
    }
    return Array.from(products, ([key, row]) => ({ key, ...row }));
}

export function ProfitProducts({ entries }: { entries: ProfitChartEntry[] }) {
    const [sort, setSort] = useState<'revenue' | 'quantity' | 'gp'>('revenue');
    const [expanded, setExpanded] = useState(false);
    const products = rankProducts(entries).sort((a, b) => b[sort] - a[sort] || a.name.localeCompare(b.name, 'th'));

    return (
        <section className="profit-panel">
            <div className="profit-section-heading">
                <div>
                    <h3><Package /> สินค้าขายดี</h3>
                    <p className="profit-muted">รวมตามชื่อรุ่นและหน่วยนับ · รวมวัสดุและค่าแรงที่บันทึกในโปรเจกต์ · กำไรหักเฉพาะต้นทุนต่อรายการ</p>
                </div>
                <label className="profit-control">จัดอันดับตาม
                    <select value={sort} onChange={event => setSort(event.target.value as typeof sort)}>
                        <option value="revenue">ยอดขาย</option>
                        <option value="quantity">จำนวนขาย</option>
                        <option value="gp">กำไรขั้นต้น</option>
                    </select>
                </label>
            </div>
            {products.length ? (
                <>
                    <table className="profit-product-table">
                        <thead>
                            <tr>
                                <th scope="col">สินค้า</th>
                                <th scope="col">จำนวน</th>
                                <th scope="col">เอกสาร</th>
                                <th scope="col" className="profit-accent">ยอดขาย</th>
                                <th scope="col" className="profit-cost">ต้นทุน</th>
                                <th scope="col" className="profit-gain">กำไรขั้นต้น</th>
                                <th scope="col" className="profit-margin">อัตรากำไร</th>
                            </tr>
                        </thead>
                        <tbody>
                            {products.slice(0, expanded ? products.length : 5).map((row, index) => (
                                <tr key={row.key}>
                                    <th scope="row"><span className="profit-rank">{index + 1}</span>{row.name}</th>
                                    <td><span className="profit-mobile-label" aria-hidden="true">จำนวน</span>{number.format(row.quantity)} {row.unit}</td>
                                    <td><span className="profit-mobile-label" aria-hidden="true">เอกสาร</span>{row.documents.size}</td>
                                    <td className="profit-accent"><span className="profit-mobile-label" aria-hidden="true">ยอดขาย</span><strong>{money(row.revenue)}</strong></td>
                                    <td className="profit-cost"><span className="profit-mobile-label" aria-hidden="true">ต้นทุน</span><strong>{money(row.cost)}</strong></td>
                                    <td className={row.gp < 0 ? 'profit-loss' : 'profit-gain'}><span className="profit-mobile-label" aria-hidden="true">กำไรขั้นต้น</span><strong>{money(row.gp)}</strong></td>
                                    <td className={row.gp < 0 ? 'profit-loss' : 'profit-margin'}><span className="profit-mobile-label" aria-hidden="true">อัตรากำไร</span>{row.revenue > 0 ? `${(100 * row.gp / row.revenue).toFixed(1)}%` : '—'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {products.length > 5 && <button className="profit-button" type="button" aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>
                        {expanded ? 'แสดง 5 อันดับแรก' : `ดูสินค้าทั้งหมด (${products.length})`}
                    </button>}
                </>
            ) : <p className="profit-empty">ไม่มีข้อมูลสินค้าในเอกสารที่เลือก</p>}
        </section>
    );
}
