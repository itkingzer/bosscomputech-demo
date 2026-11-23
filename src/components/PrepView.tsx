import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { useApp } from '../context/AppContext';
import {
  PackageSearch, BadgeCheck, CheckCircle, RefreshCw,
  Warehouse, Send, ShieldCheck, Layers, MapPin,
  UserCheck, PackagePlus, Lock, Camera, ClipboardList, ArrowRight, Search,
  AlertTriangle, X, Calendar, Clock
} from 'lucide-react';
import {
  ROUTE_DEFINITIONS, RouteCode, PRODUCT_CATEGORY_LABELS, Item,
  formatWarrantyDuration, getDeliveryUrgency, formatThaiDateTime
} from '../types';
import { ListControls, useListControls } from './ListControls';
import { ActivityTimeline, LatestUpdateBadge } from './ActivityTimeline';
import { BarcodeScannerModal } from './BarcodeScannerModal';
import { EvidencePhotoUploader } from './EvidencePhotoUploader';
import { ToastBanner } from './ui/ToastBanner';
import {
  Modal, modalInputClass, modalLabelClass,
  modalSecondaryBtnClass
} from './ui/Modal';

const renderDueBadge = (dueDateStr?: string | null, createdAtIso?: string | null) => {
  const urgency = getDeliveryUrgency(dueDateStr);
  if (!urgency.hasDate && !createdAtIso) return null;
  const badgeCls =
    urgency.tier === 'overdue'
      ? 'bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-500/15 dark:text-rose-300 dark:border-rose-500/30'
      : urgency.tier === 'today' || urgency.tier === 'soon'
        ? 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30'
        : 'bg-sky-100 text-sky-800 border-sky-300 dark:bg-sky-500/15 dark:text-sky-300 dark:border-sky-500/30';
  const suffix =
    urgency.tier === 'overdue'
      ? ` (เกินกำหนด ${urgency.overdueDays} วัน)`
      : urgency.tier === 'today'
        ? ' (ส่งวันนี้!)'
        : urgency.tier === 'soon'
          ? ` (อีก ${urgency.daysRemaining} วัน)`
          : '';
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      {urgency.hasDate && (
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold border ${badgeCls}`}>
          <Calendar className="w-3 h-3 shrink-0" />
          <span>กำหนดส่ง: {urgency.formattedDate}{suffix}</span>
        </span>
      )}
      {createdAtIso && (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium bg-slate-100 text-slate-600 border border-slate-200 dark:bg-white/[0.05] dark:text-slate-400 dark:border-white/[0.08]">
          <Clock className="w-3 h-3 shrink-0" />
          <span>เปิดงาน: {formatThaiDateTime(createdAtIso)}</span>
        </span>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Helpers: group identical items into a single stacked card
// ---------------------------------------------------------------------------
interface ItemGroup {
  key: string;
  items: Item[];
  model_name: string;
  order_id?: string | null;
  project_id?: string | null;
  project_batch_no?: number | null;
  po_no?: string;
  prep_note?: string;
  supplier?: string;
  delivery_mode?: Item['delivery_mode'];
  category?: Item['category'];
  unit_cost?: number;
}

const groupItems = (list: Item[]): ItemGroup[] => {
  const map = new Map<string, ItemGroup>();
  list.forEach((item) => {
    const key = item.project_id
      ? `prj::${item.project_id}::batch-${item.project_batch_no || 1}::${item.model_name}`
      : `${item.order_id || item.po_no || 'no-order'}::${item.model_name}`;
    const existing = map.get(key);
    if (existing) {
      existing.items.push(item);
    } else {
      map.set(key, {
        key,
        items: [item],
        model_name: item.model_name,
        order_id: item.order_id,
        project_id: item.project_id,
        project_batch_no: item.project_batch_no,
        po_no: item.po_no,
        prep_note: item.prep_note,
        supplier: item.supplier,
        delivery_mode: item.delivery_mode,
        category: item.category,
        unit_cost: item.unit_cost
      });
    }
  });
  return Array.from(map.values());
};

const DELIVERY_MODE_LABEL: Record<string, string> = {
  install: 'ส่งพร้อมติดตั้ง',
  drop_off: 'ส่งไม่ต้องติดตั้ง',
  customer_pickup: 'ลูกค้ารับเองหน้าร้าน'
};

// Step badge component (1 -> 2 -> 3)
const StepBadge: React.FC<{ step: number; label: string; active: boolean; done?: boolean }> = ({ step, label, active, done }) => (
  <div
    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold border whitespace-nowrap transition ${done
      ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
      : active
        ? 'bg-[#FF6B00]/20 text-[#FF6B00] border-[#FF6B00]/40'
        : 'bg-white/[0.03] text-slate-500 border-white/[0.08]'
      }`}
  >
    <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] ${done ? 'bg-emerald-500 text-black' : active ? 'bg-[#FF6B00] text-black' : 'bg-white/10 text-slate-400'}`}>
      {done ? '✓' : step}
    </span>
    <span>{label}</span>
  </div>
);

const DOA_DEFECT_CHIPS = [
  'เปิดไม่ติด / ไฟไม่เข้า',
  'จอ Dead Pixel / ภาพเพี้ยน',
  'มีรอยตำหนิ / บุบแตก',
  'อุปกรณ์ไม่ครบ'
] as const;

export const PrepView: React.FC = () => {
  const {
    items, orders, projects, acceptPrepTask,
    prepFinishToStock, prepFinishAndDispatch, prepFinishLogoToStageB, prepFinishProjectEquipment, applyVoidAndDispatch, currentUser,
    movePrepStockToReady, reportItemDOA
  } = useApp();

  // Tab state:
  // - 'stageA': Stage A — Stock PO Prep (!order_id / จากห้อง DOA -> เทส, สแกน S/N, ติดโลโก้ -> ยิงเข้า in_stock)
  // - 'stageB': Stage B — Customer Order Prep (order_id มีอยู่ -> ติดวอยประกัน / เก็บรอวันส่งมอบ)
  // - 'stage2': คิวรอติดวอยปล่อยของ (prepped_in_stock)
  // - 'stock': คลังสต๊อกพร้อมขาย (in_stock)
  const [prepTab, setPrepTab] = useState<'stageA' | 'stageB' | 'stage2' | 'stock'>('stageA');

  // Filter by route in outbound queue
  const [routeFilter, setRouteFilter] = useState<'all' | RouteCode>('all');

  // Stage 1: S/N inputs & notes (keyed by item id)
  const [snInputs, setSnInputs] = useState<Record<string, string>>({});
  const [prepNotesInputs] = useState<Record<string, string>>({});

  // Stage 2: Void date inputs (keyed by item id)
  const [voidDateInputs, setVoidDateInputs] = useState<Record<string, string>>({});

  // Prep Work Modal: which group is currently open (null = closed)
  const [activeGroupKey, setActiveGroupKey] = useState<string | null>(null);

  // Search filter for ready inventory history tab
  const [stockSearch, setStockSearch] = useState('');

  const [toast, setToast] = useState('');
  const todayStr = new Date().toISOString().split('T')[0];

  // Barcode scanner modal: which item S/N field is currently being scanned
  const [scanTarget, setScanTarget] = useState<string | null>(null);

  // Nested DOA Defect Report Modal state (z-[10000])
  const [doaTargetItem, setDoaTargetItem] = useState<Item | null>(null);
  const [doaSnInput, setDoaSnInput] = useState('');
  const [doaSelectedChips, setDoaSelectedChips] = useState<string[]>([]);
  const [doaNotesInput, setDoaNotesInput] = useState('');
  const [doaPhotos, setDoaPhotos] = useState<string[]>([]);

  // Stage A — ของที่ยังไม่ได้ติดโลโก้ (Stock PO, DOA, หรือออเดอร์/โปรเจกต์ที่เบิกจาก raw_stock/สร้างใหม่แล้วยังไม่ติดโลโก้)
  const stageAItems = items.filter(
    i => (i.status === 'pending_prep' && (!i.logo_applied || (!i.order_id && !i.project_id))) || i.status === 'pending_prep_stock'
  );

  // Stage B — ของที่ติดโลโก้ & สแกน S/N เรียบร้อยแล้ว และผูกออเดอร์หรือโปรเจกต์ (รอติดวอยประกัน / ส่งมอบ)
  const stageBItems = items.filter(
    i => i.status === 'pending_prep' && !!i.logo_applied && (!!i.order_id || !!i.project_id)
  );

  // Hold Queue: prepped_in_stock (เก็บรอวันส่งมอบ - รอแปะวอยปล่อยของ)
  const stage2Items = items.filter(i => i.status === 'prepped_in_stock');

  // Ready Inventory: in_stock (with search by S/N, model, or PO)
  const generalStockItems = items.filter(i => i.status === 'in_stock');
  const filteredGeneralStockItems = generalStockItems.filter(i => {
    const q = stockSearch.trim().toLowerCase();
    if (!q) return true;
    return (i.serial_number || '').toLowerCase().includes(q)
      || (i.model_name || '').toLowerCase().includes(q)
      || (i.po_no || '').toLowerCase().includes(q);
  });

  // Sort + pagination สำหรับการ์ดงานเตรียมของ (จัดกลุ่มแล้ว)
  const stageAList = useListControls(groupItems(stageAItems), {
    getDate: (g) => g.items[0]?.created_at,
    getValue: (g) => g.items.length,
    initialSort: 'newest',
  });
  const stageBList = useListControls(groupItems(stageBItems), {
    getDate: (g) => g.items[0]?.created_at,
    getValue: (g) => g.items.length,
    initialSort: 'newest',
  });
  const stage2List = useListControls(
    groupItems(
      stage2Items.filter(item => {
        if (routeFilter === 'all') return true;
        const order = orders.find(o => o.id === item.order_id);
        return order?.route_code === routeFilter;
      })
    ),
    {
      getDate: (g) => g.items[0]?.created_at,
      getValue: (g) => g.items.length,
      initialSort: 'newest',
    }
  );
  const generalStockList = useListControls(filteredGeneralStockItems, {
    getDate: (i) => i.prepped_at,
    initialSort: 'newest',
  });

  const currentTechName = currentUser?.name || 'ช่างกอล์ฟ (ช่างเตรียมสินค้า)';

  const openGroupModal = (key: string) => setActiveGroupKey(key);
  const closeGroupModal = () => setActiveGroupKey(null);

  const showToast = (msg: string, ms = 4000) => {
    setToast(msg);
    setTimeout(() => setToast(''), ms);
  };

  // Accept an entire stacked batch at once
  const handleAcceptGroup = (group: ItemGroup) => {
    group.items.forEach(it => {
      if (!it.assigned_prep_tech) acceptPrepTask(it.id, currentTechName);
    });
    showToast(`ช่าง "${currentTechName}" รับงานทั้งชุด ${group.items.length} เครื่องเรียบร้อยแล้ว`, 3500);
  };

  // Stage B Finish (Option 1): เก็บรอวันส่งมอบ (prepped_in_stock, ยังไม่ติดวอยประกัน)
  const handleFinishToHold = (item: Item): boolean => {
    const existingSn = (item.serial_number || '').trim();
    const sn = (snInputs[item.id] ?? existingSn).trim();
    if (!sn) {
      alert('กรุณาสแกนหรือระบุ Serial Number (S/N) ก่อนบันทึก');
      return false;
    }
    const note = prepNotesInputs[item.id] || 'เก็บรอวันส่งมอบ (ยังไม่ติดวอยประกัน)';

    const success = prepFinishToStock(item.id, sn, note);
    if (!success) {
      alert(`Serial Number "${sn}" นี้ถูกใช้งานแล้วในระบบ! โปรดใช้หมายเลขอื่น`);
      return false;
    }

    showToast(`เก็บ S/N: ${sn} รอวันส่งมอบ (prepped_in_stock) เรียบร้อยแล้ว`);
    return true;
  };

  // Stage B Finish (Option 2): ติดวอยประกัน & พร้อมส่งออกเลย -> ready_for_dispatch
  const handleFinishAndDispatch = (item: Item): boolean => {
    const existingSn = (item.serial_number || '').trim();
    const sn = (snInputs[item.id] ?? existingSn).trim();
    if (!sn) {
      alert('กรุณาสแกนหรือระบุ Serial Number (S/N) ก่อนติดวอยประกัน');
      return false;
    }
    const voidDate = voidDateInputs[item.id] || todayStr;
    const note = prepNotesInputs[item.id] || 'ติดวอยประกัน & พร้อมส่งออกเลย';

    const success = prepFinishAndDispatch(item.id, sn, voidDate, note);
    if (!success) {
      alert(`Serial Number "${sn}" นี้ถูกใช้งานแล้วในระบบ! โปรดใช้หมายเลขอื่น`);
      return false;
    }

    showToast(`ติดวอยประกัน (${voidDate}) ให้ S/N: ${sn} เรียบร้อย! ส่งตรงไปหน้าร้านจัดสายรถแล้ว`);
    return true;
  };

  // Project Batch Equipment Finish: ติดวอยประกัน & พร้อมส่งเข้าไซต์งาน -> assigned_onsite
  const handleFinishProjectEquipment = (item: Item): boolean => {
    const existingSn = (item.serial_number || '').trim();
    const sn = (snInputs[item.id] ?? existingSn).trim();
    if (!sn) {
      alert('กรุณาสแกนหรือระบุ Serial Number (S/N) ก่อนติดวอยประกันส่งเข้าไซต์งาน');
      return false;
    }
    const voidDate = voidDateInputs[item.id] || todayStr;
    const note = prepNotesInputs[item.id] || `ติดวอยประกัน & พร้อมส่งเข้าไซต์งาน ${item.project_id}`;

    const success = prepFinishProjectEquipment(item.id, sn, voidDate, note);
    if (!success) {
      alert(`Serial Number "${sn}" นี้ถูกใช้งานแล้วในระบบ! โปรดใช้หมายเลขอื่น`);
      return false;
    }

    showToast(`ติดวอยประกัน (${voidDate}) ให้ S/N: ${sn} เรียบร้อย! ส่งเข้าไซต์งาน ${item.project_id} • งวดที่ ${item.project_batch_no || 1} แล้ว`);
    return true;
  };
  // Hold Queue Finish: แปะวอยประกัน & ยืนยันปล่อยของออก (บันทึกวันที่ติดวอยผูกกับ S/N)
  const handleDispatchStage2 = (itemId: string, sn: string | null): boolean => {
    const voidDate = voidDateInputs[itemId] || todayStr;
    applyVoidAndDispatch(itemId, voidDate);

    showToast(`ติดวอยประกัน (${voidDate}) ให้เครื่อง S/N: ${sn || '-'} เรียบร้อย! ส่งไปหน้าร้านจัดสายรถแล้ว`);
    return true;
  };

  // Stage A Finish: เทส + สแกน S/N + ติดโลโก้ ->
  // - ถ้าเป็น Stock PO (!order_id && !project_id): ยิงเข้าคลังสต๊อกพร้อมขาย (in_stock)
  // - ถ้าผูกออเดอร์หรือโปรเจกต์แล้ว: ติดโลโก้เสร็จ -> ส่งต่อเข้า Stage B เพื่อติดวอยประกัน
  const handleStageAComplete = (item: Item): boolean => {
    const isLinkedJob = Boolean(item.order_id || item.project_id);
    const defaultSn = `BC-${isLinkedJob ? '' : 'STK-'}${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`;
    const sn = (snInputs[item.id] ?? item.serial_number ?? defaultSn).trim() || defaultSn;
    const note = prepNotesInputs[item.id] || (
      isLinkedJob
        ? 'เทสฮาร์ดแวร์ + สแกน S/N + ติดโลโก้เสร็จ → ส่งต่อ Stage B ติดวอยประกัน'
        : 'เทสฮาร์ดแวร์ + สแกน S/N + ติดโลโก้เสร็จ ยิงเข้าคลังพร้อมขาย (in_stock)'
    );

    const success = isLinkedJob
      ? prepFinishLogoToStageB(item.id, sn, note)
      : movePrepStockToReady(item.id, sn, note);
    if (!success) {
      alert(`Serial Number "${sn}" นี้ถูกใช้งานแล้วในระบบ! โปรดใช้หมายเลขอื่น`);
      return false;
    }

    showToast(
      isLinkedJob
        ? `ติดโลโก้เสร็จ → ส่ง S/N: ${sn} เข้า Stage B (รอติดวอยประกัน) เรียบร้อย!`
        : `ติดโลโก้เสร็จ → ยิง S/N: ${sn} เข้าคลังสต๊อกพร้อมขาย (in_stock) เรียบร้อย!`
    );
    return true;
  };

  const openDoaReportModal = (item: Item) => {
    const existingSn = (snInputs[item.id] ?? item.serial_number ?? '').trim();
    setDoaSnInput(existingSn);
    setDoaSelectedChips([]);
    setDoaNotesInput('');
    setDoaPhotos([]);
    setDoaTargetItem(item);
  };

  const toggleDoaChip = (chip: string) => {
    setDoaSelectedChips(prev =>
      prev.includes(chip) ? prev.filter(c => c !== chip) : [...prev, chip]
    );
  };

  const handleSubmitDoaReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!doaTargetItem) return;
    const combinedReason = [
      ...doaSelectedChips,
      doaNotesInput.trim()
    ].filter(Boolean).join(', ');
    if (!combinedReason) {
      alert('กรุณาเลือกอาการเสียอย่างน้อย 1 รายการ หรือระบุหมายเหตุเพิ่มเติม');
      return;
    }

    await reportItemDOA(doaTargetItem.id, {
      serialNumber: doaSnInput.trim(),
      reason: combinedReason,
      notes: doaNotesInput.trim() || undefined,
      photoUrls: doaPhotos.length > 0 ? doaPhotos : undefined
    });

    showToast(`แจ้งเคลม DOA (${combinedReason}) กลับฝ่ายจัดซื้อ PO เรียบร้อยแล้ว`);
    setDoaTargetItem(null);
  };

  const generateNewSn = (itemId: string) => {
    const newSn = `BC-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`;
    setSnInputs({ ...snInputs, [itemId]: newSn });
  };

  // ---------------------------------------------------------------------------
  // Reusable: single S/N row inside an unlocked stacked card
  // ---------------------------------------------------------------------------
  const renderSnRow = (item: Item, index: number, accent: 'amber' | 'emerald') => {
    const currentSn = snInputs[item.id] ?? item.serial_number ?? '';
    const accentText = accent === 'emerald' ? 'text-emerald-700 dark:text-emerald-300' : 'text-[#C2410C] dark:text-[#FF6B00]';
    const accentHover = accent === 'emerald' ? 'hover:text-emerald-600 dark:hover:text-emerald-400' : 'hover:text-[#FF6B00]';

    return (
      <div key={item.id} className="flex items-center gap-2">
        <span className="w-7 h-7 flex-shrink-0 rounded-lg bg-slate-200 dark:bg-white/[0.06] border border-slate-300 dark:border-white/[0.1] text-[10px] font-bold text-slate-700 dark:text-slate-300 flex items-center justify-center">
          #{index + 1}
        </span>
        <div className="relative flex-1">
          <input
            type="text"
            value={currentSn}
            onChange={(e) => setSnInputs({ ...snInputs, [item.id]: e.target.value })}
            placeholder={accent === 'emerald' ? 'สแกน / กรอก S/N (ว่าง = สุ่มอัตโนมัติ)' : 'สแกน / กรอก S/N'}
            className={`w-full liquid-glass-input rounded-xl pl-3 pr-16 py-2 text-sm font-mono font-bold data-key ${accentText} focus:outline-none`}
          />
          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
            <button
              type="button"
              onClick={() => setScanTarget(item.id)}
              title="สแกนด้วยกล้อง"
              className="p-1 rounded-lg text-slate-400 hover:text-[#FF6B00] hover:bg-white/[0.08] transition-all duration-150 active:scale-[0.97] cursor-pointer"
            >
              <Camera className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => generateNewSn(item.id)}
              title="สุ่ม S/N ใหม่"
              className={`p-1 rounded-lg text-slate-400 ${accentHover} hover:bg-white/[0.08] transition cursor-pointer`}
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <ToastBanner message={toast} onClose={() => setToast('')} />

      {/* Role Rule & Logic Banner: แยก Stage A (เข้าคลัง) และ Stage B (จัดส่งตามออเดอร์) ชัดเจน */}
      <div className="p-4 rounded-2xl liquid-glass border border-[#FF6B00]/40 flex items-start gap-3.5 text-slate-700 dark:text-slate-300 relative overflow-hidden">
        <div className="p-2 rounded-xl bg-[#FF6B00]/15 dark:bg-[#FF6B00]/20 text-[#C2410C] dark:text-[#FF6B00] border border-[#FF6B00]/30 flex-shrink-0">
          <ShieldCheck className="w-5 h-5" />
        </div>
        <div className="text-xs leading-relaxed">
          <strong className="font-bold text-sm block mb-0.5 text-slate-900 dark:text-white">ขั้นตอนช่างเตรียมสินค้า (ลดขั้นตอนซ้ำซ้อน):</strong>
          <span className="text-emerald-700 dark:text-emerald-300 font-bold">Stage A (Stock PO Prep):</span> รับของจากห้อง DOA → เทสฮาร์ดแวร์ สแกน S/N และ <strong className="text-slate-900 dark:text-white">ติดโลโก้ครั้งเดียว</strong> → ยิงเข้าคลังสต๊อกพร้อมขาย (<code className="font-mono">in_stock</code>)<br />
          <span className="text-[#C2410C] dark:text-[#FF6B00] font-bold">Stage B (Customer Order Prep):</span> สินค้าที่ตัดจากคลังพร้อมขายติดโลโก้ & สแกน S/N แล้ว → เลือก <strong className="text-slate-900 dark:text-white">เก็บรอวันส่งมอบ</strong> หรือ <strong className="text-slate-900 dark:text-white">ติดวอยประกัน & พร้อมส่งออกเลย</strong>
        </div>
      </div>

      {/* Prep View Tabs: Stage A vs Stage B vs รอติดวอยปล่อยของ vs คลังสต๊อกพร้อมขาย */}
      <div className="flex gap-2 pb-1 overflow-x-auto">
        <button
          onClick={() => setPrepTab('stageA')}
          className={`px-4 py-2.5 text-xs font-semibold rounded-2xl transition-all cursor-pointer flex items-center gap-2 whitespace-nowrap ${prepTab === 'stageA'
            ? 'liquid-glass-active font-extrabold shadow-lg shadow-emerald-500/25'
            : 'liquid-glass-card text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
        >
          <PackagePlus className="w-4 h-4" />
          <span>Stage A: เตรียมเข้าคลัง (Stock PO) ({stageAItems.length})</span>
        </button>

        <button
          onClick={() => setPrepTab('stageB')}
          className={`px-4 py-2.5 text-xs font-semibold rounded-2xl transition-all cursor-pointer flex items-center gap-2 whitespace-nowrap ${prepTab === 'stageB'
            ? 'liquid-glass-active font-extrabold shadow-lg shadow-[#FF6B00]/25'
            : 'liquid-glass-card text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
        >
          <PackageSearch className="w-4 h-4" />
          <span>Stage B: เตรียมส่งตามออเดอร์ ({stageBItems.length})</span>
        </button>

        <button
          onClick={() => setPrepTab('stage2')}
          className={`px-4 py-2.5 text-xs font-semibold rounded-2xl transition-all cursor-pointer flex items-center gap-2 whitespace-nowrap ${prepTab === 'stage2'
            ? 'liquid-glass-active font-extrabold shadow-lg shadow-[#FF6B00]/25'
            : 'liquid-glass-card text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
        >
          <Send className="w-4 h-4" />
          <span>รอติดวอยปล่อยของ ({stage2Items.length})</span>
        </button>

        <button
          onClick={() => setPrepTab('stock')}
          className={`px-4 py-2.5 text-xs font-semibold rounded-2xl transition-all cursor-pointer flex items-center gap-2 whitespace-nowrap ${prepTab === 'stock'
            ? 'liquid-glass-active font-extrabold shadow-lg shadow-[#FF6B00]/25'
            : 'liquid-glass-card text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
        >
          <Warehouse className="w-4 h-4" />
          <span>ประวัติเข้าคลังแล้ว ({generalStockItems.length})</span>
        </button>
      </div>

      {/* ========================================================================= */}
      {/* TAB: Stage A — Stock PO Prep (!order_id) -> เทส, สแกน S/N, ติดโลโก้ -> in_stock */}
      {/* ========================================================================= */}
      {prepTab === 'stageA' && (
        <div className="liquid-glass rounded-3xl p-6 sm:p-7 shadow-2xl border border-slate-200 dark:border-white/[0.08]">
          <div className="flex items-center justify-between gap-3 mb-5 flex-wrap">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <div className="p-2 rounded-xl bg-emerald-100 text-emerald-700 border border-emerald-300 dark:bg-emerald-500/15 dark:text-emerald-400 dark:border-emerald-500/30">
                  <PackagePlus className="w-5 h-5" />
                </div>
                <span>Stage A: เตรียมสินค้าเข้าคลัง (Stock PO) — เทส สแกน S/N ติดโลโก้</span>
              </h2>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                รับงานจากห้องสต๊อก DOA เทสฮาร์ดแวร์ สแกน S/N และติดโลโก้ BossComputech ครั้งเดียวแล้วยิงเข้าคลังพร้อมขาย (in_stock)
              </p>
            </div>
            <span className="text-xs font-semibold px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 dark:bg-emerald-500/15 dark:text-emerald-400 dark:border-emerald-500/30">
              {stageAItems.length} เครื่องรอเตรียมเข้าคลัง
            </span>
          </div>

          {stageAItems.length === 0 ? (
            <div className="text-center py-12 text-slate-500 border border-dashed border-slate-300 dark:border-white/[0.1] rounded-2xl">
              <CheckCircle className="w-10 h-10 mx-auto mb-2 text-emerald-500 dark:text-emerald-400 opacity-70" />
              <p className="text-sm font-medium text-slate-800 dark:text-slate-200">ไม่มีสินค้าจาก Stock PO ค้างเตรียมเข้าคลัง</p>
              <p className="text-xs text-slate-500 mt-0.5">สินค้าทุกชิ้นถูกเทส ติดโลโก้ และยิงเข้าคลังพร้อมขายเรียบร้อยแล้ว</p>
            </div>
          ) : (
            <div className="space-y-4">
              <ListControls
                from={stageAList.from}
                to={stageAList.to}
                total={stageAList.total}
                page={stageAList.page}
                totalPages={stageAList.totalPages}
                pageSize={stageAList.pageSize}
                sort={stageAList.sort}
                onSortChange={stageAList.setSort}
                onPageSizeChange={stageAList.setPageSize}
                onPageChange={stageAList.setPage}
                unit="งาน"
              />
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {stageAList.pageItems.map((group) => {
                  const isAccepted = group.items.every(it => !!it.assigned_prep_tech);

                  return (
                    <div
                      key={group.key}
                      className="p-5 rounded-2xl liquid-glass-card flex flex-col justify-between space-y-4 relative overflow-hidden border border-emerald-300 dark:border-emerald-500/25 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
                    >
                      <div className="absolute top-0 left-0 right-0 h-1 bg-emerald-500" />
                      <div>
                        <div className="flex items-center gap-1.5 flex-wrap mb-3">
                          <StepBadge step={1} label="รอกดรับงาน" active={!isAccepted} done={isAccepted} />
                          <StepBadge step={2} label="เทส & สแกน S/N + ติดโลโก้" active={isAccepted} />
                          <StepBadge step={3} label="เข้าคลังพร้อมขาย" active={false} />
                        </div>

                        <div className="flex items-center justify-between mb-2">
                          <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${isAccepted ? 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-500/15 dark:text-emerald-400 dark:border-emerald-500/30' : 'bg-slate-100 text-slate-700 border-slate-300 dark:bg-white/[0.05] dark:text-slate-400 dark:border-white/[0.1]'}`}>
                            {isAccepted ? 'กำลังเทส & ติดโลโก้' : 'รอช่างกดรับงาน'}
                          </span>
                          <span className="text-[11px] text-slate-500 font-mono data-meta">
                            PO: {group.po_no || '-'}
                          </span>
                        </div>

                        <div className="flex items-start justify-between gap-2 mb-1">
                          <h4 className="text-base font-bold text-slate-900 dark:text-white line-clamp-2">{group.model_name}</h4>
                          {group.items.length > 1 && (
                            <span className="flex-shrink-0 px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-900 border border-emerald-300 dark:bg-emerald-500/20 dark:text-emerald-300 dark:border-emerald-500/40 text-[11px] font-extrabold flex items-center gap-1">
                              <Layers className="w-3 h-3" />
                              จำนวน {group.items.length} เครื่อง
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5 flex-wrap mb-2">
                          {group.category && (
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-blue-100 text-blue-900 border border-blue-300 dark:bg-blue-500/15 dark:text-blue-300 dark:border-blue-500/30">
                              {PRODUCT_CATEGORY_LABELS[group.category]}
                            </span>
                          )}
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-purple-100 text-purple-900 border border-purple-300 dark:bg-purple-500/15 dark:text-purple-300 dark:border-purple-500/30">
                            Stock PO
                          </span>
                        </div>

                        <div className="mt-2 text-[11px] text-slate-600 dark:text-slate-400 flex justify-between data-meta">
                          <span>แหล่ง: {group.supplier || 'สต๊อกร้าน'}</span>
                          {group.unit_cost !== undefined && group.unit_cost > 0 && (
                            <span className="text-rose-700 dark:text-rose-300/80 font-mono font-bold data-key">ทุน ฿{group.unit_cost.toLocaleString('th-TH')}</span>
                          )}
                        </div>
                      </div>

                      <div className="pt-2 border-t border-slate-200 dark:border-white/[0.08]">
                        <button
                          onClick={() => openGroupModal(group.key)}
                          className="w-full py-2.5 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:brightness-105 text-black font-extrabold rounded-xl text-xs transition-all duration-150 cursor-pointer flex items-center justify-center gap-1.5 shadow-lg shadow-emerald-500/25 border border-white/20 active:scale-[0.97]"
                        >
                          <ClipboardList className="w-4 h-4" />
                          <span>{isAccepted ? 'เปิดจัดการ / เทส & ติดโลโก้' : 'เปิดจัดการ / กดรับงาน'}</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB: Stage B — Customer Order Prep (order_id exists) -> ติดวอย / รอส่งมอบ */}
      {/* ========================================================================= */}
      {prepTab === 'stageB' && (
        <div className="liquid-glass rounded-3xl p-6 sm:p-7 shadow-2xl border border-slate-200 dark:border-white/[0.08]">
          <div className="flex items-center justify-between gap-3 mb-5 flex-wrap">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <div className="p-2 rounded-xl bg-amber-100 text-amber-700 border border-amber-300 dark:bg-amber-500/15 dark:text-amber-400 dark:border-amber-500/30">
                  <PackageSearch className="w-5 h-5" />
                </div>
                <span>Stage B: เตรียมส่งตามออเดอร์ — ติดวอยประกัน / เก็บรอวันส่งมอบ</span>
              </h2>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                เครื่องที่ตัดจากคลังพร้อมขายติดโลโก้ & สแกน S/N เรียบร้อยแล้ว เลือกเก็บรอวันส่งมอบ หรือติดวอยประกันเพื่อปล่อยรถจัดส่ง
              </p>
            </div>
            <span className="text-xs font-semibold px-3 py-1 rounded-full bg-amber-100 text-amber-800 border border-amber-300 dark:bg-amber-500/15 dark:text-amber-400 dark:border-amber-500/30">
              {stageBItems.length} เครื่องรอจัดส่งตามออเดอร์
            </span>
          </div>

          {stageBItems.length === 0 ? (
            <div className="text-center py-12 text-slate-500 border border-dashed border-slate-300 dark:border-white/[0.1] rounded-2xl">
              <CheckCircle className="w-10 h-10 mx-auto mb-2 text-emerald-500 dark:text-emerald-400 opacity-70" />
              <p className="text-sm font-medium text-slate-800 dark:text-slate-200">ไม่มีรายการสินค้าตามออเดอร์ค้างเตรียม</p>
              <p className="text-xs text-slate-500 mt-0.5">สินค้าทุกออเดอร์ถูกเก็บรอวันส่งมอบ หรือติดวอยพร้อมส่งออกเรียบร้อยแล้ว</p>
            </div>
          ) : (
            <div className="space-y-4">
              <ListControls
                from={stageBList.from}
                to={stageBList.to}
                total={stageBList.total}
                page={stageBList.page}
                totalPages={stageBList.totalPages}
                pageSize={stageBList.pageSize}
                sort={stageBList.sort}
                onSortChange={stageBList.setSort}
                onPageSizeChange={stageBList.setPageSize}
                onPageChange={stageBList.setPage}
                unit="งาน"
              />
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {stageBList.pageItems.map((group) => {
                  const order = orders.find(o => o.id === group.order_id);
                  const project = group.project_id ? projects.find(p => p.id === group.project_id) : null;
                  const isProjectGroup = Boolean(group.project_id);
                  const rCode = order?.route_code || project?.route_code;
                  const rMeta = rCode ? ROUTE_DEFINITIONS[rCode] : null;
                  const isAccepted = group.items.every(it => !!it.assigned_prep_tech);
                  const deliveryLabel = isProjectGroup
                    ? 'อุปกรณ์หลักเข้าไซต์งานโปรเจกต์'
                    : (DELIVERY_MODE_LABEL[group.delivery_mode || 'install'] || 'ส่งพร้อมติดตั้ง');
                  const hasLogoApplied = group.items.some(it => it.logo_applied || !!it.logo_scanned_at || !!it.serial_number);

                  return (
                    <div
                      key={group.key}
                      className={`p-5 rounded-2xl liquid-glass-card flex flex-col justify-between space-y-4 relative overflow-hidden border transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md ${
                        isProjectGroup
                          ? 'border-purple-400 dark:border-purple-500/40'
                          : isAccepted
                            ? 'border-amber-400 dark:border-amber-500/30'
                            : 'border-slate-200 dark:border-white/[0.08]'
                      }`}
                    >
                      {isProjectGroup ? (
                        <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-purple-500 to-[#FF6B00]" />
                      ) : (
                        isAccepted && <div className="absolute top-0 left-0 right-0 h-1 bg-amber-500" />
                      )}

                      <div>
                        {/* Project Batch Tag Banner */}
                        {isProjectGroup && (
                          <div className="mb-2.5 flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-xl bg-purple-100 text-purple-900 border border-purple-300 dark:bg-purple-500/20 dark:text-purple-200 dark:border-purple-500/40">
                            <span className="text-[11px] font-extrabold font-mono truncate">
                              [โปรเจกต์] {group.project_id} • งวดเบิกที่ {group.project_batch_no || 1}
                            </span>
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-extrabold bg-purple-600 text-white shrink-0">
                              เฉพาะอุปกรณ์หลัก
                            </span>
                          </div>
                        )}

                        {/* Step badges */}
                        <div className="flex items-center gap-1.5 flex-wrap mb-3">
                          <StepBadge step={1} label="รอกดรับงาน" active={!isAccepted} done={isAccepted} />
                          <StepBadge step={2} label={isProjectGroup ? 'เซ็ตอัพ S/N & ติดวอยส่งเข้าไซต์งาน' : 'ติดวอย / รอวันส่งมอบ'} active={isAccepted} />
                        </div>

                        {/* Top Header */}
                        <div className="flex items-center justify-between mb-2">
                          <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full border ${isAccepted ? 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-500/15 dark:text-amber-400 dark:border-amber-500/30' : 'bg-slate-100 text-slate-700 border-slate-300 dark:bg-white/[0.05] dark:text-slate-400 dark:border-white/[0.1]'}`}>
                            {isAccepted ? (isProjectGroup ? 'พร้อมติดวอยส่งเข้าไซต์งาน' : 'พร้อมติดวอย / ส่งมอบ') : 'รอช่างกดรับงาน'}
                          </span>
                          <span className="text-[11px] text-slate-500 font-mono data-meta">
                            {isProjectGroup ? `${group.project_id} • งวดที่ ${group.project_batch_no || 1}` : `บิล: ${order?.bill_no || group.po_no || '-'}`}
                          </span>
                        </div>

                        {/* Route & Delivery Mode & Logo Applied Badges */}
                        <div className="flex items-center gap-1.5 flex-wrap mb-2">
                          {rMeta && (
                            <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${rMeta.badgeBg} ${rMeta.badgeBorder} ${rMeta.badgeText}`}>
                              {rMeta.shortName} • {order?.district || project?.district || '-'}
                            </span>
                          )}
                          <span className={`px-2 py-0.5 rounded-md text-[10px] font-semibold border ${
                            isProjectGroup
                              ? 'bg-purple-100 text-purple-900 border-purple-300 dark:bg-purple-500/15 dark:text-purple-300 dark:border-purple-500/30'
                              : 'bg-blue-100 text-blue-900 border-blue-300 dark:bg-blue-500/15 dark:text-blue-300 dark:border-blue-500/30'
                          }`}>
                            {deliveryLabel}
                          </span>
                          {hasLogoApplied && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-100 text-emerald-900 border border-emerald-300 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30">
                              <BadgeCheck className="w-3 h-3" />
                              ติดโลโก้เรียบร้อยแล้ว
                            </span>
                          )}
                        </div>

                        <div className="flex items-start justify-between gap-2 mb-1">
                          <h4 className="text-base font-bold text-slate-900 dark:text-white line-clamp-2">{group.model_name}</h4>
                          {group.items.length > 1 && (
                            <span className="flex-shrink-0 px-2.5 py-1 rounded-lg bg-amber-100 text-amber-900 border border-amber-300 dark:bg-amber-500/20 dark:text-amber-300 dark:border-amber-500/40 text-[11px] font-extrabold flex items-center gap-1">
                              <Layers className="w-3 h-3" />
                              จำนวน {group.items.length} เครื่อง
                            </span>
                          )}
                        </div>
                        {isProjectGroup && project ? (
                          <div className="space-y-0.5">
                            <p className="text-xs text-purple-800 dark:text-purple-300 font-bold truncate">{project.site_name}</p>
                            <p className="text-xs text-slate-600 dark:text-slate-300 data-meta">ลูกค้า: <strong className="text-slate-900 dark:text-white font-bold">{project.customer_name}</strong></p>
                          </div>
                        ) : (
                          <p className="text-xs text-slate-600 dark:text-slate-300 data-meta">ลูกค้า: <strong className="text-slate-900 dark:text-white font-bold">{order ? order.customer_name : '-'}</strong></p>
                        )}

                        {renderDueBadge(
                          isProjectGroup ? project?.due_date : order?.delivery_date,
                          isProjectGroup ? project?.created_at : (order?.created_at_log || order?.created_at || group.items[0]?.created_at)
                        )}

                        {/* Accepted Status */}
                        {isAccepted && (
                          <div className="mt-2 text-[10px] text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
                            <UserCheck className="w-3.5 h-3.5" />
                            <span>ผู้รับงาน: {group.items[0].assigned_prep_tech}</span>
                          </div>
                        )}
                      </div>

                      <div className="pt-2 border-t border-slate-200 dark:border-white/[0.08]">
                        <button
                          onClick={() => openGroupModal(group.key)}
                          className="w-full py-2.5 bg-gradient-to-r from-[#FF6B00] to-[#E65A00] hover:from-[#FF8A24] hover:brightness-105 text-black font-extrabold rounded-xl text-xs transition-all duration-150 cursor-pointer flex items-center justify-center gap-1.5 shadow-lg shadow-[#FF6B00]/25 border border-white/20 active:scale-[0.97]"
                        >
                          <ClipboardList className="w-4 h-4" />
                          <span>{isAccepted ? 'เปิดจัดการ / ติดวอย & ส่งมอบ' : 'เปิดจัดการ / กดรับงาน'}</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: รอติดวอยปล่อยของ (prepped_in_stock — เก็บรอวันส่งมอบ) */}
      {/* ========================================================================= */}
      {prepTab === 'stage2' && (
        <div className="liquid-glass rounded-3xl p-6 sm:p-7 shadow-2xl border border-slate-200 dark:border-white/[0.08]">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <div className="p-2 rounded-xl bg-emerald-100 text-emerald-700 border border-emerald-300 dark:bg-emerald-500/15 dark:text-emerald-400 dark:border-emerald-500/30">
                  <Send className="w-5 h-5" />
                </div>
                <span>คิวรอติดวอยปล่อยของ (เก็บรอวันส่งมอบ)</span>
              </h2>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                ออเดอร์ที่เก็บรอวันส่งมอบ (ติดโลโก้ & S/N แล้ว) — เมื่อถึงวันส่งจริงให้ติดวอยประกันเพื่อเริ่มนับประกันและส่งไปหน้าร้านจัดสายรถ
              </p>
            </div>
            <span className="text-xs font-semibold px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 dark:bg-emerald-500/15 dark:text-emerald-400 dark:border-emerald-500/30">
              {stage2Items.length} เครื่องรอติดวอย
            </span>
          </div>

          {/* Route Filter Pills */}
          <div className="flex items-center gap-1.5 mb-5 pb-1 overflow-x-auto text-xs">
            <span className="text-slate-600 dark:text-slate-400 font-medium whitespace-nowrap mr-1">แยกตามสายรถ:</span>
            <button
              onClick={() => setRouteFilter('all')}
              className={`px-3 py-1.5 rounded-xl font-semibold transition cursor-pointer whitespace-nowrap ${routeFilter === 'all'
                ? 'bg-slate-900 text-white dark:bg-white/20 dark:text-white border border-slate-900 dark:border-white/40 shadow-sm'
                : 'bg-slate-100 text-slate-600 hover:text-slate-900 border border-slate-200 dark:bg-white/[0.04] dark:text-slate-400 dark:hover:text-white dark:border-white/[0.06]'
                }`}
            >
              ทั้งหมด ({stage2Items.length})
            </button>
            {(Object.keys(ROUTE_DEFINITIONS) as RouteCode[]).map((rCode) => {
              const r = ROUTE_DEFINITIONS[rCode];
              const count = stage2Items.filter(item => {
                const order = orders.find(o => o.id === item.order_id);
                return order?.route_code === rCode;
              }).length;

              return (
                <button
                  key={rCode}
                  onClick={() => setRouteFilter(rCode)}
                  className={`px-3 py-1.5 rounded-xl font-semibold transition cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${routeFilter === rCode
                    ? `${r.badgeBg} ${r.badgeText} ${r.badgeBorder} border shadow-md font-bold`
                    : 'bg-slate-100 text-slate-600 hover:text-slate-900 border border-slate-200 dark:bg-white/[0.04] dark:text-slate-400 dark:hover:text-slate-200 dark:border-white/[0.06]'
                    }`}
                >
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: r.color }}></span>
                  <span>{r.shortName}</span>
                  <span className="text-[10px] opacity-75">({count})</span>
                </button>
              );
            })}
          </div>

          {stage2Items.length === 0 ? (
            <div className="text-center py-12 text-slate-500 border border-dashed border-slate-300 dark:border-white/[0.1] rounded-2xl">
              <CheckCircle className="w-10 h-10 mx-auto mb-2 text-emerald-500 dark:text-emerald-400 opacity-60" />
              <p className="text-sm font-medium text-slate-700 dark:text-slate-200">ไม่มีสินค้าค้างแปะวอยปล่อยของ</p>
              <p className="text-xs text-slate-500 mt-0.5">สินค้าทุกชิ้นถูกส่งมอบให้ทีมรถ Onsite หรือส่งมอบให้ลูกค้าเรียบร้อยแล้ว</p>
            </div>
          ) : (
            <div className="space-y-4">
              <ListControls
                from={stage2List.from}
                to={stage2List.to}
                total={stage2List.total}
                page={stage2List.page}
                totalPages={stage2List.totalPages}
                pageSize={stage2List.pageSize}
                sort={stage2List.sort}
                onSortChange={stage2List.setSort}
                onPageSizeChange={stage2List.setPageSize}
                onPageChange={stage2List.setPage}
                unit="งาน"
              />
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {stage2List.pageItems.map((group) => {
                  const order = orders.find(o => o.id === group.order_id);
                  const routeMeta = order?.route_code ? ROUTE_DEFINITIONS[order.route_code] : null;
                  const isAccepted = group.items.every(it => !!it.assigned_prep_tech);
                  const deliveryLabel = DELIVERY_MODE_LABEL[group.delivery_mode || 'install'] || 'ส่งพร้อมติดตั้ง';

                  return (
                    <div
                      key={group.key}
                      className="p-5 rounded-2xl liquid-glass-card flex flex-col justify-between space-y-4 relative overflow-hidden border-emerald-500/30 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
                    >
                      <div className="absolute top-0 left-0 right-0 h-1 bg-emerald-500" />

                      <div>
                        {/* Step badges */}
                        <div className="flex items-center gap-1.5 flex-wrap mb-3">
                          <StepBadge step={1} label="รอกดรับงาน" active={false} done />
                          <StepBadge step={2} label="กำลังเตรียม/ติดโลโก้" active={false} done />
                          <StepBadge step={3} label="พร้อมส่ง/ติดวอย" active={isAccepted} />
                        </div>

                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 dark:bg-emerald-500/15 dark:text-emerald-400 dark:border-emerald-500/30">
                            พร้อมส่งในสต๊อก (รอแปะวอย)
                          </span>
                          {group.items.length > 1 && (
                            <span className="px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-800 border border-emerald-300 dark:bg-emerald-500/20 dark:text-emerald-300 dark:border-emerald-500/40 text-[11px] font-extrabold flex items-center gap-1">
                              <Layers className="w-3 h-3" />
                              จำนวน {group.items.length} เครื่อง
                            </span>
                          )}
                        </div>

                        {/* Route & Delivery Mode */}
                        <div className="flex items-center gap-1.5 flex-wrap mb-2">
                          {routeMeta && (
                            <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${routeMeta.badgeBg} ${routeMeta.badgeBorder} ${routeMeta.badgeText}`}>
                              {routeMeta.shortName} • {order?.district || ''}
                            </span>
                          )}
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-blue-100 text-blue-800 border border-blue-300 dark:bg-blue-500/15 dark:text-blue-300 dark:border-blue-500/30">
                            {deliveryLabel}
                          </span>
                        </div>

                        <h4 className="text-base font-bold text-slate-900 dark:text-white mb-1 line-clamp-2">{group.model_name}</h4>
                        {/* Warranty duration awaiting sticker */}
                        <div className="mb-2">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30">
                            <ShieldCheck className="w-3 h-3" />
                            รอแปะวอยเพื่อเริ่มนับประกัน ({group.items[0]?.warranty_years || 0} ปี)
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 dark:text-slate-300 font-medium data-meta">ลูกค้า: <strong className="text-slate-900 dark:text-white font-bold">{order ? order.customer_name : '-'}</strong></p>
                        {renderDueBadge(
                          order?.delivery_date,
                          order?.created_at_log || order?.created_at || group.items[0]?.created_at
                        )}
                        <p className="text-xs text-slate-500 mt-1 flex items-start gap-1 data-meta">
                          <MapPin className="w-3.5 h-3.5 text-slate-400 flex-shrink-0 mt-0.5" />
                          <span className="line-clamp-2">
                            {order ? `${order.delivery_location}` : '-'}
                          </span>
                        </p>
                      </div>

                      <div className="pt-3 border-t border-white/[0.08]">
                        <button
                          onClick={() => openGroupModal(group.key)}
                          className="w-full py-2.5 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:brightness-105 text-black font-extrabold rounded-xl text-xs transition-all duration-150 cursor-pointer flex items-center justify-center gap-1.5 shadow-lg shadow-emerald-500/25 border border-white/20 active:scale-[0.97]"
                        >
                          <ClipboardList className="w-4 h-4" />
                          <span>{isAccepted ? 'เปิดจัดการ / แปะวอยปล่อยของ' : 'เปิดจัดการ / กดรับงาน'}</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 4: ประวัติเครื่องที่เตรียมเข้าคลังแล้ว (in_stock — Read-Only + ค้นหา S/N) */}
      {/* ========================================================================= */}
      {prepTab === 'stock' && (
        <div className="liquid-glass rounded-3xl p-6 shadow-2xl border border-slate-200 dark:border-white/[0.08]">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <div className="p-2 rounded-xl bg-emerald-100 text-emerald-700 border border-emerald-300 dark:bg-emerald-500/15 dark:text-emerald-400 dark:border-emerald-500/30">
                  <Warehouse className="w-4 h-4" />
                </div>
                <span>ประวัติเครื่องที่เตรียมเข้าคลังพร้อมขายแล้ว (in_stock)</span>
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                ตรวจสอบย้อนหลังว่า S/N ใดผ่านการเทสและติดโลโก้จาก Stage A เข้าคลังพร้อมขายเรียบร้อยแล้ว (รอจัดซื้อตัดสต๊อกตามออเดอร์)
              </p>
            </div>
            <span className="text-xs font-semibold px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 dark:bg-emerald-500/15 dark:text-emerald-400 dark:border-emerald-500/30 self-start sm:self-auto">
              {generalStockItems.length} เครื่องในคลัง
            </span>
          </div>

          <div className="relative mb-4">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              value={stockSearch}
              onChange={(e) => setStockSearch(e.target.value)}
              placeholder="ค้นหา S/N, ชื่อรุ่นสินค้า หรือเลขที่ PO..."
              className="w-full liquid-glass-input rounded-xl pl-9 pr-10 py-2 text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none"
            />
            <button
              type="button"
              onClick={() => setScanTarget('stock_search')}
              title="สแกน S/N ด้วยกล้อง"
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:text-[#FF6B00] hover:bg-slate-200/70 dark:hover:bg-white/[0.08] transition cursor-pointer active:scale-95"
            >
              <Camera className="w-4 h-4" />
            </button>
          </div>

          {filteredGeneralStockItems.length === 0 ? (
            <div className="text-center py-12 text-slate-500 border border-dashed border-slate-300 dark:border-white/[0.1] rounded-2xl">
              <Warehouse className="w-10 h-10 mx-auto mb-2 text-slate-400 dark:text-slate-600" />
              <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
                {stockSearch.trim() ? 'ไม่พบเครื่องที่ตรงกับคำค้นหา' : 'ยังไม่มีเครื่องในคลังพร้อมขาย'}
              </p>
              <p className="text-xs text-slate-500 mt-0.5">เครื่องที่ผ่าน Stage A แล้วจะมาแสดงที่นี่</p>
            </div>
          ) : (
            <>
              <ListControls
                from={generalStockList.from}
                to={generalStockList.to}
                total={generalStockList.total}
                page={generalStockList.page}
                totalPages={generalStockList.totalPages}
                pageSize={generalStockList.pageSize}
                sort={generalStockList.sort}
                onSortChange={generalStockList.setSort}
                onPageSizeChange={generalStockList.setPageSize}
                onPageChange={generalStockList.setPage}
                unit="เครื่อง"
                className="mb-3"
              />

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100 dark:bg-white/[0.04] text-slate-600 dark:text-slate-400 border-b border-slate-200 dark:border-white/[0.06]">
                    <tr>
                      <th className="py-2.5 px-3">S/N</th>
                      <th className="py-2.5 px-3">รุ่นสินค้า</th>
                      <th className="py-2.5 px-3">PO / แหล่ง</th>
                      <th className="py-2.5 px-3">สถานะ</th>
                      <th className="py-2.5 px-3">เวลาที่เก็บเข้า</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-white/[0.04]">
                    {generalStockList.pageItems.map((item) => (
                      <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-white/[0.02]">
                        <td className="py-3 px-3 font-mono font-extrabold text-[#C2410C] dark:text-[#FF6B00] text-sm data-key">
                          {item.serial_number || '-'}
                        </td>
                        <td className="py-3 px-3 text-slate-900 dark:text-white font-bold">{item.model_name}</td>
                        <td className="py-3 px-3 text-slate-600 dark:text-slate-400 font-mono text-[11px] data-meta">
                          {item.po_no || '-'} • {item.supplier || 'สต๊อกร้าน'}
                        </td>
                        <td className="py-3 px-3">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-100 text-emerald-900 border border-emerald-300 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30">
                            <BadgeCheck className="w-3 h-3" />
                            ติดโลโก้แล้ว
                          </span>
                        </td>
                        <td className="py-3 px-3 text-slate-500 font-mono text-[11px] data-meta">
                          {item.prepped_at ? new Date(item.prepped_at).toLocaleDateString('th-TH') : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* Prep Work Modal (portal + z-[9999]) — opened from any prep card */}
      {/* ========================================================================= */}
      {(() => {
        if (!activeGroupKey) return null;

        const allGroups = [
          ...groupItems(stageAItems),
          ...groupItems(stageBItems),
          ...groupItems(stage2Items),
        ];
        const group = allGroups.find(g => g.key === activeGroupKey);
        if (!group) return null;

        const order = orders.find(o => o.id === group.order_id);
        const project = group.project_id ? projects.find(p => p.id === group.project_id) : null;
        const isProjectGroup = Boolean(group.project_id);
        const rCode = order?.route_code || project?.route_code;
        const rMeta = rCode ? ROUTE_DEFINITIONS[rCode] : null;
        const isAccepted = group.items.every(it => !!it.assigned_prep_tech);
        const deliveryLabel = isProjectGroup
          ? `[โปรเจกต์] ${group.project_id} • งวดเบิกที่ ${group.project_batch_no || 1}`
          : (DELIVERY_MODE_LABEL[group.delivery_mode || 'install'] || 'ส่งพร้อมติดตั้ง');

        // Strict stage separation:
        // - isStage2: prepped_in_stock (held for delivery, awaiting void sticker)
        // - isStageA: pending_prep_stock OR (pending_prep && !logo_applied)
        // - isStageB: pending_prep && !!logo_applied && (!!order_id || !!project_id)
        const isStage2 = group.items.every(it => it.status === 'prepped_in_stock');
        const isStageA = !isStage2 && group.items.some(it => it.status === 'pending_prep_stock' || !it.logo_applied);

        const accent = isStageA ? 'emerald' : isStage2 ? 'emerald' : 'amber';
        const accentGradient = isStageA
          ? 'from-emerald-500 to-teal-600 hover:from-emerald-400 shadow-emerald-500/25'
          : isStage2
            ? 'from-emerald-500 to-emerald-600 hover:from-emerald-400 shadow-emerald-500/25'
            : 'from-[#FF6B00] to-[#E65A00] hover:from-[#FF8A24] shadow-[#FF6B00]/25';

        const stageLabel = isStageA
          ? 'Stage A • Stock PO (เทส สแกน S/N & ติดโลโก้)'
          : isStage2
            ? 'รอติดวอยประกัน • ปล่อยของออก'
            : isProjectGroup
              ? `[โปรเจกต์] ${group.project_id} • งวดเบิกที่ ${group.project_batch_no || 1} — เซ็ตอัพ S/N & ติดวอยส่งเข้าไซต์งาน`
              : 'Stage B • เตรียมส่งตามออเดอร์ (ติดวอย / รอวันส่งมอบ)';

        return (
          <Modal
            open
            onClose={closeGroupModal}
            ariaLabel="Prep Work"
            title={group.model_name}
            subtitle={stageLabel}
            icon={<ClipboardList className="w-5 h-5" />}
            maxWidthClass="max-w-2xl"
            footer={
              <div className="flex items-center justify-end gap-2">
                <button onClick={closeGroupModal} className={modalSecondaryBtnClass}>
                  ปิด
                </button>
              </div>
            }
          >
            <div className="space-y-4">
              {/* Summary badges */}
              <div className="flex items-center gap-1.5 flex-wrap">
                {rMeta && (
                  <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${rMeta.badgeBg} ${rMeta.badgeBorder} ${rMeta.badgeText}`}>
                    {rMeta.shortName} • {order?.district || project?.district || '-'}
                  </span>
                )}
                <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-blue-100 text-blue-900 border border-blue-300 dark:bg-blue-500/15 dark:text-blue-300 dark:border-blue-500/30">
                  {deliveryLabel}
                </span>
                {group.items.length > 1 && (
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-amber-100 text-amber-900 border border-amber-300 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30 flex items-center gap-1">
                    <Layers className="w-3 h-3" />
                    จำนวน {group.items.length} เครื่อง
                  </span>
                )}
              </div>

              {/* Meta grid */}
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="p-3 rounded-xl bg-slate-100 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08]">
                  <div className={modalLabelClass}>{isProjectGroup ? 'ไซต์งานโปรเจกต์ / ลูกค้า' : 'ลูกค้า / บิล'}</div>
                  <div className="font-bold text-slate-900 dark:text-white mt-0.5">
                    {isProjectGroup && project ? `${project.customer_name} (${project.site_name})` : (order ? order.customer_name : '-')}
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono mt-0.5">
                    {isProjectGroup ? `[โปรเจกต์] ${group.project_id} • งวดเบิกที่ ${group.project_batch_no || 1}` : (order?.bill_no || group.po_no || '-')}
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-slate-100 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08]">
                  <div className={modalLabelClass}>แหล่ง / PO</div>
                  <div className="font-bold text-slate-900 dark:text-white mt-0.5">
                    {group.supplier || 'สต๊อกร้าน'}
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono mt-0.5">
                    PO: {group.po_no || '-'}
                  </div>
                </div>
              </div>

              {(order?.delivery_date || project?.due_date || order?.created_at || project?.created_at) && (
                <div className="p-3 rounded-xl bg-sky-50 dark:bg-sky-500/10 border border-sky-200 dark:border-sky-500/30 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-1.5 font-bold text-sky-900 dark:text-sky-200">
                    <Calendar className="w-4 h-4 text-sky-600 dark:text-sky-400" />
                    <span>กำหนดส่งมอบ: {getDeliveryUrgency(isProjectGroup ? project?.due_date : order?.delivery_date).formattedDate || '-'}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-[11px] text-slate-600 dark:text-slate-300 font-mono">
                    <Clock className="w-3.5 h-3.5" />
                    <span>วันเวลาเปิดบิล/เริ่มงาน: {formatThaiDateTime(isProjectGroup ? project?.created_at : (order?.created_at_log || order?.created_at))}</span>
                  </div>
                </div>
              )}

              {group.prep_note && (
                <div className="p-3 rounded-xl bg-amber-100 border border-amber-300 text-[11px] text-amber-900 dark:bg-[#FF6B00]/10 dark:border-[#FF6B00]/30 dark:text-[#FF6B00]">
                  <strong>หมายเหตุถึงช่าง:</strong> {group.prep_note}
                </div>
              )}

              {/* GATE: Accept first, or unlocked controls */}
              {!isAccepted ? (
                <div className="space-y-3">
                  <div className="p-3 rounded-xl bg-slate-100 dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.06] text-[11px] text-slate-600 dark:text-slate-400 flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5" />
                    <span>
                      {isStageA
                        ? 'กดรับงานก่อนจึงจะเทส สแกน S/N และติดโลโก้เข้าคลังได้'
                        : 'กดรับงานก่อนจึงจะจัดการส่งมอบหรือติดวอยประกันได้'}
                    </span>
                  </div>
                  <button
                    onClick={() => handleAcceptGroup(group)}
                    className={`w-full py-3 bg-gradient-to-r ${accentGradient} text-black font-extrabold rounded-xl text-sm transition cursor-pointer flex items-center justify-center gap-2 shadow-lg border border-white/20 active:scale-95`}
                  >
                    <UserCheck className="w-4 h-4" />
                    <span>กดรับงานนี้ (Accept Job)</span>
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="text-[11px] text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
                    <UserCheck className="w-3.5 h-3.5" />
                    <span>ผู้รับงาน: {group.items[0].assigned_prep_tech}</span>
                  </div>

                  {/* Hold Queue (Stage 2): prepped_in_stock -> apply void & dispatch */}
                  {isStage2 ? (
                    <div className="space-y-2">
                      {group.items.map((item, idx) => (
                        <div key={item.id} className="p-3 rounded-xl bg-slate-100 dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.06] space-y-2">
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400">#{idx + 1}</span>
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-100 text-emerald-900 border border-emerald-300 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30">
                                <BadgeCheck className="w-3 h-3" />
                                ติดโลโก้เรียบร้อยแล้ว
                              </span>
                            </div>
                            <span className="text-[11px] font-mono font-bold text-[#C2410C] dark:text-[#FF6B00]">S/N: {item.serial_number || '-'}</span>
                          </div>
                          <div>
                            <label className={modalLabelClass}>วันที่ติดวอยประกัน</label>
                            <input
                              type="date"
                              value={voidDateInputs[item.id] || todayStr}
                              onChange={(e) => setVoidDateInputs({ ...voidDateInputs, [item.id]: e.target.value })}
                              className={modalInputClass + ' font-mono'}
                            />
                            <div className="mt-1.5 flex items-center gap-1 text-[10px] font-semibold text-emerald-700 dark:text-emerald-400">
                              <ShieldCheck className="w-3 h-3" />
                              <span>{formatWarrantyDuration(item.warranty_years, item.warranty_months)} • เริ่มนับตั้งแต่วันติดวอย</span>
                            </div>
                          </div>
                        </div>
                      ))}
                      <button
                        onClick={() => { if (group.items.every(it => handleDispatchStage2(it.id, it.serial_number))) closeGroupModal(); }}
                        className={`w-full py-2.5 bg-gradient-to-r ${accentGradient} text-black font-extrabold rounded-xl text-xs transition cursor-pointer flex items-center justify-center gap-1.5 shadow-lg border border-white/20 active:scale-95`}
                      >
                        <BadgeCheck className="w-4 h-4" />
                        <span>ติดวอยประกัน & พร้อมส่งออกเลย{group.items.length > 1 ? ` (${group.items.length})` : ''}</span>
                      </button>
                    </div>
                  ) : isStageA ? (
                    /* Stage A — Stock PO Prep (!order_id): Test, Scan S/N, Apply Logo -> ONLY 1 button to in_stock, plus per-unit DOA report */
                    <>
                      <div className="space-y-2.5">
                        {group.items.map((item, idx) => (
                          <div
                            key={item.id}
                            className="p-2.5 rounded-2xl bg-slate-100/80 dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.07] space-y-2"
                          >
                            {renderSnRow(item, idx, accent)}
                            <div className="flex justify-end">
                              <button
                                type="button"
                                onClick={() => openDoaReportModal(item)}
                                className="px-3 py-1.5 rounded-xl text-[11px] font-bold bg-rose-100 hover:bg-rose-200 text-rose-800 border border-rose-300 dark:bg-rose-500/15 dark:hover:bg-rose-500/25 dark:text-rose-300 dark:border-rose-500/35 transition cursor-pointer flex items-center gap-1.5 active:scale-95"
                              >
                                <AlertTriangle className="w-3.5 h-3.5" />
                                <span>พบปัญหา / แจ้งเคลม DOA กลับ PO</span>
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-[11px] text-emerald-900 dark:bg-emerald-500/10 dark:border-emerald-500/20 dark:text-emerald-300 text-center font-medium">
                        เทสฮาร์ดแวร์ สแกน S/N และติดโลโก้ BossComputech ให้เรียบร้อย (ยังไม่ติดวอยประกัน)
                      </div>

                      <button
                        onClick={() => { if (group.items.every(it => handleStageAComplete(it))) closeGroupModal(); }}
                        className={`w-full py-2.5 bg-gradient-to-r ${accentGradient} text-black font-extrabold rounded-xl text-xs transition cursor-pointer flex items-center justify-center gap-1.5 shadow-lg border border-white/20 active:scale-95`}
                      >
                        <Warehouse className="w-4 h-4" />
                        <span>
                          {(group.order_id || group.project_id)
                            ? `ติดโลโก้เสร็จ → ส่งต่อ Stage B ติดวอย${group.items.length > 1 ? ` (${group.items.length})` : ''}`
                            : `ติดโลโก้เสร็จ → ยิงเข้าคลังสต๊อกพร้อมขาย (in_stock)${group.items.length > 1 ? ` (${group.items.length})` : ''}`}
                        </span>
                      </button>
                    </>
                  ) : (
                    /* Stage B — Customer Order Prep (order_id exists): Existing S/N + Logo Applied badge + ONLY Hold or Void & Dispatch */
                    <>
                      <div className="space-y-2">
                        {group.items.map((item, idx) => {
                          const hasExistingSn = !!(item.serial_number && item.serial_number.trim());
                          const logoApplied = Boolean(item.logo_applied || item.logo_scanned_at || hasExistingSn);

                          return (
                            <div key={item.id} className="p-3 rounded-xl bg-slate-100 dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.06] space-y-2">
                              <div className="flex items-center justify-between gap-2 flex-wrap">
                                <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400">#{idx + 1}</span>
                                {logoApplied && (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-100 text-emerald-900 border border-emerald-300 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30">
                                    <BadgeCheck className="w-3 h-3" />
                                    ติดโลโก้เรียบร้อยแล้ว
                                  </span>
                                )}
                              </div>

                              {hasExistingSn ? (
                                <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-white dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08]">
                                  <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">Serial Number (S/N)</span>
                                  <span className="text-sm font-mono font-extrabold text-[#C2410C] dark:text-[#FF6B00] data-key">{item.serial_number}</span>
                                </div>
                              ) : (
                                renderSnRow(item, idx, accent)
                              )}

                              <div>
                                <label className={modalLabelClass}>วันที่ติดวอยประกัน (กรณีส่งออกเลย)</label>
                                <input
                                  type="date"
                                  value={voidDateInputs[item.id] || todayStr}
                                  onChange={(e) => setVoidDateInputs({ ...voidDateInputs, [item.id]: e.target.value })}
                                  className={modalInputClass + ' font-mono'}
                                />
                                <div className="mt-1 flex items-center gap-1 text-[10px] font-semibold text-emerald-700 dark:text-emerald-400">
                                  <ShieldCheck className="w-3 h-3" />
                                  <span>{formatWarrantyDuration(item.warranty_years, item.warranty_months)} • เริ่มนับเมื่อติดวอยประกัน</span>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      <div className="space-y-2 pt-1">
                        {isProjectGroup ? (
                          <button
                            onClick={() => { if (group.items.every(it => handleFinishProjectEquipment(it))) closeGroupModal(); }}
                            className="w-full py-3 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 text-black font-extrabold rounded-xl text-xs transition cursor-pointer flex items-center justify-center gap-1.5 shadow-lg shadow-emerald-500/25 border border-white/20 active:scale-95"
                          >
                            <BadgeCheck className="w-4 h-4" />
                            <span>ติดวอยประกัน & พร้อมส่งเข้าไซต์งาน{group.items.length > 1 ? ` (${group.items.length})` : ''}</span>
                          </button>
                        ) : (
                          <>
                            <button
                              onClick={() => { if (group.items.every(it => handleFinishToHold(it))) closeGroupModal(); }}
                              className="w-full py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 text-black font-extrabold rounded-xl text-xs transition cursor-pointer flex items-center justify-center gap-1.5 shadow-lg shadow-amber-500/25 border border-white/20 active:scale-95"
                            >
                              <Warehouse className="w-4 h-4" />
                              <span>เก็บรอวันส่งมอบ (prepped_in_stock){group.items.length > 1 ? ` (${group.items.length})` : ''}</span>
                            </button>
                            <button
                              onClick={() => { if (group.items.every(it => handleFinishAndDispatch(it))) closeGroupModal(); }}
                              className="w-full py-2.5 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 text-black font-extrabold rounded-xl text-xs transition cursor-pointer flex items-center justify-center gap-1.5 shadow-lg shadow-emerald-500/25 border border-white/20 active:scale-95"
                            >
                              <BadgeCheck className="w-4 h-4" />
                              <span>ติดวอยประกัน & พร้อมส่งออกเลย{group.items.length > 1 ? ` (${group.items.length})` : ''}</span>
                            </button>
                          </>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Activity */}
              <div className="pt-3 border-t border-slate-200 dark:border-white/[0.08] space-y-2">
                <LatestUpdateBadge
                  logs={group.items[0]?.activity_logs}
                  fallbackTimestamp={group.items[0]?.prepped_at || group.items[0]?.created_at}
                  fallbackActor={group.items[0]?.assigned_prep_tech}
                />
                <ActivityTimeline logs={group.items[0]?.activity_logs} />
              </div>
            </div>
          </Modal>
        );
      })()}

      {/* Nested DOA Defect Report Modal (z-[10000]) */}
      {doaTargetItem && createPortal(
        <div
          className="fixed inset-0 z-[10000] flex items-end sm:items-center justify-center sm:p-4 bg-black/70 dark:bg-black/80 backdrop-blur-md overflow-y-auto overscroll-contain animate-fade-in"
          role="dialog"
          aria-modal="true"
          aria-label="แจ้งพบของเสีย DOA กลับฝ่ายจัดซื้อ PO"
          onClick={() => setDoaTargetItem(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full sm:w-[95vw] max-w-lg max-h-[92dvh] sm:max-h-[88dvh] flex flex-col overflow-hidden rounded-t-3xl sm:rounded-3xl shadow-2xl border border-rose-500/40 bg-white text-slate-900 dark:bg-[#12141A] dark:text-white animate-modal-pop"
          >
            {/* Header */}
            <div className="flex items-start justify-between gap-3 px-4 sm:px-6 py-3.5 border-b border-slate-200 dark:border-white/[0.1] flex-shrink-0 bg-rose-50/70 dark:bg-rose-500/[0.07]">
              <div className="flex items-start gap-3 min-w-0">
                <div className="p-2 rounded-xl bg-rose-100 text-rose-700 border border-rose-300 dark:bg-rose-500/20 dark:text-rose-300 dark:border-rose-500/30 flex-shrink-0">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white leading-tight">
                    แจ้งพบปัญหา / เคลม DOA กลับ PO
                  </h3>
                  <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5 truncate">
                    {doaTargetItem.model_name} · PO: {doaTargetItem.po_no || '-'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDoaTargetItem(null)}
                aria-label="ปิดหน้าต่าง"
                className="p-2 rounded-xl text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white bg-white/80 dark:bg-white/[0.06] hover:bg-slate-200 dark:hover:bg-white/[0.12] transition cursor-pointer active:scale-95"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body */}
            <form onSubmit={handleSubmitDoaReport} className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 space-y-4 text-xs">
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 dark:bg-rose-500/10 dark:border-rose-500/25 dark:text-rose-200 text-[11px] leading-relaxed">
                เครื่องนี้จะถูกแยกเป็นสถานะ <strong className="font-mono">doa_reported</strong> และส่งกลับไปยังฝ่ายจัดซื้อทันที (ไม่เข้าคลังพร้อมขาย) ส่วนเครื่องที่ปกติในชุดเดียวกันยังดำเนินการต่อได้ตามปกติ
              </div>

              <div>
                <label className={modalLabelClass}>Serial Number (S/N) ของเครื่องที่มีปัญหา</label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={doaSnInput}
                    onChange={(e) => setDoaSnInput(e.target.value)}
                    placeholder="ระบุหรือสแกน S/N เครื่องที่พบปัญหา (ถ้ามี)"
                    className={modalInputClass + ' font-mono'}
                  />
                  <button
                    type="button"
                    onClick={() => setScanTarget('doa')}
                    title="สแกน S/N ด้วยกล้อง"
                    className="shrink-0 px-3 py-2 rounded-xl bg-rose-100 hover:bg-rose-200 text-rose-800 border border-rose-300 dark:bg-rose-500/15 dark:hover:bg-rose-500/25 dark:text-rose-300 dark:border-rose-500/35 text-xs font-semibold cursor-pointer flex items-center gap-1 transition active:scale-95"
                  >
                    <Camera className="w-4 h-4" />
                    <span className="hidden sm:inline">สแกน</span>
                  </button>
                </div>
              </div>

              <div>
                <label className={modalLabelClass}>เลือกอาการเสียที่พบ (เลือกได้มากกว่า 1)</label>
                <div className="flex flex-wrap gap-2 mt-1">
                  {DOA_DEFECT_CHIPS.map((chip) => {
                    const selected = doaSelectedChips.includes(chip);
                    return (
                      <button
                        key={chip}
                        type="button"
                        onClick={() => toggleDoaChip(chip)}
                        className={`px-3 py-1.5 rounded-xl text-[11px] font-bold border transition cursor-pointer active:scale-95 ${selected
                          ? 'bg-rose-600 text-white border-rose-600 dark:bg-rose-500 dark:text-black dark:border-rose-400 shadow-sm'
                          : 'bg-slate-100 text-slate-700 border-slate-300 hover:bg-slate-200 dark:bg-white/[0.05] dark:text-slate-300 dark:border-white/[0.12] dark:hover:bg-white/[0.1]'
                          }`}
                      >
                        {selected ? '✓ ' : ''}{chip}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className={modalLabelClass}>รายละเอียด / หมายเหตุเพิ่มเติม</label>
                <textarea
                  rows={3}
                  value={doaNotesInput}
                  onChange={(e) => setDoaNotesInput(e.target.value)}
                  placeholder="ระบุอาการเพิ่มเติม เช่น เปิดเครื่องพัดลมหมุนแต่จอไม่ขึ้นภาพ..."
                  className={modalInputClass + ' resize-none'}
                />
              </div>

              <EvidencePhotoUploader
                value={doaPhotos}
                onChange={setDoaPhotos}
                folder="doa"
                label="รูปถ่ายหลักฐานอาการเสีย (DOA)"
                helperText="แนบรูป Dead Pixel, รอยตำหนิ หรืออาการเปิดไม่ติด เพื่อให้จัดซื้อส่งเคลม Supplier (สูงสุด 3 รูป)"
              />

              <div className="flex items-center gap-2 pt-2 border-t border-slate-200 dark:border-white/[0.08]">
                <button
                  type="button"
                  onClick={() => setDoaTargetItem(null)}
                  className={modalSecondaryBtnClass}
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  className="w-full min-h-[44px] py-2.5 px-5 rounded-xl font-extrabold text-xs transition-all duration-150 cursor-pointer flex items-center justify-center gap-1.5 bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 text-white shadow-lg shadow-rose-500/25 border border-white/20 active:scale-[0.97]"
                >
                  <AlertTriangle className="w-4 h-4" />
                  <span>ยืนยันแจ้งเคลม DOA กลับ PO</span>
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* Reusable camera barcode/QR scanner */}
      <BarcodeScannerModal
        open={scanTarget !== null}
        onClose={() => setScanTarget(null)}
        onScan={(value) => {
          const clean = value.trim();
          if (!clean) return;
          if (scanTarget === 'doa') {
            setDoaSnInput(clean);
          } else if (scanTarget === 'stock_search') {
            setStockSearch(clean);
          } else if (scanTarget) {
            setSnInputs((prev) => ({ ...prev, [scanTarget]: clean }));
          }
          setScanTarget(null);
        }}
      />
    </div>
  );
};
