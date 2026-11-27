import { useMemo, useState } from 'react';
import { createPortal, flushSync } from 'react-dom';
import { History, Printer } from 'lucide-react';
import { formatDateDMY, type ActivityLog, type Item, type Order, type PrepActivityKind, type UserAccount } from '../types';
import { ListControls, useListControls } from './ListControls';
import { Modal, modalInputClass, modalPrimaryBtnClass } from './ui/Modal';
import { COMPANY_NAME } from './RepairReceiptPrintDocument';

const labels: Record<PrepActivityKind, string> = {
  accept: 'รับงาน', stock: 'เข้าคลังพร้อมขาย', hold: 'เก็บรอส่งมอบ',
  stageB: 'ส่งต่อคิวติดวอย', dispatch: 'ส่งต่อหน้าร้าน', project: 'ส่งต่อทีมเข้าไซต์', doa: 'แจ้งเคลม DOA'
};
const groups = [
  { key: 'accept', label: 'รับงาน', kinds: ['accept'] },
  { key: 'send', label: 'ส่งงาน', kinds: ['stageB', 'dispatch', 'project'] },
  { key: 'stock', label: 'เข้าคลัง / เก็บรอส่งมอบ', kinds: ['stock', 'hold'] },
  { key: 'doa', label: 'แจ้งเคลม', kinds: ['doa'] },
];
const dayFormat = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' });
const timeFormat = new Intl.DateTimeFormat('th-TH', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit', hour12: false });
const bangkokDay = (date: Date) => Number.isFinite(+date) ? dayFormat.format(date) : '';

const legacyKind = (log: ActivityLog, item: Item): PrepActivityKind | undefined => {
  const { action, note, role } = log;
  if (action === 'ช่างกดรับงาน') return 'accept';
  if (action.includes('ส่งต่อ Stage B')) return 'stageB';
  if (action.startsWith('พบของเสีย DOA')) return 'doa';
  if (action.startsWith('ติดวอยประกัน & ') && action.includes('เข้าไซต์งาน')) return 'project';
  if (action === 'เก็บรอวันส่งมอบ' || (action === 'ติดโลโก้ & สแกน S/N' && note?.includes('เก็บรอวันส่งมอบ'))) return 'hold';
  if (action === 'เก็บเข้าคลังพร้อมขาย / เก็บรอส่งมอบ' || (action === 'ติดโลโก้ & สแกน S/N' && note?.includes('เข้าคลังพร้อมขาย'))) return 'stock';
  if (action === 'แปะวอยประกัน' && (role === 'prep' || (!role && log.actor === item.assigned_prep_tech))) return 'dispatch';
};

export function PrepDailyHistory({ items, orders, technician, canMatchLegacyName }: {
  items: Item[];
  orders: Order[];
  technician: Pick<UserAccount, 'id' | 'name'> | null;
  canMatchLegacyName: boolean;
}) {
  const [date, setDate] = useState(() => bangkokDay(new Date()));
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [printing, setPrinting] = useState(false);
  const events = useMemo(() => items.flatMap(item => {
    const rows = (item.activity_logs || []).flatMap((log, index) => {
      const kind = log.prep_event?.kind ?? legacyKind(log, item);
      if (!kind) return [];
      return [{
        key: `${item.id}:${index}`, itemId: item.id, kind, timestamp: log.timestamp, actor: log.actor,
        actorId: log.prep_event?.actor_id,
        model: log.prep_event?.model ?? item.model_name,
        serial: log.prep_event ? log.prep_event.serial : log.note?.match(/S\/N:\s*([^|]+)/)?.[1].trim() ?? item.serial_number,
        reference: log.prep_event ? log.prep_event.reference : item.project_id || item.order_id || item.po_no,
      }];
    });
    if (!rows.some(row => row.kind === 'accept') && item.prep_accepted_at && item.assigned_prep_tech) {
      rows.push({
        key: `${item.id}:accepted`, itemId: item.id, kind: 'accept', timestamp: item.prep_accepted_at,
        actor: item.assigned_prep_tech, actorId: undefined, model: item.model_name, serial: null,
        reference: item.project_id || item.order_id || item.po_no,
      });
    }
    const storedKind = item.prep_type === 'inbound_stock' || (item.prep_type === 'stock_po' && item.logo_applied)
      ? 'stock' : item.status === 'prepped_in_stock' ? 'hold' : undefined;
    if (storedKind && item.moved_to_ready_at && !rows.some(row => row.kind === storedKind)) {
      rows.push({
        key: `${item.id}:stored`, itemId: item.id, kind: storedKind, timestamp: item.moved_to_ready_at,
        actor: item.assigned_prep_tech || 'ไม่ระบุช่าง', actorId: undefined, model: item.model_name,
        serial: item.serial_number, reference: item.project_id || item.order_id || item.po_no,
      });
    }
    return rows;
  }), [items]);

  const query = search.trim().toLowerCase();
  const dailyRows = date ? events.filter(row => bangkokDay(new Date(row.timestamp)) === date) : [];
  const personalRows = technician ? dailyRows
    .filter(row => row.actorId ? row.actorId === technician.id : canMatchLegacyName && row.actor === technician.name)
    .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp)) : [];
  const printGroups = new Map<string, typeof personalRows>();
  for (const row of personalRows) {
    const key = JSON.stringify([row.model.trim().toLowerCase(), row.kind, row.reference || null]);
    const group = printGroups.get(key);
    if (group) group.push(row);
    else printGroups.set(key, [row]);
  }
  const selectedGroup = groups.find(group => group.key === filter);
  const ordersById = useMemo(() => new Map(orders.map(order => [order.id, order])), [orders]);
  const reportGroups = new Map<string, { key: string; title: string; caption?: string; rows: typeof dailyRows }>();
  for (const row of dailyRows) {
    if (selectedGroup && !selectedGroup.kinds.includes(row.kind)) continue;
    const order = row.reference ? ordersById.get(row.reference) : undefined;
    const bill = order?.bill_no || order?.sales_ref || order?.id;
    const searchValues = [row.model, row.serial, row.reference, row.actor, bill, order?.customer_name];
    if (query && !searchValues.some(value => value?.toLowerCase().includes(query))) continue;

    const key = order ? `bill:${order.id}`
      : row.kind === 'stock' ? `stock:${row.model}`
        : row.reference ? `reference:${row.reference}` : `item:${row.itemId}`;
    const group = reportGroups.get(key);
    if (group) {
      group.rows.push(row);
    } else {
      reportGroups.set(key, {
        key,
        title: bill || (row.kind === 'stock' ? row.model : row.reference || row.model),
        caption: order?.customer_name || (row.kind === 'stock' ? 'สต๊อกพร้อมขาย' : undefined),
        rows: [row]
      });
    }
  }
  const summaries = [...reportGroups.values()].map(group => {
    group.rows.sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));
    const itemCount = new Set(group.rows.map(row => row.itemId)).size;
    const stockCount = new Set(group.rows.filter(row => row.kind === 'stock').map(row => row.itemId)).size;
    return { ...group, itemCount, stockCount, latest: group.rows[0].timestamp };
  });
  const list = useListControls(summaries, { getDate: group => group.latest, initialSort: 'newest' });
  const selected = summaries.find(group => group.key === selectedKey);

  const printPersonalReport = () => {
    flushSync(() => setPrinting(true));
    try {
      window.print();
    } finally {
      setPrinting(false);
    }
  };

  return (
    <section className="liquid-glass space-y-4 rounded-3xl border border-slate-200 p-4 text-slate-900 shadow-2xl dark:border-white/[0.08] dark:text-white sm:p-6">
      <h3 className="flex items-center gap-2 text-base font-bold">
        <span className="rounded-xl border border-[#FF6B00]/30 bg-[#FF6B00]/15 p-2 text-orange-800 dark:text-orange-300">
          <History className="size-5" aria-hidden="true" />
        </span>
        ประวัติงานช่างรายวัน
      </h3>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)]">
        <label className="space-y-1 text-sm font-semibold"><span>วันที่ (เวลาไทย)</span>
          <input type="date" value={date} onChange={event => { setDate(event.target.value); list.setPage(1); }} className={modalInputClass + ' min-h-11'} />
        </label>
        <label className="space-y-1 text-sm font-semibold"><span>ค้นหาประวัติ</span>
          <input type="search" value={search} onChange={event => { setSearch(event.target.value); list.setPage(1); }}
            placeholder="ชื่อสินค้า, S/N, ชื่อช่าง หรือเลขอ้างอิง" className={modalInputClass + ' min-h-11'} />
        </label>
      </div>
      {technician && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={printPersonalReport}
            disabled={personalRows.length === 0}
            className={modalPrimaryBtnClass + ' min-h-11 inline-flex items-center justify-center gap-2 sm:w-auto disabled:cursor-not-allowed disabled:opacity-50'}
          >
            <Printer className="size-4" aria-hidden="true" />
            พิมพ์รายงานของฉัน
          </button>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            {personalRows.length > 0 ? `${personalRows.length} กิจกรรมของฉันในวันที่เลือก` : 'ไม่พบกิจกรรมของฉันในวันที่เลือก'}
          </p>
        </div>
      )}
      <div className="flex flex-wrap gap-2" aria-label="กรองประเภทกิจกรรม">
        {[{ key: 'all', label: 'ทั้งหมด', kinds: [] }, ...groups].map(group => (
          <button key={group.key} type="button" aria-pressed={filter === group.key}
            onClick={() => { setFilter(group.key); list.setPage(1); }}
            className={`min-h-11 cursor-pointer rounded-xl px-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600 dark:focus-visible:outline-orange-400 ${filter === group.key
              ? 'liquid-glass-active'
              : 'liquid-glass-card text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
              }`}>
            {group.label} ({group.key === 'all' ? dailyRows.length : dailyRows.filter(row => group.kinds.includes(row.kind)).length})
          </button>
        ))}
      </div>
      {list.total === 0 ? <p className="rounded-2xl border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-600 dark:border-white/[0.1] dark:text-slate-400">
        {date ? 'ไม่พบกิจกรรมตามวันที่และตัวกรองที่เลือก' : 'เลือกวันที่เพื่อดูประวัติงาน'}
      </p> : <>
        <ListControls {...list} onSortChange={list.setSort} onPageSizeChange={list.setPageSize} onPageChange={list.setPage} unit="กลุ่ม" />
        <div className="space-y-2">
          {list.pageItems.map(group => (
            <button
              key={group.key}
              type="button"
              aria-haspopup="dialog"
              onClick={() => setSelectedKey(group.key)}
              className="min-h-11 w-full cursor-pointer rounded-2xl border border-slate-200 p-4 text-left hover:border-orange-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-600 dark:border-white/[0.08]"
            >
              <span className="flex flex-wrap justify-between gap-2">
                <span className="break-all font-bold">{group.title}</span>
                <span className="text-sm font-semibold">{group.itemCount} ชิ้น</span>
              </span>
              {group.caption && <span className="mt-1 block text-sm text-slate-600 dark:text-slate-300">{group.caption}</span>}
              <span className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs font-semibold">
                <span className="text-orange-800 dark:text-orange-300">ดูรายละเอียด · {group.rows.length} กิจกรรม</span>
                {group.stockCount > 0 && <span className="text-emerald-800 dark:text-emerald-300">เข้าสต๊อก {group.stockCount} ชิ้น</span>}
              </span>
            </button>
          ))}
        </div>
      </>}
      <Modal
        open={Boolean(selected)}
        onClose={() => setSelectedKey(null)}
        title={selected?.title || 'รายละเอียดประวัติงานช่าง'}
        subtitle={selected && [selected.caption, `${selected.itemCount} ชิ้น`, `${selected.rows.length} กิจกรรม`].filter(Boolean).join(' · ')}
        maxWidthClass="max-w-2xl"
      >
        {selected && (
          <ul className="divide-y divide-slate-200 dark:divide-white/[0.08]">
            {(list.sort === 'oldest' ? [...selected.rows].reverse() : selected.rows).map(row => (
                <li key={row.key} className="grid gap-1 py-3 sm:grid-cols-[4rem_1fr_auto] sm:gap-3">
                  <time dateTime={row.timestamp} className="text-sm tabular-nums text-slate-600 dark:text-slate-300">{timeFormat.format(new Date(row.timestamp))}</time>
                  <div className="min-w-0 break-words">
                    <p className="font-semibold">{row.model}</p>
                    <p className="text-sm text-slate-600 dark:text-slate-300">{row.actor}{row.serial && ` · S/N ${row.serial}`}{row.reference && ` · ${row.reference}`}</p>
                  </div>
                  <span className="self-start justify-self-start rounded-md bg-orange-100 px-2 py-1 text-sm font-semibold text-orange-950 dark:bg-orange-500/15 dark:text-orange-200">{labels[row.kind]}</span>
                </li>
            ))}
          </ul>
        )}
      </Modal>
      {printing && technician && createPortal(
        <article id="prep-daily-report-print" className="hidden text-slate-900 print:block">
          <header className="mb-5 break-inside-avoid border-t-4 border-orange-600 pt-4">
            <p className="text-sm font-semibold text-slate-600">{COMPANY_NAME}</p>
            <h1 className="mt-1 text-2xl font-extrabold leading-snug">รายงานประจำวันช่างเตรียมสินค้า</h1>
            <dl className="mt-4 grid grid-cols-[1.5fr_1fr_auto_auto] gap-3 rounded-lg border border-slate-300 bg-slate-50 px-3 py-3 text-sm">
              <div className="min-w-0">
                <dt className="text-slate-600">ช่างเตรียมสินค้า</dt>
                <dd className="mt-1 break-words font-bold">{technician.name}</dd>
              </div>
              <div>
                <dt className="text-slate-600">วันที่ (เวลาไทย)</dt>
                <dd className="mt-1 font-bold tabular-nums">{formatDateDMY(date)}</dd>
              </div>
              <div className="border-l border-slate-300 pl-3 text-right">
                <dt className="text-slate-600">กิจกรรม</dt>
                <dd className="mt-1 font-bold tabular-nums">{personalRows.length.toLocaleString('th-TH')}</dd>
              </div>
              <div className="border-l border-slate-300 pl-3 text-right">
                <dt className="text-slate-600">สินค้ารวม (ชิ้น)</dt>
                <dd className="mt-1 font-bold tabular-nums">{new Set(personalRows.map(row => row.itemId)).size.toLocaleString('th-TH')}</dd>
              </div>
            </dl>
          </header>
          <table className="w-full table-fixed border-collapse text-left text-sm leading-relaxed [&_td]:px-3 [&_td]:py-2 [&_th]:px-3 [&_th]:py-2">
            <thead className="table-header-group border-y-2 border-slate-400 bg-slate-100">
              <tr>
                <th scope="col" className="w-[13%]">เวลา</th>
                <th scope="col" className="w-[22%]">กิจกรรม</th>
                <th scope="col">สินค้า / S/N</th>
                <th scope="col" className="w-[11%] text-right">ชิ้น</th>
                <th scope="col" className="w-[21%]">เลขอ้างอิง</th>
              </tr>
            </thead>
            <tbody>
              {[...printGroups.values()].map(group => {
                const [row] = group;
                const order = row.reference ? ordersById.get(row.reference) : undefined;
                const firstTime = timeFormat.format(new Date(row.timestamp));
                const lastTime = timeFormat.format(new Date(group[group.length - 1].timestamp));
                const serials = [...new Set(group.flatMap(entry => entry.serial ? [entry.serial] : []))];
                return (
                  <tr key={row.key} className="break-inside-avoid border-b border-slate-300 align-top even:bg-slate-50">
                    <td className="tabular-nums">{firstTime}{lastTime !== firstTime && <div>ถึง {lastTime}</div>}</td>
                    <td>{labels[row.kind]}</td>
                    <td className="break-words">
                      <div className="font-semibold">{row.model}</div>
                      {serials.length > 0 && <div className="mt-0.5 text-xs text-slate-600">S/N <span className="font-mono">{serials.join(', ')}</span></div>}
                    </td>
                    <td className="text-right font-bold tabular-nums">{new Set(group.map(entry => entry.itemId)).size.toLocaleString('th-TH')}</td>
                    <td className="break-words text-slate-700">{order?.bill_no || order?.sales_ref || row.reference || '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </article>,
        document.body
      )}
    </section>
  );
}
