import { ModalBackdrop } from './ui/ModalBackdrop';
import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Printer, X } from 'lucide-react';
import { formatDateDMY, formatThaiDateTime } from '../types';
import { COMPANY_NAME, COMPANY_ADDRESS, COMPANY_PHONE } from './RepairReceiptPrintDocument';

export interface MorningBriefingRow {
  id: string;
  kindLabel: string;
  routeZone: string;
  techs: string[];
  timeSlot: string;
  refNo: string;
  customerName: string;
  location: string;
  detail: string;
  prepStatusLabel: string;
  note?: string;
}

interface MorningBriefingPrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetDate: string;
  onDateChange: (dateKey: string) => void;
  rows: MorningBriefingRow[];
  preparedBy: string;
}

export const MorningBriefingPrintModal: React.FC<MorningBriefingPrintModalProps> = ({
  isOpen,
  onClose,
  targetDate,
  onDateChange,
  rows,
  preparedBy
}) => {
  useEffect(() => {
    if (!isOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const styleEl = document.createElement('style');
    styleEl.id = 'morning-briefing-a4-override';
    styleEl.textContent = '@media print { @page { size: A4 portrait; margin: 10mm; } }';
    document.head.appendChild(styleEl);

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      styleEl.remove();
      window.removeEventListener('keydown', onKey);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const displayDate = targetDate ? formatDateDMY(targetDate) : '-';
  const printedAt = formatThaiDateTime(new Date().toISOString());

  // Group breakdown by Route Zone & Tech Team
  const routeGroups = rows.reduce<Record<string, MorningBriefingRow[]>>((acc, row) => {
    const key = `${row.routeZone || 'ไม่ระบุสาย'} — ${row.techs.length > 0 ? row.techs.join(', ') : 'ยังไม่ระบุช่าง'}`;
    if (!acc[key]) acc[key] = [];
    acc[key].push(row);
    return acc;
  }, {});

  return createPortal(
    <ModalBackdrop
      className="morning-briefing-print-portal fixed inset-0 z-[10000] bg-black/70 backdrop-blur-sm flex flex-col items-center justify-start overflow-y-auto overscroll-contain p-2 sm:p-5 animate-fade-in"
      onDismiss={onClose}
    >
      {/* Top Interactive Controls (hidden during print) */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="no-print w-full max-w-[210mm] mb-3 bg-white dark:bg-slate-900 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-700 rounded-2xl p-3.5 shadow-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-2"
      >
        <div className="flex items-center gap-2 min-w-0">
          <Printer className="w-5 h-5 text-[#FF6B00] shrink-0" />
          <div className="min-w-0">
            <h3 className="text-sm font-extrabold truncate">
              รายงานประชุมเช้า — ใบสรุปแผนวิ่งงานประจำวัน (A4)
            </h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
              เลือกวันที่วิ่งงานแล้วกดพิมพ์เพื่อแจกทีมช่างประชุมเช้าก่อนออกรถ
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <input
            type="date"
            value={targetDate}
            onChange={(e) => onDateChange(e.target.value)}
            className="px-2.5 py-1.5 rounded-xl text-xs font-bold bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 cursor-pointer"
          />
          <button
            type="button"
            onClick={() => window.print()}
            className="px-3.5 py-1.5 rounded-xl bg-[#FF6B00] hover:bg-[#FF8A24] text-black text-xs font-extrabold cursor-pointer flex items-center gap-1.5 shadow-sm"
          >
            <Printer className="w-4 h-4" />
            <span>พิมพ์ (A4)</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="ปิดหน้าต่างพิมพ์"
            className="p-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-300 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* A4 Black-and-White Printable Sheet */}
      <div
        id="morning-briefing-print"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[210mm] bg-white text-black p-6 sm:p-8 shadow-2xl border border-slate-300 rounded-xl print:rounded-none print:border-none print:shadow-none"
      >
        {/* Header */}
        <div className="border-b-2 border-black pb-3 mb-4 flex flex-col sm:flex-row sm:items-start justify-between gap-2">
          <div>
            <h1 className="text-base font-extrabold tracking-tight text-black">
              ใบสรุปแผนวิ่งงาน &amp; ประชุมเช้า — {COMPANY_NAME}
            </h1>
            <p className="text-[11px] text-black mt-0.5">{COMPANY_ADDRESS}</p>
            <p className="text-[11px] text-black">{COMPANY_PHONE}</p>
          </div>
          <div className="text-left sm:text-right text-[11px] space-y-0.5 font-mono">
            <div><strong>วันที่วิ่งงาน:</strong> {displayDate}</div>
            <div><strong>พิมพ์เมื่อ:</strong> {printedAt}</div>
            <div><strong>จำนวนงานทั้งหมด:</strong> {rows.length} งาน</div>
          </div>
        </div>

        {/* Route & Tech Team Summary Strip */}
        {Object.keys(routeGroups).length > 0 && (
          <div className="mb-4 p-2.5 border border-black text-[11px]">
            <div className="font-bold mb-1">สรุปตามสายรถ / ทีมช่าง:</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
              {Object.entries(routeGroups).map(([groupLabel, groupRows]) => (
                <div key={groupLabel}>
                  • <strong>{groupLabel}</strong>: {groupRows.length} งาน
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Main Dispatch Table */}
        <table className="w-full border-collapse border border-black text-[11px]">
          <thead>
            <tr className="bg-slate-100">
              <th className="border border-black px-1.5 py-1.5 text-center w-9">ลำดับ</th>
              <th className="border border-black px-2 py-1.5 text-left w-32">สาย / ทีมช่าง</th>
              <th className="border border-black px-2 py-1.5 text-left w-28">เลขที่บิล / โปรเจกต์</th>
              <th className="border border-black px-2 py-1.5 text-left w-36">ลูกค้า / สถานที่</th>
              <th className="border border-black px-2 py-1.5 text-left">รายละเอียดงาน / สินค้า</th>
              <th className="border border-black px-2 py-1.5 text-center w-24">สถานะของ/เตรียม</th>
              <th className="border border-black px-2 py-1.5 text-left w-32">หมายเหตุ / เช็กก่อนออกรถ [ ]</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="border border-black px-3 py-8 text-center text-xs">
                  ยังไม่มีงานที่ลงตารางวิ่งงานสำหรับวันที่ {displayDate}
                </td>
              </tr>
            ) : (
              rows.map((row, idx) => (
                <tr key={row.id} className="align-top">
                  <td className="border border-black px-1.5 py-2 text-center font-mono font-bold">{idx + 1}</td>
                  <td className="border border-black px-2 py-2">
                    <div className="font-bold">{row.routeZone}</div>
                    <div className="text-[10px]">{row.techs.join(', ') || '-'}</div>
                    <div className="text-[10px]">({row.timeSlot})</div>
                  </td>
                  <td className="border border-black px-2 py-2 font-mono">
                    <div className="font-bold">{row.refNo}</div>
                    <div className="text-[10px]">[{row.kindLabel}]</div>
                  </td>
                  <td className="border border-black px-2 py-2">
                    <div className="font-bold">{row.customerName}</div>
                    <div className="text-[10px]">{row.location || '-'}</div>
                  </td>
                  <td className="border border-black px-2 py-2">{row.detail}</td>
                  <td className="border border-black px-2 py-2 text-center font-semibold">{row.prepStatusLabel}</td>
                  <td className="border border-black px-2 py-2">
                    <div>[ ] ตรวจของ/S/N ครบ</div>
                    {row.note && <div className="text-[10px] mt-0.5">{row.note}</div>}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {/* Footer Signatures */}
        <div className="mt-8 pt-4 grid grid-cols-2 gap-8 text-xs text-center">
          <div className="space-y-8">
            <div className="border-b border-black w-56 mx-auto" />
            <div>
              <div className="font-bold">ผู้จัดตาราง (หน้าร้าน)</div>
              <div className="text-[11px] mt-0.5">({preparedBy})</div>
            </div>
          </div>
          <div className="space-y-8">
            <div className="border-b border-black w-56 mx-auto" />
            <div>
              <div className="font-bold">หัวหน้าช่าง / ผู้ตรวจสอบ</div>
              <div className="text-[11px] mt-0.5">(...........................................)</div>
            </div>
          </div>
        </div>
      </div>
    </ModalBackdrop>,
    document.body
  );
};
