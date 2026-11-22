import {
  ActivityLog,
  Item,
  Order,
  Project,
  REPAIR_LIFECYCLE_META,
  RepairTicket,
  StockPO,
  WarrantyLookupResult,
  formatThaiDateTime,
  getLatestLog,
  lookupWarrantyBySerial,
} from '../types';

export type LiveStatusTone =
  | 'emerald'
  | 'amber'
  | 'teal'
  | 'blue'
  | 'purple'
  | 'rose'
  | 'cyan'
  | 'violet'
  | 'slate';

export interface LiveResolvedStatus {
  code: string;
  label: string;
  tone: LiveStatusTone;
  isCompleted: boolean;
  completedAt: string | null;
  completedBy: string | null;
  latestTimestamp: string | null;
  latestActor: string | null;
  latestAction: string | null;
  detail: string | null;
}

export interface LiveRepairSummary {
  totalCount: number;
  activeCount: number;
  latestTicket: RepairTicket;
  status: LiveResolvedStatus;
}

export interface SnSearchMatch {
  id: string;
  matchKind: 'item' | 'order' | 'repair' | 'project';
  primarySn: string;
  replacementSn: string | null;
  matchedViaReplacementSn: boolean;
  modelName: string;
  customerName: string;
  customerPhone: string | null;
  refNo: string | null;
  billNo: string | null;
  salesRef: string | null;
  ticketNo: string | null;
  item: Item | null;
  order: Order | null;
  project?: Project | null;
  linkedRepairs: RepairTicket[];
  liveStatus: LiveResolvedStatus;
  deliveryStatus: LiveResolvedStatus | null;
  repairSummary: LiveRepairSummary | null;
  warranty: WarrantyLookupResult;
}

export interface TimelineEntryWithSource extends ActivityLog {
  source: string;
}

export interface FinancialSummary {
  hasOrder: boolean;
  hasUnitCost: boolean;
  unitCost: number;
  unitPrice: number;
  unitGp: number;
  orderRevenue: number;
  orderItemCost: number;
  extraCost: number;
  orderTotalCost: number;
  orderGp: number;
  orderGpPct: number;
  repairCostTotal: number;
  quantity: number;
}

const COMPLETION_ACTION_REGEX =
  /ส่งมอบติดตั้งเสร็จสิ้น|ส่งมอบเครื่องซ่อมคืนลูกค้าเสร็จสิ้น|ส่งมอบคืนลูกค้า|ปิดงานซ่อม|รับเองหน้าร้าน|เสร็จสิ้น/;

function findCompletionLog(logs: ActivityLog[]): ActivityLog | null {
  const sorted = [...logs].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );
  return sorted.find((l) => COMPLETION_ACTION_REGEX.test(l.action || '')) || null;
}

function sortTicketsLatestFirst(tickets: RepairTicket[]): RepairTicket[] {
  return [...tickets].sort((a, b) => {
    const ta = new Date(a.delivered_at || a.finished_at || a.updated_at || a.created_at).getTime();
    const tb = new Date(b.delivered_at || b.finished_at || b.updated_at || b.created_at).getTime();
    return tb - ta;
  });
}

function getAllLogs(
  item: Item | null,
  order: Order | null,
  linkedRepairs: RepairTicket[]
): ActivityLog[] {
  return [
    ...(order?.activity_logs || []),
    ...(item?.activity_logs || []),
    ...linkedRepairs.flatMap((t) => t.activity_logs || []),
  ];
}

export function resolveRepairStatus(
  linkedRepairs: RepairTicket[]
): LiveRepairSummary | null {
  if (!linkedRepairs || linkedRepairs.length === 0) return null;
  const sortedRepairs = sortTicketsLatestFirst(linkedRepairs);
  const latestRepair = sortedRepairs[0];
  const isRepairTicketClosed = (t: RepairTicket) =>
    t.status === 'returned_closed' || t.repair_status === 'completed' || !!t.delivered_at;
  const activeCount = sortedRepairs.filter((t) => !isRepairTicketClosed(t)).length;
  const isRepairClosed = isRepairTicketClosed(latestRepair);

  let status: LiveResolvedStatus;

  if (!isRepairClosed) {
    const repairLog = getLatestLog(latestRepair.activity_logs);
    const rs = latestRepair.repair_status;

    if (latestRepair.status === 'on_delivery' || latestRepair.status === 'dispatched_onsite') {
      const tech =
        latestRepair.assigned_techs?.join(', ') ||
        latestRepair.assigned_onsite_tech ||
        repairLog?.actor ||
        null;
      status = {
        code: latestRepair.status,
        label: 'กำลังนำส่งคืนลูกค้า (Onsite)',
        tone: 'purple',
        isCompleted: false,
        completedAt: null,
        completedBy: null,
        latestTimestamp: latestRepair.assigned_at || repairLog?.timestamp || latestRepair.updated_at || latestRepair.created_at,
        latestActor: tech,
        latestAction: repairLog?.action || 'มอบหมายช่าง Onsite ส่งคืน',
        detail: `${latestRepair.ticket_no}${tech ? ` • ช่าง: ${tech}` : ''}`,
      };
    } else if (latestRepair.status === 'awaiting_dispatch') {
      status = {
        code: 'awaiting_dispatch',
        label: 'ซ่อมเสร็จ รอจัดคิวส่งคืน',
        tone: 'cyan',
        isCompleted: false,
        completedAt: null,
        completedBy: null,
        latestTimestamp: latestRepair.finished_at || repairLog?.timestamp || latestRepair.updated_at || latestRepair.created_at,
        latestActor: latestRepair.repaired_by || repairLog?.actor || null,
        latestAction: repairLog?.action || 'รอจัดสายรถส่งคืน',
        detail: latestRepair.ticket_no,
      };
    } else if (rs && REPAIR_LIFECYCLE_META[rs]) {
      const toneMap: Record<string, LiveStatusTone> = {
        pending_check: 'blue',
        repairing: 'amber',
        waiting_parts: 'amber',
        rma_sent: 'violet',
        rma_returned: 'cyan',
        ready_pickup: 'emerald',
      };
      status = {
        code: rs,
        label: REPAIR_LIFECYCLE_META[rs].label,
        tone: toneMap[rs] || 'rose',
        isCompleted: false,
        completedAt: null,
        completedBy: null,
        latestTimestamp: repairLog?.timestamp || latestRepair.updated_at || latestRepair.created_at,
        latestActor: repairLog?.actor || latestRepair.repaired_by || latestRepair.received_by || null,
        latestAction: repairLog?.action || REPAIR_LIFECYCLE_META[rs].label,
        detail: `${latestRepair.ticket_no}${latestRepair.rma_supplier ? ` (${latestRepair.rma_supplier})` : ''}`,
      };
    } else {
      status = {
        code: latestRepair.status,
        label: latestRepair.status === 'repaired' ? 'ซ่อมเสร็จรอส่งคืน' : 'อยู่ระหว่างซ่อม / ตรวจเช็ก',
        tone: latestRepair.status === 'repaired' ? 'cyan' : 'rose',
        isCompleted: false,
        completedAt: null,
        completedBy: null,
        latestTimestamp: repairLog?.timestamp || latestRepair.updated_at || latestRepair.created_at,
        latestActor: repairLog?.actor || latestRepair.repaired_by || latestRepair.received_by || null,
        latestAction: repairLog?.action || 'งานซ่อมในร้าน',
        detail: latestRepair.ticket_no,
      };
    }
  } else {
    const repairDoneTs =
      latestRepair.delivered_at ||
      latestRepair.finished_at ||
      getLatestLog(latestRepair.activity_logs)?.timestamp ||
      latestRepair.updated_at ||
      latestRepair.created_at;
    const repairCompLog =
      findCompletionLog(latestRepair.activity_logs || []) ||
      getLatestLog(latestRepair.activity_logs);
    const actor =
      latestRepair.returned_by ||
      repairCompLog?.actor ||
      latestRepair.repaired_by ||
      latestRepair.assigned_onsite_tech ||
      latestRepair.assigned_techs?.[0] ||
      null;
    status = {
      code: 'completed',
      label: 'ซ่อมเสร็จ & ส่งคืนแล้ว',
      tone: 'emerald',
      isCompleted: true,
      completedAt: repairDoneTs,
      completedBy: actor,
      latestTimestamp: repairDoneTs,
      latestActor: actor,
      latestAction: repairCompLog?.action || 'ส่งมอบคืนลูกค้าเรียบร้อย',
      detail: `${latestRepair.ticket_no} (ส่งคืนเครื่องซ่อม/เคลมแล้ว)`,
    };
  }

  return {
    totalCount: sortedRepairs.length,
    activeCount,
    latestTicket: latestRepair,
    status,
  };
}

export function resolveDeliveryStatus(
  item: Item | null,
  order: Order | null
): LiveResolvedStatus {
  const allLogs = getAllLogs(item, order, []);
  const latestLog = getLatestLog(allLogs);
  const completionLog = findCompletionLog(allLogs);

  // 2) Check Item / Order completion (delivered / fulfilled / completion log)
  const itemCompleted = item?.status === 'delivered' || !!item?.delivered_at;
  const orderCompleted = order?.order_status === 'fulfilled' || !!order?.fulfilled_at;
  const logCompleted = !!completionLog;

  if (itemCompleted || orderCompleted || logCompleted) {
    const completedAt =
      item?.delivered_at ||
      order?.fulfilled_at ||
      completionLog?.timestamp ||
      item?.updated_at ||
      order?.updated_at ||
      null;
    const completedBy =
      completionLog?.actor ||
      item?.assigned_onsite_tech ||
      item?.assigned_techs?.[0] ||
      item?.assigned_prep_tech ||
      order?.salesperson ||
      null;
    return {
      code: 'delivered',
      label: 'เสร็จสิ้น / ส่งมอบแล้ว',
      tone: 'emerald',
      isCompleted: true,
      completedAt,
      completedBy,
      latestTimestamp: completedAt || latestLog?.timestamp || null,
      latestActor: completedBy || latestLog?.actor || null,
      latestAction: completionLog?.action || 'ส่งมอบติดตั้งเสร็จสิ้น',
      detail: order?.delivery_mode === 'customer_pickup' ? 'ลูกค้ารับเองหน้าร้าน' : 'ส่งมอบ & ติดตั้งแล้ว',
    };
  }

  // 3) Active Item status
  if (item) {
    const itemLog = getLatestLog(item.activity_logs);
    const actor =
      itemLog?.actor ||
      item.assigned_onsite_tech ||
      item.assigned_techs?.[0] ||
      item.assigned_prep_tech ||
      null;
    const ts = itemLog?.timestamp || item.updated_at || item.created_at;

    switch (item.status) {
      case 'assigned_onsite':
        return {
          code: item.status,
          label: 'กำลังส่ง Onsite',
          tone: 'purple',
          isCompleted: false,
          completedAt: null,
          completedBy: null,
          latestTimestamp: item.assigned_at || ts,
          latestActor: item.assigned_techs?.join(', ') || item.assigned_onsite_tech || actor,
          latestAction: itemLog?.action || 'มอบหมายช่าง Onsite',
          detail: null,
        };
      case 'ready_for_dispatch':
        return {
          code: item.status,
          label: 'ติดวอยแล้ว (รอจัดส่ง)',
          tone: 'blue',
          isCompleted: false,
          completedAt: null,
          completedBy: null,
          latestTimestamp: item.warranty_applied_at || ts,
          latestActor: actor,
          latestAction: itemLog?.action || 'แปะวอยประกันพร้อมส่ง',
          detail: null,
        };
      case 'prepped_in_stock':
        return {
          code: item.status,
          label: 'เตรียมพร้อมในสต๊อก (รอปล่อย)',
          tone: 'teal',
          isCompleted: false,
          completedAt: null,
          completedBy: null,
          latestTimestamp: item.prepped_at || ts,
          latestActor: item.assigned_prep_tech || actor,
          latestAction: itemLog?.action || 'เตรียมสินค้าเสร็จสิ้น',
          detail: null,
        };
      case 'pending_prep':
      case 'pending_prep_stock':
        return {
          code: item.status,
          label: 'รอช่างติดวอย & เตรียม',
          tone: 'amber',
          isCompleted: false,
          completedAt: null,
          completedBy: null,
          latestTimestamp: ts,
          latestActor: item.assigned_prep_tech || actor,
          latestAction: itemLog?.action || 'รอช่างเตรียมสินค้า',
          detail: null,
        };
      case 'in_stock':
        return {
          code: item.status,
          label: 'ในสต๊อก (พร้อมขาย)',
          tone: 'emerald',
          isCompleted: false,
          completedAt: null,
          completedBy: null,
          latestTimestamp: item.moved_to_ready_at || ts,
          latestActor: actor,
          latestAction: itemLog?.action || 'เก็บเข้าคลังพร้อมขาย',
          detail: null,
        };
      case 'raw_stock':
        return {
          code: item.status,
          label: 'รับเข้าห้องสต๊อก (รอเตรียม)',
          tone: 'slate',
          isCompleted: false,
          completedAt: null,
          completedBy: null,
          latestTimestamp: item.received_into_storage_at || item.received_at || ts,
          latestActor: actor,
          latestAction: itemLog?.action || 'รับเข้าห้องสต๊อก',
          detail: null,
        };
      case 'in_repair':
        return {
          code: item.status,
          label: 'อยู่ระหว่างซ่อม',
          tone: 'rose',
          isCompleted: false,
          completedAt: null,
          completedBy: null,
          latestTimestamp: ts,
          latestActor: actor,
          latestAction: itemLog?.action || 'ส่งซ่อม',
          detail: null,
        };
      case 'repaired_ready_return':
        return {
          code: item.status,
          label: 'ซ่อมเสร็จรอส่งคืน',
          tone: 'cyan',
          isCompleted: false,
          completedAt: null,
          completedBy: null,
          latestTimestamp: ts,
          latestActor: actor,
          latestAction: itemLog?.action || 'ซ่อมเสร็จรอส่งคืน',
          detail: null,
        };
      case 'doa_reported':
        return {
          code: item.status,
          label: 'แจ้งเคลม DOA กลับจัดซื้อ',
          tone: 'rose',
          isCompleted: false,
          completedAt: null,
          completedBy: null,
          latestTimestamp: item.doa_reported_at || ts,
          latestActor: item.doa_reported_by || actor,
          latestAction: itemLog?.action || 'พบของเสีย DOA แจ้งกลับฝ่ายจัดซื้อ',
          detail: item.doa_reason || null,
        };
      case 'doa_sent_supplier':
        return {
          code: item.status,
          label: 'ส่งเคลม Supplier แล้ว',
          tone: 'amber',
          isCompleted: false,
          completedAt: null,
          completedBy: null,
          latestTimestamp: item.doa_sent_date || ts,
          latestActor: actor,
          latestAction: itemLog?.action || 'ส่งเคลม Supplier แล้ว',
          detail: item.doa_rma_no ? `RMA: ${item.doa_rma_no}` : null,
        };
      case 'doa_replaced':
        return {
          code: item.status,
          label: 'รับตัวใหม่จาก Supplier แล้ว',
          tone: 'emerald',
          isCompleted: true,
          completedAt: item.doa_replaced_at || ts,
          completedBy: actor,
          latestTimestamp: item.doa_replaced_at || ts,
          latestActor: actor,
          latestAction: itemLog?.action || 'รับตัวใหม่จาก Supplier แล้ว',
          detail: null,
        };
    }
  }

  // 4) Order without items yet
  if (order) {
    const orderLog = getLatestLog(order.activity_logs);
    const map: Record<string, { label: string; tone: LiveStatusTone }> = {
      pending_purchasing: { label: 'รอจัดซื้อ/เช็กสต๊อก', tone: 'amber' },
      waiting_po: { label: 'รอสั่งซื้อ (PO)', tone: 'amber' },
      po_received_in_stock: { label: 'รับของเข้าสต๊อกแล้ว', tone: 'teal' },
      approved_for_prep: { label: 'ตัดสต๊อก/ส่งช่างเตรียม', tone: 'blue' },
      fulfilled: { label: 'เสร็จสิ้น / ส่งมอบแล้ว', tone: 'emerald' },
    };
    const meta = map[order.order_status] || { label: order.order_status, tone: 'slate' as LiveStatusTone };
    return {
      code: order.order_status,
      label: meta.label,
      tone: meta.tone,
      isCompleted: order.order_status === 'fulfilled',
      completedAt: order.fulfilled_at || null,
      completedBy: orderLog?.actor || order.salesperson || null,
      latestTimestamp: orderLog?.timestamp || order.updated_at || order.created_at,
      latestActor: orderLog?.actor || order.created_by || order.salesperson || null,
      latestAction: orderLog?.action || meta.label,
      detail: null,
    };
  }

  return {
    code: 'unknown',
    label: 'ไม่พบสถานะ',
    tone: 'slate',
    isCompleted: false,
    completedAt: null,
    completedBy: null,
    latestTimestamp: latestLog?.timestamp || null,
    latestActor: latestLog?.actor || null,
    latestAction: latestLog?.action || null,
    detail: null,
  };
}

export function resolveLiveSnStatus(
  item: Item | null,
  order: Order | null,
  linkedRepairs: RepairTicket[]
): LiveResolvedStatus {
  if (item || order) return resolveDeliveryStatus(item, order);
  const rep = resolveRepairStatus(linkedRepairs);
  if (rep) return rep.status;
  return resolveDeliveryStatus(null, null);
}

function findLinkedRepairsForItem(item: Item, repairTickets: RepairTicket[]): RepairTicket[] {
  const sn = (item.serial_number || '').trim().toLowerCase();
  return repairTickets.filter((t) => {
    if (t.item_id && t.item_id === item.id) return true;
    if (!sn) return false;
    const walkin = (t.walkin_sn || '').trim().toLowerCase();
    const repl = (t.replacement_sn || '').trim().toLowerCase();
    return walkin === sn || repl === sn;
  });
}

export function searchSnRecords(
  rawQuery: string,
  items: Item[],
  orders: Order[],
  repairTickets: RepairTicket[],
  projects: Project[] = []
): SnSearchMatch[] {
  const q = rawQuery.trim().toLowerCase();
  if (!q) return [];

  const matches: SnSearchMatch[] = [];
  const coveredOrderIds = new Set<string>();
  const coveredRepairIds = new Set<string>();
  const coveredProjectIds = new Set<string>();

  // 1) Match Items by serial_number, or by their parent Order's bill_no / sales_ref, or Project id/site_name, or linked repair ticket/replacement_sn
  items.forEach((item) => {
    const sn = (item.serial_number || '').trim().toLowerCase();
    const order = item.order_id ? orders.find((o) => o.id === item.order_id) || null : null;
    const project = item.project_id ? projects.find((p) => p.id === item.project_id) || null : null;
    const bill = (order?.bill_no || '').trim().toLowerCase();
    const so = (order?.sales_ref || '').trim().toLowerCase();
    const prjId = (project?.id || item.project_id || '').trim().toLowerCase();
    const prjSite = (project?.site_name || '').trim().toLowerCase();
    const linkedRepairs = findLinkedRepairsForItem(item, repairTickets);

    const matchedReplacement = linkedRepairs.some(
      (t) => (t.replacement_sn || '').trim().toLowerCase().includes(q)
    );
    const matchedRepairTicket = linkedRepairs.some(
      (t) =>
        (t.ticket_no || '').trim().toLowerCase().includes(q) ||
        (t.walkin_sn || '').trim().toLowerCase().includes(q)
    );

    const isMatch =
      (sn && sn.includes(q)) ||
      (bill && bill.includes(q)) ||
      (so && so.includes(q)) ||
      (prjId && prjId.includes(q)) ||
      (prjSite && prjSite.includes(q)) ||
      matchedReplacement ||
      matchedRepairTicket;

    if (!isMatch) return;

    if (order) coveredOrderIds.add(order.id);
    if (project) coveredProjectIds.add(project.id);
    linkedRepairs.forEach((t) => coveredRepairIds.add(t.id));

    const replacementSn =
      linkedRepairs.find((t) => t.replacement_sn)?.replacement_sn || null;

    const warranty = item.serial_number
      ? lookupWarrantyBySerial(item.serial_number, items, orders, projects)
      : lookupWarrantyBySerial(replacementSn, items, orders, projects);

    const resolvedStatus = project && project.status === 'completed'
      ? {
          code: 'completed',
          label: 'ส่งมอบปิดโปรเจกต์แล้ว',
          tone: 'emerald' as LiveStatusTone,
          isCompleted: true,
          completedAt: project.completed_at || project.updated_at || item.delivered_at || null,
          completedBy: project.assigned_techs?.[0] || item.assigned_onsite_tech || null,
          latestTimestamp: project.completed_at || project.updated_at || item.updated_at || item.created_at,
          latestActor: project.assigned_techs?.[0] || item.assigned_onsite_tech || null,
          latestAction: 'ส่งมอบปิดโปรเจกต์เสร็จสิ้น',
          detail: `${project.id} • ${project.site_name}`,
        }
      : resolveDeliveryStatus(item, order);

    matches.push({
      id: `item-${item.id}`,
      matchKind: 'item',
      primarySn: item.serial_number || replacementSn || project?.id || order?.bill_no || order?.sales_ref || item.id,
      replacementSn,
      matchedViaReplacementSn: matchedReplacement && !(sn && sn.includes(q)),
      modelName: project ? `${item.model_name} (${project.site_name})` : item.model_name,
      customerName:
        order?.customer_name ||
        (project ? `${project.customer_name} • ${project.site_name}` : null) ||
        linkedRepairs[0]?.customer_name ||
        (item.status === 'in_stock' || item.status === 'raw_stock' ? 'สต๊อกร้าน BossComputech' : '-'),
      customerPhone: order?.customer_phone || project?.phone || linkedRepairs[0]?.customer_phone || null,
      refNo: project?.id || order?.bill_no || order?.sales_ref || linkedRepairs[0]?.ticket_no || null,
      billNo: order?.bill_no || project?.id || null,
      salesRef: order?.sales_ref || project?.id || null,
      ticketNo: linkedRepairs[0]?.ticket_no || null,
      item,
      order,
      project,
      linkedRepairs,
      liveStatus: resolvedStatus,
      deliveryStatus: resolvedStatus,
      repairSummary: resolveRepairStatus(linkedRepairs),
      warranty,
    });
  });

  // 1.5) Match Projects directly by PRJ-..., site_name, customer_name, or serial_numbers in project.items
  projects.forEach((project) => {
    const prjId = (project.id || '').trim().toLowerCase();
    const prjSite = (project.site_name || '').trim().toLowerCase();
    const prjCust = (project.customer_name || '').trim().toLowerCase();
    const allPrjSns = (project.items || []).flatMap((pi) => pi.serial_numbers || []);
    const matchedSn = allPrjSns.find((s) => s.toLowerCase().includes(q));
    if (
      coveredProjectIds.has(project.id) &&
      (!matchedSn || items.some((it) => (it.serial_number || '').toLowerCase() === matchedSn.toLowerCase()))
    ) {
      return;
    }
    if (!prjId.includes(q) && !prjSite.includes(q) && !prjCust.includes(q) && !matchedSn) return;

    const latestDaily = project.daily_logs?.[project.daily_logs.length - 1];
    const prjLog = getLatestLog(project.activity_logs);
    const isCompleted = project.status === 'completed';
    const liveStatus: LiveResolvedStatus = {
      code: project.status,
      label:
        project.status === 'completed'
          ? 'ส่งมอบปิดโปรเจกต์แล้ว'
          : project.status === 'handover_pending'
            ? 'รอส่งมอบปิดโปรเจกต์'
            : project.status === 'in_progress'
              ? `กำลังติดตั้งหน้างาน (${latestDaily?.progress_percent ?? 0}%)`
              : 'วางแผนโปรเจกต์ / รอเบิกของ',
      tone: isCompleted ? 'emerald' : project.status === 'in_progress' ? 'purple' : 'amber',
      isCompleted,
      completedAt: isCompleted ? (project.completed_at || project.updated_at || project.created_at) : null,
      completedBy: isCompleted ? (project.assigned_techs?.join(', ') || project.created_by) : null,
      latestTimestamp: prjLog?.timestamp || project.updated_at || project.created_at,
      latestActor: prjLog?.actor || project.created_by,
      latestAction: prjLog?.action || project.site_name,
      detail: `${project.id} • ${project.site_name}`,
    };

    matches.push({
      id: `project-${project.id}`,
      matchKind: 'project',
      primarySn: matchedSn || project.id,
      replacementSn: null,
      matchedViaReplacementSn: false,
      modelName: `${project.site_name} (${project.items.length} รายการ)`,
      customerName: project.customer_name,
      customerPhone: project.phone || null,
      refNo: project.id,
      billNo: project.id,
      salesRef: project.id,
      ticketNo: null,
      item: null,
      order: null,
      project,
      linkedRepairs: [],
      liveStatus,
      deliveryStatus: liveStatus,
      repairSummary: null,
      warranty: lookupWarrantyBySerial(matchedSn || null, items, orders, projects),
    });
  });

  // 2) Match Orders that don't have Item rows yet (e.g., pending_purchasing / waiting_po)
  orders.forEach((order) => {
    if (coveredOrderIds.has(order.id)) return;
    const bill = (order.bill_no || '').trim().toLowerCase();
    const so = (order.sales_ref || '').trim().toLowerCase();
    if (!(bill && bill.includes(q)) && !(so && so.includes(q))) return;

    const firstModel =
      (order.items_list || []).map((it) => it.model_name).filter(Boolean).join(', ') ||
      order._planned_model ||
      'ใบสั่งขาย (รอดำเนินการ)';

    matches.push({
      id: `order-${order.id}`,
      matchKind: 'order',
      primarySn: order.bill_no || order.sales_ref || order.id,
      replacementSn: null,
      matchedViaReplacementSn: false,
      modelName: firstModel,
      customerName: order.customer_name,
      customerPhone: order.customer_phone || null,
      refNo: order.bill_no || order.sales_ref || null,
      billNo: order.bill_no || null,
      salesRef: order.sales_ref || null,
      ticketNo: null,
      item: null,
      order,
      linkedRepairs: [],
      liveStatus: resolveDeliveryStatus(null, order),
      deliveryStatus: resolveDeliveryStatus(null, order),
      repairSummary: null,
      warranty: lookupWarrantyBySerial(null, items, orders, projects),
    });
  });

  // 3) Match standalone Repair Tickets (walk-in S/N, REP-..., or replacement_sn not linked to an Item)
  repairTickets.forEach((ticket) => {
    if (coveredRepairIds.has(ticket.id)) return;
    const walkin = (ticket.walkin_sn || '').trim().toLowerCase();
    const repl = (ticket.replacement_sn || '').trim().toLowerCase();
    const tNo = (ticket.ticket_no || '').trim().toLowerCase();

    const matchedRepl = !!(repl && repl.includes(q));
    const isMatch =
      (walkin && walkin.includes(q)) ||
      matchedRepl ||
      (tNo && tNo.includes(q));

    if (!isMatch) return;

    const warrantySn = ticket.walkin_sn || ticket.replacement_sn || null;
    const repSummary = resolveRepairStatus([ticket])!;
    matches.push({
      id: `repair-${ticket.id}`,
      matchKind: 'repair',
      primarySn: ticket.walkin_sn || ticket.replacement_sn || ticket.ticket_no,
      replacementSn: ticket.replacement_sn || null,
      matchedViaReplacementSn: matchedRepl && !(walkin && walkin.includes(q)),
      modelName: ticket.device_model || ticket.fault_symptom || 'งานซ่อม / เคลม',
      customerName: ticket.customer_name,
      customerPhone: ticket.customer_phone || null,
      refNo: ticket.ticket_no,
      billNo: null,
      salesRef: null,
      ticketNo: ticket.ticket_no,
      item: null,
      order: null,
      linkedRepairs: [ticket],
      liveStatus: repSummary.status,
      deliveryStatus: null,
      repairSummary: repSummary,
      warranty: lookupWarrantyBySerial(warrantySn, items, orders, projects),
    });
  });

  // Sort: exact S/N matches first, then most recently updated
  return matches.sort((a, b) => {
    const aExact = a.primarySn.toLowerCase() === q || (a.replacementSn || '').toLowerCase() === q ? 1 : 0;
    const bExact = b.primarySn.toLowerCase() === q || (b.replacementSn || '').toLowerCase() === q ? 1 : 0;
    if (aExact !== bExact) return bExact - aExact;
    const ta = new Date(a.liveStatus.latestTimestamp || 0).getTime();
    const tb = new Date(b.liveStatus.latestTimestamp || 0).getTime();
    return tb - ta;
  });
}

export function buildCombinedTimeline(
  item: Item | null,
  order: Order | null,
  linkedRepairs: RepairTicket[],
  project?: Project | null
): TimelineEntryWithSource[] {
  const raw: TimelineEntryWithSource[] = [];

  if (project) {
    (project.activity_logs || []).forEach((log) =>
      raw.push({ ...log, source: `โปรเจกต์ ${project.id}` })
    );
    (project.daily_logs || []).forEach((dlog) =>
      raw.push({
        timestamp: `${dlog.date}T17:00:00.000Z`,
        action: `บันทึกหน้างานรายวัน (คืบหน้า ${dlog.progress_percent}%)`,
        actor: dlog.tech_name,
        role: 'onsite',
        note: dlog.note,
        source: `ไซต์งาน ${project.id}`,
      })
    );
  }

  if (order) {
    (order.activity_logs || []).forEach((log) =>
      raw.push({ ...log, source: `ออเดอร์ ${order.sales_ref || order.bill_no || ''}`.trim() })
    );
    if ((order.activity_logs || []).length === 0 && order.created_at) {
      raw.push({
        timestamp: order.created_at_log || order.created_at,
        action: 'เปิดบิลขาย',
        actor: order.created_by || order.salesperson || 'ฝ่ายขาย',
        role: 'sales',
        note: order.bill_no ? `เลขที่บิล ${order.bill_no}` : undefined,
        source: 'ออเดอร์',
      });
    }
  }

  if (item) {
    (item.activity_logs || []).forEach((log) =>
      raw.push({ ...log, source: item.serial_number ? `S/N: ${item.serial_number}` : 'สินค้า' })
    );
    if ((item.activity_logs || []).length === 0) {
      if (item.prepped_at) {
        raw.push({
          timestamp: item.prepped_at,
          action: 'เตรียมสินค้า & บันทึก S/N',
          actor: item.assigned_prep_tech || 'ช่างเตรียมสินค้า',
          role: 'prep',
          source: 'เตรียมสินค้า',
        });
      }
      if (item.warranty_void_date) {
        raw.push({
          timestamp: item.warranty_void_date,
          action: 'แปะวอยประกันสินค้า',
          actor: item.assigned_prep_tech || 'ช่างเตรียมสินค้า',
          role: 'prep',
          source: 'วอยประกัน',
        });
      }
      if (item.delivered_at) {
        raw.push({
          timestamp: item.delivered_at,
          action: 'ส่งมอบติดตั้งเสร็จสิ้น',
          actor: item.assigned_onsite_tech || item.assigned_techs?.[0] || 'ช่าง Onsite',
          role: 'onsite',
          source: 'ส่งมอบ',
        });
      }
    }
  }

  linkedRepairs.forEach((ticket) => {
    (ticket.activity_logs || []).forEach((log) =>
      raw.push({ ...log, source: `งานซ่อม ${ticket.ticket_no}` })
    );
    if ((ticket.activity_logs || []).length === 0) {
      raw.push({
        timestamp: ticket.received_at || ticket.created_at,
        action: 'รับเครื่องเข้าซ่อม / เคลม',
        actor: ticket.received_by || 'หน้าร้าน',
        note: ticket.fault_symptom,
        source: `งานซ่อม ${ticket.ticket_no}`,
      });
      if (ticket.delivered_at || ticket.finished_at) {
        raw.push({
          timestamp: ticket.delivered_at || ticket.finished_at || ticket.created_at,
          action: ticket.delivered_at ? 'ส่งมอบคืนลูกค้าเรียบร้อย' : 'ซ่อมเสร็จสิ้น',
          actor: ticket.returned_by || ticket.repaired_by || 'ช่างซ่อม',
          source: `งานซ่อม ${ticket.ticket_no}`,
        });
      }
    }
  });

  // Deduplicate by timestamp + action
  const seen = new Set<string>();
  const deduped = raw.filter((entry) => {
    const key = `${entry.timestamp}|${entry.action}|${entry.actor}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Chronological oldest -> newest
  return deduped.sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );
}

export function computeFinancialSummary(
  item: Item | null,
  order: Order | null,
  linkedRepairs: RepairTicket[],
  project?: Project | null
): FinancialSummary {
  if (project && !order) {
    const prjItems = project.items || [];
    const matchedPrjItem = item
      ? prjItems.find((pi) => pi.id === item.project_item_id || pi.model_name === item.model_name) || prjItems[0]
      : prjItems[0];
    const unitCost = matchedPrjItem?.unit_cost ?? item?.unit_cost ?? 0;
    const unitPrice = matchedPrjItem?.unit_price ?? 0;
    const unitGp = unitPrice - unitCost;

    const orderRevenue = prjItems.reduce((sum, pi) => sum + (pi.unit_price || 0) * (pi.qty_required || 0), 0);
    const orderItemCost = prjItems.reduce((sum, pi) => sum + (pi.unit_cost || 0) * (pi.qty_required || 0), 0);
    const orderTotalCost = orderItemCost;
    const orderGp = orderRevenue - orderTotalCost;
    const orderGpPct = orderRevenue > 0 ? (orderGp / orderRevenue) * 100 : 0;
    const repairCostTotal = linkedRepairs.reduce((sum, t) => sum + (t.repair_cost || 0), 0);

    return {
      hasOrder: true,
      hasUnitCost: unitCost > 0 || orderTotalCost > 0,
      unitCost,
      unitPrice,
      unitGp,
      orderRevenue,
      orderItemCost,
      extraCost: 0,
      orderTotalCost,
      orderGp,
      orderGpPct,
      repairCostTotal,
      quantity: matchedPrjItem?.qty_required || 1,
    };
  }

  const orderItems = order?.items_list || [];
  const matchedOrderItem = item
    ? orderItems.find((oi) => oi.model_name === item.model_name) || orderItems[0]
    : orderItems[0];

  const unitCost = matchedOrderItem?.unit_cost ?? item?.unit_cost ?? 0;
  const unitPrice = matchedOrderItem?.unit_price ?? 0;
  const unitGp = unitPrice - unitCost;

  const orderRevenue = orderItems.reduce(
    (sum, oi) => sum + (oi.unit_price || 0) * (oi.quantity || 0),
    0
  );
  const orderItemCost = orderItems.reduce(
    (sum, oi) => sum + (oi.unit_cost || 0) * (oi.quantity || 0),
    0
  );
  const extraCost = order?.extra_cost || 0;
  const orderTotalCost = orderItemCost + extraCost;
  const orderGp = orderRevenue - orderTotalCost;
  const orderGpPct = orderRevenue > 0 ? (orderGp / orderRevenue) * 100 : 0;

  const repairCostTotal = linkedRepairs.reduce(
    (sum, t) => sum + (t.repair_cost || 0),
    0
  );

  return {
    hasOrder: !!order,
    hasUnitCost: unitCost > 0 || orderTotalCost > 0,
    unitCost,
    unitPrice,
    unitGp,
    orderRevenue,
    orderItemCost,
    extraCost,
    orderTotalCost,
    orderGp,
    orderGpPct,
    repairCostTotal,
    quantity: matchedOrderItem?.quantity || 1,
  };
}

export function getToneClasses(tone: LiveStatusTone): {
  badge: string;
  dot: string;
  panel: string;
} {
  switch (tone) {
    case 'emerald':
      return {
        badge: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
        dot: 'bg-emerald-500',
        panel: 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/30 text-emerald-800 dark:text-emerald-200',
      };
    case 'amber':
      return {
        badge: 'bg-amber-500/15 text-amber-800 dark:text-amber-300 border-amber-500/30',
        dot: 'bg-amber-500',
        panel: 'bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/30 text-amber-800 dark:text-amber-200',
      };
    case 'teal':
      return {
        badge: 'bg-teal-500/15 text-teal-700 dark:text-teal-300 border-teal-500/30',
        dot: 'bg-teal-500',
        panel: 'bg-teal-50 dark:bg-teal-500/10 border-teal-200 dark:border-teal-500/30 text-teal-800 dark:text-teal-200',
      };
    case 'blue':
      return {
        badge: 'bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30',
        dot: 'bg-blue-500',
        panel: 'bg-blue-50 dark:bg-blue-500/10 border-blue-200 dark:border-blue-500/30 text-blue-800 dark:text-blue-200',
      };
    case 'purple':
      return {
        badge: 'bg-purple-500/15 text-purple-700 dark:text-purple-300 border-purple-500/30',
        dot: 'bg-purple-500',
        panel: 'bg-purple-50 dark:bg-purple-500/10 border-purple-200 dark:border-purple-500/30 text-purple-800 dark:text-purple-200',
      };
    case 'rose':
      return {
        badge: 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30',
        dot: 'bg-rose-500',
        panel: 'bg-rose-50 dark:bg-rose-500/10 border-rose-200 dark:border-rose-500/30 text-rose-800 dark:text-rose-200',
      };
    case 'cyan':
      return {
        badge: 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 border-cyan-500/30',
        dot: 'bg-cyan-500',
        panel: 'bg-cyan-50 dark:bg-cyan-500/10 border-cyan-200 dark:border-cyan-500/30 text-cyan-800 dark:text-cyan-200',
      };
    case 'violet':
      return {
        badge: 'bg-violet-500/15 text-violet-700 dark:text-violet-300 border-violet-500/30',
        dot: 'bg-violet-500',
        panel: 'bg-violet-50 dark:bg-violet-500/10 border-violet-200 dark:border-violet-500/30 text-violet-800 dark:text-violet-200',
      };
    default:
      return {
        badge: 'bg-slate-500/15 text-slate-700 dark:text-slate-300 border-slate-500/30',
        dot: 'bg-slate-500',
        panel: 'bg-slate-100 dark:bg-white/[0.04] border-slate-200 dark:border-white/[0.1] text-slate-800 dark:text-slate-200',
      };
  }
}

export function formatBaht(n: number): string {
  return `฿${n.toLocaleString('th-TH', { maximumFractionDigits: 0 })}`;
}

export { formatThaiDateTime };

export function resolveLiveOrderStatus(
  order: Order,
  orderItems: Item[],
  _orderRepairs: RepairTicket[] = []
): LiveResolvedStatus {
  const itemStatuses = orderItems.map((it) => resolveDeliveryStatus(it, order));

  const allLogs = [
    ...(order.activity_logs || []),
    ...orderItems.flatMap((i) => i.activity_logs || []),
  ];
  const completionLog = findCompletionLog(allLogs);
  const allItemsCompleted =
    itemStatuses.length > 0 && itemStatuses.every((s) => s.isCompleted);

  if (
    order.order_status === 'fulfilled' ||
    !!order.fulfilled_at ||
    allItemsCompleted ||
    !!completionLog
  ) {
    const latestItemDone = itemStatuses
      .map((s) => s.completedAt)
      .filter((d): d is string => !!d)
      .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0];
    const completedAt =
      order.fulfilled_at || latestItemDone || completionLog?.timestamp || order.updated_at || null;
    const completedBy =
      completionLog?.actor ||
      itemStatuses.find((s) => s.completedBy)?.completedBy ||
      order.salesperson ||
      null;
    return {
      code: 'fulfilled',
      label: 'เสร็จสิ้น / ส่งมอบแล้ว',
      tone: 'emerald',
      isCompleted: true,
      completedAt,
      completedBy,
      latestTimestamp: completedAt,
      latestActor: completedBy,
      latestAction: completionLog?.action || 'ส่งมอบสมบูรณ์',
      detail:
        order.delivery_mode === 'customer_pickup'
          ? 'ลูกค้ารับเองหน้าร้าน'
          : `ส่งมอบครบ ${orderItems.length || order.items_list?.length || 1} รายการ`,
    };
  }

  // Pick most advanced active item status if items exist
  const priority = ['assigned_onsite', 'ready_for_dispatch', 'prepped_in_stock', 'pending_prep', 'in_repair'];
  for (const code of priority) {
    const found = itemStatuses.find((s) => s.code === code);
    if (found) return found;
  }
  if (itemStatuses[0]) return itemStatuses[0];

  return resolveDeliveryStatus(null, order);
}

export function resolveLiveStockPOStatus(
  po: StockPO,
  poItems: Item[]
): LiveResolvedStatus {
  const poLog = getLatestLog(po.activity_logs);
  if (po.status === 'cancelled') {
    return {
      code: 'cancelled',
      label: 'ยกเลิกใบสั่งซื้อ',
      tone: 'rose',
      isCompleted: false,
      completedAt: null,
      completedBy: null,
      latestTimestamp: poLog?.timestamp || po.updated_at || po.created_at,
      latestActor: poLog?.actor || po.created_by || null,
      latestAction: poLog?.action || 'ยกเลิก',
      detail: null,
    };
  }

  if (po.status === 'received' || !!po.received_at || poItems.length > 0) {
    const deliveredCount = poItems.filter((i) => i.status === 'delivered').length;
    const readyCount = poItems.filter((i) => i.status === 'in_stock').length;
    const rawCount = poItems.filter((i) => i.status === 'raw_stock').length;
    const detailParts: string[] = [];
    if (poItems.length > 0) detailParts.push(`รับเข้าคลัง ${poItems.length}/${po.qty} ชิ้น`);
    if (readyCount > 0) detailParts.push(`พร้อมขาย ${readyCount}`);
    if (rawCount > 0) detailParts.push(`รอเตรียม ${rawCount}`);
    if (deliveredCount > 0) detailParts.push(`ส่งมอบแล้ว ${deliveredCount}`);

    return {
      code: 'received',
      label: 'รับของเข้าสต๊อกแล้ว',
      tone: 'emerald',
      isCompleted: true,
      completedAt: po.received_at || poLog?.timestamp || po.updated_at || po.created_at,
      completedBy: poLog?.actor || po.created_by || null,
      latestTimestamp: po.received_at || poLog?.timestamp || po.updated_at || po.created_at,
      latestActor: poLog?.actor || po.created_by || null,
      latestAction: poLog?.action || 'รับของเข้าสต๊อก',
      detail: detailParts.join(' • ') || null,
    };
  }

  return {
    code: 'ordered',
    label: 'สั่งซื้อแล้ว (รอของเข้า)',
    tone: 'amber',
    isCompleted: false,
    completedAt: null,
    completedBy: null,
    latestTimestamp: po.ordered_at || poLog?.timestamp || po.created_at,
    latestActor: poLog?.actor || po.created_by || null,
    latestAction: poLog?.action || 'สั่งซื้อ Stock PO',
    detail: `รอรับเข้า ${po.qty} ชิ้น`,
  };
}

export function buildStockPOTimeline(
  po: StockPO,
  poItems: Item[]
): TimelineEntryWithSource[] {
  const raw: TimelineEntryWithSource[] = [];
  (po.activity_logs || []).forEach((log) =>
    raw.push({ ...log, source: `PO: ${po.po_number}` })
  );
  if ((po.activity_logs || []).length === 0) {
    raw.push({
      timestamp: po.ordered_at || po.created_at,
      action: 'สร้างใบสั่งซื้อ (Stock PO)',
      actor: po.created_by || 'จัดซื้อ',
      note: `${po.product_name} × ${po.qty} (${po.supplier})`,
      source: `PO: ${po.po_number}`,
    });
    if (po.received_at) {
      raw.push({
        timestamp: po.received_at,
        action: 'รับของเข้าห้องสต๊อก',
        actor: po.created_by || 'จัดซื้อ/สต๊อก',
        source: `PO: ${po.po_number}`,
      });
    }
  }
  poItems.forEach((it) => {
    (it.activity_logs || []).forEach((log) =>
      raw.push({
        ...log,
        source: it.serial_number ? `S/N: ${it.serial_number}` : it.model_name,
      })
    );
  });

  const seen = new Set<string>();
  return raw
    .filter((e) => {
      const k = `${e.timestamp}|${e.action}|${e.actor}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
}

export interface PurchaseSnLookupResult {
  found: boolean;
  sourceKind: 'sale' | 'rma_replacement' | 'previous_repair' | null;
  itemId: string | null;
  item: Item | null;
  order: Order | null;
  customerName: string;
  customerPhone: string;
  deviceModel: string;
  district: string;
  billNo: string | null;
  salesRef: string | null;
  warranty: WarrantyLookupResult;
}

export function lookupPurchaseBySn(
  rawSn: string | null | undefined,
  items: Item[],
  orders: Order[],
  repairTickets: RepairTicket[]
): PurchaseSnLookupResult {
  const sn = (rawSn || '').trim();
  const norm = sn.toLowerCase();
  const emptyWarranty = lookupWarrantyBySerial(null, items, orders);

  if (!norm) {
    return {
      found: false,
      sourceKind: null,
      itemId: null,
      item: null,
      order: null,
      customerName: '',
      customerPhone: '',
      deviceModel: '',
      district: '',
      billNo: null,
      salesRef: null,
      warranty: emptyWarranty,
    };
  }

  // 1) Exact match in items by serial_number (prefer items with an order_id)
  const itemMatches = items.filter(
    (it) => (it.serial_number || '').trim().toLowerCase() === norm
  );
  const matchedItem =
    itemMatches.find((it) => !!it.order_id) || itemMatches[0] || null;

  if (matchedItem) {
    const order = matchedItem.order_id
      ? orders.find((o) => o.id === matchedItem.order_id) || null
      : null;
    const warranty = lookupWarrantyBySerial(matchedItem.serial_number, items, orders);
    return {
      found: true,
      sourceKind: 'sale',
      itemId: matchedItem.id,
      item: matchedItem,
      order,
      customerName: order?.customer_name || '',
      customerPhone: order?.customer_phone || '',
      deviceModel: matchedItem.model_name || '',
      district: order?.district || '',
      billNo: order?.bill_no || null,
      salesRef: order?.sales_ref || null,
      warranty,
    };
  }

  // 2) Exact match on RMA replacement_sn or previous repair ticket walkin_sn (latest ticket first)
  const matchedTicket = [...repairTickets]
    .sort((a, b) => new Date(b.received_at || b.created_at || 0).getTime() - new Date(a.received_at || a.created_at || 0).getTime())
    .find(
      (t) =>
        (t.replacement_sn || '').trim().toLowerCase() === norm ||
        (t.walkin_sn || '').trim().toLowerCase() === norm
    );

  if (matchedTicket) {
    const isRepl = (matchedTicket.replacement_sn || '').trim().toLowerCase() === norm;
    const linkedItem = matchedTicket.item_id
      ? items.find((it) => it.id === matchedTicket.item_id) || null
      : items.find(
          (it) =>
            (it.serial_number || '').trim().toLowerCase() ===
            (matchedTicket.walkin_sn || '').trim().toLowerCase()
        ) || null;
    const linkedOrder = linkedItem?.order_id
      ? orders.find((o) => o.id === linkedItem.order_id) || null
      : null;
    const warranty = lookupWarrantyBySerial(
      linkedItem?.serial_number || matchedTicket.walkin_sn || sn,
      items,
      orders
    );

    return {
      found: true,
      sourceKind: isRepl ? 'rma_replacement' : 'previous_repair',
      itemId: linkedItem?.id || matchedTicket.item_id || null,
      item: linkedItem,
      order: linkedOrder,
      customerName: linkedOrder?.customer_name || matchedTicket.customer_name || '',
      customerPhone: linkedOrder?.customer_phone || matchedTicket.customer_phone || '',
      deviceModel: linkedItem?.model_name || matchedTicket.device_model || '',
      district: linkedOrder?.district || matchedTicket.district || '',
      billNo: linkedOrder?.bill_no || null,
      salesRef: linkedOrder?.sales_ref || null,
      warranty,
    };
  }

  return {
    found: false,
    sourceKind: null,
    itemId: null,
    item: null,
    order: null,
    customerName: '',
    customerPhone: '',
    deviceModel: '',
    district: '',
    billNo: null,
    salesRef: null,
    warranty: emptyWarranty,
  };
}
