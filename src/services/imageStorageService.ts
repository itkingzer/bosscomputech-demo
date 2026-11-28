import { createClient, SupabaseClient } from '@supabase/supabase-js';

export type EvidenceFolder = 'doa' | 'onsite' | 'repair';

export const EVIDENCE_BUCKET = 'evidence-photos';
export const MAX_EVIDENCE_PHOTOS = 3;
const MAX_IMAGE_WIDTH = 1280;
const COMPRESSION_QUALITY = 0.75;

let cachedClient: SupabaseClient | null = null;
let cachedConfigKey = '';

/**
 * Use the same saved settings and deployment defaults as the database.
 */
function getSupabaseConfig(): { url: string; key: string } | null {
  const envUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() || '';
  const envKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim() || '';
  const settings = typeof window === 'undefined' ? undefined : window.localStorage;
  const url = (settings?.getItem('boss_sb_url') ?? envUrl).trim();
  const key = (settings?.getItem('boss_sb_key') ?? envKey).trim();
  return url && key ? { url, key } : null;
}

/**
 * Returns true when Supabase Storage Live Mode is active.
 */
export function isImageStorageLive(): boolean {
  return getSupabaseConfig() !== null;
}

function getStorageSupabaseClient(): SupabaseClient | null {
  const cfg = getSupabaseConfig();
  if (!cfg) return null;
  const key = `${cfg.url}|${cfg.key}`;
  if (!cachedClient || cachedConfigKey !== key) {
    cachedClient = createClient(cfg.url, cfg.key);
    cachedConfigKey = key;
  }
  return cachedClient;
}

function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('ไม่สามารถอ่านไฟล์รูปภาพได้'));
    };
    img.src = objectUrl;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, mimeType: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), mimeType, quality);
  });
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('ไม่สามารถแปลงรูปภาพเป็น Data URL ได้'));
      }
    };
    reader.onerror = () => reject(new Error('เกิดข้อผิดพลาดในการอ่านข้อมูลรูปภาพ'));
    reader.readAsDataURL(blob);
  });
}

/**
 * Client-side resize (max width 1280px) and compress to WebP (fallback JPEG) at quality 0.75.
 */
export async function compressEvidenceImage(file: File, maxWidth = MAX_IMAGE_WIDTH, maxHeight = Infinity): Promise<{ blob: Blob; ext: 'webp' | 'jpg'; mimeType: string }> {
  const img = await loadImageFromFile(file);
  const srcWidth = img.naturalWidth || img.width;
  const srcHeight = img.naturalHeight || img.height;

  const scale = Math.min(1, maxWidth / srcWidth, maxHeight / srcHeight);
  const targetWidth = Math.max(1, Math.round(srcWidth * scale));
  const targetHeight = Math.max(1, Math.round(srcHeight * scale));

  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('เบราว์เซอร์ไม่รองรับการบีบอัดรูปภาพ (Canvas 2D)');
  }

  // White background avoids transparent PNG turning black if JPEG fallback is used
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, targetWidth, targetHeight);
  ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

  // Prefer WebP; fall back to JPEG if browser encodes PNG or unsupported
  const webpBlob = await canvasToBlob(canvas, 'image/webp', COMPRESSION_QUALITY);
  if (webpBlob && webpBlob.type === 'image/webp') {
    return { blob: webpBlob, ext: 'webp', mimeType: 'image/webp' };
  }

  const jpegBlob = await canvasToBlob(canvas, 'image/jpeg', COMPRESSION_QUALITY);
  if (!jpegBlob) {
    throw new Error('บีบอัดรูปภาพไม่สำเร็จ');
  }
  return { blob: jpegBlob, ext: 'jpg', mimeType: 'image/jpeg' };
}

/**
 * Upload an evidence image:
 * - Live Mode: uploads to private Storage and returns a stable image reference.
 * - Demo Mode (fallback): returns lightweight compressed Data URL for localStorage persistence.
 */
export async function uploadEvidenceImage(file: File, folder: EvidenceFolder): Promise<string> {
  const { blob, ext, mimeType } = await compressEvidenceImage(file);
  const client = getStorageSupabaseClient();

  if (client) {
    const uniqueSuffix = Math.random().toString(36).slice(2, 8);
    const storagePath = `${folder}/${Date.now()}-${uniqueSuffix}.${ext}`;

    const { error: uploadError } = await client.storage
      .from(EVIDENCE_BUCKET)
      .upload(storagePath, blob, {
        contentType: mimeType,
        cacheControl: '31536000',
        upsert: false
      });

    if (uploadError) {
      throw new Error(`อัปโหลดรูปภาพไปยัง Supabase Storage ไม่สำเร็จ: ${uploadError.message}`);
    }

    return `${EVIDENCE_BUCKET}/${storagePath}`;
  }

  return blobToDataUrl(blob);
}

function evidenceStoragePath(reference: string): string | null {
  const prefix = `${EVIDENCE_BUCKET}/`;
  if (reference.startsWith(prefix)) return reference.slice(prefix.length);
  try {
    const url = new URL(reference);
    const config = getSupabaseConfig();
    const legacyPrefix = `/storage/v1/object/public/${prefix}`;
    if (config && url.origin === new URL(config.url).origin && url.pathname.startsWith(legacyPrefix)) {
      return decodeURIComponent(url.pathname.slice(legacyPrefix.length));
    }
  } catch {
    return null;
  }
  return null;
}

export async function getEvidenceImageUrl(reference: string): Promise<string> {
  const path = evidenceStoragePath(reference);
  if (!path) return reference;
  const client = getStorageSupabaseClient();
  if (!client) throw new Error('ไม่ได้เชื่อมต่อระบบจัดเก็บรูป');
  const { data, error } = await client.storage.from(EVIDENCE_BUCKET).createSignedUrl(path, 600);
  if (error || !data) throw new Error('ไม่สามารถเปิดรูปหลักฐานได้');
  return data.signedUrl;
}

export async function deleteEvidenceImage(reference: string): Promise<void> {
  const storagePath = evidenceStoragePath(reference);
  const client = getStorageSupabaseClient();
  if (!client || !storagePath) return;

  const { error } = await client.storage.from(EVIDENCE_BUCKET).remove([storagePath]);
  if (error) {
    console.warn('deleteEvidenceImage warning:', error.message);
  }
}
