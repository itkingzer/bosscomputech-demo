import React, { useState } from 'react';
import { useApp } from './context/AppContext';
import { LoginPage } from './components/LoginPage';
import { DashboardView } from './components/DashboardView';
import { SalesView } from './components/SalesView';
import { AccountingView } from './components/AccountingView';
import { PrepView } from './components/PrepView';
import { FrontdeskView } from './components/FrontdeskView';
import { OnsiteView } from './components/OnsiteView';
import { RepairView } from './components/RepairView';
import { AdminUserManagement } from './components/AdminUserManagement';
import { SettingsModal } from './components/SettingsModal';
import { 
  Cpu, LayoutDashboard, FilePlus2, Boxes, PackageCheck, 
  Store, Truck, Wrench, Shield, LogOut, Settings, RotateCcw, 
  ChevronRight, Menu, X, Sparkles
} from 'lucide-react';

export const App: React.FC = () => {
  const { 
    currentUser, logout, isSupabaseLive, 
    orders, items, repairTickets, resetAllDemoData 
  } = useApp();

  // If not logged in, show Login Page
  if (!currentUser) {
    return <LoginPage />;
  }

  // Active view tab state (default to user's assigned role tab, or dashboard for admin)
  const [activeTab, setActiveTab] = useState<string>(() => {
    return currentUser.role === 'admin' ? 'dashboard' : currentUser.role;
  });

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  // Badge counts
  const pendingAccounting = orders.filter(o => o.order_status === 'pending_accounting').length;
  const pendingPrep = items.filter(i => i.status === 'pending_prep').length;
  const readyDispatch = items.filter(i => i.status === 'ready_for_dispatch').length;
  const assignedOnsite = items.filter(i => i.status === 'assigned_onsite').length;
  const inRepair = repairTickets.filter(r => r.status === 'in_progress' || r.status === 'open').length;

  // Master definition of nav items
  const allNavItems = [
    { id: 'dashboard', role: 'all', label: 'ภาพรวม & ค้นหา S/N', icon: LayoutDashboard, badge: null, desc: 'ตรวจสอบสถานะ & ประวัติ' },
    { id: 'sales', role: 'sales', label: 'ฝ่ายขาย (Sales)', icon: FilePlus2, badge: null, desc: 'เปิดใบเสนอราคา & สั่งขาย' },
    { id: 'accounting', role: 'accounting', label: 'บัญชี & สต๊อก', icon: Boxes, badge: pendingAccounting, desc: 'ตรวจสอบบิล & ตัดสต๊อก' },
    { id: 'prep', role: 'prep', label: 'ช่างเตรียมสินค้า', icon: PackageCheck, badge: pendingPrep, desc: 'ติดโลโก้ & ผูก S/N' },
    { id: 'frontdesk', role: 'frontdesk', label: 'หน้าร้าน / จัดคิว', icon: Store, badge: readyDispatch, desc: 'จ่ายงาน & รับเครื่องซ่อม' },
    { id: 'onsite', role: 'onsite', label: 'ช่าง Onsite', icon: Truck, badge: assignedOnsite, desc: 'ส่งมอบ & ติดวอยหน้างาน' },
    { id: 'repair', role: 'repair', label: 'ช่างซ่อมในร้าน', icon: Wrench, badge: inRepair, desc: 'ตรวจเช็ค & ซ่อมเครื่อง' },
    { id: 'admin', role: 'admin', label: 'จัดการผู้ใช้ & สิทธิ์', icon: Shield, badge: null, desc: 'แอดมินระบบส่วนกลาง' },
  ];

  // STRICT FILTER:
  // If user is Admin -> can see all tabs.
  // If user is a specific Role -> can ONLY see Dashboard + their own specific Role tab!
  // Any other tabs are COMPLETELY HIDDEN (ไม่ปรากฏให้รกสายตา).
  const visibleNavItems = allNavItems.filter((nav) => {
    if (currentUser.role === 'admin') return true;
    if (nav.id === 'dashboard') return true;
    return nav.role === currentUser.role;
  });

  const getRoleDisplayName = (role: string) => {
    switch (role) {
      case 'admin': return 'Super Admin';
      case 'sales': return 'ฝ่ายขาย (Sales)';
      case 'accounting': return 'บัญชี & สต๊อก';
      case 'prep': return 'ช่างเตรียมสินค้า';
      case 'frontdesk': return 'แอดมินหน้าร้าน';
      case 'onsite': return 'ช่าง Onsite';
      case 'repair': return 'ช่างซ่อมในร้าน';
      default: return role.toUpperCase();
    }
  };

  return (
    <div className="min-h-screen bg-[#08090C] text-slate-100 flex relative overflow-x-hidden">
      
      {/* Background Liquid Light Orbs */}
      <div className="liquid-blob-1"></div>
      <div className="liquid-blob-2"></div>

      {/* Mobile Sidebar Overlay */}
      {isMobileSidebarOpen && (
        <div 
          onClick={() => setIsMobileSidebarOpen(false)}
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden"
        />
      )}

      {/* ========================================================================= */}
      {/* SIDEBAR NAVIGATION (Liquid Glass Vertical Sidebar) */}
      {/* ========================================================================= */}
      <aside className={`
        fixed top-0 bottom-0 left-0 z-50 w-72 liquid-glass-sidebar flex flex-col justify-between transition-transform duration-300 ease-out
        lg:translate-x-0 ${isMobileSidebarOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div className="flex flex-col h-full">
          
          {/* Brand Header */}
          <div className="p-5 border-b border-white/[0.06] flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-[#FF6B00] to-[#993A00] flex items-center justify-center font-bold text-white shadow-lg shadow-[#FF6B00]/30 border border-white/20">
                <Cpu className="w-5 h-5 text-white" />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="font-extrabold text-base tracking-wider text-white">
                    BOSS<span className="text-[#FF6B00]">COMP</span>
                  </span>
                  <span className="text-[9px] uppercase px-1.5 py-0.5 rounded-full bg-[#FF6B00]/15 text-[#FF6B00] border border-[#FF6B00]/30 font-bold">
                    Liquid
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 font-medium">Operations System</p>
              </div>
            </div>

            <button 
              onClick={() => setIsMobileSidebarOpen(false)}
              className="lg:hidden p-1.5 rounded-lg text-slate-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Current User Quick Badge */}
          <div className="p-4 mx-3 my-3 rounded-2xl liquid-glass border border-white/[0.08] relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-24 h-24 bg-[#FF6B00]/10 rounded-full blur-xl pointer-events-none group-hover:bg-[#FF6B00]/20 transition-all"></div>
            <div className="flex items-center gap-3 relative z-10">
              <div className="w-9 h-9 rounded-xl bg-[#FF6B00]/20 border border-[#FF6B00]/30 flex items-center justify-center font-bold text-[#FF6B00] text-sm">
                {currentUser.name.slice(0, 1)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-bold text-white truncate">{currentUser.name}</div>
                <div className="text-[10px] text-[#FF6B00] font-medium flex items-center gap-1 mt-0.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#FF6B00] animate-pulse"></span>
                  <span className="truncate">{getRoleDisplayName(currentUser.role)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Navigation Links (Filtered strictly to visible items only) */}
          <div className="flex-1 px-3 py-2 space-y-1.5 overflow-y-auto">
            <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-500">
              เมนูการทำงาน ({visibleNavItems.length})
            </div>

            {visibleNavItems.map((nav) => {
              const isActive = activeTab === nav.id;
              const Icon = nav.icon;

              return (
                <button
                  key={nav.id}
                  onClick={() => {
                    setActiveTab(nav.id);
                    setIsMobileSidebarOpen(false);
                  }}
                  className={`
                    w-full flex items-center justify-between p-3 rounded-2xl transition-all duration-200 cursor-pointer group text-left
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

          {/* Bottom Actions & DB Mode */}
          <div className="p-3 border-t border-white/[0.06] space-y-2">
            
            {/* Live connection badge */}
            <button
              onClick={() => setIsSettingsOpen(true)}
              className="w-full flex items-center justify-between px-3 py-2 rounded-xl bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.06] text-xs transition cursor-pointer"
            >
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${isSupabaseLive ? 'bg-emerald-400' : 'bg-amber-400'} animate-pulse`}></span>
                <span className={`text-[11px] font-medium ${isSupabaseLive ? 'text-emerald-400' : 'text-amber-400'}`}>
                  {isSupabaseLive ? 'Supabase Live' : 'Demo Local Mode'}
                </span>
              </div>
              <Settings className="w-3.5 h-3.5 text-slate-400" />
            </button>

            {/* Logout button */}
            <button
              onClick={logout}
              className="w-full flex items-center justify-center gap-2 p-2.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 text-xs font-semibold transition cursor-pointer"
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
      <div className="flex-1 flex flex-col min-w-0 lg:pl-72 relative z-10">
        
        {/* Top Floating App Bar */}
        <header className="sticky top-0 z-30 px-4 sm:px-6 lg:px-8 py-3.5 liquid-glass border-b border-white/[0.06] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsMobileSidebarOpen(true)}
              className="lg:hidden p-2 rounded-xl liquid-glass-card text-slate-300 hover:text-white"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-sm font-bold text-white flex items-center gap-2">
                <span>{allNavItems.find(n => n.id === activeTab)?.label}</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/[0.06] text-slate-400 border border-white/[0.08] font-normal hidden sm:inline-block">
                  Role: {currentUser.role}
                </span>
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                if (confirm('ต้องการรีเซ็ตข้อมูลตัวอย่างกลับเป็นค่าเริ่มต้นหรือไม่?')) {
                  resetAllDemoData();
                }
              }}
              title="รีเซ็ตข้อมูลตัวอย่าง"
              className="p-2 rounded-xl liquid-glass-card text-slate-400 hover:text-[#FF6B00] transition cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
            </button>

            <button
              onClick={() => setIsSettingsOpen(true)}
              title="ตั้งค่าระบบ"
              className="p-2 rounded-xl liquid-glass-card text-slate-400 hover:text-[#FF6B00] transition cursor-pointer"
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* Dynamic Content Views */}
        <main className="flex-1 px-4 sm:px-6 lg:px-8 py-6 max-w-7xl w-full mx-auto">
          {activeTab === 'dashboard' && <DashboardView />}
          {activeTab === 'sales' && <SalesView />}
          {activeTab === 'accounting' && <AccountingView />}
          {activeTab === 'prep' && <PrepView />}
          {activeTab === 'frontdesk' && <FrontdeskView />}
          {activeTab === 'onsite' && <OnsiteView />}
          {activeTab === 'repair' && <RepairView />}
          {activeTab === 'admin' && currentUser.role === 'admin' && <AdminUserManagement />}
        </main>

        {/* Bottom Footer */}
        <footer className="px-6 py-4 border-t border-white/[0.05] text-center sm:text-left flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 gap-2 mt-auto">
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
      <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
    </div>
  );
};
