import { useId, useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { PackagePlus, Pencil, Save, X } from 'lucide-react';
import { PRODUCT_CATEGORY_LABELS, PRODUCT_UNIT_OPTIONS, type Product } from '../types';
import { NumberInput } from './ui/FormInputs';

type ProductDraft = Pick<Product, 'name' | 'category' | 'item_type' | 'unit' | 'cost_price' | 'sell_price'>;

interface ProductEditorModalProps {
  product?: Product;
  onClose: () => void;
  onSave: (draft: ProductDraft) => void;
}

const fieldClass = 'block w-full min-h-11 rounded-xl border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600 dark:border-slate-600 dark:bg-slate-800 dark:text-white dark:focus-visible:outline-orange-400';

export function ProductEditorModal({ product, onClose, onSave }: ProductEditorModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const headingId = useId();
  const errorId = useId();
  const [nameError, setNameError] = useState(false);
  const [draft, setDraft] = useState<ProductDraft>(() => ({
    name: product?.name ?? '',
    category: product?.category ?? 'pc_notebook',
    item_type: product?.item_type ?? 'hardware',
    unit: product?.unit ?? 'เครื่อง',
    cost_price: product?.cost_price ?? 0,
    sell_price: product?.sell_price ?? 0,
  }));

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.showModal();
    nameRef.current?.focus();
    return () => dialog.close();
  }, []);

  function change<K extends keyof ProductDraft>(key: K, value: ProductDraft[K]) {
    setDraft(current => ({ ...current, [key]: value }));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = draft.name.trim();
    if (!name) {
      setNameError(true);
      nameRef.current?.focus();
      return;
    }
    onSave({ ...draft, name });
  }

  const Icon = product ? Pencil : PackagePlus;

  return createPortal(
    <dialog
      ref={dialogRef}
      aria-labelledby={headingId}
      onCancel={event => {
        event.preventDefault();
        onClose();
      }}
      className="fixed inset-0 m-auto w-[calc(100%-2rem)] max-w-xl max-h-[calc(100dvh-2rem)] overflow-hidden rounded-3xl border border-slate-200 bg-white p-0 text-slate-900 shadow-2xl backdrop:bg-slate-950/65 backdrop:backdrop-blur-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white motion-safe:animate-modal-pop"
    >
      <form onSubmit={submit} className="flex max-h-[calc(100dvh-2rem-2px)] min-h-0 flex-col">
        <div className="flex shrink-0 items-center gap-3 border-b border-orange-100 bg-orange-50 px-4 py-3 sm:px-6 sm:py-4 dark:border-slate-700 dark:bg-orange-500/10">
          <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-orange-100 text-orange-800 dark:bg-orange-500/20 dark:text-orange-200">
            <Icon className="size-5" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id={headingId} className="text-lg font-bold">{product ? 'แก้ไขสินค้า' : 'เพิ่มสินค้าใหม่'}</h2>
            {product && <p className="truncate text-sm text-slate-600 dark:text-slate-300">{product.name}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label="ปิดหน้าต่าง"
            className="grid size-11 shrink-0 cursor-pointer place-items-center rounded-xl text-slate-700 hover:bg-orange-100 focus-visible:outline-2 focus-visible:outline-orange-600 dark:text-slate-200 dark:hover:bg-white/10">
            <X className="size-5" aria-hidden="true" />
          </button>
        </div>

        <div className="min-h-0 space-y-5 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6 sm:py-5">
          <label className="block space-y-1.5 text-sm font-semibold">
            <span>ชื่อสินค้า / บริการ <span className="text-orange-800 dark:text-orange-300" aria-hidden="true">*</span></span>
            <input ref={nameRef} required value={draft.name} placeholder="เช่น โน้ตบุ๊ก หรือ ค่าติดตั้ง"
              aria-invalid={nameError} aria-describedby={nameError ? errorId : undefined}
              onChange={event => {
                change('name', event.target.value);
                setNameError(false);
              }}
              className={fieldClass}
            />
            {nameError && <span id={errorId} role="alert" className="block text-rose-700 dark:text-rose-300">กรุณาระบุชื่อสินค้าหรือบริการ</span>}
          </label>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <label className="space-y-1.5 text-sm font-semibold">
              <span>หมวดหมู่</span>
              <select value={draft.category} onChange={event => change('category', event.target.value as ProductDraft['category'])} className={fieldClass}>
                {Object.entries(PRODUCT_CATEGORY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <label className="space-y-1.5 text-sm font-semibold">
              <span>ประเภท</span>
              <select value={draft.item_type} onChange={event => change('item_type', event.target.value as ProductDraft['item_type'])} className={fieldClass}>
                <option value="hardware">อุปกรณ์</option>
                <option value="service">ค่าบริการ</option>
              </select>
            </label>
            <label className="space-y-1.5 text-sm font-semibold">
              <span>หน่วย</span>
              <select value={draft.unit} onChange={event => change('unit', event.target.value as ProductDraft['unit'])} className={fieldClass}>
                {PRODUCT_UNIT_OPTIONS.map(unit => <option key={unit} value={unit}>{unit}</option>)}
              </select>
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-white/5">
            <label className="min-w-0 space-y-1.5 text-sm font-semibold">
              <span>ราคาทุน (฿)</span>
              <NumberInput min={0} step="0.01" value={draft.cost_price}
                onChange={event => change('cost_price', Number(event.target.value) || 0)} className={fieldClass} />
            </label>
            <label className="min-w-0 space-y-1.5 text-sm font-semibold">
              <span>ราคาขาย (฿)</span>
              <NumberInput min={0} step="0.01" value={draft.sell_price}
                onChange={event => change('sell_price', Number(event.target.value) || 0)} className={fieldClass} />
            </label>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-slate-200 bg-slate-50 px-4 py-3 sm:px-6 dark:border-slate-700 dark:bg-slate-900">
          <button type="button" onClick={onClose}
            className="min-h-11 cursor-pointer rounded-xl border border-slate-300 px-4 text-sm font-semibold hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600 dark:border-slate-600 dark:hover:bg-slate-800">
            ยกเลิก
          </button>
          <button type="submit"
            className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl bg-orange-700 px-4 text-sm font-bold text-white hover:bg-orange-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600 dark:bg-orange-400 dark:text-slate-950 dark:hover:bg-orange-300">
            <Save className="size-4" aria-hidden="true" />
            {product ? 'บันทึกการแก้ไข' : 'เพิ่มสินค้า'}
          </button>
        </div>
      </form>
    </dialog>,
    document.body,
  );
}
