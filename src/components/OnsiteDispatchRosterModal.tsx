import { ModalBackdrop } from './ui/ModalBackdrop';
import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Printer, X, Plus, Truck, Car } from 'lucide-react';
import { Order, Item, Project, RepairTicket, formatDateDMY, getLocalDateStr } from '../types';

export interface DispatchRosterTeamBlock {
  teamKey: string;
  techLabel: string;
  vehiclePlate: string;
  rows: DispatchRosterRow[];
}

export interface DispatchRosterRow {
  id: string;
  district: string;
  customerName: string;
  customerPhone?: string;
  equipmentOrSymptom: string;
  amount: number;
  orderOrIntakeDate: string;
  completedDate: string;
  scheduledInstallDate: string;
  notes: string;
  tag: 'ORDER' | 'SERVICE' | 'PROJECT';
}

interface OnsiteDispatchRosterModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetDate: string;
  onDateChange: (dateKey: string) => void;
  orders: Order[];
  items: Item[];
  projects: Project[];
  repairTickets: RepairTicket[];
  vehicleMap: Record<string, string>;
  onUpdateVehiclePlate?: (teamKey: string, plate: string) => void;
  customTeamBlocks?: { teamKey: string; techs: string[]; vehiclePlate: string }[];
  onAddCustomTeamBlock?: (techs: string[], vehiclePlate: string) => void;
  availableTechs?: string[];
  readOnly?: boolean;
}

const VEHICLE_PRESETS = ['6787', '4599', '7270', '8812', '-'];

function formatThaiSheetDate(dateStr?: string | null): string {
  if (!dateStr) return '-';
  const d = new Date(`${dateStr}T00:00:00`);
  if (isNaN(d.getTime())) return dateStr;
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const beYear = d.getFullYear() + 543;
  return `${dd}-${mm}-${beYear}`;
}

function fmtAmount(n: number): string {
  if (!n || n <= 0) return '-';
  return n.toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

export const OnsiteDispatchRosterModal: React.FC<OnsiteDispatchRosterModalProps> = ({
  isOpen,
  onClose,
  targetDate,
  onDateChange,
  orders,
  items,
  projects,
  repairTickets,
  vehicleMap,
  onUpdateVehiclePlate,
  customTeamBlocks = [],
  onAddCustomTeamBlock,
  availableTechs = [],
  readOnly = false
}) => {
  const [printNotes, setPrintNotes] = useState<Record<string, string>>({});
  const [teamFilter, setTeamFilter] = useState<string>('all');
  const [showAddTeam, setShowAddTeam] = useState(false);
  const [newTeamTechs, setNewTeamTechs] = useState<string[]>([]);
  const [newTeamPlate, setNewTeamPlate] = useState('6787');

  useEffect(() => {
    if (!isOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [isOpen, onClose]);

  const teamBlocks: DispatchRosterTeamBlock[] = useMemo(() => {
    const map = new Map<string, DispatchRosterTeamBlock>();

    const ensureBlock = (techs: string[], explicitPlate?: string) => {
      const cleanTechs = techs.filter(Boolean);
      const teamKey = cleanTechs.length > 0 ? cleanTechs.join('+') : 'ยังไม่ระบุช่าง';
      if (!map.has(teamKey)) {
        map.set(teamKey, {
          teamKey,
          techLabel: teamKey,
          vehiclePlate: explicitPlate ?? vehicleMap[teamKey] ?? '-',
          rows: []
        });
      }
      return map.get(teamKey)!;
    };

    // Seed custom team blocks created by Front-Desk for this day
    customTeamBlocks.forEach(tb => {
      ensureBlock(tb.techs, tb.vehiclePlate);
    });

    // 1. Scheduled Sales / Project Items (grouped by order_id or standalone)
    const scheduledItems = items.filter(
      it => it.scheduled_date === targetDate && it.status !== 'delivered' && !it.site_visit_id
    );
    const itemsByOrder = new Map<string, Item[]>();
    scheduledItems.forEach(it => {
      const key = it.order_id || `single-${it.id}`;
      const list = itemsByOrder.get(key) || [];
      list.push(it);
      itemsByOrder.set(key, list);
    });

    itemsByOrder.forEach((groupItems, key) => {
      const first = groupItems[0];
      const ord = first.order_id ? orders.find(o => o.id === first.order_id) : null;
      const prj = first.project_id ? projects.find(p => p.id === first.project_id) : null;
      const techs = first.assigned_techs && first.assigned_techs.length > 0
        ? first.assigned_techs
        : (first.assigned_onsite_tech ? [first.assigned_onsite_tech] : []);
      const block = ensureBlock(techs);

      const orderAmount = ord
        ? (ord.items_list || []).reduce((s, li) => s + (li.unit_price || 0) * (li.quantity || 1), 0)
        : 0;

      const equipmentByModel = new Map<string, Item[]>();
      for (const item of groupItems) {
        const name = item.model_name.trim();
        const matching = equipmentByModel.get(name);
        if (matching) matching.push(item);
        else equipmentByModel.set(name, [item]);
      }
      const equipSummary = [...equipmentByModel].map(([name, matching]) => {
        if (matching.length > 1) return `${name} × ${matching.length} ชิ้น`;
        const serial = matching[0].serial_number;
        return serial ? `${name} [S/N: ${serial}]` : name;
      }).join('\n');

      const noteParts = [
        ord?.site_notes,
        ...new Set(groupItems.map(item => item.prep_note?.trim()).filter(Boolean)),
        first.scheduled_time_slot ? `ช่วง: ${first.scheduled_time_slot}` : '',
        first.dispatch_route_zone ? `สาย: ${first.dispatch_route_zone}` : ''
      ].filter(Boolean);

      block.rows.push({
        id: `ord-${key}`,
        district: (ord?.district || prj?.district || '-').replace('เมืองสุราษฎร์ธานี', 'เมือง'),
        customerName: prj ? prj.customer_name : (ord?.customer_name || '-'),
        customerPhone: prj ? prj.phone : ord?.customer_phone,
        equipmentOrSymptom: equipSummary,
        amount: orderAmount,
        orderOrIntakeDate: formatDateDMY(ord?.created_at || first.created_at),
        completedDate: formatDateDMY(first.prepped_at),
        scheduledInstallDate: formatDateDMY(first.scheduled_date || ord?.delivery_date),
        notes: noteParts.join(' • ') || '-',
        tag: prj ? 'PROJECT' : 'ORDER'
      });
    });

    // 2. Scheduled Project Site Visits (site_visits)
    projects.forEach(prj => {
      (prj.site_visits || []).forEach(sv => {
        if (sv.visit_date !== targetDate || sv.visit_status === 'completed') return;
        const block = ensureBlock(sv.assigned_techs || []);
        const prjAmount = (prj.items || []).reduce((s, it) => s + (it.unit_price || 0) * (it.qty_required || 0), 0);
        const quantities = new Map<string, number>();
        for (const item of sv.items_to_take) {
          const name = item.name.trim();
          quantities.set(name, (quantities.get(name) ?? 0) + item.qty);
        }
        const itemsText = [...quantities].map(([name, quantity]) => `${name} × ${quantity} ชิ้น`);
        const prepNote =
          sv.prep_status === 'dispatched' ? 'จ่ายออกแล้ว' : sv.prep_status === 'ready_for_pickup'
            ? 'ของที่ตัดเทสแล้ว (พร้อมขึ้นรถ)'
            : sv.prep_status === 'prepping'
              ? 'กำลังเทส/ติดวอย (ของยังไม่ครบ)'
              : 'รอตัดสต๊อก';
        block.rows.push({
          id: `vst-${sv.id}`,
          district: (prj.district || '-').replace('เมืองสุราษฎร์ธานี', 'เมือง'),
          customerName: `${prj.customer_name} (${prj.site_name})`,
          customerPhone: prj.phone,
          equipmentOrSymptom: [sv.visit_scope, ...itemsText].filter(Boolean).join('\n'),
          amount: prjAmount,
          orderOrIntakeDate: formatDateDMY(prj.start_date || prj.created_at),
          completedDate: '-',
          scheduledInstallDate: formatDateDMY(sv.visit_date),
          notes: `${prepNote} • ช่วง: ${sv.time_slot}`,
          tag: 'PROJECT'
        });
      });
    });

    // 3. Scheduled Repair Returns & Onsite Service Tickets
    repairTickets.forEach(t => {
      if (t.scheduled_date !== targetDate || t.status === 'returned_closed') return;
      const techs = t.assigned_techs && t.assigned_techs.length > 0
        ? t.assigned_techs
        : (t.assigned_onsite_tech ? [t.assigned_onsite_tech] : []);
      const block = ensureBlock(techs);
      block.rows.push({
        id: `rep-${t.id}`,
        district: (t.district || '-').replace('เมืองสุราษฎร์ธานี', 'เมือง'),
        customerName: t.customer_name,
        customerPhone: t.customer_phone || undefined,
        equipmentOrSymptom: `${t.device_model || 'เครื่องซ่อม'} (S/N: ${t.walkin_sn || '-'}) — ${t.fault_symptom}`,
        amount: t.repair_cost || 0,
        orderOrIntakeDate: formatDateDMY(t.received_at),
        completedDate: formatDateDMY(t.finished_at),
        scheduledInstallDate: formatDateDMY(t.scheduled_date || t.due_date),
        notes: [t.repair_detail, t.scheduled_time_slot ? `ช่วง: ${t.scheduled_time_slot}` : '', t.dispatch_route_zone].filter(Boolean).join(' • ') || '-',
        tag: 'SERVICE'
      });
    });

    return Array.from(map.values());
  }, [targetDate, orders, items, projects, repairTickets, vehicleMap, customTeamBlocks]);

  if (!isOpen) return null;

  const visibleBlocks = teamFilter === 'all'
    ? teamBlocks
    : teamBlocks.filter(b => b.teamKey === teamFilter);
  const totalJobs = visibleBlocks.reduce((s, b) => s + b.rows.length, 0);

  return createPortal(
    <ModalBackdrop
      className="onsite-dispatch-roster-portal fixed inset-0 z-[9999] bg-black/75 backdrop-blur-sm flex flex-col items-center justify-start overflow-y-auto overscroll-contain p-2 sm:p-5 animate-fade-in"
      onDismiss={onClose}
    >
      {/* Top Interactive Controls (hidden during print) */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="no-print w-full max-w-[297mm] mb-3 bg-white dark:bg-slate-900 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-700 rounded-2xl p-4 shadow-2xl space-y-3"
      >
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 rounded-xl bg-[#FF6B00]/15 text-[#FF6B00] border border-[#FF6B00]/30">
              <Truck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-black">
                ใบจัดคิวรถ
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                รูปแบบตารางแยกตามบล็อกชุดช่าง &amp; ทะเบียนรถ พร้อมพิมพ์ประชุมเช้า (A4 แนวนอน)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <input
              type="date"
              value={targetDate}
              onChange={(e) => onDateChange(e.target.value)}
              className="px-3 py-2 rounded-xl text-xs font-bold bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 cursor-pointer"
            />
            <button
              type="button"
              onClick={() => onDateChange(getLocalDateStr(1))}
              className="px-3 py-2 rounded-xl text-xs font-bold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-700 cursor-pointer"
            >
              วันพรุ่งนี้
            </button>
            <select
              value={teamFilter}
              onChange={(e) => setTeamFilter(e.target.value)}
              className="px-3 py-2 rounded-xl text-xs font-bold bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 cursor-pointer"
            >
              <option value="all">ทุกชุดช่าง ({teamBlocks.length} ชุด)</option>
              {teamBlocks.map(b => (
                <option key={b.teamKey} value={b.teamKey}>{b.techLabel} (รถ {b.vehiclePlate})</option>
              ))}
            </select>
            {!readOnly && onAddCustomTeamBlock && (
              <button
                type="button"
                onClick={() => setShowAddTeam(v => !v)}
                className="px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold cursor-pointer flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>+ เพิ่มบล็อกชุดช่าง</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => window.print()}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#FF6B00] to-[#E65A00] hover:from-[#FF8A24] text-black text-xs font-black cursor-pointer flex items-center gap-1.5 shadow-md"
            >
              <Printer className="w-4 h-4" />
              <span>พิมพ์ใบจัดคิวรถ</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="ปิดหน้าต่าง"
              className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-300 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Add Custom Team Block Inline Form */}
        {!readOnly && showAddTeam && onAddCustomTeamBlock && (
          <div className="p-3 rounded-xl bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-500/30 flex flex-wrap items-center gap-3 text-xs">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="font-bold">เลือกช่างเข้าชุด:</span>
              {(availableTechs.length > 0 ? availableTechs : ['ช่างเอ', 'ช่างบี', 'ช่างซี', 'ช่างดี']).map(t => {
                const active = newTeamTechs.includes(t);
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setNewTeamTechs(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t])}
                    className={`px-2.5 py-1 rounded-lg font-bold border cursor-pointer ${
                      active ? 'bg-[#FF6B00] text-black border-[#FF6B00]' : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700'
                    }`}
                  >
                    {active ? '✓ ' : ''}{t}
                  </button>
                );
              })}
            </div>
            <div className="flex items-center gap-1.5">
              <Car className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              <span className="font-bold">ทะเบียนรถ:</span>
              <input
                type="text"
                value={newTeamPlate}
                onChange={(e) => setNewTeamPlate(e.target.value)}
                placeholder="เช่น 6787"
                className="w-24 px-2.5 py-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-mono font-bold"
              />
            </div>
            <button
              type="button"
              onClick={() => {
                if (newTeamTechs.length === 0) return;
                onAddCustomTeamBlock(newTeamTechs, newTeamPlate.trim() || '-');
                setNewTeamTechs([]);
                setShowAddTeam(false);
              }}
              className="px-3 py-1.5 rounded-lg bg-emerald-700 text-white font-bold cursor-pointer"
            >
              สร้างบล็อกชุดช่าง
            </button>
          </div>
        )}
      </div>

      {/* Printable Sheet (A4 Landscape Black & White) */}
      <div
        id="onsite-dispatch-roster-print"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[297mm] bg-white text-black p-5 sm:p-7 shadow-2xl border border-slate-300 rounded-xl print:rounded-none print:border-none print:shadow-none space-y-5"
      >
        <div className="overflow-x-auto print:overflow-visible">
          <table className="w-full border-collapse border border-black text-[11px]">
            <thead className="print:table-header-group">
              <tr>
                <th colSpan={9} className="px-2 py-2 text-left align-top">
                  <div className="border-b-2 border-black pb-2.5 flex flex-col sm:flex-row sm:items-end justify-between gap-2">
                    <div>
                      <h1 className="text-lg font-black tracking-wide text-black">
                        ใบจัดคิวรถ
                      </h1>
                      <p className="text-xs font-bold text-black">
                        บริษัท บอส คอมพิวเทค แอนด์ เซอร์วิส จำกัด — ตารางจัดคิววิ่งงานประจำวัน
                      </p>
                    </div>
                    <div className="text-left sm:text-right text-xs font-mono font-bold space-y-0.5">
                      <div>วันที่: {formatThaiSheetDate(targetDate)}</div>
                      <div>รวมทั้งหมด: {visibleBlocks.length} ชุดช่าง / {totalJobs} งาน</div>
                    </div>
                  </div>
                </th>
              </tr>
              <tr className="bg-slate-100">
                <th className="border border-black px-1.5 py-1.5 text-center w-10">ลำดับ</th>
                <th className="border border-black px-2 py-1.5 text-left w-20">อำเภอ</th>
                <th className="border border-black px-2 py-1.5 text-left w-36">ชื่อลูกค้า</th>
                <th className="border border-black px-2 py-1.5 text-left">อุปกรณ์ / อาการ</th>
                <th className="border border-black px-2 py-1.5 text-right w-20">ยอดเงิน</th>
                <th className="border border-black px-1.5 py-1.5 text-center w-24">วันที่ ORDER / รับซ่อม</th>
                <th className="border border-black px-1.5 py-1.5 text-center w-20">วันที่เสร็จ</th>
                <th className="border border-black px-1.5 py-1.5 text-center w-24">วันที่นัดติดตั้ง</th>
                <th className="border border-black px-2 py-1.5 text-left w-48">หมายเหตุ</th>
              </tr>
            </thead>
            {visibleBlocks.length === 0 ? (
              <tbody>
                <tr>
                  <td colSpan={9} className="border border-black p-6 text-center text-xs font-semibold">
                    ยังไม่มีงานที่ลงตารางวิ่งงานสำหรับวันที่ {formatThaiSheetDate(targetDate)}
                  </td>
                </tr>
              </tbody>
            ) : visibleBlocks.map(block => (
              <tbody key={block.teamKey}>
                <tr className="print:break-after-avoid">
                  <th colSpan={9} scope="rowgroup" className="pt-2 text-left">
                    <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-200 border border-black px-3 py-1.5 text-xs font-extrabold">
                      <div>
                        ช่าง: <span className="underline">{block.techLabel}</span> ({block.rows.length} งาน)
                      </div>
                      <div className="flex items-center gap-2">
                        <span>ทะเบียนรถ:</span>
                        {!readOnly && onUpdateVehiclePlate ? (
                          <>
                            <select
                              value={VEHICLE_PRESETS.includes(block.vehiclePlate) ? block.vehiclePlate : '__custom__'}
                              onChange={(e) => {
                                if (e.target.value !== '__custom__') {
                                  onUpdateVehiclePlate(block.teamKey, e.target.value);
                                }
                              }}
                              className="no-print px-2 py-0.5 rounded border border-slate-400 bg-white text-black font-mono text-xs"
                            >
                              {VEHICLE_PRESETS.map(p => (
                                <option key={p} value={p}>{p}</option>
                              ))}
                              {!VEHICLE_PRESETS.includes(block.vehiclePlate) && (
                                <option value="__custom__">{block.vehiclePlate}</option>
                              )}
                            </select>
                            <input
                              type="text"
                              value={block.vehiclePlate}
                              onChange={(e) => onUpdateVehiclePlate(block.teamKey, e.target.value)}
                              className="no-print w-20 px-2 py-0.5 rounded border border-slate-400 bg-white text-black font-mono text-xs"
                            />
                            <span className="hidden print:inline font-mono">{block.vehiclePlate}</span>
                          </>
                        ) : (
                          <span className="font-mono">{block.vehiclePlate}</span>
                        )}
                      </div>
                    </div>
                  </th>
                </tr>
                {block.rows.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="border border-black px-3 py-4 text-center text-[11px]">
                      ยังไม่มีงานในชุดช่างนี้
                    </td>
                  </tr>
                ) : (
                  block.rows.map((row, idx) => {
                    const noteKey = `${targetDate}:${row.id}`;
                    const printNote = printNotes[noteKey] || '';
                    return (
                      <tr key={row.id} className="align-top print:break-inside-avoid">
                        <td className="border border-black px-1.5 py-1.5 text-center font-mono font-bold">{idx + 1}</td>
                        <td className="border border-black px-2 py-1.5 font-semibold">{row.district}</td>
                        <td className="border border-black px-2 py-1.5">
                          <div className="font-bold">{row.customerName}</div>
                          {row.customerPhone && <div className="text-[10px] font-mono">{row.customerPhone}</div>}
                        </td>
                        <td className="border border-black px-2 py-1.5 whitespace-pre-line break-words">{row.equipmentOrSymptom}</td>
                        <td className="border border-black px-2 py-1.5 text-right font-mono font-bold">{fmtAmount(row.amount)}</td>
                        <td className="border border-black px-1.5 py-1.5 text-center font-mono">{row.orderOrIntakeDate}</td>
                        <td className="border border-black px-1.5 py-1.5 text-center font-mono">{row.completedDate}</td>
                        <td className="border border-black px-1.5 py-1.5 text-center font-mono font-bold">{row.scheduledInstallDate}</td>
                        <td className="border border-black px-2 py-1.5">
                          <span className="inline-block px-1 border border-black text-[9px] font-bold mr-1">
                            {row.tag}
                          </span>
                          {row.notes !== '-' && <span>{row.notes}</span>}
                          {printNote.trim() && (
                            <p className="hidden whitespace-pre-wrap break-words print:block">{printNote.trim()}</p>
                          )}
                          {!readOnly && (
                            <textarea
                              aria-label={`หมายเหตุเพิ่มเติมสำหรับ ${row.customerName} งานที่ ${idx + 1}`}
                              placeholder="เพิ่มหมายเหตุสำหรับใบพิมพ์"
                              rows={2}
                              value={printNote}
                              onChange={event => {
                                const value = event.target.value;
                                setPrintNotes(previous => ({ ...previous, [noteKey]: value }));
                              }}
                              className="no-print mt-1 block min-h-11 w-full rounded border border-slate-400 bg-white p-1.5 text-black placeholder:text-slate-600 focus-visible:outline-2 focus-visible:outline-orange-600"
                            />
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            ))}
          </table>
        </div>
      </div>
    </ModalBackdrop>,
    document.body
  );
};
