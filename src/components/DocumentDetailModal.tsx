import React, { useMemo } from 'react';
import {
  CalendarClock,
  CheckCircle2,
  Clock,
  Coins,
  FileText,
  History,
  MapPin,
  Package,
  Phone,
  ShieldAlert,
  ShieldCheck,
  ShoppingCart,
  TrendingUp,
  User,
  Wrench,
} from 'lucide-react';
import { Modal } from './ui/Modal';
import {
  Item,
  Order,
  RepairTicket,
  StockPO,
  formatDateDMY,
  formatThaiDateTime,
  lookupWarrantyBySerial,
} from '../types';
import {
  buildCombinedTimeline,
  buildStockPOTimeline,
  computeFinancialSummary,
  formatBaht,
  getToneClasses,
  resolveLiveOrderStatus,
  resolveLiveSnStatus,
  resolveLiveStockPOStatus,
  resolveRepairStatus,
} from '../utils/snLookup';

export type DocumentDetailTarget =
  | { kind: 'order'; order: Order }
  | { kind: 'stock_po'; stockPO: StockPO }
  | null;

interface DocumentDetailModalProps {
  target: DocumentDetailTarget;
  items: Item[];
  repairTickets: RepairTicket[];
  onClose: () => void;
}

const DELIVERY_MODE_LABEL: Record<string, string> = {
  install: 'ส่งพร้อมติดตั้ง',
  drop_off: 'ส่งไม่ต้องติดตั้ง',
  customer_pickup: 'ลูกค้ารับเองหน้าร้าน',
  project: 'งานโครงการ',
};

export const DocumentDetailModal: React.FC<DocumentDetailModalProps> = ({
  target,
  items,
  repairTickets,
  onClose,
}) => {
  const order = target?.kind === 'order' ? target.order : null;
  const stockPO = target?.kind === 'stock_po' ? target.stockPO : null;

  const orderItems = useMemo(
    () => (order ? items.filter((it) => it.order_id === order.id) : []),
    [order, items]
  );

  const orderRepairs = useMemo(() => {
    if (!order) return [];
    const itemIds = new Set(orderItems.map((i) => i.id));
    const sns = new Set(
      orderItems.map((i) => (i.serial_number || '').trim().toLowerCase()).filter(Boolean)
    );
    return repairTickets.filter(
      (t) =>
        (t.item_id && itemIds.has(t.item_id)) ||
        (t.walkin_sn && sns.has(t.walkin_sn.trim().toLowerCase())) ||
        (t.replacement_sn && sns.has(t.replacement_sn.trim().toLowerCase()))
    );
  }, [order, orderItems, repairTickets]);

  const poItems = useMemo(
    () => (stockPO ? items.filter((it) => it.stock_po_id === stockPO.id) : []),
    [stockPO, items]
  );

  const liveStatus = useMemo(() => {
    if (order) return resolveLiveOrderStatus(order, orderItems, orderRepairs);
    if (stockPO) return resolveLiveStockPOStatus(stockPO, poItems);
    return null;
  }, [order, orderItems, orderRepairs, stockPO, poItems]);

  const financial = useMemo(() => {
    if (!order) return null;
    return computeFinancialSummary(orderItems[0] || null, order, orderRepairs);
  }, [order, orderItems, orderRepairs]);

  const timeline = useMemo(() => {
    if (order) {
      // Combine order + all its items + linked repairs
      const merged = buildCombinedTimeline(null, order, orderRepairs);
      const itemLogs = orderItems.flatMap((it) =>
        (it.activity_logs || []).map((log) => ({
          ...log,
          source: it.serial_number ? `S/N: ${it.serial_number}` : it.model_name,
        }))
      );
      const all = [...merged, ...itemLogs];
      const seen = new Set<string>();
      return all
        .filter((e) => {
          const k = `${e.timestamp}|${e.action}|${e.actor}`;
          if (seen.has(k)) return false;
          seen.add(k);
          return true;
        })
        .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    }
    if (stockPO) return buildStockPOTimeline(stockPO, poItems);
    return [];
  }, [order, orderItems, orderRepairs, stockPO, poItems]);

  if (!target || !liveStatus) return null;

  const tone = getToneClasses(liveStatus.tone);

  return (
    <Modal
      open={!!target}
      onClose={onClose}
      maxWidthClass="max-w-3xl"
      accentClass={order ? 'border-blue-500/40' : 'border-emerald-500/40'}
      icon={
        <div
          className={`p-2.5 rounded-2xl border ${
            order
              ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30'
              : 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
          }`}
        >
          {order ? <ShoppingCart className="w-5 h-5" /> : <Package className="w-5 h-5" />}
        </div>
      }
      title={
        order ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono font-extrabold text-[#FF6B00]">
              {order.sales_ref || 'SO'}
            </span>
            {order.bill_no && (
              <span className="px-2 py-0.5 rounded-lg text-[11px] font-mono font-bold bg-blue-500/15 text-blue-700 dark:text-blue-300 border border-blue-500/30">
                บิล: {order.bill_no}
              </span>
            )}
            <span className="text-slate-900 dark:text-white">{order.customer_name}</span>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono font-extrabold text-emerald-600 dark:text-emerald-400">
              {stockPO!.po_number}
            </span>
            <span className="text-slate-900 dark:text-white">{stockPO!.product_name}</span>
          </div>
        )
      }
      subtitle={
        order ? (
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>พนักงานขาย: {order.salesperson || '-'}</span>
            {order.delivery_mode && (
              <span>{DELIVERY_MODE_LABEL[order.delivery_mode] || order.delivery_mode}</span>
            )}
          </span>
        ) : (
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>Supplier: {stockPO!.supplier || '-'}</span>
            <span>จำนวนสั่งซื้อ: {stockPO!.qty} ชิ้น</span>
          </span>
        )
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
        {/* 1. Live Real-Time Status Banner */}
        <div className={`rounded-2xl p-4 border ${tone.panel}`}>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              {liveStatus.isCompleted ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
              ) : (
                <Clock className="w-5 h-5 shrink-0" />
              )}
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wide opacity-80">
                  สถานะปัจจุบัน (Real-Time)
                </div>
                <div className="text-sm sm:text-base font-extrabold">{liveStatus.label}</div>
                {liveStatus.detail && (
                  <div className="text-xs opacity-90 mt-0.5">{liveStatus.detail}</div>
                )}
              </div>
            </div>
            <div className="text-left sm:text-right text-xs space-y-0.5">
              {liveStatus.isCompleted && liveStatus.completedAt ? (
                <>
                  <div className="font-bold">
                    ปิดงานเมื่อ:{' '}
                    <span className="font-mono">{formatThaiDateTime(liveStatus.completedAt)}</span>
                  </div>
                  {liveStatus.completedBy && (
                    <div>
                      ผู้ดำเนินการ: <span className="font-bold">{liveStatus.completedBy}</span>
                    </div>
                  )}
                </>
              ) : (
                <>
                  {liveStatus.latestTimestamp && (
                    <div>
                      อัปเดตล่าสุด:{' '}
                      <span className="font-mono font-semibold">
                        {formatThaiDateTime(liveStatus.latestTimestamp)}
                      </span>
                    </div>
                  )}
                  {liveStatus.latestActor && (
                    <div>
                      โดย: <span className="font-semibold">{liveStatus.latestActor}</span>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        {/* 2. Key Info & Dates */}
        <div className="rounded-2xl border border-slate-200 dark:border-white/[0.1] bg-slate-50 dark:bg-white/[0.02] p-4">
          <h4 className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5 mb-3">
            <FileText className="w-4 h-4 text-[#FF6B00]" />
            <span>ข้อมูลเอกสาร & วันที่</span>
          </h4>
          {order ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
              <div className="p-2.5 rounded-xl bg-white dark:bg-white/[0.03] border border-slate-200/80 dark:border-white/[0.06]">
                <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1">
                  <CalendarClock className="w-3.5 h-3.5" />
                  <span>วันที่เปิดบิลขาย</span>
                </div>
                <div className="font-bold text-slate-900 dark:text-white mt-0.5 font-mono">
                  {formatThaiDateTime(order.created_at_log || order.created_at)}
                </div>
              </div>

              <div className="p-2.5 rounded-xl bg-white dark:bg-white/[0.03] border border-slate-200/80 dark:border-white/[0.06]">
                <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1">
                  <User className="w-3.5 h-3.5" />
                  <span>ลูกค้า & เบอร์ติดต่อ</span>
                </div>
                <div className="font-bold text-slate-900 dark:text-white mt-0.5">
                  {order.customer_name}
                </div>
                {order.customer_phone && (
                  <div className="text-[11px] text-slate-600 dark:text-slate-300 flex items-center gap-1 mt-0.5 font-mono">
                    <Phone className="w-3 h-3" />
                    {order.customer_phone}
                  </div>
                )}
              </div>

              <div className="p-2.5 rounded-xl bg-white dark:bg-white/[0.03] border border-slate-200/80 dark:border-white/[0.06]">
                <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5" />
                  <span>สถานที่จัดส่ง</span>
                </div>
                <div className="font-semibold text-slate-900 dark:text-white mt-0.5">
                  {order.delivery_location || '-'}
                </div>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div className="p-2.5 rounded-xl bg-white dark:bg-white/[0.03] border border-slate-200/80 dark:border-white/[0.06]">
                <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1">
                  <CalendarClock className="w-3.5 h-3.5" />
                  <span>วันที่สั่งซื้อ (PO)</span>
                </div>
                <div className="font-bold text-slate-900 dark:text-white mt-0.5 font-mono">
                  {formatThaiDateTime(stockPO!.ordered_at || stockPO!.created_at)}
                </div>
              </div>

              <div className="p-2.5 rounded-xl bg-white dark:bg-white/[0.03] border border-slate-200/80 dark:border-white/[0.06]">
                <div className="text-[11px] text-slate-500 dark:text-slate-400">วันที่รับของเข้าคลัง</div>
                <div className="font-bold text-slate-900 dark:text-white mt-0.5 font-mono">
                  {stockPO!.received_at ? formatThaiDateTime(stockPO!.received_at) : 'ยังไม่รับเข้า'}
                </div>
              </div>

              <div className="p-2.5 rounded-xl bg-white dark:bg-white/[0.03] border border-slate-200/80 dark:border-white/[0.06]">
                <div className="text-[11px] text-slate-500 dark:text-slate-400">Supplier / หมายเหตุ</div>
                <div className="font-bold text-slate-900 dark:text-white mt-0.5">
                  {stockPO!.supplier || '-'}
                </div>
                {stockPO!.notes && (
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    {stockPO!.notes}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* 3. Financial Summary */}
        {order && financial && (
          <div className="rounded-2xl border border-slate-200 dark:border-white/[0.1] bg-slate-50 dark:bg-white/[0.02] p-4">
            <h4 className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5 mb-3">
              <Coins className="w-4 h-4 text-[#FF6B00]" />
              <span>สรุปยอดทั้งหมด (Financial Summary)</span>
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
              <div className="p-3 rounded-xl bg-white dark:bg-white/[0.03] border border-slate-200/80 dark:border-white/[0.06]">
                <div className="text-[11px] text-slate-500 dark:text-slate-400">ยอดขายรวมทั้งบิล</div>
                <div className="font-mono text-sm font-extrabold text-emerald-600 dark:text-emerald-400 mt-0.5">
                  {formatBaht(financial.orderRevenue)}
                </div>
              </div>
              <div className="p-3 rounded-xl bg-white dark:bg-white/[0.03] border border-slate-200/80 dark:border-white/[0.06]">
                <div className="text-[11px] text-slate-500 dark:text-slate-400">ต้นทุนรวม</div>
                <div className="font-mono text-sm font-extrabold text-rose-600 dark:text-rose-400 mt-0.5">
                  {formatBaht(financial.orderTotalCost)}
                </div>
                {financial.extraCost > 0 && (
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
                    financial.orderGp >= 0 ? 'text-[#FF6B00]' : 'text-rose-600 dark:text-rose-400'
                  }`}
                >
                  {formatBaht(financial.orderGp)}
                </div>
              </div>
              <div className="p-3 rounded-xl bg-white dark:bg-white/[0.03] border border-slate-200/80 dark:border-white/[0.06]">
                <div className="text-[11px] text-slate-500 dark:text-slate-400">อัตรากำไร (GP %)</div>
                <div className="font-mono text-sm font-extrabold text-sky-600 dark:text-sky-400 mt-0.5">
                  {financial.orderGpPct.toFixed(1)}%
                </div>
              </div>
            </div>
          </div>
        )}

        {stockPO && (
          <div className="rounded-2xl border border-slate-200 dark:border-white/[0.1] bg-slate-50 dark:bg-white/[0.02] p-4">
            <h4 className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5 mb-3">
              <Coins className="w-4 h-4 text-[#FF6B00]" />
              <span>สรุปยอดสั่งซื้อ (Purchase Summary)</span>
            </h4>
            <div className="grid grid-cols-3 gap-2.5 text-xs">
              <div className="p-3 rounded-xl bg-white dark:bg-white/[0.03] border border-slate-200/80 dark:border-white/[0.06]">
                <div className="text-[11px] text-slate-500 dark:text-slate-400">จำนวนสั่งซื้อ</div>
                <div className="font-mono text-sm font-extrabold text-slate-900 dark:text-white mt-0.5">
                  {stockPO.qty} ชิ้น
                </div>
              </div>
              <div className="p-3 rounded-xl bg-white dark:bg-white/[0.03] border border-slate-200/80 dark:border-white/[0.06]">
                <div className="text-[11px] text-slate-500 dark:text-slate-400">ราคาทุน / หน่วย</div>
                <div className="font-mono text-sm font-extrabold text-rose-600 dark:text-rose-400 mt-0.5">
                  {formatBaht(stockPO.unit_cost)}
                </div>
              </div>
              <div className="p-3 rounded-xl bg-white dark:bg-white/[0.03] border border-slate-200/80 dark:border-white/[0.06]">
                <div className="text-[11px] text-slate-500 dark:text-slate-400">ยอดสั่งซื้อรวม</div>
                <div className="font-mono text-sm font-extrabold text-[#FF6B00] mt-0.5">
                  {formatBaht(stockPO.qty * stockPO.unit_cost)}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 4. Linked Items (S/N, Live Status & Warranty) */}
        <div className="rounded-2xl border border-slate-200 dark:border-white/[0.1] bg-slate-50 dark:bg-white/[0.02] p-4 space-y-2.5">
          <h4 className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
            <Package className="w-4 h-4 text-[#FF6B00]" />
            <span>
              {order
                ? `รายการสินค้า & S/N ในออเดอร์ (${orderItems.length > 0 ? orderItems.length : order.items_list?.length || 0} รายการ)`
                : `สินค้าที่รับเข้าคลังจาก PO นี้ (${poItems.length} ชิ้น)`}
            </span>
          </h4>

          {(order ? orderItems : poItems).length > 0 ? (
            <div className="space-y-2">
              {(order ? orderItems : poItems).map((it) => {
                const itLive = resolveLiveSnStatus(it, order, orderRepairs);
                const itTone = getToneClasses(itLive.tone);
                const w = it.serial_number
                  ? lookupWarrantyBySerial(it.serial_number, items, order ? [order] : [])
                  : null;
                return (
                  <div
                    key={it.id}
                    className="p-3 rounded-xl bg-white dark:bg-white/[0.03] border border-slate-200/80 dark:border-white/[0.06] flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                  >
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs font-extrabold text-[#FF6B00]">
                          {it.serial_number || 'รอใส่ S/N'}
                        </span>
                        <span className="font-bold text-slate-900 dark:text-white">
                          {it.model_name}
                        </span>
                      </div>
                      {w && (
                        <div className="text-[11px] flex items-center gap-1.5">
                          {w.state === 'active' ? (
                            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                          ) : (
                            <ShieldAlert className="w-3.5 h-3.5 text-slate-400" />
                          )}
                          <span className="text-slate-600 dark:text-slate-300">
                            {w.state === 'active'
                              ? `อยู่ในประกัน (${w.durationLabel}) • เริ่ม ${formatDateDMY(w.voidDate)} • หมด ${formatDateDMY(w.expireDate)}`
                              : w.state === 'expired'
                              ? `หมดประกันแล้ว (หมด ${formatDateDMY(w.expireDate)})`
                              : w.state === 'waiting'
                              ? `รอแปะวอย (${w.durationLabel})`
                              : 'ไม่มีข้อมูลประกันในระบบ'}
                          </span>
                        </div>
                      )}
                    </div>
                    <span
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border w-fit ${itTone.badge}`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${itTone.dot}`} />
                      {itLive.label}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : order?.items_list && order.items_list.length > 0 ? (
            <div className="space-y-1.5">
              {order.items_list.map((oi, idx) => (
                <div
                  key={`${oi.model_name}-${idx}`}
                  className="p-2.5 rounded-xl bg-white dark:bg-white/[0.03] border border-slate-200/80 dark:border-white/[0.06] flex items-center justify-between text-xs"
                >
                  <span className="font-semibold text-slate-900 dark:text-white">
                    {oi.model_name} × {oi.quantity} {oi.unit || 'ชิ้น'}
                  </span>
                  <span className="font-mono text-slate-700 dark:text-slate-300">
                    {oi.unit_price ? formatBaht(oi.unit_price * oi.quantity) : '-'}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-400 italic">ยังไม่มีรายการสินค้าที่ผูกกับเอกสารนี้</p>
          )}
        </div>

        {/* 4.5 Repair / RMA History for items in this SO */}
        {order && orderRepairs.length > 0 && (
          <div className="rounded-2xl border border-slate-200 dark:border-white/[0.1] bg-slate-50 dark:bg-white/[0.02] p-4 space-y-2.5">
            <h4 className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
              <Wrench className="w-4 h-4 text-rose-500" />
              <span>ประวัติงานซ่อม / ส่งเคลม ({orderRepairs.length} รายการ)</span>
            </h4>
            {orderRepairs.map((t) => {
              const tRep = resolveRepairStatus([t])!;
              const tTone = getToneClasses(tRep.status.tone);
              return (
                <div
                  key={t.id}
                  className="p-3 rounded-xl bg-white dark:bg-white/[0.03] border border-slate-200/80 dark:border-white/[0.06] text-xs space-y-1.5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono font-extrabold text-[#FF6B00]">{t.ticket_no}</span>
                      {t.walkin_sn && (
                        <span className="font-mono text-[11px] text-slate-600 dark:text-slate-300">
                          S/N: {t.walkin_sn}
                        </span>
                      )}
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

        {/* 5. Full History Timeline */}
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
            <p className="text-xs text-slate-400 italic py-2">ยังไม่มีบันทึกประวัติการดำเนินการ</p>
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
