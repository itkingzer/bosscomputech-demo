import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Printer, X } from 'lucide-react';
import { formatDateDMY, getStockPoDocument, type StockPO } from '../types';
import companyLogo from '../assets/BossCom.jpg';
import { getStockPoSupplierDetails } from '../data/stockPoSuppliers';
import { COMPANY_ADDRESS, COMPANY_NAME } from './RepairReceiptPrintDocument';
import './StockPurchaseOrderPrintModal.css';

const money = new Intl.NumberFormat('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const toSatang = (amount: number) => Math.round((amount + Number.EPSILON) * 100);
const baht = (satang: number) => money.format(satang / 100);

const detailFields = [
  ['buyerTaxId', 'เลขผู้เสียภาษีผู้ซื้อ'],
  ['supplierName', 'ชื่อผู้ขาย / ชื่อนิติบุคคล'],
  ['supplierTaxId', 'เลขผู้เสียภาษี / สาขา Supplier'],
  ['supplierAddress', 'ที่อยู่ Supplier'],
  ['supplierContact', 'ผู้ติดต่อ / โทรศัพท์ / อีเมล Supplier'],
  ['deliveryDate', 'กำหนดส่ง'],
  ['deliveryAddress', 'สถานที่จัดส่ง'],
  ['paymentTerms', 'เงื่อนไขชำระเงิน'],
] as const;

interface Props {
  selectedPo: StockPO;
  stockPOs: StockPO[];
  onClose: () => void;
}

export function StockPurchaseOrderPrintModal({ selectedPo, stockPOs, onClose }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [details, setDetails] = useState<Partial<Record<typeof detailFields[number][0], string>>>(() => {
    const supplier = getStockPoSupplierDetails(selectedPo.supplier || '');
    return {
      buyerTaxId: '0845537001210',
      supplierName: supplier?.name || selectedPo.supplier,
      supplierAddress: supplier?.address,
      supplierTaxId: supplier?.taxId,
      supplierContact: supplier?.contact,
    };
  });
  const [taxMode, setTaxMode] = useState('unspecified');
  const [discountInput, setDiscountInput] = useState('');

  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  const document = getStockPoDocument(selectedPo);
  const rows = document
    ? [selectedPo, ...stockPOs.filter(po => po.id !== selectedPo.id && getStockPoDocument(po)?.id === document.id)]
        .sort((a, b) => (getStockPoDocument(a)?.line ?? 0) - (getStockPoDocument(b)?.line ?? 0))
    : [selectedPo];
  const subtotal = rows.reduce((sum, po) => sum + toSatang(po.qty * po.unit_cost), 0);
  const discount = Math.min(subtotal, Math.max(0, toSatang(Number(discountInput) || 0)));
  const net = subtotal - discount;
  const vat = taxMode === 'exclusive' ? Math.round(net * 7 / 100)
    : taxMode === 'inclusive' ? Math.round(net * 7 / 107) : 0;
  const total = taxMode === 'exclusive' ? net + vat : net;
  const notes = [...new Set(rows.map(po => po.notes?.trim()).filter(Boolean))];

  return createPortal(
    <dialog
      ref={dialogRef}
      className="stock-po-print-dialog"
      aria-labelledby="stock-po-print-title"
      onClose={onClose}
    >
      <div className="stock-po-print-controls">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="stock-po-print-title" className="font-bold">ตัวอย่างใบสั่งซื้อ A4</h2>
          <div className="flex gap-2">
            <button type="button" onClick={() => window.print()} className="flex min-h-11 items-center gap-2 rounded-lg bg-indigo-700 px-4 text-sm font-bold text-white hover:bg-indigo-800">
              <Printer size={16} /> พิมพ์ / บันทึก PDF
            </button>
            <button type="button" aria-label="ปิดตัวอย่างใบสั่งซื้อ" onClick={() => dialogRef.current?.close()} className="grid min-h-11 min-w-11 place-items-center rounded-lg bg-slate-100 hover:bg-slate-200">
              <X size={18} />
            </button>
          </div>
        </div>
        <details className="mt-3 rounded-lg border border-slate-300 p-3">
          <summary className="cursor-pointer font-semibold">ข้อมูลประกอบเอกสารและภาษี</summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {detailFields.map(([key, label]) => (
              <label key={key}>
                {label}
                <input type={key === 'deliveryDate' ? 'date' : 'text'} value={details[key] ?? ''}
                  onChange={event => setDetails(previous => ({ ...previous, [key]: event.target.value }))} />
              </label>
            ))}
            <label>
              ส่วนลดรวม (บาท)
              <input type="number" min="0" max={subtotal / 100} step="0.01" value={discountInput}
                onChange={event => setDiscountInput(event.target.value)} />
            </label>
            <label>
              ภาษีมูลค่าเพิ่ม
              <select value={taxMode} onChange={event => setTaxMode(event.target.value)}>
                <option value="unspecified">ไม่ระบุ VAT</option>
                <option value="exclusive">ราคายังไม่รวม VAT 7%</option>
                <option value="inclusive">ราคารวม VAT 7% แล้ว</option>
                <option value="exempt">ไม่มี VAT</option>
              </select>
            </label>
          </div>
        </details>
      </div>

      <article className="stock-po-sheet">
        <header className="stock-po-header">
          <img src={companyLogo} alt="Boss Computech" width="62" height="62" />
          <div>
            <h1>ใบสั่งซื้อ</h1>
            <p>PURCHASE ORDER</p>
          </div>
        </header>

        <div className="stock-po-parties">
          <section>
            <h2>ผู้ซื้อ</h2>
            <strong>{COMPANY_NAME}</strong>
            <p>{COMPANY_ADDRESS}</p>
            <p>โทร. 077-286999</p>
            <p>เลขประจำตัวผู้เสียภาษี {details.buyerTaxId || '—'}</p>
            <h2 className="stock-po-supplier">ผู้ขาย (Supplier)</h2>
            <strong>{details.supplierName || '—'}</strong>
            <p>ที่อยู่ {details.supplierAddress || '—'}</p>
            <p>เลขประจำตัวผู้เสียภาษี / สาขา {details.supplierTaxId || '—'}</p>
            <p>ติดต่อ {details.supplierContact || '—'}</p>
          </section>
          <dl className="stock-po-meta">
            <dt>เลขที่ใบสั่งซื้อ</dt><dd>{document?.number || selectedPo.po_number}</dd>
            <dt>วันที่ออก</dt><dd>{formatDateDMY(selectedPo.ordered_at || selectedPo.created_at)}</dd>
            <dt>ใบเสนอราคาผู้ขาย</dt><dd>{document?.supplierQuote || '—'}</dd>
            <dt>กำหนดส่ง</dt><dd>{details.deliveryDate ? formatDateDMY(details.deliveryDate) : '—'}</dd>
            <dt>ส่งที่</dt><dd>{details.deliveryAddress || '—'}</dd>
            <dt>ชำระเงิน</dt><dd>{details.paymentTerms || '—'}</dd>
          </dl>
        </div>

        <table className="stock-po-lines">
          <thead><tr><th scope="col">ลำดับ</th><th scope="col">รายการสินค้า</th><th scope="col">จำนวน</th><th scope="col">ราคา/หน่วย</th><th scope="col">จำนวนเงิน</th></tr></thead>
          <tbody>
            {rows.map((po, index) => (
              <tr key={po.id}>
                <td>{index + 1}</td><td>{po.product_name}</td><td>{po.qty.toLocaleString('th-TH')}</td>
                <td>{money.format(po.unit_cost)}</td><td>{baht(toSatang(po.qty * po.unit_cost))}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <footer className="stock-po-footer">
          <section className="stock-po-totals">
            <dl>
              <dt>รวมมูลค่าสินค้า</dt><dd>{baht(subtotal)}</dd>
              <dt>ส่วนลด</dt><dd>{baht(discount)}</dd>
              {(taxMode === 'inclusive' || taxMode === 'exclusive') && <>
                <dt>มูลค่าก่อน VAT</dt><dd>{baht(taxMode === 'inclusive' ? net - vat : net)}</dd>
                <dt>ภาษีมูลค่าเพิ่ม 7%</dt><dd>{baht(vat)}</dd>
              </>}
              {taxMode === 'exempt' && <><dt>ภาษีมูลค่าเพิ่ม</dt><dd>{baht(0)}</dd></>}
            </dl>
            <div><strong>ยอดรวมสุทธิ</strong><strong>{baht(total)} บาท</strong></div>
          </section>
          <section className="stock-po-notes">
            <h2>หมายเหตุ</h2>
            <p>{notes.join('\n') || '—'}</p>
          </section>
        </footer>
        <div className="stock-po-signatures">
          {['ผู้จัดทำ', 'ผู้อนุมัติ', 'ผู้ขาย / ผู้รับใบสั่งซื้อ'].map((label, index) => (
            <div key={label}><p>{index === 0 ? selectedPo.created_by : ''}</p><strong>{label}</strong><div>วันที่ ____ / ____ / ____</div></div>
          ))}
        </div>
      </article>
    </dialog>,
    window.document.body
  );
}
