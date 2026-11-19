import { UserAccount, Order, Item, RepairTicket } from '../types';

export const INITIAL_USERS: UserAccount[] = [
  {
    id: 'u-admin',
    username: 'admin',
    password: 'password123',
    name: 'คุณบอส (ผู้บริหาร/แอดมินระบบ)',
    role: 'admin',
    badge: 'Super Admin',
    phone: '089-999-9999',
    assigned_route: 'all'
  },
  {
    id: 'u-sales',
    username: 'sales',
    password: 'password123',
    name: 'คุณแพรว (หัวหน้าฝ่ายขาย)',
    role: 'sales',
    badge: 'Sales Dept',
    phone: '081-111-2233'
  },
  {
    id: 'u-acc',
    username: 'accounting',
    password: 'password123',
    name: 'คุณสมศรี (บัญชีและควบคุมสต๊อก)',
    role: 'accounting',
    badge: 'Accounting & Inventory',
    phone: '082-222-3344'
  },
  {
    id: 'u-prep',
    username: 'prep',
    password: 'password123',
    name: 'ช่างกอล์ฟ (ช่างเตรียมสินค้า & ติดวอย)',
    role: 'prep',
    badge: 'Hardware Prep & Void QC',
    phone: '083-333-4455'
  },
  {
    id: 'u-front',
    username: 'frontdesk',
    password: 'password123',
    name: 'คุณนก (แอดมินหน้าร้าน & จ่ายงาน)',
    role: 'frontdesk',
    badge: 'Front-Desk Dispatcher',
    phone: '084-444-5566'
  },
  {
    id: 'u-onsite-1',
    username: 'onsite1',
    password: 'password123',
    name: 'ช่างเอ',
    role: 'onsite',
    badge: 'Field Tech - สาย 1/2',
    phone: '085-555-1122',
    assigned_route: 'route_1'
  },
  {
    id: 'u-onsite-2',
    username: 'onsite2',
    password: 'password123',
    name: 'ช่างบี',
    role: 'onsite',
    badge: 'Field Tech - สาย 3/4',
    phone: '085-555-3344',
    assigned_route: 'route_3'
  },
  {
    id: 'u-onsite-3',
    username: 'onsite',
    password: 'password123',
    name: 'ช่างซี',
    role: 'onsite',
    badge: 'Field Tech - สาย 5/6',
    phone: '085-555-5566',
    assigned_route: 'route_5'
  },
  {
    id: 'u-onsite-4',
    username: 'onsite4',
    password: 'password123',
    name: 'ช่างดี',
    role: 'onsite',
    badge: 'Field Tech - สาย 4/5',
    phone: '085-555-7788',
    assigned_route: 'route_4'
  },
  {
    id: 'u-repair',
    username: 'repair',
    password: 'password123',
    name: 'ช่างชาติ (ช่างซ่อมบอร์ด & ประกอบในร้าน)',
    role: 'repair',
    badge: 'In-House Repair Tech',
    phone: '086-666-7788'
  }
];

export const INITIAL_ORDERS: Order[] = [
  // สาย 1 (โซนเหนือ: พุนพิน, ท่าฉาง, ไชยา, ท่าชนะ)
  {
    id: 'ord-001',
    sales_ref: 'QT-2026-101',
    customer_name: 'สหกรณ์การเกษตรพุนพิน จำกัด',
    district: 'พุนพิน',
    route_code: 'route_1',
    delivery_location: '142 หมู่ 3 ถ.พุนพิน-สุราษฎร์ ต.ท่าข้าม อ.พุนพิน จ.สุราษฎร์ธานี',
    bill_no: 'INV-2026-101',
    order_status: 'fulfilled',
    created_at: new Date(Date.now() - 86400000 * 3).toISOString()
  },
  // สาย 1 (ท่าฉาง) - งาน POS Terminal
  {
    id: 'ord-001b',
    sales_ref: 'QT-2026-110',
    customer_name: 'ร้านสะดวกซื้อ 365 ท่าฉาง',
    district: 'ท่าฉาง',
    route_code: 'route_1',
    delivery_location: '15/2 ถ.พุนพิน-ท่าฉาง ต.ท่าฉาง อ.ท่าฉาง จ.สุราษฎร์ธานี',
    bill_no: 'INV-2026-110',
    order_status: 'approved_for_prep',
    created_at: new Date(Date.now() - 86400000 * 1).toISOString()
  },
  // สาย 2 (โซนตะวันตก: คีรีรัฐนิคม, บ้านตาขุน, พนม)
  {
    id: 'ord-002',
    sales_ref: 'QT-2026-102',
    customer_name: 'แพเขื่อนเชี่ยวหลาน แกรนด์ริเวอร์',
    district: 'บ้านตาขุน',
    route_code: 'route_2',
    delivery_location: 'ท่าเรือเทศบาลบ้านตาขุน อ.บ้านตาขุน จ.สุราษฎร์ธานี',
    bill_no: 'INV-2026-102',
    order_status: 'approved_for_prep',
    created_at: new Date(Date.now() - 86400000 * 1).toISOString()
  },
  // สาย 3 (โซนใต้: บ้านนาเดิม, บ้านนาสาร, เวียงสระ, พระแสง)
  {
    id: 'ord-003',
    sales_ref: 'QT-2026-103',
    customer_name: 'สหกรณ์กองทุนสวนยางเวียงสระ จำกัด',
    district: 'เวียงสระ',
    route_code: 'route_3',
    delivery_location: '88 หมู่ 1 ถ.เวียงสระ-พระแสง อ.เวียงสระ จ.สุราษฎร์ธานี',
    bill_no: null,
    order_status: 'pending_accounting',
    created_at: new Date(Date.now() - 3600000 * 4).toISOString(),
    _planned_model: 'BossComputech Mini POS Terminal X1',
    _planned_quantity: 2
  },
  // สาย 4 (โซนตะวันออก: กาญจนดิษฐ์, ดอนสัก, ขนอม) - งานติดตั้ง Server Rack ทีม 2 ช่าง
  {
    id: 'ord-004',
    sales_ref: 'QT-2026-104',
    customer_name: 'ท่าเรือเฟอร์รี่ดอนสัก (ซีทราน)',
    district: 'ดอนสัก',
    route_code: 'route_4',
    delivery_location: 'สำนักงานหน้าท่าเทียบเรือเฟอร์รี่ ต.ดอนสัก อ.ดอนสัก จ.สุราษฎร์ธานี',
    bill_no: 'INV-2026-104',
    order_status: 'approved_for_prep',
    created_at: new Date(Date.now() - 3600000 * 12).toISOString()
  },
  // สาย 4 (กาญจนดิษฐ์) - งานติดตั้ง Server Rack + เดินสาย LAN ทีม 3 ช่าง
  {
    id: 'ord-004b',
    sales_ref: 'QT-2026-114',
    customer_name: 'บจก. กาญจนดิษฐ์ อุตสาหกรรมยาง',
    district: 'กาญจนดิษฐ์',
    route_code: 'route_4',
    delivery_location: '58 หมู่ 4 ถ.กาญจนดิษฐ์-ดอนสัก ต.กะแดะ อ.กาญจนดิษฐ์ จ.สุราษฎร์ธานี',
    bill_no: 'INV-2026-114',
    order_status: 'approved_for_prep',
    created_at: new Date(Date.now() - 3600000 * 6).toISOString()
  },
  // สาย 5 (ในเมือง / รอบเมือง: เมืองสุราษฎร์ธานี)
  {
    id: 'ord-005',
    sales_ref: 'QT-2026-105',
    customer_name: 'โรงพยาบาลสุราษฎร์ธานี (แผนกเวชระเบียน)',
    district: 'เมืองสุราษฎร์ธานี',
    route_code: 'route_5',
    delivery_location: 'ตึกอำนวยการ ชั้น 2 ถ.ศรีวิชัย ต.มะขามเตี้ย อ.เมือง จ.สุราษฎร์ธานี',
    bill_no: 'INV-2026-105',
    order_status: 'approved_for_prep',
    created_at: new Date(Date.now() - 3600000 * 8).toISOString()
  },
  // สาย 6 (ต่างจังหวัด / ชั่วคราว / งานเหมาพิเศษ)
  {
    id: 'ord-006',
    sales_ref: 'QT-2026-106',
    customer_name: 'บจก. เซาท์เทิร์น โลจิสติกส์ ชุมพร',
    district: 'ต่างจังหวัด / งานเหมาพิเศษ',
    route_code: 'route_6',
    province_custom: 'ชุมพร (อ.หลังสวน)',
    delivery_location: 'ศูนย์กระจายสินค้าภาคใต้ตอนบน อ.หลังสวน จ.ชุมพร',
    bill_no: null,
    order_status: 'pending_accounting',
    created_at: new Date(Date.now() - 3600000 * 2).toISOString(),
    _planned_model: 'BossComputech Rack Server 1U Standard',
    _planned_quantity: 1
  }
];

export const INITIAL_ITEMS: Item[] = [
  // เครื่องสาย 1 ส่งมอบสำเร็จแล้ว (ช่างเอ คนเดียว)
  {
    id: 'itm-001',
    order_id: 'ord-001',
    model_name: 'BossComputech Core-i7 Workstation Pro',
    serial_number: 'BC-2026-001',
    status: 'delivered',
    prep_type: 'outbound_dispatch',
    job_category: 'delivery',
    assigned_techs: ['ช่างเอ'],
    assigned_onsite_tech: 'ช่างเอ',
    prepped_at: new Date(Date.now() - 86400000 * 3).toISOString(),
    void_date: new Date(Date.now() - 86400000 * 3).toISOString().split('T')[0],
    notes: 'ส่งมอบสหกรณ์พุนพินเรียบร้อย',
    created_at: new Date(Date.now() - 86400000 * 3).toISOString()
  },
  // เครื่องสาย 1 (ท่าฉาง) POS Terminal - รอหน้าร้านจ่ายงาน
  {
    id: 'itm-001b',
    order_id: 'ord-001b',
    model_name: 'BossComputech Mini POS Terminal X1',
    serial_number: 'BC-2026-010',
    status: 'ready_for_dispatch',
    prep_type: 'outbound_dispatch',
    job_category: 'delivery',
    assigned_techs: [],
    assigned_onsite_tech: null,
    prepped_at: new Date(Date.now() - 3600000 * 2).toISOString(),
    void_date: new Date().toISOString().split('T')[0],
    notes: 'POS Terminal ร้าน 365 ท่าฉาง ติดวอยแล้ว',
    created_at: new Date(Date.now() - 86400000 * 1).toISOString()
  },
  // เครื่องสาย 2 ติดวอยแล้ว รอหน้าร้านจ่ายคิวรถ
  {
    id: 'itm-002',
    order_id: 'ord-002',
    model_name: 'BossComputech Mini POS Terminal X1',
    serial_number: 'BC-2026-002',
    status: 'ready_for_dispatch',
    prep_type: 'outbound_dispatch',
    job_category: 'delivery',
    assigned_techs: [],
    assigned_onsite_tech: null,
    prepped_at: new Date(Date.now() - 3600000 * 5).toISOString(),
    void_date: new Date().toISOString().split('T')[0],
    notes: 'ติดวอยแล้ว ส่งแพบ้านตาขุน',
    created_at: new Date(Date.now() - 86400000 * 1).toISOString()
  },
  // เครื่องสาย 4 (ดอนสัก) รอช่างเตรียมติดวอย
  {
    id: 'itm-004',
    order_id: 'ord-004',
    model_name: 'BossComputech AI Edge Box Ultra',
    serial_number: null,
    status: 'pending_prep',
    prep_type: 'outbound_dispatch',
    job_category: 'delivery',
    assigned_techs: [],
    assigned_onsite_tech: null,
    prepped_at: null,
    void_date: null,
    notes: 'ออเดอร์ท่าเรือดอนสัก (สาย 4)',
    created_at: new Date(Date.now() - 3600000 * 12).toISOString()
  },
  // เครื่องสาย 4 (กาญจนดิษฐ์) Server Rack - งานติดตั้ง ส่ง 2 ช่าง (ช่างบี + ช่างดี) พร้อมกัน
  {
    id: 'itm-004b',
    order_id: 'ord-004b',
    model_name: 'BossComputech Rack Server 1U Standard',
    serial_number: 'BC-2026-114',
    status: 'assigned_onsite',
    prep_type: 'outbound_dispatch',
    job_category: 'installation',
    assigned_techs: ['ช่างบี', 'ช่างดี'],
    assigned_onsite_tech: 'ช่างบี',
    prepped_at: new Date(Date.now() - 3600000 * 4).toISOString(),
    void_date: new Date().toISOString().split('T')[0],
    notes: 'ติดตั้ง Server Rack + เดินสาย LAN ทั้งอาคาร กาญจนดิษฐ์ — ส่งทีม 2 ช่าง',
    created_at: new Date(Date.now() - 3600000 * 6).toISOString()
  },
  // เครื่องสาย 5 กำลังวิ่งส่ง Onsite (ช่างซี คนเดียว)
  {
    id: 'itm-005',
    order_id: 'ord-005',
    model_name: 'BossComputech Core-i7 Workstation Pro',
    serial_number: 'BC-2026-005',
    status: 'assigned_onsite',
    prep_type: 'outbound_dispatch',
    job_category: 'delivery',
    assigned_techs: ['ช่างซี'],
    assigned_onsite_tech: 'ช่างซี',
    prepped_at: new Date(Date.now() - 3600000 * 6).toISOString(),
    void_date: new Date().toISOString().split('T')[0],
    notes: 'ติดวอยแล้ว กำลังวิ่งส่ง รพ.สุราษฎร์ธานี',
    created_at: new Date(Date.now() - 3600000 * 8).toISOString()
  },
  // เครื่องในสต๊อก
  {
    id: 'itm-stock-01',
    order_id: null,
    model_name: 'BossComputech Core-i7 Workstation Pro',
    serial_number: 'BC-STOCK-901',
    status: 'in_stock',
    prep_type: 'inbound_stock',
    job_category: undefined,
    assigned_techs: [],
    assigned_onsite_tech: null,
    prepped_at: new Date(Date.now() - 86400000 * 5).toISOString(),
    void_date: null,
    notes: 'เก็บเข้าสต๊อกคลังหลักสุราษฎร์ฯ ชั้น A2',
    created_at: new Date(Date.now() - 86400000 * 5).toISOString()
  }
];

export const INITIAL_REPAIR_TICKETS: RepairTicket[] = [
  // งานแจ้งซ่อมสาย 3 (เวียงสระ) - ช่างเดินทางคนเดียว
  {
    id: 'rep-001',
    item_id: null,
    ticket_no: 'REP-2026-01',
    walkin_sn: 'BC-2026-003',
    customer_name: 'ร้านกาแฟ คาเฟ่ไนน์ (คุณพงศกร)',
    customer_phone: '081-445-9876',
    intake_channel: 'onsite_pickup',
    district: 'เวียงสระ',
    route_code: 'route_3',
    delivery_location: 'ใกล้ตลาดสดเทศบาลเวียงสระ อ.เวียงสระ จ.สุราษฎร์ธานี',
    job_category: 'repair_pickup',
    fault_symptom: 'เปิดเครื่องไฟไม่เข้า หม้อแปลงร้อนจัด',
    repair_detail: 'ตรวจพบ C ภาคจ่ายไฟบวม เปลี่ยนบอร์ด PSU ใหม่',
    parts_used: 'Power Supply Board 250W Mini-ITX',
    repair_outcome: '1. ซ่อมได้ (ซ่อมสำเร็จ)',
    assigned_techs: [],
    assigned_onsite_tech: null,
    status: 'in_progress',
    received_at: new Date(Date.now() - 86400000 * 1).toISOString(),
    finished_at: null,
    created_at: new Date(Date.now() - 86400000 * 1).toISOString()
  },
  // งานซ่อมเสร็จสาย 4 (กาญจนดิษฐ์) - หน้าร้านรอจ่ายให้ช่าง Onsite สาย 4 นำไปส่งคืน
  {
    id: 'rep-002',
    item_id: 'itm-001',
    ticket_no: 'REP-2026-02',
    walkin_sn: 'BC-2025-998',
    customer_name: 'หจก. กาญจนดิษฐ์ การเกษตร',
    customer_phone: '089-223-1122',
    intake_channel: 'front_desk_walkin',
    district: 'กาญจนดิษฐ์',
    route_code: 'route_4',
    delivery_location: '210 ม.2 ต.กะแดะ อ.กาญจนดิษฐ์ จ.สุราษฎร์ธานี',
    job_category: 'repair_pickup',
    fault_symptom: 'เข้า Windows ช้ามาก และมีเสียงดังแกร๊กๆ จาก Harddisk',
    repair_detail: 'โคลนข้อมูลขึ้น NVMe SSD 1TB ใหม่ และทำความสะอาดฝุ่น',
    parts_used: 'SSD M.2 NVMe 1TB PCIe 4.0',
    repair_outcome: '1. ซ่อมได้ (ซ่อมสำเร็จ)',
    assigned_techs: [],
    assigned_onsite_tech: null,
    status: 'repaired',
    received_at: new Date(Date.now() - 86400000 * 2).toISOString(),
    finished_at: new Date(Date.now() - 3600000 * 4).toISOString(),
    created_at: new Date(Date.now() - 86400000 * 2).toISOString()
  },
  // งานแจ้งรับเครื่องซ่อมสาย 1 (ไชยา) - ยังไม่ได้จ่ายงาน
  {
    id: 'rep-003',
    item_id: null,
    ticket_no: 'REP-2026-03',
    walkin_sn: 'BC-2025-554',
    customer_name: 'สหกรณ์ไข่เค็มไชยาอินเตอร์',
    customer_phone: '077-431-998',
    intake_channel: 'onsite_pickup',
    district: 'ไชยา',
    route_code: 'route_1',
    delivery_location: 'ริมถนนทางเข้าวัดพระบรมธาตุไชยา อ.ไชยา จ.สุราษฎร์ธานี',
    job_category: 'repair_pickup',
    fault_symptom: 'จอภาพกระพริบ พอร์ต LAN ใช้งานไม่ได้',
    repair_detail: null,
    parts_used: null,
    repair_outcome: null,
    assigned_techs: [],
    assigned_onsite_tech: null,
    status: 'open',
    received_at: new Date(Date.now() - 3600000 * 3).toISOString(),
    finished_at: null,
    created_at: new Date(Date.now() - 3600000 * 3).toISOString()
  },
  // งานติดตั้ง Server + เดินสาย LAN สาย 4 (กาญจนดิษฐ์) - ทีม 3 ช่าง (ช่างเอ, ช่างบี, ช่างดี)
  {
    id: 'rep-004',
    item_id: null,
    ticket_no: 'REP-2026-04',
    walkin_sn: 'SN-PROJECT-114',
    customer_name: 'บจก. กาญจนดิษฐ์ อุตสาหกรรมยาง (งานโปรเจกต์)',
    customer_phone: '089-888-4411',
    intake_channel: 'onsite_pickup',
    district: 'กาญจนดิษฐ์',
    route_code: 'route_4',
    delivery_location: '58 หมู่ 4 ถ.กาญจนดิษฐ์-ดอนสัก ต.กะแดะ อ.กาญจนดิษฐ์',
    job_category: 'installation',
    fault_symptom: 'ติดตั้งตู้ Server Rack 42U + เดินสาย LAN Cat6 ทั้งอาคาร 3 ชั้น + ตั้งค่า NAS',
    repair_detail: null,
    parts_used: null,
    repair_outcome: null,
    assigned_techs: ['ช่างเอ', 'ช่างบี', 'ช่างดี'],
    assigned_onsite_tech: 'ช่างเอ',
    status: 'open',
    received_at: new Date(Date.now() - 3600000 * 1).toISOString(),
    finished_at: null,
    created_at: new Date(Date.now() - 3600000 * 1).toISOString()
  }
];
