import { useId, useState, type FormEvent } from 'react';
import { BriefcaseBusiness, Camera, ContactRound, UserRound } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { blobToDataUrl, compressEvidenceImage } from '../services/imageStorageService';
import type { UserAccount } from '../types';
import { formatEmploymentDate, getRoleDisplayName, getWorkPositions } from '../utils/domainHelpers';
import { Modal, modalInputClass, modalLabelClass, modalPrimaryBtnClass } from './ui/Modal';

export function StaffAvatar({ user, className = 'size-10' }: {
  user: Pick<UserAccount, 'name' | 'nickname' | 'avatar'>;
  className?: string;
}) {
  return (
    <span aria-hidden="true" className={`relative flex shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[#FF6B00]/30 bg-[#FF6B00]/15 font-bold text-[#FF6B00] ${className}`}>
      {(user.nickname || user.name).trim().slice(0, 2) || <UserRound className="size-5" />}
      {user.avatar && <img src={user.avatar} alt="" className="absolute inset-0 size-full object-cover" onError={event => { event.currentTarget.hidden = true; }} key={user.avatar} />}
    </span>
  );
}

export function StaffProfileFields({ user, details, onDetails, onAvatar, onImageBusy }: {
  user: Pick<UserAccount, 'name' | 'nickname' | 'avatar'>;
  details: string;
  onDetails: (value: string) => void;
  onAvatar: (value: string | null) => void;
  onImageBusy: (value: boolean) => void;
}) {
  const id = useId();
  const [imageError, setImageError] = useState('');
  const [imageBusy, setImageBusy] = useState(false);

  const chooseImage = async (file: File) => {
    setImageError('');
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 10 * 1024 * 1024) {
      setImageError('เลือกรูป JPG, PNG หรือ WebP ขนาดไม่เกิน 10 MB');
      return;
    }
    setImageBusy(true);
    onImageBusy(true);
    try {
      const { blob } = await compressEvidenceImage(file, 256, 256);
      onAvatar(await blobToDataUrl(blob));
    } catch {
      setImageError('เปิดรูปนี้ไม่ได้ กรุณาเลือกไฟล์อื่น');
    } finally {
      setImageBusy(false);
      onImageBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/50">
        <StaffAvatar user={user} className="size-16 text-lg" />
        <div className="min-w-0 flex-1">
          <label htmlFor={`${id}-photo`} className="relative inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl px-3 font-bold text-slate-700 focus-within:ring-2 focus-within:ring-[#FF6B00] dark:text-slate-200">
            <Camera aria-hidden="true" className="size-4" />
            {imageBusy ? 'กำลังเตรียมรูป…' : 'เลือกรูปโปรไฟล์'}
            <input id={`${id}-photo`} type="file" accept="image/jpeg,image/png,image/webp" disabled={imageBusy} className="sr-only"
              onChange={event => {
                const file = event.currentTarget.files?.[0];
                event.currentTarget.value = '';
                if (file) void chooseImage(file);
              }}
            />
          </label>
          {user.avatar && <button type="button" disabled={imageBusy} onClick={() => { onAvatar(null); setImageError(''); }} className="min-h-11 rounded-xl px-3 font-semibold text-rose-700 dark:text-rose-300">ลบรูป</button>}
          {imageError && <p role="alert" className="px-3 text-rose-700 dark:text-rose-300">{imageError}</p>}
        </div>
      </div>
      <div>
        <label htmlFor={`${id}-details`} className={modalLabelClass}>รายละเอียดโปรไฟล์</label>
        <textarea id={`${id}-details`} value={details} onChange={event => onDetails(event.target.value)} rows={3} maxLength={1000} className={modalInputClass} />
      </div>
    </div>
  );
}

export function MyStaffProfile({ user, onClose }: { user: UserAccount; onClose: () => void }) {
  const { updateUser } = useApp();
  const formId = useId();
  const [section, setSection] = useState<'profile' | 'contact' | 'work'>('profile');
  const [avatar, setAvatar] = useState(user.avatar ?? null);
  const [details, setDetails] = useState(user.profile_details ?? '');
  const [email, setEmail] = useState(user.email ?? '');
  const [phone, setPhone] = useState(user.phone ?? '');
  const [address, setAddress] = useState(user.address ?? '');
  const [imageBusy, setImageBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const busy = saving || imageBusy;
  const updates: Partial<UserAccount> = {};
  if (avatar !== (user.avatar ?? null)) updates.avatar = avatar;
  if (details.trim() !== (user.profile_details ?? '')) updates.profile_details = details.trim() || null;
  if (email.trim() !== (user.email ?? '')) updates.email = email.trim() || null;
  if (phone.trim() !== (user.phone ?? '')) updates.phone = phone.trim();
  if (address.trim() !== (user.address ?? '')) updates.address = address.trim() || null;
  const dirty = Object.keys(updates).length > 0;
  const positions = getWorkPositions(user).map(getRoleDisplayName).join(', ');
  const sections = [
    { id: 'profile', label: 'ข้อมูลทั่วไป', icon: UserRound },
    { id: 'contact', label: 'ข้อมูลติดต่อ', icon: ContactRound },
    { id: 'work', label: 'ข้อมูลการทำงาน', icon: BriefcaseBusiness },
  ] as const;

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy || !dirty) return;
    const emailInput = event.currentTarget.querySelector<HTMLInputElement>('input[type="email"]');
    if (emailInput && !emailInput.validity.valid) {
      setSection('contact');
      setSaveError('กรุณากรอกอีเมลให้ถูกต้อง');
      return;
    }
    setSaving(true);
    setSaveError('');
    try {
      if (await updateUser(user.id, updates)) onClose();
      else setSaveError('บันทึกโปรไฟล์ไม่สำเร็จ กรุณาลองอีกครั้ง');
    } catch {
      setSaveError('บันทึกโปรไฟล์ไม่สำเร็จ กรุณาลองอีกครั้ง');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open onClose={() => { if (!busy) onClose(); }} title="โปรไฟล์ของฉัน"
      icon={<UserRound aria-hidden="true" className="size-5" />} maxWidthClass="max-w-3xl"
      footer={
        <div className="flex flex-wrap items-center justify-end gap-2">
          {saveError && <p role="alert" className="w-full text-sm text-rose-700 dark:text-rose-300">{saveError}</p>}
          <button type="button" disabled={busy} onClick={onClose}
            className="min-h-11 rounded-xl px-4 text-sm font-semibold text-slate-700 hover:bg-slate-200 disabled:opacity-50 dark:text-slate-200 dark:hover:bg-slate-800">ปิด</button>
          <button type="submit" form={formId} disabled={busy || !dirty}
            className={`${modalPrimaryBtnClass} !min-h-11 !w-auto !px-5 !text-sm`}>{saving ? 'กำลังบันทึก…' : 'บันทึกโปรไฟล์'}</button>
        </div>
      }>
      <div className="mb-4 flex items-center gap-4 rounded-2xl border border-orange-200 bg-orange-50 p-4 dark:border-orange-400/25 dark:bg-orange-400/10">
        <StaffAvatar user={{ ...user, avatar }} className="size-14 text-lg" />
        <div className="min-w-0">
          <p className="break-words text-lg font-bold">{user.name}</p>
          {positions && <p className="break-words text-sm text-slate-700 dark:text-slate-200">{positions}</p>}
        </div>
      </div>
      <div className="grid items-start gap-4 sm:grid-cols-[11rem_minmax(0,1fr)]">
        <nav aria-label="เมนูโปรไฟล์พนักงาน" className="grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800/80 sm:grid-cols-1">
          {sections.map(({ id, label, icon: Icon }) => (
            <button key={id} type="button" aria-current={section === id ? 'true' : undefined} aria-controls={`${formId}-${id}`}
              onClick={() => setSection(id)}
              className={`flex min-h-11 items-center justify-center gap-1.5 rounded-lg px-1.5 py-2 text-xs font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600 sm:justify-start sm:px-3 sm:text-sm ${section === id
                ? 'bg-white text-orange-900 shadow-sm ring-1 ring-orange-200 dark:bg-slate-950 dark:text-orange-200 dark:ring-orange-400/35'
                : 'text-slate-700 hover:bg-white/70 dark:text-slate-200 dark:hover:bg-slate-700'}`}>
              <Icon aria-hidden="true" className="hidden size-4 shrink-0 min-[420px]:block" /> {label}
            </button>
          ))}
        </nav>
        <form id={formId} noValidate onSubmit={save} aria-busy={saving}
          className="min-w-0 rounded-2xl border border-slate-200 p-3 dark:border-slate-700 sm:p-5">
          <fieldset disabled={saving} className="min-w-0">
            <section id={`${formId}-profile`} hidden={section !== 'profile'} className="space-y-3">
              <h4 className="text-base font-bold">ข้อมูลทั่วไป</h4>
              <StaffProfileFields user={{ ...user, avatar }} details={details} onDetails={setDetails} onAvatar={setAvatar} onImageBusy={setImageBusy} />
            </section>
            <section id={`${formId}-contact`} hidden={section !== 'contact'} className="space-y-3">
              <h4 className="text-base font-bold">ข้อมูลติดต่อ</h4>
              <div>
                <label htmlFor={`${formId}-email`} className={modalLabelClass}>อีเมล</label>
                <input id={`${formId}-email`} type="email" autoComplete="email" maxLength={254} value={email}
                  onChange={event => setEmail(event.target.value)} className={`${modalInputClass} min-h-11 !text-base`} />
              </div>
              <div>
                <label htmlFor={`${formId}-phone`} className={modalLabelClass}>เบอร์โทรศัพท์</label>
                <input id={`${formId}-phone`} type="tel" autoComplete="tel" maxLength={30} value={phone}
                  onChange={event => setPhone(event.target.value)} className={`${modalInputClass} min-h-11 !text-base`} />
              </div>
              <div>
                <label htmlFor={`${formId}-address`} className={modalLabelClass}>ที่อยู่ติดต่อ</label>
                <textarea id={`${formId}-address`} autoComplete="street-address" rows={3} maxLength={500} value={address}
                  onChange={event => setAddress(event.target.value)} className={`${modalInputClass} !text-base`} />
              </div>
            </section>
          </fieldset>
          <section id={`${formId}-work`} hidden={section !== 'work'} className="space-y-3">
            <h4 className="text-base font-bold">ข้อมูลการทำงาน</h4>
            <dl className="grid gap-3 rounded-xl bg-slate-50 p-3 text-sm dark:bg-slate-800/50 sm:grid-cols-2">
              <div><dt className={modalLabelClass}>ชื่อผู้ใช้</dt><dd className="break-all">{user.username}</dd></div>
              <div><dt className={modalLabelClass}>แผนก</dt><dd>{user.department || 'ยังไม่ระบุ'}</dd></div>
              <div><dt className={modalLabelClass}>ตำแหน่งงาน</dt><dd>{positions || 'ยังไม่ระบุ'}</dd></div>
              <div><dt className={modalLabelClass}>วันเริ่มงาน</dt><dd>{formatEmploymentDate(user.employment_start_date)}</dd></div>
            </dl>
          </section>
        </form>
      </div>
    </Modal>
  );
}
