import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { Database, X } from 'lucide-react';

export const SettingsModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
  const { 
    isSupabaseLive, supabaseUrl, supabaseKey, 
    updateSupabaseConfig, disconnectSupabase 
  } = useApp();

  const [url, setUrl] = useState(supabaseUrl);
  const [key, setKey] = useState(supabaseKey);

  if (!isOpen) return null;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (url && key) {
      updateSupabaseConfig(url.trim(), key.trim());
      onClose();
    } else {
      alert('กรุณากรอกทั้ง Supabase URL และ Key');
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-center justify-center p-4">
      <div className="liquid-glass rounded-3xl max-w-md w-full p-6 sm:p-7 shadow-2xl border border-white/[0.12] relative">
        <button
          onClick={onClose}
          className="absolute top-5 right-5 text-slate-400 hover:text-white transition cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-4">
          <div className="p-2.5 rounded-2xl bg-[#FF6B00]/15 text-[#FF6B00] border border-[#FF6B00]/30">
            <Database className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white">ตั้งค่าการเชื่อมต่อ Supabase</h3>
            <p className="text-xs text-slate-400">สลับระหว่างโหมดทดลองในเครื่อง กับฐานข้อมูลจริง Realtime</p>
          </div>
        </div>

        <form onSubmit={handleSave} className="space-y-4 text-xs">
          <div>
            <label className="block font-medium text-slate-300 mb-1">SUPABASE URL</label>
            <input
              type="text"
              placeholder="https://your-project.supabase.co"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="w-full liquid-glass-input rounded-2xl px-3.5 py-2 text-white font-mono text-xs focus:outline-none"
            />
          </div>

          <div>
            <label className="block font-medium text-slate-300 mb-1">SUPABASE ANON KEY</label>
            <input
              type="password"
              placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI..."
              value={key}
              onChange={(e) => setKey(e.target.value)}
              className="w-full liquid-glass-input rounded-2xl px-3.5 py-2 text-white font-mono text-xs focus:outline-none"
            />
          </div>

          <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/[0.06] text-slate-400 leading-relaxed">
            <p className="text-slate-200 font-semibold mb-1">💡 โหมดการทำงาน:</p>
            <ul className="list-disc pl-4 space-y-1">
              <li>หากเว้นว่างไว้ ระบบจะทำงานใน <strong>Demo Mode</strong> บันทึกข้อมูลลงในเบราว์เซอร์</li>
              <li>หากใส่ URL & Key ระบบจะเชื่อมต่อไปยังตาราง <code className="text-[#FF6B00]">orders</code>, <code className="text-[#FF6B00]">items</code>, <code className="text-[#FF6B00]">repair_tickets</code> ใน Supabase ทันที</li>
            </ul>
          </div>

          <div className="flex items-center gap-2 pt-2">
            <button
              type="submit"
              className="flex-1 py-3 bg-gradient-to-r from-[#FF6B00] to-[#E65A00] hover:from-[#FF8A24] hover:to-[#FF6B00] text-black font-extrabold rounded-2xl text-xs transition cursor-pointer shadow-lg shadow-[#FF6B00]/25 border border-white/20"
            >
              บันทึกการเชื่อมต่อ
            </button>
            {isSupabaseLive && (
              <button
                type="button"
                onClick={() => {
                  disconnectSupabase();
                  setUrl('');
                  setKey('');
                  onClose();
                }}
                className="px-3.5 py-3 rounded-2xl border border-white/[0.08] hover:border-rose-500/50 hover:text-rose-400 text-slate-400 transition cursor-pointer"
              >
                ตัดการเชื่อมต่อ
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
};
