import { createClient, SupabaseClient } from '@supabase/supabase-js';

export type EvidenceFolder = 'doa' | 'onsite' | 'repair';

export const EVIDENCE_BUCKET = 'evidence-photos';
export const MAX_EVIDENCE_PHOTOS = 3;
const MAX_IMAGE_WIDTH = 1280;
const COMPRESSION_QUALITY = 0.75;

let cachedClient: SupabaseClient | null = null;
let cachedConfigKey = '';

/**
 * Resolve Supabase credentials from Vite env vars first, then runtime SettingsModal config.
 */
function getSupabaseConfig(): { url: string; key: string } | null {
  const envUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() || '';
  const envKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim() || '';
  if (envUrl && envKey) {
    return { url: envUrl, key: envKey };
  }

  if (typeof window !== 'undefined') {
    const lsUrl = (localStorage.getItem('boss_sb_url') || '').trim();
    const lsKey = (localStorage.getItem('boss_sb_key') || '').trim();
    if (lsUrl && lsKey) {
      return { url: lsUrl, key: lsKey };
    }
  }

  return null;
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

function blobToDataUrl(blob: Blob): Promise<string> {
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
export async function compressEvidenceImage(file: File): Promise<{ blob: Blob; ext: 'webp' | 'jpg'; mimeType: string }> {
  const img = await loadImageFromFile(file);
  const srcWidth = img.naturalWidth || img.width;
  const srcHeight = img.naturalHeight || img.height;

  const scale = srcWidth > MAX_IMAGE_WIDTH ? MAX_IMAGE_WIDTH / srcWidth : 1;
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
 * - Live Mode (Supabase configured): uploads compressed Blob to bucket 'evidence-photos' under `${folder}/` and returns public URL.
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

    const { data } = client.storage.from(EVIDENCE_BUCKET).getPublicUrl(storagePath);
    if (!data?.publicUrl) {
      throw new Error('ไม่สามารถสร้าง Public URL สำหรับรูปภาพได้');
    }
    return data.publicUrl;
  }

  return blobToDataUrl(blob);
}

/**
 * Delete an evidence image:
 * - Live Mode: removes the file from Supabase Storage bucket 'evidence-photos' when given a Supabase public URL.
 * - Demo Mode / Data URLs: resolves immediately so caller removes it from local state.
 */
export async function deleteEvidenceImage(url: string): Promise<void> {
  if (!url || url.startsWith('data:')) return;

  const client = getStorageSupabaseClient();
  if (!client) return;

  const marker = `/${EVIDENCE_BUCKET}/`;
  const idx = url.indexOf(marker);
  if (idx === -1) return;

  const rawPath = url.slice(idx + marker.length).split('?')[0];
  const storagePath = decodeURIComponent(rawPath);
  if (!storagePath) return;

  const { error } = await client.storage.from(EVIDENCE_BUCKET).remove([storagePath]);
  if (error) {
    console.warn('deleteEvidenceImage warning:', error.message);
  }
}
