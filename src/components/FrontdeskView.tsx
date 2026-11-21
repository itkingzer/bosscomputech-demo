import React, { useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import {
  Wrench, Truck, PackageCheck, PhoneCall, Plus, Search, Printer,
  MapPin, Phone, User, CheckCircle2, ScanLine,
  Package, RotateCcw, ClipboardList, ArrowRight, AlertCircle,
  Building2, Hash, Check, ChevronRight, FileText, Store, Send, X
} from 'lucide-react';
import {
  Modal, modalInputClass, modalLabelClass,
  modalPrimaryBtnClass, modalSecondaryBtnClass
} from './ui/Modal';
import {
  RepairTicket, RepairLifecycleStatus, REPAIR_LIFECYCLE_META,
  ROUTE_DEFINITIONS, RouteCode, getRouteByDistrict, getElapsedDays,
  formatDateDMY, formatThaiDateTime, JobCategory,
  getDeliveryUrgency, DeliveryUrgencyInfo
} from '../types';
import { ListControls, useListControls } from './ListControls';
import { ActivityTimeline, LatestUpdateBadge } from './ActivityTimeline';
import { BarcodeScannerModal } from './BarcodeScannerModal';
import { lookupPurchaseBySn } from '../utils/snLookup';

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

const ACCESSORY_PRESETS = [
  'Adapter / หม้อแปลง',
  'สาย Power',
  'สายชาร์จ',
  'สายสัญญาณ (LAN/HDMI/USB)',
  'กระเป๋า / กล่อง',
  'ตัวเครื่องเปล่า (ไม่มีอุปกรณ์ติดมา)'
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
type TabId = 'counter' | 'tracker';

export const FrontdeskView: React.FC = () => {
  const {
    currentUser, users, orders, items, repairTickets,
    createRepairTicket, createOnsiteServiceCall,
    applyVoidAndDispatch, assignOnsite, assignRepairTicketOnsite,
    selfPickupRepairTicket, dispatchRepairReturnOnsite, queueRepairTicketForDispatch,
    triggerPrintRepairReceipt, updateOrderDeliveryDate, updateRepairTicketDueDate
  } = useApp();

  const [activeTab, setActiveTab] = useState<TabId>('counter');
  const [toast, setToast] = useState('');
  const showToast = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(''), 3500);
  };

  const onsiteTechs = useMemo(
    () => users.filter(u => u.role === 'onsite'),
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
  // PILLAR 1A — Walk-in Repair Intake
  // =========================================================================
  const [intakeOpen, setIntakeOpen] = useState(false);
  const [intakeScannerOpen, setIntakeScannerOpen] = useState(false);
  const [inName, setInName] = useState('');
  const [inPhone, setInPhone] = useState('');
  const [inDevice, setInDevice] = useState('');
  const [inSn, setInSn] = useState('');
  const [inSymptom, setInSymptom] = useState('');
  const [inAccessories, setInAccessories] = useState<string[]>(['Adapter / หม้อแปลง']);
  const [inAccessoriesOther, setInAccessoriesOther] = useState('');
  const [inDistrict, setInDistrict] = useState('เมืองสุราษฎร์ธานี');
  const [inMatchedItemId, setInMatchedItemId] = useState<string | null>(null);
  const [inAutoFilledSn, setInAutoFilledSn] = useState<string | null>(null);
  const [lastIntakeTicket, setLastIntakeTicket] = useState<RepairTicket | null>(null);

  const inSnLookup = useMemo(
    () => lookupPurchaseBySn(inSn, items, orders, repairTickets),
    [inSn, items, orders, repairTickets]
  );

  const handleInSnChange = (val: string) => {
    setInSn(val);
    const res = lookupPurchaseBySn(val, items, orders, repairTickets);
    if (res.found) {
      if (res.customerName) setInName(res.customerName);
      if (res.customerPhone) setInPhone(res.customerPhone);
      if (res.deviceModel) setInDevice(res.deviceModel);
      if (res.district && DISTRICT_OPTIONS.some(d => d.district === res.district)) {
        setInDistrict(res.district);
      }
      setInMatchedItemId(res.itemId);
      setInAutoFilledSn(val.trim());
    } else if (inAutoFilledSn && val.trim() !== inAutoFilledSn) {
      setInMatchedItemId(null);
      setInAutoFilledSn(null);
    }
  };

  const clearInAutoFill = () => {
    setInName('');
    setInPhone('');
    setInDevice('');
    setInMatchedItemId(null);
    setInAutoFilledSn(null);
  };

  const resetIntake = () => {
    setInName(''); setInPhone(''); setInDevice(''); setInSn('');
    setInSymptom(''); setInAccessories(['Adapter / หม้อแปลง']);
    setInAccessoriesOther(''); setInDistrict('เมืองสุราษฎร์ธานี');
    setInMatchedItemId(null); setInAutoFilledSn(null);
  };

  const toggleAccessory = (acc: string) => {
    if (acc === 'ตัวเครื่องเปล่า (ไม่มีอุปกรณ์ติดมา)') {
      setInAccessories(prev => (prev.includes(acc) ? [] : [acc]));
      return;
    }
    setInAccessories(prev => {
      const cleaned = prev.filter(a => a !== 'ตัวเครื่องเปล่า (ไม่มีอุปกรณ์ติดมา)');
      return cleaned.includes(acc) ? cleaned.filter(a => a !== acc) : [...cleaned, acc];
    });
  };

  const submitIntake = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inName.trim() || !inSymptom.trim()) {
      showToast('กรุณากรอกชื่อลูกค้าและอาการเสีย');
      return;
    }
    const created = await createRepairTicket({
      item_id: inMatchedItemId,
      walkin_sn: inSn.trim(),
      customer_name: inName.trim(),
      customer_phone: inPhone.trim() || null,
      intake_channel: 'front_desk_walkin',
      device_model: inDevice.trim() || null,
      accessories: inAccessories,
      accessories_other: inAccessoriesOther.trim() || null,
      fault_symptom: inSymptom.trim(),
      repair_detail: null,
      parts_used: null,
      repair_outcome: null,
      district: inDistrict,
      route_code: getRouteByDistrict(inDistrict),
      delivery_location: '',
      job_category: 'repair_pickup',
      assigned_techs: [],
      assigned_onsite_tech: null,
      finished_at: null,
      received_by: currentUser?.name || 'ระบบ',
      received_channel: 'front_desk',
      service_type: 'in_house_repair',
      repair_status: 'pending_check'
    });
    setLastIntakeTicket(created);
    setIntakeOpen(false);
    resetIntake();
    showToast('สร้างใบรับซ่อมสำเร็จ ส่งเข้าคิวช่างซ่อมในร้านแล้ว');
  };

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
  // =========================================================================
  const readyItems = useMemo(
    () => items.filter(i => i.status === 'prepped_in_stock' || i.status === 'ready_for_dispatch'),
    [items]
  );

  const awaitingDispatchTickets = useMemo(
    () => repairTickets.filter(t => t.status === 'awaiting_dispatch'),
    [repairTickets]
  );

  const [dispatchSearch, setDispatchSearch] = useState('');
  const [dispatchRouteFilter, setDispatchRouteFilter] = useState<'all' | RouteCode>('all');
  const [dispatchTarget, setDispatchTarget] = useState<
    { type: 'item'; itemId: string } | { type: 'repair'; ticketId: string } | null
  >(null);
  const [dispatchVoidDate, setDispatchVoidDate] = useState('');
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
    setDispatchVoidDate(it?.void_date || new Date().toISOString().slice(0, 10));
    setDispatchDueDate(ord?.delivery_date || '');
    setDispatchRoute(ord?.route_code || (ord?.district ? getRouteByDistrict(ord.district) : 'route_5'));
    setDispatchTechs([]);
  };

  const openDispatchTicket = (ticketId: string) => {
    const t = repairTickets.find(x => x.id === ticketId);
    setDispatchTarget({ type: 'repair', ticketId });
    setDispatchVoidDate('');
    setDispatchDueDate(t?.due_date || '');
    setDispatchRoute(t?.route_code || (t?.district ? getRouteByDistrict(t.district) : 'route_5'));
    setDispatchTechs(t?.assigned_techs || []);
  };

  const toggleDispatchTech = (name: string) => {
    setDispatchTechs(prev => (prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name]));
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
      await applyVoidAndDispatch(dispatchItem.id, dispatchVoidDate);
      await assignOnsite(dispatchItem.id, dispatchTechs, 'delivery');
      setDispatchTarget(null);
      showToast('แปะวอยประกันและจัดสายรถส่งมอบเรียบร้อยแล้ว');
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
      if (i.status !== 'prepped_in_stock' && i.status !== 'ready_for_dispatch') return false;
      const ord = i.order_id ? orders.find(o => o.id === i.order_id) : null;
      return ord?.delivery_mode === 'customer_pickup';
    }),
    [items, orders]
  );

  const [pickupItemId, setPickupItemId] = useState<string | null>(null);
  const [pickupVoidDate, setPickupVoidDate] = useState('');
  const pickupItem = pickupItemId ? items.find(i => i.id === pickupItemId) : null;
  const pickupOrder = pickupItem?.order_id ? orders.find(o => o.id === pickupItem.order_id) : null;

  const openPickup = (itemId: string) => {
    const it = items.find(i => i.id === itemId);
    setPickupItemId(itemId);
    setPickupVoidDate(it?.void_date || new Date().toISOString().slice(0, 10));
  };

  const confirmPickup = async () => {
    if (!pickupItem) return;
    await applyVoidAndDispatch(pickupItem.id, pickupVoidDate);
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

  // 2) ส่งเข้าคิวจัดสายรถ (ให้ช่าง Onsite ส่งคืน)
  const confirmQueueForDispatch = async () => {
    if (!trackerTicket) return;
    await queueRepairTicketForDispatch(trackerTicket.id);
    closeTracker();
    showToast('ส่งเครื่องซ่อมเข้าคิวจัดสายรถเรียบร้อยแล้ว');
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
      {toast && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[10001] px-4 py-2.5 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-sm font-bold shadow-xl animate-modal-pop">
          {toast}
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2">
            <ClipboardList className="w-6 h-6 text-[#FF6B00]" />
            ฝ่ายหน้าร้าน · รับแจ้ง & จัดส่ง
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            รับเครื่องซ่อม · รับแจ้งเหตุ Onsite · จัดส่งมอบ · ติดตามงานซ่อม/RMA
          </p>
        </div>
        <div className="flex items-center gap-1 p-1 rounded-2xl bg-slate-100 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] self-start">
          <button
            type="button"
            onClick={() => setActiveTab('counter')}
            className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold transition-colors ${activeTab === 'counter'
              ? 'bg-white dark:bg-white/[0.1] text-[#FF6B00] shadow-sm'
              : 'text-slate-500 dark:text-slate-400'
              }`}
          >
            เคาน์เตอร์
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('tracker')}
            className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold transition-colors ${activeTab === 'tracker'
              ? 'bg-white dark:bg-white/[0.1] text-[#FF6B00] shadow-sm'
              : 'text-slate-500 dark:text-slate-400'
              }`}
          >
            ติดตามงานซ่อม & RMA
          </button>
        </div>
      </div>

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
                <span className="block text-sm sm:text-base font-black">รับเครื่องซ่อมหน้าร้าน</span>
                <span className="block text-[11px] sm:text-xs text-white/85">Walk-in Repair Intake</span>
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
                <span className="block text-sm sm:text-base font-black">รับแจ้งเหตุ / นัดช่างออกหน้างาน</span>
                <span className="block text-[11px] sm:text-xs text-white/85">Onsite Service / Pickup Call</span>
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
              {pickupReadyTickets.map(t => (
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

          {/* Prepared orders & Repair returns awaiting dispatch */}
          <QueueSection
            icon={<Truck className="w-5 h-5" />}
            title="พร้อมส่งมอบ / จัดสายรถ"
            count={readyItems.length + awaitingDispatchTickets.length}
            accent="emerald"
            emptyText="ยังไม่มีสินค้าหรือเครื่องซ่อมที่รอจัดส่ง"
          >
            <div className="space-y-3">
              {/* Real-time search bar for Route Dispatch Queue */}
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={dispatchSearch}
                  onChange={(e) => { setDispatchSearch(e.target.value); dispatchList.resetPage(); }}
                  placeholder="ค้นหาชื่อลูกค้า / สินค้า / เลขบิล (ORD/REP) / สายรถ (1-6)..."
                  className={`${modalInputClass} pl-9 pr-8`}
                />
                {dispatchSearch && (
                  <button
                    type="button"
                    onClick={() => { setDispatchSearch(''); dispatchList.resetPage(); }}
                    aria-label="ล้างคำค้นหา"
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-md text-slate-400 hover:text-slate-700 dark:hover:text-white"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Quick Route Filter Pills */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                <button
                  type="button"
                  onClick={() => { setDispatchRouteFilter('all'); dispatchList.resetPage(); }}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-bold whitespace-nowrap border transition cursor-pointer ${dispatchRouteFilter === 'all'
                    ? 'bg-[#FF6B00] text-white border-[#FF6B00] shadow-sm'
                    : 'bg-white dark:bg-white/[0.04] text-slate-600 dark:text-slate-300 border-slate-200 dark:border-white/[0.08] hover:border-[#FF6B00]/40'
                    }`}
                >
                  ทุกสายรถ
                </button>
                {(Object.keys(ROUTE_DEFINITIONS) as RouteCode[]).map((rCode) => {
                  const r = ROUTE_DEFINITIONS[rCode];
                  const active = dispatchRouteFilter === rCode;
                  return (
                    <button
                      key={rCode}
                      type="button"
                      onClick={() => { setDispatchRouteFilter(rCode); dispatchList.resetPage(); }}
                      className={`px-2.5 py-1 rounded-full text-[11px] font-bold whitespace-nowrap border transition cursor-pointer ${active
                        ? 'bg-[#FF6B00] text-white border-[#FF6B00] shadow-sm'
                        : 'bg-white dark:bg-white/[0.04] text-slate-600 dark:text-slate-300 border-slate-200 dark:border-white/[0.08] hover:border-[#FF6B00]/40'
                        }`}
                    >
                      {r.shortName}
                    </button>
                  );
                })}
              </div>

              {/* Sort + Page Size + Pagination Controls */}
              {sortedDispatchEntries.length > 0 && (
                <ListControls
                  from={dispatchList.from}
                  to={dispatchList.to}
                  total={dispatchList.total}
                  page={dispatchList.page}
                  totalPages={dispatchList.totalPages}
                  pageSize={dispatchList.pageSize}
                  sort={dispatchList.sort}
                  onSortChange={dispatchList.setSort}
                  onPageSizeChange={dispatchList.setPageSize}
                  onPageChange={dispatchList.setPage}
                  unit="งาน"
                />
              )}

              {dispatchList.pageItems.length === 0 ? (
                <p className="text-xs text-slate-500 dark:text-slate-400 italic py-4 text-center">
                  ไม่พบรายการที่ตรงกับเงื่อนไขการค้นหา
                </p>
              ) : (
                dispatchList.pageItems.map(entry => {
                  if (entry.kind === 'item') {
                    const { item, ord, urgency } = entry;
                    const idLabel = ord?.sales_ref ? `${ord.sales_ref}${item.serial_number ? ` · ${item.serial_number}` : ''}` : (item.serial_number || item.id);
                    return (
                      <CompactCard
                        key={entry.id}
                        accent={urgency.tier === 'overdue' || urgency.tier === 'today' ? 'rose' : urgency.tier === 'soon' ? 'amber' : 'emerald'}
                        cardHighlightClass={getUrgencyCardHighlight(urgency)}
                        idLabel={idLabel}
                        title={ord?.customer_name || 'ไม่ระบุลูกค้า'}
                        subtitle={item.model_name}
                        phone={ord?.customer_phone}
                        routeCode={ord?.route_code}
                        itemSummary={ord?.delivery_location}
                        statusBadge={
                          <span className="text-[10px] font-bold px-2 py-1 rounded-lg border bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 shrink-0">
                            {item.status === 'ready_for_dispatch' ? 'ติดวอยแล้ว' : 'รอแปะวอย'}
                          </span>
                        }
                        meta={renderUrgencyAlert(urgency)}
                        actionLabel="จัดสายรถ & ส่งมอบ"
                        actionIcon={<Truck className="w-4 h-4" />}
                        onOpen={() => openDispatch(item.id)}
                      />
                    );
                  }

                  const { ticket, urgency } = entry;
                  return (
                    <CompactCard
                      key={entry.id}
                      accent={urgency.tier === 'overdue' || urgency.tier === 'today' ? 'rose' : 'amber'}
                      cardHighlightClass={getUrgencyCardHighlight(urgency)}
                      idLabel={ticket.ticket_no}
                      title={ticket.customer_name}
                      subtitle={ticket.device_model || 'ไม่ระบุรุ่นเครื่อง'}
                      phone={ticket.customer_phone}
                      routeCode={ticket.route_code}
                      itemSummary={`ส่งคืนเครื่องซ่อม • S/N: ${ticket.walkin_sn || '-'} • อาการ: ${ticket.fault_symptom}`}
                      statusBadge={
                        <span className="px-2 py-0.5 rounded-lg border bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30 text-[10px] font-bold shrink-0">
                          ส่งคืนเครื่องซ่อม ({ticket.ticket_no})
                        </span>
                      }
                      meta={renderUrgencyAlert(urgency)}
                      actionLabel="จัดสายรถ & ส่งมอบ"
                      actionIcon={<Truck className="w-4 h-4" />}
                      onOpen={() => openDispatchTicket(ticket.id)}
                    />
                  );
                })
              )}
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
              {pickupItems.map(item => {
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

      {/* ===================== MODAL: Walk-in Intake ===================== */}
      <Modal
        open={intakeOpen}
        onClose={() => setIntakeOpen(false)}
        title="รับเครื่องซ่อมหน้าร้าน"
        subtitle="Walk-in Repair Intake · สร้างใบรับซ่อมเข้าคิวช่างในร้าน"
        icon={<Wrench className="w-5 h-5" />}
        maxWidthClass="max-w-2xl"
        accentClass="border-[#FF6B00]/40"
        footer={
          <div className="flex gap-2">
            <button type="button" onClick={() => setIntakeOpen(false)} className={modalSecondaryBtnClass}>
              ยกเลิก
            </button>
            <button type="submit" form="intake-form" className={modalPrimaryBtnClass}>
              <Printer className="w-4 h-4" />
              บันทึก & พิมพ์ใบรับซ่อม
            </button>
          </div>
        }
      >
        <form id="intake-form" onSubmit={submitIntake} className="space-y-3.5">
          {/* S/N Smart Search & Auto-Fill */}
          <div className="rounded-2xl p-3.5 border border-slate-200 dark:border-white/[0.1] bg-slate-50 dark:bg-white/[0.03] space-y-2">
            <div className="flex items-center justify-between gap-2">
              <label className={modalLabelClass + ' mb-0'}>
                ค้นหาด้วย Serial Number (S/N) เพื่อดึงข้อมูลอัตโนมัติ
              </label>
              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                หรือกรอกข้อมูลเองด้านล่าง
              </span>
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={inSn}
                onChange={(e) => handleInSnChange(e.target.value)}
                placeholder="สแกนหรือพิมพ์ S/N เช่น BC-2026-001 (ถ้าซื้อจากร้านระบบจะกรอกให้เอง)"
                className={modalInputClass + ' font-mono'}
              />
              <button
                type="button"
                onClick={() => setIntakeScannerOpen(true)}
                className="shrink-0 px-3 rounded-xl bg-[#FF6B00]/15 hover:bg-[#FF6B00]/25 text-[#FF6B00] border border-[#FF6B00]/30 transition-colors active:scale-[0.97] cursor-pointer"
                aria-label="สแกนบาร์โค้ด S/N"
              >
                <ScanLine className="w-5 h-5" />
              </button>
            </div>

            {inSnLookup.found ? (
              <div className="rounded-xl p-2.5 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="text-emerald-800 dark:text-emerald-200 space-y-0.5">
                  <div className="font-bold flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <span>
                      พบข้อมูลในระบบ — กรอกชื่อลูกค้าและรุ่นเครื่องให้อัตโนมัติแล้ว
                    </span>
                  </div>
                  <div className="text-[11px] opacity-90 flex flex-wrap gap-x-3">
                    {(inSnLookup.billNo || inSnLookup.salesRef) && (
                      <span className="font-mono">
                        เอกสาร: {inSnLookup.billNo || inSnLookup.salesRef}
                      </span>
                    )}
                    <span>
                      ประกัน:{' '}
                      <strong>
                        {inSnLookup.warranty.state === 'active'
                          ? `อยู่ในประกัน (${inSnLookup.warranty.durationLabel}, หมด ${formatDateDMY(inSnLookup.warranty.expireDate)})`
                          : inSnLookup.warranty.state === 'expired'
                          ? `หมดประกันแล้ว (${formatDateDMY(inSnLookup.warranty.expireDate)})`
                          : inSnLookup.warranty.state === 'waiting'
                          ? `รอแปะวอย (${inSnLookup.warranty.durationLabel})`
                          : 'ไม่มีข้อมูลประกัน'}
                      </strong>
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={clearInAutoFill}
                  className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-white dark:bg-white/10 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-white/15 hover:bg-slate-100 dark:hover:bg-white/20 transition cursor-pointer"
                >
                  ล้างเพื่อกรอกเอง
                </button>
              </div>
            ) : inSn.trim().length >= 3 ? (
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                ไม่พบ S/N "{inSn.trim()}" ในประวัติการขาย — สามารถกรอกข้อมูลลูกค้าและรุ่นเครื่องเองด้านล่างได้เลย
              </p>
            ) : null}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={modalLabelClass}>ชื่อลูกค้า <span className="text-rose-500">*</span></label>
              <input
                type="text"
                value={inName}
                onChange={(e) => setInName(e.target.value)}
                placeholder="เช่น คุณสมชาย ใจดี"
                className={modalInputClass}
                required
              />
            </div>
            <div>
              <label className={modalLabelClass}>เบอร์โทรศัพท์</label>
              <input
                type="tel"
                value={inPhone}
                onChange={(e) => setInPhone(e.target.value)}
                placeholder="08x-xxx-xxxx"
                className={modalInputClass}
              />
            </div>
          </div>

          <div>
            <label className={modalLabelClass}>รุ่น / ประเภทเครื่อง</label>
            <input
              type="text"
              value={inDevice}
              onChange={(e) => setInDevice(e.target.value)}
              placeholder="เช่น Lenovo ThinkPad T14"
              className={modalInputClass}
            />
          </div>

          <div>
            <label className={modalLabelClass}>อาการเสีย / ปัญหา <span className="text-rose-500">*</span></label>
            <textarea
              value={inSymptom}
              onChange={(e) => setInSymptom(e.target.value)}
              rows={3}
              placeholder="อธิบายอาการเสียที่ลูกค้าแจ้ง"
              className={modalInputClass}
              required
            />
          </div>

          <div>
            <label className={modalLabelClass}>อุปกรณ์ที่ติดมาด้วย</label>
            <div className="flex flex-wrap gap-2">
              {ACCESSORY_PRESETS.map(acc => {
                const active = inAccessories.includes(acc);
                return (
                  <button
                    key={acc}
                    type="button"
                    onClick={() => toggleAccessory(acc)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors active:scale-[0.97] ${active
                      ? 'bg-[#FF6B00]/10 border-[#FF6B00]/50 text-[#FF6B00]'
                      : 'bg-white dark:bg-white/[0.03] border-slate-200 dark:border-white/[0.08] text-slate-600 dark:text-slate-300'
                      }`}
                  >
                    {acc}
                  </button>
                );
              })}
            </div>
            <input
              type="text"
              value={inAccessoriesOther}
              onChange={(e) => setInAccessoriesOther(e.target.value)}
              placeholder="อุปกรณ์อื่นๆ เพิ่มเติม (ถ้ามี)"
              className={`${modalInputClass} mt-2`}
            />
          </div>

          <div>
            <label className={modalLabelClass}>อำเภอ / เขตพื้นที่</label>
            <select
              value={inDistrict}
              onChange={(e) => setInDistrict(e.target.value)}
              className={modalInputClass}
            >
              {DISTRICT_OPTIONS.map(opt => (
                <option key={opt.district} value={opt.district}>
                  {opt.district} — {opt.zone}
                </option>
              ))}
            </select>
          </div>
        </form>
      </Modal>

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
          <div className="flex gap-2">
            <button type="button" onClick={() => setDispatchTarget(null)} className={modalSecondaryBtnClass}>
              ยกเลิก
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
              <div className="flex items-center gap-1.5 text-sm font-bold text-slate-900 dark:text-white">
                <User className="w-4 h-4 text-slate-400" />
                {dispatchOrder?.customer_name || 'ไม่ระบุลูกค้า'}
              </div>
              {dispatchOrder?.customer_phone && (
                <div className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
                  <Phone className="w-3.5 h-3.5" /> {dispatchOrder.customer_phone}
                </div>
              )}
              {dispatchOrder?.delivery_location && (
                <div className="flex items-start gap-1.5 text-xs text-slate-600 dark:text-slate-300">
                  <MapPin className="w-3.5 h-3.5 mt-0.5 shrink-0" /> {dispatchOrder.delivery_location}
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={modalLabelClass}>วันที่แปะวอยประกัน (เริ่มนับประกัน)</label>
                <input
                  type="date"
                  value={dispatchVoidDate}
                  onChange={(e) => setDispatchVoidDate(e.target.value)}
                  className={modalInputClass}
                />
              </div>
              <div>
                <label className={modalLabelClass}>วันกำหนดส่งมอบ (Delivery Date)</label>
                <input
                  type="date"
                  value={dispatchDueDate}
                  onChange={(e) => setDispatchDueDate(e.target.value)}
                  className={modalInputClass}
                />
              </div>
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
                <div className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
                  <Phone className="w-3.5 h-3.5" /> {pickupOrder.customer_phone}
                </div>
              )}
              <div className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
                <Hash className="w-3.5 h-3.5" /> S/N: {pickupItem.serial_number || '-'}
              </div>
            </div>

            <div>
              <label className={modalLabelClass}>วันที่แปะวอยประกัน (เริ่มนับประกัน)</label>
              <input
                type="date"
                value={pickupVoidDate}
                onChange={(e) => setPickupVoidDate(e.target.value)}
                className={modalInputClass}
              />
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
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={closeTracker} className={modalSecondaryBtnClass}>
                ปิด
              </button>
              <button
                type="button"
                onClick={() => {
                  triggerPrintRepairReceipt(trackerTicket);
                }}
                className={modalSecondaryBtnClass}
              >
                <Printer className="w-4 h-4" />
                พิมพ์ใบรับซ่อม
              </button>
              {trackerTicket.repair_status === 'ready_pickup' && handoverMode === 'none' && (
                <>
                  <button
                    type="button"
                    onClick={() => setHandoverMode('self_pickup')}
                    className={modalSecondaryBtnClass}
                  >
                    <Store className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    ลูกค้ารับเองหน้าร้าน (ปิดงานทันที)
                  </button>
                  <button
                    type="button"
                    onClick={confirmQueueForDispatch}
                    className={modalPrimaryBtnClass}
                  >
                    <Send className="w-4 h-4" />
                    ส่งเข้าคิวจัดสายรถ (ให้ช่าง Onsite ส่งคืน)
                  </button>
                </>
              )}
              {trackerTicket.repair_status === 'ready_pickup' && handoverMode === 'self_pickup' && (
                <>
                  <button type="button" onClick={resetHandover} className={modalSecondaryBtnClass}>
                    <X className="w-4 h-4" />
                    ยกเลิก
                  </button>
                  <button type="button" onClick={confirmSelfPickup} className={modalPrimaryBtnClass}>
                    <CheckCircle2 className="w-4 h-4" />
                    ยืนยันลูกค้ารับเอง (ปิดงานทันที)
                  </button>
                </>
              )}
            </div>
          ) : undefined
        }
      >
        {trackerTicket && (
          <div className="space-y-4">
            {/* Status + key info */}
            <div className="flex items-center justify-between gap-2 flex-wrap">
              {renderLifecycleBadge(trackerTicket)}
              <span className="text-xs text-slate-500 dark:text-slate-400">
                รับเครื่อง: {formatThaiDateTime(trackerTicket.received_at)}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div className="rounded-xl border border-slate-200 dark:border-white/[0.08] p-3">
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-0.5">ลูกค้า</p>
                <p className="text-sm font-bold text-slate-900 dark:text-white">{trackerTicket.customer_name}</p>
                {trackerTicket.customer_phone && (
                  <p className="text-xs text-slate-600 dark:text-slate-300 flex items-center gap-1 mt-0.5">
                    <Phone className="w-3 h-3" /> {trackerTicket.customer_phone}
                  </p>
                )}
              </div>
              <div className="rounded-xl border border-slate-200 dark:border-white/[0.08] p-3">
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-0.5">เครื่อง / S/N</p>
                <p className="text-sm font-bold text-slate-900 dark:text-white">{trackerTicket.device_model || '-'}</p>
                <p className="text-xs text-slate-600 dark:text-slate-300 flex items-center gap-1 mt-0.5">
                  <Hash className="w-3 h-3" /> {trackerTicket.walkin_sn || '-'}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 dark:border-white/[0.08] p-3">
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-0.5">ช่างซ่อมผู้รับผิดชอบ</p>
                <p className="text-sm font-bold text-slate-900 dark:text-white">{trackerTicket.repaired_by || 'ยังไม่มอบหมาย'}</p>
              </div>
              <div className="rounded-xl border border-slate-200 dark:border-white/[0.08] p-3">
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-0.5">ค่าซ่อม (ประมาณ)</p>
                <p className="text-sm font-bold text-slate-900 dark:text-white">
                  {trackerTicket.repair_cost != null ? `${trackerTicket.repair_cost.toLocaleString()} ฿` : 'รอประเมิน'}
                </p>
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

            {/* Symptom / repair detail */}
            <div className="rounded-xl border border-slate-200 dark:border-white/[0.08] p-3 space-y-1.5">
              <p className="text-[11px] text-slate-500 dark:text-slate-400">อาการเสีย</p>
              <p className="text-sm text-slate-800 dark:text-slate-200">{trackerTicket.fault_symptom}</p>
              {trackerTicket.repair_detail && (
                <>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 pt-1">รายละเอียดการซ่อม</p>
                  <p className="text-sm text-slate-800 dark:text-slate-200">{trackerTicket.repair_detail}</p>
                </>
              )}
            </div>

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

            <LatestUpdateBadge logs={trackerTicket.activity_logs} />
            <ActivityTimeline logs={trackerTicket.activity_logs} />
          </div>
        )}
      </Modal>

      {/* ===================== MODAL: Intake Receipt Preview ===================== */}
      <Modal
        open={!!lastIntakeTicket}
        onClose={() => setLastIntakeTicket(null)}
        title="สร้างใบรับซ่อมสำเร็จ"
        subtitle="พิมพ์ใบรับซ่อมสินค้า (ครึ่ง A4) ให้ลูกค้า"
        icon={<CheckCircle2 className="w-5 h-5" />}
        maxWidthClass="max-w-lg"
        accentClass="border-emerald-500/40"
        footer={
          <div className="flex gap-2">
            <button type="button" onClick={() => setLastIntakeTicket(null)} className={modalSecondaryBtnClass}>
              ปิด
            </button>
            <button
              type="button"
              onClick={() => {
                if (lastIntakeTicket) {
                  triggerPrintRepairReceipt(lastIntakeTicket);
                }
              }}
              className={modalPrimaryBtnClass}
            >
              <Printer className="w-4 h-4" />
              พิมพ์ใบรับซ่อม
            </button>
          </div>
        }
      >
        {lastIntakeTicket && (
          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2 rounded-xl bg-emerald-500/10 border border-emerald-500/30 p-3 text-emerald-700 dark:text-emerald-300">
              <CheckCircle2 className="w-5 h-5 shrink-0" />
              <span className="text-xs font-semibold">ส่งเข้าคิวช่างซ่อมในร้านเรียบร้อยแล้ว</span>
            </div>
            <div className="rounded-xl border border-slate-200 dark:border-white/[0.08] p-3 space-y-1.5">
              <div className="flex justify-between"><span className="text-slate-500 dark:text-slate-400">ลูกค้า</span><b className="text-slate-900 dark:text-white">{lastIntakeTicket.customer_name}</b></div>
              {lastIntakeTicket.customer_phone && (
                <div className="flex justify-between"><span className="text-slate-500 dark:text-slate-400">โทร</span><b className="text-slate-900 dark:text-white">{lastIntakeTicket.customer_phone}</b></div>
              )}
              <div className="flex justify-between"><span className="text-slate-500 dark:text-slate-400">เครื่อง</span><b className="text-slate-900 dark:text-white">{lastIntakeTicket.device_model || '-'}</b></div>
              <div className="flex justify-between"><span className="text-slate-500 dark:text-slate-400">S/N</span><b className="text-slate-900 dark:text-white">{lastIntakeTicket.walkin_sn || '-'}</b></div>
              <div className="flex justify-between"><span className="text-slate-500 dark:text-slate-400">ผู้รับเครื่อง</span><b className="text-slate-900 dark:text-white">{lastIntakeTicket.received_by}</b></div>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">{lastIntakeTicket.fault_symptom}</p>
          </div>
        )}
      </Modal>

      {/* Barcode scanner for intake S/N */}
      <BarcodeScannerModal
        open={intakeScannerOpen}
        onClose={() => setIntakeScannerOpen(false)}
        onScan={(code) => {
          handleInSnChange(code);
          setIntakeScannerOpen(false);
        }}
        title="สแกน S/N เครื่อง"
        hint="ส่องบาร์โค้ดที่ตัวเครื่องเพื่อกรอก Serial Number อัตโนมัติ"
      />
    </div>
  );
};
