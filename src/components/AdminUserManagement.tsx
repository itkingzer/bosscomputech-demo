import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { Users, UserPlus, Trash2, Shield, Database, CheckCircle } from 'lucide-react';
import { UserRole } from '../types';

export const AdminUserManagement: React.FC = () => {
  const { users, addUser, deleteUser, resetAllDemoData } = useApp();
  const [showAddModal, setShowAddModal] = useState(false);
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [role, setRole] = useState<UserRole>('sales');
  const [phone, setPhone] = useState('');
  const [badge, setBadge] = useState('');
  const [toast, setToast] = useState('');

  const handleAddUser = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !username) return;

    if (users.some(u => u.username.toLowerCase() === username.toLowerCase())) {
      alert('Username นี้มีอยู่ในระบบแล้ว');
      return;
    }

    addUser({
      name,
      username: username.toLowerCase().trim(),
      role,
      phone: phone || '-',
      badge: badge || role.toUpperCase()
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
    accounting: '2. บัญชี & สต๊อก',
    prep: '3. ช่างเตรียมสินค้า',
    frontdesk: '4. แอดมินหน้าร้าน',
    onsite: '5. ช่าง Onsite',
    repair: '6. ช่างซ่อมในร้าน'
  };

  return (
    <div className="space-y-6">
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 p-4 rounded-2xl liquid-glass border border-[#FF6B00] text-white text-xs flex items-center gap-2 shadow-2xl">
          <CheckCircle className="w-4 h-4 text-[#FF6B00]" />
          <span>{toast}</span>
        </div>
      )}

      {/* Admin Header in Liquid Glass */}
      <div className="liquid-glass rounded-3xl p-6 sm:p-7 shadow-2xl border border-white/[0.08] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-[#FF6B00]/15 text-[#FF6B00] border border-[#FF6B00]/30">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">แผงควบคุมผู้ดูแลระบบ (Admin Control Center)</h2>
              <p className="text-xs text-slate-400 mt-0.5">จัดการรายชื่อผู้ใช้ บัญชีแยกแผนก กำหนดสิทธิ์ และควบคุมฐานข้อมูล</p>
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
              if (confirm('คุณต้องการรีเซ็ตข้อมูลตัวอย่างทั้งหมดหรือไม่?')) {
                resetAllDemoData();
                showNotice('รีเซ็ตข้อมูลตัวอย่างทั้งหมดเรียบร้อยแล้ว');
              }
            }}
            className="px-3.5 py-2.5 rounded-2xl liquid-glass-card hover:border-rose-500/50 hover:text-rose-400 text-slate-400 text-xs transition cursor-pointer flex items-center gap-1.5"
          >
            <Database className="w-4 h-4" />
            <span>รีเซ็ตเดโม่</span>
          </button>
        </div>
      </div>

      {/* Users Table in Liquid Glass */}
      <div className="liquid-glass rounded-3xl p-6 shadow-2xl border border-white/[0.08]">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Users className="w-4 h-4 text-[#FF6B00]" />
            รายชื่อผู้ใช้และสิทธิ์การเข้าถึง ({users.length} บัญชี)
          </h3>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-white/[0.03] text-slate-400 border-b border-white/[0.06]">
              <tr>
                <th className="py-3 px-4">ชื่อ - นามสกุล</th>
                <th className="py-3 px-4">Username</th>
                <th className="py-3 px-4">บทบาท (Role)</th>
                <th className="py-3 px-4">เบอร์ติดต่อ</th>
                <th className="py-3 px-4">ตราตำแหน่ง</th>
                <th className="py-3 px-4 text-right">การกระทำ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.05]">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-white/[0.03] transition">
                  <td className="py-3.5 px-4 font-bold text-white text-base flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-white/[0.05] border border-white/[0.08] flex items-center justify-center font-bold text-xs text-[#FF6B00]">
                      {u.name.slice(0, 1)}
                    </div>
                    <span>{u.name}</span>
                  </td>
                  <td className="py-3.5 px-4 font-mono font-bold text-[#FF6B00] data-key">{u.username}</td>
                  <td className="py-3.5 px-4">
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold border border-[#FF6B00]/30 bg-[#FF6B00]/10 text-slate-200">
                      {roleLabel[u.role]}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 text-slate-300 data-meta">{u.phone || '-'}</td>
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
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-center justify-center p-2 sm:p-4">
          <div className="liquid-glass rounded-2xl sm:rounded-3xl w-[95vw] max-w-md max-h-[90vh] overflow-y-auto p-4 sm:p-7 shadow-2xl border border-white/[0.12] relative">
            <h3 className="text-base font-bold text-white mb-1 flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-[#FF6B00]" />
              เพิ่มผู้ใช้งานใหม่
            </h3>
            <p className="text-xs text-slate-400 mb-4">กำหนดสิทธิ์และแผนกที่ผู้ใช้รายนี้สามารถเข้าถึงได้</p>

            <form onSubmit={handleAddUser} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-300 font-medium mb-1">ชื่อ - นามสกุล *</label>
                <input
                  type="text"
                  required
                  placeholder="เช่น ช่างมินทร์ (สาย Onsite ลาดพร้าว)"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full liquid-glass-input rounded-2xl px-3.5 py-2 text-white focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Username (สำหรับล็อกอิน) *</label>
                <input
                  type="text"
                  required
                  placeholder="เช่น min_onsite"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full liquid-glass-input rounded-2xl px-3.5 py-2 text-white font-mono focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">บทบาท / แผนก (Role) *</label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as UserRole)}
                  className="w-full liquid-glass-input rounded-2xl px-3.5 py-2 text-white focus:outline-none"
                >
                  <option value="sales" className="bg-[#12141A]">1. ฝ่ายขาย (Sales)</option>
                  <option value="accounting" className="bg-[#12141A]">2. บัญชี & สต๊อก (Accounting)</option>
                  <option value="prep" className="bg-[#12141A]">3. ช่างเตรียมสินค้า (Prep Tech)</option>
                  <option value="frontdesk" className="bg-[#12141A]">4. แอดมินหน้าร้าน (Front-Desk Dispatcher)</option>
                  <option value="onsite" className="bg-[#12141A]">5. ช่าง Onsite (Field Tech)</option>
                  <option value="repair" className="bg-[#12141A]">6. ช่างซ่อมในร้าน (In-House Repair)</option>
                  <option value="admin" className="bg-[#12141A]">ผู้ดูแลระบบ (Admin)</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">เบอร์โทรศัพท์</label>
                <input
                  type="text"
                  placeholder="08x-xxx-xxxx"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full liquid-glass-input rounded-2xl px-3.5 py-2 text-white focus:outline-none"
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
                  className="px-4 py-3 rounded-2xl border border-white/[0.08] text-slate-400 hover:text-white transition cursor-pointer"
                >
                  ยกเลิก
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
