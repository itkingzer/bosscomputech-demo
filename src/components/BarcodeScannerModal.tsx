import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Html5Qrcode } from 'html5-qrcode';
import { Camera, X, ScanLine, ShieldAlert, Loader2, RefreshCw } from 'lucide-react';

interface BarcodeScannerModalProps {
    /** Whether the modal is open */
    open: boolean;
    /** Called with the decoded barcode/QR text on a successful scan */
    onScan: (decodedText: string) => void;
    /** Called when the user closes the modal (cancel / backdrop / after scan) */
    onClose: () => void;
    /** Optional title shown in the modal header */
    title?: string;
    /** Optional helper text shown under the title */
    hint?: string;
}

const SCANNER_ELEMENT_ID = 'bc-barcode-scanner-region';
const PREFERRED_CAMERA_KEY = 'boss_scanner_camera_id';

interface CameraDevice {
    id: string;
    label: string;
}

/**
 * Pick the main 1x rear camera on multi-lens phones (avoiding ultra-wide / macro / telephoto).
 */
function pickBestBackCameraId(cameras: CameraDevice[]): string | null {
    if (cameras.length === 0) return null;

    const savedId = (() => {
        try {
            return localStorage.getItem(PREFERRED_CAMERA_KEY);
        } catch {
            return null;
        }
    })();
    if (savedId && cameras.some((c) => c.id === savedId)) {
        return savedId;
    }

    const scoreCamera = (cam: CameraDevice, idx: number): number => {
        const lbl = (cam.label || '').toLowerCase();
        if (/front|user|selfie|หน้า/.test(lbl)) return -1000;

        let score = 0;
        if (/back|rear|environment|หลัง/.test(lbl)) score += 100;
        if (/main|standard|1x|camera2\s*0\b/.test(lbl)) score += 60;
        // Penalize ultra-wide, macro, telephoto, depth lenses that struggle with close barcode focus
        if (/ultra|wide|0\.5|0\.6|macro|tele|depth|bokeh|tof/.test(lbl)) score -= 80;
        // Slight preference for earlier enumerated back camera (Android usually puts main 1x at index 0)
        score -= idx;
        return score;
    };

    const ranked = [...cameras]
        .map((cam, idx) => ({ cam, score: scoreCamera(cam, idx) }))
        .sort((a, b) => b.score - a.score);

    return ranked[0].score > -500 ? ranked[0].cam.id : cameras[0].id;
}

/**
 * Reusable mobile camera Barcode / QR scanner modal.
 *
 * - Uses Html5Qrcode with the rear camera (facingMode: "environment").
 * - Supports Code-128, EAN-13, Code-39 and QR Code product-box barcodes.
 * - Provides a viewfinder guide box, Thai permission/HTTPS fallback messaging,
 *   a manual cancel button, and optional vibration feedback on success.
 * - Always stops & clears the camera stream on scan / close so it never stays locked.
 */
export const BarcodeScannerModal: React.FC<BarcodeScannerModalProps> = ({
    open,
    onScan,
    onClose,
    title = 'สแกนบาร์โค้ด / QR Code',
    hint = 'ส่องกล้องไปที่บาร์โค้ดบนกล่องสินค้า (Code-128, EAN-13, Code-39, QR Code)'
}) => {
    const scannerRef = useRef<Html5Qrcode | null>(null);
    const hasScannedRef = useRef(false);
    const onScanRef = useRef(onScan);
    const onCloseRef = useRef(onClose);
    const [error, setError] = useState<string | null>(null);
    const [starting, setStarting] = useState(false);
    const [cameras, setCameras] = useState<CameraDevice[]>([]);
    const [activeCameraId, setActiveCameraId] = useState<string | null>(null);
    const [cameraSwitchNonce, setCameraSwitchNonce] = useState(0);

    useEffect(() => {
        onScanRef.current = onScan;
        onCloseRef.current = onClose;
    }, [onScan, onClose]);

    // Stop & release the camera stream safely (idempotent).
    const stopScanner = async (targetScanner?: Html5Qrcode | null) => {
        const scanner = targetScanner ?? scannerRef.current;
        if (!targetScanner) {
            scannerRef.current = null;
        } else if (scannerRef.current === targetScanner) {
            scannerRef.current = null;
        }
        if (!scanner) return;
        try {
            if (scanner.isScanning) {
                await scanner.stop();
            }
        } catch {
            /* ignore: already stopped */
        }
        try {
            scanner.clear();
        } catch {
            /* ignore: element already cleared */
        }
    };

    useEffect(() => {
        if (!open) return;

        let cancelled = false;
        hasScannedRef.current = false;
        setError(null);
        setStarting(true);

        const prevOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';

        // Give the portal DOM a tick to mount the scanner region before init.
        const timer = window.setTimeout(async () => {
            if (cancelled) return;
            // HTTPS / secure-context guard (camera requires a secure origin).
            const isSecure =
                window.isSecureContext ||
                window.location.hostname === 'localhost' ||
                window.location.hostname === '127.0.0.1';

            if (!isSecure) {
                if (!cancelled) {
                    setError(
                        'กล้องต้องใช้งานผ่าน HTTPS เท่านั้น (หรือ localhost) — กรุณาเปิดเว็บไซต์ด้วย https:// แล้วลองใหม่อีกครั้ง'
                    );
                    setStarting(false);
                }
                return;
            }

            if (!navigator.mediaDevices?.getUserMedia) {
                if (!cancelled) {
                    setError('อุปกรณ์หรือเบราว์เซอร์นี้ไม่รองรับการเปิดกล้อง — กรุณาใช้มือถือ/แท็บเล็ตที่ทันสมัย');
                    setStarting(false);
                }
                return;
            }

            const scanner = new Html5Qrcode(SCANNER_ELEMENT_ID, { verbose: false });
            try {
                scannerRef.current = scanner;

                // Enumerate cameras to pick the main 1x rear lens (instead of ultra-wide) on multi-camera phones
                let targetCamera: string | { facingMode: 'environment' } = { facingMode: 'environment' };
                try {
                    const detected = await Html5Qrcode.getCameras();
                    if (!cancelled && detected.length > 0) {
                        const list = detected.map((d) => ({ id: d.id, label: d.label || `กล้อง ${d.id.slice(0, 6)}` }));
                        setCameras(list);
                        const chosenId =
                            activeCameraId && list.some((c) => c.id === activeCameraId)
                                ? activeCameraId
                                : pickBestBackCameraId(list);
                        if (chosenId) {
                            setActiveCameraId(chosenId);
                            targetCamera = chosenId;
                        }
                    }
                } catch {
                    /* fallback to facingMode: 'environment' */
                }

                if (cancelled) return;

                await scanner.start(
                    targetCamera,
                    {
                        fps: 10,
                        qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
                            const edge = Math.floor(Math.min(viewfinderWidth, viewfinderHeight) * 0.72);
                            return { width: edge, height: edge };
                        },
                        aspectRatio: 1.0
                    },
                    (decodedText) => {
                        if (cancelled || hasScannedRef.current) return;
                        hasScannedRef.current = true;
                        navigator.vibrate?.(100);
                        void stopScanner(scanner).finally(() => {
                            onScanRef.current(decodedText);
                            onCloseRef.current();
                        });
                    },
                    () => {
                        /* per-frame decode failures are expected; ignore */
                    }
                );

                // If user closed modal while scanner.start() was pending, stop stream immediately.
                if (cancelled) {
                    await stopScanner(scanner);
                    return;
                }
                setStarting(false);
            } catch (err) {
                await stopScanner(scanner);
                if (cancelled) return;
                const message = err instanceof Error ? err.message : String(err);
                const denied = /permission|denied|notallowed/i.test(message);
                setError(
                    denied
                        ? 'ไม่ได้รับอนุญาตให้ใช้กล้อง — กรุณากด "อนุญาต" (Allow) การเข้าถึงกล้องในการตั้งค่าเบราว์เซอร์ แล้วลองใหม่'
                        : 'ไม่สามารถเปิดกล้องได้ — กรุณาตรวจสอบว่าอุปกรณ์มีกล้องและอนุญาตสิทธิ์การใช้งานกล้องแล้ว'
                );
                setStarting(false);
            }
        }, 60);

        return () => {
            cancelled = true;
            document.body.style.overflow = prevOverflow;
            window.clearTimeout(timer);
            void stopScanner();
        };
    }, [open, cameraSwitchNonce]);

    const handleCycleCamera = () => {
        if (cameras.length <= 1) return;
        const currentIdx = cameras.findIndex((c) => c.id === activeCameraId);
        const nextCam = cameras[(currentIdx + 1) % cameras.length];
        setActiveCameraId(nextCam.id);
        try {
            localStorage.setItem(PREFERRED_CAMERA_KEY, nextCam.id);
        } catch {
            /* ignore */
        }
        setCameraSwitchNonce((n) => n + 1);
    };

    // Close on Escape key.
    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.stopPropagation();
                handleClose();
            }
        };
        window.addEventListener('keydown', onKey, true);
        return () => window.removeEventListener('keydown', onKey, true);
    }, [open]);

    const handleClose = () => {
        void stopScanner();
        onCloseRef.current();
    };

    if (!open) return null;

    return createPortal(
        <div
            className="fixed inset-0 z-[10050] flex items-center justify-center p-3 sm:p-4 bg-black/70 backdrop-blur-sm overflow-y-auto overscroll-contain animate-fade-in"
            role="dialog"
            aria-modal="true"
            aria-label={title}
            onClick={handleClose}
        >
            <div
                className="w-full max-w-md max-h-[92dvh] overflow-y-auto overscroll-contain rounded-3xl shadow-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#12141A] text-slate-900 dark:text-white animate-modal-pop"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-slate-200 dark:border-white/10">
                    <div className="flex items-start gap-3 min-w-0">
                        <div className="p-2 rounded-xl bg-[#FF6B00]/15 text-[#E65A00] dark:text-[#FF6B00] border border-[#FF6B00]/30 flex-shrink-0">
                            <Camera className="w-5 h-5" />
                        </div>
                        <div className="min-w-0">
                            <h3 className="text-sm font-bold leading-tight">{title}</h3>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{hint}</p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={handleClose}
                        aria-label="ปิดหน้าสแกน"
                        className="p-2 rounded-xl text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white bg-slate-100 dark:bg-white/[0.06] hover:bg-slate-200 dark:hover:bg-white/[0.12] transition-all duration-150 active:scale-[0.97] min-w-[44px] min-h-[44px] flex items-center justify-center flex-shrink-0"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Viewfinder */}
                <div className="relative bg-black">
                    <div id={SCANNER_ELEMENT_ID} className="w-full min-h-[280px] [&_video]:object-cover" />

                    {/* Scanning guide overlay */}
                    {!error && (
                        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                            <div className="relative w-[72%] aspect-square max-w-[280px]">
                                {/* Corner brackets */}
                                <span className="absolute -top-px -left-px w-8 h-8 border-t-4 border-l-4 border-[#FF6B00] rounded-tl-lg" />
                                <span className="absolute -top-px -right-px w-8 h-8 border-t-4 border-r-4 border-[#FF6B00] rounded-tr-lg" />
                                <span className="absolute -bottom-px -left-px w-8 h-8 border-b-4 border-l-4 border-[#FF6B00] rounded-bl-lg" />
                                <span className="absolute -bottom-px -right-px w-8 h-8 border-b-4 border-r-4 border-[#FF6B00] rounded-br-lg" />
                                {/* Animated scan line */}
                                <span className="absolute left-2 right-2 top-1/2 h-0.5 bg-[#FF6B00]/80 shadow-[0_0_12px_2px_rgba(255,107,0,0.7)] animate-pulse" />
                            </div>
                        </div>
                    )}

                    {/* Starting spinner */}
                    {starting && !error && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/60 text-white">
                            <Loader2 className="w-7 h-7 animate-spin text-[#FF6B00]" />
                            <span className="text-xs font-medium">กำลังเปิดกล้อง...</span>
                        </div>
                    )}

                    {/* Error fallback */}
                    {error && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-slate-50 dark:bg-[#12141A] px-6 text-center">
                            <div className="p-3 rounded-2xl bg-red-100 text-red-700 border border-red-300 dark:bg-red-500/15 dark:text-red-400 dark:border-red-500/30">
                                <ShieldAlert className="w-7 h-7" />
                            </div>
                            <p className="text-xs leading-relaxed text-slate-700 dark:text-slate-200">{error}</p>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-5 py-4 flex items-center justify-between gap-2 border-t border-slate-200 dark:border-white/10">
                    <span className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400 min-w-0 truncate">
                        <ScanLine className="w-3.5 h-3.5 flex-shrink-0" />
                        <span className="truncate">ระบบจะกรอก S/N ให้อัตโนมัติเมื่อสแกนสำเร็จ</span>
                    </span>
                    <div className="flex items-center gap-2 flex-shrink-0">
                        {cameras.length > 1 && (
                            <button
                                type="button"
                                onClick={handleCycleCamera}
                                title="สลับเลนส์ / กล้อง"
                                className="px-3 py-2.5 rounded-xl text-xs font-bold bg-[#FF6B00]/15 text-[#E65A00] dark:text-[#FF6B00] border border-[#FF6B00]/30 hover:bg-[#FF6B00]/25 transition-all duration-150 active:scale-[0.97] cursor-pointer min-h-[40px] flex items-center gap-1.5"
                            >
                                <RefreshCw className="w-3.5 h-3.5" />
                                <span>สลับเลนส์</span>
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={handleClose}
                            className="px-5 py-2.5 rounded-xl text-xs font-bold bg-slate-100 dark:bg-white/[0.06] text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-white/[0.12] transition-all duration-150 active:scale-[0.97] cursor-pointer min-h-[40px]"
                        >
                            ยกเลิก
                        </button>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
};

export default BarcodeScannerModal;
