import { ModalBackdrop } from './ModalBackdrop';
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
        <ModalBackdrop
            className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-6 bg-black/65 dark:bg-black/80 backdrop-blur-sm overscroll-contain animate-fade-in"
            role="dialog"
            aria-modal="true"
            aria-label={ariaLabel || (typeof title === 'string' ? title : undefined)}
            onDismiss={closeOnBackdrop ? onClose : undefined}
        >
            <div
                onClick={(e) => e.stopPropagation()}
                className={`w-full ${maxWidthClass}
          max-h-[min(86dvh,calc(100dvh-1.5rem))]
          flex flex-col overflow-hidden
          rounded-3xl
          shadow-2xl border
          bg-white text-slate-900 border-slate-200/90
          dark:bg-[#12141A] dark:text-white dark:border-white/[0.12]
          animate-modal-pop
          ${accentClass} ${panelClassName}`}
            >
                {!hideHeader && (
                    <div className="flex items-center justify-between gap-2.5 px-4 py-3 border-b border-slate-200 dark:border-white/[0.1] flex-shrink-0">
                        <div className="flex items-center gap-2.5 min-w-0">
                            {icon && <div className="flex-shrink-0 text-[#FF6B00]">{icon}</div>}
                            <div className="min-w-0">
                                {title && (
                                    <h3 className="text-base font-bold leading-snug text-slate-900 dark:text-white break-words">
                                        {title}
                                    </h3>
                                )}
                                {subtitle && (
                                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2">
                                        {subtitle}
                                    </p>
                                )}
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={onClose}
                            aria-label="ปิดหน้าต่าง"
                            className="p-1.5 rounded-xl text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white
                bg-slate-100 dark:bg-white/[0.06] hover:bg-slate-200 dark:hover:bg-white/[0.12]
                transition-all duration-150 active:scale-[0.97] !min-h-11 size-11 flex items-center justify-center flex-shrink-0 cursor-pointer"
                        >
                            <X className="size-5" />
                        </button>
                    </div>
                )}

                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 text-xs">
                    {children}
                </div>

                {footer && (
                    <div className="flex-shrink-0 px-4 py-3 border-t border-slate-200 dark:border-white/[0.1] bg-slate-50 dark:bg-white/[0.02]">
                        {footer}
                    </div>
                )}
            </div>
        </ModalBackdrop>,
        document.body
    );
};

/** Shared input styling for crisp Light/Dark contrast inside modals. */
export const modalInputClass =
    'w-full rounded-xl px-3 py-1.5 sm:py-2 text-xs font-medium transition focus:outline-none focus:ring-2 focus:ring-[#FF6B00]/40 ' +
    'bg-white border border-slate-300 text-slate-900 placeholder:text-slate-400 ' +
    'dark:bg-slate-800 dark:border-slate-700 dark:text-white dark:placeholder:text-slate-500';

/** Shared label styling inside modals. */
export const modalLabelClass =
    'block text-[11px] font-bold mb-1 text-slate-700 dark:text-slate-300';

/** Shared primary action button. */
export const modalPrimaryBtnClass =
    'w-full min-h-[38px] sm:min-h-[42px] py-2 px-4 sm:px-5 rounded-xl font-extrabold text-xs transition-all duration-150 cursor-pointer flex items-center justify-center gap-1.5 ' +
    'bg-gradient-to-r from-[#FF6B00] to-[#E65A00] hover:from-[#FF8A24] hover:to-[#FF6B00] hover:brightness-105 text-black shadow-lg shadow-[#FF6B00]/25 border border-white/20 active:scale-[0.97] ' +
    'disabled:opacity-50 disabled:cursor-not-allowed';

/** Shared secondary/cancel button. */
export const modalSecondaryBtnClass =
    'w-full min-h-[38px] sm:min-h-[42px] py-2 px-4 sm:px-5 rounded-xl font-semibold text-xs transition-all duration-150 cursor-pointer flex items-center justify-center gap-1.5 active:scale-[0.97] ' +
    'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 ' +
    'dark:bg-white/[0.06] dark:hover:bg-white/[0.12] dark:text-slate-300 dark:border-white/[0.1]';
