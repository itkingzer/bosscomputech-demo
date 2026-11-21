import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

/**
 * Shared Modal shell.
 *
 * - Always rendered through a React Portal into `document.body`, so it can never
 *   be clipped by `overflow-hidden` / transformed ancestors (cards, grids, tables).
 * - Uses `z-[9999]` so it always sits above the sticky Top Navbar (`z-30`) and the
 *   slide-out Navigation Drawer (`z-40`).
 * - Crisp Light/Dark contrast: solid white surface in light mode, deep slate in dark.
 */
export interface ModalProps {
    open: boolean;
    onClose: () => void;
    /** Accessible label for the dialog */
    ariaLabel?: string;
    /** Optional title rendered in the header */
    title?: React.ReactNode;
    /** Optional subtitle under the title */
    subtitle?: React.ReactNode;
    /** Optional icon node rendered left of the title */
    icon?: React.ReactNode;
    /** Tailwind max-width class for the dialog panel */
    maxWidthClass?: string;
    /** Accent border class for the dialog panel */
    accentClass?: string;
    /** Extra classes for the dialog panel */
    panelClassName?: string;
    /** Hide the default header (title/subtitle/close) */
    hideHeader?: boolean;
    /** Lock body scroll while open (default true) */
    lockScroll?: boolean;
    /** Close when clicking the backdrop (default true) */
    closeOnBackdrop?: boolean;
    /** Close on Escape key (default true) */
    closeOnEscape?: boolean;
    children: React.ReactNode;
    /** Sticky footer area rendered outside the scroll region */
    footer?: React.ReactNode;
}

export const Modal: React.FC<ModalProps> = ({
    open,
    onClose,
    ariaLabel,
    title,
    subtitle,
    icon,
    maxWidthClass = 'max-w-lg',
    accentClass = 'border-[#FF6B00]/40',
    panelClassName = '',
    hideHeader = false,
    lockScroll = true,
    closeOnBackdrop = true,
    closeOnEscape = true,
    children,
    footer,
}) => {
    // Lock background scroll while open.
    useEffect(() => {
        if (!open || !lockScroll) return;
        const prevOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = prevOverflow;
        };
    }, [open, lockScroll]);

    // Close on Escape.
    useEffect(() => {
        if (!open || !closeOnEscape) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open, closeOnEscape, onClose]);

    if (!open) return null;

    return createPortal(
        <div
            className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center sm:p-4 bg-black/70 dark:bg-black/80 backdrop-blur-md overflow-y-auto overscroll-contain animate-fade-in"
            role="dialog"
            aria-modal="true"
            aria-label={ariaLabel || (typeof title === 'string' ? title : undefined)}
            onClick={closeOnBackdrop ? onClose : undefined}
        >
            <div
                onClick={(e) => e.stopPropagation()}
                className={`w-full sm:w-[95vw] ${maxWidthClass}
          max-h-[92dvh] sm:max-h-[90vh]
          flex flex-col overflow-hidden
          rounded-t-3xl sm:rounded-3xl
          shadow-2xl border
          bg-white text-slate-900 border-slate-200
          dark:bg-[#12141A] dark:text-white dark:border-white/[0.12]
          animate-modal-pop
          ${accentClass} ${panelClassName}`}
            >
                {/* Mobile drag handle */}
                <div className="sm:hidden flex justify-center pt-2.5 pb-1 flex-shrink-0">
                    <span className="h-1.5 w-10 rounded-full bg-slate-300 dark:bg-white/20" />
                </div>

                {!hideHeader && (
                    <div className="flex items-start justify-between gap-3 px-4 sm:px-6 py-3 sm:py-4 border-b border-slate-200 dark:border-white/[0.1] flex-shrink-0">
                        <div className="flex items-start gap-3 min-w-0">
                            {icon && <div className="flex-shrink-0">{icon}</div>}
                            <div className="min-w-0">
                                {title && (
                                    <h3 className="text-sm sm:text-base font-bold leading-tight text-slate-900 dark:text-white">
                                        {title}
                                    </h3>
                                )}
                                {subtitle && (
                                    <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                                        {subtitle}
                                    </p>
                                )}
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={onClose}
                            aria-label="ปิดหน้าต่าง"
                            className="p-2.5 rounded-xl text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white
                bg-slate-100 dark:bg-white/[0.06] hover:bg-slate-200 dark:hover:bg-white/[0.12]
                transition-all duration-150 active:scale-[0.97] min-w-[52px] min-h-[52px] flex items-center justify-center flex-shrink-0"
                        >
                            <X className="w-6 h-6" />
                        </button>
                    </div>
                )}

                <div className="flex-1 overflow-y-auto overscroll-contain px-4 sm:px-6 py-4 text-xs">
                    {children}
                </div>

                {footer && (
                    <div className="flex-shrink-0 px-4 sm:px-6 py-3 border-t border-slate-200 dark:border-white/[0.1] bg-slate-50 dark:bg-white/[0.02] pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                        {footer}
                    </div>
                )}
            </div>
        </div>,
        document.body
    );
};

/** Shared input styling for crisp Light/Dark contrast inside modals. */
export const modalInputClass =
    'w-full rounded-xl px-3 py-2 text-xs font-medium transition focus:outline-none focus:ring-2 focus:ring-[#FF6B00]/40 ' +
    'bg-white border border-slate-300 text-slate-900 placeholder:text-slate-400 ' +
    'dark:bg-slate-800 dark:border-slate-700 dark:text-white dark:placeholder:text-slate-500';

/** Shared label styling inside modals. */
export const modalLabelClass =
    'block text-[11px] font-bold mb-1 text-slate-700 dark:text-slate-300';

/** Shared primary action button. */
export const modalPrimaryBtnClass =
    'w-full min-h-[44px] py-2.5 px-5 rounded-xl font-extrabold text-xs transition-all duration-150 cursor-pointer flex items-center justify-center gap-1.5 ' +
    'bg-gradient-to-r from-[#FF6B00] to-[#E65A00] hover:from-[#FF8A24] hover:to-[#FF6B00] hover:brightness-105 text-black shadow-lg shadow-[#FF6B00]/25 border border-white/20 active:scale-[0.97] ' +
    'disabled:opacity-50 disabled:cursor-not-allowed';

/** Shared secondary/cancel button. */
export const modalSecondaryBtnClass =
    'w-full min-h-[44px] py-2.5 px-5 rounded-xl font-semibold text-xs transition-all duration-150 cursor-pointer flex items-center justify-center gap-1.5 active:scale-[0.97] ' +
    'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 ' +
    'dark:bg-white/[0.06] dark:hover:bg-white/[0.12] dark:text-slate-300 dark:border-white/[0.1]';
