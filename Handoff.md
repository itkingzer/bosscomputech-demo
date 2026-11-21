# HANDOFF: BossComputech Operations System (v2.2.0)

> เอกสารส่งมอบงานสำหรับ AI/นักพัฒนาคนถัดไป — อัปเดตล่าสุด: 2026-11-22
> สถานะ: **TypeScript & Vite build ผ่าน 0 errors** (`npx tsc -b` และ `npm run build` exit 0)
> เอกสารนี้เขียนให้อ่านแล้วทำงานต่อได้ทันทีโดยไม่ต้องไล่อ่านโค้ดทั้งหมด — ทุกหัวข้ออ้างอิงไฟล์:บรรทัดจริง

---

## 0. อ่านก่อนเริ่ม (TL;DR สำหรับ AI คนถัดไป)

1. **Stack:** React 19 + TypeScript + Vite 6 + Tailwind CSS v4 + `lucide-react` + `@supabase/supabase-js` + `html5-qrcode`
2. **State ทั้งหมดอยู่ในไฟล์เดียว:** [`src/context/AppContext.tsx`](src/context/AppContext.tsx:1) (~2,203 บรรทัด) — ทุก business action เป็น async function ที่แยก branch `isSupabaseLive` (Live) กับ `setState` (Demo/localStorage)
3. **ห้ามเขียน state ตรงจาก component** — เรียก action จาก `useApp()` เท่านั้น เพื่อให้ activity log + Supabase sync ทำงานครบ
4. **ทุก action ต้อง append `activity_logs`** ผ่าน helper `makeLog()` / `appendLog()` ([`AppContext.tsx`](src/context/AppContext.tsx:10)) — นี่คือหัวใจของ audit trail ที่ [`CompletedLogsView`](src/components/CompletedLogsView.tsx:107) และ [`ActivityTimeline`](src/components/ActivityTimeline.tsx:58) ใช้แสดงผล
5. **Build check:** `npx tsc -b` (type-only) หรือ `npm run build` (`tsc -b && vite build`) — ต้องได้ exit 0 ก่อนส่งงาน
6. **Demo login:** ทุกบัญชีรหัส `password123` — username: `admin`, `sales`, `accounting`, `prep`, `frontdesk`, `onsite`, `repair` (ดู [`initialData.ts`](src/data/initialData.ts:40))

---

## 1. ภาพรวมระบบ & สถาปัตยกรรม

- **โปรเจกต์:** เว็บแอปภายในของ **บริษัท บอส คอมพิวเทค จำกัด (BossComputech)** จ.สุราษฎร์ธานี
- **Design System:** Liquid Glass — Dark default `#08090C` / Light `#F4F6FA`, accent `#FF6B00`
  - ธีมสลับ real-time ผ่าน `toggleTheme()` ([`AppContext.tsx`](src/context/AppContext.tsx:291)) — เพิ่ม/ลบ class `light`/`dark` บน `<html>` + เก็บใน `localStorage` key `boss_theme`
  - CSS variables: `--bg-page`, `--text-primary` + utility `.liquid-glass`, `.liquid-glass-card`, `.liquid-glass-sidebar`, `.liquid-glass-active`, `.liquid-blob-1/2` (นิยามใน [`src/index.css`](src/index.css:1))
- **Dual-Mode Engine** — ทุก action ใน [`AppContext.tsx`](src/context/AppContext.tsx:1) แยก 2 branch:
  - **Demo Mode:** เก็บใน `localStorage` — keys: `boss_orders`, `boss_items`, `boss_repair_tickets`, `boss_users`, `boss_products`, `boss_stock_pos`, `boss_current_user`, `boss_theme`, `boss_sb_url`, `boss_sb_key`
  - **Live Mode:** Supabase PostgreSQL ตาม [`schema.sql`](schema.sql:1) — 5 ตาราง (`orders`, `items`, `repair_tickets`, `products`, `stock_pos`) + realtime subscription ([`AppContext.tsx`](src/context/AppContext.tsx:368))
  - สลับโหมดผ่าน [`SettingsModal.tsx`](src/components/SettingsModal.tsx:1) — badge LIVE (emerald) / DEMO (amber) บน Sidebar + Header มือถือ
  - `isSyncing` state ใช้แสดง skeleton ระหว่างดึงข้อมูล remote ([`AppContext.tsx`](src/context/AppContext.tsx:281))
- **Auth (ปัจจุบัน):** [`LoginPage.tsx`](src/components/LoginPage.tsx:8) — split-screen banner + เลือก username จากรายการ หรือพิมพ์เอง; `login(username)` เทียบกับ `users` ([`AppContext.tsx`](src/context/AppContext.tsx:391)) **ยังไม่ผูก Supabase Auth** (ช่อง password มีใน UI แต่ยังไม่ถูกตรวจ)
- **Mobile-First Responsive UI:** Slide-out Drawer Sidebar + Portal Modals (รายละเอียดข้อ 5)

---

## 2. บทบาท & Workflow (6 Operational Roles + Profit Dashboard + Admin)

> `UserRole` ประกาศใน [`types/index.ts`](src/types/index.ts:94) — `admin | sales | accounting | prep | frontdesk | onsite | repair`
> **หมายเหตุ:** [`App.tsx`](src/App.tsx:117) มี branch รองรับ `'manager'` (cast `as string`) สำหรับดู Profit Dashboard ภาพรวม แต่ `UserRole` ยังไม่มี `'manager'` — ถ้าจะใช้จริงต้องเพิ่มใน type + `initialData` + `LoginPage.roleMeta`

### 2.0 การมองเห็นเมนู — Strict Filter ([`App.tsx`](src/App.tsx:109))
- **Admin:** เห็นทุกแท็บ (10 แท็บ)
- **พนักงานทั่วไป:** เห็นเฉพาะ `dashboard` + `completed-logs` (เปิดให้ทุกคน) + แท็บของ role ตัวเอง
- **Sales:** เห็นเพิ่มแท็บ `profit` (ของตัวเอง)
- **Badge counts** ([`App.tsx`](src/App.tsx:85)): `pendingAccounting` (orders 3 สถานะจัดซื้อ), `pendingPrep`, `readyDispatch`, `assignedOnsite`, `inRepair`

### 2.1 ฝ่ายขาย — Sales ([`SalesView.tsx`](src/components/SalesView.tsx:88)) · ใบขาว ORDER FORM 2026
- **Auto-tag พนักงานขาย:** `salesperson` = ผู้ล็อกอินอัตโนมัติ (badge "ผู้เปิดบิล" read-only)
- **Multi-select Product Catalog Modal:** ค้นหา real-time + filter 5 หมวด (`pc_notebook`, `printer`, `cctv_network`, `service`, `general`), เพิ่ม/แก้/ลบสินค้าใน Master Catalog (`addProduct`/`updateProduct`/`deleteProduct`), ติ๊กหลายรายการ + แก้ Qty
- **Live stock visibility:** แสดง "ในสต๊อก: N" (นับ `raw_stock` + `in_stock` ที่ชื่อรุ่นตรงกัน) + จำนวนรอ PO
- **แก้ราคาต่อออเดอร์:** `unit_cost` (ทุน — INTERNAL ONLY) + `unit_price` (ขาย) แก้ในตารางใบขาว + **GP real-time** ต่อรายการ/ภาพรวม (เตือน GP < 10%)
- **Warranty per line item:** `warranty_years` / `warranty_months` (preset 0/1/2/3/5 ปี — [`WARRANTY_PRESET_YEARS`](src/types/index.ts:37)) → ผูกเข้า `Item` ตอนตัดสต๊อก
- **4 Delivery Modes:** `install` · `drop_off` · `customer_pickup` · `project`
- **บิล:** `bill_type` (ใบกำกับภาษี / ใบเสนอราคา-บิลเงินสด), `payment_term` (cash / credit_30 / project), `district` → `route_code` อัตโนมัติ, `extra_cost`
- สถานะเริ่มต้น: `pending_purchasing`; log แรก = "เปิดบิลขาย"

### 2.2 จัดซื้อ & สต๊อก — Purchasing & Stock ([`PurchasingStockView.tsx`](src/components/PurchasingStockView.tsx:37)) · ใบชมพู & PO
> [`AccountingView.tsx`](src/components/AccountingView.tsx:1) เป็น re-export ของ `PurchasingStockView` (ชื่อเดิม)

- **Smart Stock Auto-Detection:** เทียบสต๊อกจริงกับจำนวนสั่งต่อรายการ
  - ของครบ → ปุ่ม **"มีของในสต๊อกเดิม → ตัดสต๊อก & ส่งช่างเตรียม"** (ซ่อน PO)
  - ของไม่พอ → ปุ่ม **"สั่งซื้อ PO"** (ซ่อนตัดสต๊อก)
- **วงจร PO 3 ขั้น (แท็บ):**
  1. `pending_purchasing` → `cutStock()` หรือ `updateOrderPOStatus('waiting_po')`
  2. `waiting_po` → `receivePOIntoStock()` → `po_received_in_stock`
  3. `po_received_in_stock` → ใส่เลขบิล INV → `cutStock()` → `approved_for_prep` + สร้าง item `pending_prep`
- **Proactive Stock PO (สั่งล่วงหน้า ไม่ผูกออเดอร์):**
  - `createStockPO()` → `ordered` → `receiveStockPOToStorage()` → สร้าง item **`raw_stock`** ใน Storage Room + **นับถอยหลัง DOA 7 วัน** (`received_into_storage_at`)
  - **Stacked batch cards:** รวม `raw_stock` รุ่น+PO+supplier+วันรับเดียวกันเป็นการ์ดเดียว, แสดง S/N, วันคงเหลือ DOA, ปุ่มส่งช่างเทสเป็นชุด
  - `sendRawStockToPrep()` → `pending_prep` เข้าคิว PrepView
- **`allocateStockToOrder()`** ([`AppContext.tsx`](src/context/AppContext.tsx:919)): จัดสรรสต๊อกให้ออเดอร์ — `raw_stock` → `pending_prep`, `in_stock`/`prepped_in_stock` → `prepped_in_stock` (พร้อมผูก warranty จาก OrderItem)
- **Inventory list:** รวม `raw_stock` + `in_stock` แยกตามรุ่น, เฉพาะ qty > 0, เรียงมาก→น้อย, กรองหมวดได้

### 2.3 ช่างเตรียมสินค้า — Prep Tech ([`PrepView.tsx`](src/components/PrepView.tsx:81)) · 2 จังหวะ
- **จังหวะที่ 1 — เตรียมของ (`pending_prep`):** `acceptPrepTask()` (บันทึก `assigned_prep_tech` + `prep_accepted_at`) → สแกน S/N (มีปุ่มกล้อง [`BarcodeScannerModal`](src/components/BarcodeScannerModal.tsx:30)) → เลือก 3 ทาง:
  - `prepFinishAndDispatch()` → `ready_for_dispatch` + **ติดวอยทันที** (`warranty_void_date` = now, คำนวณ `warranty_expire_date`)
  - `prepFinishToStock()` → `prepped_in_stock` (รอติดวอย)
  - `prepFinishToReadyStock()` → `in_stock` + `order_id = null` (เก็บคลังพร้อมขาย)
- **จังหวะที่ 2 — ปล่อยของ (`prepped_in_stock`):** ระบุ Void Date → `applyVoidAndDispatch()` → `ready_for_dispatch`
- แท็บเสริม: คิวเตรียมเข้าสต๊อก (Stock PO) → `movePrepStockToReady()` → `in_stock`; รับสินค้าเข้าสต๊อกทั่วไป → `prepInboundStock()`
- **S/N uniqueness:** ทุกฟังก์ชัน prep ตรวจ S/N ซ้ำก่อนบันทึก (คืน `false` ถ้าซ้ำ)

### 2.4 หน้าร้าน / จัดคิว — Front-Desk ([`FrontdeskView.tsx`](src/components/FrontdeskView.tsx:269))
- **แท็บ:** Dispatch (จ่ายงาน) · Intake (รับเครื่องซ่อม) · Reports (รายงานประจำวัน)
- **เฉพาะงานที่ผูกออเดอร์จริง:** `isDispatchableItem()` ต้องมี `order_id` + `customer_name` + (`district` หรือ `route_code`) — ของสต๊อกทั่วไปไม่โผล่; ข้อมูลไม่ครบ → ปุ่มจ่ายงานถูกปิด + ข้อความ "รอข้อมูลลูกค้าจากฝ่ายขาย"
- **6-route auto-zoning:** กรองตามสายรถ 1–6 + จำนวนงานต่อสาย + **Batch Dispatch** ทั้งสายให้ช่างคนเดียว
- **Multi-technician:** ชิปเลือกช่างหลายคน → `assignOnsite(itemId, string[])` / `assignRepairTicketOnsite(ticketId, string[])` เก็บ `assigned_techs: string[]` (GIN index)
- **Warranty sticker on dispatch:** จ่ายงาน `prepped_in_stock` → เรียก `applyVoidAndDispatch(itemId, today)` ก่อนเปลี่ยนเป็น `assigned_onsite` (ทั้งรายชิ้นและ Batch)
- **Onsite Service / Pickup Call:** `createOnsiteServiceCall()` ([`AppContext.tsx`](src/context/AppContext.tsx:1546)) — รับแจ้งเหตุ/นัดช่าง + มอบหมายทีมทันที → งานเด้งเข้าคิว OnsiteView
- **Repair Return dispatch:** `dispatchRepairReturnOnsite()` — มอบหมายช่าง Onsite นำเครื่องซ่อมที่เสร็จแล้วไปส่งคืน (`is_repair_return = true`, `status = 'dispatched_onsite'`)
- **Self pickup:** `selfPickupRepairTicket()` — ลูกค้ารับเองหน้าร้าน → ปิดงานทันที
- **Auto Reports:** รวมงานเตรียม + งานซ่อมเสร็จของวัน พิมพ์/PDF ได้

### 2.5 ช่าง Onsite — Field Tech ([`OnsiteView.tsx`](src/components/OnsiteView.tsx:153))
- กรองงานตาม `assigned_techs` ของตนเอง หรือตามสายรถ 1–6 (default = `assigned_route`)
- เห็น 3 กลุ่ม: งานส่งมอบ (`assigned_onsite`), งานซ่อมเสร็จรอส่งคืน (`repaired` / `dispatched_onsite`), งานรอไปรับเครื่อง (`open`/`in_progress` แบบ `repair_pickup`)
- **Accept gate:** `acceptOnsiteJob()` ก่อนเปิดช่องกรอกบันทึกส่งมอบ
- **ปิดงานส่งมอบ:** `confirmOnsiteDelivery()` → `delivered`; ทุก item ในออเดอร์ delivered → `order_status = 'fulfilled'` อัตโนมัติ
- **Onsite → In-House handoff:** `completeOnsiteJobHandoff()` ([`AppContext.tsx`](src/context/AppContext.tsx:1375)) — สร้างใบรับซ่อมใหม่ `REP-2569-XXX` (`received_channel = 'onsite_pickup'`) + ปิดงาน Onsite ต้นทางทันที (item → `delivered` / ticket → `returned_closed`)
- **Repair Return completion:** `completeRepairReturnOnsite()` — ช่าง Onsite ยืนยันส่งคืนเครื่องซ่อม → `returned_closed` + `repair_status = 'completed'`
- **Onsite Repair Pickup Form:** auto-fill ลูกค้า/สายรถ, **เช็คประกันจาก S/N** (`warranty_void_date` → ในประกัน/หมดประกัน/ไม่พบประวัติ), checkbox อุปกรณ์ (`accessories` + `accessories_other`), `picked_up_by` → พิมพ์ใบรับซ่อมหน้างาน

### 2.6 ช่างซ่อมในร้าน — In-House Repair ([`RepairView.tsx`](src/components/RepairView.tsx:136))
- เปิดใบรับซ่อม `REP-2569-XXX` + **พิมพ์ใบรับซ่อมมาตรฐานบริษัท** (ช่องลงนามลูกค้า/เจ้าหน้าที่)
- **Repair Lifecycle 7 สถานะ** ([`REPAIR_LIFECYCLE_META`](src/types/index.ts:444)):
  `pending_check` → `repairing` → `waiting_parts` → `rma_sent` → `rma_returned` → `ready_pickup` → `completed`
  - ช่างจัดการได้ถึง `ready_pickup` ([`REPAIR_TECH_LIFECYCLE_ORDER`](src/types/index.ts:497)); `completed` เป็นสิทธิ์หน้าร้าน
- **Service Type:** `in_house_repair` (ซ่อมเอง) หรือ `rma_claim` (ส่งเคลมประกัน)
- **RMA Tracking:** `rma_supplier` (SIS/Synnex/Ingram/Ascenti/WPG/ศูนย์แบรนด์ — [`RMA_SUPPLIER_OPTIONS`](src/types/index.ts:435)), `rma_tracking_no`, `rma_sent_date`, `rma_returned_date`, `replacement_sn` (S/N ใหม่กรณีศูนย์เปลี่ยนตัว)
- **บันทึกงาน:** `saveRepairTicket()` ([`AppContext.tsx`](src/context/AppContext.tsx:1920)) — บันทึกทุกอย่างในครั้งเดียว + append log **1 รายการ** + sync legacy `status` ให้ CompletedLogsView
- **แก้ไข/ลบใบรับซ่อม:** `updateRepairTicket()` (log "แก้ไขข้อมูลใบรับซ่อม"), `deleteRepairTicket()`
- งาน `ready_pickup` → เด้งเข้า Reports หน้าร้าน + คิวส่งคืน Onsite

### 2.7 Sales & Profit Dashboard (GP) ([`ProfitDashboardView.tsx`](src/components/ProfitDashboardView.tsx:44))
- **Sales:** เห็นเฉพาะออเดอร์ตัวเอง — ยอดขาย, ต้นทุน, GP, GP%, **ค่าคอมประมาณการ 5% ของ GP**
- **Admin/Manager:** ภาพรวมบริษัท + leaderboard ตามพนักงานขาย + ตาราง GP ต่อออเดอร์
- **Low-margin alert:** ไฮไลต์ GP < 10% (`LOW_MARGIN_THRESHOLD = 10`) + ปุ่มกรองเฉพาะรายการเสี่ยง
- GP = `unit_price`/`unit_cost` ทุกรายการ + `extra_cost` ต่อออเดอร์

### 2.8 ประวัติงาน & Log — Completed Logs ([`CompletedLogsView.tsx`](src/components/CompletedLogsView.tsx:107))
- รวมงานที่ปิดแล้วจาก 3 แหล่ง: **Sales/Onsite ส่งมอบ** (`fulfilled`), **รับเองหน้าร้าน** (`customer_pickup`), **งานซ่อม** (`returned_closed`)
- 4 แท็บกรอง: all / sales / pickup / repair + ค้นหา + sort ใหม่↔เก่า
- แต่ละงานแสดง: เลขที่อ้างอิง, ลูกค้า, สินค้า/อาการ, S/N, ช่างผู้ปิดงาน, **turnaround** (`formatDuration`), สถานะประกัน, ข้อมูล RMA
- กางดู **ActivityTimeline** ย้อนหลังครบทุกขั้นตอน

### 2.9 จัดการผู้ใช้ & สิทธิ์ — Admin ([`AdminUserManagement.tsx`](src/components/AdminUserManagement.tsx:7))
- เพิ่มผู้ใช้ (`addUser` — ตรวจ username ซ้ำ), ลบผู้ใช้ (`deleteUser` — ป้องกันลบ `u-admin`), รีเซ็ตข้อมูล demo
- **ข้อจำกัดปัจจุบัน:** `users` เก็บใน localStorage เท่านั้น ไม่ sync Supabase (ตาราง `users` ไม่มีใน schema)

---

## 3. Route Zoning 6 สาย (Auto-Routing)

> นิยามใน [`ROUTE_DEFINITIONS`](src/types/index.ts:136) — ฟังก์ชัน [`getRouteByDistrict()`](src/types/index.ts:206)

| สาย | โซน | อำเภอ | สี |
|---|---|---|---|
| สาย 1 | เหนือ | พุนพิน, ท่าฉาง, ไชยา, ท่าชนะ | sky `#38BDF8` |
| สาย 2 | ตะวันตก | คีรีรัฐนิคม, บ้านตาขุน, พนม | purple `#A855F7` |
| สาย 3 | ใต้ | บ้านนาเดิม, บ้านนาสาร, เวียงสระ, พระแสง | pink `#EC4899` |
| สาย 4 | ตะวันออก | กาญจนดิษฐ์, ดอนสัก, ขนอม | emerald `#10B981` |
| สาย 5 | ในเมือง | เมืองสุราษฎร์ธานี | orange `#FF6B00` |
| สาย 6 | ต่างจังหวัด / เหมาพิเศษ | กรอกจังหวัดเอง (`province_custom`) | amber `#F59E0B` |

---

## 3.5 End-to-End Workflow (Finalized State Machine)

> ทุก transition เขียนผ่าน [`AppContext.tsx`](src/context/AppContext.tsx:1) — handler ในทุก View เรียกฟังก์ชันตรงกับ signature จริง

### A. Order Status (`OrderStatus` — [`types/index.ts`](src/types/index.ts:215))
```
pending_purchasing
   ├─(มีของครบ)→ cutStock() ───────────────→ approved_for_prep
   └─(ของไม่พอ)→ updateOrderPOStatus('waiting_po') → waiting_po
                     └─ receivePOIntoStock() → po_received_in_stock
                              └─ cutStock() → approved_for_prep
approved_for_prep ─(item ทุกชิ้น delivered)→ fulfilled
```

### B. Item Status (`ItemStatus` — [`types/index.ts`](src/types/index.ts:309))
```
[Proactive Stock PO]
createStockPO → receiveStockPOToStorage() → raw_stock (Storage Room + DOA 7 วัน)
   └─ sendRawStockToPrep() → pending_prep
        └─ acceptPrepTask() → movePrepStockToReady() → in_stock (order_id = null)

[Sales Order — ตัดสต๊อก]
cutStock() / allocateStockToOrder() → pending_prep (ผูก order_id)
   ├─ acceptPrepTask() → prepFinishAndDispatch() → ready_for_dispatch (+warranty_void_date)
   ├─ acceptPrepTask() → prepFinishToStock()     → prepped_in_stock (รอติดวอย)
   └─ acceptPrepTask() → prepFinishToReadyStock()→ in_stock (order_id = null)

[prepped_in_stock → ปล่อยของ]
   ├─ PrepView: applyVoidAndDispatch() → ready_for_dispatch (+warranty_void_date)
   └─ FrontDesk: handleDispatch() → applyVoidAndDispatch() (ถ้ายังไม่มี) → assigned_onsite

[ready_for_dispatch / prepped_in_stock ที่ผูกออเดอร์ครบ]
FrontDesk handleDispatch()/Batch → assignOnsite(itemId, string[]) → assigned_onsite
   └─ OnsiteView acceptOnsiteJob() → confirmOnsiteDelivery() → delivered
        └─ (ทุก item ในออเดอร์ delivered) → order_status = fulfilled
```

### C. Repair Lifecycle (`RepairLifecycleStatus` — [`types/index.ts`](src/types/index.ts:421))
```
pending_check → repairing → waiting_parts → rma_sent → rma_returned → ready_pickup → completed
   (updateRepairLifecycle / saveRepairTicket sync legacy `status` ให้หน้าร้านเห็นตรงกัน)

ready_pickup ─┬─ selfPickupRepairTicket()          → returned_closed (รับเองหน้าร้าน)
              ├─ dispatchRepairReturnOnsite()      → dispatched_onsite (มอบช่าง Onsite)
              │     └─ completeRepairReturnOnsite()→ returned_closed (ช่างส่งคืนเสร็จ)
              └─ closeRepairTicket()               → returned_closed
```

### D. จุดเชื่อมสำคัญ (Verified Handoffs)
| จาก | ไป | ฟังก์ชัน | ผลลัพธ์ |
|---|---|---|---|
| Sales | Purchasing | `createOrder()` | order `pending_purchasing` + `salesperson` |
| Purchasing | Prep | `cutStock()` / `allocateStockToOrder()` | item `pending_prep` ผูก `order_id` |
| Purchasing (Stock PO) | Prep | `sendRawStockToPrep()` | `raw_stock` → `pending_prep` |
| Prep | Stock | `prepFinishToReadyStock()` / `movePrepStockToReady()` | `in_stock`, `order_id = null` |
| Prep | Front-Desk | `prepFinishToStock()` | `prepped_in_stock` (รอวอย) |
| Prep | Front-Desk | `prepFinishAndDispatch()` | `ready_for_dispatch` + warranty |
| Front-Desk | Onsite | `assignOnsite()` + `applyVoidAndDispatch()` | `assigned_onsite` + ติดวอยถ้ายังไม่มี |
| Onsite | ปิดงาน | `confirmOnsiteDelivery()` | `delivered` → order `fulfilled` |
| Onsite | Repair | `completeOnsiteJobHandoff()` | ticket ใหม่ `REP-...` + ปิดงาน Onsite |
| Front-Desk | Onsite | `createOnsiteServiceCall()` | ticket `onsite_pickup` + มอบช่าง |
| Repair | Front-Desk | `saveRepairTicket({repair_status:'ready_pickup'})` | `repaired` → คิวส่งคืน |
| Front-Desk | Onsite | `dispatchRepairReturnOnsite()` | `dispatched_onsite` + `is_repair_return` |
| Onsite | ปิดงานซ่อม | `completeRepairReturnOnsite()` | `returned_closed` + `completed` |

---

## 4. ระบบย่อยที่เพิ่มใหม่ (สำคัญ — อย่าลืม)

### 4.1 Activity & Audit Log ([`types/index.ts`](src/types/index.ts:5), [`ActivityTimeline.tsx`](src/components/ActivityTimeline.tsx:1))
- `ActivityLog = { timestamp, action, actor, role?, note? }` — เก็บเป็น `activity_logs: ActivityLog[]` ใน Order / Item / RepairTicket / StockPO
- Helper: `makeLog()` + `appendLog()` ([`AppContext.tsx`](src/context/AppContext.tsx:10)), `formatThaiDateTime()` ([`types/index.ts`](src/types/index.ts:16)), `getLatestLog()` ([`types/index.ts`](src/types/index.ts:29))
- Component: `LatestUpdateBadge` (badge "อัปเดตล่าสุด ... โดย ...") + `ActivityTimeline` (toggle ดูไทม์ไลน์แนวตั้ง)
- **กฎ:** action ใหม่ทุกตัวต้องเรียก `makeLog()` และ append เข้า entity ที่แก้

### 4.2 Warranty Engine ([`types/index.ts`](src/types/index.ts:34))
- ฟิลด์บน `Item`: `warranty_years`, `warranty_months`, `warranty_void_date` (ISO ตอนแปะวอย), `warranty_expire_date`, `warranty_applied_at`
- ฟังก์ชัน: `formatWarrantyDuration()`, `computeWarrantyExpire()`, `getWarrantyState()` → `'waiting' | 'active' | 'expired' | 'none'`
- **หลักการ:** ประกันเริ่มนับจาก `warranty_void_date` (ตอนแปะวอยจริง) ไม่ใช่ตอนขาย
- วันที่: `formatDateDMY()`, `toDateInputValue()`, `fromDateInputValue()`, `getElapsedDays()`

### 4.3 Barcode Scanner ([`BarcodeScannerModal.tsx`](src/components/BarcodeScannerModal.tsx:30))
- ใช้ `html5-qrcode` (dependency มีใน [`package.json`](package.json:14)) — กล้องหลัง `facingMode: environment`
- รองรับ Code-128, EAN-13, Code-39, QR Code; มี viewfinder + fallback HTTPS/permission ภาษาไทย + vibration
- **ต้องรันบน HTTPS หรือ localhost** เท่านั้น (camera secure-context) — มี guard ในโค้ดแล้ว
- ใช้ใน PrepView / RepairView / OnsiteView สำหรับช่องกรอก S/N

### 4.4 Shared UI Primitives
- [`ui/Modal.tsx`](src/components/ui/Modal.tsx:44) — Modal shell ผ่าน Portal, `z-[9999]`, lock scroll, close on backdrop/Escape, sticky footer
- [`ListControls.tsx`](src/components/ListControls.tsx:1) — hook `useListControls` (sort newest/oldest/high/low + pagination 10/20/50/all) + UI controls ใช้ซ้ำในหลาย View

### 4.5 Unified S/N & Document Lookup + Detail Modals (อัปเดต 2026-11-22)
- [`src/utils/snLookup.ts`](src/utils/snLookup.ts:1) — รวม logic ค้นหาและ resolve สถานะแบบ live สำหรับ S/N (`resolveLiveSnStatus`), Order (`resolveLiveOrderStatus`), Stock PO (`resolveLiveStockPOStatus`), งานซ่อม (`resolveRepairStatus`), สร้างไทม์ไลน์รวม (`buildCombinedTimeline`, `buildStockPOTimeline`) และสรุปตัวเลขการเงิน (`computeFinancialSummary`)
- [`SnDetailModal.tsx`](src/components/SnDetailModal.tsx:36) & [`DocumentDetailModal.tsx`](src/components/DocumentDetailModal.tsx:60) — Modal แสดงรายละเอียดเชิงลึกของ S/N, ใบสั่งขาย (Order), และ Stock PO พร้อมสถานะประกัน, ช่างที่รับผิดชอบ, ข้อมูลการเงิน และไทม์ไลน์ย้อนหลัง (เรียกใช้จาก [`DashboardView.tsx`](src/components/DashboardView.tsx:1))
- **Warranty Lookup by S/N:** `lookupWarrantyBySerial()` ([`types/index.ts`](src/types/index.ts:1) + [`AppContext.tsx`](src/context/AppContext.tsx:336)) ใช้เช็คประกันจาก S/N แบบ real-time ใน [`RepairView.tsx`](src/components/RepairView.tsx:1) และฟอร์มรับเครื่อง

### 4.6 Global Repair Receipt Print Portal (A5 Landscape) & Operations Helpers (อัปเดต 2026-11-22)
- [`RepairReceiptPrintDocument.tsx`](src/components/RepairReceiptPrintDocument.tsx:47) — ฟอร์มใบรับซ่อมมาตรฐานบริษัท (289/2 ถ.ตลาดใหม่ จ.สุราษฎร์ธานี) จัดหน้า **A5 แนวนอน (Half-A4)** ให้พอดี 1 แผ่นเดียวผ่าน CSS `@page { size: A5 landscape; margin: 4mm; }` และ `#repair-print-root` ใน [`src/index.css`](src/index.css:1) + Portal ใน [`App.tsx`](src/App.tsx:1)
- เรียกพิมพ์ได้จากทุกจุดผ่าน `triggerPrintRepairReceipt(ticket)` ([`AppContext.tsx`](src/context/AppContext.tsx:321)) ใน FrontdeskView, RepairView, OnsiteView, และ CompletedLogsView
- **Operations Helpers อื่นๆ:**
  - `queueRepairTicketForDispatch()` ([`AppContext.tsx`](src/context/AppContext.tsx:1753)) — ส่งงานซ่อมเข้าคิวเตรียมจ่ายงานหน้าร้าน
  - `updateOrderDeliveryDate()` ([`AppContext.tsx`](src/context/AppContext.tsx:1781)) / `updateRepairTicketDueDate()` ([`AppContext.tsx`](src/context/AppContext.tsx:1790)) — ปรับวันนัดส่ง/วันครบกำหนดซ่อม
  - `clearDemoKeepStock()` ([`AppContext.tsx`](src/context/AppContext.tsx:2243)) — ล้างข้อมูลบิล/งานซ่อม Demo โดยคงสินค้าและสต๊อกไว้ (พร้อม modal ยืนยันใน [`App.tsx`](src/App.tsx:1))

---

## 5. Mobile-First Responsive UI

### 5.1 Navigation — Slide-out Drawer Sidebar ([`App.tsx`](src/App.tsx:155))
- **Desktop (`lg` ≥ 1024px):** Sidebar ค้างซ้าย (`lg:translate-x-0`, main `lg:pl-72`) พับ/กางด้วยปุ่ม ☰ (`isDesktopSidebarOpen`, default `true`)
- **Mobile/Tablet (< `lg`):** Top Header Bar — Hamburger ☰ (≥44×44px), ชื่อหน้า (truncate), badge Demo/Live (แตะเปิด Settings), theme toggle
- **Drawer:** `w-[82vw] max-w-[19rem]`, backdrop `bg-black/60 backdrop-blur-sm`, ปิดเมื่อเลือกเมนู/แตะนอก/กด X/`Escape`, ล็อก scroll (`html`+`body`+`main`), `duration-300 ease-out`
- Auto-collapse drawer เมื่อ viewport ขยายเป็น desktop ([`App.tsx`](src/App.tsx:46))

### 5.2 Layout & Accessibility
- **No horizontal overflow:** `html, body { max-width:100%; overflow-x:hidden }` + `overflow-wrap:break-word`; ตารางอยู่ใน `overflow-x-auto`
- **Touch-friendly:** `@media (max-width:1023px)` บังคับ `input/select/textarea { min-height:44px; font-size:16px }` (กัน iOS zoom), `button { min-height:40px }`, checkbox/radio 20×20px, ฟอร์ม `grid-cols-1`
- **Portal Modals:** `w-[95vw] max-h-[90vh] overflow-y-auto`, ปุ่มยืนยัน/ยกเลิก `flex-col-reverse` เต็มความกว้าง (`min-h-[44px]`)
- **Safe areas:** `env(safe-area-inset-bottom)` ที่ footer/modal footer; ปุ่ม icon-only มี `aria-label`; รองรับ `prefers-reduced-motion`
- **Animation:** `animate-slide-up` เมื่อสลับแท็บ (`key={activeTab}` ใน [`App.tsx`](src/App.tsx:417))

---

## 6. สถานะปัจจุบัน (Verified 2026-11-22)

- ✅ `npx tsc -b` และ `npm run build` (`tsc -b && vite build`) ผ่าน **0 errors** (exit 0)
- ✅ Unified S/N & Document Search (`snLookup.ts`, `SnDetailModal`, `DocumentDetailModal`) + Warranty Lookup by S/N
- ✅ Global Repair Receipt Print Portal (`RepairReceiptPrintDocument.tsx`, A5 Landscape 1 หน้าพอดี)
- ✅ Mock data ครบทุกสถานะ: วงจร PO 3 ขั้น, Stock PO/raw_stock + DOA, งานโครงการ, งานซ่อมทุก outcome, RMA, warranty ทุก state ([`initialData.ts`](src/data/initialData.ts:1))
- ✅ Activity log ครบทุก action, CompletedLogsView รวมงานปิดแล้ว 3 แหล่ง, Barcode scanner ใช้งานได้
- ⚠️ **ยังไม่มีในโค้ด (ตรวจแล้ว):**
  - Supabase Auth (login ยังเทียบ username อย่างเดียว, password ไม่ถูกตรวจ)
  - ตาราง `users` ใน Supabase (ผู้ใช้เก็บ localStorage เท่านั้น)
  - Supabase Storage (อัปโหลดรูป)
  - Google Maps Platform
  - Web Speech API
  - `'manager'` role ใน type (มีแค่ branch ใน App.tsx)

---

## 7. Phase 2 Roadmap (Next Steps)

1. **เชื่อม Supabase Live จริง:** รัน [`schema.sql`](schema.sql:1) บนโปรเจกต์ Supabase, ตั้ง URL/Key ใน SettingsModal, ตรวจ RLS (ปัจจุบัน `DISABLE ROW LEVEL SECURITY` สำหรับ demo) + ทดสอบ realtime
2. **Supabase Auth:** แทน login username-only ด้วย email/password หรือ magic link + ผูก `users.role` กับ JWT claims + บังคับสิทธิ์ระดับ RLS
3. **ตาราง `users` ใน Supabase:** sync ผู้ใช้จาก AdminUserManagement ขึ้น DB (ปัจจุบัน localStorage only)
4. **API ที่วางแผนไว้:**
   - **Supabase Storage** — อัปโหลดรูปติดตั้งหน้างาน & รูปเครื่องซ่อม (bucket + policy)
   - **Google Maps Platform** — ปักหมุดลูกค้า + นำทาง 6 สายรถ (Places/Directions API)
   - **Web Speech API** — แปลงเสียงไทยเป็นข้อความสำหรับหมายเหตุ Onsite Pickup Form
   - (✅ `html5-qrcode` ทำเสร็จแล้ว — [`BarcodeScannerModal.tsx`](src/components/BarcodeScannerModal.tsx:30))
5. **เพิ่ม `'manager'` role** อย่างเป็นทางการ (type + initialData + LoginPage + schema) ถ้าต้องการแยกผู้บริหารออกจาก admin

---

## 8. ไฟล์สำคัญ (Map)

| ไฟล์ | หน้าที่ |
|---|---|
| [`src/App.tsx`](src/App.tsx:1) | Shell, Sidebar/Drawer, strict role filter, badge counts, theme toggle |
| [`src/context/AppContext.tsx`](src/context/AppContext.tsx:1) | State ทั้งหมด + dual-mode persistence + business actions + activity log |
| [`src/types/index.ts`](src/types/index.ts:1) | Types, Route defs, status enums, warranty helpers & lookup, repair lifecycle |
| [`src/utils/snLookup.ts`](src/utils/snLookup.ts:1) | Unified S/N, Order, Stock PO & Repair live status resolver + timeline/financial builders |
| [`src/data/initialData.ts`](src/data/initialData.ts:1) | Mock users/orders/items/tickets/products/stockPOs |
| [`schema.sql`](schema.sql:1) | PostgreSQL DDL + migrations + index + trigger + realtime |
| [`src/components/LoginPage.tsx`](src/components/LoginPage.tsx:8) | หน้า Login split-screen + เลือก role/username |
| [`src/components/DashboardView.tsx`](src/components/DashboardView.tsx:10) | KPI ภาพรวม + Unified S/N & Document Search + Detail Modals |
| [`src/components/SnDetailModal.tsx`](src/components/SnDetailModal.tsx:36) | Modal รายละเอียด S/N + ประกัน + ไทม์ไลน์ + การเงิน |
| [`src/components/DocumentDetailModal.tsx`](src/components/DocumentDetailModal.tsx:60) | Modal รายละเอียดเอกสาร Order / Stock PO |
| [`src/components/RepairReceiptPrintDocument.tsx`](src/components/RepairReceiptPrintDocument.tsx:47) | ฟอร์มพิมพ์ใบรับซ่อมมาตรฐานบริษัท (A5 Landscape) |
| [`src/components/SalesView.tsx`](src/components/SalesView.tsx:88) | ใบขาว ORDER FORM 2026 + Product Catalog + GP |
| [`src/components/PurchasingStockView.tsx`](src/components/PurchasingStockView.tsx:37) | ใบชมพู, PO 3 ขั้น, Stock PO, Inventory |
| [`src/components/PrepView.tsx`](src/components/PrepView.tsx:81) | ช่างเตรียม 2 จังหวะ + สแกน S/N |
| [`src/components/FrontdeskView.tsx`](src/components/FrontdeskView.tsx:269) | Dispatch / Intake / Reports + Batch + Service Call |
| [`src/components/OnsiteView.tsx`](src/components/OnsiteView.tsx:153) | งานส่งมอบ / รับเครื่อง / ส่งคืน + handoff |
| [`src/components/RepairView.tsx`](src/components/RepairView.tsx:136) | ใบรับซ่อม + Repair Lifecycle + RMA |
| [`src/components/ProfitDashboardView.tsx`](src/components/ProfitDashboardView.tsx:44) | GP Dashboard + leaderboard + low-margin alert |
| [`src/components/CompletedLogsView.tsx`](src/components/CompletedLogsView.tsx:107) | ประวัติงานปิดแล้ว 3 แหล่ง + ไทม์ไลน์ |
| [`src/components/AdminUserManagement.tsx`](src/components/AdminUserManagement.tsx:7) | จัดการผู้ใช้ & สิทธิ์ |
| [`src/components/ActivityTimeline.tsx`](src/components/ActivityTimeline.tsx:1) | LatestUpdateBadge + ActivityTimeline |
| [`src/components/BarcodeScannerModal.tsx`](src/components/BarcodeScannerModal.tsx:30) | กล้องสแกนบาร์โค้ด/QR (html5-qrcode) |
| [`src/components/ListControls.tsx`](src/components/ListControls.tsx:1) | hook sort + pagination ใช้ซ้ำ |
| [`src/components/ui/Modal.tsx`](src/components/ui/Modal.tsx:44) | Modal shell ผ่าน Portal |
| [`src/components/SettingsModal.tsx`](src/components/SettingsModal.tsx:1) | ตั้งค่า Supabase URL/Key + สลับโหมด |
| [`src/index.css`](src/index.css:1) | Liquid Glass tokens, theme vars, responsive/touch rules |

---

## 9. Checklist ก่อนส่งงานให้ AI คนถัดไป

- [ ] รัน `npx tsc -b` → ต้อง exit 0
- [ ] ถ้าเพิ่ม action ใหม่: เพิ่มใน `AppContextType` interface + implement ทั้ง 2 branch (Live/Demo) + export ใน `Provider value` + เรียก `makeLog()`/`appendLog()`
- [ ] ถ้าเพิ่มฟิลด์ใหม่: เพิ่มใน [`types/index.ts`](src/types/index.ts:1) + `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` ใน [`schema.sql`](schema.sql:1) + seed ใน [`initialData.ts`](src/data/initialData.ts:1)
- [ ] ถ้าเพิ่มสถานะใหม่: อัปเดต type union + CHECK constraint ใน schema + badge/label map
- [ ] ถ้าเพิ่มแท็บ: เพิ่มใน `allNavItems` ([`App.tsx`](src/App.tsx:92)) + render ใน `<main>` ([`App.tsx`](src/App.tsx:418)) + กำหนด role visibility
- [ ] ตรวจ mobile: ปุ่ม ≥44px, ฟอร์ม `grid-cols-1`, ตารางใน `overflow-x-auto`
- [ ] อัปเดตเอกสารนี้ (version + วันที่ + สถานะ verified)
