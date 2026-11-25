import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

const knownBrands = [
  'BossComputech', 'ASUS', 'Acer', 'Brother', 'Canon', 'Cisco', 'Dahua', 'Dell',
  'Epson', 'Hikvision', 'HP', 'Huawei', 'Kingston', 'Lenovo', 'LINK', 'Logitech',
  'MikroTik', 'MSI', 'Samsung', 'Seagate', 'Synology', 'TP-Link', 'Ubiquiti', 'WD',
];

function brandFromModel(model: string) {
  const words = model.toLowerCase().split(/[^a-z0-9-]+/);
  return knownBrands.find(brand => words.includes(brand.toLowerCase()));
}

export interface PrepConfirmation {
  title: string;
  actor: string;
  rows: { id: string; model: string; serial?: string; reference?: string; warrantyDate?: string }[];
  detail?: string;
  run: () => Promise<void>;
}

export function PrepActionConfirmation({ summary, busy, error, onCancel, onConfirm }: {
  summary: PrepConfirmation;
  busy: boolean;
  error: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);

  return createPortal(
    <dialog ref={dialog} aria-labelledby="prep-confirm-title"
      className="m-auto w-[calc(100%_-_2rem)] max-w-lg max-h-[85dvh] overflow-hidden rounded-2xl bg-white p-0 text-slate-900 shadow-2xl backdrop:bg-black/65 dark:bg-slate-900 dark:text-white"
      onCancel={event => { event.preventDefault(); if (!busy) onCancel(); }}>
      <div className="flex max-h-[85dvh] flex-col">
        <header className="shrink-0 border-b border-slate-200 px-5 py-4 dark:border-slate-700">
          <h2 id="prep-confirm-title" className="text-lg font-bold">{summary.title}</h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{summary.actor} · {summary.rows.length} ชิ้น</p>
        </header>
        <ul tabIndex={0} aria-label="รายการสินค้า"
          className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-5 py-3 focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-indigo-600">
          {summary.rows.map(row => {
            const brand = brandFromModel(row.model);
            return (
              <li key={row.id} className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3 [overflow-wrap:anywhere] dark:border-slate-700 dark:bg-slate-800/60">
                <div>
                  <p className="mb-1 text-xs font-semibold text-slate-600 dark:text-slate-300">ชื่อรุ่น</p>
                  <p className="text-lg font-extrabold leading-snug">{row.model}</p>
                  <p className="mt-1 text-sm font-semibold text-slate-700 dark:text-slate-200">ยี่ห้อ {brand || 'ไม่ระบุ'}</p>
                </div>
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-lg bg-indigo-100 px-3 py-2 text-indigo-950 dark:bg-indigo-950 dark:text-indigo-100">
                  <span className="text-xs font-bold">S/N</span>
                  <span className={row.serial ? 'font-mono text-base font-bold' : 'text-sm'}>{row.serial || 'ยังไม่ระบุ'}</span>
                </div>
                {(row.reference || row.warrantyDate) && (
                  <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-600 dark:text-slate-300">
                    {row.reference && <span>{row.reference}</span>}
                    {row.warrantyDate && <span>วันที่ติดวอย {row.warrantyDate}</span>}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        {summary.detail && <p className="shrink-0 whitespace-pre-wrap break-words px-5 pb-3 text-sm">{summary.detail}</p>}
        {error && <p role="alert" className="shrink-0 px-5 pb-3 text-sm text-red-700 dark:text-red-300">{error}</p>}
        <div className="flex shrink-0 justify-end gap-2 border-t border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
          <button type="button" autoFocus disabled={busy} onClick={onCancel} className="min-h-11 rounded-xl border border-slate-300 px-4 text-sm font-semibold dark:border-slate-600">
            ยกเลิก
          </button>
          {!error && <button type="button" disabled={busy} onClick={onConfirm} className="min-h-11 rounded-xl bg-emerald-700 px-4 text-sm font-bold text-white hover:bg-emerald-800 disabled:opacity-60">
            {busy ? 'กำลังบันทึก…' : 'ยืนยัน'}
          </button>}
        </div>
      </div>
    </dialog>,
    document.body
  );
}
