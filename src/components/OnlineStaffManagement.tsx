import { useState, type FormEvent } from 'react';
import { useApp } from '../context/AppContext';
import type { UserAccount, UserRole } from '../types';
import { getRoleDisplayName } from '../utils/domainHelpers';

const roles: UserRole[] = ['sales', 'accounting', 'finance', 'prep', 'frontdesk', 'onsite', 'repair', 'hr'];
const inputClass = 'w-full min-h-11 rounded-xl liquid-glass-input px-3 py-2';
const buttonClass = 'min-h-11 rounded-xl border border-slate-300 dark:border-slate-600 px-3 py-2 text-sm font-semibold disabled:opacity-50';

export function OnlineStaffManagement() {
  const { users, currentUser, manageStaff } = useApp();
  const isAdmin = currentUser?.role === 'admin';
  const allowedRoles = roles.filter(value => isAdmin || value !== 'hr');
  const [editing, setEditing] = useState<UserAccount | null>(null);
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>('sales');
  const [positions, setPositions] = useState<UserRole[]>([]);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ text: string; error: boolean } | null>(null);

  function selectProfile(user: UserAccount | null) {
    setEditing(user);
    setName(user?.name ?? '');
    setUsername(user?.username.includes('@') ? '' : user?.username ?? '');
    setPassword('');
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
    if (await perform(
      () => manageStaff({ ...profile, action: 'save', id: editing?.id, username, password }),
      editing ? 'บันทึกบัญชีพนักงานแล้ว' : 'สร้างบัญชีแล้ว พนักงานเข้า Staff Login ได้ทันที',
    )) {
      setPassword('');
      if (!editing) {
        setName('');
        setUsername('');
        setRole('sales');
        setPositions([]);
      }
    }
  };

  const selected = users.find(user => user.id === editing?.id);
  const usernameAccount = Boolean(selected?.auth_user_id && selected.email?.endsWith('@staff.bosscomputech.invalid'));

  return (
    <section className="space-y-5">
      <form onSubmit={save} className="liquid-glass rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold">{editing ? 'แก้ไขบัญชีพนักงาน' : 'สร้างบัญชีพนักงาน'}</h2>
          {editing && <button type="button" className={buttonClass} disabled={busy} onClick={() => selectProfile(null)}>เพิ่มพนักงานใหม่</button>}
        </div>
        <fieldset disabled={busy} className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">ชื่อพนักงาน
            <input type="text" className={inputClass} value={name} onChange={event => setName(event.target.value)} required maxLength={150} />
          </label>
          <label className="block text-sm">ชื่อผู้ใช้
            <input type="text" className={inputClass} value={username} onChange={event => setUsername(event.target.value)}
              required autoCapitalize="none" spellCheck={false} pattern="[A-Za-z0-9][A-Za-z0-9._\-]{2,39}" maxLength={40} />
          </label>
          <label className="block text-sm">{usernameAccount ? 'ตั้งรหัสผ่านใหม่ (เว้นว่างเพื่อใช้รหัสเดิม)' : 'รหัสผ่านสำหรับพนักงาน'}
            <input type="password" className={inputClass} value={password} onChange={event => setPassword(event.target.value)}
              required={!usernameAccount || username.trim().toLowerCase() !== selected?.username} minLength={8} maxLength={72} autoComplete="new-password" />
          </label>
          <label className="block text-sm">บทบาทหลัก
            <select className={inputClass} value={role} onChange={event => setRole(event.target.value as UserRole)}>
              {allowedRoles.map(value => <option value={value} key={value}>{getRoleDisplayName(value)}</option>)}
            </select>
          </label>
          <fieldset className="space-y-2">
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
        <div className="flex flex-wrap gap-2">
          <button type="submit" className={buttonClass} disabled={busy}>
            {editing ? 'บันทึกบัญชี' : 'สร้างบัญชี'}
          </button>
        </div>
        {feedback && <p role={feedback.error ? 'alert' : 'status'} className={feedback.error ? 'text-rose-700 dark:text-rose-300' : 'text-emerald-700 dark:text-emerald-300'}>{feedback.text}</p>}
      </form>

      <div className="liquid-glass rounded-2xl p-5">
        <h2 className="mb-3 text-lg font-bold">รายชื่อพนักงาน</h2>
        {users.length === 0 && <p className="text-sm">ยังไม่มีโปรไฟล์พนักงาน</p>}
        <ul className="divide-y divide-slate-300/50 dark:divide-slate-600/50">
          {users.map(user => {
            const self = user.id === currentUser?.id || Boolean(user.auth_user_id && user.auth_user_id === currentUser?.auth_user_id);
            const protectedAccount = self || user.role === 'admin'
              || (!isAdmin && (user.role === 'hr' || user.work_positions?.includes('hr')));
            const status = user.is_active === false ? 'พักการใช้งาน'
              : user.auth_user_id ? 'ผูกบัญชีแล้ว' : 'ยังไม่ได้ตั้งรหัสผ่าน';
            return (
              <li key={user.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <div className="min-w-0 text-sm">
                  <strong>{user.name}</strong>
                  <div className="break-all">{user.username} · {getRoleDisplayName(user.role)} · {status}</div>
                </div>
                {!protectedAccount && <div className="flex flex-wrap gap-2">
                  <button type="button" className={buttonClass} disabled={busy} onClick={() => selectProfile(user)}>แก้ไข / ตั้งรหัสผ่าน</button>
                  <button type="button" className={buttonClass} disabled={busy} onClick={() => void perform(
                    () => manageStaff({ action: 'set-active', id: user.id, active: user.is_active === false }),
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
