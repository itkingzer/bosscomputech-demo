import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { Wrench, CheckCircle, ShieldAlert, Send, AlertTriangle, XCircle, Clock } from 'lucide-react';
import { RepairStatus } from '../types';

export const RepairView: React.FC = () => {
  const { repairTickets, items, completeRepairTicket } = useApp();
  const [repairDetails, setRepairDetails] = useState<Record<string, string>>({});
  const [partsUsed, setPartsUsed] = useState<Record<string, string>>({});
  const [selectedOutcome, setSelectedOutcome] = useState<Record<string, RepairStatus>>({});
  const [toast, setToast] = useState('');

  const activeRepairs = repairTickets.filter(r => r.status === 'open' || r.status === 'in_progress');

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

  const handleComplete = (ticketId: string) => {
    const status = selectedOutcome[ticketId] || 'repaired';
    const outcomeObj = outcomeOptions.find(o => o.status === status);
    const outcomeLabel = outcomeObj?.label || 'ซ่อมได้';

    const detail = repairDetails[ticketId]?.trim() || `ผลการวินิจฉัย: ${outcomeLabel}`;
    const parts = partsUsed[ticketId]?.trim() || '-';

    completeRepairTicket(ticketId, status, outcomeLabel, detail, parts);
    setToast(`บันทึกผลการตรวจซ่อม: "${outcomeLabel}" เรียบร้อย ส่งต่อหน้าร้านแล้ว`);
    setTimeout(() => setToast(''), 3500);
  };

  return (
    <div className="space-y-6">
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 p-4 rounded-2xl liquid-glass border border-[#FF6B00] text-white text-xs flex items-center gap-2 shadow-2xl">
          <CheckCircle className="w-4 h-4 text-[#FF6B00]" />
          <span>{toast}</span>
        </div>
      )}

      <div className="liquid-glass rounded-3xl p-6 sm:p-7 shadow-2xl border border-white/[0.08]">
        <div className="flex items-center justify-between mb-6 pb-4 border-b border-white/[0.08]">
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <div className="p-2 rounded-xl bg-rose-500/15 text-rose-400 border border-rose-500/30">
                <Wrench className="w-5 h-5" />
              </div>
              <span>โต๊ะช่างซ่อมในร้าน (In-House Repair Workbench)</span>
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              ตรวจสอบสถานะประกันอัตโนมัติจากวันที่ติดวอย และเลือกข้อสรุปผลการซ่อม (ซ่อมได้ / ส่งประกัน / หมดประกัน / ซ่อมไม่ได้)
            </p>
          </div>
          <span className="text-xs px-3 py-1 rounded-full bg-rose-500/15 text-rose-400 border border-rose-500/30 font-semibold">
            {activeRepairs.length} งานค้างซ่อม
          </span>
        </div>

        {activeRepairs.length === 0 ? (
          <div className="text-center py-12 text-slate-500 border border-dashed border-white/[0.1] rounded-2xl">
            <CheckCircle className="w-10 h-10 mx-auto mb-2 text-rose-400 opacity-60" />
            <p className="text-sm font-medium text-slate-200">โต๊ะช่างว่าง ไม่มีเครื่องค้างซ่อม</p>
            <p className="text-xs text-slate-500 mt-0.5">เครื่องซ่อมทั้งหมดได้รับการแก้ไขและแจ้งผลให้หน้าร้านเรียบร้อยแล้ว</p>
          </div>
        ) : (
          <div className="space-y-5">
            {activeRepairs.map((ticket) => {
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

              const currentSelectedOutcome = selectedOutcome[ticket.id] || 'repaired';

              return (
                <div
                  key={ticket.id}
                  className="p-5 rounded-2xl liquid-glass-card space-y-4"
                >
                  {/* Ticket Header & S/N info */}
                  <div className="flex flex-col md:flex-row md:items-center justify-between pb-3 border-b border-white/[0.08] gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-sm text-slate-200">{ticket.ticket_no}</span>
                        <span className="font-mono font-bold text-[#FF6B00] px-2.5 py-0.5 rounded-full bg-[#FF6B00]/15 border border-[#FF6B00]/30 text-xs">
                          S/N: {ticket.walkin_sn || 'ไม่ระบุ'}
                        </span>
                      </div>
                      <p className="text-xs text-slate-300 mt-1">
                        ลูกค้า: <strong className="text-white">{ticket.customer_name}</strong> ({ticket.customer_phone || '-'})
                      </p>
                    </div>

                    <div>
                      <span className={`px-3 py-1 rounded-xl text-xs font-semibold border ${
                        isWarrantyActive
                          ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                          : isExpired
                          ? 'bg-rose-500/15 text-rose-400 border-rose-500/30'
                          : 'bg-white/[0.04] text-slate-400 border-white/[0.08]'
                      }`}>
                        {warrantyText}
                      </span>
                    </div>
                  </div>

                  {/* Customer Reported Symptom */}
                  <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/[0.06] text-xs">
                    <span className="text-slate-400 font-medium">อาการเสียที่ได้รับแจ้ง:</span>
                    <p className="text-rose-300 font-medium mt-0.5">{ticket.fault_symptom}</p>
                  </div>

                  {/* SELECTABLE OUTCOME OPTIONS (ข้อสรุปผลงานซ่อม) */}
                  <div>
                    <label className="block text-xs font-bold text-slate-200 mb-2">
                      ระบุผลการวินิจฉัยและการดำเนินงานของช่าง (Diagnosis & Outcome) *
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                      {outcomeOptions.map((opt) => {
                        const isSelected = currentSelectedOutcome === opt.status;
                        const Icon = opt.icon;
                        return (
                          <button
                            type="button"
                            key={opt.status}
                            onClick={() => setSelectedOutcome({ ...selectedOutcome, [ticket.id]: opt.status })}
                            className={`p-3 rounded-2xl text-left transition-all cursor-pointer border flex flex-col justify-between ${
                              isSelected
                                ? `${opt.badgeClass} ring-1 ring-[#FF6B00] shadow-lg shadow-[#FF6B00]/15`
                                : 'bg-white/[0.02] border-white/[0.06] hover:border-white/20 text-slate-300'
                            }`}
                          >
                            <div className="flex items-center justify-between mb-1">
                              <span className="font-bold text-xs flex items-center gap-1.5">
                                <Icon className="w-3.5 h-3.5" />
                                <span>{opt.label}</span>
                              </span>
                              {isSelected && <span className="w-2 h-2 rounded-full bg-[#FF6B00] animate-pulse"></span>}
                            </div>
                            <p className="text-[10px] text-slate-400 mt-1 leading-snug">{opt.description}</p>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Repair details and parts used */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                    <div>
                      <label className="block font-medium text-slate-300 mb-1">
                        รายละเอียดการซ่อม / การแก้ไข / บันทึกช่าง
                      </label>
                      <textarea
                        rows={2}
                        placeholder="เช่น ซ่อมภาคจ่ายไฟสำเร็จ / ส่งต่อศูนย์ Synnex / บอร์ดช็อตไม่คุ้มซ่อม"
                        value={repairDetails[ticket.id] !== undefined ? repairDetails[ticket.id] : (ticket.repair_detail || '')}
                        onChange={(e) => setRepairDetails({ ...repairDetails, [ticket.id]: e.target.value })}
                        className="w-full liquid-glass-input rounded-2xl px-3 py-2 text-white focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block font-medium text-slate-300 mb-1">อะไหล่ที่ใช้ (ถ้ามี)</label>
                      <textarea
                        rows={2}
                        placeholder="เช่น RAM DDR4 8GB, PSU 250W"
                        value={partsUsed[ticket.id] !== undefined ? partsUsed[ticket.id] : (ticket.parts_used || '')}
                        onChange={(e) => setPartsUsed({ ...partsUsed, [ticket.id]: e.target.value })}
                        className="w-full liquid-glass-input rounded-2xl px-3 py-2 text-white focus:outline-none"
                      />
                    </div>
                  </div>

                  {/* Submit / Finish Button */}
                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/[0.06]">
                    <button
                      onClick={() => handleComplete(ticket.id)}
                      className="px-5 py-2.5 bg-gradient-to-r from-[#FF6B00] to-[#E65A00] hover:from-[#FF8A24] hover:to-[#FF6B00] active:scale-95 text-black font-extrabold rounded-xl text-xs transition-all duration-200 cursor-pointer flex items-center gap-1.5 shadow-lg shadow-[#FF6B00]/25 border border-white/20"
                    >
                      <CheckCircle className="w-4 h-4" />
                      <span>บันทึกผลตรวจซ่อม & แจ้งหน้าร้าน</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
