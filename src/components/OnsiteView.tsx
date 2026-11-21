import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useApp } from '../context/AppContext';
import {
  MapPin, ShieldCheck, CheckCircle, Truck, Package,
  RotateCcw, Wrench, Printer,
  CheckSquare, Square, X, Smartphone, UserCheck, Layers,
  ClipboardList, ArrowRight, Phone, Calendar, ScanLine
} from 'lucide-react';
import { ROUTE_DEFINITIONS, RouteCode, RepairTicket, Item, getRouteByDistrict } from '../types';
import { ListControls, useListControls } from './ListControls';
import { ActivityTimeline, LatestUpdateBadge } from './ActivityTimeline';
import { BarcodeScannerModal } from './BarcodeScannerModal';
import {
  Modal, modalInputClass, modalLabelClass,
  modalPrimaryBtnClass, modalSecondaryBtnClass
} from './ui/Modal';
import { lookupPurchaseBySn } from '../utils/snLookup';

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
    closeRepairTicket, completeOnsiteJobHandoff, currentUser, users,
    acceptOnsiteJob, completeRepairReturnOnsite, triggerPrintRepairReceipt
  } = useApp();

  // If user has assigned route, default to it, otherwise 'all'
  const defaultRoute = (currentUser?.assigned_route && currentUser.assigned_route !== 'all')
    ? currentUser.assigned_route
    : 'all';

  const [selectedRouteFilter, setSelectedRouteFilter] = useState<'all' | RouteCode>(defaultRoute);
  const [selectedTechNameFilter, setSelectedTechNameFilter] = useState<string>(currentUser?.role === 'onsite' ? currentUser.name : 'all');
  const [selectedCategory, setSelectedCategory] = useState<'all' | 'new_goods' | 'repair_return' | 'pickup'>('all');
  const [deliveryNotes, setDeliveryNotes] = useState<Record<string, string>>({});
  const [toast, setToast] = useState('');

  // Modal State for Onsite Pickup / Service Sheet Form
  const [isPickupModalOpen, setIsPickupModalOpen] = useState(false);
  // งาน Onsite ต้นทางที่จะถูกปิดอัตโนมัติเมื่อส่งต่อเข้าคิวซ่อม (สำหรับ pickup task เท่านั้น)
  const [originJob, setOriginJob] = useState<{ kind: 'item' | 'ticket'; id: string } | null>(null);
  // Service Sheet Modal Mode
  const [modalMode, setModalMode] = useState<'pickup_task' | 'service_sheet'>('pickup_task');
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
      if (res.customerPhone) setCustPhone(res.customerPhone);
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

  const onsiteTechUsers = users.filter(u => u.role === 'onsite');

  // Warranty Auto-Check by S/N
  const matchedStockItem = sn.trim()
    ? items.find(i => i.serial_number && i.serial_number.toLowerCase() === sn.trim().toLowerCase())
    : null;

  let warrantyStatusText = '';
  let warrantyBadgeClass = '';
  if (matchedStockItem && matchedStockItem.void_date) {
    const vDate = new Date(matchedStockItem.void_date);
    const expDate = new Date(vDate);
    expDate.setFullYear(expDate.getFullYear() + 1);
    const isExpired = new Date() > expDate;
    if (isExpired) {
      warrantyStatusText = `หมดประกันแล้ว (ติดวอยเมื่อ: ${matchedStockItem.void_date})`;
      warrantyBadgeClass = 'bg-rose-500/15 text-rose-400 border-rose-500/30';
    } else {
      warrantyStatusText = `อยู่ในประกัน 1 ปี (ติดวอยเมื่อ: ${matchedStockItem.void_date})`;
      warrantyBadgeClass = 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30';
    }
  } else if (sn.trim().length >= 3) {
    warrantyStatusText = 'ไม่พบประวัติวอยในระบบ (นอกประกันหรือเครื่องทั่วไป)';
    warrantyBadgeClass = 'bg-white/[0.05] text-slate-400 border-white/[0.1]';
  }


  // Helper filter by Tech Name & Route
  const matchesTechFilter = (techs: string[] | undefined, singleTech: string | null | undefined) => {
    if (selectedTechNameFilter === 'all') return true;
    if (techs && techs.includes(selectedTechNameFilter)) return true;
    if (singleTech && singleTech === selectedTechNameFilter) return true;
    return false;
  };

  // 1. New goods assigned to onsite
  const assignedNewGoods = items.filter(i => {
    if (i.status !== 'assigned_onsite') return false;
    if (!matchesTechFilter(i.assigned_techs, i.assigned_onsite_tech)) return false;
    const order = orders.find(o => o.id === i.order_id);
    if (selectedRouteFilter !== 'all' && order?.route_code !== selectedRouteFilter) {
      return false;
    }
    return true;
  });

  // 2. Repaired items assigned to onsite for return delivery
  //    - งานส่งคืนเครื่องซ่อม (is_repair_return) ที่หน้าร้านมอบหมายให้ช่าง Onsite ไปส่งคืนลูกค้า
  //    - สถานะ dispatched_onsite / on_delivery หรือ legacy 'repaired' ที่มีช่าง Onsite ถูกมอบหมาย
  const assignedRepairedReturns = repairTickets.filter(t => {
    const isReturnJob = t.is_repair_return === true;
    const isReturnStatus = t.status === 'dispatched_onsite' || t.status === 'on_delivery';
    const isLegacyRepaired = t.status === 'repaired';
    if (!isReturnJob && !isReturnStatus && !isLegacyRepaired) return false;
    if (t.status === 'returned_closed' || t.repair_status === 'completed') return false;
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

  const totalAssignedCount = assignedNewGoods.length + assignedRepairedReturns.length + assignedPickups.length;

  // Sort + pagination สำหรับการ์ดงาน Onsite (จัดกลุ่มแล้ว)
  const newGoodsList = useListControls(groupItems(assignedNewGoods), {
    getDate: (g) => g.items[0]?.created_at,
    getValue: (g) => g.items.length,
    initialSort: 'newest',
  });

  const handleAcceptGroup = (group: ItemGroup) => {
    const techName = currentUser?.name || 'ช่าง Onsite';
    group.items.forEach(it => {
      if (!it.assigned_prep_tech) acceptOnsiteJob(it.id, techName);
    });
    setToast(`ช่าง "${techName}" รับงานทั้งชุด ${group.items.length} เครื่องเรียบร้อยแล้ว`);
    setTimeout(() => setToast(''), 3500);
  };

  const handleDeliveryConfirmGroup = (group: ItemGroup) => {
    group.items.forEach(it => {
      const note = deliveryNotes[it.id] || 'ติดตั้งและส่งมอบถึงมือลูกค้าเรียบร้อย';
      confirmOnsiteDelivery(it.id, note);
    });
    setToast(`ส่งมอบสินค้าใหม่ทั้งชุด ${group.items.length} เครื่องสำเร็จ และปิดงานเรียบร้อยแล้ว`);
    setTimeout(() => setToast(''), 3500);
  };

  const handleReturnConfirm = (ticketId: string, ticketNo: string) => {
    completeRepairReturnOnsite(ticketId);
    setToast(`ส่งมอบเครื่องซ่อม ${ticketNo} คืนลูกค้าเสร็จสิ้น — ปิดงานเรียบร้อยแล้ว`);
    setTimeout(() => setToast(''), 3500);
  };

  // Open Pickup Form pre-filled from an existing job (เฉพาะงานที่หน้าร้านจ่ายมาเป็นงานรับเครื่อง / pickup task)
  const handleOpenPickupForJob = (ticket: RepairTicket) => {
    setModalMode('pickup_task');
    setSendToRepairShop(true);
    setOriginJob({ kind: 'ticket', id: ticket.id });
    setCustName(ticket.customer_name);
    setCustPhone(ticket.customer_phone || '');
    setDistrict(ticket.district || 'เมืองสุราษฎร์ธานี');
    setDeliveryLocation(ticket.delivery_location || '');
    setProvinceCustom(ticket.province_custom || '');
    setDeviceModel(ticket.device_model || '');
    setSn(ticket.walkin_sn && !ticket.walkin_sn.startsWith('SN-MANUAL') && !ticket.walkin_sn.startsWith('SN-PROJECT') ? ticket.walkin_sn : '');
    setSelectedAccessories(ticket.accessories && ticket.accessories.length > 0 ? ticket.accessories : ['Adapter / หม้อแปลง']);
    setAccessoriesOther(ticket.accessories_other || '');
    setFaultSymptom(ticket.fault_symptom || '');
    setIsPickupModalOpen(true);
  };

  // เปิดฟอร์มออกใบ Service Sheet (รับฝาก/งานเพิ่มหน้างาน) — ทั้งเปิดอิสระและเปิดจากในงานส่งของ
  const handleOpenNewServiceSheet = (defaultData?: { customer_name?: string; customer_phone?: string; district?: string; delivery_location?: string }) => {
    setModalMode('service_sheet');
    setSendToRepairShop(true);
    setOriginJob(null); // ไม่ผูก origin เพื่อไม่ให้ปิดงานหลัก
    setCustName(defaultData?.customer_name || '');
    setCustPhone(defaultData?.customer_phone || '');
    setDistrict(
      defaultData?.district ||
      (currentUser?.assigned_route && currentUser.assigned_route !== 'all'
        ? (DISTRICT_OPTIONS.find(o => getRouteByDistrict(o.district) === currentUser.assigned_route)?.district || 'เมืองสุราษฎร์ธานี')
        : 'เมืองสุราษฎร์ธานี')
    );
    setDeliveryLocation(defaultData?.delivery_location || '');
    setProvinceCustom('');
    setDeviceModel('');
    setSn('');
    setAutoFilledSn(null);
    setSelectedAccessories(['Adapter / หม้อแปลง']);
    setAccessoriesOther('');
    setFaultSymptom('');
    setIsPickupModalOpen(true);
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
      send_to_repair_shop: sendToRepairShop
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
    <div className="space-y-6">
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 p-4 rounded-2xl liquid-glass border border-[#FF6B00] text-white text-xs flex items-center gap-2 shadow-2xl">
          <CheckCircle className="w-4 h-4 text-[#FF6B00]" />
          <span>{toast}</span>
        </div>
      )}

      {/* Main Container */}
      <div className="liquid-glass rounded-3xl p-6 sm:p-7 shadow-2xl border border-white/[0.08]">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6 pb-4 border-b border-white/[0.08]">
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <div className="p-2 rounded-xl bg-purple-500/15 text-purple-400 border border-purple-500/30">
                <Truck className="w-5 h-5" />
              </div>
              <span>คิวงานทีมรถ Onsite & บันทึกรับเครื่องซ่อมกลับร้าน</span>
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              {currentUser?.name ? `เข้าสู่ระบบในชื่อ: ${currentUser.name}` : ''}
              {currentUser?.assigned_route && currentUser.assigned_route !== 'all'
                ? ` | วิ่งประจำ: ${ROUTE_DEFINITIONS[currentUser.assigned_route].name}`
                : ' | วิ่งได้ทุกสายรถ'}
            </p>
          </div>

          {/* ช่าง Onsite ออกใบรับซ่อม / Service Sheet เองได้ (ส่งเข้าห้องช่าง) */}
          <button
            onClick={() => handleOpenNewServiceSheet()}
            className="w-full lg:w-auto px-5 py-3 min-h-[44px] bg-gradient-to-r from-[#FF6B00] to-[#E65A00] hover:brightness-110 active:scale-[0.97] text-black font-extrabold rounded-xl text-xs transition-all duration-150 cursor-pointer flex items-center justify-center gap-2 shadow-lg shadow-[#FF6B00]/25 border border-white/20"
          >
            <ClipboardList className="w-4 h-4" />
            <span>ออกใบรับซ่อม / Service Sheet (ส่งเข้าห้องช่าง)</span>
          </button>
        </div>

        {/* Dual Filters Bar: By Technician Name + By Route */}
        <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.06] mb-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          {/* Tech Name Filter */}
          <div className="flex items-center gap-2 text-xs flex-wrap">
            <span className="text-slate-400 font-medium">กรองตามชื่อช่าง:</span>
            <select
              value={selectedTechNameFilter}
              onChange={(e) => setSelectedTechNameFilter(e.target.value)}
              className="liquid-glass-input rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none"
            >
              <option value="all" className="bg-[#12141A]">-- แสดงงานช่างทุกคน --</option>
              {onsiteTechUsers.map(u => (
                <option key={u.id} value={u.name} className="bg-[#12141A]">
                  {u.name} {currentUser?.name === u.name ? '(ตัวฉัน)' : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Route Filter */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
            <span className="text-slate-400 font-medium whitespace-nowrap mr-1">สายรถ:</span>
            <button
              onClick={() => setSelectedRouteFilter('all')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all duration-150 active:scale-[0.97] cursor-pointer whitespace-nowrap ${selectedRouteFilter === 'all'
                ? 'bg-white/20 text-white border border-white/40 shadow-sm font-bold'
                : 'bg-white/[0.04] text-slate-400 hover:text-white border border-white/[0.06]'
                }`}
            >
              ทั้งหมด
            </button>
            {(Object.keys(ROUTE_DEFINITIONS) as RouteCode[]).map((rCode) => {
              const r = ROUTE_DEFINITIONS[rCode];
              return (
                <button
                  key={rCode}
                  onClick={() => setSelectedRouteFilter(rCode)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all duration-150 active:scale-[0.97] cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${selectedRouteFilter === rCode
                    ? `${r.badgeBg} ${r.badgeText} ${r.badgeBorder} border shadow-md font-bold`
                    : 'bg-white/[0.04] text-slate-400 hover:text-slate-200 border border-white/[0.06]'
                    }`}
                >
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: r.color }}></span>
                  <span>{r.shortName}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Category Pills Filter */}
        <div className="flex items-center gap-2 pb-4 overflow-x-auto">
          <button
            onClick={() => setSelectedCategory('all')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-xl transition-all duration-150 active:scale-[0.97] cursor-pointer whitespace-nowrap ${selectedCategory === 'all'
              ? 'bg-white/20 text-white border border-white/40 font-bold'
              : 'bg-white/[0.03] text-slate-400 hover:text-white border border-white/[0.05]'
              }`}
          >
            รวมทุกประเภท ({totalAssignedCount})
          </button>
          <button
            onClick={() => setSelectedCategory('new_goods')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-xl transition-all duration-150 active:scale-[0.97] cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${selectedCategory === 'new_goods'
              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 font-bold'
              : 'bg-white/[0.03] text-slate-400 hover:text-emerald-300 border border-white/[0.05]'
              }`}
          >
            <Package className="w-3.5 h-3.5" />
            <span>[ส่งของใหม่ - วอยติดแล้ว] ({assignedNewGoods.length})</span>
          </button>
          <button
            onClick={() => setSelectedCategory('repair_return')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-xl transition-all duration-150 active:scale-[0.97] cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${selectedCategory === 'repair_return'
              ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/40 font-bold'
              : 'bg-white/[0.03] text-slate-400 hover:text-purple-300 border border-white/[0.05]'
              }`}
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>[ส่งคืนเครื่องซ่อมให้ลูกค้า] ({assignedRepairedReturns.length})</span>
          </button>
          <button
            onClick={() => setSelectedCategory('pickup')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-xl transition-all duration-150 active:scale-[0.97] cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${selectedCategory === 'pickup'
              ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40 font-bold'
              : 'bg-white/[0.03] text-slate-400 hover:text-amber-300 border border-white/[0.05]'
              }`}
          >
            <Wrench className="w-3.5 h-3.5" />
            <span>[ออกซ่อม/รับเครื่องกลับร้าน] ({assignedPickups.length})</span>
          </button>
        </div>

        {totalAssignedCount === 0 ? (
          <div className="text-center py-12 text-slate-500 border border-dashed border-white/[0.1] rounded-2xl">
            <Truck className="w-10 h-10 mx-auto mb-2 text-purple-400 opacity-60" />
            <p className="text-sm font-medium text-slate-200">ไม่มีคิวงานที่ตรงกับตัวกรองนี้</p>
            <p className="text-xs text-slate-500 mt-0.5">โปรดลองเลือกสายรถอื่น หรือเลือกดูงานช่างทุกคน</p>
          </div>
        ) : (
          <div className="space-y-4">
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
              unit="งาน"
            />
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* 1. CARDS: NEW GOODS (stacked by order + model) */}
              {(selectedCategory === 'all' || selectedCategory === 'new_goods') &&
                newGoodsList.pageItems.map((group) => {
                  const order = orders.find(o => o.id === group.order_id);
                  const rMeta = order?.route_code ? ROUTE_DEFINITIONS[order.route_code] : null;
                  const firstItem = group.items[0];
                  const teamTechs = firstItem.assigned_techs && firstItem.assigned_techs.length > 0
                    ? firstItem.assigned_techs
                    : (firstItem.assigned_onsite_tech ? [firstItem.assigned_onsite_tech] : []);
                  const isAccepted = group.items.every(it => !!it.assigned_prep_tech);
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
                assignedRepairedReturns.map((ticket) => {
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

                        {rMeta && (
                          <div className={`px-2 py-0.5 rounded-md text-[10px] font-bold border inline-flex items-center gap-1 ${rMeta.badgeBg} ${rMeta.badgeBorder} ${rMeta.badgeText}`}>
                            <span>{rMeta.name}</span>
                            <span>• {ticket.district || ''}</span>
                          </div>
                        )}

                        <h4 className="text-base font-bold text-white truncate data-key">{ticket.device_model || 'ไม่ระบุรุ่น'}</h4>
                        <p className="text-xs text-slate-400 font-mono data-meta truncate">S/N: {ticket.walkin_sn || '-'}</p>
                        <p className="text-xs text-slate-300 font-medium data-meta truncate">ลูกค้า: <strong className="text-white font-bold">{ticket.customer_name}</strong></p>
                        {ticket.customer_phone && (
                          <p className="text-xs text-slate-400 flex items-center gap-1 data-meta">
                            <Phone className="w-3.5 h-3.5 text-cyan-400 flex-shrink-0" />
                            <span>{ticket.customer_phone}</span>
                          </p>
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
                assignedPickups.map((ticket) => {
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

                        {rMeta && (
                          <div className={`px-2 py-0.5 rounded-md text-[10px] font-bold border inline-flex items-center gap-1 ${rMeta.badgeBg} ${rMeta.badgeBorder} ${rMeta.badgeText}`}>
                            <span>{rMeta.name}</span>
                            <span>• {ticket.district || ''}</span>
                          </div>
                        )}

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

        const closeModal = () => setActiveJob(null);

        // ---------- NEW GOODS JOB ----------
        if (jobGroup) {
          const group = jobGroup;
          const order = orders.find(o => o.id === group.order_id);
          const rMeta = order?.route_code ? ROUTE_DEFINITIONS[order.route_code] : null;
          const firstItem = group.items[0];
          const teamTechs = firstItem.assigned_techs && firstItem.assigned_techs.length > 0
            ? firstItem.assigned_techs
            : (firstItem.assigned_onsite_tech ? [firstItem.assigned_onsite_tech] : []);
          const isAccepted = group.items.every(it => !!it.assigned_prep_tech);
          const deliveryLabel = DELIVERY_MODE_LABEL[group.delivery_mode || 'install'] || 'ส่งพร้อมติดตั้ง';

          return (
            <Modal
              open
              onClose={closeModal}
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
                      onClick={() => { handleDeliveryConfirmGroup(group); closeModal(); }}
                      className="w-full px-5 py-3 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 active:scale-95 text-black font-extrabold rounded-xl text-sm transition cursor-pointer flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/25 border border-white/20"
                    >
                      <CheckCircle className="w-4 h-4" />
                      <span>ยืนยันส่งมอบ/ติดตั้งเสร็จสิ้น ({group.items.length} เครื่อง)</span>
                    </button>
                  )}
                  <button
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
                {/* Step badges */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  <StepBadge step={1} label="รอกดรับงาน" active={!isAccepted} done={isAccepted} />
                  <StepBadge step={2} label="กำลังเตรียม/ติดโลโก้" active={isAccepted} />
                  <StepBadge step={3} label="พร้อมส่ง/ติดวอย" active={false} />
                </div>

                {/* Route & delivery mode */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  {rMeta && (
                    <div className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border inline-flex items-center gap-1 ${rMeta.badgeBg} ${rMeta.badgeBorder} ${rMeta.badgeText}`}>
                      <span>{rMeta.shortName}</span>
                      <span>• {order?.district || ''}</span>
                    </div>
                  )}
                  <span className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-blue-500/15 text-blue-600 dark:text-blue-300 border border-blue-500/30">
                    {deliveryLabel}
                  </span>
                  {group.items.length > 1 && (
                    <span className="px-2.5 py-1 rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 border border-emerald-500/40 text-[11px] font-extrabold flex items-center gap-1">
                      <Layers className="w-3 h-3" />
                      จำนวน {group.items.length} เครื่อง
                    </span>
                  )}
                </div>

                {/* Customer / location */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.08]">
                    <p className="text-slate-500 dark:text-slate-400 font-medium mb-0.5">ลูกค้า</p>
                    <p className="font-bold text-slate-900 dark:text-white">{order ? order.customer_name : '-'}</p>
                    {order?.customer_phone && (
                      <p className="text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-1">
                        <Phone className="w-3 h-3" /> {order.customer_phone}
                      </p>
                    )}
                  </div>
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.08]">
                    <p className="text-slate-500 dark:text-slate-400 font-medium mb-0.5">สถานที่ส่งมอบ</p>
                    <p className="font-semibold text-slate-900 dark:text-white flex items-start gap-1">
                      <MapPin className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0 mt-0.5" />
                      <span>{order ? order.delivery_location : '-'}</span>
                    </p>
                  </div>
                </div>

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
                    <span>ผู้รับงาน: {firstItem.assigned_prep_tech} ({new Date(firstItem.prep_accepted_at || Date.now()).toLocaleTimeString('th-TH')})</span>
                  </div>
                )}

                {/* Per-item delivery notes */}
                <div className="space-y-2">
                  <p className={modalLabelClass}>รายการเครื่อง & บันทึกการส่งมอบ</p>
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
                        placeholder="บันทึกการส่งมอบ / เซ็นรับ"
                        value={deliveryNotes[item.id] || ''}
                        onChange={(e) => setDeliveryNotes({ ...deliveryNotes, [item.id]: e.target.value })}
                        className={modalInputClass}
                      />
                    </div>
                  ))}
                </div>

                {/* Activity */}
                <div className="pt-3 border-t border-slate-200 dark:border-white/[0.08] space-y-2">
                  <LatestUpdateBadge
                    logs={firstItem.activity_logs}
                    fallbackTimestamp={firstItem.delivered_at || firstItem.dispatched_at || firstItem.assigned_at || firstItem.updated_at || firstItem.created_at}
                    fallbackActor={firstItem.assigned_prep_tech}
                  />
                  <ActivityTimeline logs={firstItem.activity_logs} />
                </div>
              </div>
            </Modal>
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
              {/* Route badge */}
              {rMeta && (
                <div className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border inline-flex items-center gap-1 ${rMeta.badgeBg} ${rMeta.badgeBorder} ${rMeta.badgeText}`}>
                  <span>{rMeta.name}</span>
                  <span>• {ticket.district || ''}</span>
                </div>
              )}

              {/* Customer / device grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.08]">
                  <p className="text-slate-500 dark:text-slate-400 font-medium mb-0.5">ลูกค้า</p>
                  <p className="font-bold text-slate-900 dark:text-white">{ticket.customer_name}</p>
                  {ticket.customer_phone && (
                    <p className="text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-1">
                      <Phone className="w-3 h-3" /> {ticket.customer_phone}
                    </p>
                  )}
                </div>
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.08]">
                  <p className="text-slate-500 dark:text-slate-400 font-medium mb-0.5">S/N / รุ่น</p>
                  <p className="font-mono font-extrabold text-[#FF6B00]">{ticket.walkin_sn}</p>
                  {ticket.device_model && (
                    <p className="text-slate-500 dark:text-slate-400 mt-1">{ticket.device_model}</p>
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
        <div className="fixed inset-0 z-[10000] flex items-end sm:items-center justify-center sm:p-4 bg-black/60 backdrop-blur-sm overflow-y-auto overscroll-contain animate-fade-in">
          <div className="w-full sm:w-[95vw] max-w-lg max-h-[92dvh] sm:max-h-[90vh] overflow-y-auto overscroll-contain bg-white dark:bg-slate-900 text-slate-900 dark:text-white rounded-t-3xl sm:rounded-3xl p-4 sm:p-7 pb-[max(1rem,env(safe-area-inset-bottom))] border border-slate-200 dark:border-[#FF6B00]/40 shadow-2xl relative animate-modal-pop">
            <div className="sm:hidden flex justify-center pt-1 pb-3">
              <span className="h-1.5 w-10 rounded-full bg-slate-300 dark:bg-white/20" />
            </div>
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
              {/* S/N Smart Search & Auto-Fill */}
              <div className="rounded-2xl p-3.5 border border-slate-200 dark:border-white/[0.1] bg-slate-50 dark:bg-white/[0.03] space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <label className="block text-slate-700 dark:text-slate-300 font-semibold">
                    ค้นหาด้วย Serial Number (S/N) เพื่อดึงข้อมูลอัตโนมัติ
                  </label>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">
                    หรือกรอกข้อมูลเองด้านล่าง
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="สแกนหรือพิมพ์ S/N เช่น BC-2026-002 (ถ้าเคยซื้อกับร้านระบบจะกรอกให้เอง)"
                    value={sn}
                    onChange={(e) => handleSnChange(e.target.value)}
                    className="w-full rounded-xl px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-300 dark:border-slate-700 placeholder-slate-400 font-mono focus:outline-none focus:border-blue-500"
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
                  <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">เบอร์โทรติดต่อ</label>
                  <input
                    type="text"
                    placeholder="08x-xxx-xxxx"
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
          className="onsite-receipt-portal print:hidden fixed inset-0 z-[9999] flex items-end sm:items-center justify-center sm:p-4 bg-black/60 backdrop-blur-sm overflow-y-auto overscroll-contain animate-fade-in"
          role="dialog"
          aria-modal="true"
          aria-label="ใบรับซ่อมสินค้า"
        >
          <div className="onsite-receipt-panel w-full sm:w-[95vw] max-w-4xl max-h-[92dvh] sm:max-h-[90vh] overflow-y-auto overscroll-contain bg-white dark:bg-slate-900 text-slate-900 dark:text-white rounded-t-3xl sm:rounded-3xl p-4 sm:p-6 pb-[max(1rem,env(safe-area-inset-bottom))] border border-emerald-300 dark:border-emerald-500/40 shadow-2xl relative text-xs animate-modal-pop">
            <div className="sm:hidden flex justify-center pt-1 pb-3 no-print">
              <span className="h-1.5 w-10 rounded-full bg-slate-300 dark:bg-white/20" />
            </div>
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
              );
            })()}

            {/* Modal Actions */}
            <div className="flex items-center gap-2 pt-4 border-t border-white/[0.08] no-print">
              <button
                onClick={handlePrintReceipt}
                className="flex-1 py-2.5 bg-[#FF6B00] hover:bg-[#E65A00] text-black font-extrabold rounded-xl text-xs transition cursor-pointer flex items-center justify-center gap-1.5 shadow-lg shadow-[#FF6B00]/25"
              >
                <Printer className="w-4 h-4" />
                <span>พิมพ์ใบรับซ่อม</span>
              </button>
              <button
                onClick={() => setReceiptTicket(null)}
                className="px-4 py-2.5 rounded-xl liquid-glass-card text-slate-300 hover:text-white text-xs font-semibold cursor-pointer"
              >
                เสร็จสิ้น
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
    </div>
  );
};
