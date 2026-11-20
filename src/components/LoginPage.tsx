import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { Cpu, ShieldCheck, Lock, User, ArrowRight, Sparkles, Sun, Moon } from 'lucide-react';
import { UserRole } from '../types';

export const LoginPage: React.FC = () => {
  const { login, users, theme, toggleTheme } = useApp();
  const [selectedUsername, setSelectedUsername] = useState('admin');
  const [customUsername, setCustomUsername] = useState('');
  const [password, setPassword] = useState('password123');
  const [error, setError] = useState('');

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    const targetUser = customUsername ? customUsername.trim() : selectedUsername;
    const success = login(targetUser);
    if (!success) {
      setError('ไม่พบชื่อผู้ใช้นี้ในระบบ กรุณาเลือกจากรายชื่อหรือติดต่อแอดมิน');
    } else {
      setError('');
    }
  };

  const roleMeta: Record<UserRole, { label: string; desc: string }> = {
    admin: { label: 'ผู้ดูแลระบบ (Admin)', desc: 'เข้าถึงได้ทุกแผนก, จัดการสิทธิ์ผู้ใช้งาน, ตั้งค่าระบบ' },
    sales: { label: '1. ฝ่ายขาย (Sales)', desc: 'เปิดใบเสนอราคา & สั่งขาย ส่งต่อให้บัญชี' },
    accounting: { label: '2. บัญชี & สต๊อก', desc: 'ตรวจสอบบิล, ตัดสต๊อก, ส่งมอบงานให้ช่างเตรียม' },
    prep: { label: '3. ช่างเตรียมสินค้า', desc: 'ติดโลโก้ BossComputech, ยิง S/N (ไม่ติดวอย)' },
    frontdesk: { label: '4. แอดมินหน้าร้าน', desc: 'จ่ายคิวงานช่าง Onsite, รับเครื่องซ่อม, รายงานประจำวัน' },
    onsite: { label: '5. ช่าง Onsite', desc: 'วิ่งส่งของไซต์ลูกค้า, ติดวอยรับประกัน ณ วันส่ง' },
    repair: { label: '6. ช่างซ่อมในร้าน', desc: 'ตรวจเช็คประกันอัตโนมัติ, ซ่อมเครื่อง, บันทึกอะไหล่' }
  };

  return (
    <div className="min-h-screen bg-[var(--bg-page)] text-[var(--text-primary)] flex flex-col justify-center py-12 sm:px-6 lg:px-8 relative overflow-hidden transition-colors duration-300">
      {/* Background Liquid Light Orbs */}
      <div className="liquid-blob-1"></div>
      <div className="liquid-blob-2"></div>

      {/* Theme Toggle Top Right */}
      <div className="absolute top-6 right-6 z-20">
        <button
          onClick={toggleTheme}
          title={theme === 'dark' ? 'เปลี่ยนเป็นธีมสว่าง (Liquid Glass Light)' : 'เปลี่ยนเป็นธีมมืด (Liquid Glass Dark)'}
          aria-label={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          className="p-2.5 rounded-2xl liquid-glass border border-white/10 hover:border-[#FF6B00]/40 text-slate-300 hover:text-[#FF6B00] transition-all cursor-pointer flex items-center gap-2 group shadow-lg"
        >
          {theme === 'dark' ? (
            <>
              <Sun className="w-4 h-4 text-amber-400 group-hover:rotate-45 transition-transform" />
              <span className="text-xs font-medium hidden sm:inline text-slate-300">Light Mode</span>
            </>
          ) : (
            <>
              <Moon className="w-4 h-4 text-blue-500 group-hover:-rotate-12 transition-transform" />
              <span className="text-xs font-medium hidden sm:inline text-slate-600">Dark Mode</span>
            </>
          )}
        </button>
      </div>

      <div className="sm:mx-auto sm:w-full sm:max-w-md relative z-10 text-center">
        <div className="inline-flex justify-center mb-3">
          <div className="w-16 h-16 rounded-3xl bg-gradient-to-br from-[#FF6B00] to-[#B84300] flex items-center justify-center font-bold text-white shadow-2xl shadow-[#FF6B00]/40 border border-white/20">
            <Cpu className="w-9 h-9" />
          </div>
        </div>
        <h2 className="text-3xl font-extrabold tracking-tight text-white flex items-center justify-center gap-2">
          <span>BOSS<span className="text-[#FF6B00]">COMPUTECH</span></span>
        </h2>
        <div className="flex items-center justify-center gap-1.5 mt-1">
          <span className="text-xs text-slate-400">Liquid Glass Enterprise System</span>
          <span className="w-1 h-1 rounded-full bg-[#FF6B00]"></span>
          <span className="text-[11px] text-[#FF6B00] font-semibold">Orange & Black</span>
        </div>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-xl px-4 relative z-10">
        <div className="liquid-glass rounded-3xl p-6 sm:p-9 shadow-2xl border border-white/[0.1] relative">
          
          <div className="mb-6 pb-4 border-b border-white/[0.08] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-[#FF6B00]/15 text-[#FF6B00]">
                <Lock className="w-4 h-4" />
              </div>
              <span className="text-sm font-bold text-white">เข้าสู่ระบบตามบทบาทหน้าที่ (Role-Based Access)</span>
            </div>
            <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-[#FF6B00]/15 text-[#FF6B00] border border-[#FF6B00]/30 font-mono font-semibold">
              v2.5 Liquid Glass
            </span>
          </div>

          {error && (
            <div className="mb-4 p-3 rounded-2xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 flex-shrink-0 text-rose-400" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-5">
            {/* Quick Role Selection Cards */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-2">
                เลือกบทบาทที่ต้องการเข้าใช้งาน (คลิกเพื่อสลับ Role ทันที):
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-72 overflow-y-auto pr-1">
                {users.map((u) => {
                  const meta = roleMeta[u.role];
                  const isSelected = selectedUsername === u.username && !customUsername;
                  return (
                    <button
                      type="button"
                      key={u.id}
                      onClick={() => {
                        setSelectedUsername(u.username);
                        setCustomUsername('');
                      }}
                      className={`text-left p-3.5 rounded-2xl transition-all duration-200 cursor-pointer flex flex-col justify-between ${
                        isSelected
                          ? 'bg-[#FF6B00]/20 border border-[#FF6B00] shadow-lg shadow-[#FF6B00]/20 ring-1 ring-[#FF6B00]'
                          : 'liquid-glass-card hover:border-white/20'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                          isSelected ? 'bg-[#FF6B00] text-black border-transparent' : 'bg-white/[0.05] text-[#FF6B00] border-[#FF6B00]/30'
                        }`}>
                          {meta.label}
                        </span>
                        {isSelected && <span className="w-2 h-2 rounded-full bg-[#FF6B00] animate-pulse"></span>}
                      </div>
                      <div className="text-xs font-bold text-white">{u.name}</div>
                      <div className="text-[10px] text-slate-400 mt-0.5">{meta.desc}</div>
                      <div className="text-[10px] font-mono text-slate-500 mt-1">Username: {u.username}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Custom Username Input */}
            <div className="pt-2">
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                หรือกรอกชื่อผู้ใช้โดยตรง (Username):
              </label>
              <div className="relative">
                <input
                  type="text"
                  placeholder="เช่น admin, sales, accounting, tech01..."
                  value={customUsername || selectedUsername}
                  onChange={(e) => setCustomUsername(e.target.value)}
                  className="w-full liquid-glass-input rounded-2xl px-3.5 py-2.5 pl-10 text-sm text-white placeholder-slate-500 focus:outline-none transition"
                />
                <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
              </div>
            </div>

            {/* Password Input */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                รหัสผ่าน (Demo รหัสผ่านคือ password123):
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full liquid-glass-input rounded-2xl px-3.5 py-2.5 text-sm text-white focus:outline-none transition"
              />
            </div>

            <button
              type="submit"
              className="w-full py-3 px-4 bg-gradient-to-r from-[#FF6B00] to-[#E65A00] hover:from-[#FF8A24] hover:to-[#FF6B00] active:scale-[0.99] text-black font-extrabold rounded-2xl text-sm transition-all duration-200 cursor-pointer flex items-center justify-center gap-2 shadow-xl shadow-[#FF6B00]/30 border border-white/20"
            >
              <span>เข้าสู่ระบบ BossComputech</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>

          <div className="mt-5 text-center text-[11px] text-slate-500">
            ระบบความปลอดภัยระดับองค์กร • เมื่อล็อกอินสำเร็จจะมองเห็นเฉพาะแถบเมนูของตนเอง
          </div>
        </div>
      </div>
    </div>
  );
};
