# ⚠️ WARNING: Checklist ก่อนเปิดระบบออนไลน์จริง (Production Go-Live)

> อ่านและตรวจสอบรายการนี้ทุกครั้งก่อน Deploy / เปิดใช้งานจริงบนอินเทอร์เน็ต!

---

## 🔴 1. ความปลอดภัย & ฐานข้อมูล (ต้องทำก่อนเปิดสาธารณะ)

1. **เปลี่ยนรหัสผ่านพนักงานทุกบัญชี & เปิดระบบ Auth ที่ปลอดภัย**
   - รหัสผ่านเริ่มต้นใน `src/data/initialData.ts` เป็น `password123` และตาราง `users` ใน `schema.sql` ยังเก็บรหัสผ่านแบบ plain text
   - ก่อนเปิดใช้งานจริง ต้องเปลี่ยนรหัสผ่าน Admin และพนักงานทุกบัญชี หรือเปลี่ยนไปใช้ **Supabase Auth**
2. **เปิด Row Level Security (RLS) บน Supabase**
   - ใน `schema.sql` มีคำสั่ง `DISABLE ROW LEVEL SECURITY` สำหรับโหมดทดสอบ/ใช้งานภายใน
   - หากเปิดให้เข้าถึงจากภายนอก ควรตั้ง Policy และเปิด RLS ให้เรียบร้อย
3. **อัปเดตฐานข้อมูลจาก `schema.sql` ให้ครบ**
   - นำไฟล์ `schema.sql` ไปรันใน **Supabase SQL Editor** ให้ครบทุกตารางและคอลัมน์ใหม่ (`orders`, `items`, `repair_tickets`, `products`, `stock_pos`, `projects`, `contracts`, `contract_items`, `users`)
4. **ตั้งค่า Environment Variables บนโฮสต์**
   - ตรวจสอบ `VITE_SUPABASE_URL` และ `VITE_SUPABASE_ANON_KEY` บน Vercel / Netlify / Cloudflare Pages ให้ตรงกับโปรเจกต์ Production

---

## 🟠 2. เตรียมข้อมูลก่อนเริ่มขายจริง

5. **ล้างข้อมูลทดสอบ (Demo Data)**
   - หลังล็อกอินเข้าระบบจริง ให้กดปุ่ม **`เริ่มใช้งานจริง (ล้างบิลทดสอบ / เหลือสต๊อก)`** บนแถบด้านบน เพื่อล้างบิลขาย, PO, คิวงานซ่อม, โปรเจกต์ และประวัติทดสอบทั้งหมด โดยคง **Catalog สินค้า** และ **ยอดสต๊อกจริง** ไว้

---

## 🟡 3. ทดสอบก่อน Deploy & แผนอัปเดตถัดไป

6. **รัน Build ตรวจสอบก่อนขึ้นโฮสต์จริง**
   - รัน `npx tsc --noEmit` และ `npm run build` เพื่อยืนยันว่าไม่มี error ตอนสร้าง production bundle
7. **สิ่งที่ควรอัปเดตเพิ่มเติมในรอบถัดไป**
   - เพิ่ม React `ErrorBoundary` ครอบหน้าหลักใน `src/App.tsx` ป้องกันหน้าจอขาวเมื่อเกิด runtime error
   - ทยอยเปลี่ยน `alert(...)` แบบเบราว์เซอร์เป็น `ToastBanner` หรือข้อความแจ้งเตือนในฟอร์มเพื่อความลื่นไหลบนมือถือ
