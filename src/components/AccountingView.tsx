import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useApp } from '../context/AppContext';
import {
  FileText, Printer, CheckCircle2, Package, AlertTriangle,
  Receipt, TrendingUp, Building2, Eye, X, ShieldAlert, Download
} from 'lucide-react';
import { Order, Project, formatThaiDateTime, BillingBadgeKey, BILLING_BADGE_META, getOrderBillingBadgeKey } from '../types';
import { EvidencePhotoUploader } from './EvidencePhotoUploader';
import { OrderFormPrintModal } from './OrderFormPrintModal';
import { computeProjectFinancials } from '../utils/domainHelpers';
import { ListControls, useListControls } from './ListControls';

const fmt = (n: number) => n.toLocaleString('th-TH', { maximumFractionDigits: 0 });

export const AccountingView: React.FC = () => {
  const {
    orders, projects, items, stockPOs,
    markOrderBilled, markProjectBilled
  } = useApp();

  const [activeSubTab, setActiveSubTab] = useState<'billing' | 'po_readonly' | 'doa_readonly'>('billing');
  const [billingFilter, setBillingFilter] = useState<'ready' | 'billed' | 'all'>('ready');
  const [billingTypeFilter, setBillingTypeFilter] = useState<'all' | BillingBadgeKey>('all');
  const [printTarget, setPrintTarget] = useState<{ order?: Order | null; project?: Project | null; initialBatchNo?: number | null } | null>(null);
  const [taxModalTarget, setTaxModalTarget] = useState<{ type: 'order' | 'project'; id: string; label: string } | null>(null);
  const [taxInvoiceInput, setTaxInvoiceInput] = useState('');
  const [photoPreviewUrls, setPhotoPreviewUrls] = useState<string[] | null>(null);

  // Orders ready for billing or already billed (filtered by ประเภทบิล & สถานะการชำระเงิน)
  const billingOrders = useMemo(() => {
    return orders.filter(o => {
      if (billingTypeFilter !== 'all' && getOrderBillingBadgeKey(o) !== billingTypeFilter) {
        return false;
      }
      const isRecurringOrAddon = o.billing_type === 'rental' || o.billing_type === 'ma' || o.billing_type === 'addon';
      const isReadyStatus = isRecurringOrAddon || o.order_status === 'fulfilled' || o.order_status === 'approved_for_prep';
      if (billingFilter === 'ready') return isReadyStatus && o.billing_status !== 'billed';
      if (billingFilter === 'billed') return o.billing_status === 'billed';
      return true;
    });
  }, [orders, billingFilter, billingTypeFilter]);

  // Projects ready for billing or already billed
  const billingProjects = useMemo(() => {
    return projects.filter(p => {
      const isReadyStatus = p.status === 'completed' || p.status === 'handover_pending' || p.status === 'in_progress';
      if (billingFilter === 'ready') return (p.status === 'completed' || p.status === 'handover_pending') && p.billing_status !== 'billed';
      if (billingFilter === 'billed') return p.billing_status === 'billed';
      return isReadyStatus || p.status === 'planning';
    });
  }, [projects, billingFilter]);

  const doaItems = useMemo(
    () => items.filter(i => i.status === 'doa_reported' || i.status === 'doa_sent_supplier' || i.status === 'doa_replaced'),
    [items]
  );

  const billingProjectsList = useListControls(billingProjects, {
    getDate: (p) => p.updated_at || p.created_at,
    initialSort: 'newest',
    initialPageSize: 10
  });

  const billingOrdersList = useListControls(billingOrders, {
    getDate: (o) => o.updated_at || o.created_at,
    initialSort: 'newest',
    initialPageSize: 10
  });

  const poList = useListControls(stockPOs, {
    getDate: (po) => po.created_at,
    initialSort: 'newest',
    initialPageSize: 15
  });

  const doaList = useListControls(doaItems, {
    getDate: (it) => it.doa_reported_at || it.created_at,
    initialSort: 'newest',
    initialPageSize: 12
  });

  const escapeCsv = (val: unknown) => {
    const s = String(val ?? '').replace(/\r?\n/g, ' ');
    return `"${s.replace(/"/g, '""')}"`;
  };

  const handleExportBillingCsv = () => {
    const headers = [
      'ประเภทเอกสาร',
      'เลขที่บิล/อ้างอิง',
      'เลขที่ใบกำกับภาษี',
      'วันที่เอกสาร',
      'ครบกำหนดชำระ',
      'ชื่อลูกค้า',
      'เบอร์โทร',
      'รายการสรุป',
      'ยอดก่อน VAT (7%)',
      'VAT 7%',
      'ยอดสุทธิรวม VAT',
      'ต้นทุนรวม',
      'กำไรขั้นต้น (GP)',
      'สถานะวางบิล',
      'ผู้รับผิดชอบ'
    ];

    const rows: string[][] = [];

    billingProjects.forEach((prj) => {
      const fin = computeProjectFinancials(prj, stockPOs);
      const total = fin.revenue || 0;
      const beforeVat = Number((total / 1.07).toFixed(2));
      const vat = Number((total - beforeVat).toFixed(2));
      const itemSummary = prj.items.map(i => `${i.model_name} x${i.qty_required}`).join('; ');
      rows.push([
        'โปรเจกต์ (PRJ)',
        prj.id,
        prj.tax_invoice_no || '-',
        formatThaiDateTime(prj.created_at),
        prj.due_date || '-',
        prj.customer_name,
        prj.phone || '-',
        itemSummary,
        beforeVat.toFixed(2),
        vat.toFixed(2),
        total.toFixed(2),
        fin.totalCost.toFixed(2),
        (total - fin.totalCost).toFixed(2),
        prj.billing_status === 'billed' ? 'วางบิลแล้ว' : 'รอวางบิล',
        prj.created_by || '-'
      ]);
    });

    billingOrders.forEach((ord) => {
      const total = (ord.items_list || []).reduce((s, i) => s + (i.unit_price || 0) * (i.quantity || 0), 0);
      const cost =
        (ord.items_list || []).reduce((s, i) => s + (i.unit_cost || 0) * (i.quantity || 0), 0) +
        (ord.extra_cost || 0);
      const beforeVat = Number((total / 1.07).toFixed(2));
      const vat = Number((total - beforeVat).toFixed(2));
      const itemSummary = (ord.items_list || []).map(i => `${i.model_name} x${i.quantity}`).join('; ');
      rows.push([
        BILLING_BADGE_META[getOrderBillingBadgeKey(ord)].label,
        ord.bill_no || ord.sales_ref || ord.id,
        ord.tax_invoice_no || '-',
        formatThaiDateTime(ord.created_at),
        ord.due_date || '-',
        ord.customer_name,
        ord.customer_phone || '-',
        itemSummary,
        beforeVat.toFixed(2),
        vat.toFixed(2),
        total.toFixed(2),
        cost.toFixed(2),
        (total - cost).toFixed(2),
        ord.billing_status === 'billed' ? 'วางบิลแล้ว' : 'รอวางบิล',
        ord.salesperson || ord.created_by || '-'
      ]);
    });

    const csvContent = '\uFEFF' + [headers, ...rows].map(r => r.map(escapeCsv).join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bosscomputech-accounting-billing-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportPoCsv = () => {
    const headers = ['เลข PO', 'วันที่สร้าง', 'สินค้า', 'Supplier', 'จำนวน', 'ราคาต่อหน่วย', 'รวมต้นทุน', 'โปรเจกต์', 'สถานะ'];
    const rows = stockPOs.map(po => [
      po.po_number,
      formatThaiDateTime(po.created_at),
      po.product_name,
      po.supplier,
      String(po.qty),
      po.unit_cost.toFixed(2),
      (po.qty * po.unit_cost).toFixed(2),
      po.project_id || '-',
      po.status === 'received' ? 'รับเข้าคลังแล้ว' : po.status === 'cancelled' ? 'ยกเลิก' : 'รอของเข้า'
    ]);
    const csvContent = '\uFEFF' + [headers, ...rows].map(r => r.map(escapeCsv).join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bosscomputech-accounting-po-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const summary = useMemo(() => {
    const readyOrdersCount = orders.filter(o => {
      const isRecurringOrAddon = o.billing_type === 'rental' || o.billing_type === 'ma' || o.billing_type === 'addon';
      const isReadyStatus = isRecurringOrAddon || o.order_status === 'fulfilled' || o.order_status === 'approved_for_prep';
      return isReadyStatus && o.billing_status !== 'billed';
    }).length;
    const readyProjectsCount = projects.filter(p => (p.status === 'completed' || p.status === 'handover_pending') && p.billing_status !== 'billed').length;
    const billedTotalCount =
      orders.filter(o => o.billing_status === 'billed').length +
      projects.filter(p => p.billing_status === 'billed').length;
    return {
      readyCount: readyOrdersCount + readyProjectsCount,
      billedCount: billedTotalCount,
      poCount: stockPOs.length,
      doaCount: doaItems.length
    };
  }, [orders, projects, stockPOs, doaItems]);

  const handleConfirmBilled = (e: React.FormEvent) => {
    e.preventDefault();
    if (!taxModalTarget) return;
    if (taxModalTarget.type === 'order') {
      markOrderBilled(taxModalTarget.id, taxInvoiceInput);
    } else {
      markProjectBilled(taxModalTarget.id, taxInvoiceInput);
    }
    setTaxModalTarget(null);
    setTaxInvoiceInput('');
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="liquid-glass rounded-3xl p-5 sm:p-6 border border-white/[0.08] flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-2xl bg-[#FF6B00]/15 text-[#FF6B00] border border-[#FF6B00]/30">
            <Receipt className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-extrabold text-slate-900 dark:text-white">
              ฝ่ายบัญชี &amp; การเงิน (Accounting &amp; Billing)
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              วางบิล / ออกใบกำกับภาษี, พิมพ์ใบสั่งงาน ORDER FORM 2026, ตรวจหลักฐานส่งมอบ และดูสถานะ PO / DOA
            </p>
          </div>
        </div>

        {/* Sub-tab Switcher */}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setActiveSubTab('billing')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
              activeSubTab === 'billing'
                ? 'bg-[#FF6B00] text-black shadow-md shadow-[#FF6B00]/20'
                : 'bg-slate-100 dark:bg-white/[0.05] text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-white/[0.08]'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>วางบิล &amp; ใบกำกับภาษี ({summary.readyCount})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveSubTab('po_readonly')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
              activeSubTab === 'po_readonly'
                ? 'bg-[#FF6B00] text-black shadow-md shadow-[#FF6B00]/20'
                : 'bg-slate-100 dark:bg-white/[0.05] text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-white/[0.08]'
            }`}
          >
            <Package className="w-4 h-4" />
            <span>ตรวจใบสั่งซื้อ PO ({summary.poCount})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveSubTab('doa_readonly')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
              activeSubTab === 'doa_readonly'
                ? 'bg-[#FF6B00] text-black shadow-md shadow-[#FF6B00]/20'
                : 'bg-slate-100 dark:bg-white/[0.05] text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-white/[0.08]'
            }`}
          >
            <ShieldAlert className="w-4 h-4" />
            <span>ตรวจรายการเคลม DOA ({summary.doaCount})</span>
          </button>
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="liquid-glass-card rounded-2xl p-4 border border-amber-500/20">
          <div className="text-[11px] text-slate-500 dark:text-slate-400">รอวางบิล / ออกใบกำกับ</div>
          <div className="text-2xl font-extrabold text-amber-600 dark:text-amber-400 font-mono mt-1">{summary.readyCount}</div>
        </div>
        <div className="liquid-glass-card rounded-2xl p-4 border border-emerald-500/20">
          <div className="text-[11px] text-slate-500 dark:text-slate-400">วางบิล / ออกใบกำกับแล้ว</div>
          <div className="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400 font-mono mt-1">{summary.billedCount}</div>
        </div>
        <div className="liquid-glass-card rounded-2xl p-4 border border-sky-500/20">
          <div className="text-[11px] text-slate-500 dark:text-slate-400">ใบสั่งซื้อ PO ทั้งหมด</div>
          <div className="text-2xl font-extrabold text-sky-600 dark:text-sky-400 font-mono mt-1">{summary.poCount}</div>
        </div>
        <div className="liquid-glass-card rounded-2xl p-4 border border-rose-500/20">
          <div className="text-[11px] text-slate-500 dark:text-slate-400">รายการแจ้งเคลม DOA</div>
          <div className="text-2xl font-extrabold text-rose-600 dark:text-rose-400 font-mono mt-1">{summary.doaCount}</div>
        </div>
      </div>

      {/* TAB 1: BILLING QUEUE */}
      {activeSubTab === 'billing' && (
        <div className="space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2.5 p-3 rounded-2xl bg-slate-100/80 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-bold text-slate-600 dark:text-slate-400 mr-1">ประเภทบิล:</span>
              {([
                { id: 'all', label: 'ทั้งหมด' },
                { id: 'sales', label: 'ขาย' },
                { id: 'internet_rental', label: 'เช่าเน็ต' },
                { id: 'system_rental', label: 'เช่าระบบ' },
                { id: 'equipment_rental', label: 'เช่าอุปกรณ์' },
                { id: 'ma', label: 'ดูแลระบบ MA' },
                { id: 'addon', label: 'นอกสัญญา / เพิ่มเติม' }
              ] as const).map(t => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setBillingTypeFilter(t.id)}
                  className={`px-2.5 py-1 rounded-xl text-[11px] font-bold transition cursor-pointer ${
                    billingTypeFilter === t.id
                      ? 'bg-[#FF6B00] text-black shadow-sm'
                      : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-bold text-slate-600 dark:text-slate-400 mr-1">สถานะชำระเงิน:</span>
              {([
                { id: 'ready', label: 'รอวางบิล / รอชำระ' },
                { id: 'billed', label: 'วางบิล / ชำระแล้ว' },
                { id: 'all', label: 'ทั้งหมด' }
              ] as const).map(f => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setBillingFilter(f.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                    billingFilter === f.id
                      ? 'bg-slate-900 dark:bg-white text-white dark:text-black'
                      : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
                  }`}
                >
                  {f.label}
                </button>
              ))}
              <button
                type="button"
                onClick={handleExportBillingCsv}
                disabled={billingOrders.length + billingProjects.length === 0}
                title="ส่งออกข้อมูลบิลขาย/โปรเจกต์ แยกยอดก่อน VAT + VAT 7% + ต้นทุน เพื่อนำไปลงโปรแกรมบัญชี"
                className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-xs font-bold transition cursor-pointer flex items-center gap-1.5 shadow-sm"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export CSV ลงบัญชี</span>
              </button>
            </div>
          </div>

          {/* Projects Section */}
          {billingProjects.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-purple-600 dark:text-purple-400 flex items-center gap-1.5">
                <Building2 className="w-4 h-4" />
                <span>งานโปรเจกต์ / ติดตั้ง (PRJ) — {billingProjects.length} โครงการ</span>
              </h3>
              <ListControls
                from={billingProjectsList.from}
                to={billingProjectsList.to}
                total={billingProjectsList.total}
                page={billingProjectsList.page}
                totalPages={billingProjectsList.totalPages}
                pageSize={billingProjectsList.pageSize}
                sort={billingProjectsList.sort}
                onSortChange={billingProjectsList.setSort}
                onPageSizeChange={billingProjectsList.setPageSize}
                onPageChange={billingProjectsList.setPage}
                pageSizeOptions={[10, 20, 30]}
                unit="โครงการ"
              />
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {billingProjectsList.pageItems.map(prj => {
                  const prjFin = computeProjectFinancials(prj, stockPOs);
                  const baseRev = prjFin.baseTotal;
                  const addonRev = prjFin.addonTotal;
                  const totalCost = prjFin.totalCost;
                  const netGp = prjFin.gp;
                  const evidencePhotos = Array.from(
                    new Set([
                      ...(prj.handover_photo_urls || []),
                      ...prj.daily_logs.flatMap(d => d.photo_urls || [])
                    ])
                  );

                  return (
                    <div
                      key={prj.id}
                      className="bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm space-y-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono font-extrabold text-xs text-purple-700 dark:text-purple-300">{prj.id}</span>
                            {prj.billing_status === 'billed' ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30">
                                วางบิลแล้ว {prj.tax_invoice_no ? `(${prj.tax_invoice_no})` : ''}
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30">
                                รอวางบิล ({prj.status})
                              </span>
                            )}
                          </div>
                          <div className="text-sm font-bold text-slate-900 dark:text-white mt-1">{prj.site_name}</div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400">
                            ลูกค้า: {prj.customer_name} • เจ้าของโครงการ: {prj.created_by}
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                        <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700">
                          <div className="text-[10px] text-slate-500">ยอดหลัก</div>
                          <div className="font-mono font-bold">฿{fmt(baseRev)}</div>
                        </div>
                        <div className="p-2 rounded-xl bg-purple-50 dark:bg-purple-500/10 border border-purple-200 dark:border-purple-500/20">
                          <div className="text-[10px] text-purple-600 dark:text-purple-300">ยอดแอดเพิ่ม</div>
                          <div className="font-mono font-bold text-purple-700 dark:text-purple-300">+฿{fmt(addonRev)}</div>
                        </div>
                        <div className="p-2 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20">
                          <div className="text-[10px] text-amber-700 dark:text-amber-300">ต้นทุน PO/วัสดุ</div>
                          <div className="font-mono font-bold text-amber-700 dark:text-amber-300">฿{fmt(totalCost)}</div>
                        </div>
                        <div className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20">
                          <div className="text-[10px] text-emerald-700 dark:text-emerald-300">กำไรสุทธิ (GP)</div>
                          <div className="font-mono font-extrabold text-emerald-700 dark:text-emerald-300">฿{fmt(netGp)}</div>
                        </div>
                      </div>

                      {evidencePhotos.length > 0 && (
                        <div>
                          <div className="text-[10px] font-bold text-slate-500 dark:text-slate-400 mb-1">
                            รูปหลักฐานส่งมอบงาน ({evidencePhotos.length} รูป):
                          </div>
                          <EvidencePhotoUploader
                            value={evidencePhotos}
                            onChange={() => {}}
                            editable={false}
                            folder="onsite"
                          />
                        </div>
                      )}

                      <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                        {(prj.batches || []).map((b) => (
                          <button
                            key={b.id}
                            type="button"
                            onClick={() => setPrintTarget({ project: prj, initialBatchNo: b.batch_no })}
                            className="px-2.5 py-2 rounded-xl bg-[#FF6B00]/15 hover:bg-[#FF6B00]/25 text-[#C2410C] dark:text-[#FF6B00] border border-[#FF6B00]/30 text-xs font-bold cursor-pointer flex items-center gap-1"
                          >
                            <Printer className="w-3 h-3" />
                            <span>พิมพ์บิล งวดที่ {b.batch_no}</span>
                          </button>
                        ))}
                        <button
                          type="button"
                          onClick={() => setPrintTarget({ project: prj })}
                          className="px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-white border border-slate-300 dark:border-slate-600 text-xs font-bold cursor-pointer flex items-center gap-1.5"
                        >
                          <Printer className="w-3.5 h-3.5 text-[#FF6B00]" />
                          <span>พิมพ์ ORDER FORM 2026</span>
                        </button>
                        {prj.billing_status !== 'billed' && (
                          <button
                            type="button"
                            onClick={() => {
                              setTaxInvoiceInput('');
                              setTaxModalTarget({ type: 'project', id: prj.id, label: `${prj.id} — ${prj.site_name}` });
                            }}
                            className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-extrabold cursor-pointer flex items-center gap-1.5 shadow-sm"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>วางบิล / ออกใบกำกับภาษีแล้ว</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Orders Section */}
          <div className="space-y-3">
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-[#FF6B00] flex items-center gap-1.5">
              <TrendingUp className="w-4 h-4" />
              <span>บิลขายสินค้า / ติดตั้ง (ORD) — {billingOrders.length} รายการ</span>
            </h3>
            {billingOrders.length === 0 ? (
              <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-2xl p-8 text-center text-xs text-slate-500">
                ไม่มีรายการบิลขายในหมวดนี้
              </div>
            ) : (
              <>
                <ListControls
                  from={billingOrdersList.from}
                  to={billingOrdersList.to}
                  total={billingOrdersList.total}
                  page={billingOrdersList.page}
                  totalPages={billingOrdersList.totalPages}
                  pageSize={billingOrdersList.pageSize}
                  sort={billingOrdersList.sort}
                  onSortChange={billingOrdersList.setSort}
                  onPageSizeChange={billingOrdersList.setPageSize}
                  onPageChange={billingOrdersList.setPage}
                  pageSizeOptions={[10, 20, 30]}
                  unit="รายการ"
                />
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                  {billingOrdersList.pageItems.map(ord => {
                  const totalRev = (ord.items_list || []).reduce((s, i) => s + (i.unit_price || 0) * (i.quantity || 0), 0);
                  const totalCost =
                    (ord.items_list || []).reduce((s, i) => s + (i.unit_cost || 0) * (i.quantity || 0), 0) +
                    (ord.extra_cost || 0);
                  const netGp = totalRev - totalCost;
                  const orderPhotos = Array.from(
                    new Set(
                      items
                        .filter(i => i.order_id === ord.id)
                        .flatMap(i => i.photo_urls || [])
                    )
                  );

                  return (
                    <div
                      key={ord.id}
                      className="bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm space-y-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono font-extrabold text-xs text-[#FF6B00]">
                              {ord.bill_no || ord.sales_ref || ord.id}
                            </span>
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${BILLING_BADGE_META[getOrderBillingBadgeKey(ord)].cls}`}>
                              {BILLING_BADGE_META[getOrderBillingBadgeKey(ord)].label}
                            </span>
                            {ord.billing_period && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-slate-100 text-slate-800 border border-slate-300 dark:bg-white/[0.06] dark:text-slate-200 dark:border-white/[0.12]">
                                งวด {ord.billing_period}
                              </span>
                            )}
                            {ord.billing_status === 'billed' ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30">
                                วางบิลแล้ว {ord.tax_invoice_no ? `(${ord.tax_invoice_no})` : ''}
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30">
                                รอวางบิล
                              </span>
                            )}
                          </div>
                          <div className="text-sm font-bold text-slate-900 dark:text-white mt-1">{ord.customer_name}</div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400">
                            Sale: {ord.salesperson || ord.created_by || '-'} • {formatThaiDateTime(ord.created_at)}
                            {ord.due_date ? ` • ครบกำหนด ${ord.due_date}` : ''}
                          </div>
                        </div>
                        {orderPhotos.length > 0 && (
                          <button
                            type="button"
                            onClick={() => setPhotoPreviewUrls(orderPhotos)}
                            className="px-2.5 py-1 rounded-lg bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-300 text-[10px] font-bold flex items-center gap-1 cursor-pointer"
                          >
                            <Eye className="w-3 h-3" />
                            <span>รูปปิดงาน ({orderPhotos.length})</span>
                          </button>
                        )}
                      </div>

                      <div className="grid grid-cols-3 gap-2 text-xs">
                        <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700">
                          <div className="text-[10px] text-slate-500">ยอดขาย</div>
                          <div className="font-mono font-bold">฿{fmt(totalRev)}</div>
                        </div>
                        <div className="p-2 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20">
                          <div className="text-[10px] text-amber-700 dark:text-amber-300">ต้นทุนรวม</div>
                          <div className="font-mono font-bold text-amber-700 dark:text-amber-300">฿{fmt(totalCost)}</div>
                        </div>
                        <div className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20">
                          <div className="text-[10px] text-emerald-700 dark:text-emerald-300">กำไรสุทธิ (GP)</div>
                          <div className="font-mono font-extrabold text-emerald-700 dark:text-emerald-300">฿{fmt(netGp)}</div>
                        </div>
                      </div>

                      {/* ข้อมูลสำหรับลงโปรแกรมบัญชี (แยก VAT 7% และสรุปรายการ) */}
                      <div className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.06] text-[11px] text-slate-600 dark:text-slate-300 space-y-1">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span>
                            ก่อน VAT: <strong className="font-mono">฿{(totalRev / 1.07).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                            {' • '}
                            VAT 7%: <strong className="font-mono">฿{(totalRev - totalRev / 1.07).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                          </span>
                          {ord.customer_phone && <span className="font-mono text-slate-500 dark:text-slate-400">โทร: {ord.customer_phone}</span>}
                        </div>
                        <div className="truncate text-[10px] text-slate-500 dark:text-slate-400">
                          รายการ: {(ord.items_list || []).map(i => `${i.model_name} ×${i.quantity}`).join(', ') || '-'}
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                        <button
                          type="button"
                          onClick={() => setPrintTarget({ order: ord })}
                          className="px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-white border border-slate-300 dark:border-slate-600 text-xs font-bold cursor-pointer flex items-center gap-1.5"
                        >
                          <Printer className="w-3.5 h-3.5 text-[#FF6B00]" />
                          <span>พิมพ์ ORDER FORM 2026</span>
                        </button>
                        {ord.billing_status !== 'billed' && (
                          <button
                            type="button"
                            onClick={() => {
                              setTaxInvoiceInput('');
                              setTaxModalTarget({
                                type: 'order',
                                id: ord.id,
                                label: `${ord.bill_no || ord.sales_ref || ord.id} — ${ord.customer_name}`
                              });
                            }}
                            className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-extrabold cursor-pointer flex items-center gap-1.5 shadow-sm"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>วางบิล / ออกใบกำกับภาษีแล้ว</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: READ-ONLY PO INSPECTION */}
      {activeSubTab === 'po_readonly' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-3 overflow-x-auto">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">รายการใบสั่งซื้อ PO (อ่านอย่างเดียว)</h3>
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-slate-500">ทั้งหมด {stockPOs.length} รายการ</span>
              <button
                type="button"
                onClick={handleExportPoCsv}
                disabled={stockPOs.length === 0}
                className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-xs font-bold transition cursor-pointer flex items-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export CSV PO</span>
              </button>
            </div>
          </div>
          <ListControls
            from={poList.from}
            to={poList.to}
            total={poList.total}
            page={poList.page}
            totalPages={poList.totalPages}
            pageSize={poList.pageSize}
            sort={poList.sort}
            onSortChange={poList.setSort}
            onPageSizeChange={poList.setPageSize}
            onPageChange={poList.setPage}
            pageSizeOptions={[15, 30, 50]}
            unit="รายการ"
          />
          {/* Mobile Cards (< md) */}
          <div className="md:hidden space-y-2.5">
            {poList.pageItems.map(po => (
              <div key={po.id} className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 space-y-2 text-xs">
                <div className="flex items-start justify-between gap-2">
                  <span className="font-mono font-bold text-sm text-[#FF6B00]">{po.po_number}</span>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold flex-shrink-0 ${
                    po.status === 'received'
                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300'
                      : po.status === 'cancelled'
                        ? 'bg-rose-100 text-rose-800 dark:bg-rose-500/15 dark:text-rose-300'
                        : 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300'
                  }`}>
                    {po.status === 'received' ? 'รับเข้าคลังแล้ว' : po.status === 'cancelled' ? 'ยกเลิก' : 'รอของเข้า'}
                  </span>
                </div>
                <div className="font-bold text-sm text-slate-900 dark:text-white">{po.product_name}</div>
                <div className="text-slate-600 dark:text-slate-400">
                  Supplier: <span className="font-medium text-slate-800 dark:text-slate-200">{po.supplier}</span>
                  {po.project_id && (
                    <span className="ml-2 font-mono text-purple-600 dark:text-purple-400">• {po.project_id}</span>
                  )}
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-slate-200 dark:border-slate-700/70">
                  <span className="text-slate-500 dark:text-slate-400">จำนวน: <strong className="font-mono text-slate-900 dark:text-white">{po.qty}</strong></span>
                  <span className="font-mono font-extrabold text-sm text-slate-900 dark:text-white">฿{fmt(po.qty * po.unit_cost)}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop Table (>= md) */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100 dark:bg-white/[0.04] text-slate-600 dark:text-slate-300">
                <tr>
                  <th className="py-2.5 px-3">เลข PO</th>
                  <th className="py-2.5 px-3">สินค้า</th>
                  <th className="py-2.5 px-3">Supplier</th>
                  <th className="py-2.5 px-3 text-center">จำนวน</th>
                  <th className="py-2.5 px-3 text-right">รวมต้นทุน</th>
                  <th className="py-2.5 px-3">โปรเจกต์</th>
                  <th className="py-2.5 px-3">สถานะ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {poList.pageItems.map(po => (
                  <tr key={po.id} className="hover:bg-slate-50 dark:hover:bg-white/[0.02]">
                    <td className="py-2.5 px-3 font-mono font-bold text-[#FF6B00]">{po.po_number}</td>
                    <td className="py-2.5 px-3 font-semibold">{po.product_name}</td>
                    <td className="py-2.5 px-3">{po.supplier}</td>
                    <td className="py-2.5 px-3 text-center font-mono">{po.qty}</td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold">฿{fmt(po.qty * po.unit_cost)}</td>
                    <td className="py-2.5 px-3 font-mono text-purple-600 dark:text-purple-400">{po.project_id || '-'}</td>
                    <td className="py-2.5 px-3">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        po.status === 'received'
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300'
                          : po.status === 'cancelled'
                            ? 'bg-rose-100 text-rose-800 dark:bg-rose-500/15 dark:text-rose-300'
                            : 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300'
                      }`}>
                        {po.status === 'received' ? 'รับเข้าคลังแล้ว' : po.status === 'cancelled' ? 'ยกเลิก' : 'รอของเข้า'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: READ-ONLY DOA INSPECTION */}
      {activeSubTab === 'doa_readonly' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-3">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-500" />
            <span>รายการแจ้งเคลมสินค้าเสีย DOA (อ่านอย่างเดียว)</span>
          </h3>
          {doaItems.length === 0 ? (
            <div className="text-center py-8 text-xs text-slate-500">ไม่มีรายการแจ้งเคลม DOA</div>
          ) : (
            <>
              <ListControls
                from={doaList.from}
                to={doaList.to}
                total={doaList.total}
                page={doaList.page}
                totalPages={doaList.totalPages}
                pageSize={doaList.pageSize}
                sort={doaList.sort}
                onSortChange={doaList.setSort}
                onPageSizeChange={doaList.setPageSize}
                onPageChange={doaList.setPage}
                pageSizeOptions={[12, 24, 48]}
                unit="รายการ"
              />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {doaList.pageItems.map(it => (
                <div key={it.id} className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-[#FF6B00]">{it.serial_number}</span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 dark:bg-rose-500/15 dark:text-rose-300">
                      {it.status}
                    </span>
                  </div>
                  <div className="font-bold">{it.model_name}</div>
                  <div className="text-slate-500 dark:text-slate-400">อาการ: {it.doa_reason || '-'}</div>
                  {it.photo_urls && it.photo_urls.length > 0 && (
                    <EvidencePhotoUploader
                      value={it.photo_urls}
                      onChange={() => {}}
                      editable={false}
                      folder="doa"
                    />
                  )}
                </div>
              ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* Tax Invoice / Billing Confirmation Modal */}
      {taxModalTarget && createPortal(
        <div
          className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6 animate-fade-in"
          onClick={() => setTaxModalTarget(null)}
        >
          <form
            onSubmit={handleConfirmBilled}
            onClick={(e) => e.stopPropagation()}
            className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-700 rounded-3xl w-full max-w-md p-5 shadow-2xl space-y-4 animate-modal-pop"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-extrabold">ยืนยันวางบิล / ออกใบกำกับภาษี</h3>
              <button
                type="button"
                onClick={() => setTaxModalTarget(null)}
                className="p-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800 text-xs font-semibold">
              {taxModalTarget.label}
            </div>
            <div>
              <label className="block text-xs font-bold mb-1">เลขที่ใบกำกับภาษี / เลขที่วางบิล (ถ้ามี)</label>
              <input
                type="text"
                value={taxInvoiceInput}
                onChange={(e) => setTaxInvoiceInput(e.target.value)}
                placeholder="เช่น IV-2026-0012"
                className="w-full rounded-xl px-3 py-2.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700"
              />
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setTaxModalTarget(null)}
                className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold cursor-pointer"
              >
                ยกเลิก
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-extrabold cursor-pointer flex items-center gap-1.5"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>บันทึกวางบิลแล้ว</span>
              </button>
            </div>
          </form>
        </div>,
        document.body
      )}

      {/* Photo Preview Modal for Order Photos */}
      {photoPreviewUrls && createPortal(
        <div
          className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6 animate-fade-in"
          onClick={() => setPhotoPreviewUrls(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-700 rounded-3xl w-full max-w-lg p-5 shadow-2xl space-y-3 animate-modal-pop"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-extrabold">รูปหลักฐานปิดงาน</h3>
              <button
                type="button"
                onClick={() => setPhotoPreviewUrls(null)}
                className="p-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <EvidencePhotoUploader
              value={photoPreviewUrls}
              onChange={() => {}}
              editable={false}
              folder="onsite"
            />
          </div>
        </div>,
        document.body
      )}

      {/* ORDER FORM 2026 Print Modal */}
      <OrderFormPrintModal
        isOpen={!!printTarget}
        onClose={() => setPrintTarget(null)}
        order={printTarget?.order}
        project={printTarget?.project}
        initialBatchNo={printTarget?.initialBatchNo ?? null}
      />
    </div>
  );
};
