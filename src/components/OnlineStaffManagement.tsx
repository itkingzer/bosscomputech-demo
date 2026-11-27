import { useState, type FormEvent } from 'react';
import { Plus, Search, ShieldCheck, Trash2, Users } from 'lucide-react';
import { useApp } from '../context/AppContext';
import type { UserAccount, UserRole } from '../types';
import { getRoleDisplayName } from '../utils/domainHelpers';
import { Modal } from './ui/Modal';

const roles: UserRole[] = ['sales', 'accounting', 'finance', 'prep', 'frontdesk', 'onsite', 'repair', 'hr'];
const inputClass = 'w-full min-h-11 rounded-xl liquid-glass-input px-3 py-2';
const buttonClass = 'min-h-11 rounded-xl border border-slate-300 dark:border-slate-600 px-3 py-2 text-sm font-semibold disabled:opacity-50';
const primaryClass = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#FF6B00] to-[#E65A00] px-4 py-2 text-sm font-bold text-black shadow-md shadow-orange-500/20 hover:from-[#FF8A24] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FF6B00] disabled:opacity-50';

export function OnlineStaffManagement({ onClose }: { onClose?: () => void }) {
  const { users, currentUser, manageStaff } = useApp();
  const isAdmin = currentUser?.role === 'admin';
  const isSuperadmin = isAdmin && currentUser?.is_superadmin === true;
  const allowedRoles = roles.filter(value => isAdmin || value !== 'hr');
  const [formOpen, setFormOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [deleting, setDeleting] = useState<UserAccount | null>(null);
  const [editing, setEditing] = useState<UserAccount | null>(null);
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>('sales');
  const [inviteByEmail, setInviteByEmail] = useState(false);
  const [positions, setPositions] = useState<UserRole[]>([]);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ text: string; error: boolean } | null>(null);

  function selectProfile(user: UserAccount | null) {
    setEditing(user);
    setName(user?.name ?? '');
    setUsername(user?.role === 'admin' && user.username.includes('@') ? user.email ?? user.username
      : user?.username.includes('@') ? '' : user?.username ?? '');
    setPassword('');
    setRole(user?.role ?? 'sales');
    setInviteByEmail(Boolean(user?.role === 'admin' && !user.auth_user_id && user.username.includes('@')));
    setPositions(user?.work_positions?.filter(position => position !== 'admin') ?? []);
    setFeedback(null);
    setFormOpen(true);
  }

  async function perform(operation: () => Promise<string | null>, success: string) {
    setBusy(true);
    setFeedback(null);
    try {
      const failure = await operation();
      setFeedback({ text: failure ?? success, error: Boolean(failure) });
      return !failure;
    } catch {
      setFeedback({ text: 'ดำเนินการไม่สำเร็จ กรุณาลองอีกครั้ง', error: true });
      return false;
    } finally {
      setBusy(false);
    }
  }

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const profile = { name: name.trim(), role, work_positions: positions.filter(position => position !== role) };
    if (!profile.name) return;
    if (await perform(
      () => manageStaff({ ...profile, action: sendingInvite ? 'invite-admin' : 'save', id: editing?.id, username, password }),
      sendingInvite ? 'ส่งคำเชิญแล้ว ให้ผู้รับเปิดอีเมลเพื่อตั้งรหัสผ่าน' : editing ? 'บันทึกบัญชีแล้ว' : 'สร้างบัญชีแล้ว เข้า Staff Login ได้ทันที',
    )) {
      setPassword('');
      setFormOpen(false);
    }
  };

  const selected = users.find(user => user.id === editing?.id);
  const adminAccount = role === 'admin';
  const existingEmailLogin = Boolean(adminAccount && selected?.auth_user_id && selected.email && !selected.email.endsWith('@staff.bosscomputech.invalid'));
  const canInvite = isSuperadmin && adminAccount && !selected?.auth_user_id;
  const sendingInvite = canInvite && inviteByEmail;
  const emailLogin = sendingInvite || existingEmailLogin;
  const existingLogin = Boolean(selected?.auth_user_id && selected.email && (
    existingEmailLogin || selected.email.endsWith('@staff.bosscomputech.invalid')
  ));
  const normalizedQuery = query.trim().toLowerCase();
  const visibleUsers = users.filter(user => (!roleFilter || user.role === roleFilter) &&
    [user.name, user.username, user.email].some(value => value?.toLowerCase().includes(normalizedQuery)));
  const feedbackMessage = feedback && <p role={feedback.error ? 'alert' : 'status'}
    className={feedback.error ? 'text-rose-700 dark:text-rose-300' : 'text-emerald-700 dark:text-emerald-300'}>{feedback.text}</p>;

  const closeForm = () => {
    if (busy) return;
    setFormOpen(false);
    setPassword('');
    setFeedback(null);
  };
  const closeDelete = () => {
    if (busy) return;
    setDeleting(null);
    setFeedback(null);
  };
  const formTitle = editing ? 'แก้ไขบัญชี' : 'เพิ่มบัญชี';
  const form = (
      <form onSubmit={save} className="space-y-5 p-2 sm:p-4">
        <fieldset disabled={busy} className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">ชื่อพนักงาน
            <input autoFocus type="text" className={inputClass} value={name} onChange={event => setName(event.target.value)} required maxLength={150} />
          </label>
          <label className="block text-sm">บทบาทหลัก
            <select className={inputClass} value={role} onChange={event => {
              setRole(event.target.value as UserRole);
              if (event.target.value !== 'admin') {
                setInviteByEmail(false);
                if (username.includes('@')) setUsername('');
              }
            }}>
              {allowedRoles.map(value => <option value={value} key={value}>{getRoleDisplayName(value)}</option>)}
              {isSuperadmin && <option value="admin">แอดมิน</option>}
            </select>
          </label>
          {canInvite && <label className="block text-sm sm:col-span-2">วิธีสร้างบัญชีแอดมิน
            <select className={inputClass} value={inviteByEmail ? 'email' : 'username'} onChange={event => {
              setInviteByEmail(event.target.value === 'email');
              setUsername('');
              setPassword('');
            }}>
              <option value="username">ชื่อผู้ใช้และรหัสผ่าน</option>
              <option value="email">ส่งคำเชิญทางอีเมล</option>
            </select>
          </label>}
          <label className="block text-sm">{emailLogin ? 'อีเมลสำหรับเข้าสู่ระบบ' : 'ชื่อผู้ใช้'}
            <input type={emailLogin ? 'email' : 'text'} className={inputClass} value={username} onChange={event => setUsername(event.target.value)}
              required readOnly={existingEmailLogin} autoCapitalize="none" spellCheck={false} autoComplete="off"
              pattern={emailLogin ? undefined : '[A-Za-z0-9][A-Za-z0-9._\\-]{2,39}'} maxLength={emailLogin ? 254 : 40} />
          </label>
          {sendingInvite ? <p className="self-center text-sm text-slate-600 dark:text-slate-300">ผู้รับเปิดคำเชิญเพื่อตั้งรหัสผ่านเอง</p>
            : <label className="block text-sm">{existingLogin ? 'รหัสผ่านใหม่ (เว้นว่างเพื่อใช้รหัสเดิม)' : 'รหัสผ่าน'}
              <input type="password" className={inputClass} value={password} onChange={event => setPassword(event.target.value)}
                required={!existingLogin || username.trim().toLowerCase() !== (existingEmailLogin ? selected?.email : selected?.username)?.toLowerCase()}
                minLength={8} maxLength={72} autoComplete="new-password" />
            </label>}
          <fieldset className="space-y-2 sm:col-span-2">
            <legend className="text-sm">ตำแหน่งเพิ่มเติม</legend>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {allowedRoles.filter(value => value !== role).map(value => (
                <label key={value} className="inline-flex min-h-8 items-center gap-2 text-sm">
                  <input type="checkbox" checked={positions.includes(value)} onChange={event => {
                    setPositions(previous => event.target.checked ? [...previous, value] : previous.filter(position => position !== value));
                  }} />
                  {getRoleDisplayName(value)}
                </label>
              ))}
            </div>
          </fieldset>
        </fieldset>
        <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 pt-4 dark:border-slate-700">
          <button type="button" className={buttonClass} disabled={busy} onClick={closeForm}>{onClose ? 'กลับไปที่รายชื่อ' : 'ยกเลิก'}</button>
          <button type="submit" className={primaryClass} disabled={busy}>
            {busy ? 'กำลังบันทึก…' : sendingInvite ? 'ส่งคำเชิญ' : editing ? 'บันทึกบัญชี' : 'สร้างบัญชี'}
          </button>
        </div>
        {feedbackMessage}
      </form>
  );

  const directory = (
      <div className="liquid-glass overflow-hidden rounded-2xl">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-3 dark:border-slate-700 sm:p-5">
          <div className="flex items-center gap-3">
            <div>
              <h2 className="text-base font-bold">{onClose ? 'รายชื่อบัญชี' : 'จัดการบัญชีผู้ใช้'}</h2>
              {isSuperadmin && <span className="inline-flex items-center gap-1 text-xs font-semibold text-orange-800 dark:text-orange-300"><ShieldCheck aria-hidden="true" size={14} /> Superadmin</span>}
            </div>
          </div>
          <button type="button" className={primaryClass} disabled={busy} onClick={() => selectProfile(null)}><Plus aria-hidden="true" size={18} /> เพิ่มบัญชี</button>
        </header>
        <div className="grid gap-3 p-3 sm:grid-cols-[1fr_14rem] sm:p-5">
          <label className="relative">
            <Search aria-hidden="true" size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input autoFocus={Boolean(onClose)} type="search" className={inputClass + ' pl-10'} aria-label="ค้นหาบัญชี" placeholder="ค้นหาชื่อ ชื่อผู้ใช้ หรืออีเมล" value={query} onChange={event => setQuery(event.target.value)} />
          </label>
          <select className={inputClass} aria-label="กรองบทบาท" value={roleFilter} onChange={event => setRoleFilter(event.target.value)}>
            <option value="">ทุกบทบาท</option>
            {(['admin', ...roles] as UserRole[]).map(value => <option key={value} value={value}>{getRoleDisplayName(value)}</option>)}
          </select>
          <p className="text-sm text-slate-600 dark:text-slate-300">{visibleUsers.length} จาก {users.length} บัญชี</p>
          {!formOpen && !deleting && feedbackMessage}
        </div>
        {visibleUsers.length === 0 && <p className="border-t border-slate-200 p-8 text-center text-sm dark:border-slate-700">{users.length ? 'ไม่พบบัญชีที่ตรงกับตัวกรอง' : 'ยังไม่มีบัญชีในรายชื่อ'}</p>}
        <ul className="divide-y divide-slate-200 border-slate-200 dark:divide-slate-700 dark:border-slate-700">
          {visibleUsers.map(user => {
            const self = user.id === currentUser?.id || Boolean(user.auth_user_id && user.auth_user_id === currentUser?.auth_user_id);
            const protectedAccount = self || (!isSuperadmin && user.role === 'admin')
              || (!isAdmin && (user.role === 'hr' || user.work_positions?.includes('hr')));
            const status = user.is_active === false ? 'พักการใช้งาน'
              : user.auth_user_id ? 'ผูกบัญชีแล้ว' : 'ยังไม่ได้ตั้งรหัสผ่าน';
            return (
              <li key={user.id} className="flex flex-wrap items-center justify-between gap-3 px-3 py-4 sm:px-5">
                <div className="min-w-0">
                  <strong className="block break-words">{user.name}</strong>
                  <div className="break-all text-sm text-slate-600 dark:text-slate-300">{user.username}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                    <span className="rounded-full bg-slate-200 px-2 py-0.5 dark:bg-slate-700">{getRoleDisplayName(user.role)}</span>
                    <span>{self ? 'บัญชีของคุณ' : status}</span>
                  </div>
                </div>
                {!protectedAccount && <div className="flex flex-wrap gap-2">
                  <button type="button" className={buttonClass} disabled={busy} onClick={() => selectProfile(user)}>แก้ไข</button>
                  <button type="button" className={buttonClass} disabled={busy} onClick={() => void perform(
                    () => manageStaff({ action: 'set-active', id: user.id, active: user.is_active === false }),
                    'เปลี่ยนสถานะการเข้าใช้งานแล้ว',
                  )}>{user.is_active === false ? 'เปิดใช้งาน' : 'พักบัญชี'}</button>
                  {isSuperadmin && <button type="button" className={buttonClass + ' inline-flex items-center gap-1 text-rose-700 dark:text-rose-300'}
                    disabled={busy} onClick={() => { setFeedback(null); setDeleting(user); }}><Trash2 aria-hidden="true" size={16} /> ลบ</button>}
                </div>}
              </li>
            );
          })}
        </ul>
      </div>
  );
  const deleteTitle = 'ยืนยันการลบบัญชี';
  const confirmation = deleting && (
        <div className="space-y-4 p-5">
          <p>ลบบัญชี <strong>{deleting.name}</strong> ({deleting.username}) และสิทธิ์เข้าสู่ระบบอย่างถาวร</p>
          {feedbackMessage}
          <div className="flex flex-wrap justify-end gap-2">
            <button autoFocus type="button" className={buttonClass} disabled={busy} onClick={closeDelete}>ยกเลิก</button>
            <button type="button" className="min-h-11 rounded-xl bg-rose-700 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-600 disabled:opacity-50"
              disabled={busy} onClick={async () => {
                if (await perform(() => manageStaff({ action: 'delete', id: deleting.id }), 'ลบบัญชีแล้ว')) setDeleting(null);
              }}>{busy ? 'กำลังลบ…' : 'ลบบัญชีถาวร'}</button>
          </div>
        </div>
  );

  if (onClose) {
    return (
      <Modal open onClose={formOpen ? closeForm : deleting ? closeDelete : () => { if (!busy) onClose(); }}
        title={formOpen ? formTitle : deleting ? deleteTitle : 'จัดการบัญชีพนักงาน'}
        icon={deleting ? <Trash2 size={20} aria-hidden="true" /> : <Users size={20} aria-hidden="true" />}
        maxWidthClass={deleting ? 'max-w-lg' : formOpen ? 'max-w-2xl' : 'max-w-3xl'}
        closeOnBackdrop={!formOpen && !deleting && !busy}>
        {formOpen ? form : deleting ? confirmation : directory}
      </Modal>
    );
  }

  return (
    <section className="space-y-5">
      {directory}
      <Modal open={formOpen} onClose={closeForm} title={formTitle} maxWidthClass="max-w-2xl">{form}</Modal>
      <Modal open={Boolean(deleting)} onClose={closeDelete} title={deleteTitle}>{confirmation}</Modal>
    </section>
  );
}
