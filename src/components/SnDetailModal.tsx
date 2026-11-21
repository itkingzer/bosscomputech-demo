import React, { useMemo } from 'react';
import {
  CalendarClock,
  CheckCircle2,
  Clock,
  Coins,
  FileText,
  Hash,
  History,
  MapPin,
  Package,
  Phone,
  ShieldAlert,
  ShieldCheck,
  TrendingUp,
  User,
  Users,
  Wrench,
} from 'lucide-react';
import { Modal } from './ui/Modal';
import { formatDateDMY, formatThaiDateTime } from '../types';
import {
  SnSearchMatch,
  buildCombinedTimeline,
  computeFinancialSummary,
  formatBaht,
  getToneClasses,
  resolveRepairStatus,
} from '../utils/snLookup';

interface SnDetailModalProps {
  match: SnSearchMatch | null;
  onClose: () => void;
}

export const SnDetailModal: React.FC<SnDetailModalProps> = ({ match, onClose }) => {
  const timeline = useMemo(
    () => (match ? buildCombinedTimeline(match.item, match.order, match.linkedRepairs) : []),
    [match]
  );

  const financial = useMemo(
    () => (match ? computeFinancialSummary(match.item, match.order, match.linkedRepairs) : null),
    [match]
  );

  if (!match) return null;

  const { item, order, linkedRepairs, deliveryStatus, repairSummary, warranty } = match;

  const technicians = Array.from(
    new Set(
      [
        item?.assigned_prep_tech || '',
        item?.assigned_onsite_tech || '',
        ...(item?.assigned_techs || []),
        ...linkedRepairs.flatMap((t) => [
          t.repaired_by || '',
          t.returned_by || '',
          t.assigned_onsite_tech || '',
          ...(t.assigned_techs || []),
        ]),
        deliveryStatus?.completedBy || '',
        repairSummary?.status.completedBy || '',
      ].filter(Boolean)
    )
  );

  const orderCreatedAt = order?.created_at_log || order?.created_at || item?.created_at || linkedRepairs[0]?.created_at;

  return (
    <Modal
      open={!!match}
      onClose={onClose}
      maxWidthClass="max-w-3xl"
      accentClass="border-[#FF6B00]/40"
      icon={
        <div className="p-2.5 rounded-2xl bg-[#FF6B00]/15 text-[#FF6B00] border border-[#FF6B00]/30">
          <Hash className="w-5 h-5" />
        </div>
      }
      title={
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono font-extrabold text-[#FF6B00]">{match.primarySn}</span>
          {match.replacementSn && match.replacementSn !== match.primarySn && (
            <span className="px-2 py-0.5 rounded-lg text-[11px] font-mono font-bold bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 border border-cyan-500/30">
              S/N ทดแทน (RMA): {match.replacementSn}
            </span>
          )}
          <span className="text-slate-900 dark:text-white">{match.modelName}</span>
        </div>
      }
      subtitle={
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span>ลูกค้า: {match.customerName}</span>
          {match.billNo && <span className="font-mono">บิล: {match.billNo}</span>}
          {match.salesRef && <span className="font-mono">SO: {match.salesRef}</span>}
          {match.ticketNo && <span className="font-mono">งานซ่อม: {match.ticketNo}</span>}
        </span>
      }
      footer={
        <div className="flex items-center justify-between gap-3">
          <span className="text-[11px] text-slate-500 dark:text-slate-400">
            อัปเดตสถานะล่าสุดแบบเรียลไทม์จากทุกบทบาทในระบบ
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-900 text-white hover:bg-slate-800 dark:bg-white/10 dark:hover:bg-white/20 transition cursor-pointer"
          >
            ปิดหน้าต่าง
          </button>
        </div>
      }
    >
      <div className="space-y-5">
        {/* 1. Separate Live Status Panels: Sales/Delivery vs Repair/RMA */}
        <div className={`grid grid-cols-1 ${deliveryStatus && repairSummary ? 'md:grid-cols-2' : ''} gap-3`}>
          {deliveryStatus && (() => {
            const dTone = getToneClasses(deliveryStatus.tone);
            return (
              <div className={`rounded-2xl p-4 border ${dTone.panel}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    {deliveryStatus.isCompleted ? (
                      <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    ) : (
                      <Clock className="w-5 h-5 shrink-0" />
                    )}
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-wide opacity-80">
                        สถานะการขาย & ส่งมอบ
                      </div>
                      <div className="text-sm sm:text-base font-extrabold">{deliveryStatus.label}</div>
                      {deliveryStatus.detail && (
                        <div className="text-xs opacity-90 mt-0.5">{deliveryStatus.detail}</div>
                      )}
                    </div>
                  </div>
                </div>
                <div className="mt-2 pt-2 border-t border-black/10 dark:border-white/10 text-[11px] flex flex-wrap gap-x-3 gap-y-0.5">
                  {deliveryStatus.isCompleted && deliveryStatus.completedAt ? (
                    <>
                      <span>ส่งมอบเมื่อ: <strong className="font-mono">{formatThaiDateTime(deliveryStatus.completedAt)}</strong></span>
                      {deliveryStatus.completedBy && <span>โดย <strong>{deliveryStatus.completedBy}</strong></span>}
                    </>
                  ) : deliveryStatus.latestTimestamp ? (
                    <>
                      <span>อัปเดต: <strong className="font-mono">{formatThaiDateTime(deliveryStatus.latestTimestamp)}</strong></span>
                      {deliveryStatus.latestActor && <span>โดย <strong>{deliveryStatus.latestActor}</strong></span>}
                    </>
                  ) : null}
                </div>
              </div>
            );
          })()}

          {repairSummary && (() => {
            const rStatus = repairSummary.status;
            const rTone = getToneClasses(rStatus.tone);
            return (
              <div className={`rounded-2xl p-4 border ${rTone.panel}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <Wrench className="w-5 h-5 shrink-0" />
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-wide opacity-80">
                        สถานะงานซ่อม / เคลม ({repairSummary.totalCount} ครั้ง)
                      </div>
                      <div className="text-sm sm:text-base font-extrabold">{rStatus.label}</div>
                      {rStatus.detail && (
                        <div className="text-xs opacity-90 mt-0.5">{rStatus.detail}</div>
                      )}
                    </div>
                  </div>
                </div>
                <div className="mt-2 pt-2 border-t border-black/10 dark:border-white/10 text-[11px] flex flex-wrap gap-x-3 gap-y-0.5">
                  {rStatus.isCompleted && rStatus.completedAt ? (
                    <>
                      <span>ส่งคืนเมื่อ: <strong className="font-mono">{formatThaiDateTime(rStatus.completedAt)}</strong></span>
                      {rStatus.completedBy && <span>โดย <strong>{rStatus.completedBy}</strong></span>}
                    </>
                  ) : rStatus.latestTimestamp ? (
                    <>
                      <span>อัปเดต: <strong className="font-mono">{formatThaiDateTime(rStatus.latestTimestamp)}</strong></span>
                      {rStatus.latestActor && <span>โดย <strong>{rStatus.latestActor}</strong></span>}
                    </>
                  ) : null}
                </div>
              </div>
            );
          })()}
        </div>

        {/* 2. Dates & Key Info */}
        <div className="rounded-2xl border border-slate-200 dark:border-white/[0.1] bg-slate-50 dark:bg-white/[0.02] p-4">
          <h4 className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5 mb-3">
            <FileText className="w-4 h-4 text-[#FF6B00]" />
            <span>ข้อมูลสำคัญ & วันที่ (Dates & Key Info)</span>
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
            <div className="p-2.5 rounded-xl bg-white dark:bg-white/[0.03] border border-slate-200/80 dark:border-white/[0.06]">
              <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1">
                <CalendarClock className="w-3.5 h-3.5" />
                <span>วันที่เปิดบิล / สร้างรายการ</span>
              </div>
              <div className="font-bold text-slate-900 dark:text-white mt-0.5 font-mono">
                {formatThaiDateTime(orderCreatedAt)}
              </div>
            </div>

            <div className="p-2.5 rounded-xl bg-white dark:bg-white/[0.03] border border-slate-200/80 dark:border-white/[0.06]">
              <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1">
                <User className="w-3.5 h-3.5" />
                <span>ลูกค้า & เบอร์ติดต่อ</span>
              </div>
              <div className="font-bold text-slate-900 dark:text-white mt-0.5">{match.customerName}</div>
              {match.customerPhone && (
                <div className="text-[11px] text-slate-600 dark:text-slate-300 flex items-center gap-1 mt-0.5 font-mono">
                  <Phone className="w-3 h-3" />
                  {match.customerPhone}
                </div>
              )}
            </div>

            <div className="p-2.5 rounded-xl bg-white dark:bg-white/[0.03] border border-slate-200/80 dark:border-white/[0.06]">
              <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5" />
                <span>สถานที่จัดส่ง / พื้นที่</span>
              </div>
              <div className="font-semibold text-slate-900 dark:text-white mt-0.5">
                {order?.delivery_location || linkedRepairs[0]?.delivery_location || '-'}
              </div>
            </div>

            <div className="p-2.5 rounded-xl bg-white dark:bg-white/[0.03] border border-slate-200/80 dark:border-white/[0.06]">
              <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1">
                <Package className="w-3.5 h-3.5" />
                <span>เลขที่เอกสารอ้างอิง</span>
              </div>
              <div className="font-mono font-bold text-[#FF6B00] mt-0.5">
                {match.billNo || match.salesRef || match.ticketNo || '-'}
              </div>
              {order?.salesperson && (
                <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  พนักงานขาย: <span className="font-semibold text-slate-700 dark:text-slate-200">{order.salesperson}</span>
                </div>
              )}
            </div>

            <div className="sm:col-span-2 p-2.5 rounded-xl bg-white dark:bg-white/[0.03] border border-slate-200/80 dark:border-white/[0.06]">
              <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1">
                <Users className="w-3.5 h-3.5" />
                <span>ช่างผู้รับผิดชอบ / ผู้ปิดงาน</span>
              </div>
              <div className="font-semibold text-slate-900 dark:text-white mt-1 flex flex-wrap gap-1.5">
                {technicians.length > 0 ? (
                  technicians.map((tech) => (
                    <span
                      key={tech}
                      className="px-2 py-0.5 rounded-lg text-[11px] font-bold bg-slate-100 dark:bg-white/[0.08] text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-white/[0.1]"
                    >
                      {tech}
                    </span>
                  ))
                ) : (
                  <span className="text-slate-400 italic">ยังไม่มีการมอบหมายช่าง</span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* 3. Warranty Details */}
        <div
          className={`rounded-2xl border p-4 ${
            warranty.state === 'active'
              ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/30'
              : warranty.state === 'expired'
              ? 'bg-rose-50 dark:bg-rose-500/10 border-rose-200 dark:border-rose-500/30'
              : warranty.state === 'waiting'
              ? 'bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/30'
              : 'bg-slate-50 dark:bg-white/[0.03] border-slate-200 dark:border-white/[0.1]'
          }`}
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
            <h4 className="text-xs font-bold flex items-center gap-1.5 text-slate-900 dark:text-white">
              {warranty.state === 'active' ? (
                <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              ) : (
                <ShieldAlert
                  className={`w-4 h-4 ${
                    warranty.state === 'expired'
                      ? 'text-rose-600 dark:text-rose-400'
                      : warranty.state === 'waiting'
                      ? 'text-amber-600 dark:text-amber-400'
                      : 'text-slate-500 dark:text-slate-400'
                  }`}
                />
              )}
              <span>สถานะรับประกันสินค้า (Warranty)</span>
            </h4>
            <span
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-extrabold border w-fit ${
                warranty.state === 'active'
                  ? 'bg-emerald-500/20 text-emerald-800 dark:text-emerald-300 border-emerald-500/40'
                  : warranty.state === 'expired'
                  ? 'bg-rose-500/20 text-rose-800 dark:text-rose-300 border-rose-500/40'
                  : warranty.state === 'waiting'
                  ? 'bg-amber-500/20 text-amber-800 dark:text-amber-300 border-amber-500/40'
                  : 'bg-slate-200 dark:bg-white/10 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-white/15'
              }`}
            >
              {warranty.state === 'active'
                ? `อยู่ในประกัน (${warranty.durationLabel})`
                : warranty.state === 'expired'
                ? 'หมดประกันแล้ว'
                : warranty.state === 'waiting'
                ? `ยังไม่เริ่มนับประกัน (${warranty.durationLabel})`
                : 'ไม่มีข้อมูลประกันในระบบ'}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
            <div className="p-2.5 rounded-xl bg-white/80 dark:bg-black/20 border border-black/5 dark:border-white/10">
              <div className="text-[11px] text-slate-500 dark:text-slate-400">วันเริ่มนับประกัน (แปะวอย)</div>
              <div className="font-mono font-bold text-slate-900 dark:text-white mt-0.5">
                {formatDateDMY(warranty.voidDate)}
              </div>
            </div>
            <div className="p-2.5 rounded-xl bg-white/80 dark:bg-black/20 border border-black/5 dark:border-white/10">
              <div className="text-[11px] text-slate-500 dark:text-slate-400">วันหมดประกัน</div>
              <div className="font-mono font-bold text-slate-900 dark:text-white mt-0.5">
                {formatDateDMY(warranty.expireDate)}
              </div>
            </div>
            <div className="p-2.5 rounded-xl bg-white/80 dark:bg-black/20 border border-black/5 dark:border-white/10">
              <div className="text-[11px] text-slate-500 dark:text-slate-400">ระยะเวลาคงเหลือ</div>
              <div className="font-bold text-slate-900 dark:text-white mt-0.5">
                {warranty.remainingLabel || (warranty.state === 'none' ? 'ไม่มีข้อมูลประกันในระบบ' : '-')}
              </div>
            </div>
          </div>
        </div>

        {/* 4. Financial Summary (สรุปยอดทั้งหมด) */}
        {financial && (
          <div className="rounded-2xl border border-slate-200 dark:border-white/[0.1] bg-slate-50 dark:bg-white/[0.02] p-4">
            <h4 className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5 mb-3">
              <Coins className="w-4 h-4 text-[#FF6B00]" />
              <span>สรุปยอดทั้งหมด (Financial Summary)</span>
            </h4>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
              <div className="p-3 rounded-xl bg-white dark:bg-white/[0.03] border border-slate-200/80 dark:border-white/[0.06]">
                <div className="text-[11px] text-slate-500 dark:text-slate-400">ราคาทุน / หน่วย</div>
                <div className="font-mono text-sm font-extrabold text-rose-600 dark:text-rose-400 mt-0.5">
                  {financial.unitCost > 0 ? formatBaht(financial.unitCost) : '-'}
                </div>
              </div>

              <div className="p-3 rounded-xl bg-white dark:bg-white/[0.03] border border-slate-200/80 dark:border-white/[0.06]">
                <div className="text-[11px] text-slate-500 dark:text-slate-400">ราคาขาย / หน่วย</div>
                <div className="font-mono text-sm font-extrabold text-emerald-600 dark:text-emerald-400 mt-0.5">
                  {financial.unitPrice > 0 ? formatBaht(financial.unitPrice) : '-'}
                </div>
              </div>

              <div className="p-3 rounded-xl bg-white dark:bg-white/[0.03] border border-slate-200/80 dark:border-white/[0.06]">
                <div className="text-[11px] text-slate-500 dark:text-slate-400">ยอดขายรวมทั้งบิล</div>
                <div className="font-mono text-sm font-extrabold text-slate-900 dark:text-white mt-0.5">
                  {financial.hasOrder ? formatBaht(financial.orderRevenue) : '-'}
                </div>
                {financial.hasOrder && financial.extraCost > 0 && (
                  <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                    ค่าดำเนินการ: {formatBaht(financial.extraCost)}
                  </div>
                )}
              </div>

              <div className="p-3 rounded-xl bg-white dark:bg-white/[0.03] border border-slate-200/80 dark:border-white/[0.06]">
                <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1">
                  <TrendingUp className="w-3 h-3 text-[#FF6B00]" />
                  <span>กำไรขั้นต้น (GP)</span>
                </div>
                <div
                  className={`font-mono text-sm font-extrabold mt-0.5 ${
                    financial.orderGp >= 0
                      ? 'text-[#FF6B00]'
                      : 'text-rose-600 dark:text-rose-400'
                  }`}
                >
                  {financial.hasOrder ? formatBaht(financial.orderGp) : '-'}
                </div>
                {financial.hasOrder && financial.orderRevenue > 0 && (
                  <div className="text-[10px] font-mono font-semibold text-sky-600 dark:text-sky-400 mt-0.5">
                    GP {financial.orderGpPct.toFixed(1)}%
                  </div>
                )}
              </div>
            </div>

            {financial.repairCostTotal > 0 && (
              <div className="mt-2.5 p-2.5 rounded-xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/30 flex items-center justify-between text-xs">
                <span className="font-semibold text-rose-700 dark:text-rose-300 flex items-center gap-1.5">
                  <Wrench className="w-3.5 h-3.5" />
                  ค่าใช้จ่ายงานซ่อมสะสม
                </span>
                <span className="font-mono font-extrabold text-rose-700 dark:text-rose-300">
                  {formatBaht(financial.repairCostTotal)}
                </span>
              </div>
            )}
          </div>
        )}

        {/* 5. Repair / RMA Summary (if any) */}
        {linkedRepairs.length > 0 && (
          <div className="rounded-2xl border border-slate-200 dark:border-white/[0.1] bg-slate-50 dark:bg-white/[0.02] p-4 space-y-2.5">
            <h4 className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
              <Wrench className="w-4 h-4 text-rose-500" />
              <span>ประวัติงานซ่อม / ส่งเคลม ({linkedRepairs.length} รายการ)</span>
            </h4>
            {linkedRepairs.map((t) => {
              const tRep = resolveRepairStatus([t])!;
              const tTone = getToneClasses(tRep.status.tone);
              return (
                <div
                  key={t.id}
                  className="p-3 rounded-xl bg-white dark:bg-white/[0.03] border border-slate-200/80 dark:border-white/[0.06] text-xs space-y-1.5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-extrabold text-[#FF6B00]">{t.ticket_no}</span>
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border ${tTone.badge}`}>
                        {tRep.status.label}
                      </span>
                    </div>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                      รับเมื่อ: {formatThaiDateTime(t.received_at || t.created_at)}
                    </span>
                  </div>
                  <div className="text-slate-700 dark:text-slate-200">
                    อาการเสีย: <span className="font-semibold">{t.fault_symptom}</span>
                  </div>
                  {(t.repaired_by || t.repair_detail || t.parts_used) && (
                    <div className="text-[11px] text-slate-600 dark:text-slate-300 flex flex-wrap gap-x-3 gap-y-0.5">
                      {t.repaired_by && <span>ช่างผู้ซ่อม: <strong>{t.repaired_by}</strong></span>}
                      {t.repair_detail && <span>รายละเอียด: {t.repair_detail}</span>}
                      {t.parts_used && <span>อะไหล่: {t.parts_used}</span>}
                    </div>
                  )}
                  {t.rma_supplier && (
                    <div className="text-[11px] text-violet-700 dark:text-violet-300">
                      ส่งเคลมศูนย์: {t.rma_supplier}
                      {t.rma_tracking_no ? ` • Tracking: ${t.rma_tracking_no}` : ''}
                      {t.replacement_sn ? ` • S/N ใหม่: ${t.replacement_sn}` : ''}
                    </div>
                  )}
                  {t.repair_outcome && (
                    <div className="text-[11px] text-emerald-700 dark:text-emerald-300">
                      ผลซ่อม: <strong>{t.repair_outcome}</strong>
                      {t.repair_cost != null && t.repair_cost > 0 ? ` • ค่าซ่อม ${formatBaht(t.repair_cost)}` : ''}
                    </div>
                  )}
                  {t.finished_at && !t.delivered_at && (
                    <div className="text-[11px] text-emerald-700 dark:text-emerald-300 font-mono">
                      ช่างซ่อมเสร็จเมื่อ: {formatThaiDateTime(t.finished_at)}
                    </div>
                  )}
                  {t.delivered_at && (
                    <div className="text-[11px] text-emerald-700 dark:text-emerald-300 font-mono">
                      ส่งคืนลูกค้าเมื่อ: {formatThaiDateTime(t.delivered_at)}
                      {t.returned_by ? ` • โดย ${t.returned_by}` : ''}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* 6. Full History Timeline (ประวัติทั้งหมด) */}
        <div className="rounded-2xl border border-slate-200 dark:border-white/[0.1] bg-slate-50 dark:bg-white/[0.02] p-4">
          <h4 className="text-xs font-bold text-slate-900 dark:text-white flex items-center justify-between gap-2 mb-3">
            <span className="flex items-center gap-1.5">
              <History className="w-4 h-4 text-[#FF6B00]" />
              <span>ประวัติทั้งหมด (Full History Timeline)</span>
            </span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-200 dark:bg-white/10 text-slate-700 dark:text-slate-300">
              {timeline.length} เหตุการณ์
            </span>
          </h4>

          {timeline.length === 0 ? (
            <p className="text-xs text-slate-400 dark:text-slate-500 italic py-2">
              ยังไม่มีบันทึกประวัติการดำเนินการในระบบ
            </p>
          ) : (
            <ol className="relative border-l-2 border-slate-200 dark:border-white/15 ml-2 space-y-3.5">
              {timeline.map((log, idx) => {
                const isLast = idx === timeline.length - 1;
                return (
                  <li key={`${log.timestamp}-${idx}`} className="ml-4 relative">
                    <span
                      className={`absolute -left-[1.35rem] top-1 w-3 h-3 rounded-full ring-4 ${
                        isLast
                          ? 'bg-emerald-500 ring-emerald-500/20'
                          : 'bg-slate-400 dark:bg-slate-500 ring-slate-200 dark:ring-white/10'
                      }`}
                    />
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className="text-xs font-bold text-slate-900 dark:text-white">
                        {log.action}
                      </span>
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-200/80 dark:bg-white/10 text-slate-600 dark:text-slate-300">
                        {log.source}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-slate-600 dark:text-slate-400 mt-0.5">
                      <span className="font-mono">{formatThaiDateTime(log.timestamp)}</span>
                      <span>
                        โดย <strong className="text-slate-800 dark:text-slate-200">{log.actor}</strong>
                      </span>
                    </div>
                    {log.note && (
                      <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-1 bg-white dark:bg-white/[0.03] px-2.5 py-1.5 rounded-lg border border-slate-200/80 dark:border-white/[0.06]">
                        {log.note}
                      </p>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </div>
    </Modal>
  );
};
