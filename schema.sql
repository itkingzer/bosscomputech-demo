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
    payment_term TEXT DEFAULT 'cash' CHECK (payment_term IN ('cash', 'credit_30', 'project')), -- เงินสด / เครดิต 30 วัน / PROJECT
    delivery_mode TEXT DEFAULT 'install' CHECK (delivery_mode IN ('install', 'drop_off', 'customer_pickup', 'project')), -- ส่งพร้อมติดตั้ง / ส่งไม่ต้องติดตั้ง / ลูกค้ารับเองหน้าร้าน / งานโครงการ
    site_notes TEXT,                        -- หมายเหตุหน้างาน
    bill_no TEXT UNIQUE,
    order_status TEXT NOT NULL DEFAULT 'pending_purchasing' CHECK (order_status IN ('pending_purchasing', 'waiting_po', 'po_received_in_stock', 'approved_for_prep', 'fulfilled')),
    items_list JSONB DEFAULT '[]'::jsonb,   -- รายการสินค้าหลายรายการใน 1 บิล (รองรับ item_type: hardware | service | unit_cost)
    extra_cost NUMERIC(12,2) DEFAULT 0,     -- ต้นทุนค่าแรง/ค่าดำเนินการอื่นต่อออเดอร์ (INTERNAL ONLY - ห้ามแสดงในเอกสารลูกค้า)
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
        'in_stock',
        'pending_prep',
        'prepped_in_stock',
        'ready_for_dispatch',
        'assigned_onsite',
        'delivered',
        'in_repair',
        'repaired_ready_return'
    )),
    prep_type TEXT DEFAULT 'outbound_dispatch',
    supplier TEXT,                          -- แหล่งที่มา เช่น สต๊อกร้าน, SIS, Synnex, Abshop, PKT
    po_no TEXT,                             -- เลขที่ PO / ใบสั่งซื้อ เช่น PKT/2569-083
    prep_note TEXT,                         -- หมายเหตุถึงช่างเตรียม เช่น มีกล่องพร้อมลง Driver
    delivery_mode TEXT DEFAULT 'install',   -- ประเภทการส่งมอบ
    assigned_prep_tech TEXT,                -- ช่างเตรียมผู้รับงาน
    prep_accepted_at TIMESTAMPTZ,           -- เวลาที่ช่างเตรียมรับงาน
    job_category TEXT DEFAULT 'delivery' CHECK (job_category IN ('delivery', 'repair_pickup', 'installation')),
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
    job_category TEXT DEFAULT 'repair_pickup' CHECK (job_category IN ('delivery', 'repair_pickup', 'installation')),
    assigned_techs TEXT[] NOT NULL DEFAULT '{}',   -- ทีมช่าง (เลือกได้หลายคน)
    assigned_onsite_tech TEXT,                      -- backward-compat: ช่างหลัก = assigned_techs[0]
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN (
        'open',
        'in_progress',
        'repaired',
        'unrepairable_warranty',
        'expired_warranty',
        'unrepairable',
        'returned_closed'
    )),
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

-- Migration: add GP analytics columns to existing deployments (safe to re-run)
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS salesperson TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS extra_cost NUMERIC(12,2) DEFAULT 0;

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

-- Disable Row Level Security (RLS) for internal operations system deployment
ALTER TABLE public.orders DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.items DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.repair_tickets DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.products DISABLE ROW LEVEL SECURITY;

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
