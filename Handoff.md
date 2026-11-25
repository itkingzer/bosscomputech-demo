# Handoff: BossComputech Operations App (`d:\BossComputech_ProjectWebsite`)

## 1. Project Context & Tech Stack
- **App**: `bosscomputech-operations-app` (v2.0.0) — ระบบบริหารจัดการงานขาย, จัดซื้อ/สต๊อก, ช่างเตรียมสินค้า, หน้าร้าน/จัดคิวรถ, ช่าง Onsite, ช่างซ่อมในร้าน, บัญชี, HR และหน้าลูกค้า
- **Stack**: React 19, TypeScript, Vite 6, Tailwind CSS v4 (`@tailwindcss/vite`), Lucide React, `@supabase/supabase-js`, `html5-qrcode`
- **OS / Shell**: Windows (PowerShell 5.1 — ใช้ `;` แทน `&&` เช่น `npx tsc --noEmit; if ($?) { npm run build }`)
- **Latest Commit**: `6f247ed` on `main` (`feat: mobile UI polish, centered modals, route filter & streamlined prep/service flow`, working tree clean)
- **Dev Server**: `npm run dev` (รันที่ `http://localhost:5173/` — ปัจจุบันปิดอยู่หลังรีสตาร์ท ต้องรันใหม่ถ้าจะเทส)

## 2. Architecture & Key Conventions
- **Global CSS (`src/index.css`)**:
  - มี `@media (max-width: 767px)` กำหนด touch-target ของ `input/select/textarea` (`min-height: 44px; font-size: 16px`) และ `button` (`min-height: 40px`)
  - **ข้อควรระวัง**: มี override เฉพาะจุดสำหรับ:
    - `.list-controls-bar` (`ListControls.tsx`) ให้ `<select>` สูง `30px` และปุ่ม `28px` บนมือถือ
    - `.activity-log-toggle` (`ActivityTimeline.tsx`) ให้สูง `24px` บนมือถือ
    - `[role='dialog']` และ `.fixed.inset-0` ให้ฟอร์มใน Modal สูง `36px` (`font-size: 13px`) และปุ่ม `34px` บนมือถือ
- **Shared Modal (`src/components/ui/Modal.tsx`)**:
  - ใช้ `createPortal(..., document.body)`, จัดกึ่งกลางทั้งมือถือและคอม (`flex items-center justify-center p-4 sm:p-6`), ขนาด `max-h-[82dvh] sm:max-h-[86dvh]`, `rounded-2xl sm:rounded-3xl`
  - **ข้อควรระวัง**: อย่าใส่ `pb-[env(safe-area-inset-bottom)]` ทับ `p-4`/`p-5`/`p-6` บนกล่อง Modal เพราะบนเดสก์ท็อป `env()` เป็น `0px` จะทำให้ padding ด้านล่างหาย
  - **ข้อควรระวังเรื่อง `position: fixed`**: `<main>` ใน `src/App.tsx` ครอบ view ด้วย `<div key={activeTab} className="animate-slide-up">` ซึ่งมี CSS `transform` ดังนั้น FAB หรือ element ที่ต้องการลอยติด viewport ต้อง render ผ่าน `createPortal(..., document.body)`

## 3. สิ่งที่ทำเสร็จแล้วในรอบล่าสุด (Commit `6f247ed`)
1. **Mobile Tables → Card Lists (`md:hidden` + `hidden md:block`)**:
   - `DashboardView.tsx` (ตาราง SO, PO, และรายการสินค้าหมุนเวียนล่าสุด)
   - `ProfitDashboardView.tsx` (ตารางผลงานพนักงานขาย และตารางสรุปรายบิล/โปรเจกต์)
   - `AccountingView.tsx` (ตาราง PO)
   - `PrepView.tsx` (ตารางสต๊อกกลางที่ติดโลโก้แล้ว)
   - `AdminUserManagement.tsx` (ตารางรายชื่อผู้ใช้)
2. **Unified Centered Modals (UI/UX Pro Max)**:
   - ปรับ `Modal.tsx` และ custom modals ใน `App.tsx`, `AccountingView.tsx`, `AdminUserManagement.tsx`, `FrontdeskView.tsx`, `HrDirectoryView.tsx`, `OnsiteView.tsx`, `PrepView.tsx`, `PurchasingStockView.tsx`, `RepairView.tsx`, `SalesView.tsx`, `SettingsModal.tsx`, `BarcodeScannerModal.tsx` ให้อยู่กลางจอ มีระยะขอบสมดุลทั้งมือถือและเดสก์ท็อป
3. **Compact Mobile Controls**:
   - ย่อ `ListControls.tsx` (ตัวเรียงลำดับ / จำนวนต่อหน้า / แบ่งหน้า) และ `ActivityTimeline.tsx` (ปุ่ม `ดู Log`) บนมือถือไม่ให้กินพื้นที่การ์ดงาน
4. **Purchasing & Stock (`PurchasingStockView.tsx`)**:
   - ย่อส่วนหัว, KPI 4 ช่อง, แท็บหลัก, ตัวกรองสถานะ, และการ์ดออเดอร์บนมือถือ
   - เน้น **ชื่อสินค้า + จำนวน (`×qty`)** ให้เด่นกว่าชื่อ Supplier บนการ์ด PO รอของเข้า/รับเข้าแล้ว
   - เน้นกล่อง **คำขอเบิกเข้าไซต์ (พรุ่งนี้ / นัดหมาย)** ให้เด่นแยกจากรายการโปรเจกต์ด้านล่าง
   - แก้ Dropdown `คลังพร้อมขาย` ใน `actionOrder` modal ไม่ให้ล้นกรอบบนมือถือ
   - เพิ่มปุ่มลัดตัดสต๊อกผูกบิลขายตรงจาก Modal ห้องสต๊อก (`batchDetail`) เพื่อลดการวนเข้าคลังกลางซ้ำ
5. **Service Item Exclusion (`src/utils/domainHelpers.ts`, `src/context/AppContext.tsx`, `PurchasingStockView.tsx`)**:
   - เพิ่ม helper `isServiceItem()` ข้ามรายการหมวด `service` / `ค่าบริการ` / `ค่าแรง` ไม่ให้ถูกนับเป็นของขาด, ไม่เปิด PO, และไม่สร้าง `Item` เข้าคลังตอน `cutStock`
6. **Prep Tech (`PrepView.tsx`)**:
   - พับกล่องคำอธิบายขั้นตอนช่างเตรียมสินค้าบนมือถือด้วย `<details>`
   - เพิ่มปุ่มจบในขั้นตอนเดียว (`เทส + ติดโลโก้ + ติดวอย → พร้อมส่งออกเลย / ส่งเข้าไซต์เลย`) เมื่อรายการถูกตัดผูก `order_id` หรือ `project_id` มาแล้ว
7. **Frontdesk (`FrontdeskView.tsx`)**:
   - ย่อ KPI ด้านบนเป็น 3-column grid บนมือถือ, แท็บหลักเป็นแถวเดียวเลื่อนซ้าย-ขวาได้, ปุ่มรับงานด่วนเป็น 2-column
   - เพิ่มแถบกรองตาม **สายรถ (`สาย 1`–`สาย 6`)** และป้ายสายรถบนการ์ดในขั้นที่ 1 (จัดคิวส่งพรุ่งนี้) โดยแสดงแถบกรองค้างไว้ตลอดแม้สายที่เลือกมี 0 งาน
8. **Onsite (`OnsiteView.tsx`)**:
   - ย้ายปุ่ม FAB `+ รับเครื่องซ่อม` บนมือถือเข้า `createPortal(..., document.body)` เพื่อให้ลอยตามหน้าจอจริง

## 4. สิ่งที่ยังเหลือ / แนะนำให้ทำต่อ
- **Mobile UI Audit หน้าอื่นที่ยังไม่ได้ปรับละเอียด**:
  - `SalesView.tsx` (ฟอร์มสร้างบิล/โปรเจกต์/สัญญา และรายการบิลบนมือถือ)
  - `RepairView.tsx` & `OnsiteView.tsx` (layout การ์ด/ตัวกรองบนมือถือ)
  - `HrDirectoryView.tsx`, `CompletedLogsView.tsx`, `CustomerLandingPage.tsx`, `LoginPage.tsx`
- **Production Checklist (อ้างอิง `Warring.md`)**:
  - เพิ่ม React `ErrorBoundary` ครอบหน้าหลักใน `src/App.tsx`
  - ทยอยเปลี่ยน `alert(...)` / `confirm(...)` เป็น `ToastBanner` หรือ Modal ยืนยันเพื่อความลื่นไหลบนมือถือ

## 5. Verification Rule
หลังแก้ไขเสร็จทุกครั้งให้ตรวจสอบด้วยคำสั่ง:
```powershell
npx tsc --noEmit; if ($?) { npm run build }
```
