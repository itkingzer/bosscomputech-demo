-- ==============================================================================
-- BossComputech End-to-End Operations, S/N Tracking & Route Zoning System
-- Compatible with Supabase PostgreSQL & Realtime
-- ==============================================================================

-- 1. Orders Table (ฝ่ายขาย & ฝ่ายจัดซื้อ/สต๊อก + รองรับใบขาว ORDER FORM 2026 และสายวิ่งรถ 6 สาย)
CREATE TABLE IF NOT EXISTS public.orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sales_ref TEXT,
    salesperson TEXT,                       -- ชื่อพนักงานขายผู้เปิดบิล (auto-tag จาก logged-in user)
    customer_name TEXT NOT NULL,
    customer_phone TEXT,
    delivery_location TEXT,
    district TEXT,                          -- อำเภอ/พื้นที่ เช่น พุนพิน, เมืองสุราษฎร์ธานี
    route_code TEXT,                        -- รหัสสายรถ เช่น route_1, route_2, route_5, route_6
    province_custom TEXT,                   -- สำหรับสาย 6 ระบุจังหวัดเพิ่มเติม
    delivery_date DATE,                     -- วันที่ส่งมอบ
    bill_type TEXT DEFAULT 'tax_invoice' CHECK (bill_type IN ('tax_invoice', 'cash_bill_quotation')), -- ใบกำกับภาษี / ใบเสนอราคา-บิลเงินสด
    payment_term TEXT DEFAULT 'cash' CHECK (payment_term IN ('cash', 'credit_30', 'project', 'government')), -- เงินสด / เครดิต 30 วัน / PROJECT / งานราชการ-ประมูล
    delivery_mode TEXT DEFAULT 'install' CHECK (delivery_mode IN ('install', 'drop_off', 'customer_pickup', 'project')), -- ส่งพร้อมติดตั้ง / ส่งไม่ต้องติดตั้ง / ลูกค้ารับเองหน้าร้าน / งานโครงการ
    site_notes TEXT,                        -- หมายเหตุหน้างาน
    bill_no TEXT UNIQUE,
    order_status TEXT NOT NULL DEFAULT 'pending_purchasing' CHECK (order_status IN ('pending_purchasing', 'waiting_po', 'po_received_in_stock', 'approved_for_prep', 'fulfilled')),
    items_list JSONB DEFAULT '[]'::jsonb,   -- รายการสินค้าหลายรายการใน 1 บิล (รองรับ item_type: hardware | service | unit_cost)
    extra_cost NUMERIC(12,2) DEFAULT 0,     -- ต้นทุนค่าแรง/ค่าดำเนินการอื่นต่อออเดอร์ (INTERNAL ONLY - ห้ามแสดงในเอกสารลูกค้า)
    deposit_amount NUMERIC(12,2) DEFAULT 0, -- ยอดเงินมัดจำที่รับแล้ว (บาท)
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Items Table (รายการสินค้าแต่ละชิ้น, ผูกกับ S/N, เตรียมของ, ติดวอยรับประกัน, จ่ายงาน Onsite)
CREATE TABLE IF NOT EXISTS public.items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE,
    model_name TEXT NOT NULL,
    serial_number TEXT UNIQUE,
    status TEXT NOT NULL DEFAULT 'pending_prep' CHECK (status IN (
        'raw_stock',
        'in_stock',
        'pending_prep_stock',
        'pending_prep',
        'prepped_in_stock',
        'ready_for_dispatch',
        'assigned_onsite',
        'delivered',
        'in_repair',
        'repaired_ready_return'
    )),
    prep_type TEXT DEFAULT 'outbound_dispatch',   -- inbound_stock | outbound_dispatch | stock_po
    category TEXT,                          -- หมวดหมู่สินค้า (จาก Stock PO)
    stock_po_id UUID,                       -- อ้างอิงใบ Stock PO ต้นทาง
    received_at TIMESTAMPTZ,                -- วันที่รับของเข้าห้องสต๊อก (ใช้คำนวณประกัน DOA 7 วัน)
    unit_cost NUMERIC(12,2) DEFAULT 0,      -- ราคาทุนต่อหน่วย (INTERNAL ONLY)
    supplier TEXT,                          -- แหล่งที่มา เช่น สต๊อกร้าน, SIS, Synnex, Abshop, PKT
    po_no TEXT,                             -- เลขที่ PO / ใบสั่งซื้อ เช่น PKT/2569-083
    prep_note TEXT,                         -- หมายเหตุถึงช่างเตรียม เช่น มีกล่องพร้อมลง Driver
    delivery_mode TEXT DEFAULT 'install',   -- ประเภทการส่งมอบ
    assigned_prep_tech TEXT,                -- ช่างเตรียมผู้รับงาน
    prep_accepted_at TIMESTAMPTZ,           -- เวลาที่ช่างเตรียมรับงาน
    job_category TEXT DEFAULT 'delivery' CHECK (job_category IN ('delivery', 'repair_pickup', 'repair_return', 'installation')),
    assigned_techs TEXT[] NOT NULL DEFAULT '{}',   -- ทีมช่าง Onsite (เลือกได้หลายคน)
    assigned_onsite_tech TEXT,                      -- backward-compat: ช่างหลัก = assigned_techs[0]
    prepped_at TIMESTAMPTZ,                 -- เวลาที่เตรียมเสร็จเก็บเข้าสต๊อกรอส่ง
    void_date DATE,                         -- วันที่ติดวอยรับประกันจริงก่อนปล่อยของ
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Repair Tickets Table (รับเครื่องซ่อมหน้าร้าน / รับเครื่องจาก Onsite + รองรับสายวิ่งรถ 6 สาย)
CREATE TABLE IF NOT EXISTS public.repair_tickets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    item_id UUID REFERENCES public.items(id) ON DELETE SET NULL,
    ticket_no TEXT UNIQUE,
    walkin_sn TEXT,
    customer_name TEXT NOT NULL,
    customer_phone TEXT,
    intake_channel TEXT NOT NULL DEFAULT 'front_desk_walkin' CHECK (intake_channel IN ('front_desk_walkin', 'onsite_pickup')),
    device_model TEXT,                      -- รุ่น/ประเภทตัวเครื่องที่รับมาซ่อม
    accessories TEXT[] NOT NULL DEFAULT '{}', -- อุปกรณ์ที่ติดมาด้วย (Adapter, สาย Power, ฯลฯ)
    accessories_other TEXT,                 -- อุปกรณ์ที่ติดมาด้วยเพิ่มเติม
    picked_up_by TEXT,                      -- ชื่อช่าง Onsite ผู้ไปรับเครื่องมาจากหน้างาน
    fault_symptom TEXT NOT NULL,
    repair_detail TEXT,
    parts_used TEXT,
    repair_outcome TEXT,                    -- ซ่อมได้, ส่งประกัน, หมดประกัน, ซ่อมไม่ได้
    district TEXT,                          -- อำเภอ/พื้นที่
    route_code TEXT,                        -- รหัสสายรถ route_1 ถึง route_6
    delivery_location TEXT,
    province_custom TEXT,
    job_category TEXT DEFAULT 'repair_pickup' CHECK (job_category IN ('delivery', 'repair_pickup', 'repair_return', 'installation')),
    assigned_techs TEXT[] NOT NULL DEFAULT '{}',   -- ทีมช่าง (เลือกได้หลายคน)
    assigned_onsite_tech TEXT,                      -- backward-compat: ช่างหลัก = assigned_techs[0]
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN (
        'open',
        'in_progress',
        'repaired',
        'unrepairable_warranty',
        'expired_warranty',
        'unrepairable',
        'awaiting_dispatch',
        'dispatched_onsite',
        'on_delivery',
        'returned_closed'
    )),
    -- Repair lifecycle (7 states) — วงจรชีวิตงานซ่อม / ส่งเคลม
    repair_status TEXT NOT NULL DEFAULT 'pending_check' CHECK (repair_status IN (
        'pending_check',
        'repairing',
        'waiting_parts',
        'rma_sent',
        'rma_returned',
        'ready_pickup',
        'completed'
    )),
    -- Service type: ซ่อมเองหน้าร้าน หรือ ส่งเคลมประกัน (RMA)
    service_type TEXT NOT NULL DEFAULT 'in_house_repair' CHECK (service_type IN ('in_house_repair', 'rma_claim')),
    included_accessories TEXT,              -- อุปกรณ์ที่ติดมากับเครื่อง (ระบุในใบรับซ่อม)
    -- RMA (Warranty Claim) tracking
    rma_supplier TEXT,                      -- SIS / Synnex / Ingram / Ascenti / WPG / ส่งตรงศูนย์แบรนด์
    rma_tracking_no TEXT,                   -- เลขใบส่งเคลม / เลขพัสดุ
    rma_sent_date TIMESTAMPTZ,              -- วันที่ส่งออกเคลม (ใช้คำนวณ "ส่งเคลมแล้ว X วัน")
    rma_returned_date TIMESTAMPTZ,          -- วันที่ได้ของเคลมกลับ
    replacement_sn TEXT,                    -- S/N ตัวใหม่กรณีศูนย์เปลี่ยนเครื่อง (เก็บ S/N เดิมใน log)
    received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    finished_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Products Table (Product Catalog - สินค้า/บริการที่ใช้ซ้ำได้ พร้อมราคาทุน & ราคาขาย)
CREATE TABLE IF NOT EXISTS public.products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'general' CHECK (category IN ('pc_notebook', 'printer', 'cctv_network', 'service', 'general')),
    item_type TEXT NOT NULL DEFAULT 'hardware' CHECK (item_type IN ('hardware', 'service')),
    unit TEXT NOT NULL DEFAULT 'เครื่อง',    -- หน่วยนับ: เครื่อง, ชุด, จุด, เมตร, รายการ
    cost_price NUMERIC(12,2) NOT NULL DEFAULT 0,  -- ราคาทุน (INTERNAL ONLY - ห้ามแสดงในเอกสารลูกค้า)
    sell_price NUMERIC(12,2) NOT NULL DEFAULT 0,  -- ราคาขาย
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. Stock POs Table (Proactive Stock Replenishment - สั่งของเข้าสต๊อกล่วงหน้า ไม่ผูกกับออเดอร์ลูกค้า)
CREATE TABLE IF NOT EXISTS public.stock_pos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    po_number TEXT NOT NULL,                -- เลขที่ใบสั่งซื้อ เช่น PKT/2569-083
    product_name TEXT NOT NULL,             -- ชื่อสินค้า/รุ่นที่สั่ง (All-in-One, Notebook, อุปกรณ์)
    category TEXT NOT NULL DEFAULT 'general' CHECK (category IN ('pc_notebook', 'printer', 'cctv_network', 'service', 'general')),
    qty INTEGER NOT NULL DEFAULT 1 CHECK (qty > 0),
    unit_cost NUMERIC(12,2) NOT NULL DEFAULT 0,  -- ราคาทุนต่อหน่วย (INTERNAL ONLY)
    supplier TEXT,
    status TEXT NOT NULL DEFAULT 'ordered' CHECK (status IN ('ordered', 'received', 'cancelled')),
    received_at TIMESTAMPTZ,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Migration: add GP analytics columns to existing deployments (safe to re-run)
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS salesperson TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS customer_type TEXT
    CHECK (customer_type IN ('individual', 'organization'));
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS customer_contact_name TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS extra_cost NUMERIC(12,2) DEFAULT 0;

-- ==============================================================================
-- Migration: Timestamped Activity & Audit Log (safe to re-run)
-- activity_logs = JSONB array ของ { timestamp, action, actor, role, note }
-- ==============================================================================
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS activity_logs JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS created_by TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS created_at_log TIMESTAMPTZ;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS po_created_at TIMESTAMPTZ;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS po_received_at TIMESTAMPTZ;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS stock_cut_at TIMESTAMPTZ;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS dispatched_at TIMESTAMPTZ;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS fulfilled_at TIMESTAMPTZ;

ALTER TABLE public.items ADD COLUMN IF NOT EXISTS activity_logs JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS received_into_storage_at TIMESTAMPTZ;
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS prep_accepted_log_at TIMESTAMPTZ;
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS logo_scanned_at TIMESTAMPTZ;
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS moved_to_ready_at TIMESTAMPTZ;
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS warranty_applied_at TIMESTAMPTZ;
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS warranty_years INTEGER DEFAULT 0;
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS warranty_months INTEGER DEFAULT 0;
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS warranty_void_date TIMESTAMPTZ;
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS warranty_expire_date TIMESTAMPTZ;
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMPTZ;
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS dispatched_at TIMESTAMPTZ;
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;

ALTER TABLE public.repair_tickets ADD COLUMN IF NOT EXISTS activity_logs JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.repair_tickets ADD COLUMN IF NOT EXISTS received_by TEXT;
ALTER TABLE public.repair_tickets ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ;
ALTER TABLE public.repair_tickets ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMPTZ;
ALTER TABLE public.repair_tickets ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;

-- Migration: Repair Lifecycle & RMA (Warranty Claim) tracking columns (safe to re-run)
ALTER TABLE public.repair_tickets ADD COLUMN IF NOT EXISTS repair_status TEXT NOT NULL DEFAULT 'pending_check';
ALTER TABLE public.repair_tickets ADD COLUMN IF NOT EXISTS service_type TEXT NOT NULL DEFAULT 'in_house_repair';
ALTER TABLE public.repair_tickets ADD COLUMN IF NOT EXISTS included_accessories TEXT;
ALTER TABLE public.repair_tickets ADD COLUMN IF NOT EXISTS rma_supplier TEXT;
ALTER TABLE public.repair_tickets ADD COLUMN IF NOT EXISTS rma_tracking_no TEXT;
ALTER TABLE public.repair_tickets ADD COLUMN IF NOT EXISTS rma_sent_date TIMESTAMPTZ;
ALTER TABLE public.repair_tickets ADD COLUMN IF NOT EXISTS rma_returned_date TIMESTAMPTZ;
ALTER TABLE public.repair_tickets ADD COLUMN IF NOT EXISTS replacement_sn TEXT;

ALTER TABLE public.stock_pos ADD COLUMN IF NOT EXISTS activity_logs JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.stock_pos ADD COLUMN IF NOT EXISTS created_by TEXT;
ALTER TABLE public.stock_pos ADD COLUMN IF NOT EXISTS ordered_at TIMESTAMPTZ;

-- Migration: Stock PO / Proactive Replenishment & Unified Status Constraints (safe to re-run)
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS stock_po_id UUID;
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS received_at TIMESTAMPTZ;
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS unit_cost NUMERIC(12,2) DEFAULT 0;
ALTER TABLE public.items DROP CONSTRAINT IF EXISTS items_status_check;
ALTER TABLE public.items ADD CONSTRAINT items_status_check CHECK (status IN (
    'raw_stock',
    'in_stock',
    'pending_prep_stock',
    'pending_prep',
    'prepped_in_stock',
    'ready_for_dispatch',
    'assigned_onsite',
    'delivered',
    'in_repair',
    'repaired_ready_return'
));
ALTER TABLE public.items DROP CONSTRAINT IF EXISTS items_job_category_check;
ALTER TABLE public.items ADD CONSTRAINT items_job_category_check CHECK (
    job_category IN ('delivery', 'repair_pickup', 'repair_return', 'installation')
);

ALTER TABLE public.repair_tickets DROP CONSTRAINT IF EXISTS repair_tickets_status_check;
ALTER TABLE public.repair_tickets ADD CONSTRAINT repair_tickets_status_check CHECK (status IN (
    'open',
    'in_progress',
    'repaired',
    'unrepairable_warranty',
    'expired_warranty',
    'unrepairable',
    'awaiting_dispatch',
    'dispatched_onsite',
    'on_delivery',
    'returned_closed'
));
ALTER TABLE public.repair_tickets DROP CONSTRAINT IF EXISTS repair_tickets_job_category_check;
ALTER TABLE public.repair_tickets ADD CONSTRAINT repair_tickets_job_category_check CHECK (
    job_category IN ('delivery', 'repair_pickup', 'repair_return', 'installation')
);

-- Indexes for lightning fast lookups, S/N traceability & Route filtering
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders(order_status);
CREATE INDEX IF NOT EXISTS idx_orders_salesperson ON public.orders(salesperson);
CREATE INDEX IF NOT EXISTS idx_orders_route_code ON public.orders(route_code);
CREATE INDEX IF NOT EXISTS idx_orders_bill_no ON public.orders(bill_no);
CREATE INDEX IF NOT EXISTS idx_items_sn ON public.items(serial_number);
CREATE INDEX IF NOT EXISTS idx_items_status ON public.items(status);
CREATE INDEX IF NOT EXISTS idx_items_order_id ON public.items(order_id);
CREATE INDEX IF NOT EXISTS idx_items_assigned_techs ON public.items USING GIN (assigned_techs);
CREATE INDEX IF NOT EXISTS idx_repair_tickets_status ON public.repair_tickets(status);
CREATE INDEX IF NOT EXISTS idx_repair_tickets_route_code ON public.repair_tickets(route_code);
CREATE INDEX IF NOT EXISTS idx_repair_tickets_sn ON public.repair_tickets(walkin_sn);
CREATE INDEX IF NOT EXISTS idx_repair_tickets_assigned_techs ON public.repair_tickets USING GIN (assigned_techs);
CREATE INDEX IF NOT EXISTS idx_products_category ON public.products(category);
CREATE INDEX IF NOT EXISTS idx_products_name ON public.products(name);
CREATE INDEX IF NOT EXISTS idx_items_stock_po_id ON public.items(stock_po_id);
CREATE INDEX IF NOT EXISTS idx_stock_pos_status ON public.stock_pos(status);
CREATE INDEX IF NOT EXISTS idx_stock_pos_po_number ON public.stock_pos(po_number);

-- Disable Row Level Security (RLS) for internal operations system deployment
ALTER TABLE public.orders DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.items DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.repair_tickets DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.products DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_pos DISABLE ROW LEVEL SECURITY;

-- Enable Realtime publication on all three core operational tables
-- (wrapped in DO blocks so re-running this script does not error if already added)
DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.items;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.repair_tickets;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.products;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.stock_pos;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Automatic timestamp triggers
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_orders_updated_at ON public.orders;
CREATE TRIGGER trg_orders_updated_at
BEFORE UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_items_updated_at ON public.items;
CREATE TRIGGER trg_items_updated_at
BEFORE UPDATE ON public.items
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_repair_tickets_updated_at ON public.repair_tickets;
CREATE TRIGGER trg_repair_tickets_updated_at
BEFORE UPDATE ON public.repair_tickets
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_products_updated_at ON public.products;
CREATE TRIGGER trg_products_updated_at
BEFORE UPDATE ON public.products
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_stock_pos_updated_at ON public.stock_pos;
CREATE TRIGGER trg_stock_pos_updated_at
BEFORE UPDATE ON public.stock_pos
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ==============================================================================
-- Migration: Phase 2-4 Alignment (DOA, Evidence Photos, Billing, Projects, Users)
-- Safe to re-run (idempotent)
-- ==============================================================================

-- 1. Orders: Billing & Accounting columns
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS billing_status TEXT DEFAULT 'pending' CHECK (billing_status IN ('pending', 'billed'));
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS billed_at TIMESTAMPTZ;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS billed_by TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS tax_invoice_no TEXT;

-- 2. Items: Logo, Evidence Photos, DOA, Project link, and Onsite Accept columns
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS logo_applied BOOLEAN DEFAULT false;
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS photo_urls JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS project_id TEXT;
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS project_batch_no INTEGER;
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS project_item_id TEXT;
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS onsite_accepted_by TEXT;
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS onsite_accepted_at TIMESTAMPTZ;
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS doa_reason TEXT;
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS doa_notes TEXT;
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS doa_reported_at TIMESTAMPTZ;
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS doa_reported_by TEXT;
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS doa_rma_no TEXT;
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS doa_sent_date DATE;
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS doa_replaced_at TIMESTAMPTZ;
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS doa_replacement_item_id UUID;

ALTER TABLE public.items DROP CONSTRAINT IF EXISTS items_status_check;
ALTER TABLE public.items ADD CONSTRAINT items_status_check CHECK (status IN (
    'raw_stock',
    'in_stock',
    'pending_prep_stock',
    'pending_prep',
    'prepped_in_stock',
    'ready_for_dispatch',
    'assigned_onsite',
    'delivered',
    'in_repair',
    'repaired_ready_return',
    'doa_reported',
    'doa_sent_supplier',
    'doa_replaced'
));

-- 3. Repair Tickets: Evidence Photos, Channel, Cost & Return tracking
ALTER TABLE public.repair_tickets ADD COLUMN IF NOT EXISTS received_channel TEXT;
ALTER TABLE public.repair_tickets ADD COLUMN IF NOT EXISTS service_sheet_withdrawn_at TIMESTAMPTZ;
ALTER TABLE public.repair_tickets ADD COLUMN IF NOT EXISTS photo_urls JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.repair_tickets ADD COLUMN IF NOT EXISTS repair_cost NUMERIC(12,2) DEFAULT 0;
ALTER TABLE public.repair_tickets ADD COLUMN IF NOT EXISTS repaired_by TEXT;
ALTER TABLE public.repair_tickets ADD COLUMN IF NOT EXISTS is_repair_return BOOLEAN DEFAULT false;
ALTER TABLE public.repair_tickets ADD COLUMN IF NOT EXISTS due_date DATE;
ALTER TABLE public.repair_tickets ADD COLUMN IF NOT EXISTS returned_by TEXT;

-- 4. Stock POs: Project link
ALTER TABLE public.stock_pos ADD COLUMN IF NOT EXISTS project_id TEXT;

-- 5. Projects Table (Phase 3: Project / Site Installation)
CREATE TABLE IF NOT EXISTS public.projects (
    id TEXT PRIMARY KEY,
    site_name TEXT NOT NULL,
    customer_name TEXT NOT NULL,
    phone TEXT,
    location TEXT,
    district TEXT,
    route_code TEXT,
    province_custom TEXT,
    created_by TEXT NOT NULL,
    start_date DATE,
    due_date DATE,
    status TEXT NOT NULL DEFAULT 'planning' CHECK (status IN ('planning', 'active', 'in_progress', 'handover_pending', 'completed', 'cancelled')),
    assigned_techs TEXT[] NOT NULL DEFAULT '{}',
    billing_status TEXT DEFAULT 'pending' CHECK (billing_status IN ('pending', 'billed')),
    billed_at TIMESTAMPTZ,
    billed_by TEXT,
    tax_invoice_no TEXT,
    items JSONB NOT NULL DEFAULT '[]'::jsonb,
    batches JSONB NOT NULL DEFAULT '[]'::jsonb,
    material_requests JSONB NOT NULL DEFAULT '[]'::jsonb,
    daily_logs JSONB NOT NULL DEFAULT '[]'::jsonb,
    handover_photo_urls JSONB DEFAULT '[]'::jsonb,
    handover_note TEXT,
    completed_at TIMESTAMPTZ,
    activity_logs JSONB NOT NULL DEFAULT '[]'::jsonb,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Migration: ensure projects supports all app statuses & handover columns (safe to re-run)
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS handover_photo_urls JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS handover_note TEXT;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS site_visits JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS site_visit_id TEXT;
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS scheduled_date DATE;
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS scheduled_time_slot TEXT;
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS dispatch_route_zone TEXT;
ALTER TABLE public.repair_tickets ADD COLUMN IF NOT EXISTS scheduled_date DATE;
ALTER TABLE public.repair_tickets ADD COLUMN IF NOT EXISTS scheduled_time_slot TEXT;
ALTER TABLE public.repair_tickets ADD COLUMN IF NOT EXISTS dispatch_route_zone TEXT;
ALTER TABLE public.projects DROP CONSTRAINT IF EXISTS projects_status_check;
ALTER TABLE public.projects ADD CONSTRAINT projects_status_check CHECK (
    status IN ('planning', 'active', 'in_progress', 'handover_pending', 'completed', 'cancelled')
);

CREATE INDEX IF NOT EXISTS idx_projects_status ON public.projects(status);

-- Migration: Government/Bidding payment term & Order deposit_amount (safe to re-run)
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS deposit_amount NUMERIC(12,2) DEFAULT 0;
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_payment_term_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_payment_term_check CHECK (
    payment_term IN ('cash', 'credit_30', 'project', 'government')
);

-- 6. Users Table (Phase 4: HR Staff Directory & Admin Management)
CREATE TABLE IF NOT EXISTS public.users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password TEXT,
    name TEXT NOT NULL,
    nickname TEXT,
    role TEXT NOT NULL,
    assigned_route TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.projects DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.users DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.users
    ADD COLUMN IF NOT EXISTS department TEXT,
    ADD COLUMN IF NOT EXISTS phone TEXT,
    ADD COLUMN IF NOT EXISTS email TEXT,
    ADD COLUMN IF NOT EXISTS address TEXT,
    ADD COLUMN IF NOT EXISTS badge TEXT,
    ADD COLUMN IF NOT EXISTS avatar TEXT,
    ADD COLUMN IF NOT EXISTS profile_details TEXT,
    ADD COLUMN IF NOT EXISTS employment_start_date DATE,
    ADD COLUMN IF NOT EXISTS work_positions TEXT[];
CREATE INDEX IF NOT EXISTS idx_users_username ON public.users(username);
CREATE INDEX IF NOT EXISTS idx_users_role ON public.users(role);

DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.projects;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.users;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_projects_updated_at ON public.projects;
CREATE TRIGGER trg_projects_updated_at
BEFORE UPDATE ON public.projects
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_users_updated_at ON public.users;
CREATE TRIGGER trg_users_updated_at
BEFORE UPDATE ON public.users
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ==============================================================================
-- 7. Contracts & Contract Items (Rental / MA Recurring Billing)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.contracts (
    id TEXT PRIMARY KEY,
    contract_no TEXT UNIQUE NOT NULL,
    customer_id TEXT NOT NULL,
    customer_name TEXT NOT NULL,
    customer_phone TEXT,
    district TEXT,
    delivery_location TEXT,
    contract_type TEXT NOT NULL CHECK (contract_type IN ('rental', 'ma')),
    sub_type TEXT NOT NULL CHECK (sub_type IN (
        'internet_rental', 'system_rental', 'equipment_rental',
        'ma_monthly', 'ma_quarterly', 'ma_yearly'
    )),
    billing_cycle TEXT NOT NULL DEFAULT 'monthly' CHECK (billing_cycle IN ('monthly', 'quarterly', 'yearly')),
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'cancelled')),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.contract_items (
    id TEXT PRIMARY KEY,
    contract_id TEXT NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
    product_id TEXT,
    model_name TEXT NOT NULL,
    item_type TEXT NOT NULL DEFAULT 'service' CHECK (item_type IN ('hardware', 'service')),
    unit TEXT NOT NULL DEFAULT 'รายการ',
    quantity NUMERIC(10,2) NOT NULL DEFAULT 1,
    unit_price NUMERIC(12,2) NOT NULL DEFAULT 0,
    unit_cost NUMERIC(12,2) NOT NULL DEFAULT 0,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Migration: Orders billing_type, sub_type, contract_id, billing_period, period_start, period_end, due_date, issue_date, customer_id
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS customer_id TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS contract_id TEXT REFERENCES public.contracts(id) ON DELETE SET NULL;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS billing_type TEXT NOT NULL DEFAULT 'sales' CHECK (billing_type IN ('sales', 'rental', 'ma', 'addon'));
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS sub_type TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS billing_period TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS period_start DATE;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS period_end DATE;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS issue_date DATE;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS due_date DATE;

CREATE INDEX IF NOT EXISTS idx_contracts_customer_id ON public.contracts(customer_id);
CREATE INDEX IF NOT EXISTS idx_contracts_status ON public.contracts(status);
CREATE INDEX IF NOT EXISTS idx_contract_items_contract_id ON public.contract_items(contract_id);
CREATE INDEX IF NOT EXISTS idx_orders_contract_period ON public.orders(contract_id, billing_period);
CREATE INDEX IF NOT EXISTS idx_orders_billing_type ON public.orders(billing_type);

ALTER TABLE public.contracts DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.contract_items DISABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.contracts;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.contract_items;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_contracts_updated_at ON public.contracts;
CREATE TRIGGER trg_contracts_updated_at
BEFORE UPDATE ON public.contracts
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
