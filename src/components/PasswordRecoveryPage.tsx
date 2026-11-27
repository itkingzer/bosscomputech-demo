import { useState, type FormEvent } from 'react';
import { useApp } from '../context/AppContext';

export function PasswordRecoveryPage({ onContinue }: {
  onContinue: () => void;
}) {
  const {
    passwordRecovery, updateRecoveredPassword, supabaseUrl, supabaseKey,
  } = useApp();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (password !== confirmation) {
      setError('รหัสผ่านทั้งสองช่องไม่ตรงกัน');
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      const failure = await updateRecoveredPassword(password);
      if (failure) setError(failure);
    } catch {
      setError('บันทึกรหัสผ่านไม่สำเร็จ กรุณาลองอีกครั้ง');
    } finally {
      setSubmitting(false);
    }
  };

  const inputClass = 'mt-1 block w-full rounded-xl border border-slate-300 dark:border-slate-600 bg-transparent px-3 py-2.5';
  const buttonClass = 'mt-4 min-h-11 rounded-xl bg-orange-500 px-4 py-2 font-bold text-slate-950 disabled:opacity-60';

  return (
    <main className="min-h-screen grid place-items-center bg-[var(--bg-page)] p-4 text-[var(--text-primary)]">
      <section className="liquid-glass w-full max-w-md rounded-2xl p-6 sm:p-8">
        <h1 className="mb-4 text-xl font-bold">ตั้งรหัสผ่านใหม่</h1>
        {passwordRecovery === 'ready' && (
          <form onSubmit={submit} className="space-y-3">
            <label className="block text-sm font-medium">
              รหัสผ่านใหม่
              <input className={inputClass} type="password" autoComplete="new-password" required
                minLength={6} value={password} onChange={event => setPassword(event.target.value)} />
            </label>
            <label className="block text-sm font-medium">
              ยืนยันรหัสผ่านใหม่
              <input className={inputClass} type="password" autoComplete="new-password" required
                minLength={6} value={confirmation} onChange={event => setConfirmation(event.target.value)} />
            </label>
            {error && <p role="alert" className="text-sm text-rose-700 dark:text-rose-300">{error}</p>}
            <button type="submit" className={buttonClass} disabled={submitting}>
              {submitting ? 'กำลังบันทึก…' : 'บันทึกรหัสผ่านใหม่'}
            </button>
          </form>
        )}
        {passwordRecovery === 'checking' && (
          supabaseUrl && supabaseKey
            ? <p role="status">กำลังตรวจสอบลิงก์…</p>
            : <p role="alert">ระบบออฟไลน์ กรุณาติดต่อผู้ดูแลระบบ</p>
        )}
        {passwordRecovery === 'invalid' && (
          <p role="alert">ลิงก์ตั้งรหัสผ่านใช้ไม่ได้หรือหมดอายุ กรุณาขอลิงก์ใหม่จากผู้ดูแลระบบ</p>
        )}
        {passwordRecovery === 'complete' && <p role="status">บันทึกรหัสผ่านใหม่แล้ว</p>}
        {(passwordRecovery === 'invalid' || passwordRecovery === 'complete') && (
          <button className={buttonClass} onClick={onContinue}>
            {passwordRecovery === 'complete' ? 'เข้าใช้งานต่อ' : 'ไปยัง Staff Login'}
          </button>
        )}
      </section>
    </main>
  );
}
