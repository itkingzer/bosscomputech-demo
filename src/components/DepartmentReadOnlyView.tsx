import { useEffect, useState } from 'react';
import { Eye, Search } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { getRoleDisplayName } from '../utils/domainHelpers';
import type { UserRole } from '../types';

const statuses: Record<string, string> = {
  active: 'ทำงานอยู่', inactive: 'พักงาน', ordered: 'สั่งซื้อแล้ว', received: 'รับสินค้าแล้ว',
  cancelled: 'ยกเลิก', pending: 'รอวางบิล', billed: 'วางบิลแล้ว',
  pending_purchasing: 'รอจัดซื้อ', waiting_po: 'รอ PO', po_received_in_stock: 'รับเข้าสต๊อกแล้ว',
  approved_for_prep: 'ส่งให้ช่างเตรียมแล้ว', fulfilled: 'ส่งมอบครบแล้ว',
  raw_stock: 'สินค้ารอเตรียม', pending_prep_stock: 'รอเตรียมเข้าสต๊อก', pending_prep: 'รอเตรียม',
  prepped_in_stock: 'เตรียมแล้ว', ready_for_dispatch: 'พร้อมจัดคิว', assigned_onsite: 'จ่ายงานแล้ว',
  delivered: 'ส่งมอบแล้ว', open: 'รอตรวจเช็ก', in_progress: 'กำลังซ่อม', repaired: 'ซ่อมแล้ว',
  unrepairable_warranty: 'ส่งเคลมประกัน', expired_warranty: 'หมดประกัน', unrepairable: 'ซ่อมไม่ได้',
  awaiting_dispatch: 'รอจัดคิวส่ง', dispatched_onsite: 'มอบหมายช่างแล้ว', on_delivery: 'กำลังส่ง',
  returned_closed: 'ปิดงานแล้ว',
};

export function DepartmentReadOnlyView({ page, title }: { page: string; title: string }) {
  const { readDepartmentPage } = useApp();
  const [rows, setRows] = useState<Awaited<ReturnType<typeof readDepartmentPage>> | null>(null);
  const [failed, setFailed] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    void readDepartmentPage(page, controller.signal).then(result => {
      if (!controller.signal.aborted) setRows(result);
    }).catch(() => {
      if (!controller.signal.aborted) setFailed(true);
    });
    return () => controller.abort();
  }, [page, readDepartmentPage]);

  const query = search.trim().toLowerCase();
  const visible = rows?.filter(row => [row.reference, row.detail, statuses[row.status] ?? row.status]
    .some(value => value.toLowerCase().includes(query)));

  return (
    <section className="space-y-4">
      <header className="liquid-glass flex items-center gap-4 rounded-3xl p-5">
        <span className="rounded-xl bg-orange-500/15 p-3 text-orange-700 dark:text-orange-300"><Eye aria-hidden="true" size={22} /></span>
        <div>
          <h1 className="text-lg font-extrabold">{title}</h1>
          <p className="text-sm text-slate-600 dark:text-slate-300">ดูอย่างเดียว · ดำเนินงานได้เมื่อมีตำแหน่งที่รับผิดชอบ</p>
        </div>
      </header>
      <div className="liquid-glass overflow-hidden rounded-2xl">
        <div className="flex flex-wrap items-center justify-between gap-3 p-4">
          <h2 className="font-bold">{page === 'hr' ? 'รายชื่อพนักงาน' : 'รายการล่าสุด'}</h2>
          <label className="relative w-full sm:max-w-xs">
            <Search aria-hidden="true" size={17} className="absolute left-3 top-3.5 text-slate-500" />
            <input type="search" aria-label="ค้นหาในรายการ" placeholder="ค้นหาในรายการ"
              className="liquid-glass-input min-h-11 w-full rounded-xl py-2 pl-9 pr-3"
              value={search} onChange={event => setSearch(event.target.value)} />
          </label>
        </div>
        {failed ? <p role="alert" className="p-4 text-rose-700 dark:text-rose-300">โหลดรายการไม่สำเร็จ</p>
          : !visible ? <p role="status" className="p-4">กำลังโหลดรายการ…</p>
          : visible.length === 0 ? <p className="p-4">ไม่พบรายการ</p>
          : <ul className="divide-y divide-slate-200 border-t border-slate-200 dark:divide-slate-700 dark:border-slate-700">
            {visible.map((row, index) => (
              <li key={`${row.reference}-${index}`} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                <div className="min-w-0">
                  <strong className="break-words">{row.reference}</strong>
                  {row.detail && <p className="break-words text-sm text-slate-600 dark:text-slate-300">{page === 'hr' ? getRoleDisplayName(row.detail as UserRole) : row.detail}</p>}
                </div>
                <span className="rounded-full bg-slate-200 px-2.5 py-1 text-xs font-semibold dark:bg-slate-700">{statuses[row.status] ?? row.status}</span>
              </li>
            ))}
          </ul>}
      </div>
    </section>
  );
}
