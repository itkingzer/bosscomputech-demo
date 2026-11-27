import { ModalBackdrop } from './ui/ModalBackdrop';
import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useApp } from '../context/AppContext';
import { Database, X } from 'lucide-react';

export const SettingsModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
  const {
    isSupabaseLive, isSyncing, databaseStatusLabel, databaseError, supabaseUrl, supabaseKey,
    updateSupabaseConfig, disconnectSupabase
  } = useApp();

  const [url, setUrl] = useState(supabaseUrl);
  const [key, setKey] = useState(supabaseKey);

  // Sync local form state when modal opens or external config changes
  useEffect(() => {
    if (isOpen) {
      setUrl(supabaseUrl);
      setKey(supabaseKey);
    }
  }, [isOpen, supabaseUrl, supabaseKey]);

  // Lock background scroll & close on Escape while the settings modal is open
  useEffect(() => {
    if (!isOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanUrl = url.trim();
    const cleanKey = key.trim();
    if (!cleanUrl && !cleanKey) {
      disconnectSupabase();
    } else if (cleanUrl && cleanKey) {
      updateSupabaseConfig(cleanUrl, cleanKey);
    } else {
      alert('กรุณากรอกทั้ง Supabase URL และ Key (หรือเว้นว่างทั้งสองช่องเพื่อใช้ Demo Mode)');
    }
  };

  return createPortal(
    <ModalBackdrop
      onDismiss={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="ตั้งค่าการเชื่อมต่อ Supabase"
      className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6 animate-fade-in"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-800 shadow-2xl rounded-3xl w-full max-w-md max-h-[82dvh] sm:max-h-[86dvh] overflow-y-auto overscroll-contain p-4 sm:p-7 relative animate-modal-pop"
      >
        <button
          onClick={onClose}
          aria-label="ปิดหน้าตั้งค่า"
          className="absolute top-3 right-3 sm:top-5 sm:right-5 p-2 rounded-xl text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/[0.06] transition-all duration-150 active:scale-[0.97] cursor-pointer min-w-[44px] min-h-[44px] flex items-center justify-center"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-4">
          <div className="p-2.5 rounded-2xl bg-[#FF6B00]/15 text-[#E65A00] dark:text-[#FF6B00] border border-[#FF6B00]/30">
            <Database className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">ตั้งค่าการเชื่อมต่อ Supabase</h3>
            <p role="status" className={`text-xs font-medium ${isSupabaseLive ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-600 dark:text-slate-300'}`}>
              {databaseStatusLabel}
            </p>
          </div>
        </div>

        <form onSubmit={handleSave} className="space-y-4 text-xs">
          <div>
            <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">SUPABASE URL</label>
            <input
              type="text"
              placeholder="https://your-project.supabase.co"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="w-full rounded-2xl px-3.5 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-300 dark:border-slate-700 placeholder-slate-400 font-mono text-xs focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">SUPABASE ANON KEY</label>
            <input
              type="password"
              placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI..."
              value={key}
              onChange={(e) => setKey(e.target.value)}
              className="w-full rounded-2xl px-3.5 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-300 dark:border-slate-700 placeholder-slate-400 font-mono text-xs focus:outline-none focus:border-blue-500"
            />
          </div>

          <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 leading-relaxed">
            <p className="text-slate-900 dark:text-slate-100 font-semibold mb-1">💡 โหมดการทำงาน:</p>
            <ul className="list-disc pl-4 space-y-1">
              <li>หากเว้นว่างไว้ ระบบจะทำงานใน <strong>Demo Mode</strong> บันทึกข้อมูลลงในเบราว์เซอร์</li>
              <li>เมื่อใส่ URL และ Publishable Key แล้ว ให้เข้าสู่ระบบด้วยบัญชีแอดมิน Supabase เพื่อโหลดข้อมูล</li>
            </ul>
          </div>

          {databaseError && (
            <p role="alert" className="text-rose-700 dark:text-rose-400">
              {databaseError}
            </p>
          )}

          <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center gap-2 pt-2">
            <button
              type="submit"
              disabled={isSyncing}
              className="flex-1 px-5 py-3 bg-gradient-to-r from-[#FF6B00] to-[#E65A00] hover:from-[#FF8A24] hover:to-[#FF6B00] hover:brightness-105 text-black font-extrabold rounded-2xl text-xs transition-all duration-150 active:scale-[0.97] cursor-pointer disabled:cursor-wait disabled:opacity-60 shadow-lg shadow-[#FF6B00]/25 border border-white/20"
            >
              {isSyncing ? 'กำลังโหลดข้อมูล…' : 'บันทึกการตั้งค่า'}
            </button>
            {(supabaseUrl || supabaseKey) && (
              <button
                type="button"
                onClick={() => {
                  disconnectSupabase();
                  setUrl('');
                  setKey('');
                }}
                className="px-3.5 py-3 rounded-2xl border border-slate-300 dark:border-slate-700 hover:border-rose-500/50 hover:text-rose-600 dark:hover:text-rose-400 text-slate-700 dark:text-slate-300 transition-all duration-150 active:scale-[0.97] cursor-pointer"
              >
                ใช้ Demo Local
              </button>
            )}
          </div>
        </form>
      </div>
    </ModalBackdrop>,
    document.body
  );
};
