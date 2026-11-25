import { useState, type FormEvent } from 'react';
import { ClipboardList } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { formatThaiDateTime, type RepairTicket } from '../types';
import { Modal, modalInputClass, modalPrimaryBtnClass, modalSecondaryBtnClass } from './ui/Modal';

const fields = [
  ['customer_name', 'ชื่อลูกค้า', true],
  ['customer_phone', 'เบอร์โทร', false],
  ['device_model', 'รุ่น / ประเภทเครื่อง', false],
  ['walkin_sn', 'หมายเลขเครื่อง (S/N)', false],
  ['delivery_location', 'สถานที่รับเครื่อง', false],
  ['fault_symptom', 'อาการเสีย / รายละเอียดงาน', true]
] as const;

type Selection = { ticket: RepairTicket; kind: 'edit' | 'withdraw' | 'delete' };

export function ServiceSheetHistoryModal({ onClose, onToast }: { onClose: () => void; onToast: (msg: string) => void }) {
  const { serviceSheetHistory, manageServiceSheet } = useApp();
  const [selection, setSelection] = useState<Selection | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const history = [...serviceSheetHistory].sort((a, b) => b.created_at.localeCompare(a.created_at));

  function select(next: Selection | null) {
    setError('');
    setSelection(next);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selection || saving) return;
    const { ticket, kind } = selection;
    const data = new FormData(event.currentTarget);
    const value = (name: string) => String(data.get(name) ?? '').trim();
    if (kind === 'edit' && (!value('customer_name') || !value('fault_symptom'))) {
      setError('กรุณากรอกชื่อลูกค้าและอาการเสีย');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await manageServiceSheet(ticket.id, kind === 'edit' ? {
        kind,
        fields: {
          customer_name: value('customer_name'),
          customer_phone: value('customer_phone') || null,
          device_model: value('device_model') || null,
          walkin_sn: value('walkin_sn'),
          delivery_location: value('delivery_location'),
          fault_symptom: value('fault_symptom')
        }
      } : { kind });
      setSelection(null);
      onToast(kind === 'delete' ? 'ลบ Service Sheet แล้ว' : kind === 'withdraw'
        ? 'ถอน Service Sheet จากคิวห้องช่างแล้ว' : 'บันทึกการแก้ไข Service Sheet แล้ว');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'บันทึกไม่สำเร็จ กรุณาลองอีกครั้ง');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={() => { if (!saving) selection ? select(null) : onClose(); }}
      title={selection ? `Service Sheet ${selection.ticket.ticket_no}` : 'ประวัติ Service Sheet'}
      icon={<ClipboardList className="h-5 w-5" />}
      maxWidthClass="max-w-2xl"
    >
      {selection ? (
        <form onSubmit={submit} className="space-y-3">
          {selection.kind === 'edit' ? fields.map(([key, label, required]) => (
            <label key={key} className="block space-y-1 text-sm font-semibold">
              <span>{label}</span>
              {key === 'fault_symptom' ? (
                <textarea name={key} defaultValue={selection.ticket[key] || ''} required={required} rows={3} className={modalInputClass} />
              ) : (
                <input name={key} type={key === 'customer_phone' ? 'tel' : 'text'} defaultValue={selection.ticket[key] || ''} required={required} className={modalInputClass} />
              )}
            </label>
          )) : (
            <p className="text-sm">
              {selection.kind === 'delete'
                ? 'ยืนยันลบใบนี้ออกจากประวัติและระบบ?'
                : 'ยืนยันถอนใบนี้จากคิวห้องช่าง? ใบงานจะยังเปิดดูและแก้ไขได้ในประวัติ'}
            </p>
          )}
          {error && <p role="alert" className="text-sm text-rose-600 dark:text-rose-300">{error}</p>}
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" disabled={saving} className={modalSecondaryBtnClass} onClick={() => select(null)}>กลับไปประวัติ</button>
            <button type="submit" disabled={saving} className={modalPrimaryBtnClass}>
              {saving ? 'กำลังบันทึก…' : selection.kind === 'edit' ? 'บันทึก' : selection.kind === 'delete' ? 'ยืนยันลบ' : 'ยืนยันถอนจากคิว'}
            </button>
          </div>
        </form>
      ) : (
        <ul className="space-y-3">
          {!history.length && <li className="text-sm text-slate-600 dark:text-slate-300">ยังไม่มีประวัติการออก Service Sheet</li>}
          {history.map(ticket => {
            const withdrawn = !!ticket.service_sheet_withdrawn_at;
            const queued = !withdrawn && ticket.status === 'open' && (!ticket.repair_status || ticket.repair_status === 'pending_check') && !ticket.repaired_by;
            return (
              <li key={ticket.id} className="space-y-2 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                <div className="flex flex-wrap items-baseline justify-between gap-x-2 text-sm">
                  <strong>{ticket.ticket_no} · {ticket.customer_name}</strong>
                  <span>{withdrawn ? 'ถอนจากคิวแล้ว' : queued ? 'รอตรวจในห้องช่าง' : 'ห้องช่างดำเนินการแล้ว'}</span>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-300">{formatThaiDateTime(ticket.created_at)} · {ticket.received_by || 'ช่าง Onsite'}</p>
                <p className="text-sm">{[ticket.device_model, ticket.walkin_sn, ticket.fault_symptom].filter(Boolean).join(' · ')}</p>
                <div className="flex flex-wrap gap-2">
                  <button type="button" className={modalSecondaryBtnClass} onClick={() => select({ ticket, kind: 'edit' })}>แก้ไข</button>
                  {queued && <button type="button" className={modalSecondaryBtnClass} onClick={() => select({ ticket, kind: 'withdraw' })}>ถอนจากคิวห้องช่าง</button>}
                  {(queued || withdrawn) && <button type="button" className={modalSecondaryBtnClass + ' text-rose-700 dark:text-rose-300'} onClick={() => select({ ticket, kind: 'delete' })}>ลบ</button>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Modal>
  );
}
