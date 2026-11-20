import React, { useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import {
  Wrench, CheckCircle, Clock, Printer, Plus, CheckSquare, Square,
  ShieldCheck, FileText, Camera, ClipboardList, ArrowRight, Truck,
  PackageCheck, ScanLine, CalendarDays, Hash, Building2
} from 'lucide-react';
import {
  RepairTicket, RepairLifecycleStatus, ServiceType,
  REPAIR_LIFECYCLE_META, REPAIR_LIFECYCLE_ORDER, RMA_SUPPLIER_OPTIONS,
  getRouteByDistrict, getElapsedDays, toDateInputValue, fromDateInputValue,
  formatThaiDateTime, formatDateDMY
} from '../types';
import { ListControls, useListControls } from './ListControls';
import { ActivityTimeline, LatestUpdateBadge } from './ActivityTimeline';
import { BarcodeScannerModal } from './BarcodeScannerModal';
import {
  Modal, modalInputClass, modalLabelClass,
  modalPrimaryBtnClass, modalSecondaryBtnClass
} from './ui/Modal';

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

type FilterTab = 'all' | 'in_house' | 'rma' | 'ready_pickup';

const FILTER_TABS: { id: FilterTab; label: string }[] = [
  { id: 'all', label: 'ทั้งหมด' },
  { id: 'in_house', label: 'ซ่อมหน้าร้าน' },
  { id: 'rma', label: 'กำลังส่งเคลม (RMA)' },
  { id: 'ready_pickup', label: 'พร้อมส่งมอบ (รอลูกค้ารับ)' }
];

// สถานะที่ถือว่า "งานยังไม่ปิด" (แสดงบนโต๊ะช่าง)
const OPEN_LIFECYCLE: RepairLifecycleStatus[] = [
  'pending_check', 'repairing', 'waiting_parts', 'rma_sent', 'rma_returned', 'ready_pickup'
];

const isTicketOpen = (t: RepairTicket): boolean => {
  if (t.status === 'returned_closed' || t.delivered_at) return false;
  const lifecycle = t.repair_status || 'pending_check';
  return OPEN_LIFECYCLE.includes(lifecycle);
};

const getServiceType = (t: RepairTicket): ServiceType =>
  t.service_type || (t.rma_supplier || t.rma_tracking_no ? 'rma_claim' : 'in_house_repair');

const getLifecycle = (t: RepairTicket): RepairLifecycleStatus => {
  if (t.repair_status) return t.repair_status;
  if (t.status === 'returned_closed' || t.delivered_at) return 'completed';
  if (t.status === 'repaired') return 'ready_pickup';
  if (t.status === 'in_progress') return 'repairing';
  return 'pending_check';
};

export const RepairView: React.FC = () => {
  const {
    repairTickets, items, completeRepairTicket, createRepairTicket,
    updateRepairLifecycle, updateRmaTracking, currentUser
  } = useApp();

  const [repairDetails, setRepairDetails] = useState<Record<string, string>>({});
  const [partsUsed, setPartsUsed] = useState<Record<string, string>>({});
  const [costInputs, setCostInputs] = useState<Record<string, string>>({});
  const [toast, setToast] = useState('');
  const [activeTab, setActiveTab] = useState<FilterTab>('all');

  // Scanner targets: 'new' = new ticket S/N, 'replacement' = RMA replacement S/N
  const [scannerTarget, setScannerTarget] = useState<'new' | 'replacement' | null>(null);

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

  // Modal 2: Standard Company Repair Receipt Print Modal
  const [receiptTicket, setReceiptTicket] = useState<RepairTicket | null>(null);

  // Modal 3: Repair Detail & Action Modal
  const [activeTicketId, setActiveTicketId] = useState<string | null>(null);

  // Local RMA edit buffer (per active ticket)
  const [rmaSupplier, setRmaSupplier] = useState('');
  const [rmaTrackingNo, setRmaTrackingNo] = useState('');
  const [rmaSentDate, setRmaSentDate] = useState('');
  const [rmaReturnedDate, setRmaReturnedDate] = useState('');
  const [replacementSn, setReplacementSn] = useState('');
  const [includedAccessories, setIncludedAccessories] = useState('');

  const openTickets = useMemo(() => repairTickets.filter(isTicketOpen), [repairTickets]);

  const rmaCount = useMemo(
    () => openTickets.filter(t => getServiceType(t) === 'rma_claim' && getLifecycle(t) !== 'ready_pickup').length,
    [openTickets]
  );

  const filteredTickets = useMemo(() => {
    switch (activeTab) {
      case 'in_house':
        return openTickets.filter(t => getServiceType(t) === 'in_house_repair' && getLifecycle(t) !== 'ready_pickup');
      case 'rma':
        return openTickets.filter(t => getServiceType(t) === 'rma_claim' && getLifecycle(t) !== 'ready_pickup');
      case 'ready_pickup':
        return openTickets.filter(t => getLifecycle(t) === 'ready_pickup');
      default:
        return openTickets;
    }
  }, [openTickets, activeTab]);

  const repairsList = useListControls(filteredTickets, {
    getDate: (t) => t.created_at,
    initialSort: 'newest',
  });

  const tabCount = (tab: FilterTab): number => {
    switch (tab) {
      case 'in_house':
        return openTickets.filter(t => getServiceType(t) === 'in_house_repair' && getLifecycle(t) !== 'ready_pickup').length;
      case 'rma':
        return rmaCount;
      case 'ready_pickup':
        return openTickets.filter(t => getLifecycle(t) === 'ready_pickup').length;
      default:
        return openTickets.length;
    }
  };

  // Auto Warranty Check for New Ticket Form
  const matchedItemNew = sn.trim()
    ? items.find(i => i.serial_number && i.serial_number.toLowerCase() === sn.trim().toLowerCase())
    : null;

  let newFormWarrantyText = '';
  let newFormWarrantyClass = '';
  if (matchedItemNew && matchedItemNew.void_date) {
    const vDate = new Date(matchedItemNew.void_date);
    const expDate = new Date(vDate);
    expDate.setFullYear(expDate.getFullYear() + 1);
    const isExpired = new Date() > expDate;
    if (isExpired) {
      newFormWarrantyText = `หมดประกันแล้ว (ติดวอยเมื่อ ${matchedItemNew.void_date})`;
      newFormWarrantyClass = 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30';
    } else {
      newFormWarrantyText = `อยู่ในประกัน 1 ปี (ติดวอยเมื่อ ${matchedItemNew.void_date})`;
      newFormWarrantyClass = 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30';
    }
  } else if (sn.trim().length >= 3) {
    newFormWarrantyText = 'ไม่พบประวัติวอยในระบบ (นอกประกันหรือเครื่องทั่วไป)';
    newFormWarrantyClass = 'bg-slate-100 text-slate-500 border-slate-200 dark:bg-white/[0.04] dark:text-slate-400 dark:border-white/[0.08]';
  }

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

  const handleCreateTicketSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!custName.trim() || !faultSymptom.trim()) {
      alert('กรุณากรอกชื่อลูกค้าและอาการเสีย');
      return;
    }

    const calculatedRoute = getRouteByDistrict(district);
    const finalSn = sn.trim() || `SN-${Math.floor(1000 + Math.random() * 9000)}`;
    const includedAcc = [...selectedAccessories, accessoriesOther.trim()].filter(Boolean).join(', ');

    createRepairTicket({
      item_id: null,
      walkin_sn: finalSn,
      customer_name: custName.trim(),
      customer_phone: custPhone.trim(),
      intake_channel: 'front_desk_walkin',
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
      delivery_location: `อ.${district}`,
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
    setTimeout(() => setToast(''), 3500);
  };

  const handlePrintModal = (ticket: RepairTicket) => {
    setReceiptTicket(ticket);
  };

  // Load RMA buffer when opening a ticket
  const openTicketModal = (ticket: RepairTicket) => {
    setActiveTicketId(ticket.id);
    setRmaSupplier(ticket.rma_supplier || 'SIS');
    setRmaTrackingNo(ticket.rma_tracking_no || '');
    setRmaSentDate(toDateInputValue(ticket.rma_sent_date));
    setRmaReturnedDate(toDateInputValue(ticket.rma_returned_date));
    setReplacementSn(ticket.replacement_sn || '');
    setIncludedAccessories(
      ticket.included_accessories ||
      [...(ticket.accessories || []), ticket.accessories_other || ''].filter(Boolean).join(', ')
    );
  };

  const handleSaveRma = (ticket: RepairTicket) => {
    updateRmaTracking(ticket.id, {
      service_type: getServiceType(ticket),
      included_accessories: includedAccessories.trim() || null,
      rma_supplier: rmaSupplier || null,
      rma_tracking_no: rmaTrackingNo.trim() || null,
      rma_sent_date: fromDateInputValue(rmaSentDate),
      rma_returned_date: fromDateInputValue(rmaReturnedDate),
      replacement_sn: replacementSn.trim() || null
    });
    setToast(`บันทึกข้อมูล RMA ของ ${ticket.ticket_no} เรียบร้อย`);
    setTimeout(() => setToast(''), 3500);
  };

  const handleReceiveRmaBack = (ticket: RepairTicket) => {
    const today = new Date().toISOString();
    updateRmaTracking(
      ticket.id,
      {
        service_type: 'rma_claim',
        rma_returned_date: today,
        replacement_sn: replacementSn.trim() || ticket.replacement_sn || null,
        repair_status: 'rma_returned'
      },
      `รับของเคลมกลับจาก ${rmaSupplier || ticket.rma_supplier || 'ศูนย์'}${replacementSn.trim() ? ` | S/N ใหม่: ${replacementSn.trim()}` : ''}`
    );
    setRmaReturnedDate(toDateInputValue(today));
    setToast(`รับของเคลมกลับ ${ticket.ticket_no} แล้ว — พร้อมทดสอบเครื่อง`);
    setTimeout(() => setToast(''), 3500);
  };

  const handleStatusChange = (ticket: RepairTicket, status: RepairLifecycleStatus) => {
    updateRepairLifecycle(ticket.id, status);
    setToast(`อัปเดตสถานะ ${ticket.ticket_no}: ${REPAIR_LIFECYCLE_META[status].label}`);
    setTimeout(() => setToast(''), 3000);
  };

  const handleComplete = (ticket: RepairTicket) => {
    const detail = repairDetails[ticket.id]?.trim() || 'ซ่อม/เคลมเสร็จเรียบร้อย พร้อมส่งมอบ';
    const parts = partsUsed[ticket.id]?.trim() || '-';
    const cost = costInputs[ticket.id] ? ` [ค่าใช้จ่าย: ${costInputs[ticket.id]} บาท]` : '';
    completeRepairTicket(ticket.id, 'repaired', 'ซ่อมสำเร็จ', detail + cost, parts);
    setToast(`บันทึกผลการซ่อม ${ticket.ticket_no} เรียบร้อย — พร้อมส่งมอบ (รอลูกค้ารับ)`);
    setTimeout(() => setToast(''), 4000);
  };

  return (
    <div className="space-y-6">
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 p-4 rounded-2xl liquid-glass border border-[#FF6B00] text-white text-xs flex items-center gap-2 shadow-2xl">
          <CheckCircle className="w-4 h-4 text-[#FF6B00]" />
          <span>{toast}</span>
        </div>
      )}

      {/* Main Repair Workbench */}
      <div className="liquid-glass rounded-3xl p-6 sm:p-7 shadow-2xl border border-white/[0.08]">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5 pb-4 border-b border-white/[0.08]">
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <div className="p-2 rounded-xl bg-rose-500/15 text-rose-400 border border-rose-500/30">
                <Wrench className="w-5 h-5" />
              </div>
              <span>โต๊ะช่างซ่อม & ติดตามงานเคลม (In-House Repair & RMA Tracking)</span>
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              ติดตามวงจรชีวิตงานซ่อมหน้าร้านและการส่งเคลมศูนย์/Supplier (RMA) แบบครบขั้นตอน
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setIsNewTicketOpen(true)}
              className="px-4 py-2 bg-gradient-to-r from-[#FF6B00] to-[#E65A00] hover:from-[#FF8A24] text-black font-extrabold rounded-2xl text-xs transition cursor-pointer flex items-center gap-1.5 shadow-lg shadow-[#FF6B00]/25 border border-white/20 active:scale-95"
            >
              <Plus className="w-4 h-4" />
              <span>เปิดใบรับซ่อมใหม่ (REP-2569-XXX)</span>
            </button>
            <span className="text-xs px-3 py-1.5 rounded-2xl bg-rose-500/15 text-rose-400 border border-rose-500/30 font-semibold">
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
                  : 'bg-white/[0.04] text-slate-300 border-white/[0.08] hover:bg-white/[0.08]'
                  }`}
              >
                {tab.label}
                <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${isActive ? 'bg-black/20 text-black' : 'bg-white/[0.08] text-slate-400'}`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {filteredTickets.length === 0 ? (
          <div className="text-center py-12 text-slate-500 border border-dashed border-white/[0.1] rounded-2xl">
            <CheckCircle className="w-10 h-10 mx-auto mb-2 text-rose-400 opacity-60" />
            <p className="text-sm font-medium text-slate-200">ไม่มีงานในหมวดนี้</p>
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
                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-semibold border ${meta.badge}`}>
                          {meta.label}
                        </span>
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

                      <p className="text-xs text-slate-300 data-meta">
                        ลูกค้า: <strong className="text-white font-bold">{ticket.customer_name}</strong>
                        {ticket.customer_phone ? <span className="text-slate-400"> • {ticket.customer_phone}</span> : null}
                      </p>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        {ticket.device_model || 'อุปกรณ์'} • S/N: <span className="font-mono text-[#FF6B00]">{ticket.walkin_sn || 'ไม่ระบุ'}</span>
                      </p>
                      <p className="text-xs text-rose-300 font-semibold mt-1 line-clamp-2">{ticket.fault_symptom}</p>
                    </div>

                    <div className="pt-3 border-t border-white/[0.08] flex items-center gap-2">
                      <button
                        onClick={() => openTicketModal(ticket)}
                        className="flex-1 py-2.5 bg-gradient-to-r from-[#FF6B00] to-[#E65A00] hover:from-[#FF8A24] hover:brightness-105 text-black font-extrabold rounded-xl text-xs transition-all duration-150 cursor-pointer flex items-center justify-center gap-1.5 shadow-lg shadow-[#FF6B00]/25 border border-white/20 active:scale-[0.97]"
                      >
                        <ClipboardList className="w-4 h-4" />
                        <span>เปิดจัดการ / อัปเดตสถานะ</span>
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

        const serviceType = getServiceType(ticket);
        const lifecycle = getLifecycle(ticket);
        const elapsed = lifecycle === 'rma_sent' ? getElapsedDays(ticket.rma_sent_date) : null;

        return (
          <Modal
            open
            onClose={() => setActiveTicketId(null)}
            ariaLabel="Repair Detail"
            title={ticket.ticket_no}
            subtitle={`S/N: ${ticket.walkin_sn || 'ไม่ระบุ'}${ticket.device_model ? ` • ${ticket.device_model}` : ''}`}
            icon={<Wrench className="w-5 h-5" />}
            maxWidthClass="max-w-3xl"
            footer={
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2">
                <button
                  onClick={() => handlePrintModal(ticket)}
                  className={modalSecondaryBtnClass + ' sm:w-auto flex items-center gap-1.5'}
                >
                  <Printer className="w-4 h-4" />
                  <span>พิมพ์ใบรับซ่อม</span>
                </button>
                <button
                  onClick={() => { handleComplete(ticket); setActiveTicketId(null); }}
                  className={modalPrimaryBtnClass + ' sm:w-auto flex items-center gap-1.5'}
                >
                  <PackageCheck className="w-4 h-4" />
                  <span>ซ่อม/เคลมเสร็จ — พร้อมส่งมอบ</span>
                </button>
              </div>
            }
          >
            <div className="space-y-4">
              {/* Customer & status */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="p-3 rounded-xl bg-slate-100 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08]">
                  <div className={modalLabelClass}>ลูกค้า</div>
                  <div className="font-bold text-slate-900 dark:text-white mt-0.5">{ticket.customer_name}</div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    {ticket.customer_phone || '-'} • {ticket.district || '-'}
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-slate-100 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08]">
                  <div className={modalLabelClass}>สถานะปัจจุบัน</div>
                  <span className={`inline-block mt-1 px-2 py-0.5 rounded-md text-[10px] font-semibold border ${REPAIR_LIFECYCLE_META[lifecycle].badge}`}>
                    {REPAIR_LIFECYCLE_META[lifecycle].label}
                  </span>
                  {elapsed !== null && (
                    <span className="inline-block mt-1 ml-1 px-2 py-0.5 rounded-md text-[10px] font-semibold border bg-violet-500/15 text-violet-600 dark:text-violet-400 border-violet-500/30">
                      ส่งเคลมแล้ว {elapsed} วัน
                    </span>
                  )}
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

              {/* Service Type Toggle */}
              <div>
                <label className={modalLabelClass}>ประเภทงานซ่อม *</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => updateRmaTracking(ticket.id, { service_type: 'in_house_repair' })}
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex items-center gap-2 ${serviceType === 'in_house_repair'
                      ? 'bg-amber-500/15 border-amber-500/40 text-amber-600 dark:text-amber-300 ring-2 ring-[#FF6B00]/30'
                      : 'bg-slate-50 dark:bg-white/[0.02] border-slate-200 dark:border-white/[0.06] text-slate-500 dark:text-slate-400'
                      }`}
                  >
                    <Wrench className="w-4 h-4 flex-shrink-0" />
                    <span className="font-bold text-xs">ซ่อมเองหน้าร้าน</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => updateRmaTracking(ticket.id, { service_type: 'rma_claim' })}
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex items-center gap-2 ${serviceType === 'rma_claim'
                      ? 'bg-violet-500/15 border-violet-500/40 text-violet-600 dark:text-violet-300 ring-2 ring-violet-500/30'
                      : 'bg-slate-50 dark:bg-white/[0.02] border-slate-200 dark:border-white/[0.06] text-slate-500 dark:text-slate-400'
                      }`}
                  >
                    <Truck className="w-4 h-4 flex-shrink-0" />
                    <span className="font-bold text-xs">ส่งเคลมประกัน (RMA)</span>
                  </button>
                </div>
              </div>

              {/* RMA Tracking Section */}
              {serviceType === 'rma_claim' && (
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
                        value={rmaSupplier}
                        onChange={(e) => setRmaSupplier(e.target.value)}
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
                        value={rmaTrackingNo}
                        onChange={(e) => setRmaTrackingNo(e.target.value)}
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
                        value={rmaSentDate}
                        onChange={(e) => setRmaSentDate(e.target.value)}
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
                        value={rmaReturnedDate}
                        onChange={(e) => setRmaReturnedDate(e.target.value)}
                        className={modalInputClass}
                      />
                    </div>
                  </div>

                  {/* Receive back + replacement S/N */}
                  <div className="pt-3 border-t border-violet-500/20 space-y-2">
                    <div className="text-[11px] font-bold text-violet-600 dark:text-violet-300 flex items-center gap-1.5">
                      <ScanLine className="w-3.5 h-3.5" />
                      รับของเคลมกลับ + สแกน S/N ตัวใหม่
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        placeholder="S/N ใหม่กรณีศูนย์เปลี่ยนตัวใหม่"
                        value={replacementSn}
                        onChange={(e) => setReplacementSn(e.target.value)}
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
                    <div className="flex flex-col sm:flex-row gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => handleSaveRma(ticket)}
                        className="flex-1 py-2 rounded-xl bg-violet-500/15 hover:bg-violet-500/25 text-violet-600 dark:text-violet-300 border border-violet-500/30 text-xs font-bold cursor-pointer flex items-center justify-center gap-1.5 transition active:scale-[0.98]"
                      >
                        <FileText className="w-4 h-4" />
                        <span>บันทึกข้อมูล RMA</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleReceiveRmaBack(ticket)}
                        className="flex-1 py-2 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-600 dark:text-emerald-300 border border-emerald-500/30 text-xs font-bold cursor-pointer flex items-center justify-center gap-1.5 transition active:scale-[0.98]"
                      >
                        <PackageCheck className="w-4 h-4" />
                        <span>รับของเคลมกลับ</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Included Accessories */}
              <div>
                <label className={modalLabelClass}>อุปกรณ์ที่ติดมากับเครื่อง (ระบุในใบรับซ่อม)</label>
                <input
                  type="text"
                  placeholder="เช่น Adapter, สายชาร์จ, กระเป๋า"
                  value={includedAccessories}
                  onChange={(e) => setIncludedAccessories(e.target.value)}
                  className={modalInputClass}
                />
              </div>

              {/* Lifecycle Status Buttons */}
              <div>
                <label className={modalLabelClass}>อัปเดตสถานะงานซ่อม</label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {REPAIR_LIFECYCLE_ORDER.filter(s => s !== 'completed').map((s) => {
                    const m = REPAIR_LIFECYCLE_META[s];
                    const isCurrent = lifecycle === s;
                    return (
                      <button
                        key={s}
                        type="button"
                        onClick={() => handleStatusChange(ticket, s)}
                        className={`px-2.5 py-2 rounded-xl border text-[11px] font-semibold transition-all cursor-pointer flex items-center gap-1.5 active:scale-[0.97] ${isCurrent
                          ? 'ring-2 ring-[#FF6B00]/40 ' + m.badge
                          : 'bg-slate-50 dark:bg-white/[0.03] border-slate-200 dark:border-white/[0.08] text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/[0.06]'
                          }`}
                      >
                        <span className={`w-2 h-2 rounded-full ${m.dot}`} />
                        <span className="truncate">{m.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Repair Detail Inputs */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className={modalLabelClass}>รายละเอียดการซ่อม / ผลการทดสอบ</label>
                  <textarea
                    rows={2}
                    placeholder="ระบุสิ่งที่ซ่อม / ผลทดสอบหลังซ่อม"
                    value={repairDetails[ticket.id] || ''}
                    onChange={(e) => setRepairDetails(prev => ({ ...prev, [ticket.id]: e.target.value }))}
                    className={modalInputClass + ' resize-none'}
                  />
                </div>
                <div>
                  <label className={modalLabelClass}>อะไหล่ที่ใช้</label>
                  <input
                    type="text"
                    placeholder="เช่น SSD 512GB, พัดลม CPU"
                    value={partsUsed[ticket.id] || ''}
                    onChange={(e) => setPartsUsed(prev => ({ ...prev, [ticket.id]: e.target.value }))}
                    className={modalInputClass}
                  />
                  <label className={modalLabelClass + ' mt-2'}>ค่าใช้จ่าย (บาท)</label>
                  <input
                    type="number"
                    min={0}
                    placeholder="0"
                    value={costInputs[ticket.id] || ''}
                    onChange={(e) => setCostInputs(prev => ({ ...prev, [ticket.id]: e.target.value }))}
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
            <button type="submit" form="new-ticket-form" className={modalPrimaryBtnClass + ' sm:w-auto flex items-center justify-center gap-1.5'}>
              <CheckCircle className="w-4 h-4" />
              <span>บันทึก & เปิดใบรับซ่อม</span>
            </button>
          </div>
        }
      >
        <form id="new-ticket-form" onSubmit={handleCreateTicketSubmit} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={modalLabelClass}>ชื่อลูกค้า *</label>
              <input type="text" value={custName} onChange={(e) => setCustName(e.target.value)} className={modalInputClass} placeholder="ชื่อ-นามสกุล" />
            </div>
            <div>
              <label className={modalLabelClass}>เบอร์โทร</label>
              <input type="tel" value={custPhone} onChange={(e) => setCustPhone(e.target.value)} className={modalInputClass} placeholder="08X-XXX-XXXX" />
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
            <label className={modalLabelClass}>Serial Number (S/N)</label>
            <div className="flex items-center gap-2">
              <input type="text" value={sn} onChange={(e) => setSn(e.target.value)} className={modalInputClass + ' font-mono'} placeholder="สแกนหรือพิมพ์ S/N" />
              <button
                type="button"
                onClick={() => setScannerTarget('new')}
                className="px-3 py-2 rounded-xl bg-[#FF6B00]/15 hover:bg-[#FF6B00]/25 text-[#FF6B00] border border-[#FF6B00]/30 text-xs font-semibold cursor-pointer flex items-center gap-1 transition flex-shrink-0"
              >
                <Camera className="w-4 h-4" />
                <span className="hidden sm:inline">สแกน</span>
              </button>
            </div>
            {newFormWarrantyText && (
              <div className={`mt-1.5 px-2.5 py-1.5 rounded-lg border text-[11px] font-semibold ${newFormWarrantyClass}`}>
                {newFormWarrantyText}
              </div>
            )}
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
            <button onClick={() => setReceiptTicket(null)} className={modalSecondaryBtnClass + ' sm:w-auto py-3 px-6 text-sm'}>
              ปิด
            </button>
            <button onClick={() => window.print()} className={modalPrimaryBtnClass + ' sm:w-auto flex items-center justify-center gap-1.5 py-3 px-6 text-sm'}>
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
          return (
            <div id="repair-receipt-print" className="space-y-3 text-xs text-slate-800 dark:text-slate-200">
              <div className="text-center pb-3 border-b border-slate-300 dark:border-white/[0.1]">
                <div className="font-extrabold text-base text-slate-900 dark:text-white">BOSS COMPUTECH</div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400">ใบรับซ่อม / ใบส่งเคลมอุปกรณ์</div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div><span className="text-slate-500 dark:text-slate-400">เลขที่:</span> <strong className="font-mono">{live.ticket_no}</strong></div>
                <div><span className="text-slate-500 dark:text-slate-400">วันที่รับ:</span> {formatThaiDateTime(live.received_at || live.created_at)}</div>
                <div><span className="text-slate-500 dark:text-slate-400">ลูกค้า:</span> <strong>{live.customer_name}</strong></div>
                <div><span className="text-slate-500 dark:text-slate-400">โทร:</span> {live.customer_phone || '-'}</div>
                <div><span className="text-slate-500 dark:text-slate-400">อุปกรณ์:</span> {live.device_model || '-'}</div>
                <div><span className="text-slate-500 dark:text-slate-400">S/N:</span> <span className="font-mono">{live.walkin_sn || '-'}</span></div>
              </div>

              <div className="p-2.5 rounded-lg bg-slate-100 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08]">
                <div><span className="text-slate-500 dark:text-slate-400">อาการเสีย:</span> <strong className="text-rose-600 dark:text-rose-300">{live.fault_symptom}</strong></div>
                <div className="mt-1"><span className="text-slate-500 dark:text-slate-400">อุปกรณ์ที่ติดมา:</span> {acc || 'ตัวเครื่องเปล่า'}</div>
              </div>

              <div className="p-2.5 rounded-lg bg-slate-100 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] space-y-1">
                <div className="font-bold text-slate-700 dark:text-slate-200">สถานะงานซ่อม</div>
                <div><span className="text-slate-500 dark:text-slate-400">ประเภท:</span> {st === 'rma_claim' ? 'ส่งเคลมประกัน (RMA)' : 'ซ่อมหน้าร้าน'}</div>
                <div><span className="text-slate-500 dark:text-slate-400">สถานะ:</span> {REPAIR_LIFECYCLE_META[lc].label}</div>
                {st === 'rma_claim' && (
                  <>
                    <div><span className="text-slate-500 dark:text-slate-400">Supplier:</span> {live.rma_supplier || '-'}</div>
                    <div><span className="text-slate-500 dark:text-slate-400">เลขใบส่งเคลม:</span> <span className="font-mono">{live.rma_tracking_no || '-'}</span></div>
                    <div><span className="text-slate-500 dark:text-slate-400">วันที่ส่งเคลม:</span> {formatDateDMY(live.rma_sent_date) || '-'}</div>
                    <div><span className="text-slate-500 dark:text-slate-400">วันที่ได้ของกลับ:</span> {formatDateDMY(live.rma_returned_date) || '-'}</div>
                    {live.replacement_sn && (
                      <div><span className="text-slate-500 dark:text-slate-400">S/N ใหม่:</span> <span className="font-mono font-bold">{live.replacement_sn}</span></div>
                    )}
                  </>
                )}
              </div>

              <div className="pt-3 border-t border-slate-300 dark:border-white/[0.1] grid grid-cols-2 gap-6 text-[11px] text-center text-slate-500 dark:text-slate-400">
                <div className="pt-6 border-t border-dashed border-slate-300 dark:border-white/[0.15]">ลายเซ็นลูกค้า</div>
                <div className="pt-6 border-t border-dashed border-slate-300 dark:border-white/[0.15]">ลายเซ็นผู้รับซ่อม</div>
              </div>
            </div>
          );
        })()}
      </Modal>

      {/* Barcode Scanner */}
      <BarcodeScannerModal
        open={scannerTarget !== null}
        onClose={() => setScannerTarget(null)}
        onScan={(code) => {
          if (scannerTarget === 'new') setSn(code);
          else if (scannerTarget === 'replacement') setReplacementSn(code);
          setScannerTarget(null);
        }}
      />
    </div>
  );
};
