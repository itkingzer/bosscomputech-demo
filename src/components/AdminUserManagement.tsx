import { PhoneInput } from './ui/FormInputs';
import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { useApp } from '../context/AppContext';
import { Users, UserPlus, Trash2, Shield, Database } from 'lucide-react';
import { UserRole } from '../types';
import { ToastBanner } from './ui/ToastBanner';
import { OnlineStaffManagement } from './OnlineStaffManagement';

export const AdminUserManagement: React.FC = () => {
  const { currentUser, users, addUser, deleteUser, resetAllDemoData, usesSupabaseAuth } = useApp();
  const [showAddModal, setShowAddModal] = useState(false);
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [role, setRole] = useState<UserRole>('sales');
  const [phone, setPhone] = useState('');
  const [badge, setBadge] = useState('');
  const [toast, setToast] = useState('');

  if (currentUser?.role !== 'admin') {
    return (
      <div className="liquid-glass rounded-3xl p-8 text-center border border-slate-200 dark:border-white/[0.08]">
        <Shield className="w-10 h-10 mx-auto mb-3 text-rose-500" />
        <h2 className="text-base font-bold text-slate-900 dark:text-white">ไม่มีสิทธิ์เข้าถึงส่วนจัดการระบบ</h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">เฉพาะ Super Admin เท่านั้นที่สามารถจัดการบัญชีผู้ใช้ได้</p>
      </div>
    );
  }

  if (usesSupabaseAuth) return <OnlineStaffManagement />;

  const handleAddUser = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = name.trim();
    const cleanUsername = username.toLowerCase().trim();
    if (!cleanName || !cleanUsername) return;

    if (users.some(u => u.username.toLowerCase() === cleanUsername)) {
      alert('Username นี้มีอยู่ในระบบแล้ว');
      return;
    }

    addUser({
      name: cleanName,
      username: cleanUsername,
      password: 'password123',
      role,
      phone: phone.trim() || '-',
      badge: badge.trim() || role.toUpperCase()
    });

    setName('');
    setUsername('');
    setPhone('');
    setBadge('');
    setShowAddModal(false);
    showNotice('เพิ่มผู้ใช้งานใหม่สำเร็จ');
  };

  const showNotice = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  };

  const roleLabel: Record<UserRole, string> = {
    admin: 'ผู้ดูแลระบบ (Admin)',
    sales: '1. ฝ่ายขาย',
    accounting: '2. จัดซื้อ & สต๊อก',
    finance: '3. บัญชี (Accounting)',
    prep: '4. ช่างเตรียมสินค้า',
    frontdesk: '5. แอดมินหน้าร้าน',
    onsite: '6. ช่าง Onsite',
    repair: '7. ช่างซ่อมในร้าน',
    hr: '8. บุคคล (HR)'
  };

  return (
    <div className="space-y-6">
      <ToastBanner message={toast} onClose={() => setToast('')} />

      {/* Admin Header in Liquid Glass */}
      <div className="liquid-glass rounded-3xl p-6 sm:p-7 shadow-2xl border border-slate-200 dark:border-white/[0.08] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-[#FF6B00]/15 text-[#FF6B00] border border-[#FF6B00]/30">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">แผงควบคุมผู้ดูแลระบบ (Admin Control Center)</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">จัดการรายชื่อผู้ใช้ บัญชีแยกแผนก กำหนดสิทธิ์ และควบคุมฐานข้อมูล</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => setShowAddModal(true)}
            className="px-4 py-2.5 bg-gradient-to-r from-[#FF6B00] to-[#E65A00] hover:from-[#FF8A24] hover:to-[#FF6B00] text-black font-extrabold rounded-2xl text-xs transition cursor-pointer flex items-center gap-1.5 shadow-lg shadow-[#FF6B00]/25 border border-white/20"
          >
            <UserPlus className="w-4 h-4" />
            <span>เพิ่มผู้ใช้ / พนักงานใหม่</span>
          </button>
          <button
            onClick={() => {
              if (confirm('ต้องการรีเซ็ตข้อมูลทดสอบ Demo ใหม่ (โดยเก็บ Catalog สินค้าไว้) หรือไม่?')) {
                resetAllDemoData({ preserveCatalog: true });
                showNotice('รีเซ็ตข้อมูลตัวอย่างเรียบร้อยแล้ว (เก็บ Catalog ไว้เหมือนเดิม)');
              }
            }}
            className="px-3.5 py-2.5 rounded-2xl liquid-glass-card hover:border-rose-500/50 hover:text-rose-500 dark:hover:text-rose-400 text-slate-600 dark:text-slate-400 text-xs transition-all duration-150 active:scale-[0.97] cursor-pointer flex items-center gap-1.5"
          >
            <Database className="w-4 h-4" />
            <span>รีเซ็ตเดโม่ (เก็บ Catalog)</span>
          </button>
        </div>
      </div>

      {/* Users Table in Liquid Glass */}
      <div className="liquid-glass rounded-3xl p-4 sm:p-6 shadow-2xl border border-slate-200 dark:border-white/[0.08]">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Users className="w-4 h-4 text-[#FF6B00]" />
            รายชื่อผู้ใช้และสิทธิ์การเข้าถึง ({users.length} บัญชี)
          </h3>
        </div>

        {/* Mobile Cards (< md) */}
        <div className="md:hidden space-y-2.5">
          {users.map((u) => (
            <div key={u.id} className="p-3.5 rounded-2xl border border-slate-200 dark:border-white/[0.08] bg-white/80 dark:bg-white/[0.03] space-y-2.5">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-white/[0.05] border border-slate-200 dark:border-white/[0.08] flex items-center justify-center font-bold text-xs text-[#FF6B00] flex-shrink-0">
                    {u.name.slice(0, 1)}
                  </div>
                  <div className="min-w-0">
                    <div className="font-bold text-slate-900 dark:text-white text-sm truncate">{u.name}</div>
                    <div className="font-mono font-bold text-xs text-[#FF6B00] truncate">@{u.username}</div>
                  </div>
                </div>
                {u.id === 'u-admin' ? (
                  <span className="text-[10px] text-slate-500 italic flex-shrink-0">บัญชีหลัก</span>
                ) : (
                  <button
                    onClick={() => {
                      if (confirm(`คุณต้องการลบผู้ใช้ "${u.name}" ใช่หรือไม่?`)) {
                        deleteUser(u.id);
                        showNotice('ลบผู้ใช้เรียบร้อยแล้ว');
                      }
                    }}
                    className="p-2 rounded-xl border border-slate-200 dark:border-white/[0.08] text-slate-400 hover:text-rose-400 hover:border-rose-500/40 transition cursor-pointer flex-shrink-0"
                    title="ลบผู้ใช้"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 dark:border-white/[0.06] text-xs">
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold border border-[#FF6B00]/30 bg-[#FF6B00]/10 text-slate-800 dark:text-slate-200">
                  {roleLabel[u.role]}
                </span>
                <span className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                  {u.phone || '-'} {u.badge ? `• ${u.badge}` : ''}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Desktop Table (>= md) */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-100 dark:bg-white/[0.03] text-slate-600 dark:text-slate-400 border-b border-slate-200 dark:border-white/[0.06]">
              <tr>
                <th className="py-3 px-4">ชื่อ - นามสกุล</th>
                <th className="py-3 px-4">Username</th>
                <th className="py-3 px-4">บทบาท (Role)</th>
                <th className="py-3 px-4">เบอร์ติดต่อ</th>
                <th className="py-3 px-4">ตราตำแหน่ง</th>
                <th className="py-3 px-4 text-right">การกระทำ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-white/[0.05]">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-slate-50 dark:hover:bg-white/[0.03] transition">
                  <td className="py-3.5 px-4 font-bold text-slate-900 dark:text-white text-base flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-white/[0.05] border border-slate-200 dark:border-white/[0.08] flex items-center justify-center font-bold text-xs text-[#FF6B00]">
                      {u.name.slice(0, 1)}
                    </div>
                    <span>{u.name}</span>
                  </td>
                  <td className="py-3.5 px-4 font-mono font-bold text-[#FF6B00] data-key">{u.username}</td>
                  <td className="py-3.5 px-4">
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold border border-[#FF6B00]/30 bg-[#FF6B00]/10 text-slate-800 dark:text-slate-200">
                      {roleLabel[u.role]}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 text-slate-600 dark:text-slate-300 data-meta">{u.phone || '-'}</td>
                  <td className="py-3.5 px-4 text-slate-400 font-mono text-[11px] data-meta">{u.badge || '-'}</td>
                  <td className="py-3.5 px-4 text-right">
                    {u.id === 'u-admin' ? (
                      <span className="text-[10px] text-slate-500 italic">บัญชีหลัก</span>
                    ) : (
                      <button
                        onClick={() => {
                          if (confirm(`คุณต้องการลบผู้ใช้ "${u.name}" ใช่หรือไม่?`)) {
                            deleteUser(u.id);
                            showNotice('ลบผู้ใช้เรียบร้อยแล้ว');
                          }
                        }}
                        className="p-1.5 rounded-xl border border-white/[0.08] text-slate-400 hover:text-rose-400 hover:border-rose-500/40 transition cursor-pointer"
                        title="ลบผู้ใช้"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add User Modal */}
      {showAddModal && createPortal(
        <div className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6 animate-fade-in">
          <div className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-800 shadow-2xl rounded-3xl w-full max-w-md max-h-[82dvh] sm:max-h-[86dvh] overflow-y-auto overscroll-contain p-4 sm:p-7 relative animate-modal-pop">
            <h3 className="text-base font-bold text-slate-900 dark:text-white mb-1 flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-[#FF6B00]" />
              เพิ่มผู้ใช้งานใหม่
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">กำหนดสิทธิ์และแผนกที่ผู้ใช้รายนี้สามารถเข้าถึงได้</p>

            <form onSubmit={handleAddUser} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">ชื่อ - นามสกุล *</label>
                <input
                  type="text"
                  required
                  placeholder="เช่น ช่างมินทร์ (สาย Onsite ลาดพร้าว)"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-2xl px-3.5 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-300 dark:border-slate-700 placeholder-slate-400 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">Username (สำหรับล็อกอิน) *</label>
                <input
                  type="text"
                  required
                  placeholder="เช่น min_onsite"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full rounded-2xl px-3.5 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-300 dark:border-slate-700 placeholder-slate-400 font-mono focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">บทบาท / แผนก (Role) *</label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as UserRole)}
                  className="w-full rounded-2xl px-3.5 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-300 dark:border-slate-700 focus:outline-none focus:border-blue-500"
                >
                  <option value="sales" className="bg-white dark:bg-[#12141A]">1. ฝ่ายขาย (Sales)</option>
                  <option value="accounting" className="bg-white dark:bg-[#12141A]">2. จัดซื้อ &amp; สต๊อก (Purchasing &amp; Stock)</option>
                  <option value="finance" className="bg-white dark:bg-[#12141A]">3. บัญชี (Accounting)</option>
                  <option value="prep" className="bg-white dark:bg-[#12141A]">4. ช่างเตรียมสินค้า (Prep Tech)</option>
                  <option value="frontdesk" className="bg-white dark:bg-[#12141A]">5. แอดมินหน้าร้าน (Front-Desk Dispatcher)</option>
                  <option value="onsite" className="bg-white dark:bg-[#12141A]">6. ช่าง Onsite (Field Tech)</option>
                  <option value="repair" className="bg-white dark:bg-[#12141A]">7. ช่างซ่อมในร้าน (In-House Repair)</option>
                  <option value="hr" className="bg-white dark:bg-[#12141A]">8. บุคคล (HR)</option>
                  <option value="admin" className="bg-white dark:bg-[#12141A]">ผู้ดูแลระบบ (Admin)</option>
                </select>
              </div>

              <div>
                <label htmlFor="admin-user-phone" className="block text-slate-700 dark:text-slate-300 font-medium mb-1">เบอร์โทรศัพท์</label>
                <PhoneInput
                  id="admin-user-phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full rounded-2xl px-3.5 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-300 dark:border-slate-700 placeholder-slate-400 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="submit"
                  className="flex-1 py-3 bg-gradient-to-r from-[#FF6B00] to-[#E65A00] hover:from-[#FF8A24] hover:to-[#FF6B00] text-black font-extrabold rounded-2xl text-xs transition cursor-pointer shadow-lg shadow-[#FF6B00]/25 border border-white/20"
                >
                  บันทึกผู้ใช้ใหม่
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-6 py-3 rounded-2xl border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-transparent text-slate-700 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-white/[0.06] transition cursor-pointer"
                >
                  ยกเลิก
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};
