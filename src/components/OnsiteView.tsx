import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import {
  MapPin, ShieldCheck, CheckCircle, Truck, Package,
  RotateCcw, Wrench, Printer,
  CheckSquare, Square, X, Smartphone, UserCheck, Layers, Lock,
  ChevronDown, ChevronUp
} from 'lucide-react';
import { ROUTE_DEFINITIONS, RouteCode, RepairTicket, Item, getRouteByDistrict } from '../types';
import { ListControls, useListControls } from './ListControls';
import { ActivityTimeline, LatestUpdateBadge } from './ActivityTimeline';

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
    completeRepairTicket, closeRepairTicket, createRepairTicket, currentUser, users,
    acceptOnsiteJob
  } = useApp();

  // If user has assigned route, default to it, otherwise 'all'
  const defaultRoute = (currentUser?.assigned_route && currentUser.assigned_route !== 'all')
    ? currentUser.assigned_route
    : 'all';

  const [selectedRouteFilter, setSelectedRouteFilter] = useState<'all' | RouteCode>(defaultRoute);
  const [selectedTechNameFilter, setSelectedTechNameFilter] = useState<string>(currentUser?.role === 'onsite' ? currentUser.name : 'all');
  const [selectedCategory, setSelectedCategory] = useState<'all' | 'new_goods' | 'repair_return' | 'pickup'>('all');
  const [deliveryNotes, setDeliveryNotes] = useState<Record<string, string>>({});
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [toast, setToast] = useState('');

  // Modal State for Onsite Pickup Form
  const [isPickupModalOpen, setIsPickupModalOpen] = useState(false);
  const [originTicketId, setOriginTicketId] = useState<string | null>(null);

  // Form Fields
  const [custName, setCustName] = useState('');
  const [custPhone, setCustPhone] = useState('');
  const [district, setDistrict] = useState('เมืองสุราษฎร์ธานี');
  const [deliveryLocation, setDeliveryLocation] = useState('');
  const [provinceCustom, setProvinceCustom] = useState('');
  const [deviceModel, setDeviceModel] = useState('');
  const [sn, setSn] = useState('');
  const [selectedAccessories, setSelectedAccessories] = useState<string[]>(['Adapter / หม้อแปลง']);
  const [accessoriesOther, setAccessoriesOther] = useState('');
  const [faultSymptom, setFaultSymptom] = useState('');

  // Receipt Modal State
  const [receiptTicket, setReceiptTicket] = useState<RepairTicket | null>(null);

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
  const assignedRepairedReturns = repairTickets.filter(t => {
    if (t.status !== 'repaired' || (!t.assigned_onsite_tech && (!t.assigned_techs || t.assigned_techs.length === 0))) return false;
    if (!matchesTechFilter(t.assigned_techs, t.assigned_onsite_tech)) return false;
    if (selectedRouteFilter !== 'all' && t.route_code !== selectedRouteFilter) {
      return false;
    }
    return true;
  });

  // 3. Onsite pickup tickets assigned
  const assignedPickups = repairTickets.filter(t => {
    if (t.intake_channel !== 'onsite_pickup') return false;
    if (t.status !== 'open' && t.status !== 'in_progress') return false;
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

  const toggleGroup = (key: string) => {
    setExpandedGroups(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleAcceptGroup = (group: ItemGroup) => {
    const techName = currentUser?.name || 'ช่าง Onsite';
    group.items.forEach(it => {
      if (!it.assigned_prep_tech) acceptOnsiteJob(it.id, techName);
    });
    setExpandedGroups(prev => ({ ...prev, [group.key]: true }));
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
    closeRepairTicket(ticketId);
    setToast(`ส่งคืนเครื่องงานซ่อม ${ticketNo} ถึงมือลูกค้าและปิดงานเรียบร้อยแล้ว`);
    setTimeout(() => setToast(''), 3500);
  };

  // Open Pickup Form pre-filled from an existing job
  const handleOpenPickupForJob = (ticket: RepairTicket) => {
    setOriginTicketId(ticket.id);
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

  // Open Pickup Form for a brand new customer machine
  const handleOpenNewPickup = () => {
    setOriginTicketId(null);
    setCustName('');
    setCustPhone('');
    setDistrict('เมืองสุราษฎร์ธานี');
    setDeliveryLocation('');
    setProvinceCustom('');
    setDeviceModel('');
    setSn('');
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

  // Submit Pickup Form
  const handleSubmitPickupForm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!custName.trim() || !faultSymptom.trim()) {
      alert('กรุณากรอกชื่อลูกค้าและอาการเสียให้ครบถ้วน');
      return;
    }

    const calculatedRoute = getRouteByDistrict(district);
    const techName = currentUser?.name || 'ช่าง Onsite';
    const thaiYear = new Date().getFullYear() + 543;
    const finalSn = sn.trim() || `SN-ONSITE-${Math.floor(1000 + Math.random() * 9000)}`;

    if (originTicketId) {
      // Update existing ticket into in_progress and append pickup details
      const detailNote = `ช่าง Onsite (${techName}) รับเครื่องกลับเข้าห้องซ่อมแล้ว | อุปกรณ์: ${selectedAccessories.join(', ') || 'ไม่มี'}${accessoriesOther ? ` (${accessoriesOther})` : ''}`;
      completeRepairTicket(originTicketId, 'in_progress', 'รับเครื่องกลับเข้าห้องซ่อมแล้ว', detailNote, '-');

      const updatedTicket = repairTickets.find(t => t.id === originTicketId);
      if (updatedTicket) {
        setReceiptTicket({
          ...updatedTicket,
          customer_name: custName,
          customer_phone: custPhone,
          walkin_sn: finalSn,
          device_model: deviceModel,
          accessories: selectedAccessories,
          accessories_other: accessoriesOther,
          picked_up_by: techName,
          fault_symptom: faultSymptom,
          district: district,
          delivery_location: deliveryLocation
        });
      }
      setToast(`บันทึกการรับเครื่อง Job ${updatedTicket?.ticket_no || ''} เข้าห้องซ่อมเรียบร้อย`);
    } else {
      // Create new repair ticket
      const newTicketNo = `REP-${thaiYear}-${Math.floor(100 + Math.random() * 900)}`;
      createRepairTicket({
        item_id: null,
        walkin_sn: finalSn,
        customer_name: custName.trim(),
        customer_phone: custPhone.trim(),
        intake_channel: 'onsite_pickup',
        device_model: deviceModel.trim(),
        accessories: selectedAccessories,
        accessories_other: accessoriesOther.trim(),
        picked_up_by: techName,
        fault_symptom: faultSymptom.trim(),
        repair_detail: `รับเครื่องจากหน้างานโดย ${techName} ส่งเข้าห้องช่างซ่อม`,
        parts_used: null,
        repair_outcome: null,
        district: district,
        route_code: calculatedRoute,
        delivery_location: deliveryLocation.trim(),
        province_custom: calculatedRoute === 'route_6' ? provinceCustom : undefined,
        job_category: 'repair_pickup',
        assigned_techs: [techName],
        assigned_onsite_tech: techName,
        finished_at: null
      });

      setReceiptTicket({
        id: 'rep-new',
        item_id: null,
        ticket_no: newTicketNo,
        walkin_sn: finalSn,
        customer_name: custName.trim(),
        customer_phone: custPhone.trim(),
        intake_channel: 'onsite_pickup',
        device_model: deviceModel.trim(),
        accessories: selectedAccessories,
        accessories_other: accessoriesOther.trim(),
        picked_up_by: techName,
        fault_symptom: faultSymptom.trim(),
        repair_detail: null,
        parts_used: null,
        status: 'open',
        received_at: new Date().toISOString(),
        finished_at: null,
        created_at: new Date().toISOString(),
        district: district,
        route_code: calculatedRoute,
        delivery_location: deliveryLocation.trim(),
        assigned_techs: [techName]
      });

      setToast(`สร้างใบรับซ่อม ${newTicketNo} และส่งเข้าห้องซ่อมเรียบร้อย`);
    }

    setIsPickupModalOpen(false);
    setTimeout(() => setToast(''), 4000);
  };

  const handlePrintReceipt = () => {
    window.print();
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

          {/* Quick Action: New Onsite Pickup Button */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={handleOpenNewPickup}
              className="px-4 py-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 text-black font-extrabold rounded-2xl text-xs transition cursor-pointer flex items-center gap-2 shadow-lg shadow-amber-500/25 border border-white/20 whitespace-nowrap active:scale-95"
            >
              <Smartphone className="w-4 h-4" />
              <span>บันทึกรับเครื่องซ่อมใหม่หน้างาน</span>
            </button>
          </div>
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
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer whitespace-nowrap ${selectedRouteFilter === 'all'
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
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${selectedRouteFilter === rCode
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
            className={`px-3 py-1.5 text-xs font-semibold rounded-xl transition cursor-pointer whitespace-nowrap ${selectedCategory === 'all'
              ? 'bg-white/20 text-white border border-white/40 font-bold'
              : 'bg-white/[0.03] text-slate-400 hover:text-white border border-white/[0.05]'
              }`}
          >
            รวมทุกประเภท ({totalAssignedCount})
          </button>
          <button
            onClick={() => setSelectedCategory('new_goods')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-xl transition cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${selectedCategory === 'new_goods'
              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 font-bold'
              : 'bg-white/[0.03] text-slate-400 hover:text-emerald-300 border border-white/[0.05]'
              }`}
          >
            <Package className="w-3.5 h-3.5" />
            <span>[ส่งของใหม่ - วอยติดแล้ว] ({assignedNewGoods.length})</span>
          </button>
          <button
            onClick={() => setSelectedCategory('repair_return')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-xl transition cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${selectedCategory === 'repair_return'
              ? 'bg-purple-500/20 text-purple-400 border border-purple-500/40 font-bold'
              : 'bg-white/[0.03] text-slate-400 hover:text-purple-300 border border-white/[0.05]'
              }`}
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>[ส่งคืนงานซ่อม] ({assignedRepairedReturns.length})</span>
          </button>
          <button
            onClick={() => setSelectedCategory('pickup')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-xl transition cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${selectedCategory === 'pickup'
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
                  const isExpanded = !!expandedGroups[group.key];
                  const deliveryLabel = DELIVERY_MODE_LABEL[group.delivery_mode || 'install'] || 'ส่งพร้อมติดตั้ง';

                  return (
                    <div
                      key={'new-' + group.key}
                      className={`p-5 rounded-2xl liquid-glass-card flex flex-col justify-between space-y-4 relative overflow-hidden border ${isAccepted ? 'border-emerald-500/30' : 'border-white/[0.08]'}`}
                    >
                      {isAccepted && <div className="absolute top-0 left-0 right-0 h-1 bg-emerald-500" />}

                      <div>
                        {/* Step badges */}
                        <div className="flex items-center gap-1.5 flex-wrap mb-3">
                          <StepBadge step={1} label="รอกดรับงาน" active={!isAccepted} done={isAccepted} />
                          <StepBadge step={2} label="กำลังเตรียม/ติดโลโก้" active={isAccepted} />
                          <StepBadge step={3} label="พร้อมส่ง/ติดวอย" active={false} />
                        </div>

                        <div className="flex items-center justify-between mb-2">
                          <span className={`text-[11px] font-extrabold px-2.5 py-1 rounded-lg border flex items-center gap-1 ${isAccepted ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40' : 'bg-white/[0.05] text-slate-400 border-white/[0.1]'}`}>
                            <Package className="w-3 h-3" />
                            <span>{isAccepted ? '[ส่งของใหม่ - กำลังส่งมอบ]' : '[ส่งของใหม่ - รอกดรับงาน]'}</span>
                          </span>
                          {group.items.length > 1 && (
                            <span className="px-2.5 py-1 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[11px] font-extrabold flex items-center gap-1">
                              <Layers className="w-3 h-3" />
                              จำนวน {group.items.length} เครื่อง
                            </span>
                          )}
                        </div>

                        {/* Route & Delivery Mode */}
                        <div className="flex items-center gap-1.5 flex-wrap mb-2">
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

                        {/* Team Teammates Display */}
                        {teamTechs.length > 0 && (
                          <div className="mb-2 p-1.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-[11px] text-slate-300 flex items-center gap-1.5 flex-wrap">
                            <span className="text-slate-400 font-medium">ทีมงาน:</span>
                            {teamTechs.map((name, idx) => (
                              <span key={idx} className="px-2 py-0.2 rounded-md bg-[#FF6B00]/15 text-[#FF6B00] border border-[#FF6B00]/30 font-semibold text-[10px]">
                                {name}
                              </span>
                            ))}
                          </div>
                        )}

                        <h4 className="text-base font-bold text-white mb-1">{group.model_name}</h4>
                        <p className="text-xs text-slate-300 font-medium data-meta">ลูกค้า: <strong className="text-white font-bold">{order ? order.customer_name : '-'}</strong></p>
                        <p className="text-xs text-slate-500 mt-1 flex items-start gap-1 data-meta">
                          <MapPin className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0 mt-0.5" />
                          <span>{order ? order.delivery_location : '-'}</span>
                        </p>

                        {isAccepted && (
                          <div className="mt-2 text-[10px] text-emerald-400 flex items-center gap-1">
                            <UserCheck className="w-3.5 h-3.5" />
                            <span>ผู้รับงาน: {firstItem.assigned_prep_tech} ({new Date(firstItem.prep_accepted_at || Date.now()).toLocaleTimeString('th-TH')})</span>
                          </div>
                        )}

                        <div className="mt-3 pt-2 border-t border-white/[0.08]">
                          <LatestUpdateBadge
                            logs={firstItem.activity_logs}
                            fallbackTimestamp={firstItem.delivered_at || firstItem.dispatched_at || firstItem.assigned_at || firstItem.updated_at || firstItem.created_at}
                            fallbackActor={firstItem.assigned_prep_tech}
                          />
                          <ActivityTimeline logs={firstItem.activity_logs} />
                        </div>
                      </div>

                      {/* GATE: Accept first, or unlocked controls */}
                      <div className="pt-3 border-t border-white/[0.08] space-y-3">
                        {!isAccepted ? (
                          <>
                            <div className="p-2.5 rounded-xl bg-white/[0.03] border border-white/[0.06] text-[11px] text-slate-400 flex items-center gap-1.5">
                              <Lock className="w-3.5 h-3.5 text-slate-500" />
                              <span>กดรับงานก่อนจึงจะบันทึกส่งมอบได้</span>
                            </div>
                            <button
                              onClick={() => handleAcceptGroup(group)}
                              className="w-full py-3 bg-gradient-to-r from-[#FF6B00] to-[#E65A00] hover:from-[#FF8A24] active:scale-95 text-black font-extrabold rounded-xl text-sm transition cursor-pointer flex items-center justify-center gap-2 shadow-lg shadow-[#FF6B00]/25 border border-white/20"
                            >
                              <UserCheck className="w-4 h-4" />
                              <span>กดรับงานนี้ (Accept Job)</span>
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => toggleGroup(group.key)}
                              className="w-full py-1.5 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] text-slate-300 text-[11px] font-semibold border border-white/[0.1] transition cursor-pointer flex items-center justify-center gap-1"
                            >
                              {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                              <span>{isExpanded ? 'ซ่อนรายการส่งมอบ' : `เปิดรายการส่งมอบ (${group.items.length} เครื่อง)`}</span>
                            </button>

                            {isExpanded && (
                              <>
                                <div className="space-y-2">
                                  {group.items.map((item, idx) => (
                                    <div key={item.id} className="p-2.5 rounded-xl bg-white/[0.03] border border-white/[0.06] space-y-2">
                                      <div className="flex items-center justify-between">
                                        <span className="text-[10px] font-bold text-slate-400">#{idx + 1}</span>
                                        <span className="text-xs font-mono font-extrabold text-[#FF6B00] data-key">{item.serial_number}</span>
                                      </div>
                                      <div className="flex items-center justify-between text-[10px] text-slate-400">
                                        <span>วอยรับประกัน:</span>
                                        <span className="font-mono text-emerald-400 font-bold flex items-center gap-1">
                                          <ShieldCheck className="w-3 h-3" />
                                          {item.void_date || 'ระบุแล้ว'}
                                        </span>
                                      </div>
                                      <input
                                        type="text"
                                        placeholder="บันทึกการส่งมอบ / เซ็นรับ"
                                        value={deliveryNotes[item.id] || ''}
                                        onChange={(e) => setDeliveryNotes({ ...deliveryNotes, [item.id]: e.target.value })}
                                        className="w-full liquid-glass-input rounded-xl px-2.5 py-1.5 text-xs text-white focus:outline-none"
                                      />
                                    </div>
                                  ))}
                                </div>

                                <button
                                  onClick={() => handleDeliveryConfirmGroup(group)}
                                  className="w-full py-2.5 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 active:scale-95 text-black font-extrabold rounded-xl text-xs transition cursor-pointer flex items-center justify-center gap-1.5 shadow-lg shadow-emerald-500/25 border border-white/20"
                                >
                                  <CheckCircle className="w-4 h-4" />
                                  <span>ส่งมอบของใหม่สำเร็จทั้งชุด ({group.items.length})</span>
                                </button>
                              </>
                            )}
                          </>
                        )}
                      </div>
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
                      className="p-5 rounded-2xl liquid-glass-card flex flex-col justify-between space-y-4 relative overflow-hidden border-purple-500/30"
                    >
                      <div className="absolute top-0 left-0 right-0 h-1 bg-purple-500" />

                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[11px] font-extrabold px-2.5 py-1 rounded-lg bg-purple-500/20 text-purple-400 border border-purple-500/40 flex items-center gap-1">
                            <RotateCcw className="w-3 h-3" />
                            <span>[ส่งคืนงานซ่อม]</span>
                          </span>
                          <span className="text-sm font-mono font-extrabold text-slate-300 data-key">{ticket.ticket_no}</span>
                        </div>

                        {rMeta && (
                          <div className={`mb-2 px-2 py-0.5 rounded-md text-[10px] font-bold border inline-flex items-center gap-1 ${rMeta.badgeBg} ${rMeta.badgeBorder} ${rMeta.badgeText}`}>
                            <span>{rMeta.name}</span>
                            <span>• {ticket.district || ''}</span>
                          </div>
                        )}

                        {teamTechs.length > 0 && (
                          <div className="mb-2 p-1.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-[11px] text-slate-300 flex items-center gap-1.5 flex-wrap">
                            <span className="text-slate-400 font-medium">ทีมงาน:</span>
                            {teamTechs.map((name, idx) => (
                              <span key={idx} className="px-2 py-0.2 rounded-md bg-purple-500/20 text-purple-300 border border-purple-500/30 font-semibold text-[10px]">
                                {name}
                              </span>
                            ))}
                          </div>
                        )}

                        <h4 className="text-base font-bold text-white mb-0.5 data-key">S/N: {ticket.walkin_sn}</h4>
                        <p className="text-xs text-slate-300 font-medium data-meta">ลูกค้า: <strong className="text-white font-bold">{ticket.customer_name}</strong></p>
                        <p className="text-xs text-slate-500 mt-1 flex items-start gap-1 data-meta">
                          <MapPin className="w-3.5 h-3.5 text-purple-400 flex-shrink-0 mt-0.5" />
                          <span>{ticket.delivery_location || ticket.customer_phone || '-'}</span>
                        </p>
                        <div className="mt-2 p-2 rounded-xl bg-purple-500/10 border border-purple-500/20 text-[11px] text-purple-300">
                          <strong>ผลการซ่อม:</strong> {ticket.repair_detail || 'เปลี่ยนอะไหล่และเทสผ่านแล้ว'}
                        </div>

                        <div className="mt-3 pt-2 border-t border-white/[0.08]">
                          <LatestUpdateBadge
                            logs={ticket.activity_logs}
                            fallbackTimestamp={ticket.delivered_at || ticket.assigned_at || ticket.updated_at || ticket.created_at}
                            fallbackActor={ticket.received_by}
                          />
                          <ActivityTimeline logs={ticket.activity_logs} />
                        </div>
                      </div>

                      <div className="pt-3 border-t border-white/[0.08] space-y-3">
                        <button
                          onClick={() => handleReturnConfirm(ticket.id, ticket.ticket_no)}
                          className="w-full py-2.5 bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-500 active:scale-95 text-white font-bold rounded-xl text-xs transition cursor-pointer flex items-center justify-center gap-1.5 shadow-lg shadow-purple-600/25 border border-white/20"
                        >
                          <CheckCircle className="w-4 h-4" />
                          <span>ส่งคืนเครื่องซ่อมถึงมือลูกค้า (ปิดงาน)</span>
                        </button>
                      </div>
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
                      className="p-5 rounded-2xl liquid-glass-card flex flex-col justify-between space-y-4 relative overflow-hidden border-amber-500/30"
                    >
                      <div className="absolute top-0 left-0 right-0 h-1 bg-amber-500" />

                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[11px] font-extrabold px-2.5 py-1 rounded-lg bg-amber-500/20 text-amber-400 border border-amber-500/40 flex items-center gap-1">
                            <Wrench className="w-3 h-3" />
                            <span>[ออกซ่อม/รับเครื่องกลับร้าน]</span>
                          </span>
                          <span className="text-sm font-mono font-extrabold text-amber-400 data-key">{ticket.ticket_no}</span>
                        </div>

                        {rMeta && (
                          <div className={`mb-2 px-2 py-0.5 rounded-md text-[10px] font-bold border inline-flex items-center gap-1 ${rMeta.badgeBg} ${rMeta.badgeBorder} ${rMeta.badgeText}`}>
                            <span>{rMeta.name}</span>
                            <span>• {ticket.district || ''}</span>
                          </div>
                        )}

                        {teamTechs.length > 0 && (
                          <div className="mb-2 p-1.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-[11px] text-slate-300 flex items-center gap-1.5 flex-wrap">
                            <span className="text-slate-400 font-medium">ทีมงาน:</span>
                            {teamTechs.map((name, idx) => (
                              <span key={idx} className="px-2 py-0.2 rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/30 font-semibold text-[10px]">
                                {name}
                              </span>
                            ))}
                          </div>
                        )}

                        <h4 className="text-base font-bold text-white mb-0.5 data-key">S/N: {ticket.walkin_sn}</h4>
                        <p className="text-xs text-slate-300 font-medium data-meta">ลูกค้า: <strong className="text-white font-bold">{ticket.customer_name}</strong></p>
                        <p className="text-xs text-slate-500 mt-1 flex items-start gap-1 data-meta">
                          <MapPin className="w-3.5 h-3.5 text-amber-400 flex-shrink-0 mt-0.5" />
                          <span>{ticket.delivery_location || ticket.customer_phone || '-'}</span>
                        </p>
                        <div className="mt-2 p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-300">
                          <strong>อาการเสีย:</strong> {ticket.fault_symptom}
                        </div>

                        <div className="mt-3 pt-2 border-t border-white/[0.08]">
                          <LatestUpdateBadge
                            logs={ticket.activity_logs}
                            fallbackTimestamp={ticket.started_at || ticket.assigned_at || ticket.updated_at || ticket.created_at}
                            fallbackActor={ticket.received_by}
                          />
                          <ActivityTimeline logs={ticket.activity_logs} />
                        </div>
                      </div>

                      <div className="pt-3 border-t border-white/[0.08] space-y-2">
                        <button
                          onClick={() => handleOpenPickupForJob(ticket)}
                          className="w-full py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 active:scale-95 text-black font-extrabold rounded-xl text-xs transition cursor-pointer flex items-center justify-center gap-1.5 shadow-lg shadow-amber-500/25 border border-white/20"
                        >
                          <Smartphone className="w-4 h-4" />
                          <span>บันทึกรับเครื่อง & ระบุอุปกรณ์ที่ติดมา</span>
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
      {/* MODAL 1: FORM บันทึกการรับเครื่องซ่อมกลับร้าน (Mobile-Friendly) */}
      {/* ========================================================================= */}
      {isPickupModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/80 backdrop-blur-md overflow-y-auto">
          <div className="w-[95vw] max-w-lg max-h-[90vh] overflow-y-auto liquid-glass rounded-2xl sm:rounded-3xl p-4 sm:p-7 border border-[#FF6B00]/40 shadow-2xl my-4 sm:my-8 relative">
            <button
              onClick={() => setIsPickupModalOpen(false)}
              aria-label="ปิดฟอร์มรับเครื่องซ่อม"
              className="absolute right-3 top-3 sm:right-5 sm:top-5 p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/[0.06] cursor-pointer min-w-[44px] min-h-[44px] flex items-center justify-center"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2 mb-4">
              <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30">
                <Smartphone className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">
                  บันทึกรับเครื่องซ่อมจากหน้างานกลับร้าน
                </h3>
                <p className="text-xs text-slate-400">
                  {originTicketId ? 'อัปเดตข้อมูลเครื่องจาก Job ที่ได้รับมอบหมาย' : 'เปิดใบรับซ่อมใหม่จากหน้างานโดยช่าง Onsite'}
                </p>
              </div>
            </div>

            <form onSubmit={handleSubmitPickupForm} className="space-y-4 text-xs">
              {/* Customer Info */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">ชื่อลูกค้า / บริษัท *</label>
                  <input
                    type="text"
                    required
                    placeholder="ชื่อผู้ติดต่อหรือบริษัท"
                    value={custName}
                    onChange={(e) => setCustName(e.target.value)}
                    className="w-full liquid-glass-input rounded-xl px-3 py-2 text-white focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-medium mb-1">เบอร์โทรติดต่อ</label>
                  <input
                    type="text"
                    placeholder="08x-xxx-xxxx"
                    value={custPhone}
                    onChange={(e) => setCustPhone(e.target.value)}
                    className="w-full liquid-glass-input rounded-xl px-3 py-2 text-white focus:outline-none"
                  />
                </div>
              </div>

              {/* District & Location */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">อำเภอ / สายรถ *</label>
                  <select
                    value={district}
                    onChange={(e) => setDistrict(e.target.value)}
                    className="w-full liquid-glass-input rounded-xl px-3 py-2 text-white focus:outline-none"
                  >
                    {DISTRICT_OPTIONS.map(opt => (
                      <option key={opt.district} value={opt.district} className="bg-[#12141A]">
                        {opt.district} - [{opt.zone}]
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-slate-300 font-medium mb-1">จุดรับเครื่อง / ที่อยู่</label>
                  <input
                    type="text"
                    placeholder="เช่น หน้าร้าน, ออฟฟิศชั้น 2"
                    value={deliveryLocation}
                    onChange={(e) => setDeliveryLocation(e.target.value)}
                    className="w-full liquid-glass-input rounded-xl px-3 py-2 text-white focus:outline-none"
                  />
                </div>
              </div>

              {district === 'ต่างจังหวัด / งานเหมาพิเศษ' && (
                <div>
                  <label className="block text-amber-400 font-medium mb-1">ระบุจังหวัด / งานพิเศษ</label>
                  <input
                    type="text"
                    placeholder="เช่น ชุมพร, พังงา"
                    value={provinceCustom}
                    onChange={(e) => setProvinceCustom(e.target.value)}
                    className="w-full liquid-glass-input rounded-xl px-3 py-2 text-white focus:outline-none"
                  />
                </div>
              )}

              {/* Hardware Model & S/N */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-white/[0.08]">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">รุ่นสินค้า / ยี่ห้อเครื่อง</label>
                  <input
                    type="text"
                    placeholder="เช่น BossComputech POS X1, โน้ตบุ๊ก Dell"
                    value={deviceModel}
                    onChange={(e) => setDeviceModel(e.target.value)}
                    className="w-full liquid-glass-input rounded-xl px-3 py-2 text-white focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-medium mb-1">
                    Serial Number (S/N)
                  </label>
                  <input
                    type="text"
                    placeholder="เช่น BC-2026-002"
                    value={sn}
                    onChange={(e) => setSn(e.target.value)}
                    className="w-full liquid-glass-input rounded-xl px-3 py-2 text-white font-mono focus:outline-none"
                  />
                </div>
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
              <div className="pt-2 border-t border-white/[0.08]">
                <label className="block text-slate-300 font-semibold mb-2">
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
                          ? 'bg-amber-500/15 border-amber-500/40 text-amber-300 font-semibold'
                          : 'bg-white/[0.03] border-white/[0.06] text-slate-400 hover:text-white'
                          }`}
                      >
                        {isChecked ? (
                          <CheckSquare className="w-4 h-4 text-amber-400 flex-shrink-0" />
                        ) : (
                          <Square className="w-4 h-4 text-slate-500 flex-shrink-0" />
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
                    className="w-full liquid-glass-input rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
                  />
                </div>
              </div>

              {/* Symptom */}
              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  อาการเสียที่ลูกค้าแจ้ง / สภาพตัวเครื่อง *
                </label>
                <textarea
                  rows={3}
                  required
                  placeholder="เช่น เปิดไม่ติด ไฟเข้าแต่พัดลมไม่หมุน, มีรอยแตกมุมซ้าย"
                  value={faultSymptom}
                  onChange={(e) => setFaultSymptom(e.target.value)}
                  className="w-full liquid-glass-input rounded-2xl px-3 py-2 text-white focus:outline-none"
                />
              </div>

              {/* Recorded By Tech */}
              <div className="p-2.5 rounded-xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-between text-[11px] text-slate-300">
                <span className="text-slate-400">ช่าง Onsite ผู้บันทึกรับเครื่อง:</span>
                <span className="text-amber-400 font-bold">{currentUser?.name || 'ช่าง Onsite'}</span>
              </div>

              {/* Buttons */}
              <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setIsPickupModalOpen(false)}
                  className="w-full sm:w-1/3 py-2.5 min-h-[44px] rounded-xl liquid-glass-card text-slate-400 hover:text-white text-xs font-semibold cursor-pointer"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  className="w-full sm:w-2/3 py-2.5 min-h-[44px] bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 active:scale-95 text-black font-extrabold rounded-xl text-xs transition cursor-pointer shadow-xl shadow-amber-500/25 border border-white/20 flex items-center justify-center gap-1.5"
                >
                  <CheckCircle className="w-4 h-4" />
                  <span>บันทึกการรับเครื่อง & ส่งเข้าห้องซ่อม</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: RECEIPT POPUP (พิมพ์ใบรับซ่อมให้ลูกค้าทันที) */}
      {/* ========================================================================= */}
      {receiptTicket && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/85 backdrop-blur-md overflow-y-auto">
          <div className="w-[95vw] max-w-md max-h-[90vh] overflow-y-auto liquid-glass rounded-2xl sm:rounded-3xl p-4 sm:p-6 border border-emerald-500/40 shadow-2xl my-4 sm:my-8 relative text-xs">
            <button
              onClick={() => setReceiptTicket(null)}
              aria-label="ปิดใบรับซ่อม"
              className="absolute right-3 top-3 sm:right-4 sm:top-4 p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/[0.06] cursor-pointer no-print min-w-[44px] min-h-[44px] flex items-center justify-center"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Printable Receipt Section */}
            <div id="repair-receipt-print" className="space-y-4">
              <div className="text-center pb-3 border-b border-white/[0.1]">
                <h2 className="text-lg font-extrabold text-[#FF6B00] tracking-wider uppercase">
                  BossComputech
                </h2>
                <p className="text-[10px] text-slate-400 data-meta">ใบรับเครื่องซ่อม / Service Intake Receipt</p>
                <div className="mt-2 inline-block px-3 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 font-mono font-extrabold text-sm data-key">
                  {receiptTicket.ticket_no}
                </div>
              </div>

              <div className="space-y-2 text-slate-300">
                <div className="flex justify-between">
                  <span className="text-slate-400">วันที่รับเครื่อง:</span>
                  <span className="text-white font-mono">{new Date().toLocaleString('th-TH')}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">ลูกค้า:</span>
                  <span className="text-white font-bold text-sm">{receiptTicket.customer_name}</span>
                </div>
                {receiptTicket.customer_phone && (
                  <div className="flex justify-between">
                    <span className="text-slate-400">เบอร์โทร:</span>
                    <span className="text-white font-mono">{receiptTicket.customer_phone}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-slate-400">อำเภอ/สายรถ:</span>
                  <span className="text-white">{receiptTicket.district || '-'}</span>
                </div>
                {receiptTicket.device_model && (
                  <div className="flex justify-between">
                    <span className="text-slate-400">รุ่นสินค้า:</span>
                    <span className="text-white font-semibold">{receiptTicket.device_model}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-slate-400">Serial Number (S/N):</span>
                  <span className="text-[#FF6B00] font-mono font-extrabold data-key">{receiptTicket.walkin_sn}</span>
                </div>
                <div className="pt-2 border-t border-white/[0.06]">
                  <span className="text-slate-400 block mb-0.5">อุปกรณ์ที่ติดมาด้วย:</span>
                  <div className="text-white font-medium pl-1">
                    {receiptTicket.accessories && receiptTicket.accessories.length > 0
                      ? receiptTicket.accessories.join(', ')
                      : 'ไม่มีอุปกรณ์อื่น'}
                    {receiptTicket.accessories_other ? ` (${receiptTicket.accessories_other})` : ''}
                  </div>
                </div>
                <div className="pt-2 border-t border-white/[0.06]">
                  <span className="text-slate-400 block mb-0.5">อาการเสียที่ได้รับแจ้ง:</span>
                  <p className="text-rose-300 font-medium pl-1">{receiptTicket.fault_symptom}</p>
                </div>
                <div className="pt-2 border-t border-white/[0.06] flex justify-between">
                  <span className="text-slate-400">ช่าง Onsite ผู้รับเครื่อง:</span>
                  <span className="text-amber-400 font-bold">{receiptTicket.picked_up_by || currentUser?.name || 'ช่าง Onsite'}</span>
                </div>
              </div>

              <div className="p-2.5 rounded-xl bg-white/[0.02] border border-white/[0.05] text-[10px] text-slate-400 text-center">
                * โปรดเก็บหลักฐานนี้ไว้สำหรับตรวจสอบสถานะหรือรับเครื่องคืนกับทาง BossComputech
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center gap-2 pt-4 border-t border-white/[0.08] no-print">
              <button
                onClick={handlePrintReceipt}
                className="flex-1 py-2 bg-[#FF6B00] hover:bg-[#E65A00] text-black font-extrabold rounded-xl text-xs transition cursor-pointer flex items-center justify-center gap-1.5 shadow-lg shadow-[#FF6B00]/25"
              >
                <Printer className="w-4 h-4" />
                <span>พิมพ์ใบรับซ่อม</span>
              </button>
              <button
                onClick={() => setReceiptTicket(null)}
                className="px-4 py-2 rounded-xl liquid-glass-card text-slate-300 hover:text-white text-xs font-semibold cursor-pointer"
              >
                เสร็จสิ้น
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
