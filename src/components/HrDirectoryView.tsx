import { ModalBackdrop } from './ui/ModalBackdrop';
import { PhoneInput, normalizePhone } from './ui/FormInputs';
import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useApp } from '../context/AppContext';
import {
  Users, UserPlus, Edit3, CheckCircle2, XCircle, Search,
  Activity, Briefcase, X, Phone
} from 'lucide-react';
import { ActivityLog, UserAccount, UserRole, formatThaiDateTime } from '../types';
import { ListControls, useListControls } from './ListControls';
import { formatEmploymentDate, getWorkPositions, toTelHref, worksInPosition } from '../utils/domainHelpers';
import { StaffAvatar, StaffProfileFields } from './StaffProfile';
import { Modal, modalInputClass, modalLabelClass } from './ui/Modal';

const ROLE_OPTIONS: { value: UserRole; label: string; dept: string }[] = [
  { value: 'sales', label: 'ฝ่ายขาย (Sales)', dept: 'ฝ่ายขาย' },
  { value: 'accounting', label: 'จัดซื้อ & สต๊อก', dept: 'ฝ่ายจัดซื้อและคลัง' },
  { value: 'finance', label: 'ฝ่ายบัญชี (Accounting)', dept: 'ฝ่ายบัญชี' },
  { value: 'prep', label: 'ช่างเตรียมสินค้า', dept: 'ฝ่ายเตรียมสินค้า' },
  { value: 'frontdesk', label: 'แอดมินหน้าร้าน', dept: 'ฝ่ายหน้าร้าน' },
  { value: 'onsite', label: 'ช่าง Onsite', dept: 'ฝ่ายบริการนอกสถานที่' },
  { value: 'repair', label: 'ช่างซ่อมในร้าน', dept: 'ฝ่ายช่างซ่อม' },
  { value: 'hr', label: 'ฝ่ายบุคคล (HR)', dept: 'ฝ่ายบุคคล (HR)' },
  { value: 'admin', label: 'ผู้ดูแลระบบ (Admin)', dept: 'ผู้บริหาร / แอดมิน' }
];

export const HrDirectoryView: React.FC = () => {
  const { users, addUser, updateUser, orders, projects, stockPOs, repairTickets } = useApp();

  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserAccount | null>(null);
  const [selectedStaffForLog, setSelectedStaffForLog] = useState<UserAccount | null>(null);

  // Form states
  const [name, setName] = useState('');
  const [nickname, setNickname] = useState('');
  const [username, setUsername] = useState('');
  const [role, setRole] = useState<UserRole>('sales');
  const [department, setDepartment] = useState('ฝ่ายขาย');
  const [phone, setPhone] = useState('');
  const [badge, setBadge] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [avatar, setAvatar] = useState<string | null>(null);
  const [details, setDetails] = useState('');
  const [startDate, setStartDate] = useState('');
  const [positions, setPositions] = useState<UserRole[]>([]);
  const [imageBusy, setImageBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const busy = imageBusy || saving;

  const openAddModal = () => {
    setEditingUser(null);
    setName('');
    setNickname('');
    setUsername('');
    setRole('sales');
    setDepartment('ฝ่ายขาย');
    setPhone('');
    setBadge('');
    setIsActive(true);
    setAvatar(null);
    setDetails('');
    setStartDate('');
    setPositions(['sales']);
    setSaveError('');
    setIsModalOpen(true);
  };

  const openEditModal = (u: UserAccount) => {
    setEditingUser(u);
    setName(u.name);
    setNickname(u.nickname || '');
    setUsername(u.username);
    setRole(u.role);
    setDepartment(u.department || ROLE_OPTIONS.find(r => r.value === u.role)?.dept || '');
    setPhone(normalizePhone(u.phone || ''));
    setBadge(u.badge || '');
    setIsActive(u.is_active !== false);
    setAvatar(u.avatar ?? null);
    setDetails(u.profile_details ?? '');
    setStartDate(u.employment_start_date ?? '');
    setPositions(getWorkPositions(u));
    setSaveError('');
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const normalizedUsername = username.trim().toLowerCase();
    if (!name.trim() || !normalizedUsername) {
      setSaveError('กรุณากรอกชื่อและ Username');
      return;
    }
    if (!editingUser && users.some(u => u.username.toLowerCase() === normalizedUsername)) {
      setSaveError('Username นี้มีอยู่ในระบบแล้ว');
      return;
    }
    if (!positions.length) {
      setSaveError('กรุณาเลือกอย่างน้อยหนึ่งตำแหน่งงาน');
      return;
    }
    const profile = {
      name: name.trim(),
      nickname: nickname.trim(),
      department: department.trim(),
      role,
      phone: phone.trim() || '-',
      badge: badge.trim() || (editingUser ? '' : role.toUpperCase()),
      is_active: isActive,
      avatar,
      profile_details: details.trim() || null,
      employment_start_date: startDate || null,
      work_positions: positions
    };
    setSaving(true);
    setSaveError('');
    try {
      const saved = editingUser
        ? await updateUser(editingUser.id, profile)
        : await addUser({ ...profile, username: normalizedUsername, password: 'password123' });
      if (saved) setIsModalOpen(false);
      else setSaveError('บันทึกข้อมูลพนักงานไม่สำเร็จ กรุณาลองอีกครั้ง');
    } catch {
      setSaveError('บันทึกข้อมูลพนักงานไม่สำเร็จ กรุณาลองอีกครั้ง');
    } finally {
      setSaving(false);
    }
  };

  // Aggregate workload & activity logs per staff
  const staffStats = useMemo(() => {
    const allLogs: (ActivityLog & { source: string })[] = [
      ...orders.flatMap(o => (o.activity_logs || []).map(l => ({ ...l, source: o.bill_no || o.sales_ref || o.id }))),
      ...projects.flatMap(p => (p.activity_logs || []).map(l => ({ ...l, source: p.id }))),
      ...stockPOs.flatMap(po => (po.activity_logs || []).map(l => ({ ...l, source: po.po_number }))),
      ...repairTickets.flatMap(r => (r.activity_logs || []).map(l => ({ ...l, source: r.ticket_no })))
    ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    const map = new Map<string, { logs: (ActivityLog & { source: string })[]; activeJobs: number }>();
    users.forEach(u => {
      const matchedLogs = allLogs.filter(
        l => l.actor === u.name || (u.nickname && l.actor.includes(u.nickname))
      );
      const activeProjectCount = projects.filter(
        p => p.status !== 'completed' && (p.created_by === u.name || p.assigned_techs.includes(u.name))
      ).length;
      const activeOrderCount = orders.filter(
        o => o.order_status !== 'fulfilled' && (o.salesperson === u.name || o.created_by === u.name)
      ).length;
      const activeRepairCount = repairTickets.filter(
        r => (r.status === 'open' || r.status === 'in_progress' || r.status === 'awaiting_dispatch' || r.status === 'dispatched_onsite' || r.status === 'on_delivery') &&
          r.repair_status !== 'completed' &&
          (r.repaired_by === u.name || r.assigned_techs.includes(u.name))
      ).length;

      map.set(u.id, {
        logs: matchedLogs,
        activeJobs: activeProjectCount + activeOrderCount + activeRepairCount
      });
    });
    return map;
  }, [users, orders, projects, stockPOs, repairTickets]);

  const filteredUsers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return users.filter(u => {
      if (roleFilter !== 'all' && !worksInPosition(u, roleFilter as UserRole)) return false;
      if (!q) return true;
      return (
        u.name.toLowerCase().includes(q) ||
        (u.nickname || '').toLowerCase().includes(q) ||
        u.username.toLowerCase().includes(q) ||
        (u.department || '').toLowerCase().includes(q) ||
        ROLE_OPTIONS.some(position => worksInPosition(u, position.value) && position.label.toLowerCase().includes(q))
      );
    });
  }, [users, searchQuery, roleFilter]);

  const hrList = useListControls(filteredUsers, {
    getDate: (u) => (u as UserAccount & { created_at?: string }).created_at,
    initialSort: 'newest',
    initialPageSize: 12
  });

  const activeCount = users.filter(u => u.is_active !== false).length;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="liquid-glass rounded-3xl p-5 sm:p-6 border border-white/[0.08] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-2xl bg-[#FF6B00]/15 text-[#FF6B00] border border-[#FF6B00]/30">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-extrabold text-slate-900 dark:text-white">
              ฝ่ายบุคคล (HR — Staff Directory &amp; Workload)
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              จัดการรายชื่อพนักงาน แผนก สถานะทำงาน (อัปเดต Dropdown ทุกหน้าทันที) และสรุปปริมาณงานรายบุคคล
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={openAddModal}
          className="px-4 py-2.5 rounded-2xl bg-gradient-to-r from-[#FF6B00] to-[#E65A00] hover:from-[#FF8A24] text-black font-extrabold text-xs shadow-lg shadow-[#FF6B00]/25 cursor-pointer flex items-center gap-2 self-start sm:self-auto"
        >
          <UserPlus className="w-4 h-4" />
          <span>เพิ่มพนักงานใหม่</span>
        </button>
      </div>

      {/* Summary & Filters */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <div className="liquid-glass-card rounded-2xl p-4">
          <div className="text-[11px] text-slate-500 dark:text-slate-400">พนักงานทั้งหมด</div>
          <div className="text-2xl font-extrabold font-mono mt-1">{users.length}</div>
        </div>
        <div className="liquid-glass-card rounded-2xl p-4">
          <div className="text-[11px] text-slate-500 dark:text-slate-400">ปฏิบัติงานอยู่ (Active)</div>
          <div className="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400 font-mono mt-1">{activeCount}</div>
        </div>
        <div className="md:col-span-2 liquid-glass-card rounded-2xl p-4 flex flex-col sm:flex-row gap-2 items-stretch sm:items-center">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              aria-label="ค้นหาพนักงาน"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="ค้นหาชื่อ แผนก หรือตำแหน่ง"
              className="w-full rounded-xl pl-9 pr-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
            />
          </div>
          <select
            aria-label="กรองตามตำแหน่งงาน"
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="rounded-xl px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
          >
            <option value="all">ทุกตำแหน่งงาน</option>
            {ROLE_OPTIONS.map(r => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Staff Directory & Workload Cards */}
      <ListControls
        from={hrList.from}
        to={hrList.to}
        total={hrList.total}
        page={hrList.page}
        totalPages={hrList.totalPages}
        pageSize={hrList.pageSize}
        sort={hrList.sort}
        onSortChange={hrList.setSort}
        onPageSizeChange={hrList.setPageSize}
        onPageChange={hrList.setPage}
        pageSizeOptions={[12, 24, 48]}
        unit="คน"
      />
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {hrList.pageItems.map(u => {
          const stat = staffStats.get(u.id) || { logs: [], activeJobs: 0 };
          const roleMeta = ROLE_OPTIONS.find(r => r.value === u.role);
          const active = u.is_active !== false;

          return (
            <div
              key={u.id}
              className={`bg-white dark:bg-slate-900/90 border rounded-2xl p-4 shadow-sm space-y-3 transition ${
                active
                  ? 'border-slate-200 dark:border-slate-800'
                  : 'border-rose-300/60 dark:border-rose-500/30 opacity-75'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-3 min-w-0">
                  <StaffAvatar user={u} />
                  <div className="min-w-0">
                    <div className="font-bold text-sm text-slate-900 dark:text-white truncate">
                      {u.name} {u.nickname ? <span className="text-xs text-[#FF6B00]">({u.nickname})</span> : null}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                      {u.department || roleMeta?.dept || '-'}
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => updateUser(u.id, { is_active: !active })}
                  disabled={u.id === 'u-admin'}
                  title={active ? 'คลิกเพื่อพักงาน/ปิดใช้งานชั่วคราว' : 'คลิกเพื่อเปิดใช้งาน'}
                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1 shrink-0 cursor-pointer disabled:cursor-not-allowed ${
                    active
                      ? 'bg-emerald-700 hover:bg-emerald-800 text-white'
                      : 'bg-rose-100 text-rose-800 dark:bg-rose-500/15 dark:text-rose-300'
                  }`}
                >
                  {active ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                  <span>{active ? 'ทำงานอยู่' : 'พักงาน'}</span>
                </button>
              </div>

              <ul aria-label="ตำแหน่งงาน" className="flex flex-wrap gap-1.5">
                {getWorkPositions(u).map(position => (
                  <li key={position} className="rounded-lg bg-orange-50 px-2 py-1 text-xs font-semibold text-orange-900 dark:bg-[#FF6B00]/15 dark:text-orange-200">
                    {ROLE_OPTIONS.find(option => option.value === position)?.label || position}
                  </li>
                ))}
              </ul>
              <p className="text-xs text-slate-600 dark:text-slate-300">วันเริ่มงาน {formatEmploymentDate(u.employment_start_date)}</p>
              {u.profile_details && <p className="whitespace-pre-wrap break-words text-sm text-slate-700 dark:text-slate-300">{u.profile_details}</p>}

              <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/60 rounded-xl px-3 py-2">
                {toTelHref(u.phone) ? (
                  <a
                    href={toTelHref(u.phone)!}
                    title="กดเพื่อโทรออก"
                    className="flex items-center gap-1 text-emerald-700 dark:text-emerald-300 font-semibold hover:underline cursor-pointer"
                  >
                    <Phone className="w-3 h-3" />
                    <span>{u.phone}</span>
                  </a>
                ) : (
                  <span className="flex items-center gap-1">
                    <Phone className="w-3 h-3" />
                    <span>{u.phone || '-'}</span>
                  </span>
                )}
                <span className="font-mono text-[#FF6B00]">@{u.username}</span>
              </div>

              {/* Staff Workload & Activity Summary */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-2.5 rounded-xl bg-sky-50 dark:bg-sky-500/10 border border-sky-200 dark:border-sky-500/20">
                  <div className="text-[10px] text-sky-700 dark:text-sky-300 flex items-center gap-1">
                    <Briefcase className="w-3 h-3" />
                    <span>งานค้างรับผิดชอบ</span>
                  </div>
                  <div className="font-mono font-extrabold text-sm text-sky-800 dark:text-sky-200 mt-0.5">
                    {stat.activeJobs} งาน
                  </div>
                </div>
                <div className="p-2.5 rounded-xl bg-purple-50 dark:bg-purple-500/10 border border-purple-200 dark:border-purple-500/20">
                  <div className="text-[10px] text-purple-700 dark:text-purple-300 flex items-center gap-1">
                    <Activity className="w-3 h-3" />
                    <span>ประวัติ Log ทั้งหมด</span>
                  </div>
                  <div className="font-mono font-extrabold text-sm text-purple-800 dark:text-purple-200 mt-0.5">
                    {stat.logs.length} รายการ
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setSelectedStaffForLog(u)}
                  className="text-xs font-bold text-purple-600 dark:text-purple-400 hover:underline cursor-pointer flex items-center gap-1"
                >
                  <Activity className="w-3.5 h-3.5" />
                  <span>ดูประวัติการปฏิบัติงาน</span>
                </button>
                <button
                  type="button"
                  onClick={() => openEditModal(u)}
                  className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-bold cursor-pointer flex items-center gap-1"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>แก้ไข</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Add / Edit Staff Modal */}
      {isModalOpen && (
        <Modal
          open
          title={editingUser ? 'แก้ไขโปรไฟล์พนักงาน' : 'เพิ่มพนักงานใหม่'}
          subtitle={editingUser?.name}
          onClose={() => { if (!busy) setIsModalOpen(false); }}
        >
          <form
            onSubmit={handleSave}
            className="space-y-4"
          >
            <fieldset disabled={saving} className="min-w-0 space-y-4">
            <StaffProfileFields user={{ name, nickname, avatar }} details={details} onDetails={setDetails} onAvatar={setAvatar} onImageBusy={setImageBusy} />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <label htmlFor="hr-name" className="block font-bold mb-1">ชื่อ - นามสกุล *</label>
                <input
                  id="hr-name"
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-xl px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700"
                />
              </div>
              <div>
                <label htmlFor="hr-nickname" className="block font-bold mb-1">ชื่อเล่น</label>
                <input
                  id="hr-nickname"
                  type="text"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  className="w-full rounded-xl px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700"
                />
              </div>
              <div>
                <label htmlFor="hr-username" className="block font-bold mb-1">Username *</label>
                <input
                  id="hr-username"
                  type="text"
                  required
                  disabled={!!editingUser}
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full rounded-xl px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 disabled:opacity-50"
                />
              </div>
              <div>
                <label htmlFor="hr-contact-phone" className="block font-bold mb-1">เบอร์ติดต่อ</label>
                <PhoneInput
                  id="hr-contact-phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full rounded-xl px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700"
                />
              </div>
              <div>
                <label htmlFor="hr-role" className="block font-bold mb-1">สิทธิ์เข้าหน้าทำงาน</label>
                <select
                  id="hr-role"
                  value={role}
                  onChange={(e) => {
                    const nextRole = e.target.value as UserRole;
                    if (positions.length === 1 && positions[0] === role && !editingUser?.work_positions) {
                      setPositions([nextRole]);
                    }
                    setRole(nextRole);
                    const found = ROLE_OPTIONS.find(r => r.value === nextRole);
                    if (found) setDepartment(found.dept);
                  }}
                  className="w-full rounded-xl px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700"
                >
                  {ROLE_OPTIONS.map(r => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="hr-department" className="block font-bold mb-1">แผนก</label>
                <input
                  id="hr-department"
                  type="text"
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  className="w-full rounded-xl px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700"
                />
              </div>
              <div>
                <label htmlFor="hr-start-date" className={modalLabelClass}>วันเริ่มงาน</label>
                <input id="hr-start-date" type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className={modalInputClass} />
              </div>
              <fieldset className="sm:col-span-2">
                <legend className="font-bold">ตำแหน่งงาน (เลือกได้หลายตำแหน่ง)</legend>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {ROLE_OPTIONS.map(option => (
                    <label key={option.value} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 has-checked:border-[#FF6B00] has-checked:bg-[#FF6B00]/10 dark:border-slate-700">
                      <input type="checkbox" className="size-4 shrink-0 accent-[#FF6B00]" checked={positions.includes(option.value)}
                        onChange={e => {
                          const checked = e.target.checked;
                          setPositions(previous => checked ? [...previous, option.value] : previous.filter(position => position !== option.value));
                        }}
                      />
                      {option.label}
                    </label>
                  ))}
                </div>
              </fieldset>
              <label className="sm:col-span-2 flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70">
                <span className="font-bold">สถานะการทำงาน (แสดงใน Dropdown เลือกผู้รับผิดชอบ)</span>
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  className="w-4 h-4 accent-[#FF6B00] cursor-pointer"
                />
              </label>
            </div>
            </fieldset>

            {saveError && <p role="alert" className="text-rose-700 dark:text-rose-300">{saveError}</p>}
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold cursor-pointer"
              >
                ยกเลิก
              </button>
              <button
                type="submit"
                disabled={busy}
                className="min-h-11 px-5 py-2 rounded-xl bg-[#FF6B00] hover:bg-[#FF8A24] text-black text-xs font-extrabold cursor-pointer disabled:opacity-50"
              >
                {saving ? 'กำลังบันทึก…' : 'บันทึกข้อมูลพนักงาน'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Staff Activity Log Modal */}
      {selectedStaffForLog && createPortal(
        <ModalBackdrop
          className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6 animate-fade-in"
          onDismiss={() => setSelectedStaffForLog(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-700 rounded-3xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden shadow-2xl animate-modal-pop"
          >
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-extrabold">ประวัติการปฏิบัติงาน: {selectedStaffForLog.name}</h3>
                <p className="text-[11px] text-slate-500">ดึงข้อมูลจาก Activity Logs ทุกบิลและทุกโปรเจกต์</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedStaffForLog(null)}
                className="p-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2 text-xs">
              {(staffStats.get(selectedStaffForLog.id)?.logs || []).length === 0 ? (
                <div className="text-center py-8 text-slate-500">ยังไม่มีประวัติกิจกรรมในระบบ</div>
              ) : (
                (staffStats.get(selectedStaffForLog.id)?.logs || []).map((log, i) => (
                  <div key={i} className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 flex items-start justify-between gap-3">
                    <div>
                      <div className="font-bold text-slate-900 dark:text-white">
                        <span className="font-mono text-[#FF6B00] mr-1.5">[{log.source}]</span>
                        {log.action}
                      </div>
                      {log.note && <div className="text-slate-600 dark:text-slate-300 mt-0.5">{log.note}</div>}
                    </div>
                    <div className="text-[10px] text-slate-500 whitespace-nowrap font-mono">
                      {formatThaiDateTime(log.timestamp)}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </ModalBackdrop>,
        document.body
      )}
    </div>
  );
};
