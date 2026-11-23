import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Printer, X, CheckSquare, Square } from 'lucide-react';
import { Project, formatDateDMY, formatThaiDateTime } from '../types';
import { COMPANY_NAME, COMPANY_ADDRESS, COMPANY_PHONE } from './RepairReceiptPrintDocument';

export interface OnsiteCompletedReportRow {
  id: string;
  dateKey: string;
  kind: string;
  refNo: string;
  customerName: string;
  detail: string;
  techs: string[];
  location: string;
  completedAt: string;
}

interface OnsiteDailyReportPrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedDate: string;
  onDateChange: (dateKey: string) => void;
  jobs: OnsiteCompletedReportRow[];
  projects: Project[];
  preparedBy: string;
}

export const OnsiteDailyReportPrintModal: React.FC<OnsiteDailyReportPrintModalProps> = ({
  isOpen,
  onClose,
  selectedDate,
  onDateChange,
  jobs,
  projects,
  preparedBy
}) => {
  const [includeProjects, setIncludeProjects] = useState(true);
  const [reportNote, setReportNote] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const styleEl = document.createElement('style');
    styleEl.id = 'onsite-report-a4-override';
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

  const filteredJobs = selectedDate
    ? jobs.filter((j) => j.dateKey === selectedDate)
    : jobs;

  const displayDate = selectedDate ? formatDateDMY(selectedDate) : 'ทั้งหมด';
  const printedToday = formatDateDMY(new Date().toISOString());

  return createPortal(
    <div
      className="onsite-report-print-portal fixed inset-0 z-[10000] bg-black/70 backdrop-blur-sm flex flex-col items-center justify-start overflow-y-auto overscroll-contain p-2 sm:p-5 animate-fade-in"
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
              <h3 className="text-sm font-extrabold truncate">
                ตัวอย่างก่อนพิมพ์ — รายงานปิดงานช่าง Onsite & โปรเจกต์ (A4)
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                เลือกวันที่และปรับแต่งหมายเหตุก่อนสั่งพิมพ์รายงานส่งหัวหน้าฝ่ายช่าง
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap sm:flex-nowrap shrink-0">
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => onDateChange(e.target.value)}
              aria-label="เลือกวันที่รายงาน"
              className="px-2.5 py-1.5 rounded-xl text-xs font-bold bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 cursor-pointer"
            />
            <button
              type="button"
              onClick={() => setIncludeProjects((v) => !v)}
              className={`px-2.5 py-1.5 rounded-xl text-xs font-bold border transition cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                includeProjects
                  ? 'bg-emerald-100 text-emerald-900 border-emerald-400 dark:bg-emerald-500/20 dark:text-emerald-300 dark:border-emerald-500/40'
                  : 'bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'
              }`}
            >
              {includeProjects ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
              <span>รวมความคืบหน้าโปรเจกต์</span>
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-[#FF6B00] to-[#E65A00] hover:from-[#FF8A24] text-black font-extrabold text-xs shadow-lg shadow-[#FF6B00]/25 cursor-pointer flex items-center gap-1.5 whitespace-nowrap"
            >
              <Printer className="w-4 h-4" />
              <span>พิมพ์รายงาน (A4)</span>
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

        <div className="pt-2 border-t border-slate-200 dark:border-slate-800">
          <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 mb-0.5">
            หมายเหตุ / ข้อความแจ้งหัวหน้าฝ่ายช่าง (ถ้ามี)
          </label>
          <input
            type="text"
            value={reportNote}
            onChange={(e) => setReportNote(e.target.value)}
            placeholder="เช่น สรุปงานส่งมอบประจำวันเรียบร้อย ไม่มีงานค้างฉุกเฉิน..."
            className="w-full rounded-lg px-2.5 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700"
          />
        </div>
      </div>

      {/* Printable A4 Sheet */}
      <div
        id="onsite-daily-report-print"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[210mm] bg-white text-black p-[10mm] shadow-2xl border border-slate-300 print:border-none print:shadow-none text-[11px] leading-[1.35]"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 pb-2.5 mb-3 border-b-2 border-black">
          <div>
            <div className="font-extrabold text-[14px]">{COMPANY_NAME}</div>
            <div className="text-[10.5px] mt-0.5">{COMPANY_ADDRESS}</div>
            <div className="text-[10.5px]">{COMPANY_PHONE}</div>
          </div>
          <div className="text-right shrink-0">
            <div className="font-extrabold text-[15px]">รายงานสรุปปิดงานช่าง Onsite</div>
            <div className="text-[11px] mt-0.5">
              <span className="font-bold">ประจำวันที่: </span>
              <span>{displayDate}</span>
            </div>
            <div className="text-[10.5px]">
              <span className="font-bold">ผู้จัดทำ: </span>
              <span>{preparedBy}</span>
            </div>
          </div>
        </div>

        {/* Summary KPI Strip */}
        <div className="grid grid-cols-3 gap-2 mb-3 text-[11px]">
          <div className="border border-black px-2.5 py-1.5">
            <span className="font-bold">งาน Onsite ปิดสำเร็จ: </span>
            <span className="font-mono font-extrabold text-[13px]">{filteredJobs.length}</span> งาน
          </div>
          <div className="border border-black px-2.5 py-1.5">
            <span className="font-bold">งานโปรเจกต์ที่ติดตาม: </span>
            <span className="font-mono font-extrabold text-[13px]">{projects.length}</span> โครงการ
          </div>
          <div className="border border-black px-2.5 py-1.5">
            <span className="font-bold">วันที่พิมพ์: </span>
            <span>{printedToday}</span>
          </div>
        </div>

        {/* Table 1: Completed Onsite Jobs */}
        <div className="mb-4">
          <div className="font-extrabold text-[12px] mb-1.5">
            1. รายการปิดงานเสร็จของช่าง Onsite ({filteredJobs.length} งาน)
          </div>
          <table className="w-full border-collapse border border-black text-[10.5px]">
            <thead>
              <tr>
                <th className="border border-black px-1.5 py-1 text-center w-[32px]">#</th>
                <th className="border border-black px-1.5 py-1 text-left w-[95px]">ประเภท / เลขที่</th>
                <th className="border border-black px-1.5 py-1 text-left w-[120px]">ลูกค้า / สถานที่</th>
                <th className="border border-black px-1.5 py-1 text-left">รายละเอียดสินค้า / งาน</th>
                <th className="border border-black px-1.5 py-1 text-left w-[95px]">ช่าง Onsite</th>
                <th className="border border-black px-1.5 py-1 text-left w-[85px]">เวลาปิดงาน</th>
              </tr>
            </thead>
            <tbody>
              {filteredJobs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="border border-black px-2 py-4 text-center">
                    ไม่มีรายการปิดงานช่าง Onsite ในวันที่ {displayDate}
                  </td>
                </tr>
              ) : (
                filteredJobs.map((j, idx) => (
                  <tr key={j.id}>
                    <td className="border border-black px-1.5 py-1 text-center">{idx + 1}</td>
                    <td className="border border-black px-1.5 py-1">
                      <div className="font-bold">{j.kind}</div>
                      <div className="font-mono text-[9.5px]">{j.refNo}</div>
                    </td>
                    <td className="border border-black px-1.5 py-1">
                      <div className="font-bold">{j.customerName}</div>
                      <div className="text-[9.5px]">{j.location}</div>
                    </td>
                    <td className="border border-black px-1.5 py-1">{j.detail}</td>
                    <td className="border border-black px-1.5 py-1">
                      {j.techs.length > 0 ? j.techs.join(', ') : '-'}
                    </td>
                    <td className="border border-black px-1.5 py-1 text-[9.5px]">
                      {formatThaiDateTime(j.completedAt)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Table 2: Project Progress */}
        {includeProjects && (
          <div className="mb-4">
            <div className="font-extrabold text-[12px] mb-1.5">
              2. สรุปความคืบหน้างานโปรเจกต์ / ติดตั้ง ({projects.length} โครงการ)
            </div>
            <table className="w-full border-collapse border border-black text-[10.5px]">
              <thead>
                <tr>
                  <th className="border border-black px-1.5 py-1 text-center w-[32px]">#</th>
                  <th className="border border-black px-1.5 py-1 text-left w-[90px]">รหัสโปรเจกต์</th>
                  <th className="border border-black px-1.5 py-1 text-left w-[140px]">หน้างาน / ลูกค้า</th>
                  <th className="border border-black px-1.5 py-1 text-center w-[65px]">คืบหน้า</th>
                  <th className="border border-black px-1.5 py-1 text-left">อัปเดตล่าสุดจากช่าง</th>
                  <th className="border border-black px-1.5 py-1 text-left w-[90px]">ช่างผู้รับผิดชอบ</th>
                </tr>
              </thead>
              <tbody>
                {projects.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="border border-black px-2 py-3 text-center">
                      ไม่มีงานโปรเจกต์ในระบบ
                    </td>
                  </tr>
                ) : (
                  projects.map((prj, idx) => {
                    const latest =
                      prj.daily_logs && prj.daily_logs.length > 0
                        ? prj.daily_logs[prj.daily_logs.length - 1]
                        : null;
                    const pct =
                      prj.status === 'completed'
                        ? 100
                        : latest
                        ? latest.progress_percent
                        : 0;
                    return (
                      <tr key={prj.id}>
                        <td className="border border-black px-1.5 py-1 text-center">{idx + 1}</td>
                        <td className="border border-black px-1.5 py-1 font-mono font-bold">
                          {prj.id}
                          <div className="font-sans font-normal text-[9.5px]">{prj.status}</div>
                        </td>
                        <td className="border border-black px-1.5 py-1">
                          <div className="font-bold">{prj.site_name}</div>
                          <div className="text-[9.5px]">{prj.customer_name}</div>
                        </td>
                        <td className="border border-black px-1.5 py-1 text-center font-mono font-bold">
                          {pct}%
                        </td>
                        <td className="border border-black px-1.5 py-1">
                          {latest ? (
                            <>
                              <div>{latest.note || '-'}</div>
                              <div className="text-[9.5px]">
                                ({latest.tech_name} · {formatDateDMY(latest.date)})
                              </div>
                            </>
                          ) : (
                            <span>ยังไม่มีรายงานรายวัน</span>
                          )}
                        </td>
                        <td className="border border-black px-1.5 py-1">
                          {prj.assigned_techs && prj.assigned_techs.length > 0
                            ? prj.assigned_techs.join(', ')
                            : '-'}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Notes & Signatures */}
        {reportNote.trim() && (
          <div className="border border-black px-2.5 py-1.5 mb-4 text-[10.5px]">
            <span className="font-bold">หมายเหตุ: </span>
            <span>{reportNote}</span>
          </div>
        )}

        <div className="grid grid-cols-2 gap-10 pt-5 text-center text-[11px]">
          <div>
            <div className="border-b border-black w-3/4 mx-auto mb-1 h-5"></div>
            <div className="font-bold">ผู้จัดทำรายงาน / หน้าร้าน ({preparedBy})</div>
            <div className="text-[9.5px] mt-0.5">วันที่ {printedToday}</div>
          </div>
          <div>
            <div className="border-b border-black w-3/4 mx-auto mb-1 h-5"></div>
            <div className="font-bold">หัวหน้าฝ่ายช่าง / ผู้รับทราบ</div>
            <div className="text-[9.5px] mt-0.5">วันที่ ____/____/______</div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
