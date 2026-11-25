import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { ClipboardCheck } from 'lucide-react';

export interface PurchasingActionSummary {
  title: string;
  description: string;
  confirmLabel: string;
  details: { label: string; value: string }[];
  lines: { name: string; quantity: number; destination?: string }[];
}

export function PurchasingActionConfirmation({ summary, busy, error, onCancel, onConfirm }: {
  summary: PurchasingActionSummary;
  busy: boolean;
  error: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    cancelRef.current?.focus();
    return () => dialog?.close();
  }, []);

  return createPortal(
    <dialog ref={dialogRef} aria-labelledby={titleId} aria-describedby={descriptionId} onCancel={event => {
      event.preventDefault();
      if (!busy) onCancel();
    }} className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%_-_2rem)] max-w-lg overflow-hidden rounded-3xl border border-slate-200 bg-white p-0 text-slate-900 shadow-2xl backdrop:bg-slate-950/65 dark:border-slate-700 dark:bg-slate-900 dark:text-white motion-safe:animate-modal-pop">
      <div className="flex max-h-[calc(90dvh_-_2px)] flex-col">
        <div className="min-h-0 space-y-4 overflow-y-auto overscroll-contain p-4 sm:p-6">
          <div className="flex items-start gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-orange-100 text-orange-800 dark:bg-orange-500/20 dark:text-orange-200">
              <ClipboardCheck className="size-5" aria-hidden="true" />
            </span>
            <div>
              <h2 id={titleId} className="text-lg font-bold">{summary.title}</h2>
              <p id={descriptionId} className="mt-1 text-sm text-slate-600 dark:text-slate-300">{summary.description}</p>
            </div>
          </div>
          <dl className="grid grid-cols-2 gap-3 rounded-2xl bg-slate-100 p-3 text-sm dark:bg-slate-800">
            {summary.details.map(({ label, value }) => (
              <div key={label} className="min-w-0">
                <dt className="text-slate-600 dark:text-slate-300">{label}</dt>
                <dd className="whitespace-pre-wrap break-words font-semibold">{value}</dd>
              </div>
            ))}
          </dl>
          {summary.lines.length > 0 && (
            <ul aria-label="รายการสินค้า" className="divide-y divide-slate-200 rounded-2xl border border-slate-200 px-3 dark:divide-slate-700 dark:border-slate-700">
              {summary.lines.map((line, index) => (
                <li key={index} className="flex justify-between gap-3 py-2.5 text-sm">
                  <div className="min-w-0 break-words">
                    <p className="font-semibold">{line.name}</p>
                    {line.destination && <p className="text-slate-600 dark:text-slate-300">{line.destination}</p>}
                  </div>
                  <span className="shrink-0 tabular-nums">{line.quantity.toLocaleString('th-TH')} ชิ้น</span>
                </li>
              ))}
            </ul>
          )}
          {error && <p role="alert" className="text-sm text-rose-700 dark:text-rose-300">{error}</p>}
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900">
          <button ref={cancelRef} type="button" disabled={busy} onClick={onCancel}
            className="min-h-11 cursor-pointer rounded-xl border border-slate-300 px-4 text-sm font-semibold hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600 disabled:opacity-60 dark:border-slate-600 dark:hover:bg-slate-800">
            ย้อนกลับ
          </button>
          <button type="button" disabled={busy || !!error} onClick={onConfirm}
            className="min-h-11 cursor-pointer rounded-xl bg-emerald-700 px-4 text-sm font-bold text-white hover:bg-emerald-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 disabled:opacity-60 dark:focus-visible:outline-emerald-400">
            {busy ? 'กำลังบันทึก…' : summary.confirmLabel}
          </button>
        </div>
      </div>
    </dialog>,
    document.body,
  );
}
