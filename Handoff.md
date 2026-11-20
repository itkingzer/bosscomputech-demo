# HANDOFF: BossComputech Operations, Multi-Tech Dispatch & S/N Tracking System

## 1. Current Project Status & Architecture
- **Project:** Internal operations web app for **BossComputech** (Surat Thani) built with **TypeScript (React 19 / Vite / Tailwind CSS v4)**.
- **Theme Design System:** Liquid Glass (Dark Mode default `#08090C` / Light Mode `#F4F6FA`) with high-contrast accessibility compliance (WCAG AAA contrast 7:1+), rich amber/orange accent tones (`#FF6B00`), and real-time interactive theme switcher.
- **Data Persistence:** Dual-mode ready:
  - Local Demo Storage (`localStorage`) with full Thai business mock data for instantaneous demonstration.
  - Supabase PostgreSQL Client (`@supabase/supabase-js`) with complete SQL DDL schema in `schema.sql`.

## 2. Core Business Rules & 6 Operational Departments

1. **ฝ่ายขาย (SalesView - ใบสั่งขาย ORDER FORM 2026 / ใบขาว & Product Selection Modal):**
   - **Product Selection & Interest Modal:** แทนที่ Dropdown เดิมด้วยปุ่ม `+ เลือกสินค้า / บริการ (จากรายการที่สนใจ & แคตตาล็อก)` เปิด Modal ขนาดใหญ่
     - มีช่อง Search ค้นหาชื่อรุ่นสินค้า/รายการบริการแบบ Real-time
     - มี Filter แยกหมวดหมู่ (คอมพิวเตอร์/โน้ตบุ๊ก, ปริ้นเตอร์, กล้องวงจรปิด/เน็ตเวิร์ก, ค่าแรง/บริการติดตั้ง)
     - มีฟอร์มเพิ่มรายการสินค้า/บริการใหม่เข้าสู่ Master Catalog Pool และปุ่มลบรายการที่ไม่ใช้ออกจาก Pool
     - ระบบ Multi-Select Checkbox ติ๊กถูกเลือกหลายรายการพร้อมกัน พร้อมช่องแก้ไข Qty และคำนวณยอดเงินรวมก่อนกดยืนยันเข้าใบขาว
     - ในตารางใบขาว เซลยังสามารถปรับราคาต่อหน่วย (Unit Price) และจำนวน (Qty) ได้อย่างยืดหยุ่น
   - สร้างออเดอร์รองรับหลายรายการใน 1 บิล พร้อมแยกประเภทได้ทั้ง **"วัสดุ/อุปกรณ์ (hardware)"** และ **"ค่าแรง/ค่าบริการติดตั้ง (service)"**
   - ระบุข้อมูลจริง: `customer_name`, `customer_phone`, `district` (ผูกสายรถ 1-6 อัตโนมัติ), `delivery_date`, `bill_type` (ใบกำกับภาษี / ใบเสนอราคา-บิลเงินสด), `payment_term` (เงินสด / เครดิต 30 วัน / PROJECT), และ `site_notes`
   - **Delivery Mode 4 แบบ:**
     1. `install` - ส่งของพร้อมติดตั้ง (Onsite Install)
     2. `drop_off` - ส่งของไม่ต้องติดตั้ง (Drop-off)
     3. `customer_pickup` - ลูกค้ารับเองหน้าร้าน (Store Pickup)
     4. `project` - **งานโครงการ / รับเหมาติดตั้ง (Project)**: ติด Tag สีม่วง/ส้มเด่นชัดเจนบนการ์ดงานทุกหน้า เพื่อให้จัดซื้อและหน้าร้านจัดทีมช่างหลายคนและวางแผนงานหลายวัน
   - สถานะเริ่มต้นของออเดอร์: `pending_purchasing` (รอจัดซื้อ/เช็กสต๊อก)

2. **จัดซื้อ & สต๊อก (PurchasingStockView - วงจร PO 3 ขั้นตอน & ใบชมพู):**
   - รวมบทบาทสั่งซื้อและดูแลสต๊อก แบ่ง 3 แท็บขั้นตอนชัดเจน:
     - **แท็บ 1: รายการใหม่จากเซล (`pending_purchasing`):** หากมีของในสต๊อกเดิม -> กด "ตัดสต๊อก & ส่งช่างเตรียม" ได้ทันที; หากไม่มีของ -> ใส่ Supplier + เลขที่ PO แล้วกด "สั่งซื้อ PO (รอของเข้า)" -> เปลี่ยนเป็น `waiting_po`
     - **แท็บ 2: รอของเข้าจาก Supplier (`waiting_po`):** รายการที่สั่งของไปแล้ว มีปุ่ม **"รับของ PO เข้าสต๊อกแล้ว"** -> บันทึกรับเข้าเปลี่ยนเป็นสถานะ `po_received_in_stock`
     - **แท็บ 3: ของเข้าสต๊อกแล้ว (`po_received_in_stock`):** ของเข้าสต๊อกครบพร้อมเบิก จัดซื้อใส่เลขที่บิล INV + หมายเหตุ แล้วกด **"ปล่อยของ & ตัดสต๊อกส่งให้ช่างเตรียมสินค้า"** -> เปลี่ยนสถานะเป็น `approved_for_prep` และส่งไอเทมเข้าโต๊ะช่างเตรียม (`pending_prep`)

3. **ช่างเตรียมสินค้า (PrepView - ระบบ 2 จังหวะทางกายภาพ):**
   - **จังหวะที่ 1 (เตรียมของเข้าสต๊อก):** ช่างกดรับงาน (บันทึกชื่อช่างและเวลาอัตโนมัติ), ตรวจสอบหมายเหตุ/โหมดส่งมอบ, ลง Driver/โลโก้, สแกน S/N (**ไม่ติดวอยประกัน**) -> กด "เตรียมเสร็จ / เก็บเข้าสต๊อกรอส่ง" -> สถานะ `prepped_in_stock`
   - **จังหวะที่ 2 (เตรียมของออกไปส่ง - แปะวอยประกัน):** เมื่อถึงกำหนดส่งของหรือหน้าร้านจ่ายงาน ช่างหยิบเครื่องและกด "แปะวอยประกัน & ยืนยันปล่อยของออก" (บันทึก `void_date` ผูกกับ S/N) -> สถานะ `ready_for_dispatch`
   - มีแท็บ "รับสินค้าเข้าสต๊อกทั่วไปหน้าร้าน" รองรับ Inbound Stock

4. **คนนั่งหน้าร้าน (FrontdeskView - Central Dispatcher):**
   - จ่ายงานตามสายรถ 6 สาย พร้อมรองรับ **Multi-Technician Assignment (Checkbox เลือกทีมช่างได้หลายคนพร้อมกัน)** สำหรับงานโปรเจกต์/เดินสาย LAN/ติดตั้ง Rack Server
   - แสดง Tag สถานะ **`⚡ งานโครงการ (Project)`** เด่นชัดเจน
   - บันทึกรับแจ้งซ่อมหน้าร้าน (สร้าง Ticket `REP-2569-XXX`) และพิมพ์รายงานประจำวันอัตโนมัติ

5. **ช่าง Onsite (OnsiteView - Mobile Field Operations):**
   - กรองงานได้ทั้งตามชื่อช่างตนเอง หรือตามสายรถ 1-6
   - มีฟอร์มมือถือ **"รับเครื่องซ่อมจากหน้างานกลับร้าน (Onsite Repair Pickup Form)"** ดึงข้อมูลลูกค้า/สายรถอัตโนมัติ, เช็คประกันผ่าน S/N อัตโนมัติ, Checkbox ติ๊กอุปกรณ์ที่ติดมาด้วย (`accessories`), บันทึกช่างผู้รับ (`picked_up_by`) และพิมพ์ใบรับซ่อมให้ลูกค้าหน้างานได้ทันที

6. **ช่างซ่อมในร้าน (RepairView):**
   - ตรวจเช็คเครื่องตามคิวใบรับซ่อม `REP-2569-XXX` พร้อมปุ่ม "พิมพ์ใบรับซ่อม" แสดงฟอร์มทางการพร้อมช่องลงนามลูกค้าและเจ้าหน้าที่
   - บันทึกผลการตรวจเช็ค อะไหล่ที่ใช้ ค่าใช้จ่าย และปิดงานซ่อม (`repaired`)

## 3. Route Zoning 6 สาย (Auto-Routing)
- **สาย 1 (โซนเหนือ):** พุนพิน, ท่าฉาง, ไชยา, ท่าชนะ
- **สาย 2 (โซนตะวันตก):** คีรีรัฐนิคม, บ้านตาขุน, พนม
- **สาย 3 (โซนใต้):** บ้านนาเดิม, บ้านนาสาร, เวียงสระ, พระแสง
- **สาย 4 (โซนตะวันออก):** กาญจนดิษฐ์, ดอนสัก, ขนอม
- **สาย 5 (ในเมือง / รอบเมือง):** เมืองสุราษฎร์ธานี
- **สาย 6 (ต่างจังหวัด / ชั่วคราว):** ต่างจังหวัด / งานเหมาพิเศษ (กรอกจังหวัดเพิ่มเติมได้)

## 4. Mobile-First Responsive Upgrade (Mobile / Tablet App-Grade UX)

### 4.1 Navigation — Slide-out Drawer Sidebar
- **Desktop (`lg` ≥ 1024px):** Sidebar 6 ฝ่ายด้านซ้ายแสดงค้างไว้เป็นค่าเริ่มต้น (`lg:translate-x-0`, `lg:pl-72`) และ **พับ/กางได้** ด้วยปุ่ม ☰ บน Header (desktop-only):
  - กดปุ่ม ☰ (desktop) หรือปุ่ม X ใน Sidebar → Sidebar เลื่อนออก (`lg:-translate-x-full`) และ main content ขยายเต็ม (`lg:pl-0`) พร้อม transition นุ่มนวล
  - กดปุ่ม ☰ อีกครั้ง → Sidebar เลื่อนกลับมา (`lg:translate-x-0`) และ main content หดกลับ (`lg:pl-72`)
  - State: `isDesktopSidebarOpen` (default `true`), ปุ่มมี `aria-label` / `aria-expanded`
- **Mobile / Tablet (< `lg`):** ซ่อน Sidebar แล้วแสดง **Top Header Bar** แทน ประกอบด้วย:
  - ปุ่ม **Hamburger ☰** ทางซ้าย (min 44×44px, `aria-label` / `aria-expanded`)
  - **ชื่อหน้าปัจจุบัน** ตรงกลาง (truncate กันล้น)
  - **ป้ายสถานะ Demo / Live** ทางขวา (แตะเพื่อเปิด Settings) — LIVE = emerald, DEMO = amber
- **Drawer behavior:**
  - กด ☰ → Sidebar เลื่อนออกจากซ้าย (`translate-x-0` ↔ `-translate-x-full`, `duration-300 ease-out`, `will-change-transform`)
  - **Backdrop Overlay** สีดำโปร่งแสง (`bg-black/60 backdrop-blur-sm`) fade in/out
  - ปิดอัตโนมัติเมื่อ: เลือกเมนูฝ่ายใดฝ่ายหนึ่ง / แตะพื้นที่ว่างด้านนอก / กดปุ่ม X / กด `Escape`
  - ล็อก body scroll ขณะเปิด (`document.body.style.overflow = 'hidden'`)
  - Drawer กว้าง `w-[82vw] max-w-[19rem]` บนมือถือ (ไม่บังจอทั้งใบ)

### 4.2 Layout — ทุกหน้า (Sales, จัดซื้อ/สต๊อก, ช่างเตรียม, หน้าร้าน, ช่าง Onsite, ช่างซ่อม)
- **No Horizontal Page Overflow:** `html, body { max-width:100%; overflow-x:hidden }` + `overflow-wrap:break-word` กัน S/N / URL ยาวล้น; ทุกตารางข้อมูลครอบด้วย `overflow-x-auto` (momentum scroll บน iOS)
- **Touch-Friendly Forms:** global CSS (`@media max-width:1023px`) บังคับ `input/select/textarea { min-height:44px; font-size:16px }` (กัน iOS auto-zoom), `button { min-height:40px }`, checkbox/radio 20×20px; Grid ฟอร์มเป็น `grid-cols-1` บนมือถือแล้วทุกหน้า
- **Modals (ทุกตัว):** เปลี่ยนเป็น `w-[95vw] max-h-[90vh] overflow-y-auto` + `p-2 sm:p-4` บนมือถือ, ปุ่มยืนยัน/ยกเลิกเป็น `flex-col-reverse` เต็มความกว้าง (`min-h-[44px]`) ไม่ตกขอบจอ:
  - Sales: Product Selection Modal
  - Onsite: Repair Pickup Form + Receipt Modal
  - Repair: New Ticket Form + Company Receipt Modal
  - Settings Modal, Admin Add-User Modal
- **Safe areas:** footer + modal footers ใช้ `env(safe-area-inset-bottom)` รองรับจอมีรอยบาก
- **Accessibility:** ปุ่ม icon-only ทุกตัวมี `aria-label`; รองรับ `prefers-reduced-motion`

## 5. Verification
- `npm run build` ผ่าน 100% (0 errors) — `tsc -b && vite build` สำเร็จ
- Vite dev server running on port 5173
- Mock data ครบทุกสถานะ รวมถึงเคสงานโครงการและวงจร PO 3 ขั้นตอน
