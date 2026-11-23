import React, { useMemo, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Printer, X, CheckSquare, Square } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Order, Project, formatDateDMY, formatWarrantyDuration } from '../types';
import { thaiBahtText } from '../utils/thaiBahtText';
import companyLogo from '../assets/BossCom.jpg';
import { PrintGuideButton } from './PrintGuideButton';

interface OrderFormPrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  order?: Order | null;
  project?: Project | null;
  initialBatchNo?: number | null;
}

interface PrintLineItem {
  description: string;
  warranty: string;
  unitPrice: number;
  qty: number;
  amount: number;
}

const fmt2 = (n: number) =>
  n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const OrderFormPrintModal: React.FC<OrderFormPrintModalProps> = ({
  isOpen,
  onClose,
  order,
  project,
  initialBatchNo = null
}) => {
  const { items } = useApp();

  const [selectedBatchNo, setSelectedBatchNo] = useState<number | null>(initialBatchNo);

  const [includeVat, setIncludeVat] = useState<boolean>(false);
  const [taxId, setTaxId] = useState<string>('');
  const [specialCase, setSpecialCase] = useState<string>('');
  const [outsourceName, setOutsourceName] = useState<string>('');
  const [contactName, setContactName] = useState<string>('');
  const [callToSchedule, setCallToSchedule] = useState<boolean>(true);
  const [creditDays, setCreditDays] = useState<string>('30');
  const [paymentChoice, setPaymentChoice] = useState<'credit' | 'billing' | 'cash' | 'transfer' | 'project'>('cash');
  const [deliveryChoice, setDeliveryChoice] = useState<'install' | 'drop_off' | 'pickup'>('install');
  const [warrantyCheck, setWarrantyCheck] = useState<'in_warranty' | 'out_warranty'>('in_warranty');
  const [notesText, setNotesText] = useState<string>('');

  useEffect(() => {
    if (!isOpen) return;
    if (project) {
      setSelectedBatchNo(initialBatchNo ?? null);
      setIncludeVat(true);
      setPaymentChoice('project');
      setDeliveryChoice('install');
      setContactName(project.customer_name || '');
      const hasWarranty = (project.items || []).some(it => (it.warranty_years || 0) > 0);
      setWarrantyCheck(hasWarranty ? 'in_warranty' : 'out_warranty');
      const baseNotes = [
        project.site_name ? `หน้างาน: ${project.site_name}` : '',
        project.location ? `จุดติดตั้ง: ${project.location}` : '',
        project.handover_note || '',
        'เช็กลิสต์ส่งมอบ: ถ่ายรูป ใบกำกับภาษี / ใบเสร็จรับเงิน / รูปงานติดตั้งพนักงาน'
      ]
        .filter(Boolean)
        .join(' | ');
      setNotesText(baseNotes);
    } else if (order) {
      setIncludeVat(order.bill_type === 'tax_invoice');
      setPaymentChoice(
        order.payment_term === 'project'
          ? 'project'
          : order.payment_term === 'credit_30'
            ? 'credit'
            : 'cash'
      );
      setDeliveryChoice(
        order.delivery_mode === 'customer_pickup'
          ? 'pickup'
          : order.delivery_mode === 'drop_off'
            ? 'drop_off'
            : 'install'
      );
      setContactName(order.customer_name || '');
      const hasWarranty = (order.items_list || []).some(
        it => (it.warranty_years || 0) > 0 || (it.warranty_months || 0) > 0
      );
      setWarrantyCheck(hasWarranty ? 'in_warranty' : 'out_warranty');
      const baseNotes = [
        order.site_notes || '',
        order.delivery_location ? `สถานที่ส่งมอบ: ${order.delivery_location}` : '',
        'เช็กลิสต์ส่งมอบ: ถ่ายรูป ใบกำกับภาษี / ใบเสร็จรับเงิน / รูปงานติดตั้งพนักงาน'
      ]
        .filter(Boolean)
        .join(' | ');
      setNotesText(baseNotes);
    }
  }, [isOpen, order, project]);

  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // Automatically force A4 Portrait @page size in the browser print dialog
    // so users never have to switch paper size from A5 Landscape manually.
    const styleEl = document.createElement('style');
    styleEl.id = 'order-form-a4-page-override';
    styleEl.textContent = '@media print { @page { size: A4 portrait; margin: 6mm 8mm; } }';
    document.head.appendChild(styleEl);

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      styleEl.remove();
      window.removeEventListener('keydown', onKey);
    };
  }, [isOpen, onClose]);

  const activeBatch = useMemo(() => {
    if (!project || selectedBatchNo == null) return null;
    return (project.batches || []).find(b => b.batch_no === selectedBatchNo) || null;
  }, [project, selectedBatchNo]);

  const lineItems: PrintLineItem[] = useMemo(() => {
    if (project) {
      if (activeBatch) {
        return activeBatch.items.map(bi => {
          const matchedPrjItem = (project.items || []).find(pi => pi.id === bi.project_item_id);
          const unitPrice = matchedPrjItem?.unit_price || 0;
          const warrantyYears = matchedPrjItem?.warranty_years || 0;
          const addonLabel = matchedPrjItem?.is_addon ? ` [Add-on โดย ${matchedPrjItem.added_by || '-'}]` : '';
          return {
            description: `${bi.model_name}${addonLabel} (งวดที่ ${activeBatch.batch_no})`,
            warranty: warrantyYears > 0 ? `${warrantyYears} ปี` : '-',
            unitPrice,
            qty: bi.qty || 0,
            amount: unitPrice * (bi.qty || 0)
          };
        });
      }
      return (project.items || []).map(it => ({
        description: `${it.model_name}${it.is_addon ? ` [Add-on โดย ${it.added_by || '-'}]` : ''}`,
        warranty: it.warranty_years && it.warranty_years > 0 ? `${it.warranty_years} ปี` : '-',
        unitPrice: it.unit_price || 0,
        qty: it.qty_required || 0,
        amount: (it.unit_price || 0) * (it.qty_required || 0)
      }));
    }
    if (order) {
      if (order.items_list && order.items_list.length > 0) {
        return order.items_list.map(it => ({
          description: it.model_name,
          warranty: formatWarrantyDuration(it.warranty_years, it.warranty_months).replace('ประกัน ', '') || '-',
          unitPrice: it.unit_price || 0,
          qty: it.quantity || 0,
          amount: (it.unit_price || 0) * (it.quantity || 0)
        }));
      }
      if (order._planned_model) {
        return [
          {
            description: order._planned_model,
            warranty: '-',
            unitPrice: 0,
            qty: order._planned_quantity || 1,
            amount: 0
          }
        ];
      }
    }
    return [];
  }, [order, project]);

  const linkedSerialNumbers = useMemo(() => {
    if (project) {
      const fromItems = items
        .filter(
          i =>
            i.project_id === project.id &&
            (activeBatch ? i.project_batch_no === activeBatch.batch_no : true) &&
            i.serial_number &&
            i.serial_number !== 'SERVICE-NO-SN'
        )
        .map(i => i.serial_number);
      const fromProject = activeBatch
        ? []
        : (project.items || []).flatMap(pi => pi.serial_numbers || []);
      return Array.from(new Set([...fromItems, ...fromProject])).slice(0, 6).join(', ');
    }
    if (order) {
      return Array.from(
        new Set(
          items
            .filter(i => i.order_id === order.id && i.serial_number && i.serial_number !== 'SERVICE-NO-SN')
            .map(i => i.serial_number)
        )
      )
        .slice(0, 6)
        .join(', ');
    }
    return '';
  }, [items, order, project]);

  if (!isOpen || (!order && !project)) return null;

  const subtotal = lineItems.reduce((sum, r) => sum + r.amount, 0);
  const vatAmount = includeVat ? subtotal * 0.07 : 0;
  const grandTotal = subtotal + vatAmount;
  const thaiText = thaiBahtText(grandTotal);

  const isProjectDoc = !!project || order?.payment_term === 'project' || order?.delivery_mode === 'project';
  const isInstallDoc = isProjectDoc || order?.delivery_mode === 'install';
  const isSaleDoc = !isProjectDoc && !!order;

  const docNo = project
    ? (activeBatch ? `${project.id} (งวดที่ ${activeBatch.batch_no})` : project.id)
    : order?.bill_no || order?.sales_ref || order?.id || '-';
  const openDate = project
    ? formatDateDMY(activeBatch ? activeBatch.released_at : (project.start_date || project.created_at))
    : formatDateDMY(order?.created_at);
  const dueDate = project
    ? formatDateDMY(project.due_date)
    : formatDateDMY(order?.delivery_date);
  const customerName = project ? project.customer_name : order?.customer_name || '-';
  const customerPhone = project ? project.phone : order?.customer_phone || '-';
  const customerLocation = project
    ? `${project.site_name} — ${project.location}`
    : order?.delivery_location || '-';
  const salesName = project ? project.created_by : order?.salesperson || order?.created_by || '-';
  const printedToday = formatDateDMY(new Date().toISOString());

  const ITEMS_PER_PAGE = 10;
  const MIN_ROWS = 9;
  const pages: { items: PrintLineItem[]; startIndex: number }[] = [];
  if (lineItems.length === 0) {
    pages.push({ items: [], startIndex: 0 });
  } else {
    for (let i = 0; i < lineItems.length; i += ITEMS_PER_PAGE) {
      pages.push({ items: lineItems.slice(i, i + ITEMS_PER_PAGE), startIndex: i });
    }
  }
  const totalPages = pages.length;

  const CheckBox = ({ checked, label }: { checked: boolean; label: string }) => (
    <span className="inline-flex items-center gap-1 mr-2.5 whitespace-nowrap">
      <span className="inline-flex items-center justify-center w-3.5 h-3.5 border border-black text-[9px] font-bold leading-none">
        {checked ? '✓' : ''}
      </span>
      <span>{label}</span>
    </span>
  );

  return createPortal(
    <div
      className="order-form-print-portal fixed inset-0 z-[10000] bg-black/70 backdrop-blur-sm flex flex-col items-center justify-start overflow-y-auto overscroll-contain p-2 sm:p-5 animate-fade-in"
      onClick={onClose}
    >
      {/* Top Interactive Controls (hidden during print) */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="no-print w-full max-w-[210mm] mb-3 bg-white dark:bg-slate-900 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-700 rounded-2xl p-3.5 shadow-2xl space-y-3"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Printer className="w-5 h-5 text-[#FF6B00] shrink-0" />
            <div className="min-w-0">
              <h3 className="text-sm font-extrabold truncate">ตัวอย่างก่อนพิมพ์ — ORDER FORM 2026</h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                ปรับตั้งค่า VAT, เงื่อนไขชำระเงิน หรือหมายเหตุก่อนสั่งพิมพ์
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap sm:flex-nowrap shrink-0">
            <PrintGuideButton docType="order_form" />
            {project && project.batches && project.batches.length > 0 && (
              <select
                value={selectedBatchNo ?? ''}
                onChange={(e) => setSelectedBatchNo(e.target.value ? Number(e.target.value) : null)}
                aria-label="เลือกงวดเบิกที่ต้องการพิมพ์"
                className="px-2.5 py-1.5 rounded-xl text-xs font-bold bg-purple-50 text-purple-900 border border-purple-300 dark:bg-purple-500/20 dark:text-purple-200 dark:border-purple-500/40 cursor-pointer focus:outline-none whitespace-nowrap"
              >
                <option value="" className="bg-white dark:bg-slate-900">ทั้งโครงการ ({project.items.length} รายการ)</option>
                {project.batches.map((b) => (
                  <option key={b.id} value={b.batch_no} className="bg-white dark:bg-slate-900">
                    เฉพาะงวดที่ {b.batch_no} ({b.items.length} รายการ)
                  </option>
                ))}
              </select>
            )}
            <button
              type="button"
              onClick={() => setIncludeVat(v => !v)}
              className={`px-2.5 py-1.5 rounded-xl text-xs font-bold border transition cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                includeVat
                  ? 'bg-emerald-100 text-emerald-900 border-emerald-400 dark:bg-emerald-500/20 dark:text-emerald-300 dark:border-emerald-500/40'
                  : 'bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'
              }`}
            >
              {includeVat ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
              <span>{includeVat ? 'คิด VAT 7%' : 'ไม่คิด VAT 7%'}</span>
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-[#FF6B00] to-[#E65A00] hover:from-[#FF8A24] text-black font-extrabold text-xs shadow-lg shadow-[#FF6B00]/25 cursor-pointer flex items-center gap-1.5 whitespace-nowrap"
            >
              <Printer className="w-4 h-4" />
              <span>พิมพ์ใบสั่งงาน</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="ปิดหน้าต่างพิมพ์"
              className="p-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white cursor-pointer shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Quick Pre-Print Field Overrides */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs pt-2 border-t border-slate-200 dark:border-slate-800">
          <div>
            <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 mb-0.5">เลขผู้เสียภาษี (TAX ID)</label>
            <input
              type="text"
              value={taxId}
              onChange={(e) => setTaxId(e.target.value)}
              placeholder="0123456789012"
              className="w-full rounded-lg px-2.5 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700"
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 mb-0.5">CASE พิเศษ (ถ้ามี)</label>
            <input
              type="text"
              value={specialCase}
              onChange={(e) => setSpecialCase(e.target.value)}
              placeholder="เช่น ส่งด่วนพิเศษ / ติดตั้งนอกเวลา"
              className="w-full rounded-lg px-2.5 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700"
            />
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            <div>
              <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 mb-0.5">OUTSOURCE (ถ้ามี)</label>
              <input
                type="text"
                value={outsourceName}
                onChange={(e) => setOutsourceName(e.target.value)}
                placeholder="ชื่อทีมช่างนอก"
                className="w-full rounded-lg px-2 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 mb-0.5">เครดิต (วัน)</label>
              <input
                type="text"
                value={creditDays}
                onChange={(e) => setCreditDays(e.target.value)}
                placeholder="30"
                className="w-full rounded-lg px-2 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700"
              />
            </div>
          </div>
          <div className="sm:col-span-2 flex items-end gap-2">
            <div className="flex-1">
              <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 mb-0.5">หมายเหตุ / จุดติดตั้ง / เช็กลิสต์เอกสาร</label>
              <input
                type="text"
                value={notesText}
                onChange={(e) => setNotesText(e.target.value)}
                className="w-full rounded-lg px-2.5 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700"
              />
            </div>
            <label className="inline-flex items-center gap-1.5 text-[11px] font-semibold pb-1.5 whitespace-nowrap cursor-pointer">
              <input
                type="checkbox"
                checked={callToSchedule}
                onChange={(e) => setCallToSchedule(e.target.checked)}
                className="accent-[#FF6B00]"
              />
              โทรนัดลูกค้า
            </label>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            <div>
              <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 mb-0.5">เงื่อนไขชำระเงิน</label>
              <select
                value={paymentChoice}
                onChange={(e) => setPaymentChoice(e.target.value as any)}
                className="w-full rounded-lg px-2 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700"
              >
                <option value="cash">เงินสด</option>
                <option value="transfer">โอน / มัดจำ</option>
                <option value="credit">เครดิต</option>
                <option value="billing">วางบิล / รับเช็ค</option>
                <option value="project">PROJECT</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 mb-0.5">การประกัน</label>
              <select
                value={warrantyCheck}
                onChange={(e) => setWarrantyCheck(e.target.value as any)}
                className="w-full rounded-lg px-2 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700"
              >
                <option value="in_warranty">ในประกัน</option>
                <option value="out_warranty">นอกประกัน/มีเงื่อนไข</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Printable A4 Portrait Sheets (Auto-Paginated) */}
      <div
        id="order-form-2026-print"
        onClick={(e) => e.stopPropagation()}
        className="w-[210mm] space-y-6 print:space-y-0 font-sans"
      >
        {pages.map((page, pageIdx) => {
          const isLastPage = pageIdx === totalPages - 1;
          const emptyRowsCount = isLastPage ? Math.max(0, (totalPages === 1 ? MIN_ROWS : 6) - page.items.length) : 0;

          return (
            <div
              key={pageIdx}
              className="order-form-page w-[210mm] min-h-[264mm] print:min-h-0 bg-white text-black p-[8mm] shadow-2xl border border-slate-300 print:border-none print:shadow-none text-[11px] leading-[1.3] flex flex-col justify-between"
            >
              <div>
                {/* TOP HEADER */}
        <div className="grid grid-cols-12 gap-2 pb-2 border-b-2 border-black">
          {/* Left Header */}
          <div className="col-span-7 flex flex-col justify-between space-y-1.5">
            <div className="font-bold text-[12px]">
              บริษัท บอส คอมพิวเทค แอนด์ เซอร์วิส จำกัด
            </div>
            <div className="text-[10px] text-black">
              289/2 ถนนตลาดใหม่ ต.ตลาด อ.เมือง จ.สุราษฎร์ธานี 84000 โทร. 077-286999
            </div>
            <div className="pt-1 flex flex-wrap gap-y-1 text-[10.5px]">
              <CheckBox checked={isInstallDoc} label="งานติดตั้ง / ระบบ" />
              <CheckBox checked={Boolean(order?.items_list?.some(it => it.item_type === 'service'))} label="งานบริการ / ซ่อม" />
              <CheckBox checked={isSaleDoc} label="ขายสินค้า" />
              <CheckBox checked={isProjectDoc} label="PROJECT" />
            </div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[10.5px] pt-1">
              <div className="border-b border-dotted border-black pb-0.5">
                <span className="font-bold">เลขที่สั่งซ่อม/อ้างอิง: </span>
                <span className="font-mono font-bold">{docNo}</span>
              </div>
              <div className="border-b border-dotted border-black pb-0.5">
                <span className="font-bold">วันที่รับ: </span>
                <span>{openDate}</span>
              </div>
              <div className="col-span-2 border-b border-dotted border-black pb-0.5">
                <span className="font-bold">วันที่ส่งมอบงาน (Due Date): </span>
                <span>{dueDate}</span>
              </div>
            </div>
          </div>

          {/* Right Header */}
          <div className="col-span-5 flex flex-col justify-between">
            <div className="flex items-center justify-between gap-2">
              <img
                src={companyLogo}
                alt="Boss Computech"
                className="w-12 h-12 rounded-full object-cover border border-black"
              />
              <div className="flex-1 border-2 border-black text-center py-1 px-2">
                <div className="font-extrabold text-[15px] tracking-wide">ORDER FORM 2026</div>
                <div className="text-[9.5px] font-bold">
                  ใบสั่งงาน / ใบส่งมอบสินค้า{totalPages > 1 ? ` (หน้า ${pageIdx + 1}/${totalPages})` : ''}
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[10px] mt-1.5">
              <div className="border-b border-dotted border-black pb-0.5">
                <span className="font-bold">เลขรับส่งซ่อม: </span>
                <span>{order?.sales_ref || '-'}</span>
              </div>
              <div className="border-b border-dotted border-black pb-0.5">
                <span className="font-bold">วันที่เปิดบิล: </span>
                <span>{openDate}</span>
              </div>
              <div className="col-span-2 pt-0.5">
                <CheckBox checked={warrantyCheck === 'in_warranty'} label="ในประกัน" />
                <CheckBox checked={warrantyCheck === 'out_warranty'} label="นอกประกัน/มีเงื่อนไข" />
              </div>
              <div className="col-span-2 border-b border-dotted border-black pb-0.5 truncate">
                <span className="font-bold">S/N: </span>
                <span className="font-mono text-[9.5px]">{linkedSerialNumbers || '-'}</span>
              </div>
              <div className="col-span-2 border-b border-dotted border-black pb-0.5">
                <span className="font-bold">ฝ่าย / ผู้รับเรื่อง: </span>
                <span>{salesName}</span>
              </div>
            </div>
          </div>
        </div>

        {/* CUSTOMER & CONTACT BLOCK */}
        <div className="border border-black mt-2 p-2 space-y-1 text-[10.5px]">
          <div className="grid grid-cols-12 gap-2">
            <div className="col-span-7 border-b border-dotted border-black pb-0.5">
              <span className="font-bold">ลูกค้า (Customer Name): </span>
              <span className="font-semibold">{customerName}</span>
            </div>
            <div className="col-span-5 border-b border-dotted border-black pb-0.5">
              <span className="font-bold">TAX ID: </span>
              <span className="font-mono">{taxId || '-'}</span>
            </div>
          </div>
          <div className="border-b border-dotted border-black pb-0.5">
            <span className="font-bold">ที่อยู่ / สาขา / สถานที่ติดตั้ง (Location): </span>
            <span>{customerLocation}</span>
          </div>
        </div>

        {/* MAIN LINE-ITEMS TABLE */}
        <table className="w-full border-collapse border border-black mt-2 text-[10.5px]">
          <thead>
            <tr className="bg-slate-100">
              <th className="border border-black py-1 px-1.5 w-[7%] text-center">ลำดับ</th>
              <th className="border border-black py-1 px-2 text-left">รายการ (Description / Equipment &amp; Services)</th>
              <th className="border border-black py-1 px-1.5 w-[13%] text-center">ประกัน</th>
              <th className="border border-black py-1 px-1.5 w-[14%] text-right">ราคา/หน่วย</th>
              <th className="border border-black py-1 px-1.5 w-[9%] text-center">จำนวน</th>
              <th className="border border-black py-1 px-1.5 w-[15%] text-right">ราคารวม</th>
            </tr>
          </thead>
          <tbody>
            {page.items.map((row, idx) => (
              <tr key={page.startIndex + idx}>
                <td className="border-x border-b border-black py-1 px-1.5 text-center">{page.startIndex + idx + 1}</td>
                <td className="border-x border-b border-black py-1 px-2">{row.description}</td>
                <td className="border-x border-b border-black py-1 px-1.5 text-center">{row.warranty}</td>
                <td className="border-x border-b border-black py-1 px-1.5 text-right font-mono">{fmt2(row.unitPrice)}</td>
                <td className="border-x border-b border-black py-1 px-1.5 text-center font-mono">{row.qty}</td>
                <td className="border-x border-b border-black py-1 px-1.5 text-right font-mono font-semibold">{fmt2(row.amount)}</td>
              </tr>
            ))}
            {Array.from({ length: emptyRowsCount }).map((_, idx) => (
              <tr key={`empty-${idx}`}>
                <td className="border-x border-b border-black py-1 px-1.5 text-center">&nbsp;</td>
                <td className="border-x border-b border-black py-1 px-2">&nbsp;</td>
                <td className="border-x border-b border-black py-1 px-1.5">&nbsp;</td>
                <td className="border-x border-b border-black py-1 px-1.5">&nbsp;</td>
                <td className="border-x border-b border-black py-1 px-1.5">&nbsp;</td>
                <td className="border-x border-b border-black py-1 px-1.5">&nbsp;</td>
              </tr>
            ))}
          </tbody>
        </table>
              </div>

              {!isLastPage ? (
                <div className="border border-black mt-2 p-3 flex items-center justify-between bg-slate-50 text-[10.5px]">
                  <span className="font-bold">หมายเหตุ: มีรายการสินค้า/บริการต่อในหน้าถัดไป (หน้า {pageIdx + 2}/{totalPages})</span>
                  <span className="font-mono font-bold">
                    รวมยอดหน้านี้: {fmt2(page.items.reduce((s, r) => s + r.amount, 0))} บาท
                  </span>
                </div>
              ) : (
                <div>

        {/* MID-LOWER BLOCK */}
        <div className="grid grid-cols-12 border-x border-b border-black text-[10px]">
          {/* Left conditions */}
          <div className="col-span-7 border-r border-black p-2 space-y-1.5">
            <div className="border-b border-dotted border-black pb-0.5">
              <CheckBox checked={!!specialCase.trim()} label="CASE พิเศษเนื่องจาก:" />
              <span>{specialCase || '________________________________'}</span>
            </div>
            <div className="border-b border-dotted border-black pb-0.5">
              <CheckBox checked={!!outsourceName.trim()} label="OUTSOURCE:" />
              <span>{outsourceName || '________________________________'}</span>
            </div>
            <div className="border-b border-dotted border-black pb-0.5">
              <CheckBox checked={callToSchedule} label="กรุณาโทรนัดลูกค้า" />
              <span className="font-bold">เบอร์: </span>
              <span className="mr-2">{customerPhone}</span>
              <span className="font-bold">ติดต่อคุณ: </span>
              <span>{contactName || customerName}</span>
            </div>
            <div className="pt-0.5">
              <CheckBox checked={deliveryChoice === 'install'} label="ส่งของพร้อมติดตั้ง" />
              <CheckBox checked={deliveryChoice === 'drop_off'} label="ส่งของไม่ต้องติดตั้ง" />
              <CheckBox checked={deliveryChoice === 'pickup'} label="รับเอง" />
            </div>
          </div>

          {/* Right financial totals */}
          <div className="col-span-5 flex flex-col justify-between">
            <div className="flex items-center justify-between px-2 py-1.5 border-b border-black">
              <span className="font-bold">รวมเงิน (Subtotal)</span>
              <span className="font-mono font-bold text-[11px]">{fmt2(subtotal)}</span>
            </div>
            <div className="flex items-center justify-between px-2 py-1.5 border-b border-black">
              <span className="font-bold">ภาษีมูลค่าเพิ่ม 7% (VAT 7%)</span>
              <span className="font-mono font-bold text-[11px]">{fmt2(vatAmount)}</span>
            </div>
            <div className="flex items-center justify-between px-2 py-2 bg-slate-100">
              <span className="font-extrabold text-[11px]">รวมสุทธิ (Grand Total)</span>
              <span className="font-mono font-extrabold text-[13px]">{fmt2(grandTotal)}</span>
            </div>
          </div>
        </div>

        {/* FULL-WIDTH THAI BAHT TEXT BAR */}
        <div className="border-x border-b border-black px-2 py-1.5 flex items-center justify-between bg-slate-50 text-[10.5px]">
          <div>
            <span className="font-bold">ตัวอักษร: </span>
            <span className="font-bold">( {thaiText} )</span>
          </div>
          <div className="font-mono font-extrabold">
            {fmt2(grandTotal)} บาท
          </div>
        </div>

        {/* FOOTER BLOCK: PAYMENT + NOTES + SIGNATURES */}
        <div className="border-x border-b border-black p-2 space-y-2 text-[10px]">
          <div className="flex flex-wrap items-center gap-y-1">
            <span className="font-bold mr-2">เงื่อนไขชำระเงิน:</span>
            <CheckBox checked={paymentChoice === 'credit'} label={`เครดิต ${creditDays} วัน`} />
            <CheckBox checked={paymentChoice === 'billing'} label="วางบิล/รับเช็ค" />
            <CheckBox checked={paymentChoice === 'cash'} label="เงินสด" />
            <CheckBox checked={paymentChoice === 'transfer'} label="โอน/มัดจำ" />
            <CheckBox checked={paymentChoice === 'project'} label="PROJECT" />
          </div>

          <div className="grid grid-cols-12 gap-2 border-b border-dotted border-black pb-1">
            <div className="col-span-6">
              <span className="font-bold">ผู้ขาย / Sale: </span>
              <span>{salesName}</span>
            </div>
            <div className="col-span-3">
              <span className="font-bold">ตำแหน่ง: </span>
              <span>ฝ่ายขาย</span>
            </div>
            <div className="col-span-3">
              <span className="font-bold">รหัส: </span>
              <span>{docNo}</span>
            </div>
          </div>

          <div className="space-y-1">
            <div className="font-bold">หมายเหตุ (Notes / Installation Points &amp; Handover Checklist):</div>
            <div className="border-b border-dotted border-black pb-1 min-h-[18px]">
              {notesText}
            </div>
            <div className="border-b border-dotted border-black pb-1 min-h-[16px]">
              &nbsp;
            </div>
          </div>

          <div className="grid grid-cols-2 gap-6 pt-3 pb-1 text-center">
            <div>
              <div className="border-b border-black w-3/4 mx-auto mb-1 h-5"></div>
              <div className="font-bold">ผู้รับมอบงาน / ลูกค้า (Customer Signature)</div>
              <div className="text-[9.5px] mt-0.5">วันที่ ____/____/______</div>
            </div>
            <div>
              <div className="border-b border-black w-3/4 mx-auto mb-1 h-5"></div>
              <div className="font-bold">ผู้จัดทำ / ผู้ส่งมอบ (Staff Signature)</div>
              <div className="text-[9.5px] mt-0.5">วันที่พิมพ์ / Printed Date: {printedToday}</div>
            </div>
          </div>
        </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>,
    document.body
  );
};
