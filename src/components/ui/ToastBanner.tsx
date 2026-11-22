import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle, X } from 'lucide-react';

interface ToastBannerProps {
  message: string;
  onClose?: () => void;
  durationMs?: number;
}

/**
 * Unified Toast Notification:
 * - Mobile (< sm): top banner
 * - Desktop (>= sm): bottom-right corner
 * Auto-dismisses after `durationMs` (default 3000ms).
 */
export const ToastBanner: React.FC<ToastBannerProps> = ({
  message,
  onClose,
  durationMs = 3000
}) => {
  useEffect(() => {
    if (!message || !onClose) return;
    const timer = window.setTimeout(() => {
      onClose();
    }, durationMs);
    return () => window.clearTimeout(timer);
  }, [message, onClose, durationMs]);

  if (!message) return null;

  return createPortal(
    <div
      role="status"
      aria-live="polite"
      className="fixed top-3 left-3 right-3 sm:top-auto sm:left-auto sm:bottom-5 sm:right-5 sm:max-w-md z-[10060] pointer-events-none flex justify-center sm:justify-end"
    >
      <div className="pointer-events-auto w-full sm:w-auto px-4 py-3 rounded-2xl bg-white/95 dark:bg-slate-900/95 text-slate-900 dark:text-white border border-[#FF6B00]/60 shadow-2xl backdrop-blur-xl text-xs font-semibold flex items-center gap-2.5 animate-modal-pop">
        <CheckCircle className="w-4 h-4 text-[#FF6B00] flex-shrink-0" />
        <span className="flex-1 min-w-0 leading-relaxed">{message}</span>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="ปิดการแจ้งเตือน"
            className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10 transition cursor-pointer flex-shrink-0"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>,
    document.body
  );
};
