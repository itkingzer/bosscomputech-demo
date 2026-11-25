import { ModalBackdrop } from './ui/ModalBackdrop';
import { PhoneInput, NumberInput, normalizePhone } from './ui/FormInputs';
import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Printer, X, Copy } from 'lucide-react';
import { RepairTicket } from '../types';
import { RepairReceiptPrintDocument, formatReceiptDate } from './RepairReceiptPrintDocument';
import { PrintGuideButton } from './PrintGuideButton';

interface RepairReceiptPrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  ticket: RepairTicket | null;
}

export const RepairReceiptPrintModal: React.FC<RepairReceiptPrintModalProps> = ({
  isOpen,
  onClose,
  ticket
}) => {
  const [printCopies, setPrintCopies] = useState<1 | 2>(1);

  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [deviceModel, setDeviceModel] = useState('');
  const [serialNo, setSerialNo] = useState('');
  const [address, setAddress] = useState('');
  const [faultSymptom, setFaultSymptom] = useState('');
  const [accessories, setAccessories] = useState('');
  const [repairedBy, setRepairedBy] = useState('');
  const [repairCost, setRepairCost] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!isOpen || !ticket) return;
    setCustomerName(ticket.customer_name || '');
    setCustomerPhone(normalizePhone(ticket.customer_phone || ''));
    setDeviceModel(ticket.device_model || '');
    setSerialNo(ticket.walkin_sn || '');
    setAddress(ticket.delivery_location || ticket.district || '');
    setFaultSymptom(ticket.fault_symptom || '');
    const defaultAcc =
      ticket.included_accessories ||
      [...(ticket.accessories || []), ticket.accessories_other || ''].filter(Boolean).join(', ');
    setAccessories(defaultAcc);
    setRepairedBy(ticket.repaired_by || '');
    setRepairCost(ticket.repair_cost != null ? String(ticket.repair_cost) : '');
    setDueDate(
      formatReceiptDate(ticket.finished_at) ||
        formatReceiptDate(ticket.rma_returned_date) ||
        ''
    );
    const defaultNotes = [
      ticket.repair_detail || '',
      ticket.parts_used ? `อะไหล่: ${ticket.parts_used}` : '',
      ticket.repair_status ? `สถานะ: ${ticket.repair_status}` : ''
    ]
      .filter(Boolean)
      .join(' • ');
    setNotes(defaultNotes);
  }, [isOpen, ticket]);

  useEffect(() => {
    if (!isOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [isOpen, onClose]);

  const previewTicket = useMemo<RepairTicket | null>(() => {
    if (!ticket) return null;
    const parsedCost = repairCost.trim() === '' ? undefined : Number(repairCost);
    return {
      ...ticket,
      customer_name: customerName,
      customer_phone: customerPhone,
      device_model: deviceModel,
      walkin_sn: serialNo,
      delivery_location: address,
      fault_symptom: faultSymptom,
      included_accessories: accessories,
      repaired_by: repairedBy,
      repair_cost: parsedCost !== undefined && !Number.isNaN(parsedCost) ? parsedCost : ticket.repair_cost
    };
  }, [
    ticket,
    customerName,
    customerPhone,
    deviceModel,
    serialNo,
    address,
    faultSymptom,
    accessories,
    repairedBy,
    repairCost
  ]);

  if (!isOpen || !previewTicket) return null;

  const allowMultipage = printCopies === 2;
  const copies: Array<{ key: string; label?: string }> =
    printCopies === 2
      ? [
          { key: 'original', label: 'ต้นฉบับ (สำหรับลูกค้า)' },
          { key: 'copy', label: 'สำเนา (สำหรับร้าน)' }
        ]
      : [{ key: 'single', label: undefined }];

  return createPortal(
    <ModalBackdrop
      className={`repair-receipt-print-portal ${
        allowMultipage ? 'allow-multipage ' : ''
      }fixed inset-0 z-[10000] bg-black/70 backdrop-blur-sm flex flex-col items-center justify-start overflow-y-auto overscroll-contain p-2 sm:p-5 animate-fade-in`}
      onDismiss={onClose}
    >
      {/* Top Interactive Controls (hidden during print) */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="no-print w-full max-w-[210mm] mb-3 bg-white dark:bg-slate-900 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-700 rounded-2xl p-3.5 shadow-2xl space-y-3"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Printer className="w-5 h-5 text-[#FF6B00]" />
            <div>
              <h3 className="text-sm font-extrabold">
                ตัวอย่างก่อนพิมพ์ — ใบรับซ่อมสินค้า (แนะนำขนาด A5 แนวนอน / ครึ่ง A4)
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                ปรับแต่งข้อมูลหรือจำนวนสำเนาก่อนสั่งพิมพ์ได้ทันที (ตั้งค่าขนาดกระดาษ A5 แนวนอนในหน้าต่างพิมพ์ของ Chrome/Edge)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <PrintGuideButton docType="repair_receipt" />
            <button
              type="button"
              onClick={() => setPrintCopies((c) => (c === 1 ? 2 : 1))}
              className={`px-3 py-2 rounded-xl text-xs font-bold border transition cursor-pointer flex items-center gap-1.5 ${
                printCopies === 2
                  ? 'bg-emerald-100 text-emerald-900 border-emerald-400 dark:bg-emerald-500/20 dark:text-emerald-300 dark:border-emerald-500/40'
                  : 'bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'
              }`}
              title="พิมพ์ 2 ใบ (ต้นฉบับสำหรับลูกค้า + สำเนาสำหรับร้าน)"
            >
              <Copy className="w-4 h-4" />
              <span>{printCopies === 2 ? 'พิมพ์ 2 ชุด (ต้นฉบับ + สำเนา)' : 'พิมพ์ 1 ชุด'}</span>
            </button>

            <button
              type="button"
              onClick={() => window.print()}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#FF6B00] to-[#E65A00] hover:from-[#FF8A24] text-black font-extrabold text-xs shadow-lg shadow-[#FF6B00]/25 cursor-pointer flex items-center gap-1.5"
            >
              <Printer className="w-4 h-4" />
              <span>พิมพ์ใบรับซ่อม</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              aria-label="ปิดหน้าต่างพิมพ์"
              className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Quick Pre-Print Field Overrides */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 text-xs pt-2 border-t border-slate-200 dark:border-slate-800">
          <div>
            <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 mb-0.5">ชื่อลูกค้า</label>
            <input
              type="text"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              className="w-full rounded-lg px-2.5 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700"
            />
          </div>
          <div>
            <label htmlFor="repair-receipt-phone" className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 mb-0.5">เบอร์ติดต่อ</label>
            <PhoneInput
              id="repair-receipt-phone"
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
              className="w-full rounded-lg px-2.5 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700"
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 mb-0.5">รุ่น / อุปกรณ์</label>
            <input
              type="text"
              value={deviceModel}
              onChange={(e) => setDeviceModel(e.target.value)}
              className="w-full rounded-lg px-2.5 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700"
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 mb-0.5">Serial No.</label>
            <input
              type="text"
              value={serialNo}
              onChange={(e) => setSerialNo(e.target.value)}
              className="w-full rounded-lg px-2.5 py-1.5 text-xs font-mono bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700"
            />
          </div>

          <div className="sm:col-span-2">
            <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 mb-0.5">อาการเสีย</label>
            <input
              type="text"
              value={faultSymptom}
              onChange={(e) => setFaultSymptom(e.target.value)}
              className="w-full rounded-lg px-2.5 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700"
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 mb-0.5">อุปกรณ์ที่นำมาด้วย</label>
            <input
              type="text"
              value={accessories}
              onChange={(e) => setAccessories(e.target.value)}
              placeholder="สายชาร์จ, กระเป๋า..."
              className="w-full rounded-lg px-2.5 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700"
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 mb-0.5">ที่อยู่</label>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="w-full rounded-lg px-2.5 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700"
            />
          </div>

          <div>
            <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 mb-0.5">ช่างผู้ซ่อม</label>
            <input
              type="text"
              value={repairedBy}
              onChange={(e) => setRepairedBy(e.target.value)}
              placeholder="ระบุชื่อช่าง"
              className="w-full rounded-lg px-2.5 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700"
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 mb-0.5">ประเมินค่าซ่อม (บาท)</label>
            <NumberInput
              finishOnEnter
              step="0.01"
              value={repairCost}
              onChange={(e) => setRepairCost(e.target.value)}
              placeholder="0"
              className="w-full rounded-lg px-2.5 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700"
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 mb-0.5">วันนัดรับสินค้า</label>
            <input
              type="text"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              placeholder="วว/ดด/ปปปป"
              className="w-full rounded-lg px-2.5 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700"
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 mb-0.5">บันทึกเพิ่มเติม</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="หมายเหตุ / อะไหล่..."
              className="w-full rounded-lg px-2.5 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700"
            />
          </div>
        </div>
      </div>

      {/* Live Paper Preview */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full flex flex-col items-center gap-4 pb-8"
      >
        {copies.map((c) => (
          <div
            key={c.key}
            className="repair-receipt-sheet w-full max-w-[202mm] bg-white text-black rounded-xl shadow-2xl p-4 sm:p-6 border border-slate-200"
          >
            <RepairReceiptPrintDocument
              ticket={previewTicket}
              dueDateOverride={dueDate}
              notesOverride={notes}
              copyLabel={c.label}
            />
          </div>
        ))}
      </div>
    </ModalBackdrop>,
    document.body
  );
};
