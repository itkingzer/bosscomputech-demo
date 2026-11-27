import { useState, type FormEvent } from 'react';
import { useApp } from '../context/AppContext';
import type { UserAccount, UserRole } from '../types';
import { getRoleDisplayName } from '../utils/domainHelpers';

const roles: UserRole[] = ['admin', 'sales', 'accounting', 'finance', 'prep', 'frontdesk', 'onsite', 'repair', 'hr'];
const inputClass = 'w-full min-h-11 rounded-xl liquid-glass-input px-3 py-2';
const buttonClass = 'min-h-11 rounded-xl border border-slate-300 dark:border-slate-600 px-3 py-2 text-sm font-semibold disabled:opacity-50';

export function OnlineStaffManagement() {
  const { users, currentUser, inviteStaff, updateUser, requestPasswordReset } = useApp();
  const [editing, setEditing] = useState<UserAccount | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<UserRole>('sales');
  const [positions, setPositions] = useState<UserRole[]>([]);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ text: string; error: boolean } | null>(null);

  function selectProfile(user: UserAccount | null) {
    setEditing(user);
    setName(user?.name ?? '');
    setEmail(user?.email ?? '');
    setRole(user?.role ?? 'sales');
    setPositions(user?.work_positions?.filter(position => position !== 'admin') ?? []);
    setFeedback(null);
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
    if (editing) {
      await perform(async () => await updateUser(editing.id, profile) ? null : 'บันทึกสิทธิ์ไม่สำเร็จ', 'บันทึกสิทธิ์แล้ว');
    } else if (await perform(
      () => inviteStaff({ ...profile, email: email.trim() }),
      'ส่งคำเชิญแล้ว ให้พนักงานเปิดอีเมลเพื่อตั้งรหัสผ่าน',
    )) {
      setName('');
      setEmail('');
      setRole('sales');
      setPositions([]);
    }
  };

  const selected = users.find(user => user.id === editing?.id);

  return (
    <section className="space-y-5">
      <form onSubmit={save} className="liquid-glass rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold">{editing ? 'แก้ไขสิทธิ์พนักงาน' : 'เชิญพนักงาน'}</h2>
          {editing && <button type="button" className={buttonClass} disabled={busy} onClick={() => selectProfile(null)}>กลับไปหน้าเชิญ</button>}
        </div>
        <fieldset disabled={busy} className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">ชื่อพนักงาน
            <input type="text" className={inputClass} value={name} onChange={event => setName(event.target.value)} required maxLength={150} />
          </label>
          <label className="block text-sm">อีเมลบัญชี
            <input type="email" className={inputClass} value={email} onChange={event => setEmail(event.target.value)}
              required={!editing} readOnly={Boolean(selected?.auth_user_id || selected?.auth_invite_pending)} maxLength={254} />
          </label>
          <label className="block text-sm">บทบาทหลัก
            <select className={inputClass} value={role} onChange={event => setRole(event.target.value as UserRole)}>
              {roles.map(value => <option value={value} key={value}>{getRoleDisplayName(value)}</option>)}
            </select>
          </label>
          <fieldset className="space-y-2">
            <legend className="text-sm">ตำแหน่งเพิ่มเติม</legend>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {roles.filter(value => value !== 'admin' && value !== role).map(value => (
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
        <div className="flex flex-wrap gap-2">
          <button type="submit" className={buttonClass} disabled={busy}>
            {editing ? 'บันทึกสิทธิ์' : 'ส่งคำเชิญ'}
          </button>
          {selected?.is_active && !selected.auth_user_id && (
            <button type="button" className={buttonClass} disabled={busy || !email.trim()} onClick={() => void perform(
              () => inviteStaff({ id: selected.id, email: email.trim(), name, role, work_positions: positions }),
              'ส่งคำเชิญแล้ว ให้พนักงานเปิดอีเมลเพื่อตั้งรหัสผ่าน',
            )}>{selected.auth_invite_pending ? 'ลองส่งคำเชิญอีกครั้ง' : 'เชิญโปรไฟล์นี้'}</button>
          )}
          {selected?.is_active && selected.auth_user_id && selected.email && (
            <button type="button" className={buttonClass} disabled={busy} onClick={() => void perform(
              () => requestPasswordReset(selected.email!), 'ขอส่งอีเมลตั้งรหัสผ่านแล้ว',
            )}>ส่งลิงก์ตั้งรหัสผ่าน</button>
          )}
        </div>
        {feedback && <p role={feedback.error ? 'alert' : 'status'} className={feedback.error ? 'text-rose-700 dark:text-rose-300' : 'text-emerald-700 dark:text-emerald-300'}>{feedback.text}</p>}
      </form>

      <div className="liquid-glass rounded-2xl p-5">
        <h2 className="mb-3 text-lg font-bold">รายชื่อพนักงาน</h2>
        {users.length === 0 && <p className="text-sm">ยังไม่มีโปรไฟล์พนักงาน</p>}
        <ul className="divide-y divide-slate-300/50 dark:divide-slate-600/50">
          {users.map(user => {
            const self = user.id === currentUser?.id || Boolean(user.auth_user_id && user.auth_user_id === currentUser?.auth_user_id);
            const status = user.is_active === false ? 'พักการใช้งาน'
              : user.auth_user_id ? 'ผูกบัญชีแล้ว' : user.auth_invite_pending ? 'รอเชิญ' : 'โปรไฟล์เดิม';
            return (
              <li key={user.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <div className="min-w-0 text-sm">
                  <strong>{user.name}</strong>
                  <div className="break-all">{user.email || user.username} · {getRoleDisplayName(user.role)} · {status}</div>
                </div>
                {!self && <div className="flex flex-wrap gap-2">
                  <button type="button" className={buttonClass} disabled={busy} onClick={() => selectProfile(user)}>แก้ไข / เชิญ</button>
                  <button type="button" className={buttonClass} disabled={busy} onClick={() => void perform(
                    async () => await updateUser(user.id, { is_active: user.is_active === false }) ? null : 'เปลี่ยนสถานะไม่สำเร็จ',
                    'เปลี่ยนสถานะการเข้าใช้งานแล้ว',
                  )}>{user.is_active === false ? 'เปิดใช้งาน' : 'พักบัญชี'}</button>
                </div>}
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
