import { UserAccount, Order, Item, RepairTicket, Product, StockPO, Project, Contract, computeWarrantyExpire } from '../types';

// ==============================================================================
// Helper: คำนวณวันหมดประกันจากวันแปะวอย (ISO) + ระยะเวลา (ปี/เดือน)
// ใช้ให้ seed data มี warranty_expire_date ที่สอดคล้องกับ warranty_void_date จริง
// ==============================================================================
const computeExpire = (voidIso: string, years = 0, months = 0): string =>
  computeWarrantyExpire(voidIso, years, months) || voidIso;

// ==============================================================================
// Product Catalog (แคตตาล็อกสินค้า/บริการที่ใช้ซ้ำได้ พร้อมราคาทุน & ราคาขาย)
// ==============================================================================
export const INITIAL_PRODUCTS: Product[] = [
  // --- 1. คอมพิวเตอร์ / โน้ตบุ๊ก / UPS (pc_notebook) ---
  { id: 'prod-7', name: 'BossComputech Core-i7 Workstation Pro', category: 'pc_notebook', item_type: 'hardware', unit: 'เครื่อง', cost_price: 24800, sell_price: 32500 },
  { id: 'prod-8', name: 'BossComputech Mini POS Terminal X1', category: 'pc_notebook', item_type: 'hardware', unit: 'เครื่อง', cost_price: 17600, sell_price: 18900 },
  { id: 'prod-20', name: 'Dell OptiPlex 7020 MFF Desktop (i5-14500T / 16GB / 512GB)', category: 'pc_notebook', item_type: 'hardware', unit: 'เครื่อง', cost_price: 18900, sell_price: 23500 },
  { id: 'prod-21', name: 'Lenovo ThinkPad E14 Gen 5 Notebook (i5 / 16GB / 512GB)', category: 'pc_notebook', item_type: 'hardware', unit: 'เครื่อง', cost_price: 21500, sell_price: 26900 },
  { id: 'prod-6', name: 'Kingston NV2 512GB M.2 NVMe SSD', category: 'pc_notebook', item_type: 'hardware', unit: 'เครื่อง', cost_price: 1150, sell_price: 1590 },
  { id: 'prod-22', name: 'APC Back-UPS 1100VA / 550W (BX1100LI-MS)', category: 'pc_notebook', item_type: 'hardware', unit: 'เครื่อง', cost_price: 2850, sell_price: 3690 },

  // --- 2. เครื่องพิมพ์ / สแกนเนอร์ / หมึก (printer) ---
  { id: 'prod-4', name: 'Brother HL-L3240CDW Color Laser Printer', category: 'printer', item_type: 'hardware', unit: 'เครื่อง', cost_price: 8900, sell_price: 10900 },
  { id: 'prod-5', name: 'Epson LQ-310 Dot Matrix Printer', category: 'printer', item_type: 'hardware', unit: 'เครื่อง', cost_price: 5900, sell_price: 7500 },
  { id: 'prod-23', name: 'Epson EcoTank L3250 Wi-Fi All-in-One Printer', category: 'printer', item_type: 'hardware', unit: 'เครื่อง', cost_price: 4250, sell_price: 5290 },
  { id: 'prod-24', name: 'ตลับหมึกโทนเนอร์ Brother TN-269 Black (กล่อง)', category: 'printer', item_type: 'hardware', unit: 'กล่อง', cost_price: 1650, sell_price: 2190 },

  // --- 3. กล้องวงจรปิด / ระบบเครือข่าย (cctv_network) ---
  { id: 'prod-1', name: 'Huawei eKitEngine S220-24P4X Switch', category: 'cctv_network', item_type: 'hardware', unit: 'เครื่อง', cost_price: 8900, sell_price: 11500 },
  { id: 'prod-2', name: 'Mikrotik RB4011iGS+RM Router', category: 'cctv_network', item_type: 'hardware', unit: 'เครื่อง', cost_price: 6900, sell_price: 8900 },
  { id: 'prod-3', name: 'Hikvision 8CH NVR + 4MP CCTV Kit', category: 'cctv_network', item_type: 'hardware', unit: 'ชุด', cost_price: 14500, sell_price: 18900 },
  { id: 'prod-9', name: 'Ubiquiti UniFi U6-Pro Wi-Fi 6 Access Point', category: 'cctv_network', item_type: 'hardware', unit: 'เครื่อง', cost_price: 4950, sell_price: 6200 },
  { id: 'prod-10', name: 'ตู้ Rack 42U 600x1000mm พร้อม PDU & พัดลม', category: 'cctv_network', item_type: 'hardware', unit: 'ชุด', cost_price: 14200, sell_price: 18500 },

  // --- 4. สายแลน / กล่องสาย / สายไฟเบอร์ / วัสดุสิ้นเปลือง (ส่งตรง Onsite ได้) ---
  { id: 'prod-11', name: 'สายสัญญาณ LAN Link Cat6 UTP 305m (กล่อง)', category: 'cctv_network', item_type: 'hardware', unit: 'กล่อง', cost_price: 2900, sell_price: 3850 },
  { id: 'prod-15', name: 'สายสัญญาณ LAN Link Cat5e UTP 305m (กล่อง)', category: 'cctv_network', item_type: 'hardware', unit: 'กล่อง', cost_price: 2150, sell_price: 2890 },
  { id: 'prod-16', name: 'สาย Fiber Optic Drop Wire 1 Core (ม้วน 1,000m)', category: 'cctv_network', item_type: 'hardware', unit: 'ม้วน', cost_price: 1850, sell_price: 2590 },
  { id: 'prod-17', name: 'สาย Patch Cord Cat6 UTP 2m (เส้น)', category: 'cctv_network', item_type: 'hardware', unit: 'เส้น', cost_price: 65, sell_price: 120 },
  { id: 'prod-25', name: 'ท่อร้อยสาย PVC สีขาว 20mm (มัด 10 เส้น)', category: 'general', item_type: 'hardware', unit: 'มัด', cost_price: 320, sell_price: 490 },
  { id: 'prod-18', name: 'หัว RJ45 Cat6 Link (แพ็ค 100 หัว)', category: 'general', item_type: 'hardware', unit: 'แพ็ค', cost_price: 420, sell_price: 650 },
  { id: 'prod-19', name: 'รางปลั๊กไฟ Surge Protection 6 ช่อง (3m)', category: 'general', item_type: 'hardware', unit: 'อัน', cost_price: 390, sell_price: 590 },
  { id: 'prod-26', name: 'Harddisk WD Purple 4TB Surveillance (สำหรับ NVR)', category: 'general', item_type: 'hardware', unit: 'อัน', cost_price: 3150, sell_price: 3990 },

  // --- 5. ค่าบริการ / ค่าแรง (service) ---
  { id: 'prod-12', name: 'ค่าบริการเดินสาย LAN ท่อร้อยสาย และจัดตู้ Rack Server (ต่อจุด)', category: 'service', item_type: 'service', unit: 'จุด', cost_price: 250, sell_price: 450 },
  { id: 'prod-13', name: 'ค่าบริการติดตั้งเซ็ตอัพระบบกล้องวงจรปิด CCTV PoE (4 จุด)', category: 'service', item_type: 'service', unit: 'ชุด', cost_price: 1200, sell_price: 2500 },
  { id: 'prod-14', name: 'ค่าบริการติดตั้งและอบรมการใช้งานโปรแกรม POS หน้าร้าน', category: 'service', item_type: 'service', unit: 'รายการ', cost_price: 600, sell_price: 1500 },
  { id: 'prod-27', name: 'ค่าบริการตรวจเช็ค / PM ระบบเครือข่ายและเครื่องแม่ข่าย (รายครั้ง)', category: 'service', item_type: 'service', unit: 'รายการ', cost_price: 800, sell_price: 1800 }
];

// ==============================================================================
// Users (บัญชีผู้ใช้ทุกบทบาท)
// ==============================================================================
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
    name: 'เซลล์เอ',
    role: 'sales',
    badge: 'Sales Dept',
    phone: '081-111-2233'
  },
  {
    id: 'u-sales-b',
    username: 'salesb',
    password: 'password123',
    name: 'เซลล์บี',
    role: 'sales',
    badge: 'Sales Dept',
    phone: '081-111-4455'
  },
  {
    id: 'u-sales-c',
    username: 'salesc',
    password: 'password123',
    name: 'เซลล์ซี',
    role: 'sales',
    badge: 'Sales Dept',
    phone: '081-111-6677'
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
    nickname: 'ชาติ',
    department: 'ฝ่ายช่างซ่อม',
    is_active: true,
    role: 'repair',
    badge: 'In-House Repair Tech',
    phone: '086-666-7788'
  },
  {
    id: 'u-finance',
    username: 'finance',
    password: 'password123',
    name: 'คุณฝน (ฝ่ายบัญชี & วางบิล)',
    nickname: 'ฝน',
    department: 'ฝ่ายบัญชี',
    is_active: true,
    role: 'finance',
    badge: 'Accounting & Billing',
    phone: '087-777-8899'
  },
  {
    id: 'u-hr',
    username: 'hr',
    password: 'password123',
    name: 'คุณมิ้น (ฝ่ายบุคคล HR)',
    nickname: 'มิ้น',
    department: 'ฝ่ายบุคคล (HR)',
    is_active: true,
    role: 'hr',
    badge: 'Human Resources',
    phone: '088-888-9900'
  }
];

// ==============================================================================
// Stock POs (ใบสั่งซื้อเข้าสต๊อกล่วงหน้า - ไม่ผูกออเดอร์ลูกค้า)
//  - PO 1: รับของเข้าแล้ว (received) -> สร้าง raw_stock นับถอยหลัง DOA 7 วัน
//  - PO 2: สั่งซื้อแล้วรอของเข้า (ordered)
// ==============================================================================
export const INITIAL_STOCK_POS: StockPO[] = [
  {
    id: 'spo-001',
    po_number: 'SPO-2569-001',
    product_name: 'Huawei eKitEngine S220-24P4X Switch',
    category: 'cctv_network',
    qty: 3,
    unit_cost: 8900,
    supplier: 'Synnex (Thailand)',
    status: 'received',
    received_at: new Date(Date.now() - 86400000 * 2).toISOString(),
    notes: 'สั่งสต๊อกสำรองสวิตช์ PoE 24 พอร์ต ยอดนิยมงาน CCTV',
    created_at: new Date(Date.now() - 86400000 * 5).toISOString(),
    created_by: 'คุณสมศรี (จัดซื้อและสต๊อกสินค้า)',
    ordered_at: new Date(Date.now() - 86400000 * 5).toISOString()
  },
  {
    id: 'spo-002',
    po_number: 'SPO-2569-002',
    product_name: 'Kingston NV2 512GB M.2 NVMe SSD',
    category: 'pc_notebook',
    qty: 10,
    unit_cost: 1150,
    supplier: 'SIS Distribution',
    status: 'ordered',
    received_at: null,
    notes: 'สั่ง SSD สำหรับอัปเกรดเครื่องลูกค้าและสต๊อกพร้อมขาย',
    created_at: new Date(Date.now() - 86400000).toISOString(),
    created_by: 'คุณสมศรี (จัดซื้อและสต๊อกสินค้า)',
    ordered_at: new Date(Date.now() - 86400000).toISOString()
  }
];

// ==============================================================================
// Orders (ครอบคลุมทุกสถานะของ workflow หน้าร้าน + ช่างเตรียม)
// ==============================================================================
export const INITIAL_ORDERS: Order[] = [
  // ---------------------------------------------------------------------------
  // Order 1: รอสั่งซื้อของเข้า (waiting_po) - ของในสต๊อกไม่พอ (qty > stock)
  //   -> Purchasing เห็น smart stock auto-detection ว่าต้องสั่งเพิ่ม
  // ---------------------------------------------------------------------------
  {
    id: 'ord-001',
    sales_ref: 'SO-2026-101',
    salesperson: 'เซลล์เอ',
    customer_name: 'สหกรณ์การเกษตรพุนพิน จำกัด',
    customer_phone: '077-311-224',
    district: 'พุนพิน',
    route_code: 'route_1',
    delivery_location: '142 หมู่ 3 ถ.พุนพิน-สุราษฎร์ ต.ท่าข้าม อ.พุนพิน จ.สุราษฎร์ธานี',
    delivery_date: new Date(Date.now() + 86400000 * 3).toISOString().split('T')[0],
    bill_type: 'tax_invoice',
    payment_term: 'credit_30',
    delivery_mode: 'install',
    site_notes: 'ติดตั้งกล้องวงจรปิดรอบอาคารโกดังข้าวเปลือก 8 จุด พร้อมเซ็ตออนไลน์',
    bill_no: null,
    order_status: 'pending_purchasing',
    items_list: [
      { model_name: 'Hikvision 8CH NVR + 4MP CCTV Kit', quantity: 4, supplier: 'Synnex (Thailand)', item_type: 'hardware', unit: 'ชุด', unit_price: 18900, unit_cost: 14500, warranty_years: 2 },
      { model_name: 'Huawei eKitEngine S220-24P4X Switch', quantity: 2, supplier: 'Synnex (Thailand)', item_type: 'hardware', unit: 'เครื่อง', unit_price: 11500, unit_cost: 8900, warranty_years: 3 }
    ],
    extra_cost: 2500,
    created_at: new Date(Date.now() - 3600000 * 2).toISOString(),
    created_by: 'เซลล์เอ',
    created_at_log: new Date(Date.now() - 3600000 * 2).toISOString()
  },
  // ---------------------------------------------------------------------------
  // Order 2: ตัดสต๊อกแล้ว ส่งช่างเตรียม (approved_for_prep) - รอช่างรับงาน/เทส/ยิง S/N
  // ---------------------------------------------------------------------------
  {
    id: 'ord-002',
    sales_ref: 'SO-2026-102',
    salesperson: 'เซลล์บี',
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
    bill_no: 'INV-2026-102',
    order_status: 'approved_for_prep',
    items_list: [
      { model_name: 'Brother HL-L3240CDW Color Laser Printer', quantity: 1, supplier: 'สต๊อกร้าน (Main Store)', po_no: 'STORE-STK', prep_note: 'มีกล่องพร้อมลง Driver', item_type: 'hardware', unit: 'เครื่อง', unit_price: 10900, unit_cost: 8900, warranty_years: 3 }
    ],
    extra_cost: 0,
    created_at: new Date(Date.now() - 3600000 * 5).toISOString(),
    created_by: 'เซลล์บี',
    created_at_log: new Date(Date.now() - 3600000 * 5).toISOString(),
    stock_cut_at: new Date(Date.now() - 3600000 * 3).toISOString()
  },
  // ---------------------------------------------------------------------------
  // Order 3: ช่างเตรียมเสร็จแล้ว รอแปะวอย (prepped_in_stock) - อยู่ใน Section [2] หน้าร้าน
  // ---------------------------------------------------------------------------
  {
    id: 'ord-003',
    sales_ref: 'SO-2026-103',
    salesperson: 'เซลล์ซี',
    customer_name: 'แพเขื่อนเชี่ยวหลาน แกรนด์ริเวอร์',
    customer_phone: '088-777-6655',
    district: 'บ้านตาขุน',
    route_code: 'route_2',
    delivery_location: 'ท่าเรือเทศบาลบ้านตาขุน อ.บ้านตาขุน จ.สุราษฎร์ธานี',
    delivery_date: new Date(Date.now() + 86400000 * 2).toISOString().split('T')[0],
    bill_type: 'cash_bill_quotation',
    payment_term: 'cash',
    delivery_mode: 'install',
    site_notes: 'ติดตั้งพร้อมลงโปรแกรมระบบหลังบ้านที่แพ',
    bill_no: 'INV-2026-103',
    order_status: 'approved_for_prep',
    items_list: [
      { model_name: 'BossComputech Core-i7 Workstation Pro', quantity: 1, supplier: 'Synnex (Thailand)', po_no: 'SYN/2569-902', item_type: 'hardware', unit: 'เครื่อง', unit_price: 32500, unit_cost: 24800, warranty_years: 3 }
    ],
    extra_cost: 800,
    created_at: new Date(Date.now() - 86400000).toISOString(),
    created_by: 'เซลล์ซี',
    created_at_log: new Date(Date.now() - 86400000).toISOString(),
    stock_cut_at: new Date(Date.now() - 3600000 * 8).toISOString()
  },
  // ---------------------------------------------------------------------------
  // Order 4: แปะวอยประกันแล้ว พร้อมปล่อยรถ (ready_for_dispatch) - อยู่ใน Section [1] หน้าร้าน
  // ---------------------------------------------------------------------------
  {
    id: 'ord-004',
    sales_ref: 'SO-2026-104',
    salesperson: 'เซลล์เอ',
    customer_name: 'บจก. สุราษฎร์ โลจิสติกส์ พาร์ค (สำนักงานใหญ่)',
    customer_phone: '077-960-888',
    district: 'เมืองสุราษฎร์ธานี',
    route_code: 'route_5',
    delivery_location: 'นิคมอุตสาหกรรมสุราษฎร์ธานี อาคาร A ชั้น 2 ถ.บายพาส',
    delivery_date: new Date().toISOString().split('T')[0],
    bill_type: 'tax_invoice',
    payment_term: 'project',
    delivery_mode: 'install',
    site_notes: 'ติดตั้งสวิตช์ PoE + Router หลัก พร้อมจัดสาย Patch Panel',
    bill_no: 'INV-2026-104',
    order_status: 'approved_for_prep',
    items_list: [
      { model_name: 'Huawei eKitEngine S220-24P4X Switch', quantity: 1, supplier: 'Synnex (Thailand)', po_no: 'SYN/2569-892', item_type: 'hardware', unit: 'เครื่อง', unit_price: 11500, unit_cost: 8900, warranty_years: 3 },
      { model_name: 'Mikrotik RB4011iGS+RM Router', quantity: 1, supplier: 'PKT Computer & Supply', po_no: 'PKT/2569-115', item_type: 'hardware', unit: 'เครื่อง', unit_price: 8900, unit_cost: 6900, warranty_years: 3 }
    ],
    extra_cost: 1500,
    created_at: new Date(Date.now() - 3600000 * 12).toISOString(),
    created_by: 'เซลล์เอ',
    created_at_log: new Date(Date.now() - 3600000 * 12).toISOString(),
    stock_cut_at: new Date(Date.now() - 3600000 * 10).toISOString()
  },
  // ---------------------------------------------------------------------------
  // Order 5: ลูกค้ารับเองหน้าร้าน (customer_pickup) - อยู่ใน Section [3] หน้าร้าน
  // ---------------------------------------------------------------------------
  {
    id: 'ord-005',
    sales_ref: 'SO-2026-105',
    salesperson: 'เซลล์บี',
    customer_name: 'ร้านอาหารริมน้ำสุราษฎร์ฟู้ดส์',
    customer_phone: '081-555-8899',
    district: 'เมืองสุราษฎร์ธานี',
    route_code: 'route_5',
    delivery_location: 'ถ.ตลาดใหม่ ต.ตลาด อ.เมือง จ.สุราษฎร์ธานี',
    delivery_date: new Date().toISOString().split('T')[0],
    bill_type: 'tax_invoice',
    payment_term: 'cash',
    delivery_mode: 'customer_pickup',
    site_notes: 'ลูกค้านัดรับเองที่หน้าร้านบอสคอมตอนบ่าย พร้อมลงโปรแกรม POS',
    bill_no: 'INV-2026-105',
    order_status: 'approved_for_prep',
    items_list: [
      { model_name: 'BossComputech Mini POS Terminal X1', quantity: 1, supplier: 'สต๊อกร้าน (Main Store)', po_no: 'PKT/2569-083', item_type: 'hardware', unit: 'เครื่อง', unit_price: 18900, unit_cost: 17600, warranty_years: 2 }
    ],
    extra_cost: 500,
    created_at: new Date(Date.now() - 3600000 * 6).toISOString(),
    created_by: 'เซลล์บี',
    created_at_log: new Date(Date.now() - 3600000 * 6).toISOString(),
    stock_cut_at: new Date(Date.now() - 3600000 * 4).toISOString()
  },
  // ---------------------------------------------------------------------------
  // Order 6: จ่ายงานช่าง Onsite แล้ว (assigned_onsite) - อยู่ในคิว Onsite สาย 2
  // ---------------------------------------------------------------------------
  {
    id: 'ord-006',
    sales_ref: 'SO-2026-106',
    salesperson: 'เซลล์ซี',
    customer_name: 'รีสอร์ทบ้านตาขุน ริเวอร์วิว',
    customer_phone: '077-431-220',
    district: 'บ้านตาขุน',
    route_code: 'route_2',
    delivery_location: '55 หมู่ 4 ต.เขาวง อ.บ้านตาขุน จ.สุราษฎร์ธานี',
    delivery_date: new Date().toISOString().split('T')[0],
    bill_type: 'tax_invoice',
    payment_term: 'credit_30',
    delivery_mode: 'install',
    site_notes: 'ติดตั้งกล้อง CCTV 8 จุดรอบรีสอร์ท พร้อมเดินสาย LAN',
    bill_no: 'INV-2026-106',
    order_status: 'approved_for_prep',
    items_list: [
      { model_name: 'Hikvision 8CH NVR + 4MP CCTV Kit', quantity: 1, supplier: 'Synnex (Thailand)', po_no: 'SYN/2569-301', item_type: 'hardware', unit: 'ชุด', unit_price: 18900, unit_cost: 14500, warranty_years: 2 }
    ],
    extra_cost: 1200,
    created_at: new Date(Date.now() - 86400000 * 2).toISOString(),
    created_by: 'เซลล์ซี',
    created_at_log: new Date(Date.now() - 86400000 * 2).toISOString(),
    stock_cut_at: new Date(Date.now() - 86400000).toISOString(),
    dispatched_at: new Date(Date.now() - 3600000 * 2).toISOString()
  },
  // ---------------------------------------------------------------------------
  // Order 7: ส่งมอบสมบูรณ์แล้ว (fulfilled) - อยู่ใน Archive CompletedLogs
  // ---------------------------------------------------------------------------
  {
    id: 'ord-007',
    sales_ref: 'SO-2026-107',
    salesperson: 'เซลล์เอ',
    customer_name: 'ร้านขายยาไชยาพาณิชย์',
    customer_phone: '077-431-220',
    district: 'ไชยา',
    route_code: 'route_1',
    delivery_location: 'ถ.ตลาดไชยา ต.ตลาดไชยา อ.ไชยา จ.สุราษฎร์ธานี',
    delivery_date: new Date(Date.now() - 86400000 * 3).toISOString().split('T')[0],
    bill_type: 'tax_invoice',
    payment_term: 'cash',
    delivery_mode: 'install',
    site_notes: 'ติดตั้งเครื่องพิมพ์ใบเสร็จและลงโปรแกรมขายยา',
    bill_no: 'INV-2026-107',
    order_status: 'fulfilled',
    items_list: [
      { model_name: 'Brother HL-L3240CDW Color Laser Printer', quantity: 1, supplier: 'Abshop', po_no: 'ABS/2569-301', item_type: 'hardware', unit: 'เครื่อง', unit_price: 10900, unit_cost: 8900, warranty_years: 3 }
    ],
    extra_cost: 500,
    created_at: new Date(Date.now() - 86400000 * 5).toISOString(),
    created_by: 'เซลล์เอ',
    created_at_log: new Date(Date.now() - 86400000 * 5).toISOString(),
    stock_cut_at: new Date(Date.now() - 86400000 * 4).toISOString(),
    dispatched_at: new Date(Date.now() - 86400000 * 3).toISOString(),
    fulfilled_at: new Date(Date.now() - 86400000 * 3).toISOString()
  },
  // ---------------------------------------------------------------------------
  // Order 8: ส่งมอบสมบูรณ์แล้ว (fulfilled) - อยู่ใน Archive CompletedLogs
  // ---------------------------------------------------------------------------
  {
    id: 'ord-008',
    sales_ref: 'SO-2026-108',
    salesperson: 'เซลล์บี',
    customer_name: 'บจก. สุราษฎร์ดิจิทัล มีเดีย',
    customer_phone: '077-212-889',
    district: 'เมืองสุราษฎร์ธานี',
    route_code: 'route_5',
    delivery_location: 'อาคารสำนักงาน ถ.ศรีวิชัย ต.มะขามเตี้ย อ.เมือง จ.สุราษฎร์ธานี',
    delivery_date: new Date(Date.now() - 86400000 * 6).toISOString().split('T')[0],
    bill_type: 'tax_invoice',
    payment_term: 'credit_30',
    delivery_mode: 'install',
    site_notes: 'ติดตั้งพร้อมลงโปรแกรมตัดต่อวิดีโอ 2 เครื่อง',
    bill_no: 'INV-2026-108',
    order_status: 'fulfilled',
    items_list: [
      { model_name: 'BossComputech Core-i7 Workstation Pro', quantity: 2, supplier: 'Synnex (Thailand)', po_no: 'SYN/2569-455', item_type: 'hardware', unit: 'เครื่อง', unit_price: 32500, unit_cost: 24800, warranty_years: 3 },
      { model_name: 'ค่าบริการติดตั้งและอบรมการใช้งานโปรแกรม POS หน้าร้าน', quantity: 1, item_type: 'service', unit: 'รายการ', unit_price: 1500, unit_cost: 0 }
    ],
    extra_cost: 2000,
    created_at: new Date(Date.now() - 86400000 * 8).toISOString(),
    created_by: 'เซลล์บี',
    created_at_log: new Date(Date.now() - 86400000 * 8).toISOString(),
    stock_cut_at: new Date(Date.now() - 86400000 * 7).toISOString(),
    dispatched_at: new Date(Date.now() - 86400000 * 6).toISOString(),
    fulfilled_at: new Date(Date.now() - 86400000 * 6).toISOString(),
    billing_type: 'sales',
    sub_type: 'standard',
    billing_status: 'billed',
    tax_invoice_no: 'IV-2026-0108'
  },
  // ---------------------------------------------------------------------------
  // Order 9: บิลเช่าเน็ต (Rental - Internet) รอบ 2026-10 (วางบิลแล้ว)
  // ---------------------------------------------------------------------------
  {
    id: 'ord-009',
    sales_ref: 'SO-2026-109',
    salesperson: 'เซลล์เอ',
    customer_id: 'cust-surat-resort',
    customer_name: 'โรงแรมสุราษฎร์ แกรนด์ รีสอร์ท',
    customer_phone: '077-288-900',
    district: 'เมืองสุราษฎร์ธานี',
    route_code: 'route_5',
    delivery_location: '88/9 ถ.ตลาดใหม่ ต.ตลาด อ.เมือง จ.สุราษฎร์ธานี',
    delivery_date: '2026-10-01',
    issue_date: '2026-10-01',
    due_date: '2026-10-31',
    bill_type: 'tax_invoice',
    payment_term: 'credit_30',
    delivery_mode: 'install',
    site_notes: 'ค่าบริการเช่าอินเทอร์เน็ต Fiber Leased Line + Wi-Fi Hotspot รอบ ต.ค. 2026',
    bill_no: 'INV-2026-109',
    order_status: 'fulfilled',
    billing_type: 'rental',
    sub_type: 'internet_rental',
    contract_id: 'ctr-rent-net-01',
    billing_period: '2026-10',
    period_start: '2026-10-01',
    period_end: '2026-10-31',
    billing_status: 'billed',
    tax_invoice_no: 'IV-2026-0109',
    items_list: [
      { model_name: 'ค่าเช่าวงจรอินเทอร์เน็ต Fiber Leased Line 500/500 Mbps (รายเดือน)', quantity: 1, item_type: 'service', unit: 'รายการ', unit_price: 8500, unit_cost: 4200 },
      { model_name: 'ค่าเช่าชุดจัดการ Wi-Fi Gateway + Access Point 8 จุด', quantity: 1, item_type: 'service', unit: 'ชุด', unit_price: 4500, unit_cost: 1200 }
    ],
    extra_cost: 0,
    created_at: new Date(Date.now() - 86400000 * 15).toISOString(),
    created_by: 'เซลล์เอ',
    created_at_log: new Date(Date.now() - 86400000 * 15).toISOString(),
    fulfilled_at: new Date(Date.now() - 86400000 * 14).toISOString()
  },
  // ---------------------------------------------------------------------------
  // Order 10: บิลดูแลระบบ MA (MA Monthly) รอบ 2026-10 (รอวางบิล)
  // ---------------------------------------------------------------------------
  {
    id: 'ord-010',
    sales_ref: 'SO-2026-110',
    salesperson: 'เซลล์บี',
    customer_id: 'cust-tapi-hospital',
    customer_name: 'คลินิกเวชกรรมตาปี เมดิคอล',
    customer_phone: '077-311-550',
    district: 'พุนพิน',
    route_code: 'route_1',
    delivery_location: '112 ม.3 ต.ท่าข้าม อ.พุนพิน จ.สุราษฎร์ธานี',
    delivery_date: '2026-10-05',
    issue_date: '2026-10-05',
    due_date: '2026-11-04',
    bill_type: 'tax_invoice',
    payment_term: 'credit_30',
    delivery_mode: 'install',
    site_notes: 'ค่าบริการดูแลระบบ Server, POS & Network รายเดือน (MA)',
    bill_no: null,
    order_status: 'fulfilled',
    billing_type: 'ma',
    sub_type: 'ma_monthly',
    contract_id: 'ctr-ma-01',
    billing_period: '2026-10',
    period_start: '2026-10-01',
    period_end: '2026-10-31',
    billing_status: 'pending',
    items_list: [
      { model_name: 'ค่าบริการดูแลระบบ Server & Network (MA รายเดือน)', quantity: 1, item_type: 'service', unit: 'รายการ', unit_price: 9500, unit_cost: 2500 },
      { model_name: 'ค่าบริการตรวจเช็กเครื่องลูกข่าย & Backup รายเดือน (12 เครื่อง)', quantity: 12, item_type: 'service', unit: 'เครื่อง', unit_price: 350, unit_cost: 100 }
    ],
    extra_cost: 0,
    created_at: new Date(Date.now() - 86400000 * 5).toISOString(),
    created_by: 'เซลล์บี',
    created_at_log: new Date(Date.now() - 86400000 * 5).toISOString(),
    fulfilled_at: new Date(Date.now() - 86400000 * 4).toISOString()
  },
  // ---------------------------------------------------------------------------
  // Order 11: บิลนอกสัญญา / เพิ่มเติม (Addon)
  // ---------------------------------------------------------------------------
  {
    id: 'ord-011',
    sales_ref: 'SO-2026-111',
    salesperson: 'เซลล์ซี',
    customer_id: 'cust-surat-resort',
    customer_name: 'โรงแรมสุราษฎร์ แกรนด์ รีสอร์ท',
    customer_phone: '077-288-900',
    district: 'เมืองสุราษฎร์ธานี',
    route_code: 'route_5',
    delivery_location: '88/9 ถ.ตลาดใหม่ ต.ตลาด อ.เมือง จ.สุราษฎร์ธานี',
    delivery_date: '2026-11-12',
    issue_date: '2026-11-12',
    due_date: '2026-11-12',
    bill_type: 'tax_invoice',
    payment_term: 'cash',
    delivery_mode: 'install',
    site_notes: 'เดินจุดสาย LAN เพิ่มโซนห้องประชุมใหม่ (นอกสัญญาเช่าเน็ต)',
    bill_no: null,
    order_status: 'approved_for_prep',
    billing_type: 'addon',
    sub_type: 'addon_service',
    contract_id: 'ctr-rent-net-01',
    billing_status: 'pending',
    items_list: [
      { model_name: 'ค่าบริการเดินสาย LAN ท่อร้อยสาย และจัดตู้ Rack Server (ต่อจุด)', quantity: 4, item_type: 'service', unit: 'จุด', unit_price: 450, unit_cost: 250 },
      { model_name: 'Ubiquiti UniFi U6-Pro Wi-Fi 6 Access Point', quantity: 1, item_type: 'hardware', unit: 'เครื่อง', unit_price: 6200, unit_cost: 4950, warranty_years: 2 }
    ],
    extra_cost: 0,
    created_at: new Date(Date.now() - 86400000 * 2).toISOString(),
    created_by: 'เซลล์ซี',
    created_at_log: new Date(Date.now() - 86400000 * 2).toISOString()
  }
];

// ==============================================================================
// Items (ครอบคลุมทุกสถานะ: raw_stock / in_stock / pending_prep / prepped_in_stock
//        / ready_for_dispatch / assigned_onsite / delivered)
// ==============================================================================
export const INITIAL_ITEMS: Item[] = [
  // ---------------------------------------------------------------------------
  // raw_stock: รับจาก Stock PO เข้าสต๊อกตรงๆ นับถอยหลัง DOA 7 วัน (รอ Prep Tech เทส)
  // ---------------------------------------------------------------------------
  {
    id: 'itm-raw-01',
    order_id: null,
    model_name: 'Huawei eKitEngine S220-24P4X Switch',
    serial_number: null,
    status: 'raw_stock',
    prep_type: 'stock_po',
    category: 'cctv_network',
    stock_po_id: 'spo-001',
    unit_cost: 8900,
    supplier: 'Synnex (Thailand)',
    po_no: 'SPO-2569-001',
    prep_note: 'รับเข้าห้องสต๊อก รอช่างเตรียมเทส/ติดโลโก้/ยิง S/N',
    assigned_prep_tech: null,
    prep_accepted_at: null,
    assigned_techs: [],
    prepped_at: null,
    void_date: null,
    notes: 'นับถอยหลัง DOA 7 วันจากวันที่รับเข้าห้องสต๊อก',
    created_at: new Date(Date.now() - 86400000 * 2).toISOString(),
    received_at: new Date(Date.now() - 86400000 * 2).toISOString(),
    received_into_storage_at: new Date(Date.now() - 86400000 * 2).toISOString()
  },
  {
    id: 'itm-raw-02',
    order_id: null,
    model_name: 'Huawei eKitEngine S220-24P4X Switch',
    serial_number: null,
    status: 'raw_stock',
    prep_type: 'stock_po',
    category: 'cctv_network',
    stock_po_id: 'spo-001',
    unit_cost: 8900,
    supplier: 'Synnex (Thailand)',
    po_no: 'SPO-2569-001',
    prep_note: 'รับเข้าห้องสต๊อก รอช่างเตรียมเทส/ติดโลโก้/ยิง S/N',
    assigned_prep_tech: null,
    prep_accepted_at: null,
    assigned_techs: [],
    prepped_at: null,
    void_date: null,
    notes: 'นับถอยหลัง DOA 7 วันจากวันที่รับเข้าห้องสต๊อก',
    created_at: new Date(Date.now() - 86400000 * 2).toISOString(),
    received_at: new Date(Date.now() - 86400000 * 2).toISOString(),
    received_into_storage_at: new Date(Date.now() - 86400000 * 2).toISOString()
  },
  // ---------------------------------------------------------------------------
  // in_stock: เทส/ติดโลโก้/ยิง S/N เรียบร้อยแล้ว พร้อมขาย (Sales เห็นสต๊อกทันที)
  // ---------------------------------------------------------------------------
  {
    id: 'itm-stock-01',
    order_id: null,
    model_name: 'Mikrotik RB4011iGS+RM Router',
    serial_number: 'MT-RB4011-901',
    status: 'in_stock',
    prep_type: 'inbound_stock',
    category: 'cctv_network',
    unit_cost: 6900,
    supplier: 'PKT Computer & Supply',
    po_no: 'PKT/2569-115',
    assigned_techs: [],
    prepped_at: new Date(Date.now() - 86400000 * 4).toISOString(),
    void_date: null,
    notes: 'เทสผ่าน เก็บเข้าสต๊อกคลังหลักสุราษฎร์ฯ ชั้น A2 พร้อมขาย',
    created_at: new Date(Date.now() - 86400000 * 4).toISOString(),
    moved_to_ready_at: new Date(Date.now() - 86400000 * 4).toISOString()
  },
  {
    id: 'itm-stock-02',
    order_id: null,
    model_name: 'Brother HL-L3240CDW Color Laser Printer',
    serial_number: 'BR-HL3240-552',
    status: 'in_stock',
    prep_type: 'inbound_stock',
    category: 'printer',
    unit_cost: 8900,
    supplier: 'สต๊อกร้าน (Main Store)',
    po_no: 'STORE-STK',
    assigned_techs: [],
    prepped_at: new Date(Date.now() - 86400000 * 3).toISOString(),
    void_date: null,
    notes: 'เทสพิมพ์สีผ่าน เก็บเข้าสต๊อกพร้อมขาย',
    created_at: new Date(Date.now() - 86400000 * 3).toISOString(),
    moved_to_ready_at: new Date(Date.now() - 86400000 * 3).toISOString()
  },
  {
    id: 'itm-stock-03',
    order_id: null,
    model_name: 'Epson LQ-310 Dot Matrix Printer',
    serial_number: 'EP-LQ310-778',
    status: 'in_stock',
    prep_type: 'inbound_stock',
    category: 'printer',
    unit_cost: 5900,
    supplier: 'SIS Distribution',
    po_no: 'SIS/2569-220',
    assigned_techs: [],
    prepped_at: new Date(Date.now() - 86400000 * 2).toISOString(),
    void_date: null,
    notes: 'เทสพิมพ์ใบเสร็จผ่าน เก็บเข้าสต๊อกพร้อมขาย',
    created_at: new Date(Date.now() - 86400000 * 2).toISOString(),
    moved_to_ready_at: new Date(Date.now() - 86400000 * 2).toISOString()
  },
  // ---------------------------------------------------------------------------
  // pending_prep: ตัดสต๊อกแล้ว รอช่างเตรียม (Order 2)
  // ---------------------------------------------------------------------------
  {
    id: 'itm-001',
    order_id: 'ord-002',
    model_name: 'Brother HL-L3240CDW Color Laser Printer',
    serial_number: null,
    status: 'pending_prep',
    prep_type: 'outbound_dispatch',
    category: 'printer',
    supplier: 'สต๊อกร้าน (Main Store)',
    po_no: 'STORE-STK',
    prep_note: 'มีกล่องพร้อมลง Driver และติดโลโก้ BossComputech',
    delivery_mode: 'drop_off',
    assigned_prep_tech: 'ช่างกอล์ฟ (ช่างเตรียมสินค้า)',
    prep_accepted_at: new Date(Date.now() - 3600000).toISOString(),
    job_category: 'delivery',
    assigned_techs: [],
    prepped_at: null,
    void_date: null,
    warranty_years: 3,
    notes: 'รอช่างเตรียมยิง S/N และลง Driver',
    created_at: new Date(Date.now() - 3600000 * 3).toISOString()
  },
  // ---------------------------------------------------------------------------
  // prepped_in_stock: ช่างเตรียมเสร็จ รอแปะวอย (Order 3) - Section [2] หน้าร้าน
  // ---------------------------------------------------------------------------
  {
    id: 'itm-002',
    order_id: 'ord-003',
    model_name: 'BossComputech Core-i7 Workstation Pro',
    serial_number: 'BC-2026-088',
    status: 'prepped_in_stock',
    prep_type: 'outbound_dispatch',
    category: 'pc_notebook',
    supplier: 'Synnex (Thailand)',
    po_no: 'SYN/2569-902',
    prep_note: 'ประกอบเทสผ่าน 100% รอแปะวอยส่งมอบ',
    delivery_mode: 'install',
    assigned_prep_tech: 'ช่างกอล์ฟ (ช่างเตรียมสินค้า)',
    prep_accepted_at: new Date(Date.now() - 3600000 * 6).toISOString(),
    job_category: 'delivery',
    assigned_techs: [],
    prepped_at: new Date(Date.now() - 3600000 * 2).toISOString(),
    void_date: null,
    warranty_years: 3,
    notes: 'ประกอบ/ลงโปรแกรม/ยิง S/N เสร็จ เก็บเข้าสต๊อกรอแปะวอยปล่อยของ',
    created_at: new Date(Date.now() - 86400000).toISOString(),
    moved_to_ready_at: new Date(Date.now() - 3600000 * 2).toISOString()
  },
  // ---------------------------------------------------------------------------
  // ready_for_dispatch: แปะวอยประกันแล้ว พร้อมปล่อยรถ (Order 4) - Section [1] หน้าร้าน
  // ---------------------------------------------------------------------------
  {
    id: 'itm-003',
    order_id: 'ord-004',
    model_name: 'Huawei eKitEngine S220-24P4X Switch',
    serial_number: 'HW-S220-4411',
    status: 'ready_for_dispatch',
    prep_type: 'outbound_dispatch',
    category: 'cctv_network',
    supplier: 'Synnex (Thailand)',
    po_no: 'SYN/2569-892',
    prep_note: 'เทสพอร์ต PoE ครบ 24 พอร์ตผ่าน',
    delivery_mode: 'install',
    assigned_prep_tech: 'ช่างกอล์ฟ (ช่างเตรียมสินค้า)',
    prep_accepted_at: new Date(Date.now() - 3600000 * 9).toISOString(),
    job_category: 'installation',
    assigned_techs: [],
    prepped_at: new Date(Date.now() - 3600000 * 5).toISOString(),
    void_date: new Date().toISOString().split('T')[0],
    warranty_years: 3,
    warranty_void_date: new Date(Date.now() - 3600000 * 4).toISOString(),
    warranty_expire_date: computeExpire(new Date(Date.now() - 3600000 * 4).toISOString(), 3, 0),
    notes: 'แปะวอยประกัน 3 ปีแล้ว พร้อมจ่ายงานช่าง Onsite สาย 5',
    created_at: new Date(Date.now() - 3600000 * 12).toISOString(),
    moved_to_ready_at: new Date(Date.now() - 3600000 * 5).toISOString(),
    warranty_applied_at: new Date(Date.now() - 3600000 * 4).toISOString()
  },
  {
    id: 'itm-004',
    order_id: 'ord-004',
    model_name: 'Mikrotik RB4011iGS+RM Router',
    serial_number: 'MT-RB4011-4412',
    status: 'ready_for_dispatch',
    prep_type: 'outbound_dispatch',
    category: 'cctv_network',
    supplier: 'PKT Computer & Supply',
    po_no: 'PKT/2569-115',
    prep_note: 'อัปเฟิร์มแวร์ล่าสุดและเซ็ตค่าเริ่มต้นผ่าน',
    delivery_mode: 'install',
    assigned_prep_tech: 'ช่างกอล์ฟ (ช่างเตรียมสินค้า)',
    prep_accepted_at: new Date(Date.now() - 3600000 * 9).toISOString(),
    job_category: 'installation',
    assigned_techs: [],
    prepped_at: new Date(Date.now() - 3600000 * 5).toISOString(),
    void_date: new Date().toISOString().split('T')[0],
    warranty_years: 3,
    warranty_void_date: new Date(Date.now() - 3600000 * 4).toISOString(),
    warranty_expire_date: computeExpire(new Date(Date.now() - 3600000 * 4).toISOString(), 3, 0),
    notes: 'แปะวอยประกัน 3 ปีแล้ว พร้อมจ่ายงานช่าง Onsite สาย 5',
    created_at: new Date(Date.now() - 3600000 * 12).toISOString(),
    moved_to_ready_at: new Date(Date.now() - 3600000 * 5).toISOString(),
    warranty_applied_at: new Date(Date.now() - 3600000 * 4).toISOString()
  },
  // ---------------------------------------------------------------------------
  // ready_for_dispatch (customer_pickup): ลูกค้ารับเองหน้าร้าน (Order 5) - Section [3]
  // ---------------------------------------------------------------------------
  {
    id: 'itm-005',
    order_id: 'ord-005',
    model_name: 'BossComputech Mini POS Terminal X1',
    serial_number: 'BC-POS-2026-105',
    status: 'ready_for_dispatch',
    prep_type: 'outbound_dispatch',
    category: 'pc_notebook',
    supplier: 'สต๊อกร้าน (Main Store)',
    po_no: 'PKT/2569-083',
    prep_note: 'ลงโปรแกรม POS + เทสเครื่องพิมพ์สลิปผ่าน',
    delivery_mode: 'customer_pickup',
    assigned_prep_tech: 'ช่างกอล์ฟ (ช่างเตรียมสินค้า)',
    prep_accepted_at: new Date(Date.now() - 3600000 * 4).toISOString(),
    job_category: 'delivery',
    assigned_techs: [],
    prepped_at: new Date(Date.now() - 3600000 * 2).toISOString(),
    void_date: new Date().toISOString().split('T')[0],
    warranty_years: 2,
    warranty_void_date: new Date(Date.now() - 3600000).toISOString(),
    warranty_expire_date: computeExpire(new Date(Date.now() - 3600000).toISOString(), 2, 0),
    notes: 'แปะวอยประกัน 2 ปีแล้ว รอลูกค้ามารับเองที่หน้าร้าน',
    created_at: new Date(Date.now() - 3600000 * 6).toISOString(),
    moved_to_ready_at: new Date(Date.now() - 3600000 * 2).toISOString(),
    warranty_applied_at: new Date(Date.now() - 3600000).toISOString()
  },
  // ---------------------------------------------------------------------------
  // assigned_onsite: จ่ายงานช่าง Onsite แล้ว (Order 6) - คิว Onsite สาย 2
  // ---------------------------------------------------------------------------
  {
    id: 'itm-006',
    order_id: 'ord-006',
    model_name: 'Hikvision 8CH NVR + 4MP CCTV Kit',
    serial_number: 'HK-NVR-8CH-6612',
    status: 'assigned_onsite',
    prep_type: 'outbound_dispatch',
    category: 'cctv_network',
    supplier: 'Synnex (Thailand)',
    po_no: 'SYN/2569-301',
    prep_note: 'เซ็ต NVR + กล้อง 8 ตัว เทสออนไลน์ผ่าน',
    delivery_mode: 'install',
    assigned_prep_tech: 'ช่างกอล์ฟ (ช่างเตรียมสินค้า)',
    prep_accepted_at: new Date(Date.now() - 86400000).toISOString(),
    job_category: 'installation',
    assigned_techs: ['ช่างเอ'],
    assigned_onsite_tech: 'ช่างเอ',
    prepped_at: new Date(Date.now() - 3600000 * 20).toISOString(),
    void_date: new Date().toISOString().split('T')[0],
    warranty_years: 2,
    warranty_void_date: new Date(Date.now() - 3600000 * 3).toISOString(),
    warranty_expire_date: computeExpire(new Date(Date.now() - 3600000 * 3).toISOString(), 2, 0),
    notes: 'จ่ายงานช่างเอ (สาย 2) นำไปติดตั้งที่รีสอร์ทบ้านตาขุน',
    created_at: new Date(Date.now() - 86400000 * 2).toISOString(),
    moved_to_ready_at: new Date(Date.now() - 3600000 * 20).toISOString(),
    warranty_applied_at: new Date(Date.now() - 3600000 * 3).toISOString(),
    assigned_at: new Date(Date.now() - 3600000 * 2).toISOString(),
    dispatched_at: new Date(Date.now() - 3600000 * 2).toISOString()
  },
  // ---------------------------------------------------------------------------
  // delivered: ส่งมอบแล้ว (Order 7) - อยู่ใน Archive CompletedLogs
  // ---------------------------------------------------------------------------
  {
    id: 'itm-007',
    order_id: 'ord-007',
    model_name: 'Brother HL-L3240CDW Color Laser Printer',
    serial_number: 'BR-HL3240-2026-107',
    status: 'delivered',
    prep_type: 'outbound_dispatch',
    category: 'printer',
    supplier: 'Abshop',
    po_no: 'ABS/2569-301',
    delivery_mode: 'install',
    job_category: 'delivery',
    assigned_techs: ['ช่างเอ'],
    assigned_onsite_tech: 'ช่างเอ',
    prepped_at: new Date(Date.now() - 86400000 * 4).toISOString(),
    void_date: new Date(Date.now() - 86400000 * 3).toISOString().split('T')[0],
    warranty_years: 3,
    warranty_void_date: new Date(Date.now() - 86400000 * 3).toISOString(),
    warranty_expire_date: computeExpire(new Date(Date.now() - 86400000 * 3).toISOString(), 3, 0),
    notes: 'ส่งมอบและติดตั้งเรียบร้อย ลูกค้าเซ็นรับครบถ้วน',
    created_at: new Date(Date.now() - 86400000 * 5).toISOString(),
    moved_to_ready_at: new Date(Date.now() - 86400000 * 4).toISOString(),
    warranty_applied_at: new Date(Date.now() - 86400000 * 3).toISOString(),
    assigned_at: new Date(Date.now() - 86400000 * 3).toISOString(),
    dispatched_at: new Date(Date.now() - 86400000 * 3).toISOString(),
    delivered_at: new Date(Date.now() - 86400000 * 3).toISOString()
  },
  // ---------------------------------------------------------------------------
  // delivered: ส่งมอบแล้ว (Order 8) - อยู่ใน Archive CompletedLogs
  // ---------------------------------------------------------------------------
  {
    id: 'itm-008',
    order_id: 'ord-008',
    model_name: 'BossComputech Core-i7 Workstation Pro',
    serial_number: 'BC-2026-108A',
    status: 'delivered',
    prep_type: 'outbound_dispatch',
    category: 'pc_notebook',
    supplier: 'Synnex (Thailand)',
    po_no: 'SYN/2569-455',
    delivery_mode: 'install',
    job_category: 'delivery',
    assigned_techs: ['ช่างบี'],
    assigned_onsite_tech: 'ช่างบี',
    prepped_at: new Date(Date.now() - 86400000 * 7).toISOString(),
    void_date: new Date(Date.now() - 86400000 * 6).toISOString().split('T')[0],
    warranty_years: 3,
    warranty_void_date: new Date(Date.now() - 86400000 * 6).toISOString(),
    warranty_expire_date: computeExpire(new Date(Date.now() - 86400000 * 6).toISOString(), 3, 0),
    notes: 'ส่งมอบเครื่องที่ 1 พร้อมลงโปรแกรมตัดต่อวิดีโอ',
    created_at: new Date(Date.now() - 86400000 * 8).toISOString(),
    moved_to_ready_at: new Date(Date.now() - 86400000 * 7).toISOString(),
    warranty_applied_at: new Date(Date.now() - 86400000 * 6).toISOString(),
    assigned_at: new Date(Date.now() - 86400000 * 6).toISOString(),
    dispatched_at: new Date(Date.now() - 86400000 * 6).toISOString(),
    delivered_at: new Date(Date.now() - 86400000 * 6).toISOString()
  },
  {
    id: 'itm-009',
    order_id: 'ord-008',
    model_name: 'BossComputech Core-i7 Workstation Pro',
    serial_number: 'BC-2026-108B',
    status: 'delivered',
    prep_type: 'outbound_dispatch',
    category: 'pc_notebook',
    supplier: 'Synnex (Thailand)',
    po_no: 'SYN/2569-455',
    delivery_mode: 'install',
    job_category: 'delivery',
    assigned_techs: ['ช่างบี'],
    assigned_onsite_tech: 'ช่างบี',
    prepped_at: new Date(Date.now() - 86400000 * 7).toISOString(),
    void_date: new Date(Date.now() - 86400000 * 6).toISOString().split('T')[0],
    warranty_years: 3,
    warranty_void_date: new Date(Date.now() - 86400000 * 6).toISOString(),
    warranty_expire_date: computeExpire(new Date(Date.now() - 86400000 * 6).toISOString(), 3, 0),
    notes: 'ส่งมอบเครื่องที่ 2 พร้อมลงโปรแกรมตัดต่อวิดีโอ',
    created_at: new Date(Date.now() - 86400000 * 8).toISOString(),
    moved_to_ready_at: new Date(Date.now() - 86400000 * 7).toISOString(),
    warranty_applied_at: new Date(Date.now() - 86400000 * 6).toISOString(),
    assigned_at: new Date(Date.now() - 86400000 * 6).toISOString(),
    dispatched_at: new Date(Date.now() - 86400000 * 6).toISOString(),
    delivered_at: new Date(Date.now() - 86400000 * 6).toISOString()
  },
  // ---------------------------------------------------------------------------
  // Project PRJ-2026-001 Batch #1 Items:
  // 1) Switch PoE ที่ช่างเตรียมติดวอยประกันและส่งเข้าไซต์งานแล้ว (ค้นหา S/N เจอประวัติโปรเจกต์ครบ)
  // 2) ชุดกล้อง CCTV NVR ที่ตัดงวดเบิกที่ 1 รอช่างเตรียมเซ็ตอัพ & ติดวอยประกัน
  // ---------------------------------------------------------------------------
  {
    id: 'itm-prj-01',
    order_id: null,
    project_id: 'PRJ-2026-001',
    project_batch_no: 1,
    project_item_id: 'pitem-1',
    model_name: 'Huawei eKitEngine S220-24P4X Switch',
    serial_number: 'HW-S220-PRJ01',
    status: 'assigned_onsite',
    prep_type: 'outbound_dispatch',
    category: 'cctv_network',
    unit_cost: 8900,
    supplier: 'Synnex (Thailand)',
    po_no: 'PRJ-2026-001 • งวดที่ 1',
    prep_note: '[โปรเจกต์] PRJ-2026-001 • งวดเบิกที่ 1 — เซ็ต VLAN & เทส PoE 24 พอร์ต',
    delivery_mode: 'project',
    assigned_prep_tech: 'ช่างกอล์ฟ (ช่างเตรียมสินค้า)',
    prep_accepted_at: new Date(Date.now() - 86400000).toISOString(),
    job_category: 'installation',
    assigned_techs: ['ช่างซี', 'ช่างดี'],
    assigned_onsite_tech: 'ช่างซี',
    prepped_at: new Date(Date.now() - 3600000 * 20).toISOString(),
    void_date: new Date(Date.now() - 86400000).toISOString().split('T')[0],
    warranty_years: 3,
    warranty_void_date: new Date(Date.now() - 86400000).toISOString(),
    warranty_expire_date: computeExpire(new Date(Date.now() - 86400000).toISOString(), 3, 0),
    logo_applied: true,
    notes: 'ติดวอยประกัน & ส่งเข้าไซต์งาน PRJ-2026-001 (งวดเบิกที่ 1)',
    created_at: new Date(Date.now() - 86400000 * 2).toISOString(),
    warranty_applied_at: new Date(Date.now() - 86400000).toISOString(),
    assigned_at: new Date(Date.now() - 86400000).toISOString(),
    dispatched_at: new Date(Date.now() - 86400000).toISOString(),
    activity_logs: [
      {
        timestamp: new Date(Date.now() - 86400000 * 1.5).toISOString(),
        action: 'ปล่อยของงวดเบิกโปรเจกต์ (Batch #1)',
        actor: 'คุณสมศรี (จัดซื้อและสต๊อกสินค้า)',
        role: 'accounting',
        note: 'โปรเจกต์ PRJ-2026-001 • งวดเบิกที่ 1 ส่งให้ช่างเตรียม'
      },
      {
        timestamp: new Date(Date.now() - 86400000).toISOString(),
        action: 'ติดวอยประกัน & ส่งเข้าไซต์งานโปรเจกต์',
        actor: 'ช่างกอล์ฟ (ช่างเตรียมสินค้า)',
        role: 'prep',
        note: 'S/N: HW-S220-PRJ01 | โปรเจกต์ PRJ-2026-001 • งวดเบิกที่ 1'
      }
    ]
  },
  {
    id: 'itm-prj-02',
    order_id: null,
    project_id: 'PRJ-2026-001',
    project_batch_no: 1,
    project_item_id: 'pitem-2',
    model_name: 'Hikvision 8CH NVR + 4MP CCTV Kit',
    serial_number: 'HK-NVR-PRJ01',
    status: 'pending_prep',
    prep_type: 'outbound_dispatch',
    category: 'cctv_network',
    unit_cost: 14500,
    supplier: 'Synnex (Thailand)',
    po_no: 'PRJ-2026-001 • งวดที่ 1',
    prep_note: '[โปรเจกต์] PRJ-2026-001 • งวดเบิกที่ 1 — ตั้งค่า IP กล้อง 8 ตัว + NVR ก่อนส่งเข้าไซต์งาน',
    delivery_mode: 'project',
    assigned_prep_tech: 'ช่างกอล์ฟ (ช่างเตรียมสินค้า)',
    prep_accepted_at: new Date(Date.now() - 3600000 * 3).toISOString(),
    job_category: 'installation',
    assigned_techs: ['ช่างซี', 'ช่างดี'],
    assigned_onsite_tech: 'ช่างซี',
    prepped_at: null,
    void_date: null,
    warranty_years: 2,
    logo_applied: true,
    notes: 'รอช่างเตรียมเซ็ตอัพ & ติดวอยประกันส่งเข้าไซต์งาน PRJ-2026-001',
    created_at: new Date(Date.now() - 3600000 * 5).toISOString(),
    activity_logs: [
      {
        timestamp: new Date(Date.now() - 3600000 * 5).toISOString(),
        action: 'ปล่อยของงวดเบิกโปรเจกต์ (Batch #1)',
        actor: 'คุณสมศรี (จัดซื้อและสต๊อกสินค้า)',
        role: 'accounting',
        note: 'โปรเจกต์ PRJ-2026-001 • งวดเบิกที่ 1 ส่งให้ช่างเตรียม'
      }
    ]
  },
  // ---------------------------------------------------------------------------
  // หมวดสายแลน / กล่องสายแลน / สายไฟเบอร์ / วัสดุสิ้นเปลืองพร้อมใช้ (in_stock)
  // ---------------------------------------------------------------------------
  ...[1, 2, 3].map((n) => ({
    id: `item-stock-lan6-${n}`,
    order_id: null,
    model_name: 'สายสัญญาณ LAN Link Cat6 UTP 305m (กล่อง)',
    serial_number: `BOX-CAT6-260${n}`,
    category: 'cctv_network' as const,
    status: 'in_stock' as const,
    cost_price: 2900,
    sell_price: 3850,
    supplier: 'Interlink Communication',
    po_no: 'PO-STK-2026-011',
    prep_note: undefined,
    delivery_mode: undefined,
    assigned_prep_tech: null,
    prep_accepted_at: null,
    job_category: undefined,
    assigned_techs: [],
    assigned_onsite_tech: null,
    prepped_at: null,
    void_date: null,
    warranty_years: 1,
    logo_applied: false,
    notes: 'กล่องสายแลน Cat6 305m พร้อมเบิกใช้งานหน้างานทันที',
    created_at: new Date(Date.now() - 86400000 * 4).toISOString(),
    activity_logs: []
  })),
  ...[1, 2].map((n) => ({
    id: `item-stock-lan5e-${n}`,
    order_id: null,
    model_name: 'สายสัญญาณ LAN Link Cat5e UTP 305m (กล่อง)',
    serial_number: `BOX-CAT5E-260${n}`,
    category: 'cctv_network' as const,
    status: 'in_stock' as const,
    cost_price: 2150,
    sell_price: 2890,
    supplier: 'Interlink Communication',
    po_no: 'PO-STK-2026-011',
    prep_note: undefined,
    delivery_mode: undefined,
    assigned_prep_tech: null,
    prep_accepted_at: null,
    job_category: undefined,
    assigned_techs: [],
    assigned_onsite_tech: null,
    prepped_at: null,
    void_date: null,
    warranty_years: 1,
    logo_applied: false,
    notes: 'กล่องสายแลน Cat5e 305m พร้อมเบิกใช้งานหน้างาน',
    created_at: new Date(Date.now() - 86400000 * 4).toISOString(),
    activity_logs: []
  })),
  ...[1, 2].map((n) => ({
    id: `item-stock-fiber-${n}`,
    order_id: null,
    model_name: 'สาย Fiber Optic Drop Wire 1 Core (ม้วน 1,000m)',
    serial_number: `REEL-FO1C-260${n}`,
    category: 'cctv_network' as const,
    status: 'in_stock' as const,
    cost_price: 1850,
    sell_price: 2590,
    supplier: 'Interlink Communication',
    po_no: 'PO-STK-2026-012',
    prep_note: undefined,
    delivery_mode: undefined,
    assigned_prep_tech: null,
    prep_accepted_at: null,
    job_category: undefined,
    assigned_techs: [],
    assigned_onsite_tech: null,
    prepped_at: null,
    void_date: null,
    warranty_years: 1,
    logo_applied: false,
    notes: 'ม้วนสายไฟเบอร์ออปติก Drop Wire พร้อมใช้เดินระยะไกล',
    created_at: new Date(Date.now() - 86400000 * 3).toISOString(),
    activity_logs: []
  })),
  ...[1, 2, 3, 4].map((n) => ({
    id: `item-stock-patch-${n}`,
    order_id: null,
    model_name: 'สาย Patch Cord Cat6 UTP 2m (เส้น)',
    serial_number: `PC-CAT6-260${n}`,
    category: 'cctv_network' as const,
    status: 'in_stock' as const,
    cost_price: 65,
    sell_price: 120,
    supplier: 'Interlink Communication',
    po_no: 'PO-STK-2026-012',
    prep_note: undefined,
    delivery_mode: undefined,
    assigned_prep_tech: null,
    prep_accepted_at: null,
    job_category: undefined,
    assigned_techs: [],
    assigned_onsite_tech: null,
    prepped_at: null,
    void_date: null,
    warranty_years: 1,
    logo_applied: false,
    notes: 'สายแพตช์คอร์ดสำเร็จรูป สำหรับเข้าตู้ Rack / Switch',
    created_at: new Date(Date.now() - 86400000 * 3).toISOString(),
    activity_logs: []
  })),
  ...[1, 2, 3].map((n) => ({
    id: `item-stock-rj45-${n}`,
    order_id: null,
    model_name: 'หัว RJ45 Cat6 Link (แพ็ค 100 หัว)',
    serial_number: `PK-RJ45-260${n}`,
    category: 'general' as const,
    status: 'in_stock' as const,
    cost_price: 420,
    sell_price: 650,
    supplier: 'Interlink Communication',
    po_no: 'PO-STK-2026-012',
    prep_note: undefined,
    delivery_mode: undefined,
    assigned_prep_tech: null,
    prep_accepted_at: null,
    job_category: undefined,
    assigned_techs: [],
    assigned_onsite_tech: null,
    prepped_at: null,
    void_date: null,
    warranty_years: 1,
    logo_applied: false,
    notes: 'วัสดุสิ้นเปลืองงานเดินสาย LAN',
    created_at: new Date(Date.now() - 86400000 * 3).toISOString(),
    activity_logs: []
  })),
  ...[1, 2, 3].map((n) => ({
    id: `item-stock-pdu-${n}`,
    order_id: null,
    model_name: 'รางปลั๊กไฟ Surge Protection 6 ช่อง (3m)',
    serial_number: `SURGE-6P-260${n}`,
    category: 'general' as const,
    status: 'in_stock' as const,
    cost_price: 390,
    sell_price: 590,
    supplier: 'Advice Distribution',
    po_no: 'PO-STK-2026-013',
    prep_note: undefined,
    delivery_mode: undefined,
    assigned_prep_tech: null,
    prep_accepted_at: null,
    job_category: undefined,
    assigned_techs: [],
    assigned_onsite_tech: null,
    prepped_at: null,
    void_date: null,
    warranty_years: 2,
    logo_applied: false,
    notes: 'ปลั๊กพ่วงกันไฟกระชากพร้อมใช้ติดตั้ง',
    created_at: new Date(Date.now() - 86400000 * 2).toISOString(),
    activity_logs: []
  }))
];

// ==============================================================================
// Repair Tickets (ครอบคลุม: in_house_repair กำลังซ่อม / rma_claim ส่งเคลม 6 วัน
//                 / ready_pickup รอลูกค้ารับ / completed ปิดงานแล้ว)
// ==============================================================================
export const INITIAL_REPAIR_TICKETS: RepairTicket[] = [
  // ---------------------------------------------------------------------------
  // Ticket A: ซ่อมเองหน้าร้าน กำลังซ่อม (in_house_repair / repairing)
  // ---------------------------------------------------------------------------
  {
    id: 'rep-001',
    item_id: null,
    ticket_no: 'REP-2569-083',
    walkin_sn: 'LNV-T14-9941',
    customer_name: 'หจก. กาญจนดิษฐ์ การเกษตร (คุณสมบัติ)',
    customer_phone: '089-223-1122',
    intake_channel: 'front_desk_walkin',
    device_model: 'Lenovo ThinkPad T14 Gen 4',
    accessories: ['Adapter / หม้อแปลง', 'กระเป๋า / กล่อง'],
    accessories_other: 'ใบเสร็จรับเงินตัวเครื่อง',
    picked_up_by: 'คุณนก (แอดมินหน้าร้าน)',
    district: 'กาญจนดิษฐ์',
    route_code: 'route_4',
    delivery_location: '210 ม.2 ต.กะแดะ อ.กาญจนดิษฐ์ จ.สุราษฎร์ธานี',
    job_category: 'repair_pickup',
    fault_symptom: 'เครื่องช้า เปิดโปรแกรมไม่ทันใจ ต้องการอัปเกรด SSD และลง Windows ใหม่',
    repair_detail: 'อัปเกรด SSD Kingston NV2 512GB M.2 + ลง Windows 11 และโปรแกรมสำนักงาน',
    parts_used: 'Kingston NV2 512GB M.2 NVMe SSD',
    repair_cost: 1590,
    repair_outcome: null,
    assigned_techs: [],
    assigned_onsite_tech: null,
    status: 'in_progress',
    received_at: new Date(Date.now() - 3600000 * 5).toISOString(),
    finished_at: null,
    created_at: new Date(Date.now() - 3600000 * 5).toISOString(),
    received_by: 'คุณนก (แอดมินหน้าร้าน)',
    received_channel: 'front_desk',
    repaired_by: 'ช่างชาติ (ช่างซ่อมในร้าน)',
    started_at: new Date(Date.now() - 3600000 * 4).toISOString(),
    service_type: 'in_house_repair',
    included_accessories: 'Adapter / หม้อแปลง, กระเป๋า / กล่อง, ใบเสร็จรับเงินตัวเครื่อง',
    repair_status: 'repairing'
  },
  // ---------------------------------------------------------------------------
  // Ticket B: ส่งเคลมศูนย์ (rma_claim / rma_sent) - ช่าง Onsite รับเครื่องมา 6 วันก่อน
  // ---------------------------------------------------------------------------
  {
    id: 'rep-002',
    item_id: null,
    ticket_no: 'REP-2569-147',
    walkin_sn: 'MT-RB4011-5521',
    customer_name: 'คุณวราภรณ์ ใจดี (ร้านกาแฟบ้านสวน)',
    customer_phone: '081-774-5566',
    intake_channel: 'onsite_pickup',
    device_model: 'Mikrotik RB4011iGS+RM Router',
    accessories: ['Adapter / หม้อแปลง', 'สาย Power'],
    accessories_other: 'ใบเสร็จรับเงินตัวเครื่อง',
    picked_up_by: 'ช่างบี',
    district: 'กาญจนดิษฐ์',
    route_code: 'route_4',
    delivery_location: 'อ.กาญจนดิษฐ์ จ.สุราษฎร์ธานี',
    job_category: 'repair_pickup',
    fault_symptom: 'ไฟสถานะไม่ติดหลังฟ้าผ่า เปิดเครื่องไม่ขึ้น (ยังอยู่ในประกันศูนย์)',
    repair_detail: null,
    parts_used: null,
    repair_outcome: null,
    assigned_techs: ['ช่างบี'],
    assigned_onsite_tech: 'ช่างบี',
    status: 'in_progress',
    received_at: new Date(Date.now() - 86400000 * 6).toISOString(),
    finished_at: null,
    created_at: new Date(Date.now() - 86400000 * 6).toISOString(),
    received_by: 'ช่างบี',
    received_channel: 'onsite_pickup',
    repaired_by: 'ช่างชาติ (ช่างซ่อมในร้าน)',
    started_at: new Date(Date.now() - 86400000 * 6).toISOString(),
    assigned_at: new Date(Date.now() - 86400000 * 6).toISOString(),
    service_type: 'rma_claim',
    included_accessories: 'Adapter / หม้อแปลง, สาย Power, ใบเสร็จรับเงินตัวเครื่อง',
    rma_supplier: 'Synnex',
    rma_tracking_no: 'SNX-RMA-2569-00871',
    rma_sent_date: new Date(Date.now() - 86400000 * 6).toISOString(),
    rma_returned_date: null,
    replacement_sn: null,
    repair_status: 'rma_sent'
  },
  // ---------------------------------------------------------------------------
  // Ticket C: ซ่อมเสร็จ รอลูกค้ารับ (ready_pickup) - Section [4] หน้าร้าน
  // ---------------------------------------------------------------------------
  {
    id: 'rep-003',
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
    repair_detail: 'เปลี่ยน Power Supply ใหม่ 750W และเทสโหลดผ่าน',
    parts_used: 'Power Supply 750W 80+ Bronze',
    repair_cost: 1850,
    repair_outcome: '1. ซ่อมได้ (ซ่อมสำเร็จ)',
    assigned_techs: [],
    assigned_onsite_tech: null,
    status: 'repaired',
    received_at: new Date(Date.now() - 86400000 * 3).toISOString(),
    finished_at: new Date(Date.now() - 3600000 * 6).toISOString(),
    created_at: new Date(Date.now() - 86400000 * 3).toISOString(),
    received_by: 'คุณนก (แอดมินหน้าร้าน)',
    received_channel: 'front_desk',
    repaired_by: 'ช่างชาติ (ช่างซ่อมในร้าน)',
    started_at: new Date(Date.now() - 86400000 * 2).toISOString(),
    service_type: 'in_house_repair',
    included_accessories: 'Adapter / หม้อแปลง, สาย Power',
    repair_status: 'ready_pickup'
  },
  // ---------------------------------------------------------------------------
  // Ticket D: ปิดงานส่งมอบคืนแล้ว (completed) - อยู่ใน Archive CompletedLogs
  // ---------------------------------------------------------------------------
  {
    id: 'rep-004',
    item_id: null,
    ticket_no: 'REP-2569-005',
    walkin_sn: 'EP-LQ310-3301',
    customer_name: 'บจก. สุราษฎร์การพิมพ์',
    customer_phone: '077-355-660',
    intake_channel: 'front_desk_walkin',
    device_model: 'Epson LQ-310 Dot Matrix Printer',
    accessories: ['สาย Power', 'สายสัญญาณ (LAN/HDMI/USB)'],
    accessories_other: '',
    picked_up_by: 'คุณนก (แอดมินหน้าร้าน)',
    district: 'เมืองสุราษฎร์ธานี',
    route_code: 'route_5',
    delivery_location: 'ถ.ตลาดใหม่ ต.ตลาด อ.เมือง จ.สุราษฎร์ธานี',
    job_category: 'repair_pickup',
    fault_symptom: 'พิมพ์กระดาษต่อเนื่องเบี้ยว ใบมีดตัดกระดาษไม่ทำงาน',
    repair_detail: 'เปลี่ยนชุดลูกยางดึงกระดาษและใบมีดตัด พร้อมปรับตั้งระยะ',
    parts_used: 'Tractor Feed Roller Kit LQ-310',
    repair_cost: 950,
    repair_outcome: '1. ซ่อมได้ (ซ่อมสำเร็จ)',
    assigned_techs: [],
    assigned_onsite_tech: null,
    status: 'returned_closed',
    received_at: new Date(Date.now() - 86400000 * 9).toISOString(),
    finished_at: new Date(Date.now() - 86400000 * 7).toISOString(),
    created_at: new Date(Date.now() - 86400000 * 9).toISOString(),
    received_by: 'คุณนก (แอดมินหน้าร้าน)',
    received_channel: 'front_desk',
    repaired_by: 'ช่างชาติ (ช่างซ่อมในร้าน)',
    started_at: new Date(Date.now() - 86400000 * 8).toISOString(),
    delivered_at: new Date(Date.now() - 86400000 * 7).toISOString(),
    service_type: 'in_house_repair',
    included_accessories: 'สาย Power, สายสัญญาณ (LAN/HDMI/USB)',
    repair_status: 'completed'
  },
  // ---------------------------------------------------------------------------
  // Ticket E: รับแจ้งเหตุ Onsite (กล้อง CCTV) - หน้าร้านมอบหมายช่างแล้ว รอช่างออกหน้างาน
  //   ปรากฏในคิว OnsiteView (assignedPickups) ให้ช่างกดรับงาน
  // ---------------------------------------------------------------------------
  {
    id: 'rep-005',
    item_id: null,
    ticket_no: 'REP-2569-201',
    walkin_sn: '',
    customer_name: 'ร้านอาหารครัวทะเลบ้านดอน',
    customer_phone: '086-552-7788',
    intake_channel: 'onsite_pickup',
    device_model: 'ระบบกล้อง CCTV 8 จุด (Hikvision)',
    accessories: [],
    accessories_other: '',
    picked_up_by: null,
    district: 'กาญจนดิษฐ์',
    route_code: 'route_4',
    delivery_location: '99/1 ม.4 ต.บ้านดอน อ.กาญจนดิษฐ์ จ.สุราษฎร์ธานี',
    job_category: 'installation',
    fault_symptom: 'กล้อง CCTV 2 จุดไม่แสดงภาพที่จอมอนิเตอร์ ต้องการให้ช่างเข้าตรวจเช็กสายและเครื่องบันทึกหน้างาน',
    repair_detail: null,
    parts_used: null,
    repair_outcome: null,
    assigned_techs: ['ช่างเอ'],
    assigned_onsite_tech: 'ช่างเอ',
    status: 'open',
    received_at: new Date(Date.now() - 3600000 * 2).toISOString(),
    finished_at: null,
    created_at: new Date(Date.now() - 3600000 * 2).toISOString(),
    received_by: 'คุณนก (แอดมินหน้าร้าน)',
    received_channel: 'onsite_pickup',
    started_at: new Date(Date.now() - 3600000 * 2).toISOString(),
    assigned_at: new Date(Date.now() - 3600000 * 2).toISOString(),
    service_type: 'in_house_repair',
    included_accessories: '',
    repair_status: 'pending_check'
  }
];

// ==============================================================================
// Projects (งานรับเหมา / ติดตั้งระบบหน้างานหลายวัน PRJ-2026-XXX)
// Seeded with 1 realistic active site in_progress with Multi-Sales Add-On Attribution
// ==============================================================================
export const INITIAL_PROJECTS: Project[] = [
  {
    id: 'PRJ-2026-001',
    site_name: 'โครงการติดตั้งระบบ Network & CCTV อาคารคลังสินค้าใหม่ C1-C2',
    customer_name: 'บจก. สุราษฎร์ โลจิสติกส์ พาร์ค (สำนักงานใหญ่)',
    phone: '077-960-888',
    location: 'นิคมอุตสาหกรรมสุราษฎร์ธานี อาคาร C ถ.บายพาส อ.เมือง จ.สุราษฎร์ธานี',
    district: 'เมืองสุราษฎร์ธานี',
    route_code: 'route_5',
    created_by: 'เซลล์เอ',
    start_date: new Date(Date.now() - 86400000 * 2).toISOString().split('T')[0],
    due_date: new Date(Date.now() + 86400000 * 5).toISOString().split('T')[0],
    status: 'in_progress',
    assigned_techs: ['ช่างซี', 'ช่างดี'],
    items: [
      {
        id: 'pitem-1',
        product_id: 'prod-1',
        model_name: 'Huawei eKitEngine S220-24P4X Switch',
        item_type: 'equipment',
        unit: 'เครื่อง',
        qty_required: 2,
        qty_allocated: 1,
        qty_prepared: 1,
        unit_cost: 8900,
        unit_price: 11500,
        warranty_years: 3,
        is_addon: false,
        serial_numbers: ['HW-S220-PRJ01']
      },
      {
        id: 'pitem-2',
        product_id: 'prod-3',
        model_name: 'Hikvision 8CH NVR + 4MP CCTV Kit',
        item_type: 'equipment',
        unit: 'ชุด',
        qty_required: 2,
        qty_allocated: 1,
        qty_prepared: 0,
        unit_cost: 14500,
        unit_price: 18900,
        warranty_years: 2,
        is_addon: false,
        serial_numbers: []
      },
      {
        id: 'pitem-3',
        product_id: 'prod-10',
        model_name: 'ตู้ Rack 42U 600x1000mm พร้อม PDU & พัดลม',
        item_type: 'equipment',
        unit: 'ชุด',
        qty_required: 1,
        qty_allocated: 0,
        qty_prepared: 0,
        unit_cost: 14200,
        unit_price: 18500,
        warranty_years: 3,
        is_addon: false,
        serial_numbers: []
      },
      {
        id: 'pitem-4',
        product_id: 'prod-11',
        model_name: 'สายสัญญาณ LAN Link Cat6 UTP 305m (กล่อง)',
        item_type: 'consumable',
        unit: 'ชุด',
        qty_required: 4,
        qty_allocated: 4,
        qty_prepared: 4,
        unit_cost: 2900,
        unit_price: 3850,
        warranty_years: 0,
        is_addon: false
      },
      {
        id: 'pitem-5',
        product_id: 'prod-12',
        model_name: 'ค่าบริการเดินสาย LAN ท่อร้อยสาย และจัดตู้ Rack Server (ต่อจุด)',
        item_type: 'consumable',
        unit: 'จุด',
        qty_required: 24,
        qty_allocated: 24,
        qty_prepared: 24,
        unit_cost: 250,
        unit_price: 450,
        warranty_years: 0,
        is_addon: false
      },
      {
        id: 'pitem-6',
        product_id: 'prod-9',
        model_name: 'Ubiquiti UniFi U6-Pro Wi-Fi 6 Access Point',
        item_type: 'equipment',
        unit: 'เครื่อง',
        qty_required: 3,
        qty_allocated: 0,
        qty_prepared: 0,
        unit_cost: 4950,
        unit_price: 6200,
        warranty_years: 2,
        is_addon: true,
        added_by: 'เซลล์บี',
        added_at: new Date(Date.now() - 86400000).toISOString(),
        serial_numbers: []
      }
    ],
    batches: [
      {
        id: 'batch-prj-1',
        batch_no: 1,
        released_at: new Date(Date.now() - 86400000 * 1.5).toISOString(),
        released_by: 'คุณสมศรี (จัดซื้อและสต๊อกสินค้า)',
        note: 'ปล่อยสาย LAN + ค่าแรงเข้าหน้างานงวดแรก พร้อมอุปกรณ์หลักที่มีในคลัง',
        items: [
          { project_item_id: 'pitem-1', model_name: 'Huawei eKitEngine S220-24P4X Switch', item_type: 'equipment', qty: 1, item_ids: ['itm-prj-01'] },
          { project_item_id: 'pitem-2', model_name: 'Hikvision 8CH NVR + 4MP CCTV Kit', item_type: 'equipment', qty: 1, item_ids: ['itm-prj-02'] },
          { project_item_id: 'pitem-4', model_name: 'สายสัญญาณ LAN Link Cat6 UTP 305m (กล่อง)', item_type: 'consumable', qty: 4 },
          { project_item_id: 'pitem-5', model_name: 'ค่าบริการเดินสาย LAN ท่อร้อยสาย และจัดตู้ Rack Server (ต่อจุด)', item_type: 'consumable', qty: 24 }
        ]
      }
    ],
    material_requests: [
      {
        id: 'mreq-001',
        item_name: 'สายสัญญาณ LAN Link Cat6 UTP 305m (กล่อง)',
        product_id: 'prod-11',
        qty: 2,
        reason: 'หน้างานโซนโกดัง C2 ระยะเดินสายไกลกว่าแบบแปลนเดิม 45 เมตร ต้องใช้สายเพิ่ม 2 กล่อง',
        requested_by: 'ช่างซี',
        requested_at: new Date(Date.now() - 3600000 * 4).toISOString(),
        status: 'pending'
      }
    ],
    daily_logs: [
      {
        id: 'dlog-1',
        date: new Date(Date.now() - 86400000 * 2).toISOString().split('T')[0],
        tech_name: 'ช่างซี',
        progress_percent: 30,
        note: 'เข้าหน้างานวันแรก เดินท่อร้อยสาย EMT โซนออฟฟิศชั้น 1-2 และดึงสาย LAN Cat6 ครบ 16 จุด',
        photo_urls: []
      },
      {
        id: 'dlog-2',
        date: new Date(Date.now() - 86400000).toISOString().split('T')[0],
        tech_name: 'ช่างซี',
        progress_percent: 60,
        note: 'ติดตั้ง Switch PoE ตัวที่ 1 (S/N: HW-S220-PRJ01) และยึดกล้อง CCTV รอบโกดัง C1 เสร็จ 8 จุด',
        photo_urls: []
      }
    ],
    site_visits: [
      {
        id: 'VST-2026-001',
        visit_date: new Date(Date.now() + 86400000).toISOString().split('T')[0],
        time_slot: '09:00 - 17:00',
        assigned_techs: ['ช่างซี', 'ช่างดี'],
        visit_scope: 'ติดตั้ง Switch PoE ตัวที่ 2 + เดินจุดกล้อง CCTV โกดัง C2 ส่วนที่เหลือ',
        items_to_take: [
          {
            product_id: 'prod-1',
            project_item_id: 'pitem-1',
            name: 'Huawei eKitEngine S220-24P4X Switch',
            item_type: 'equipment',
            qty: 1
          },
          {
            product_id: 'prod-3',
            project_item_id: 'pitem-2',
            name: 'Hikvision 8CH NVR + 4MP CCTV Kit',
            item_type: 'equipment',
            qty: 1
          }
        ],
        prep_status: 'pending_stock',
        visit_status: 'scheduled',
        created_by: 'คุณนก (แอดมินหน้าร้าน & จ่ายงาน)',
        created_at: new Date(Date.now() - 3600000 * 2).toISOString()
      }
    ],
    created_at: new Date(Date.now() - 86400000 * 3).toISOString(),
    updated_at: new Date(Date.now() - 3600000 * 4).toISOString(),
    activity_logs: [
      {
        timestamp: new Date(Date.now() - 86400000 * 3).toISOString(),
        action: 'เปิดโปรเจกต์รับเหมา / ติดตั้งใหม่',
        actor: 'เซลล์เอ',
        role: 'sales',
        note: 'PRJ-2026-001 | โครงการติดตั้งระบบ Network & CCTV อาคารคลังสินค้าใหม่ C1-C2'
      },
      {
        timestamp: new Date(Date.now() - 86400000 * 1.5).toISOString(),
        action: 'ปล่อยของออกเป็นงวดเบิก (Batch #1)',
        actor: 'คุณสมศรี (จัดซื้อและสต๊อกสินค้า)',
        role: 'accounting',
        note: 'ปล่อยอุปกรณ์หลัก 2 รายการเข้าช่าง Prep และวัสดุสิ้นเปลือง/ค่าแรง 2 รายการส่งตรงทีมช่าง Onsite'
      },
      {
        timestamp: new Date(Date.now() - 86400000).toISOString(),
        action: 'แอดรายการเพิ่มเข้าโปรเจกต์ (Add-on)',
        actor: 'เซลล์บี',
        role: 'sales',
        note: 'แอดเพิ่มโดย เซลล์บี: Ubiquiti UniFi U6-Pro Wi-Fi 6 Access Point x3 เครื่อง (฿18,600)'
      },
      {
        timestamp: new Date(Date.now() - 3600000 * 4).toISOString(),
        action: 'ช่างหน้างานขอเบิกของเพิ่ม (Field Material Request)',
        actor: 'ช่างซี',
        role: 'onsite',
        note: 'ขอเบิก: สายสัญญาณ LAN Link Cat6 UTP 305m (กล่อง) x2 — หน้างานโซนโกดัง C2 ระยะเดินสายไกลกว่าแบบแปลนเดิม'
      }
    ]
  }
];

// ==============================================================================
// Contracts (สัญญาเช่า & สัญญาดูแลระบบ MA - Demo Seed Data)
// ==============================================================================
export const INITIAL_CONTRACTS: Contract[] = [
  {
    id: 'ctr-rent-net-01',
    contract_no: 'RENT-NET-2026-001',
    customer_id: 'cust-surat-resort',
    customer_name: 'โรงแรมสุราษฎร์ แกรนด์ รีสอร์ท',
    customer_phone: '077-288-900',
    district: 'เมืองสุราษฎร์ธานี',
    delivery_location: '88/9 ถ.ตลาดใหม่ ต.ตลาด อ.เมือง จ.สุราษฎร์ธานี',
    contract_type: 'rental',
    sub_type: 'internet_rental',
    billing_cycle: 'monthly',
    start_date: '2026-01-01',
    end_date: '2026-12-31',
    status: 'active',
    notes: 'สัญญาเช่าอินเทอร์เน็ต Fiber + บริหารจัดการ Wi-Fi ทั้งโรงแรม 12 เดือน',
    created_at: '2026-01-01T09:00:00.000Z',
    items: [
      {
        id: 'ci-net-1',
        contract_id: 'ctr-rent-net-01',
        model_name: 'ค่าเช่าวงจรอินเทอร์เน็ต Fiber Leased Line 500/500 Mbps (รายเดือน)',
        item_type: 'service',
        unit: 'รายการ',
        quantity: 1,
        unit_price: 8500,
        unit_cost: 4200,
        description: 'วงจรหลัก SLA 99.5% พร้อม IP จริง'
      },
      {
        id: 'ci-net-2',
        contract_id: 'ctr-rent-net-01',
        model_name: 'ค่าเช่าชุดจัดการ Wi-Fi Gateway + Access Point 8 จุด',
        item_type: 'service',
        unit: 'ชุด',
        quantity: 1,
        unit_price: 4500,
        unit_cost: 1200,
        description: 'รวมดูแลเปลี่ยนอุปกรณ์สำรองภายใน 4 ชม.'
      }
    ]
  },
  {
    id: 'ctr-rent-sys-01',
    contract_no: 'RENT-SYS-2026-002',
    customer_id: 'cust-samui-mart',
    customer_name: 'บจก. สมุย ซูเปอร์มาร์ท กรุ๊ป',
    customer_phone: '077-425-777',
    district: 'ดอนสัก',
    delivery_location: '45/2 ท่าเรือเฟอร์รี่ อ.ดอนสัก จ.สุราษฎร์ธานี',
    contract_type: 'rental',
    sub_type: 'system_rental',
    billing_cycle: 'monthly',
    start_date: '2026-03-01',
    end_date: '2027-02-28',
    status: 'active',
    notes: 'สัญญาเช่าระบบ POS Cloud + ระบบสต๊อกสาขา 3 จุดขาย',
    created_at: '2026-03-01T09:00:00.000Z',
    items: [
      {
        id: 'ci-sys-1',
        contract_id: 'ctr-rent-sys-01',
        model_name: 'ค่าเช่าระบบ POS Cloud & Backoffice Inventory (3 สาขา)',
        item_type: 'service',
        unit: 'ชุด',
        quantity: 3,
        unit_price: 2500,
        unit_cost: 700,
        description: 'รวม Cloud Server & อัปเดตซอฟต์แวร์'
      }
    ]
  },
  {
    id: 'ctr-rent-eq-01',
    contract_no: 'RENT-EQ-2026-003',
    customer_id: 'cust-phunphin-logistics',
    customer_name: 'หจก. พุนพิน โลจิสติกส์ แอนด์ พอร์ต',
    customer_phone: '077-310-222',
    district: 'พุนพิน',
    delivery_location: '99 ถ.เอเชีย 41 ต.หนองไทร อ.พุนพิน จ.สุราษฎร์ธานี',
    contract_type: 'rental',
    sub_type: 'equipment_rental',
    billing_cycle: 'monthly',
    start_date: '2026-02-01',
    end_date: '2027-01-31',
    status: 'active',
    notes: 'สัญญาเช่าเครื่องพิมพ์เลเซอร์สี & เครื่องสแกนบาร์โค้ดคลังสินค้า',
    created_at: '2026-02-01T09:00:00.000Z',
    items: [
      {
        id: 'ci-eq-1',
        contract_id: 'ctr-rent-eq-01',
        product_id: 'prod-4',
        model_name: 'ค่าเช่าเครื่องพิมพ์ Brother HL-L3240CDW Color Laser (รวมหมึก)',
        item_type: 'hardware',
        unit: 'เครื่อง',
        quantity: 2,
        unit_price: 2200,
        unit_cost: 800,
        description: 'รวมโทนเนอร์และอะไหล่สึกหรอ'
      },
      {
        id: 'ci-eq-2',
        contract_id: 'ctr-rent-eq-01',
        model_name: 'ค่าเช่าเครื่อง Workstation คุมคลังสินค้า',
        item_type: 'hardware',
        unit: 'เครื่อง',
        quantity: 2,
        unit_price: 1800,
        unit_cost: 650
      }
    ]
  },
  {
    id: 'ctr-ma-01',
    contract_no: 'MA-2026-001',
    customer_id: 'cust-tapi-hospital',
    customer_name: 'คลินิกเวชกรรมตาปี เมดิคอล',
    customer_phone: '077-311-550',
    district: 'พุนพิน',
    delivery_location: '112 ม.3 ต.ท่าข้าม อ.พุนพิน จ.สุราษฎร์ธานี',
    contract_type: 'ma',
    sub_type: 'ma_monthly',
    billing_cycle: 'monthly',
    start_date: '2026-01-01',
    end_date: '2026-12-31',
    status: 'active',
    notes: 'สัญญาดูแลระบบรายเดือน (MA Monthly) เข้าตรวจ PM เดือนละ 1 ครั้ง + Remote Support',
    created_at: '2026-01-01T09:00:00.000Z',
    items: [
      {
        id: 'ci-ma-1',
        contract_id: 'ctr-ma-01',
        model_name: 'ค่าบริการดูแลระบบ Server & Network (MA รายเดือน)',
        item_type: 'service',
        unit: 'รายการ',
        quantity: 1,
        unit_price: 9500,
        unit_cost: 2500
      },
      {
        id: 'ci-ma-2',
        contract_id: 'ctr-ma-01',
        model_name: 'ค่าบริการตรวจเช็กเครื่องลูกข่าย & Backup รายเดือน (12 เครื่อง)',
        item_type: 'service',
        unit: 'เครื่อง',
        quantity: 12,
        unit_price: 350,
        unit_cost: 100
      }
    ]
  },
  {
    id: 'ctr-ma-02',
    contract_no: 'MA-2026-002',
    customer_id: 'cust-nasarn-coop',
    customer_name: 'สหกรณ์การเกษตรบ้านนาสาร จำกัด',
    customer_phone: '077-341-099',
    district: 'บ้านนาสาร',
    delivery_location: '18 ถ.นาสาร-คลองปราบ อ.บ้านนาสาร จ.สุราษฎร์ธานี',
    contract_type: 'ma',
    sub_type: 'ma_quarterly',
    billing_cycle: 'quarterly',
    start_date: '2026-01-01',
    end_date: '2026-12-31',
    status: 'active',
    notes: 'สัญญาดูแลระบบกล้องวงจรปิดและระบบเครือข่ายรายไตรมาส (MA Quarterly)',
    created_at: '2026-01-01T09:00:00.000Z',
    items: [
      {
        id: 'ci-ma-q1',
        contract_id: 'ctr-ma-02',
        model_name: 'ค่าบริการบำรุงรักษาระบบ CCTV & Network (MA รายไตรมาส)',
        item_type: 'service',
        unit: 'ชุด',
        quantity: 1,
        unit_price: 15000,
        unit_cost: 4200
      }
    ]
  },
  {
    id: 'ctr-ma-03',
    contract_no: 'MA-2026-003',
    customer_id: 'cust-kanchanadit-school',
    customer_name: 'โรงเรียนกาญจนดิษฐ์วิทยาคม',
    customer_phone: '077-379-112',
    district: 'กาญจนดิษฐ์',
    delivery_location: '220 ม.1 ต.กะแดะ อ.กาญจนดิษฐ์ จ.สุราษฎร์ธานี',
    contract_type: 'ma',
    sub_type: 'ma_yearly',
    billing_cycle: 'yearly',
    start_date: '2026-01-01',
    end_date: '2026-12-31',
    status: 'active',
    notes: 'สัญญาดูแลระบบห้องปฏิบัติการคอมพิวเตอร์และ Wi-Fi โรงเรียนรายปี (MA Yearly)',
    created_at: '2026-01-01T09:00:00.000Z',
    items: [
      {
        id: 'ci-ma-y1',
        contract_id: 'ctr-ma-03',
        model_name: 'ค่าบริการดูแลระบบห้องคอมพิวเตอร์ & Wi-Fi โรงเรียน (MA รายปี)',
        item_type: 'service',
        unit: 'รายการ',
        quantity: 1,
        unit_price: 48000,
        unit_cost: 14000
      }
    ]
  }
];
