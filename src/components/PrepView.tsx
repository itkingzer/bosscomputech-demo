import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import {
  PackageSearch, BadgeCheck, CheckCircle, RefreshCw,
  Warehouse, Send, ShieldCheck, Plus, Layers, MapPin,
  UserCheck, Sparkles, PackagePlus, Lock, ChevronDown, ChevronUp, Camera
} from 'lucide-react';
import { ROUTE_DEFINITIONS, RouteCode, PRODUCT_CATEGORY_LABELS, Item } from '../types';
import { ListControls, useListControls } from './ListControls';
import { ActivityTimeline, LatestUpdateBadge } from './ActivityTimeline';
import { BarcodeScannerModal } from './BarcodeScannerModal';

// ---------------------------------------------------------------------------
// Helpers: group identical items into a single stacked card
// ---------------------------------------------------------------------------
interface ItemGroup {
  key: string;
  items: Item[];
  model_name: string;
  order_id?: string | null;
  po_no?: string;
  prep_note?: string;
  supplier?: string;
  delivery_mode?: Item['delivery_mode'];
  category?: Item['category'];
  unit_cost?: number;
}

const groupItems = (list: Item[]): ItemGroup[] => {
  const map = new Map<string, ItemGroup>();
  list.forEach((item) => {
    const key = `${item.order_id || item.po_no || 'no-order'}::${item.model_name}`;
    const existing = map.get(key);
    if (existing) {
      existing.items.push(item);
    } else {
      map.set(key, {
        key,
        items: [item],
        model_name: item.model_name,
        order_id: item.order_id,
        po_no: item.po_no,
        prep_note: item.prep_note,
        supplier: item.supplier,
        delivery_mode: item.delivery_mode,
        category: item.category,
        unit_cost: item.unit_cost
      });
    }
  });
  return Array.from(map.values());
};

const DELIVERY_MODE_LABEL: Record<string, string> = {
  install: 'ส่งพร้อมติดตั้ง',
  drop_off: 'ส่งไม่ต้องติดตั้ง',
  customer_pickup: 'ลูกค้ารับเองหน้าร้าน'
};

// Step badge component (1 -> 2 -> 3)
const StepBadge: React.FC<{ step: number; label: string; active: boolean; done?: boolean }> = ({ step, label, active, done }) => (
  <div
    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold border whitespace-nowrap transition ${done
      ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
      : active
        ? 'bg-[#FF6B00]/20 text-[#FF6B00] border-[#FF6B00]/40'
        : 'bg-white/[0.03] text-slate-500 border-white/[0.08]'
      }`}
  >
    <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] ${done ? 'bg-emerald-500 text-black' : active ? 'bg-[#FF6B00] text-black' : 'bg-white/10 text-slate-400'}`}>
      {done ? '✓' : step}
    </span>
    <span>{label}</span>
  </div>
);

export const PrepView: React.FC = () => {
  const {
    items, orders, prepInboundStock, acceptPrepTask,
    prepFinishToStock, prepFinishToReadyStock, prepFinishAndDispatch, applyVoidAndDispatch, currentUser,
    movePrepStockToReady
  } = useApp();

  // Tab state: 'stage1' (เตรียมของเข้าสต๊อก - ยังไม่ติดวอย) vs 'stage2' (เตรียมของออกไปส่ง - แปะวอยประกัน) vs 'stock' (สต๊อกทั่วไป) vs 'stockpo' (ของจาก Stock PO รอเตรียมเข้าสต๊อก)
  const [prepTab, setPrepTab] = useState<'stage1' | 'stage2' | 'stock' | 'stockpo'>('stage1');

  // Filter by route in outbound queue
  const [routeFilter, setRouteFilter] = useState<'all' | RouteCode>('all');

  // Stage 1: S/N inputs & notes (keyed by item id)
  const [snInputs, setSnInputs] = useState<Record<string, string>>({});
  const [prepNotesInputs, setPrepNotesInputs] = useState<Record<string, string>>({});

  // Stage 2: Void date inputs (keyed by item id)
  const [voidDateInputs, setVoidDateInputs] = useState<Record<string, string>>({});

  // Expanded stacked cards (collapsed by default to reduce clutter)
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  // Inbound stock general state
  const [inboundModel, setInboundModel] = useState('BossComputech Core-i7 Workstation Pro');
  const [inboundSn, setInboundSn] = useState(`BC-STOCK-${Math.floor(100 + Math.random() * 900)}`);
  const [inboundNotes, setInboundNotes] = useState('ประกอบเทสผ่าน ติดโลโก้ เก็บเข้าสต๊อกพร้อมขาย');

  const [toast, setToast] = useState('');
  const todayStr = new Date().toISOString().split('T')[0];

  // Barcode scanner modal: which S/N field is currently being scanned
  // ('inbound' = the manual inbound form, otherwise an item id)
  const [scanTarget, setScanTarget] = useState<string | null>(null);

  // Items for Stage 1: pending_prep (รอช่างเตรียมของ/ลงโปรแกรม/ยิง S/N ยังไม่ติดวอย)
  const stage1Items = items.filter(i => i.status === 'pending_prep');

  // Items from Stock PO: pending_prep_stock (ของเข้าจาก Stock PO รอช่างเตรียมเช็ก/ติดโลโก้/ยิง S/N เข้าสต๊อกพร้อมขาย)
  const stockPoItems = items.filter(i => i.status === 'pending_prep_stock');

  // Items for Stage 2: prepped_in_stock (พร้อมส่งในสต๊อก - รอแปะวอยปล่อยของ)
  const stage2Items = items.filter(i => i.status === 'prepped_in_stock');

  // In stock items general
  const generalStockItems = items.filter(i => i.status === 'in_stock');

  // Sort + pagination สำหรับการ์ดงานเตรียมของ (จัดกลุ่มแล้ว)
  const stockPoList = useListControls(groupItems(stockPoItems), {
    getDate: (g) => g.items[0]?.created_at,
    getValue: (g) => g.items.length,
    initialSort: 'newest',
  });
  const stage1List = useListControls(groupItems(stage1Items), {
    getDate: (g) => g.items[0]?.created_at,
    getValue: (g) => g.items.length,
    initialSort: 'newest',
  });
  const stage2List = useListControls(
    groupItems(
      stage2Items.filter(item => {
        if (routeFilter === 'all') return true;
        const order = orders.find(o => o.id === item.order_id);
        return order?.route_code === routeFilter;
      })
    ),
    {
      getDate: (g) => g.items[0]?.created_at,
      getValue: (g) => g.items.length,
      initialSort: 'newest',
    }
  );
  const generalStockList = useListControls(generalStockItems, {
    getDate: (i) => i.prepped_at,
    initialSort: 'newest',
  });

  const currentTechName = currentUser?.name || 'ช่างกอล์ฟ (ช่างเตรียมสินค้า)';

  const toggleGroup = (key: string) => {
    setExpandedGroups(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const showToast = (msg: string, ms = 4000) => {
    setToast(msg);
    setTimeout(() => setToast(''), ms);
  };

  // Handle Accept Prep Task (บันทึกชื่อผู้รับงานและเวลาอัตโนมัติ)
  const handleAcceptTask = (itemId: string) => {
    acceptPrepTask(itemId, currentTechName);
    showToast(`ช่าง "${currentTechName}" รับงานชิ้นนี้เรียบร้อยแล้ว`, 3500);
  };

  // Accept an entire stacked batch at once
  const handleAcceptGroup = (group: ItemGroup) => {
    group.items.forEach(it => {
      if (!it.assigned_prep_tech) acceptPrepTask(it.id, currentTechName);
    });
    setExpandedGroups(prev => ({ ...prev, [group.key]: true }));
    showToast(`ช่าง "${currentTechName}" รับงานทั้งชุด ${group.items.length} เครื่องเรียบร้อยแล้ว`, 3500);
  };

  // Handle Stage 1 Finish (Option A): ติดโลโก้ & แปะวอยพร้อมส่งออกเลย -> ready_for_dispatch
  const handleFinishAndDispatch = (itemId: string) => {
    const defaultSn = `BC-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`;
    const sn = (snInputs[itemId] || defaultSn).trim();
    const voidDate = voidDateInputs[itemId] || todayStr;
    const note = prepNotesInputs[itemId] || 'ติดโลโก้ & แปะวอยพร้อมส่งออกเลย';

    const success = prepFinishAndDispatch(itemId, sn, voidDate, note);
    if (!success) {
      alert(`Serial Number "${sn}" นี้ถูกใช้งานแล้วในระบบ! โปรดใช้หมายเลขอื่น`);
      return;
    }

    showToast(`ติดโลโก้ & แปะวอย (${voidDate}) ให้ S/N: ${sn} เรียบร้อย! ส่งตรงไปหน้าร้าน/จัดส่งแล้ว`);
  };

  // Handle Stage 1 Finish (Option B): ติดโลโก้เสร็จ - เก็บเข้าสต๊อกรอส่ง (ยังไม่แปะวอย) -> prepped_in_stock
  const handleFinishStage1 = (itemId: string) => {
    const defaultSn = `BC-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`;
    const sn = (snInputs[itemId] || defaultSn).trim();
    const note = prepNotesInputs[itemId] || 'ติดโลโก้เสร็จ เก็บเข้าสต๊อกรอส่ง (ยังไม่แปะวอย)';

    const success = prepFinishToStock(itemId, sn, note);
    if (!success) {
      alert(`Serial Number "${sn}" นี้ถูกใช้งานแล้วในระบบ! โปรดใช้หมายเลขอื่น`);
      return;
    }

    showToast(`ผูก S/N: ${sn} และเก็บเข้าสต๊อก "พร้อมส่ง - รอแปะวอย" เรียบร้อย (เด้งไปแท็บเตรียมปล่อยของแล้ว)`);
  };

  // Handle Stage 1 Finish (Option C): ติดโลโก้เสร็จ - เก็บเข้าคลังพร้อมขาย (in_stock, ยังไม่แปะวอย)
  // ปลดผูกออเดอร์ -> เครื่องไปอยู่ในสต๊อกพร้อมขายให้ฝ่ายขาย/จัดซื้อดึงไปขายภายหลัง
  const handleFinishToReadyStock = (itemId: string) => {
    const defaultSn = `BC-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`;
    const sn = (snInputs[itemId] || defaultSn).trim();
    const note = prepNotesInputs[itemId] || 'ติดโลโก้ & ยิง S/N เสร็จ เก็บเข้าคลังพร้อมขาย (ยังไม่ติดวอย)';

    const success = prepFinishToReadyStock(itemId, sn, note);
    if (!success) {
      alert(`Serial Number "${sn}" นี้ถูกใช้งานแล้วในระบบ! โปรดใช้หมายเลขอื่น`);
      return;
    }

    showToast(`ผูก S/N: ${sn} และเก็บเข้าคลัง "พร้อมขาย (in_stock)" เรียบร้อย - ฝ่ายขาย/จัดซื้อดึงไปขายได้ทันที`);
  };

  // Handle Stage 2 Finish: แปะวอยประกัน & ยืนยันปล่อยของออก (บันทึกวันที่ติดวอยผูกกับ S/N)
  const handleDispatchStage2 = (itemId: string, sn: string | null) => {
    const voidDate = voidDateInputs[itemId] || todayStr;
    applyVoidAndDispatch(itemId, voidDate);

    showToast(`แปะวอยรับประกัน (${voidDate}) ให้เครื่อง S/N: ${sn || '-'} เรียบร้อย! ปล่อยของให้ทีมจัดส่ง/หน้าร้านแล้ว`);
  };

  // Handle Stock PO item: ตรวจเช็ก + ติดโลโก้ + ยิง S/N -> ย้ายเข้าสต๊อกพร้อมขาย (in_stock, ยังไม่ติดวอย)
  const handleMoveStockPoToReady = (itemId: string) => {
    const defaultSn = `BC-STK-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`;
    const sn = (snInputs[itemId] || defaultSn).trim();
    const note = prepNotesInputs[itemId] || 'ตรวจเช็ก/ติดโลโก้/ยิง S/N ผ่าน เก็บเข้าสต๊อกพร้อมขาย (ยังไม่ติดวอย)';

    const success = movePrepStockToReady(itemId, sn, note);
    if (!success) {
      alert(`Serial Number "${sn}" นี้ถูกใช้งานแล้วในระบบ! โปรดใช้หมายเลขอื่น`);
      return;
    }

    showToast(`นำเข้า S/N: ${sn} เข้าสต๊อกพร้อมขาย (in_stock) เรียบร้อย - พร้อมให้ฝ่ายขายตัดสต๊อก`);
  };

  // Handle Inbound General Stock Prep
  const handlePrepInbound = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inboundModel || !inboundSn) return;

    const success = prepInboundStock(inboundModel, inboundSn.trim(), inboundNotes);
    if (!success) {
      alert(`Serial Number "${inboundSn}" นี้มีอยู่ในสต๊อกแล้ว`);
      return;
    }

    showToast(`เตรียมเครื่อง S/N: ${inboundSn} เข้าสต๊อกเรียบร้อยแล้ว (ยังไม่ติดวอย)`, 3500);
    setInboundSn(`BC-STOCK-${Math.floor(100 + Math.random() * 900)}`);
  };

  const generateNewSn = (itemId: string) => {
    const newSn = `BC-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`;
    setSnInputs({ ...snInputs, [itemId]: newSn });
  };

  // ---------------------------------------------------------------------------
  // Reusable: single S/N row inside an unlocked stacked card
  // ---------------------------------------------------------------------------
  const renderSnRow = (item: Item, index: number, accent: 'amber' | 'emerald') => {
    const currentSn = snInputs[item.id] !== undefined
      ? snInputs[item.id]
      : (accent === 'emerald'
        ? `BC-STK-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`
        : `BC-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`);
    const accentText = accent === 'emerald' ? 'text-emerald-300' : 'text-[#FF6B00]';
    const accentHover = accent === 'emerald' ? 'hover:text-emerald-400' : 'hover:text-[#FF6B00]';

    return (
      <div key={item.id} className="flex items-center gap-2">
        <span className="w-7 h-7 flex-shrink-0 rounded-lg bg-white/[0.06] border border-white/[0.1] text-[10px] font-bold text-slate-300 flex items-center justify-center">
          #{index + 1}
        </span>
        <div className="relative flex-1">
          <input
            type="text"
            value={currentSn}
            onChange={(e) => setSnInputs({ ...snInputs, [item.id]: e.target.value })}
            placeholder="สแกน / กรอก S/N"
            className={`w-full liquid-glass-input rounded-xl pl-3 pr-16 py-2 text-sm font-mono font-bold data-key ${accentText} focus:outline-none`}
          />
          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
            <button
              type="button"
              onClick={() => setScanTarget(item.id)}
              title="สแกนด้วยกล้อง"
              className="p-1 rounded-lg text-slate-400 hover:text-[#FF6B00] hover:bg-white/[0.08] transition cursor-pointer"
            >
              <Camera className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => generateNewSn(item.id)}
              title="สุ่ม S/N ใหม่"
              className={`p-1 rounded-lg text-slate-400 ${accentHover} hover:bg-white/[0.08] transition cursor-pointer`}
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 p-4 rounded-2xl liquid-glass border border-[#FF6B00] text-white text-xs flex items-center gap-2 shadow-2xl">
          <CheckCircle className="w-4 h-4 text-[#FF6B00]" />
          <span>{toast}</span>
        </div>
      )}

      {/* Role Rule & Logic Banner: 2 จังหวะตามหน้างานจริง */}
      <div className="p-4 rounded-2xl liquid-glass border border-[#FF6B00]/40 flex items-start gap-3.5 text-[#FF6B00] relative overflow-hidden">
        <div className="p-2 rounded-xl bg-[#FF6B00]/20 text-[#FF6B00] border border-[#FF6B00]/30 flex-shrink-0">
          <ShieldCheck className="w-5 h-5" />
        </div>
        <div className="text-xs leading-relaxed">
          <strong className="font-bold text-sm block mb-0.5 text-white">ขั้นตอนการทำงาน 2 จังหวะของช่างเตรียมสินค้า (Hardware Prep Specialist):</strong>
          1. <strong>จังหวะที่ 1 (เตรียมของเข้าสต๊อก):</strong> รับงานจากจัดซื้อ ดูหมายเหตุหน้างาน/การส่งมอบ ติดโลโก้ ลง Driver ยิง S/N และเก็บเข้าสต๊อก <span className="underline font-bold text-amber-300">(ยังไม่ติดวอยประกัน)</span><br />
          2. <strong>จังหวะที่ 2 (เตรียมของออกไปส่ง):</strong> เมื่อถึงรอบปล่อยของจริง แปะวอยประกัน (Warranty Void) ผูกกับ S/N พร้อมลงวันที่ส่งมอบจริง ก่อนส่งมอบให้ช่าง Onsite หรือหน้าร้าน
        </div>
      </div>

      {/* Prep View Tabs: จังหวะ 1 vs จังหวะ 2 vs สต๊อกทั่วไป */}
      <div className="flex gap-2 pb-1 overflow-x-auto">
        <button
          onClick={() => setPrepTab('stage1')}
          className={`px-4 py-2.5 text-xs font-semibold rounded-2xl transition-all cursor-pointer flex items-center gap-2 whitespace-nowrap ${prepTab === 'stage1'
            ? 'liquid-glass-active font-extrabold shadow-lg shadow-[#FF6B00]/25'
            : 'liquid-glass-card text-slate-400 hover:text-white'
            }`}
        >
          <PackageSearch className="w-4 h-4" />
          <span>จังหวะที่ 1: เตรียมของเข้าสต๊อก (ยังไม่ติดวอย) ({stage1Items.length})</span>
        </button>

        <button
          onClick={() => setPrepTab('stockpo')}
          className={`px-4 py-2.5 text-xs font-semibold rounded-2xl transition-all cursor-pointer flex items-center gap-2 whitespace-nowrap ${prepTab === 'stockpo'
            ? 'liquid-glass-active font-extrabold shadow-lg shadow-emerald-500/25'
            : 'liquid-glass-card text-slate-400 hover:text-white'
            }`}
        >
          <PackagePlus className="w-4 h-4" />
          <span>เตรียมเข้าสต๊อก (Stock PO) ({stockPoItems.length})</span>
        </button>

        <button
          onClick={() => setPrepTab('stage2')}
          className={`px-4 py-2.5 text-xs font-semibold rounded-2xl transition-all cursor-pointer flex items-center gap-2 whitespace-nowrap ${prepTab === 'stage2'
            ? 'liquid-glass-active font-extrabold shadow-lg shadow-[#FF6B00]/25'
            : 'liquid-glass-card text-slate-400 hover:text-white'
            }`}
        >
          <Send className="w-4 h-4" />
          <span>จังหวะที่ 2: เตรียมของออกไปส่ง (แปะวอยประกัน) ({stage2Items.length})</span>
        </button>

        <button
          onClick={() => setPrepTab('stock')}
          className={`px-4 py-2.5 text-xs font-semibold rounded-2xl transition-all cursor-pointer flex items-center gap-2 whitespace-nowrap ${prepTab === 'stock'
            ? 'liquid-glass-active font-extrabold shadow-lg shadow-[#FF6B00]/25'
            : 'liquid-glass-card text-slate-400 hover:text-white'
            }`}
        >
          <Warehouse className="w-4 h-4" />
          <span>สต๊อกเครื่องประกอบสำเร็จในคลัง ({generalStockItems.length})</span>
        </button>
      </div>

      {/* ========================================================================= */}
      {/* TAB: เตรียมเข้าสต๊อก (Stock PO) - ตรวจเช็ก/ติดโลโก้/ยิง S/N -> in_stock */}
      {/* ========================================================================= */}
      {prepTab === 'stockpo' && (
        <div className="liquid-glass rounded-3xl p-6 sm:p-7 shadow-2xl border border-white/[0.08]">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <div className="p-2 rounded-xl bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                  <PackagePlus className="w-5 h-5" />
                </div>
                <span>คิวเตรียมเข้าสต๊อก (Stock PO) - ตรวจเช็ก ติดโลโก้ ยิง S/N</span>
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                ของที่จัดซื้อสั่งเข้าสต๊อกล่วงหน้า ตรวจเช็ก ติดโลโก้ BossComputech ยิง S/N แล้วนำเข้าสต๊อกพร้อมขาย (ยังไม่ติดวอย)
              </p>
            </div>
            <span className="text-xs font-semibold px-3 py-1 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
              {stockPoItems.length} เครื่องรอเตรียมเข้าสต๊อก
            </span>
          </div>

          {stockPoItems.length === 0 ? (
            <div className="text-center py-12 text-slate-500 border border-dashed border-white/[0.1] rounded-2xl">
              <CheckCircle className="w-10 h-10 mx-auto mb-2 text-emerald-400 opacity-60" />
              <p className="text-sm font-medium text-slate-200">ไม่มีของจาก Stock PO ค้างเตรียมเข้าสต๊อก</p>
              <p className="text-xs text-slate-500 mt-0.5">ของทุกชิ้นถูกเตรียมและนำเข้าสต๊อกพร้อมขายแล้ว</p>
            </div>
          ) : (
            <div className="space-y-4">
              <ListControls
                from={stockPoList.from}
                to={stockPoList.to}
                total={stockPoList.total}
                page={stockPoList.page}
                totalPages={stockPoList.totalPages}
                pageSize={stockPoList.pageSize}
                sort={stockPoList.sort}
                onSortChange={stockPoList.setSort}
                onPageSizeChange={stockPoList.setPageSize}
                onPageChange={stockPoList.setPage}
                unit="งาน"
              />
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {stockPoList.pageItems.map((group) => {
                  const isAccepted = group.items.every(it => !!it.assigned_prep_tech);
                  const isExpanded = !!expandedGroups[group.key];

                  return (
                    <div
                      key={group.key}
                      className="p-5 rounded-2xl liquid-glass-card flex flex-col justify-between space-y-4 relative overflow-hidden border border-emerald-500/25"
                    >
                      <div className="absolute top-0 left-0 right-0 h-1 bg-emerald-500" />
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                            เตรียมเข้าสต๊อก
                          </span>
                          <span className="text-[11px] text-slate-500 font-mono data-meta">
                            PO: {group.po_no || '-'}
                          </span>
                        </div>

                        <div className="flex items-start justify-between gap-2 mb-1">
                          <h4 className="text-base font-bold text-white">{group.model_name}</h4>
                          {group.items.length > 1 && (
                            <span className="flex-shrink-0 px-2.5 py-1 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[11px] font-extrabold flex items-center gap-1">
                              <Layers className="w-3 h-3" />
                              จำนวน {group.items.length} เครื่อง
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5 flex-wrap mb-2">
                          {group.category && (
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-blue-500/15 text-blue-300 border border-blue-500/30">
                              {PRODUCT_CATEGORY_LABELS[group.category]}
                            </span>
                          )}
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-purple-500/15 text-purple-300 border border-purple-500/30">
                            Stock PO
                          </span>
                        </div>

                        {group.prep_note && (
                          <div className="mt-2 p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-[11px] text-emerald-300">
                            <strong>หมายเหตุ:</strong> {group.prep_note}
                          </div>
                        )}

                        <div className="mt-2 text-[11px] text-slate-400 flex justify-between data-meta">
                          <span>แหล่ง: {group.supplier || 'สต๊อกร้าน'}</span>
                          {group.unit_cost !== undefined && group.unit_cost > 0 && (
                            <span className="text-rose-300/80 font-mono font-bold data-key">ทุน ฿{group.unit_cost.toLocaleString('th-TH')}</span>
                          )}
                        </div>
                      </div>

                      <div className="space-y-3 pt-2 border-t border-white/[0.08]">
                        {!isAccepted ? (
                          <>
                            <div className="p-2.5 rounded-xl bg-white/[0.03] border border-white/[0.06] text-[11px] text-slate-400 flex items-center gap-1.5">
                              <Lock className="w-3.5 h-3.5 text-slate-500" />
                              <span>กดรับงานก่อนจึงจะยิง S/N ได้</span>
                            </div>
                            <button
                              onClick={() => handleAcceptGroup(group)}
                              className="w-full py-3 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 text-black font-extrabold rounded-xl text-sm transition cursor-pointer flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/25 border border-white/20 active:scale-95"
                            >
                              <UserCheck className="w-4 h-4" />
                              <span>กดรับงานนี้ (Accept Job)</span>
                            </button>
                          </>
                        ) : (
                          <>
                            <div className="text-[10px] text-emerald-400 flex items-center gap-1">
                              <UserCheck className="w-3.5 h-3.5" />
                              <span>ผู้รับงาน: {group.items[0].assigned_prep_tech}</span>
                            </div>

                            <div className="space-y-2">
                              {group.items.map((item, idx) => renderSnRow(item, idx, 'emerald'))}
                            </div>

                            <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-[10px] text-emerald-300 text-center">
                              * ตรวจเช็ก + ติดโลโก้แล้ว ยังไม่ติดวอยประกัน (จะติดตอนปล่อยของในจังหวะที่ 2)
                            </div>

                            <button
                              onClick={() => group.items.forEach(it => handleMoveStockPoToReady(it.id))}
                              className="w-full py-2.5 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 text-black font-extrabold rounded-xl text-xs transition cursor-pointer flex items-center justify-center gap-1.5 shadow-lg shadow-emerald-500/25 border border-white/20 active:scale-95"
                            >
                              <Warehouse className="w-4 h-4" />
                              <span>นำเข้าสต๊อกพร้อมขายทั้งชุด ({group.items.length})</span>
                            </button>
                          </>
                        )}
                        <LatestUpdateBadge
                          logs={group.items[0]?.activity_logs}
                          fallbackTimestamp={group.items[0]?.prepped_at || group.items[0]?.received_at || group.items[0]?.created_at}
                          fallbackActor={group.items[0]?.assigned_prep_tech}
                        />
                        <ActivityTimeline logs={group.items[0]?.activity_logs} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 1: จังหวะที่ 1 (เตรียมของเข้าสต๊อก - ยังไม่ติดวอย) */}
      {/* ========================================================================= */}
      {prepTab === 'stage1' && (
        <div className="liquid-glass rounded-3xl p-6 sm:p-7 shadow-2xl border border-white/[0.08]">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <div className="p-2 rounded-xl bg-amber-500/15 text-amber-400 border border-amber-500/30">
                  <PackageSearch className="w-5 h-5" />
                </div>
                <span>จังหวะที่ 1: คิวรับงานเตรียมสินค้า & ยิง S/N (ยังไม่ติดวอย)</span>
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                ตรวจหมายเหตุถึงช่างเตรียม ติดโลโก้ BossComputech ลง Driver ยิง S/N และกดเก็บเข้าสต๊อกรอส่ง
              </p>
            </div>
            <span className="text-xs font-semibold px-3 py-1 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30">
              {stage1Items.length} เครื่องรอเตรียม
            </span>
          </div>

          {stage1Items.length === 0 ? (
            <div className="text-center py-12 text-slate-500 border border-dashed border-white/[0.1] rounded-2xl">
              <CheckCircle className="w-10 h-10 mx-auto mb-2 text-emerald-400 opacity-60" />
              <p className="text-sm font-medium text-slate-200">ไม่มีรายการสินค้าค้างเตรียม</p>
              <p className="text-xs text-slate-500 mt-0.5">สินค้าทุกชิ้นถูกเตรียมเสร็จและเก็บเข้าสต๊อกรอปล่อยของแล้ว</p>
            </div>
          ) : (
            <div className="space-y-4">
              <ListControls
                from={stage1List.from}
                to={stage1List.to}
                total={stage1List.total}
                page={stage1List.page}
                totalPages={stage1List.totalPages}
                pageSize={stage1List.pageSize}
                sort={stage1List.sort}
                onSortChange={stage1List.setSort}
                onPageSizeChange={stage1List.setPageSize}
                onPageChange={stage1List.setPage}
                unit="งาน"
              />
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {stage1List.pageItems.map((group) => {
                  const order = orders.find(o => o.id === group.order_id);
                  const rMeta = order?.route_code ? ROUTE_DEFINITIONS[order.route_code] : null;
                  const isAccepted = group.items.every(it => !!it.assigned_prep_tech);
                  const isExpanded = !!expandedGroups[group.key];
                  const deliveryLabel = DELIVERY_MODE_LABEL[group.delivery_mode || 'install'] || 'ส่งพร้อมติดตั้ง';

                  return (
                    <div
                      key={group.key}
                      className={`p-5 rounded-2xl liquid-glass-card flex flex-col justify-between space-y-4 relative overflow-hidden border ${isAccepted ? 'border-amber-500/30' : 'border-white/[0.08]'}`}
                    >
                      {isAccepted && <div className="absolute top-0 left-0 right-0 h-1 bg-amber-500" />}

                      <div>
                        {/* Step badges */}
                        <div className="flex items-center gap-1.5 flex-wrap mb-3">
                          <StepBadge step={1} label="รอกดรับงาน" active={!isAccepted} done={isAccepted} />
                          <StepBadge step={2} label="กำลังเตรียม/ติดโลโก้" active={isAccepted} />
                          <StepBadge step={3} label="พร้อมส่ง/ติดวอย" active={false} />
                        </div>

                        {/* Top Header */}
                        <div className="flex items-center justify-between mb-2">
                          <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full border ${isAccepted ? 'bg-amber-500/15 text-amber-400 border-amber-500/30' : 'bg-white/[0.05] text-slate-400 border-white/[0.1]'}`}>
                            {isAccepted ? 'กำลังเตรียมของ' : 'รอช่างกดรับงาน'}
                          </span>
                          <span className="text-[11px] text-slate-500 font-mono data-meta">
                            บิล: {order?.bill_no || group.po_no || '-'}
                          </span>
                        </div>

                        {/* Route & Delivery Mode Badges */}
                        <div className="flex items-center gap-1.5 flex-wrap mb-2">
                          {rMeta && (
                            <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${rMeta.badgeBg} ${rMeta.badgeBorder} ${rMeta.badgeText}`}>
                              {rMeta.shortName} • {order?.district || '-'}
                            </span>
                          )}
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-blue-500/15 text-blue-300 border border-blue-500/30">
                            {deliveryLabel}
                          </span>
                        </div>

                        <div className="flex items-start justify-between gap-2 mb-1">
                          <h4 className="text-base font-bold text-white">{group.model_name}</h4>
                          {group.items.length > 1 && (
                            <span className="flex-shrink-0 px-2.5 py-1 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[11px] font-extrabold flex items-center gap-1">
                              <Layers className="w-3 h-3" />
                              จำนวน {group.items.length} เครื่อง
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-300 data-meta">ลูกค้า: <strong className="text-white font-bold">{order ? order.customer_name : '-'}</strong></p>

                        {/* Prep Note Alert from Purchasing */}
                        {group.prep_note && (
                          <div className="mt-2 p-2.5 rounded-xl bg-[#FF6B00]/10 border border-[#FF6B00]/30 text-[11px] text-[#FF6B00]">
                            <strong>หมายเหตุถึงช่าง:</strong> {group.prep_note}
                          </div>
                        )}

                        {/* Supplier & PO info */}
                        {(group.supplier || group.po_no) && (
                          <div className="mt-2 text-[11px] text-slate-400 flex justify-between data-meta">
                            <span>แหล่ง: {group.supplier || 'สต๊อกร้าน'}</span>
                            <span>PO: {group.po_no || '-'}</span>
                          </div>
                        )}

                        {/* Accepted Status */}
                        {isAccepted && (
                          <div className="mt-2 text-[10px] text-emerald-400 flex items-center gap-1">
                            <UserCheck className="w-3.5 h-3.5" />
                            <span>ผู้รับงาน: {group.items[0].assigned_prep_tech} ({new Date(group.items[0].prep_accepted_at || Date.now()).toLocaleTimeString('th-TH')})</span>
                          </div>
                        )}
                      </div>

                      {/* GATE: Accept first, or unlocked controls */}
                      <div className="space-y-3 pt-2 border-t border-white/[0.08]">
                        {!isAccepted ? (
                          <>
                            <div className="p-2.5 rounded-xl bg-white/[0.03] border border-white/[0.06] text-[11px] text-slate-400 flex items-center gap-1.5">
                              <Lock className="w-3.5 h-3.5 text-slate-500" />
                              <span>ยิง S/N / ติดโลโก้ / แปะวอย จะปลดล็อกหลังกดรับงาน</span>
                            </div>
                            <button
                              onClick={() => handleAcceptGroup(group)}
                              className="w-full py-3 bg-gradient-to-r from-[#FF6B00] to-[#E65A00] hover:from-[#FF8A24] text-black font-extrabold rounded-xl text-sm transition cursor-pointer flex items-center justify-center gap-2 shadow-lg shadow-[#FF6B00]/25 border border-white/20 active:scale-95"
                            >
                              <UserCheck className="w-4 h-4" />
                              <span>กดรับงานนี้ (Accept Job)</span>
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => toggleGroup(group.key)}
                              className="w-full py-1.5 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] text-slate-300 text-[11px] font-semibold border border-white/[0.1] transition cursor-pointer flex items-center justify-center gap-1"
                            >
                              {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                              <span>{isExpanded ? 'ซ่อนช่องกรอก S/N' : `เปิดช่องกรอก S/N (${group.items.length} เครื่อง)`}</span>
                            </button>

                            {isExpanded && (
                              <>
                                <div className="space-y-2">
                                  {group.items.map((item, idx) => renderSnRow(item, idx, 'amber'))}
                                </div>

                                <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-[10px] text-amber-300 text-center">
                                  {group.order_id
                                    ? '* เทส & ติดโลโก้เสร็จแล้ว เลือกได้ 2 ทาง: เก็บรอส่งมอบตามออเดอร์ / แปะวอยส่งออกเลย'
                                    : '* เทส & ติดโลโก้เสร็จแล้ว เก็บเข้าคลังพร้อมขาย (Stock PO ไม่ผูกออเดอร์ลูกค้า)'}
                                </div>

                                <div className="space-y-2">
                                  {!group.order_id ? (
                                    /* Unassigned Stock PO batch: only the in_stock destination */
                                    <button
                                      onClick={() => group.items.forEach(it => handleFinishToReadyStock(it.id))}
                                      className="w-full py-2.5 bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 text-black font-extrabold rounded-xl text-xs transition cursor-pointer flex items-center justify-center gap-1.5 shadow-lg shadow-sky-500/25 border border-white/20 active:scale-95"
                                    >
                                      <PackagePlus className="w-4 h-4" />
                                      <span>ติดโลโก้เสร็จ → เก็บเข้าคลังสต๊อกพร้อมขายทั้งชุด ({group.items.length})</span>
                                    </button>
                                  ) : (
                                    /* Linked to a customer Sales Order: order-fulfillment only */
                                    <>
                                      <button
                                        onClick={() => group.items.forEach(it => handleFinishStage1(it.id))}
                                        className="w-full py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 text-black font-extrabold rounded-xl text-xs transition cursor-pointer flex items-center justify-center gap-1.5 shadow-lg shadow-amber-500/25 border border-white/20 active:scale-95"
                                      >
                                        <Warehouse className="w-4 h-4" />
                                        <span>ติดโลโก้เสร็จ → เก็บเข้าสต๊อกรอวันส่งมอบทั้งชุด ({group.items.length})</span>
                                      </button>
                                      <button
                                        onClick={() => group.items.forEach(it => handleFinishAndDispatch(it.id))}
                                        className="w-full py-2.5 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 text-black font-extrabold rounded-xl text-xs transition cursor-pointer flex items-center justify-center gap-1.5 shadow-lg shadow-emerald-500/25 border border-white/20 active:scale-95"
                                      >
                                        <BadgeCheck className="w-4 h-4" />
                                        <span>ติดโลโก้ & แปะวอยพร้อมส่งออกเลยทั้งชุด ({group.items.length})</span>
                                      </button>
                                    </>
                                  )}
                                </div>
                              </>
                            )}
                          </>
                        )}
                        <LatestUpdateBadge
                          logs={group.items[0]?.activity_logs}
                          fallbackTimestamp={group.items[0]?.prepped_at || group.items[0]?.created_at}
                          fallbackActor={group.items[0]?.assigned_prep_tech}
                        />
                        <ActivityTimeline logs={group.items[0]?.activity_logs} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: จังหวะที่ 2 (เตรียมของออกไปส่ง - แปะวอยประกัน) */}
      {/* ========================================================================= */}
      {prepTab === 'stage2' && (
        <div className="liquid-glass rounded-3xl p-6 sm:p-7 shadow-2xl border border-white/[0.08]">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <div className="p-2 rounded-xl bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                  <Send className="w-5 h-5" />
                </div>
                <span>จังหวะที่ 2: คิวพร้อมส่งในสต๊อก & แปะวอยประกันปล่อยของออก</span>
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                ของที่เตรียมเสร็จแล้วพร้อมส่ง (ทั้งสายรถ 1-6 และลูกค้ารับเอง) แปะวอยประกันและระบุวันที่ปล่อยของจริง
              </p>
            </div>
            <span className="text-xs font-semibold px-3 py-1 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
              {stage2Items.length} เครื่องพร้อมปล่อยของ
            </span>
          </div>

          {/* Route Filter Pills */}
          <div className="flex items-center gap-1.5 mb-5 pb-1 overflow-x-auto text-xs">
            <span className="text-slate-400 font-medium whitespace-nowrap mr-1">แยกตามสายรถ:</span>
            <button
              onClick={() => setRouteFilter('all')}
              className={`px-3 py-1.5 rounded-xl font-semibold transition cursor-pointer whitespace-nowrap ${routeFilter === 'all'
                ? 'bg-white/20 text-white border border-white/40 shadow-sm'
                : 'bg-white/[0.04] text-slate-400 hover:text-white border border-white/[0.06]'
                }`}
            >
              ทั้งหมด ({stage2Items.length})
            </button>
            {(Object.keys(ROUTE_DEFINITIONS) as RouteCode[]).map((rCode) => {
              const r = ROUTE_DEFINITIONS[rCode];
              const count = stage2Items.filter(item => {
                const order = orders.find(o => o.id === item.order_id);
                return order?.route_code === rCode;
              }).length;

              return (
                <button
                  key={rCode}
                  onClick={() => setRouteFilter(rCode)}
                  className={`px-3 py-1.5 rounded-xl font-semibold transition cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${routeFilter === rCode
                    ? `${r.badgeBg} ${r.badgeText} ${r.badgeBorder} border shadow-md font-bold`
                    : 'bg-white/[0.04] text-slate-400 hover:text-slate-200 border border-white/[0.06]'
                    }`}
                >
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: r.color }}></span>
                  <span>{r.shortName}</span>
                  <span className="text-[10px] opacity-75">({count})</span>
                </button>
              );
            })}
          </div>

          {stage2Items.length === 0 ? (
            <div className="text-center py-12 text-slate-500 border border-dashed border-white/[0.1] rounded-2xl">
              <CheckCircle className="w-10 h-10 mx-auto mb-2 text-emerald-400 opacity-60" />
              <p className="text-sm font-medium text-slate-200">ไม่มีสินค้าค้างแปะวอยปล่อยของ</p>
              <p className="text-xs text-slate-500 mt-0.5">สินค้าทุกชิ้นถูกส่งมอบให้ทีมรถ Onsite หรือส่งมอบให้ลูกค้าเรียบร้อยแล้ว</p>
            </div>
          ) : (
            <div className="space-y-4">
              <ListControls
                from={stage2List.from}
                to={stage2List.to}
                total={stage2List.total}
                page={stage2List.page}
                totalPages={stage2List.totalPages}
                pageSize={stage2List.pageSize}
                sort={stage2List.sort}
                onSortChange={stage2List.setSort}
                onPageSizeChange={stage2List.setPageSize}
                onPageChange={stage2List.setPage}
                unit="งาน"
              />
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {stage2List.pageItems.map((group) => {
                  const order = orders.find(o => o.id === group.order_id);
                  const routeMeta = order?.route_code ? ROUTE_DEFINITIONS[order.route_code] : null;
                  const isAccepted = group.items.every(it => !!it.assigned_prep_tech);
                  const isExpanded = !!expandedGroups[group.key];
                  const deliveryLabel = DELIVERY_MODE_LABEL[group.delivery_mode || 'install'] || 'ส่งพร้อมติดตั้ง';

                  return (
                    <div
                      key={group.key}
                      className="p-5 rounded-2xl liquid-glass-card flex flex-col justify-between space-y-4 relative overflow-hidden border-emerald-500/30"
                    >
                      <div className="absolute top-0 left-0 right-0 h-1 bg-emerald-500" />

                      <div>
                        {/* Step badges */}
                        <div className="flex items-center gap-1.5 flex-wrap mb-3">
                          <StepBadge step={1} label="รอกดรับงาน" active={false} done />
                          <StepBadge step={2} label="กำลังเตรียม/ติดโลโก้" active={false} done />
                          <StepBadge step={3} label="พร้อมส่ง/ติดวอย" active={isAccepted} />
                        </div>

                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                            พร้อมส่งในสต๊อก (รอแปะวอย)
                          </span>
                          {group.items.length > 1 && (
                            <span className="px-2.5 py-1 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[11px] font-extrabold flex items-center gap-1">
                              <Layers className="w-3 h-3" />
                              จำนวน {group.items.length} เครื่อง
                            </span>
                          )}
                        </div>

                        {/* Route & Delivery Mode */}
                        <div className="flex items-center gap-1.5 flex-wrap mb-2">
                          {routeMeta && (
                            <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${routeMeta.badgeBg} ${routeMeta.badgeBorder} ${routeMeta.badgeText}`}>
                              {routeMeta.shortName} • {order?.district || ''}
                            </span>
                          )}
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-blue-500/15 text-blue-300 border border-blue-500/30">
                            {deliveryLabel}
                          </span>
                        </div>

                        <h4 className="text-base font-bold text-white mb-1">{group.model_name}</h4>
                        <p className="text-xs text-slate-300 font-medium data-meta">ลูกค้า: <strong className="text-white font-bold">{order ? order.customer_name : '-'}</strong></p>
                        <p className="text-xs text-slate-500 mt-1 flex items-start gap-1 data-meta">
                          <MapPin className="w-3.5 h-3.5 text-slate-400 flex-shrink-0 mt-0.5" />
                          <span className="line-clamp-2">
                            {order ? `${order.delivery_location}` : '-'}
                          </span>
                        </p>
                      </div>

                      {/* GATE: Accept first, or unlocked controls */}
                      <div className="pt-3 border-t border-white/[0.08] space-y-3">
                        {!isAccepted ? (
                          <>
                            <div className="p-2.5 rounded-xl bg-white/[0.03] border border-white/[0.06] text-[11px] text-slate-400 flex items-center gap-1.5">
                              <Lock className="w-3.5 h-3.5 text-slate-500" />
                              <span>กดรับงานก่อนจึงจะแปะวอยปล่อยของได้</span>
                            </div>
                            <button
                              onClick={() => handleAcceptGroup(group)}
                              className="w-full py-3 bg-gradient-to-r from-[#FF6B00] to-[#E65A00] hover:from-[#FF8A24] text-black font-extrabold rounded-xl text-sm transition cursor-pointer flex items-center justify-center gap-2 shadow-lg shadow-[#FF6B00]/25 border border-white/20 active:scale-95"
                            >
                              <UserCheck className="w-4 h-4" />
                              <span>กดรับงานนี้ (Accept Job)</span>
                            </button>
                          </>
                        ) : (
                          <>
                            <div className="text-[10px] text-emerald-400 flex items-center gap-1">
                              <UserCheck className="w-3.5 h-3.5" />
                              <span>ผู้รับงาน: {group.items[0].assigned_prep_tech}</span>
                            </div>

                            <button
                              type="button"
                              onClick={() => toggleGroup(group.key)}
                              className="w-full py-1.5 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] text-slate-300 text-[11px] font-semibold border border-white/[0.1] transition cursor-pointer flex items-center justify-center gap-1"
                            >
                              {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                              <span>{isExpanded ? 'ซ่อนรายการ S/N' : `เปิดรายการ S/N (${group.items.length} เครื่อง)`}</span>
                            </button>

                            {isExpanded && (
                              <>
                                <div className="space-y-2">
                                  {group.items.map((item, idx) => (
                                    <div key={item.id} className="p-2.5 rounded-xl bg-white/[0.03] border border-white/[0.06] space-y-2">
                                      <div className="flex items-center justify-between">
                                        <span className="text-[10px] font-bold text-slate-400">#{idx + 1}</span>
                                        <span className="text-[11px] font-mono font-bold text-[#FF6B00]">S/N: {item.serial_number || '-'}</span>
                                      </div>
                                      <input
                                        type="date"
                                        value={voidDateInputs[item.id] || todayStr}
                                        onChange={(e) => setVoidDateInputs({ ...voidDateInputs, [item.id]: e.target.value })}
                                        className="w-full liquid-glass-input rounded-xl px-3 py-2 text-xs font-mono text-white focus:outline-none"
                                      />
                                    </div>
                                  ))}
                                </div>

                                <button
                                  onClick={() => group.items.forEach(it => handleDispatchStage2(it.id, it.serial_number))}
                                  className="w-full py-2.5 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 text-black font-extrabold rounded-xl text-xs transition cursor-pointer flex items-center justify-center gap-1.5 shadow-lg shadow-emerald-500/25 border border-white/20 active:scale-95"
                                >
                                  <BadgeCheck className="w-4 h-4" />
                                  <span>แปะวอย & ปล่อยของออกทั้งชุด ({group.items.length})</span>
                                </button>
                              </>
                            )}
                          </>
                        )}
                        <LatestUpdateBadge
                          logs={group.items[0]?.activity_logs}
                          fallbackTimestamp={group.items[0]?.prepped_at || group.items[0]?.created_at}
                          fallbackActor={group.items[0]?.assigned_prep_tech}
                        />
                        <ActivityTimeline logs={group.items[0]?.activity_logs} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: สต๊อกเครื่องประกอบสำเร็จในคลัง */}
      {/* ========================================================================= */}
      {prepTab === 'stock' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="liquid-glass rounded-3xl p-6 shadow-2xl border border-white/[0.08]">
            <h3 className="text-sm font-bold text-white mb-1 flex items-center gap-2">
              <Warehouse className="w-4 h-4 text-[#FF6B00]" />
              เตรียมเครื่องเข้าสต๊อกสินค้า (Stock Inbound)
            </h3>
            <p className="text-xs text-slate-400 mb-4">ประกอบ เทสระบบ ติดโลโก้ BossComputech เก็บเข้าคลังพร้อมขาย (ยังไม่ติดวอย)</p>

            <form onSubmit={handlePrepInbound} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-300 font-medium mb-1">รุ่นสินค้า *</label>
                <input
                  type="text"
                  value={inboundModel}
                  onChange={(e) => setInboundModel(e.target.value)}
                  className="w-full liquid-glass-input rounded-2xl px-3.5 py-2 text-white focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Serial Number (S/N) *</label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={inboundSn}
                    onChange={(e) => setInboundSn(e.target.value)}
                    className="flex-1 liquid-glass-input rounded-2xl px-3.5 py-2 text-white font-mono focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setScanTarget('inbound')}
                    title="สแกนด้วยกล้อง"
                    className="flex items-center gap-1.5 px-3 py-2 rounded-2xl bg-[#FF6B00]/15 text-[#FF6B00] border border-[#FF6B00]/30 hover:bg-[#FF6B00]/25 transition cursor-pointer text-[11px] font-bold flex-shrink-0"
                  >
                    <Camera className="w-4 h-4" />
                    <span>สแกน</span>
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">หมายเหตุ</label>
                <input
                  type="text"
                  value={inboundNotes}
                  onChange={(e) => setInboundNotes(e.target.value)}
                  className="w-full liquid-glass-input rounded-2xl px-3.5 py-2 text-white focus:outline-none"
                />
              </div>

              <button
                type="submit"
                className="w-full py-2.5 bg-gradient-to-r from-[#FF6B00] to-[#E65A00] hover:from-[#FF8A24] text-black font-extrabold rounded-2xl text-xs transition cursor-pointer flex items-center justify-center gap-1.5 shadow-xl shadow-[#FF6B00]/25 border border-white/20"
              >
                <Plus className="w-4 h-4" />
                <span>บันทึกเครื่องเข้าสต๊อก</span>
              </button>
            </form>
          </div>

          <div className="lg:col-span-2 liquid-glass rounded-3xl p-6 shadow-2xl border border-white/[0.08]">
            <h3 className="text-sm font-bold text-white mb-4 flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Warehouse className="w-4 h-4 text-emerald-400" />
                <span>รายการเครื่องพร้อมขายในคลังสต๊อก</span>
              </span>
              <span className="text-xs text-slate-400">{generalStockItems.length} เครื่อง</span>
            </h3>

            <ListControls
              from={generalStockList.from}
              to={generalStockList.to}
              total={generalStockList.total}
              page={generalStockList.page}
              totalPages={generalStockList.totalPages}
              pageSize={generalStockList.pageSize}
              sort={generalStockList.sort}
              onSortChange={generalStockList.setSort}
              onPageSizeChange={generalStockList.setPageSize}
              onPageChange={generalStockList.setPage}
              unit="เครื่อง"
              className="mb-3"
            />

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-white/[0.04] text-slate-400 border-b border-white/[0.06]">
                  <tr>
                    <th className="py-2.5 px-3">S/N</th>
                    <th className="py-2.5 px-3">รุ่นสินค้า</th>
                    <th className="py-2.5 px-3">หมายเหตุ</th>
                    <th className="py-2.5 px-3">เวลาที่เก็บเข้า</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04]">
                  {generalStockList.pageItems.map((item) => (
                    <tr key={item.id} className="hover:bg-white/[0.02]">
                      <td className="py-3 px-3 font-mono font-extrabold text-[#FF6B00] text-sm data-key">{item.serial_number}</td>
                      <td className="py-3 px-3 text-white font-bold text-base">{item.model_name}</td>
                      <td className="py-3 px-3 text-slate-400 data-meta">{item.notes || '-'}</td>
                      <td className="py-3 px-3 text-slate-500 font-mono text-[11px] data-meta">
                        {item.prepped_at ? new Date(item.prepped_at).toLocaleDateString('th-TH') : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Reusable camera barcode/QR scanner */}
      <BarcodeScannerModal
        open={scanTarget !== null}
        onClose={() => setScanTarget(null)}
        onScan={(value) => {
          const clean = value.trim();
          if (!clean) return;
          if (scanTarget === 'inbound') {
            setInboundSn(clean);
          } else if (scanTarget) {
            setSnInputs((prev) => ({ ...prev, [scanTarget]: clean }));
          }
        }}
      />
    </div>
  );
};
