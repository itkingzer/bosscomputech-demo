import { ModalBackdrop } from './ui/ModalBackdrop';
import { PhoneInput, NumberInput, normalizePhone } from './ui/FormInputs';
import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { canCompleteProjectHandover, canCompleteSiteVisit, useApp } from '../context/AppContext';
import {
  MapPin, ShieldCheck, CheckCircle, Truck, Package,
  RotateCcw, Wrench, Printer,
  CheckSquare, Square, X, Smartphone, UserCheck, Layers,
  ClipboardList, ArrowRight, Phone, Calendar, ScanLine, Search, Check
} from 'lucide-react';
import { ROUTE_DEFINITIONS, RouteCode, RepairTicket, Item, Project, Product, ProductCategory, PRODUCT_CATEGORY_LABELS, formatThaiDateTime, formatDateDMY, getLocalDateStr, getProjectDeadlineRisk, SiteVisit } from '../types';
import { ListControls, useListControls } from './ListControls';
import { ActivityTimeline, LatestUpdateBadge } from './ActivityTimeline';
import { BarcodeScannerModal } from './BarcodeScannerModal';
import { DeliverySignaturePad } from './DeliverySignaturePad';
import { uploadEvidenceImage } from '../services/imageStorageService';
import { EvidencePhotoUploader } from './EvidencePhotoUploader';
import { ToastBanner } from './ui/ToastBanner';
import { OrderFormPrintModal } from './OrderFormPrintModal';
import { OnsiteDispatchRosterModal } from './OnsiteDispatchRosterModal';
import { RepairIntakeModal, RepairIntakeInitialValues } from './RepairIntakeModal';
import { ServiceSheetHistoryModal } from './ServiceSheetHistoryModal';
import { PrintGuideButton } from './PrintGuideButton';
import {
  Modal, modalInputClass, modalLabelClass,
  modalPrimaryBtnClass
} from './ui/Modal';
import { lookupPurchaseBySn } from '../utils/snLookup';
import { isNonPrepCableOrConsumable, toTelHref, worksInPosition } from '../utils/domainHelpers';

// ---------------------------------------------------------------------------
// Official "ใบรับซ่อมสินค้า" receipt helpers (shared with RepairView)
// ---------------------------------------------------------------------------
const COMPANY_NAME = 'บริษัท บอส คอมพิวเทค แอนด์ เซอร์วิส จำกัด';
const COMPANY_ADDRESS = '289/2 ถนนตลาดใหม่ ตำบลตลาด อำเภอเมือง จังหวัดสุราษฎร์ธานี 84000';
const COMPANY_PHONE = 'โทรศัพท์ 077-286999 แฟกซ์';
const RECEIPT_DISCLAIMER =
  'ทางร้านจะรับผิดชอบสินค้าเฉพาะที่ระบุตามเอกสารนี้เท่านั้น เมื่อไม่มีการติดต่อกลับจากลูกค้าหลังได้รับจากทางร้านนานเกิน 45 วัน หรือเบอร์โทรศัพท์ที่ให้ไว้ไม่สามารถติดต่อได้นานเกิน 60 วัน ทางร้านจะไม่รับผิดชอบใดๆทั้งสิ้น';

// DD/MM/YYYY HH:mm (ค.ศ.) — ใช้บนใบรับซ่อม
const formatReceiptDateTime = (iso?: string | null): string => {
  if (!iso) return '-';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '-';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${dd}/${mm}/${yyyy} ${hh}:${mi}`;
};

// เดาประเภทสินค้า (PC / Notebook / Printer ...) จากรุ่นที่บันทึกไว้
const inferDeviceCategory = (model?: string | null): string => {
  const m = (model || '').toLowerCase();
  if (!m) return 'อุปกรณ์อิเล็กทรอนิกส์';
  if (/(notebook|laptop|โน้ตบุ๊ก|โน้ตบุค|macbook|vivobook|ideapad|thinkpad|inspiron|pavilion)/.test(m)) return 'Notebook';
  if (/(printer|ปริ้น|ปริ๊น|พิมพ์|laserjet|deskjet|epson l|canon pixma|brother)/.test(m)) return 'Printer';
  if (/(monitor|จอ|led |lcd )/.test(m)) return 'Monitor';
  if (/(all in one|aio|desktop|pc |คอม|ตั้งโต๊ะ)/.test(m)) return 'PC / Desktop';
  if (/(tablet|ipad|แท็บเล็ต)/.test(m)) return 'Tablet';
  if (/(iphone|samsung|oppo|vivo|xiaomi|โทรศัพท์|มือถือ)/.test(m)) return 'Smartphone';
  return 'อุปกรณ์อิเล็กทรอนิกส์';
};

// แปลง ISO -> DD/MM/YYYY (ค.ศ.) สำหรับช่องวันนัดรับ
const formatReceiptDate = (iso?: string | null): string => {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()}`;
};

// ---------------------------------------------------------------------------
// Helpers: group identical items into a single stacked card
// ---------------------------------------------------------------------------
interface ItemGroup {
  key: string;
  items: Item[];
  model_name: string;
  order_id?: string | null;
  po_no?: string;
  delivery_mode?: Item['delivery_mode'];
}

const groupItems = (list: Item[]): ItemGroup[] => {
  const map = new Map<string, ItemGroup>();
  list.forEach((item) => {
    const key = `${item.order_id || item.po_no || 'no-order'}::${item.model_name}`;
    const existing = map.get(key);
    if (existing) {
      existing.items.push(item);
    } else {
      map.set(key, {
        key,
        items: [item],
        model_name: item.model_name,
        order_id: item.order_id,
        po_no: item.po_no,
        delivery_mode: item.delivery_mode
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

const ACCESSORY_PRESETS = [
  'Adapter / หม้อแปลง',
  'สาย Power',
  'สายสัญญาณ (LAN/HDMI/USB)',
  'กระเป๋า / กล่อง',
  'ตัวเครื่องเปล่า (ไม่มีอุปกรณ์ติดมา)'
];

const DISTRICT_OPTIONS = [
  // สาย 1 (โซนเหนือ)
  { district: 'พุนพิน', zone: 'สาย 1 (โซนเหนือ)' },
  { district: 'ท่าฉาง', zone: 'สาย 1 (โซนเหนือ)' },
  { district: 'ไชยา', zone: 'สาย 1 (โซนเหนือ)' },
  { district: 'ท่าชนะ', zone: 'สาย 1 (โซนเหนือ)' },
  // สาย 2 (โซนตะวันตก)
  { district: 'คีรีรัฐนิคม', zone: 'สาย 2 (โซนตะวันตก)' },
  { district: 'บ้านตาขุน', zone: 'สาย 2 (โซนตะวันตก)' },
  { district: 'พนม', zone: 'สาย 2 (โซนตะวันตก)' },
  // สาย 3 (โซนใต้)
  { district: 'บ้านนาเดิม', zone: 'สาย 3 (โซนใต้)' },
  { district: 'บ้านนาสาร', zone: 'สาย 3 (โซนใต้)' },
  { district: 'เวียงสระ', zone: 'สาย 3 (โซนใต้)' },
  { district: 'พระแสง', zone: 'สาย 3 (โซนใต้)' },
  // สาย 4 (โซนตะวันออก)
  { district: 'กาญจนดิษฐ์', zone: 'สาย 4 (โซนตะวันออก)' },
  { district: 'ดอนสัก', zone: 'สาย 4 (โซนตะวันออก)' },
  { district: 'ขนอม', zone: 'สาย 4 (โซนตะวันออก)' },
  // สาย 5 (ในเมือง / รอบเมือง)
  { district: 'เมืองสุราษฎร์ธานี', zone: 'สาย 5 (ในเมือง / รอบเมือง)' },
  // สาย 6 (ต่างจังหวัด / งานเหมาพิเศษ)
  { district: 'ต่างจังหวัด / งานเหมาพิเศษ', zone: 'สาย 6 (ต่างจังหวัด / ชั่วคราว)' }
];

export const OnsiteView: React.FC = () => {
  const {
    items, orders, repairTickets, confirmOnsiteDelivery,
    completeOnsiteJobHandoff, currentUser, users,
    acceptOnsiteJob, completeRepairReturnOnsite, triggerPrintRepairReceipt,
    lookupWarrantyBySerial,
    projects, products, addProjectDailyLog, createProjectMaterialRequest, completeProjectHandover,
    updateSiteVisit
  } = useApp();

  // Default landing route filter to 'all' so Onsite techs see all their assigned jobs across every route
  const [selectedRouteFilter, setSelectedRouteFilter] = useState<'all' | RouteCode>('all');
  const [selectedTechNameFilter, setSelectedTechNameFilter] = useState<string>(currentUser?.role === 'onsite' ? currentUser.name : 'all');
  const [selectedDayFilter, setSelectedDayFilter] = useState<'all' | 'today' | 'tomorrow'>('all');
  const [selectedCategory, setSelectedCategory] = useState<'all' | 'projects' | 'new_goods' | 'repair_return' | 'pickup'>('all');
  const [deliveryNotes, setDeliveryNotes] = useState<Record<string, string>>({});
  const [repairIntakeOpen, setRepairIntakeOpen] = useState(false);
  const [intakeInitialValues, setIntakeInitialValues] = useState<RepairIntakeInitialValues | null>(null);
  const [toast, setToast] = useState('');
  const [serviceSheetHistoryOpen, setServiceSheetHistoryOpen] = useState(false);
  const [dispatchRosterOpen, setDispatchRosterOpen] = useState(false);
  const [rosterDate, setRosterDate] = useState<string>(() => getLocalDateStr(1));
  const vehicleMap = useMemo<Record<string, string>>(() => {
    try {
      const raw = localStorage.getItem('boss_dispatch_vehicles');
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }, [dispatchRosterOpen]);

  // ---- Onsite Project Workspace Modal State (PRJ-...) ----
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [prjWorkspaceTab, setPrjWorkspaceTab] = useState<'daily_log' | 'material_req' | 'handover'>('daily_log');
  const [dailyProgressInput, setDailyProgressInput] = useState<number>(0);
  const [dailyNoteInput, setDailyNoteInput] = useState('');
  const [dailyPhotosInput, setDailyPhotosInput] = useState<string[]>([]);
  const [reqProductId, setReqProductId] = useState('');
  const [reqItemName, setReqItemName] = useState('');
  const [reqQty, setReqQty] = useState<number>(1);
  const [reqReason, setReqReason] = useState('');
  const [isReqCatalogOpen, setIsReqCatalogOpen] = useState(false);
  const [reqCatalogSearch, setReqCatalogSearch] = useState('');
  const [reqCatalogCategory, setReqCatalogCategory] = useState<'all' | ProductCategory>('all');
  const [handoverNoteInput, setHandoverNoteInput] = useState('');
  const [handoverPhotosInput, setHandoverPhotosInput] = useState<string[]>([]);
  const [isSubmittingHandover, setIsSubmittingHandover] = useState(false);
  const [showMobileFilters, setShowMobileFilters] = useState(false);

  const activeProject = useMemo(
    () => (activeProjectId ? projects.find(p => p.id === activeProjectId) || null : null),
    [projects, activeProjectId]
  );

  const openProjectWorkspace = (prj: Project) => {
    setActiveProjectId(prj.id);
    setPrjWorkspaceTab('daily_log');
    setDailyProgressInput(0);
    setDailyNoteInput('');
    setDailyPhotosInput([]);
    setReqProductId('');
    setReqItemName('');
    setReqQty(1);
    setReqReason('');
    setHandoverNoteInput('');
    setHandoverPhotosInput([]);
  };

  const handleSaveDailyLog = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeProject || !dailyNoteInput.trim()) {
      alert('กรุณากรอกรายละเอียดความคืบหน้าหน้างานวันนี้');
      return;
    }
    const techName = currentUser?.name || activeProject.assigned_techs?.[0] || 'ช่าง Onsite';
    addProjectDailyLog(activeProject.id, {
      tech_name: techName,
      progress_percent: dailyProgressInput,
      note: dailyNoteInput.trim(),
      photo_urls: dailyPhotosInput
    });
    setDailyNoteInput('');
    setDailyPhotosInput([]);
    setToast(`บันทึก Daily Site Log (${dailyProgressInput}%) ของโปรเจกต์ ${activeProject.id} เรียบร้อยแล้ว`);
    setTimeout(() => setToast(''), 4000);
  };

  const handleSubmitFieldMaterialRequest = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeProject || !reqItemName.trim() || !reqReason.trim()) {
      alert('กรุณาระบุชื่ออุปกรณ์/สายไฟที่ขอเบิกเพิ่ม และเหตุผลหน้างาน');
      return;
    }
    const techName = currentUser?.name || activeProject.assigned_techs?.[0] || 'ช่าง Onsite';
    createProjectMaterialRequest(activeProject.id, {
      item_name: reqItemName.trim(),
      product_id: reqProductId || undefined,
      qty: Math.max(1, reqQty),
      reason: reqReason.trim(),
      requested_by: techName
    });
    setReqProductId('');
    setReqItemName('');
    setReqQty(1);
    setReqReason('');
    setToast(`ส่งคำขอเบิกของเพิ่มจากหน้างาน (${reqItemName.trim()} x${reqQty}) แจ้งเตือนฝ่ายขาย & จัดซื้อแล้ว`);
    setTimeout(() => setToast(''), 4500);
  };

  const handleConfirmProjectHandover = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeProject || isSubmittingHandover) return;
    setIsSubmittingHandover(true);
    try {
      const completed = await completeProjectHandover(activeProject.id, {
        note: handoverNoteInput.trim() || 'ติดตั้งระบบครบถ้วน ทดสอบสัญญาณผ่าน และส่งมอบลูกค้าเรียบร้อย 100%',
        photo_urls: handoverPhotosInput
      });
      if (!completed) {
        setToast('กรุณาปิดรอบเข้าไซต์และเตรียมอุปกรณ์ให้ครบก่อนส่งมอบ');
        return;
      }
      setToast(`ส่งมอบปิดโปรเจกต์ ${activeProject.id} (${activeProject.site_name}) เรียบร้อยแล้ว`);
      setActiveProjectId(null);
    } catch {
      setToast('บันทึกการส่งมอบไม่สำเร็จ กรุณาตรวจสอบสถานะล่าสุดก่อนลองอีกครั้ง');
    } finally {
      setIsSubmittingHandover(false);
      setTimeout(() => setToast(''), 4500);
    }
  };

  // Modal State for Onsite Pickup / Service Sheet Form
  const [isPickupModalOpen, setIsPickupModalOpen] = useState(false);
  // งาน Onsite ต้นทางที่จะถูกปิดอัตโนมัติเมื่อส่งต่อเข้าคิวซ่อม (สำหรับ pickup task เท่านั้น)
  const [originJob, setOriginJob] = useState<{ kind: 'item' | 'ticket'; id: string } | null>(null);
  // Service Sheet Modal Mode
  const [modalMode, setModalMode] = useState<'pickup_task' | 'service_sheet'>('pickup_task');
  const [deliveryPhotos, setDeliveryPhotos] = useState<Record<string, string[]>>({});
  const [deliverySignature, setDeliverySignature] = useState<string | null>(null);
  const [goodsDeliveryPhotos, setGoodsDeliveryPhotos] = useState<Record<string, string[]>>({});
  const [confirmDeliveryKey, setConfirmDeliveryKey] = useState<string | null>(null);
  const [uploadingDeliveryProof, setUploadingDeliveryProof] = useState(false);
  const [savingDelivery, setSavingDelivery] = useState(false);
  const [deliveryError, setDeliveryError] = useState('');
  const [pickupPhotos, setPickupPhotos] = useState<string[]>([]);
  const [sendToRepairShop, setSendToRepairShop] = useState(true);

  // Form Fields
  const [custName, setCustName] = useState('');
  const [custPhone, setCustPhone] = useState('');
  const [district, setDistrict] = useState('เมืองสุราษฎร์ธานี');
  const [deliveryLocation, setDeliveryLocation] = useState('');
  const [provinceCustom, setProvinceCustom] = useState('');
  const [deviceModel, setDeviceModel] = useState('');
  const [sn, setSn] = useState('');
  const [autoFilledSn, setAutoFilledSn] = useState<string | null>(null);
  const [selectedAccessories, setSelectedAccessories] = useState<string[]>(['Adapter / หม้อแปลง']);
  const [accessoriesOther, setAccessoriesOther] = useState('');
  const [faultSymptom, setFaultSymptom] = useState('');

  const snLookup = useMemo(
    () => lookupPurchaseBySn(sn, items, orders, repairTickets),
    [sn, items, orders, repairTickets]
  );

  const handleSnChange = (val: string) => {
    setSn(val);
    const res = lookupPurchaseBySn(val, items, orders, repairTickets);
    if (res.found) {
      if (res.customerName) setCustName(res.customerName);
      if (res.customerPhone) setCustPhone(normalizePhone(res.customerPhone));
      if (res.deviceModel) setDeviceModel(res.deviceModel);
      if (res.district && DISTRICT_OPTIONS.some(d => d.district === res.district)) {
        setDistrict(res.district);
      }
      if (res.order?.delivery_location && !deliveryLocation.trim()) {
        setDeliveryLocation(res.order.delivery_location);
      }
      setAutoFilledSn(val.trim());
    } else if (autoFilledSn && val.trim() !== autoFilledSn) {
      setAutoFilledSn(null);
    }
  };

  const clearAutoFill = () => {
    setCustName('');
    setCustPhone('');
    setDeviceModel('');
    setAutoFilledSn(null);
  };

  // Receipt Modal State
  const [receiptTicket, setReceiptTicket] = useState<RepairTicket | null>(null);

  // Camera S/N scanner state (unified intake modal)
  const [isScannerOpen, setIsScannerOpen] = useState(false);

  // Onsite Job Detail Modal State (card-to-modal)
  // kind: 'new_goods' | 'repair_return' | 'pickup'
  const [activeJob, setActiveJob] = useState<{ kind: 'new_goods' | 'repair_return' | 'pickup'; key: string } | null>(null);
  const [printProjectTarget, setPrintProjectTarget] = useState<{ project: Project; initialBatchNo?: number | null } | null>(null);

  const onsiteTechUsers = users.filter(u => worksInPosition(u, 'onsite') && u.is_active !== false);

  // Warranty Auto-Check by S/N (uses shared lookupWarrantyBySerial supporting 1-5y/months)
  const warrantyLookup = sn.trim().length >= 3 ? lookupWarrantyBySerial(sn) : null;
  let warrantyStatusText = '';
  let warrantyBadgeClass = '';
  if (warrantyLookup?.found) {
    if (warrantyLookup.state === 'active') {
      warrantyStatusText = `อยู่ในประกัน (${warrantyLookup.durationLabel}) • ${warrantyLookup.remainingLabel || ''}`.trim();
      warrantyBadgeClass = 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-500/15 dark:text-emerald-400 dark:border-emerald-500/30';
    } else if (warrantyLookup.state === 'expired') {
      warrantyStatusText = `หมดประกันแล้ว (${warrantyLookup.durationLabel})`;
      warrantyBadgeClass = 'bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-500/15 dark:text-rose-400 dark:border-rose-500/30';
    } else if (warrantyLookup.state === 'waiting') {
      warrantyStatusText = `ยังไม่เริ่มนับประกัน (${warrantyLookup.durationLabel} - รอแปะวอย)`;
      warrantyBadgeClass = 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-500/15 dark:text-amber-400 dark:border-amber-500/30';
    } else {
      warrantyStatusText = 'ไม่มีประกัน';
      warrantyBadgeClass = 'bg-slate-100 text-slate-600 border-slate-300 dark:bg-white/[0.05] dark:text-slate-400 dark:border-white/[0.1]';
    }
  } else if (sn.trim().length >= 3) {
    warrantyStatusText = 'ไม่พบประวัติวอยในระบบ (นอกประกันหรือเครื่องทั่วไป)';
    warrantyBadgeClass = 'bg-slate-100 text-slate-600 border-slate-300 dark:bg-white/[0.05] dark:text-slate-400 dark:border-white/[0.1]';
  }


  // Helper filter by Tech Name & Route
  const matchesTechFilter = (techs: string[] | undefined, singleTech: string | null | undefined) => {
    if (selectedTechNameFilter === 'all') return true;
    if (techs && techs.includes(selectedTechNameFilter)) return true;
    if (singleTech && singleTech === selectedTechNameFilter) return true;
    return false;
  };

  const todayDateStr = getLocalDateStr(0);
  const tomorrowDateStr = getLocalDateStr(1);
  const matchesDayFilter = (dateStr?: string | null) => {
    if (selectedDayFilter === 'all') return true;
    if (selectedDayFilter === 'today') return dateStr === todayDateStr;
    return dateStr === tomorrowDateStr;
  };

  // 0. Active Multi-Day Projects (PRJ-2026-XXX) — ONLY visible to Onsite once Front-Desk has scheduled a Site Visit
  const assignedProjects = projects.filter(p => {
    if (p.status === 'completed') return false;
    const visits = p.site_visits || [];
    const awaitingHandover = visits.length > 0 && visits.every(visit => visit.visit_status === 'completed');
    const matchesVisit = visits.some(visit =>
      (visit.visit_status !== 'completed' || awaitingHandover)
      && matchesDayFilter(visit.visit_date)
      && (selectedTechNameFilter === 'all' || visit.assigned_techs.includes(selectedTechNameFilter))
    );
    if (!matchesVisit) return false;
    if (selectedRouteFilter !== 'all' && p.route_code && p.route_code !== selectedRouteFilter) {
      return false;
    }
    return true;
  });

  // 0.5 Scheduled Site Visits Queue (วันนี้ / พรุ่งนี้ / นัดหมาย)
  const scheduledSiteVisits = useMemo(() => {
    const list: { project: Project; visit: SiteVisit; bucket: 'today' | 'tomorrow' | 'upcoming' }[] = [];
    assignedProjects.forEach(prj => {
      (prj.site_visits || []).forEach(sv => {
        if (sv.visit_status === 'completed') return;
        if (!matchesDayFilter(sv.visit_date)) return;
        if (selectedTechNameFilter !== 'all' && !sv.assigned_techs.includes(selectedTechNameFilter)) return;
        const bucket =
          sv.visit_date === todayDateStr ? 'today' :
          sv.visit_date === tomorrowDateStr ? 'tomorrow' : 'upcoming';
        list.push({ project: prj, visit: sv, bucket });
      });
    });
    return list.sort((a, b) => a.visit.visit_date.localeCompare(b.visit.visit_date));
  }, [assignedProjects, selectedTechNameFilter, selectedDayFilter, todayDateStr, tomorrowDateStr]);

  // 1. New goods assigned to onsite — ONLY visible once Front-Desk has scheduled onto a daily dispatch roster (scheduled_date)
  const assignedNewGoods = items.filter(i => {
    if (i.status !== 'assigned_onsite') return false;
    if (!i.scheduled_date) return false;
    if (!matchesDayFilter(i.scheduled_date)) return false;
    if (i.project_id) return false;
    if (!matchesTechFilter(i.assigned_techs, i.assigned_onsite_tech)) return false;
    const order = orders.find(o => o.id === i.order_id);
    if (selectedRouteFilter !== 'all' && order?.route_code !== selectedRouteFilter) {
      return false;
    }
    return true;
  });

  // 2. Repaired items assigned to onsite for return delivery — ONLY visible once Front-Desk has scheduled (scheduled_date)
  const assignedRepairedReturns = repairTickets.filter(t => {
    const isReturnJob = t.is_repair_return === true;
    const isReturnStatus = t.status === 'dispatched_onsite' || t.status === 'on_delivery';
    const isLegacyRepaired = t.status === 'repaired';
    if (!isReturnJob && !isReturnStatus && !isLegacyRepaired) return false;
    if (t.status === 'returned_closed' || t.repair_status === 'completed') return false;
    if (!t.scheduled_date) return false;
    if (!matchesDayFilter(t.scheduled_date)) return false;
    if (!t.assigned_onsite_tech && (!t.assigned_techs || t.assigned_techs.length === 0)) return false;
    if (!matchesTechFilter(t.assigned_techs, t.assigned_onsite_tech)) return false;
    if (selectedRouteFilter !== 'all' && t.route_code !== selectedRouteFilter) {
      return false;
    }
    return true;
  });

  // 3. Onsite pickup tickets assigned
  //    - ต้องมีช่าง Onsite ถูกมอบหมายจริง (ไม่ใช่ใบรับซ่อมที่เพิ่งสร้างเข้าห้องช่าง)
  //    - ใบรับซ่อมที่ช่าง Onsite ออกเอง/ส่งต่อเข้าห้องช่าง (service_type = 'in_house_repair')
  //      จะไม่ถูกนับเป็นคิว Onsite อีก เพื่อไม่ให้การ์ดค้างหลังกดบันทึกส่งเข้าห้องช่าง
  const assignedPickups = repairTickets.filter(t => {
    if (t.intake_channel !== 'onsite_pickup') return false;
    if (t.service_type === 'in_house_repair') return false;
    if (t.status !== 'open' && t.status !== 'in_progress') return false;
    const hasAssignedTech =
      (t.assigned_techs && t.assigned_techs.length > 0) || !!t.assigned_onsite_tech;
    if (!hasAssignedTech) return false;
    if (!matchesTechFilter(t.assigned_techs, t.assigned_onsite_tech)) return false;
    if (selectedRouteFilter !== 'all' && t.route_code !== selectedRouteFilter) {
      return false;
    }
    return true;
  });

  const totalAssignedCount = assignedProjects.length + assignedNewGoods.length + assignedRepairedReturns.length + assignedPickups.length;

  // Sort + pagination สำหรับการ์ดงาน Onsite (จัดกลุ่มแล้ว)
  const newGoodsList = useListControls(groupItems(assignedNewGoods), {
    getDate: (g) => g.items[0]?.created_at,
    getValue: (g) => g.items.length,
    initialSort: 'newest',
  });

  const repairedReturnsList = useListControls(assignedRepairedReturns, {
    getDate: (t) => t.assigned_at || t.updated_at || t.created_at,
    initialSort: 'newest',
    initialPageSize: 10
  });

  const pickupsList = useListControls(assignedPickups, {
    getDate: (t) => t.assigned_at || t.updated_at || t.created_at,
    initialSort: 'newest',
    initialPageSize: 10
  });

  const handleAcceptGroup = (group: ItemGroup) => {
    const techName = currentUser?.name || 'ช่าง Onsite';
    group.items.forEach(it => {
      if (!it.onsite_accepted_at) acceptOnsiteJob(it.id, techName);
    });
    setToast(`ช่าง "${techName}" รับงานทั้งชุด ${group.items.length} เครื่องเรียบร้อยแล้ว`);
    setTimeout(() => setToast(''), 3500);
  };

  const handleDeliveryConfirmGroup = async (group: ItemGroup) => {
    if (savingDelivery || uploadingDeliveryProof) return;
    const photos = goodsDeliveryPhotos[group.key] ?? [];
    setSavingDelivery(true);
    setDeliveryError('');
    try {
      let signatureUrl: string | undefined;
      if (deliverySignature) {
        const blob = await (await fetch(deliverySignature)).blob();
        signatureUrl = await uploadEvidenceImage(new File([blob], 'delivery-signature.png', { type: blob.type }), 'onsite');
      }
      await confirmOnsiteDelivery(group.items.map(item => ({
        id: item.id,
        note: deliveryNotes[item.id]?.trim()
      })), photos, signatureUrl);
    } catch {
      setDeliveryError('บันทึกการส่งมอบไม่สำเร็จ กรุณาลองอีกครั้ง');
      return;
    } finally {
      setSavingDelivery(false);
    }
    setActiveJob(null);
    setConfirmDeliveryKey(null);
    setDeliverySignature(null);
    setGoodsDeliveryPhotos(prev => ({ ...prev, [group.key]: [] }));
    setToast(`ส่งมอบสินค้าใหม่ทั้งชุด ${group.items.length} เครื่องสำเร็จ และปิดงานเรียบร้อยแล้ว`);
    setTimeout(() => setToast(''), 3500);
  };

  const handleReturnConfirm = (ticketId: string, ticketNo: string) => {
    const photos = deliveryPhotos[ticketId];
    completeRepairReturnOnsite(ticketId, undefined, photos);
    setToast(`ส่งมอบเครื่องซ่อม ${ticketNo} คืนลูกค้าเสร็จสิ้น — ปิดงานเรียบร้อยแล้ว`);
    setTimeout(() => setToast(''), 3500);
  };

  // Open Pickup Form pre-filled from an existing job (เฉพาะงานที่หน้าร้านจ่ายมาเป็นงานรับเครื่อง / pickup task)
  const handleOpenPickupForJob = (ticket: RepairTicket) => {
    setModalMode('pickup_task');
    setSendToRepairShop(true);
    setOriginJob({ kind: 'ticket', id: ticket.id });
    setCustName(ticket.customer_name);
    setCustPhone(normalizePhone(ticket.customer_phone || ''));
    setDistrict(ticket.district || 'เมืองสุราษฎร์ธานี');
    setDeliveryLocation(ticket.delivery_location || '');
    setProvinceCustom(ticket.province_custom || '');
    setDeviceModel(ticket.device_model || '');
    setSn(ticket.walkin_sn && !ticket.walkin_sn.startsWith('SN-MANUAL') && !ticket.walkin_sn.startsWith('SN-PROJECT') ? ticket.walkin_sn : '');
    setSelectedAccessories(ticket.accessories && ticket.accessories.length > 0 ? ticket.accessories : ['Adapter / หม้อแปลง']);
    setAccessoriesOther(ticket.accessories_other || '');
    setFaultSymptom(ticket.fault_symptom || '');
    setPickupPhotos(ticket.photo_urls || []);
    setIsPickupModalOpen(true);
  };

  // เปิดฟอร์มออกใบ Service Sheet (รับฝาก/งานเพิ่มหน้างาน) — ใช้ RepairIntakeModal เดียวกับหน้าร้าน
  const handleOpenNewServiceSheet = (defaultData?: { customer_name?: string; customer_phone?: string; district?: string; delivery_location?: string }) => {
    setIntakeInitialValues(defaultData || null);
    setRepairIntakeOpen(true);
  };

  const toggleAccessory = (acc: string) => {
    if (acc === 'ตัวเครื่องเปล่า (ไม่มีอุปกรณ์ติดมา)') {
      if (selectedAccessories.includes(acc)) {
        setSelectedAccessories([]);
      } else {
        setSelectedAccessories([acc]);
      }
      return;
    }

    let updated = selectedAccessories.filter(a => a !== 'ตัวเครื่องเปล่า (ไม่มีอุปกรณ์ติดมา)');
    if (updated.includes(acc)) {
      updated = updated.filter(a => a !== acc);
    } else {
      updated.push(acc);
    }
    setSelectedAccessories(updated);
  };

  // Submit Pickup / Service Sheet Form
  const handleSubmitPickupForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!custName.trim() || !faultSymptom.trim()) {
      alert('กรุณากรอกชื่อลูกค้าและอาการเสีย/รายละเอียดงานให้ครบถ้วน');
      return;
    }

    const techName = currentUser?.name || 'ช่าง Onsite';
    const handoffOrigin = originJob;

    // สร้างใบรับซ่อม / Service Sheet (REP-...)
    const { ticketNo, ticket } = await completeOnsiteJobHandoff({
      origin: handoffOrigin, // ถ้าเป็น service_sheet จะเป็น null เพื่อไม่ให้ปิดงานหลัก
      customer_name: custName,
      customer_phone: custPhone,
      district,
      delivery_location: deliveryLocation,
      province_custom: provinceCustom,
      device_model: deviceModel,
      walkin_sn: sn,
      accessories: selectedAccessories,
      accessories_other: accessoriesOther,
      fault_symptom: faultSymptom,
      received_channel: modalMode === 'service_sheet' ? 'onsite_service_sheet' : 'onsite_pickup',
      send_to_repair_shop: sendToRepairShop,
      photo_urls: pickupPhotos.length > 0 ? pickupPhotos : undefined
    });

    setReceiptTicket(ticket);
    setToast(
      handoffOrigin
        ? `สร้างใบรับซ่อม ${ticketNo} • ปิดงาน Onsite และส่งต่อให้ช่างหน้าร้านเรียบร้อย (โดย ${techName})`
        : `ออกใบ Service Sheet ${ticketNo} ${sendToRepairShop ? '• บันทึกส่งเข้าห้องช่างซ่อม' : ''} เรียบร้อย`
    );

    // ปิดมอดัลฟอร์ม + เคลียร์ origin (ไม่ออกจากการดูงานหลักถ้าเป็น Service Sheet)
    setIsPickupModalOpen(false);
    if (handoffOrigin) {
      setActiveJob(null);
    }
    setOriginJob(null);
    setTimeout(() => setToast(''), 4000);
  };

  const handlePrintReceipt = () => {
    if (receiptTicket) {
      triggerPrintRepairReceipt(receiptTicket);
    } else {
      window.print();
    }
  };

  return (
    <div className="space-y-6 min-w-0">
      <ToastBanner message={toast} onClose={() => setToast('')} />

      {/* Main Container */}
      <div className="liquid-glass rounded-3xl p-4 sm:p-6 lg:p-7 shadow-2xl border border-slate-200 dark:border-white/[0.08] min-w-0">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-5 pb-4 border-b border-slate-200 dark:border-white/[0.08]">
          <div>
            <h2 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white flex items-center gap-2.5">
              <div className="p-2.5 rounded-xl bg-purple-500/15 text-purple-600 dark:text-purple-400 border border-purple-500/30">
                <Truck className="w-5 h-5" />
              </div>
              <span>งานช่าง Onsite (ส่งของ · ติดตั้ง · รับเครื่องซ่อม)</span>
            </h2>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 mt-1">
              {currentUser?.name ? `ช่าง: ${currentUser.name}` : ''}
              {currentUser?.assigned_route && currentUser.assigned_route !== 'all'
                ? ` • ประจำ${ROUTE_DEFINITIONS[currentUser.assigned_route].shortName}`
                : ' • วิ่งได้ทุกสาย'}
              {' • แสดงเฉพาะงานที่หน้าร้านจัดคิวให้แล้ว'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 w-auto">
            <button
              type="button"
              onClick={() => setServiceSheetHistoryOpen(true)}
              className={modalPrimaryBtnClass + ' min-h-11 sm:hidden'}
            >
              <ClipboardList className="w-4 h-4" />
              ประวัติ Service Sheet
            </button>
            <button
              type="button"
              onClick={() => setDispatchRosterOpen(true)}
              className="hidden px-4 py-3 min-h-[48px] bg-indigo-600 hover:bg-indigo-500 active:scale-[0.97] text-white font-extrabold rounded-xl text-sm transition-all duration-150 cursor-pointer sm:flex items-center justify-center gap-2 shadow-md"
            >
              <Printer className="w-5 h-5" />
              <span>พิมพ์ใบจัดคิวพรุ่งนี้ (Print)</span>
            </button>
            <button
              type="button"
              onClick={() => handleOpenNewServiceSheet()}
              className="hidden px-5 py-3 min-h-[48px] bg-gradient-to-r from-[#FF6B00] to-[#E65A00] hover:brightness-110 active:scale-[0.97] text-black font-black rounded-xl text-sm transition-all duration-150 cursor-pointer sm:flex items-center justify-center gap-2 shadow-lg shadow-[#FF6B00]/25 border border-white/20"
            >
              <ClipboardList className="w-5 h-5" />
              <span>+ ออกใบรับเครื่องซ่อมหน้างาน</span>
            </button>
          </div>
        </div>

        <div className="mb-5 hidden gap-3 sm:grid sm:grid-cols-2 lg:grid-cols-4">
          <button
            type="button"
            onClick={() => setSelectedCategory('projects')}
            className="text-left p-3.5 rounded-2xl bg-purple-50 dark:bg-purple-500/10 border border-purple-300 dark:border-purple-500/35 hover:border-purple-500 transition cursor-pointer flex items-center justify-between gap-3 min-h-[68px]"
          >
            <div>
              <div className="text-xs font-bold text-purple-800 dark:text-purple-300">คิวเข้าไซต์โปรเจกต์</div>
              <div className="text-xl font-black text-purple-950 dark:text-white font-mono mt-0.5">
                {scheduledSiteVisits.length} <span className="text-xs font-bold">รอบ</span>
              </div>
            </div>
            <Calendar className="w-7 h-7 text-purple-600 dark:text-purple-400 shrink-0" />
          </button>

          <button
            type="button"
            onClick={() => setSelectedCategory('new_goods')}
            className="text-left p-3.5 rounded-2xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-300 dark:border-emerald-500/35 hover:border-emerald-500 transition cursor-pointer flex items-center justify-between gap-3 min-h-[68px]"
          >
            <div>
              <div className="text-xs font-bold text-emerald-800 dark:text-emerald-300">งานส่งของ / ติดตั้ง</div>
              <div className="text-xl font-black text-emerald-950 dark:text-white font-mono mt-0.5">
                {assignedNewGoods.length} <span className="text-xs font-bold">งาน</span>
              </div>
            </div>
            <Package className="w-7 h-7 text-emerald-600 dark:text-emerald-400 shrink-0" />
          </button>

          <button
            type="button"
            onClick={() => setSelectedCategory('repair_return')}
            className="text-left p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-500/10 border border-amber-300 dark:border-amber-500/35 hover:border-amber-500 transition cursor-pointer flex items-center justify-between gap-3 min-h-[68px]"
          >
            <div>
              <div className="text-xs font-bold text-amber-900 dark:text-amber-300">รับ-ส่งเครื่องซ่อม</div>
              <div className="text-xl font-black text-amber-950 dark:text-white font-mono mt-0.5">
                {assignedRepairedReturns.length + assignedPickups.length} <span className="text-xs font-bold">งาน</span>
              </div>
            </div>
            <Wrench className="w-7 h-7 text-amber-600 dark:text-amber-400 shrink-0" />
          </button>

          <button
            type="button"
            onClick={() => setServiceSheetHistoryOpen(true)}
            className="flex min-h-[68px] cursor-pointer items-center justify-between gap-2 rounded-2xl border border-sky-300 bg-sky-50 p-3.5 text-left text-sm font-bold text-sky-900 transition hover:border-sky-500 dark:border-sky-500/35 dark:bg-sky-500/10 dark:text-sky-300"
          >
            <span>ประวัติ Service Sheet</span>
            <ClipboardList className="h-7 w-7 shrink-0 text-sky-600 dark:text-sky-400" />
          </button>
        </div>

        {/* Day Schedule Filter: งานทั้งหมด / งานวันนี้ / งานพรุ่งนี้ (Mobile Segmented 3-col) */}
        <div className="grid grid-cols-3 sm:flex sm:flex-wrap items-center gap-1.5 sm:gap-2 mb-3">
          <span className="hidden sm:inline text-xs font-extrabold text-slate-700 dark:text-slate-300 mr-1">ดูคิวงานวันที่:</span>
          {([
            { id: 'all', mobileLabel: 'ทั้งหมด', label: 'งานที่จัดคิวทั้งหมด' },
            { id: 'today', mobileLabel: 'วันนี้', label: `งานวันนี้ (${formatDateDMY(todayDateStr)})` },
            { id: 'tomorrow', mobileLabel: 'พรุ่งนี้', label: `งานพรุ่งนี้ (${formatDateDMY(tomorrowDateStr)})` }
          ] as const).map(d => (
            <button
              key={d.id}
              type="button"
              onClick={() => setSelectedDayFilter(d.id)}
              className={`px-2 sm:px-4 py-2 min-h-[42px] rounded-xl text-xs sm:text-sm font-extrabold transition cursor-pointer text-center ${
                selectedDayFilter === d.id
                  ? 'bg-[#FF6B00] text-black shadow-md'
                  : 'bg-slate-100 dark:bg-white/[0.04] text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-white/[0.08]'
              }`}
            >
              <span className="sm:hidden">{d.mobileLabel}</span>
              <span className="hidden sm:inline">{d.label}</span>
            </button>
          ))}
        </div>

        {/* Mobile Filter Toggle Button */}
        <div className="sm:hidden flex items-center justify-between gap-2 mb-3">
          <button
            type="button"
            onClick={() => setShowMobileFilters(v => !v)}
            className={`w-full px-3.5 py-2.5 rounded-xl text-xs font-bold border flex items-center justify-between transition cursor-pointer ${
              selectedTechNameFilter !== 'all' || selectedRouteFilter !== 'all'
                ? 'bg-purple-50 dark:bg-purple-500/15 border-purple-300 dark:border-purple-500/40 text-purple-900 dark:text-purple-200'
                : 'bg-slate-100 dark:bg-white/[0.04] border-slate-200 dark:border-white/[0.08] text-slate-700 dark:text-slate-300'
            }`}
          >
            <span>
              ตัวกรอง: {selectedTechNameFilter === 'all' ? 'ช่างทุกคน' : selectedTechNameFilter} • {selectedRouteFilter === 'all' ? 'ทุกสายรถ' : ROUTE_DEFINITIONS[selectedRouteFilter].shortName}
            </span>
            <span className="text-[10px] font-extrabold text-[#FF6B00]">{showMobileFilters ? 'ซ่อน ▲' : 'ปรับตัวกรอง ▼'}</span>
          </button>
        </div>

        {/* Clean Filters Bar (Collapsible on mobile, always visible on sm+) */}
        <div className={`${showMobileFilters ? 'flex' : 'hidden sm:flex'} p-3.5 rounded-2xl bg-slate-100/80 dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.06] mb-4 flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 min-w-0`}>
          <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-2 text-xs w-full lg:w-auto min-w-0">
            <span className="text-slate-700 dark:text-slate-300 font-bold whitespace-nowrap">ดูงานของช่าง:</span>
            <select
              value={selectedTechNameFilter}
              onChange={(e) => setSelectedTechNameFilter(e.target.value)}
              className="rounded-xl px-3 py-2 min-h-[42px] text-xs font-bold bg-white dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-300 dark:border-slate-700 focus:outline-none w-full sm:w-auto min-w-0"
            >
              <option value="all">แสดงงานช่างทุกคน</option>
              {onsiteTechUsers.map(u => (
                <option key={u.id} value={u.name}>
                  {u.name} {currentUser?.name === u.name ? '(ตัวฉัน)' : ''}
                </option>
              ))}
            </select>
          </div>

          <div className="w-full lg:w-auto min-w-0 flex flex-wrap items-center gap-1.5 text-xs">
            <span className="text-slate-700 dark:text-slate-300 font-bold whitespace-nowrap mr-1">สายรถ:</span>
            <button
              onClick={() => setSelectedRouteFilter('all')}
              className={`px-3 py-2 min-h-[40px] rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${selectedRouteFilter === 'all'
                ? 'bg-slate-900 dark:bg-white text-white dark:text-black shadow-sm'
                : 'bg-white dark:bg-white/[0.04] text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-white/[0.06]'
                }`}
            >
              ทุกสาย
            </button>
            {(Object.keys(ROUTE_DEFINITIONS) as RouteCode[]).map((rCode) => {
              const r = ROUTE_DEFINITIONS[rCode];
              return (
                <button
                  key={rCode}
                  onClick={() => setSelectedRouteFilter(rCode)}
                  className={`px-3 py-2 min-h-[40px] rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${selectedRouteFilter === rCode
                    ? `${r.badgeBg} ${r.badgeText} ${r.badgeBorder} border shadow-sm`
                    : 'bg-white dark:bg-white/[0.04] text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-white/[0.06]'
                    }`}
                >
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: r.color }}></span>
                  <span>{r.shortName}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Simplified Category Tabs (Horizontal scroll single row on mobile, wrap on desktop) */}
        <div className="w-full max-w-full min-w-0 flex flex-nowrap overflow-x-auto no-scrollbar sm:flex-wrap items-center gap-2 pb-4">
          <button
            onClick={() => setSelectedCategory('all')}
            className={`px-3.5 py-2 min-h-[44px] text-xs sm:text-sm font-extrabold rounded-xl transition-all cursor-pointer whitespace-nowrap ${selectedCategory === 'all'
              ? 'bg-[#FF6B00] text-black shadow-sm'
              : 'bg-slate-100 dark:bg-white/[0.04] text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-white/[0.06]'
              }`}
          >
            ทั้งหมด ({totalAssignedCount})
          </button>
          <button
            onClick={() => setSelectedCategory('projects')}
            className={`px-3.5 py-2 min-h-[44px] text-xs sm:text-sm font-extrabold rounded-xl transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${selectedCategory === 'projects'
              ? 'bg-purple-600 text-white shadow-sm'
              : 'bg-slate-100 dark:bg-white/[0.04] text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-white/[0.06]'
              }`}
          >
            <Layers className="w-4 h-4" />
            <span>งานโปรเจกต์ ({assignedProjects.length})</span>
          </button>
          <button
            onClick={() => setSelectedCategory('new_goods')}
            className={`px-3.5 py-2 min-h-[44px] text-xs sm:text-sm font-extrabold rounded-xl transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${selectedCategory === 'new_goods'
              ? 'bg-emerald-600 text-white shadow-sm'
              : 'bg-slate-100 dark:bg-white/[0.04] text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-white/[0.06]'
              }`}
          >
            <Package className="w-4 h-4" />
            <span>ส่งของใหม่ ({assignedNewGoods.length})</span>
          </button>
          <button
            onClick={() => setSelectedCategory('repair_return')}
            className={`px-3.5 py-2 min-h-[44px] text-xs sm:text-sm font-extrabold rounded-xl transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${selectedCategory === 'repair_return'
              ? 'bg-cyan-600 text-white shadow-sm'
              : 'bg-slate-100 dark:bg-white/[0.04] text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-white/[0.06]'
              }`}
          >
            <RotateCcw className="w-4 h-4" />
            <span>ส่งคืนเครื่องซ่อม ({assignedRepairedReturns.length})</span>
          </button>
          <button
            onClick={() => setSelectedCategory('pickup')}
            className={`px-3.5 py-2 min-h-[44px] text-xs sm:text-sm font-extrabold rounded-xl transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${selectedCategory === 'pickup'
              ? 'bg-amber-500 text-black shadow-sm'
              : 'bg-slate-100 dark:bg-white/[0.04] text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-white/[0.06]'
              }`}
          >
            <Wrench className="w-4 h-4" />
            <span>ไปรับเครื่องซ่อม ({assignedPickups.length})</span>
          </button>
        </div>

        {totalAssignedCount === 0 ? (
          <div className="text-center py-12 text-slate-500 border border-dashed border-white/[0.1] rounded-2xl">
            <Truck className="w-10 h-10 mx-auto mb-2 text-purple-400 opacity-60" />
            <p className="text-sm font-medium text-slate-700 dark:text-slate-200">ไม่มีคิวงานที่ตรงกับตัวกรองนี้</p>
            <p className="text-xs text-slate-500 mt-0.5">โปรดลองเลือกสายรถอื่น หรือเลือกดูงานช่างทุกคน</p>
          </div>
        ) : (
          <div className="space-y-4">
            {(selectedCategory === 'new_goods' || (selectedCategory === 'all' && newGoodsList.total > 0)) && (
              <ListControls
                from={newGoodsList.from}
                to={newGoodsList.to}
                total={newGoodsList.total}
                page={newGoodsList.page}
                totalPages={newGoodsList.totalPages}
                pageSize={newGoodsList.pageSize}
                sort={newGoodsList.sort}
                onSortChange={newGoodsList.setSort}
                onPageSizeChange={newGoodsList.setPageSize}
                onPageChange={newGoodsList.setPage}
                pageSizeOptions={[10, 20, 30]}
                unit="งานส่งของใหม่"
              />
            )}
            {(selectedCategory === 'repair_return' || (selectedCategory === 'all' && repairedReturnsList.total > 0)) && (
              <ListControls
                from={repairedReturnsList.from}
                to={repairedReturnsList.to}
                total={repairedReturnsList.total}
                page={repairedReturnsList.page}
                totalPages={repairedReturnsList.totalPages}
                pageSize={repairedReturnsList.pageSize}
                sort={repairedReturnsList.sort}
                onSortChange={repairedReturnsList.setSort}
                onPageSizeChange={repairedReturnsList.setPageSize}
                onPageChange={repairedReturnsList.setPage}
                pageSizeOptions={[10, 20, 30]}
                unit="งานส่งคืนซ่อม"
              />
            )}
            {(selectedCategory === 'pickup' || (selectedCategory === 'all' && pickupsList.total > 0)) && (
              <ListControls
                from={pickupsList.from}
                to={pickupsList.to}
                total={pickupsList.total}
                page={pickupsList.page}
                totalPages={pickupsList.totalPages}
                pageSize={pickupsList.pageSize}
                sort={pickupsList.sort}
                onSortChange={pickupsList.setSort}
                onPageSizeChange={pickupsList.setPageSize}
                onPageChange={pickupsList.setPage}
                pageSizeOptions={[10, 20, 30]}
                unit="งานรับเครื่องซ่อม"
              />
            )}
            {/* 0.A SCHEDULED SITE VISITS (วันนี้ / พรุ่งนี้) */}
            {(selectedCategory === 'all' || selectedCategory === 'projects') && scheduledSiteVisits.length > 0 && (
              <div className="mb-4 p-4 rounded-2xl bg-gradient-to-r from-indigo-500/10 via-purple-500/10 to-[#FF6B00]/10 border border-indigo-400/30 space-y-2.5">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <h4 className="text-xs font-extrabold text-slate-900 dark:text-white flex items-center gap-1.5">
                    <Calendar className="w-4 h-4 text-[#FF6B00]" />
                    <span>คิวเข้าไซต์ตามนัดหมาย (วันนี้ / พรุ่งนี้ &amp; ล่วงหน้า) — {scheduledSiteVisits.length} รอบ</span>
                  </h4>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                  {scheduledSiteVisits.map(({ project: prj, visit: sv, bucket }) => {
                    const preppedVisitItems = items.filter(
                      it => it.project_id === prj.id && it.site_visit_id === sv.id && (it.status === 'assigned_onsite' || it.status === 'ready_for_dispatch')
                    );
                    return (
                      <div
                        key={sv.id}
                        onClick={() => openProjectWorkspace(prj)}
                        className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-indigo-300 dark:border-indigo-500/35 hover:border-[#FF6B00] cursor-pointer transition space-y-1.5"
                      >
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <span className="font-mono font-extrabold text-[11px] text-purple-700 dark:text-purple-300">
                            {prj.id} • {sv.id}
                          </span>
                          <div className="flex items-center gap-1.5">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                              bucket === 'today'
                                ? 'bg-rose-100 text-rose-900 dark:bg-rose-500/20 dark:text-rose-200'
                                : bucket === 'tomorrow'
                                  ? 'bg-amber-100 text-amber-900 dark:bg-amber-500/20 dark:text-amber-300'
                                  : 'bg-sky-100 text-sky-900 dark:bg-sky-500/20 dark:text-sky-300'
                            }`}>
                              {bucket === 'today' ? 'เข้าไซต์วันนี้' : bucket === 'tomorrow' ? 'เข้าไซต์พรุ่งนี้' : formatDateDMY(sv.visit_date)} ({sv.time_slot})
                            </span>
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              sv.prep_status === 'ready_for_pickup' || sv.prep_status === 'dispatched'
                                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300'
                                : 'bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-slate-300'
                            }`}>
                              {sv.prep_status === 'dispatched' ? 'จ่ายออกแล้ว' : sv.prep_status === 'ready_for_pickup' ? 'ของพร้อมขึ้นรถ' : sv.prep_status === 'prepping' ? 'ช่างเตรียมกำลังเทส' : 'รอจัดซื้อตัดสต๊อก'}
                            </span>
                          </div>
                        </div>
                        <div className="text-xs font-extrabold text-slate-900 dark:text-white">{prj.site_name}</div>
                        <div className="text-[11px] text-slate-700 dark:text-slate-300 font-semibold">{sv.visit_scope}</div>
                        <div className="text-[10px] text-slate-500 dark:text-slate-400">
                          ทีมช่าง: <strong>{sv.assigned_techs.join(', ')}</strong>
                          {preppedVisitItems.length > 0 && ` • S/N พร้อมส่ง: ${preppedVisitItems.map(i => i.serial_number || i.model_name).join(', ')}`}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {/* 0. CARDS: PINNED MULTI-DAY PROJECTS (PRJ-2026-XXX) */}
              {(selectedCategory === 'all' || selectedCategory === 'projects') &&
                assignedProjects.map((prj) => {
                  const rMeta = prj.route_code ? ROUTE_DEFINITIONS[prj.route_code] : null;
                  const latestLog = prj.daily_logs && prj.daily_logs.length > 0
                    ? prj.daily_logs[prj.daily_logs.length - 1]
                    : null;
                  const progressPct = latestLog ? latestLog.progress_percent : 0;
                  const pendingReqs = (prj.material_requests || []).filter(r => r.status === 'pending').length;
                  const addonCount = (prj.items || []).filter(i => i.is_addon).length;

                  return (
                    <div
                      key={'prj-' + prj.id}
                      className="p-4 rounded-2xl liquid-glass-card flex flex-col justify-between gap-3 relative overflow-hidden border border-purple-400 dark:border-purple-500/40 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
                    >
                      <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-purple-500 via-[#FF6B00] to-emerald-500" />

                      <div className="space-y-2.5">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <span className="text-[11px] font-extrabold px-2.5 py-1 rounded-lg bg-purple-500/20 text-purple-300 border border-purple-500/40 flex items-center gap-1 font-mono">
                            <Layers className="w-3 h-3" />
                            <span>[โปรเจกต์ติดตั้ง] {prj.id}</span>
                          </span>
                          <span className="px-2 py-0.5 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[10px] font-extrabold font-mono">
                            คืบหน้า {progressPct}%
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5 flex-wrap">
                          {(() => {
                            const nextVisit = (prj.site_visits || [])
                              .filter(sv => sv.visit_status !== 'completed')
                              .sort((a, b) => a.visit_date.localeCompare(b.visit_date))[0];
                            return nextVisit ? (
                              <span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-[#FF6B00] text-black font-mono">
                                นัดเข้าไซต์: {formatDateDMY(nextVisit.visit_date)} ({nextVisit.time_slot})
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-emerald-500/20 text-emerald-300">
                                รอส่งมอบโครงการ
                              </span>
                            );
                          })()}
                          <span className={`px-2 py-0.5 rounded-md text-[10px] font-extrabold border ${getProjectDeadlineRisk(prj.due_date, prj.status).badgeCls}`}>
                            {getProjectDeadlineRisk(prj.due_date, prj.status).label}
                          </span>
                          {rMeta && (
                            <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${rMeta.badgeBg} ${rMeta.badgeBorder} ${rMeta.badgeText}`}>
                              {rMeta.shortName} • {prj.district || ''}
                            </span>
                          )}
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-blue-500/15 text-blue-300 border border-blue-500/30">
                            งวดเบิกแล้ว {prj.batches?.length || 0} งวด
                          </span>
                          {addonCount > 0 && (
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                              +Add-on {addonCount} รายการ
                            </span>
                          )}
                          {pendingReqs > 0 && (
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-rose-500/20 text-rose-300 border border-rose-500/40">
                              ขอเบิกเพิ่ม {pendingReqs}
                            </span>
                          )}
                        </div>

                        <h4 className="text-base font-bold text-white leading-snug line-clamp-2">{prj.site_name}</h4>
                        <p className="text-xs text-slate-300 font-medium data-meta truncate">
                          ลูกค้า: <strong className="text-white font-bold">{prj.customer_name}</strong> ({prj.phone})
                        </p>
                        <p className="text-xs text-slate-400 flex items-start gap-1 data-meta">
                          <MapPin className="w-3.5 h-3.5 text-purple-400 flex-shrink-0 mt-0.5" />
                          <span className="line-clamp-2">{prj.location}</span>
                        </p>

                        {/* Progress bar */}
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-[10px] text-slate-400">
                            <span>บันทึกหน้างานสะสม {prj.daily_logs?.length || 0} วัน</span>
                            <span className="font-mono">กำหนดส่ง {prj.due_date}</span>
                          </div>
                          <div className="w-full h-2 rounded-full bg-white/[0.08] overflow-hidden">
                            <div
                              className="h-full bg-gradient-to-r from-purple-500 to-emerald-400 transition-all duration-300"
                              style={{ width: `${Math.min(100, Math.max(5, progressPct))}%` }}
                            />
                          </div>
                        </div>

                        {prj.assigned_techs && prj.assigned_techs.length > 0 && (
                          <div className="p-1.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-[11px] text-slate-300 flex items-center gap-1.5 flex-wrap">
                            <span className="text-slate-400 font-medium">ทีมช่างไซต์งาน:</span>
                            {prj.assigned_techs.map((name, idx) => (
                              <span key={idx} className="px-2 py-0.5 rounded-md bg-purple-500/20 text-purple-300 border border-purple-500/30 font-semibold text-[10px]">
                                {name}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => openProjectWorkspace(prj)}
                        className="w-full py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 active:scale-[0.97] text-white font-extrabold rounded-xl text-xs transition-all duration-150 cursor-pointer flex items-center justify-center gap-1.5 shadow-lg shadow-purple-500/25 border border-white/20"
                      >
                        <ClipboardList className="w-4 h-4" />
                        <span>เปิดจัดการไซต์งาน (Daily Log / ขอเบิกเพิ่ม / ส่งมอบ)</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}

              {/* 1. CARDS: NEW GOODS (stacked by order + model) */}
              {(selectedCategory === 'all' || selectedCategory === 'new_goods') &&
                newGoodsList.pageItems.map((group) => {
                  const order = orders.find(o => o.id === group.order_id);
                  const rMeta = order?.route_code ? ROUTE_DEFINITIONS[order.route_code] : null;
                  const firstItem = group.items[0];
                  const teamTechs = firstItem.assigned_techs && firstItem.assigned_techs.length > 0
                    ? firstItem.assigned_techs
                    : (firstItem.assigned_onsite_tech ? [firstItem.assigned_onsite_tech] : []);
                  const isAccepted = group.items.every(it => !!it.onsite_accepted_at);
                  const deliveryLabel = DELIVERY_MODE_LABEL[group.delivery_mode || 'install'] || 'ส่งพร้อมติดตั้ง';

                  return (
                    <div
                      key={'new-' + group.key}
                      className={`p-4 rounded-2xl liquid-glass-card flex flex-col justify-between gap-3 relative overflow-hidden border transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md ${isAccepted ? 'border-emerald-500/30' : 'border-white/[0.08]'}`}
                    >
                      <div className={`absolute top-0 left-0 right-0 h-1 ${isAccepted ? 'bg-emerald-500' : 'bg-[#FF6B00]'}`} />

                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className={`text-[11px] font-extrabold px-2.5 py-1 rounded-lg border flex items-center gap-1 ${isAccepted ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40' : 'bg-white/[0.05] text-slate-400 border-white/[0.1]'}`}>
                            <Package className="w-3 h-3" />
                            <span>{isAccepted ? 'ส่งของใหม่ • กำลังส่งมอบ' : 'ส่งของใหม่ • รอกดรับงาน'}</span>
                          </span>
                          {group.items.length > 1 && (
                            <span className="px-2 py-0.5 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[10px] font-extrabold flex items-center gap-1">
                              <Layers className="w-3 h-3" />
                              {group.items.length} เครื่อง
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5 flex-wrap">
                          {firstItem.scheduled_date && (
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-[#FF6B00] text-black font-mono">
                              วันที่ส่ง: {formatDateDMY(firstItem.scheduled_date)} ({firstItem.scheduled_time_slot || 'ทั้งวัน'})
                            </span>
                          )}
                          {firstItem.dispatch_route_zone && (
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/35">
                              {firstItem.dispatch_route_zone}
                            </span>
                          )}
                          {rMeta && (
                            <div className={`px-2 py-0.5 rounded-md text-[10px] font-bold border inline-flex items-center gap-1 ${rMeta.badgeBg} ${rMeta.badgeBorder} ${rMeta.badgeText}`}>
                              <span>{rMeta.shortName}</span>
                              <span>• {order?.district || ''}</span>
                            </div>
                          )}
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-blue-500/15 text-blue-300 border border-blue-500/30">
                            {deliveryLabel}
                          </span>
                        </div>

                        <h4 className="text-base font-bold text-white truncate">{group.model_name}</h4>
                        <p className="text-xs text-slate-300 font-medium data-meta truncate">ลูกค้า: <strong className="text-white font-bold">{order ? order.customer_name : '-'}</strong></p>
                        <p className="text-xs text-slate-500 flex items-start gap-1 data-meta">
                          <MapPin className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0 mt-0.5" />
                          <span className="line-clamp-2">{order ? order.delivery_location : '-'}</span>
                        </p>

                        {teamTechs.length > 0 && (
                          <div className="p-1.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-[11px] text-slate-300 flex items-center gap-1.5 flex-wrap">
                            <span className="text-slate-400 font-medium">ทีมงาน:</span>
                            {teamTechs.map((name, idx) => (
                              <span key={idx} className="px-2 py-0.2 rounded-md bg-[#FF6B00]/15 text-[#FF6B00] border border-[#FF6B00]/30 font-semibold text-[10px]">
                                {name}
                              </span>
                            ))}
                          </div>
                        )}

                        <div className="pt-2 border-t border-white/[0.08]">
                          <LatestUpdateBadge
                            logs={firstItem.activity_logs}
                            fallbackTimestamp={firstItem.delivered_at || firstItem.dispatched_at || firstItem.assigned_at || firstItem.updated_at || firstItem.created_at}
                            fallbackActor={firstItem.assigned_prep_tech}
                          />
                        </div>
                      </div>

                      <button
                        onClick={() => setActiveJob({ kind: 'new_goods', key: group.key })}
                        className="w-full py-2.5 bg-gradient-to-r from-[#FF6B00] to-[#E65A00] hover:from-[#FF8A24] hover:brightness-105 active:scale-[0.97] text-black font-extrabold rounded-xl text-xs transition-all duration-150 cursor-pointer flex items-center justify-center gap-1.5 shadow-lg shadow-[#FF6B00]/25 border border-white/20"
                      >
                        <ClipboardList className="w-4 h-4" />
                        <span>เปิดจัดการงาน</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}

              {/* 2. CARDS: REPAIRED RETURN */}
              {(selectedCategory === 'all' || selectedCategory === 'repair_return') &&
                repairedReturnsList.pageItems.map((ticket) => {
                  const rMeta = ticket.route_code ? ROUTE_DEFINITIONS[ticket.route_code] : null;
                  const teamTechs = ticket.assigned_techs && ticket.assigned_techs.length > 0
                    ? ticket.assigned_techs
                    : (ticket.assigned_onsite_tech ? [ticket.assigned_onsite_tech] : []);

                  return (
                    <div
                      key={'rep-return-' + ticket.id}
                      className="p-4 rounded-2xl liquid-glass-card flex flex-col justify-between gap-3 relative overflow-hidden border-purple-500/30 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
                    >
                      <div className="absolute top-0 left-0 right-0 h-1 bg-purple-500" />

                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11px] font-extrabold px-2.5 py-1 rounded-lg bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 flex items-center gap-1">
                            <RotateCcw className="w-3 h-3" />
                            <span>ส่งคืนเครื่องซ่อมให้ลูกค้า</span>
                          </span>
                          <span className="text-xs font-mono font-extrabold text-slate-300 data-key">{ticket.ticket_no}</span>
                        </div>

                        <div className="flex items-center gap-1.5 flex-wrap">
                          {ticket.scheduled_date && (
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-[#FF6B00] text-black font-mono">
                              วันที่ส่งคืน: {formatDateDMY(ticket.scheduled_date)} ({ticket.scheduled_time_slot || 'ทั้งวัน'})
                            </span>
                          )}
                          {ticket.dispatch_route_zone && (
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/35">
                              {ticket.dispatch_route_zone}
                            </span>
                          )}
                          {rMeta && (
                            <div className={`px-2 py-0.5 rounded-md text-[10px] font-bold border inline-flex items-center gap-1 ${rMeta.badgeBg} ${rMeta.badgeBorder} ${rMeta.badgeText}`}>
                              <span>{rMeta.name}</span>
                              <span>• {ticket.district || ''}</span>
                            </div>
                          )}
                        </div>

                        <h4 className="text-base font-bold text-white truncate data-key">{ticket.device_model || 'ไม่ระบุรุ่น'}</h4>
                        <p className="text-xs text-slate-400 font-mono data-meta truncate">S/N: {ticket.walkin_sn || '-'}</p>
                        <p className="text-xs text-slate-300 font-medium data-meta truncate">ลูกค้า: <strong className="text-white font-bold">{ticket.customer_name}</strong></p>
                        {ticket.customer_phone && (
                          toTelHref(ticket.customer_phone) ? (
                            <a
                              href={toTelHref(ticket.customer_phone)!}
                              onClick={(e) => e.stopPropagation()}
                              title="กดเพื่อโทรออก"
                              className="text-xs text-cyan-300 hover:underline flex items-center gap-1 data-meta cursor-pointer"
                            >
                              <Phone className="w-3.5 h-3.5 text-cyan-400 flex-shrink-0" />
                              <span>{ticket.customer_phone}</span>
                            </a>
                          ) : (
                            <p className="text-xs text-slate-400 flex items-center gap-1 data-meta">
                              <Phone className="w-3.5 h-3.5 text-cyan-400 flex-shrink-0" />
                              <span>{ticket.customer_phone}</span>
                            </p>
                          )
                        )}
                        <p className="text-xs text-slate-500 flex items-start gap-1 data-meta">
                          <MapPin className="w-3.5 h-3.5 text-cyan-400 flex-shrink-0 mt-0.5" />
                          <span className="line-clamp-2">{ticket.delivery_location || ticket.district || '-'}</span>
                        </p>

                        {teamTechs.length > 0 && (
                          <div className="p-1.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-[11px] text-slate-300 flex items-center gap-1.5 flex-wrap">
                            <span className="text-slate-400 font-medium">ทีมงาน:</span>
                            {teamTechs.map((name, idx) => (
                              <span key={idx} className="px-2 py-0.2 rounded-md bg-purple-500/20 text-purple-300 border border-purple-500/30 font-semibold text-[10px]">
                                {name}
                              </span>
                            ))}
                          </div>
                        )}

                        <div className="p-2 rounded-xl bg-purple-500/10 border border-purple-500/20 text-[11px] text-purple-300 line-clamp-2">
                          <strong>ผลการซ่อม:</strong> {ticket.repair_detail || 'เปลี่ยนอะไหล่และเทสผ่านแล้ว'}
                        </div>

                        <div className="pt-2 border-t border-white/[0.08]">
                          <LatestUpdateBadge
                            logs={ticket.activity_logs}
                            fallbackTimestamp={ticket.delivered_at || ticket.assigned_at || ticket.updated_at || ticket.created_at}
                            fallbackActor={ticket.received_by}
                          />
                        </div>
                      </div>

                      <button
                        onClick={() => setActiveJob({ kind: 'repair_return', key: ticket.id })}
                        className="w-full py-2.5 bg-gradient-to-r from-cyan-600 to-cyan-700 hover:from-cyan-500 hover:brightness-105 active:scale-[0.97] text-white font-bold rounded-xl text-xs transition-all duration-150 cursor-pointer flex items-center justify-center gap-1.5 shadow-lg shadow-cyan-600/25 border border-white/20"
                      >
                        <ClipboardList className="w-4 h-4" />
                        <span>เปิดจัดการงาน</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}

              {/* 3. CARDS: ONSITE PICKUP */}
              {(selectedCategory === 'all' || selectedCategory === 'pickup') &&
                pickupsList.pageItems.map((ticket) => {
                  const rMeta = ticket.route_code ? ROUTE_DEFINITIONS[ticket.route_code] : null;
                  const teamTechs = ticket.assigned_techs && ticket.assigned_techs.length > 0
                    ? ticket.assigned_techs
                    : (ticket.assigned_onsite_tech ? [ticket.assigned_onsite_tech] : []);

                  return (
                    <div
                      key={'pickup-' + ticket.id}
                      className="p-4 rounded-2xl liquid-glass-card flex flex-col justify-between gap-3 relative overflow-hidden border-amber-500/30 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
                    >
                      <div className="absolute top-0 left-0 right-0 h-1 bg-amber-500" />

                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11px] font-extrabold px-2.5 py-1 rounded-lg bg-amber-500/20 text-amber-400 border border-amber-500/40 flex items-center gap-1">
                            <Wrench className="w-3 h-3" />
                            <span>ออกซ่อม/รับเครื่องกลับร้าน</span>
                          </span>
                          <span className="text-xs font-mono font-extrabold text-amber-400 data-key">{ticket.ticket_no}</span>
                        </div>

                        <div className="flex items-center gap-1.5 flex-wrap">
                          {ticket.scheduled_date && (
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-[#FF6B00] text-black font-mono">
                              วันที่ส่งคืน: {formatDateDMY(ticket.scheduled_date)} ({ticket.scheduled_time_slot || 'ทั้งวัน'})
                            </span>
                          )}
                          {ticket.dispatch_route_zone && (
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/35">
                              {ticket.dispatch_route_zone}
                            </span>
                          )}
                          {rMeta && (
                            <div className={`px-2 py-0.5 rounded-md text-[10px] font-bold border inline-flex items-center gap-1 ${rMeta.badgeBg} ${rMeta.badgeBorder} ${rMeta.badgeText}`}>
                              <span>{rMeta.name}</span>
                              <span>• {ticket.district || ''}</span>
                            </div>
                          )}
                        </div>

                        <h4 className="text-base font-bold text-white truncate data-key">S/N: {ticket.walkin_sn}</h4>
                        <p className="text-xs text-slate-300 font-medium data-meta truncate">ลูกค้า: <strong className="text-white font-bold">{ticket.customer_name}</strong></p>
                        <p className="text-xs text-slate-500 flex items-start gap-1 data-meta">
                          <MapPin className="w-3.5 h-3.5 text-amber-400 flex-shrink-0 mt-0.5" />
                          <span className="line-clamp-2">{ticket.delivery_location || ticket.customer_phone || '-'}</span>
                        </p>

                        {teamTechs.length > 0 && (
                          <div className="p-1.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-[11px] text-slate-300 flex items-center gap-1.5 flex-wrap">
                            <span className="text-slate-400 font-medium">ทีมงาน:</span>
                            {teamTechs.map((name, idx) => (
                              <span key={idx} className="px-2 py-0.2 rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/30 font-semibold text-[10px]">
                                {name}
                              </span>
                            ))}
                          </div>
                        )}

                        <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-300 line-clamp-2">
                          <strong>อาการเสีย:</strong> {ticket.fault_symptom}
                        </div>

                        <div className="pt-2 border-t border-white/[0.08]">
                          <LatestUpdateBadge
                            logs={ticket.activity_logs}
                            fallbackTimestamp={ticket.started_at || ticket.assigned_at || ticket.updated_at || ticket.created_at}
                            fallbackActor={ticket.received_by}
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <button
                          onClick={() => setActiveJob({ kind: 'pickup', key: ticket.id })}
                          className="w-full py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:brightness-105 active:scale-[0.97] text-black font-extrabold rounded-xl text-xs transition-all duration-150 cursor-pointer flex items-center justify-center gap-1.5 shadow-lg shadow-amber-500/25 border border-white/20"
                        >
                          <ClipboardList className="w-4 h-4" />
                          <span>เปิดจัดการงาน</span>
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

      {/* ========================================================================= */}
      {/* MODAL 0: ONSITE JOB DETAIL & ACTION (card-to-modal, portal + z-[9999]) */}
      {/* ========================================================================= */}
      {(() => {
        if (!activeJob) return null;

        // Resolve the active job across all three lists
        let jobGroup: ItemGroup | null = null;
        let jobTicket: RepairTicket | null = null;

        if (activeJob.kind === 'new_goods') {
          jobGroup = groupItems(assignedNewGoods).find(g => g.key === activeJob.key) || null;
          if (!jobGroup) return null;
        } else if (activeJob.kind === 'repair_return') {
          jobTicket = assignedRepairedReturns.find(t => t.id === activeJob.key) || null;
          if (!jobTicket) return null;
        } else {
          jobTicket = assignedPickups.find(t => t.id === activeJob.key) || null;
          if (!jobTicket) return null;
        }

        const closeModal = () => {
          if (savingDelivery || uploadingDeliveryProof) return;
          setDeliveryError('');
          setDeliverySignature(null);
          setConfirmDeliveryKey(null);
          setActiveJob(null);
        };

        // ---------- NEW GOODS JOB ----------
        if (jobGroup) {
          const group = jobGroup;
          const order = orders.find(o => o.id === group.order_id);
          const rMeta = order?.route_code ? ROUTE_DEFINITIONS[order.route_code] : null;
          const firstItem = group.items[0];
          const teamTechs = firstItem.assigned_techs && firstItem.assigned_techs.length > 0
            ? firstItem.assigned_techs
            : (firstItem.assigned_onsite_tech ? [firstItem.assigned_onsite_tech] : []);
          const isAccepted = group.items.every(it => !!it.onsite_accepted_at);
          const deliveryLabel = DELIVERY_MODE_LABEL[group.delivery_mode || 'install'] || 'ส่งพร้อมติดตั้ง';
          const isConfirmingDelivery = confirmDeliveryKey === group.key;
          const cancelDeliveryConfirmation = () => {
            if (savingDelivery) return;
            setConfirmDeliveryKey(null);
            setDeliveryError('');
          };

          return (
            <>
            <Modal
              open
              onClose={closeModal}
              closeOnEscape={!isConfirmingDelivery}
              ariaLabel="รายละเอียดงาน Onsite"
              title={`งานส่งของใหม่ • ${group.model_name}`}
              subtitle={`${order?.customer_name || '-'}${rMeta ? ` • ${rMeta.shortName}` : ''}`}
              icon={<Package className="w-5 h-5" />}
              maxWidthClass="max-w-2xl"
              accentClass="border-emerald-500/40"
              footer={
                <div className="space-y-2">
                  {!isAccepted ? (
                    <button
                      onClick={() => { handleAcceptGroup(group); }}
                      className={modalPrimaryBtnClass + ' w-full flex items-center justify-center gap-2'}
                    >
                      <UserCheck className="w-4 h-4" />
                      <span>กดรับงานนี้ (Accept Job)</span>
                    </button>
                  ) : (
                    <button
                      onClick={() => setConfirmDeliveryKey(group.key)}
                      disabled={savingDelivery || uploadingDeliveryProof || isConfirmingDelivery}
                      className="w-full px-5 py-3 bg-gradient-to-r from-emerald-700 to-emerald-800 hover:from-emerald-800 active:scale-95 text-white font-extrabold rounded-xl text-sm transition cursor-pointer flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/25 border border-white/20 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <CheckCircle className="w-4 h-4" />
                      <span>{group.delivery_mode === 'drop_off'
                        ? `ส่งมอบและจบงาน (${group.items.length} เครื่อง)`
                        : `ส่งมอบ ติดตั้งเสร็จ และจบงาน (${group.items.length} เครื่อง)`}</span>
                    </button>
                  )}
                  <button
                    disabled={savingDelivery || isConfirmingDelivery}
                    onClick={() => {
                      handleOpenNewServiceSheet({
                        customer_name: order?.customer_name,
                        customer_phone: order?.customer_phone || '',
                        district: order?.district,
                        delivery_location: order?.delivery_location
                      });
                    }}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-white/20 hover:border-amber-500/50 bg-slate-100 dark:bg-white/[0.04] hover:bg-amber-100 dark:hover:bg-amber-500/10 text-slate-700 dark:text-slate-300 hover:text-amber-900 dark:hover:text-amber-300 text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer active:scale-98"
                  >
                    <ClipboardList className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                    <span>+ ออกใบ Service Sheet (บันทึกงานเพิ่ม / รับฝากหน้างาน)</span>
                  </button>
                </div>
              }
            >
              <div className="space-y-4">
                {/* Onsite Step badges (เฉพาะขั้นตอนของช่าง Onsite) */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  <StepBadge step={1} label="รอกดรับงาน" active={!isAccepted} done={isAccepted} />
                  <StepBadge step={2} label="กำลังออกไปส่ง / ถ่ายรูปหน้างาน" active={isAccepted} />
                  <StepBadge step={3} label="ปิดงานส่งมอบ" active={false} />
                </div>

                {/* Highlighted Schedule & Route Banner */}
                {(firstItem.scheduled_date || firstItem.dispatch_route_zone || rMeta) && (
                  <div className="p-3 rounded-2xl bg-indigo-50 dark:bg-indigo-500/15 border border-indigo-300 dark:border-indigo-500/40 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      {firstItem.scheduled_date && (
                        <span className="px-2.5 py-1 rounded-lg bg-[#FF6B00] text-black text-xs font-black font-mono">
                          นัดส่ง: {formatDateDMY(firstItem.scheduled_date)} ({firstItem.scheduled_time_slot || 'ทั้งวัน'})
                        </span>
                      )}
                      {firstItem.dispatch_route_zone && (
                        <span className="px-2.5 py-1 rounded-lg bg-indigo-600 text-white text-xs font-bold">
                          {firstItem.dispatch_route_zone}
                        </span>
                      )}
                      {rMeta && (
                        <span className={`px-2.5 py-1 rounded-lg text-xs font-bold border ${rMeta.badgeBg} ${rMeta.badgeBorder} ${rMeta.badgeText}`}>
                          {rMeta.shortName} • {order?.district || ''}
                        </span>
                      )}
                    </div>
                    <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-blue-100 text-blue-900 dark:bg-blue-500/20 dark:text-blue-200">
                      {deliveryLabel} • {group.items.length} เครื่อง
                    </span>
                  </div>
                )}

                {/* Highlighted Key Info: Customer, Clickable Phone, Address */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="p-3.5 rounded-2xl bg-amber-50/80 dark:bg-amber-500/10 border-2 border-amber-300 dark:border-amber-500/35">
                    <p className="text-[11px] text-amber-800 dark:text-amber-300 font-bold mb-1">ชื่อลูกค้า &amp; เบอร์โทรติดต่อ</p>
                    <p className="text-base font-black text-slate-900 dark:text-white leading-snug">{order ? order.customer_name : '-'}</p>
                    {order?.customer_phone && (
                      <a
                        href={`tel:${order.customer_phone.replace(/[^0-9+]/g, '')}`}
                        className="mt-1.5 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-extrabold shadow-sm"
                      >
                        <Phone className="w-3.5 h-3.5" />
                        <span>โทร: {order.customer_phone}</span>
                      </a>
                    )}
                  </div>
                  <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-white/[0.04] border-2 border-slate-300 dark:border-white/[0.12]">
                    <p className="text-[11px] text-slate-600 dark:text-slate-300 font-bold mb-1">สถานที่ส่งมอบ / หน้างาน</p>
                    <p className="text-sm font-extrabold text-slate-900 dark:text-white flex items-start gap-1.5 leading-snug">
                      <MapPin className="w-4 h-4 text-[#FF6B00] flex-shrink-0 mt-0.5" />
                      <span>{order ? order.delivery_location : '-'}</span>
                    </p>
                  </div>
                </div>

                {isAccepted && <div className="p-3 rounded-xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.08]">
                  <EvidencePhotoUploader
                    key={group.key}
                    value={goodsDeliveryPhotos[group.key] ?? []}
                    onChange={(urls) => setGoodsDeliveryPhotos(prev => ({ ...prev, [group.key]: urls }))}
                    onUploadingChange={setUploadingDeliveryProof}
                    editable={!savingDelivery}
                    folder="onsite"
                    label="รูปหลักฐานการส่งมอบ (ไม่บังคับ)"
                    helperText="แนบรูปส่งมอบหรือรูปใบส่งของได้ตามสะดวก"
                  />
                </div>}

                {/* Team */}
                {teamTechs.length > 0 && (
                  <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.08] text-xs flex items-center gap-1.5 flex-wrap">
                    <span className="text-slate-500 dark:text-slate-400 font-medium">ทีมงาน:</span>
                    {teamTechs.map((name, idx) => (
                      <span key={idx} className="px-2 py-0.5 rounded-md bg-[#FF6B00]/15 text-[#FF6B00] border border-[#FF6B00]/30 font-semibold text-[10px]">
                        {name}
                      </span>
                    ))}
                  </div>
                )}

                {isAccepted && (
                  <div className="text-[11px] text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                    <UserCheck className="w-3.5 h-3.5" />
                    <span>ผู้รับงาน: {firstItem.onsite_accepted_by || '-'} ({new Date(firstItem.onsite_accepted_at || Date.now()).toLocaleTimeString('th-TH')})</span>
                  </div>
                )}

                <details className="space-y-2">
                  <summary className="min-h-11 cursor-pointer rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-xs font-semibold text-slate-700 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-slate-200">
                    หมายเหตุการส่งมอบ ({group.items.length} เครื่อง)
                  </summary>
                  {group.items.map((item, idx) => (
                    <div key={item.id} className="p-3 rounded-xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.08] space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400">#{idx + 1}</span>
                        <span className="text-xs font-mono font-extrabold text-[#FF6B00]">{item.serial_number}</span>
                      </div>
                      <div className="flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400">
                        <span>วอยรับประกัน:</span>
                        <span className="font-mono text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1">
                          <ShieldCheck className="w-3 h-3" />
                          {item.void_date || 'ระบุแล้ว'}
                        </span>
                      </div>
                      <input
                        type="text"
                        aria-label={`หมายเหตุการส่งมอบ ${item.serial_number}`}
                        placeholder="หมายเหตุการส่งมอบ (ถ้ามี)"
                        value={deliveryNotes[item.id] || ''}
                        onChange={(e) => setDeliveryNotes({ ...deliveryNotes, [item.id]: e.target.value })}
                        className={modalInputClass}
                      />
                    </div>
                  ))}
                </details>

                {/* Activity */}
                <div className="pt-3 border-t border-slate-200 dark:border-white/[0.08] space-y-2">
                  <LatestUpdateBadge
                    logs={firstItem.activity_logs}
                    fallbackTimestamp={firstItem.delivered_at || firstItem.dispatched_at || firstItem.assigned_at || firstItem.updated_at || firstItem.created_at}
                    fallbackActor={firstItem.assigned_prep_tech}
                  />
                  <ActivityTimeline logs={firstItem.activity_logs} />
                </div>
                {isAccepted && (
                  <DeliverySignaturePad onChange={setDeliverySignature} disabled={savingDelivery || isConfirmingDelivery} />
                )}

              </div>
            </Modal>
            {isConfirmingDelivery && (
              <Modal
                open
                onClose={cancelDeliveryConfirmation}
                title="ยืนยันจบงาน"
                maxWidthClass="max-w-sm"
                accentClass="border-emerald-500/40"
                lockScroll={false}
                footer={
                  <div className="flex flex-wrap justify-end gap-2">
                    <button
                      type="button"
                      autoFocus
                      onClick={cancelDeliveryConfirmation}
                      disabled={savingDelivery}
                      className="min-h-11 rounded-xl border border-slate-300 px-4 text-sm font-bold dark:border-slate-600 disabled:opacity-50"
                    >
                      ยกเลิก
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDeliveryConfirmGroup(group)}
                      disabled={savingDelivery || uploadingDeliveryProof}
                      className="min-h-11 rounded-xl bg-emerald-700 px-4 text-sm font-bold text-white hover:bg-emerald-800 disabled:opacity-50"
                    >
                      {savingDelivery ? 'กำลังบันทึก…' : 'ยืนยันจบงาน'}
                    </button>
                  </div>
                }
              >
                <p className="text-sm">
                  {goodsDeliveryPhotos[group.key]?.length
                    ? 'ยืนยันส่งมอบและจบงานนี้หรือไม่?'
                    : 'ยังไม่ได้แนบรูป ต้องการจบงานโดยไม่แนบรูปหรือไม่?'}
                </p>
                {deliveryError && <p role="alert" className="mt-2 text-sm text-rose-600 dark:text-rose-300">{deliveryError}</p>}
              </Modal>
            )}
            </>
          );
        }

        // ---------- REPAIR RETURN / PICKUP JOB ----------
        const ticket = jobTicket!;
        const rMeta = ticket.route_code ? ROUTE_DEFINITIONS[ticket.route_code] : null;
        const teamTechs = ticket.assigned_techs && ticket.assigned_techs.length > 0
          ? ticket.assigned_techs
          : (ticket.assigned_onsite_tech ? [ticket.assigned_onsite_tech] : []);
        const isReturn = activeJob.kind === 'repair_return';

        return (
          <Modal
            open
            onClose={closeModal}
            ariaLabel="รายละเอียดงาน Onsite"
            title={`${isReturn ? 'ส่งคืนเครื่องซ่อมให้ลูกค้า' : 'ออกซ่อม/รับเครื่องกลับร้าน'} • ${ticket.ticket_no}`}
            subtitle={`${ticket.customer_name}${rMeta ? ` • ${rMeta.shortName}` : ''}`}
            icon={isReturn ? <RotateCcw className="w-5 h-5" /> : <Wrench className="w-5 h-5" />}
            maxWidthClass="max-w-2xl"
            accentClass={isReturn ? 'border-cyan-500/40' : 'border-amber-500/40'}
            footer={
              isReturn ? (
                <div className="space-y-2">
                  <button
                    onClick={() => { handleReturnConfirm(ticket.id, ticket.ticket_no); closeModal(); }}
                    className="w-full py-3 bg-gradient-to-r from-cyan-600 to-cyan-700 hover:from-cyan-500 active:scale-95 text-white font-bold rounded-xl text-sm transition cursor-pointer flex items-center justify-center gap-2 shadow-lg shadow-cyan-600/25 border border-white/20"
                  >
                    <CheckCircle className="w-4 h-4" />
                    <span>ส่งมอบเครื่องซ่อมเสร็จสิ้น (ปิดงาน)</span>
                  </button>
                  <button
                    onClick={() => {
                      handleOpenNewServiceSheet({
                        customer_name: ticket.customer_name,
                        customer_phone: ticket.customer_phone || '',
                        district: ticket.district,
                        delivery_location: ticket.delivery_location
                      });
                    }}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-white/20 hover:border-amber-500/50 bg-slate-100 dark:bg-white/[0.04] hover:bg-amber-100 dark:hover:bg-amber-500/10 text-slate-700 dark:text-slate-300 hover:text-amber-900 dark:hover:text-amber-300 text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer active:scale-98"
                  >
                    <ClipboardList className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                    <span>+ ออกใบ Service Sheet (บันทึกงานเพิ่ม / รับฝากหน้างาน)</span>
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => { handleOpenPickupForJob(ticket); closeModal(); }}
                  className="w-full px-5 py-3 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 active:scale-95 text-black font-extrabold rounded-xl text-sm transition cursor-pointer flex items-center justify-center gap-2 shadow-lg shadow-amber-500/25 border border-white/20"
                >
                  <Smartphone className="w-4 h-4" />
                  <span>รับเครื่องกลับซ่อมที่ร้าน (ส่งเข้าคิวช่างซ่อม)</span>
                </button>
              )
            }
          >
            <div className="space-y-4">
              {/* Highlighted Schedule & Route Banner */}
              {(ticket.scheduled_date || ticket.dispatch_route_zone || rMeta) && (
                <div className="p-3 rounded-2xl bg-indigo-50 dark:bg-indigo-500/15 border border-indigo-300 dark:border-indigo-500/40 flex flex-wrap items-center gap-2">
                  {ticket.scheduled_date && (
                    <span className="px-2.5 py-1 rounded-lg bg-[#FF6B00] text-black text-xs font-black font-mono">
                      นัดหมาย: {formatDateDMY(ticket.scheduled_date)} ({ticket.scheduled_time_slot || 'ทั้งวัน'})
                    </span>
                  )}
                  {ticket.dispatch_route_zone && (
                    <span className="px-2.5 py-1 rounded-lg bg-indigo-600 text-white text-xs font-bold">
                      {ticket.dispatch_route_zone}
                    </span>
                  )}
                  {rMeta && (
                    <span className={`px-2.5 py-1 rounded-lg text-xs font-bold border ${rMeta.badgeBg} ${rMeta.badgeBorder} ${rMeta.badgeText}`}>
                      {rMeta.shortName} • {ticket.district || ''}
                    </span>
                  )}
                </div>
              )}

              {/* Highlighted Customer / Device Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-3.5 rounded-2xl bg-amber-50/80 dark:bg-amber-500/10 border-2 border-amber-300 dark:border-amber-500/35">
                  <p className="text-[11px] text-amber-800 dark:text-amber-300 font-bold mb-1">ชื่อลูกค้า &amp; เบอร์โทรติดต่อ</p>
                  <p className="text-base font-black text-slate-900 dark:text-white leading-snug">{ticket.customer_name}</p>
                  {ticket.customer_phone && (
                    <a
                      href={`tel:${ticket.customer_phone.replace(/[^0-9+]/g, '')}`}
                      className="mt-1.5 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-extrabold shadow-sm"
                    >
                      <Phone className="w-3.5 h-3.5" />
                      <span>โทร: {ticket.customer_phone}</span>
                    </a>
                  )}
                </div>
                <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-white/[0.04] border-2 border-slate-300 dark:border-white/[0.12]">
                  <p className="text-[11px] text-slate-600 dark:text-slate-300 font-bold mb-1">เลขเครื่อง (S/N) &amp; รุ่น</p>
                  <p className="text-base font-mono font-black text-[#FF6B00]">{ticket.walkin_sn || '-'}</p>
                  {ticket.device_model && (
                    <p className="text-xs font-bold text-slate-800 dark:text-slate-200 mt-1">{ticket.device_model}</p>
                  )}
                </div>
              </div>

              {/* Location */}
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.08] text-xs">
                <p className="text-slate-500 dark:text-slate-400 font-medium mb-0.5">สถานที่</p>
                <p className="font-semibold text-slate-900 dark:text-white flex items-start gap-1">
                  <MapPin className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0 mt-0.5" />
                  <span>{ticket.delivery_location || ticket.customer_phone || '-'}</span>
                </p>
              </div>

              {/* Symptom / repair result */}
              <div className={`p-3 rounded-xl border text-xs ${isReturn
                ? 'bg-cyan-500/10 border-cyan-500/20 text-cyan-700 dark:text-cyan-300'
                : 'bg-amber-500/10 border-amber-500/20 text-amber-700 dark:text-amber-300'}`}>
                <strong>{isReturn ? 'สรุปการซ่อม:' : 'อาการเสีย:'}</strong>{' '}
                {isReturn ? (ticket.repair_detail || 'เปลี่ยนอะไหล่และเทสผ่านแล้ว') : ticket.fault_symptom}
              </div>

              {/* Team */}
              {teamTechs.length > 0 && (
                <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.08] text-xs flex items-center gap-1.5 flex-wrap">
                  <span className="text-slate-500 dark:text-slate-400 font-medium">ทีมงาน:</span>
                  {teamTechs.map((name, idx) => (
                    <span key={idx} className={`px-2 py-0.5 rounded-md border font-semibold text-[10px] ${isReturn
                      ? 'bg-purple-500/20 text-purple-600 dark:text-purple-300 border-purple-500/30'
                      : 'bg-amber-500/20 text-amber-600 dark:text-amber-300 border-amber-500/30'}`}>
                      {name}
                    </span>
                  ))}
                </div>
              )}

              {/* Onsite Return / Pickup Evidence Photos */}
              {(isReturn || (ticket.photo_urls && ticket.photo_urls.length > 0)) && (
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.08]">
                  <EvidencePhotoUploader
                    value={(isReturn ? deliveryPhotos[ticket.id] : ticket.photo_urls) ?? []}
                    onChange={(urls) => setDeliveryPhotos(prev => ({ ...prev, [ticket.id]: urls }))}
                    folder="onsite"
                    editable={isReturn}
                    label={isReturn ? 'รูปถ่ายหลักฐานส่งคืนเครื่องซ่อม' : 'รูปถ่ายหน้างานที่แนบไว้'}
                    helperText={isReturn ? 'ถ่ายรูปส่งมอบเครื่องคืนลูกค้าหน้างาน (สูงสุด 3 รูป)' : undefined}
                  />
                </div>
              )}

              {/* Activity */}
              <div className="pt-3 border-t border-slate-200 dark:border-white/[0.08] space-y-2">
                <LatestUpdateBadge
                  logs={ticket.activity_logs}
                  fallbackTimestamp={ticket.delivered_at || ticket.assigned_at || ticket.updated_at || ticket.created_at}
                  fallbackActor={ticket.received_by}
                />
                <ActivityTimeline logs={ticket.activity_logs} />
              </div>
            </div>
          </Modal>
        );
      })()}

      {/* ========================================================================= */}
      {/* MODAL 1: FORM บันทึกการรับเครื่องซ่อมกลับร้าน / ออกใบ Service Sheet (Mobile-Friendly) */}
      {/* ========================================================================= */}
      {isPickupModalOpen && createPortal(
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 sm:p-6 bg-black/60 backdrop-blur-sm overflow-y-auto overscroll-contain animate-fade-in">
          <div className="w-full max-w-lg max-h-[82dvh] sm:max-h-[86dvh] overflow-y-auto overscroll-contain bg-white dark:bg-slate-900 text-slate-900 dark:text-white rounded-3xl p-4 sm:p-7 border border-slate-200 dark:border-[#FF6B00]/40 shadow-2xl relative animate-modal-pop">
            <button
              onClick={() => setIsPickupModalOpen(false)}
              aria-label="ปิดฟอร์ม"
              className="absolute right-3 top-3 sm:right-5 sm:top-5 p-2 rounded-xl text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/[0.06] cursor-pointer min-w-[44px] min-h-[44px] flex items-center justify-center"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2 mb-4">
              <div className={`p-2 rounded-xl border ${modalMode === 'service_sheet' ? 'bg-[#FF6B00]/15 text-[#E65A00] dark:bg-[#FF6B00]/20 dark:text-[#FF6B00] border-[#FF6B00]/30' : 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-500/20 dark:text-amber-400 dark:border-amber-500/30'}`}>
                {modalMode === 'service_sheet' ? <ClipboardList className="w-5 h-5" /> : <Smartphone className="w-5 h-5" />}
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  {modalMode === 'service_sheet'
                    ? 'ออกใบ Service Sheet (รับฝาก / งานเพิ่มหน้างาน)'
                    : 'บันทึกรับเครื่องซ่อมจากหน้างานกลับร้าน'}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {modalMode === 'service_sheet'
                    ? 'บันทึกงานบริการเสริมหรือรับฝากเครื่องจากลูกค้าหน้างาน (ไม่ปิดงานส่งสินค้าหลัก)'
                    : 'ส่งต่อเครื่องจากงาน Onsite เข้าคิวซ่อมหน้าร้าน (ปิดงาน Onsite อัตโนมัติ)'}
                </p>
              </div>
            </div>

            <form onSubmit={handleSubmitPickupForm} className="space-y-4 text-xs">
              {/* Evidence Photos in Pickup / Service Sheet Form */}
              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                <EvidencePhotoUploader
                  value={pickupPhotos}
                  onChange={setPickupPhotos}
                  folder="onsite"
                  label="รูปถ่ายอาการเสีย / สภาพเครื่องหน้างาน"
                  helperText="แนบรูปอาการเสีย, ตำหนิ หรือสภาพหน้างาน (สูงสุด 3 รูป)"
                />
              </div>

              {/* S/N Smart Search & Auto-Fill */}
              <div className="rounded-2xl p-3.5 border border-slate-200 dark:border-white/[0.1] bg-slate-50 dark:bg-white/[0.03] space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-1.5">
                  <label className="block text-slate-700 dark:text-slate-300 font-semibold">
                    ค้นหาด้วย Serial Number (S/N) เพื่อดึงข้อมูลอัตโนมัติ
                  </label>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">
                    หรือกรอกข้อมูลเองด้านล่าง
                  </span>
                </div>
                <div className="flex items-center gap-2 min-w-0">
                  <input
                    type="text"
                    placeholder="สแกนหรือพิมพ์ S/N เช่น BC-2026-002 (ถ้าเคยซื้อกับร้านระบบจะกรอกให้เอง)"
                    value={sn}
                    onChange={(e) => handleSnChange(e.target.value)}
                    className="flex-1 min-w-0 w-full rounded-xl px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-300 dark:border-slate-700 placeholder-slate-400 font-mono focus:outline-none focus:border-blue-500"
                  />
                  <button
                    type="button"
                    onClick={() => setIsScannerOpen(true)}
                    title="สแกน S/N ด้วยกล้อง"
                    aria-label="สแกน S/N ด้วยกล้อง"
                    className="flex-shrink-0 p-2.5 rounded-xl bg-amber-100 hover:bg-amber-200 text-amber-800 border border-amber-300 dark:bg-amber-500/15 dark:hover:bg-amber-500/25 dark:text-amber-400 dark:border-amber-500/30 transition cursor-pointer active:scale-95"
                  >
                    <ScanLine className="w-4 h-4" />
                  </button>
                </div>

                {snLookup.found ? (
                  <div className="rounded-xl p-2.5 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="text-emerald-800 dark:text-emerald-200 space-y-0.5">
                      <div className="font-bold flex items-center gap-1.5">
                        <CheckCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                        <span>พบข้อมูลสินค้าที่เคยซื้อในระบบ — กรอกชื่อลูกค้าและรุ่นเครื่องให้อัตโนมัติแล้ว</span>
                      </div>
                      {(snLookup.billNo || snLookup.salesRef) && (
                        <div className="text-[11px] font-mono opacity-90">
                          เอกสาร: {snLookup.billNo || snLookup.salesRef}
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={clearAutoFill}
                      className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-white dark:bg-white/10 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-white/15 hover:bg-slate-100 dark:hover:bg-white/20 transition cursor-pointer"
                    >
                      ล้างเพื่อกรอกเอง
                    </button>
                  </div>
                ) : sn.trim().length >= 3 ? (
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    ไม่พบ S/N "{sn.trim()}" ในประวัติการขาย — สามารถกรอกข้อมูลลูกค้าและรุ่นเครื่องเองด้านล่างได้เลย
                  </p>
                ) : null}
              </div>

              {/* Customer Info */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">ชื่อลูกค้า / บริษัท *</label>
                  <input
                    type="text"
                    required
                    placeholder="ชื่อผู้ติดต่อหรือบริษัท"
                    value={custName}
                    onChange={(e) => setCustName(e.target.value)}
                    className="w-full rounded-xl px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-300 dark:border-slate-700 placeholder-slate-400 focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label htmlFor="onsite-customer-phone" className="block text-slate-700 dark:text-slate-300 font-medium mb-1">เบอร์โทรติดต่อ</label>
                  <PhoneInput
                    id="onsite-customer-phone"
                    value={custPhone}
                    onChange={(e) => setCustPhone(e.target.value)}
                    className="w-full rounded-xl px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-300 dark:border-slate-700 placeholder-slate-400 focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              {/* District & Location */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">อำเภอ / สายรถ *</label>
                  <select
                    value={district}
                    onChange={(e) => setDistrict(e.target.value)}
                    className="w-full rounded-xl px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-300 dark:border-slate-700 focus:outline-none focus:border-blue-500"
                  >
                    {DISTRICT_OPTIONS.map(opt => (
                      <option key={opt.district} value={opt.district} className="bg-white dark:bg-[#12141A]">
                        {opt.district} - [{opt.zone}]
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">จุดรับเครื่อง / ที่อยู่</label>
                  <input
                    type="text"
                    placeholder="เช่น หน้าร้าน, ออฟฟิศชั้น 2"
                    value={deliveryLocation}
                    onChange={(e) => setDeliveryLocation(e.target.value)}
                    className="w-full rounded-xl px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-300 dark:border-slate-700 placeholder-slate-400 focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              {district === 'ต่างจังหวัด / งานเหมาพิเศษ' && (
                <div>
                  <label className="block text-amber-700 dark:text-amber-400 font-medium mb-1">ระบุจังหวัด / งานพิเศษ</label>
                  <input
                    type="text"
                    placeholder="เช่น ชุมพร, พังงา"
                    value={provinceCustom}
                    onChange={(e) => setProvinceCustom(e.target.value)}
                    className="w-full rounded-xl px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-300 dark:border-slate-700 placeholder-slate-400 focus:outline-none focus:border-blue-500"
                  />
                </div>
              )}

              {/* Hardware Model */}
              <div className="pt-2 border-t border-slate-200 dark:border-white/[0.08]">
                <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">รุ่นสินค้า / ยี่ห้อเครื่อง</label>
                <input
                  type="text"
                  placeholder="เช่น BossComputech POS X1, โน้ตบุ๊ก Dell"
                  value={deviceModel}
                  onChange={(e) => setDeviceModel(e.target.value)}
                  className="w-full rounded-xl px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-300 dark:border-slate-700 placeholder-slate-400 focus:outline-none focus:border-blue-500"
                />
              </div>

              {/* Auto Warranty Status Badge */}
              {warrantyStatusText && (
                <div className={`p-2.5 rounded-xl border text-[11px] font-medium flex items-center justify-between ${warrantyBadgeClass}`}>
                  <span className="flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>{warrantyStatusText}</span>
                  </span>
                  <span className="text-[10px] opacity-80">เช็คจากระบบ S/N</span>
                </div>
              )}

              {/* Accessories Checkboxes */}
              <div className="pt-2 border-t border-slate-200 dark:border-white/[0.08]">
                <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-2">
                  อุปกรณ์ที่ติดมาด้วย (Accessories Checklist) *
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {ACCESSORY_PRESETS.map((acc) => {
                    const isChecked = selectedAccessories.includes(acc);
                    return (
                      <button
                        type="button"
                        key={acc}
                        onClick={() => toggleAccessory(acc)}
                        className={`p-2 rounded-xl border text-left flex items-center gap-2 transition cursor-pointer ${isChecked
                          ? 'bg-amber-100 border-amber-300 text-amber-900 dark:bg-amber-500/15 dark:border-amber-500/40 dark:text-amber-300 font-semibold'
                          : 'bg-slate-50 dark:bg-white/[0.03] border-slate-200 dark:border-white/[0.06] text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                          }`}
                      >
                        {isChecked ? (
                          <CheckSquare className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0" />
                        ) : (
                          <Square className="w-4 h-4 text-slate-400 dark:text-slate-500 flex-shrink-0" />
                        )}
                        <span className="text-xs">{acc}</span>
                      </button>
                    );
                  })}
                </div>

                <div className="mt-2.5">
                  <input
                    type="text"
                    placeholder="อุปกรณ์อื่นๆ เพิ่มเติม (เช่น คีย์บอร์ด, เมาส์, Flash drive)"
                    value={accessoriesOther}
                    onChange={(e) => setAccessoriesOther(e.target.value)}
                    className="w-full rounded-xl px-3 py-2 text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-300 dark:border-slate-700 placeholder-slate-400 focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              {/* Symptom / Service Notes */}
              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                  {modalMode === 'service_sheet'
                    ? 'รายละเอียดงานบริการ / อาการเสียที่รับฝาก *'
                    : 'อาการเสียที่ลูกค้าแจ้ง / สภาพตัวเครื่อง *'}
                </label>
                <textarea
                  rows={3}
                  required
                  placeholder={modalMode === 'service_sheet' ? 'เช่น ลูกค้าฝากเครื่องปริ้นเตอร์ Brother ให้ตรวจเช็กเพิ่ม, ลูกค้าขอเดินสาย LAN เพิ่ม 1 จุด' : 'เช่น เปิดไม่ติด ไฟเข้าแต่พัดลมไม่หมุน, มีรอยแตกมุมซ้าย'}
                  value={faultSymptom}
                  onChange={(e) => setFaultSymptom(e.target.value)}
                  className="w-full rounded-2xl px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-300 dark:border-slate-700 placeholder-slate-400 focus:outline-none focus:border-blue-500"
                />
              </div>

              {/* Checkbox for service sheet: Bring back to repair room */}
              {modalMode === 'service_sheet' && (
                <div className="p-3 rounded-2xl bg-amber-100 border border-amber-300 dark:bg-amber-500/10 dark:border-amber-500/30 space-y-1">
                  <label className="flex items-center gap-2.5 cursor-pointer text-xs font-bold text-amber-900 dark:text-amber-300">
                    <input
                      type="checkbox"
                      checked={sendToRepairShop}
                      onChange={(e) => setSendToRepairShop(e.target.checked)}
                      className="w-4 h-4 rounded text-[#FF6B00] focus:ring-0 cursor-pointer"
                    />
                    <span>นำเครื่องกลับเข้าห้องช่างซ่อม (สร้างใบรับซ่อม REP-... ส่งต่อช่างหน้าร้าน)</span>
                  </label>
                  <p className="text-[11px] text-amber-800 dark:text-slate-400 pl-6.5">
                    * ไม่ปิดงานส่งสินค้าหลัก ช่าง Onsite สามารถส่งมอบออเดอร์เดิมต่อได้ตามปกติ
                  </p>
                </div>
              )}

              {/* Recorded By Tech */}
              <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 flex items-center justify-between text-[11px] text-slate-700 dark:text-slate-300">
                <span className="text-slate-500 dark:text-slate-400">ช่าง Onsite ผู้บันทึก:</span>
                <span className="text-amber-700 dark:text-amber-400 font-bold">{currentUser?.name || 'ช่าง Onsite'}</span>
              </div>

              {/* Buttons */}
              <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setIsPickupModalOpen(false)}
                  className="w-full sm:w-1/3 px-6 py-2.5 min-h-[44px] rounded-xl bg-slate-100 dark:bg-white/[0.04] hover:bg-slate-200 dark:hover:bg-white/[0.08] border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold cursor-pointer"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  className="w-full sm:w-2/3 py-2.5 min-h-[44px] bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 active:scale-95 text-black font-extrabold rounded-xl text-xs transition cursor-pointer shadow-xl shadow-amber-500/25 border border-white/20 flex items-center justify-center gap-1.5"
                >
                  <CheckCircle className="w-4 h-4" />
                  <span>
                    {modalMode === 'service_sheet'
                      ? 'บันทึก Service Sheet & ออกใบรับ'
                      : 'บันทึกการรับเครื่อง & ส่งเข้าห้องซ่อม'}
                  </span>
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: OFFICIAL A5 LANDSCAPE RECEIPT (ใบรับซ่อมสินค้า — shared template) */}
      {/* ========================================================================= */}
      {receiptTicket && createPortal(
        <div
          className="onsite-receipt-portal fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-6 bg-black/60 backdrop-blur-sm overflow-y-auto overscroll-contain animate-fade-in"
          role="dialog"
          aria-modal="true"
          aria-label="ใบรับซ่อมสินค้า"
        >
          <div className="onsite-receipt-panel w-full max-w-4xl max-h-[82dvh] sm:max-h-[86dvh] overflow-y-auto overscroll-contain bg-white dark:bg-slate-900 text-slate-900 dark:text-white rounded-3xl p-4 sm:p-6 border border-emerald-300 dark:border-emerald-500/40 shadow-2xl relative text-xs animate-modal-pop">
            <button
              onClick={() => setReceiptTicket(null)}
              aria-label="ปิดใบรับซ่อม"
              className="absolute right-3 top-3 sm:right-4 sm:top-4 p-2 rounded-xl text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/[0.06] cursor-pointer no-print min-w-[44px] min-h-[44px] flex items-center justify-center z-10"
            >
              <X className="w-5 h-5" />
            </button>

            {(() => {
              const live = receiptTicket;
              const acc = live.included_accessories ||
                [...(live.accessories || []), live.accessories_other || ''].filter(Boolean).join(', ');
              const category = inferDeviceCategory(live.device_model);
              const otherAcc = [
                live.accessories_other || '',
                live.replacement_sn ? `S/N ใหม่: ${live.replacement_sn}` : ''
              ].filter(Boolean).join(' • ');
              const notes = [
                live.repair_detail || '',
                live.parts_used ? `อะไหล่: ${live.parts_used}` : ''
              ].filter(Boolean).join(' • ');
              const dueDate = formatReceiptDate(live.finished_at);
              const receivedBy = live.received_by || live.picked_up_by || currentUser?.name || '-';
              const repairedBy = live.repaired_by || '-';

              const cell = 'border border-black px-1.5 py-0.5 align-top leading-tight';
              const label = 'font-bold whitespace-nowrap';
              const value = 'font-normal';

              return (
                <div className="overflow-x-auto -mx-1 px-1">
                  <div
                    id="repair-receipt-print"
                    className="min-w-[540px] sm:min-w-0 bg-white text-black rounded-lg p-3 sm:p-4 text-[10px] leading-tight print:p-0 print:text-[10px] print:leading-tight"
                  >
                  {/* ---- Official Company Header ---- */}
                  <div className="flex items-start justify-between gap-4 pb-1.5 mb-1.5 border-b-2 border-black">
                    <div className="min-w-0">
                      <div className="font-extrabold text-[12px] sm:text-[13px] leading-tight">{COMPANY_NAME}</div>
                      <div className="mt-0.5">{COMPANY_ADDRESS}</div>
                      <div className="mt-0.5">{COMPANY_PHONE}</div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="font-extrabold text-base sm:text-lg tracking-wide">ใบรับซ่อมสินค้า</div>
                      <div className="mt-0.5 text-[10px]">
                        <span className={label}>วันที่ </span>
                        <span>{formatReceiptDateTime(live.received_at || live.created_at)}</span>
                      </div>
                      <div className="text-[10px]">
                        <span className={label}>ออกโดย </span>
                        <span>{receivedBy}</span>
                      </div>
                    </div>
                  </div>

                  {/* ---- Structured Bordered Grid ---- */}
                  <table className="w-full border-collapse border border-black text-black bg-white">
                    <tbody>
                      <tr>
                        <td className={cell + ' w-[34%]'}>
                          <span className={label}>เลขที่ใบรับซ่อม : </span>
                          <span className={value + ' font-mono font-bold'}>{live.ticket_no}</span>
                        </td>
                        <td className={cell + ' w-[36%]'}>
                          <span className={label}>วันที่รับซ่อม : </span>
                          <span className={value}>{formatReceiptDateTime(live.received_at || live.created_at)}</span>
                        </td>
                        <td className={cell + ' w-[30%]'}>
                          <span className={label}>เบอร์ติดต่อ : </span>
                          <span className={value}>{live.customer_phone || '-'}</span>
                        </td>
                      </tr>
                      <tr>
                        <td className={cell}>
                          <span className={label}>ชื่อลูกค้า : </span>
                          <span className={value + ' font-semibold'}>{live.customer_name}</span>
                        </td>
                        <td className={cell} colSpan={2}>
                          <span className={label}>รุ่น : </span>
                          <span className={value}>{live.device_model || '-'}</span>
                        </td>
                      </tr>
                      {/* ผู้รับเครื่อง / ช่างผู้ซ่อม */}
                      <tr>
                        <td className={cell} colSpan={2}>
                          <span className={label}>รับเครื่องโดย (Onsite) : </span>
                          <span className={value + ' font-semibold'}>{receivedBy}</span>
                        </td>
                        <td className={cell}>
                          <span className={label}>ช่างผู้ซ่อม : </span>
                          <span className={value + ' font-semibold'}>{repairedBy}</span>
                        </td>
                      </tr>
                      <tr>
                        <td className={cell} colSpan={3}>
                          <span className={label}>ที่อยู่ : </span>
                          <span className={value}>{live.delivery_location || live.district || '-'}</span>
                        </td>
                      </tr>
                      <tr>
                        <td className={cell}>
                          <span className={label}>สินค้า : </span>
                          <span className={value}>{category}</span>
                        </td>
                        <td className={cell} colSpan={2}>
                          <span className={label}>Serial No. : </span>
                          <span className={value + ' font-mono'}>{live.walkin_sn || '-'}</span>
                        </td>
                      </tr>
                      <tr>
                        <td className={cell} colSpan={3}>
                          <span className={label}>สภาพเครื่อง : </span>
                          <span className={value}>{live.accessories && live.accessories.length > 0 ? 'มีอุปกรณ์ติดมาด้วย (ตามรายการด้านล่าง)' : 'ตัวเครื่องเปล่า / ตามที่ตรวจรับ'}</span>
                        </td>
                      </tr>
                      <tr>
                        <td className={cell} colSpan={3}>
                          <span className={label}>อาการเสีย : </span>
                          <span className={value + ' font-semibold'}>{live.fault_symptom}</span>
                        </td>
                      </tr>
                      <tr>
                        <td className={cell} colSpan={3}>
                          <span className={label}>อุปกรณ์ที่นำมาด้วย : </span>
                          <span className={value}>{acc || 'ตัวเครื่องเปล่า (ไม่มีอุปกรณ์ติดมา)'}</span>
                        </td>
                      </tr>
                      <tr>
                        <td className={cell} colSpan={3}>
                          <span className={label}>อุปกรณ์อื่นๆ : </span>
                          <span className={value}>{otherAcc || '-'}</span>
                        </td>
                      </tr>
                      <tr>
                        <td className={cell} colSpan={3}>
                          <span className={label}>บันทึกเพิ่มเติม : </span>
                          <span className={value}>{notes || '-'}</span>
                        </td>
                      </tr>
                      <tr>
                        <td className={cell + ' w-1/2'}>
                          <span className={label}>ประเมินค่าซ่อม : </span>
                          <span className={value + ' font-bold'}>
                            {live.repair_cost != null ? live.repair_cost.toLocaleString('th-TH') : '-'}
                          </span>
                          <span className={value}> บาท</span>
                        </td>
                        <td className={cell + ' w-1/2'} colSpan={2}>
                          <span className={label}>วันนัดรับสินค้า : </span>
                          <span className={value}>{dueDate || '........./........./.........'}</span>
                        </td>
                      </tr>
                    </tbody>
                  </table>

                  {/* ---- Terms & Signature Footer ---- */}
                  <div className="mt-1 text-[10px] leading-tight">
                    <span className="font-bold">หมายเหตุ : </span>
                    <span>{RECEIPT_DISCLAIMER}</span>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-8 text-[10px] leading-tight">
                    <div className="text-center">
                      <div className="mb-1">ลงชื่อ ........................................ ผู้ส่งซ่อม</div>
                      <div>วันที่ ........./........./.........</div>
                    </div>
                    <div className="text-center">
                      <div className="mb-1">ลงชื่อ ........................................ พนักงาน</div>
                      <div>วันที่ ........./........./.........</div>
                    </div>
                  </div>
                </div>
                </div>
              );
            })()}

            {/* Modal Actions */}
            <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center gap-2 pt-4 border-t border-slate-200 dark:border-white/[0.08] no-print">
              <PrintGuideButton docType="repair_receipt" />
              <button
                onClick={() => setReceiptTicket(null)}
                className="px-4 py-2.5 min-h-[44px] rounded-xl bg-slate-100 dark:bg-white/[0.06] hover:bg-slate-200 dark:hover:bg-white/[0.12] border border-slate-300 dark:border-white/[0.1] text-slate-700 dark:text-slate-300 text-xs font-semibold cursor-pointer"
              >
                เสร็จสิ้น
              </button>
              <button
                onClick={handlePrintReceipt}
                className="flex-1 py-2.5 min-h-[44px] bg-[#FF6B00] hover:bg-[#E65A00] text-black font-extrabold rounded-xl text-xs transition cursor-pointer flex items-center justify-center gap-1.5 shadow-lg shadow-[#FF6B00]/25"
              >
                <Printer className="w-4 h-4" />
                <span>พิมพ์ใบรับซ่อม</span>
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Camera S/N Scanner (unified intake modal) */}
      <BarcodeScannerModal
        open={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onScan={(code) => {
          handleSnChange(code.trim());
          setIsScannerOpen(false);
        }}
        title="สแกน S/N เครื่อง"
        hint="ส่องกล้องไปที่บาร์โค้ด S/N บนตัวเครื่องหรือกล่องสินค้า"
      />

      {/* ========================================================================= */}
      {/* MODAL 3: ONSITE PROJECT WORKSPACE MODAL (PRJ-..., createPortal, z-[9999]) */}
      {/* ========================================================================= */}
      {activeProject && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-6 bg-black/70 backdrop-blur-sm animate-fade-in overscroll-contain">
          <div className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white border border-purple-300 dark:border-purple-500/40 shadow-2xl rounded-3xl w-full max-w-4xl max-h-[94dvh] sm:max-h-[82dvh] sm:max-h-[86dvh] flex flex-col overflow-hidden animate-modal-pop">
            {/* Header */}
            <div className="p-4 sm:p-5 bg-slate-50/90 dark:bg-slate-900/95 border-b border-slate-200 dark:border-slate-800 flex items-start justify-between gap-2 flex-shrink-0">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="px-2.5 py-0.5 rounded-lg text-xs font-mono font-black bg-purple-600 text-white">
                    {activeProject.id}
                  </span>
                  <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-extrabold border ${getProjectDeadlineRisk(activeProject.due_date, activeProject.status).badgeCls}`}>
                    {getProjectDeadlineRisk(activeProject.due_date, activeProject.status).label}
                  </span>
                  <span className="px-2.5 py-0.5 rounded-lg text-[11px] font-bold bg-emerald-100 text-emerald-900 border border-emerald-300 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30">
                    เซลล์: {activeProject.created_by}
                  </span>
                </div>
                <h3 className="text-base sm:text-lg font-black text-slate-900 dark:text-white mt-1.5 leading-snug">
                  {activeProject.site_name}
                </h3>
                <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
                  <span className="font-extrabold text-slate-900 dark:text-white">
                    ลูกค้า: {activeProject.customer_name}
                  </span>
                  {activeProject.phone && (
                    <a
                      href={`tel:${activeProject.phone.replace(/[^0-9+]/g, '')}`}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white font-extrabold text-[11px]"
                    >
                      <Phone className="w-3 h-3" />
                      <span>โทร {activeProject.phone}</span>
                    </a>
                  )}
                  <span className="text-slate-600 dark:text-slate-300 flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5 text-[#FF6B00] shrink-0" />
                    <span>{activeProject.location}</span>
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setPrintProjectTarget({ project: activeProject })}
                  className="px-3 py-2 rounded-xl bg-[#FF6B00] hover:bg-[#FF8A24] text-black text-xs font-extrabold cursor-pointer flex items-center gap-1.5 shadow-sm"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">พิมพ์ ORDER FORM 2026</span>
                  <span className="sm:hidden">พิมพ์</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveProjectId(null)}
                  className="p-2 rounded-xl text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white bg-slate-100 dark:bg-white/[0.04] cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto overscroll-contain p-4 sm:p-5 space-y-4 text-xs">
              {/* Scheduled Site Visits for this Project (Complete Individual Visit) */}
              {(activeProject.site_visits || []).length > 0 && (
                <div className="p-3.5 rounded-2xl bg-indigo-50/70 dark:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-500/30 space-y-2.5">
                  <div className="font-extrabold text-indigo-900 dark:text-indigo-200 flex items-center gap-1.5">
                    <Calendar className="w-4 h-4" />
                    <span>รอบเข้าไซต์งานตามนัดหมาย ({(activeProject.site_visits || []).length} รอบ)</span>
                  </div>
                  <div className="space-y-2">
                    {(activeProject.site_visits || []).map((sv, idx) => {
                      const visitItems = items.filter(
                        it => it.project_id === activeProject.id && it.site_visit_id === sv.id
                      );
                      return (
                        <div key={sv.id} className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-500/30 space-y-2">
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <span className="font-mono font-extrabold text-indigo-700 dark:text-indigo-300">
                              รอบ #{idx + 1} ({sv.id}) • {formatDateDMY(sv.visit_date)} ({sv.time_slot})
                            </span>
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              sv.visit_status === 'completed'
                                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300'
                                : 'bg-sky-100 text-sky-800 dark:bg-sky-500/20 dark:text-sky-300'
                            }`}>
                              {sv.visit_status === 'completed' ? 'ปิดรอบนี้แล้ว' : 'รอดำเนินการ'}
                            </span>
                          </div>
                          <div className="font-bold text-slate-900 dark:text-white">{sv.visit_scope}</div>
                          <div className="text-[11px] text-slate-600 dark:text-slate-300">
                            ทีมช่าง: <strong>{sv.assigned_techs.join(', ')}</strong>
                            {visitItems.length > 0 && ` • S/N ที่เบิก: ${visitItems.map(i => `${i.model_name} (${i.serial_number || 'รอ S/N'})`).join(', ')}`}
                          </div>
                          {sv.visit_status !== 'completed' && !canCompleteSiteVisit(sv) && (
                            <div className="text-[11px] text-amber-700 dark:text-amber-300">
                              {sv.prep_status === 'prepping' ? 'รอช่างเตรียมของให้ครบก่อนปิดรอบ' : 'รอจัดซื้อและสต๊อกปล่อยของก่อนปิดรอบ'}
                            </div>
                          )}
                          {canCompleteSiteVisit(sv) && (
                            <div className="flex justify-end pt-1">
                              <button
                                type="button"
                                onClick={async () => {
                                  try {
                                    const completed = await updateSiteVisit(activeProject.id, sv.id, {
                                      visit_status: 'completed',
                                      prep_status: 'dispatched',
                                      progress_note: dailyNoteInput.trim() || `ปิดรอบเข้าไซต์ ${formatDateDMY(sv.visit_date)} เรียบร้อย`,
                                      photo_urls: dailyPhotosInput
                                    });
                                    setToast(completed
                                      ? `ปิดรอบเข้าไซต์ ${sv.id} (${formatDateDMY(sv.visit_date)}) เรียบร้อยแล้ว`
                                      : 'สถานะรอบเปลี่ยนแล้ว กรุณาตรวจสอบก่อนปิดรอบอีกครั้ง');
                                  } catch {
                                    setToast('บันทึกการปิดรอบไม่สำเร็จ กรุณาลองอีกครั้ง');
                                  } finally {
                                    setTimeout(() => setToast(''), 4000);
                                  }
                                }}
                                className="px-3 py-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-[11px] cursor-pointer flex items-center gap-1"
                              >
                                <CheckCircle className="w-3.5 h-3.5" />
                                <span>ปิดรอบเข้าไซต์นี้ (Complete Visit)</span>
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Site Equipment & Released Batches Overview */}
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 space-y-2.5">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="font-extrabold text-slate-900 dark:text-white flex items-center gap-1.5">
                    <Package className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                    <span>รายการอุปกรณ์หลัก & วัสดุสิ้นเปลืองของไซต์งาน ({activeProject.items.length} รายการ • เบิกแล้ว {activeProject.batches?.length || 0} งวด)</span>
                  </span>
                  {(activeProject.batches || []).length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5">
                      {(activeProject.batches || []).map((b) => (
                        <button
                          key={b.id}
                          type="button"
                          onClick={() => setPrintProjectTarget({ project: activeProject, initialBatchNo: b.batch_no })}
                          className="px-2.5 py-1 rounded-lg bg-[#FF6B00]/15 hover:bg-[#FF6B00]/25 text-[#C2410C] dark:text-[#FF6B00] border border-[#FF6B00]/30 text-[11px] font-bold cursor-pointer flex items-center gap-1"
                        >
                          <Printer className="w-3 h-3" />
                          <span>พิมพ์บิล งวดที่ {b.batch_no}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {activeProject.items.map((it) => {
                    const isLabor = /ค่าบริการ|ค่าแรง/.test(it.model_name || '');
                    const isDirectNonPrep = !isLabor && (it.item_type === 'consumable' || isNonPrepCableOrConsumable(it.model_name));
                    const readyCount = isLabor
                      ? it.qty_required
                      : isDirectNonPrep
                        ? Math.max(it.qty_prepared, it.qty_allocated)
                        : it.qty_prepared;
                    return (
                    <div key={it.id} className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 flex items-start justify-between gap-2">
                      <div className="min-w-0 space-y-0.5">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                            isLabor
                              ? 'bg-slate-100 text-slate-700 dark:bg-white/[0.08] dark:text-slate-200'
                              : !isDirectNonPrep
                                ? 'bg-blue-100 text-blue-900 dark:bg-blue-500/20 dark:text-blue-300'
                                : 'bg-amber-100 text-amber-900 dark:bg-amber-500/20 dark:text-amber-300'
                          }`}>
                            {isLabor
                              ? 'ค่าบริการ / ค่าแรง'
                              : !isDirectNonPrep
                                ? 'อุปกรณ์หลัก'
                                : 'วัสดุ / ตู้ Rack (ส่งตรง Onsite)'}
                          </span>
                          {it.is_addon && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-extrabold bg-purple-100 text-purple-900 dark:bg-purple-500/20 dark:text-purple-300">
                              แอดเพิ่มโดย {it.added_by}
                            </span>
                          )}
                        </div>
                        <div className="font-bold text-slate-900 dark:text-white truncate">{it.model_name}</div>
                        {it.serial_numbers && it.serial_numbers.length > 0 && (
                          <div className="text-[10px] font-mono text-[#C2410C] dark:text-[#FF6B00] font-bold">
                            S/N: {it.serial_numbers.join(', ')}
                          </div>
                        )}
                      </div>
                      <div className="text-right shrink-0 font-mono">
                        {isLabor ? (
                          <>
                            <div className="font-extrabold text-emerald-700 dark:text-emerald-300">
                              งานบริการ ×{it.qty_required}
                            </div>
                            <div className="text-[10px] text-slate-500">รวมในบิลแล้ว</div>
                          </>
                        ) : (
                          <>
                            <div className={`font-extrabold ${readyCount >= it.qty_required ? 'text-emerald-700 dark:text-emerald-300' : 'text-slate-900 dark:text-white'}`}>
                              พร้อมใช้ {readyCount}/{it.qty_required}
                            </div>
                            <div className="text-[10px] text-slate-500">เบิก {it.qty_allocated}/{it.qty_required}</div>
                          </>
                        )}
                      </div>
                    </div>
                    );
                  })}
                </div>
              </div>

              {/* Workspace Action Tabs: 1. Daily Site Log & Photos | 2. ขอเบิกของเพิ่มจากหน้างาน | 3. ส่งมอบปิดโปรเจกต์ */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setPrjWorkspaceTab('daily_log')}
                  className={`py-2.5 px-3 rounded-xl font-extrabold text-xs border transition cursor-pointer flex items-center justify-center gap-1.5 ${
                    prjWorkspaceTab === 'daily_log'
                      ? 'bg-purple-600 text-white border-purple-600 shadow-md'
                      : 'bg-slate-100 dark:bg-white/[0.04] text-slate-700 dark:text-slate-300 border-slate-300 dark:border-white/[0.1]'
                  }`}
                >
                  <Calendar className="w-4 h-4" />
                  <span>1. บันทึกหน้างานรายวัน & รูปถ่าย</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPrjWorkspaceTab('material_req')}
                  className={`py-2.5 px-3 rounded-xl font-extrabold text-xs border transition cursor-pointer flex items-center justify-center gap-1.5 ${
                    prjWorkspaceTab === 'material_req'
                      ? 'bg-[#FF6B00] text-black border-[#FF6B00] shadow-md'
                      : 'bg-slate-100 dark:bg-white/[0.04] text-slate-700 dark:text-slate-300 border-slate-300 dark:border-white/[0.1]'
                  }`}
                >
                  <Wrench className="w-4 h-4" />
                  <span>2. ขอเบิกของเพิ่มจากหน้างาน ({activeProject.material_requests?.length || 0})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPrjWorkspaceTab('handover')}
                  className={`py-2.5 px-3 rounded-xl font-extrabold text-xs border transition cursor-pointer flex items-center justify-center gap-1.5 ${
                    prjWorkspaceTab === 'handover'
                      ? 'bg-emerald-600 text-white border-emerald-600 shadow-md'
                      : 'bg-slate-100 dark:bg-white/[0.04] text-slate-700 dark:text-slate-300 border-slate-300 dark:border-white/[0.1]'
                  }`}
                >
                  <CheckCircle className="w-4 h-4" />
                  <span>3. ส่งมอบปิดโปรเจกต์ (Handover)</span>
                </button>
              </div>

              {/* TAB 1: DAILY SITE LOG & PHOTOS */}
              {prjWorkspaceTab === 'daily_log' && (
                <div className="space-y-4">
                  <form onSubmit={handleSaveDailyLog} className="p-4 rounded-2xl bg-purple-50/70 dark:bg-purple-500/10 border border-purple-200 dark:border-purple-500/30 space-y-3">
                    <div className="font-extrabold text-purple-900 dark:text-purple-200">
                      บันทึกความคืบหน้าหน้างานวันนี้ (Daily Site Log & Photos)
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="font-bold text-slate-700 dark:text-slate-300">
                          เปอร์เซ็นต์ความคืบหน้าภาพรวม ({dailyProgressInput}%)
                        </label>
                        <div className="flex gap-1.5">
                          {[25, 50, 75, 90, 100].map(pct => (
                            <button
                              key={pct}
                              type="button"
                              onClick={() => setDailyProgressInput(pct)}
                              className={`px-2 py-0.5 rounded-lg text-[10px] font-mono font-bold border cursor-pointer ${
                                dailyProgressInput === pct
                                  ? 'bg-purple-600 text-white border-purple-600'
                                  : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700'
                              }`}
                            >
                              {pct}%
                            </button>
                          ))}
                        </div>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        step={5}
                        value={dailyProgressInput}
                        onChange={(e) => setDailyProgressInput(Number(e.target.value))}
                        className="w-full accent-purple-600 cursor-pointer"
                      />
                    </div>

                    <div>
                      <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                        รายละเอียดงานที่ทำสำเร็จในวันนี้ / ปัญหาหน้างาน *
                      </label>
                      <textarea
                        rows={3}
                        required
                        value={dailyNoteInput}
                        onChange={(e) => setDailyNoteInput(e.target.value)}
                        placeholder="เช่น เดินสาย LAN โซนคลังสินค้า C2 ครบ 12 จุด ยึดกล้อง CCTV และทดสอบภาพขึ้น NVR เรียบร้อย..."
                        className="w-full rounded-xl px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-300 dark:border-slate-700 focus:outline-none focus:border-purple-500"
                      />
                    </div>

                    <div className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
                      <EvidencePhotoUploader
                        value={dailyPhotosInput}
                        onChange={setDailyPhotosInput}
                        folder="onsite"
                        label="แนบรูปถ่ายความคืบหน้าหน้างานวันนี้"
                        helperText="ถ่ายรูปการเดินสาย, ตู้ Rack หรือจุดติดตั้งอุปกรณ์ (เชื่อมกับ imageStorageService)"
                      />
                    </div>

                    <button
                      type="submit"
                      className="w-full py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-extrabold text-xs shadow-lg shadow-purple-500/25 cursor-pointer flex items-center justify-center gap-1.5"
                    >
                      <CheckCircle className="w-4 h-4" />
                      <span>บันทึก Daily Site Log ({dailyProgressInput}%)</span>
                    </button>
                  </form>

                  {/* Chronological Daily Logs History */}
                  <div className="space-y-2">
                    <div className="font-extrabold text-slate-900 dark:text-white">
                      ประวัติบันทึกหน้างานรายวัน ({activeProject.daily_logs?.length || 0} รายการ)
                    </div>
                    {(!activeProject.daily_logs || activeProject.daily_logs.length === 0) ? (
                      <div className="p-6 text-center text-slate-500 border border-dashed border-slate-300 dark:border-white/10 rounded-2xl">
                        ยังไม่มีบันทึกหน้างานรายวัน
                      </div>
                    ) : (
                      [...activeProject.daily_logs].reverse().map((dlog) => (
                        <div key={dlog.id} className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-mono font-bold text-slate-900 dark:text-white">
                              วันที่ {dlog.date} • บันทึกโดย <strong className="text-purple-700 dark:text-purple-300">{dlog.tech_name}</strong>
                            </span>
                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-extrabold bg-emerald-100 text-emerald-900 border border-emerald-300 dark:bg-emerald-500/20 dark:text-emerald-300">
                              คืบหน้า {dlog.progress_percent}%
                            </span>
                          </div>
                          <p className="text-slate-700 dark:text-slate-200">{dlog.note}</p>
                          {dlog.photo_urls && dlog.photo_urls.length > 0 && (
                            <EvidencePhotoUploader
                              value={dlog.photo_urls}
                              onChange={() => {}}
                              folder="onsite"
                              editable={false}
                              label="รูปถ่ายหน้างานที่บันทึกไว้"
                            />
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              {/* TAB 2: FIELD MATERIAL REQUEST (ขอเบิกของเพิ่มจากหน้างาน) */}
              {prjWorkspaceTab === 'material_req' && (
                <div className="space-y-4">
                  <form onSubmit={handleSubmitFieldMaterialRequest} className="p-4 rounded-2xl bg-amber-50/70 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 space-y-3">
                    <div className="font-extrabold text-amber-900 dark:text-amber-200">
                      ขอเบิกของเพิ่มจากหน้างาน (Field Material Request — แจ้งเตือนฝ่ายขาย & จัดซื้อทันที)
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <label className="font-bold text-slate-700 dark:text-slate-300">
                          ชื่ออุปกรณ์ / สายสัญญาณ / วัสดุที่ต้องการเพิ่ม *
                        </label>
                        <button
                          type="button"
                          onClick={() => {
                            setReqCatalogSearch('');
                            setReqCatalogCategory('all');
                            setIsReqCatalogOpen(true);
                          }}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#FF6B00]/15 hover:bg-[#FF6B00]/25 border border-[#FF6B00]/40 text-[#C2410C] dark:text-[#FF6B00] text-[11px] font-bold transition active:scale-[0.97] cursor-pointer"
                        >
                          <Layers className="w-3.5 h-3.5" />
                          <span>เลือกจากแคตตาล็อก</span>
                        </button>
                      </div>
                      <input
                        type="text"
                        required
                        value={reqItemName}
                        onChange={(e) => {
                          setReqItemName(e.target.value);
                          if (!e.target.value.trim()) setReqProductId('');
                        }}
                        placeholder="กด 'เลือกจากแคตตาล็อก' หรือพิมพ์ชื่อสายสัญญาณ / อุปกรณ์ที่ต้องการเพิ่ม..."
                        className="w-full rounded-xl px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-300 dark:border-slate-700"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
                      <div>
                        <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">จำนวนที่ขอเพิ่ม *</label>
                        <NumberInput
                          min={1}
                          required
                          value={reqQty}
                          onChange={(e) => setReqQty(Math.max(1, parseInt(e.target.value) || 1))}
                          className="w-full rounded-xl px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-300 dark:border-slate-700 font-mono"
                        />
                      </div>
                      <div className="sm:col-span-3">
                        <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">เหตุผลความจำเป็นหน้างาน *</label>
                        <input
                          type="text"
                          required
                          value={reqReason}
                          onChange={(e) => setReqReason(e.target.value)}
                          placeholder="เช่น ระยะเดินสายจริงไกลกว่าแบบแปลน 45 เมตร / ลูกค้าขอเพิ่มจุดติดตั้งหน้างาน"
                          className="w-full rounded-xl px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-300 dark:border-slate-700"
                        />
                      </div>
                    </div>

                    <button
                      type="submit"
                      className="w-full py-2.5 rounded-xl bg-gradient-to-r from-[#FF6B00] to-[#E65A00] hover:from-[#FF8A24] text-black font-extrabold text-xs shadow-lg shadow-[#FF6B00]/25 cursor-pointer flex items-center justify-center gap-1.5"
                    >
                      <ClipboardList className="w-4 h-4" />
                      <span>ส่งคำขอเบิกของเพิ่มจากหน้างาน (แจ้ง Sales & จัดซื้อ)</span>
                    </button>
                  </form>

                  {/* Existing Material Requests */}
                  <div className="space-y-2">
                    <div className="font-extrabold text-slate-900 dark:text-white">
                      รายการที่ขอเบิกเพิ่มจากหน้างาน ({activeProject.material_requests?.length || 0})
                    </div>
                    {(!activeProject.material_requests || activeProject.material_requests.length === 0) ? (
                      <div className="p-6 text-center text-slate-500 border border-dashed border-slate-300 dark:border-white/10 rounded-2xl">
                        ยังไม่มีรายการขอเบิกของเพิ่มจากหน้างาน
                      </div>
                    ) : (
                      activeProject.material_requests.map((req) => (
                        <div key={req.id} className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <div className="font-bold text-slate-900 dark:text-white">
                              {req.item_name} <span className="font-mono text-[#C2410C] dark:text-[#FF6B00]">x{req.qty}</span>
                            </div>
                            <div className="text-[11px] text-slate-600 dark:text-slate-400">
                              เหตุผล: {req.reason} • ขอโดย <strong>{req.requested_by}</strong> ({formatThaiDateTime(req.requested_at)})
                            </div>
                          </div>
                          <span className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold border ${
                            req.status === 'fulfilled'
                              ? 'bg-emerald-100 text-emerald-900 border-emerald-300 dark:bg-emerald-500/20 dark:text-emerald-300'
                              : req.status === 'approved_ordered'
                                ? 'bg-blue-100 text-blue-900 border-blue-300 dark:bg-blue-500/20 dark:text-blue-300'
                                : 'bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-500/20 dark:text-amber-300'
                          }`}>
                            {req.status === 'fulfilled' ? 'จัดส่งเข้าไซต์งานแล้ว' : req.status === 'approved_ordered' ? 'อนุมัติ / สั่งซื้อแล้ว' : 'รอฝ่ายขาย & จัดซื้ออนุมัติ'}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              {/* TAB 3: FINAL PROJECT HANDOVER (ส่งมอบปิดโปรเจกต์) */}
              {prjWorkspaceTab === 'handover' && (
                <form onSubmit={handleConfirmProjectHandover} className="p-4 rounded-2xl bg-emerald-50/70 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 space-y-3">
                  <div className="font-extrabold text-emerald-900 dark:text-emerald-200 text-sm">
                    ส่งมอบปิดโปรเจกต์สมบูรณ์ (Final Project Handover • 100%)
                  </div>
                  <p className="text-[11px] text-emerald-800/90 dark:text-emerald-300/90">
                    เมื่อลูกค้าตรวจรับงานติดตั้งครบถ้วนแล้ว ให้แนบรูปถ่ายส่งมอบงานและกดยืนยันเพื่อปิดโปรเจกต์ {activeProject.id}
                  </p>
                  <div className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
                    <EvidencePhotoUploader
                      value={handoverPhotosInput}
                      onChange={setHandoverPhotosInput}
                      folder="onsite"
                      label="รูปถ่ายส่งมอบงาน / ใบตรวจรับงาน (Final Handover Photos)"
                      helperText="แนบรูปผลงานติดตั้งเสร็จสมบูรณ์ หรือเอกสารใบส่งมอบงาน"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                      บันทึกการตรวจรับงาน / ชื่อผู้เซ็นรับมอบฝั่งลูกค้า
                    </label>
                    <textarea
                      rows={3}
                      value={handoverNoteInput}
                      onChange={(e) => setHandoverNoteInput(e.target.value)}
                      placeholder="เช่น ส่งมอบระบบ Network & กล้อง CCTV ครบทุกจุด ลูกค้าเซ็นรับมอบงานเรียบร้อย..."
                      className="w-full rounded-xl px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-300 dark:border-slate-700"
                    />
                  </div>
                  {!canCompleteProjectHandover(activeProject, items) && (
                    <p className="text-[11px] text-amber-700 dark:text-amber-300">
                      ปิดรอบเข้าไซต์และเตรียมอุปกรณ์ให้ครบก่อนส่งมอบโครงการ
                    </p>
                  )}
                  <button
                    type="submit"
                    disabled={isSubmittingHandover || !canCompleteProjectHandover(activeProject, items)}
                    className="w-full py-3 rounded-xl bg-gradient-to-r from-emerald-700 to-teal-800 hover:from-emerald-800 text-white font-extrabold text-sm shadow-lg shadow-emerald-500/25 cursor-pointer flex items-center justify-center gap-2"
                  >
                    <CheckCircle className="w-4 h-4" />
                    <span>ยืนยันส่งมอบปิดโปรเจกต์ ({activeProject.id} • Completed)</span>
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
      {/* ========================================================================= */}
      {/* MODAL 4: CATALOG PICKER FOR ONSITE MATERIAL REQUEST (z-[10001])           */}
      {/* ========================================================================= */}
      {isReqCatalogOpen && createPortal(
        <ModalBackdrop
          className="fixed inset-0 z-[10001] flex items-center justify-center p-4 sm:p-6 bg-black/70 backdrop-blur-sm animate-fade-in overscroll-contain"
          onDismiss={() => setIsReqCatalogOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-800 shadow-2xl rounded-3xl w-full sm:w-[92vw] max-w-4xl max-h-[88dvh] sm:max-h-[88vh] flex flex-col overflow-hidden animate-modal-pop"
          >
            <div className="p-4 sm:p-5 bg-slate-50/90 dark:bg-slate-900/95 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 flex-shrink-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="p-2.5 rounded-2xl bg-[#FF6B00]/15 text-[#E65A00] dark:text-[#FF6B00] border border-[#FF6B00]/30">
                  <Layers className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white leading-tight">
                    เลือกสินค้า / สายสัญญาณจากแคตตาล็อก
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    แตะเลือกรายการที่ต้องการขอเบิกเพิ่มเข้าหน้างาน
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsReqCatalogOpen(false)}
                className="p-2 rounded-xl text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white bg-slate-100 dark:bg-white/[0.04] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3 sm:p-4 border-b border-slate-200 dark:border-white/[0.06] space-y-2.5 flex-shrink-0">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="ค้นหาชื่ออุปกรณ์, สาย LAN, ท่อ, สวิตช์..."
                  value={reqCatalogSearch}
                  onChange={(e) => setReqCatalogSearch(e.target.value)}
                  className="w-full rounded-xl pl-9 pr-3 py-2 text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-300 dark:border-slate-700 focus:outline-none focus:border-blue-500"
                />
              </div>
              <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
                {(['all', 'cctv_network', 'pc_notebook', 'printer', 'service', 'general'] as ('all' | ProductCategory)[]).map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setReqCatalogCategory(cat)}
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border whitespace-nowrap transition cursor-pointer ${
                      reqCatalogCategory === cat
                        ? 'bg-[#FF6B00]/15 dark:bg-[#FF6B00]/20 border-[#FF6B00]/60 text-[#C2410C] dark:text-[#FF6B00]'
                        : 'bg-slate-100 dark:bg-white/[0.02] border-slate-200 dark:border-white/[0.08] text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    {cat === 'all' ? 'ทั้งหมด' : PRODUCT_CATEGORY_LABELS[cat]}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto overscroll-contain p-3 sm:p-4">
              {(() => {
                const q = reqCatalogSearch.trim().toLowerCase();
                const filtered = products.filter(p => {
                  const matchQ = !q || p.name.toLowerCase().includes(q);
                  const matchC = reqCatalogCategory === 'all' || p.category === reqCatalogCategory;
                  return matchQ && matchC;
                });
                if (filtered.length === 0) {
                  return (
                    <div className="py-10 text-center text-xs text-slate-500">
                      ไม่พบสินค้าในแคตตาล็อกที่ตรงกับคำค้นหา
                    </div>
                  );
                }
                return (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                    {filtered.map((prod: Product) => {
                      const inStockCount = items.filter(
                        it => (it.status === 'in_stock' || it.status === 'raw_stock') &&
                          (it.model_name || '').trim().toLowerCase() === prod.name.trim().toLowerCase()
                      ).length;
                      const isSelected = reqProductId === prod.id;
                      return (
                        <button
                          key={prod.id}
                          type="button"
                          onClick={() => {
                            setReqProductId(prod.id);
                            setReqItemName(prod.name);
                            setIsReqCatalogOpen(false);
                          }}
                          className={`text-left p-3 rounded-2xl border transition cursor-pointer active:scale-[0.98] flex flex-col gap-1.5 ${
                            isSelected
                              ? 'bg-[#FF6B00]/15 border-[#FF6B00]/60'
                              : 'bg-slate-50 dark:bg-slate-800/70 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-white/[0.06]'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <span className="text-xs font-bold text-slate-900 dark:text-white leading-snug line-clamp-2">
                              {prod.name}
                            </span>
                            {isSelected && <Check className="w-4 h-4 text-[#FF6B00] shrink-0" />}
                          </div>
                          <div className="flex items-center justify-between gap-2 text-[10px] mt-auto">
                            <span className="text-slate-500 dark:text-slate-400">
                              {PRODUCT_CATEGORY_LABELS[prod.category]} • {prod.unit}
                            </span>
                            <span className={`font-mono font-bold ${inStockCount > 0 ? 'text-blue-600 dark:text-blue-300' : 'text-slate-500'}`}>
                              สต๊อก: {inStockCount}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
          </div>
        </ModalBackdrop>,
        document.body
      )}

      <OrderFormPrintModal
        isOpen={!!printProjectTarget}
        onClose={() => setPrintProjectTarget(null)}
        project={printProjectTarget?.project}
        initialBatchNo={printProjectTarget?.initialBatchNo ?? null}
      />

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
        readOnly
      />

      {serviceSheetHistoryOpen && (
        <ServiceSheetHistoryModal
          onClose={() => setServiceSheetHistoryOpen(false)}
          onToast={message => {
            setToast(message);
            setTimeout(() => setToast(''), 4000);
          }}
        />
      )}
      <RepairIntakeModal
        open={repairIntakeOpen}
        onClose={() => setRepairIntakeOpen(false)}
        title="รับเครื่องซ่อม / Service Sheet (ช่าง Onsite)"
        subtitle="Onsite Service Sheet · สร้างใบรับซ่อมเข้าคิวช่างในร้าน"
        intakeChannel="onsite_pickup"
        receivedChannel="onsite_service_sheet"
        initialValues={intakeInitialValues}
        onToast={(msg) => {
          setToast(msg);
          setTimeout(() => setToast(''), 4000);
        }}
      />
      {/* Mobile Floating Action Button (FAB): ออกใบรับเครื่องซ่อมหน้างาน (Portal เพื่อไม่ให้ติด transform ของ animate-slide-up) */}
      {typeof document !== 'undefined' && createPortal(
        <button
          type="button"
          onClick={() => handleOpenNewServiceSheet()}
          aria-label="ออกใบรับเครื่องซ่อมหน้างาน"
          className="sm:hidden fixed bottom-[max(1.25rem,env(safe-area-inset-bottom))] right-4 z-30 px-4 py-3.5 rounded-full bg-gradient-to-r from-[#FF6B00] to-[#E65A00] text-black font-black text-xs shadow-2xl shadow-[#FF6B00]/40 border border-white/25 flex items-center gap-1.5 active:scale-95 transition cursor-pointer"
        >
          <ClipboardList className="w-4 h-4" />
          <span>+ รับเครื่องซ่อม</span>
        </button>,
        document.body
      )}
    </div>
  );
};
