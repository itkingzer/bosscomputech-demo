import { ModalBackdrop } from './components/ui/ModalBackdrop';
import React, { useState, useEffect, Suspense, lazy } from 'react';
import { createPortal } from 'react-dom';
import { useApp } from './context/AppContext';
import { LoginPage } from './components/LoginPage';
import { PasswordRecoveryPage } from './components/PasswordRecoveryPage';
import { RepairReceiptPrintDocument } from './components/RepairReceiptPrintDocument';
import { MyStaffProfile, StaffAvatar } from './components/StaffProfile';

const DashboardView = lazy(() => import('./components/DashboardView').then(m => ({ default: m.DashboardView })));
const SettingsModal = lazy(() => import('./components/SettingsModal').then(m => ({ default: m.SettingsModal })));
const CustomerLandingPage = lazy(() => import('./components/CustomerLandingPage').then(m => ({ default: m.CustomerLandingPage })));

const SalesView = lazy(() => import('./components/SalesView').then(m => ({ default: m.SalesView })));
const PurchasingStockView = lazy(() => import('./components/PurchasingStockView').then(m => ({ default: m.PurchasingStockView })));
const AccountingView = lazy(() => import('./components/AccountingView').then(m => ({ default: m.AccountingView })));
const HrDirectoryView = lazy(() => import('./components/HrDirectoryView').then(m => ({ default: m.HrDirectoryView })));
const PrepView = lazy(() => import('./components/PrepView').then(m => ({ default: m.PrepView })));
const FrontdeskView = lazy(() => import('./components/FrontdeskView').then(m => ({ default: m.FrontdeskView })));
const OnsiteView = lazy(() => import('./components/OnsiteView').then(m => ({ default: m.OnsiteView })));
const RepairView = lazy(() => import('./components/RepairView').then(m => ({ default: m.RepairView })));
const AdminUserManagement = lazy(() => import('./components/AdminUserManagement').then(m => ({ default: m.AdminUserManagement })));
const ProfitDashboardView = lazy(() => import('./components/ProfitDashboardView').then(m => ({ default: m.ProfitDashboardView })));
const CompletedLogsView = lazy(() => import('./components/CompletedLogsView').then(m => ({ default: m.CompletedLogsView })));
import {
  LayoutDashboard, FilePlus2, Boxes, PackageCheck,
  Store, Truck, Wrench, Shield, LogOut, Settings, RotateCcw,
  Menu, X, Sun, Moon, TrendingUp, History,
  Eraser, AlertTriangle, Receipt, Users
} from 'lucide-react';
import { ToastBanner } from './components/ui/ToastBanner';
import { getRoleDisplayName } from './utils/domainHelpers';
import companyLogo from './assets/BossCom.jpg';

export const App: React.FC = () => {
  const {
    passwordRecovery, closePasswordRecovery,
    currentUser, logout, isSupabaseLive, isSyncing, databaseStatusLabel, supabaseUrl, supabaseKey,
    orders, items, repairTickets, projects, resetAllDemoData, clearDemoKeepStock,
    theme, toggleTheme, printingRepairTicket
  } = useApp();
  const canResetDemo = !isSupabaseLive && !(supabaseUrl && supabaseKey);

  // Sync theme class & data-theme on <html> so all document.body Portal modals respond immediately
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', theme === 'dark');
    root.classList.toggle('light', theme === 'light');
    root.setAttribute('data-theme', theme);
  }, [theme]);

  // Active view tab state (default to user's assigned role tab, or dashboard for admin)
  const [activeTab, setActiveTab] = useState<string>(() => {
    if (!currentUser) return 'dashboard';
    return currentUser.role === 'admin' ? 'dashboard' : currentUser.role;
  });

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isClearDemoModalOpen, setIsClearDemoModalOpen] = useState(false);
  const [isResetDemoModalOpen, setIsResetDemoModalOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [showStaffLogin, setShowStaffLogin] = useState(false);

  // Reset activeTab & transient overlays whenever the logged-in user changes (including logout)
  useEffect(() => {
    if (!currentUser) {
      setIsProfileOpen(false);
      setIsSettingsOpen(false);
      setIsClearDemoModalOpen(false);
      setIsMobileSidebarOpen(false);
      setShowStaffLogin(false);
      return;
    }
    setActiveTab(currentUser.role === 'admin' ? 'dashboard' : currentUser.role);
  }, [currentUser?.id]);

  useEffect(() => {
    if (!toastMessage) return;
    const timer = window.setTimeout(() => setToastMessage(null), 4500);
    return () => window.clearTimeout(timer);
  }, [toastMessage]);

  useEffect(() => {
    if (!isClearDemoModalOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsClearDemoModalOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [isClearDemoModalOpen]);
  // Desktop drawer: allow collapsing the persistent sidebar (default open)
  const [isDesktopSidebarOpen, setIsDesktopSidebarOpen] = useState(true);

  // Auto-collapse the mobile drawer when the viewport grows to desktop width
  // (prevents the drawer from staying open / overlapping content after rotation or resize)
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const handleChange = (e: MediaQueryListEvent | MediaQueryList) => {
      if (e.matches) setIsMobileSidebarOpen(false);
    };
    handleChange(mq);
    mq.addEventListener('change', handleChange);
    return () => mq.removeEventListener('change', handleChange);
  }, []);

  // Mobile drawer: lock scroll (html + body + main container) + close on Escape key
  useEffect(() => {
    if (isMobileSidebarOpen) {
      const htmlEl = document.documentElement;
      const bodyEl = document.body;
      const mainEl = document.querySelector('main');

      const prevHtmlOverflow = htmlEl.style.overflow;
      const prevBodyOverflow = bodyEl.style.overflow;
      const prevMainOverflow = mainEl ? mainEl.style.overflow : '';

      htmlEl.style.overflow = 'hidden';
      bodyEl.style.overflow = 'hidden';
      if (mainEl) mainEl.style.overflow = 'hidden';

      const onKey = (e: KeyboardEvent) => {
        if (e.key === 'Escape') setIsMobileSidebarOpen(false);
      };
      window.addEventListener('keydown', onKey);
      return () => {
        htmlEl.style.overflow = prevHtmlOverflow;
        bodyEl.style.overflow = prevBodyOverflow;
        if (mainEl) mainEl.style.overflow = prevMainOverflow;
        window.removeEventListener('keydown', onKey);
      };
    }
  }, [isMobileSidebarOpen]);

  if (passwordRecovery) {
    return (
      <>
        <PasswordRecoveryPage
          onOpenSettings={() => setIsSettingsOpen(true)}
          onContinue={() => {
            closePasswordRecovery();
            setShowStaffLogin(true);
          }}
        />
        {isSettingsOpen && (
          <Suspense fallback={null}>
            <SettingsModal isOpen onClose={() => setIsSettingsOpen(false)} />
          </Suspense>
        )}
      </>
    );
  }

  // If not logged in, show Customer Landing Page by default (or Staff Login when toggled)
  if (!currentUser) {
    if (showStaffLogin) {
      return (
        <>
          <LoginPage onBackToLanding={() => setShowStaffLogin(false)} onOpenSettings={() => setIsSettingsOpen(true)} />
          {isSettingsOpen && (
            <Suspense fallback={null}>
              <SettingsModal isOpen onClose={() => setIsSettingsOpen(false)} />
            </Suspense>
          )}
        </>
      );
    }
    return (
      <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-300 text-sm">กำลังโหลด...</div>}>
        <CustomerLandingPage onOpenStaffLogin={() => setShowStaffLogin(true)} />
      </Suspense>
    );
  }

  // Badge counts (aligned with each view's active queue)
  const pendingAccounting = orders.filter(o => o.order_status === 'pending_purchasing' || o.order_status === 'waiting_po' || o.order_status === 'po_received_in_stock').length;
  const pendingPrep = items.filter(i => i.status === 'pending_prep').length;
  const readyDispatch =
    items.filter(i => (i.status === 'ready_for_dispatch' || i.status === 'prepped_in_stock') && Boolean(i.order_id)).length +
    repairTickets.filter(r => r.status === 'awaiting_dispatch' || r.repair_status === 'ready_pickup').length;
  const assignedOnsite =
    items.filter(i => i.status === 'assigned_onsite' && !i.project_id).length +
    projects.filter(p => p.status !== 'completed').length +
    repairTickets.filter(r => r.status === 'dispatched_onsite' || (r.intake_channel === 'onsite_pickup' && r.status !== 'returned_closed')).length;
  const inRepair = repairTickets.filter(r =>
    r.status !== 'returned_closed' &&
    r.repair_status !== 'completed' &&
    r.repair_status !== 'ready_pickup' &&
    !r.delivered_at
  ).length;

  // Master definition of nav items
  const allNavItems = [
    { id: 'dashboard', role: 'all', label: 'ภาพรวม & ค้นหา S/N', icon: LayoutDashboard, badge: null, desc: 'ตรวจสอบสถานะ & ประวัติ' },
    { id: 'sales', role: 'sales', label: 'ฝ่ายขาย (Sales)', icon: FilePlus2, badge: null, desc: 'ORDER FORM 2026 (ใบขาว)' },
    { id: 'profit', role: 'sales', label: 'สรุปยอด & กำไร (GP)', icon: TrendingUp, badge: null, desc: 'ยอดขาย, ต้นทุน, GP & ค่าคอม' },
    { id: 'accounting', role: 'accounting', label: 'จัดซื้อ & สต๊อก', icon: Boxes, badge: pendingAccounting, desc: 'ใบชมพู & ใบสั่งซื้อ PO' },
    { id: 'finance', role: 'finance', label: 'บัญชี (Accounting)', icon: Receipt, badge: null, desc: 'วางบิล, ใบกำกับ & ORDER FORM' },
    { id: 'prep', role: 'prep', label: 'ช่างเตรียมสินค้า', icon: PackageCheck, badge: pendingPrep, desc: '2 จังหวะ: เตรียม/ปล่อยของ' },
    { id: 'frontdesk', role: 'frontdesk', label: 'หน้าร้าน / จัดคิว', icon: Store, badge: readyDispatch, desc: 'จ่ายงาน & รับเครื่องซ่อม' },
    { id: 'onsite', role: 'onsite', label: 'ช่าง Onsite', icon: Truck, badge: assignedOnsite, desc: 'ส่งมอบ & รับเครื่องกลับ' },
    { id: 'repair', role: 'repair', label: 'ช่างซ่อมในร้าน', icon: Wrench, badge: inRepair, desc: 'ตรวจเช็ค & ออกใบรับซ่อม' },
    { id: 'hr', role: 'hr', label: 'บุคคล (HR)', icon: Users, badge: null, desc: 'รายชื่อพนักงาน & ภาระงาน' },
    { id: 'completed-logs', role: 'all', label: 'ประวัติงาน & Log', icon: History, badge: null, desc: 'งานที่ปิดแล้ว & ไทม์ไลน์ย้อนหลัง' },
    { id: 'admin', role: 'admin', label: 'จัดการผู้ใช้ & สิทธิ์', icon: Shield, badge: null, desc: 'แอดมินระบบส่วนกลาง' },
  ];

  // STRICT FILTER:
  // If user is Admin -> can see all tabs.
  // If user is a specific Role -> can ONLY see Dashboard + their own specific Role tab!
  // Any other tabs are COMPLETELY HIDDEN (ไม่ปรากฏให้รกสายตา).
  const visibleNavItems = allNavItems.filter((nav) => {
    if (currentUser.role === 'admin') return true;
    if (nav.id === 'dashboard') return true;
    // แท็บประวัติงาน & Log เปิดให้ทุกบทบาทปฏิบัติการเข้าถึงได้
    if (nav.id === 'completed-logs') return true;
    // พนักงานขายเห็นทั้งแท็บ Sales และแท็บสรุปยอด & กำไร (ของตัวเอง)
    if (nav.id === 'profit' && currentUser.role === 'sales') return true;
    // ผู้บริหาร/ผู้จัดการ (manager) เห็นแท็บสรุปยอด & กำไร ภาพรวมทั้งบริษัท
    if (nav.id === 'profit' && (currentUser.role as string) === 'manager') return true;
    return nav.role === currentUser.role;
  });
  const workMenu = {
    label: 'งานประจำ',
    ids: ['sales', 'accounting', 'prep', 'frontdesk', 'onsite', 'repair', 'finance', 'hr']
  };
  const overviewMenu = { label: 'ภาพรวม', ids: ['dashboard'] };
  const navGroups = [
    ...(currentUser.role === 'admin' ? [overviewMenu, workMenu] : [workMenu, overviewMenu]),
    { label: 'รายงานและประวัติ', ids: ['profit', 'completed-logs'] },
    { label: 'ดูแลระบบ', ids: ['admin'] }
  ];

  return (
    <div className="min-h-screen bg-[var(--bg-page)] text-[var(--text-primary)] flex relative overflow-x-hidden transition-colors duration-300">

      {/* Background Liquid Light Orbs */}
      <div className="liquid-blob-1"></div>
      <div className="liquid-blob-2"></div>

      {/* Mobile Sidebar Backdrop Overlay */}
      <div
        onClick={() => setIsMobileSidebarOpen(false)}
        aria-hidden="true"
        className={`
          fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden
          transition-opacity duration-300 ease-out
          ${isMobileSidebarOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}
        `}
      />

      {/* ========================================================================= */}
      {/* SIDEBAR NAVIGATION (Liquid Glass Vertical Sidebar) */}
      {/* ========================================================================= */}
      <aside
        aria-label="เมนูนำทางหลัก"
        aria-hidden={!isMobileSidebarOpen && !isDesktopSidebarOpen}
        className={`
          fixed top-0 bottom-0 left-0 z-40 w-[82vw] max-w-[19rem] sm:w-72 liquid-glass-sidebar flex flex-col justify-between
          transition-transform duration-300 ease-out will-change-transform
          lg:w-64 xl:w-72 lg:max-w-none
          ${isMobileSidebarOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full'}
          ${isDesktopSidebarOpen ? 'lg:translate-x-0' : 'lg:-translate-x-full'}
        `}
      >
        <div className="flex flex-col h-full">

          {/* Brand Header */}
          <div className="p-5 border-b border-white/[0.06] flex items-center justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <img
                src={companyLogo}
                alt="Boss Computech Logo"
                className="w-10 h-10 rounded-full object-cover ring-1 ring-white/20 shadow-lg flex-shrink-0"
              />
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="font-extrabold text-[13px] leading-tight tracking-tight text-white">
                    Boss Computech <span className="text-[#FF6B00]">and Service Co., Ltd.</span>
                  </span>
                  <span className="text-[9px] uppercase px-1.5 py-0.5 rounded-full bg-[#FF6B00]/15 text-[#FF6B00] border border-[#FF6B00]/30 font-bold flex-shrink-0">
                    Liquid
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 font-medium">Operations System</p>
              </div>
            </div>

            <button
              onClick={() => {
                setIsMobileSidebarOpen(false);
                setIsDesktopSidebarOpen(false);
              }}
              aria-label="ปิดเมนู"
              className="p-2.5 -mr-1 rounded-xl text-slate-400 hover:text-white hover:bg-white/[0.06] transition-all duration-150 active:scale-[0.97] min-w-[44px] min-h-[44px] flex items-center justify-center"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Current User Quick Badge */}
          <button
            type="button"
            onClick={() => {
              setIsMobileSidebarOpen(false);
              setIsProfileOpen(true);
            }}
            aria-haspopup="dialog"
            className="p-4 mx-3 my-3 rounded-2xl liquid-glass border border-white/[0.08] relative overflow-hidden group cursor-pointer text-left focus-visible:ring-2 focus-visible:ring-[#FF6B00]"
          >
            <div className="absolute top-0 right-0 w-24 h-24 bg-[#FF6B00]/10 rounded-full blur-xl pointer-events-none group-hover:bg-[#FF6B00]/20 transition-all"></div>
            <div className="flex items-center gap-3 relative z-10">
              <StaffAvatar user={currentUser} className="size-10 text-sm" />
              <div className="flex-1 min-w-0">
                <div className="text-xs font-bold text-white truncate">{currentUser.name}</div>
                <div className="text-[10px] text-[#FF6B00] font-medium flex items-center gap-1 mt-0.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#FF6B00] animate-pulse"></span>
                  <span>โปรไฟล์ของฉัน</span>
                </div>
              </div>
            </div>
          </button>

          {/* Navigation Links (Filtered strictly to visible items only) */}
          <nav aria-label="เมนูการทำงาน" className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-2">
            {navGroups.map(({ label, ids }) => {
              const entries = ids.flatMap(id => visibleNavItems.filter(nav => nav.id === id));
              if (!entries.length) return null;
              return (
                <div key={label} role="group" aria-label={label} className="space-y-1">
                  <div className="px-3 py-1 text-xs font-semibold text-slate-400">{label}</div>
                  {entries.map((nav) => {
                    const isActive = activeTab === nav.id;
                    const Icon = nav.icon;

                    return (
                      <button
                        key={nav.id}
                        type="button"
                        onClick={() => {
                          setActiveTab(nav.id);
                          setIsMobileSidebarOpen(false);
                        }}
                        aria-current={isActive ? 'page' : undefined}
                        className={`
                          w-full flex items-center justify-between p-3 min-h-[52px] rounded-2xl transition-all duration-200 ease-out cursor-pointer group text-left
                          active:scale-[0.97] hover:brightness-105 focus-visible:outline-2 focus-visible:outline-orange-400
                          ${isActive
                            ? 'liquid-glass-active font-bold shadow-lg shadow-[#FF6B00]/25'
                            : 'text-slate-300 hover:text-white hover:bg-white/[0.05] border border-transparent hover:border-white/[0.06]'
                          }
                        `}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={`
                            p-2 rounded-xl transition-all
                            ${isActive
                              ? 'bg-black/20 text-black'
                              : 'bg-white/[0.05] text-[#FF6B00] group-hover:bg-[#FF6B00]/15'
                            }
                          `}>
                            <Icon className="w-4 h-4" />
                          </div>
                          <div className="truncate">
                            <div className={`text-xs ${isActive ? 'text-black font-extrabold' : 'text-slate-200 group-hover:text-white font-medium'}`}>
                              {nav.label}
                            </div>
                            <div className={`text-[10px] truncate ${isActive ? 'text-black/80' : 'text-slate-500'}`}>
                              {nav.desc}
                            </div>
                          </div>
                        </div>

                        {nav.badge !== null && nav.badge > 0 && (
                          <span className={`
                            px-2 py-0.5 rounded-full text-[10px] font-bold ml-2 flex-shrink-0
                            ${isActive
                              ? 'bg-black text-[#FF6B00]'
                              : 'bg-[#FF6B00]/20 text-[#FF6B00] border border-[#FF6B00]/40 shadow-sm shadow-[#FF6B00]/20'
                            }
                          `}>
                            {nav.badge}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </nav>

          {/* Bottom Actions & DB Mode */}
          <div className="p-3 border-t border-white/[0.06] space-y-2">

            {/* Live connection badge */}
            <button
              onClick={() => setIsSettingsOpen(true)}
              className="w-full flex items-center justify-between px-3 py-2 rounded-xl bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.06] text-xs transition-all duration-150 active:scale-[0.97] cursor-pointer"
            >
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${isSupabaseLive ? 'bg-emerald-400' : 'bg-amber-400'} animate-pulse`}></span>
                <span role="status" className={`text-[11px] font-medium ${isSupabaseLive ? 'text-emerald-400' : 'text-amber-400'}`}>
                  {databaseStatusLabel}
                </span>
              </div>
              <Settings className={`w-3.5 h-3.5 text-slate-400 ${isSyncing ? 'animate-spin' : ''}`} />
            </button>

            {/* Clear Demo Keep Stock (mobile drawer action) */}
            <button
              onClick={() => {
                setIsMobileSidebarOpen(false);
                setIsClearDemoModalOpen(true);
              }}
              className="sm:hidden w-full flex items-center justify-center gap-2 px-3 py-2.5 min-h-[44px] rounded-xl border bg-emerald-700 hover:bg-emerald-800 text-white border-emerald-700 text-xs font-semibold transition-all duration-150 active:scale-[0.97] cursor-pointer"
            >
              <Eraser className="w-3.5 h-3.5 flex-shrink-0" />
              <span className="truncate">เริ่มใช้งานจริง (ล้างบิลทดสอบ / เหลือสต๊อก)</span>
            </button>

            {canResetDemo && (
              <button
                type="button"
                onClick={() => {
                  setIsMobileSidebarOpen(false);
                  setIsResetDemoModalOpen(true);
                }}
                className="sm:hidden w-full flex items-center justify-center gap-2 px-3 py-2.5 min-h-11 rounded-xl bg-orange-500/15 hover:bg-orange-500/25 text-orange-300 border border-orange-500/30 text-xs font-semibold cursor-pointer"
              >
                <RotateCcw className="size-4" aria-hidden="true" />
                <span>ทดสอบเดโมใหม่</span>
              </button>
            )}

            {/* Logout button */}
            <button
              onClick={logout}
              className="w-full flex items-center justify-center gap-2 p-2.5 min-h-[44px] rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 text-xs font-semibold transition-all duration-150 active:scale-[0.97] hover:brightness-105 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>ออกจากระบบ</span>
            </button>
          </div>

        </div>
      </aside>

      {/* ========================================================================= */}
      {/* MAIN CONTENT AREA */}
      {/* ========================================================================= */}
      <div className={`flex-1 flex flex-col min-w-0 relative z-10 transition-[padding] duration-300 ease-out ${isDesktopSidebarOpen ? 'lg:pl-64 xl:pl-72' : 'lg:pl-0'}`}>

        {/* Top Floating App Bar */}
        <header className="sticky top-0 z-30 px-3 sm:px-5 lg:px-6 xl:px-8 py-2.5 sm:py-3.5 liquid-glass border-b border-white/[0.06] flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
            {/* Hamburger (mobile / tablet only) */}
            <button
              onClick={() => setIsMobileSidebarOpen(true)}
              aria-label="เปิดเมนูนำทาง"
              aria-expanded={isMobileSidebarOpen}
              className="lg:hidden p-2.5 -ml-1 rounded-xl liquid-glass-card text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white min-w-[44px] min-h-[44px] flex items-center justify-center flex-shrink-0"
            >
              <Menu className="w-5 h-5" />
            </button>

            {/* Desktop sidebar toggle (collapse / expand) */}
            <button
              onClick={() => setIsDesktopSidebarOpen(v => !v)}
              aria-label={isDesktopSidebarOpen ? 'ซ่อนเมนูด้านข้าง' : 'แสดงเมนูด้านข้าง'}
              aria-expanded={isDesktopSidebarOpen}
              title={isDesktopSidebarOpen ? 'ซ่อนเมนูด้านข้าง' : 'แสดงเมนูด้านข้าง'}
              className="hidden lg:flex p-2.5 -ml-1 rounded-xl liquid-glass-card text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition min-w-[44px] min-h-[44px] items-center justify-center flex-shrink-0"
            >
              <Menu className="w-5 h-5" />
            </button>

            {/* Brand logo + page title — centered on mobile, left-aligned on desktop */}
            <div className="min-w-0 flex-1 lg:flex-none text-center lg:text-left flex items-center justify-center lg:justify-start gap-2.5">
              <img
                src={companyLogo}
                alt="Boss Computech Logo"
                className="w-8 h-8 sm:w-9 sm:h-9 rounded-full object-cover ring-1 ring-slate-300 dark:ring-white/20 shadow-md flex-shrink-0"
              />
              <div className="min-w-0">
                <div className="text-[11px] font-extrabold text-slate-900 dark:text-white leading-tight truncate">
                  Boss Computech <span className="hidden sm:inline text-[#FF6B00]">and Service Co., Ltd.</span>
                </div>
                <h1 className="text-[10px] sm:text-xs font-medium text-slate-600 dark:text-slate-400 flex items-center justify-center lg:justify-start gap-2">
                  <span className="truncate lg:whitespace-normal">{allNavItems.find(n => n.id === activeTab)?.label}</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-200/70 dark:bg-white/[0.06] text-slate-700 dark:text-slate-400 border border-slate-300 dark:border-white/[0.08] font-normal hidden lg:inline-block">
                    Role: {currentUser.role}
                  </span>
                </h1>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
            {/* Demo / Live status badge (mobile / tablet only) */}
            <button
              onClick={() => setIsSettingsOpen(true)}
              aria-label={`สถานะฐานข้อมูล ${databaseStatusLabel}`}
              className={`lg:hidden flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-[10px] font-bold transition-all duration-150 active:scale-[0.97] cursor-pointer min-h-[36px] ${isSupabaseLive
                ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                : 'bg-amber-500/15 text-amber-400 border-amber-500/30'
                }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full animate-pulse ${isSupabaseLive ? 'bg-emerald-400' : 'bg-amber-400'}`}></span>
              <span role="status">{databaseStatusLabel}</span>
            </button>
            {/* Theme Toggle Button (Liquid Glass Dark / Light) */}
            <button
              onClick={toggleTheme}
              title={theme === 'dark' ? 'เปลี่ยนเป็นธีมสว่าง (Liquid Glass Light)' : 'เปลี่ยนเป็นธีมมืด (Liquid Glass Dark)'}
              aria-label={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
              className="relative p-2 rounded-xl liquid-glass-card text-slate-600 dark:text-slate-300 hover:text-[#FF6B00] transition-all cursor-pointer flex items-center justify-center group overflow-hidden"
            >
              <div className="relative w-4 h-4 flex items-center justify-center">
                {theme === 'dark' ? (
                  <Sun className="w-4 h-4 text-amber-400 group-hover:rotate-45 transition-transform duration-300" />
                ) : (
                  <Moon className="w-4 h-4 text-blue-500 group-hover:-rotate-12 transition-transform duration-300" />
                )}
              </div>
            </button>

            <button
              onClick={() => setIsClearDemoModalOpen(true)}
              title="เคลียร์ข้อมูล Demo (เหลือไว้เฉพาะคลังสินค้า)"
              aria-label="เริ่มใช้งานจริง (ล้างบิลทดสอบ / เหลือสต๊อก)"
              className="hidden sm:flex items-center gap-1.5 px-3 py-2 rounded-xl border bg-emerald-700 hover:bg-emerald-800 text-white border-emerald-700 text-[11px] font-semibold transition-all duration-150 active:scale-[0.97] cursor-pointer min-h-[40px] whitespace-nowrap"
            >
              <Eraser className="w-3.5 h-3.5 flex-shrink-0" />
              <span className="hidden xl:inline">เริ่มใช้งานจริง (ล้างบิลทดสอบ / เหลือสต๊อก)</span>
              <span className="xl:hidden">ล้างบิลทดสอบ</span>
            </button>

            {canResetDemo && (
              <button
                type="button"
                onClick={() => setIsResetDemoModalOpen(true)}
                className="hidden sm:flex items-center gap-1.5 px-3 py-2 rounded-xl liquid-glass-card text-slate-600 dark:text-slate-300 hover:text-[#FF6B00] border border-slate-200 dark:border-white/[0.08] text-[11px] font-semibold transition-all duration-150 active:scale-[0.97] cursor-pointer min-h-[40px] whitespace-nowrap"
              >
                <RotateCcw className="w-3.5 h-3.5 flex-shrink-0" aria-hidden="true" />
                <span>ทดสอบเดโมใหม่</span>
              </button>
            )}

            <button
              onClick={() => setIsSettingsOpen(true)}
              title="ตั้งค่าระบบ"
              aria-label="ตั้งค่าระบบ"
              className="hidden lg:flex p-2 rounded-xl liquid-glass-card text-slate-400 hover:text-[#FF6B00] transition cursor-pointer min-w-[40px] min-h-[40px] items-center justify-center"
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* Dynamic Content Views — keyed by activeTab so each switch replays a
            fast 250ms slide-up instead of snapping abruptly. */}
        <main className="flex-1 px-3 sm:px-5 lg:px-6 xl:px-8 py-4 sm:py-5 xl:py-6 max-w-7xl w-full mx-auto min-w-0 overflow-y-auto">
          <div key={activeTab} className="animate-slide-up">
            <Suspense
              fallback={
                <div className="liquid-glass-card rounded-2xl p-8 flex items-center justify-center gap-3 text-slate-400 text-sm">
                  <span className="w-4 h-4 rounded-full border-2 border-[#FF6B00] border-t-transparent animate-spin" />
                  <span>กำลังโหลดหน้าจอ...</span>
                </div>
              }
            >
              {activeTab === 'dashboard' && <DashboardView />}
              {activeTab === 'sales' && <SalesView />}
              {activeTab === 'profit' && <ProfitDashboardView />}
              {activeTab === 'accounting' && <PurchasingStockView />}
              {activeTab === 'finance' && <AccountingView />}
              {activeTab === 'prep' && <PrepView />}
              {activeTab === 'frontdesk' && <FrontdeskView />}
              {activeTab === 'onsite' && <OnsiteView />}
              {activeTab === 'repair' && <RepairView />}
              {activeTab === 'hr' && <HrDirectoryView />}
              {activeTab === 'completed-logs' && <CompletedLogsView />}
              {activeTab === 'admin' && currentUser.role === 'admin' && <AdminUserManagement />}
            </Suspense>
          </div>
        </main>

        {/* Bottom Footer */}
        <footer className="px-4 sm:px-6 py-4 border-t border-white/[0.05] text-center sm:text-left flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 gap-2 mt-auto">
          <div>
            © 2026 <strong>BossComputech Co., Ltd.</strong> All rights reserved.
          </div>
          <div className="flex items-center gap-2 text-slate-400">
            <span className="w-1.5 h-1.5 rounded-full bg-[#FF6B00]"></span>
            <span>Liquid Glass Dark Orange Interface</span>
          </div>
        </footer>

      </div>

      {/* Settings Modal */}
      {isProfileOpen && <MyStaffProfile key={currentUser.id} user={currentUser} onClose={() => setIsProfileOpen(false)} />}
      {isSettingsOpen && (
        <Suspense fallback={null}>
          <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
        </Suspense>
      )}

      {/* Confirm Clear Demo Keep Stock Modal */}
      {isClearDemoModalOpen &&
        createPortal(
          <ModalBackdrop
            className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6 animate-fade-in"
            onDismiss={() => setIsClearDemoModalOpen(false)}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="clear-demo-modal-title"
              onClick={(e) => e.stopPropagation()}
              className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-800 shadow-2xl rounded-3xl w-full max-w-md max-h-[82dvh] sm:max-h-[86dvh] overflow-y-auto overscroll-contain p-5 sm:p-6 pb-[max(1.25rem,env(safe-area-inset-bottom))] relative animate-modal-pop"
            >
              <button
                onClick={() => setIsClearDemoModalOpen(false)}
                aria-label="ปิดหน้าต่างยืนยัน"
                className="absolute top-3 right-3 sm:top-4 sm:right-4 p-2 rounded-xl text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/[0.06] transition-all duration-150 active:scale-[0.97] cursor-pointer min-w-[40px] min-h-[40px] flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="flex items-start gap-3 mb-4 pr-8">
                <div className="p-2.5 rounded-2xl bg-amber-100 text-amber-800 border border-amber-300 dark:bg-amber-500/15 dark:text-amber-400 dark:border-amber-500/30 flex-shrink-0">
                  <AlertTriangle className="w-6 h-6" />
                </div>
                <div>
                  <h3 id="clear-demo-modal-title" className="text-base font-bold text-slate-900 dark:text-white">
                    เคลียร์ข้อมูล Demo (เหลือไว้เฉพาะคลังสินค้า)
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    เตรียมระบบให้สะอาดพร้อมเริ่มใช้งานจริง
                  </p>
                </div>
              </div>

              <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 dark:bg-amber-500/10 dark:border-amber-500/30 dark:text-slate-200 text-xs leading-relaxed mb-5">
                ยืนยันการล้างข้อมูลทดสอบทั้งหมด (บิลขาย, PO, คิวงานซ่อม, งานโปรเจกต์, สัญญาเช่า/MA, ประวัติ Log) โดยจะยังคง <strong>Catalog สินค้า</strong> และ <strong>ยอดสต๊อกคงเหลือในคลัง</strong> ไว้ทั้งหมด?
              </div>

              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsClearDemoModalOpen(false)}
                  className="flex-1 px-4 py-2.5 min-h-[44px] rounded-2xl border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-white/[0.04] hover:bg-slate-200 dark:hover:bg-white/[0.08] text-slate-700 dark:text-slate-300 font-semibold text-xs transition-all duration-150 active:scale-[0.97] cursor-pointer"
                >
                  ยกเลิก
                </button>
                <button
                  type="button"
                  onClick={() => {
                    clearDemoKeepStock();
                    setIsClearDemoModalOpen(false);
                    setToastMessage('เคลียร์ข้อมูลทดสอบเรียบร้อย พร้อมเริ่มใช้งานจริง (คงเหลือสต๊อกและ Catalog ไว้แล้ว)');
                  }}
                  className="flex-1 px-4 py-2.5 min-h-[44px] rounded-2xl bg-gradient-to-r from-[#FF6B00] to-[#E65A00] hover:from-[#FF8A24] hover:to-[#FF6B00] text-black font-extrabold text-xs transition-all duration-150 active:scale-[0.97] cursor-pointer shadow-lg shadow-[#FF6B00]/25 border border-white/20"
                >
                  ยืนยันล้างข้อมูลทดสอบ
                </button>
              </div>
            </div>
          </ModalBackdrop>,
          document.body
        )}

      {/* Reset Demo Data Modal (Keep Catalog vs Full Factory Reset) */}
      {canResetDemo && isResetDemoModalOpen &&
        createPortal(
          <ModalBackdrop
            className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6 animate-fade-in"
            onDismiss={() => setIsResetDemoModalOpen(false)}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="reset-demo-modal-title"
              onClick={(e) => e.stopPropagation()}
              className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-800 shadow-2xl rounded-3xl w-full max-w-md max-h-[82dvh] sm:max-h-[86dvh] overflow-y-auto overscroll-contain p-5 sm:p-6 pb-[max(1.25rem,env(safe-area-inset-bottom))] relative animate-modal-pop"
            >
              <button
                onClick={() => setIsResetDemoModalOpen(false)}
                aria-label="ปิดหน้าต่างรีเซ็ตเดโม่"
                className="absolute top-3 right-3 sm:top-4 sm:right-4 p-2 rounded-xl text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/[0.06] transition-all duration-150 active:scale-[0.97] cursor-pointer min-w-[40px] min-h-[40px] flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="flex items-start gap-3 mb-4 pr-8">
                <div className="p-2.5 rounded-2xl bg-orange-100 text-orange-700 border border-orange-300 dark:bg-[#FF6B00]/15 dark:text-[#FF8A24] dark:border-[#FF6B00]/30 flex-shrink-0">
                  <RotateCcw className="w-6 h-6" />
                </div>
                <div>
                  <h3 id="reset-demo-modal-title" className="text-base font-bold text-slate-900 dark:text-white">
                    ทดสอบเดโมใหม่
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    ข้อมูลทดสอบที่แก้ไขไว้ในเบราว์เซอร์นี้จะถูกแทนที่ด้วยข้อมูลตัวอย่าง
                  </p>
                </div>
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 text-slate-700 dark:bg-white/[0.03] dark:border-white/[0.08] dark:text-slate-300 text-xs leading-relaxed mb-5 space-y-1.5">
                <p>
                  • <strong className="text-slate-900 dark:text-white">รีเซ็ตเดโม่ (เก็บ Catalog ไว้):</strong> คืนค่าบิลทดสอบ, PO, คิวงานช่าง และสต๊อกตัวอย่าง โดย <strong className="text-emerald-600 dark:text-emerald-400">คงรายการสินค้าใน Catalog ของคุณไว้ทั้งหมด</strong>
                </p>
                <p>
                  • <strong className="text-slate-900 dark:text-white">รีเซ็ตทั้งหมดรวม Catalog:</strong> คืนค่าระบบและ Catalog กลับเป็นค่าเริ่มต้นชุดใหม่ของระบบ
                </p>
              </div>

              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => {
                    resetAllDemoData({ preserveCatalog: true });
                    setIsResetDemoModalOpen(false);
                    setToastMessage('รีเซ็ตข้อมูลทดสอบ Demo เรียบร้อยแล้ว (เก็บ Catalog สินค้าไว้เหมือนเดิม)');
                  }}
                  className="w-full px-4 py-2.5 min-h-[44px] rounded-2xl bg-gradient-to-r from-[#FF6B00] to-[#E65A00] hover:from-[#FF8A24] hover:to-[#FF6B00] text-black font-extrabold text-xs transition-all duration-150 active:scale-[0.97] cursor-pointer shadow-lg shadow-[#FF6B00]/25 border border-white/20"
                >
                  รีเซ็ตเดโม่ (เก็บ Catalog ไว้)
                </button>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsResetDemoModalOpen(false)}
                    className="flex-1 px-4 py-2.5 min-h-[42px] rounded-2xl border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-white/[0.04] hover:bg-slate-200 dark:hover:bg-white/[0.08] text-slate-700 dark:text-slate-300 font-semibold text-xs transition-all duration-150 active:scale-[0.97] cursor-pointer"
                  >
                    ยกเลิก
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      resetAllDemoData({ preserveCatalog: false });
                      setIsResetDemoModalOpen(false);
                      setToastMessage('รีเซ็ตระบบและ Catalog กลับเป็นค่าเริ่มต้นทั้งหมดเรียบร้อยแล้ว');
                    }}
                    className="flex-1 px-4 py-2.5 min-h-[42px] rounded-2xl border border-rose-300 dark:border-rose-500/30 bg-rose-50 dark:bg-rose-500/10 hover:bg-rose-100 dark:hover:bg-rose-500/20 text-rose-700 dark:text-rose-300 font-semibold text-xs transition-all duration-150 active:scale-[0.97] cursor-pointer"
                  >
                    รีเซ็ตทั้งหมดรวม Catalog
                  </button>
                </div>
              </div>
            </div>
          </ModalBackdrop>,
          document.body
        )}

      {/* Toast Notification */}
      <ToastBanner message={toastMessage || ''} onClose={() => setToastMessage(null)} durationMs={4500} />

      {/* Dedicated Portal Print Layer for Repair Receipts (#repair-print-root) */}
      {printingRepairTicket &&
        createPortal(
          <div className="hidden print:block print-portal-wrapper">
            <RepairReceiptPrintDocument ticket={printingRepairTicket} />
          </div>,
          document.getElementById('repair-print-root') || document.body
        )}
    </div>
  );
};
