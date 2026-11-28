import { useDepartmentReadOnly } from '../context/DepartmentAccess';
import { useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Check, Layers, Pencil, Plus, Search, ShoppingBag, X } from 'lucide-react';
import { type Product, type ProductCategory, PRODUCT_CATEGORY_LABELS } from '../types';
import { NumberInput } from './ui/FormInputs';
import { ListControls } from './ListControls';

const CATALOG_PAGE_SIZES = [10, 20, 30, 100];

interface ProductCatalogModalProps {
  products: Product[];
  selectionEnabled?: boolean;
  description: string;
  confirmLabel: string;
  priceLabel: string;
  getPrice: (product: Product) => number;
  getStock: (name: string) => number;
  quantities: Partial<Record<string, number>>;
  total: number;
  onToggle: (product: Product) => void;
  onQuantityChange: (id: string, quantity: number) => void;
  onConfirm: () => void;
  onClose: () => void;
  onAdd?: () => void;
  onEdit?: (product: Product) => void;
  renderActions?: (product: Product) => ReactNode;
}

export function ProductCatalogModal({
  products, selectionEnabled = true, description, confirmLabel, priceLabel, getPrice, getStock, quantities, total,
  onToggle, onQuantityChange, onConfirm, onClose, onAdd, onEdit, renderActions,
}: ProductCatalogModalProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'all' | ProductCategory>('all');
  const [sortBy, setSortBy] = useState<'stock_desc' | 'stock_asc' | 'price_desc' | 'price_asc' | 'name'>('stock_desc');
  const [pageSize, setPageSize] = useState(CATALOG_PAGE_SIZES[0]);
  const [requestedPage, setRequestedPage] = useState(1);
  const listRef = useRef<HTMLDivElement>(null);
  const readOnly = useDepartmentReadOnly();
  const canSelect = selectionEnabled && !readOnly;
  const selectedCount = Object.keys(quantities).length;
  const query = searchQuery.trim().toLowerCase();
  const filteredCatalog = useMemo(() => products.filter(item =>
    item.name.toLowerCase().includes(query) &&
    (categoryFilter === 'all' || item.category === categoryFilter),
  ).sort((a, b) => {
    switch (sortBy) {
      case 'stock_desc': return getStock(b.name) - getStock(a.name);
      case 'stock_asc': return getStock(a.name) - getStock(b.name);
      case 'price_desc': return getPrice(b) - getPrice(a);
      case 'price_asc': return getPrice(a) - getPrice(b);
      case 'name': return a.name.localeCompare(b.name, 'th');
    }
  }), [products, query, categoryFilter, sortBy, getStock, getPrice]);
  const totalPages = Math.max(1, Math.ceil(filteredCatalog.length / pageSize));
  const page = Math.min(requestedPage, totalPages);
  const startIndex = (page - 1) * pageSize;
  const pageItems = filteredCatalog.slice(startIndex, startIndex + pageSize);

  const changePage = (nextPage: number) => {
    setRequestedPage(nextPage);
    listRef.current?.scrollTo({ top: 0 });
  };

  return createPortal(
    <div className="fixed inset-0 z-[10001] flex items-center justify-center p-4 sm:p-6 bg-black/60 backdrop-blur-sm animate-fade-in overscroll-contain">
      <div role="dialog" aria-modal="true" aria-label="แคตตาล็อกสินค้าและบริการ" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-800 shadow-2xl rounded-3xl w-full sm:w-[94vw] max-w-6xl max-h-[94dvh] sm:max-h-[86dvh] flex flex-col overflow-hidden animate-modal-pop">

        {/* Header */}
        <div className="p-4 sm:p-5 bg-slate-50/90 dark:bg-slate-900/95 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 flex-shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-2.5 rounded-2xl bg-[#FF6B00]/15 text-[#E65A00] dark:text-[#FF6B00] border border-[#FF6B00]/30">
              <Layers className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white leading-tight">แคตตาล็อกสินค้า & บริการ</h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">{description}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="ปิดแคตตาล็อก"
            className="p-2.5 rounded-xl text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white bg-slate-100 dark:bg-white/[0.04] hover:bg-slate-200 dark:hover:bg-white/[0.08] transition min-w-[44px] min-h-[44px] flex items-center justify-center flex-shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Toolbar: search / category / sort / add */}
        <div className="p-3 sm:p-4 border-b border-slate-200 dark:border-white/[0.06] space-y-2.5 flex-shrink-0">
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-500" />
              <input
                type="text"
                aria-label="ค้นหาชื่อสินค้า"
                placeholder="ค้นหาชื่อสินค้า..."
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); changePage(1); }}
                className="w-full rounded-xl pl-9 pr-3 py-2 text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-300 dark:border-slate-700 placeholder-slate-400 focus:outline-none focus:border-blue-500"
              />
            </div>
            <select
              aria-label="เรียงสินค้า"
              value={sortBy}
              onChange={(e) => { setSortBy(e.target.value as typeof sortBy); changePage(1); }}
              className="rounded-xl px-3 py-2 text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-300 dark:border-slate-700 focus:outline-none focus:border-blue-500"
            >
              <option value="stock_desc" className="bg-white dark:bg-[#12141A]">สต๊อกมาก → น้อย</option>
              <option value="stock_asc" className="bg-white dark:bg-[#12141A]">สต๊อกน้อย → มาก</option>
              <option value="price_desc" className="bg-white dark:bg-[#12141A]">{priceLabel}แพง → ถูก</option>
              <option value="price_asc" className="bg-white dark:bg-[#12141A]">{priceLabel}ถูก → แพง</option>
              <option value="name" className="bg-white dark:bg-[#12141A]">ชื่อ ก-ฮ</option>
            </select>
            {!readOnly && onAdd && (
              <button
                type="button"
                onClick={onAdd}
                className="inline-flex items-center justify-center gap-1.5 min-h-11 px-3 py-2 rounded-xl border bg-emerald-700 hover:bg-emerald-800 text-white border-emerald-700 text-[11px] font-bold transition active:scale-[0.97] cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>เพิ่มสินค้าใหม่</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
            {(['all', 'pc_notebook', 'printer', 'cctv_network', 'service', 'general'] as ('all' | ProductCategory)[]).map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => { setCategoryFilter(cat); changePage(1); }}
                className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border whitespace-nowrap transition active:scale-[0.97] cursor-pointer ${categoryFilter === cat
                  ? 'bg-[#FF6B00]/15 dark:bg-[#FF6B00]/20 border-[#FF6B00]/60 dark:border-[#FF6B00]/50 text-[#C2410C] dark:text-[#FF6B00]'
                  : 'bg-slate-100 dark:bg-white/[0.02] border-slate-200 dark:border-white/[0.08] text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
              >
                {cat === 'all' ? 'ทั้งหมด' : PRODUCT_CATEGORY_LABELS[cat]}
              </button>
            ))}
          </div>
          <ListControls
            from={pageItems.length ? startIndex + 1 : 0}
            to={startIndex + pageItems.length}
            total={filteredCatalog.length}
            page={page}
            totalPages={totalPages}
            pageSize={pageSize}
            pageSizeOptions={CATALOG_PAGE_SIZES}
            onPageSizeChange={(size) => { setPageSize(size); changePage(1); }}
            onPageChange={changePage}
            hideSort
            showPageButtonLabels
            className="[&_button]:min-h-11 [&_button]:min-w-11 [&_select]:min-h-11 [&_select]:focus-visible:ring-2"
          />
        </div>

        {/* Product list */}
        <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 sm:p-4">
          {pageItems.length === 0 ? (
            <div className="p-8 text-center">
              <ShoppingBag className="w-10 h-10 text-slate-400 dark:text-slate-600 mx-auto mb-2" />
              <p className="text-xs text-slate-500 dark:text-slate-400">ไม่พบสินค้าที่ตรงกับเงื่อนไข</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {pageItems.map((item) => {
                const isSelected = canSelect && quantities[item.id] !== undefined;
                const stock = getStock(item.name);
                return (
                  <div
                    key={item.id}
                    className={`p-3 rounded-2xl border transition-all duration-150 ${isSelected
                      ? 'bg-[#FF6B00]/10 border-[#FF6B00]/50'
                      : 'bg-slate-50 dark:bg-slate-800/70 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-white/[0.05]'
                      }`}
                  >
                    <button type="button" disabled={!canSelect} aria-pressed={canSelect ? isSelected : undefined} onClick={() => onToggle(item)} className="w-full text-left cursor-pointer disabled:cursor-default rounded-md focus-visible:ring-2 focus-visible:ring-blue-500">
                      <span className="flex items-start justify-between gap-2 mb-1.5">
                          <span className="min-w-0 flex-1">
                            <span className="block text-xs font-bold text-slate-900 dark:text-white leading-snug truncate">{item.name}</span>
                            <span className="block text-[10px] text-slate-500 dark:text-slate-400">{item.item_type === 'service' ? 'ค่าบริการ' : 'อุปกรณ์'} • {item.unit}</span>
                          </span>
                          {canSelect && <span className={`w-5 h-5 rounded-md border flex items-center justify-center flex-shrink-0 ${isSelected ? 'bg-[#FF6B00] border-[#FF6B00]' : 'border-slate-300 dark:border-white/20'
                            }`}>
                            {isSelected && <Check className="w-3.5 h-3.5 text-white" />}
                          </span>}
                      </span>
                      <span className="flex items-center justify-between gap-2 text-[10px]">
                        <span className="text-emerald-700 dark:text-emerald-300 font-mono font-bold tabular-nums">฿{getPrice(item).toLocaleString('th-TH')}</span>
                        <span className={`font-mono tabular-nums ${stock > 0 ? 'text-blue-700 dark:text-blue-300' : 'text-slate-500'}`}>
                          สต๊อก: {stock}
                        </span>
                      </span>
                    </button>
                    {(isSelected || (!readOnly && (onEdit || renderActions))) && (
                      <div className="mt-2 flex items-center gap-2">
                        {isSelected && (
                          <>
                            <span className="text-[10px] text-slate-600 dark:text-slate-400">จำนวน:</span>
                            <NumberInput
                              finishOnEnter
                              min={1}
                              value={quantities[item.id]}
                              aria-label={"จำนวน " + item.name}
                              onChange={(e) => onQuantityChange(item.id, Number(e.target.value) || 1)}
                              className="w-16 rounded-lg px-2 py-1 text-[11px] bg-white dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-300 dark:border-slate-700 font-mono tabular-nums focus:outline-none focus:border-blue-500"
                            />
                          </>
                        )}
                        {!readOnly && onEdit && (
                          <button
                            type="button"
                            onClick={() => onEdit(item)}
                            aria-label={`แก้ไข ${item.name}`}
                            className="ml-auto inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-lg px-2 text-xs font-semibold text-slate-700 hover:bg-slate-200 focus-visible:outline-2 focus-visible:outline-orange-600 dark:text-slate-200 dark:hover:bg-white/10"
                          >
                            <Pencil className="size-3.5" aria-hidden="true" />
                            แก้ไข
                          </button>
                        )}
                        {!readOnly && (isSelected || !canSelect) && renderActions?.(item)}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 sm:p-4 bg-slate-50/90 dark:bg-slate-900/95 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 flex-shrink-0">
          <div className="text-[11px] text-slate-600 dark:text-slate-400">
            {canSelect && <>เลือกแล้ว <strong className="text-[#E65A00] dark:text-[#FF6B00] font-mono">{selectedCount}</strong> รายการ
            {selectedCount > 0 && <span className="ml-1 font-mono text-emerald-700 dark:text-emerald-300">• ฿{total.toLocaleString('th-TH', { maximumFractionDigits: 0 })}</span>}</>}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-2 rounded-xl bg-slate-100 dark:bg-white/[0.04] hover:bg-slate-200 dark:hover:bg-white/[0.08] border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold transition active:scale-[0.97] cursor-pointer"
            >
              {canSelect ? 'ยกเลิก' : 'ปิด'}
            </button>
            {canSelect && <button
              type="button"
              onClick={onConfirm}
              disabled={selectedCount === 0}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#FF6B00] hover:bg-[#FF8A33] disabled:opacity-40 disabled:cursor-not-allowed text-black dark:text-white text-xs font-bold shadow-lg shadow-[#FF6B00]/30 transition active:scale-[0.97] cursor-pointer"
            >
              <Check className="w-4 h-4" />
              <span>
                {confirmLabel} ({selectedCount})
              </span>
            </button>}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
