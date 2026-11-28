import { useDepartmentReadOnly } from '../context/DepartmentAccess';
import { ModalBackdrop } from './ui/ModalBackdrop';
import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Camera,
  ChevronLeft,
  ChevronRight,
  ImagePlus,
  Loader2,
  Trash2,
  X,
  ZoomIn
} from 'lucide-react';
import {
  EvidenceFolder,
  MAX_EVIDENCE_PHOTOS,
  deleteEvidenceImage,
  getEvidenceImageUrl,
  isImageStorageLive,
  uploadEvidenceImage
} from '../services/imageStorageService';

function EvidenceImage({ reference, ...props }: Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'src'> & { reference: string }) {
  const [url, setUrl] = useState<string>();
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    void getEvidenceImageUrl(reference).then(
      resolved => { if (active) setUrl(resolved); },
      () => { if (active) setFailed(true); },
    );
    return () => { active = false; };
  }, [reference]);
  if (failed) return <span role="status" className="flex h-full items-center justify-center p-2 text-xs">เปิดรูปหลักฐานไม่ได้</span>;
  if (!url) return null;
  return <img {...props} src={url} />;
}

interface EvidencePhotoUploaderProps {
  value: string[];
  onChange: (urls: string[]) => void;
  folder: EvidenceFolder;
  editable?: boolean;
  maxPhotos?: number;
  label?: string;
  helperText?: string;
  compact?: boolean;
  onUploadingChange?: (uploading: boolean) => void;
}

export const EvidencePhotoUploader: React.FC<EvidencePhotoUploaderProps> = ({
  value,
  onChange,
  folder,
  editable: allowEditing = true,
  maxPhotos = MAX_EVIDENCE_PHOTOS,
  label = 'รูปภาพหลักฐาน',
  helperText,
  compact = false,
  onUploadingChange
}) => {
  const readOnly = useDepartmentReadOnly();
  const editable = allowEditing && !readOnly;
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);

  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ done: number; total: number } | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const photos = Array.isArray(value) ? value : [];
  const remainingSlots = Math.max(0, maxPhotos - photos.length);
  const isLive = isImageStorageLive();

  // Keyboard navigation inside Lightbox (capture phase prevents closing underlying Modal on Escape)
  useEffect(() => {
    if (lightboxIndex === null) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setLightboxIndex(null);
      } else if (e.key === 'ArrowLeft' && photos.length > 1) {
        setLightboxIndex((prev) => (prev === null ? null : (prev - 1 + photos.length) % photos.length));
      } else if (e.key === 'ArrowRight' && photos.length > 1) {
        setLightboxIndex((prev) => (prev === null ? null : (prev + 1) % photos.length));
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [lightboxIndex, photos.length]);

  if (!editable && photos.length === 0) {
    return null;
  }

  const handleFilesSelected = async (fileList: FileList | null) => {
    if (!editable || !fileList || fileList.length === 0 || remainingSlots <= 0) return;
    setErrorMsg(null);

    const selectedFiles = Array.from(fileList)
      .filter((f) => f.type.startsWith('image/'))
      .slice(0, remainingSlots);

    if (selectedFiles.length === 0) {
      setErrorMsg('กรุณาเลือกไฟล์รูปภาพเท่านั้น');
      return;
    }

    setIsUploading(true);
    onUploadingChange?.(true);
    setUploadProgress({ done: 0, total: selectedFiles.length });

    const newUrls: string[] = [];
    try {
      for (let idx = 0; idx < selectedFiles.length; idx++) {
        const url = await uploadEvidenceImage(selectedFiles[idx], folder);
        newUrls.push(url);
        setUploadProgress({ done: idx + 1, total: selectedFiles.length });
      }
      if (newUrls.length > 0) {
        onChange([...photos, ...newUrls].slice(0, maxPhotos));
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'อัปโหลดรูปภาพไม่สำเร็จ');
      if (newUrls.length > 0) {
        onChange([...photos, ...newUrls].slice(0, maxPhotos));
      }
    } finally {
      setIsUploading(false);
      onUploadingChange?.(false);
      setUploadProgress(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      if (cameraInputRef.current) cameraInputRef.current.value = '';
    }
  };

  const handleDelete = async (indexToRemove: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!editable) return;
    const targetUrl = photos[indexToRemove];
    const next = photos.filter((_, idx) => idx !== indexToRemove);
    onChange(next);
    if (lightboxIndex !== null) {
      if (next.length === 0) setLightboxIndex(null);
      else if (lightboxIndex >= next.length) setLightboxIndex(next.length - 1);
    }
    if (targetUrl) {
      await deleteEvidenceImage(targetUrl);
    }
  };

  return (
    <div className="space-y-2">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300">
            {label}
          </span>
          <span className="px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200 dark:bg-white/[0.06] dark:text-slate-300 dark:border-white/[0.1]">
            {photos.length}/{maxPhotos} รูป
          </span>
        </div>
        {editable && (
          <span
            className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md border ${
              isLive
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30'
                : 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-white/[0.05] dark:text-slate-400 dark:border-white/[0.1]'
            }`}
          >
            {isLive ? 'Supabase Storage' : 'Demo Local'}
          </span>
        )}
      </div>

      {helperText && (
        <p className="text-[11px] text-slate-500 dark:text-slate-400">{helperText}</p>
      )}

      {/* Error Banner */}
      {errorMsg && (
        <div className="p-2 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 dark:bg-rose-500/15 dark:border-rose-500/30 dark:text-rose-200 text-[11px] flex items-center justify-between gap-2">
          <span>{errorMsg}</span>
          <button
            type="button"
            onClick={() => setErrorMsg(null)}
            className="p-0.5 rounded hover:bg-rose-200/60 dark:hover:bg-rose-500/20 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Thumbnail Grid */}
      {(photos.length > 0 || isUploading) && (
        <div className={`grid gap-2 ${compact ? 'grid-cols-3 sm:grid-cols-4' : 'grid-cols-3'}`}>
          {photos.map((url, idx) => (
            <div
              key={`${url.slice(0, 32)}-${idx}`}
              onClick={() => setLightboxIndex(idx)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setLightboxIndex(idx);
                }
              }}
              aria-label={`ดูรูปภาพหลักฐานที่ ${idx + 1}`}
              className="group relative aspect-square rounded-xl overflow-hidden border border-slate-200 dark:border-white/[0.12] bg-slate-100 dark:bg-slate-800/80 cursor-pointer shadow-sm hover:border-[#FF6B00]/60 transition"
            >
              <EvidenceImage
                reference={url}
                alt={`หลักฐาน ${idx + 1}`}
                className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105"
                loading="lazy"
              />
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition flex items-center justify-center">
                <ZoomIn className="w-5 h-5 text-white opacity-0 group-hover:opacity-100 transition drop-shadow" />
              </div>
              {editable && (
                <button
                  type="button"
                  onClick={(e) => handleDelete(idx, e)}
                  title="ลบรูปภาพนี้"
                  aria-label={`ลบรูปภาพที่ ${idx + 1}`}
                  className="absolute top-1.5 right-1.5 p-1.5 rounded-lg bg-black/70 hover:bg-rose-600 text-white border border-white/20 shadow transition cursor-pointer active:scale-90"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
              <span className="absolute bottom-1 left-1.5 px-1.5 py-0.5 rounded bg-black/65 text-white text-[9px] font-bold">
                #{idx + 1}
              </span>
            </div>
          ))}

          {isUploading && (
            <div className="aspect-square rounded-xl border border-dashed border-[#FF6B00]/50 bg-[#FF6B00]/5 dark:bg-[#FF6B00]/10 flex flex-col items-center justify-center gap-1.5 p-2 text-center">
              <Loader2 className="w-5 h-5 text-[#FF6B00] animate-spin" />
              <span className="text-[10px] font-bold text-slate-700 dark:text-slate-200">
                กำลังบีบอัด...
              </span>
              {uploadProgress && (
                <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400">
                  {uploadProgress.done}/{uploadProgress.total}
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Upload / Camera Triggers */}
      {editable && remainingSlots > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => handleFilesSelected(e.target.files)}
          />
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => handleFilesSelected(e.target.files)}
          />

          <button
            type="button"
            disabled={isUploading}
            onClick={() => cameraInputRef.current?.click()}
            className="flex-1 min-w-[120px] min-h-[40px] px-3 py-2 rounded-xl border border-dashed border-slate-300 dark:border-white/[0.16] bg-slate-50 hover:bg-slate-100 dark:bg-white/[0.03] dark:hover:bg-white/[0.07] text-slate-700 dark:text-slate-200 text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer disabled:opacity-50 active:scale-[0.98]"
          >
            <Camera className="w-4 h-4 text-[#FF6B00]" />
            <span>ถ่ายรูป</span>
          </button>

          <button
            type="button"
            disabled={isUploading}
            onClick={() => fileInputRef.current?.click()}
            className="flex-1 min-w-[120px] min-h-[40px] px-3 py-2 rounded-xl border border-dashed border-slate-300 dark:border-white/[0.16] bg-slate-50 hover:bg-slate-100 dark:bg-white/[0.03] dark:hover:bg-white/[0.07] text-slate-700 dark:text-slate-200 text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer disabled:opacity-50 active:scale-[0.98]"
          >
            <ImagePlus className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <span>เลือกรูป ({remainingSlots} รูป)</span>
          </button>
        </div>
      )}

      {/* Full-Screen Lightbox Modal (z-[10050]) */}
      {lightboxIndex !== null && photos[lightboxIndex] && createPortal(
        <ModalBackdrop
          className="fixed inset-0 z-[10050] bg-black/90 backdrop-blur-md flex flex-col items-center justify-center p-3 sm:p-6 animate-fade-in"
          role="dialog"
          aria-modal="true"
          aria-label="ดูรูปภาพหลักฐานขนาดเต็ม"
          onDismiss={() => setLightboxIndex(null)}
        >
          {/* Top Bar */}
          <div
            className="w-full max-w-4xl flex items-center justify-between gap-3 mb-3 text-white"
            onClick={(e) => e.stopPropagation()}
          >
            <span className="px-3 py-1 rounded-full bg-white/10 border border-white/20 text-xs font-bold">
              รูปที่ {lightboxIndex + 1} / {photos.length}
            </span>
            <button
              type="button"
              onClick={() => setLightboxIndex(null)}
              aria-label="ปิดหน้าต่างดูรูปภาพ"
              className="p-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white border border-white/20 transition cursor-pointer active:scale-95"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Image Stage */}
          <div
            className="relative w-full max-w-4xl flex-1 flex items-center justify-center min-h-0"
            onClick={(e) => e.stopPropagation()}
          >
            {photos.length > 1 && (
              <button
                type="button"
                onClick={() =>
                  setLightboxIndex((lightboxIndex - 1 + photos.length) % photos.length)
                }
                aria-label="รูปก่อนหน้า"
                className="absolute left-1 sm:left-3 z-10 p-2.5 rounded-full bg-black/60 hover:bg-black/80 text-white border border-white/20 transition cursor-pointer active:scale-95"
              >
                <ChevronLeft className="w-6 h-6" />
              </button>
            )}

            <EvidenceImage
              key={photos[lightboxIndex]}
              reference={photos[lightboxIndex]}
              alt={`หลักฐาน ${lightboxIndex + 1}`}
              className="max-w-full max-h-[78dvh] object-contain rounded-2xl shadow-2xl border border-white/10 bg-black/40"
            />

            {photos.length > 1 && (
              <button
                type="button"
                onClick={() =>
                  setLightboxIndex((lightboxIndex + 1) % photos.length)
                }
                aria-label="รูปถัดไป"
                className="absolute right-1 sm:right-3 z-10 p-2.5 rounded-full bg-black/60 hover:bg-black/80 text-white border border-white/20 transition cursor-pointer active:scale-95"
              >
                <ChevronRight className="w-6 h-6" />
              </button>
            )}
          </div>
        </ModalBackdrop>,
        document.body
      )}
    </div>
  );
};
