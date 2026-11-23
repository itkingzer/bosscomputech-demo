import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useApp } from '../context/AppContext';
import {
  Wrench, Truck, PackageCheck, PhoneCall, Plus, Search, Printer,
  MapPin, Phone, User, CheckCircle2, ScanLine,
  Package, RotateCcw, ClipboardList, ArrowRight, AlertCircle,
  Building2, Hash, Check, ChevronRight, FileText, Store, Send, X, Calendar
} from 'lucide-react';
import {
  Modal, modalInputClass, modalLabelClass,
  modalPrimaryBtnClass, modalSecondaryBtnClass
} from './ui/Modal';
import {
  RepairTicket, RepairLifecycleStatus, REPAIR_LIFECYCLE_META,
  ROUTE_DEFINITIONS, RouteCode, getRouteByDistrict, getElapsedDays,
  formatDateDMY, formatThaiDateTime, JobCategory,
  getDeliveryUrgency, DeliveryUrgencyInfo,
  getProjectDeadlineRisk, getLocalDateStr, Project, SiteVisitItemRef, Item
} from '../types';
import { ListControls, useListControls } from './ListControls';
import { ActivityTimeline, LatestUpdateBadge } from './ActivityTimeline';
import { EvidencePhotoUploader } from './EvidencePhotoUploader';
import { ToastBanner } from './ui/ToastBanner';
import { RepairReceiptPrintModal } from './RepairReceiptPrintModal';
import { RepairIntakeModal } from './RepairIntakeModal';
import { OnsiteDailyReportPrintModal, OnsiteCompletedReportRow } from './OnsiteDailyReportPrintModal';
import { MorningBriefingPrintModal, MorningBriefingRow } from './MorningBriefingPrintModal';
import { OnsiteDispatchRosterModal } from './OnsiteDispatchRosterModal';
import { toTelHref } from '../utils/domainHelpers';

// ---------------------------------------------------------------------------
// Static option data
// ---------------------------------------------------------------------------
const DISTRICT_OPTIONS = [
  { district: 'พุนพิน', zone: 'สาย 1 (โซนเหนือ)' },
  { district: 'ท่าฉาง', zone: 'สาย 1 (โซนเหนือ)' },
  { district: 'ไชยา', zone: 'สาย 1 (โซนเหนือ)' },
  { district: 'ท่าชนะ', zone: 'สาย 1 (โซนเหนือ)' },
  { district: 'คีรีรัฐนิคม', zone: 'สาย 2 (โซนตะวันตก)' },
  { district: 'บ้านตาขุน', zone: 'สาย 2 (โซนตะวันตก)' },
  { district: 'พนม', zone: 'สาย 2 (โซนตะวันตก)' },
  { district: 'บ้านนาเดิม', zone: 'สาย 3 (โซนใต้)' },
  { district: 'บ้านนาสาร', zone: 'สาย 3 (โซนใต้)' },
  { district: 'เวียงสระ', zone: 'สาย 3 (โซนใต้)' },
  { district: 'พระแสง', zone: 'สาย 3 (โซนใต้)' },
  { district: 'กาญจนดิษฐ์', zone: 'สาย 4 (โซนตะวันออก)' },
  { district: 'ดอนสัก', zone: 'สาย 4 (โซนตะวันออก)' },
  { district: 'ขนอม', zone: 'สาย 4 (โซนตะวันออก)' },
  { district: 'เมืองสุราษฎร์ธานี', zone: 'สาย 5 (ในเมือง / รอบเมือง)' },
  { district: 'ต่างจังหวัด / งานเหมาพิเศษ', zone: 'สาย 6 (ต่างจังหวัด / ชั่วคราว)' }
];

// Quick-select job categories for onsite service calls
interface JobPreset {
  id: string;
  label: string;
  jobCategory: JobCategory;
  defaultSymptom: string;
  icon: React.ReactNode;
}
const JOB_PRESETS: JobPreset[] = [
  {
    id: 'cctv',
    label: 'ซ่อม/เช็กกล้อง CCTV',
    jobCategory: 'installation',
    defaultSymptom: 'กล้อง CCTV ไม่แสดงภาพ / ภาพขาดหาย ต้องการให้เข้าตรวจเช็กหน้างาน',
    icon: <ScanLine className="w-4 h-4" />
  },
  {
    id: 'network',
    label: 'แก้ไขระบบเน็ตเวิร์ก/อินเทอร์เน็ต',
    jobCategory: 'installation',
    defaultSymptom: 'ระบบเน็ตเวิร์ก/อินเทอร์เน็ตใช้งานไม่ได้ ต้องการให้เข้าตรวจแก้ไขหน้างาน',
    icon: <Building2 className="w-4 h-4" />
  },
  {
    id: 'pickup',
    label: 'ไปรับเครื่องลูกค้ากลับมาซ่อมที่ร้าน',
    jobCategory: 'repair_pickup',
    defaultSymptom: 'ลูกค้าแจ้งเครื่องมีปัญหา ต้องการให้ช่างไปรับเครื่องกลับมาซ่อมที่ร้าน',
    icon: <Package className="w-4 h-4" />
  },
  {
    id: 'general',
    label: 'ตรวจเช็ก/ซ่อมหน้างานทั่วไป',
    jobCategory: 'repair_pickup',
    defaultSymptom: 'ต้องการให้ช่างเข้าตรวจเช็ก/ซ่อมอุปกรณ์หน้างาน',
    icon: <Wrench className="w-4 h-4" />
  }
];

// ---------------------------------------------------------------------------
// Shared UI helpers
// ---------------------------------------------------------------------------
const ACCENT_RING: Record<string, string> = {
  emerald: 'border-l-emerald-500',
  purple: 'border-l-purple-500',
  amber: 'border-l-amber-500',
  blue: 'border-l-blue-500',
  rose: 'border-l-rose-500',
  sky: 'border-l-sky-500'
};

interface TechOption {
  name: string;
  activeCount: number;
}

const TechCheckboxList: React.FC<{
  options: TechOption[];
  selected: string[];
  onToggle: (name: string) => void;
}> = ({ options, selected, onToggle }) => {
  if (options.length === 0) {
    return (
      <p className="text-xs text-slate-500 dark:text-slate-400 italic">
        ยังไม่มีช่าง Onsite ในระบบ
      </p>
    );
  }
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      {options.map(opt => {
        const active = selected.includes(opt.name);
        return (
          <button
            key={opt.name}
            type="button"
            onClick={() => onToggle(opt.name)}
            className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl border text-left transition-all active:scale-[0.97] min-h-[44px] ${active
              ? 'bg-[#FF6B00]/10 border-[#FF6B00]/50 text-slate-900 dark:text-white'
              : 'bg-white dark:bg-white/[0.03] border-slate-200 dark:border-white/[0.08] text-slate-600 dark:text-slate-300 hover:border-slate-300 dark:hover:border-white/20'
              }`}
          >
            <span
              className={`flex items-center justify-center w-5 h-5 rounded-md border shrink-0 ${active
                ? 'bg-[#FF6B00] border-[#FF6B00] text-white'
                : 'border-slate-300 dark:border-white/20'
                }`}
            >
              {active && <Check className="w-3.5 h-3.5" />}
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-sm font-semibold truncate">{opt.name}</span>
              <span className="block text-[11px] text-slate-500 dark:text-slate-400">
                งานค้าง {opt.activeCount} งาน
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
};

// Uniform compact card -> opens a modal
interface CompactCardProps {
  accent: keyof typeof ACCENT_RING;
  idLabel: string;
  title: string;
  subtitle?: string;
  phone?: string | null;
  routeCode?: RouteCode | null;
  itemSummary?: string;
  statusBadge?: React.ReactNode;
  meta?: React.ReactNode;
  cardHighlightClass?: string;
  actionLabel: string;
  actionIcon?: React.ReactNode;
  onOpen: () => void;
}

const CompactCard: React.FC<CompactCardProps> = ({
  accent, idLabel, title, subtitle, phone, routeCode, itemSummary,
  statusBadge, meta, cardHighlightClass, actionLabel, actionIcon, onOpen
}) => {
  const routeMeta = routeCode ? ROUTE_DEFINITIONS[routeCode] : null;
  return (
    <div
      className={`rounded-2xl border border-l-4 ${ACCENT_RING[accent]} ${cardHighlightClass || 'border-slate-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.03]'} p-3.5 sm:p-4 flex flex-col gap-2.5 transition-shadow hover:shadow-md`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] font-mono font-bold text-slate-500 dark:text-slate-400">
              {idLabel}
            </span>
            {routeMeta && (
              <span
                className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md border ${routeMeta.badgeBg} ${routeMeta.badgeBorder} ${routeMeta.badgeText}`}
              >
                {routeMeta.shortName}
              </span>
            )}
          </div>
          <h4 className="mt-1 text-sm sm:text-base font-bold text-slate-900 dark:text-white truncate">
            {title}
          </h4>
          {subtitle && (
            <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{subtitle}</p>
          )}
        </div>
        {statusBadge}
      </div>

      {phone && (
        <div className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
          <Phone className="w-3.5 h-3.5 shrink-0" />
          <span className="font-medium">{phone}</span>
        </div>
      )}

      {itemSummary && (
        <div className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
          <Package className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">{itemSummary}</span>
        </div>
      )}

      {meta}

      <button
        type="button"
        onClick={onOpen}
        className="mt-1 inline-flex items-center justify-center gap-1.5 w-full px-3 py-2.5 rounded-xl bg-slate-100 dark:bg-white/[0.06] hover:bg-[#FF6B00] hover:text-white text-slate-700 dark:text-slate-200 text-sm font-bold transition-colors active:scale-[0.97] min-h-[44px]"
      >
        {actionIcon}
        {actionLabel}
        <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  );
};

const QueueSection: React.FC<{
  icon: React.ReactNode;
  title: string;
  count: number;
  accent: keyof typeof ACCENT_RING;
  emptyText: string;
  children: React.ReactNode;
}> = ({ icon, title, count, accent, emptyText, children }) => (
  <section className="rounded-3xl border border-slate-200 dark:border-white/[0.08] bg-slate-50/60 dark:bg-white/[0.02] p-4 sm:p-5">
    <div className="flex items-center gap-2.5 mb-3">
      <span
        className={`flex items-center justify-center w-9 h-9 rounded-xl border-l-4 ${ACCENT_RING[accent]} bg-white dark:bg-white/[0.05] text-slate-700 dark:text-slate-200`}
      >
        {icon}
      </span>
      <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white flex-1">
        {title}
      </h3>
      <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-slate-200 dark:bg-white/[0.08] text-slate-600 dark:text-slate-300">
        {count}
      </span>
    </div>
    {count === 0 ? (
      <p className="text-xs text-slate-400 dark:text-slate-500 italic py-3 text-center">{emptyText}</p>
    ) : (
      children
    )}
  </section>
);

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
type TabId = 'counter' | 'scheduler' | 'prep_ready' | 'tracker' | 'onsite_summary';

const toLocalDateKey = (iso?: string | null): string => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

export const FrontdeskView: React.FC = () => {
  const {
    currentUser, users, orders, items, repairTickets, projects,
    createOnsiteServiceCall,
    assignOnsite, confirmCustomerPickup, updateOrderRoute,
    selfPickupRepairTicket, dispatchRepairReturnOnsite, queueRepairTicketForDispatch,
    updateOrderDeliveryDate, updateRepairTicketDueDate,
    scheduleSiteVisit,
    scheduleItemDispatch, unscheduleItemDispatch,
    scheduleRepairDispatch, unscheduleRepairDispatch, removeSiteVisit
  } = useApp();

  const [activeTab, setActiveTab] = useState<TabId>('counter');
  const [printModalTicket, setPrintModalTicket] = useState<RepairTicket | null>(null);
  const [toast, setToast] = useState('');
  const showToast = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(''), 3500);
  };

  const onsiteTechs = useMemo(
    () => users.filter(u => u.role === 'onsite' && u.is_active !== false),
    [users]
  );

  const getActiveJobCount = (techName: string): number => {
    const itemJobs = items.filter(
      i => i.status === 'assigned_onsite' &&
        (i.assigned_techs?.includes(techName) || i.assigned_onsite_tech === techName)
    ).length;
    const ticketJobs = repairTickets.filter(
      t => (t.status === 'open' || t.status === 'in_progress' || t.status === 'repaired') &&
        (t.assigned_techs?.includes(techName) || t.assigned_onsite_tech === techName)
    ).length;
    return itemJobs + ticketJobs;
  };

  const techOptions: TechOption[] = onsiteTechs.map(u => ({
    name: u.name,
    activeCount: getActiveJobCount(u.name)
  }));

  // =========================================================================
  // PILLAR 1A — Walk-in Repair Intake (shared RepairIntakeModal)
  // =========================================================================
  const [intakeOpen, setIntakeOpen] = useState(false);

  // =========================================================================
  // PILLAR 1B — Onsite Service / Pickup Call
  // =========================================================================
  const [onsiteOpen, setOnsiteOpen] = useState(false);
  const [osPreset, setOsPreset] = useState<string>('cctv');
  const [osName, setOsName] = useState('');
  const [osPhone, setOsPhone] = useState('');
  const [osAddress, setOsAddress] = useState('');
  const [osDevice, setOsDevice] = useState('');
  const [osSymptom, setOsSymptom] = useState('');
  const [osDistrict, setOsDistrict] = useState('เมืองสุราษฎร์ธานี');
  const [osTechs, setOsTechs] = useState<string[]>([]);

  const resetOnsite = () => {
    setOsPreset('cctv'); setOsName(''); setOsPhone(''); setOsAddress('');
    setOsDevice(''); setOsSymptom(''); setOsDistrict('เมืองสุราษฎร์ธานี'); setOsTechs([]);
  };

  const toggleOsTech = (name: string) => {
    setOsTechs(prev => (prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name]));
  };

  const applyPreset = (presetId: string) => {
    setOsPreset(presetId);
    const preset = JOB_PRESETS.find(p => p.id === presetId);
    if (preset && !osSymptom.trim()) setOsSymptom(preset.defaultSymptom);
  };

  const submitOnsite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!osName.trim() || !osSymptom.trim()) {
      showToast('กรุณากรอกชื่อลูกค้าและรายละเอียดงาน');
      return;
    }
    if (osTechs.length === 0) {
      showToast('กรุณาเลือกช่าง Onsite อย่างน้อย 1 คน');
      return;
    }
    const preset = JOB_PRESETS.find(p => p.id === osPreset);
    await createOnsiteServiceCall({
      customer_name: osName.trim(),
      customer_phone: osPhone.trim() || undefined,
      district: osDistrict,
      delivery_location: osAddress.trim() || undefined,
      device_model: osDevice.trim() || undefined,
      fault_symptom: osSymptom.trim(),
      job_category: preset?.jobCategory || 'repair_pickup',
      assigned_techs: osTechs
    });
    setOnsiteOpen(false);
    resetOnsite();
    showToast('รับแจ้งเหตุและมอบหมายช่าง Onsite เรียบร้อยแล้ว');
  };

  // =========================================================================
  // PILLAR 2A — Prepared Orders & Repair Return Dispatch
  // (หน้าร้านไม่มีสิทธิ์แปะวอย — แสดงและจัดส่งเฉพาะของที่ช่างเตรียมติดวอยแล้ว ready_for_dispatch)
  // =========================================================================
  const readyItems = useMemo(
    () => items.filter(i => {
      if (i.status !== 'ready_for_dispatch') return false;
      const ord = i.order_id ? orders.find(o => o.id === i.order_id) : null;
      return ord?.delivery_mode !== 'customer_pickup';
    }),
    [items, orders]
  );

  // ของพร้อมปล่อยจากห้องช่างเตรียม (รวมทั้งติดวอยพร้อมปล่อยแล้ว และเทสเสร็จรอช่างเตรียมแปะวอย)
  const [prepOverviewFilter, setPrepOverviewFilter] = useState<'all' | 'ready' | 'pending_void'>('all');
  const prepReadyOverviewItems = useMemo(
    () => items.filter(i => i.status === 'ready_for_dispatch' || i.status === 'prepped_in_stock'),
    [items]
  );
  const filteredPrepOverviewItems = useMemo(() => {
    if (prepOverviewFilter === 'ready') return prepReadyOverviewItems.filter(i => i.status === 'ready_for_dispatch');
    if (prepOverviewFilter === 'pending_void') return prepReadyOverviewItems.filter(i => i.status === 'prepped_in_stock');
    return prepReadyOverviewItems;
  }, [prepReadyOverviewItems, prepOverviewFilter]);

  const awaitingDispatchTickets = useMemo(
    () => repairTickets.filter(t => t.status === 'awaiting_dispatch'),
    [repairTickets]
  );

  const [dispatchSearch, setDispatchSearch] = useState('');
  const [dispatchRouteFilter, setDispatchRouteFilter] = useState<'all' | RouteCode>('all');
  const [dispatchTarget, setDispatchTarget] = useState<
    { type: 'item'; itemId: string } | { type: 'repair'; ticketId: string } | null
  >(null);
  const [dispatchDueDate, setDispatchDueDate] = useState('');
  const [dispatchRoute, setDispatchRoute] = useState<RouteCode>('route_5');
  const [dispatchTechs, setDispatchTechs] = useState<string[]>([]);

  const dispatchItem = dispatchTarget?.type === 'item' ? items.find(i => i.id === dispatchTarget.itemId) : null;
  const dispatchOrder = dispatchItem?.order_id ? orders.find(o => o.id === dispatchItem.order_id) : null;

  const dispatchTicket = dispatchTarget?.type === 'repair' ? repairTickets.find(t => t.id === dispatchTarget.ticketId) : null;

  const openDispatch = (itemId: string) => {
    const it = items.find(i => i.id === itemId);
    const ord = it?.order_id ? orders.find(o => o.id === it.order_id) : null;
    setDispatchTarget({ type: 'item', itemId });
    setDispatchDueDate(ord?.delivery_date || '');
    setDispatchRoute(ord?.route_code || (ord?.district ? getRouteByDistrict(ord.district) : 'route_5'));
    setDispatchTechs([]);
  };

  const openDispatchTicket = (ticketId: string) => {
    const t = repairTickets.find(x => x.id === ticketId);
    setDispatchTarget({ type: 'repair', ticketId });
    setDispatchDueDate(t?.due_date || '');
    setDispatchRoute(t?.route_code || (t?.district ? getRouteByDistrict(t.district) : 'route_5'));
    setDispatchTechs(t?.assigned_techs || []);
  };

  const toggleDispatchTech = (name: string) => {
    setDispatchTechs(prev => (prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name]));
  };

  const saveDispatchScheduleOnly = async () => {
    if (!dispatchTarget) return;
    if (dispatchTarget.type === 'item' && dispatchOrder) {
      if (dispatchDueDate !== (dispatchOrder.delivery_date || '')) {
        await updateOrderDeliveryDate(dispatchOrder.id, dispatchDueDate);
      }
      if (dispatchRoute !== dispatchOrder.route_code) {
        await updateOrderRoute(dispatchOrder.id, dispatchRoute);
      }
      setDispatchTarget(null);
      showToast('บันทึกวันกำหนดส่งและสายรถใหม่เรียบร้อยแล้ว');
    } else if (dispatchTarget.type === 'repair' && dispatchTicket) {
      if (dispatchDueDate !== (dispatchTicket.due_date || '')) {
        await updateRepairTicketDueDate(dispatchTicket.id, dispatchDueDate);
      }
      setDispatchTarget(null);
      showToast('บันทึกวันนัดส่งคืนเรียบร้อยแล้ว');
    }
  };

  const confirmDispatch = async () => {
    if (!dispatchTarget) return;
    if (dispatchTechs.length === 0) {
      showToast('กรุณาเลือกช่าง Onsite อย่างน้อย 1 คน');
      return;
    }

    if (dispatchTarget.type === 'item') {
      if (!dispatchItem) return;
      if (dispatchOrder && dispatchDueDate !== (dispatchOrder.delivery_date || '')) {
        await updateOrderDeliveryDate(dispatchOrder.id, dispatchDueDate);
      }
      if (dispatchOrder && dispatchRoute !== dispatchOrder.route_code) {
        await updateOrderRoute(dispatchOrder.id, dispatchRoute);
      }
      await assignOnsite(dispatchItem.id, dispatchTechs, 'delivery');
      setDispatchTarget(null);
      showToast('จัดสายรถและมอบหมายช่างส่งมอบเรียบร้อยแล้ว');
    } else if (dispatchTarget.type === 'repair') {
      if (!dispatchTicket) return;
      if (dispatchDueDate !== (dispatchTicket.due_date || '')) {
        await updateRepairTicketDueDate(dispatchTicket.id, dispatchDueDate);
      }
      await dispatchRepairReturnOnsite(dispatchTicket.id, dispatchTechs, dispatchRoute);
      setDispatchTarget(null);
      showToast('จัดสายรถและมอบหมายช่าง Onsite นำเครื่องส่งคืนลูกค้าเรียบร้อยแล้ว');
    }
  };

  type DispatchEntry =
    | { kind: 'item'; id: string; item: (typeof readyItems)[number]; ord: ReturnType<typeof orders.find>; urgency: DeliveryUrgencyInfo; createdAt: string }
    | { kind: 'repair'; id: string; ticket: (typeof awaitingDispatchTickets)[number]; urgency: DeliveryUrgencyInfo; createdAt: string };

  const sortedDispatchEntries = useMemo<DispatchEntry[]>(() => {
    const q = dispatchSearch.trim().toLowerCase();
    const list: DispatchEntry[] = [];

    readyItems.forEach((item) => {
      const ord = item.order_id ? orders.find(o => o.id === item.order_id) : undefined;
      const routeCode = ord?.route_code || (ord?.district ? getRouteByDistrict(ord.district) : 'route_5');
      if (dispatchRouteFilter !== 'all' && routeCode !== dispatchRouteFilter) return;
      const rMeta = ROUTE_DEFINITIONS[routeCode];
      const hay = [
        ord?.customer_name,
        item.model_name,
        ord?.sales_ref,
        ord?.bill_no,
        item.serial_number,
        item.id,
        ord?.district,
        rMeta?.shortName,
        rMeta?.name
      ].filter(Boolean).join(' ').toLowerCase();
      if (q && !hay.includes(q)) return;
      list.push({
        kind: 'item',
        id: `item-${item.id}`,
        item,
        ord,
        urgency: getDeliveryUrgency(ord?.delivery_date),
        createdAt: item.created_at
      });
    });

    awaitingDispatchTickets.forEach((ticket) => {
      const routeCode = ticket.route_code || (ticket.district ? getRouteByDistrict(ticket.district) : 'route_5');
      if (dispatchRouteFilter !== 'all' && routeCode !== dispatchRouteFilter) return;
      const rMeta = ROUTE_DEFINITIONS[routeCode];
      const hay = [
        ticket.customer_name,
        ticket.device_model,
        ticket.ticket_no,
        ticket.walkin_sn,
        ticket.district,
        rMeta?.shortName,
        rMeta?.name
      ].filter(Boolean).join(' ').toLowerCase();
      if (q && !hay.includes(q)) return;
      list.push({
        kind: 'repair',
        id: `rep-${ticket.id}`,
        ticket,
        urgency: getDeliveryUrgency(ticket.due_date),
        createdAt: ticket.created_at
      });
    });

    list.sort((a, b) => a.urgency.daysRemaining - b.urgency.daysRemaining);
    return list;
  }, [readyItems, awaitingDispatchTickets, orders, dispatchSearch, dispatchRouteFilter]);

  const dispatchList = useListControls(sortedDispatchEntries, {
    getValue: (e) => e.urgency.daysRemaining,
    getDate: (e) => e.createdAt,
    initialSort: 'low',
    initialPageSize: 10
  });

  const renderUrgencyAlert = (urgency: DeliveryUrgencyInfo) => {
    if (!urgency.hasDate) return null;
    if (urgency.tier === 'overdue') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-rose-600 text-white dark:bg-rose-500 dark:text-white shadow-sm">
          ⚠️ เลยกำหนดส่ง {urgency.overdueDays} วัน! ({urgency.formattedDate})
        </span>
      );
    }
    if (urgency.tier === 'today') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-rose-600 text-white dark:bg-orange-500 dark:text-slate-950 shadow-sm">
          <span className="w-1.5 h-1.5 rounded-full bg-white dark:bg-slate-950 animate-ping" />
          🔥 กำหนดส่งวันนี้! ({urgency.formattedDate})
        </span>
      );
    }
    if (urgency.tier === 'soon') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-500 text-slate-950 dark:bg-amber-400 dark:text-slate-950 shadow-sm">
          ⏰ ใกล้วันกำหนดส่ง (อีก {urgency.daysRemaining} วัน - {urgency.formattedDate})
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-700 dark:bg-white/[0.08] dark:text-slate-300 border border-slate-200 dark:border-white/10">
        กำหนดส่ง: {urgency.formattedDate}
      </span>
    );
  };

  const getUrgencyCardHighlight = (urgency: DeliveryUrgencyInfo): string | undefined => {
    if (urgency.tier === 'overdue' || urgency.tier === 'today') {
      return 'border-rose-500/60 dark:border-rose-500/50 bg-rose-500/[0.04] dark:bg-rose-500/[0.06]';
    }
    if (urgency.tier === 'soon') {
      return 'border-amber-500/60 dark:border-amber-500/50 bg-amber-500/[0.04] dark:bg-amber-500/[0.06]';
    }
    return undefined;
  };

  // =========================================================================
  // PILLAR 2B — Self-Pickup Orders
  // =========================================================================
  const pickupItems = useMemo(
    () => items.filter(i => {
      if (i.status !== 'ready_for_dispatch') return false;
      const ord = i.order_id ? orders.find(o => o.id === i.order_id) : null;
      return ord?.delivery_mode === 'customer_pickup';
    }),
    [items, orders]
  );

  const [pickupItemId, setPickupItemId] = useState<string | null>(null);
  const pickupItem = pickupItemId ? items.find(i => i.id === pickupItemId) : null;
  const pickupOrder = pickupItem?.order_id ? orders.find(o => o.id === pickupItem.order_id) : null;

  const openPickup = (itemId: string) => {
    setPickupItemId(itemId);
  };

  const confirmPickup = async () => {
    if (!pickupItem) return;
    await confirmCustomerPickup(pickupItem.id);
    setPickupItemId(null);
    showToast('ยืนยันรับสินค้าและปิดงานเรียบร้อยแล้ว');
  };

  // =========================================================================
  // PILLAR 3 — Repair & RMA Tracker
  // =========================================================================
  const [trackerSearch, setTrackerSearch] = useState('');
  const [trackerFilter, setTrackerFilter] = useState<'active' | 'ready' | 'all'>('active');

  // งานที่ช่างซ่อมส่งคืนหน้าร้านแล้ว (ready_pickup) — รอหน้าร้านโทรตามลูกค้า พิมพ์ใบรับ & ปิดงาน
  const pickupReadyTickets = useMemo(
    () => repairTickets.filter(t => {
      const lifecycle = t.repair_status || 'pending_check';
      return lifecycle === 'ready_pickup' && t.status !== 'returned_closed' && !t.delivered_at;
    }),
    [repairTickets]
  );

  const activeRepairTickets = useMemo(() => {
    return repairTickets.filter(t => {
      const lifecycle = t.repair_status || 'pending_check';
      if (lifecycle === 'completed' || t.status === 'returned_closed') return false;
      if (trackerFilter === 'ready' && lifecycle !== 'ready_pickup') return false;
      if (trackerFilter === 'active' && lifecycle === 'ready_pickup') return false;
      if (trackerSearch.trim()) {
        const q = trackerSearch.trim().toLowerCase();
        const hay = `${t.customer_name} ${t.customer_phone || ''} ${t.device_model || ''} ${t.ticket_no} ${t.walkin_sn}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [repairTickets, trackerFilter, trackerSearch]);

  const trackerList = useListControls(activeRepairTickets, {
    getDate: (t) => t.created_at,
    initialSort: 'newest'
  });

  const prepReadyOverviewList = useListControls(filteredPrepOverviewItems, {
    getDate: (i) => i.warranty_applied_at || i.prepped_at || i.created_at,
    initialSort: 'newest',
    initialPageSize: 10
  });

  const pickupReadyList = useListControls(pickupReadyTickets, {
    getDate: (t) => t.finished_at || t.updated_at || t.created_at,
    initialSort: 'newest',
    initialPageSize: 10
  });

  const pickupItemsList = useListControls(pickupItems, {
    getDate: (i) => i.warranty_applied_at || i.prepped_at || i.created_at,
    initialSort: 'newest',
    initialPageSize: 10
  });

  // =========================================================================
  // PILLAR 4 — Onsite Completed Summary & Project Progress
  // =========================================================================
  const todayDateKey = toLocalDateKey(new Date().toISOString());
  const [reportDate, setReportDate] = useState<string>(todayDateKey);
  const [reportShowAllDates, setReportShowAllDates] = useState(false);
  const [reportTechFilter, setReportTechFilter] = useState<string>('all');
  const [onsiteReportPrintOpen, setOnsiteReportPrintOpen] = useState(false);

  const onsiteCompletedJobs = useMemo<OnsiteCompletedReportRow[]>(() => {
    const rows: OnsiteCompletedReportRow[] = [];

    items.forEach((it) => {
      if (it.status !== 'delivered' || !it.delivered_at) return;
      const techs =
        it.assigned_techs && it.assigned_techs.length > 0
          ? it.assigned_techs
          : it.assigned_onsite_tech
            ? [it.assigned_onsite_tech]
            : [];
      const ord = it.order_id ? orders.find((o) => o.id === it.order_id) : null;
      if (techs.length === 0 && ord?.delivery_mode === 'customer_pickup') return;
      if (techs.length === 0) return;

      rows.push({
        id: `itm-${it.id}`,
        dateKey: toLocalDateKey(it.delivered_at),
        kind: 'ส่งมอบสินค้า',
        refNo: ord?.sales_ref || it.serial_number || it.id,
        customerName: ord?.customer_name || 'ไม่ระบุลูกค้า',
        detail: `${it.model_name}${it.serial_number ? ` (S/N: ${it.serial_number})` : ''}`,
        techs,
        location: ord?.delivery_location || ord?.district || '-',
        completedAt: it.delivered_at
      });
    });

    repairTickets.forEach((t) => {
      const isClosed = t.status === 'returned_closed' || Boolean(t.delivered_at);
      if (!isClosed) return;
      if (t.returned_by === 'รับเองหน้าร้าน') return;
      const techs =
        t.assigned_techs && t.assigned_techs.length > 0
          ? t.assigned_techs
          : t.returned_by
            ? [t.returned_by]
            : t.received_channel === 'onsite_pickup' || t.received_channel === 'onsite_service_sheet'
              ? [t.received_by || 'ช่าง Onsite']
              : [];
      if (techs.length === 0) return;
      const completedAt = t.delivered_at || t.updated_at || t.created_at;
      rows.push({
        id: `rep-${t.id}`,
        dateKey: toLocalDateKey(completedAt),
        kind: t.is_repair_return ? 'ส่งคืนเครื่องซ่อม' : 'บริการ / รับเครื่อง Onsite',
        refNo: t.ticket_no,
        customerName: t.customer_name,
        detail: `${t.device_model || 'ไม่ระบุรุ่น'}${t.walkin_sn ? ` (S/N: ${t.walkin_sn})` : ''}`,
        techs,
        location: t.delivery_location || t.district || '-',
        completedAt
      });
    });

    projects.forEach((p) => {
      if (p.status !== 'completed' || !p.completed_at) return;
      rows.push({
        id: `prj-${p.id}`,
        dateKey: toLocalDateKey(p.completed_at),
        kind: 'ปิดงานโปรเจกต์',
        refNo: p.id,
        customerName: p.customer_name,
        detail: `${p.site_name} (100%)`,
        techs: p.assigned_techs || [],
        location: p.location || p.district || '-',
        completedAt: p.completed_at
      });
    });

    return rows.sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime());
  }, [items, orders, repairTickets, projects]);

  const todayOnsiteCount = useMemo(
    () => onsiteCompletedJobs.filter((j) => j.dateKey === todayDateKey).length,
    [onsiteCompletedJobs, todayDateKey]
  );

  const filteredOnsiteJobs = useMemo(() => {
    return onsiteCompletedJobs.filter((j) => {
      if (!reportShowAllDates && reportDate && j.dateKey !== reportDate) return false;
      if (reportTechFilter !== 'all' && !j.techs.includes(reportTechFilter)) return false;
      return true;
    });
  }, [onsiteCompletedJobs, reportShowAllDates, reportDate, reportTechFilter]);

  const onsiteJobsList = useListControls(filteredOnsiteJobs, {
    getDate: (j) => j.completedAt,
    initialSort: 'newest',
    initialPageSize: 10
  });

  // Sort projects by Deadline Risk urgency (critical/closest due_date first)
  const urgentSortedProjects = useMemo(
    () =>
      [...projects].sort(
        (a, b) =>
          getProjectDeadlineRisk(a.due_date, a.status).daysRemaining -
          getProjectDeadlineRisk(b.due_date, b.status).daysRemaining
      ),
    [projects]
  );

  const projectsProgressList = useListControls(urgentSortedProjects, {
    getDate: (p) => p.updated_at || p.created_at,
    initialSort: 'newest',
    initialPageSize: 10
  });

  // ---- 1-Day Advance Job & Route Scheduler State ----
  const [rosterDate, setRosterDate] = useState<string>(() => getLocalDateStr(1));
  const [morningBriefingOpen, setMorningBriefingOpen] = useState(false);
  const [dispatchRosterOpen, setDispatchRosterOpen] = useState(false);
  const [vehicleMap, setVehicleMap] = useState<Record<string, string>>(() => {
    try {
      const raw = localStorage.getItem('boss_dispatch_vehicles');
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });
  const [customTeamBlocks, setCustomTeamBlocks] = useState<{ teamKey: string; techs: string[]; vehiclePlate: string }[]>([]);
  const handleUpdateVehiclePlate = (teamKey: string, plate: string) => {
    setVehicleMap(prev => {
      const next = { ...prev, [teamKey]: plate };
      try { localStorage.setItem('boss_dispatch_vehicles', JSON.stringify(next)); } catch {}
      return next;
    });
  };
  const handleAddCustomTeamBlock = (techs: string[], vehiclePlate: string) => {
    const teamKey = techs.join('+');
    handleUpdateVehiclePlate(teamKey, vehiclePlate);
    setCustomTeamBlocks(prev => (prev.some(b => b.teamKey === teamKey) ? prev : [...prev, { teamKey, techs, vehiclePlate }]));
  };
  const [scheduleTarget, setScheduleTarget] = useState<
    | { kind: 'item'; item: Item; title: string; subtitle: string; defaultRoute: string }
    | { kind: 'repair'; ticket: RepairTicket; title: string; subtitle: string; defaultRoute: string }
    | null
  >(null);
  const [schedDate, setSchedDate] = useState<string>(() => getLocalDateStr(1));
  const [schedTimeSlot, setSchedTimeSlot] = useState<'เช้า' | 'บ่าย' | 'ทั้งวัน'>('ทั้งวัน');
  const ROUTE_ZONE_OPTIONS = Object.values(ROUTE_DEFINITIONS).map(r => r.name);
  const [schedRouteZone, setSchedRouteZone] = useState<string>(ROUTE_DEFINITIONS.route_5.name);
  const [schedTechs, setSchedTechs] = useState<string[]>([]);

  // Unscheduled Ready Pool: Sales/Project items in ready_for_dispatch (or assigned_onsite without scheduled_date)
  const unscheduledReadyItems = useMemo(() => {
    return items
      .filter(i => {
        if (i.status === 'ready_for_dispatch') return true;
        if (i.status === 'assigned_onsite' && !i.scheduled_date && !i.project_id) return true;
        return false;
      })
      .sort((a, b) => {
        const ordA = orders.find(o => o.id === a.order_id);
        const ordB = orders.find(o => o.id === b.order_id);
        const prjA = projects.find(p => p.id === a.project_id);
        const prjB = projects.find(p => p.id === b.project_id);
        const uA = getDeliveryUrgency(prjA?.due_date || ordA?.delivery_date).daysRemaining;
        const uB = getDeliveryUrgency(prjB?.due_date || ordB?.delivery_date).daysRemaining;
        return uA - uB;
      });
  }, [items, orders, projects]);

  // Unscheduled Ready Repairs: ready_pickup or awaiting_dispatch (not yet scheduled onto a date)
  const unscheduledReadyRepairs = useMemo(() => {
    return repairTickets
      .filter(t => {
        if (t.status === 'returned_closed' || t.repair_status === 'completed') return false;
        if (t.scheduled_date) return false;
        return t.repair_status === 'ready_pickup' || t.status === 'awaiting_dispatch' || (t.status === 'dispatched_onsite' && !t.scheduled_date);
      })
      .sort((a, b) => getDeliveryUrgency(a.due_date).daysRemaining - getDeliveryUrgency(b.due_date).daysRemaining);
  }, [repairTickets]);

  const [step1Page, setStep1Page] = useState(1);
  const STEP1_PAGE_SIZE = 4;
  const step1Combined = useMemo(
    () => [
      ...unscheduledReadyItems.map(it => ({ kind: 'item' as const, item: it })),
      ...unscheduledReadyRepairs.map(t => ({ kind: 'repair' as const, ticket: t }))
    ],
    [unscheduledReadyItems, unscheduledReadyRepairs]
  );
  const step1TotalPages = Math.max(1, Math.ceil(step1Combined.length / STEP1_PAGE_SIZE));
  const safeStep1Page = Math.min(step1Page, step1TotalPages);
  const step1Start = (safeStep1Page - 1) * STEP1_PAGE_SIZE;
  const step1PageEntries = step1Combined.slice(step1Start, step1Start + STEP1_PAGE_SIZE);

  // Daily Dispatch Roster for selected rosterDate (Items + Site Visits + Repairs)
  const dailyRosterItems = useMemo(
    () => items.filter(i => i.scheduled_date === rosterDate && i.status !== 'delivered'),
    [items, rosterDate]
  );
  const dailyRosterRepairs = useMemo(
    () => repairTickets.filter(t => t.scheduled_date === rosterDate && t.status !== 'returned_closed'),
    [repairTickets, rosterDate]
  );
  const dailyRosterVisits = useMemo(() => {
    const out: { project: Project; visit: NonNullable<Project['site_visits']>[number] }[] = [];
    projects.forEach(prj => {
      (prj.site_visits || []).forEach(sv => {
        if (sv.visit_date === rosterDate && sv.visit_status !== 'completed') {
          out.push({ project: prj, visit: sv });
        }
      });
    });
    return out;
  }, [projects, rosterDate]);

  const morningBriefingRows: MorningBriefingRow[] = useMemo(() => {
    const rows: MorningBriefingRow[] = [];
    dailyRosterItems.forEach(it => {
      const ord = orders.find(o => o.id === it.order_id);
      const prj = projects.find(p => p.id === it.project_id);
      rows.push({
        id: `item-${it.id}`,
        kindLabel: prj ? 'โปรเจกต์' : 'บิลขาย',
        routeZone: it.dispatch_route_zone || (ord?.route_code ? ROUTE_DEFINITIONS[ord.route_code].shortName : 'สาย 1 ในเมือง'),
        techs: it.assigned_techs || [],
        timeSlot: it.scheduled_time_slot || 'ทั้งวัน',
        refNo: prj ? prj.id : (ord?.bill_no || ord?.sales_ref || it.id),
        customerName: prj ? prj.customer_name : (ord?.customer_name || '-'),
        location: prj ? `${prj.site_name} (${prj.location})` : (ord?.delivery_location || '-'),
        detail: `${it.model_name}${it.serial_number ? ` (S/N: ${it.serial_number})` : ''}`,
        prepStatusLabel: it.void_date ? `พร้อมส่ง (วอย ${it.void_date})` : 'พร้อมส่ง',
        note: it.prep_note || ord?.site_notes
      });
    });
    dailyRosterVisits.forEach(({ project: prj, visit: sv }) => {
      rows.push({
        id: `visit-${sv.id}`,
        kindLabel: 'เข้าไซต์ PRJ',
        routeZone: prj.route_code ? ROUTE_DEFINITIONS[prj.route_code].shortName : 'สาย 1 ในเมือง',
        techs: sv.assigned_techs || [],
        timeSlot: sv.time_slot || 'ทั้งวัน',
        refNo: `${prj.id} (${sv.id})`,
        customerName: prj.customer_name,
        location: `${prj.site_name} — ${prj.location}`,
        detail: `${sv.visit_scope}${sv.items_to_take.length > 0 ? ` | เบิก: ${sv.items_to_take.map(x => `${x.name} x${x.qty}`).join(', ')}` : ''}`,
        prepStatusLabel: sv.prep_status === 'ready_for_pickup' ? 'ของพร้อมขึ้นรถ' : sv.prep_status === 'prepping' ? 'กำลังเทส/ติดวอย' : 'รอตัดสต๊อก'
      });
    });
    dailyRosterRepairs.forEach(t => {
      rows.push({
        id: `rep-${t.id}`,
        kindLabel: 'ส่งคืนซ่อม',
        routeZone: t.dispatch_route_zone || (t.route_code ? ROUTE_DEFINITIONS[t.route_code].shortName : 'สาย 1 ในเมือง'),
        techs: t.assigned_techs || [],
        timeSlot: t.scheduled_time_slot || 'ทั้งวัน',
        refNo: t.ticket_no,
        customerName: t.customer_name,
        location: t.delivery_location || t.district || '-',
        detail: `${t.device_model || 'เครื่องซ่อม'} (S/N: ${t.walkin_sn || '-'})`,
        prepStatusLabel: 'ซ่อมเสร็จพร้อมส่งคืน',
        note: t.repair_detail || undefined
      });
    });
    return rows;
  }, [dailyRosterItems, dailyRosterVisits, dailyRosterRepairs, orders, projects]);

  const openScheduleJobModal = (
    target:
      | { kind: 'item'; item: Item; title: string; subtitle: string; defaultRoute: string }
      | { kind: 'repair'; ticket: RepairTicket; title: string; subtitle: string; defaultRoute: string }
  ) => {
    setScheduleTarget(target);
    setSchedDate(rosterDate || getLocalDateStr(1));
    setSchedTimeSlot('ทั้งวัน');
    let autoRoute = target.defaultRoute;
    if (target.kind === 'repair') {
      const rc = target.ticket.route_code || getRouteByDistrict(target.ticket.district || '');
      autoRoute = ROUTE_DEFINITIONS[rc]?.name || ROUTE_DEFINITIONS.route_5.name;
    } else {
      const ord = orders.find(o => o.id === target.item.order_id);
      const prj = projects.find(p => p.id === target.item.project_id);
      const dist = prj?.district || ord?.district || '';
      const rc = ord?.route_code || (dist ? getRouteByDistrict(dist) : 'route_5');
      autoRoute = ROUTE_DEFINITIONS[rc]?.name || ROUTE_DEFINITIONS.route_5.name;
    }
    setSchedRouteZone(ROUTE_ZONE_OPTIONS.includes(autoRoute) ? autoRoute : ROUTE_DEFINITIONS.route_5.name);
    setSchedTechs([]);
  };

  const handleConfirmScheduleJob = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scheduleTarget) return;
    if (schedTechs.length === 0) {
      alert('กรุณาเลือกช่าง Onsite อย่างน้อย 1 คน');
      return;
    }
    if (scheduleTarget.kind === 'item') {
      await scheduleItemDispatch(scheduleTarget.item.id, {
        scheduled_date: schedDate,
        scheduled_time_slot: schedTimeSlot,
        dispatch_route_zone: schedRouteZone,
        assigned_techs: schedTechs,
        job_category: scheduleTarget.item.project_id ? 'installation' : 'delivery'
      });
      showToast(`ลงตารางวิ่งงาน ${scheduleTarget.title} วันที่ ${formatDateDMY(schedDate)} เรียบร้อย`);
    } else {
      await scheduleRepairDispatch(scheduleTarget.ticket.id, {
        scheduled_date: schedDate,
        scheduled_time_slot: schedTimeSlot,
        dispatch_route_zone: schedRouteZone,
        assigned_techs: schedTechs
      });
      showToast(`ลงตารางส่งคืน ${scheduleTarget.ticket.ticket_no} วันที่ ${formatDateDMY(schedDate)} เรียบร้อย`);
    }
    setScheduleTarget(null);
  };

  // ---- Site Visit Dispatch Modal State (PRJ-...) ----
  const [dispatchProjectId, setDispatchProjectId] = useState<string | null>(null);
  const [showScheduleForm, setShowScheduleForm] = useState(false);
  const [visitDate, setVisitDate] = useState(() => getLocalDateStr(1));
  const [visitTimeSlot, setVisitTimeSlot] = useState('09:00 - 17:00');
  const [visitTechs, setVisitTechs] = useState<string[]>([]);
  const [visitScope, setVisitScope] = useState('');
  const [visitItemQtyMap, setVisitItemQtyMap] = useState<Record<string, number>>({});

  const dispatchProject = useMemo(
    () => (dispatchProjectId ? projects.find(p => p.id === dispatchProjectId) || null : null),
    [projects, dispatchProjectId]
  );

  const openSiteVisitDispatchModal = (prj: Project, openForm = false) => {
    setDispatchProjectId(prj.id);
    setShowScheduleForm(openForm);
    setVisitDate(getLocalDateStr(1));
    setVisitTimeSlot('09:00 - 17:00');
    setVisitTechs([]);
    setVisitScope('');
    const initQty: Record<string, number> = {};
    (prj.items || []).forEach(it => {
      initQty[it.id] = 0;
    });
    setVisitItemQtyMap(initQty);
  };

  const handleSubmitScheduleSiteVisit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!dispatchProject) return;
    if (visitTechs.length === 0) {
      alert('กรุณาเลือกช่าง Onsite อย่างน้อย 1 คนสำหรับรอบเข้าไซต์นี้');
      return;
    }
    if (!visitScope.trim()) {
      alert('กรุณาระบุขอบเขตงานที่จะทำในวันเข้าไซต์');
      return;
    }
    const itemsToTake: SiteVisitItemRef[] = (dispatchProject.items || [])
      .map(pi => ({
        product_id: pi.product_id,
        project_item_id: pi.id,
        name: pi.model_name,
        item_type: pi.item_type,
        qty: Math.max(0, visitItemQtyMap[pi.id] || 0)
      }))
      .filter(it => it.qty > 0);

    const created = scheduleSiteVisit(dispatchProject.id, {
      visit_date: visitDate,
      time_slot: visitTimeSlot,
      assigned_techs: visitTechs,
      visit_scope: visitScope.trim(),
      items_to_take: itemsToTake
    });
    if (created) {
      showToast(`นัดเข้าไซต์ ${dispatchProject.id} วันที่ ${formatDateDMY(visitDate)} (${visitTechs.join(', ')}) — ส่งคิวเบิกของแล้ว`);
      setShowScheduleForm(false);
    }
  };

  const [trackerTicketId, setTrackerTicketId] = useState<string | null>(null);
  const trackerTicket = trackerTicketId ? repairTickets.find(t => t.id === trackerTicketId) : null;

  // --- Handover mode for self_pickup confirmation inside tracker ---
  const [handoverMode, setHandoverMode] = useState<'none' | 'self_pickup'>('none');

  const resetHandover = () => {
    setHandoverMode('none');
  };

  const openTracker = (ticketId: string) => {
    resetHandover();
    setTrackerTicketId(ticketId);
  };

  const closeTracker = () => {
    resetHandover();
    setTrackerTicketId(null);
  };

  // 1) ลูกค้ารับเองหน้าร้าน -> ปิดงานทันที
  const confirmSelfPickup = async () => {
    if (!trackerTicket) return;
    await selfPickupRepairTicket(trackerTicket.id);
    closeTracker();
    showToast('ลูกค้ารับเครื่องซ่อมเองที่หน้าร้าน — ปิดงานเรียบร้อยแล้ว');
  };

  // 2) ส่งเข้าคิวจัดสายรถ (ให้ช่าง Onsite ส่งคืน) -> เปิด Modal ลงตารางวิ่งงานทันที
  const confirmQueueForDispatch = async () => {
    if (!trackerTicket) return;
    const targetTicket = trackerTicket;
    await queueRepairTicketForDispatch(targetTicket.id);
    closeTracker();
    openScheduleJobModal({
      kind: 'repair',
      ticket: targetTicket,
      title: `${targetTicket.ticket_no} — ${targetTicket.device_model || 'เครื่องซ่อม'}`,
      subtitle: targetTicket.customer_name,
      defaultRoute: 'สาย 1 ในเมือง'
    });
  };


  const renderLifecycleBadge = (t: RepairTicket) => {
    const lifecycle: RepairLifecycleStatus = t.repair_status || 'pending_check';
    const meta = REPAIR_LIFECYCLE_META[lifecycle];
    const isRma = (t.service_type || 'in_house_repair') === 'rma_claim';
    const elapsed = lifecycle === 'rma_sent' ? getElapsedDays(t.rma_sent_date) : null;
    return (
      <div className="flex flex-col items-end gap-1 shrink-0">
        <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-lg border ${meta.badge}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
          {meta.label}
        </span>
        {isRma && lifecycle === 'rma_sent' && (
          <span className="text-[10px] font-semibold text-violet-600 dark:text-violet-400">
            {t.rma_supplier || 'ศูนย์'} · {elapsed ?? 0} วัน
          </span>
        )}
      </div>
    );
  };

  // =========================================================================
  // Render
  // =========================================================================
  return (
    <div className="space-y-6">
      {/* Toast */}
      <ToastBanner message={toast} onClose={() => setToast('')} />

      {/* Header */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2.5">
              <ClipboardList className="w-7 h-7 text-[#FF6B00]" />
              <span>หน้างานหน้าร้าน (รับซ่อม · จัดคิวรถ · ตามงาน)</span>
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
              กดเลือกเมนูด้านล่างตามงานที่ต้องการทำได้เลยครับ
            </p>
          </div>
        </div>

        {/* "วันนี้ต้องทำอะไรบ้าง?" 3-Card Quick Action Guide (Elderly-friendly) */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <button
            type="button"
            onClick={() => setActiveTab('counter')}
            className="text-left p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-500/10 border-2 border-emerald-300 dark:border-emerald-500/35 hover:border-emerald-500 transition cursor-pointer flex items-center justify-between gap-3 min-h-[76px]"
          >
            <div>
              <div className="text-xs font-bold text-emerald-800 dark:text-emerald-300">1. ซ่อมเสร็จแล้ว รอโทรตามลูกค้า</div>
              <div className="text-2xl font-black text-emerald-900 dark:text-white font-mono mt-0.5">
                {pickupReadyTickets.length} <span className="text-sm font-bold">เครื่อง</span>
              </div>
            </div>
            <PhoneCall className="w-8 h-8 text-emerald-600 dark:text-emerald-400 shrink-0" />
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('scheduler')}
            className="text-left p-4 rounded-2xl bg-amber-50 dark:bg-[#FF6B00]/10 border-2 border-amber-300 dark:border-[#FF6B00]/40 hover:border-[#FF6B00] transition cursor-pointer flex items-center justify-between gap-3 min-h-[76px]"
          >
            <div>
              <div className="text-xs font-bold text-amber-900 dark:text-amber-300">2. ของพร้อมส่ง รอลงตารางรถ</div>
              <div className="text-2xl font-black text-amber-950 dark:text-white font-mono mt-0.5">
                {unscheduledReadyItems.length + unscheduledReadyRepairs.length} <span className="text-sm font-bold">งาน</span>
              </div>
            </div>
            <Calendar className="w-8 h-8 text-[#FF6B00] shrink-0" />
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('scheduler');
            }}
            className="text-left p-4 rounded-2xl bg-indigo-50 dark:bg-indigo-500/10 border-2 border-indigo-300 dark:border-indigo-500/35 hover:border-indigo-500 transition cursor-pointer flex items-center justify-between gap-3 min-h-[76px]"
          >
            <div>
              <div className="text-xs font-bold text-indigo-900 dark:text-indigo-300">3. ตารางรถวันที่ {formatDateDMY(rosterDate)}</div>
              <div className="text-2xl font-black text-indigo-950 dark:text-white font-mono mt-0.5">
                {morningBriefingRows.length} <span className="text-sm font-bold">งาน</span>
              </div>
            </div>
            <Truck className="w-8 h-8 text-indigo-600 dark:text-indigo-400 shrink-0" />
          </button>
        </div>

        {/* 4 Large High-Contrast Navigation Tabs (Min 52px height, Clear Thai) */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-2 p-1.5 rounded-2xl bg-slate-100 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08]">
          <button
            type="button"
            onClick={() => setActiveTab('counter')}
            className={`px-4 py-3 min-h-[52px] rounded-xl text-sm font-extrabold transition-all cursor-pointer flex items-center justify-center gap-2 ${activeTab === 'counter'
              ? 'bg-[#FF6B00] text-black shadow-md'
              : 'text-slate-700 dark:text-slate-200 hover:bg-white/70 dark:hover:bg-white/[0.06]'
              }`}
          >
            <Store className="w-4 h-4 shrink-0" />
            <span>1. รับงานหน้าร้าน</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('scheduler')}
            className={`px-4 py-3 min-h-[52px] rounded-xl text-sm font-extrabold transition-all cursor-pointer flex items-center justify-center gap-2 ${activeTab === 'scheduler'
              ? 'bg-[#FF6B00] text-black shadow-md'
              : 'text-slate-700 dark:text-slate-200 hover:bg-white/70 dark:hover:bg-white/[0.06]'
              }`}
          >
            <Calendar className="w-4 h-4 shrink-0" />
            <span>2. จัดคิวส่งพรุ่งนี้</span>
            <span className={`px-2 py-0.5 rounded-full text-xs font-mono font-black ${
              activeTab === 'scheduler' ? 'bg-black/15 text-black' : 'bg-[#FF6B00]/20 text-[#C2410C] dark:text-[#FF6B00]'
            }`}>
              {unscheduledReadyItems.length + unscheduledReadyRepairs.length}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('tracker')}
            className={`px-4 py-3 min-h-[52px] rounded-xl text-sm font-extrabold transition-all cursor-pointer flex items-center justify-center gap-2 ${activeTab === 'tracker'
              ? 'bg-[#FF6B00] text-black shadow-md'
              : 'text-slate-700 dark:text-slate-200 hover:bg-white/70 dark:hover:bg-white/[0.06]'
              }`}
          >
            <Search className="w-4 h-4 shrink-0" />
            <span>3. ตามงานซ่อม</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('prep_ready')}
            className={`px-4 py-3 min-h-[52px] rounded-xl text-sm font-extrabold transition-all cursor-pointer flex items-center justify-center gap-2 ${activeTab === 'prep_ready'
              ? 'bg-[#FF6B00] text-black shadow-md'
              : 'text-slate-700 dark:text-slate-200 hover:bg-white/70 dark:hover:bg-white/[0.06]'
              }`}
          >
            <PackageCheck className="w-4 h-4 shrink-0" />
            <span>4. เช็คของพร้อมปล่อย</span>
            <span className={`px-2 py-0.5 rounded-full text-xs font-mono font-black ${
              activeTab === 'prep_ready' ? 'bg-black/15 text-black' : 'bg-sky-500/20 text-sky-700 dark:text-sky-300'
            }`}>
              {prepReadyOverviewItems.length}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('onsite_summary')}
            className={`col-span-2 lg:col-span-1 px-4 py-3 min-h-[52px] rounded-xl text-sm font-extrabold transition-all cursor-pointer flex items-center justify-center gap-2 ${activeTab === 'onsite_summary'
              ? 'bg-[#FF6B00] text-black shadow-md'
              : 'text-slate-700 dark:text-slate-200 hover:bg-white/70 dark:hover:bg-white/[0.06]'
              }`}
          >
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>5. สรุปงานวันนี้</span>
            <span className={`px-2 py-0.5 rounded-full text-xs font-mono font-black ${
              activeTab === 'onsite_summary' ? 'bg-black/15 text-black' : 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300'
            }`}>
              {todayOnsiteCount}
            </span>
          </button>
        </div>
      </div>

      {/* ===================== 1-DAY ADVANCE SCHEDULER TAB ===================== */}
      {activeTab === 'scheduler' && (
        <div className="space-y-6">
          {/* Panel 1: งานพร้อมรอจัดคิว */}
          <QueueSection
            icon={<PackageCheck className="w-6 h-6" />}
            title="ขั้นที่ 1: เลือกงานที่พร้อมส่ง เพื่อลงตารางรถพรุ่งนี้"
            count={unscheduledReadyItems.length + unscheduledReadyRepairs.length}
            accent="amber"
            emptyText="ยอดเยี่ยม! ไม่มีงานค้างรอจัดคิวแล้ว"
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {step1PageEntries.map(entry => {
                if (entry.kind === 'item') {
                  const it = entry.item;
                  const ord = orders.find(o => o.id === it.order_id);
                  const prj = projects.find(p => p.id === it.project_id);
                  const due = prj?.due_date || ord?.delivery_date;
                  const urg = getDeliveryUrgency(due);
                  return (
                    <div key={it.id} className="p-3.5 rounded-2xl bg-white dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.08] flex flex-col justify-between gap-2.5 text-xs">
                      <div className="space-y-1">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <span className="font-mono font-extrabold text-[#FF6B00]">
                            {prj ? prj.id : (ord?.bill_no || ord?.sales_ref || it.id)}
                          </span>
                          {urg.hasDate && (
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                              urg.daysRemaining < 0
                                ? 'bg-rose-100 text-rose-900 dark:bg-rose-500/20 dark:text-rose-200'
                                : urg.daysRemaining === 0
                                  ? 'bg-orange-100 text-orange-900 dark:bg-[#FF6B00]/25 dark:text-orange-200'
                                  : urg.daysRemaining <= 5
                                    ? 'bg-amber-100 text-amber-900 dark:bg-amber-500/20 dark:text-amber-300'
                                    : 'bg-emerald-100 text-emerald-900 dark:bg-emerald-500/15 dark:text-emerald-300'
                            }`}>
                              {urg.daysRemaining < 0
                                ? (prj ? `เกินกำหนด ${urg.overdueDays} วัน • เสี่ยงโดนปรับ!` : `เกินกำหนด ${urg.overdueDays} วัน`)
                                : urg.daysRemaining === 0
                                  ? 'วันนี้'
                                  : `เหลืออีก ${urg.daysRemaining} วัน`}
                            </span>
                          )}
                        </div>
                        <div className="font-bold text-slate-900 dark:text-white">{prj ? prj.customer_name : (ord?.customer_name || '-')}</div>
                        <div className="text-slate-700 dark:text-slate-200">{it.model_name}</div>
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] font-mono text-slate-500 dark:text-slate-400">
                          <span>S/N: {it.serial_number || '-'}</span>
                          {it.void_date && <span>• วอย {it.void_date}</span>}
                          <span className="font-sans font-bold text-[#FF6B00]">
                            • วันส่ง: {due ? formatDateDMY(due) : 'ยังไม่ระบุ'}
                          </span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          openScheduleJobModal({
                            kind: 'item',
                            item: it,
                            title: `${prj ? prj.id : (ord?.sales_ref || it.id)} — ${it.model_name}`,
                            subtitle: prj ? `${prj.customer_name} (${prj.site_name})` : (ord?.customer_name || '-'),
                            defaultRoute: 'สาย 1 ในเมือง'
                          })
                        }
                        className="w-full py-2 rounded-xl bg-gradient-to-r from-[#FF6B00] to-[#E65A00] hover:from-[#FF8A24] text-black font-extrabold text-xs cursor-pointer flex items-center justify-center gap-1.5 shadow-sm"
                      >
                        <Calendar className="w-3.5 h-3.5" />
                        <span>ลงตารางวิ่งงาน (Schedule Job)</span>
                      </button>
                    </div>
                  );
                }

                const t = entry.ticket;
                const urg = getDeliveryUrgency(t.due_date);
                return (
                  <div key={t.id} className="p-3.5 rounded-2xl bg-white dark:bg-white/[0.03] border border-cyan-300 dark:border-cyan-500/30 flex flex-col justify-between gap-2.5 text-xs">
                    <div className="space-y-1">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <span className="font-mono font-extrabold text-cyan-700 dark:text-cyan-300">
                          {t.ticket_no} (ส่งคืนซ่อม)
                        </span>
                        {urg.hasDate && (
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                            urg.daysRemaining < 0
                              ? 'bg-rose-100 text-rose-900 dark:bg-rose-500/20 dark:text-rose-200'
                              : urg.daysRemaining === 0
                                ? 'bg-orange-100 text-orange-900 dark:bg-[#FF6B00]/25 dark:text-orange-200'
                                : urg.daysRemaining <= 5
                                  ? 'bg-amber-100 text-amber-900 dark:bg-amber-500/20 dark:text-amber-300'
                                  : 'bg-emerald-100 text-emerald-900 dark:bg-emerald-500/15 dark:text-emerald-300'
                          }`}>
                            {urg.daysRemaining < 0
                              ? `เกินกำหนด ${urg.overdueDays} วัน`
                              : urg.daysRemaining === 0
                                ? 'วันนี้'
                                : `เหลืออีก ${urg.daysRemaining} วัน`}
                          </span>
                        )}
                      </div>
                      <div className="font-bold text-slate-900 dark:text-white">{t.customer_name}</div>
                      <div className="text-slate-700 dark:text-slate-200">{t.device_model || 'เครื่องซ่อม'}</div>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] font-mono text-slate-500 dark:text-slate-400">
                        <span>S/N: {t.walkin_sn || '-'} • {t.district || '-'}</span>
                        <span className="font-sans font-bold text-cyan-700 dark:text-cyan-300">
                          • วันนัดส่ง: {t.due_date ? formatDateDMY(t.due_date) : 'ยังไม่ระบุ'}
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        openScheduleJobModal({
                          kind: 'repair',
                          ticket: t,
                          title: `${t.ticket_no} — ${t.device_model || 'เครื่องซ่อม'}`,
                          subtitle: t.customer_name,
                          defaultRoute: 'สาย 1 ในเมือง'
                        })
                      }
                      className="w-full py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-extrabold text-xs cursor-pointer flex items-center justify-center gap-1.5 shadow-sm"
                    >
                      <Calendar className="w-3.5 h-3.5" />
                      <span>ลงตารางวิ่งงาน (Schedule Job)</span>
                    </button>
                  </div>
                );
              })}
            </div>
            {step1TotalPages > 1 && (
              <div className="flex flex-wrap items-center justify-between gap-2 pt-3 mt-1 border-t border-slate-200 dark:border-white/[0.08] text-xs">
                <span className="text-slate-600 dark:text-slate-400 font-medium">
                  แสดง <strong>{step1Start + 1}–{Math.min(step1Start + STEP1_PAGE_SIZE, step1Combined.length)}</strong> จากทั้งหมด <strong>{step1Combined.length}</strong> งาน
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={safeStep1Page <= 1}
                    onClick={() => setStep1Page(p => Math.max(1, p - 1))}
                    className="px-3.5 py-2 min-h-[38px] rounded-xl bg-white dark:bg-white/[0.05] hover:bg-slate-100 dark:hover:bg-white/[0.1] disabled:opacity-40 disabled:cursor-not-allowed border border-slate-300 dark:border-white/[0.12] text-slate-800 dark:text-slate-200 font-bold transition active:scale-95 cursor-pointer"
                  >
                    ← ย้อนกลับ
                  </button>
                  <span className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-white/[0.06] font-mono font-bold text-slate-800 dark:text-white">
                    หน้า {safeStep1Page} / {step1TotalPages}
                  </span>
                  <button
                    type="button"
                    disabled={safeStep1Page >= step1TotalPages}
                    onClick={() => setStep1Page(p => Math.min(step1TotalPages, p + 1))}
                    className="px-3.5 py-2 min-h-[38px] rounded-xl bg-[#FF6B00] hover:bg-[#FF8A24] disabled:opacity-40 disabled:cursor-not-allowed text-black font-extrabold transition active:scale-95 cursor-pointer shadow-sm"
                  >
                    ถัดไป →
                  </button>
                </div>
              </div>
            )}
          </QueueSection>

          {/* Panel 1.5: จัดคิวนัดเข้าไซต์งานโปรเจกต์ (PRJ) */}
          <QueueSection
            icon={<Building2 className="w-6 h-6" />}
            title="งานโปรเจกต์ / จัดทีมเข้าไซต์ (PRJ)"
            count={urgentSortedProjects.filter(p => p.status !== 'completed').length}
            accent="purple"
            emptyText="ยังไม่มีงานโปรเจกต์ในระบบ"
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {urgentSortedProjects.filter(p => p.status !== 'completed').map((prj) => {
                const latestLog =
                  prj.daily_logs && prj.daily_logs.length > 0
                    ? prj.daily_logs[prj.daily_logs.length - 1]
                    : null;
                const pct = latestLog ? latestLog.progress_percent : 0;
                const risk = getProjectDeadlineRisk(prj.due_date, prj.status);
                const visitCount = prj.site_visits?.length || 0;
                const completedVisitCount = (prj.site_visits || []).filter(v => v.visit_status === 'completed').length;
                return (
                  <div
                    key={prj.id}
                    onClick={() => openSiteVisitDispatchModal(prj, false)}
                    className="rounded-2xl border border-purple-300 dark:border-purple-500/30 hover:border-purple-500 bg-white dark:bg-white/[0.03] p-4 space-y-2.5 cursor-pointer transition hover:shadow-md"
                  >
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-mono font-extrabold px-2 py-0.5 rounded-lg bg-purple-600 text-white">
                          {prj.id}
                        </span>
                        <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full border ${risk.badgeCls}`}>
                          {risk.label}
                        </span>
                      </div>
                      <span className="text-xs font-mono font-extrabold text-purple-700 dark:text-purple-300">
                        คืบหน้า {pct}%
                      </span>
                    </div>
                    <div>
                      <div className="text-sm font-extrabold text-slate-900 dark:text-white">
                        {prj.site_name}
                      </div>
                      <div className="text-xs text-slate-600 dark:text-slate-300">
                        ลูกค้า: <b>{prj.customer_name}</b>
                        {prj.due_date ? ` · กำหนดส่ง ${formatDateDMY(prj.due_date)}` : ''}
                      </div>
                    </div>
                    <div className="w-full h-2 rounded-full bg-slate-200 dark:bg-white/10 overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-purple-500 to-emerald-500 transition-all"
                        style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between gap-2 text-[11px] pt-1">
                      <span className="text-slate-600 dark:text-slate-300 font-semibold">
                        นัดเข้าไซต์ {visitCount} รอบ (เสร็จ {completedVisitCount})
                      </span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          openSiteVisitDispatchModal(prj, true);
                        }}
                        className="px-3 py-1.5 rounded-xl bg-[#FF6B00] hover:bg-[#FF8A24] text-black font-extrabold text-xs cursor-pointer flex items-center gap-1 shadow-sm"
                      >
                        <Calendar className="w-3.5 h-3.5" />
                        <span>+ นัดเข้าไซต์ &amp; จัดชุดช่าง</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </QueueSection>

          {/* Panel 2: ตารางจัด Job ล่วงหน้า (Daily Dispatch Roster) */}
          <div className="liquid-glass rounded-3xl p-5 sm:p-6 border border-white/[0.08] space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-base sm:text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
                  <Truck className="w-6 h-6 text-[#FF6B00]" />
                  <span>ขั้นที่ 2: ตารางรถวิ่งงานประจำวัน</span>
                  <span className="px-2.5 py-0.5 rounded-full text-sm font-mono font-extrabold bg-[#FF6B00]/15 text-[#C2410C] dark:text-[#FF6B00]">
                    {morningBriefingRows.length} งาน
                  </span>
                </h3>
                <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 mt-0.5">
                  เลือกวันที่ต้องการดู แล้วกดปุ่มสีส้มด้านขวาเพื่อพิมพ์ใบประชุมเช้าได้เลยครับ
                </p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <input
                  type="date"
                  value={rosterDate}
                  onChange={(e) => setRosterDate(e.target.value)}
                  className="px-3.5 py-2.5 min-h-[44px] rounded-xl text-sm font-bold bg-white dark:bg-slate-800 border-2 border-slate-300 dark:border-slate-700 cursor-pointer"
                />
                <button
                  type="button"
                  onClick={() => setDispatchRosterOpen(true)}
                  className="px-4 py-2.5 min-h-[44px] rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-black text-sm cursor-pointer flex items-center gap-2 shadow-md"
                >
                  <Printer className="w-4 h-4" />
                  <span>พิมพ์ใบจัดคิวพรุ่งนี้ (Print)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setMorningBriefingOpen(true)}
                  className="px-5 py-2.5 min-h-[44px] rounded-xl bg-gradient-to-r from-[#FF6B00] to-[#E65A00] hover:from-[#FF8A24] text-black font-black text-sm cursor-pointer flex items-center gap-2 shadow-lg shadow-[#FF6B00]/20"
                >
                  <Printer className="w-5 h-5" />
                  <span>พิมพ์ใบประชุมเช้า (A4)</span>
                </button>
              </div>
            </div>

            {morningBriefingRows.length === 0 ? (
              <div className="p-8 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 text-center text-xs text-slate-500">
                ยังไม่มีงานที่ลงตารางวิ่งงานสำหรับวันที่ {formatDateDMY(rosterDate)}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {morningBriefingRows.map(row => (
                  <div key={row.id} className="p-3.5 rounded-2xl bg-white dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.08] flex flex-col justify-between gap-2 text-xs">
                    <div className="space-y-1">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <span className="font-mono font-extrabold text-[#FF6B00]">{row.refNo}</span>
                        <div className="flex items-center gap-1.5">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-800 dark:bg-indigo-500/20 dark:text-indigo-300">
                            {row.routeZone} ({row.timeSlot})
                          </span>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300">
                            {row.prepStatusLabel}
                          </span>
                        </div>
                      </div>
                      <div className="font-bold text-slate-900 dark:text-white">{row.customerName}</div>
                      <div className="text-slate-700 dark:text-slate-200">{row.detail}</div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">
                        ทีมช่าง: <strong>{row.techs.join(', ') || '-'}</strong> • {row.location}
                      </div>
                    </div>
                    <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-white/[0.06]">
                      {row.id.startsWith('item-') && (
                        <button
                          type="button"
                          onClick={() => unscheduleItemDispatch(row.id.replace('item-', ''))}
                          className="px-2.5 py-1 rounded-lg bg-rose-100 dark:bg-rose-500/15 text-rose-700 dark:text-rose-300 text-[11px] font-bold cursor-pointer"
                        >
                          ถอดออกจากตาราง
                        </button>
                      )}
                      {row.id.startsWith('rep-') && (
                        <button
                          type="button"
                          onClick={() => unscheduleRepairDispatch(row.id.replace('rep-', ''))}
                          className="px-2.5 py-1 rounded-lg bg-rose-100 dark:bg-rose-500/15 text-rose-700 dark:text-rose-300 text-[11px] font-bold cursor-pointer"
                        >
                          ถอดออกจากตาราง
                        </button>
                      )}
                      {row.id.startsWith('visit-') && (() => {
                        const vid = row.id.replace('visit-', '');
                        const ownerPrj = projects.find(p => (p.site_visits || []).some(v => v.id === vid));
                        return ownerPrj ? (
                          <button
                            type="button"
                            onClick={() => removeSiteVisit(ownerPrj.id, vid)}
                            className="px-2.5 py-1 rounded-lg bg-rose-100 dark:bg-rose-500/15 text-rose-700 dark:text-rose-300 text-[11px] font-bold cursor-pointer"
                          >
                            ยกเลิกรอบเข้าไซต์
                          </button>
                        ) : null;
                      })()}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===================== COUNTER TAB ===================== */}
      {activeTab === 'counter' && (
        <div className="space-y-6">
          {/* Quick actions */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setIntakeOpen(true)}
              className="group flex items-center gap-3 p-4 rounded-2xl bg-gradient-to-br from-[#FF6B00] to-[#FF8F3C] text-white shadow-lg shadow-[#FF6B00]/20 hover:shadow-xl transition-all active:scale-[0.98] min-h-[72px]"
            >
              <span className="flex items-center justify-center w-11 h-11 rounded-xl bg-white/20 shrink-0">
                <Plus className="w-6 h-6" />
              </span>
              <span className="text-left flex-1">
                <span className="block text-base sm:text-lg font-black">รับเครื่องซ่อมหน้าร้าน</span>
                <span className="block text-xs sm:text-sm text-white/90">กดปุ่มนี้เมื่อลูกค้าถือเครื่องมาซ่อมที่ร้าน</span>
              </span>
              <ArrowRight className="w-5 h-5 opacity-70 group-hover:translate-x-0.5 transition-transform" />
            </button>

            <button
              type="button"
              onClick={() => setOnsiteOpen(true)}
              className="group flex items-center gap-3 p-4 rounded-2xl bg-gradient-to-br from-sky-600 to-cyan-500 text-white shadow-lg shadow-sky-600/20 hover:shadow-xl transition-all active:scale-[0.98] min-h-[72px]"
            >
              <span className="flex items-center justify-center w-11 h-11 rounded-xl bg-white/20 shrink-0">
                <PhoneCall className="w-6 h-6" />
              </span>
              <span className="text-left flex-1">
                <span className="block text-base sm:text-lg font-black">นัดช่างไปหาลูกค้า</span>
                <span className="block text-xs sm:text-sm text-white/90">กดปุ่มนี้เมื่อลูกค้าโทรตามช่างไปดูหน้างาน / รับเครื่อง</span>
              </span>
              <ArrowRight className="w-5 h-5 opacity-70 group-hover:translate-x-0.5 transition-transform" />
            </button>
          </div>

          {/* Repair handoff from technicians — ready for customer pickup */}
          <QueueSection
            icon={<Wrench className="w-5 h-5" />}
            title="พร้อมส่งคืนลูกค้า (ช่างซ่อมส่งมาแล้ว)"
            count={pickupReadyTickets.length}
            accent="emerald"
            emptyText="ยังไม่มีเครื่องซ่อมที่ช่างส่งคืนหน้าร้าน"
          >
            <div className="space-y-3">
              {pickupReadyTickets.length > 0 && (
                <ListControls
                  from={pickupReadyList.from}
                  to={pickupReadyList.to}
                  total={pickupReadyList.total}
                  page={pickupReadyList.page}
                  totalPages={pickupReadyList.totalPages}
                  pageSize={pickupReadyList.pageSize}
                  sort={pickupReadyList.sort}
                  onSortChange={pickupReadyList.setSort}
                  onPageSizeChange={pickupReadyList.setPageSize}
                  onPageChange={pickupReadyList.setPage}
                  pageSizeOptions={[10, 20, 30]}
                  unit="งาน"
                />
              )}
              {pickupReadyList.pageItems.map(t => (
                <CompactCard
                  key={t.id}
                  accent="emerald"
                  idLabel={t.ticket_no}
                  title={t.customer_name}
                  subtitle={t.device_model || 'ไม่ระบุรุ่นเครื่อง'}
                  phone={t.customer_phone}
                  routeCode={t.route_code}
                  itemSummary={`ช่างซ่อม: ${t.repaired_by || 'ไม่ระบุ'} • S/N: ${t.walkin_sn || '-'}`}
                  statusBadge={
                    <span className="text-[10px] font-bold px-2 py-1 rounded-lg border bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 shrink-0">
                      พร้อมส่งคืน
                    </span>
                  }
                  actionLabel="โทรตามลูกค้า · พิมพ์ใบรับ · ปิดงาน"
                  actionIcon={<CheckCircle2 className="w-4 h-4" />}
                  onOpen={() => openTracker(t.id)}
                />
              ))}
            </div>
          </QueueSection>

          {/* Self-pickup */}
          <QueueSection
            icon={<PackageCheck className="w-5 h-5" />}
            title="รอลูกค้ารับเองหน้าร้าน"
            count={pickupItems.length}
            accent="purple"
            emptyText="ยังไม่มีออเดอร์แบบรับเองที่พร้อมส่งมอบ"
          >
            <div className="space-y-3">
              {pickupItems.length > 0 && (
                <ListControls
                  from={pickupItemsList.from}
                  to={pickupItemsList.to}
                  total={pickupItemsList.total}
                  page={pickupItemsList.page}
                  totalPages={pickupItemsList.totalPages}
                  pageSize={pickupItemsList.pageSize}
                  sort={pickupItemsList.sort}
                  onSortChange={pickupItemsList.setSort}
                  onPageSizeChange={pickupItemsList.setPageSize}
                  onPageChange={pickupItemsList.setPage}
                  pageSizeOptions={[10, 20, 30]}
                  unit="รายการ"
                />
              )}
              {pickupItemsList.pageItems.map(item => {
                const ord = item.order_id ? orders.find(o => o.id === item.order_id) : null;
                return (
                  <CompactCard
                    key={item.id}
                    accent="purple"
                    idLabel={item.serial_number || item.id}
                    title={ord?.customer_name || 'ไม่ระบุลูกค้า'}
                    subtitle={item.model_name}
                    phone={ord?.customer_phone}
                    itemSummary={ord?.delivery_location}
                    statusBadge={
                      <span className="text-[10px] font-bold px-2 py-1 rounded-lg border bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/30 shrink-0">
                        รับเอง
                      </span>
                    }
                    actionLabel="ยืนยันรับสินค้า & ปิดงาน"
                    actionIcon={<PackageCheck className="w-4 h-4" />}
                    onOpen={() => openPickup(item.id)}
                  />
                );
              })}
            </div>
          </QueueSection>
        </div>
      )}

      {/* ===================== PREP READY TAB: เช็คของพร้อมปล่อย (ช่างเตรียม) ===================== */}
      {activeTab === 'prep_ready' && (
        <div className="space-y-4">
          <QueueSection
            icon={<Package className="w-5 h-5" />}
            title="เช็คของพร้อมปล่อย (สถานะจากห้องช่างเตรียม)"
            count={prepReadyOverviewItems.length}
            accent="sky"
            emptyText="ยังไม่มีสินค้าจากห้องช่างเตรียมที่รอปล่อยหรือติดวอย"
          >
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-1.5">
                {[
                  { id: 'all' as const, label: `ทั้งหมด (${prepReadyOverviewItems.length})` },
                  {
                    id: 'ready' as const,
                    label: `ติดวอยพร้อมปล่อยแล้ว (${prepReadyOverviewItems.filter(i => i.status === 'ready_for_dispatch').length})`
                  },
                  {
                    id: 'pending_void' as const,
                    label: `รอช่างเตรียมแปะวอย (${prepReadyOverviewItems.filter(i => i.status === 'prepped_in_stock').length})`
                  }
                ].map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setPrepOverviewFilter(f.id)}
                    className={`px-2.5 py-1 rounded-full text-[11px] font-bold border transition cursor-pointer ${
                      prepOverviewFilter === f.id
                        ? 'bg-sky-500 text-white border-sky-500 shadow-sm'
                        : 'bg-white dark:bg-white/[0.04] text-slate-600 dark:text-slate-300 border-slate-200 dark:border-white/[0.08] hover:border-sky-500/40'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              {filteredPrepOverviewItems.length === 0 ? (
                <p className="text-xs text-slate-400 dark:text-slate-500 italic py-3 text-center">
                  ไม่มีรายการในหมวดนี้
                </p>
              ) : (
                <>
                  <ListControls
                    from={prepReadyOverviewList.from}
                    to={prepReadyOverviewList.to}
                    total={prepReadyOverviewList.total}
                    page={prepReadyOverviewList.page}
                    totalPages={prepReadyOverviewList.totalPages}
                    pageSize={prepReadyOverviewList.pageSize}
                    sort={prepReadyOverviewList.sort}
                    onSortChange={prepReadyOverviewList.setSort}
                    onPageSizeChange={prepReadyOverviewList.setPageSize}
                    onPageChange={prepReadyOverviewList.setPage}
                    pageSizeOptions={[10, 20, 30]}
                    unit="รายการ"
                  />
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {prepReadyOverviewList.pageItems.map((item) => {
                    const ord = item.order_id ? orders.find(o => o.id === item.order_id) : null;
                    const isReady = item.status === 'ready_for_dispatch';
                    const isPickup = ord?.delivery_mode === 'customer_pickup';
                    const rMeta = ord?.route_code ? ROUTE_DEFINITIONS[ord.route_code] : null;
                    const addressText = [ord?.delivery_location, ord?.district].filter(Boolean).join(' · ');
                    return (
                      <div
                        key={item.id}
                        className={`rounded-2xl border p-4 flex flex-col gap-2.5 bg-white dark:bg-white/[0.04] shadow-sm ${
                          isReady
                            ? 'border-emerald-400 dark:border-emerald-500/40'
                            : 'border-amber-400 dark:border-amber-500/40'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-mono font-extrabold px-2 py-0.5 rounded-lg bg-[#FF6B00] text-black truncate">
                            {ord?.sales_ref || item.serial_number || item.id}
                          </span>
                          <span
                            className={`text-[11px] font-extrabold px-2.5 py-0.5 rounded-full border whitespace-nowrap ${
                              isReady
                                ? 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 border-emerald-500/40'
                                : 'bg-amber-500/15 text-amber-800 dark:text-amber-300 border-amber-500/40'
                            }`}
                          >
                            {isReady ? 'ติดวอยพร้อมปล่อย' : 'รอช่างเตรียมแปะวอย'}
                          </span>
                        </div>

                        <div className="min-w-0 space-y-1">
                          <div className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white leading-snug">
                            {ord?.customer_name || 'สต๊อก / ไม่ระบุลูกค้า'}
                          </div>
                          <div className="text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-100 leading-snug">
                            {item.model_name}
                          </div>
                          <div className="text-xs font-mono font-semibold text-slate-700 dark:text-slate-200 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                            <span>S/N: {item.serial_number || '-'}</span>
                            {isReady && item.void_date && (
                              <span className="text-emerald-700 dark:text-emerald-300 font-bold">
                                · วอย: {item.void_date}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* ที่อยู่และเบอร์โทรลูกค้า */}
                        {(addressText || ord?.customer_phone || rMeta) && (
                          <div className="rounded-xl p-2.5 bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] space-y-1 text-xs">
                            {addressText && (
                              <div className="flex items-start gap-1.5 font-semibold text-slate-800 dark:text-slate-100 leading-snug">
                                <MapPin className="w-3.5 h-3.5 text-[#FF6B00] shrink-0 mt-0.5" />
                                <span className="line-clamp-2">{addressText}</span>
                              </div>
                            )}
                            <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold text-slate-700 dark:text-slate-200">
                              {ord?.customer_phone && (
                                toTelHref(ord.customer_phone) ? (
                                  <a
                                    href={toTelHref(ord.customer_phone)!}
                                    onClick={(e) => e.stopPropagation()}
                                    title="กดเพื่อโทรออก"
                                    className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-300 hover:underline cursor-pointer"
                                  >
                                    <Phone className="w-3 h-3" />
                                    {ord.customer_phone}
                                  </a>
                                ) : (
                                  <span className="inline-flex items-center gap-1">
                                    <Phone className="w-3 h-3 text-slate-500 dark:text-slate-400" />
                                    {ord.customer_phone}
                                  </span>
                                )
                              )}
                              {rMeta && (
                                <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${rMeta.badgeBg} ${rMeta.badgeBorder} ${rMeta.badgeText}`}>
                                  {rMeta.shortName}
                                </span>
                              )}
                            </div>
                          </div>
                        )}

                        <div className="mt-auto pt-2 border-t border-slate-200 dark:border-white/[0.08] flex items-center justify-between gap-2 text-xs">
                          <span className="font-bold text-slate-700 dark:text-slate-200">
                            {isPickup ? 'รับเองหน้าร้าน' : 'จัดส่ง Onsite'}
                            {ord?.delivery_date ? ` · ส่ง ${formatDateDMY(ord.delivery_date)}` : ''}
                          </span>
                          {isReady && (
                            <button
                              type="button"
                              onClick={() => (isPickup ? openPickup(item.id) : openDispatch(item.id))}
                              className="px-3 py-1.5 rounded-xl bg-[#FF6B00] hover:bg-[#FF8A24] text-black font-extrabold text-xs cursor-pointer whitespace-nowrap shadow-sm"
                            >
                              {isPickup ? 'ยืนยันรับสินค้า' : 'มอบหมาย / วันส่ง'}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  </div>
                </>
              )}
            </div>
          </QueueSection>
        </div>
      )}

      {/* ===================== ONSITE SUMMARY & PROJECT PROGRESS TAB ===================== */}
      {activeTab === 'onsite_summary' && (
        <div className="space-y-5">
          {/* Top Summary & Filter Bar */}
          <div className="rounded-2xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.03] p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <div className="px-3.5 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/30">
                <div className="text-[11px] font-bold text-emerald-700 dark:text-emerald-300">
                  วันนี้ Onsite ปิดงานแล้ว
                </div>
                <div className="text-xl font-black font-mono text-emerald-700 dark:text-emerald-300">
                  {todayOnsiteCount} <span className="text-xs font-bold">งาน</span>
                </div>
              </div>
              <div className="px-3.5 py-2 rounded-xl bg-purple-500/10 border border-purple-500/30">
                <div className="text-[11px] font-bold text-purple-700 dark:text-purple-300">
                  โปรเจกต์ที่ติดตาม
                </div>
                <div className="text-xl font-black font-mono text-purple-700 dark:text-purple-300">
                  {projects.length} <span className="text-xs font-bold">โครงการ</span>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <input
                type="date"
                value={reportDate}
                onChange={(e) => {
                  setReportDate(e.target.value);
                  setReportShowAllDates(false);
                }}
                aria-label="เลือกวันที่ดูสรุปงาน"
                className="px-3 py-2 rounded-xl text-xs font-bold bg-slate-50 dark:bg-white/[0.05] border border-slate-200 dark:border-white/[0.1] text-slate-900 dark:text-white cursor-pointer"
              />
              <button
                type="button"
                onClick={() => {
                  setReportDate(todayDateKey);
                  setReportShowAllDates(false);
                }}
                className={`px-3 py-2 rounded-xl text-xs font-bold border transition cursor-pointer ${
                  !reportShowAllDates && reportDate === todayDateKey
                    ? 'bg-[#FF6B00] text-black border-[#FF6B00]'
                    : 'bg-slate-50 dark:bg-white/[0.04] text-slate-700 dark:text-slate-200 border-slate-200 dark:border-white/[0.1]'
                }`}
              >
                วันนี้
              </button>
              <button
                type="button"
                onClick={() => setReportShowAllDates((v) => !v)}
                className={`px-3 py-2 rounded-xl text-xs font-bold border transition cursor-pointer ${
                  reportShowAllDates
                    ? 'bg-sky-500 text-white border-sky-500'
                    : 'bg-slate-50 dark:bg-white/[0.04] text-slate-700 dark:text-slate-200 border-slate-200 dark:border-white/[0.1]'
                }`}
              >
                แสดงทุกวัน
              </button>
              <select
                value={reportTechFilter}
                onChange={(e) => setReportTechFilter(e.target.value)}
                aria-label="กรองตามชื่อช่าง Onsite"
                className="px-3 py-2 rounded-xl text-xs font-bold bg-slate-50 dark:bg-white/[0.05] border border-slate-200 dark:border-white/[0.1] text-slate-900 dark:text-white cursor-pointer"
              >
                <option value="all" className="bg-white dark:bg-slate-900">ช่าง Onsite ทุกคน</option>
                {onsiteTechs.map((u) => (
                  <option key={u.id} value={u.name} className="bg-white dark:bg-slate-900">
                    {u.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setOnsiteReportPrintOpen(true)}
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#FF6B00] to-[#E65A00] hover:from-[#FF8A24] text-black font-extrabold text-xs shadow-lg shadow-[#FF6B00]/25 cursor-pointer flex items-center gap-1.5 whitespace-nowrap"
              >
                <Printer className="w-4 h-4" />
                <span>พิมพ์รายงาน (A4)</span>
              </button>
            </div>
          </div>

          {/* Section 1: Completed Onsite Jobs */}
          <QueueSection
            icon={<CheckCircle2 className="w-5 h-5" />}
            title={
              reportShowAllDates
                ? 'ประวัติปิดงานเสร็จของช่าง Onsite (ทุกวัน)'
                : `ประวัติปิดงานเสร็จของช่าง Onsite วันที่ ${formatDateDMY(reportDate)}`
            }
            count={filteredOnsiteJobs.length}
            accent="emerald"
            emptyText="ไม่มีรายการปิดงานเสร็จของช่าง Onsite ในวันที่เลือก"
          >
            <div className="space-y-3">
              <ListControls
                from={onsiteJobsList.from}
                to={onsiteJobsList.to}
                total={onsiteJobsList.total}
                page={onsiteJobsList.page}
                totalPages={onsiteJobsList.totalPages}
                pageSize={onsiteJobsList.pageSize}
                sort={onsiteJobsList.sort}
                onSortChange={onsiteJobsList.setSort}
                onPageSizeChange={onsiteJobsList.setPageSize}
                onPageChange={onsiteJobsList.setPage}
                pageSizeOptions={[10, 20, 30]}
                unit="งาน"
              />
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {onsiteJobsList.pageItems.map((job) => (
                  <div
                    key={job.id}
                    className="rounded-2xl border border-emerald-300 dark:border-emerald-500/30 bg-white dark:bg-white/[0.03] p-3.5 flex flex-col gap-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-mono font-extrabold px-2 py-0.5 rounded-lg bg-[#FF6B00] text-black truncate">
                        {job.refNo}
                      </span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 whitespace-nowrap">
                        {job.kind}
                      </span>
                    </div>
                    <div className="text-sm font-extrabold text-slate-900 dark:text-white leading-snug">
                      {job.customerName}
                    </div>
                    <div className="text-xs font-semibold text-slate-700 dark:text-slate-200 leading-snug">
                      {job.detail}
                    </div>
                    <div className="text-[11px] text-slate-600 dark:text-slate-300 flex items-start gap-1">
                      <MapPin className="w-3.5 h-3.5 text-[#FF6B00] shrink-0 mt-0.5" />
                      <span className="line-clamp-2">{job.location}</span>
                    </div>
                    <div className="mt-auto pt-2 border-t border-slate-200 dark:border-white/[0.08] flex items-center justify-between gap-2 text-[11px]">
                      <span className="font-bold text-sky-700 dark:text-sky-300 truncate">
                        ช่าง: {job.techs.join(', ') || '-'}
                      </span>
                      <span className="font-mono text-slate-500 dark:text-slate-400 shrink-0">
                        {formatThaiDateTime(job.completedAt)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </QueueSection>
        </div>
      )}

      {/* ===================== TRACKER TAB ===================== */}
      {activeTab === 'tracker' && (
        <div className="space-y-4">
          {/* Search + filter */}
          <div className="flex flex-col sm:flex-row gap-2.5">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={trackerSearch}
                onChange={(e) => setTrackerSearch(e.target.value)}
                placeholder="ค้นหาชื่อลูกค้า / เบอร์โทร / รุ่นเครื่อง / เลขใบงาน / S/N"
                className={`${modalInputClass} pl-9`}
              />
            </div>
            <div className="flex items-center gap-1 p-1 rounded-2xl bg-slate-100 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08]">
              {([
                { id: 'active', label: 'ช่างกำลังซ่อม' },
                { id: 'ready', label: 'พร้อมส่งคืนลูกค้า' },
                { id: 'all', label: 'ทั้งหมด' }
              ] as const).map(f => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setTrackerFilter(f.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors whitespace-nowrap ${trackerFilter === f.id
                    ? 'bg-white dark:bg-white/[0.1] text-[#FF6B00] shadow-sm'
                    : 'text-slate-500 dark:text-slate-400'
                    }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {activeRepairTickets.length === 0 ? (
            <div className="rounded-3xl border border-slate-200 dark:border-white/[0.08] bg-slate-50/60 dark:bg-white/[0.02] p-10 text-center">
              <Wrench className="w-10 h-10 mx-auto text-slate-300 dark:text-slate-600 mb-2" />
              <p className="text-sm text-slate-500 dark:text-slate-400">ไม่พบงานซ่อมที่ตรงกับเงื่อนไข</p>
            </div>
          ) : (
            <>
              <ListControls
                sort={trackerList.sort}
                onSortChange={trackerList.setSort}
                pageSize={trackerList.pageSize}
                onPageSizeChange={trackerList.setPageSize}
                page={trackerList.page}
                totalPages={trackerList.totalPages}
                from={trackerList.from}
                to={trackerList.to}
                total={trackerList.total}
                onPageChange={trackerList.setPage}
                unit="งานซ่อม"
              />
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {trackerList.pageItems.map(t => {
                  const lifecycle = t.repair_status || 'pending_check';
                  const accent: keyof typeof ACCENT_RING =
                    lifecycle === 'ready_pickup' ? 'emerald'
                      : lifecycle === 'rma_sent' || lifecycle === 'rma_returned' ? 'purple'
                        : lifecycle === 'waiting_parts' ? 'amber'
                          : 'sky';
                  return (
                    <CompactCard
                      key={t.id}
                      accent={accent}
                      idLabel={t.ticket_no}
                      title={t.customer_name}
                      subtitle={t.device_model || 'ไม่ระบุรุ่นเครื่อง'}
                      phone={t.customer_phone}
                      routeCode={t.route_code}
                      itemSummary={`ช่างซ่อม: ${t.repaired_by || 'ยังไม่มอบหมาย'}`}
                      statusBadge={renderLifecycleBadge(t)}
                      actionLabel={lifecycle === 'ready_pickup' ? 'โทรตามลูกค้า · พิมพ์ใบรับ · ปิดงาน' : 'ดูสถานะงานซ่อม'}
                      actionIcon={<FileText className="w-4 h-4" />}
                      onOpen={() => openTracker(t.id)}
                    />
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}

      {/* ===================== MODAL: Walk-in Intake (Shared) ===================== */}
      <RepairIntakeModal
        open={intakeOpen}
        onClose={() => setIntakeOpen(false)}
        title="รับเครื่องซ่อมหน้าร้าน"
        subtitle="Walk-in Repair Intake · สร้างใบรับซ่อมเข้าคิวช่างในร้าน"
        intakeChannel="front_desk_walkin"
        receivedChannel="front_desk"
        onToast={showToast}
      />

      {/* ===================== MODAL: Onsite Service Call ===================== */}
      <Modal
        open={onsiteOpen}
        onClose={() => setOnsiteOpen(false)}
        title="รับแจ้งเหตุ / นัดช่างออกหน้างาน"
        subtitle="Onsite Service / Pickup Call · มอบหมายช่างทันที"
        icon={<PhoneCall className="w-5 h-5" />}
        maxWidthClass="max-w-2xl"
        accentClass="border-sky-500/40"
        footer={
          <div className="flex gap-2">
            <button type="button" onClick={() => setOnsiteOpen(false)} className={modalSecondaryBtnClass}>
              ยกเลิก
            </button>
            <button type="submit" form="onsite-form" className={modalPrimaryBtnClass}>
              <Truck className="w-4 h-4" />
              มอบหมายช่าง & ออกใบงาน
            </button>
          </div>
        }
      >
        <form id="onsite-form" onSubmit={submitOnsite} className="space-y-3.5">
          <div>
            <label className={modalLabelClass}>ประเภทงาน (เลือกด่วน)</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {JOB_PRESETS.map(p => {
                const active = osPreset === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => applyPreset(p.id)}
                    className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-left text-xs font-semibold transition-all active:scale-[0.97] min-h-[44px] ${active
                      ? 'bg-sky-500/10 border-sky-500/50 text-sky-700 dark:text-sky-300'
                      : 'bg-white dark:bg-white/[0.03] border-slate-200 dark:border-white/[0.08] text-slate-600 dark:text-slate-300'
                      }`}
                  >
                    <span className="shrink-0">{p.icon}</span>
                    <span className="flex-1">{p.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={modalLabelClass}>ชื่อลูกค้า <span className="text-rose-500">*</span></label>
              <input
                type="text"
                value={osName}
                onChange={(e) => setOsName(e.target.value)}
                placeholder="เช่น ร้านกาแฟบ้านสวน"
                className={modalInputClass}
                required
              />
            </div>
            <div>
              <label className={modalLabelClass}>เบอร์โทรศัพท์</label>
              <input
                type="tel"
                value={osPhone}
                onChange={(e) => setOsPhone(e.target.value)}
                placeholder="08x-xxx-xxxx"
                className={modalInputClass}
              />
            </div>
          </div>

          <div>
            <label className={modalLabelClass}>ที่อยู่ / สถานที่หน้างาน</label>
            <input
              type="text"
              value={osAddress}
              onChange={(e) => setOsAddress(e.target.value)}
              placeholder="บ้านเลขที่ / หมู่ / ตำบล / อำเภอ"
              className={modalInputClass}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={modalLabelClass}>รุ่น / อุปกรณ์</label>
              <input
                type="text"
                value={osDevice}
                onChange={(e) => setOsDevice(e.target.value)}
                placeholder="เช่น กล้อง Hikvision 4 ตัว"
                className={modalInputClass}
              />
            </div>
            <div>
              <label className={modalLabelClass}>อำเภอ / เขตพื้นที่ (สายรถ)</label>
              <select
                value={osDistrict}
                onChange={(e) => setOsDistrict(e.target.value)}
                className={modalInputClass}
              >
                {DISTRICT_OPTIONS.map(opt => (
                  <option key={opt.district} value={opt.district}>
                    {opt.district} — {opt.zone}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className={modalLabelClass}>รายละเอียดงาน / อาการที่แจ้ง <span className="text-rose-500">*</span></label>
            <textarea
              value={osSymptom}
              onChange={(e) => setOsSymptom(e.target.value)}
              rows={3}
              placeholder="อธิบายสิ่งที่ลูกค้าแจ้งมา"
              className={modalInputClass}
              required
            />
          </div>

          <div>
            <label className={modalLabelClass}>มอบหมายช่าง Onsite <span className="text-rose-500">*</span></label>
            <TechCheckboxList options={techOptions} selected={osTechs} onToggle={toggleOsTech} />
          </div>
        </form>
      </Modal>

      {/* ===================== MODAL: Dispatch (Prepared Orders & Repair Returns) ===================== */}
      <Modal
        open={!!dispatchTarget}
        onClose={() => setDispatchTarget(null)}
        title={dispatchTarget?.type === 'repair' ? 'จัดสายรถ & ส่งมอบเครื่องซ่อม' : 'จัดสายรถ & ส่งมอบ'}
        subtitle={
          dispatchTarget?.type === 'repair' && dispatchTicket
            ? `ส่งคืนเครื่องซ่อม · ${dispatchTicket.ticket_no} · ${dispatchTicket.device_model || 'ไม่ระบุรุ่น'}`
            : dispatchItem
              ? `${dispatchItem.model_name} · ${dispatchItem.serial_number || '-'}`
              : ''
        }
        icon={<Truck className="w-5 h-5" />}
        maxWidthClass="max-w-lg"
        accentClass={dispatchTarget?.type === 'repair' ? 'border-amber-500/40' : 'border-emerald-500/40'}
        footer={
          <div className="flex flex-wrap gap-2 justify-end">
            <button type="button" onClick={() => setDispatchTarget(null)} className={modalSecondaryBtnClass}>
              ยกเลิก
            </button>
            <button type="button" onClick={saveDispatchScheduleOnly} className={modalSecondaryBtnClass}>
              บันทึกวันส่ง/สายรถอย่างเดียว
            </button>
            <button type="button" onClick={confirmDispatch} className={modalPrimaryBtnClass}>
              <Truck className="w-4 h-4" />
              ยืนยันจัดส่ง
            </button>
          </div>
        }
      >
        {dispatchTarget?.type === 'item' && dispatchItem && (
          <div className="space-y-3.5">
            <div className="rounded-2xl border border-slate-200 dark:border-white/[0.08] p-3 space-y-1.5">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-1.5 text-sm font-bold text-slate-900 dark:text-white">
                  <User className="w-4 h-4 text-slate-400" />
                  {dispatchOrder?.customer_name || 'ไม่ระบุลูกค้า'}
                </div>
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
                  วอยประกัน (จากช่างเตรียม): {dispatchItem.void_date || '-'}
                </span>
              </div>
              {dispatchOrder?.customer_phone && (
                toTelHref(dispatchOrder.customer_phone) ? (
                  <a
                    href={toTelHref(dispatchOrder.customer_phone)!}
                    title="กดเพื่อโทรออก"
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300 hover:underline cursor-pointer"
                  >
                    <Phone className="w-3.5 h-3.5" /> {dispatchOrder.customer_phone}
                  </a>
                ) : (
                  <div className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
                    <Phone className="w-3.5 h-3.5" /> {dispatchOrder.customer_phone}
                  </div>
                )
              )}
              {dispatchOrder?.delivery_location && (
                <div className="flex items-start gap-1.5 text-xs text-slate-600 dark:text-slate-300">
                  <MapPin className="w-3.5 h-3.5 mt-0.5 shrink-0" /> {dispatchOrder.delivery_location}
                </div>
              )}
            </div>

            <div>
              <label className={modalLabelClass}>วันกำหนดส่งมอบใหม่ (Delivery Date)</label>
              <input
                type="date"
                value={dispatchDueDate}
                onChange={(e) => setDispatchDueDate(e.target.value)}
                className={modalInputClass}
              />
            </div>

            <div>
              <label className={modalLabelClass}>สายรถ</label>
              <select
                value={dispatchRoute}
                onChange={(e) => setDispatchRoute(e.target.value as RouteCode)}
                className={modalInputClass}
              >
                {(Object.keys(ROUTE_DEFINITIONS) as RouteCode[]).map(rCode => (
                  <option key={rCode} value={rCode}>{ROUTE_DEFINITIONS[rCode].name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className={modalLabelClass}>มอบหมายช่าง Onsite <span className="text-rose-500">*</span></label>
              <TechCheckboxList options={techOptions} selected={dispatchTechs} onToggle={toggleDispatchTech} />
            </div>
          </div>
        )}

        {dispatchTarget?.type === 'repair' && dispatchTicket && (
          <div className="space-y-3.5">
            <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-3 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold px-2 py-0.5 rounded-lg border bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30">
                  ส่งคืนเครื่องซ่อม ({dispatchTicket.ticket_no})
                </span>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  S/N: {dispatchTicket.walkin_sn || '-'}
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-sm font-bold text-slate-900 dark:text-white pt-1">
                <User className="w-4 h-4 text-slate-400" />
                {dispatchTicket.customer_name}
              </div>
              {dispatchTicket.customer_phone && (
                <div className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
                  <Phone className="w-3.5 h-3.5" /> {dispatchTicket.customer_phone}
                </div>
              )}
              {dispatchTicket.delivery_location && (
                <div className="flex items-start gap-1.5 text-xs text-slate-600 dark:text-slate-300">
                  <MapPin className="w-3.5 h-3.5 mt-0.5 shrink-0" /> {dispatchTicket.delivery_location}
                </div>
              )}
              <div className="text-xs text-slate-600 dark:text-slate-300 pt-1 border-t border-amber-500/20">
                <span className="font-semibold text-slate-700 dark:text-slate-200">อาการ/งานซ่อม:</span> {dispatchTicket.fault_symptom}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={modalLabelClass}>สายรถ</label>
                <select
                  value={dispatchRoute}
                  onChange={(e) => setDispatchRoute(e.target.value as RouteCode)}
                  className={modalInputClass}
                >
                  {(Object.keys(ROUTE_DEFINITIONS) as RouteCode[]).map(rCode => (
                    <option key={rCode} value={rCode}>{ROUTE_DEFINITIONS[rCode].name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={modalLabelClass}>วันกำหนดส่งคืน (Due Date)</label>
                <input
                  type="date"
                  value={dispatchDueDate}
                  onChange={(e) => setDispatchDueDate(e.target.value)}
                  className={modalInputClass}
                />
              </div>
            </div>

            <div>
              <label className={modalLabelClass}>มอบหมายช่าง Onsite ผู้ไปส่งคืน <span className="text-rose-500">*</span></label>
              <TechCheckboxList options={techOptions} selected={dispatchTechs} onToggle={toggleDispatchTech} />
            </div>
          </div>
        )}
      </Modal>

      {/* ===================== MODAL: Self-Pickup ===================== */}
      <Modal
        open={!!pickupItem}
        onClose={() => setPickupItemId(null)}
        title="ยืนยันรับสินค้า & ปิดงาน"
        subtitle={pickupItem ? `${pickupItem.model_name} · ${pickupItem.serial_number || '-'}` : ''}
        icon={<PackageCheck className="w-5 h-5" />}
        maxWidthClass="max-w-lg"
        accentClass="border-purple-500/40"
        footer={
          <div className="flex gap-2">
            <button type="button" onClick={() => setPickupItemId(null)} className={modalSecondaryBtnClass}>
              ยกเลิก
            </button>
            <button type="button" onClick={confirmPickup} className={modalPrimaryBtnClass}>
              <CheckCircle2 className="w-4 h-4" />
              ยืนยันรับสินค้า
            </button>
          </div>
        }
      >
        {pickupItem && (
          <div className="space-y-3.5">
            <div className="rounded-2xl border border-slate-200 dark:border-white/[0.08] p-3 space-y-1.5">
              <div className="flex items-center gap-1.5 text-sm font-bold text-slate-900 dark:text-white">
                <User className="w-4 h-4 text-slate-400" />
                {pickupOrder?.customer_name || 'ไม่ระบุลูกค้า'}
              </div>
              {pickupOrder?.customer_phone && (
                toTelHref(pickupOrder.customer_phone) ? (
                  <a
                    href={toTelHref(pickupOrder.customer_phone)!}
                    title="กดเพื่อโทรออก"
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300 hover:underline cursor-pointer"
                  >
                    <Phone className="w-3.5 h-3.5" /> {pickupOrder.customer_phone}
                  </a>
                ) : (
                  <div className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
                    <Phone className="w-3.5 h-3.5" /> {pickupOrder.customer_phone}
                  </div>
                )
              )}
              <div className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
                <Hash className="w-3.5 h-3.5" /> S/N: {pickupItem.serial_number || '-'}
              </div>
              <div className="flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-300 font-semibold">
                <CheckCircle2 className="w-3.5 h-3.5" /> วอยประกัน (จากช่างเตรียม): {pickupItem.void_date || '-'}
              </div>
            </div>

            <div className="flex items-start gap-2 rounded-xl bg-amber-500/10 border border-amber-500/30 p-3 text-xs text-amber-700 dark:text-amber-300">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>ตรวจสอบ S/N และอุปกรณ์ให้ครบก่อนยืนยันรับสินค้า ระบบจะปิดงานทันที</span>
            </div>
          </div>
        )}
      </Modal>

      {/* ===================== MODAL: Repair Status & Return ===================== */}
      <Modal
        open={!!trackerTicket}
        onClose={closeTracker}
        title="สถานะงานซ่อม & ส่งคืนเครื่อง"
        subtitle={trackerTicket ? `${trackerTicket.ticket_no} · ${trackerTicket.customer_name}` : ''}
        icon={<Wrench className="w-5 h-5" />}
        maxWidthClass="max-w-2xl"
        accentClass="border-[#FF6B00]/40"
        footer={
          trackerTicket ? (
            <div className="flex items-center justify-between gap-2 w-full">
              <button
                type="button"
                onClick={() => setPrintModalTicket(trackerTicket)}
                className={modalSecondaryBtnClass}
              >
                <Printer className="w-4 h-4 text-[#FF6B00]" />
                <span>พิมพ์ใบรับซ่อม</span>
              </button>
              <button type="button" onClick={closeTracker} className={modalSecondaryBtnClass}>
                ปิด
              </button>
            </div>
          ) : undefined
        }
      >
        {trackerTicket && (
          <div className="space-y-3.5">
            {/* Status + Received Date */}
            <div className="flex items-center justify-between gap-2 flex-wrap">
              {renderLifecycleBadge(trackerTicket)}
              <span className="text-xs text-slate-500 dark:text-slate-400">
                รับเครื่อง: {formatThaiDateTime(trackerTicket.received_at)}
              </span>
            </div>

            {/* Unified Info Card (ลดกล่องซ้ำซ้อน อ่านจบในกรอบเดียว) */}
            <div className="rounded-2xl border border-slate-200 dark:border-white/[0.08] bg-slate-50/70 dark:bg-white/[0.02] p-3.5 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">ลูกค้า</span>
                  <div className="text-sm font-bold text-slate-900 dark:text-white mt-0.5">{trackerTicket.customer_name}</div>
                  {trackerTicket.customer_phone && (
                    toTelHref(trackerTicket.customer_phone) ? (
                      <a
                        href={toTelHref(trackerTicket.customer_phone)!}
                        title="กดเพื่อโทรออก"
                        className="inline-flex items-center gap-1 mt-0.5 text-emerald-700 dark:text-emerald-300 font-semibold hover:underline cursor-pointer"
                      >
                        <Phone className="w-3 h-3" /> {trackerTicket.customer_phone}
                      </a>
                    ) : (
                      <div className="text-slate-600 dark:text-slate-300 flex items-center gap-1 mt-0.5">
                        <Phone className="w-3 h-3" /> {trackerTicket.customer_phone}
                      </div>
                    )
                  )}
                </div>
                <div>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">เครื่อง / S/N</span>
                  <div className="text-sm font-bold text-slate-900 dark:text-white mt-0.5">{trackerTicket.device_model || '-'}</div>
                  <div className="text-slate-600 dark:text-slate-300 font-mono flex items-center gap-1 mt-0.5">
                    <Hash className="w-3 h-3" /> {trackerTicket.walkin_sn || '-'}
                  </div>
                </div>
                <div>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">ช่างซ่อมผู้รับผิดชอบ</span>
                  <div className="text-sm font-bold text-slate-900 dark:text-white mt-0.5">{trackerTicket.repaired_by || 'ยังไม่มอบหมาย'}</div>
                </div>
                <div>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">ค่าซ่อม (ประมาณ)</span>
                  <div className="text-sm font-extrabold font-mono text-[#FF6B00] mt-0.5">
                    {trackerTicket.repair_cost != null ? `฿${trackerTicket.repair_cost.toLocaleString()}` : 'รอประเมิน'}
                  </div>
                </div>
              </div>

              <div className="pt-2.5 border-t border-slate-200 dark:border-white/[0.08] space-y-1.5 text-xs">
                <div>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">อาการเสีย: </span>
                  <span className="text-slate-900 dark:text-white font-medium">{trackerTicket.fault_symptom}</span>
                </div>
                {trackerTicket.repair_detail && (
                  <div>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400">รายละเอียดการซ่อม: </span>
                    <span className="text-slate-800 dark:text-slate-200">{trackerTicket.repair_detail}</span>
                  </div>
                )}
              </div>
            </div>

            {/* RMA tracking */}
            {(trackerTicket.service_type === 'rma_claim' || trackerTicket.rma_supplier) && (
              <div className="rounded-xl border border-violet-500/30 bg-violet-500/5 p-3 space-y-1">
                <p className="text-xs font-bold text-violet-700 dark:text-violet-300 flex items-center gap-1.5">
                  <RotateCcw className="w-3.5 h-3.5" /> ข้อมูลส่งเคลมศูนย์ (RMA)
                </p>
                <div className="grid grid-cols-2 gap-2 text-xs text-slate-600 dark:text-slate-300">
                  <span>ศูนย์: <b>{trackerTicket.rma_supplier || '-'}</b></span>
                  <span>เลขเคลม: <b>{trackerTicket.rma_tracking_no || '-'}</b></span>
                  <span>ส่งเคลม: <b>{trackerTicket.rma_sent_date ? formatDateDMY(trackerTicket.rma_sent_date) : '-'}</b></span>
                  <span>ได้คืน: <b>{trackerTicket.rma_returned_date ? formatDateDMY(trackerTicket.rma_returned_date) : '-'}</b></span>
                </div>
                {trackerTicket.repair_status === 'rma_sent' && (
                  <p className="text-xs font-bold text-violet-600 dark:text-violet-400 pt-1">
                    ส่งเคลมแล้ว {getElapsedDays(trackerTicket.rma_sent_date) ?? 0} วัน
                  </p>
                )}
              </div>
            )}

            {/* ===== Handover panel (ready_pickup) ===== */}
            {trackerTicket.repair_status === 'ready_pickup' && (
              <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-3.5 space-y-3 animate-modal-pop">
                <p className="text-sm font-black text-emerald-700 dark:text-emerald-300 flex items-center gap-1.5">
                  <PackageCheck className="w-4 h-4" /> เครื่องซ่อมเสร็จแล้ว — เลือกวิธีส่งคืนลูกค้า
                </p>

                {handoverMode === 'none' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      onClick={() => setHandoverMode('self_pickup')}
                      className="flex items-start gap-2.5 p-3 rounded-xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.03] text-left hover:border-emerald-500/50 transition-all active:scale-[0.98]"
                    >
                      <Store className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                      <span className="min-w-0">
                        <span className="block text-sm font-bold text-slate-900 dark:text-white">ลูกค้ารับเองหน้าร้าน</span>
                        <span className="block text-[11px] text-slate-500 dark:text-slate-400">ปิดงานทันที · บันทึกผู้ส่งคืน "รับเองหน้าร้าน"</span>
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={confirmQueueForDispatch}
                      className="flex items-start gap-2.5 p-3 rounded-xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.03] text-left hover:border-[#FF6B00]/50 transition-all active:scale-[0.98]"
                    >
                      <Send className="w-5 h-5 text-[#FF6B00] shrink-0 mt-0.5" />
                      <span className="min-w-0">
                        <span className="block text-sm font-bold text-slate-900 dark:text-white">ส่งเข้าคิวจัดสายรถ</span>
                        <span className="block text-[11px] text-slate-500 dark:text-slate-400">ย้ายเข้าคิว "พร้อมส่งมอบ / จัดสายรถ" เพื่อมอบหมายช่าง Onsite</span>
                      </span>
                    </button>
                  </div>
                )}

                {handoverMode === 'self_pickup' && (
                  <div className="rounded-xl border border-emerald-500/30 bg-white dark:bg-white/[0.03] p-3 space-y-2">
                    <p className="text-xs text-slate-600 dark:text-slate-300">
                      ยืนยันว่าลูกค้ามารับเครื่องที่หน้าร้านแล้ว ระบบจะปิดงานและย้ายเข้า <b>ประวัติงานที่เสร็จสิ้น</b> ทันที
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={resetHandover} className={modalSecondaryBtnClass}>
                        <X className="w-4 h-4" /> ยกเลิก
                      </button>
                      <button type="button" onClick={confirmSelfPickup} className={modalPrimaryBtnClass}>
                        <CheckCircle2 className="w-4 h-4" /> ยืนยันลูกค้ารับเอง (ปิดงานทันที)
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {trackerTicket.photo_urls && trackerTicket.photo_urls.length > 0 && (
              <div className="rounded-2xl border border-slate-200 dark:border-white/[0.08] bg-slate-50 dark:bg-white/[0.03] p-3">
                <EvidencePhotoUploader
                  value={trackerTicket.photo_urls}
                  onChange={() => { }}
                  folder="onsite"
                  editable={false}
                  label="รูปถ่ายหลักฐานหน้างาน / รับเครื่อง"
                />
              </div>
            )}

            <LatestUpdateBadge logs={trackerTicket.activity_logs} />
            <ActivityTimeline logs={trackerTicket.activity_logs} />
          </div>
        )}
      </Modal>

      {/* Repair Receipt Print Preview Modal (mirrors OrderFormPrintModal) */}
      <RepairReceiptPrintModal
        isOpen={!!printModalTicket}
        onClose={() => setPrintModalTicket(null)}
        ticket={printModalTicket}
      />

      {/* ========================================================================= */}
      {/* SITE VISIT DISPATCH MODAL (PRJ-..., createPortal, z-[9999])               */}
      {/* ========================================================================= */}
      {dispatchProject && createPortal(
        <div
          className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4 animate-fade-in overscroll-contain"
          onClick={() => setDispatchProjectId(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-800 shadow-2xl rounded-t-3xl sm:rounded-3xl w-full sm:w-[92vw] max-w-4xl max-h-[94dvh] sm:max-h-[90vh] flex flex-col overflow-hidden pb-[env(safe-area-inset-bottom)] animate-modal-pop"
          >
            <div className="sm:hidden flex justify-center pt-2.5 pb-1 flex-shrink-0">
              <span className="h-1.5 w-10 rounded-full bg-slate-300 dark:bg-white/20" />
            </div>

            <div className="p-4 sm:p-5 bg-slate-50/90 dark:bg-slate-900/95 border-b border-slate-200 dark:border-slate-800 flex items-start justify-between gap-2 flex-shrink-0">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="px-2.5 py-0.5 rounded-lg bg-purple-600 text-white font-mono font-extrabold text-xs">
                    {dispatchProject.id}
                  </span>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold border ${getProjectDeadlineRisk(dispatchProject.due_date, dispatchProject.status).badgeCls}`}>
                    {getProjectDeadlineRisk(dispatchProject.due_date, dispatchProject.status).label}
                  </span>
                </div>
                <h3 className="text-sm sm:text-base font-extrabold mt-1">{dispatchProject.site_name}</h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  ลูกค้า: {dispatchProject.customer_name} ({dispatchProject.phone}) • กำหนดส่ง {formatDateDMY(dispatchProject.due_date)}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {!showScheduleForm && (
                  <button
                    type="button"
                    onClick={() => setShowScheduleForm(true)}
                    className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-[#FF6B00] to-[#E65A00] text-black font-extrabold text-xs cursor-pointer flex items-center gap-1.5 shadow-sm"
                  >
                    <Plus className="w-4 h-4" />
                    <span>+ นัดวันเข้าไซต์ &amp; จัดชุดช่าง</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setDispatchProjectId(null)}
                  className="p-2 rounded-xl bg-slate-100 dark:bg-white/[0.06] text-slate-500 dark:text-slate-300 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto overscroll-contain p-4 sm:p-6 space-y-5 text-xs">
              {showScheduleForm && (
                <form onSubmit={handleSubmitScheduleSiteVisit} className="p-4 rounded-2xl bg-indigo-50/70 dark:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-500/30 space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-extrabold text-indigo-900 dark:text-indigo-200 flex items-center gap-1.5">
                      <Calendar className="w-4 h-4" />
                      <span>นัดวันเข้าไซต์ &amp; จัดชุดช่าง (แจ้งจัดซื้อ/ช่างเตรียมล่วงหน้า 1 วัน)</span>
                    </h4>
                    <button
                      type="button"
                      onClick={() => setShowScheduleForm(false)}
                      className="text-[11px] font-bold text-slate-500 hover:text-slate-900 dark:hover:text-white cursor-pointer"
                    >
                      ซ่อนฟอร์ม
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className={modalLabelClass}>วันที่เข้าไซต์ (Visit Date) *</label>
                      <input
                        type="date"
                        required
                        value={visitDate}
                        onChange={(e) => setVisitDate(e.target.value)}
                        className={modalInputClass}
                      />
                    </div>
                    <div>
                      <label className={modalLabelClass}>ช่วงเวลา *</label>
                      <select
                        value={visitTimeSlot}
                        onChange={(e) => setVisitTimeSlot(e.target.value)}
                        className={modalInputClass}
                      >
                        <option value="09:00 - 17:00">เต็มวัน (09:00 - 17:00)</option>
                        <option value="ช่วงเช้า (08:30-12:00)">ช่วงเช้า (08:30 - 12:00)</option>
                        <option value="ช่วงบ่าย (13:00-17:30)">ช่วงบ่าย (13:00 - 17:30)</option>
                      </select>
                    </div>
                    <div>
                      <label className={modalLabelClass}>ขอบเขตงานวันนี้ *</label>
                      <input
                        type="text"
                        required
                        value={visitScope}
                        onChange={(e) => setVisitScope(e.target.value)}
                        placeholder="เช่น เดินสายอาคาร 1 + ติด AP 8 ตัว"
                        className={modalInputClass}
                      />
                    </div>
                  </div>

                  <div>
                    <label className={modalLabelClass}>เลือกชุดช่าง Onsite สำหรับรอบนี้ *</label>
                    <div className="flex flex-wrap gap-2">
                      {(onsiteTechs.length > 0 ? onsiteTechs.map(u => u.name) : ['ช่างเอ', 'ช่างบี', 'ช่างซี', 'ช่างดี']).map(techName => {
                        const selected = visitTechs.includes(techName);
                        return (
                          <button
                            key={techName}
                            type="button"
                            onClick={() =>
                              setVisitTechs(prev =>
                                prev.includes(techName) ? prev.filter(t => t !== techName) : [...prev, techName]
                              )
                            }
                            className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition cursor-pointer ${
                              selected
                                ? 'bg-[#FF6B00] text-black border-[#FF6B00] shadow-sm'
                                : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700'
                            }`}
                          >
                            {selected ? '✓ ' : ''}{techName}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <label className={modalLabelClass}>เลือกสินค้า / อุปกรณ์ที่จะเบิกไปหน้างานในรอบนี้ (ไม่บังคับ)</label>
                    <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                      {(dispatchProject.items || []).map(pi => {
                        const remaining = Math.max(0, pi.qty_required - pi.qty_allocated);
                        return (
                          <div key={pi.id} className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 flex items-center justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <div className="font-bold text-slate-900 dark:text-white truncate">{pi.model_name}</div>
                              <div className="text-[10px] text-slate-500 font-mono">
                                {pi.item_type === 'equipment' ? 'อุปกรณ์หลัก (ต้องเทส/ติดวอย)' : 'วัสดุสิ้นเปลือง/ค่าแรง'} • ค้างเบิก {remaining}/{pi.qty_required}
                              </div>
                            </div>
                            <input
                              type="number"
                              min={0}
                              max={pi.qty_required}
                              value={visitItemQtyMap[pi.id] ?? 0}
                              onChange={(e) => {
                                const val = Math.max(0, parseInt(e.target.value) || 0);
                                setVisitItemQtyMap(prev => ({ ...prev, [pi.id]: val }));
                              }}
                              className="w-20 rounded-lg px-2 py-1 text-xs font-mono text-center bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700"
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setShowScheduleForm(false)}
                      className={modalSecondaryBtnClass}
                    >
                      ยกเลิก
                    </button>
                    <button
                      type="submit"
                      className={modalPrimaryBtnClass}
                    >
                      <Check className="w-4 h-4 inline mr-1" />
                      บันทึกนัดเข้าไซต์ &amp; แจ้งเตรียมของ
                    </button>
                  </div>
                </form>
              )}

              <div className="space-y-2">
                <h4 className="font-extrabold text-slate-800 dark:text-slate-200">
                  รายการอุปกรณ์ &amp; งานคงค้างในโปรเจกต์ ({dispatchProject.items.length} รายการ)
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {dispatchProject.items.map(pi => {
                    const remaining = Math.max(0, pi.qty_required - pi.qty_allocated);
                    return (
                      <div key={pi.id} className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-bold truncate">{pi.model_name}</div>
                          <div className="text-[10px] text-slate-500 font-mono">
                            สัญญา {pi.qty_required} • เบิกแล้ว {pi.qty_allocated} • ค้าง {remaining}
                          </div>
                        </div>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0 ${
                          remaining === 0
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300'
                            : 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300'
                        }`}>
                          {remaining === 0 ? 'เบิกครบ' : `ค้าง ${remaining}`}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-2">
                <h4 className="font-extrabold text-slate-800 dark:text-slate-200">
                  ตารางรอบเข้าไซต์ที่นัดหมายแล้ว ({dispatchProject.site_visits?.length || 0} รอบ)
                </h4>
                {!dispatchProject.site_visits || dispatchProject.site_visits.length === 0 ? (
                  <div className="p-6 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 text-center text-slate-500">
                    ยังไม่มีรอบเข้าไซต์ — กด &quot;+ นัดวันเข้าไซต์ &amp; จัดชุดช่าง&quot; ด้านบน
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {dispatchProject.site_visits.map((sv, idx) => (
                      <div key={sv.id} className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 space-y-1.5">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-extrabold text-indigo-700 dark:text-indigo-300">
                              รอบ #{idx + 1} ({sv.id}) • {formatDateDMY(sv.visit_date)} ({sv.time_slot})
                            </span>
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              sv.prep_status === 'ready_for_pickup' || sv.prep_status === 'dispatched'
                                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300'
                                : sv.prep_status === 'prepping'
                                  ? 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300'
                                  : 'bg-rose-100 text-rose-800 dark:bg-rose-500/20 dark:text-rose-300'
                            }`}>
                              {sv.prep_status === 'pending_stock' ? 'รอจัดซื้อตัดสต๊อก' :
                               sv.prep_status === 'prepping' ? 'ช่างเตรียมกำลังเทส/ติดวอย' :
                               sv.prep_status === 'ready_for_pickup' ? 'ของพร้อมขึ้นรถ' : 'จ่ายออกแล้ว'}
                            </span>
                          </div>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            sv.visit_status === 'completed'
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300'
                              : 'bg-sky-100 text-sky-800 dark:bg-sky-500/20 dark:text-sky-300'
                          }`}>
                            {sv.visit_status === 'completed' ? 'ปิดรอบแล้ว' : sv.visit_status === 'in_progress' ? 'กำลังเข้าไซต์' : 'รอดำเนินการ'}
                          </span>
                        </div>
                        <div className="font-bold text-slate-900 dark:text-white">{sv.visit_scope}</div>
                        <div className="text-[11px] text-slate-600 dark:text-slate-300">
                          ทีมช่าง: <strong>{sv.assigned_techs.join(', ')}</strong>
                          {sv.items_to_take.length > 0 && ` • รายการที่เบิก: ${sv.items_to_take.map(i => `${i.name} x${i.qty}`).join(', ')}`}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ========================================================================= */}
      {/* SCHEDULE JOB MODAL (z-[9999])                                             */}
      {/* ========================================================================= */}
      {scheduleTarget && createPortal(
        <div
          className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4 animate-fade-in overscroll-contain"
          onClick={() => setScheduleTarget(null)}
        >
          <form
            onSubmit={handleConfirmScheduleJob}
            onClick={(e) => e.stopPropagation()}
            className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-800 shadow-2xl rounded-t-3xl sm:rounded-3xl w-full sm:w-[92vw] max-w-lg p-5 space-y-4 pb-[env(safe-area-inset-bottom)] animate-modal-pop"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <h3 className="text-sm sm:text-base font-extrabold truncate">ลงตารางวิ่งงานล่วงหน้า (Schedule Job)</h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{scheduleTarget.title} • {scheduleTarget.subtitle}</p>
              </div>
              <button
                type="button"
                onClick={() => setScheduleTarget(null)}
                className="p-2 rounded-xl bg-slate-100 dark:bg-white/[0.06] text-slate-500 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* ข้อมูลลูกค้า เบอร์โทร และสถานที่ส่งมอบ (ป้องกันลงคิวผิด) */}
            {(() => {
              let custName = '-';
              let custPhone = '-';
              let custDistrict = '-';
              let custAddress = '-';
              let jobDetail = '';
              let dueStr = '';
              if (scheduleTarget.kind === 'repair') {
                const t = scheduleTarget.ticket;
                custName = t.customer_name || '-';
                custPhone = t.customer_phone || '-';
                custDistrict = t.district || '-';
                custAddress = t.district || '-';
                jobDetail = `${t.device_model || 'เครื่องซ่อม'}${t.walkin_sn ? ` (S/N: ${t.walkin_sn})` : ''} — ${t.fault_symptom || ''}`;
                dueStr = t.due_date ? formatDateDMY(t.due_date) : '';
              } else {
                const it = scheduleTarget.item;
                const ord = orders.find(o => o.id === it.order_id);
                const prj = projects.find(p => p.id === it.project_id);
                custName = prj?.customer_name || ord?.customer_name || '-';
                custPhone = prj?.phone || ord?.customer_phone || '-';
                custDistrict = prj?.district || ord?.district || '-';
                custAddress = prj?.location || ord?.delivery_location || '-';
                jobDetail = `${it.model_name}${it.serial_number ? ` (S/N: ${it.serial_number})` : ''}${ord?.site_notes ? ` — ${ord.site_notes}` : ''}`;
                const d = prj?.due_date || ord?.delivery_date;
                dueStr = d ? formatDateDMY(d) : '';
              }
              return (
                <div className="rounded-2xl border border-slate-200 dark:border-white/[0.08] bg-slate-50 dark:bg-white/[0.03] p-3 space-y-1.5 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-extrabold text-slate-900 dark:text-white flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5 text-[#FF6B00] shrink-0" />
                      <span>{custName}</span>
                    </span>
                    {toTelHref(custPhone) ? (
                      <a
                        href={toTelHref(custPhone)!}
                        title="กดเพื่อโทรออก"
                        className="font-mono font-bold text-emerald-700 dark:text-emerald-300 flex items-center gap-1 hover:underline cursor-pointer"
                      >
                        <Phone className="w-3 h-3 shrink-0" />
                        <span>{custPhone}</span>
                      </a>
                    ) : (
                      <span className="font-mono font-bold text-slate-500 flex items-center gap-1">
                        <Phone className="w-3 h-3 shrink-0" />
                        <span>{custPhone}</span>
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-slate-600 dark:text-slate-300 flex items-start gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400 shrink-0 mt-0.5" />
                    <span>
                      <strong>{custDistrict}</strong> • {custAddress}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-700 dark:text-slate-200 pt-1 border-t border-slate-200 dark:border-white/[0.06] flex flex-wrap items-center justify-between gap-2">
                    <span className="truncate">{jobDetail}</span>
                    {dueStr && (
                      <span className="font-mono font-bold text-[#FF6B00] shrink-0">กำหนดส่ง: {dueStr}</span>
                    )}
                  </div>
                </div>
              );
            })()}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <label className={modalLabelClass}>วันที่วิ่งงาน (Scheduled Date) *</label>
                <input
                  type="date"
                  required
                  value={schedDate}
                  onChange={(e) => setSchedDate(e.target.value)}
                  className={modalInputClass}
                />
              </div>
              <div>
                <label className={modalLabelClass}>ช่วงเวลา *</label>
                <select
                  value={schedTimeSlot}
                  onChange={(e) => setSchedTimeSlot(e.target.value as 'เช้า' | 'บ่าย' | 'ทั้งวัน')}
                  className={modalInputClass}
                >
                  <option value="เช้า">ช่วงเช้า</option>
                  <option value="บ่าย">ช่วงบ่าย</option>
                  <option value="ทั้งวัน">ทั้งวัน</option>
                </select>
              </div>
            </div>

            <div className="text-xs">
              <label className={modalLabelClass}>สายรถ / โซน *</label>
              <select
                value={schedRouteZone}
                onChange={(e) => setSchedRouteZone(e.target.value)}
                className={modalInputClass}
              >
                {ROUTE_ZONE_OPTIONS.map(z => (
                  <option key={z} value={z}>{z}</option>
                ))}
              </select>
            </div>

            <div className="text-xs">
              <label className={modalLabelClass}>ทีมช่างที่รับผิดชอบ *</label>
              <div className="flex flex-wrap gap-2">
                {(onsiteTechs.length > 0 ? onsiteTechs.map(u => u.name) : ['ช่างเอ', 'ช่างบี', 'ช่างซี', 'ช่างดี']).map(techName => {
                  const selected = schedTechs.includes(techName);
                  return (
                    <button
                      key={techName}
                      type="button"
                      onClick={() =>
                        setSchedTechs(prev =>
                          prev.includes(techName) ? prev.filter(t => t !== techName) : [...prev, techName]
                        )
                      }
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition cursor-pointer ${
                        selected
                          ? 'bg-[#FF6B00] text-black border-[#FF6B00] shadow-sm'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700'
                      }`}
                    >
                      {selected ? '✓ ' : ''}{techName}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setScheduleTarget(null)}
                className={modalSecondaryBtnClass}
              >
                ยกเลิก
              </button>
              <button
                type="submit"
                className={modalPrimaryBtnClass}
              >
                <Check className="w-4 h-4 inline mr-1" />
                บันทึกลงตารางวิ่งงาน
              </button>
            </div>
          </form>
        </div>,
        document.body
      )}

      {/* Morning Briefing A4 Print Preview Modal */}
      <MorningBriefingPrintModal
        isOpen={morningBriefingOpen}
        onClose={() => setMorningBriefingOpen(false)}
        targetDate={rosterDate}
        onDateChange={(d) => setRosterDate(d)}
        rows={morningBriefingRows}
        preparedBy={currentUser?.name || 'หน้าร้าน'}
      />

      {/* Tomorrow / Daily Job Dispatch Roster Sheet (ONSITE SERVICE + INSTALLATION) */}
      <OnsiteDispatchRosterModal
        isOpen={dispatchRosterOpen}
        onClose={() => setDispatchRosterOpen(false)}
        targetDate={rosterDate}
        onDateChange={(d) => setRosterDate(d)}
        orders={orders}
        items={items}
        projects={projects}
        repairTickets={repairTickets}
        vehicleMap={vehicleMap}
        onUpdateVehiclePlate={handleUpdateVehiclePlate}
        customTeamBlocks={customTeamBlocks}
        onAddCustomTeamBlock={handleAddCustomTeamBlock}
        availableTechs={onsiteTechs.map(u => u.name)}
      />

      {/* Onsite Daily Report A4 Print Preview Modal */}
      <OnsiteDailyReportPrintModal
        isOpen={onsiteReportPrintOpen}
        onClose={() => setOnsiteReportPrintOpen(false)}
        selectedDate={reportShowAllDates ? '' : reportDate}
        onDateChange={(d) => {
          setReportDate(d);
          setReportShowAllDates(false);
        }}
        jobs={
          reportTechFilter === 'all'
            ? onsiteCompletedJobs
            : onsiteCompletedJobs.filter((j) => j.techs.includes(reportTechFilter))
        }
        projects={projects}
        preparedBy={currentUser?.name || 'หน้าร้าน'}
      />
    </div>
  );
};
