import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { ShieldCheck, Lock, User, ArrowRight, ArrowLeft, Sun, Moon } from 'lucide-react';
import { UserRole } from '../types';
import companyLogo from '../assets/BossCom.jpg';
import loginBanner from '../assets/BossComBanner.png';

export const LoginPage: React.FC<{ onBackToLanding?: () => void; onOpenSettings: () => void }> = ({ onBackToLanding, onOpenSettings }) => {
  const { login, requestPasswordReset, users, theme, toggleTheme, usesSupabaseAuth, isSyncing, databaseError, databaseStatusLabel } = useApp();
  const [selectedUsername, setSelectedUsername] = useState('admin');
  const [customUsername, setCustomUsername] = useState('');
  const [email, setEmail] = useState('');
  const [adminLogin, setAdminLogin] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [resetNotice, setResetNotice] = useState('');

  const sendPasswordReset = async () => {
    setError('');
    setResetNotice('');
    setSubmitting(true);
    try {
      const failure = await requestPasswordReset(email.trim());
      if (failure) setError(failure);
      else setResetNotice('หากอีเมลนี้ตรงกับบัญชีแอดมิน จะได้รับลิงก์ตั้งรหัสผ่าน');
    } catch {
      setError('ส่งลิงก์ไม่สำเร็จ กรุณาลองอีกครั้ง');
    } finally {
      setSubmitting(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const username = usesSupabaseAuth ? email.trim() : customUsername.trim() || selectedUsername;
      const failure = await login(username, password);
      if (failure) setError(usesSupabaseAuth ? failure : 'ไม่พบชื่อผู้ใช้นี้ในระบบ');
    } catch {
      setError('เข้าสู่ระบบไม่สำเร็จ กรุณาลองอีกครั้ง');
    } finally {
      setSubmitting(false);
    }
  };

  const roleMeta: Record<UserRole, { label: string; desc: string }> = {
    admin: { label: 'ผู้ดูแลระบบ (Admin)', desc: 'เข้าถึงได้ทุกแผนก, จัดการสิทธิ์ผู้ใช้งาน, ตั้งค่าระบบ' },
    sales: { label: '1. ฝ่ายขาย (Sales)', desc: 'เปิดใบเสนอราคา & สั่งขาย ส่งต่อให้จัดซื้อ/บัญชี' },
    accounting: { label: '2. จัดซื้อ & สต๊อก', desc: 'ตรวจสอบบิล, ตัดสต๊อก, ส่งมอบงานให้ช่างเตรียม' },
    finance: { label: '3. บัญชี (Accounting)', desc: 'วางบิล, ออกใบกำกับภาษี, พิมพ์ ORDER FORM 2026' },
    prep: { label: '4. ช่างเตรียมสินค้า', desc: 'ติดโลโก้ BossComputech, ยิง S/N (ไม่ติดวอย)' },
    frontdesk: { label: '5. แอดมินหน้าร้าน', desc: 'จ่ายคิวงานช่าง Onsite, รับเครื่องซ่อม, รายงานประจำวัน' },
    onsite: { label: '6. ช่าง Onsite', desc: 'วิ่งส่งของไซต์ลูกค้า, ติดวอยรับประกัน ณ วันส่ง' },
    repair: { label: '7. ช่างซ่อมในร้าน', desc: 'ตรวจเช็คประกันอัตโนมัติ, ซ่อมเครื่อง, บันทึกอะไหล่' },
    hr: { label: '8. บุคคล (HR)', desc: 'จัดการรายชื่อพนักงาน แผนก และสรุปภาระงานรายบุคคล' }
  };

  return (
    <div className="min-h-screen bg-[var(--bg-page)] text-[var(--text-primary)] flex flex-col items-center justify-start lg:justify-center px-3 py-8 sm:px-6 lg:px-8 relative overflow-x-hidden overflow-y-auto transition-colors duration-300">
      {/* Background Liquid Light Orbs */}
      <div className="liquid-blob-1"></div>
      <div className="liquid-blob-2"></div>

      {/* Back to Customer Landing Top Left */}
      {onBackToLanding && (
        <div className="absolute top-4 left-4 sm:top-6 sm:left-6 z-20">
          <button
            type="button"
            onClick={onBackToLanding}
            className="min-h-[44px] px-3.5 py-2 rounded-2xl liquid-glass border border-slate-200 dark:border-white/10 hover:border-[#FF6B00]/40 text-slate-700 dark:text-slate-200 hover:text-[#FF6B00] transition-all cursor-pointer flex items-center gap-2 shadow-lg text-xs font-bold"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>หน้าตรวจสอบสถานะ (ลูกค้า)</span>
          </button>
        </div>
      )}

      {/* Theme Toggle Top Right */}
      <div className="absolute top-4 right-4 sm:top-6 sm:right-6 z-20">
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

      {/* Split-Screen Login Card */}
      <div className="max-w-5xl w-full mx-auto grid grid-cols-1 lg:grid-cols-2 rounded-2xl overflow-hidden shadow-2xl border border-white/[0.1] relative z-10 bg-[var(--bg-page)]">

        {/* ============ LEFT PANEL: Banner (Desktop only) ============ */}
        <div className="relative hidden lg:block bg-black/40 min-h-[560px]">
          <img
            src={loginBanner}
            alt="Boss Computech and Service Co., Ltd."
            className="absolute inset-0 w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent pointer-events-none" />
          <div className="absolute bottom-0 left-0 right-0 p-7">
            <p className="text-white font-extrabold text-lg leading-tight drop-shadow-lg">
              Boss Computech <span className="text-orange-400">and Service Co., Ltd.</span>
            </p>
            <p className="text-white/70 text-xs mt-1">Liquid Glass Enterprise System</p>
          </div>
        </div>

        {/* ============ RIGHT PANEL: Login Form ============ */}
        <div className="liquid-glass p-6 sm:p-9 flex flex-col justify-center">

          {/* Company Logo above heading */}
          <div className="flex justify-center mb-4">
            <div className="p-2 rounded-full bg-white/95 dark:bg-white/90 ring-1 ring-black/10 shadow-lg shadow-black/20">
              <img
                src={companyLogo}
                alt="Boss Computech Logo"
                className="w-20 h-20 sm:w-24 sm:h-24 rounded-full object-cover"
              />
            </div>
          </div>

          <div className="text-center mb-6">
            <h2 className="text-xl sm:text-2xl font-extrabold tracking-tight text-[var(--text-primary)]">
              Boss Computech <span className="text-orange-700 dark:text-orange-400">and Service Co., Ltd.</span>
            </h2>
            <div className="flex items-center justify-center gap-1.5 mt-1.5 flex-wrap">
              <span className="text-xs text-slate-500 dark:text-slate-400">ระบบบริหารงานองค์กร</span>
              <span className="w-1 h-1 rounded-full bg-[#FF6B00]"></span>
              <span className="text-[11px] text-[#FF6B00] font-semibold">Orange & Black</span>
            </div>
          </div>

          <div className="mb-5 pb-4 border-b border-slate-200 dark:border-white/[0.08] flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <div className="p-1.5 rounded-lg bg-[#FF6B00]/15 text-[#FF6B00] flex-shrink-0">
                <Lock className="w-4 h-4" />
              </div>
              <span className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white truncate">เข้าสู่ระบบตามบทบาท (Role-Based)</span>
            </div>
            <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-[#FF6B00]/15 text-[#FF6B00] border border-[#FF6B00]/30 font-mono font-semibold flex-shrink-0">
              v2.5
            </span>
          </div>

          <button type="button" onClick={onOpenSettings} className="mb-4 self-start rounded-lg px-2 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 hover:underline">
            ตั้งค่าฐานข้อมูล · {databaseStatusLabel}
          </button>

          {(error || databaseError) && (
            <div role="alert" className="mb-4 p-3 rounded-2xl bg-rose-500/15 border border-rose-500/30 text-rose-800 dark:text-rose-300 text-xs flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 flex-shrink-0 text-rose-400" />
              <span>{error || databaseError}</span>
            </div>
          )}
          {resetNotice && <p role="status" className="mb-4 text-sm text-emerald-700 dark:text-emerald-300">{resetNotice}</p>}

          <form onSubmit={handleLogin} className="space-y-4">
            {usesSupabaseAuth ? (
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                {adminLogin ? 'อีเมลแอดมิน' : 'ชื่อผู้ใช้พนักงาน'}
                <input id="staff-email" type={adminLogin ? 'email' : 'text'} autoComplete="username" required value={email}
                  pattern={adminLogin ? undefined : '[A-Za-z0-9][A-Za-z0-9._\\-]{2,39}'}
                  autoCapitalize="none" spellCheck={false}
                  onChange={e => setEmail(e.target.value)}
                  className="mt-1 w-full liquid-glass-input rounded-2xl px-3.5 py-2.5 text-sm"
                />
              </label>
            ) : (
              <>
            {/* Quick Role Selection Cards */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
                เลือกบทบาทที่ต้องการเข้าใช้งาน:
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-64 overflow-y-auto pr-1">
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
                      className={`text-left p-3 rounded-2xl transition-all duration-200 cursor-pointer flex flex-col justify-between ${isSelected
                        ? 'bg-[#FF6B00]/20 border border-[#FF6B00] shadow-lg shadow-[#FF6B00]/20 ring-1 ring-[#FF6B00]'
                        : 'liquid-glass-card hover:border-slate-300 dark:hover:border-white/20'
                        }`}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${isSelected ? 'bg-[#FF6B00] text-black border-transparent' : 'bg-slate-100 dark:bg-white/[0.05] text-[#FF6B00] border-[#FF6B00]/30'
                          }`}>
                          {meta.label}
                        </span>
                        {isSelected && <span className="w-2 h-2 rounded-full bg-[#FF6B00] animate-pulse"></span>}
                      </div>
                      <div className="text-sm font-bold text-slate-900 dark:text-white">{u.name}</div>
                      <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 data-meta">{meta.desc}</div>
                      <div className="text-[10px] font-mono text-slate-500 mt-1 data-meta">Username: {u.username}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Custom Username Input */}
            <div className="pt-1">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                หรือกรอกชื่อผู้ใช้โดยตรง (Username):
              </label>
              <div className="relative">
                <input
                  type="text"
                  placeholder="เช่น admin, sales, accounting, tech01..."
                  value={customUsername || selectedUsername}
                  onChange={(e) => setCustomUsername(e.target.value)}
                  className="w-full liquid-glass-input rounded-2xl px-3.5 py-2.5 pl-10 text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none transition"
                />
                <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
              </div>
            </div>
              </>
            )}

            {/* Password Input */}
            {usesSupabaseAuth && (
            <div>
              <label htmlFor="staff-password" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                รหัสผ่าน
              </label>
              <input
                type="password"
                id="staff-password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full liquid-glass-input rounded-2xl px-3.5 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none transition"
              />
            </div>
            )}

            <button
              type="submit"
              disabled={submitting || isSyncing}
              className="w-full py-3 px-4 bg-gradient-to-r from-[#FF6B00] to-[#E65A00] hover:from-[#FF8A24] hover:to-[#FF6B00] active:scale-[0.99] text-black font-extrabold rounded-2xl text-sm transition-all duration-200 cursor-pointer flex items-center justify-center gap-2 shadow-xl shadow-[#FF6B00]/30 border border-white/20"
            >
              <span>{submitting || isSyncing ? 'กำลังเข้าสู่ระบบ…' : 'เข้าสู่ระบบ Boss Computech'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>

          {usesSupabaseAuth && (
            <div className="mt-3 flex flex-wrap gap-x-4">
            <button type="button" className="min-h-11 text-sm underline" disabled={submitting}
              onClick={() => {
                setAdminLogin(value => !value);
                setEmail('');
                setPassword('');
                setError('');
                setResetNotice('');
              }}>
              {adminLogin ? 'เข้าสู่ระบบพนักงาน' : 'เข้าสู่ระบบแอดมินด้วยอีเมล'}
            </button>
            {adminLogin && <button type="button" className="min-h-11 text-sm underline" disabled={submitting}
              onClick={() => {
                const field = document.getElementById('staff-email') as HTMLInputElement | null;
                if (field?.reportValidity()) void sendPasswordReset();
              }}>
              แอดมินลืมรหัสผ่าน
            </button>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
