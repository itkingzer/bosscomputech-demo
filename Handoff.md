# HANDOFF: BossComputech Operations, Multi-Tech Dispatch & S/N Tracking System

## 1. Current Project Status & Immediate Priority
- **Project:** Internal operations web app for **BossComputech** (Surat Thani) built with **TypeScript (React / Vite / Tailwind CSS)**.
- **Repository:** Already initialized and pushed to GitHub (`main` branch), connected to **Vercel** for demo deployment.
- **BLOCKING ISSUE TO FIX FIRST:** `npm run build` failed on Vercel with TypeScript errors in `src/components/FrontdeskView.tsx`:
  - Lines `96, 105, 114, 129, 134, 139`: `error TS2345: Argument of type 'string' is not assignable to parameter of type 'string[]'.`
  - Line `151`: `error TS2345: Property 'assigned_techs' is missing in type ...` when calling `addRepairTicket`.

## 2. Core Business Rules (DO NOT BREAK)
1. **6 Operational Roles:**
   - **ฝ่ายขาย (Sales):** Creates orders (`customer_name`, `district`, `address_detail`, `model_name`, `qty`). Auto-classifies `route_code` (`สาย 1` to `สาย 6`).
   - **บัญชี & สต๊อก (Accounting):** Cuts stock, attaches `bill_no`, and approves stock release (`pending_prep`).
   - **ช่างเตรียมสินค้า (Prep Tech):** Pulls hardware, applies BossComputech logo, packs, and binds unique factory `serial_number`. **CRITICAL:** Warranty void stickers are NOT applied at this stage. Auto-logs prep history so Prep Techs never write manual end-of-day reports.
   - **คนนั่งหน้าร้าน (Front-Desk Dispatcher):** Central operational hub:
     - Dispatches deliveries, pickups, and installation jobs grouped by `route_code` (`สาย 1` - `สาย 6`).
     - **Multi-Tech Assignment:** Technicians do NOT have fixed routes, and big jobs (e.g., Server Rack installation, LAN cabling) require 2–3 technicians working together. Front-Desk must be able to assign **multiple technicians (`assigned_techs: string[]`)** via multi-select checkboxes per job.
     - Logs walk-in repairs (`รับเครื่องซ่อมหน้าร้าน`) or onsite calls (`แจ้งซ่อม/ติดตั้งหน้างาน`).
     - Views & exports **Automated Daily Prep & Repair Completion Reports (CSV / Print)**.
   - **ช่าง Onsite (Field Tech):** Filters jobs by **Technician Name** OR **Route (`สาย 1` - `สาย 6`)**. Sees all teammates assigned to the job (`assigned_techs`). Applies warranty void sticker on actual delivery date (`void_date`) or picks up faulty units.
   - **ช่างซ่อมในร้าน (In-House Repair):** Repairs faulty units, checks warranty status auto-calculated from `void_date`, logs `repair_detail` & `parts_used`, and marks `repaired_ready_return`.

2. **6 Delivery/Service Routes (Auto-Routing Logic):**
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

## 3. Architecture & Database Readiness
- **Dual-Mode Storage:** Currently runs in **Demo Mode (`localStorage`)** with pre-loaded Thai mock data for instant Vercel presentation, with a Settings modal / config ready to connect **Supabase (`@supabase/supabase-js`)** for live multi-user sync.
- **Language:** 100% natural **Thai (ภาษาไทย)** across all UI labels, route badges, statuses, buttons, and reports.

## 4. Immediate Action Checklist for AI Agent
1. **Fix `src/components/FrontdeskView.tsx` TypeScript Errors:**
   - Update dispatch handlers at lines 96, 105, 114, 129, 134, 139 to pass `string[]` (using the multi-select technician array state) instead of a single `string`.
   - Include `assigned_techs: []` in the payload passed to `addRepairTicket` at line 151.
2. **Verify Build:** Run `npm run build` in the terminal and fix any remaining TypeScript or Vite build errors until `npm run build` exits with code `0`.
3. **Prepare Supabase Schema (`schema.sql`):** Ensure `schema.sql` exists in the root directory with `orders`, `items`, and `repair_tickets` tables using `text[]` (or `jsonb`) for `assigned_techs` so the user can paste it into Supabase SQL Editor when moving from Demo to Production.