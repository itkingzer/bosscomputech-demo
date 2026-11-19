# HANDOFF: BossComputech Operations & S/N Tracking System

## 1. Current Project Goal
We are building an internal web application for **BossComputech** (Surat Thani) to manage end-to-end hardware sales, stock prep, dispatching across 6 delivery/service routes, onsite field jobs (including multi-tech server/cabling installations), and in-house repairs—eliminating duplicate report writing and chat fragmentation.

## 2. Existing Workspace Files (TypeScript Project)
- This project is a **TypeScript web application** (React / Vite / Next.js with Tailwind CSS).
- Check `package.json`, `src/` components, and `schema.sql` (if created) to inspect the current structure before editing.
- Ensure all TypeScript types/interfaces for `Order`, `Item`, and `RepairTicket` include `district`, `route_code` (`สาย 1` - `สาย 6`), `job_category`, and `assigned_techs: string[]` (multi-technician array).

## 3. Core Business Rules (DO NOT BREAK)
1. **6 Roles:**
   - **ฝ่ายขาย (Sales):** Creates orders (`customer_name`, `district`, `address_detail`, `model_name`, `qty`). Auto-assigns `route_code` (`สาย 1` to `สาย 6`).
   - **บัญชี & สต๊อก (Accounting):** Cuts stock, enters `bill_no`, and approves stock release (`pending_prep`).
   - **ช่างเตรียมสินค้า (Prep Tech):** Pulls stock, applies BossComputech logo, packs, and scans/binds unique factory `serial_number`. **CRITICAL:** Warranty void stickers are NOT applied here. Auto-logs prep history so Prep Techs do not write manual end-of-day reports.
   - **คนนั่งหน้าร้าน (Front-Desk Dispatcher):** Central hub to:
     - Dispatch jobs grouped by `route_code` (`สาย 1` - `สาย 6`).
     - Assign **multiple technicians** (`assigned_techs` array/list) to a single job (techs do NOT have fixed routes; big jobs like Server Rack / LAN Cabling require 2–3 techs together).
     - Log walk-in repairs or onsite service/installation calls.
     - View & export **Automated Daily Prep & Repair Completion Reports (CSV/Print)**.
   - **ช่าง Onsite (Field Tech):** Filters jobs by **Technician Name** OR **Route (`สาย 1` - `สาย 6`)**. Sees full team members assigned to the job. Applies warranty void sticker on actual delivery (`void_date`) or picks up faulty units.
   - **ช่างซ่อมในร้าน (In-House Repair):** Repairs faulty units, checks warranty auto-calculated from `void_date`, logs `repair_detail` & `parts_used`, and marks `repaired_ready_return`.

2. **6 Delivery/Service Routes Mapping:**
   - **สาย 1 (โซนเหนือ):** พุนพิน, ท่าฉาง, ไชยา, ท่าชนะ
   - **สาย 2 (โซนตะวันตก):** คีรีรัฐนิคม, บ้านตาขุน, พนม
   - **สาย 3 (โซนใต้):** บ้านนาเดิม, บ้านนาสาร, เวียงสระ, พระแสง
   - **สาย 4 (โซนตะวันออก):** กาญจนดิษฐ์, ดอนสัก, ขนอม
   - **สาย 5 (ในเมือง / รอบเมือง):** เมืองสุราษฎร์ธานี
   - **สาย 6 (ต่างจังหวัด / ชั่วคราว):** ต่างจังหวัด / งานเหมาพิเศษ

3. **Job Categories:**
   - `[ส่งของ/ติดวอย]` (Outbound Delivery)
   - `[ซ่อมหน้างาน/รับเครื่อง]` (Onsite Service / Pickup)
   - `[งานติดตั้ง/เดินสาย/ตู้ Server]` (Project / Installation requiring multi-tech team)

## 4. Next Action / Remaining Tasks for the Next AI Agent
Please inspect the current `index.html` and `schema.sql` in this folder and complete/verify the following:
1. Ensure Front-Desk Dispatching allows **multi-select checkboxes for technicians** (e.g., ช่างเอ, ช่างบี, ช่างซี, ช่างดี) per job rather than 1-to-1 route locking.
2. Ensure Onsite Technician view has filters for both **My Name (ชื่อช่าง)** and **Route (สาย 1 - 6)**, displaying all assigned teammates on each job card.
3. Ensure `assigned_techs` (stored as `text[]` or JSON/comma-separated text) is properly synced in both `localStorage` Demo Mode and `schema.sql` (`items` and `repair_tickets` tables).
4. Keep 100% of UI text, statuses, and mock data in natural **Thai (ภาษาไทย)**, including realistic Surat Thani mock cases (e.g., POS delivery in ท่าฉาง, Server Rack installation in กาญจนดิษฐ์ with 2 techs).