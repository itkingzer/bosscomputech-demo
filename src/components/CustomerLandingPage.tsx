import React, { useMemo, useState, useEffect } from 'react';
import {
  Search, ShieldCheck, Wrench, CheckCircle2, Clock, PackageCheck,
  Truck, Camera, LogIn, Sun, Moon, Phone, MapPin, AlertCircle,
  Sparkles, X, ShieldAlert, ShieldOff
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { RepairLifecycleStatus, formatDateDMY, formatWarrantyDuration } from '../types';
import { BarcodeScannerModal } from './BarcodeScannerModal';
import companyLogo from '../assets/BossCom.jpg';

interface CustomerLandingPageProps {
  onOpenStaffLogin: () => void;
}

type SearchMode = 'repair' | 'warranty';

interface PublicRepairStep {
  key: string;
  label: string;
  desc: string;
}

const REPAIR_PUBLIC_STEPS: PublicRepairStep[] = [
  { key: 'received', label: 'รับเครื่องเข้าระบบ', desc: 'เจ้าหน้าที่รับเครื่องและออกใบรับซ่อมแล้ว' },
  { key: 'checking', label: 'กำลังตรวจเช็ค / ซ่อม', desc: 'ช่างกำลังตรวจสอบอาการและดำเนินการซ่อม' },
  { key: 'parts_or_claim', label: 'รออะไหล่ / ส่งเคลมศูนย์', desc: 'อยู่ระหว่างรออะไหล่หรือประสานงานศูนย์บริการ' },
  { key: 'ready', label: 'ซ่อมเสร็จพร้อมรับ / ส่งคืน', desc: 'เครื่องพร้อมส่งมอบ ติดต่อรับเครื่องได้ที่หน้าร้าน' },
  { key: 'completed', label: 'ส่งมอบเรียบร้อย', desc: 'ลูกค้ารับเครื่องคืนเรียบร้อยแล้ว' },
];

function mapRepairStepIndex(
  repairStatus?: RepairLifecycleStatus,
  legacyStatus?: string
): number {
  if (repairStatus === 'completed' || legacyStatus === 'returned_closed') return 4;
  if (
    repairStatus === 'ready_pickup' ||
    legacyStatus === 'repaired' ||
    legacyStatus === 'awaiting_dispatch' ||
    legacyStatus === 'dispatched_onsite' ||
    legacyStatus === 'on_delivery'
  ) {
    return 3;
  }
  if (repairStatus === 'waiting_parts' || repairStatus === 'rma_sent' || repairStatus === 'rma_returned') {
    return 2;
  }
  if (repairStatus === 'repairing' || legacyStatus === 'in_progress') {
    return 1;
  }
  return 0;
}

/** Mask customer name partially for public privacy (e.g. "สมชาย ใจดี" -> "สม*** ใจ***") */
function maskCustomerName(name?: string | null): string {
  if (!name) return '-';
  return name
    .trim()
    .split(/\s+/)
    .map((part) => {
      if (part.length <= 2) return part[0] + '*';
      return part.slice(0, 2) + '***';
    })
    .join(' ');
}

function formatRemainingYearsDays(days: number | null): string {
  if (days === null || days <= 0) return 'หมดประกันแล้ว';
  if (days >= 365) {
    const years = Math.floor(days / 365);
    const remDays = days % 365;
    const months = Math.floor(remDays / 30);
    if (months > 0) return `เหลืออีก ${years} ปี ${months} เดือน (${days.toLocaleString('th-TH')} วัน)`;
    return `เหลืออีก ${years} ปี (${days.toLocaleString('th-TH')} วัน)`;
  }
  if (days >= 30) {
    const months = Math.floor(days / 30);
    const remDays = days % 30;
    return remDays > 0
      ? `เหลืออีก ${months} เดือน ${remDays} วัน (${days.toLocaleString('th-TH')} วัน)`
      : `เหลืออีก ${months} เดือน (${days.toLocaleString('th-TH')} วัน)`;
  }
  return `เหลืออีก ${days} วัน`;
}

export const CustomerLandingPage: React.FC<CustomerLandingPageProps> = ({ onOpenStaffLogin }) => {
  const { repairTickets, lookupWarrantyBySerial, theme, toggleTheme } = useApp();

  const [mode, setMode] = useState<SearchMode>('repair');
  const [query, setQuery] = useState('');
  const [submittedQuery, setSubmittedQuery] = useState('');
  const [scannerOpen, setScannerOpen] = useState(false);

  // Support deep-linking via ?track=REP-... or ?sn=...
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const track = params.get('track');
    const sn = params.get('sn');
    if (track) {
      setMode('repair');
      setQuery(track);
      setSubmittedQuery(track.trim());
    } else if (sn) {
      setMode('warranty');
      setQuery(sn);
      setSubmittedQuery(sn.trim());
    }
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittedQuery(query.trim());
  };

  const handleModeChange = (nextMode: SearchMode) => {
    setMode(nextMode);
    setQuery('');
    setSubmittedQuery('');
  };

  // Public front-desk repair lookup (NO internal logs, NO costs, NO tech names, NO supplier/RMA tracking)
  const matchedRepair = useMemo(() => {
    const q = submittedQuery.trim().toLowerCase();
    if (mode !== 'repair' || !q) return null;
    return (
      repairTickets.find(
        (t) =>
          (t.ticket_no || '').trim().toLowerCase() === q ||
          (t.walkin_sn || '').trim().toLowerCase() === q ||
          (t.replacement_sn || '').trim().toLowerCase() === q
      ) || null
    );
  }, [mode, submittedQuery, repairTickets]);

  // Public warranty lookup by S/N (NO cost, NO GP, NO internal logs)
  const matchedWarranty = useMemo(() => {
    const q = submittedQuery.trim();
    if (mode !== 'warranty' || !q) return null;
    const res = lookupWarrantyBySerial(q);
    return res.found ? res : null;
  }, [mode, submittedQuery, lookupWarrantyBySerial]);

  const sampleTicketNo = repairTickets[0]?.ticket_no || 'REP-2569-101';

  return (
    <div className="min-h-screen bg-[var(--bg-page)] text-[var(--text-primary)] flex flex-col relative overflow-x-hidden transition-colors duration-300">
      {/* Subtle Ambient Orbs */}
      <div className="liquid-blob-1" aria-hidden="true" />
      <div className="liquid-blob-2" aria-hidden="true" />

      {/* Top Navigation Bar */}
      <header className="relative z-20 w-full max-w-6xl mx-auto px-4 sm:px-6 pt-4 sm:pt-6 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <img
            src={companyLogo}
            alt="Boss Computech Logo"
            className="w-9 h-9 rounded-full object-cover ring-1 ring-slate-300 dark:ring-white/20 shadow-sm flex-shrink-0"
          />
          <div className="min-w-0 hidden sm:block">
            <p className="text-xs font-extrabold text-slate-900 dark:text-white truncate">
              Boss Computech <span className="text-[#EA580C] dark:text-[#FF6B00]">and Service</span>
            </p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">ระบบบริการลูกค้าหน้าร้าน</p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={theme === 'dark' ? 'เปลี่ยนเป็นธีมสว่าง' : 'เปลี่ยนเป็นธีมมืด'}
            title={theme === 'dark' ? 'เปลี่ยนเป็นธีมสว่าง' : 'เปลี่ยนเป็นธีมมืด'}
            className="min-w-[44px] min-h-[44px] px-3 rounded-xl liquid-glass-card border border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-200 hover:border-[#FF6B00]/50 transition-colors duration-150 cursor-pointer flex items-center justify-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6B00]"
          >
            {theme === 'dark' ? (
              <Sun className="w-4 h-4 text-amber-400" aria-hidden="true" />
            ) : (
              <Moon className="w-4 h-4 text-blue-600" aria-hidden="true" />
            )}
            <span className="text-xs font-semibold hidden md:inline">
              {theme === 'dark' ? 'สว่าง' : 'มืด'}
            </span>
          </button>

          <button
            type="button"
            onClick={onOpenStaffLogin}
            className="min-h-[44px] px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white dark:bg-white/[0.08] dark:hover:bg-white/[0.15] border border-slate-300 dark:border-white/15 text-xs font-bold transition-colors duration-150 cursor-pointer flex items-center gap-2 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6B00]"
          >
            <LogIn className="w-4 h-4 text-[#FF6B00]" aria-hidden="true" />
            <span>เข้าสู่ระบบพนักงาน / แอดมิน</span>
          </button>
        </div>
      </header>

      {/* Main Centered Hero + Lookup */}
      <main className="relative z-10 flex-1 flex flex-col items-center justify-center px-4 sm:px-6 py-8 sm:py-12">
        <div className="w-full max-w-2xl mx-auto space-y-6">
          {/* Brand Centerpiece */}
          <div className="text-center space-y-3">
            <div className="inline-flex p-2 rounded-full bg-white shadow-xl ring-1 ring-slate-200 dark:ring-white/20">
              <img
                src={companyLogo}
                alt="Boss Computech and Service Co., Ltd."
                className="w-20 h-20 sm:w-24 sm:h-24 rounded-full object-cover"
              />
            </div>
            <div>
              <h1 className="text-xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
                บริษัท บอส คอมพิวเทค แอนด์ เซอร์วิส จำกัด
              </h1>
              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 mt-1.5">
                ตรวจสอบสถานะงานซ่อมและระยะเวลาการรับประกันสินค้าออนไลน์ได้ทันที
              </p>
            </div>
          </div>

          {/* Search Card */}
          <section
            aria-label="ค้นหาสถานะงานซ่อมและประกันสินค้า"
            className="liquid-glass rounded-3xl p-5 sm:p-7 border border-slate-200 dark:border-white/10 shadow-2xl space-y-5"
          >
            {/* Mode Switcher */}
            <div
              role="tablist"
              aria-label="เลือกประเภทการตรวจสอบ"
              className="grid grid-cols-2 gap-2 p-1.5 rounded-2xl bg-slate-100 dark:bg-white/[0.05] border border-slate-200 dark:border-white/[0.08]"
            >
              <button
                type="button"
                role="tab"
                aria-selected={mode === 'repair'}
                onClick={() => handleModeChange('repair')}
                className={`min-h-[44px] px-3 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-colors duration-150 cursor-pointer flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6B00] ${
                  mode === 'repair'
                    ? 'bg-[#FF6B00] text-black shadow-md'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Wrench className="w-4 h-4" aria-hidden="true" />
                <span>ติดตามสถานะซ่อม (REP)</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mode === 'warranty'}
                onClick={() => handleModeChange('warranty')}
                className={`min-h-[44px] px-3 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-colors duration-150 cursor-pointer flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6B00] ${
                  mode === 'warranty'
                    ? 'bg-[#FF6B00] text-black shadow-md'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <ShieldCheck className="w-4 h-4" aria-hidden="true" />
                <span>เช็คประกันสินค้า (S/N)</span>
              </button>
            </div>

            {/* Search Form */}
            <form onSubmit={handleSubmit} className="space-y-3">
              <label
                htmlFor="customer-lookup-input"
                className="block text-xs font-bold text-slate-700 dark:text-slate-200"
              >
                {mode === 'repair'
                  ? 'กรอกเลขใบรับซ่อม (เช่น REP-2569-101) หรือ S/N เครื่องที่ส่งซ่อม'
                  : 'กรอกหมายเลข Serial Number (S/N) บนสติกเกอร์หรือกล่องสินค้า'}
              </label>

              <div className="flex flex-col sm:flex-row gap-2.5">
                <div className="relative flex-1">
                  <Search
                    className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                    aria-hidden="true"
                  />
                  <input
                    id="customer-lookup-input"
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={
                      mode === 'repair'
                        ? `ตัวอย่าง: ${sampleTicketNo}`
                        : 'ตัวอย่าง: SN-2026-001'
                    }
                    className="w-full min-h-[48px] liquid-glass-input rounded-2xl pl-10 pr-20 py-3 text-sm font-mono font-semibold text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6B00]"
                  />
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                    {query && (
                      <button
                        type="button"
                        onClick={() => {
                          setQuery('');
                          setSubmittedQuery('');
                        }}
                        aria-label="ล้างคำค้นหา"
                        className="p-2 rounded-lg text-slate-400 hover:text-slate-900 dark:hover:text-white cursor-pointer"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setScannerOpen(true)}
                      aria-label="สแกนบาร์โค้ดด้วยกล้อง"
                      title="สแกนบาร์โค้ด / QR ด้วยกล้อง"
                      className="p-2 rounded-xl text-slate-500 dark:text-slate-300 hover:text-[#FF6B00] hover:bg-slate-200/70 dark:hover:bg-white/10 transition-colors cursor-pointer"
                    >
                      <Camera className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  className="min-h-[48px] px-6 py-3 rounded-2xl bg-gradient-to-r from-[#FF6B00] to-[#E65A00] hover:from-[#FF8A24] hover:to-[#FF6B00] text-black font-extrabold text-sm transition-all duration-150 active:scale-[0.98] cursor-pointer shadow-lg shadow-[#FF6B00]/25 flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#FF6B00]"
                >
                  <Search className="w-4 h-4" aria-hidden="true" />
                  <span>ตรวจสอบ</span>
                </button>
              </div>
            </form>

            {/* RESULT AREA: REPAIR TRACKING (Public Front-Desk Data Only) */}
            {submittedQuery && mode === 'repair' && (
              <div className="pt-2 border-t border-slate-200 dark:border-white/10 animate-fade-in">
                {!matchedRepair ? (
                  <div className="p-5 rounded-2xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 text-center space-y-1.5">
                    <AlertCircle className="w-8 h-8 mx-auto text-slate-400" aria-hidden="true" />
                    <p className="text-sm font-bold text-slate-800 dark:text-white">
                      ไม่พบข้อมูลใบรับซ่อม "{submittedQuery}"
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      กรุณาตรวจสอบเลขที่ใบรับซ่อมบนเอกสารอีกครั้ง หรือติดต่อหน้าร้าน โทร. 077-286999
                    </p>
                  </div>
                ) : (
                  (() => {
                    const stepIdx = mapRepairStepIndex(matchedRepair.repair_status, matchedRepair.status);
                    const currentStep = REPAIR_PUBLIC_STEPS[stepIdx];
                    return (
                      <div className="p-5 rounded-2xl bg-white dark:bg-slate-900/70 border border-slate-200 dark:border-white/10 space-y-5">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <span className="text-[11px] font-bold uppercase tracking-wider text-[#EA580C] dark:text-[#FF6B00]">
                              ใบรับซ่อมเลขที่
                            </span>
                            <h2 className="text-lg font-extrabold font-mono text-slate-900 dark:text-white">
                              {matchedRepair.ticket_no}
                            </h2>
                          </div>
                          <span
                            className={`px-3 py-1.5 rounded-full text-xs font-bold border inline-flex items-center gap-1.5 ${
                              stepIdx === 4
                                ? 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30'
                                : stepIdx === 3
                                  ? 'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-500/15 dark:text-blue-300 dark:border-blue-500/30'
                                  : 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30'
                            }`}
                          >
                            {stepIdx === 4 ? (
                              <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                            ) : stepIdx === 3 ? (
                              <PackageCheck className="w-3.5 h-3.5" aria-hidden="true" />
                            ) : (
                              <Clock className="w-3.5 h-3.5" aria-hidden="true" />
                            )}
                            <span>{currentStep.label}</span>
                          </span>
                        </div>

                        {/* Front-desk summary only (masked customer name, no internal logs/cost/techs) */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                          <div className="p-3 rounded-xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.08]">
                            <p className="text-slate-500 dark:text-slate-400">ลูกค้า / ผู้ส่งซ่อม</p>
                            <p className="font-bold text-slate-900 dark:text-white mt-0.5">
                              {maskCustomerName(matchedRepair.customer_name)}
                            </p>
                          </div>
                          <div className="p-3 rounded-xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.08]">
                            <p className="text-slate-500 dark:text-slate-400">วันที่รับเครื่องเข้าระบบ</p>
                            <p className="font-bold text-slate-900 dark:text-white mt-0.5">
                              {formatDateDMY(matchedRepair.received_at || matchedRepair.created_at)}
                            </p>
                          </div>
                          <div className="p-3 rounded-xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.08]">
                            <p className="text-slate-500 dark:text-slate-400">รุ่น / อุปกรณ์</p>
                            <p className="font-bold text-slate-900 dark:text-white mt-0.5">
                              {matchedRepair.device_model || '-'}
                            </p>
                          </div>
                          <div className="p-3 rounded-xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.08]">
                            <p className="text-slate-500 dark:text-slate-400">อาการที่แจ้ง</p>
                            <p className="font-semibold text-slate-800 dark:text-slate-200 mt-0.5">
                              {matchedRepair.fault_symptom || '-'}
                            </p>
                          </div>
                        </div>

                        {/* Public 5-step progress tracker */}
                        <div className="space-y-2">
                          <p className="text-xs font-bold text-slate-700 dark:text-slate-300">
                            ความคืบหน้างานซ่อม
                          </p>
                          <ol className="space-y-2.5">
                            {REPAIR_PUBLIC_STEPS.map((st, idx) => {
                              const done = idx <= stepIdx;
                              const isCurrent = idx === stepIdx;
                              return (
                                <li
                                  key={st.key}
                                  className={`flex items-start gap-3 p-2.5 rounded-xl border transition-colors ${
                                    isCurrent
                                      ? 'bg-[#FF6B00]/10 border-[#FF6B00]/40'
                                      : done
                                        ? 'bg-emerald-50/70 border-emerald-200 dark:bg-emerald-500/10 dark:border-emerald-500/20'
                                        : 'bg-slate-50/60 border-slate-200/80 dark:bg-white/[0.02] dark:border-white/[0.06] opacity-60'
                                  }`}
                                >
                                  <div
                                    className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-extrabold flex-shrink-0 mt-0.5 ${
                                      isCurrent
                                        ? 'bg-[#FF6B00] text-black'
                                        : done
                                          ? 'bg-emerald-500 text-white'
                                          : 'bg-slate-200 dark:bg-white/10 text-slate-500 dark:text-slate-400'
                                    }`}
                                  >
                                    {done && !isCurrent ? '✓' : idx + 1}
                                  </div>
                                  <div className="min-w-0">
                                    <p className="text-xs font-bold text-slate-900 dark:text-white">
                                      {st.label}
                                    </p>
                                    <p className="text-[11px] text-slate-600 dark:text-slate-400">
                                      {st.desc}
                                    </p>
                                  </div>
                                </li>
                              );
                            })}
                          </ol>
                        </div>
                      </div>
                    );
                  })()
                )}
              </div>
            )}

            {/* RESULT AREA: WARRANTY CHECK BY S/N (Public Info Only) */}
            {submittedQuery && mode === 'warranty' && (
              <div className="pt-2 border-t border-slate-200 dark:border-white/10 animate-fade-in">
                {!matchedWarranty ? (
                  <div className="p-5 rounded-2xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 text-center space-y-1.5">
                    <AlertCircle className="w-8 h-8 mx-auto text-slate-400" aria-hidden="true" />
                    <p className="text-sm font-bold text-slate-800 dark:text-white">
                      ไม่พบหมายเลข S/N "{submittedQuery}" ในระบบรับประกัน
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      กรุณาตรวจสอบตัวอักษร/ตัวเลขบนวอยรับประกัน หรือสอบถามหน้าร้าน โทร. 077-286999
                    </p>
                  </div>
                ) : (
                  <div className="p-5 rounded-2xl bg-white dark:bg-slate-900/70 border border-slate-200 dark:border-white/10 space-y-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <span className="text-[11px] font-bold uppercase tracking-wider text-[#EA580C] dark:text-[#FF6B00]">
                          Serial Number (S/N)
                        </span>
                        <h2 className="text-lg font-extrabold font-mono text-slate-900 dark:text-white">
                          {matchedWarranty.serialNumber}
                        </h2>
                        <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 mt-0.5">
                          {matchedWarranty.modelName || 'สินค้า Boss Computech'}
                        </p>
                      </div>

                      {matchedWarranty.state === 'active' && (
                        <span className="px-3 py-1.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30 inline-flex items-center gap-1.5">
                          <ShieldCheck className="w-4 h-4" aria-hidden="true" />
                          <span>อยู่ในประกัน</span>
                        </span>
                      )}
                      {matchedWarranty.state === 'expired' && (
                        <span className="px-3 py-1.5 rounded-full text-xs font-bold bg-rose-100 text-rose-800 border border-rose-300 dark:bg-rose-500/15 dark:text-rose-300 dark:border-rose-500/30 inline-flex items-center gap-1.5">
                          <ShieldAlert className="w-4 h-4" aria-hidden="true" />
                          <span>หมดประกันแล้ว</span>
                        </span>
                      )}
                      {matchedWarranty.state === 'waiting' && (
                        <span className="px-3 py-1.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30 inline-flex items-center gap-1.5">
                          <Clock className="w-4 h-4" aria-hidden="true" />
                          <span>รอเริ่มนับประกัน</span>
                        </span>
                      )}
                      {matchedWarranty.state === 'none' && (
                        <span className="px-3 py-1.5 rounded-full text-xs font-bold bg-slate-100 text-slate-700 border border-slate-300 dark:bg-white/10 dark:text-slate-300 dark:border-white/15 inline-flex items-center gap-1.5">
                          <ShieldOff className="w-4 h-4" aria-hidden="true" />
                          <span>สินค้าไม่มีระยะรับประกัน</span>
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                      <div className="p-3 rounded-xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.08]">
                        <p className="text-slate-500 dark:text-slate-400">ระยะรับประกันทั้งหมด</p>
                        <p className="font-bold text-slate-900 dark:text-white mt-0.5">
                          {formatWarrantyDuration(matchedWarranty.warrantyYears, matchedWarranty.warrantyMonths)}
                        </p>
                      </div>
                      <div className="p-3 rounded-xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.08]">
                        <p className="text-slate-500 dark:text-slate-400">วันเริ่มประกัน</p>
                        <p className="font-bold font-mono text-slate-900 dark:text-white mt-0.5">
                          {formatDateDMY(matchedWarranty.voidDate)}
                        </p>
                      </div>
                      <div className="p-3 rounded-xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.08]">
                        <p className="text-slate-500 dark:text-slate-400">วันหมดประกัน</p>
                        <p className="font-bold font-mono text-slate-900 dark:text-white mt-0.5">
                          {formatDateDMY(matchedWarranty.expireDate)}
                        </p>
                      </div>
                    </div>

                    {matchedWarranty.state === 'active' && (
                      <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 dark:bg-emerald-500/10 dark:border-emerald-500/30 dark:text-emerald-300 flex items-center gap-2.5 text-xs font-bold">
                        <Sparkles className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
                        <span>
                          ระยะเวลาประกันคงเหลือ: {formatRemainingYearsDays(matchedWarranty.remainingDays)}
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </section>

          {/* Privacy Notice */}
          <p className="text-center text-[11px] text-slate-500 dark:text-slate-400 flex items-center justify-center gap-1.5">
            <Truck className="w-3.5 h-3.5 text-[#FF6B00]" aria-hidden="true" />
            <span>
              แสดงผลเฉพาะสถานะหน้าร้านเพื่อความเป็นส่วนตัว • ข้อมูลหลังบ้านและประวัติ Log สงวนสิทธิ์เฉพาะเจ้าหน้าที่ที่เข้าสู่ระบบแล้ว
            </span>
          </p>
        </div>
      </main>

      {/* Footer Contact Info */}
      <footer className="relative z-10 w-full border-t border-slate-200 dark:border-white/[0.06] py-4 px-4 text-center text-[11px] text-slate-600 dark:text-slate-400">
        <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-5">
          <span className="inline-flex items-center gap-1.5">
            <MapPin className="w-3.5 h-3.5 text-[#FF6B00]" aria-hidden="true" />
            289/2 ถนนตลาดใหม่ ต.ตลาด อ.เมือง จ.สุราษฎร์ธานี 84000
          </span>
          <a
            href="tel:077286999"
            className="inline-flex items-center gap-1.5 font-bold text-slate-800 dark:text-slate-200 hover:text-[#FF6B00] transition-colors"
          >
            <Phone className="w-3.5 h-3.5 text-[#FF6B00]" aria-hidden="true" />
            โทร. 077-286999
          </a>
        </div>
      </footer>

      {/* Camera Barcode / QR Scanner Modal */}
      <BarcodeScannerModal
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onScan={(text) => {
          const clean = text.trim();
          setQuery(clean);
          setSubmittedQuery(clean);
        }}
        title={mode === 'repair' ? 'สแกนเลขใบรับซ่อม / S/N' : 'สแกน Serial Number (S/N)'}
      />
    </div>
  );
};
