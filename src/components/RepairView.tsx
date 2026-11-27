import { useDepartmentReadOnly } from '../context/DepartmentAccess';
import { ModalBackdrop } from './ui/ModalBackdrop';
import { NumberInput, PhoneInput, normalizePhone } from './ui/FormInputs';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal, flushSync } from 'react-dom';
import { useApp } from '../context/AppContext';
import { ToastBanner } from './ui/ToastBanner';
import {
  Wrench, CheckCircle, Clock, Printer, Plus, CheckSquare, Square,
  FileText, Camera, ClipboardList, ArrowRight, Truck,
  ScanLine, CalendarDays, Hash, Building2,
  RefreshCw, X, Save, MoreVertical, Pencil, Trash2, AlertTriangle, UserCheck,
  ShieldCheck, ShieldAlert, Info
} from 'lucide-react';
import {
  RepairTicket, RepairLifecycleStatus, ServiceType,
  REPAIR_LIFECYCLE_META, REPAIR_TECH_LIFECYCLE_ORDER, REPAIR_TECH_ACTIVE_STATUSES,
  RMA_SUPPLIER_OPTIONS, WarrantyLookupResult,
  getRouteByDistrict, getElapsedDays, toDateInputValue, fromDateInputValue, formatDateDMY
} from '../types';
import { ListControls, useListControls } from './ListControls';
import { ActivityTimeline } from './ActivityTimeline';
import { BarcodeScannerModal } from './BarcodeScannerModal';
import {
  Modal, modalInputClass, modalLabelClass,
  modalPrimaryBtnClass, modalSecondaryBtnClass
} from './ui/Modal';
import { lookupPurchaseBySn } from '../utils/snLookup';
import { RepairIntakeModal } from './RepairIntakeModal';
import { EvidencePhotoUploader } from './EvidencePhotoUploader';
import { PrintGuideButton } from './PrintGuideButton';

const ACCESSORY_PRESETS = [
  'Adapter / หม้อแปลง',
  'สาย Power',
  'สายชาร์จ',
  'สายสัญญาณ (LAN/HDMI/USB)',
  'กระเป๋า / กล่อง',
  'ตัวเครื่องเปล่า (ไม่มีอุปกรณ์ติดมา)'
];

const DISTRICT_OPTIONS = [
  'เมืองสุราษฎร์ธานี', 'พุนพิน', 'ท่าฉาง', 'ไชยา', 'ท่าชนะ',
  'คีรีรัฐนิคม', 'บ้านตาขุน', 'พนม', 'บ้านนาเดิม', 'บ้านนาสาร',
  'เวียงสระ', 'พระแสง', 'กาญจนดิษฐ์', 'ดอนสัก', 'ขนอม', 'ต่างจังหวัด / งานเหมาพิเศษ'
];

type FilterTab = 'all' | 'in_house' | 'awaiting_quote' | 'rma' | 'ready_pickup';

const FILTER_TABS: { id: FilterTab; label: string }[] = [
  { id: 'all', label: 'งานค้างในมือช่าง' },
  { id: 'in_house', label: 'ซ่อมหน้าร้าน' },
  { id: 'awaiting_quote', label: 'รอเสนอราคา' },
  { id: 'rma', label: 'กำลังส่งเคลม (RMA)' },
  { id: 'ready_pickup', label: 'ส่งคืนหน้าร้านแล้ว (จบงานช่าง)' }
];

// สถานะที่ถือว่า "งานยังไม่ปิด" (แสดงบนโต๊ะช่าง)
const isTicketOpen = (t: RepairTicket): boolean => {
  if (t.status === 'returned_closed' || t.delivered_at) return false;
  const lifecycle = t.repair_status || 'pending_check';
  return REPAIR_TECH_LIFECYCLE_ORDER.includes(lifecycle);
};

// งานที่ยัง "ค้างอยู่ในมือช่าง" — ตัด ready_pickup (ส่งคืนหน้าร้านแล้ว) และ completed ออก
const isTechActive = (t: RepairTicket): boolean =>
  isTicketOpen(t) && REPAIR_TECH_ACTIVE_STATUSES.includes(getLifecycle(t));

const getServiceType = (t: RepairTicket): ServiceType =>
  t.service_type || (t.rma_supplier || t.rma_tracking_no ? 'rma_claim' : 'in_house_repair');

const getLifecycle = (t: RepairTicket): RepairLifecycleStatus => {
  if (t.repair_status) return t.repair_status;
  if (t.status === 'returned_closed' || t.delivered_at) return 'completed';
  if (t.status === 'repaired') return 'ready_pickup';
  if (t.status === 'in_progress') return 'repairing';
  return 'pending_check';
};

// ---------------------------------------------------------------------------
// Official "ใบรับซ่อมสินค้า" receipt helpers
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

const WarrantyLookupBanner: React.FC<{
  serialNumber?: string | null;
  lookup: (sn: string | null | undefined) => WarrantyLookupResult;
  labelPrefix?: string;
}> = ({ serialNumber, lookup, labelPrefix }) => {
  const trimmed = (serialNumber || '').trim();
  if (trimmed.length < 2) return null;

  const w = lookup(trimmed);

  if (w.found && w.state === 'active') {
    return (
      <div className="mt-2 p-3 rounded-xl border-2 border-emerald-500/50 bg-emerald-500/10 dark:bg-emerald-500/15 space-y-1.5">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-600 text-white dark:bg-emerald-400 dark:text-slate-950 text-[11px] font-extrabold shadow-sm">
            <ShieldCheck className="w-3.5 h-3.5" />
            {labelPrefix ? `${labelPrefix}: ` : ''}อยู่ในประกัน
          </span>
          {w.durationLabel && (
            <span className="text-xs font-extrabold text-emerald-800 dark:text-emerald-200">
              {w.durationLabel}
            </span>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-emerald-900 dark:text-emerald-100">
          <div>
            <span className="opacity-80">เริ่มนับวอย: </span>
            <strong className="font-bold">{formatDateDMY(w.voidDate)}</strong>
            <span className="mx-1">→</span>
            <span className="opacity-80">หมดประกัน: </span>
            <strong className="font-bold">{formatDateDMY(w.expireDate)}</strong>
          </div>
          {w.remainingLabel && (
            <div className="sm:text-right font-extrabold text-emerald-700 dark:text-emerald-300">
              {w.remainingLabel}
            </div>
          )}
        </div>
        {(w.modelName || w.customerName || w.billNo) && (
          <div className="text-[10px] text-emerald-800/80 dark:text-emerald-200/80 pt-1 border-t border-emerald-500/20 truncate">
            {w.modelName ? `สินค้า: ${w.modelName}` : ''}
            {w.customerName ? ` • ลูกค้าเดิม: ${w.customerName}` : ''}
            {w.billNo ? ` • บิล: ${w.billNo}` : ''}
          </div>
        )}
      </div>
    );
  }

  if (w.found && w.state === 'expired') {
    return (
      <div className="mt-2 p-2.5 rounded-xl border border-rose-500/40 bg-rose-500/10 dark:bg-rose-500/15 text-rose-800 dark:text-rose-200 space-y-1">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <span className="inline-flex items-center gap-1.5 text-xs font-extrabold text-rose-700 dark:text-rose-300">
            <ShieldAlert className="w-4 h-4 flex-shrink-0" />
            หมดประกันแล้วเมื่อ {formatDateDMY(w.expireDate)}
          </span>
          {w.durationLabel && (
            <span className="text-[11px] font-semibold opacity-90">{w.durationLabel}</span>
          )}
        </div>
        <div className="text-[11px] opacity-90">
          เริ่มนับวอย: <strong>{formatDateDMY(w.voidDate)}</strong>
          {w.modelName ? ` • ${w.modelName}` : ''}
        </div>
      </div>
    );
  }

  if (w.found && w.state === 'waiting') {
    return (
      <div className="mt-2 p-2.5 rounded-xl border border-amber-500/40 bg-amber-500/10 dark:bg-amber-500/15 text-amber-800 dark:text-amber-200 text-[11px] font-semibold flex items-center gap-1.5">
        <Info className="w-4 h-4 flex-shrink-0" />
        <span>
          พบข้อมูล S/N ในระบบ ({w.durationLabel || 'มีประกัน'}) — ยังไม่เริ่มนับประกัน (รอแปะวอย)
        </span>
      </div>
    );
  }

  if (trimmed.length >= 3) {
    return (
      <div className="mt-2 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-white/[0.08] bg-slate-100 dark:bg-white/[0.04] text-slate-600 dark:text-slate-400 text-[11px] font-medium flex items-center gap-1.5">
        <Info className="w-3.5 h-3.5 flex-shrink-0" />
        <span>ไม่พบข้อมูล S/N ในระบบประกัน</span>
      </div>
    );
  }

  return null;
};

export const RepairView: React.FC = () => {
  const {
    repairTickets, items, orders, createRepairTicket,
    saveRepairTicket, updateRepairTicket, deleteRepairTicket, currentUser,
    triggerPrintRepairReceipt, lookupWarrantyBySerial
  } = useApp();
  const readOnly = useDepartmentReadOnly();

  const [toast, setToast] = useState('');
  const [repairIntakeOpen, setRepairIntakeOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<FilterTab>('all');

  // Scanner targets: 'new' = new ticket S/N, 'replacement' = RMA replacement S/N, 'edit' = edit modal S/N
  const [scannerTarget, setScannerTarget] = useState<'new' | 'replacement' | 'edit' | null>(null);

  // Modal 1: New Repair Ticket Form
  const [isNewTicketOpen, setIsNewTicketOpen] = useState(false);
  const [custName, setCustName] = useState('');
  const [custPhone, setCustPhone] = useState('');
  const [district, setDistrict] = useState('เมืองสุราษฎร์ธานี');
  const [deviceModel, setDeviceModel] = useState('');
  const [sn, setSn] = useState('');
  const [selectedAccessories, setSelectedAccessories] = useState<string[]>(['Adapter / หม้อแปลง']);
  const [accessoriesOther, setAccessoriesOther] = useState('');
  const [faultSymptom, setFaultSymptom] = useState('');
  const [newServiceType, setNewServiceType] = useState<ServiceType>('in_house_repair');
  const [newRmaSupplier, setNewRmaSupplier] = useState<string>('SIS');
  const [newMatchedItemId, setNewMatchedItemId] = useState<string | null>(null);
  const [newAutoFilledSn, setNewAutoFilledSn] = useState<string | null>(null);

  const newSnLookup = useMemo(
    () => lookupPurchaseBySn(sn, items, orders, repairTickets),
    [sn, items, orders, repairTickets]
  );

  const handleNewSnChange = (val: string) => {
    setSn(val);
    const res = lookupPurchaseBySn(val, items, orders, repairTickets);
    if (res.found) {
      if (res.customerName) setCustName(res.customerName);
      if (res.customerPhone) setCustPhone(normalizePhone(res.customerPhone));
      if (res.deviceModel) setDeviceModel(res.deviceModel);
      if (res.district && DISTRICT_OPTIONS.includes(res.district)) {
        setDistrict(res.district);
      }
      setNewMatchedItemId(res.itemId);
      setNewAutoFilledSn(val.trim());
    } else if (newAutoFilledSn && val.trim() !== newAutoFilledSn) {
      setNewMatchedItemId(null);
      setNewAutoFilledSn(null);
    }
  };

  const clearNewAutoFill = () => {
    setCustName('');
    setCustPhone('');
    setDeviceModel('');
    setNewMatchedItemId(null);
    setNewAutoFilledSn(null);
  };

  // Modal 2: Standard Company Repair Receipt Print Modal
  const [receiptTicket, setReceiptTicket] = useState<RepairTicket | null>(null);

  // Modal 3: Repair Detail & Action Modal
  const [activeTicketId, setActiveTicketId] = useState<string | null>(null);

  // Card 3-dot action menu (which card's dropdown is open)
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  // Edit Repair Intake Modal
  const [editTicketId, setEditTicketId] = useState<string | null>(null);
  const [editCustName, setEditCustName] = useState('');
  const [editCustPhone, setEditCustPhone] = useState('');
  const [editDeviceModel, setEditDeviceModel] = useState('');
  const [editSn, setEditSn] = useState('');
  const [editFaultSymptom, setEditFaultSymptom] = useState('');
  const [editAccessories, setEditAccessories] = useState('');

  // Delete confirmation dialog
  const [deleteTicketId, setDeleteTicketId] = useState<string | null>(null);

  // Nested Status-Picker Modal (stacked above the Repair Detail Modal)
  const [isStatusPickerOpen, setIsStatusPickerOpen] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<RepairLifecycleStatus>('pending_check');

  // ---- Draft state (all edits live here until "บันทึกข้อมูลและสถานะ") ----
  const [draftStatus, setDraftStatus] = useState<RepairLifecycleStatus>('pending_check');
  const [draftServiceType, setDraftServiceType] = useState<ServiceType>('in_house_repair');
  const [draftRmaSupplier, setDraftRmaSupplier] = useState('');
  const [draftRmaTrackingNo, setDraftRmaTrackingNo] = useState('');
  const [draftRmaSentDate, setDraftRmaSentDate] = useState('');
  const [draftRmaReturnedDate, setDraftRmaReturnedDate] = useState('');
  const [draftReplacementSn, setDraftReplacementSn] = useState('');
  const [draftIncludedAccessories, setDraftIncludedAccessories] = useState('');
  const [draftRepairDetail, setDraftRepairDetail] = useState('');
  const [draftPartsUsed, setDraftPartsUsed] = useState('');
  const [draftCost, setDraftCost] = useState('');
  const [quoteDescription, setQuoteDescription] = useState('');
  const [quoteTotal, setQuoteTotal] = useState('');
  const [saveError, setSaveError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [quoteToPrint, setQuoteToPrint] = useState<RepairTicket | null>(null);

  const openTickets = useMemo(() => repairTickets.filter(isTicketOpen), [repairTickets]);

  // คิวงานที่ยังค้างในมือช่าง (ไม่รวม ready_pickup / completed)
  const techActiveTickets = useMemo(() => openTickets.filter(isTechActive), [openTickets]);

  // งานที่ช่างส่งคืนหน้าร้านแล้ว (จบงานฝั่งช่าง) — แยกแท็บไว้ดูย้อนหลัง
  const handoffTickets = useMemo(
    () => openTickets.filter(t => getLifecycle(t) === 'ready_pickup'),
    [openTickets]
  );

  const rmaCount = useMemo(
    () => techActiveTickets.filter(t => getServiceType(t) === 'rma_claim').length,
    [techActiveTickets]
  );

  const filteredTickets = useMemo(() => {
    switch (activeTab) {
      case 'in_house':
        return techActiveTickets.filter(t => getServiceType(t) === 'in_house_repair');
      case 'awaiting_quote':
        return techActiveTickets.filter(t => getLifecycle(t) === 'awaiting_quote');
      case 'rma':
        return techActiveTickets.filter(t => getServiceType(t) === 'rma_claim');
      case 'ready_pickup':
        return handoffTickets;
      default:
        return techActiveTickets;
    }
  }, [techActiveTickets, handoffTickets, activeTab]);

  const repairsList = useListControls(filteredTickets, {
    getDate: (t) => t.created_at,
    initialSort: 'newest',
  });

  const tabCount = (tab: FilterTab): number => {
    switch (tab) {
      case 'in_house':
        return techActiveTickets.filter(t => getServiceType(t) === 'in_house_repair').length;
      case 'awaiting_quote':
        return techActiveTickets.filter(t => getLifecycle(t) === 'awaiting_quote').length;
      case 'rma':
        return rmaCount;
      case 'ready_pickup':
        return handoffTickets.length;
      default:
        return techActiveTickets.length;
    }
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

  const handleCreateTicketSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!custName.trim() || !faultSymptom.trim()) {
      alert('กรุณากรอกชื่อลูกค้าและอาการเสีย');
      return;
    }

    const calculatedRoute = getRouteByDistrict(district);
    const finalSn = sn.trim() || `SN-${Math.floor(1000 + Math.random() * 9000)}`;
    const includedAcc = [...selectedAccessories, accessoriesOther.trim()].filter(Boolean).join(', ');

    await createRepairTicket({
      item_id: newMatchedItemId,
      walkin_sn: finalSn,
      customer_name: custName.trim(),
      customer_phone: custPhone.trim(),
      intake_channel: 'front_desk_walkin',
      received_by: currentUser?.name || 'หน้าร้าน/ช่างซ่อม',
      received_channel: 'front_desk',
      device_model: deviceModel.trim(),
      accessories: selectedAccessories,
      accessories_other: accessoriesOther.trim(),
      picked_up_by: currentUser?.name || 'หน้าร้าน/ช่างซ่อม',
      fault_symptom: faultSymptom.trim(),
      repair_detail: null,
      parts_used: null,
      repair_outcome: null,
      district: district,
      route_code: calculatedRoute,
      delivery_location: district === 'ต่างจังหวัด / งานเหมาพิเศษ' ? district : `อ.${district}`,
      job_category: 'repair_pickup',
      assigned_techs: [],
      assigned_onsite_tech: null,
      finished_at: null,
      service_type: newServiceType,
      included_accessories: includedAcc,
      rma_supplier: newServiceType === 'rma_claim' ? newRmaSupplier : null,
      repair_status: 'pending_check'
    });

    setToast(`เปิดใบรับซ่อมสำเร็จเรียบร้อย (${newServiceType === 'rma_claim' ? 'ส่งเคลม RMA' : 'ซ่อมหน้าร้าน'})`);
    setIsNewTicketOpen(false);
    setCustName('');
    setCustPhone('');
    setDeviceModel('');
    setSn('');
    setFaultSymptom('');
    setAccessoriesOther('');
    setNewServiceType('in_house_repair');
    setNewRmaSupplier('SIS');
    setNewMatchedItemId(null);
    setNewAutoFilledSn(null);
    setTimeout(() => setToast(''), 3500);
  };

  const handlePrintModal = (ticket: RepairTicket) => {
    setReceiptTicket(ticket);
  };

  // Load all editable fields into the local draft when opening a ticket
  const openTicketModal = (ticket: RepairTicket) => {
    setActiveTicketId(ticket.id);
    setDraftStatus(getLifecycle(ticket));
    setDraftServiceType(getServiceType(ticket));
    setDraftRmaSupplier(ticket.rma_supplier || 'SIS');
    setDraftRmaTrackingNo(ticket.rma_tracking_no || '');
    setDraftRmaSentDate(toDateInputValue(ticket.rma_sent_date));
    setDraftRmaReturnedDate(toDateInputValue(ticket.rma_returned_date));
    setDraftReplacementSn(ticket.replacement_sn || '');
    setDraftIncludedAccessories(
      ticket.included_accessories ||
      [...(ticket.accessories || []), ticket.accessories_other || ''].filter(Boolean).join(', ')
    );
    setDraftRepairDetail(ticket.repair_detail || '');
    setDraftPartsUsed(ticket.parts_used || '');
    setDraftCost(ticket.repair_cost != null ? String(ticket.repair_cost) : '');
    setQuoteDescription(ticket.repair_quotation?.description || '');
    setQuoteTotal(ticket.repair_quotation ? String(ticket.repair_quotation.total) : '');
    setSaveError('');
    setIsStatusPickerOpen(false);
  };

  const closeTicketModal = () => {
    if (isSaving) return;
    setActiveTicketId(null);
    setIsStatusPickerOpen(false);
  };

  // Open the nested status picker seeded with the current draft status
  const openStatusPicker = () => {
    setPendingStatus(draftStatus);
    setIsStatusPickerOpen(true);
  };

  // Apply the chosen status back into the main modal draft (does NOT close the main modal)
  const confirmStatusPick = () => {
    setDraftStatus(pendingStatus);
    setSaveError('');
    setIsStatusPickerOpen(false);
  };

  // Unified save: all edited fields + selected status in one shot, one activity log
  const hasQuoteChanges = (ticket: RepairTicket) =>
    quoteDescription.trim() !== (ticket.repair_quotation?.description || '') ||
    quoteTotal.trim() !== (ticket.repair_quotation ? String(ticket.repair_quotation.total) : '');

  const handleSaveAll = async (ticket: RepairTicket, requireQuotation = false) => {
    if (isSaving) return;
    let quotation: RepairTicket['repair_quotation'];
    if (draftStatus === 'awaiting_quote' && (hasQuoteChanges(ticket) || (requireQuotation && !ticket.repair_quotation))) {
      const total = Number(quoteTotal);
      if (!quoteDescription.trim() || !/^\d+(\.\d{1,2})?$/.test(quoteTotal.trim()) || !Number.isSafeInteger(Math.round(total * 100))) {
        setSaveError('ระบุรายการที่เสนอราคาและยอดเงินให้ครบ โดยใช้ทศนิยมได้ไม่เกิน 2 ตำแหน่ง');
        return;
      }
      quotation = { description: quoteDescription.trim(), total, issued_at: new Date().toISOString() };
    }
    setSaveError('');
    setIsSaving(true);
    const costNum = draftCost.trim() === '' ? null : Number(draftCost);
    try {
      const saved = await saveRepairTicket(ticket.id, {
        service_type: draftServiceType,
        included_accessories: draftIncludedAccessories.trim() || null,
        rma_supplier: draftServiceType === 'rma_claim' ? (draftRmaSupplier || null) : null,
        rma_tracking_no: draftServiceType === 'rma_claim' ? (draftRmaTrackingNo.trim() || null) : null,
        rma_sent_date: draftServiceType === 'rma_claim' ? fromDateInputValue(draftRmaSentDate) : null,
        rma_returned_date: draftServiceType === 'rma_claim' ? fromDateInputValue(draftRmaReturnedDate) : null,
        replacement_sn: draftReplacementSn.trim() || null,
        repair_status: draftStatus,
        repair_detail: draftRepairDetail.trim() || null,
        parts_used: draftPartsUsed.trim() || null,
        repair_cost: costNum != null && !isNaN(costNum) ? costNum : null,
        ...(quotation && { repair_quotation: quotation })
      });
      if (!saved) throw new Error('Repair ticket save failed');
      setToast(quotation
        ? `บันทึกใบเสนอราคาซ่อม ${ticket.ticket_no} แล้ว`
        : `บันทึกข้อมูลและสถานะ ${ticket.ticket_no} เรียบร้อย (${REPAIR_LIFECYCLE_META[draftStatus].label})`);
      setTimeout(() => setToast(''), 4000);
      if (draftStatus !== 'awaiting_quote') closeTicketModal();
      if (quotation) setQuoteTotal(String(quotation.total));
    } catch {
      setSaveError('บันทึกงานซ่อมไม่สำเร็จ กรุณาลองอีกครั้ง');
    } finally {
      setIsSaving(false);
    }
  };

  const printQuotation = (ticket: RepairTicket) => {
    flushSync(() => setQuoteToPrint(ticket));
    try {
      window.print();
    } finally {
      setQuoteToPrint(null);
    }
  };

  // Quick-complete: ช่างกดจบงานทันที -> ready_pickup (ส่งคืนหน้าร้าน) พร้อมบันทึกข้อมูล draft ปัจจุบัน
  const handleQuickHandoff = (ticket: RepairTicket) => {
    const costNum = draftCost.trim() === '' ? null : Number(draftCost);
    saveRepairTicket(ticket.id, {
      service_type: draftServiceType,
      included_accessories: draftIncludedAccessories.trim() || null,
      rma_supplier: draftServiceType === 'rma_claim' ? (draftRmaSupplier || null) : null,
      rma_tracking_no: draftServiceType === 'rma_claim' ? (draftRmaTrackingNo.trim() || null) : null,
      rma_sent_date: draftServiceType === 'rma_claim' ? fromDateInputValue(draftRmaSentDate) : null,
      rma_returned_date: draftServiceType === 'rma_claim' ? fromDateInputValue(draftRmaReturnedDate) : null,
      replacement_sn: draftReplacementSn.trim() || null,
      repair_status: 'ready_pickup',
      repair_detail: draftRepairDetail.trim() || null,
      parts_used: draftPartsUsed.trim() || null,
      repair_cost: costNum != null && !isNaN(costNum) ? costNum : null
    });
    setToast(`ซ่อม/เคลมเสร็จ ส่งเครื่องคืนหน้าร้านแล้ว (${ticket.ticket_no}) — จบงานฝั่งช่าง`);
    setTimeout(() => setToast(''), 4000);
    closeTicketModal();
  };

  // Quick-complete จากหน้าการ์ด (ไม่ต้องเปิด modal) — ใช้ข้อมูลที่บันทึกไว้แล้วของใบงาน
  const quickHandoffFromCard = (ticket: RepairTicket) => {
    saveRepairTicket(ticket.id, {
      repair_status: 'ready_pickup'
    });
    setToast(`ซ่อม/เคลมเสร็จ ส่งเครื่องคืนหน้าร้านแล้ว (${ticket.ticket_no}) — จบงานฝั่งช่าง`);
    setTimeout(() => setToast(''), 4000);
  };

  // ---- 3-dot menu: close on outside click / Escape ----
  useEffect(() => {
    if (!openMenuId) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenuId(null);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenMenuId(null);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [openMenuId]);

  // ---- Edit intake modal ----
  const openEditModal = (ticket: RepairTicket) => {
    setOpenMenuId(null);
    setEditTicketId(ticket.id);
    setEditCustName(ticket.customer_name || '');
    setEditCustPhone(normalizePhone(ticket.customer_phone || ''));
    setEditDeviceModel(ticket.device_model || '');
    setEditSn(ticket.walkin_sn || '');
    setEditFaultSymptom(ticket.fault_symptom || '');
    setEditAccessories(
      ticket.included_accessories ||
      [...(ticket.accessories || []), ticket.accessories_other || ''].filter(Boolean).join(', ')
    );
  };

  const closeEditModal = () => setEditTicketId(null);

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editTicketId) return;
    if (!editCustName.trim() || !editFaultSymptom.trim()) {
      alert('กรุณากรอกชื่อลูกค้าและอาการเสีย');
      return;
    }
    const target = repairTickets.find(t => t.id === editTicketId);
    updateRepairTicket(editTicketId, {
      customer_name: editCustName.trim(),
      customer_phone: editCustPhone.trim() || null,
      device_model: editDeviceModel.trim() || null,
      walkin_sn: editSn.trim(),
      fault_symptom: editFaultSymptom.trim(),
      included_accessories: editAccessories.trim() || null
    });
    setToast(`แก้ไขข้อมูลใบรับซ่อม ${target?.ticket_no || ''} เรียบร้อย`);
    setTimeout(() => setToast(''), 3500);
    closeEditModal();
  };

  // ---- Delete confirmation ----
  const openDeleteConfirm = (ticket: RepairTicket) => {
    setOpenMenuId(null);
    setDeleteTicketId(ticket.id);
  };

  const confirmDelete = () => {
    if (!deleteTicketId) return;
    const target = repairTickets.find(t => t.id === deleteTicketId);
    deleteRepairTicket(deleteTicketId);
    if (activeTicketId === deleteTicketId) closeTicketModal();
    setDeleteTicketId(null);
    setToast(`ลบใบรับซ่อม ${target?.ticket_no || ''} เรียบร้อย`);
    setTimeout(() => setToast(''), 3500);
  };

  const deleteTarget = deleteTicketId ? repairTickets.find(t => t.id === deleteTicketId) : null;
  const editTarget = editTicketId ? repairTickets.find(t => t.id === editTicketId) : null;

  return (
    <div className="space-y-6">
      <ToastBanner message={toast} onClose={() => setToast('')} />

      {/* Main Repair Workbench */}
      <div className="liquid-glass rounded-3xl p-6 sm:p-7 shadow-2xl border border-slate-200 dark:border-white/[0.08]">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5 pb-4 border-b border-slate-200 dark:border-white/[0.08]">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <div className="p-2 rounded-xl bg-rose-100 text-rose-700 border border-rose-300 dark:bg-rose-500/15 dark:text-rose-400 dark:border-rose-500/30">
                <Wrench className="w-5 h-5" />
              </div>
              <span>โต๊ะช่างซ่อม & ติดตามงานเคลม (In-House Repair & RMA Tracking)</span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              ติดตามวงจรชีวิตงานซ่อมหน้าร้านและการส่งเคลมศูนย์/Supplier (RMA) แบบครบขั้นตอน
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button disabled={readOnly}
              type="button"
              onClick={() => setRepairIntakeOpen(true)}
              className="px-4 py-2 bg-gradient-to-r from-[#FF6B00] to-[#E65A00] hover:from-[#FF8A24] text-black font-extrabold rounded-2xl text-xs transition cursor-pointer flex items-center gap-1.5 shadow-lg shadow-[#FF6B00]/25 border border-white/20 active:scale-95"
            >
              <Plus className="w-4 h-4" />
              <span>รับเครื่องซ่อม (ห้องช่างซ่อม)</span>
            </button>
            <span className="text-xs px-3 py-1.5 rounded-2xl bg-rose-100 text-rose-700 border border-rose-300 dark:bg-rose-500/15 dark:text-rose-400 dark:border-rose-500/30 font-semibold">
              {openTickets.length} งานค้างซ่อม
            </span>
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="flex flex-wrap gap-1.5 mb-5">
          {FILTER_TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            const count = tabCount(tab.id);
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`px-3 py-1.5 rounded-xl text-[11px] font-semibold border transition-all duration-150 active:scale-[0.97] cursor-pointer inline-flex items-center gap-1.5 ${isActive
                  ? 'bg-[#FF6B00] text-black border-[#FF6B00] shadow-md shadow-[#FF6B00]/25'
                  : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200 dark:bg-white/[0.04] dark:text-slate-300 dark:border-white/[0.08] dark:hover:bg-white/[0.08]'
                  }`}
              >
                {tab.label}
                <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${isActive ? 'bg-black/20 text-black' : 'bg-slate-200 text-slate-600 dark:bg-white/[0.08] dark:text-slate-400'}`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {filteredTickets.length === 0 ? (
          <div className="text-center py-12 text-slate-500 border border-dashed border-slate-300 dark:border-white/[0.1] rounded-2xl">
            <CheckCircle className="w-10 h-10 mx-auto mb-2 text-rose-500 dark:text-rose-400 opacity-60" />
            <p className="text-sm font-medium text-slate-700 dark:text-slate-200">ไม่มีงานในหมวดนี้</p>
            <p className="text-xs text-slate-500 mt-0.5">ลองเลือกแท็บอื่น หรือเปิดใบรับซ่อมใหม่</p>
          </div>
        ) : (
          <div className="space-y-5">
            <ListControls
              from={repairsList.from}
              to={repairsList.to}
              total={repairsList.total}
              page={repairsList.page}
              totalPages={repairsList.totalPages}
              pageSize={repairsList.pageSize}
              sort={repairsList.sort}
              onSortChange={repairsList.setSort}
              onPageSizeChange={repairsList.setPageSize}
              onPageChange={repairsList.setPage}
              unit="งาน"
              hideSort
            />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {repairsList.pageItems.map((ticket) => {
                const serviceType = getServiceType(ticket);
                const lifecycle = getLifecycle(ticket);
                const meta = REPAIR_LIFECYCLE_META[lifecycle];
                const elapsed = lifecycle === 'rma_sent' ? getElapsedDays(ticket.rma_sent_date) : null;

                return (
                  <div
                    key={ticket.id}
                    className="p-4 rounded-2xl liquid-glass-card flex flex-col justify-between space-y-3 border border-white/[0.08] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className="font-mono font-extrabold text-sm text-white data-key">{ticket.ticket_no}</span>
                        <div className="flex items-center gap-1.5">
                          <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-semibold border ${meta.badge}`}>
                            {meta.label}
                          </span>
                          <div className="relative" ref={openMenuId === ticket.id ? menuRef : undefined}>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setOpenMenuId(prev => (prev === ticket.id ? null : ticket.id));
                              }}
                              aria-label="ตัวเลือกเพิ่มเติม"
                              aria-haspopup="menu"
                              aria-expanded={openMenuId === ticket.id}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-white bg-white/[0.04] hover:bg-white/[0.12] border border-white/[0.08] transition cursor-pointer active:scale-95"
                            >
                              <MoreVertical className="w-4 h-4" />
                            </button>
                            {openMenuId === ticket.id && (
                              <div
                                role="menu"
                                onClick={(e) => e.stopPropagation()}
                                className="absolute right-0 top-full mt-1.5 z-30 w-48 rounded-xl overflow-hidden shadow-2xl border border-slate-200 dark:border-white/[0.12] bg-white dark:bg-[#12141A] animate-modal-pop"
                              >
                                <button disabled={readOnly}
                                  type="button"
                                  role="menuitem"
                                  onClick={() => openEditModal(ticket)}
                                  className="w-full px-3 py-2.5 text-left text-xs font-semibold flex items-center gap-2 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/[0.08] transition cursor-pointer"
                                >
                                  <Pencil className="w-3.5 h-3.5 text-[#FF6B00]" />
                                  <span>แก้ไขข้อมูล (Edit Info)</span>
                                </button>
                                <div className="h-px bg-slate-200 dark:bg-white/[0.08]" />
                                <button disabled={readOnly}
                                  type="button"
                                  role="menuitem"
                                  onClick={() => openDeleteConfirm(ticket)}
                                  className="w-full px-3 py-2.5 text-left text-xs font-semibold flex items-center gap-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 transition cursor-pointer"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                  <span>ลบรายการ (Delete)</span>
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 flex-wrap mb-2">
                        {serviceType === 'rma_claim' ? (
                          <span className="px-2 py-0.5 rounded-md bg-violet-500/15 text-violet-600 dark:text-violet-400 border border-violet-500/30 text-[10px] font-bold inline-flex items-center gap-1">
                            <Truck className="w-3 h-3" />
                            ส่งเคลม: {ticket.rma_supplier || 'ศูนย์'}
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 text-[10px] font-bold inline-flex items-center gap-1">
                            <Wrench className="w-3 h-3" />
                            ซ่อมหน้าร้าน
                          </span>
                        )}
                        {elapsed !== null && (
                          <span className="px-2 py-0.5 rounded-md bg-violet-500/10 text-violet-600 dark:text-violet-300 border border-violet-500/30 text-[10px] font-bold inline-flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            ส่งเคลมแล้ว {elapsed} วัน
                          </span>
                        )}
                        {ticket.replacement_sn && (
                          <span className="px-2 py-0.5 rounded-md bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 border border-cyan-500/30 text-[10px] font-bold inline-flex items-center gap-1">
                            <ScanLine className="w-3 h-3" />
                            S/N ใหม่: {ticket.replacement_sn}
                          </span>
                        )}
                      </div>

                      {/* ผู้รับเครื่อง / ช่างผู้ซ่อม — แยกชัดเจน */}
                      <div className="flex items-center gap-1.5 flex-wrap mb-2">
                        <span
                          className={`px-2 py-0.5 rounded-md text-[10px] font-bold inline-flex items-center gap-1 border ${ticket.received_channel === 'onsite_pickup'
                            ? 'bg-sky-500/15 text-sky-600 dark:text-sky-300 border-sky-500/30'
                            : 'bg-slate-500/15 text-slate-600 dark:text-slate-300 border-slate-500/30'
                            }`}
                          title={ticket.received_channel === 'onsite_pickup' ? 'รับจากหน้างาน (Onsite)' : 'รับที่หน้าร้าน'}
                        >
                          <UserCheck className="w-3 h-3" />
                          ผู้รับเครื่อง: {ticket.received_by || '-'}
                          {ticket.received_channel === 'onsite_pickup' && (
                            <span className="ml-0.5 px-1 rounded bg-sky-500/25 text-sky-700 dark:text-sky-200">Onsite</span>
                          )}
                        </span>
                        <span className="px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 text-[10px] font-bold inline-flex items-center gap-1">
                          <Wrench className="w-3 h-3" />
                          ช่างผู้ซ่อม: {ticket.repaired_by || 'ยังไม่ระบุ'}
                        </span>
                      </div>

                      <p className="text-xs text-slate-300 data-meta">
                        ลูกค้า: <strong className="text-white font-bold">{ticket.customer_name}</strong>
                        {ticket.customer_phone ? <span className="text-slate-400"> • {ticket.customer_phone}</span> : null}
                      </p>
                      <p className="mt-1 flex items-center gap-1.5 flex-wrap">
                        <span className="text-sm font-extrabold text-white leading-tight">
                          {ticket.device_model || 'อุปกรณ์'}
                        </span>
                        <span className="text-[11px] text-slate-400">
                          S/N: <span className="font-mono font-bold text-[#FF6B00]">{ticket.walkin_sn || 'ไม่ระบุ'}</span>
                        </span>
                        {(() => {
                          const w = lookupWarrantyBySerial(ticket.walkin_sn);
                          if (!w.found) return null;
                          if (w.state === 'active') {
                            return (
                              <span
                                className="px-2 py-0.5 rounded-full bg-emerald-600 text-white dark:bg-emerald-400 dark:text-slate-950 text-[10px] font-extrabold inline-flex items-center gap-1"
                                title={`${w.durationLabel} • หมดประกัน ${formatDateDMY(w.expireDate)}`}
                              >
                                <ShieldCheck className="w-3 h-3" />
                                อยู่ในประกัน ({w.remainingLabel})
                              </span>
                            );
                          }
                          if (w.state === 'expired') {
                            return (
                              <span className="px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/30 text-[10px] font-bold inline-flex items-center gap-1">
                                <ShieldAlert className="w-3 h-3" />
                                หมดประกันแล้ว
                              </span>
                            );
                          }
                          return null;
                        })()}
                      </p>
                      <p className="text-xs text-rose-300 font-semibold mt-1 line-clamp-2">{ticket.fault_symptom}</p>
                    </div>

                    <div className="pt-3 border-t border-white/[0.08] space-y-2">
                      {/* Quick-complete: จบงานฝั่งช่างทันที (เฉพาะ repairing / rma_returned) */}
                      {(lifecycle === 'repairing' || lifecycle === 'rma_returned') && (
                        <button disabled={readOnly}
                          onClick={() => quickHandoffFromCard(ticket)}
                          className="w-full py-2.5 rounded-xl bg-gradient-to-r from-sky-500 to-cyan-600 hover:from-sky-400 hover:to-cyan-500 hover:brightness-105 text-white font-extrabold text-xs transition-all duration-150 cursor-pointer flex items-center justify-center gap-1.5 shadow-lg shadow-sky-500/25 border border-white/20 active:scale-[0.97]"
                          title="ซ่อม/เคลมเสร็จ ส่งเครื่องคืนห้องหน้าร้าน (จบงานฝั่งช่าง)"
                        >
                          <CheckCircle className="w-4 h-4" />
                          <span>ซ่อม/เคลมเสร็จ → ส่งคืนหน้าร้าน</span>
                        </button>
                      )}
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => openTicketModal(ticket)}
                          className="flex-1 py-2.5 bg-gradient-to-r from-[#FF6B00] to-[#E65A00] hover:from-[#FF8A24] hover:brightness-105 text-black font-extrabold rounded-xl text-xs transition-all duration-150 cursor-pointer flex items-center justify-center gap-1.5 shadow-lg shadow-[#FF6B00]/25 border border-white/20 active:scale-[0.97]"
                        >
                          <ClipboardList className="w-4 h-4" />
                          <span>{lifecycle === 'awaiting_quote'
                            ? ticket.repair_quotation ? 'จัดการใบเสนอราคา' : 'ทำใบเสนอราคา'
                            : 'เปิดจัดการ / อัปเดตสถานะ'}</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handlePrintModal(ticket)}
                          className="px-3 py-2.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] text-slate-200 text-xs font-semibold cursor-pointer flex items-center gap-1 border border-white/[0.1] transition"
                          title="พิมพ์ใบรับซ่อมมาตรฐานของบริษัท"
                        >
                          <Printer className="w-3.5 h-3.5 text-amber-400" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* MODAL 3: REPAIR DETAIL & RMA ACTION */}
      {/* ========================================================================= */}
      {(() => {
        if (!activeTicketId) return null;
        const ticket = repairTickets.find(t => t.id === activeTicketId);
        if (!ticket) return null;

        const elapsed = draftStatus === 'rma_sent' ? getElapsedDays(ticket.rma_sent_date) : null;
        const draftMeta = REPAIR_LIFECYCLE_META[draftStatus];
        const statusChanged = draftStatus !== getLifecycle(ticket);

        return (
          <Modal
            open
            onClose={closeTicketModal}
            ariaLabel="Repair Detail"
            title={ticket.ticket_no}
            subtitle={`S/N: ${ticket.walkin_sn || 'ไม่ระบุ'}${ticket.device_model ? ` • ${ticket.device_model}` : ''}`}
            icon={<Wrench className="w-5 h-5" />}
            maxWidthClass="max-w-3xl"
            footer={
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handlePrintModal(ticket)}
                    className={modalSecondaryBtnClass + ' sm:w-auto flex items-center gap-1.5'}
                  >
                    <Printer className="w-4 h-4" />
                    <span>พิมพ์ใบรับซ่อม</span>
                  </button>
                  <button
                    onClick={closeTicketModal}
                    className={modalSecondaryBtnClass + ' sm:w-auto min-w-[96px] px-6 flex items-center justify-center gap-1.5'}
                  >
                    <X className="w-4 h-4" />
                    <span>ปิด</span>
                  </button>
                </div>
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                  {draftStatus !== 'ready_pickup' && draftStatus !== 'awaiting_quote' && (
                    <button disabled={readOnly}
                      onClick={() => handleQuickHandoff(ticket)}
                      className="w-full sm:w-auto min-h-[44px] py-2.5 px-4 rounded-xl font-extrabold text-xs transition-all duration-150 cursor-pointer flex items-center justify-center gap-1.5 bg-gradient-to-r from-sky-500 to-cyan-600 hover:from-sky-400 hover:to-cyan-500 hover:brightness-105 text-white shadow-lg shadow-sky-500/25 border border-white/20 active:scale-[0.97]"
                      title="จบงานฝั่งช่างทันที แล้วส่งเครื่องคืนห้องหน้าร้าน"
                    >
                      <CheckCircle className="w-4 h-4" />
                      <span>ซ่อมเสร็จ → ส่งคืนหน้าร้าน</span>
                    </button>
                  )}
                  <button
                    onClick={() => handleSaveAll(ticket)}
                    disabled={readOnly || (isSaving)}
                    className="w-full sm:w-auto min-h-[44px] py-2.5 px-5 rounded-xl font-extrabold text-xs transition-all duration-150 cursor-pointer flex items-center justify-center gap-1.5 bg-gradient-to-r from-emerald-700 to-emerald-800 hover:from-emerald-800 hover:to-emerald-900 text-white shadow-lg shadow-emerald-500/25 border border-white/20 active:scale-[0.97]"
                  >
                    <Save className="w-4 h-4" />
                    <span>{isSaving ? 'กำลังบันทึก…' : 'บันทึกข้อมูลและสถานะ (Save Changes)'}</span>
                  </button>
                </div>
              </div>
            }
          >
            <div className="space-y-4">
              {/* ---- Current Status Selector Card (prominent) ---- */}
              <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-br from-[#FF6B00]/[0.12] to-[#FF6B00]/[0.03] dark:from-[#FF6B00]/[0.16] dark:to-[#FF6B00]/[0.04] border-2 border-[#FF6B00]/40 shadow-lg shadow-[#FF6B00]/10">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[11px] font-extrabold uppercase tracking-wide text-[#FF6B00] mb-1.5">
                      สถานะงานซ่อมปัจจุบัน
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-base sm:text-lg font-extrabold border-2 ${draftMeta.badge}`}>
                        <span className={`w-3 h-3 rounded-full ${draftMeta.dot}`} />
                        {draftMeta.label}
                      </span>
                      {statusChanged && (
                        <span className="px-2 py-1 rounded-lg text-[11px] font-bold bg-[#FF6B00] text-black">
                          ยังไม่บันทึก
                        </span>
                      )}
                    </div>
                    {elapsed !== null && (
                      <div className="mt-2">
                        <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold border bg-violet-500/15 text-violet-600 dark:text-violet-400 border-violet-500/30">
                          ส่งเคลมแล้ว {elapsed} วัน
                        </span>
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={openStatusPicker}
                    disabled={readOnly || (isSaving)}
                    className="px-4 py-3 rounded-xl bg-gradient-to-r from-[#FF6B00] to-[#E65A00] hover:from-[#FF8A24] hover:to-[#FF6B00] text-black text-sm font-extrabold cursor-pointer flex items-center justify-center gap-2 transition active:scale-[0.97] flex-shrink-0 shadow-lg shadow-[#FF6B00]/25 border border-white/20"
                  >
                    <RefreshCw className="w-4 h-4" />
                    <span>เปลี่ยนสถานะ (Change Status)</span>
                  </button>
                </div>
              </div>

              {draftStatus === 'awaiting_quote' && (
                <fieldset disabled={isSaving} className="space-y-3 rounded-xl border border-slate-200 p-4 dark:border-white/10">
                  <legend className="px-1 font-bold">ใบเสนอราคาซ่อม</legend>
                  <div>
                    <label htmlFor="repair-quote-description" className={modalLabelClass}>รายการซ่อมและอะไหล่ที่เสนอ</label>
                    <textarea
                      id="repair-quote-description"
                      rows={3}
                      maxLength={1000}
                      className={modalInputClass}
                      value={quoteDescription}
                      onChange={e => setQuoteDescription(e.target.value)}
                    />
                  </div>
                  <div>
                    <label htmlFor="repair-quote-total" className={modalLabelClass}>ยอดเสนอราคารวม (บาท)</label>
                    <input
                      id="repair-quote-total"
                      inputMode="decimal"
                      className={modalInputClass}
                      value={quoteTotal}
                      onChange={e => setQuoteTotal(e.target.value)}
                    />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button disabled={readOnly} type="button" className={modalPrimaryBtnClass} onClick={() => handleSaveAll(ticket, true)}>
                      {isSaving ? 'กำลังบันทึก…' : 'บันทึกใบเสนอราคา'}
                    </button>
                    {ticket.repair_quotation && !statusChanged && !hasQuoteChanges(ticket) && (
                      <button type="button" className={modalSecondaryBtnClass} onClick={() => printQuotation(ticket)}>
                        พิมพ์ใบเสนอราคา
                      </button>
                    )}
                  </div>
                </fieldset>
              )}
              {saveError && <p role="alert" className="text-sm font-semibold text-rose-700 dark:text-rose-300">{saveError}</p>}

              {/* Customer info */}
              <div className="p-3 rounded-xl bg-slate-100 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] text-xs">
                <div className={modalLabelClass}>ลูกค้า</div>
                <div className="font-bold text-slate-900 dark:text-white mt-0.5">{ticket.customer_name}</div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  {ticket.customer_phone || '-'} • {ticket.district || '-'}
                </div>
                <WarrantyLookupBanner
                  serialNumber={ticket.walkin_sn}
                  lookup={lookupWarrantyBySerial}
                  labelPrefix="ตรวจเช็กประกัน S/N"
                />
              </div>

              {/* ผู้รับเครื่อง / ช่างผู้ซ่อม */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                <div className="p-3 rounded-xl bg-slate-100 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08]">
                  <div className={modalLabelClass}>ผู้รับเครื่อง</div>
                  <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                    <span className="font-bold text-slate-900 dark:text-white">{ticket.received_by || '-'}</span>
                    {ticket.received_channel === 'onsite_pickup' ? (
                      <span className="px-1.5 py-0.5 rounded-md bg-sky-500/15 text-sky-600 dark:text-sky-300 border border-sky-500/30 text-[10px] font-bold">
                        รับจากหน้างาน (Onsite)
                      </span>
                    ) : (
                      <span className="px-1.5 py-0.5 rounded-md bg-slate-500/15 text-slate-600 dark:text-slate-300 border border-slate-500/30 text-[10px] font-bold">
                        รับหน้าร้าน
                      </span>
                    )}
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-slate-100 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08]">
                  <div className={modalLabelClass}>ช่างผู้ซ่อม</div>
                  <div className="font-bold text-slate-900 dark:text-white mt-0.5">
                    {ticket.repaired_by || 'ยังไม่ระบุ (จะบันทึกเป็นชื่อผู้กดบันทึก)'}
                  </div>
                </div>
              </div>

              {/* Symptom */}
              <div className="p-3.5 rounded-xl bg-slate-100 dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.06] text-xs space-y-2">
                <div>
                  <span className="text-slate-500 dark:text-slate-400 font-medium">อาการเสียที่ได้รับแจ้ง:</span>
                  <p className="text-rose-500 dark:text-rose-300 font-semibold text-sm mt-0.5">{ticket.fault_symptom}</p>
                </div>
                {ticket.accessories && ticket.accessories.length > 0 && (
                  <div className="pt-2 border-t border-slate-200 dark:border-white/[0.05] text-[11px]">
                    <span className="text-slate-500 dark:text-slate-400">อุปกรณ์ที่ติดมาด้วย: </span>
                    <span className="text-slate-900 dark:text-white font-medium">
                      {ticket.accessories.join(', ')}
                      {ticket.accessories_other ? ` (${ticket.accessories_other})` : ''}
                    </span>
                  </div>
                )}
              </div>

              {/* Service Type Toggle (draft) */}
              {!!ticket.photo_urls?.length && (
                <EvidencePhotoUploader
                  value={ticket.photo_urls}
                  onChange={() => {}}
                  folder="onsite"
                  editable={false}
                  maxPhotos={Math.max(3, ticket.photo_urls.length)}
                  label="รูปหลักฐานประกอบใบรับซ่อม"
                />
              )}
              <div>
                <label className={modalLabelClass}>ประเภทงานซ่อม *</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setDraftServiceType('in_house_repair')}
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex items-center gap-2 ${draftServiceType === 'in_house_repair'
                      ? 'bg-amber-500/15 border-amber-500/40 text-amber-600 dark:text-amber-300 ring-2 ring-[#FF6B00]/30'
                      : 'bg-slate-50 dark:bg-white/[0.02] border-slate-200 dark:border-white/[0.06] text-slate-500 dark:text-slate-400'
                      }`}
                  >
                    <Wrench className="w-4 h-4 flex-shrink-0" />
                    <span className="font-bold text-xs">ซ่อมเองหน้าร้าน</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setDraftServiceType('rma_claim')}
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex items-center gap-2 ${draftServiceType === 'rma_claim'
                      ? 'bg-violet-500/15 border-violet-500/40 text-violet-600 dark:text-violet-300 ring-2 ring-violet-500/30'
                      : 'bg-slate-50 dark:bg-white/[0.02] border-slate-200 dark:border-white/[0.06] text-slate-500 dark:text-slate-400'
                      }`}
                  >
                    <Truck className="w-4 h-4 flex-shrink-0" />
                    <span className="font-bold text-xs">ส่งเคลมประกัน (RMA)</span>
                  </button>
                </div>
              </div>

              {/* RMA Tracking Section (draft) */}
              {draftServiceType === 'rma_claim' && (
                <div className="p-3.5 rounded-xl bg-violet-500/[0.06] dark:bg-violet-500/[0.08] border border-violet-500/25 space-y-3">
                  <div className="flex items-center gap-1.5 text-violet-600 dark:text-violet-300 font-bold text-xs">
                    <Truck className="w-4 h-4" />
                    <span>ข้อมูลการส่งเคลมศูนย์ / Supplier (RMA)</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className={modalLabelClass}>
                        <Building2 className="w-3 h-3 inline mr-1" />
                        Supplier / ศูนย์เคลม
                      </label>
                      <select
                        value={draftRmaSupplier}
                        onChange={(e) => setDraftRmaSupplier(e.target.value)}
                        className={modalInputClass + ' cursor-pointer'}
                      >
                        {RMA_SUPPLIER_OPTIONS.map(s => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className={modalLabelClass}>
                        <Hash className="w-3 h-3 inline mr-1" />
                        เลขใบส่งเคลม / เลขพัสดุ
                      </label>
                      <input
                        type="text"
                        placeholder="เช่น SNX-RMA-2569-00871"
                        value={draftRmaTrackingNo}
                        onChange={(e) => setDraftRmaTrackingNo(e.target.value)}
                        className={modalInputClass + ' font-mono'}
                      />
                    </div>
                    <div>
                      <label className={modalLabelClass}>
                        <CalendarDays className="w-3 h-3 inline mr-1" />
                        วันที่ส่งออกเคลม
                      </label>
                      <input
                        type="date"
                        value={draftRmaSentDate}
                        onChange={(e) => setDraftRmaSentDate(e.target.value)}
                        className={modalInputClass}
                      />
                    </div>
                    <div>
                      <label className={modalLabelClass}>
                        <CalendarDays className="w-3 h-3 inline mr-1" />
                        วันที่ได้ของเคลมกลับ
                      </label>
                      <input
                        type="date"
                        value={draftRmaReturnedDate}
                        onChange={(e) => setDraftRmaReturnedDate(e.target.value)}
                        className={modalInputClass}
                      />
                    </div>
                  </div>

                  {/* Replacement S/N */}
                  <div className="pt-3 border-t border-violet-500/20 space-y-2">
                    <div className="text-[11px] font-bold text-violet-600 dark:text-violet-300 flex items-center gap-1.5">
                      <ScanLine className="w-3.5 h-3.5" />
                      S/N ตัวใหม่ (กรณีศูนย์เปลี่ยนเครื่อง)
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        placeholder="S/N ใหม่กรณีศูนย์เปลี่ยนตัวใหม่"
                        value={draftReplacementSn}
                        onChange={(e) => setDraftReplacementSn(e.target.value)}
                        className={modalInputClass + ' font-mono'}
                      />
                      <button
                        type="button"
                        onClick={() => setScannerTarget('replacement')}
                        className="px-3 py-2 rounded-xl bg-violet-500/15 hover:bg-violet-500/25 text-violet-600 dark:text-violet-300 border border-violet-500/30 text-xs font-semibold cursor-pointer flex items-center gap-1 transition flex-shrink-0"
                        title="สแกนบาร์โค้ด S/N ตัวใหม่"
                      >
                        <Camera className="w-4 h-4" />
                        <span className="hidden sm:inline">สแกน</span>
                      </button>
                    </div>
                    <WarrantyLookupBanner
                      serialNumber={draftReplacementSn}
                      lookup={lookupWarrantyBySerial}
                      labelPrefix="S/N ตัวใหม่"
                    />
                  </div>
                </div>
              )}

              {/* Included Accessories */}
              <div>
                <label className={modalLabelClass}>อุปกรณ์ที่ติดมากับเครื่อง (ระบุในใบรับซ่อม)</label>
                <input
                  type="text"
                  placeholder="เช่น Adapter, สายชาร์จ, กระเป๋า"
                  value={draftIncludedAccessories}
                  onChange={(e) => setDraftIncludedAccessories(e.target.value)}
                  className={modalInputClass}
                />
              </div>

              {/* Repair Detail Inputs */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className={modalLabelClass}>รายละเอียดการซ่อม / ผลการทดสอบ</label>
                  <textarea
                    rows={2}
                    placeholder="ระบุสิ่งที่ซ่อม / ผลทดสอบหลังซ่อม"
                    value={draftRepairDetail}
                    onChange={(e) => setDraftRepairDetail(e.target.value)}
                    className={modalInputClass + ' resize-none'}
                  />
                </div>
                <div>
                  <label className={modalLabelClass}>อะไหล่ที่ใช้</label>
                  <input
                    type="text"
                    placeholder="เช่น SSD 512GB, พัดลม CPU"
                    value={draftPartsUsed}
                    onChange={(e) => setDraftPartsUsed(e.target.value)}
                    className={modalInputClass}
                  />
                  <label className={modalLabelClass + ' mt-2'}>ค่าใช้จ่าย (บาท)</label>
                  <NumberInput
                    finishOnEnter
                    min={0}
                    step="0.01"
                    placeholder="0"
                    value={draftCost}
                    onChange={(e) => setDraftCost(e.target.value)}
                    className={modalInputClass}
                  />
                </div>
              </div>

              {/* Activity Timeline */}
              <div className="pt-2 border-t border-slate-200 dark:border-white/[0.08]">
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-200 mb-2">
                  <Clock className="w-4 h-4 text-[#FF6B00]" />
                  <span>ประวัติการดำเนินการ (Activity Log)</span>
                </div>
                <ActivityTimeline logs={ticket.activity_logs} />
              </div>
            </div>
          </Modal>
        );
      })()}

      {quoteToPrint?.repair_quotation && createPortal(
        <article id="repair-quotation-print" className="hidden print:block p-4 text-black">
          <header className="border-b border-slate-400 pb-3">
            <h1 className="text-xl font-bold">ใบเสนอราคาซ่อม</h1>
            <p className="font-bold">{COMPANY_NAME}</p>
            <p>{COMPANY_ADDRESS} · โทร. 077-286999</p>
          </header>
          <dl className="my-4 grid grid-cols-2 gap-2">
            <div><dt className="font-semibold">อ้างอิงใบรับซ่อม</dt><dd>{quoteToPrint.ticket_no}</dd></div>
            <div><dt className="font-semibold">วันที่เสนอราคา</dt><dd>{formatDateDMY(quoteToPrint.repair_quotation.issued_at)}</dd></div>
            <div><dt className="font-semibold">ลูกค้า</dt><dd>{quoteToPrint.customer_name}</dd></div>
            <div><dt className="font-semibold">อุปกรณ์ / S/N</dt><dd>{[quoteToPrint.device_model, quoteToPrint.walkin_sn].filter(Boolean).join(' / ') || '—'}</dd></div>
          </dl>
          <section className="border-y border-slate-400 py-3">
            <h2 className="font-bold">รายการซ่อมและอะไหล่ที่เสนอ</h2>
            <p className="whitespace-pre-wrap break-words">{quoteToPrint.repair_quotation.description}</p>
          </section>
          <p className="mt-3 text-right font-bold">
            ยอดเสนอราคารวม {quoteToPrint.repair_quotation.total.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} บาท
          </p>
        </article>,
        document.body
      )}

      {/* ========================================================================= */}
      {/* NESTED MODAL: STATUS PICKER (stacked above Repair Detail Modal) */}
      {/* ========================================================================= */}
      {isStatusPickerOpen && createPortal(
        <ModalBackdrop
          className="fixed inset-0 z-[10000] flex items-center justify-center p-4 sm:p-6 bg-black/70 dark:bg-black/80 backdrop-blur-md overflow-y-auto overscroll-contain animate-fade-in"
          role="dialog"
          aria-modal="true"
          aria-label="เลือกสถานะงานซ่อม"
          onDismiss={() => setIsStatusPickerOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg max-h-[82dvh] sm:max-h-[86dvh] flex flex-col overflow-hidden rounded-3xl shadow-2xl border animate-modal-pop bg-white text-slate-900 border-[#FF6B00]/40 dark:bg-[#12141A] dark:text-white dark:border-[#FF6B00]/40"
          >
            <div className="flex items-start justify-between gap-3 px-4 sm:px-6 py-3 sm:py-4 border-b border-slate-200 dark:border-white/[0.1] flex-shrink-0">
              <div className="flex items-start gap-3 min-w-0">
                <div className="p-2 rounded-xl bg-[#FF6B00]/15 text-[#FF6B00] border border-[#FF6B00]/30 flex-shrink-0">
                  <RefreshCw className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm sm:text-base font-bold leading-tight text-slate-900 dark:text-white">
                    เลือกสถานะงานซ่อม
                  </h3>
                  <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    เลือกสถานะงานช่าง แล้วกด "ตกลง" เพื่อยืนยัน — สถานะสุดท้ายคือ "ซ่อม/เคลมเสร็จ → ส่งคืนหน้าร้าน" (จบงานฝั่งช่าง)
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsStatusPickerOpen(false)}
                aria-label="ปิดหน้าต่าง"
                className="p-2.5 rounded-xl text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white bg-slate-100 dark:bg-white/[0.06] hover:bg-slate-200 dark:hover:bg-white/[0.12] transition-all duration-150 active:scale-[0.97] min-w-[44px] min-h-[44px] flex items-center justify-center flex-shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto overscroll-contain px-4 sm:px-6 py-4 space-y-2">
              {REPAIR_TECH_LIFECYCLE_ORDER.map((s) => {
                const m = REPAIR_LIFECYCLE_META[s];
                const selected = pendingStatus === s;
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setPendingStatus(s)}
                    className={`w-full p-3 rounded-xl border text-left transition-all cursor-pointer flex items-center gap-3 active:scale-[0.99] ${selected
                      ? 'bg-[#FF6B00]/10 border-[#FF6B00]/50 ring-2 ring-[#FF6B00]/40'
                      : 'bg-slate-50 dark:bg-white/[0.03] border-slate-200 dark:border-white/[0.08] hover:bg-slate-100 dark:hover:bg-white/[0.06]'
                      }`}
                  >
                    <span className={`flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center ${selected ? 'border-[#FF6B00]' : 'border-slate-300 dark:border-slate-600'}`}>
                      {selected && <span className="w-2.5 h-2.5 rounded-full bg-[#FF6B00]" />}
                    </span>
                    <span className={`flex-shrink-0 w-2.5 h-2.5 rounded-full ${m.dot}`} />
                    <span className="flex-1 min-w-0">
                      <span className="block text-xs font-bold text-slate-900 dark:text-white">{m.label}</span>
                    </span>
                    {selected && <CheckCircle className="w-4 h-4 text-[#FF6B00] flex-shrink-0" />}
                  </button>
                );
              })}
            </div>

            <div className="flex-shrink-0 px-4 sm:px-6 py-4 border-t border-slate-200 dark:border-white/[0.1] bg-slate-50 dark:bg-white/[0.02]">
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsStatusPickerOpen(false)}
                  className={modalSecondaryBtnClass + ' sm:w-auto min-w-[110px] px-6 py-3'}
                >
                  ยกเลิก
                </button>
                <button disabled={readOnly}
                  type="button"
                  onClick={confirmStatusPick}
                  className={modalPrimaryBtnClass + ' sm:w-auto min-w-[170px] px-6 py-3 flex items-center justify-center gap-1.5'}
                >
                  <CheckCircle className="w-4 h-4" />
                  <span>ตกลง (Confirm Status)</span>
                </button>
              </div>
            </div>
          </div>
        </ModalBackdrop>,
        document.body
      )}

      {/* ========================================================================= */}
      {/* MODAL 1: NEW REPAIR TICKET */}
      {/* ========================================================================= */}
      <Modal
        open={isNewTicketOpen}
        onClose={() => setIsNewTicketOpen(false)}
        ariaLabel="New Repair Ticket"
        title="เปิดใบรับซ่อมใหม่"
        subtitle="บันทึกข้อมูลลูกค้า อุปกรณ์ และอาการเสีย"
        icon={<Plus className="w-5 h-5" />}
        maxWidthClass="max-w-2xl"
        footer={
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2">
            <button onClick={() => setIsNewTicketOpen(false)} className={modalSecondaryBtnClass + ' sm:w-auto'}>
              ยกเลิก
            </button>
            <button disabled={readOnly} type="submit" form="new-ticket-form" className={modalPrimaryBtnClass + ' sm:w-auto flex items-center justify-center gap-1.5'}>
              <CheckCircle className="w-4 h-4" />
              <span>บันทึก & เปิดใบรับซ่อม</span>
            </button>
          </div>
        }
      >
        <form id="new-ticket-form" onSubmit={handleCreateTicketSubmit} className="space-y-3">
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
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={sn}
                onChange={(e) => handleNewSnChange(e.target.value)}
                className={modalInputClass + ' font-mono'}
                placeholder="สแกนหรือพิมพ์ S/N เช่น BC-2026-001 (ถ้าซื้อจากร้านระบบจะกรอกให้เอง)"
              />
              <button
                type="button"
                onClick={() => setScannerTarget('new')}
                className="px-3 py-2 rounded-xl bg-[#FF6B00]/15 hover:bg-[#FF6B00]/25 text-[#FF6B00] border border-[#FF6B00]/30 text-xs font-semibold cursor-pointer flex items-center gap-1 transition flex-shrink-0"
              >
                <Camera className="w-4 h-4" />
                <span className="hidden sm:inline">สแกน</span>
              </button>
            </div>
            {newSnLookup.found ? (
              <div className="rounded-xl p-2.5 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="text-emerald-800 dark:text-emerald-200 space-y-0.5">
                  <div className="font-bold flex items-center gap-1.5">
                    <CheckCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <span>พบข้อมูลในระบบ — กรอกชื่อลูกค้าและรุ่นเครื่องให้อัตโนมัติแล้ว</span>
                  </div>
                  {(newSnLookup.billNo || newSnLookup.salesRef) && (
                    <div className="text-[11px] font-mono opacity-90">
                      เอกสาร: {newSnLookup.billNo || newSnLookup.salesRef}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={clearNewAutoFill}
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
            <WarrantyLookupBanner serialNumber={sn} lookup={lookupWarrantyBySerial} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={modalLabelClass}>ชื่อลูกค้า *</label>
              <input type="text" value={custName} onChange={(e) => setCustName(e.target.value)} className={modalInputClass} placeholder="ชื่อ-นามสกุล" />
            </div>
            <div>
              <label htmlFor="repair-customer-phone" className={modalLabelClass}>เบอร์โทร</label>
              <PhoneInput id="repair-customer-phone" value={custPhone} onChange={(e) => setCustPhone(e.target.value)} className={modalInputClass} />
            </div>
            <div>
              <label className={modalLabelClass}>อำเภอ / พื้นที่</label>
              <select value={district} onChange={(e) => setDistrict(e.target.value)} className={modalInputClass + ' cursor-pointer'}>
                {DISTRICT_OPTIONS.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div>
              <label className={modalLabelClass}>รุ่นอุปกรณ์</label>
              <input type="text" value={deviceModel} onChange={(e) => setDeviceModel(e.target.value)} className={modalInputClass} placeholder="เช่น ASUS VivoBook 15" />
            </div>
          </div>

          <div>
            <label className={modalLabelClass}>อุปกรณ์ที่ติดมาด้วย</label>
            <div className="grid grid-cols-2 gap-1.5">
              {ACCESSORY_PRESETS.map(acc => {
                const checked = selectedAccessories.includes(acc);
                return (
                  <button
                    key={acc}
                    type="button"
                    onClick={() => toggleAccessory(acc)}
                    className={`px-2.5 py-1.5 rounded-lg border text-[11px] font-medium text-left transition cursor-pointer flex items-center gap-1.5 ${checked
                      ? 'bg-[#FF6B00]/15 border-[#FF6B00]/40 text-[#FF6B00]'
                      : 'bg-slate-50 dark:bg-white/[0.03] border-slate-200 dark:border-white/[0.08] text-slate-600 dark:text-slate-300'
                      }`}
                  >
                    {checked ? <CheckSquare className="w-3.5 h-3.5 flex-shrink-0" /> : <Square className="w-3.5 h-3.5 flex-shrink-0" />}
                    <span className="truncate">{acc}</span>
                  </button>
                );
              })}
            </div>
            <input
              type="text"
              value={accessoriesOther}
              onChange={(e) => setAccessoriesOther(e.target.value)}
              className={modalInputClass + ' mt-1.5'}
              placeholder="อุปกรณ์อื่น ๆ (ระบุ)"
            />
          </div>

          <div>
            <label className={modalLabelClass}>อาการเสียที่ได้รับแจ้ง *</label>
            <textarea
              rows={2}
              value={faultSymptom}
              onChange={(e) => setFaultSymptom(e.target.value)}
              className={modalInputClass + ' resize-none'}
              placeholder="อธิบายอาการเสียโดยละเอียด"
            />
          </div>

          <div>
            <label className={modalLabelClass}>ประเภทงานซ่อม</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setNewServiceType('in_house_repair')}
                className={`p-2.5 rounded-xl border text-left transition cursor-pointer flex items-center gap-2 ${newServiceType === 'in_house_repair'
                  ? 'bg-amber-500/15 border-amber-500/40 text-amber-600 dark:text-amber-300 ring-2 ring-[#FF6B00]/30'
                  : 'bg-slate-50 dark:bg-white/[0.02] border-slate-200 dark:border-white/[0.06] text-slate-500 dark:text-slate-400'
                  }`}
              >
                <Wrench className="w-4 h-4" />
                <span className="font-bold text-xs">ซ่อมเองหน้าร้าน</span>
              </button>
              <button
                type="button"
                onClick={() => setNewServiceType('rma_claim')}
                className={`p-2.5 rounded-xl border text-left transition cursor-pointer flex items-center gap-2 ${newServiceType === 'rma_claim'
                  ? 'bg-violet-500/15 border-violet-500/40 text-violet-600 dark:text-violet-300 ring-2 ring-violet-500/30'
                  : 'bg-slate-50 dark:bg-white/[0.02] border-slate-200 dark:border-white/[0.06] text-slate-500 dark:text-slate-400'
                  }`}
              >
                <Truck className="w-4 h-4" />
                <span className="font-bold text-xs">ส่งเคลมประกัน (RMA)</span>
              </button>
            </div>
            {newServiceType === 'rma_claim' && (
              <div className="mt-2">
                <label className={modalLabelClass}>Supplier / ศูนย์เคลม</label>
                <select value={newRmaSupplier} onChange={(e) => setNewRmaSupplier(e.target.value)} className={modalInputClass + ' cursor-pointer'}>
                  {RMA_SUPPLIER_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            )}
          </div>
        </form>
      </Modal>

      {/* ========================================================================= */}
      {/* MODAL 2: PRINTABLE REPAIR RECEIPT */}
      {/* ========================================================================= */}
      <Modal
        open={!!receiptTicket}
        onClose={() => setReceiptTicket(null)}
        ariaLabel="Repair Receipt"
        title="ใบรับซ่อม / ใบส่งเคลม"
        subtitle={receiptTicket ? receiptTicket.ticket_no : ''}
        icon={<FileText className="w-5 h-5" />}
        maxWidthClass="max-w-4xl"
        footer={
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2">
            <PrintGuideButton docType="repair_receipt" />
            <button onClick={() => setReceiptTicket(null)} className={modalSecondaryBtnClass + ' sm:w-auto py-3 px-6 text-sm'}>
              ปิด
            </button>
            <button
              onClick={() => {
                if (receiptTicket) {
                  const live = repairTickets.find(t => t.id === receiptTicket.id) || receiptTicket;
                  triggerPrintRepairReceipt(live);
                }
              }}
              className={modalPrimaryBtnClass + ' sm:w-auto flex items-center justify-center gap-1.5 py-3 px-6 text-sm'}
            >
              <Printer className="w-5 h-5" />
              <span>พิมพ์ใบรับซ่อม</span>
            </button>
          </div>
        }
      >
        {receiptTicket && (() => {
          // Always read the LIVE ticket so the receipt reflects the latest status/RMA updates
          const live = repairTickets.find(t => t.id === receiptTicket.id) || receiptTicket;
          const st = getServiceType(live);
          const lc = getLifecycle(live);
          const acc = live.included_accessories ||
            [...(live.accessories || []), live.accessories_other || ''].filter(Boolean).join(', ');
          const category = inferDeviceCategory(live.device_model);
          const otherAcc = [
            live.accessories_other || '',
            st === 'rma_claim' ? `ส่งเคลม: ${live.rma_supplier || 'ศูนย์'}` : '',
            st === 'rma_claim' && live.rma_tracking_no ? `เลขใบส่งเคลม: ${live.rma_tracking_no}` : '',
            live.replacement_sn ? `S/N ใหม่: ${live.replacement_sn}` : ''
          ].filter(Boolean).join(' • ');
          const notes = [
            live.repair_detail || '',
            live.parts_used ? `อะไหล่: ${live.parts_used}` : '',
            `สถานะ: ${REPAIR_LIFECYCLE_META[lc].label}`
          ].filter(Boolean).join(' • ');
          const dueDate = formatReceiptDate(live.finished_at) || formatReceiptDate(live.rma_returned_date);
          const staffName = live.received_by || currentUser?.name || '-';

          // Cell helpers — crisp black borders on white paper, compact for A5 landscape
          const cell = 'border border-black px-1.5 py-0.5 align-top leading-tight';
          const label = 'font-bold whitespace-nowrap';
          const value = 'font-normal';

          return (
            <div
              id="repair-receipt-print"
              className="bg-white text-black rounded-lg p-3 sm:p-4 text-[10px] leading-tight print:p-0 print:text-[10px] print:leading-tight"
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
                    <span>{staffName}</span>
                  </div>
                </div>
              </div>

              {/* ---- Structured Bordered Grid ---- */}
              <table className="w-full border-collapse border border-black text-black bg-white">
                <tbody>
                  {/* Row 1 */}
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
                  {/* Row 2 */}
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
                  {/* Row 2.5 — ผู้รับเครื่อง / ช่างผู้ซ่อม */}
                  <tr>
                    <td className={cell} colSpan={2}>
                      <span className={label}>
                        {live.received_channel === 'onsite_pickup' ? 'รับเครื่องโดย (Onsite) : ' : 'ผู้รับเครื่อง : '}
                      </span>
                      <span className={value + ' font-semibold'}>{live.received_by || staffName}</span>
                    </td>
                    <td className={cell}>
                      <span className={label}>ช่างผู้ซ่อม : </span>
                      <span className={value + ' font-semibold'}>{live.repaired_by || '-'}</span>
                    </td>
                  </tr>
                  {/* Row 3 — ที่อยู่ (full width) */}
                  <tr>
                    <td className={cell} colSpan={3}>
                      <span className={label}>ที่อยู่ : </span>
                      <span className={value}>{live.delivery_location || live.district || '-'}</span>
                    </td>
                  </tr>
                  {/* Row 4 — สินค้า + Serial No. */}
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
                  {/* Row 5 */}
                  <tr>
                    <td className={cell} colSpan={3}>
                      <span className={label}>สภาพเครื่อง : </span>
                      <span className={value}>{live.accessories && live.accessories.length > 0 ? 'มีอุปกรณ์ติดมาด้วย (ตามรายการด้านล่าง)' : 'ตัวเครื่องเปล่า / ตามที่ตรวจรับ'}</span>
                    </td>
                  </tr>
                  {/* Row 6 */}
                  <tr>
                    <td className={cell} colSpan={3}>
                      <span className={label}>อาการเสีย : </span>
                      <span className={value + ' font-semibold'}>{live.fault_symptom}</span>
                    </td>
                  </tr>
                  {/* Row 7 */}
                  <tr>
                    <td className={cell} colSpan={3}>
                      <span className={label}>อุปกรณ์ที่นำมาด้วย : </span>
                      <span className={value}>{acc || 'ตัวเครื่องเปล่า (ไม่มีอุปกรณ์ติดมา)'}</span>
                    </td>
                  </tr>
                  {/* Row 8 */}
                  <tr>
                    <td className={cell} colSpan={3}>
                      <span className={label}>อุปกรณ์อื่นๆ : </span>
                      <span className={value}>{otherAcc || '-'}</span>
                    </td>
                  </tr>
                  {/* Row 9 */}
                  <tr>
                    <td className={cell} colSpan={3}>
                      <span className={label}>บันทึกเพิ่มเติม : </span>
                      <span className={value}>{notes || '-'}</span>
                    </td>
                  </tr>
                  {/* Row 10 */}
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
          );
        })()}
      </Modal>

      {/* ========================================================================= */}
      {/* MODAL: EDIT REPAIR INTAKE INFO */}
      {/* ========================================================================= */}
      <Modal
        open={!!editTicketId}
        onClose={closeEditModal}
        ariaLabel="Edit Repair Intake"
        title="แก้ไขข้อมูลใบรับซ่อม"
        subtitle={editTarget ? `${editTarget.ticket_no} • S/N: ${editTarget.walkin_sn || 'ไม่ระบุ'}` : ''}
        icon={<Pencil className="w-5 h-5" />}
        maxWidthClass="max-w-2xl"
        footer={
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2">
            <button type="button" onClick={closeEditModal} className={modalSecondaryBtnClass + ' sm:w-auto'}>
              ยกเลิก
            </button>
            <button disabled={readOnly} type="submit" form="edit-ticket-form" className={modalPrimaryBtnClass + ' sm:w-auto flex items-center justify-center gap-1.5'}>
              <Save className="w-4 h-4" />
              <span>บันทึกการแก้ไข</span>
            </button>
          </div>
        }
      >
        <form id="edit-ticket-form" onSubmit={handleEditSubmit} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={modalLabelClass}>ชื่อลูกค้า *</label>
              <input type="text" value={editCustName} onChange={(e) => setEditCustName(e.target.value)} className={modalInputClass} placeholder="ชื่อ-นามสกุล" />
            </div>
            <div>
              <label htmlFor="repair-edit-phone" className={modalLabelClass}>เบอร์โทร</label>
              <PhoneInput id="repair-edit-phone" value={editCustPhone} onChange={(e) => setEditCustPhone(e.target.value)} className={modalInputClass} />
            </div>
            <div>
              <label className={modalLabelClass}>รุ่นอุปกรณ์</label>
              <input type="text" value={editDeviceModel} onChange={(e) => setEditDeviceModel(e.target.value)} className={modalInputClass} placeholder="เช่น ASUS VivoBook 15" />
            </div>
            <div>
              <label className={modalLabelClass}>Serial Number (S/N)</label>
              <div className="flex items-center gap-2">
                <input type="text" value={editSn} onChange={(e) => setEditSn(e.target.value)} className={modalInputClass + ' font-mono'} placeholder="สแกนหรือพิมพ์ S/N" />
                <button
                  type="button"
                  onClick={() => setScannerTarget('edit')}
                  className="px-3 py-2 rounded-xl bg-[#FF6B00]/15 hover:bg-[#FF6B00]/25 text-[#FF6B00] border border-[#FF6B00]/30 text-xs font-semibold cursor-pointer flex items-center gap-1 transition flex-shrink-0"
                  title="สแกนบาร์โค้ด S/N"
                >
                  <Camera className="w-4 h-4" />
                  <span className="hidden sm:inline">สแกน</span>
                </button>
              </div>
            </div>
          </div>

          <WarrantyLookupBanner serialNumber={editSn} lookup={lookupWarrantyBySerial} />

          <div>
            <label className={modalLabelClass}>อาการเสียที่ได้รับแจ้ง *</label>
            <textarea
              rows={2}
              value={editFaultSymptom}
              onChange={(e) => setEditFaultSymptom(e.target.value)}
              className={modalInputClass + ' resize-none'}
              placeholder="อธิบายอาการเสียโดยละเอียด"
            />
          </div>

          <div>
            <label className={modalLabelClass}>อุปกรณ์ที่ติดมากับเครื่อง</label>
            <input
              type="text"
              value={editAccessories}
              onChange={(e) => setEditAccessories(e.target.value)}
              className={modalInputClass}
              placeholder="เช่น Adapter, สายชาร์จ, กระเป๋า"
            />
          </div>
        </form>
      </Modal>

      {/* ========================================================================= */}
      {/* MODAL: DELETE CONFIRMATION */}
      {/* ========================================================================= */}
      <Modal
        open={!!deleteTicketId}
        onClose={() => setDeleteTicketId(null)}
        ariaLabel="Confirm Delete Repair Ticket"
        title="ยืนยันการลบใบรับซ่อม"
        icon={<AlertTriangle className="w-5 h-5" />}
        maxWidthClass="max-w-md"
        accentClass="border-red-500/50"
        footer={
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2">
            <button type="button" onClick={() => setDeleteTicketId(null)} className={modalSecondaryBtnClass + ' sm:w-auto'}>
              ยกเลิก
            </button>
            <button disabled={readOnly}
              type="button"
              onClick={confirmDelete}
              className="w-full sm:w-auto min-h-[44px] py-2.5 px-5 rounded-xl font-extrabold text-xs transition-all duration-150 cursor-pointer flex items-center justify-center gap-1.5 bg-gradient-to-r from-red-500 to-red-600 hover:from-red-400 hover:to-red-500 text-white shadow-lg shadow-red-500/25 border border-white/20 active:scale-[0.97]"
            >
              <Trash2 className="w-4 h-4" />
              <span>ยืนยันการลบ</span>
            </button>
          </div>
        }
      >
        <div className="flex items-start gap-3">
          <div className="p-2.5 rounded-xl bg-red-500/15 text-red-600 dark:text-red-400 border border-red-500/30 flex-shrink-0">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <p className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed">
            ยืนยันการลบใบรับซ่อม{' '}
            <strong className="font-mono font-extrabold text-red-600 dark:text-red-400">
              {deleteTarget?.ticket_no || ''}
            </strong>{' '}
            ? ข้อมูลนี้ไม่สามารถกู้คืนได้
          </p>
        </div>
      </Modal>

      {/* Barcode Scanner */}
      <BarcodeScannerModal
        open={scannerTarget !== null}
        onClose={() => setScannerTarget(null)}
        onScan={(code) => {
          if (scannerTarget === 'new') handleNewSnChange(code);
          else if (scannerTarget === 'replacement') setDraftReplacementSn(code);
          else if (scannerTarget === 'edit') setEditSn(code);
          setScannerTarget(null);
        }}
      />

      <RepairIntakeModal
        open={repairIntakeOpen}
        onClose={() => setRepairIntakeOpen(false)}
        title="รับเครื่องซ่อม (ห้องช่างซ่อม)"
        subtitle="In-House Repair Intake · สร้างใบรับซ่อมเข้าคิวช่างในร้าน"
        intakeChannel="front_desk_walkin"
        receivedChannel="front_desk"
        onToast={(msg) => {
          setToast(msg);
          setTimeout(() => setToast(''), 4000);
        }}
      />
    </div>
  );
};
