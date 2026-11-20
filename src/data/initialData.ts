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
    name: 'คุณสมศรี (จัดซื้อและสต๊อกสินค้า)',
    role: 'accounting',
    badge: 'Purchasing & Stock Inventory',
    phone: '082-222-3344'
  },
  {
    id: 'u-prep',
    username: 'prep',
    password: 'password123',
    name: 'ช่างกอล์ฟ (ช่างเตรียมสินค้า)',
    role: 'prep',
    badge: 'Hardware Prep Specialist',
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
    name: 'ช่างชาติ (ช่างซ่อมในร้าน)',
    role: 'repair',
    badge: 'In-House Repair Tech',
    phone: '086-666-7788'
  }
];

export const INITIAL_ORDERS: Order[] = [
  // 1. เคส กล้อง Hikvision (สาย 1 พุนพิน) - ใบขาวสร้างแล้ว อยู่ในสถานะ รอจัดซื้อ/เช็กสต๊อก
  {
    id: 'ord-001',
    sales_ref: 'SO-2026-101',
    customer_name: 'สหกรณ์การเกษตรพุนพิน จำกัด',
    customer_phone: '077-311-224',
    district: 'พุนพิน',
    route_code: 'route_1',
    delivery_location: '142 หมู่ 3 ถ.พุนพิน-สุราษฎร์ ต.ท่าข้าม อ.พุนพิน จ.สุราษฎร์ธานี',
    delivery_date: new Date(Date.now() + 86400000).toISOString().split('T')[0],
    bill_type: 'tax_invoice',
    payment_term: 'credit_30',
    delivery_mode: 'install',
    site_notes: 'ติดตั้งกล้องวงจรปิดรอบอาคารโกดังข้าวเปลือก 4 จุด พร้อมเซ็ตออนไลน์',
    bill_no: null,
    order_status: 'pending_purchasing',
    items_list: [
      { model_name: 'Hikvision IP Camera 4MP ColorVu PoE Kit 4ch', quantity: 2 },
      { model_name: 'Ubiquiti UniFi U6-Pro Wi-Fi 6 Access Point', quantity: 1 }
    ],
    created_at: new Date(Date.now() - 3600000 * 2).toISOString()
  },
  // 2. เคส Printer Epson L14150 (สาย 4 กาญจนดิษฐ์) - อยู่ในสถานะ รอสั่งซื้อของเข้า (waiting_po)
  {
    id: 'ord-002',
    sales_ref: 'SO-2026-102',
    customer_name: 'โรงเรียนกาญจนดิษฐ์วิทยาคม',
    customer_phone: '077-371-155',
    district: 'กาญจนดิษฐ์',
    route_code: 'route_4',
    delivery_location: 'ห้องธุรการ อาคาร 1 โรงเรียนกาญจนดิษฐ์วิทยาคม อ.กาญจนดิษฐ์',
    delivery_date: new Date(Date.now() + 86400000 * 2).toISOString().split('T')[0],
    bill_type: 'tax_invoice',
    payment_term: 'project',
    delivery_mode: 'drop_off',
    site_notes: 'จัดส่งพร้อมหมึกแท้ 1 ชุด ลง Driver ที่เครื่องคอมธุรการ',
    bill_no: null,
    order_status: 'waiting_po',
    items_list: [
      { model_name: 'Epson EcoTank L14150 A3+ Wi-Fi All-in-One Ink Tank Printer', quantity: 1, supplier: 'SIS Distribution', po_no: 'SIS/2569-441', item_type: 'hardware' }
    ],
    created_at: new Date(Date.now() - 3600000 * 5).toISOString()
  },
  // 2.5 เคส งานโครงการ / รับเหมาติดตั้ง Server & เดินสาย LAN (สาย 5 เมืองสุราษฎร์) - รับของ PO เข้าสต๊อกแล้ว (po_received_in_stock)
  {
    id: 'ord-005',
    sales_ref: 'SO-2026-105',
    customer_name: 'บจก. สุราษฎร์ โลจิสติกส์ พาร์ค (สำนักงานใหญ่)',
    customer_phone: '077-960-888',
    district: 'เมืองสุราษฎร์ธานี',
    route_code: 'route_5',
    delivery_location: 'นิคมอุตสาหกรรมสุราษฎร์ธานี อาคาร A ชั้น 2 ถ.บายพาส',
    delivery_date: new Date(Date.now() + 86400000 * 3).toISOString().split('T')[0],
    bill_type: 'tax_invoice',
    payment_term: 'project',
    delivery_mode: 'project',
    site_notes: 'งานโครงการรับเหมาติดตั้งระบบเครือข่าย: เดินสาย LAN Cat6 ทั้งหมด 24 จุด, ติดตั้งตู้ Rack 42U พร้อมจัดสาย Patch Panel และเซ็ตอัพ Server (จัดทีมช่าง 3 คน เข้าหน้างาน 2 วัน)',
    bill_no: null,
    order_status: 'po_received_in_stock',
    items_list: [
      { model_name: 'BossComputech Rack Server 1U Standard', quantity: 2, supplier: 'Synnex (Thailand)', po_no: 'SYN/2569-892', item_type: 'hardware' },
      { model_name: 'ตู้ Rack 42U 600x1000mm พร้อม PDU & พัดลม', quantity: 1, supplier: 'PKT Computer & Supply', po_no: 'PKT/2569-115', item_type: 'hardware' },
      { model_name: 'สายสัญญาณ LAN Link Cat6 UTP 305m (กล่อง)', quantity: 3, supplier: 'สต๊อกร้าน (Main Store)', po_no: 'STORE-STK', item_type: 'hardware' },
      { model_name: 'ค่าบริการเดินสาย LAN ท่อร้อยสาย และจัดตู้ Rack Server (24 จุด)', quantity: 1, item_type: 'service' }
    ],
    created_at: new Date(Date.now() - 3600000 * 12).toISOString()
  },
  // 3. เคส POS Terminal ร้านค้าในเมือง (สาย 5) - ตัดสต๊อกแล้ว ช่างเตรียมกำลังทำ (pending_prep)
  {
    id: 'ord-003',
    sales_ref: 'SO-2026-103',
    customer_name: 'ร้านอาหารริมน้ำสุราษฎร์ฟู้ดส์',
    customer_phone: '081-555-8899',
    district: 'เมืองสุราษฎร์ธานี',
    route_code: 'route_5',
    delivery_location: 'ถ.ตลาดใหม่ ต.ตลาด อ.เมือง จ.สุราษฎร์ธานี',
    delivery_date: new Date().toISOString().split('T')[0],
    bill_type: 'tax_invoice',
    payment_term: 'cash',
    delivery_mode: 'install',
    site_notes: 'ลงโปรแกรม POS หน้าร้าน พร้อมเทสเครื่องพิมพ์สลิป',
    bill_no: 'INV-2026-103',
    order_status: 'approved_for_prep',
    items_list: [
      { model_name: 'BossComputech Mini POS Terminal X1', quantity: 1, supplier: 'สต๊อกร้าน (Main Store)', po_no: 'PKT/2569-083', prep_note: 'มีกล่องพร้อมลง Driver' }
    ],
    created_at: new Date(Date.now() - 3600000 * 8).toISOString()
  },
  // 4. เคส Workstation แพเขื่อน (สาย 2 บ้านตาขุน) - อยู่ในสต๊อกรอแปะวอยปล่อยของ (prepped_in_stock)
  {
    id: 'ord-004',
    sales_ref: 'SO-2026-104',
    customer_name: 'แพเขื่อนเชี่ยวหลาน แกรนด์ริเวอร์',
    customer_phone: '088-777-6655',
    district: 'บ้านตาขุน',
    route_code: 'route_2',
    delivery_location: 'ท่าเรือเทศบาลบ้านตาขุน อ.บ้านตาขุน จ.สุราษฎร์ธานี',
    delivery_date: new Date().toISOString().split('T')[0],
    bill_type: 'cash_bill_quotation',
    payment_term: 'cash',
    delivery_mode: 'customer_pickup',
    site_notes: 'ลูกค้านัดรับของเองที่หน้าร้านบอสคอมตอนบ่าย',
    bill_no: 'INV-2026-104',
    order_status: 'approved_for_prep',
    items_list: [
      { model_name: 'BossComputech Core-i7 Workstation Pro', quantity: 1 }
    ],
    created_at: new Date(Date.now() - 86400000).toISOString()
  }
];

export const INITIAL_ITEMS: Item[] = [
  // 1. เครื่อง POS (สาย 5) - รอช่างเตรียมทำในจังหวะที่ 1 (pending_prep)
  {
    id: 'itm-001',
    order_id: 'ord-003',
    model_name: 'BossComputech Mini POS Terminal X1',
    serial_number: null,
    status: 'pending_prep',
    prep_type: 'outbound_dispatch',
    supplier: 'สต๊อกร้าน (Main Store)',
    po_no: 'PKT/2569-083',
    prep_note: 'มีกล่องพร้อมลง Driver และติดโลโก้ BossComputech',
    delivery_mode: 'install',
    assigned_prep_tech: 'ช่างกอล์ฟ (ช่างเตรียมสินค้า)',
    prep_accepted_at: new Date(Date.now() - 3600000).toISOString(),
    job_category: 'delivery',
    assigned_techs: [],
    prepped_at: null,
    void_date: null,
    notes: 'รอช่างเตรียมยิง S/N และลงโปรแกรม',
    created_at: new Date(Date.now() - 3600000 * 4).toISOString()
  },
  // 2. เคสจริงตามที่ร้องขอ: อยู่ในสถานะ "พร้อมส่งในสต๊อก - รอแปะวอย (prepped_in_stock)"
  {
    id: 'itm-002',
    order_id: 'ord-004',
    model_name: 'BossComputech Core-i7 Workstation Pro',
    serial_number: 'BC-2026-088',
    status: 'prepped_in_stock', // พร้อมส่งในสต๊อก - รอแปะวอย
    prep_type: 'outbound_dispatch',
    supplier: 'Synnex (Thailand)',
    po_no: 'SYN/2569-902',
    prep_note: 'ประกอบเทสผ่าน 100% รอแปะวอยส่งมอบลูกค้ารับเอง',
    delivery_mode: 'customer_pickup',
    assigned_prep_tech: 'ช่างกอล์ฟ (ช่างเตรียมสินค้า)',
    prep_accepted_at: new Date(Date.now() - 3600000 * 6).toISOString(),
    job_category: 'delivery',
    assigned_techs: [],
    prepped_at: new Date(Date.now() - 3600000 * 2).toISOString(),
    void_date: null, // ยังไม่ติดวอย
    notes: 'ประกอบ/ลงโปรแกรม/ยิง S/N เสร็จ เก็บเข้าสต๊อกรอแปะวอยปล่อยของ',
    created_at: new Date(Date.now() - 86400000).toISOString()
  },
  // 3. เครื่องส่งมอบเสร็จแล้ว (delivered)
  {
    id: 'itm-003',
    order_id: 'ord-001',
    model_name: 'BossComputech AI Edge Box Ultra',
    serial_number: 'BC-2026-001',
    status: 'delivered',
    prep_type: 'outbound_dispatch',
    supplier: 'Abshop',
    po_no: 'ABS/2569-122',
    delivery_mode: 'install',
    job_category: 'delivery',
    assigned_techs: ['ช่างเอ'],
    assigned_onsite_tech: 'ช่างเอ',
    prepped_at: new Date(Date.now() - 86400000 * 2).toISOString(),
    void_date: new Date(Date.now() - 86400000 * 2).toISOString().split('T')[0],
    notes: 'ส่งมอบและติดตั้งเรียบร้อย ลูกค้าเซ็นรับครบถ้วน',
    created_at: new Date(Date.now() - 86400000 * 2).toISOString()
  },
  // 4. เครื่องในสต๊อกคลัง (in_stock)
  {
    id: 'itm-stock-01',
    order_id: null,
    model_name: 'BossComputech Core-i7 Workstation Pro',
    serial_number: 'BC-STOCK-901',
    status: 'in_stock',
    prep_type: 'inbound_stock',
    assigned_techs: [],
    prepped_at: new Date(Date.now() - 86400000 * 5).toISOString(),
    void_date: null,
    notes: 'เก็บเข้าสต๊อกคลังหลักสุราษฎร์ฯ ชั้น A2 พร้อมขาย',
    created_at: new Date(Date.now() - 86400000 * 5).toISOString()
  }
];

export const INITIAL_REPAIR_TICKETS: RepairTicket[] = [
  // 1. งานแจ้งรับเครื่องซ่อมจากหน้างาน (สาย 4 กาญจนดิษฐ์) - Printer Epson L14150
  {
    id: 'rep-001',
    item_id: null,
    ticket_no: 'REP-2569-083',
    walkin_sn: 'EP-L14150-9941',
    customer_name: 'หจก. กาญจนดิษฐ์ การเกษตร (คุณสมบัติ)',
    customer_phone: '089-223-1122',
    intake_channel: 'onsite_pickup',
    device_model: 'Epson EcoTank L14150 A3+ Wi-Fi All-in-One Ink Tank Printer',
    accessories: ['สาย Power', 'สายสัญญาณ (LAN/HDMI/USB)'],
    accessories_other: 'ตลับหมึกแท้ 4 สีในตัวเครื่อง',
    picked_up_by: 'ช่างบี',
    district: 'กาญจนดิษฐ์',
    route_code: 'route_4',
    delivery_location: '210 ม.2 ต.กะแดะ อ.กาญจนดิษฐ์ จ.สุราษฎร์ธานี',
    job_category: 'repair_pickup',
    fault_symptom: 'พิมพ์กระดาษไม่ออก ดึงกระดาษเบี้ยว และไฟรูปหยดหมึกกระพริบสีส้ม',
    repair_detail: 'ล้างหัวพิมพ์ระบบสุญญากาศ เปลี่ยนลูกยางดึงกระดาษชุดฟีดใหม่',
    parts_used: 'Roller Feed Pickup Assembly Kit L14150',
    repair_outcome: '1. ซ่อมได้ (ซ่อมสำเร็จ)',
    assigned_techs: ['ช่างบี'],
    assigned_onsite_tech: 'ช่างบี',
    status: 'open',
    received_at: new Date(Date.now() - 3600000 * 3).toISOString(),
    finished_at: null,
    created_at: new Date(Date.now() - 3600000 * 3).toISOString()
  },
  // 2. งานรับซ่อมหน้าร้าน (สาย 1 ไชยา)
  {
    id: 'rep-002',
    item_id: null,
    ticket_no: 'REP-2569-012',
    walkin_sn: 'BC-2026-001',
    customer_name: 'สหกรณ์ไข่เค็มไชยาอินเตอร์',
    customer_phone: '077-431-998',
    intake_channel: 'front_desk_walkin',
    device_model: 'BossComputech Core-i7 Workstation Pro',
    accessories: ['Adapter / หม้อแปลง', 'สาย Power'],
    accessories_other: '',
    picked_up_by: 'คุณนก (แอดมินหน้าร้าน)',
    district: 'ไชยา',
    route_code: 'route_1',
    delivery_location: 'ริมถนนทางเข้าวัดพระบรมธาตุไชยา อ.ไชยา จ.สุราษฎร์ธานี',
    job_category: 'repair_pickup',
    fault_symptom: 'เปิดเครื่องไฟไม่เข้า หม้อแปลงร้อนจัด',
    repair_detail: null,
    parts_used: null,
    repair_outcome: null,
    assigned_techs: [],
    assigned_onsite_tech: null,
    status: 'open',
    received_at: new Date(Date.now() - 86400000).toISOString(),
    finished_at: null,
    created_at: new Date(Date.now() - 86400000).toISOString()
  }
];
