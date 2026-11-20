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
  exp.setFullYear(exp.getFullYear() + y);
  exp.setMonth(exp.getMonth() + m);
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

export type UserRole =
  | 'admin'         // Full system access, all tabs, user management, config
  | 'sales'         // 1. ฝ่ายขาย
  | 'accounting'    // 2. บัญชี & สต๊อก
  | 'prep'          // 3. ช่างเตรียมสินค้า (เตรียมเข้าสต๊อก / เตรียมออกไปส่ง & ติดวอย)
  | 'frontdesk'     // 4. คนนั่งหน้าร้าน / จัดคิว & รายงาน
  | 'onsite'        // 5. ช่าง Onsite (จัดส่ง & ติดตั้ง & รับเครื่องซ่อม)
  | 'repair';       // 6. ช่างซ่อมในร้าน

export interface UserAccount {
  id: string;
  username: string;
  password?: string;
  name: string;
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
    name: 'สาย 1 (พุนพิน-ท่าชนะ)',
    shortName: 'สาย 1',
    zone: 'พุนพิน-ท่าชนะ)',
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

// ประเภทบิล
export type BillType = 'tax_invoice' | 'cash_bill_quotation';

// เงื่อนไขชำระเงิน
export type PaymentTerm = 'cash' | 'credit_30' | 'project';

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
  | 'repaired_ready_return'; // ซ่อมเสร็จ รอส่งมอบคืน

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
  // --- Activity & Audit Log ---
  activity_logs?: ActivityLog[];
  created_by?: string;                // ชื่อพนักงานผู้สั่งซื้อ
  ordered_at?: string | null;         // ISO timestamp สั่งซื้อ PO
}

// ประเภทงาน Onsite (Job Category)
export type JobCategory =
  | 'delivery'       // ส่งของ / ติดวอยส่งให้ลูกค้า
  | 'repair_pickup'  // ซ่อมหน้างาน / ไปรับเครื่องกลับร้าน
  | 'installation';  // งานติดตั้ง / เดินสาย / ตู้ Server (ต้องส่งทีม)

export const JOB_CATEGORY_LABELS: Record<JobCategory, { label: string; color: string; bg: string; border: string }> = {
  delivery: { label: 'ส่งของ / ติดวอย', color: 'text-emerald-400', bg: 'bg-emerald-500/15', border: 'border-emerald-500/30' },
  repair_pickup: { label: 'ซ่อมหน้างาน / รับเครื่อง', color: 'text-amber-400', bg: 'bg-amber-500/15', border: 'border-amber-500/30' },
  installation: { label: 'ติดตั้ง / เดินสาย / ตู้ Server', color: 'text-blue-400', bg: 'bg-blue-500/15', border: 'border-blue-500/30' },
};

export interface Item {
  id: string;
  order_id?: string | null;
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
  received_into_storage_at?: string | null; // ISO timestamp รับของเข้าห้องสต๊อก (เริ่มนับ DOA 7 วัน)
  prep_accepted_log_at?: string | null;     // ISO timestamp ช่างกดรับงาน
  logo_scanned_at?: string | null;          // ISO timestamp ติดโลโก้ & สแกน S/N
  moved_to_ready_at?: string | null;        // ISO timestamp เก็บเข้าคลังพร้อมขาย / รอส่งมอบ
  warranty_applied_at?: string | null;      // ISO timestamp แปะวอยประกัน
  assigned_at?: string | null;              // ISO timestamp จัดสายรถ & มอบหมายช่าง
  dispatched_at?: string | null;            // ISO timestamp ปล่อยรถส่งของ / ลูกค้ารับ
  delivered_at?: string | null;             // ISO timestamp ส่งมอบติดตั้งเสร็จสิ้น
}

export type RepairStatus =
  | 'open'                  // รอช่างตรวจเช็ค
  | 'in_progress'           // กำลังตรวจซ่อม
  | 'repaired'              // ซ่อมได้ (สำเร็จ)
  | 'unrepairable_warranty' // ซ่อมไม่ได้ (ส่งเคลมประกันศูนย์)
  | 'expired_warranty'      // หมดประกัน (แจ้งลูกค้าเสนอราคาซ่อม/ซื้อใหม่)
  | 'unrepairable'          // ซ่อมไม่ได้ (คืนเครื่อง/ไม่คุ้มซ่อม)
  | 'returned_closed';      // ปิดงานส่งมอบคืนลูกค้า

export type IntakeChannel = 'front_desk_walkin' | 'onsite_pickup';

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
  received_by?: string;               // ชื่อพนักงานผู้รับเครื่องซ่อม
  started_at?: string | null;         // ISO timestamp เริ่มปฏิบัติงาน / รับเครื่องซ่อม
  assigned_at?: string | null;        // ISO timestamp จัดสายรถ & มอบหมายช่าง
  delivered_at?: string | null;       // ISO timestamp ส่งมอบ / ปิดงานซ่อม
}
