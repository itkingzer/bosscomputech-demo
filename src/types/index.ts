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

export type OrderStatus = 'pending_accounting' | 'approved_for_prep' | 'fulfilled';

export interface Order {
  id: string;
  sales_ref: string | null;
  customer_name: string;
  delivery_location: string;
  district?: string;
  route_code?: RouteCode;
  province_custom?: string;
  bill_no: string | null;
  order_status: OrderStatus;
  created_at: string;
  updated_at?: string;
  _planned_model?: string;
  _planned_quantity?: number;
}

export type ItemStatus =
  | 'in_stock'             // สินค้าเตรียมเข้าสต๊อกเรียบร้อย (มี S/N ยังไม่ติดวอย รอขาย)
  | 'pending_prep'         // เบิกจากสต๊อก รอเตรียมออกไปส่ง
  | 'ready_for_dispatch'   // เตรียมออกไปส่งเสร็จแล้ว + ติดวอยรับประกันแล้ว รอหน้าร้านจ่ายงาน
  | 'assigned_onsite'      // หน้าร้านจ่ายงานให้ช่าง Onsite นำไปส่ง
  | 'delivered'            // ช่าง Onsite นำส่งมอบให้ลูกค้าสำเร็จ
  | 'in_repair'            // เครื่องอยู่ในกระบวนการซ่อม
  | 'repaired_ready_return'; // ซ่อมเสร็จ รอส่งมอบคืน

export type PrepType = 'inbound_stock' | 'outbound_dispatch';

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
  job_category?: JobCategory;          // ประเภทงาน Onsite
  assigned_techs: string[];            // ทีมช่าง (เลือกได้หลายคน)
  /** @deprecated use assigned_techs[0] */
  assigned_onsite_tech?: string | null; // เก็บไว้ backward-compat กับ Supabase query เดิม
  prepped_at: string | null;
  void_date: string | null; // YYYY-MM-DD (ช่างเตรียมสินค้าเป็นคนติดก่อนนำส่ง)
  notes?: string | null;
  created_at: string;
  updated_at?: string;
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
}
