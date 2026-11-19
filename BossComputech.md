---
name: bosscomputech-workflow-system
description: Generate a production-ready web application (HTML/Tailwind/JS + Supabase integration with Demo fallback) and PostgreSQL schema for BossComputech's complete workflow covering Sales, Accounting/Stock, Prep Technician, Front-Desk Dispatcher (หน้าร้าน), Onsite Technician, and In-House Repair Technician.
---

# BossComputech End-to-End Operations & S/N Tracking System

## Context & Business Rules
Build an internal operational web system for **BossComputech** to eliminate duplicate report writing, manual job dispatching via chat, and fragmented tracking across **6 operational roles**:

1. **ฝ่ายขาย (Sales):** Creates sales orders/quotations (`ชื่อลูกค้า`, `สถานที่จัดส่ง`, `รุ่นสินค้า`, `จำนวน`) when closing a deal.
2. **บัญชี & คนดูแล Stock (Accounting & Inventory):** Reviews sales orders, cuts stock in the accounting software, attaches the accounting `เลขที่บิล/ใบเบิก` (`bill_no`), and approves stock release to the Prep team.
3. **ช่างเตรียมสินค้า (Prep Technician):** Sees approved stock releases, pulls hardware, applies the **BossComputech** logo, packs the unit, and scans/binds the factory `Serial Number (S/N)`. **Crucial Rule:** Warranty void stickers are NOT applied here. Auto-logs prep completion (eliminating manual end-of-day prep reports).
4. **คนนั่งหน้าร้าน (Front-Desk Admin / Dispatcher):** The central operational hub:
   - Assigns/dispatches delivery and pickup jobs to specific **Onsite Technicians**.
   - Logs walk-in customer repair intakes (`รับเครื่องซ่อมหน้าร้าน`).
   - Views & exports **Automated Daily Prep & Repair Completion Reports** (solving manual report-writing bottlenecks).
5. **ช่าง Onsite (Field Technician):** Views only jobs assigned to them by Front-Desk, delivers packed goods, applies the warranty void sticker on the actual delivery date (`void_date`), or picks up faulty units from customer sites.
6. **ช่างซ่อมในร้าน (In-House Repair Technician):** Repairs faulty units (from walk-in or Onsite pickup), checks warranty automatically via `void_date`, logs spare parts used & repair summary, and marks `ซ่อมเสร็จ` so Front-Desk can notify the customer or dispatch Onsite return.

## Deliverables Required
Generate two files in the project workspace:
1. **`schema.sql`**: Ready-to-run PostgreSQL SQL script for Supabase (tables, foreign keys, unique S/N constraint, and Realtime publication enabled).
2. **`index.html`**: A self-contained, single-file responsive web application using Tailwind CSS (CDN), Lucide Icons (CDN), and `@supabase/supabase-js` (CDN).

## Database Architecture (`schema.sql`)
Design the Supabase PostgreSQL schema with these relational tables:
- **`orders`**: `id` (uuid, PK), `sales_ref` (text), `customer_name` (text, not null), `delivery_location` (text), `bill_no` (text, unique, nullable until Accounting cuts stock), `order_status` (text: `'pending_accounting'`, `'approved_for_prep'`, `'fulfilled'`), `created_at` (timestamptz, default now()).
- **`items`**: `id` (uuid, PK), `order_id` (uuid, FK -> `orders.id` ON DELETE CASCADE), `model_name` (text, not null), `serial_number` (text, unique, nullable until prepped), `status` (text, default `'pending_prep'` — valid states: `'pending_prep'`, `'ready_for_dispatch'`, `'assigned_onsite'`, `'delivered'`, `'in_repair'`, `'repaired_ready_return'`), `assigned_onsite_tech` (text, nullable), `prepped_at` (timestamptz), `void_date` (date), `updated_at` (timestamptz).
- **`repair_tickets`**: `id` (uuid, PK), `item_id` (uuid, FK -> `items.id` ON DELETE SET NULL), `walkin_sn` (text), `customer_name` (text, not null), `intake_channel` (text: `'front_desk_walkin'`, `'onsite_pickup'`), `fault_symptom` (text, not null), `repair_detail` (text), `parts_used` (text), `assigned_onsite_tech` (text), `status` (text: `'open'`, `'in_progress'`, `'repaired'`, `'returned_closed'`), `received_at` (timestamptz, default now()), `finished_at` (timestamptz).
- Include SQL commands to disable RLS (for initial internal deployment) and enable Supabase Realtime on `orders`, `items`, and `repair_tickets`.

## Frontend & Dual-Mode Architecture (`index.html`)
- **Branding:** Header branded as **"BossComputech — ระบบบริหารงานหน้าร้าน คลังสินค้า และทีมช่าง"** with a live connection badge (`🟢 Supabase Live` vs `🟡 Demo Mode (Local)`) + Settings modal to input `SUPABASE_URL` and `SUPABASE_ANON_KEY`.
- **Dual-Mode Engine:** Works out-of-the-box in **Demo Mode** (`localStorage` pre-loaded with realistic BossComputech Thai data covering Sales, Accounting, Prep, Front-Desk, Onsite, and Repair + **"รีเซ็ตข้อมูลตัวอย่าง"** button) and switches seamlessly to **Supabase Realtime** when credentials are saved.
- **Language:** 100% natural **Thai (ภาษาไทย)** across all UI labels, statuses, buttons, and reports.

## Required UI Views (Role Switcher Navigation)
1. **ภาพรวม & ค้นหา S/N (Dashboard & Traceability):**
   - KPI summary cards across all stages + S/N & Bill Search Bar showing the full lifecycle timeline (Sale $\rightarrow$ Stock Cut $\rightarrow$ Prep S/N $\rightarrow$ Onsite Delivery & Void Date $\rightarrow$ Repair History).
2. **1. ฝ่ายขาย (Sales):**
   - Form to submit new customer orders (`ชื่อลูกค้า`, `สถานที่ส่ง`, `รุ่นสินค้า`, `จำนวน`).
3. **2. บัญชี & สต๊อก (Accounting / Stock Cut):**
   - Queue of `pending_accounting` orders. Input `เลขที่บิล/ใบเบิก` (`bill_no`) + button **"ตัดสต๊อก & ส่งให้ช่างเตรียม"** (auto-generates `N` item rows in `pending_prep`).
4. **3. ช่างเตรียมสินค้า (Prep Tech):**
   - Queue of `pending_prep` items. Input `Serial Number (S/N)` + button **"ติดโลโก้ BossComputech & แพ็คเสร็จ"** (validates S/N, sets `ready_for_dispatch`, stamps `prepped_at`, badge: *"ยังไม่ติดวอยรับประกัน"*).
5. **4. หน้าร้าน / จัด Job & รายงาน (Front-Desk Dispatcher & Reports):**
   - **Tab A — จัดคิวงานให้ช่าง Onsite:** Assign `ready_for_dispatch` deliveries or `repaired_ready_return` units to a specific Onsite technician (e.g., ช่างเอ, ช่างบี).
   - **Tab B — รับแจ้งซ่อมหน้าร้าน / เปิด Job รับเครื่อง:** Create walk-in repair tickets or dispatch Onsite to pick up faulty units.
   - **Tab C — รายงานอัตโนมัติ (Auto Reports):** Filterable daily report table of **Prepped Items** and **Completed Repairs** with a **"Export CSV / พิมพ์รายงาน"** button (eliminates manual report writing).
6. **5. ช่าง Onsite (Field Service):**
   - Filtered job list assigned by Front-Desk. Button **"ติดวอย & ส่งมอบแล้ว"** (records today's `void_date` and sets status to `delivered`).
7. **6. ช่างซ่อมในร้าน (In-House Repair):**
   - Queue of `in_repair` tickets showing `วันที่ติดวอย` & auto-calculated warranty status (`อยู่ในประกัน` / `หมดประกัน`). Input `รายละเอียดการซ่อม` & `อะไหล่ที่ใช้` + button **"ซ่อมเสร็จ (แจ้งหน้าร้าน)"**.