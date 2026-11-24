import React, { useMemo, useState } from 'react';
import { ArrowDownWideNarrow, ArrowUpNarrowWide, ChevronLeft, ChevronRight, ListFilter } from 'lucide-react';

export type SortDirection = 'newest' | 'oldest' | 'high' | 'low';

export interface ListControlsConfig<T> {
    /** Accessor for the date used by "newest"/"oldest" sorting. */
    getDate?: (item: T) => string | number | null | undefined;
    /** Accessor for the numeric value used by "high"/"low" sorting. */
    getValue?: (item: T) => number | null | undefined;
    /** Initial sort direction. Defaults to 'newest'. */
    initialSort?: SortDirection;
    /** Initial page size. Defaults to 10. Use 0 for "all". */
    initialPageSize?: number;
}

export interface ListControlsResult<T> {
    /** The sorted + paginated slice ready to render. */
    pageItems: T[];
    /** Total number of items before pagination. */
    total: number;
    /** 1-based index of the first visible item (0 when empty). */
    from: number;
    /** 1-based index of the last visible item (0 when empty). */
    to: number;
    page: number;
    totalPages: number;
    pageSize: number;
    sort: SortDirection;
    setPage: (page: number) => void;
    setPageSize: (size: number) => void;
    setSort: (sort: SortDirection) => void;
    /** Reset to page 1 (call when upstream filters change). */
    resetPage: () => void;
}

const PAGE_SIZE_OPTIONS = [10, 20, 50, 0];

const SORT_OPTIONS: { value: SortDirection; label: string }[] = [
    { value: 'newest', label: 'ใหม่ไปเก่า' },
    { value: 'oldest', label: 'เก่าไปใหม่' },
    { value: 'high', label: 'มาก → น้อย' },
    { value: 'low', label: 'น้อย → มาก' }
];

const toTime = (value: string | number | null | undefined): number => {
    if (value === null || value === undefined) return 0;
    if (typeof value === 'number') return value;
    const parsed = new Date(value).getTime();
    return Number.isNaN(parsed) ? 0 : parsed;
};

/**
 * Hook that sorts and paginates any array. Pair it with `<ListControls />`
 * to render the control bar. Works with any data shape via accessors.
 */
export function useListControls<T>(
    items: T[],
    config: ListControlsConfig<T> = {}
): ListControlsResult<T> {
    const { getDate, getValue, initialSort = 'newest', initialPageSize = 10 } = config;
    const [sort, setSortState] = useState<SortDirection>(initialSort);
    const [pageSize, setPageSizeState] = useState<number>(initialPageSize);
    const [page, setPage] = useState(1);

    const sorted = useMemo(() => {
        const copy = [...items];
        const needsDate = sort === 'newest' || sort === 'oldest';
        const needsValue = sort === 'high' || sort === 'low';

        if (needsDate && getDate) {
            copy.sort((a, b) => {
                const diff = toTime(getDate(a)) - toTime(getDate(b));
                return sort === 'newest' ? -diff : diff;
            });
        } else if (needsValue && getValue) {
            copy.sort((a, b) => {
                const diff = (getValue(a) || 0) - (getValue(b) || 0);
                return sort === 'high' ? -diff : diff;
            });
        }
        return copy;
    }, [items, sort, getDate, getValue]);

    const total = sorted.length;
    const effectivePageSize = pageSize === 0 ? Math.max(total, 1) : pageSize;
    const totalPages = Math.max(1, Math.ceil(total / effectivePageSize));
    const safePage = Math.min(Math.max(page, 1), totalPages);
    const startIndex = (safePage - 1) * effectivePageSize;
    const pageItems = sorted.slice(startIndex, startIndex + effectivePageSize);

    const from = total === 0 ? 0 : startIndex + 1;
    const to = total === 0 ? 0 : Math.min(startIndex + effectivePageSize, total);

    const setSort = (next: SortDirection) => {
        setSortState(next);
        setPage(1);
    };
    const setPageSize = (size: number) => {
        setPageSizeState(size);
        setPage(1);
    };

    return {
        pageItems,
        total,
        from,
        to,
        page: safePage,
        totalPages,
        pageSize,
        sort,
        setPage,
        setPageSize,
        setSort,
        resetPage: () => setPage(1)
    };
}

interface ListControlsProps {
    /** 1-based index of the first visible item. */
    from: number;
    /** 1-based index of the last visible item. */
    to: number;
    /** Total number of items. */
    total: number;
    page: number;
    totalPages: number;
    pageSize: number;
    sort: SortDirection;
    onSortChange: (sort: SortDirection) => void;
    onPageSizeChange: (size: number) => void;
    onPageChange: (page: number) => void;
    /** Optional label for the sort dropdown, e.g. "เรียงตามวันที่". */
    sortLabel?: string;
    /** Optional unit noun for the count text, e.g. "รายการ" / "ออเดอร์". */
    unit?: string;
    /** Hide the sort selector (e.g. for lists that only need paging). */
    hideSort?: boolean;
    /** Custom page-size options (e.g. [10, 20, 30]). Defaults to [10, 20, 50, 0]. */
    pageSizeOptions?: number[];
    className?: string;
}

/**
 * Reusable sort + page-size + pagination bar.
 * Renders "แสดง X–Y จาก Z รายการ" and Previous/Next controls.
 */
export const ListControls: React.FC<ListControlsProps> = ({
    from,
    to,
    total,
    page,
    totalPages,
    pageSize,
    sort,
    onSortChange,
    onPageSizeChange,
    onPageChange,
    sortLabel = 'เรียงตาม',
    unit = 'รายการ',
    hideSort = false,
    pageSizeOptions = PAGE_SIZE_OPTIONS,
    className = ''
}) => {
    const SortIcon = sort === 'newest' || sort === 'high' ? ArrowDownWideNarrow : ArrowUpNarrowWide;

    return (
        <div
            className={`list-controls-bar flex flex-wrap items-center justify-between gap-1.5 sm:gap-2.5 px-2.5 py-1.5 sm:p-2.5 rounded-xl sm:rounded-2xl bg-white/[0.03] border border-slate-200/80 dark:border-white/[0.08] ${className}`}
        >
            <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                {!hideSort && (
                    <div className="flex items-center gap-1">
                        <SortIcon className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-slate-400 flex-shrink-0" />
                        <select
                            value={sort}
                            onChange={(e) => onSortChange(e.target.value as SortDirection)}
                            aria-label={sortLabel}
                            className="liquid-glass-input rounded-lg sm:rounded-xl px-2 py-0.5 sm:px-2.5 sm:py-1.5 text-[11px] text-slate-900 dark:text-white focus:outline-none cursor-pointer"
                        >
                            {SORT_OPTIONS.map((opt) => (
                                <option key={opt.value} value={opt.value} className="bg-white dark:bg-[#12141A]">
                                    {opt.label}
                                </option>
                            ))}
                        </select>
                    </div>
                )}

                <div className="flex items-center gap-1">
                    <ListFilter className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-slate-400 flex-shrink-0" />
                    <select
                        value={pageSize}
                        onChange={(e) => onPageSizeChange(Number(e.target.value))}
                        aria-label="จำนวนต่อหน้า"
                        className="liquid-glass-input rounded-lg sm:rounded-xl px-2 py-0.5 sm:px-2.5 sm:py-1.5 text-[11px] text-slate-900 dark:text-white focus:outline-none cursor-pointer"
                    >
                        {pageSizeOptions.map((size) => (
                            <option key={size} value={size} className="bg-white dark:bg-[#12141A]">
                                {size === 0 ? 'ทั้งหมด' : `${size} / หน้า`}
                            </option>
                        ))}
                    </select>
                </div>
            </div>

            <div className="flex items-center justify-between sm:justify-end gap-1.5 sm:gap-2 ml-auto">
                <span className="text-[10px] sm:text-[11px] text-slate-500 dark:text-slate-400 whitespace-nowrap">
                    <span className="hidden sm:inline">แสดง </span>
                    <span className="text-slate-900 dark:text-white font-semibold">{from}</span>–
                    <span className="text-slate-900 dark:text-white font-semibold">{to}</span>
                    <span className="hidden sm:inline"> จาก</span>
                    <span className="sm:hidden">/</span>{' '}
                    <span className="text-slate-900 dark:text-white font-semibold">{total}</span> {unit}
                </span>
                <div className="flex items-center gap-1">
                    <button
                        type="button"
                        onClick={() => onPageChange(page - 1)}
                        disabled={page <= 1}
                        aria-label="หน้าก่อนหน้า"
                        className="p-1 sm:p-1.5 rounded-lg sm:rounded-xl bg-slate-100 dark:bg-white/[0.06] hover:bg-slate-200 dark:hover:bg-white/[0.12] text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-white/[0.1] transition cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed w-7 h-7 sm:w-9 sm:h-9 flex items-center justify-center"
                    >
                        <ChevronLeft className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    </button>
                    <span className="text-[10px] sm:text-[11px] text-slate-600 dark:text-slate-300 font-mono px-0.5 sm:px-1 whitespace-nowrap">
                        {page}/{totalPages}
                    </span>
                    <button
                        type="button"
                        onClick={() => onPageChange(page + 1)}
                        disabled={page >= totalPages}
                        aria-label="หน้าถัดไป"
                        className="p-1 sm:p-1.5 rounded-lg sm:rounded-xl bg-slate-100 dark:bg-white/[0.06] hover:bg-slate-200 dark:hover:bg-white/[0.12] text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-white/[0.1] transition cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed w-7 h-7 sm:w-9 sm:h-9 flex items-center justify-center"
                    >
                        <ChevronRight className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ListControls;
