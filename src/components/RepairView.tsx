import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import {
  Wrench, CheckCircle, ShieldAlert, Send, AlertTriangle,
  XCircle, Clock, Printer, Plus, X, CheckSquare, Square,
  ShieldCheck, FileText, User, Camera, ClipboardList, ArrowRight
} from 'lucide-react';
import { RepairStatus, RepairTicket, ROUTE_DEFINITIONS, getRouteByDistrict } from '../types';
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
  'สายสัญญาณ (LAN/HDMI/USB)',
  'กระเป๋า / กล่อง',
  'ตัวเครื่องเปล่า (ไม่มีอุปกรณ์ติดมา)'
];

const DISTRICT_OPTIONS = [
  'เมืองสุราษฎร์ธานี', 'พุนพิน', 'ท่าฉาง', 'ไชยา', 'ท่าชนะ',
  'คีรีรัฐนิคม', 'บ้านตาขุน', 'พนม', 'บ้านนาเดิม', 'บ้านนาสาร',
  'เวียงสระ', 'พระแสง', 'กาญจนดิษฐ์', 'ดอนสัก', 'ขนอม', 'ต่างจังหวัด / งานเหมาพิเศษ'
];

export const RepairView: React.FC = () => {
  const { repairTickets, items, completeRepairTicket, createRepairTicket, currentUser } = useApp();
  const [repairDetails, setRepairDetails] = useState<Record<string, string>>({});
  const [partsUsed, setPartsUsed] = useState<Record<string, string>>({});
  const [costInputs, setCostInputs] = useState<Record<string, string>>({});
  const [selectedOutcome, setSelectedOutcome] = useState<Record<string, RepairStatus>>({});
  const [toast, setToast] = useState('');
  const [isScannerOpen, setIsScannerOpen] = useState(false);

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

  // Modal 2: Standard Company Repair Receipt Print Modal
  const [receiptTicket, setReceiptTicket] = useState<RepairTicket | null>(null);

  // Modal 3: Repair Detail & Action Modal (opened from a compact ticket card)
  const [activeTicketId, setActiveTicketId] = useState<string | null>(null);

  const activeRepairs = repairTickets.filter(r => r.status === 'open' || r.status === 'in_progress');

  const repairsList = useListControls(activeRepairs, {
    getDate: (t) => t.created_at,
    initialSort: 'newest',
  });

  const outcomeOptions: {
    status: RepairStatus;
    label: string;
    description: string;
    badgeClass: string;
    icon: React.ElementType;
  }[] = [
      {
        status: 'repaired',
        label: '1. ซ่อมได้ (ซ่อมสำเร็จ)',
        description: 'เปลี่ยนอะไหล่/แก้ไขจุดเสียเรียบร้อย พร้อมส่งมอบคืนลูกค้า',
        badgeClass: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
        icon: CheckCircle
      },
      {
        status: 'unrepairable_warranty',
        label: '2. ซ่อมไม่ได้ ส่งประกัน (เคลมศูนย์)',
        description: 'อาการเสียระดับชิป/บอร์ด ส่งต่อศูนย์ตัวแทนเคลมประกัน',
        badgeClass: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
        icon: Send
      },
      {
        status: 'expired_warranty',
        label: '3. หมดประกัน (เสนอราคาซ่อม/ซื้อใหม่)',
        description: 'ตรวจพบว่าหมดประกันแล้ว เสนอราคาค่าอะไหล่ให้ลูกค้าตัดสินใจ',
        badgeClass: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
        icon: Clock
      },
      {
        status: 'unrepairable',
        label: '4. ซ่อมไม่ได้ (ไม่คุ้มซ่อม/คืนเครื่อง)',
        description: 'บอร์ดไหม้ ชิ้นส่วนเสียหายหนัก ไม่คุ้มค่าซ่อม แจ้งคืนเครื่อง',
        badgeClass: 'bg-rose-500/15 text-rose-400 border-rose-500/30',
        icon: XCircle
      }
    ];

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
      newFormWarrantyClass = 'bg-rose-500/15 text-rose-400 border-rose-500/30';
    } else {
      newFormWarrantyText = `อยู่ในประกัน 1 ปี (ติดวอยเมื่อ ${matchedItemNew.void_date})`;
      newFormWarrantyClass = 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30';
    }
  } else if (sn.trim().length >= 3) {
    newFormWarrantyText = 'ไม่พบประวัติวอยในระบบ (นอกประกันหรือเครื่องทั่วไป)';
    newFormWarrantyClass = 'bg-white/[0.04] text-slate-400 border-white/[0.08]';
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
    const thaiYear = new Date().getFullYear() + 543;
    const finalSn = sn.trim() || `SN-${Math.floor(1000 + Math.random() * 9000)}`;
    const ticketNo = `REP-${thaiYear}-${Math.floor(100 + Math.random() * 900)}`;

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
      finished_at: null
    });

    setToast(`เปิดใบรับซ่อม ${ticketNo} สำเร็จเรียบร้อย`);
    setIsNewTicketOpen(false);
    setCustName('');
    setCustPhone('');
    setDeviceModel('');
    setSn('');
    setFaultSymptom('');
    setTimeout(() => setToast(''), 3500);
  };

  const handleComplete = (ticketId: string) => {
    const status = selectedOutcome[ticketId] || 'repaired';
    const outcomeObj = outcomeOptions.find(o => o.status === status);
    const outcomeLabel = outcomeObj?.label || 'ซ่อมได้';

    const cost = costInputs[ticketId] ? ` [ค่าใช้จ่าย: ${costInputs[ticketId]} บาท]` : '';
    const detail = (repairDetails[ticketId]?.trim() || `ผลการวินิจฉัย: ${outcomeLabel}`) + cost;
    const parts = partsUsed[ticketId]?.trim() || '-';

    completeRepairTicket(ticketId, status, outcomeLabel, detail, parts);
    setToast(`บันทึกผลการตรวจซ่อม: "${outcomeLabel}" เรียบร้อย ส่งต่อไปรายงานซ่อมเสร็จหน้าร้านแล้ว`);
    setTimeout(() => setToast(''), 4000);
  };

  const handlePrintModal = (ticket: RepairTicket) => {
    setReceiptTicket(ticket);
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
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-4 border-b border-white/[0.08]">
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <div className="p-2 rounded-xl bg-rose-500/15 text-rose-400 border border-rose-500/30">
                <Wrench className="w-5 h-5" />
              </div>
              <span>โต๊ะช่างซ่อมในร้าน (In-House Repair Workbench & ใบรับซ่อม)</span>
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              เปิดใบรับซ่อมใหม่ (REP-2569-XXX) ตรวจสอบวอยประกัน บันทึกวิธีซ่อม/อะไหล่ และสั่งพิมพ์ใบรับซ่อมให้ลูกค้า
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
              {activeRepairs.length} งานค้างซ่อม
            </span>
          </div>
        </div>

        {activeRepairs.length === 0 ? (
          <div className="text-center py-12 text-slate-500 border border-dashed border-white/[0.1] rounded-2xl">
            <CheckCircle className="w-10 h-10 mx-auto mb-2 text-rose-400 opacity-60" />
            <p className="text-sm font-medium text-slate-200">โต๊ะช่างว่าง ไม่มีเครื่องค้างซ่อม</p>
            <p className="text-xs text-slate-500 mt-0.5">เครื่องซ่อมทั้งหมดได้รับการแก้ไขและแจ้งผลให้หน้าร้านเรียบร้อยแล้ว</p>
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
            {repairsList.pageItems.map((ticket) => {
              const matchedItem = items.find(
                i => i.serial_number && ticket.walkin_sn && i.serial_number.toLowerCase() === ticket.walkin_sn.toLowerCase()
              );

              let isWarrantyActive = false;
              let isExpired = false;
              let warrantyText = 'ไม่พบประวัติวอยเดิมในระบบ (นอกประกัน)';

              if (matchedItem && matchedItem.void_date) {
                const vDate = new Date(matchedItem.void_date);
                const expDate = new Date(vDate);
                expDate.setFullYear(expDate.getFullYear() + 1);
                isExpired = new Date() > expDate;
                isWarrantyActive = !isExpired;
                warrantyText = isExpired
                  ? `หมดประกันแล้ว (ติดวอยเมื่อ ${matchedItem.void_date})`
                  : `อยู่ในประกัน 1 ปี (ติดวอยเมื่อ ${matchedItem.void_date})`;
              }

              return (
                <div
                  key={ticket.id}
                  className="p-5 rounded-2xl liquid-glass-card flex flex-col justify-between space-y-4 border border-white/[0.08] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span className="font-mono font-extrabold text-base text-white data-key">{ticket.ticket_no}</span>
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-semibold border ${ticket.status === 'in_progress'
                        ? 'bg-amber-500/15 text-amber-400 border-amber-500/30'
                        : 'bg-sky-500/15 text-sky-400 border-sky-500/30'
                        }`}>
                        {ticket.status === 'in_progress' ? 'กำลังซ่อม' : 'รอรับงาน'}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap mb-2">
                      <span className="font-mono font-bold text-[#FF6B00] px-2 py-0.5 rounded-md bg-[#FF6B00]/15 border border-[#FF6B00]/30 text-[11px] data-key">
                        S/N: {ticket.walkin_sn || 'ไม่ระบุ'}
                      </span>
                      {ticket.device_model && (
                        <span className="px-2 py-0.5 rounded-md bg-white/[0.05] text-slate-300 text-[10px]">
                          {ticket.device_model}
                        </span>
                      )}
                      {ticket.intake_channel === 'onsite_pickup' && (
                        <span className="px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-400 border border-amber-500/30 text-[10px] font-semibold">
                          Onsite
                        </span>
                      )}
                    </div>

                    <p className="text-xs text-slate-300 data-meta">
                      ลูกค้า: <strong className="text-white font-bold">{ticket.customer_name}</strong>
                    </p>
                    <p className="text-xs text-rose-300 font-semibold mt-1 line-clamp-2">{ticket.fault_symptom}</p>

                    <div className="mt-2">
                      <span className={`inline-block px-2 py-0.5 rounded-md text-[10px] font-semibold border ${isWarrantyActive
                        ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                        : isExpired
                          ? 'bg-rose-500/15 text-rose-400 border-rose-500/30'
                          : 'bg-white/[0.04] text-slate-400 border-white/[0.08]'
                        }`}>
                        {warrantyText}
                      </span>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-white/[0.08] flex items-center gap-2">
                    <button
                      onClick={() => setActiveTicketId(ticket.id)}
                      className="flex-1 py-2.5 bg-gradient-to-r from-[#FF6B00] to-[#E65A00] hover:from-[#FF8A24] hover:brightness-105 text-black font-extrabold rounded-xl text-xs transition-all duration-150 cursor-pointer flex items-center justify-center gap-1.5 shadow-lg shadow-[#FF6B00]/25 border border-white/20 active:scale-[0.97]"
                    >
                      <ClipboardList className="w-4 h-4" />
                      <span>เปิดจัดการงานซ่อม</span>
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
        )}
      </div>

      {/* ========================================================================= */}
      {/* MODAL 3: REPAIR DETAIL & ACTION (portal + z-[9999]) */}
      {/* ========================================================================= */}
      {(() => {
        if (!activeTicketId) return null;
        const ticket = repairTickets.find(t => t.id === activeTicketId);
        if (!ticket) return null;

        const matchedItem = items.find(
          i => i.serial_number && ticket.walkin_sn && i.serial_number.toLowerCase() === ticket.walkin_sn.toLowerCase()
        );
        let warrantyText = 'ไม่พบประวัติวอยเดิมในระบบ (นอกประกัน)';
        let warrantyClass = 'bg-slate-100 text-slate-500 border-slate-200 dark:bg-white/[0.04] dark:text-slate-400 dark:border-white/[0.08]';
        if (matchedItem && matchedItem.void_date) {
          const vDate = new Date(matchedItem.void_date);
          const expDate = new Date(vDate);
          expDate.setFullYear(expDate.getFullYear() + 1);
          if (new Date() > expDate) {
            warrantyText = `หมดประกันแล้ว (ติดวอยเมื่อ ${matchedItem.void_date})`;
            warrantyClass = 'bg-rose-500/15 text-rose-500 dark:text-rose-400 border-rose-500/30';
          } else {
            warrantyText = `อยู่ในประกัน 1 ปี (ติดวอยเมื่อ ${matchedItem.void_date})`;
            warrantyClass = 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30';
          }
        }

        const currentSelectedOutcome = selectedOutcome[ticket.id] || 'repaired';

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
              <div className="flex items-center justify-between gap-2">
                <button
                  onClick={() => handlePrintModal(ticket)}
                  className={modalSecondaryBtnClass + ' flex items-center gap-1.5'}
                >
                  <Printer className="w-4 h-4" />
                  <span>พิมพ์ใบรับซ่อม</span>
                </button>
                <button
                  onClick={() => { handleComplete(ticket.id); setActiveTicketId(null); }}
                  className={modalPrimaryBtnClass + ' flex items-center gap-1.5'}
                >
                  <CheckCircle className="w-4 h-4" />
                  <span>บันทึกผลการซ่อม & ส่งต่อหน้าร้าน</span>
                </button>
              </div>
            }
          >
            <div className="space-y-4">
              {/* Customer & warranty */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="p-3 rounded-xl bg-slate-100 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08]">
                  <div className={modalLabelClass}>ลูกค้า</div>
                  <div className="font-bold text-slate-900 dark:text-white mt-0.5">{ticket.customer_name}</div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    {ticket.customer_phone || '-'} • {ticket.district || '-'}
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-slate-100 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08]">
                  <div className={modalLabelClass}>สถานะประกัน</div>
                  <span className={`inline-block mt-1 px-2 py-0.5 rounded-md text-[10px] font-semibold border ${warrantyClass}`}>
                    {warrantyText}
                  </span>
                </div>
              </div>

              {/* Symptom & accessories */}
              <div className="p-3.5 rounded-xl bg-slate-100 dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.06] text-xs space-y-2">
                <div>
                  <span className="text-slate-500 dark:text-slate-400 font-medium">อาการเสียที่ได้รับแจ้ง:</span>
                  <p className="text-rose-500 dark:text-rose-300 font-semibold text-sm mt-0.5">{ticket.fault_symptom}</p>
                </div>
                {(ticket.picked_up_by || (ticket.accessories && ticket.accessories.length > 0)) && (
                  <div className="pt-2 border-t border-slate-200 dark:border-white/[0.05] grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                    {ticket.picked_up_by && (
                      <div>
                        <span className="text-slate-500 dark:text-slate-400">ผู้รับเครื่อง: </span>
                        <span className="text-amber-600 dark:text-amber-400 font-semibold">{ticket.picked_up_by}</span>
                      </div>
                    )}
                    {ticket.accessories && ticket.accessories.length > 0 && (
                      <div>
                        <span className="text-slate-500 dark:text-slate-400">อุปกรณ์ที่ติดมาด้วย: </span>
                        <span className="text-slate-900 dark:text-white font-medium">
                          {ticket.accessories.join(', ')}
                          {ticket.accessories_other ? ` (${ticket.accessories_other})` : ''}
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Outcome options */}
              <div className="space-y-2">
                <label className="block text-xs font-bold text-slate-900 dark:text-white">
                  เลือกข้อสรุปผลการตรวจซ่อม (Select Repair Outcome) *
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {outcomeOptions.map((opt) => {
                    const Icon = opt.icon;
                    const isSelected = currentSelectedOutcome === opt.status;
                    return (
                      <div
                        key={opt.status}
                        onClick={() => setSelectedOutcome({ ...selectedOutcome, [ticket.id]: opt.status })}
                        className={`p-3 rounded-xl border transition-all cursor-pointer flex flex-col justify-between ${isSelected
                          ? `${opt.badgeClass} ring-2 ring-[#FF6B00]/40 shadow-lg`
                          : 'bg-slate-50 dark:bg-white/[0.02] border-slate-200 dark:border-white/[0.06] text-slate-500 dark:text-slate-400 hover:border-slate-300 dark:hover:border-white/[0.15]'
                          }`}
                      >
                        <div className="flex items-center gap-2 mb-1.5">
                          <Icon className="w-4 h-4 flex-shrink-0" />
                          <span className="font-bold text-xs">{opt.label}</span>
                        </div>
                        <p className="text-[10px] leading-relaxed opacity-85">{opt.description}</p>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Diagnosis / parts / cost */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className={modalLabelClass}>รายละเอียดการซ่อม / ผลการวินิจฉัย</label>
                  <input
                    type="text"
                    placeholder="เช่น ซ่อมภาคจ่ายไฟ, ลง Windows ใหม่"
                    value={repairDetails[ticket.id] || ''}
                    onChange={(e) => setRepairDetails({ ...repairDetails, [ticket.id]: e.target.value })}
                    className={modalInputClass}
                  />
                </div>
                <div>
                  <label className={modalLabelClass}>อะไหล่ที่ใช้ (Parts Used)</label>
                  <input
                    type="text"
                    placeholder="เช่น Power Supply 250W, SSD 500GB"
                    value={partsUsed[ticket.id] || ''}
                    onChange={(e) => setPartsUsed({ ...partsUsed, [ticket.id]: e.target.value })}
                    className={modalInputClass}
                  />
                </div>
                <div>
                  <label className={modalLabelClass}>ค่าใช้จ่าย / ค่าซ่อม (บาท)</label>
                  <input
                    type="number"
                    placeholder="0 (ฟรีในประกัน)"
                    value={costInputs[ticket.id] || ''}
                    onChange={(e) => setCostInputs({ ...costInputs, [ticket.id]: e.target.value })}
                    className={modalInputClass + ' font-bold text-[#FF6B00]'}
                  />
                </div>
              </div>

              {/* Activity */}
              <div className="pt-3 border-t border-slate-200 dark:border-white/[0.08] space-y-2">
                <LatestUpdateBadge
                  logs={ticket.activity_logs}
                  fallbackTimestamp={ticket.delivered_at || ticket.started_at || ticket.updated_at || ticket.created_at}
                  fallbackActor={ticket.received_by}
                />
                <ActivityTimeline logs={ticket.activity_logs} />
              </div>
            </div>
          </Modal>
        );
      })()}

      {/* ========================================================================= */}
      {/* MODAL 1: FORM เปิดใบรับซ่อมใหม่ (REP-2569-XXX) */}
      {/* ========================================================================= */}
      <Modal
        open={isNewTicketOpen}
        onClose={() => setIsNewTicketOpen(false)}
        ariaLabel="เปิดใบรับซ่อมใหม่"
        title="เปิดใบรับซ่อมใหม่ (REP-2569-XXX)"
        subtitle="บริษัท บอส คอมพิวเทค แอนด์ เซอร์วิส จำกัด - รับซ่อมหน้าร้าน"
        icon={<FileText className="w-5 h-5" />}
        maxWidthClass="max-w-lg"
      >
        <form onSubmit={handleCreateTicketSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-300 font-medium mb-1">ชื่อลูกค้า / บริษัท *</label>
              <input
                type="text"
                required
                placeholder="เช่น คุณสมชาย, บจก. สุราษฎร์ไอที"
                value={custName}
                onChange={(e) => setCustName(e.target.value)}
                className="w-full liquid-glass-input rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-slate-300 font-medium mb-1">เบอร์โทรติดต่อ</label>
              <input
                type="text"
                placeholder="08x-xxx-xxxx"
                value={custPhone}
                onChange={(e) => setCustPhone(e.target.value)}
                className="w-full liquid-glass-input rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-300 font-medium mb-1">อำเภอ / พื้นที่ *</label>
              <select
                value={district}
                onChange={(e) => setDistrict(e.target.value)}
                className="w-full liquid-glass-input rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
              >
                {DISTRICT_OPTIONS.map(d => (
                  <option key={d} value={d} className="bg-[#12141A]">{d}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-slate-300 font-medium mb-1">รุ่นสินค้า / ยี่ห้อ</label>
              <input
                type="text"
                placeholder="เช่น Epson L14150, PC Workstation"
                value={deviceModel}
                onChange={(e) => setDeviceModel(e.target.value)}
                className="w-full liquid-glass-input rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-slate-300 font-medium mb-1">
              Serial Number (S/N)
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="เช่น BC-2026-002 (ตรวจสถานะประกันอัตโนมัติ)"
                value={sn}
                onChange={(e) => setSn(e.target.value)}
                className="flex-1 liquid-glass-input rounded-xl px-3 py-2 text-xs text-[#FF6B00] font-mono focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setIsScannerOpen(true)}
                title="สแกนด้วยกล้อง"
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#FF6B00]/15 text-[#FF6B00] border border-[#FF6B00]/30 hover:bg-[#FF6B00]/25 transition-all duration-150 active:scale-[0.97] cursor-pointer text-[11px] font-bold flex-shrink-0"
              >
                <Camera className="w-4 h-4" />
                <span>สแกน</span>
              </button>
            </div>
          </div>

          {/* Warranty Check Preview */}
          {newFormWarrantyText && (
            <div className={`p-2.5 rounded-xl border text-[11px] font-medium flex items-center justify-between ${newFormWarrantyClass}`}>
              <span className="flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>{newFormWarrantyText}</span>
              </span>
              <span className="text-[10px] opacity-80">เช็คจากระบบ</span>
            </div>
          )}

          {/* Accessories Checkboxes */}
          <div>
            <label className="block text-slate-300 font-semibold mb-1.5">
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

            <div className="mt-2">
              <input
                type="text"
                placeholder="อุปกรณ์อื่นๆ เพิ่มเติม (เช่น สาย USB, ตลับหมึก, อะแดปเตอร์)"
                value={accessoriesOther}
                onChange={(e) => setAccessoriesOther(e.target.value)}
                className="w-full liquid-glass-input rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-slate-300 font-semibold mb-1">
              อาการเสียที่ได้รับแจ้ง *
            </label>
            <textarea
              rows={3}
              required
              placeholder="เช่น เปิดไม่ติด, กระดาษติด, สีไม่ออก"
              value={faultSymptom}
              onChange={(e) => setFaultSymptom(e.target.value)}
              className="w-full liquid-glass-input rounded-2xl px-3 py-2 text-white focus:outline-none"
            />
          </div>

          <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center gap-2.5 pt-2 sticky bottom-0 bg-[var(--bg-page)]/0">
            <button
              type="button"
              onClick={() => setIsNewTicketOpen(false)}
              className="w-full sm:w-1/3 py-2.5 min-h-[44px] rounded-xl liquid-glass-card text-slate-400 hover:text-white font-semibold cursor-pointer"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              className="w-full sm:w-2/3 py-2.5 min-h-[44px] bg-gradient-to-r from-[#FF6B00] to-[#E65A00] hover:from-[#FF8A24] text-black font-extrabold rounded-xl text-xs transition cursor-pointer shadow-lg shadow-[#FF6B00]/25 border border-white/20 active:scale-95"
            >
              เปิดใบรับซ่อม & บันทึกเข้าระบบ
            </button>
          </div>
        </form>
      </Modal>

      {/* ========================================================================= */}
      {/* MODAL 2: STANDARD COMPANY REPAIR RECEIPT (CSS PRINT READY) */}
      {/* ========================================================================= */}
      <Modal
        open={!!receiptTicket}
        onClose={() => setReceiptTicket(null)}
        ariaLabel="ใบรับซ่อม"
        hideHeader
        maxWidthClass="max-w-xl"
        panelClassName="print:shadow-none"
      >
        {receiptTicket && (
          <>
            {/* Printable Standard Company Document */}
            <div id="company-repair-receipt" className="space-y-4 print:text-black">
              {/* Company Header */}
              <div className="text-center pb-3 border-b border-white/[0.1] print:border-black">
                <h1 className="text-lg font-extrabold text-[#FF6B00] print:text-black tracking-wide uppercase">
                  บริษัท บอส คอมพิวเทค แอนด์ เซอร์วิส จำกัด
                </h1>
                <p className="text-[11px] text-slate-300 print:text-black mt-0.5 data-meta">
                  142/5 หมู่ 2 ต.มะขามเตี้ย อ.เมือง จ.สุราษฎร์ธานี 84000 • โทร. 077-999-888
                </p>
                <p className="text-sm font-bold text-white print:text-black mt-2 underline">
                  ใบรับเครื่องซ่อม / SERVICE REPAIR INTAKE RECEIPT
                </p>
                <div className="mt-2 inline-block px-3 py-1 rounded-full bg-[#FF6B00]/20 border border-[#FF6B00]/40 text-[#FF6B00] print:text-black font-mono font-extrabold text-sm data-key">
                  เลขที่: {receiptTicket.ticket_no}
                </div>
              </div>

              {/* Document Details Grid */}
              <div className="grid grid-cols-2 gap-2.5 text-slate-300 print:text-black text-xs">
                <div>
                  <span className="text-slate-400 print:text-gray-700">วันที่รับเครื่อง: </span>
                  <span className="font-semibold text-white print:text-black">{new Date().toLocaleString('th-TH')}</span>
                </div>
                <div>
                  <span className="text-slate-400 print:text-gray-700">อำเภอ/พื้นที่: </span>
                  <span className="font-semibold text-white print:text-black">{receiptTicket.district || 'สุราษฎร์ธานี'}</span>
                </div>
                <div>
                  <span className="text-slate-400 print:text-gray-700">ชื่อลูกค้า: </span>
                  <span className="font-bold text-white print:text-black text-sm">{receiptTicket.customer_name}</span>
                </div>
                <div>
                  <span className="text-slate-400 print:text-gray-700">เบอร์โทรศัพท์: </span>
                  <span className="font-mono text-white print:text-black">{receiptTicket.customer_phone || '-'}</span>
                </div>
                <div>
                  <span className="text-slate-400 print:text-gray-700">รุ่น/ยี่ห้อ: </span>
                  <span className="font-semibold text-white print:text-black">{receiptTicket.device_model || 'คอมพิวเตอร์/อุปกรณ์'}</span>
                </div>
                <div>
                  <span className="text-slate-400 print:text-gray-700">Serial Number (S/N): </span>
                  <span className="font-mono font-extrabold text-[#FF6B00] print:text-black data-key">{receiptTicket.walkin_sn}</span>
                </div>
              </div>

              {/* Accessories */}
              <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.08] print:border-black text-xs">
                <span className="text-slate-400 print:text-gray-700 font-semibold block mb-1">อุปกรณ์ที่นำมาด้วย:</span>
                <p className="text-white print:text-black font-medium">
                  {receiptTicket.accessories && receiptTicket.accessories.length > 0
                    ? receiptTicket.accessories.join(', ')
                    : 'ไม่มีอุปกรณ์ติดมา (ตัวเครื่องเปล่า)'}
                  {receiptTicket.accessories_other ? ` (เพิ่มเติม: ${receiptTicket.accessories_other})` : ''}
                </p>
              </div>

              {/* Symptom */}
              <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.08] print:border-black text-xs">
                <span className="text-slate-400 print:text-gray-700 font-semibold block mb-1">อาการเสียที่ได้รับแจ้ง:</span>
                <p className="text-rose-300 print:text-black font-medium">{receiptTicket.fault_symptom}</p>
              </div>

              {/* Signatures */}
              <div className="grid grid-cols-2 gap-6 pt-6 mt-4 border-t border-white/[0.1] print:border-black text-center text-xs">
                <div className="space-y-8">
                  <p className="text-slate-400 print:text-gray-700">ลงชื่อผู้ส่งเครื่องซ่อม (ลูกค้า)</p>
                  <p className="text-slate-500 print:text-black border-t border-dashed border-white/20 print:border-black pt-1">
                    (......................................................)
                  </p>
                </div>
                <div className="space-y-8">
                  <p className="text-slate-400 print:text-gray-700">ลงชื่อผู้รับเครื่อง (เจ้าหน้าที่ บอส คอมพิวเทค)</p>
                  <p className="text-slate-500 print:text-black border-t border-dashed border-white/20 print:border-black pt-1">
                    ({receiptTicket.picked_up_by || currentUser?.name || 'เจ้าหน้าที่รับเครื่อง'})
                  </p>
                </div>
              </div>

              <div className="text-[10px] text-slate-500 print:text-gray-600 text-center pt-2">
                * กรุณานำใบรับซ่อมฉบับนี้มาแสดงในวันรับเครื่องคืน หากเครื่องซ่อมเสร็จแล้วทางบริษัทจะแจ้งให้ท่านทราบทางโทรศัพท์
              </div>
            </div>

            {/* Print & Close Buttons */}
            <div className="flex items-center gap-3 pt-5 border-t border-white/[0.08] no-print">
              <button
                onClick={() => window.print()}
                className="flex-1 py-2.5 bg-[#FF6B00] hover:bg-[#E65A00] text-black font-extrabold rounded-xl text-xs transition cursor-pointer flex items-center justify-center gap-1.5 shadow-lg shadow-[#FF6B00]/25"
              >
                <Printer className="w-4 h-4" />
                <span>สั่งพิมพ์ใบรับซ่อม (Print / PDF)</span>
              </button>
              <button
                onClick={() => setReceiptTicket(null)}
                className="px-5 py-2.5 rounded-xl liquid-glass-card text-slate-300 hover:text-white font-semibold cursor-pointer"
              >
                ปิดหน้าต่าง
              </button>
            </div>
          </>
        )}
      </Modal>

      {/* Reusable camera barcode/QR scanner for device S/N intake */}
      <BarcodeScannerModal
        open={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onScan={(value) => {
          const clean = value.trim();
          if (clean) setSn(clean);
        }}
        title="สแกน S/N เครื่องซ่อม"
        hint="ส่องกล้องไปที่บาร์โค้ด/QR บนเครื่องหรือกล่อง เพื่อกรอก S/N อัตโนมัติ"
      />
    </div>
  );
};
