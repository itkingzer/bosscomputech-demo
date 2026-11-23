// ==============================================================================
// Activity & Audit Log (Timestamped Activity Trail)
// ทุกเหตุการณ์สำคัญจะถูกบันทึกเป็น ISO timestamp + ชื่อพนักงานผู้กระทำ + บทบาท + หมายเหตุ
// ==============================================================================
export interface ActivityLog {
  timestamp: string;   // ISO 8601 timestamp (เช่น 2026-11-20T17:01:36.952Z)
  action: string;      // ชื่อเหตุการณ์ เช่น 'เปิดบิลขาย', 'รับของเข้าห้องสต๊อก'
  actor: string;       // ชื่อพนักงานผู้กระทำ (currentUser.name)
  role?: UserRole;     // บทบาทผู้กระทำ
  note?: string;       // รายละเอียดเพิ่มเติม
}

// แปลง ISO timestamp -> รูปแบบไทยสะอาดตา (พ.ศ. 2 หลัก / 24 ชม.) เช่น "20 พ.ย. 69 14:30"
const THAI_MONTHS_SHORT = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

export function formatThaiDateTime(iso?: string | null): string {
  if (!iso) return '-';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '-';
  const day = d.getDate();
  const month = THAI_MONTHS_SHORT[d.getMonth()];
  const buddhistYear = String((d.getFullYear() + 543) % 100).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${day} ${month} ${buddhistYear} ${hh}:${mm}`;
}

// ดึง log รายการล่าสุด (เรียงตามเวลาล่าสุดก่อน)
export function getLatestLog(logs?: ActivityLog[] | null): ActivityLog | null {
  if (!logs || logs.length === 0) return null;
  return [...logs].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];
}

// ==============================================================================
// Warranty Helpers (ประกันสินค้า - เริ่มนับตั้งแต่วันแปะวอย)
// ==============================================================================
export const WARRANTY_PRESET_YEARS = [0, 1, 2, 3, 5] as const;

// แปลงระยะเวลาประกัน (ปี/เดือน) เป็นข้อความ เช่น "ประกัน 3 ปี", "ไม่มีประกัน"
export function formatWarrantyDuration(years?: number | null, months?: number | null): string {
  const y = years || 0;
  const m = months || 0;
  if (y <= 0 && m <= 0) return 'ไม่มีประกัน';
  const parts: string[] = [];
  if (y > 0) parts.push(`${y} ปี`);
  if (m > 0) parts.push(`${m} เดือน`);
  return `ประกัน ${parts.join(' ')}`;
}

// คำนวณวันหมดประกันจาก ISO timestamp ของการแปะวอย + ระยะเวลาประกัน
export function computeWarrantyExpire(
  voidIso: string | null | undefined,
  years?: number | null,
  months?: number | null
): string | null {
  if (!voidIso) return null;
  const base = new Date(voidIso);
  if (isNaN(base.getTime())) return null;
  const y = years || 0;
  const m = months || 0;
  if (y <= 0 && m <= 0) return null;
  const exp = new Date(base);
  const targetMonth = exp.getMonth() + m;
  const targetYear = exp.getFullYear() + y + Math.floor(targetMonth / 12);
  const normalizedMonth = ((targetMonth % 12) + 12) % 12;
  const maxDayInTargetMonth = new Date(targetYear, normalizedMonth + 1, 0).getDate();
  exp.setFullYear(targetYear, normalizedMonth, Math.min(base.getDate(), maxDayInTargetMonth));
  return exp.toISOString();
}

// แสดงวันที่แบบ DD/MM/YYYY (ค.ศ.) จาก ISO timestamp
export function formatDateDMY(iso?: string | null): string {
  if (!iso) return '-';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '-';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()}`;
}

// สถานะประกันของสินค้า: waiting (รอแปะวอย) / active / expired / none
export type WarrantyState = 'waiting' | 'active' | 'expired' | 'none';

export interface WarrantyLookupResult {
  found: boolean;
  state: WarrantyState;
  serialNumber: string;
  modelName?: string;
  customerName?: string;
  billNo?: string | null;
  warrantyYears: number;
  warrantyMonths: number;
  durationLabel: string;
  voidDate: string | null;
  expireDate: string | null;
  remainingDays: number | null;
  remainingLabel: string | null;
}

export function getWarrantyState(item: {
  warranty_void_date?: string | null;
  warranty_expire_date?: string | null;
  warranty_years?: number | null;
  warranty_months?: number | null;
}): WarrantyState {
  const hasDuration = (item.warranty_years || 0) > 0 || (item.warranty_months || 0) > 0;
  if (!hasDuration) return 'none';
  if (!item.warranty_void_date) return 'waiting';
  if (!item.warranty_expire_date) return 'active';
  return new Date() > new Date(item.warranty_expire_date) ? 'expired' : 'active';
}

function formatRemainingTime(now: Date, expireDate: Date): { days: number; label: string } {
  const diffMs = expireDate.getTime() - now.getTime();
  if (diffMs <= 0) return { days: 0, label: 'หมดประกันแล้ว' };
  const totalDays = Math.ceil(diffMs / 86400000);
  if (totalDays < 30) {
    return { days: totalDays, label: `เหลืออีก ${totalDays} วัน` };
  }
  const approxMonths = Math.floor(totalDays / 30);
  const remDays = totalDays % 30;
  if (remDays === 0) {
    return { days: totalDays, label: `เหลืออีก ${totalDays} วัน (${approxMonths} เดือน)` };
  }
  return { days: totalDays, label: `เหลืออีก ${totalDays} วัน (${approxMonths} เดือน ${remDays} วัน)` };
}

export function lookupWarrantyBySerial(
  serialNumber: string | null | undefined,
  items: Item[],
  orders: Order[],
  projects?: Project[]
): WarrantyLookupResult {
  const raw = (serialNumber || '').trim();
  const normalized = raw.toLowerCase();
  if (!normalized) {
    return {
      found: false,
      state: 'none',
      serialNumber: '',
      warrantyYears: 0,
      warrantyMonths: 0,
      durationLabel: '',
      voidDate: null,
      expireDate: null,
      remainingDays: null,
      remainingLabel: null
    };
  }

  const candidates = items.filter(
    (it) => (it.serial_number || '').trim().toLowerCase() === normalized
  );
  if (candidates.length === 0) {
    return {
      found: false,
      state: 'none',
      serialNumber: raw,
      warrantyYears: 0,
      warrantyMonths: 0,
      durationLabel: '',
      voidDate: null,
      expireDate: null,
      remainingDays: null,
      remainingLabel: null
    };
  }

  // Prefer a record that has active/applied warranty dates or an attached order
  const matchedItem =
    candidates.find((c) => c.warranty_expire_date || c.warranty_void_date || c.void_date) ||
    candidates.find((c) => c.order_id) ||
    candidates[0];

  const matchedOrder = matchedItem.order_id
    ? orders.find((o) => o.id === matchedItem.order_id)
    : undefined;

  const matchedProject = matchedItem.project_id && projects
    ? projects.find((p) => p.id === matchedItem.project_id)
    : undefined;

  const matchedOrderItem =
    matchedOrder?.items_list?.find(
      (oi) => (oi.model_name || '').trim().toLowerCase() === (matchedItem.model_name || '').trim().toLowerCase()
    ) || (matchedOrder?.items_list?.length === 1 ? matchedOrder.items_list[0] : undefined);

  const matchedProjectItem = matchedProject?.items?.find(
    (pi) => pi.id === matchedItem.project_item_id || pi.model_name === matchedItem.model_name
  );

  let years = matchedItem.warranty_years ?? matchedOrderItem?.warranty_years ?? matchedProjectItem?.warranty_years ?? 0;
  let months = matchedItem.warranty_months ?? matchedOrderItem?.warranty_months ?? 0;
  const resolvedCustomerName = matchedOrder?.customer_name || (matchedProject ? `${matchedProject.customer_name} (${matchedProject.site_name})` : undefined);
  const resolvedBillNo = matchedOrder?.bill_no || matchedOrder?.sales_ref || matchedProject?.id || matchedItem.project_id || null;

  const rawVoid =
    matchedItem.warranty_void_date ||
    (matchedItem.void_date ? `${matchedItem.void_date}T00:00:00` : null) ||
    matchedItem.warranty_applied_at ||
    null;

  // Legacy items with void_date but without explicit duration default to 1 year
  if (years <= 0 && months <= 0 && rawVoid) {
    years = 1;
  }

  const expireIso =
    matchedItem.warranty_expire_date ||
    computeWarrantyExpire(rawVoid, years, months);

  const durationLabel = formatWarrantyDuration(years, months);

  if (!rawVoid && !expireIso) {
    const state: WarrantyState = years > 0 || months > 0 ? 'waiting' : 'none';
    return {
      found: true,
      state,
      serialNumber: matchedItem.serial_number || raw,
      modelName: matchedItem.model_name,
      customerName: resolvedCustomerName,
      billNo: resolvedBillNo,
      warrantyYears: years,
      warrantyMonths: months,
      durationLabel,
      voidDate: null,
      expireDate: null,
      remainingDays: null,
      remainingLabel: state === 'waiting' ? 'ยังไม่เริ่มนับประกัน (รอแปะวอย)' : null
    };
  }

  if (expireIso) {
    const now = new Date();
    const expDate = new Date(expireIso);
    if (!isNaN(expDate.getTime())) {
      if (expDate.getTime() > now.getTime()) {
        const rem = formatRemainingTime(now, expDate);
        return {
          found: true,
          state: 'active',
          serialNumber: matchedItem.serial_number || raw,
          modelName: matchedItem.model_name,
          customerName: resolvedCustomerName,
          billNo: resolvedBillNo,
          warrantyYears: years,
          warrantyMonths: months,
          durationLabel,
          voidDate: rawVoid,
          expireDate: expireIso,
          remainingDays: rem.days,
          remainingLabel: rem.label
        };
      }
      return {
        found: true,
        state: 'expired',
        serialNumber: matchedItem.serial_number || raw,
        modelName: matchedItem.model_name,
        customerName: resolvedCustomerName,
        billNo: resolvedBillNo,
        warrantyYears: years,
        warrantyMonths: months,
        durationLabel,
        voidDate: rawVoid,
        expireDate: expireIso,
        remainingDays: 0,
        remainingLabel: 'หมดประกันแล้ว'
      };
    }
  }

  return {
    found: true,
    state: 'active',
    serialNumber: matchedItem.serial_number || raw,
    modelName: matchedItem.model_name,
    customerName: resolvedCustomerName,
    billNo: resolvedBillNo,
    warrantyYears: years,
    warrantyMonths: months,
    durationLabel,
    voidDate: rawVoid,
    expireDate: expireIso,
    remainingDays: null,
    remainingLabel: null
  };
}

export type UserRole =
  | 'admin'         // Full system access, all tabs, user management, config
  | 'sales'         // 1. ฝ่ายขาย
  | 'accounting'    // 2. จัดซื้อ & สต๊อก (Purchasing & Stock)
  | 'finance'       // 3. ฝ่ายบัญชี (Accounting: วางบิล / ออกใบกำกับภาษี / ตรวจ PO & DOA)
  | 'prep'          // 4. ช่างเตรียมสินค้า (เตรียมเข้าสต๊อก / เตรียมออกไปส่ง & ติดวอย)
  | 'frontdesk'     // 5. คนนั่งหน้าร้าน / จัดคิว & รายงาน
  | 'onsite'        // 6. ช่าง Onsite (จัดส่ง & ติดตั้ง & รับเครื่องซ่อม)
  | 'repair'        // 7. ช่างซ่อมในร้าน
  | 'hr';           // 8. ฝ่ายบุคคล (HR: จัดการรายชื่อพนักงาน & สรุปภาระงาน)

export interface UserAccount {
  id: string;
  username: string;
  password?: string;
  name: string;
  nickname?: string;
  department?: string;
  is_active?: boolean;
  role: UserRole;
  avatar?: string;
  phone?: string;
  badge?: string;
  assigned_route?: RouteCode | 'all'; // สายรถประจำตัวของช่าง Onsite
}

// สายรถ 6 สาย (Route Zoning)
export type RouteCode =
  | 'route_1'  // สาย 1 (โซนเหนือ): พุนพิน, ท่าฉาง, ไชยา, ท่าชนะ
  | 'route_2'  // สาย 2 (โซนตะวันตก): คีรีรัฐนิคม, บ้านตาขุน, พนม
  | 'route_3'  // สาย 3 (โซนใต้): บ้านนาเดิม, บ้านนาสาร, เวียงสระ, พระแสง
  | 'route_4'  // สาย 4 (โซนตะวันออก): กาญจนดิษฐ์, ดอนสัก, ขนอม
  | 'route_5'  // สาย 5 (ในเมือง / รอบเมือง): เมืองสุราษฎร์ธานี
  | 'route_6'; // สาย 6 (ต่างจังหวัด / ชั่วคราว): ต่างจังหวัด / งานเหมาพิเศษ

export interface RouteInfo {
  code: RouteCode;
  name: string;
  shortName: string;
  zone: string;
  districts: string[];
  color: string;
  badgeBg: string;
  badgeBorder: string;
  badgeText: string;
}

export const ROUTE_DEFINITIONS: Record<RouteCode, RouteInfo> = {
  route_1: {
    code: 'route_1',
    name: 'สาย 1 (พุนพิน ท่าฉาง ไชยา ท่าชนะ)',
    shortName: 'สาย 1',
    zone: 'พุนพิน ท่าฉาง ไชย, ท่าชนะ',
    districts: ['พุนพิน', 'ท่าฉาง', 'ไชยา', 'ท่าชนะ'],
    color: '#38BDF8',
    badgeBg: 'bg-sky-500/15',
    badgeBorder: 'border-sky-500/30',
    badgeText: 'text-sky-400'
  },
  route_2: {
    code: 'route_2',
    name: 'สาย 2 (คีรีรัฐนิคม บ้านตาขุน พนม)',
    shortName: 'สาย 2',
    zone: 'คีรีรัฐนิคม บ้านตาขุน พนม',
    districts: ['คีรีรัฐนิคม', 'บ้านตาขุน', 'พนม'],
    color: '#A855F7',
    badgeBg: 'bg-purple-500/15',
    badgeBorder: 'border-purple-500/30',
    badgeText: 'text-purple-400'
  },
  route_3: {
    code: 'route_3',
    name: 'สาย 3 (บ้านนาเดิม บ้านนาสาร เวียงสระ พระแสง)',
    shortName: 'สาย 3',
    zone: 'บ้านนาเดิม บ้านนาสาร เวียงสระ พระแสง',
    districts: ['บ้านนาเดิม', 'บ้านนาสาร', 'เวียงสระ', 'พระแสง'],
    color: '#EC4899',
    badgeBg: 'bg-pink-500/15',
    badgeBorder: 'border-pink-500/30',
    badgeText: 'text-pink-400'
  },
  route_4: {
    code: 'route_4',
    name: 'สาย 4 (กาญจนดิษฐ์ ดอนสัก ขนอม)',
    shortName: 'สาย 4',
    zone: 'กาญจนดิษฐ์ ดอนสัก ขนอม',
    districts: ['กาญจนดิษฐ์', 'ดอนสัก', 'ขนอม'],
    color: '#10B981',
    badgeBg: 'bg-emerald-500/15',
    badgeBorder: 'border-emerald-500/30',
    badgeText: 'text-emerald-400'
  },
  route_5: {
    code: 'route_5',
    name: 'สาย 5 (ในเมือง / รอบเมือง)',
    shortName: 'สาย 5',
    zone: 'ในเมือง / รอบเมือง',
    districts: ['เมืองสุราษฎร์ธานี'],
    color: '#FF6B00',
    badgeBg: 'bg-[#FF6B00]/15',
    badgeBorder: 'border-[#FF6B00]/30',
    badgeText: 'text-[#FF6B00]'
  },
  route_6: {
    code: 'route_6',
    name: 'สาย 6 (ต่างจังหวัด / ชั่วคราว)',
    shortName: 'สาย 6',
    zone: 'ต่างจังหวัด / งานเหมาพิเศษ',
    districts: ['ต่างจังหวัด / งานเหมาพิเศษ'],
    color: '#F59E0B',
    badgeBg: 'bg-amber-500/15',
    badgeBorder: 'border-amber-500/30',
    badgeText: 'text-amber-400'
  }
};

// ฟังก์ชันคำนวณสายรถอัตโนมัติตามอำเภอ
export function getRouteByDistrict(district: string): RouteCode {
  if (['พุนพิน', 'ท่าฉาง', 'ไชยา', 'ท่าชนะ'].includes(district)) return 'route_1';
  if (['คีรีรัฐนิคม', 'บ้านตาขุน', 'พนม'].includes(district)) return 'route_2';
  if (['บ้านนาเดิม', 'บ้านนาสาร', 'เวียงสระ', 'พระแสง'].includes(district)) return 'route_3';
  if (['กาญจนดิษฐ์', 'ดอนสัก', 'ขนอม'].includes(district)) return 'route_4';
  if (district === 'เมืองสุราษฎร์ธานี') return 'route_5';
  return 'route_6';
}

export type OrderStatus =
  | 'pending_purchasing'    // รอจัดซื้อ/เช็กสต๊อก (เริ่มต้นเมื่อเซลส่งใบขาว)
  | 'waiting_po'            // รอสั่งซื้อของเข้าจาก Supplier (รอ PO)
  | 'po_received_in_stock'  // รับของเข้าสต๊อกจัดซื้อแล้ว - รอปล่อยให้ช่างเตรียม
  | 'approved_for_prep'     // ตัดสต๊อกแล้ว ส่งต่อให้ช่างเตรียม
  | 'fulfilled';            // ส่งมอบสมบูรณ์

// ประเภทบิลเอกสาร (ใบกำกับภาษี / ใบเสนอราคา)
export type BillType = 'tax_invoice' | 'cash_bill_quotation';

// หมวดหมู่การเปิดบิล (Sales / Rental / MA / Add-on)
export type BillingCategoryType = 'sales' | 'rental' | 'ma' | 'addon';

export type BillingSubType =
  | 'standard'
  | 'internet_rental'
  | 'system_rental'
  | 'equipment_rental'
  | 'ma_monthly'
  | 'ma_quarterly'
  | 'ma_yearly'
  | 'addon_service';

export type BillingCycle = 'monthly' | 'quarterly' | 'yearly';
export type ContractStatus = 'active' | 'expired' | 'cancelled';

export interface ContractItem {
  id: string;
  contract_id: string;
  product_id?: string;
  model_name: string;
  item_type: 'hardware' | 'service';
  unit: ProductUnit;
  quantity: number;
  unit_price: number;
  unit_cost: number;
  description?: string;
}

export interface Contract {
  id: string;
  contract_no: string;
  customer_id: string;
  customer_name: string;
  customer_phone?: string;
  district?: string;
  delivery_location?: string;
  contract_type: 'rental' | 'ma';
  sub_type: Exclude<BillingSubType, 'standard' | 'addon_service'>;
  billing_cycle: BillingCycle;
  start_date: string;
  end_date: string;
  status: ContractStatus;
  notes?: string;
  items: ContractItem[];
  created_at: string;
  updated_at?: string;
}

export type BillingBadgeKey =
  | 'sales'
  | 'internet_rental'
  | 'system_rental'
  | 'equipment_rental'
  | 'ma'
  | 'addon';

export const BILLING_BADGE_META: Record<BillingBadgeKey, { label: string; cls: string }> = {
  sales: {
    label: 'ขาย',
    cls: 'bg-sky-100 text-sky-800 border-sky-300 dark:bg-sky-500/15 dark:text-sky-300 dark:border-sky-500/30'
  },
  internet_rental: {
    label: 'เช่าเน็ต',
    cls: 'bg-indigo-100 text-indigo-800 border-indigo-300 dark:bg-indigo-500/15 dark:text-indigo-300 dark:border-indigo-500/30'
  },
  system_rental: {
    label: 'เช่าระบบ',
    cls: 'bg-violet-100 text-violet-800 border-violet-300 dark:bg-violet-500/15 dark:text-violet-300 dark:border-violet-500/30'
  },
  equipment_rental: {
    label: 'เช่าอุปกรณ์',
    cls: 'bg-cyan-100 text-cyan-800 border-cyan-300 dark:bg-cyan-500/15 dark:text-cyan-300 dark:border-cyan-500/30'
  },
  ma: {
    label: 'ดูแลระบบ MA',
    cls: 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30'
  },
  addon: {
    label: 'นอกสัญญา / เพิ่มเติม',
    cls: 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30'
  }
};

export function getOrderBillingBadgeKey(order: Pick<Order, 'billing_type' | 'sub_type'>): BillingBadgeKey {
  if (order.billing_type === 'rental') {
    if (order.sub_type === 'internet_rental') return 'internet_rental';
    if (order.sub_type === 'system_rental') return 'system_rental';
    return 'equipment_rental';
  }
  if (order.billing_type === 'ma') return 'ma';
  if (order.billing_type === 'addon') return 'addon';
  return 'sales';
}

// เงื่อนไขชำระเงิน
export type PaymentTerm = 'cash' | 'credit_30' | 'project' | 'government';

// ประเภทการส่งมอบ (Delivery Mode)
export type DeliveryMode = 'install' | 'drop_off' | 'customer_pickup' | 'project';

// หมวดหมู่สินค้าในแคตตาล็อก (Product Catalog)
export type ProductCategory = 'pc_notebook' | 'printer' | 'cctv_network' | 'service' | 'general';

// หน่วยนับของสินค้า/บริการ
export type ProductUnit = 'เครื่อง' | 'ชุด' | 'จุด' | 'เมตร' | 'รายการ';

export const PRODUCT_CATEGORY_LABELS: Record<ProductCategory, string> = {
  pc_notebook: 'คอมพิวเตอร์ / โน้ตบุ๊ก',
  printer: 'เครื่องพิมพ์ / สแกนเนอร์',
  cctv_network: 'กล้องวงจรปิด / ระบบเครือข่าย',
  service: 'ค่าแรง / บริการติดตั้ง',
  general: 'สินค้าทั่วไป'
};

export const PRODUCT_UNIT_OPTIONS: ProductUnit[] = ['เครื่อง', 'ชุด', 'จุด', 'เมตร', 'รายการ'];

// สินค้า/บริการที่ใช้ซ้ำได้ (Product Catalog) - เก็บใน localStorage (Demo) และ sync กับ Supabase `products`
export interface Product {
  id: string;
  name: string;
  category: ProductCategory;
  item_type: 'hardware' | 'service';
  unit: ProductUnit;
  cost_price: number;                 // ราคาทุน (INTERNAL ONLY)
  sell_price: number;                 // ราคาขาย
  created_at?: string;
  updated_at?: string;
}

export interface OrderItem {
  id?: string;
  model_name: string;
  item_type?: 'hardware' | 'service'; // อุปกรณ์/วัสดุ หรือ ค่าแรง/ค่าบริการติดตั้ง
  quantity: number;
  unit?: ProductUnit;                 // หน่วยนับ เช่น เครื่อง, ชุด, จุด, เมตร
  unit_price?: number;
  supplier?: string;
  po_no?: string;
  prep_note?: string;
  unit_cost?: number;                 // ราคาทุนต่อหน่วย (INTERNAL ONLY - ห้ามแสดงในเอกสารลูกค้า)
  warranty_years?: number;            // ระยะเวลาประกัน (ปี) - 0 = ไม่มีประกัน
  warranty_months?: number;           // ระยะเวลาประกัน (เดือน) - ใช้เมื่อต้องการระบุเป็นเดือน
}

export interface Order {
  id: string;
  sales_ref: string | null;
  salesperson?: string;               // ชื่อพนักงานขายผู้เปิดบิล (auto-tag จาก logged-in user)
  customer_name: string;
  customer_phone?: string;
  delivery_location: string;
  district?: string;
  route_code?: RouteCode;
  province_custom?: string;
  delivery_date?: string;             // วันที่ส่งมอบ
  bill_type?: BillType;               // ประเภทบิล (ใบกำกับภาษี / บิลเงินสด-ใบเสนอราคา)
  payment_term?: PaymentTerm;         // เงื่อนไขการชำระเงิน
  delivery_mode?: DeliveryMode;       // ประเภทการส่งมอบ (ส่งพร้อมติดตั้ง, ส่งไม่ต้องติดตั้ง, ลูกค้ารับเอง)
  site_notes?: string;                // หมายเหตุหน้างาน
  bill_no: string | null;
  order_status: OrderStatus;
  items_list?: OrderItem[];           // รายการสินค้าหลายรายการใน 1 บิล
  extra_cost?: number;                // ต้นทุนค่าแรง/ค่าดำเนินการอื่นต่อออเดอร์ (INTERNAL ONLY)
  deposit_amount?: number;            // ยอดเงินมัดจำที่รับแล้ว (บาท)
  created_at: string;
  updated_at?: string;
  _planned_model?: string;
  _planned_quantity?: number;
  // --- Activity & Audit Log ---
  activity_logs?: ActivityLog[];
  created_by?: string;                // ชื่อพนักงานผู้เปิดบิล
  created_at_log?: string;            // ISO timestamp เปิดบิลขาย
  po_created_at?: string | null;      // ISO timestamp สั่งซื้อ PO
  po_received_at?: string | null;     // ISO timestamp รับของเข้าสต๊อก
  stock_cut_at?: string | null;       // ISO timestamp ตัดสต๊อกส่งช่างเตรียม
  dispatched_at?: string | null;      // ISO timestamp ปล่อยรถส่งของ / ลูกค้ารับ
  fulfilled_at?: string | null;       // ISO timestamp ส่งมอบสมบูรณ์
  // --- Accounting / Billing ---
  billing_status?: 'pending' | 'billed';
  billed_at?: string | null;
  billed_by?: string | null;
  tax_invoice_no?: string | null;
  // --- Recurring Contract & Billing Category ---
  customer_id?: string | null;
  contract_id?: string | null;
  billing_type?: BillingCategoryType;
  sub_type?: BillingSubType | null;
  billing_period?: string | null;
  period_start?: string | null;
  period_end?: string | null;
  issue_date?: string | null;
  due_date?: string | null;
}

export type ItemStatus =
  | 'raw_stock'            // เก็บในห้องสต๊อก - ยังไม่เตรียม (รับจาก Stock PO เข้าสต๊อกตรงๆ นับถอยหลังเทส 7 วัน DOA)
  | 'in_stock'             // สินค้าเตรียมเข้าสต๊อกเรียบร้อย (มี S/N ยังไม่ติดวอย รอขาย)
  | 'pending_prep_stock'   // (legacy) ของจาก Stock PO เข้ามาแล้ว รอช่างเตรียมเช็ก/ติดโลโก้/ยิง S/N เข้าสต๊อกพร้อมขาย
  | 'pending_prep'         // เบิกจากสต๊อก รอช่างเตรียมสินค้า (เทส/ติดโลโก้/ยิง S/N)
  | 'prepped_in_stock'     // ช่างเตรียมเสร็จ / เก็บเข้าสต๊อกรอส่ง - รอแปะวอย
  | 'ready_for_dispatch'   // แปะวอยประกันแล้ว พร้อมปล่อยของออก
  | 'assigned_onsite'      // หน้าร้านจ่ายงานให้ช่าง Onsite นำไปส่ง
  | 'delivered'            // ช่าง Onsite หรือหน้าร้านส่งมอบให้ลูกค้าสำเร็จ
  | 'in_repair'            // เครื่องอยู่ในกระบวนการซ่อม
  | 'repaired_ready_return' // ซ่อมเสร็จ รอส่งมอบคืน
  | 'doa_reported'         // ช่างเทสพบปัญหา DOA แจ้งกลับฝ่ายจัดซื้อ PO
  | 'doa_sent_supplier'    // จัดซื้อแจ้งเคลม / ส่งคืน Supplier แล้ว (รอตัวใหม่)
  | 'doa_replaced';        // รับตัวใหม่จาก Supplier แล้ว (ปิดเคส DOA และส่งตัวใหม่เข้า raw_stock)

export type PrepType = 'inbound_stock' | 'outbound_dispatch' | 'stock_po';

// สถานะของใบสั่งซื้อเข้าสต๊อก (Proactive Stock PO - ไม่ผูกกับออเดอร์ลูกค้า)
export type StockPOStatus =
  | 'ordered'    // สั่งซื้อแล้ว รอของเข้า
  | 'received'   // รับของเข้าแล้ว เก็บเข้าห้องสต๊อกตรงๆ (สร้าง raw_stock - ยังไม่เตรียม)
  | 'cancelled'; // ยกเลิก

// ใบสั่งซื้อเข้าสต๊อก (Stock PO) - จัดซื้อสั่งของล่วงหน้าเพื่อสต๊อกพร้อมขาย
export interface StockPO {
  id: string;
  po_number: string;
  product_name: string;
  category: ProductCategory;
  qty: number;
  unit_cost: number;
  supplier: string;
  status: StockPOStatus;
  received_at?: string | null;
  notes?: string | null;
  created_at: string;
  updated_at?: string;
  // ---Activity & Audit Log ---
  activity_logs?: ActivityLog[];
  created_by?: string;                // ชื่อพนักงานผู้สั่งซื้อ
  ordered_at?: string | null;         // ISO timestamp สั่งซื้อ PO
  project_id?: string | null;         // ผูกกับรหัสโปรเจกต์ PRJ-2026-XXX (ถ้ามี)
}

// ==============================================================================
// Project & Site Installation Module (PRJ-2026-XXX)
// รองรับงานรับเหมาติดตั้งหลายวัน แบ่งเบิกของเป็นงวด (Batches) และแอดรายการเพิ่มข้ามเซลล์ (Add-On Attribution)
// ==============================================================================
export type ProjectStatus = 'planning' | 'in_progress' | 'handover_pending' | 'completed';

export type ProjectItemType = 'equipment' | 'consumable';

export interface ProjectItem {
  id: string;
  product_id?: string;
  model_name: string;
  item_type: ProjectItemType; // 'equipment' (ผ่านช่าง Prep สแกน S/N + ติดวอย) | 'consumable' (วัสดุสิ้นเปลือง/ค่าแรง ส่งตรง Onsite)
  unit?: ProductUnit;
  qty_required: number;
  qty_allocated: number;
  qty_prepared: number;
  unit_cost: number;
  unit_price: number;
  warranty_years?: number;
  is_addon: boolean;
  added_by?: string;
  added_at?: string;
  serial_numbers?: string[];
}

export interface ProjectBatchItem {
  project_item_id: string;
  model_name: string;
  item_type: ProjectItemType;
  qty: number;
  item_ids?: string[];
}

export interface ProjectBatch {
  id: string;
  batch_no: number;
  released_at: string;
  released_by: string;
  note?: string;
  items: ProjectBatchItem[];
}

export type ProjectMaterialRequestStatus = 'pending' | 'approved_ordered' | 'fulfilled';

export interface ProjectMaterialRequest {
  id: string;
  item_name: string;
  product_id?: string;
  qty: number;
  reason: string;
  requested_by: string;
  requested_at: string;
  status: ProjectMaterialRequestStatus;
}

export interface ProjectDailyLog {
  id: string;
  date: string;
  tech_name: string;
  progress_percent: number;
  note: string;
  photo_urls: string[];
}

export interface Project {
  id: string; // PRJ-2026-XXX
  site_name: string;
  customer_name: string;
  phone: string;
  location: string;
  district?: string;
  route_code?: RouteCode;
  created_by: string; // Lead Sales
  start_date: string;
  due_date: string;
  status: ProjectStatus;
  assigned_techs: string[];
  items: ProjectItem[];
  batches: ProjectBatch[];
  material_requests: ProjectMaterialRequest[];
  daily_logs: ProjectDailyLog[];
  handover_photo_urls?: string[];
  handover_note?: string;
  completed_at?: string | null;
  created_at: string;
  updated_at?: string;
  activity_logs?: ActivityLog[];
  // --- Accounting / Billing ---
  billing_status?: 'pending' | 'billed';
  billed_at?: string | null;
  billed_by?: string | null;
  tax_invoice_no?: string | null;
}

// ประเภทงาน Onsite (Job Category)
export type JobCategory =
  | 'delivery'       // ส่งของ / ติดวอยส่งให้ลูกค้า
  | 'repair_pickup'  // ซ่อมหน้างาน / ไปรับเครื่องกลับร้าน
  | 'repair_return'  // นำเครื่องซ่อมที่เสร็จแล้วไปส่งคืนลูกค้า
  | 'installation';  // งานติดตั้ง / เดินสาย / ตู้ Server (ต้องส่งทีม)

export const JOB_CATEGORY_LABELS: Record<JobCategory, { label: string; color: string; bg: string; border: string }> = {
  delivery: { label: 'ส่งของ / ติดวอย', color: 'text-emerald-400', bg: 'bg-emerald-500/15', border: 'border-emerald-500/30' },
  repair_pickup: { label: 'ซ่อมหน้างาน / รับเครื่อง', color: 'text-amber-400', bg: 'bg-amber-500/15', border: 'border-amber-500/30' },
  repair_return: { label: 'ส่งคืนเครื่องซ่อมให้ลูกค้า', color: 'text-cyan-400', bg: 'bg-cyan-500/15', border: 'border-cyan-500/30' },
  installation: { label: 'ติดตั้ง / เดินสาย / ตู้ Server', color: 'text-blue-400', bg: 'bg-blue-500/15', border: 'border-blue-500/30' },
};

export interface Item {
  id: string;
  order_id?: string | null;
  project_id?: string | null;         // รหัสโปรเจกต์ PRJ-2026-XXX (กรณีเบิกเข้าไซต์งานติดตั้ง)
  project_batch_no?: number | null;   // งวดเบิกที่ X ของโปรเจกต์
  project_item_id?: string | null;    // อ้างอิงรายการใน Project.items
  model_name: string;
  serial_number: string | null;
  status: ItemStatus;
  prep_type?: PrepType;
  category?: ProductCategory;         // หมวดหมู่สินค้า (จาก Stock PO)
  stock_po_id?: string | null;        // อ้างอิงใบ Stock PO ต้นทาง
  received_at?: string | null;        // วันที่รับของเข้าห้องสต๊อก (ใช้คำนวณประกัน DOA 7 วัน)
  unit_cost?: number;                 // ราคาทุนต่อหน่วย (INTERNAL ONLY)
  supplier?: string;                  // แหล่งที่มา เช่น สต๊อกร้าน, SIS, Synnex, Abshop, PKT
  po_no?: string;                     // เลขที่ PO / ใบสั่งซื้อ เช่น PKT/2569-083
  prep_note?: string;                 // หมายเหตุถึงช่างเตรียม เช่น มีกล่องพร้อมลง Driver
  delivery_mode?: DeliveryMode;       // ส่งพร้อมติดตั้ง / ส่งไม่ต้องติดตั้ง / ลูกค้ารับเอง
  assigned_prep_tech?: string | null; // ช่างผู้รับงานเตรียมสินค้า
  prep_accepted_at?: string | null;   // เวลาที่ช่างเตรียมรับงาน
  prepped_at: string | null;          // เวลาที่เตรียมเสร็จเก็บเข้าสต๊อกรอส่ง
  job_category?: JobCategory;          // ประเภทงาน Onsite
  assigned_techs: string[];            // ทีมช่าง (เลือกได้หลายคน)
  /** @deprecated use assigned_techs[0] */
  assigned_onsite_tech?: string | null; // เก็บไว้ backward-compat กับ Supabase query เดิม
  onsite_accepted_by?: string | null;   // ช่าง Onsite ที่กดรับงาน
  onsite_accepted_at?: string | null;   // เวลาที่ช่าง Onsite กดรับงาน
  void_date: string | null; // YYYY-MM-DD (ช่างเตรียมสินค้า/ผู้ปล่อยของเป็นคนติดก่อนนำส่งจริง)
  warranty_years?: number;            // ระยะเวลาประกัน (ปี) ที่ผูกมาจากรายการขาย
  warranty_months?: number;           // ระยะเวลาประกัน (เดือน) ที่ผูกมาจากรายการขาย
  warranty_void_date?: string | null; // ISO timestamp ตอนแปะวอยประกัน (จุดเริ่มนับประกัน)
  warranty_expire_date?: string | null; // ISO timestamp วันหมดประกัน (void + ระยะเวลา)
  notes?: string | null;
  created_at: string;
  updated_at?: string;
  // --- Activity & Audit Log ---
  activity_logs?: ActivityLog[];
  logo_applied?: boolean;                   // ติดโลโก้บริษัทเรียบร้อยแล้ว (ทำครั้งเดียวใน Stage A)
  received_into_storage_at?: string | null; // ISO timestamp รับของเข้าห้องสต๊อก (เริ่มนับ DOA 7 วัน)
  prep_accepted_log_at?: string | null;     // ISO timestamp ช่างกดรับงาน
  logo_scanned_at?: string | null;          // ISO timestamp ติดโลโก้ & สแกน S/N
  moved_to_ready_at?: string | null;        // ISO timestamp เก็บเข้าคลังพร้อมขาย / รอส่งมอบ
  warranty_applied_at?: string | null;      // ISO timestamp แปะวอยประกัน
  assigned_at?: string | null;              // ISO timestamp จัดสายรถ & มอบหมายช่าง
  dispatched_at?: string | null;            // ISO timestamp ปล่อยรถส่งของ / ลูกค้ารับ
  delivered_at?: string | null;             // ISO timestamp ส่งมอบติดตั้งเสร็จสิ้น
  // --- DOA Defect & Supplier Replacement Tracking ---
  doa_reason?: string | null;               // อาการเสีย DOA ที่ช่างแจ้ง
  doa_notes?: string | null;                // รายละเอียดเพิ่มเติมจากช่าง/จัดซื้อ
  doa_reported_at?: string | null;          // ISO timestamp ที่ช่างแจ้ง DOA
  doa_reported_by?: string | null;          // ชื่อช่างที่แจ้ง DOA
  doa_rma_no?: string | null;               // เลขที่ RMA / Tracking ที่ส่งเคลม Supplier
  doa_sent_date?: string | null;            // วันที่ส่งเคลม Supplier (YYYY-MM-DD)
  doa_replaced_at?: string | null;          // ISO timestamp ที่รับตัวใหม่จาก Supplier
  doa_replacement_item_id?: string | null;  // ID ของเครื่องตัวใหม่ที่สร้างเข้า raw_stock
  // --- Evidence Photos (DOA / Onsite Delivery) ---
  photo_urls?: string[] | null;             // URLs (Supabase Storage) หรือ Data URLs (Demo) สูงสุด 3 รูป
}

export type RepairStatus =
  | 'open'                  // รอช่างตรวจเช็ค
  | 'in_progress'           // กำลังตรวจซ่อม
  | 'repaired'              // ซ่อมได้ (สำเร็จ)
  | 'unrepairable_warranty' // ซ่อมไม่ได้ (ส่งเคลมประกันศูนย์)
  | 'expired_warranty'      // หมดประกัน (แจ้งลูกค้าเสนอราคาซ่อม/ซื้อใหม่)
  | 'unrepairable'          // ซ่อมไม่ได้ (คืนเครื่อง/ไม่คุ้มซ่อม)
  | 'awaiting_dispatch'     // เข้าคิวจัดสายรถ (ให้ช่าง Onsite ส่งคืน)
  | 'dispatched_onsite'     // มอบหมายช่าง Onsite นำเครื่องซ่อมไปส่งคืนลูกค้า
  | 'on_delivery'           // ช่าง Onsite กำลังนำส่งคืนลูกค้า (อยู่ระหว่างทาง)
  | 'returned_closed';      // ปิดงานส่งมอบคืนลูกค้า

// ==============================================================================
// Repair Lifecycle & RMA (In-House Repair / Supplier Claim) Tracking
// ==============================================================================
export type ServiceType = 'in_house_repair' | 'rma_claim';

export type RepairLifecycleStatus =
  | 'pending_check'   // รอตรวจเช็ก
  | 'repairing'       // กำลังซ่อมหน้าร้าน
  | 'waiting_parts'   // รออะไหล่
  | 'rma_sent'        // ส่งเคลมศูนย์แล้ว
  | 'rma_returned'    // ได้ของเคลมกลับแล้ว / รอเทส
  | 'ready_pickup'    // ซ่อม/เคลมเสร็จ -> ส่งคืนหน้าร้าน (จบงานฝั่งช่าง)
  | 'completed';      // ส่งคืนเครื่องซ่อมให้ลูกค้า / ปิดงาน (เฉพาะหน้าร้าน)

export const SERVICE_TYPE_LABELS: Record<ServiceType, string> = {
  in_house_repair: 'ซ่อมเองหน้าร้าน',
  rma_claim: 'ส่งเคลมประกัน (RMA)'
};

export const RMA_SUPPLIER_OPTIONS = [
  'SIS',
  'Synnex',
  'Ingram',
  'Ascenti',
  'WPG',
  'ส่งตรงศูนย์แบรนด์'
] as const;

export const REPAIR_LIFECYCLE_META: Record<
  RepairLifecycleStatus,
  { label: string; badge: string; dot: string }
> = {
  pending_check: {
    label: 'รอตรวจเช็ก',
    badge: 'bg-sky-500/15 text-sky-600 dark:text-sky-400 border-sky-500/30',
    dot: 'bg-sky-500'
  },
  repairing: {
    label: 'กำลังซ่อมหน้าร้าน',
    badge: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30',
    dot: 'bg-amber-500'
  },
  waiting_parts: {
    label: 'รออะไหล่',
    badge: 'bg-orange-500/15 text-orange-600 dark:text-orange-400 border-orange-500/30',
    dot: 'bg-orange-500'
  },
  rma_sent: {
    label: 'ส่งเคลมศูนย์แล้ว',
    badge: 'bg-violet-500/15 text-violet-600 dark:text-violet-400 border-violet-500/30',
    dot: 'bg-violet-500'
  },
  rma_returned: {
    label: 'ได้ของเคลมกลับแล้ว / รอเทส',
    badge: 'bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 border-cyan-500/30',
    dot: 'bg-cyan-500'
  },
  ready_pickup: {
    label: 'ซ่อม/เคลมเสร็จ → ส่งคืนหน้าร้าน',
    badge: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
    dot: 'bg-emerald-500'
  },
  completed: {
    label: 'ส่งคืนเครื่องซ่อมให้ลูกค้า / ปิดงาน',
    badge: 'bg-slate-500/15 text-slate-600 dark:text-slate-300 border-slate-500/30',
    dot: 'bg-slate-500'
  }
};

export const REPAIR_LIFECYCLE_ORDER: RepairLifecycleStatus[] = [
  'pending_check',
  'repairing',
  'waiting_parts',
  'rma_sent',
  'rma_returned',
  'ready_pickup',
  'completed'
];

// สถานะที่ "ช่างซ่อมในร้าน" จัดการได้เท่านั้น (ไม่รวม 'completed' ซึ่งเป็นสิทธิ์ของหน้าร้าน)
// ready_pickup = จบงานฝั่งช่าง ส่งเครื่องคืนห้องหน้าร้าน
export const REPAIR_TECH_LIFECYCLE_ORDER: RepairLifecycleStatus[] = [
  'pending_check',
  'repairing',
  'waiting_parts',
  'rma_sent',
  'rma_returned',
  'ready_pickup'
];

// สถานะที่ถือว่า "งานยังไม่จบฝั่งช่าง" (แสดงบนโต๊ะช่าง)
export const REPAIR_TECH_ACTIVE_STATUSES: RepairLifecycleStatus[] = [
  'pending_check',
  'repairing',
  'waiting_parts',
  'rma_sent',
  'rma_returned'
];

// คำนวณจำนวนวันเต็มที่ผ่านไปจาก ISO timestamp (ใช้แสดง "ส่งเคลมแล้ว X วัน")
export function getElapsedDays(iso?: string | null): number | null {
  if (!iso) return null;
  const start = new Date(iso).getTime();
  if (isNaN(start)) return null;
  const diff = Date.now() - start;
  if (diff < 0) return 0;
  return Math.floor(diff / 86400000);
}

// แปลง ISO timestamp -> ค่าเริ่มต้นของ <input type="date"> (YYYY-MM-DD)
export function toDateInputValue(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

// แปลงค่า <input type="date"> (YYYY-MM-DD) -> ISO timestamp (ต้นวัน เวลาท้องถิ่น)
export function fromDateInputValue(value?: string | null): string | null {
  if (!value) return null;
  const d = new Date(`${value}T00:00:00`);
  if (isNaN(d.getTime())) return null;
  return d.toISOString();
}

export type IntakeChannel = 'front_desk_walkin' | 'onsite_pickup';

// ช่องทางที่ "ผู้รับเครื่อง" รับเครื่องมาจากลูกค้า
// - front_desk: รับที่หน้าร้าน
// - onsite_pickup: ช่าง Onsite รับกลับมาจากหน้างาน (งานมอบหมายรับเครื่อง)
// - onsite_service_sheet: ออกใบ Service Sheet รับฝาก/งานเพิ่มหน้างานโดยช่าง Onsite
export type ReceivedChannel = 'front_desk' | 'onsite_pickup' | 'onsite_service_sheet';

export interface RepairTicket {
  id: string;
  item_id: string | null;
  ticket_no: string;
  walkin_sn: string;
  customer_name: string;
  customer_phone?: string | null;
  intake_channel: IntakeChannel;
  device_model?: string | null;        // รุ่น/ประเภทเครื่องที่รับซ่อม
  accessories?: string[];              // อุปกรณ์ที่ติดมาด้วย (เช่น Adapter, สาย Power ฯลฯ)
  accessories_other?: string | null;   // อุปกรณ์อื่นๆ เพิ่มเติม
  picked_up_by?: string | null;        // ชื่อช่าง Onsite ผู้ไปรับเครื่องมา
  fault_symptom: string;
  repair_detail: string | null;
  parts_used: string | null;
  repair_cost?: number | null;         // ค่าใช้จ่ายในการซ่อม (บาท)
  repair_outcome?: string | null;
  district?: string;
  route_code?: RouteCode;
  delivery_location?: string;
  province_custom?: string;
  job_category?: JobCategory;          // ประเภทงาน Onsite
  assigned_techs: string[];            // ทีมช่าง (เลือกได้หลายคน)
  /** @deprecated use assigned_techs[0] */
  assigned_onsite_tech?: string | null; // backward-compat
  status: RepairStatus;
  received_at: string;
  finished_at: string | null;
  created_at: string;
  updated_at?: string;
  // --- Activity & Audit Log ---
  activity_logs?: ActivityLog[];
  received_by?: string;               // ชื่อพนักงาน/ช่าง Onsite ผู้รับเครื่องมาจากลูกค้า
  received_channel?: ReceivedChannel; // 'front_desk' (รับหน้าร้าน) | 'onsite_pickup' (ช่าง Onsite รับกลับมา)
  repaired_by?: string | null;        // ชื่อช่างซ่อมหน้าร้านที่รับผิดชอบซ่อม/ส่งเคลมเครื่องนี้
  started_at?: string | null;         // ISO timestamp เริ่มปฏิบัติงาน / รับเครื่องซ่อม
  assigned_at?: string | null;        // ISO timestamp จัดสายรถ & มอบหมายช่าง
  delivered_at?: string | null;       // ISO timestamp ส่งมอบ / ปิดงานซ่อม

  // --- Repair Return / Handover Tracking ---
  returned_by?: string | null;             // ผู้ส่งคืนเครื่องให้ลูกค้า (เช่น 'รับเองหน้าร้าน' หรือชื่อช่าง Onsite)
  is_repair_return?: boolean;              // true = งานนี้คือการนำเครื่องซ่อมไปส่งคืนลูกค้า (Onsite return job)
  due_date?: string | null;                // YYYY-MM-DD วันกำหนดส่งคืนลูกค้า

  // --- In-House Repair / Supplier RMA Tracking ---
  service_type?: ServiceType;              // 'in_house_repair' | 'rma_claim'
  included_accessories?: string | null;    // อุปกรณ์ที่ติดมากับเครื่อง (สรุปเป็นข้อความ)
  rma_supplier?: string | null;            // SIS / Synnex / Ingram / Ascenti / WPG / ส่งตรงศูนย์แบรนด์
  rma_tracking_no?: string | null;         // เลขใบส่งเคลม / เลขพัสดุขนส่ง
  rma_sent_date?: string | null;           // ISO timestamp วันที่ส่งออกเคลม
  rma_returned_date?: string | null;       // ISO timestamp วันที่ได้รับของเคลมกลับจากศูนย์
  replacement_sn?: string | null;          // S/N ใหม่กรณีศูนย์เปลี่ยนตัวใหม่ (original เก็บใน walkin_sn)
  repair_status?: RepairLifecycleStatus;   // สถานะวงจรชีวิตงานซ่อม/RMA
  // --- Evidence Photos (Onsite Pickup / Service Sheet / Return Proof) ---
  photo_urls?: string[] | null;            // URLs (Supabase Storage) หรือ Data URLs (Demo) สูงสุด 3 รูป
}

export type DeliveryUrgencyTier = 'overdue' | 'today' | 'soon' | 'future' | 'none';

export interface DeliveryUrgencyInfo {
  hasDate: boolean;
  daysRemaining: number;
  overdueDays: number;
  tier: DeliveryUrgencyTier;
  formattedDate: string;
}

export function getDeliveryUrgency(dateStr?: string | null): DeliveryUrgencyInfo {
  if (!dateStr) {
    return { hasDate: false, daysRemaining: Number.POSITIVE_INFINITY, overdueDays: 0, tier: 'none', formattedDate: '' };
  }
  const trimmed = dateStr.trim();
  let target: Date;
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const [y, m, d] = trimmed.split('-').map(Number);
    target = new Date(y, m - 1, d);
  } else {
    const parsed = new Date(trimmed);
    if (isNaN(parsed.getTime())) {
      return { hasDate: false, daysRemaining: Number.POSITIVE_INFINITY, overdueDays: 0, tier: 'none', formattedDate: '' };
    }
    target = new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
  }

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const daysRemaining = Math.round((target.getTime() - today.getTime()) / 86400000);
  const dd = String(target.getDate()).padStart(2, '0');
  const mm = String(target.getMonth() + 1).padStart(2, '0');
  const formattedDate = `${dd}/${mm}/${target.getFullYear()}`;

  if (daysRemaining < 0) {
    return { hasDate: true, daysRemaining, overdueDays: Math.abs(daysRemaining), tier: 'overdue', formattedDate };
  }
  if (daysRemaining === 0) {
    return { hasDate: true, daysRemaining: 0, overdueDays: 0, tier: 'today', formattedDate };
  }
  if (daysRemaining <= 3) {
    return { hasDate: true, daysRemaining, overdueDays: 0, tier: 'soon', formattedDate };
  }
  return { hasDate: true, daysRemaining, overdueDays: 0, tier: 'future', formattedDate };
}
