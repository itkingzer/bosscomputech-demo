# HANDOFF: BossComputech Operations System (v2.0.0)

> เอกสารส่งมอบงาน — อัปเดตล่าสุด: 2026-11-20
> สรุปสถานะระบบ, 6 บทบาทปฏิบัติการ + Profit Dashboard, workflow ทั้งหมด และแผน Phase 2

---

## 1. ภาพรวมระบบ & สถาปัตยกรรม

- **โปรเจกต์:** เว็บแอปภายในของ **บริษัท บอส คอมพิวเทค จำกัด (BossComputech)** จ.สุราษฎร์ธานี
- **Stack:** TypeScript + **React 19** + **Vite 6** + **Tailwind CSS v4** + `lucide-react` + `@supabase/supabase-js`
- **Design System:** Liquid Glass (Dark default `#08090C` / Light `#F4F6FA`), accent `#FF6B00`, สลับธีมได้แบบ real-time (บันทึกใน `localStorage` key `boss_theme`)
- **Dual-Mode Engine** (ทุก action เขียนผ่าน [`AppContext.tsx`](src/context/AppContext.tsx:1) โดยแยก branch `isSupabaseLive`):
  - **Demo Mode:** เก็บทุกอย่างใน `localStorage` (`boss_orders`, `boss_items`, `boss_repair_tickets`, `boss_users`, `boss_products`, `boss_stock_pos`, `boss_current_user`) พร้อม mock data ครบทุกสถานะจาก [`initialData.ts`](src/data/initialData.ts:1)
  - **Live Mode:** เชื่อม Supabase PostgreSQL ผ่าน [`schema.sql`](schema.sql:1) (ตาราง `orders`, `items`, `repair_tickets`, `products`, `stock_pos` + index + trigger `updated_at` + realtime publication)
  - สลับโหมดผ่าน [`SettingsModal.tsx`](src/components/SettingsModal.tsx:1) (กรอก URL/Key) — ป้ายสถานะ LIVE (emerald) / DEMO (amber) แสดงบน Sidebar และ Header มือถือ
- **Auth (ปัจจุบัน):** login ด้วย `username` เทียบกับรายการ `users` ([`AppContext.tsx`](src/context/AppContext.tsx:222)) — ยังไม่ผูก Supabase Auth; รหัสผ่าน demo คือ `password123` ทุกบัญชี
- **Mobile-First Responsive UI:** Slide-out Drawer Sidebar + Portal Modals (รายละเอียดข้อ 4)

---

## 2. บทบาท & Workflow (6 Operational Roles + Profit Dashboard)

> Role type ประกาศใน [`types/index.ts`](src/types/index.ts:1) — `admin | sales | accounting | prep | frontdesk | onsite | repair`
> การมองเห็นเมนูเป็นแบบ **strict filter** ([`App.tsx`](src/App.tsx:94)): Admin เห็นทุกแท็บ, พนักงานทั่วไปเห็นเฉพาะ Dashboard + แท็บของตนเอง (Sales เห็นแท็บ GP ของตัวเองเพิ่ม)

### 2.1 ฝ่ายขาย — Sales ([`SalesView.tsx`](src/components/SalesView.tsx:1)) · ใบขาว ORDER FORM 2026
- **Auto-tag พนักงานขาย:** ชื่อผู้ล็อกอินถูกผูกเป็น `salesperson` อัตโนมัติทุกออเดอร์ (badge "ผู้เปิดบิล" แบบ read-only)
- **Multi-select Product Catalog Modal:** ค้นหา real-time + filter หมวดหมู่ (คอมพิวเตอร์/โน้ตบุ๊ก, เครื่องพิมพ์, กล้องวงจรปิด/เน็ตเวิร์ก, ค่าแรง/บริการติดตั้ง, ทั่วไป), เพิ่ม/ลบสินค้าใน Master Catalog Pool, ติ๊กเลือกหลายรายการพร้อมแก้ Qty
- **Live stock visibility:** แต่ละรายการแสดง "ในสต๊อก: N" (นับจาก `raw_stock` + `in_stock` ที่ชื่อรุ่นตรงกัน) และจำนวนที่กำลังสั่งเข้า (`waiting_po`)
- **แก้ไขราคาได้ต่อออเดอร์:** `unit_cost` (ราคาทุน — INTERNAL ONLY) และ `unit_price` (ราคาขาย) แก้ได้ในตารางใบขาว พร้อม **คำนวณ GP real-time** ต่อรายการ + ภาพรวม (เตือนเมื่อ GP < 10%)
- **4 Delivery Modes:** `install` (ส่งพร้อมติดตั้ง) · `drop_off` (ส่งอย่างเดียว) · `customer_pickup` (รับเองหน้าร้าน) · `project` (งานโครงการ/รับเหมา — ติด tag ม่วง/ส้มเด่นทุกหน้า)
- ข้อมูลบิล: `bill_type` (ใบกำกับภาษี / ใบเสนอราคา-บิลเงินสด), `payment_term` (เงินสด / เครดิต 30 วัน / PROJECT), `district` → ผูก `route_code` อัตโนมัติ, `extra_cost` (ต้นทุนค่าแรงต่อออเดอร์)
- สถานะเริ่มต้น: `pending_purchasing`

### 2.2 จัดซื้อ & สต๊อก — Purchasing & Stock ([`PurchasingStockView.tsx`](src/components/PurchasingStockView.tsx:1)) · ใบชมพู & PO
> [`AccountingView.tsx`](src/components/AccountingView.tsx:1) เป็น re-export ของ `PurchasingStockView` (ชื่อเดิม)

- **Smart Stock Auto-Detection:** เทียบสต๊อกจริง (`raw_stock` + `in_stock`) กับจำนวนที่สั่งต่อรายการ
  - ของครบ → แสดงเฉพาะปุ่ม **"มีของในสต๊อกเดิม → ตัดสต๊อก & ส่งช่างเตรียม"** (ซ่อนปุ่ม PO)
  - ของไม่พอ → แสดงเฉพาะปุ่ม **"สั่งซื้อ PO"** (ซ่อนปุ่มตัดสต๊อก)
- **วงจร PO 3 ขั้น (แท็บ):**
  1. `pending_purchasing` → ตัดสต๊อก หรือเปิด PO → `waiting_po`
  2. `waiting_po` → "รับของ PO เข้าสต๊อกแล้ว" → `po_received_in_stock`
  3. `po_received_in_stock` → ใส่เลขบิล INV + หมายเหตุ → "ปล่อยของ & ตัดสต๊อกส่งให้ช่างเตรียม" → `approved_for_prep` + สร้าง item `pending_prep`
- **Proactive Stock PO workflow (สั่งของล่วงหน้า ไม่ผูกออเดอร์):**
  - `Stock PO` (`ordered`) → "รับของเข้าห้องสต๊อก" → สร้าง item **`raw_stock`** ใน **Storage Room** พร้อม **นับถอยหลัง DOA 7 วัน** (`DOA_WARRANTY_DAYS = 7`)
  - **Stacked batch cards:** รวม `raw_stock` ที่รุ่น + PO + supplier + วันรับเข้าเดียวกันเป็นการ์ดเดียว แสดงจำนวนเครื่อง, S/N, วันคงเหลือ DOA, และปุ่มส่งช่างเทสเป็นชุด (เลือกจำนวน 1..N หรือ "ส่งทั้งหมด")
  - ส่ง batch → `sendRawStockToPrep()` → item เป็น `pending_prep` เข้าคิว PrepView
- **Inventory list:** รวมของคงเหลือ (`raw_stock` + `in_stock`) แยกตามรุ่น, แสดงเฉพาะ qty > 0, **เรียงจากมาก → น้อย**, กรองตามหมวดหมู่สินค้าได้

### 2.3 ช่างเตรียมสินค้า — Prep Tech ([`PrepView.tsx`](src/components/PrepView.tsx:1)) · 2 จังหวะ
- **จังหวะที่ 1 — เตรียมของเข้าสต๊อก (`pending_prep`):** กดรับงาน (บันทึก `assigned_prep_tech` + `prep_accepted_at`), ตรวจหมายเหตุ/โหมดส่งมอบ, ติดโลโก้/ลง Driver, สแกน S/N (**ยังไม่ติดวอยประกัน**) แล้วเลือก 2 ทาง:
  - **"ติดโลโก้ & แปะวอยพร้อมส่งออกเลย"** → `prepFinishAndDispatch()` → `ready_for_dispatch` (บันทึก `void_date` ทันที)
  - **"ติดโลโก้เสร็จ - เก็บเข้าสต๊อกรอส่ง (ยังไม่แปะวอย)"** → `prepFinishToStock()` → `prepped_in_stock`
- **จังหวะที่ 2 — เตรียมของออกไปส่ง (`prepped_in_stock`):** ระบุ **วันที่ติดวอยจริง (Void Date)** → `applyVoidAndDispatch()` → `ready_for_dispatch` (เริ่มนับประกันจากวันนี้)
- แท็บเสริม: **คิวเตรียมเข้าสต๊อก (Stock PO)** (`pending_prep_stock` → `in_stock` ผ่าน `movePrepStockToReady()`) และ **รับสินค้าเข้าสต๊อกทั่วไปหน้าร้าน** (`prepInboundStock()`)

### 2.4 หน้าร้าน / จัดคิว — Front-Desk ([`FrontdeskView.tsx`](src/components/FrontdeskView.tsx:1))
- **3 แท็บ:** Dispatch (จ่ายงาน) · Intake (รับเครื่องซ่อมหน้าร้าน) · Reports (รายงานประจำวันอัตโนมัติ)
- **แสดงเฉพาะงานที่ผูกออเดอร์ขายจริง:** `isDispatchableItem()` ตรวจว่ามี `order_id` + `customer_name` + (`district` หรือ `route_code`) ครบ — ของสต๊อกทั่วไป (`in_stock`/`raw_stock` ที่ไม่มีออเดอร์) จะไม่โผล่ในคิวจัดส่ง; ถ้าข้อมูลลูกค้า/พื้นที่ไม่ครบ ปุ่ม "จ่ายงาน" จะถูกปิดและขึ้นข้อความ **"รอข้อมูลลูกค้าจากฝ่ายขาย"**
- **6-route auto-zoning:** กรองงานตามสายรถ 1–6, แสดงจำนวนงานต่อสาย, มีปุ่ม **Batch Dispatch** จ่ายงานทั้งสายให้ช่างคนเดียวในคลิกเดียว
- **Multi-technician assignment (แก้ไขแล้ว):** UI เป็นชิปเลือกช่างได้หลายคนต่อรายการ (toggle) → ส่งเข้า `assignOnsite(itemId, string[])` / `assignRepairTicketOnsite(ticketId, string[])` เก็บใน `assigned_techs: string[]` (GIN index ใน schema) เหมาะกับงานโครงการ/ติดตั้งที่ต้องส่งทีม
- **Warranty sticker on dispatch (แก้ไขแล้ว):** เมื่อจ่ายงานรายการที่เป็น `prepped_in_stock` (เตรียมเสร็จแต่ยังไม่ติดวอย) ระบบจะเรียก `applyVoidAndDispatch(itemId, today)` ติด `void_date` = วันจ่ายงานอัตโนมัติก่อนเปลี่ยนสถานะเป็น `assigned_onsite` (ทั้งแบบจ่ายรายชิ้นและ Batch Dispatch ทั้งสาย)
- **Onsite Repair Pickup form:** รับแจ้งซ่อมแบบ onsite pickup (auto route จากอำเภอ, `REP-2569-XXX`)
- **Auto Reports:** รวมงานเตรียมสินค้า + งานซ่อมเสร็จของวัน พิมพ์/PDF ได้ทันที

### 2.5 ช่าง Onsite — Field Tech ([`OnsiteView.tsx`](src/components/OnsiteView.tsx:1))
- กรองงานตามชื่อช่างตนเอง (จาก `assigned_techs`) หรือตามสายรถ 1–6; default = `assigned_route` ของผู้ใช้
- เห็น 3 กลุ่มงาน: งานส่งมอบ (`assigned_onsite`), งานซ่อมเสร็จรอส่งคืน (`repaired`), งานรอไปรับเครื่อง (`open`/`in_progress` แบบ `repair_pickup`)
- **Accept gate:** การ์ดงานส่งมอบต้องกด **"กดรับงานนี้ (Accept Job)"** (`acceptOnsiteJob()` → บันทึก `assigned_prep_tech` + `prep_accepted_at`) ก่อนจึงจะเปิดช่องกรอกบันทึกส่งมอบได้
- **ปิดงานส่งมอบ (Delivery closure):** กด "ส่งมอบของใหม่สำเร็จทั้งชุด" → `confirmOnsiteDelivery()` เปลี่ยน item เป็น `delivered`; เมื่อทุก item ในออเดอร์เป็น `delivered` ครบ ระบบจะตั้ง `order_status = 'fulfilled'` อัตโนมัติ
- **Onsite Repair Pickup Form:** auto-fill ลูกค้า/สายรถ, **เช็คประกันจาก S/N** (`void_date` → อยู่ในประกัน 1 ปี / หมดประกัน / ไม่พบประวัติ), checkbox อุปกรณ์ที่ติดมาด้วย (`accessories` + `accessories_other`), บันทึก `picked_up_by` → สร้าง/อัปเดต ticket **`REP-2569-XXX`** และพิมพ์ใบรับซ่อมให้ลูกค้าหน้างาน

### 2.6 ช่างซ่อมในร้าน — In-House Repair ([`RepairView.tsx`](src/components/RepairView.tsx:1))
- เปิดใบรับซ่อมใหม่ **`REP-2569-XXX`** และ **พิมพ์ใบรับซ่อมมาตรฐานบริษัท** (มีช่องลงนามลูกค้า/เจ้าหน้าที่)
- บันทึกผลตรวจ (`repair_detail`), อะไหล่ (`parts_used`), ผลลัพธ์ (`repaired` / `unrepairable_warranty` / `expired_warranty` / `unrepairable` / `returned_closed`)
- งาน `repaired` จะเด้งเข้า **รายงานซ่อมเสร็จของหน้าร้าน** และคิวส่งคืนของช่าง Onsite อัตโนมัติ

### 2.7 Sales & Profit Dashboard (GP) ([`ProfitDashboardView.tsx`](src/components/ProfitDashboardView.tsx:1))
- **Role-based view:**
  - **Sales:** เห็นเฉพาะออเดอร์ของตนเอง — ยอดขาย, ต้นทุน, GP, GP%, **ค่าคอมมิชชั่นประมาณการ 5% ของ GP**
  - **Admin/Manager:** เห็นภาพรวมทั้งบริษัท + **leaderboard แยกตามพนักงานขาย** + ตาราง GP ต่อออเดอร์
- **Low-margin alert:** ไฮไลต์ออเดอร์ที่ **GP < 10%** (`LOW_MARGIN_THRESHOLD = 10`) พร้อมปุ่มกรองดูเฉพาะรายการเสี่ยง
- GP คำนวณจาก `unit_price`/`unit_cost` ของทุกรายการ + `extra_cost` ต่อออเดอร์

---

## 3. Route Zoning 6 สาย (Auto-Routing)

> นิยามใน [`types/index.ts`](src/types/index.ts:43) — ฟังก์ชัน [`getRouteByDistrict()`](src/types/index.ts:113)

| สาย | โซน | อำเภอ |
|---|---|---|
| สาย 1 | เหนือ | พุนพิน, ท่าฉาง, ไชยา, ท่าชนะ |
| สาย 2 | ตะวันตก | คีรีรัฐนิคม, บ้านตาขุน, พนม |
| สาย 3 | ใต้ | บ้านนาเดิม, บ้านนาสาร, เวียงสระ, พระแสง |
| สาย 4 | ตะวันออก | กาญจนดิษฐ์, ดอนสัก, ขนอม |
| สาย 5 | ในเมือง | เมืองสุราษฎร์ธานี |
| สาย 6 | ต่างจังหวัด / เหมาพิเศษ | กรอกจังหวัดเองได้ (`province_custom`) |

---

## 3.5 End-to-End Workflow (Finalized State Machine)

> ทุก transition เขียนผ่าน [`AppContext.tsx`](src/context/AppContext.tsx:1) — ตรวจแล้วว่า handler ในทุก View เรียกฟังก์ชันตรงกับ signature จริง ไม่มี broken state

### A. Order Status (`OrderStatus`)
```
pending_purchasing
   ├─(มีของครบ)→ cutStock() ───────────────→ approved_for_prep
   └─(ของไม่พอ)→ updateOrderPOStatus('waiting_po') → waiting_po
                     └─ receivePOIntoStock() → po_received_in_stock
                              └─ cutStock() → approved_for_prep
approved_for_prep ─(item ทุกชิ้น delivered)→ fulfilled
```

### B. Item Status (`ItemStatus`) — เส้นทางของแต่ละเครื่อง
```
[Proactive Stock PO]
createStockPO → receiveStockPOToStorage() → raw_stock (Storage Room + DOA 7 วัน)
   └─ sendRawStockToPrep() → pending_prep
        └─ acceptPrepTask() → movePrepStockToReady() → in_stock (พร้อมขาย, order_id = null)

[Sales Order — ตัดสต๊อก]
cutStock() → pending_prep (ผูก order_id)
   ├─ acceptPrepTask() → prepFinishAndDispatch() → ready_for_dispatch (+void_date)
   ├─ acceptPrepTask() → prepFinishToStock()     → prepped_in_stock (รอติดวอย)
   └─ acceptPrepTask() → prepFinishToReadyStock()→ in_stock (order_id = null, พร้อมขาย)

[prepped_in_stock → ปล่อยของ]
   ├─ PrepView: applyVoidAndDispatch() → ready_for_dispatch (+void_date)
   └─ FrontDesk: handleDispatch() → applyVoidAndDispatch() (ถ้ายังไม่มี void_date) → assigned_onsite

[ready_for_dispatch / prepped_in_stock ที่ผูกออเดอร์ครบ]
FrontDesk handleDispatch()/Batch → assignOnsite(itemId, string[]) → assigned_onsite
   └─ OnsiteView acceptOnsiteJob() → confirmOnsiteDelivery() → delivered
        └─ (ทุก item ในออเดอร์ delivered) → order_status = fulfilled
```

### C. จุดเชื่อมสำคัญที่ตรวจแล้ว (Verified Handoffs)
| จาก | ไป | ฟังก์ชัน | ผลลัพธ์ |
|---|---|---|---|
| Sales | Purchasing | `createOrder()` | order `pending_purchasing` + `salesperson` = ผู้ล็อกอิน |
| Purchasing | Prep | `cutStock()` | item `pending_prep` ผูก `order_id` |
| Purchasing (Stock PO) | Prep | `sendRawStockToPrep()` | `raw_stock` → `pending_prep` |
| Prep | Stock | `prepFinishToReadyStock()` | `in_stock`, `order_id = null` |
| Prep | Front-Desk | `prepFinishToStock()` | `prepped_in_stock` (รอวอย) |
| Prep | Front-Desk | `prepFinishAndDispatch()` | `ready_for_dispatch` + `void_date` |
| Front-Desk | Onsite | `assignOnsite()` + `applyVoidAndDispatch()` | `assigned_onsite` + ติดวอยถ้ายังไม่มี |
| Onsite | ปิดงาน | `confirmOnsiteDelivery()` | `delivered` → order `fulfilled` |

---

## 4. Mobile-First Responsive UI

### 4.1 Navigation — Slide-out Drawer Sidebar ([`App.tsx`](src/App.tsx:138))
- **Desktop (`lg` ≥ 1024px):** Sidebar ค้างซ้าย (`lg:translate-x-0`, main `lg:pl-72`) พับ/กางได้ด้วยปุ่ม ☰ (`isDesktopSidebarOpen`, default `true`)
- **Mobile/Tablet (< `lg`):** Top Header Bar — Hamburger ☰ (≥44×44px), ชื่อหน้าปัจจุบัน (truncate), ป้าย Demo/Live (แตะเปิด Settings)
- **Drawer:** `w-[82vw] max-w-[19rem]`, backdrop `bg-black/60 backdrop-blur-sm`, ปิดเมื่อเลือกเมนู/แตะนอก/กด X/`Escape`, ล็อก scroll (`html` + `body` + `main`), `duration-300 ease-out`

### 4.2 Layout & Accessibility
- **No horizontal overflow:** `html, body { max-width:100%; overflow-x:hidden }` + `overflow-wrap:break-word`; ตารางทุกตัวอยู่ใน `overflow-x-auto`
- **Touch-friendly:** `@media (max-width:1023px)` บังคับ `input/select/textarea { min-height:44px; font-size:16px }` (กัน iOS zoom), `button { min-height:40px }`, checkbox/radio 20×20px, ฟอร์มเป็น `grid-cols-1`
- **Portal Modals:** `w-[95vw] max-h-[90vh] overflow-y-auto`, ปุ่มยืนยัน/ยกเลิก `flex-col-reverse` เต็มความกว้าง (`min-h-[44px]`) — ครอบ Sales Catalog, Onsite Pickup/Receipt, Repair Ticket/Receipt, Settings, Admin Add-User
- **Safe areas:** `env(safe-area-inset-bottom)` ที่ footer/modal footer; ปุ่ม icon-only มี `aria-label`; รองรับ `prefers-reduced-motion`

---

## 5. สถานะปัจจุบัน (Verified)

- `npm run build` (`tsc -b && vite build`) ผ่าน 0 errors — dev server ที่ port 5173
- Mock data ครบทุกสถานะ: วงจร PO 3 ขั้น, Stock PO/raw_stock + DOA, งานโครงการ, งานซ่อมทุก outcome
- **ยังไม่มีในโค้ด (ตรวจแล้ว):** Supabase Auth, Supabase Storage, `html5-qrcode`, Google Maps, Web Speech API — อยู่ในแผน Phase 2 ข้อ 6

---

## 6. Phase 2 Roadmap (Next Steps)

1. **เชื่อม Supabase Live จริง:** รัน [`schema.sql`](schema.sql:1) บนโปรเจกต์ Supabase, ตั้งค่า URL/Key ใน SettingsModal, ตรวจ RLS (ปัจจุบัน `DISABLE ROW LEVEL SECURITY` สำหรับ demo) และทดสอบ realtime
2. **Supabase Auth:** แทน login แบบ username-only ด้วย email/password หรือ magic link + ผูก `users.role` กับ JWT claims และบังคับสิทธิ์ระดับ RLS
3. **API ที่วางแผนไว้ 4 ตัว:**
   - **Supabase Storage** — อัปโหลดรูปติดตั้งหน้างาน & รูปเครื่องซ่อม (bucket + policy)
   - **`html5-qrcode`** — สแกนบาร์โค้ด S/N และเลขใบรับซ่อมด้วยกล้องมือถือ (แทนการพิมพ์)
   - **Google Maps Platform** — ปักหมุดลูกค้า + นำทาง 6 สายรถ (Places/Directions API)
   - **Web Speech API** — แปลงเสียงไทยเป็นข้อความสำหรับหมายเหตุใน Onsite Pickup Form

---

## 7. ไฟล์สำคัญ

| ไฟล์ | หน้าที่ |
|---|---|
| [`src/App.tsx`](src/App.tsx:1) | Shell, Sidebar/Drawer, strict role filter, badge counts |
| [`src/context/AppContext.tsx`](src/context/AppContext.tsx:1) | State ทั้งหมด + dual-mode persistence + business actions |
| [`src/types/index.ts`](src/types/index.ts:1) | Types, Route definitions, status enums, catalog labels |
| [`src/data/initialData.ts`](src/data/initialData.ts:1) | Mock users/orders/items/tickets/products |
| [`schema.sql`](schema.sql:1) | PostgreSQL DDL + index + trigger + realtime |
| [`src/components/*View.tsx`](src/components) | 6 role views + Dashboard + ProfitDashboard + Admin + Settings |
