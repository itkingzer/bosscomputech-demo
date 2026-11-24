import React, { useState } from 'react';
import { ActivityLog, formatThaiDateTime, getLatestLog } from '../types';

// ==============================================================================
// ActivityTimeline
// - LatestUpdateBadge: แสดง "อัปเดตล่าสุด: 20 พ.ย. 69 23:48 โดย [ชื่อ]" บนการ์ด
// - ActivityTimeline: toggle "ดูประวัติไทม์ไลน์ (Log)" + vertical audit trail
// รองรับ Light/Dark mode ด้วยคลาส Tailwind ที่มีคู่สีครบ
// ==============================================================================

interface LatestUpdateBadgeProps {
    logs?: ActivityLog[] | null;
    /** fallback timestamp ถ้ายังไม่มี log (เช่น created_at) */
    fallbackTimestamp?: string | null;
    /** fallback ชื่อผู้กระทำ */
    fallbackActor?: string | null;
    className?: string;
}

export const LatestUpdateBadge: React.FC<LatestUpdateBadgeProps> = ({
    logs,
    fallbackTimestamp,
    fallbackActor,
    className = ''
}) => {
    const latest = getLatestLog(logs);
    const timestamp = latest?.timestamp || fallbackTimestamp;
    const actor = latest?.actor || fallbackActor;
    if (!timestamp && !actor) return null;

    return (
        <div
            className={`inline-flex items-center gap-1.5 text-[11px] leading-tight text-slate-500 dark:text-slate-400 ${className}`}
            title={latest?.action ? `ล่าสุด: ${latest.action}` : undefined}
        >
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
            <span>
                อัปเดตล่าสุด: <span className="font-semibold text-slate-700 dark:text-slate-200">{formatThaiDateTime(timestamp)}</span>
                {actor && (
                    <>
                        {' '}โดย <span className="font-semibold text-slate-700 dark:text-slate-200">{actor}</span>
                    </>
                )}
            </span>
        </div>
    );
};

interface ActivityTimelineProps {
    logs?: ActivityLog[] | null;
    /** เปิด/ปิดเริ่มต้น */
    defaultOpen?: boolean;
    /** ข้อความหัวข้อ toggle */
    label?: string;
    className?: string;
}

export const ActivityTimeline: React.FC<ActivityTimelineProps> = ({
    logs,
    defaultOpen = false,
    label = 'ดูประวัติไทม์ไลน์ (Log)',
    className = ''
}) => {
    const [open, setOpen] = useState(defaultOpen);

    // เรียงจากใหม่ -> เก่า (chronological audit trail แบบล่าสุดอยู่บน)
    const sorted = [...(logs || [])].sort(
        (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    return (
        <div className={`mt-1.5 sm:mt-2 ${className}`}>
            <button
                type="button"
                onClick={() => setOpen(o => !o)}
                className="activity-log-toggle inline-flex items-center gap-1 text-[10px] sm:text-[11px] font-medium px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-md sm:rounded-lg
                   bg-slate-100/80 hover:bg-slate-200 text-slate-500
                   dark:bg-white/[0.04] dark:hover:bg-white/10 dark:text-slate-400
                   border border-slate-200/80 dark:border-white/[0.08] transition-colors cursor-pointer"
                aria-expanded={open}
            >
                <svg
                    className={`w-2.5 h-2.5 sm:w-3 sm:h-3 transition-transform ${open ? 'rotate-90' : ''}`}
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    aria-hidden="true"
                >
                    <path
                        fillRule="evenodd"
                        d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
                        clipRule="evenodd"
                    />
                </svg>
                <span className="sm:hidden">{label === 'ดูประวัติไทม์ไลน์ (Log)' ? 'ดู Log' : label}</span>
                <span className="hidden sm:inline">{label}</span>
                <span className="ml-0.5 px-1 py-0 rounded-full bg-slate-200 dark:bg-white/10 text-[9px] sm:text-[10px] font-bold">
                    {sorted.length}
                </span>
            </button>

            {open && (
                <div className="mt-2 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-black/20 p-3">
                    {sorted.length === 0 ? (
                        <p className="text-[11px] text-slate-400 dark:text-slate-500 italic">ยังไม่มีประวัติการดำเนินการ</p>
                    ) : (
                        <ol className="relative border-l border-slate-300 dark:border-white/15 ml-1.5 space-y-3">
                            {sorted.map((log, idx) => (
                                <li key={`${log.timestamp}-${idx}`} className="ml-3.5 relative">
                                    {/* จุดบนเส้นไทม์ไลน์ */}
                                    <span
                                        className={`absolute -left-[1.32rem] top-1 w-2.5 h-2.5 rounded-full ring-2
                      ${idx === 0
                                                ? 'bg-emerald-500 ring-emerald-500/20'
                                                : 'bg-slate-400 dark:bg-slate-500 ring-slate-400/20 dark:ring-slate-500/20'}`}
                                    />
                                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                                        <span className="text-[11px] font-bold text-slate-800 dark:text-slate-100">{log.action}</span>
                                        <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400">
                                            {formatThaiDateTime(log.timestamp)}
                                        </span>
                                    </div>
                                    <div className="text-[11px] text-slate-600 dark:text-slate-300 mt-0.5">
                                        โดย <span className="font-semibold">{log.actor}</span>
                                        {log.role && (
                                            <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded bg-slate-200 dark:bg-white/10 text-slate-500 dark:text-slate-400">
                                                {log.role}
                                            </span>
                                        )}
                                    </div>
                                    {log.note && (
                                        <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">{log.note}</div>
                                    )}
                                </li>
                            ))}
                        </ol>
                    )}
                </div>
            )}
        </div>
    );
};

export default ActivityTimeline;
