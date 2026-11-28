import { useDepartmentReadOnly } from '../context/DepartmentAccess';
import { ModalBackdrop } from './ui/ModalBackdrop';
import { ProductCatalogModal } from './ProductCatalogModal';
import { PurchasingActionConfirmation, type PurchasingActionSummary } from './PurchasingActionConfirmation';
import { NumberInput } from './ui/FormInputs';
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useApp } from '../context/AppContext';
import {
  Boxes, PackagePlus, CheckCircle,
  ShoppingCart, Clock, AlertTriangle, Truck, Send, Check,
  ShieldCheck, FileCheck, Layers, Lock, X, Warehouse,
  Timer, ChevronRight, ClipboardList, PackageSearch,
  Search, Trash2, Plus, History, Hash, Camera, Printer
} from 'lucide-react';
import { ROUTE_DEFINITIONS, Order, Item, ProductCategory, PRODUCT_CATEGORY_LABELS, Product, StockPO, Project, formatThaiDateTime, formatDateDMY, getLocalDateStr, getStockPoDocument, getStockPoReceipt } from '../types';
import { ListControls, useListControls } from './ListControls';
import { ActivityTimeline } from './ActivityTimeline';
import { EvidencePhotoUploader } from './EvidencePhotoUploader';
import { ToastBanner } from './ui/ToastBanner';
import { OrderFormPrintModal } from './OrderFormPrintModal';
import { StockPurchaseOrderPrintModal } from './StockPurchaseOrderPrintModal';
import { isNonPrepCableOrConsumable, isServiceItem, newUuid } from '../utils/domainHelpers';

const DOA_WARRANTY_DAYS = 7;

// คำนวณวันคงเหลือของประกัน DOA 7 วัน (นับจากวันที่รับของเข้าห้องสต๊อก)
const getDoaDaysLeft = (receivedAt?: string | null): number => {
  if (!receivedAt) return DOA_WARRANTY_DAYS;
  const start = new Date(receivedAt).getTime();
  const elapsedDays = Math.floor((Date.now() - start) / (1000 * 60 * 60 * 24));
  return Math.max(0, DOA_WARRANTY_DAYS - elapsedDays);
};

// คำนวณจำนวนวันที่ผ่านไปตั้งแต่ส่งเคลม (ใช้แสดง live elapsed days)
const getElapsedDays = (dateStr?: string | null): number => {
  if (!dateStr) return 0;
  const start = new Date(dateStr).getTime();
  if (isNaN(start)) return 0;
  return Math.max(0, Math.floor((Date.now() - start) / (1000 * 60 * 60 * 24)));
};

const SUPPLIER_PRESETS = [
  'สต๊อกร้าน (Main Store)',
  'SIS Distribution',
  'Synnex (Thailand)',
  'Abshop',
  'PKT Computer & Supply',
  'Ingram Micro',
  'Advice Wholesale'
];

const fmt = (n: number): string => (n || 0).toLocaleString('th-TH');

export const PurchasingStockView: React.FC = () => {
  const {
    orders, items, cutStock, updateOrderPOStatus, receivePOIntoStock, updateOrderCosts,
    stockPOs, createStockPO, receiveStockPOToStorage,
    sendRawStockToPrep, products,
    markDoaSentToSupplier, receiveDoaReplacement,
    projects, releaseProjectBatch, removeProjectItem, updateProjectMaterialRequestStatus,
    cutStockForSiteVisit
  } = useApp();
  const readOnly = useDepartmentReadOnly();
  const [billInputs, setBillInputs] = useState<Record<string, string>>({});
  const [supplierInputs, setSupplierInputs] = useState<Record<string, string>>({});
  const [poInputs, setPoInputs] = useState<Record<string, string>>({});
  const [prepNoteInputs, setPrepNoteInputs] = useState<Record<string, string>>({});
  // จำนวนเครื่องที่ต้องการส่งช่างเทสต่อ batch (key = batch key) - default 1
  const [batchSendQty, setBatchSendQty] = useState<Record<string, number>>({});
  // เลือกดึงจากสต๊อกคลัง (in_stock) แทนการสร้างใหม่ - key = `${orderId}:${itemIndex}`
  const [stockPickInputs, setStockPickInputs] = useState<Record<string, string>>({});
  // ราคาทุนต่อหน่วย (INTERNAL ONLY) - key = `${orderId}:${itemIndex}`
  const [costInputs, setCostInputs] = useState<Record<string, number>>({});
  // ต้นทุนค่าแรง/ค่าดำเนินการอื่นต่อออเดอร์ (INTERNAL ONLY)
  const [extraCostInputs, setExtraCostInputs] = useState<Record<string, number>>({});
  const [activeTab, setActiveTab] = useState<'all' | 'case_a' | 'case_b' | 'case_c'>('all');
  const [toast, setToast] = useState('');
  // แท็บหลัก 5 แท็บ: ออเดอร์รอดำเนินการ / งานโปรเจกต์ PRJ / รอรับของ PO / คลังสต๊อกพร้อมขาย / เคลมของเสีย DOA
  const [mainTab, setMainTab] = useState<'incoming' | 'projects' | 'po_tracking' | 'inventory' | 'doa_claims'>('incoming');
  // ตัวกรองสถานะ DOA
  const [doaStageFilter, setDoaStageFilter] = useState<'all' | 'doa_reported' | 'doa_sent_supplier' | 'doa_replaced'>('all');
  // ตัวกรองหมวดหมู่ของรายการสต๊อกคงเหลือ (Inventory List)
  const [stockCategoryFilter, setStockCategoryFilter] = useState<'all' | ProductCategory | 'cables_consumables'>('all');

  // ---- Proactive Stock Replenishment (Stock PO) ----
  // รายการสินค้าใน Stock PO (ดึงจากแคตตาล็อกกลางที่ฝ่ายขายบันทึกไว้เท่านั้น)
  type StockPoLine = {
    product_id: string;
    product_name: string;
    category: ProductCategory;
    qty: number;
    unit_cost: number;
  };
  const [isStockPoModalOpen, setIsStockPoModalOpen] = useState(false);
  const [isSavingStockPo, setIsSavingStockPo] = useState(false);
  const [stockPoError, setStockPoError] = useState('');
  const [stockPoSearch, setStockPoSearch] = useState('');
  const [stockPoLines, setStockPoLines] = useState<StockPoLine[]>([]);
  const [stockPoSourceOrderId, setStockPoSourceOrderId] = useState<string | null>(null);
  const [stockPoSourceProjectId, setStockPoSourceProjectId] = useState<string | null>(null);

  // ---- Project & Site Installation (PRJ-...) Action Modal State ----
  const [actionProjectId, setActionProjectId] = useState<string | null>(null);
  const [batchReleaseQtyMap, setBatchReleaseQtyMap] = useState<Record<string, number>>({});
  const [batchReleaseNote, setBatchReleaseNote] = useState('');
  const [isReleasingProjectStock, setIsReleasingProjectStock] = useState(false);
  const releasingProjectStock = useRef(false);
  const actionProject = useMemo(
    () => (actionProjectId ? projects.find(p => p.id === actionProjectId) || null : null),
    [projects, actionProjectId]
  );
  const [stockPoMeta, setStockPoMeta] = useState(() => ({
    supplier: '',
    supplierQuote: '',
    notes: ''
  }));

  // ---- Catalog Multi-Select Modal (อ่านจาก Product Catalog กลางของฝ่ายขาย) ----
  const [isPoCatalogModalOpen, setIsPoCatalogModalOpen] = useState(false);
  // mapping productId -> { qty, unit_cost }
  const [poCatalogPicks, setPoCatalogPicks] = useState<Record<string, { qty: number; unit_cost: number }>>({});

  // ---- Compact Card-to-Modal: modal state ----
  // Stock Action Modal (ออเดอร์รอดำเนินการ)
  const [actionOrder, setActionOrder] = useState<Order | null>(null);
  // Batch Detail Modal (ห้องสต๊อก DOA)
  const [batchDetail, setBatchDetail] = useState<{ key: string; model_name: string; po_no: string; supplier: string; received_at: string | null; itemIds: string[]; serials: string[] } | null>(null);
  // Inventory Detail Modal (คลังสินค้าคงเหลือ)
  const [inventoryDetail, setInventoryDetail] = useState<{ key: string; model_name: string; category: ProductCategory; rawCount: number; readyCount: number; serials: string[]; qty: number } | null>(null);
  // Stock PO Detail Modal (ติดตาม PO)
  const [poDetail, setPoDetail] = useState<StockPO | null>(null);
  const [receiptDeliveryNote, setReceiptDeliveryNote] = useState('');
  const [receiptTaxInvoice, setReceiptTaxInvoice] = useState('');
  const [confirmation, setConfirmation] = useState<(PurchasingActionSummary & (
    | { kind: 'receive'; poId: string; receipt: NonNullable<Parameters<typeof receiveStockPOToStorage>[1]> }
    | { kind: 'send'; order: Order; billNo: string; itemsToCut: Parameters<typeof cutStock>[2] }
  )) | null>(null);
  const [confirmationBusy, setConfirmationBusy] = useState(false);
  const [confirmationError, setConfirmationError] = useState('');
  const confirmationInFlight = useRef(false);
  const poDocument = poDetail ? getStockPoDocument(poDetail) : undefined;
  const poReceipt = poDetail ? getStockPoReceipt(poDetail) : undefined;
  const sourceOrder = orders.find(order => order.id === stockPoSourceOrderId);
  const purchaseSourceLabel = stockPoSourceProjectId
    ? `โปรเจกต์ ${stockPoSourceProjectId}`
    : sourceOrder ? `บิลขาย ${sourceOrder.sales_ref || sourceOrder.id}` : 'ซื้อเข้าสต๊อก';

  const openPoDetail = (po: StockPO) => {
    setReceiptDeliveryNote('');
    setReceiptTaxInvoice('');
    setPoDetail(po);
  };

  const closeStockPoForm = () => {
    if (isSavingStockPo) return;
    setStockPoError('');
    setIsStockPoModalOpen(false);
  };
  const [printStockPo, setPrintStockPo] = useState<StockPO | null>(null);
  const [printProjectTarget, setPrintProjectTarget] = useState<{ project: Project; batchNo?: number | null } | null>(null);
  // DOA Claim Tracking Modal
  const [doaClaimItem, setDoaClaimItem] = useState<Item | null>(null);
  const [doaRmaInput, setDoaRmaInput] = useState('');
  const [doaSentDateInput, setDoaSentDateInput] = useState(() => new Date().toISOString().split('T')[0]);
  const [doaNotesInput, setDoaNotesInput] = useState('');
  const [doaSendDirectToPrep, setDoaSendDirectToPrep] = useState(false);
  // Search filters for compact card lists
  const [incomingSearch, setIncomingSearch] = useState('');
  const [inventorySearch, setInventorySearch] = useState('');

  // Lock background scroll while any modal is open
  const anyModalOpen = !!confirmation || isStockPoModalOpen || isPoCatalogModalOpen || !!actionOrder || !!actionProject || !!batchDetail || !!inventoryDetail || !!poDetail || !!doaClaimItem || !!printStockPo;
  useEffect(() => {
    if (!anyModalOpen) return;
    const htmlEl = document.documentElement;
    const bodyEl = document.body;
    const mainEl = document.querySelector('main');
    const prevHtmlOverflow = htmlEl.style.overflow;
    const prevBodyOverflow = bodyEl.style.overflow;
    const prevMainOverflow = mainEl ? mainEl.style.overflow : '';
    htmlEl.style.overflow = 'hidden';
    bodyEl.style.overflow = 'hidden';
    if (mainEl) mainEl.style.overflow = 'hidden';
    return () => {
      htmlEl.style.overflow = prevHtmlOverflow;
      bodyEl.style.overflow = prevBodyOverflow;
      if (mainEl) mainEl.style.overflow = prevMainOverflow;
    };
  }, [anyModalOpen]);

  const openStockPoModal = () => {
    setStockPoSourceOrderId(null);
    setStockPoSourceProjectId(null);
    setStockPoLines([]);
    setStockPoMeta({
      supplier: '',
      supplierQuote: '',
      notes: ''
    });
    setIsStockPoModalOpen(true);
  };

  // เปิด Create Stock PO Modal พร้อม pre-fill รายการสินค้าที่ขาดจากออเดอร์ (Case A)
  const openStockPoFromOrder = (order: Order) => {
    const { stockStatus } = getOrderPrepReadiness(order);
    const missingLines: StockPoLine[] = stockStatus.shortageItems.map((row, idx) => {
      const normalized = row.model_name.trim().toLowerCase();
      const catProduct = products.find(p => p.name.trim().toLowerCase() === normalized);
      return {
        product_id: catProduct ? catProduct.id : `shortage-${order.id}-${idx}`,
        product_name: catProduct ? catProduct.name : row.model_name,
        category: catProduct ? catProduct.category : 'general',
        qty: row.shortage,
        unit_cost: row.unit_cost && row.unit_cost > 0 ? row.unit_cost : (catProduct ? Math.max(0, catProduct.cost_price) : 0)
      };
    });
    setStockPoSourceOrderId(order.id);
    setStockPoSourceProjectId(null);
    setStockPoLines(missingLines);
    setStockPoMeta({
      supplier: supplierInputs[order.id] || order.items_list?.[0]?.supplier || '',
      supplierQuote: '',
      notes: ''
    });
    setActionOrder(null);
    setIsStockPoModalOpen(true);
  };

  // ---- Project & Site Installation (PRJ-...) Stock Readiness & Actions ----
  const getProjectStockStatus = (project: Project) => {
    let totalShortage = 0;
    const rows = (project.items || []).map(it => {
      const remainingToAllocate = Math.max(0, (it.qty_required || 0) - (it.qty_allocated || 0));
      const isLabor = /ค่าบริการ|ค่าแรง/.test(it.model_name);
      const available = isLabor ? 0 : getAvailableStock(it.model_name);
      const shortage = isLabor ? 0 : Math.max(0, remainingToAllocate - available);
      const releasableNow = isLabor ? 0 : Math.min(remainingToAllocate, available);
      totalShortage += shortage;
      return {
        item: it,
        remainingToAllocate,
        available,
        shortage,
        releasableNow,
        isLabor,
        sufficient: shortage === 0
      };
    });
    const physicalRows = rows.filter(r => !r.isLabor);
    const allPhysicalAllocated = physicalRows.length > 0 && physicalRows.every(r => r.remainingToAllocate === 0);
    const shortageItems = rows.filter(r => r.shortage > 0);
    const totalReleasableNow = rows.reduce((s, r) => s + r.releasableNow, 0);
    const linkedPOs = stockPOs.filter(po => po.project_id === project.id);
    const orderedLinkedPOs = linkedPOs.filter(po => po.status === 'ordered');
    const pendingFieldRequests = (project.material_requests || []).filter(r => r.status === 'pending');
    return {
      rows,
      physicalRows,
      allPhysicalAllocated,
      shortageItems,
      shortageItemCount: shortageItems.length,
      totalShortage,
      totalReleasableNow,
      hasReleasableStock: totalReleasableNow > 0,
      allSufficient: shortageItems.length === 0,
      linkedPOs,
      orderedLinkedPOs,
      pendingFieldRequests
    };
  };

  const openProjectActionModal = (project: Project) => {
    const status = getProjectStockStatus(project);
    const initialMap: Record<string, number> = {};
    status.rows.forEach(r => {
      initialMap[r.item.id] = r.releasableNow;
    });
    setBatchReleaseQtyMap(initialMap);
    setBatchReleaseNote('');
    setActionProjectId(project.id);
  };

  const openStockPoFromProject = (project: Project) => {
    const status = getProjectStockStatus(project);
    const missingLines: StockPoLine[] = status.shortageItems.map((row, idx) => {
      const normalized = row.item.model_name.trim().toLowerCase();
      const catProduct = products.find(p => p.name.trim().toLowerCase() === normalized);
      return {
        product_id: catProduct ? catProduct.id : `prj-shortage-${project.id}-${idx}`,
        product_name: catProduct ? catProduct.name : row.item.model_name,
        category: catProduct ? catProduct.category : 'cctv_network',
        qty: row.shortage,
        unit_cost: row.item.unit_cost > 0 ? row.item.unit_cost : (catProduct ? Math.max(0, catProduct.cost_price) : 0)
      };
    });
    setStockPoSourceOrderId(null);
    setStockPoSourceProjectId(project.id);
    setStockPoLines(missingLines);
    setStockPoMeta({
      supplier: '',
      supplierQuote: '',
      notes: ''
    });
    setActionProjectId(null);
    setIsStockPoModalOpen(true);
  };

  const runProjectStockAction = async (action: () => Promise<string>) => {
    if (releasingProjectStock.current) return;
    releasingProjectStock.current = true;
    setIsReleasingProjectStock(true);
    try {
      setToast(await action());
    } catch {
      setToast('บันทึกการเบิกไม่สำเร็จ กรุณาโหลดข้อมูลล่าสุดและตรวจสอบยอดก่อนลองอีกครั้ง');
    } finally {
      releasingProjectStock.current = false;
      setIsReleasingProjectStock(false);
      setTimeout(() => setToast(''), 5000);
    }
  };

  const handleReleaseProjectBatchSubmit = (project: Project) => {
    const itemsToRelease = (project.items || [])
      .map(it => ({
        project_item_id: it.id,
        qty: Math.max(0, Math.min(it.qty_required - it.qty_allocated, batchReleaseQtyMap[it.id] || 0))
      }))
      .filter(r => r.qty > 0);

    if (itemsToRelease.length === 0) {
      alert('กรุณาระบุจำนวนสินค้า/วัสดุที่ต้องการปล่อยของออกเป็นงวดเบิกอย่างน้อย 1 รายการ');
      return;
    }

    void runProjectStockAction(async () => {
      const res = await releaseProjectBatch(project.id, {
        items: itemsToRelease,
        note: batchReleaseNote.trim() || undefined
      });
      if (!res) return 'ไม่มีสินค้าในคลังที่เบิกได้ กรุณาตรวจสอบรายการและยอดคงเหลือ';
      const totalRequested = itemsToRelease.reduce((sum, item) => sum + item.qty, 0);
      const released = res.equipmentCount + res.consumableCount;
      setActionProjectId(null);
      return `ปล่อยของ ${project.id} งวด ${res.batchNo} ได้ ${released}/${totalRequested} หน่วย (ส่ง Prep ${res.equipmentCount} | ส่ง Onsite ${res.consumableCount})`;
    });
  };

  // จำนวนคงเหลือในสต๊อกต่อชื่อสินค้า (normalize ชื่อ) - ใช้แสดงในตัวเลือกแคตตาล็อก
  const stockCountByName = useMemo(() => {
    const map: Record<string, number> = {};
    items.forEach(it => {
      const key = (it.model_name || '').trim().toLowerCase();
      if (!key) return;
      if (it.status === 'raw_stock' || it.status === 'in_stock') {
        map[key] = (map[key] || 0) + 1;
      }
    });
    return map;
  }, [items]);

  const openPoCatalogModal = () => {
    // prefill จากรายการที่เลือกไว้แล้วใน Stock PO
    const prefill: Record<string, { qty: number; unit_cost: number }> = {};
    stockPoLines.forEach(l => {
      prefill[l.product_id] = { qty: l.qty, unit_cost: l.unit_cost };
    });
    setPoCatalogPicks(prefill);
    setIsPoCatalogModalOpen(true);
  };

  const togglePoCatalogPick = (product: Product) => {
    setPoCatalogPicks(prev => {
      const copy = { ...prev };
      if (copy[product.id]) {
        delete copy[product.id];
      } else {
        copy[product.id] = { qty: 1, unit_cost: Math.max(0, product.cost_price) };
      }
      return copy;
    });
  };

  const updatePoCatalogPick = (productId: string, patch: Partial<{ qty: number; unit_cost: number }>) => {
    setPoCatalogPicks(prev => {
      const current = prev[productId];
      if (!current) return prev;
      return {
        ...prev,
        [productId]: {
          qty: patch.qty !== undefined ? Math.max(1, patch.qty) : current.qty,
          unit_cost: patch.unit_cost !== undefined ? Math.max(0, patch.unit_cost) : current.unit_cost
        }
      };
    });
  };

  const handleConfirmPoCatalogSelection = () => {
    const pickedIds = Object.keys(poCatalogPicks);
    if (pickedIds.length === 0) {
      alert('กรุณาติ๊กเลือกสินค้าจากแคตตาล็อกอย่างน้อย 1 รายการ');
      return;
    }
    const lines: StockPoLine[] = [];
    pickedIds.forEach(id => {
      const catItem = products.find(p => p.id === id);
      if (!catItem) return;
      const pick = poCatalogPicks[id];
      lines.push({
        product_id: catItem.id,
        product_name: catItem.name,
        category: catItem.category,
        qty: Math.max(1, pick.qty),
        unit_cost: Math.max(0, pick.unit_cost)
      });
    });
    setStockPoLines(lines);
    setIsPoCatalogModalOpen(false);
  };

  const handleUpdateStockPoLine = (productId: string, patch: Partial<Pick<StockPoLine, 'qty' | 'unit_cost'>>) => {
    setStockPoLines(prev => prev.map(l => l.product_id === productId
      ? {
        ...l,
        qty: patch.qty !== undefined ? Math.max(1, patch.qty) : l.qty,
        unit_cost: patch.unit_cost !== undefined ? Math.max(0, patch.unit_cost) : l.unit_cost
      }
      : l));
  };

  const handleRemoveStockPoLine = (productId: string) => {
    setStockPoLines(prev => prev.filter(l => l.product_id !== productId));
  };

  const handleSubmitStockPo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSavingStockPo || !stockPoMeta.supplier || stockPoLines.length === 0) return;
    const documentId = newUuid();
    const basePoNumber = `PO-${new Date().getFullYear()}-${documentId.replace(/-/g, '').slice(0, 12).toUpperCase()}`;
    const source = stockPoSourceProjectId
      ? { kind: 'project' as const, reference: stockPoSourceProjectId }
      : sourceOrder ? { kind: 'sales' as const, reference: sourceOrder.sales_ref || sourceOrder.id }
      : { kind: 'stock' as const };
    // สร้าง Stock PO 1 ใบต่อ 1 รายการสินค้า (อ้างอิง product_id + ชื่อตรงกับแคตตาล็อกกลาง 100%)
    setIsSavingStockPo(true);
    setStockPoError('');
    try {
      await createStockPO(stockPoLines.map((line, idx) => ({
        product_name: line.product_name,
        category: line.category,
        qty: Math.max(1, line.qty),
        unit_cost: Math.max(0, line.unit_cost),
        supplier: stockPoMeta.supplier,
        po_number: stockPoLines.length > 1 ? `${basePoNumber}-${idx + 1}` : basePoNumber,
        notes: stockPoMeta.notes.trim() || null,
        project_id: stockPoSourceProjectId || null
      })), {
        id: documentId,
        number: basePoNumber,
        supplierQuote: stockPoMeta.supplierQuote.trim() || undefined,
        source,
      });
    } catch {
      setStockPoError('บันทึกใบสั่งซื้อไม่สำเร็จ กรุณาลองอีกครั้ง');
      return;
    } finally {
      setIsSavingStockPo(false);
    }
    if (stockPoSourceOrderId) {
      updateOrderPOStatus(stockPoSourceOrderId, 'waiting_po', stockPoMeta.supplier, basePoNumber);
      setStockPoSourceOrderId(null);
    }
    if (stockPoSourceProjectId) {
      setStockPoSourceProjectId(null);
    }
    const totalQty = stockPoLines.reduce((sum, l) => sum + Math.max(1, l.qty), 0);
    setIsStockPoModalOpen(false);
    setStockPoSearch('');
    setMainTab('po_tracking');
    setToast(`เปิดใบ ${basePoNumber} (${stockPoLines.length} รายการ รวม ${totalQty} ชิ้น) เรียบร้อย -> รอของเข้าคลัง`);
    setTimeout(() => setToast(''), 4000);
  };

  const reviewReceiveStockPo = (po: StockPO) => {
    const receipt = {
      deliveryNote: receiptDeliveryNote.trim() || undefined,
      taxInvoice: receiptTaxInvoice.trim() || undefined,
    };
    const source = getStockPoDocument(po)?.source;
    setConfirmationError('');
    setConfirmation({
      kind: 'receive',
      poId: po.id,
      receipt,
      title: 'ตรวจสอบก่อนรับของเข้า PO',
      description: 'ตรวจรุ่น จำนวน และเอกสารให้ตรงกับของที่ได้รับ เมื่อยืนยัน ระบบจะบันทึกรับสินค้าเข้าคลัง',
      confirmLabel: 'ยืนยันรับเข้าคลัง',
      details: [
        { label: 'เลขที่ PO', value: po.po_number },
        { label: 'ผู้ขาย', value: po.supplier || '—' },
        ...(source?.kind === 'sales' ? [{ label: 'อ้างอิงบิลขาย', value: source.reference }] : []),
        { label: 'เลขใบส่งของ', value: receipt.deliveryNote || 'ยังไม่ระบุ' },
        { label: 'เลขใบกำกับภาษี', value: receipt.taxInvoice || 'ยังไม่ระบุ' },
      ],
      lines: [{ name: po.product_name, quantity: po.qty }],
    });
  };

  const handleSendRawToPrep = (itemId: string, modelName: string) => {
    sendRawStockToPrep(itemId);
    setToast(`ส่ง "${modelName}" ให้ช่างเทส & ติดโลโก้แล้ว -> เข้าคิว Stage A (เตรียมเข้าคลังพร้อมขาย)`);
    setTimeout(() => setToast(''), 4500);
  };

  // ส่งหลายเครื่องจาก batch เดียวกันเข้าช่างเทส & ติดโลโก้ (Stage A)
  const handleSendBatchToPrep = (batchKey: string, modelName: string, itemIds: string[], qty: number) => {
    const toSend = itemIds.slice(0, Math.max(1, Math.min(qty, itemIds.length)));
    toSend.forEach(id => sendRawStockToPrep(id));
    setBatchSendQty(prev => ({ ...prev, [batchKey]: 1 }));
    setToast(`ส่ง "${modelName}" ${toSend.length} เครื่อง ให้ช่างเทส & ติดโลโก้แล้ว -> เข้าคิว Stage A (เตรียมเข้าคลังพร้อมขาย)`);
    setTimeout(() => setToast(''), 4500);
  };

  // ---- Smart Stock Auto-Detection ----
  // นับจำนวนเครื่องที่มีในสต๊อก (raw_stock + in_stock) ที่ชื่อรุ่นตรงกัน (normalize แล้ว)
  const getAvailableStock = (modelName: string): number => {
    const normalized = (modelName || '').trim().toLowerCase();
    if (!normalized) return 0;
    return items.filter(
      s => (s.status === 'raw_stock' || s.status === 'in_stock')
        && (s.model_name || '').trim().toLowerCase() === normalized
    ).length;
  };

  // ตรวจสอบความพร้อมของสต๊อกทั้งออเดอร์ (เฉพาะรายการอุปกรณ์ ไม่นับบริการ/ค่าแรง)
  const getOrderStockStatus = (order: Order) => {
    const equipmentItems = order.items_list && order.items_list.length > 0
      ? order.items_list.filter(it => !isServiceItem(it.model_name, it.item_type, products))
      : [{ model_name: order._planned_model || 'BossComputech Workstation', quantity: order._planned_quantity || 1, item_type: 'hardware' as const, unit_cost: 0 }];

    let totalShortage = 0;
    const rows = equipmentItems.map(it => {
      const available = getAvailableStock(it.model_name);
      const ordered = it.quantity || 1;
      const shortage = Math.max(0, ordered - available);
      totalShortage += shortage;
      return {
        model_name: it.model_name,
        available,
        ordered,
        shortage,
        sufficient: available >= ordered,
        unit_cost: it.unit_cost || 0
      };
    });

    const shortageItems = rows.filter(r => r.shortage > 0);
    return {
      rows,
      shortageItems,
      shortageItemCount: shortageItems.length,
      allSufficient: shortageItems.length === 0,
      hasShortage: totalShortage > 0,
      totalShortage
    };
  };

  // ตรวจสอบความพร้อมก่อนส่งช่างเตรียม:
  // - Case A: สต๊อกไม่พอ และยังไม่มี PO ที่สั่งไว้ -> แนะนำสั่งซื้อ PO รายการที่ขาด
  // - Case B: สั่ง PO แล้ว (waiting_po หรือมี Stock PO ค้างรับ) -> รอรับของเข้าคลัง
  // - Case C: สต๊อกพอ (ขาด 0 ชิ้น) และไม่มี PO ค้างรับ -> ตัดสต๊อก & ส่งช่างเตรียม
  const getOrderPrepReadiness = (order: Order) => {
    const stockStatus = getOrderStockStatus(order);
    const orderedModelKeys = new Set(
      stockStatus.rows.map(r => (r.model_name || '').trim().toLowerCase()).filter(Boolean)
    );
    const orderPoNo = (order.items_list?.find(it => it.po_no)?.po_no || '').trim();
    const pendingLinkedStockPOs = stockPOs.filter(
      p => p.status === 'ordered' && (
        (orderPoNo && (p.po_number === orderPoNo || p.po_number.startsWith(`${orderPoNo}-`)))
        || orderedModelKeys.has((p.product_name || '').trim().toLowerCase())
      )
    );
    const hasReceivedLinkedStockPo = Boolean(
      orderPoNo &&
      stockPOs.some(
        p => p.status === 'received' && (p.po_number === orderPoNo || p.po_number.startsWith(`${orderPoNo}-`))
      )
    );
    const allLinkedStockPosReceived =
      hasReceivedLinkedStockPo &&
      !stockPOs.some(
        p => p.status === 'ordered' && (p.po_number === orderPoNo || p.po_number.startsWith(`${orderPoNo}-`))
      );
    const isOrderWaitingPo =
      pendingLinkedStockPOs.length > 0 &&
      order.order_status === 'waiting_po' &&
      !(allLinkedStockPosReceived && stockStatus.allSufficient);
    const hasActivePo = pendingLinkedStockPOs.length > 0;
    const orderedQtyByModel: Record<string, number> = {};
    pendingLinkedStockPOs.forEach(po => {
      const k = (po.product_name || '').trim().toLowerCase();
      orderedQtyByModel[k] = (orderedQtyByModel[k] || 0) + po.qty;
    });
    const unorderedShortageCount = stockStatus.shortageItems.reduce((sum, row) => {
      const k = row.model_name.trim().toLowerCase();
      return sum + Math.max(0, row.shortage - (orderedQtyByModel[k] || 0));
    }, 0);
    const activePoLabel = pendingLinkedStockPOs.length > 0
      ? (pendingLinkedStockPOs.length === 1
        ? pendingLinkedStockPOs[0].po_number
        : `${pendingLinkedStockPOs[0].po_number} (+${pendingLinkedStockPOs.length - 1})`)
      : (orderPoNo || 'PO-...');
    const canSendToPrep = stockStatus.allSufficient && !hasActivePo;
    const stateCase: 'case_a' | 'case_b' | 'case_c' = canSendToPrep
      ? 'case_c'
      : hasActivePo
        ? 'case_b'
        : 'case_a';

    return {
      stockStatus,
      pendingLinkedStockPOs,
      isOrderWaitingPo,
      hasActivePo,
      hasPendingPo: hasActivePo,
      unorderedShortageCount,
      activePoLabel,
      canSendToPrep,
      stateCase
    };
  };

  const orderedStockPOs = stockPOs.filter(p => p.status === 'ordered');
  const receivedStockPOs = stockPOs.filter(p => p.status === 'received');
  const rawStockItems = items.filter(i => i.status === 'raw_stock');

  // ---- Batch Grouping: รวม raw_stock ที่เหมือนกัน (ชื่อรุ่น + PO + supplier + วันรับเข้า) ----
  const rawStockBatches = (() => {
    const map = new Map<string, {
      key: string;
      model_name: string;
      po_no: string;
      supplier: string;
      received_at: string | null;
      itemIds: string[];
      serials: string[];
    }>();

    rawStockItems.forEach(i => {
      const receivedKey = i.received_at ? new Date(i.received_at).toISOString().slice(0, 10) : '-';
      const key = [
        (i.model_name || '').trim().toLowerCase(),
        (i.po_no || '-').trim().toLowerCase(),
        (i.supplier || '-').trim().toLowerCase(),
        receivedKey
      ].join('|');
      const existing = map.get(key);
      const batch = existing || {
        key,
        model_name: i.model_name,
        po_no: i.po_no || '-',
        supplier: i.supplier || 'สต๊อกร้าน',
        received_at: i.received_at || null,
        itemIds: [],
        serials: []
      };
      batch.itemIds.push(i.id);
      if (i.serial_number) batch.serials.push(i.serial_number);
      map.set(key, batch);
    });

    return Array.from(map.values()).sort((a, b) => b.itemIds.length - a.itemIds.length);
  })();
  const pendingPrepStockCount = items.filter(i => i.status === 'pending_prep_stock' || i.status === 'pending_prep').length;
  const readyStockCount = items.filter(i => i.status === 'in_stock').length;

  // ---- Inventory List: รวมของคงเหลือ (raw_stock + in_stock) แยกตามรุ่นสินค้า ----
  // แสดงเฉพาะสินค้าที่มีของจริง (qty > 0) และเรียงจากจำนวนมาก -> น้อย
  const inventoryGroups = (() => {
    const map = new Map<string, {
      key: string;
      model_name: string;
      category: ProductCategory;
      rawCount: number;
      readyCount: number;
      serials: string[];
    }>();

    items
      .filter(i => i.status === 'raw_stock' || i.status === 'in_stock')
      .forEach(i => {
        const key = (i.model_name || '').trim().toLowerCase();
        if (!key) return;
        const existing = map.get(key);
        const group = existing || {
          key,
          model_name: i.model_name,
          category: (i.category || 'general') as ProductCategory,
          rawCount: 0,
          readyCount: 0,
          serials: []
        };
        if (i.status === 'raw_stock') group.rawCount += 1;
        else group.readyCount += 1;
        if (i.serial_number) group.serials.push(i.serial_number);
        map.set(key, group);
      });

    return Array.from(map.values())
      .map(g => ({ ...g, qty: g.rawCount + g.readyCount }))
      .filter(g => g.qty > 0)
      .sort((a, b) => b.qty - a.qty);
  })();

  const inventoryCategoryCounts = inventoryGroups.reduce<Record<string, number>>((acc, g) => {
    acc[g.category] = (acc[g.category] || 0) + 1;
    if (isNonPrepCableOrConsumable(g.model_name)) {
      acc.cables_consumables = (acc.cables_consumables || 0) + 1;
    }
    return acc;
  }, {});

  const filteredInventoryGroups = stockCategoryFilter === 'all'
    ? inventoryGroups
    : stockCategoryFilter === 'cables_consumables'
      ? inventoryGroups.filter(g => isNonPrepCableOrConsumable(g.model_name))
      : inventoryGroups.filter(g => g.category === stockCategoryFilter);

  const inventoryCategoryOptions: { value: 'all' | ProductCategory | 'cables_consumables'; label: string }[] = [
    { value: 'all', label: 'ทั้งหมด' },
    { value: 'pc_notebook', label: 'PC / Notebook' },
    { value: 'printer', label: 'Printer' },
    { value: 'cctv_network', label: 'CCTV / Network' },
    { value: 'cables_consumables', label: 'สายแลน / กล่องสาย / วัสดุสิ้นเปลือง' },
    { value: 'general', label: 'อะไหล่ / อุปกรณ์เสริม' }
  ];

  const getItemCost = (orderId: string, idx: number, fallback?: number) => {
    const key = `${orderId}:${idx}`;
    return costInputs[key] !== undefined ? costInputs[key] : (fallback || 0);
  };

  const getExtraCost = (orderId: string, fallback?: number) => {
    return extraCostInputs[orderId] !== undefined ? extraCostInputs[orderId] : (fallback || 0);
  };

  // บันทึกราคาทุนของออเดอร์นี้ (internal only)
  const handleSaveCosts = (orderId: string, salesRef: string | null) => {
    const order = orders.find(o => o.id === orderId);
    if (!order) return;
    const itemCosts: Record<number, number> = {};
    (order.items_list || []).forEach((it, idx) => {
      itemCosts[idx] = getItemCost(orderId, idx, it.unit_cost);
    });
    updateOrderCosts(orderId, getExtraCost(orderId, order.extra_cost), itemCosts);
    setToast(`บันทึกราคาทุน (ภายใน) ของออเดอร์ ${salesRef || orderId} เรียบร้อยแล้ว`);
    setTimeout(() => setToast(''), 3500);
  };

  // 3 distinct subsets of orders (active purchasing queue)
  const newOrders = orders.filter(o => o.order_status === 'pending_purchasing');
  const waitingPoOrders = orders.filter(o => o.order_status === 'waiting_po');
  const poReceivedOrders = orders.filter(o => o.order_status === 'po_received_in_stock');
  const allIncomingOrders = useMemo(
    () => orders.filter(o =>
      o.order_status === 'pending_purchasing'
      || o.order_status === 'waiting_po'
      || o.order_status === 'po_received_in_stock'
    ),
    [orders]
  );

  // Case B: ยืนยันรับของเข้าคลัง (รับทั้ง Stock PO ที่ผูกอยู่ + อัปเดตสถานะออเดอร์ + เติม raw_stock ให้ครบ)
  const handleReceivePO = (order: Order) => {
    const readiness = getOrderPrepReadiness(order);
    const supplier = supplierInputs[order.id] || order.items_list?.[0]?.supplier || readiness.pendingLinkedStockPOs[0]?.supplier || 'Supplier';
    const poNo = poInputs[order.id] || order.items_list?.[0]?.po_no || readiness.pendingLinkedStockPOs[0]?.po_number || '';

    // 1) รับ Stock PO ที่สถานะ ordered เข้าห้องสต๊อก (raw_stock)
    readiness.pendingLinkedStockPOs.forEach(po => {
      receiveStockPOToStorage(po.id);
    });

    // 2) หากยังมีรายการขาดที่ไม่ได้มี Stock PO ผูกไว้ (เช่น legacy waiting_po) ให้สร้าง raw_stock ให้ครบด้วย
    const coveredQtyByModel: Record<string, number> = {};
    readiness.pendingLinkedStockPOs.forEach(po => {
      const k = (po.product_name || '').trim().toLowerCase();
      coveredQtyByModel[k] = (coveredQtyByModel[k] || 0) + po.qty;
    });
    const unlinkedShortages = readiness.stockStatus.shortageItems
      .map(row => {
        const k = row.model_name.trim().toLowerCase();
        const remaining = Math.max(0, row.shortage - (coveredQtyByModel[k] || 0));
        const cat = products.find(p => p.name.trim().toLowerCase() === k);
        return {
          model_name: row.model_name,
          qty: remaining,
          category: cat?.category || ('general' as ProductCategory),
          unit_cost: row.unit_cost || cat?.cost_price || 0
        };
      })
      .filter(m => m.qty > 0);

    receivePOIntoStock(order.id, supplier, poNo || undefined, unlinkedShortages);
    setToast(`ยืนยันรับของเข้าคลังเรียบร้อย! ออเดอร์ ${order.sales_ref || order.id} พร้อมตัดสต๊อกส่งช่างเตรียม`);
    setTimeout(() => setToast(''), 4000);
  };

  // Step 3: ปล่อยของ / ตัดสต๊อกให้ช่างเตรียมสินค้า
  const reviewCutStockAndSendPrep = (orderId: string, overridePrepNote?: string) => {
    const order = orders.find(o => o.id === orderId);
    if (!order) return;

    const readiness = getOrderPrepReadiness(order);
    if (!readiness.canSendToPrep) {
      setToast('รอสั่ง PO / รอรับของเข้าคลังก่อนจึงจะส่งช่างเตรียมได้');
      setTimeout(() => setToast(''), 4000);
      return;
    }

    const defaultBill = `INV-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`;
    const billNo = billInputs[orderId]?.trim() || defaultBill;
    const supplier = supplierInputs[orderId] || 'สต๊อกร้าน (Main Store)';
    const poNo = poInputs[orderId] || `PO-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`;
    const prepNote = (overridePrepNote ?? prepNoteInputs[orderId] ?? '').trim();

    // Convert items_list or fallback to planned model (ข้ามรายการบริการ/ค่าแรง ไม่ต้องตัดเข้า stock)
    const itemsToCut = order.items_list && order.items_list.length > 0
      ? order.items_list
        .map((it, idx) => ({ it, idx }))
        .filter(({ it }) => !isServiceItem(it.model_name, it.item_type, products))
        .map(({ it, idx }) => ({
          model_name: it.model_name,
          quantity: it.quantity,
          item_type: it.item_type,
          supplier: supplier,
          po_no: poNo,
          prep_note: prepNote,
          unit_cost: getItemCost(orderId, idx, it.unit_cost),
          stockItemId: stockPickInputs[`${orderId}:${idx}`] || undefined
        }))
      : [{
        model_name: order._planned_model || 'BossComputech Core-i7 Workstation Pro',
        quantity: order._planned_quantity || 1,
        item_type: 'hardware' as const,
        supplier: supplier,
        po_no: poNo,
        prep_note: prepNote,
        unit_cost: getItemCost(orderId, 0, undefined),
        stockItemId: stockPickInputs[`${orderId}:0`] || undefined
      }];

    setConfirmationError('');
    setConfirmation({
      kind: 'send',
      order,
      billNo,
      itemsToCut,
      title: itemsToCut.length ? 'ตรวจสอบก่อนตัดสต๊อกและส่งช่าง' : 'ตรวจสอบก่อนบันทึกบิลบริการ',
      description: itemsToCut.length
        ? 'เมื่อยืนยัน ระบบจะตัดสต๊อก ผูกสินค้ากับบิลนี้ และส่งต่อไปยังคิวตามประเภทสินค้า'
        : 'บิลนี้มีเฉพาะค่าบริการหรือค่าแรง เมื่อยืนยัน ระบบจะบันทึกเลขที่บิล',
      confirmLabel: itemsToCut.length ? 'ยืนยันตัดสต๊อกและส่งต่อ' : 'ยืนยันบันทึกบิล',
      details: [
        { label: 'ออเดอร์ขาย', value: order.sales_ref || order.id },
        { label: 'ลูกค้า', value: order.customer_name },
        { label: 'เลขที่บิล (INV)', value: billNo },
        ...(prepNote ? [{ label: 'หมายเหตุถึงช่าง', value: prepNote }] : []),
      ],
      lines: itemsToCut.map(item => ({
        name: item.model_name,
        quantity: item.quantity,
        destination: isNonPrepCableOrConsumable(item.model_name) ? 'เข้าคิวพร้อมส่งมอบ' : 'เข้าคิวช่างเตรียมสินค้า',
      })),
    });
  };

  const confirmPurchasingAction = async () => {
    if (!confirmation || confirmationInFlight.current || confirmationError) return;
    confirmationInFlight.current = true;
    setConfirmationBusy(true);
    try {
      if (confirmation.kind === 'receive') {
        const po = stockPOs.find(item => item.id === confirmation.poId);
        const line = confirmation.lines[0];
        if (po?.status !== 'ordered' || po.qty !== line.quantity || po.product_name !== line.name) {
          setConfirmationError('รายการ PO เปลี่ยนไป กรุณาย้อนกลับและเปิดรายการอีกครั้ง');
          return;
        }
        await receiveStockPOToStorage(po.id, confirmation.receipt);
        setToast(`รับสินค้า “${po.product_name}” ${po.qty} ชิ้นเข้าคลังแล้ว`);
        setPoDetail(null);
      } else {
        const { order, billNo, itemsToCut } = confirmation;
        const liveOrder = allIncomingOrders.find(item => item.id === order.id);
        const requiredByModel = new Map<string, number>();
        for (const item of itemsToCut) {
          const model = item.model_name.trim().toLowerCase();
          requiredByModel.set(model, (requiredByModel.get(model) || 0) + item.quantity);
        }
        const stockAvailable = [...requiredByModel].every(([model, quantity]) => getAvailableStock(model) >= quantity);
        if (!liveOrder || liveOrder.updated_at !== order.updated_at || !getOrderPrepReadiness(liveOrder).canSendToPrep || !stockAvailable) {
          setConfirmationError('ข้อมูลบิลหรือจำนวนสินค้าในคลังไม่พร้อมตามรายการนี้ กรุณาย้อนกลับและตรวจสอบอีกครั้ง');
          return;
        }
        await cutStock(order.id, billNo, itemsToCut);
        setToast(itemsToCut.length ? `ตัดสต๊อกและผูกสินค้ากับบิล ${billNo} แล้ว` : `บันทึกบิลบริการ ${billNo} แล้ว`);
        setActionOrder(null);
        setBatchDetail(null);
      }
      setConfirmation(null);
      setTimeout(() => setToast(''), 4000);
    } catch {
      setConfirmationError('บันทึกไม่สำเร็จ กรุณาย้อนกลับเพื่อตรวจสอบสถานะรายการก่อนดำเนินการอีกครั้ง');
    } finally {
      confirmationInFlight.current = false;
      setConfirmationBusy(false);
    }
  };

  const caseACount = allIncomingOrders.filter(o => getOrderPrepReadiness(o).stateCase === 'case_a').length;
  const caseBCount = allIncomingOrders.filter(o => getOrderPrepReadiness(o).stateCase === 'case_b').length;
  const caseCCount = allIncomingOrders.filter(o => getOrderPrepReadiness(o).stateCase === 'case_c').length;

  const currentTabOrders = activeTab === 'all'
    ? allIncomingOrders
    : allIncomingOrders.filter(o => getOrderPrepReadiness(o).stateCase === activeTab);

  const searchedIncomingOrders = useMemo(() => {
    const q = incomingSearch.trim().toLowerCase();
    if (!q) return currentTabOrders;
    return currentTabOrders.filter(o =>
      (o.sales_ref || '').toLowerCase().includes(q)
      || (o.customer_name || '').toLowerCase().includes(q)
      || (o.customer_phone || '').toLowerCase().includes(q)
    );
  }, [currentTabOrders, incomingSearch]);

  const searchedInventoryGroups = useMemo(() => {
    const q = inventorySearch.trim().toLowerCase();
    const list = !q
      ? filteredInventoryGroups
      : filteredInventoryGroups.filter(g => (g.model_name || '').toLowerCase().includes(q));
    return [...list].sort((a, b) => b.qty - a.qty);
  }, [filteredInventoryGroups, inventorySearch]);

  // ---- List Controls (sort + page size + pagination) ----
  const inventoryList = useListControls(searchedInventoryGroups, {
    getValue: (g) => g.qty,
    initialSort: 'high',
    initialPageSize: 10
  });

  const matchesPoSearch = (po: StockPO) => {
    const document = getStockPoDocument(po);
    const receipt = getStockPoReceipt(po);
    const source = document?.source;
    const query = stockPoSearch.trim().toLowerCase();
    return !query || [po.po_number, po.supplier, po.product_name, document?.supplierQuote, po.project_id,
      source?.kind === 'stock' ? 'ซื้อเข้าสต๊อก' : source?.reference, receipt?.deliveryNote, receipt?.taxInvoice]
      .some(value => value?.toLowerCase().includes(query));
  };

  const orderedStockPoList = useListControls(orderedStockPOs.filter(matchesPoSearch), {
    getDate: (po) => po.ordered_at || po.created_at,
    initialSort: 'newest',
    initialPageSize: 10
  });

  const receivedStockPoList = useListControls(receivedStockPOs.filter(matchesPoSearch), {
    getDate: (po) => po.received_at || po.updated_at || po.created_at,
    initialSort: 'newest',
    initialPageSize: 10
  });

  const incomingList = useListControls(searchedIncomingOrders, {
    getDate: (o) => o.created_at,
    initialSort: 'newest',
    initialPageSize: 10
  });

  // ---- DOA Claims from Prep Tech ----
  const doaReportedItems = useMemo(() => items.filter(i => i.status === 'doa_reported'), [items]);
  const doaSentItems = useMemo(() => items.filter(i => i.status === 'doa_sent_supplier'), [items]);
  const doaReplacedItems = useMemo(() => items.filter(i => i.status === 'doa_replaced'), [items]);
  const activeDoaItems = useMemo(
    () => [...doaReportedItems, ...doaSentItems],
    [doaReportedItems, doaSentItems]
  );
  const allDoaItems = useMemo(
    () => [...doaReportedItems, ...doaSentItems, ...doaReplacedItems],
    [doaReportedItems, doaSentItems, doaReplacedItems]
  );
  const filteredDoaItems = useMemo(() => {
    switch (doaStageFilter) {
      case 'doa_reported':
        return doaReportedItems;
      case 'doa_sent_supplier':
        return doaSentItems;
      case 'doa_replaced':
        return doaReplacedItems;
      default:
        return allDoaItems;
    }
  }, [doaStageFilter, allDoaItems, doaReportedItems, doaSentItems, doaReplacedItems]);

  const openDoaClaimModal = (item: Item) => {
    setDoaClaimItem(item);
    setDoaRmaInput(item.doa_rma_no || '');
    setDoaSentDateInput(item.doa_sent_date || new Date().toISOString().split('T')[0]);
    setDoaNotesInput(item.doa_notes || '');
    setDoaSendDirectToPrep(false);
  };

  const handleMarkDoaSent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!doaClaimItem) return;
    if (!doaRmaInput.trim()) {
      alert('กรุณาระบุเลขที่ RMA / Tracking No. ที่ส่งเคลม Supplier');
      return;
    }
    await markDoaSentToSupplier(doaClaimItem.id, {
      rmaNo: doaRmaInput.trim(),
      sentDate: doaSentDateInput || new Date().toISOString().split('T')[0],
      notes: doaNotesInput.trim() || undefined
    });
    setToast(`บันทึกแจ้งเคลม Supplier (RMA: ${doaRmaInput.trim()}) เรียบร้อยแล้ว`);
    setDoaClaimItem(null);
  };

  const handleConfirmDoaReplacement = async () => {
    if (!doaClaimItem) return;
    await receiveDoaReplacement(doaClaimItem.id, {
      sendDirectlyToPrep: doaSendDirectToPrep,
      notes: doaNotesInput.trim() || undefined
    });
    setToast(
      doaSendDirectToPrep
        ? `รับตัวใหม่ "${doaClaimItem.model_name}" จาก Supplier แล้ว — ส่งต่อเข้าคิวช่าง Prep ทันที`
        : `รับตัวใหม่ "${doaClaimItem.model_name}" จาก Supplier แล้ว — ส่งกลับเข้าห้องสต๊อก (raw_stock) นับ DOA 7 วัน`
    );
    setDoaClaimItem(null);
  };

  const activeProjectsList = useMemo(
    () =>
      projects.filter(p => {
        if (p.status === 'completed') return false;
        const st = getProjectStockStatus(p);
        const hasPendingSiteVisit = (p.site_visits || []).some(sv => {
          if (sv.prep_status !== 'pending_stock' || sv.visit_status === 'completed') return false;
          // นับเฉพาะรอบเข้าไซต์ที่ยังมีรายการที่ Stock ยังไม่ได้ตัดให้โปรเจกต์
          return (sv.items_to_take || []).some(it => {
            if (/ค่าบริการ|ค่าแรง/.test(it.name || '')) return false;
            const pi =
              (it.project_item_id && p.items.find(i => i.id === it.project_item_id)) ||
              p.items.find(i => i.model_name === it.name);
            if (!pi) return true;
            return (pi.qty_allocated || 0) < (pi.qty_required || 0);
          });
        });
        return !st.allPhysicalAllocated || st.pendingFieldRequests.length > 0 || hasPendingSiteVisit;
      }),
    [projects, items, stockPOs]
  );
  const pendingProjectMaterialReqsCount = useMemo(
    () => projects.reduce((s, p) => s + (p.material_requests || []).filter(r => r.status === 'pending').length, 0),
    [projects]
  );

  const mainTabs: { key: 'incoming' | 'projects' | 'po_tracking' | 'inventory' | 'doa_claims'; label: string; sub: string; count: number; icon: React.ElementType; accent: string; pulseAlert?: boolean }[] = [
    {
      key: 'incoming',
      label: '1. บิลขายรอตัดสต๊อก',
      sub: 'บิลขาย',
      count: newOrders.length + waitingPoOrders.length + poReceivedOrders.length,
      icon: ClipboardList,
      accent: 'blue'
    },
    {
      key: 'projects',
      label: '2. โปรเจกต์ & คิวเข้าไซต์',
      sub: 'โปรเจกต์',
      count: activeProjectsList.length,
      icon: Layers,
      accent: 'purple',
      pulseAlert: pendingProjectMaterialReqsCount > 0
    },
    {
      key: 'po_tracking',
      label: '3. รอรับของเข้า (PO)',
      sub: 'รับของ PO',
      count: orderedStockPOs.length,
      icon: Truck,
      accent: 'purple'
    },
    {
      key: 'inventory',
      label: '4. เช็คคลังสินค้า & ห้องเทส',
      sub: 'คลัง',
      count: inventoryGroups.length,
      icon: Warehouse,
      accent: 'emerald'
    },
    {
      key: 'doa_claims',
      label: '5. เคลมของเสีย (DOA)',
      sub: 'DOA',
      count: activeDoaItems.length,
      icon: AlertTriangle,
      accent: 'rose',
      pulseAlert: doaReportedItems.length > 0
    }
  ];

  const accentClasses: Record<string, { active: string; badge: string; icon: string }> = {
    blue: {
      active: 'bg-blue-500/15 dark:bg-blue-500/20 border border-blue-500/40 dark:border-blue-500/50 text-blue-900 dark:text-white shadow-sm',
      badge: 'bg-blue-600 dark:bg-blue-500 text-white dark:text-black',
      icon: 'bg-blue-500/20 text-blue-600 dark:text-blue-400 border-blue-500/30'
    },
    purple: {
      active: 'bg-purple-500/15 dark:bg-purple-500/20 border border-purple-500/40 dark:border-purple-500/50 text-purple-900 dark:text-white shadow-sm',
      badge: 'bg-purple-600 dark:bg-purple-500 text-white',
      icon: 'bg-purple-500/20 text-purple-600 dark:text-purple-400 border-purple-500/30'
    },
    emerald: {
      active: 'bg-emerald-500/15 dark:bg-emerald-500/20 border border-emerald-500/40 dark:border-emerald-500/50 text-emerald-900 dark:text-white shadow-sm',
      badge: 'bg-emerald-600 dark:bg-emerald-500 text-white dark:text-black',
      icon: 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
    },
    rose: {
      active: 'bg-rose-500/15 dark:bg-rose-500/20 border border-rose-500/40 dark:border-rose-500/50 text-rose-900 dark:text-white shadow-sm',
      badge: 'bg-rose-600 dark:bg-rose-500 text-white',
      icon: 'bg-rose-500/20 text-rose-600 dark:text-rose-400 border-rose-500/30'
    }
  };

  // ---- Compact incoming order cards ----
  const incomingCards = incomingList.pageItems;

  // ---- Compact inventory cards ----
  const inventoryCards = inventoryList.pageItems;

  // ---- Stock status badge for an order card ----
  const renderStockStatusBadge = (order: Order) => {
    const { stockStatus, stateCase, activePoLabel } = getOrderPrepReadiness(order);
    if (stateCase === 'case_c') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-900 border border-emerald-300 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/35">
          <CheckCircle className="w-3 h-3 shrink-0" />
          สต๊อกพร้อม (ขาด 0 ชิ้น)
        </span>
      );
    }
    if (stateCase === 'case_b') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-900 border border-purple-300 dark:bg-purple-500/15 dark:text-purple-300 dark:border-purple-500/40">
          <Clock className="w-3 h-3 shrink-0" />
          รอของเข้าจากใบ {activePoLabel}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-900 border border-rose-300 dark:bg-rose-500/15 dark:text-rose-300 dark:border-rose-500/40">
        <AlertTriangle className="w-3 h-3 shrink-0" />
        ขาด {stockStatus.shortageItemCount} รายการ ({stockStatus.totalShortage} ชิ้น)
      </span>
    );
  };

  const renderOrderStatusBadge = (order: Order) => {
    const { stateCase } = getOrderPrepReadiness(order);
    switch (stateCase) {
      case 'case_a':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-300 dark:bg-rose-500/15 dark:text-rose-300 dark:border-rose-500/30">ต้องสั่ง PO</span>;
      case 'case_b':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-800 border border-purple-300 dark:bg-purple-500/15 dark:text-purple-300 dark:border-purple-500/30">รอรับของ PO</span>;
      case 'case_c':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30">พร้อมส่งช่าง</span>;
    }
  };

  return (
    <div className="space-y-6">
      <ToastBanner message={toast} onClose={() => setToast('')} />

      {/* Main Container */}
      <div className="liquid-glass rounded-3xl p-3 sm:p-6 shadow-2xl border border-slate-200 dark:border-white/[0.08]">
        {/* Top Action Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-4">
          <div className="flex items-center gap-2.5 sm:gap-3">
            <div className="p-2 sm:p-2.5 rounded-2xl bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-300 dark:border-amber-500/30">
              <Boxes className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            <div>
              <h2 className="text-base sm:text-xl font-black text-slate-900 dark:text-white">จัดซื้อ &amp; ควบคุมสต๊อก</h2>
              <p className="hidden sm:block text-xs sm:text-sm text-slate-600 dark:text-slate-300 mt-0.5">เช็กของขาด • เปิดใบสั่งซื้อ (PO) • รับของเข้าคลัง • ตัดสต๊อกส่งช่างเตรียม</p>
            </div>
          </div>
          <button disabled={readOnly}
            type="button"
            onClick={openStockPoModal}
            className="w-full sm:w-auto px-4 sm:px-5 py-2.5 sm:py-3 sm:min-h-[48px] rounded-xl bg-gradient-to-r from-emerald-700 to-teal-800 hover:from-emerald-800 text-white font-black text-xs sm:text-sm transition cursor-pointer flex items-center justify-center gap-1.5 sm:gap-2 shadow-lg shadow-emerald-500/20 border border-white/20 active:scale-[0.97]"
          >
            <PackagePlus className="w-4 h-4 sm:w-5 sm:h-5" />
            <span className="sm:hidden">+ เปิดใบ PO สต๊อก</span>
            <span className="hidden sm:inline">+ สั่งซื้อของเข้าสต๊อก (เปิดใบ PO)</span>
          </button>
        </div>

        {/* 3-Step Workflow Guide Strip (Desktop/Tablet) */}
        <div className="hidden sm:flex mt-4 px-3.5 py-2.5 rounded-2xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.06] flex-wrap items-center gap-2 text-[11px] font-bold text-slate-700 dark:text-slate-300">
          <span className="text-slate-500 dark:text-slate-400 mr-1">ขั้นตอนทำงาน:</span>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-rose-100/80 text-rose-900 dark:bg-rose-500/15 dark:text-rose-300 border border-rose-200 dark:border-rose-500/30">
            <span className="w-4 h-4 rounded-full bg-rose-600 text-white text-[10px] font-black inline-flex items-center justify-center">1</span>
            <span>ขาดของ → สั่งซื้อ PO</span>
          </span>
          <ChevronRight className="w-3.5 h-3.5 text-slate-400 hidden sm:inline" />
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-purple-100/80 text-purple-900 dark:bg-purple-500/15 dark:text-purple-300 border border-purple-200 dark:border-purple-500/30">
            <span className="w-4 h-4 rounded-full bg-purple-600 text-white text-[10px] font-black inline-flex items-center justify-center">2</span>
            <span>ของมาส่ง → กดรับเข้าคลัง</span>
          </span>
          <ChevronRight className="w-3.5 h-3.5 text-slate-400 hidden sm:inline" />
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-emerald-100/80 text-emerald-900 dark:bg-emerald-500/15 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/30">
            <span className="w-4 h-4 rounded-full bg-emerald-600 text-white text-[10px] font-black inline-flex items-center justify-center">3</span>
            <span>ของครบ → ตัดสต๊อกส่งช่างเตรียม / Onsite</span>
          </span>
        </div>

        {/* Clickable Action-Oriented KPI Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 sm:gap-2.5 mt-2.5 sm:mt-3">
          <button
            type="button"
            onClick={() => { setMainTab('incoming'); setActiveTab('case_a'); }}
            className={`text-left px-2.5 py-2 sm:px-3.5 sm:py-3 rounded-xl sm:rounded-2xl border transition-all duration-150 active:scale-[0.98] cursor-pointer flex items-center justify-between gap-2 ${caseACount > 0
              ? 'bg-rose-50 dark:bg-rose-500/10 border-rose-300 dark:border-rose-500/35 hover:border-rose-500'
              : 'bg-slate-50 dark:bg-white/[0.03] border-slate-200 dark:border-white/[0.08] hover:border-slate-400'
              }`}
          >
            <span className="text-[11px] sm:text-xs font-bold text-rose-900 dark:text-slate-200 leading-tight">
              ขาดของ
              <span className="hidden sm:block text-[10px] font-semibold opacity-75">ต้องสั่ง PO</span>
            </span>
            <span className={`text-base sm:text-xl font-black font-mono tabular-nums ${caseACount > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-400'}`}>
              {caseACount}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setMainTab('po_tracking')}
            className="text-left px-2.5 py-2 sm:px-3.5 sm:py-3 rounded-xl sm:rounded-2xl bg-purple-50 dark:bg-purple-500/10 border border-purple-200 dark:border-purple-500/25 hover:border-purple-500 transition-all duration-150 active:scale-[0.98] cursor-pointer flex items-center justify-between gap-2"
          >
            <span className="text-[11px] sm:text-xs font-bold text-purple-900 dark:text-slate-200 leading-tight">
              รอรับ PO
              <span className="hidden sm:block text-[10px] font-semibold opacity-75">ใบสั่งซื้อ PO</span>
            </span>
            <span className="text-base sm:text-xl font-black font-mono text-purple-700 dark:text-purple-400 tabular-nums">{orderedStockPOs.length}</span>
          </button>
          <button
            type="button"
            onClick={() => { setMainTab('incoming'); setActiveTab('case_c'); }}
            className="text-left px-2.5 py-2 sm:px-3.5 sm:py-3 rounded-xl sm:rounded-2xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/25 hover:border-emerald-500 transition-all duration-150 active:scale-[0.98] cursor-pointer flex items-center justify-between gap-2"
          >
            <span className="text-[11px] sm:text-xs font-bold text-emerald-900 dark:text-slate-200 leading-tight">
              พร้อมส่งช่าง
              <span className="hidden sm:block text-[10px] font-semibold opacity-75">รอตัดสต๊อก</span>
            </span>
            <span className="text-base sm:text-xl font-black font-mono text-emerald-700 dark:text-emerald-400 tabular-nums">{caseCCount}</span>
          </button>
          <button
            type="button"
            onClick={() => setMainTab('inventory')}
            className="text-left px-2.5 py-2 sm:px-3.5 sm:py-3 rounded-xl sm:rounded-2xl bg-teal-50 dark:bg-teal-500/10 border border-teal-200 dark:border-teal-500/25 hover:border-teal-500 transition-all duration-150 active:scale-[0.98] cursor-pointer flex items-center justify-between gap-2"
          >
            <span className="text-[11px] sm:text-xs font-bold text-teal-900 dark:text-slate-200 leading-tight">
              สต๊อกพร้อม
              <span className="hidden sm:block text-[10px] font-semibold text-amber-700 dark:text-amber-300">+{rawStockItems.length} รอตรวจรับ</span>
            </span>
            <span className="text-base sm:text-xl font-black font-mono text-teal-700 dark:text-teal-400 tabular-nums">{readyStockCount}</span>
          </button>
        </div>

        {/* Compact Segmented Tab Bar */}
        <div className="flex items-center gap-1 p-1 rounded-2xl bg-slate-100 dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.06] mt-3 sm:mt-4 overflow-x-auto no-scrollbar">
          {mainTabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = mainTab === tab.key;
            const accent = accentClasses[tab.accent];
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setMainTab(tab.key)}
                className={`flex-1 min-w-fit px-3 py-2 rounded-xl text-[11px] font-bold transition-all flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer active:scale-[0.97] ${isActive
                  ? accent.active
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-white/60 dark:hover:bg-white/[0.05]'
                  }`}
              >
                <Icon className="w-3.5 h-3.5 flex-shrink-0" />
                {tab.pulseAlert && (
                  <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse flex-shrink-0" aria-hidden="true" />
                )}
                <span className="hidden sm:inline">{tab.label}</span>
                <span className="sm:hidden">{tab.sub}</span>
                <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono ${isActive ? accent.badge : tab.pulseAlert ? 'bg-rose-600 text-white' : 'bg-slate-200 dark:bg-white/10 text-slate-700 dark:text-slate-400'
                  }`}>
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>

        {/* ================= TAB 1: INCOMING ORDERS ================= */}
        {mainTab === 'incoming' && (
          <div className="space-y-3 mt-4">
            {/* State Filter Pills */}
            <div className="flex overflow-x-auto no-scrollbar sm:grid sm:grid-cols-4 gap-1.5 pb-0.5 sm:pb-0">
              <button
                type="button"
                onClick={() => setActiveTab('all')}
                className={`px-3 py-1.5 sm:py-2 rounded-xl text-[11px] font-bold transition active:scale-[0.97] border flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap flex-shrink-0 ${activeTab === 'all'
                  ? 'bg-blue-500/15 dark:bg-blue-500/20 border-blue-500/50 text-blue-900 dark:text-white'
                  : 'bg-slate-50 dark:bg-white/[0.02] border-slate-200 dark:border-white/[0.06] text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
              >
                <span>ทั้งหมด</span>
                <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono ${allIncomingOrders.length > 0 ? 'bg-blue-600 dark:bg-blue-500 text-white dark:text-black' : 'bg-slate-200 dark:bg-white/10 text-slate-600 dark:text-slate-400'}`}>{allIncomingOrders.length}</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('case_a')}
                className={`px-3 py-1.5 sm:py-2 rounded-xl text-[11px] font-bold transition active:scale-[0.97] border flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap flex-shrink-0 ${activeTab === 'case_a'
                  ? 'bg-rose-500/15 dark:bg-rose-500/20 border-rose-500/50 text-rose-900 dark:text-white'
                  : 'bg-slate-50 dark:bg-white/[0.02] border-slate-200 dark:border-white/[0.06] text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
              >
                <span className="sm:hidden">สั่ง PO</span>
                <span className="hidden sm:inline">ขาดของ / ต้องสั่ง PO</span>
                <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono ${caseACount > 0 ? 'bg-rose-600 dark:bg-rose-500 text-white' : 'bg-slate-200 dark:bg-white/10 text-slate-600 dark:text-slate-400'}`}>{caseACount}</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('case_b')}
                className={`px-3 py-1.5 sm:py-2 rounded-xl text-[11px] font-bold transition active:scale-[0.97] border flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap flex-shrink-0 ${activeTab === 'case_b'
                  ? 'bg-purple-500/15 dark:bg-purple-500/20 border-purple-500/50 text-purple-900 dark:text-white'
                  : 'bg-slate-50 dark:bg-white/[0.02] border-slate-200 dark:border-white/[0.06] text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
              >
                <span className="sm:hidden">รอของเข้า</span>
                <span className="hidden sm:inline">รอของเข้า PO</span>
                <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono ${caseBCount > 0 ? 'bg-purple-600 dark:bg-purple-500 text-white' : 'bg-slate-200 dark:bg-white/10 text-slate-600 dark:text-slate-400'}`}>{caseBCount}</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('case_c')}
                className={`px-3 py-1.5 sm:py-2 rounded-xl text-[11px] font-bold transition active:scale-[0.97] border flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap flex-shrink-0 ${activeTab === 'case_c'
                  ? 'bg-emerald-500/15 dark:bg-emerald-500/20 border-emerald-500/50 text-emerald-900 dark:text-white'
                  : 'bg-slate-50 dark:bg-white/[0.02] border-slate-200 dark:border-white/[0.06] text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
              >
                <span>พร้อมส่งช่าง</span>
                <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono ${caseCCount > 0 ? 'bg-emerald-600 dark:bg-emerald-500 text-white dark:text-black' : 'bg-slate-200 dark:bg-white/10 text-slate-600 dark:text-slate-400'}`}>{caseCCount}</span>
              </button>
            </div>

            {/* Search */}
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                placeholder="ค้นหาเลขบิล / ชื่อลูกค้า / เบอร์โทร..."
                value={incomingSearch}
                onChange={(e) => setIncomingSearch(e.target.value)}
                className="w-full liquid-glass-input rounded-xl pl-9 pr-3 py-2 text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none"
              />
            </div>

            {searchedIncomingOrders.length > 0 && (
              <ListControls
                from={incomingList.from}
                to={incomingList.to}
                total={incomingList.total}
                page={incomingList.page}
                totalPages={incomingList.totalPages}
                pageSize={incomingList.pageSize}
                sort={incomingList.sort}
                onSortChange={incomingList.setSort}
                onPageSizeChange={incomingList.setPageSize}
                onPageChange={incomingList.setPage}
                unit="ออเดอร์"
              />
            )}

            {searchedIncomingOrders.length === 0 ? (
              <div className="text-center py-12 text-slate-500 border border-dashed border-slate-300 dark:border-white/[0.1] rounded-2xl">
                <CheckCircle className="w-10 h-10 mx-auto mb-2 text-emerald-500 dark:text-emerald-400 opacity-70" />
                <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
                  {activeTab === 'all' && 'ไม่มีออเดอร์รอดำเนินการในคิวจัดซื้อ'}
                  {activeTab === 'case_a' && 'ไม่มีออเดอร์ที่สต๊อกขาด'}
                  {activeTab === 'case_b' && 'ไม่มีออเดอร์ที่รอของเข้าจาก PO'}
                  {activeTab === 'case_c' && 'ไม่มีออเดอร์ที่รอตัดสต๊อกส่งช่างเตรียม'}
                </p>
                <p className="text-xs text-slate-500 mt-0.5">ทุกขั้นตอนได้รับการดำเนินการเรียบร้อย</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                {incomingCards.map((order) => {
                  const rMeta = order.route_code ? ROUTE_DEFINITIONS[order.route_code] : null;
                  const itemCount = (order.items_list && order.items_list.length > 0)
                    ? order.items_list.reduce((sum, it) => sum + (it.quantity || 1), 0)
                    : (order._planned_quantity || 1);
                  const { stateCase, pendingLinkedStockPOs } = getOrderPrepReadiness(order);
                  const borderAccent = stateCase === 'case_a'
                    ? 'border-l-4 border-l-rose-500 hover:border-rose-500/60 border-rose-200 dark:border-rose-500/25'
                    : stateCase === 'case_b'
                      ? 'border-l-4 border-l-purple-500 hover:border-purple-500/60 border-purple-200 dark:border-purple-500/25'
                      : 'border-l-4 border-l-emerald-500 hover:border-emerald-500/60 border-emerald-200 dark:border-emerald-500/25';
                  const previewItems = (order.items_list || []).slice(0, 2);
                  return (
                    <div
                      key={order.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => setActionOrder(order)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setActionOrder(order);
                        }
                      }}
                      className={`text-left p-3 sm:p-4 rounded-2xl liquid-glass-card border ${borderAccent} transition-all duration-150 hover:shadow-lg cursor-pointer flex flex-col gap-2 sm:gap-2.5 sm:min-h-[156px]`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="px-2 py-0.5 rounded-lg text-[10px] sm:text-[11px] bg-[#FF6B00] text-black font-extrabold font-mono data-key">
                          {order.sales_ref || order.id}
                        </span>
                        <span className="hidden sm:inline-flex">{renderOrderStatusBadge(order)}</span>
                        <span className="sm:hidden text-[10px] font-mono text-slate-500 dark:text-slate-400">{itemCount} ชิ้น</span>
                      </div>
                      <div className="min-w-0">
                        <div className="text-[13px] sm:text-sm font-bold text-slate-900 dark:text-white truncate">{order.customer_name}</div>
                        <div className="text-[10px] sm:text-[11px] text-slate-600 dark:text-slate-400 truncate mt-0.5">
                          {rMeta ? `${rMeta.shortName} • ${order.district || '-'}` : order.delivery_location}
                          <span className="hidden sm:inline"> · {itemCount} ชิ้น</span>
                        </div>
                      </div>
                      {previewItems.length > 0 && (
                        <div className="text-[10px] sm:text-[11px] text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-white/[0.03] rounded-xl px-2.5 py-1.5 border border-slate-200/80 dark:border-white/[0.06] space-y-0.5">
                          {previewItems.map((it, idx) => (
                            <div key={idx} className={`truncate font-medium ${idx > 0 ? 'hidden sm:block' : ''}`}>
                              • {it.model_name} <span className="font-mono font-bold text-[#FF6B00]">×{it.quantity}</span>
                            </div>
                          ))}
                          {(order.items_list || []).length > 1 && (
                            <div className="sm:hidden text-[10px] text-slate-400">+ อีก {(order.items_list || []).length - 1} รายการ</div>
                          )}
                          {(order.items_list || []).length > 2 && (
                            <div className="hidden sm:block text-[10px] text-slate-400">+ อีก {(order.items_list || []).length - 2} รายการ</div>
                          )}
                        </div>
                      )}
                      <div className="flex items-center justify-between gap-2 mt-auto pt-1">
                        {renderStockStatusBadge(order)}
                        <div className="flex items-center gap-1.5 shrink-0">
                          {stateCase === 'case_a' && (
                            <button disabled={readOnly}
                              type="button"
                              onClick={(e) => { e.stopPropagation(); openStockPoFromOrder(order); }}
                              className="px-2.5 py-1.5 rounded-xl bg-gradient-to-r from-[#FF6B00] to-[#E65A00] text-black text-[11px] font-extrabold cursor-pointer active:scale-95 transition flex items-center gap-1 shadow-sm"
                            >
                              <ShoppingCart className="w-3 h-3" />
                              <span>สั่ง PO</span>
                            </button>
                          )}
                          {stateCase === 'case_b' && pendingLinkedStockPOs.length > 0 && (
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); setMainTab('po_tracking'); }}
                              className="px-2.5 py-1.5 rounded-xl bg-purple-100 hover:bg-purple-200 dark:bg-purple-500/20 dark:hover:bg-purple-500/30 text-purple-900 dark:text-purple-200 border border-purple-300 dark:border-purple-500/40 text-[11px] font-extrabold cursor-pointer active:scale-95 transition flex items-center gap-1"
                            >
                              <Truck className="w-3 h-3" />
                              <span>ดูใบ PO</span>
                            </button>
                          )}
                          {stateCase === 'case_c' && (
                            <button disabled={readOnly}
                              type="button"
                              onClick={(e) => { e.stopPropagation(); reviewCutStockAndSendPrep(order.id); }}
                              className="px-2.5 py-1.5 rounded-xl bg-gradient-to-r from-emerald-700 to-teal-800 text-white text-[11px] font-extrabold cursor-pointer active:scale-95 transition flex items-center gap-1 shadow-sm"
                            >
                              <Send className="w-3 h-3" />
                              <span>ตัดสต๊อก</span>
                            </button>
                          )}
                          <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 flex items-center">
                            <ChevronRight className="w-4 h-4" />
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ================= TAB 2: PROJECTS / SITE INSTALLATION (PRJ-...) ================= */}
        {mainTab === 'projects' && projects.length > 0 && (
          <div className="space-y-3 mt-5 pt-4 border-t border-slate-200 dark:border-white/[0.08]">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="text-xs sm:text-sm font-extrabold text-slate-900 dark:text-white flex items-center gap-2 flex-wrap">
                  <Layers className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                  <span className="sm:hidden">งานโปรเจกต์ (PRJ)</span>
                  <span className="hidden sm:inline">งานโปรเจกต์ / ติดตั้ง (PRJ) — เช็กของขาด, สั่ง PO &amp; ปล่อยของเข้าไซต์</span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-purple-100 text-purple-900 border border-purple-300 dark:bg-purple-500/20 dark:text-purple-300 dark:border-purple-500/40">
                    {projects.length} โปรเจกต์
                  </span>
                </h3>
                <p className="hidden sm:block text-[11px] text-slate-600 dark:text-slate-400 mt-0.5">
                  แยกให้เห็นชัดว่า <strong>รายการไหนต้องส่งช่าง Prep (เทส/ติดวอย)</strong> และ <strong>รายการไหนส่งตรงทีมช่าง Onsite เข้าไซต์</strong> — ปล่อยเบิกทีละงวดได้ไม่ต้องรอครบ 100%
                </p>
              </div>
            </div>

            {/* Highlighted Queue: เบิกของสำหรับคิวเข้าไซต์ (พรุ่งนี้ / นัดหมาย) */}
            {(() => {
              const tomorrowStr = getLocalDateStr(1);
              const todayStr = getLocalDateStr(0);
              const pendingVisits = projects
                .flatMap(prj =>
                  (prj.site_visits || [])
                    .filter(sv => {
                      if (sv.prep_status !== 'pending_stock' || sv.visit_status === 'completed') return false;
                      // แสดงเฉพาะรอบที่ยังมีของที่ Stock ยังไม่ได้ตัดให้โปรเจกต์ (ลดความซ้ำซ้อน)
                      return (sv.items_to_take || []).some(it => {
                        if (/ค่าบริการ|ค่าแรง/.test(it.name || '')) return false;
                        const pi =
                          (it.project_item_id && prj.items.find(i => i.id === it.project_item_id)) ||
                          prj.items.find(i => i.model_name === it.name);
                        if (!pi) return true;
                        return (pi.qty_allocated || 0) < (pi.qty_required || 0);
                      });
                    })
                    .map(sv => ({ project: prj, visit: sv }))
                )
                .sort((a, b) => a.visit.visit_date.localeCompare(b.visit.visit_date));
              if (pendingVisits.length === 0) return null;
              return (
                <div className="space-y-4">
                  <div className="p-3.5 sm:p-4 rounded-2xl bg-gradient-to-br from-[#FF6B00]/15 via-amber-500/10 to-rose-500/10 border-2 border-[#FF6B00] shadow-lg shadow-[#FF6B00]/15 space-y-3">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="p-1.5 rounded-xl bg-[#FF6B00] text-black shadow-sm flex-shrink-0">
                          <Truck className="w-4 h-4" />
                        </span>
                        <div className="min-w-0">
                          <h4 className="text-xs sm:text-sm font-black text-slate-900 dark:text-white flex items-center gap-1.5 flex-wrap">
                            <span>คำขอเบิกเข้าไซต์ (พรุ่งนี้ / นัดหมาย)</span>
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-black bg-rose-600 text-white animate-pulse">
                              {pendingVisits.length} รอบด่วน
                            </span>
                          </h4>
                          <p className="text-[10px] sm:text-[11px] font-semibold text-amber-900 dark:text-amber-200/90">
                            คิวขอเบิกของทีมช่างสำหรับเข้าหน้างาน — แยกจากรายการโปรเจกต์รวมด้านล่าง
                          </p>
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                      {pendingVisits.map(({ project: prj, visit }) => {
                        const isTomorrow = visit.visit_date === tomorrowStr;
                        const isToday = visit.visit_date === todayStr;
                        return (
                          <div key={visit.id} className="p-3 rounded-xl bg-white dark:bg-slate-900 border-l-4 border-l-[#FF6B00] border border-[#FF6B00]/40 shadow-sm flex flex-col justify-between gap-2 text-xs">
                            <div className="space-y-1">
                              <div className="flex items-center justify-between gap-2 flex-wrap">
                                <span className="font-mono font-extrabold text-purple-700 dark:text-purple-300">
                                  {prj.id} • {visit.id}
                                </span>
                                <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black shadow-sm ${isToday || isTomorrow
                                  ? 'bg-rose-600 text-white'
                                  : 'bg-amber-500 text-black'
                                  }`}>
                                  {isToday ? '⚡ เข้าไซต์วันนี้' : isTomorrow ? '⚡ เข้าไซต์พรุ่งนี้' : `📅 นัด ${formatDateDMY(visit.visit_date)}`} ({visit.time_slot})
                                </span>
                              </div>
                              <div className="font-bold text-slate-900 dark:text-white">{prj.site_name}</div>
                              <div className="text-[11px] text-slate-600 dark:text-slate-300">
                                ทีมช่าง: <strong>{visit.assigned_techs.join(', ') || '-'}</strong> • {visit.visit_scope}
                              </div>
                              {visit.items_to_take.length > 0 ? (
                                <div className="space-y-1.5 bg-slate-50 dark:bg-slate-800/70 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700">
                                  <div className="text-[10px] font-bold text-slate-500 dark:text-slate-400">
                                    รายการที่จะตัดส่งรอบนี้:
                                  </div>
                                  {visit.items_to_take.map((it, idx) => {
                                    const key = (it.name || '').trim().toLowerCase();
                                    const avail = stockCountByName[key] || 0;
                                    const pi =
                                      (it.project_item_id && prj.items.find(i => i.id === it.project_item_id)) ||
                                      prj.items.find(i => i.model_name === it.name);
                                    const unallocatedInPrj = pi
                                      ? Math.max(0, (pi.qty_required || 0) - (pi.qty_allocated || 0))
                                      : it.qty;
                                    const needFromWarehouse = Math.min(it.qty, unallocatedInPrj);
                                    const isAlreadyAllocated = needFromWarehouse === 0;
                                    const isDirectOnsite = it.item_type !== 'equipment' || isNonPrepCableOrConsumable(it.name);
                                    const isEnough = isAlreadyAllocated || avail >= needFromWarehouse;
                                    return (
                                      <div key={idx} className="flex items-center justify-between gap-2 text-[11px] flex-wrap">
                                        <span className="font-semibold text-slate-800 dark:text-slate-100 truncate">
                                          • {it.name} <span className="font-mono font-extrabold text-[#FF6B00]">×{it.qty}</span>
                                        </span>
                                        <div className="flex items-center gap-1 shrink-0">
                                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${isDirectOnsite
                                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300'
                                            : 'bg-sky-100 text-sky-800 dark:bg-sky-500/20 dark:text-sky-300'
                                            }`}>
                                            {isDirectOnsite ? 'ส่งตรง Onsite' : 'ส่งช่าง Prep เทส'}
                                          </span>
                                          <span className={`px-1.5 py-0.5 rounded font-mono text-[9px] font-bold ${isEnough
                                            ? 'bg-teal-100 text-teal-800 dark:bg-teal-500/20 dark:text-teal-300'
                                            : 'bg-rose-100 text-rose-800 dark:bg-rose-500/20 dark:text-rose-300'
                                            }`}>
                                            {isAlreadyAllocated
                                              ? 'เบิกให้โปรเจกต์แล้ว'
                                              : isEnough
                                                ? `คลังมี ${avail}`
                                                : `ขาด ${needFromWarehouse - avail}`}
                                          </span>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              ) : (
                                <div className="text-[11px] text-slate-500">ไม่มีรายการอุปกรณ์ที่ต้องเบิกเพิ่มในรอบนี้</div>
                              )}
                            </div>
                            <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
                              {(() => {
                                let anyNeedsWarehouseCut = false;
                                const hasAllVisitStock = visit.items_to_take.every(it => {
                                  if (/ค่าบริการ|ค่าแรง/.test(it.name || '')) return true;
                                  const pi =
                                    (it.project_item_id && prj.items.find(i => i.id === it.project_item_id)) ||
                                    prj.items.find(i => i.model_name === it.name);
                                  const unallocatedInPrj = pi
                                    ? Math.max(0, (pi.qty_required || 0) - (pi.qty_allocated || 0))
                                    : it.qty;
                                  const needFromWarehouse = Math.min(it.qty, unallocatedInPrj);
                                  if (needFromWarehouse <= 0) return true;
                                  anyNeedsWarehouseCut = true;
                                  const key = (it.name || '').trim().toLowerCase();
                                  return (stockCountByName[key] || 0) >= needFromWarehouse;
                                });
                                if (!hasAllVisitStock) {
                                  return (
                                    <>
                                      <span className="text-[11px] font-bold text-rose-700 dark:text-rose-300">
                                        ของในคลังไม่พอ — ต้องสั่ง PO ก่อน
                                      </span>
                                      <button disabled={readOnly}
                                        type="button"
                                        onClick={() => openStockPoFromProject(prj)}
                                        className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-[#FF6B00] to-[#E65A00] hover:from-[#FF8A24] text-black font-extrabold text-[11px] cursor-pointer flex items-center gap-1 shadow-sm"
                                      >
                                        <ShoppingCart className="w-3.5 h-3.5" />
                                        <span>สั่ง PO โปรเจกต์</span>
                                      </button>
                                    </>
                                  );
                                }
                                return (
                                  <button
                                    type="button"
                                    disabled={readOnly || (isReleasingProjectStock)}
                                    onClick={() => void runProjectStockAction(async () => {
                                      const res = await cutStockForSiteVisit(prj.id, visit.id);
                                      if (!res) return 'ปล่อยรอบไม่ได้ กรุณาตรวจสอบสถานะรอบและยอดของในคลัง';
                                      return anyNeedsWarehouseCut
                                        ? `ตัดสต๊อกรอบเข้าไซต์ ${visit.id} (${prj.id}) เรียบร้อยแล้ว`
                                        : `ยืนยันปล่อยรอบเข้าไซต์ ${visit.id} (${prj.id}) เรียบร้อยแล้ว`;
                                    })}
                                    className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-[#FF6B00] to-[#E65A00] hover:from-[#FF8A24] text-black font-extrabold text-[11px] cursor-pointer flex items-center gap-1 shadow-sm"
                                  >
                                    <CheckCircle className="w-3.5 h-3.5" />
                                    <span>{anyNeedsWarehouseCut ? 'ตัดสต๊อกรอบเข้าไซต์' : 'ยืนยันปล่อยรอบเข้าไซต์ (เบิกครบแล้ว)'}</span>
                                  </button>
                                );
                              })()}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 pt-1">
                    <span className="text-[11px] font-extrabold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      รายการโปรเจกต์ทั้งหมด ({projects.length})
                    </span>
                    <div className="flex-1 h-px bg-slate-200 dark:bg-white/[0.08]" />
                  </div>
                </div>
              );
            })()}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {projects.map((prj) => {
                const st = getProjectStockStatus(prj);
                const addonItems = (prj.items || []).filter(i => i.is_addon);
                const addonSales = Array.from(new Set(addonItems.map(i => i.added_by).filter(Boolean)));
                const pendingRows = st.physicalRows.filter(r => r.remainingToAllocate > 0);
                const dispatchedCount = Math.max(0, st.physicalRows.length - pendingRows.length);
                return (
                  <div
                    key={prj.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => openProjectActionModal(prj)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        openProjectActionModal(prj);
                      }
                    }}
                    className="text-left p-4 rounded-2xl liquid-glass-card border border-purple-300 dark:border-purple-500/35 hover:border-purple-500 transition active:scale-[0.99] cursor-pointer flex flex-col justify-between gap-3"
                  >
                    <div className="space-y-2.5">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2">
                          <span className="px-2.5 py-0.5 rounded-lg bg-purple-600 text-white font-mono font-extrabold text-xs">
                            {prj.id}
                          </span>
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 text-slate-800 border border-slate-300 dark:bg-white/[0.06] dark:text-slate-200 dark:border-white/[0.1]">
                            เบิกส่งไซต์แล้ว {dispatchedCount}/{st.physicalRows.length} รายการสินค้า
                          </span>
                        </div>
                        {pendingRows.length === 0 && st.rows.length > 0 ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-emerald-600 text-white shadow-sm">
                            <CheckCircle className="w-3 h-3" />
                            Site นี้เบิกของครบแล้ว
                          </span>
                        ) : st.allSufficient ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-100 text-emerald-900 border border-emerald-300 dark:bg-emerald-500/20 dark:text-emerald-300 dark:border-emerald-500/40">
                            <CheckCircle className="w-3 h-3" />
                            ครบพร้อมเบิก
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-rose-100 text-rose-900 border border-rose-300 dark:bg-rose-500/20 dark:text-rose-300 dark:border-rose-500/40">
                            <AlertTriangle className="w-3 h-3" />
                            ขาดของ {st.shortageItemCount} รายการ ({st.totalShortage} ชิ้น)
                          </span>
                        )}
                      </div>

                      <div>
                        <div className="text-sm font-extrabold text-slate-900 dark:text-white truncate">{prj.site_name}</div>
                        <div className="text-[11px] text-slate-600 dark:text-slate-400 truncate mt-0.5">
                          ลูกค้า: <strong className="text-slate-900 dark:text-white">{prj.customer_name}</strong> • เปิดโดย {prj.created_by}
                        </div>
                      </div>

                      {pendingRows.length === 0 && st.rows.length > 0 && (
                        <div className="px-3 py-2 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 text-xs font-extrabold text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5">
                          <CheckCircle className="w-4 h-4 shrink-0" />
                          <span>Site นี้เบิกของครบทุกรายการตามที่ Sale เปิดบิลแล้ว</span>
                        </div>
                      )}

                      {/* สรุปสินค้าค้างส่งเข้าไซต์ & เส้นทาง (ช่าง Prep vs ส่งตรง Onsite) */}
                      {pendingRows.length > 0 && (
                        <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.06] space-y-1.5">
                          <div className="text-[10px] font-bold text-slate-500 dark:text-slate-400">
                            รายการที่รอเบิกส่งเข้าไซต์ ({pendingRows.length} รายการ):
                          </div>
                          {pendingRows.slice(0, 3).map((r) => {
                            const isDirectOnsite = r.item.item_type !== 'equipment' || isNonPrepCableOrConsumable(r.item.model_name);
                            return (
                              <div key={r.item.id} className="flex items-center justify-between gap-2 text-[11px]">
                                <span className="font-semibold text-slate-800 dark:text-slate-200 truncate">
                                  • {r.item.model_name} <span className="font-mono font-bold text-[#FF6B00]">×{r.remainingToAllocate}</span>
                                </span>
                                <div className="flex items-center gap-1 shrink-0">
                                  <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${isDirectOnsite
                                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300'
                                    : 'bg-sky-100 text-sky-800 dark:bg-sky-500/20 dark:text-sky-300'
                                    }`}>
                                    {isDirectOnsite ? 'ส่งตรง Onsite' : 'ส่งช่าง Prep'}
                                  </span>
                                  <span className={`px-1.5 py-0.5 rounded font-mono text-[9px] font-bold ${r.shortage > 0
                                    ? 'bg-rose-100 text-rose-800 dark:bg-rose-500/20 dark:text-rose-300'
                                    : 'bg-teal-100 text-teal-800 dark:bg-teal-500/20 dark:text-teal-300'
                                    }`}>
                                    {r.shortage > 0 ? `ขาด ${r.shortage}` : `พร้อม (มี ${r.available})`}
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                          {pendingRows.length > 3 && (
                            <div className="text-[10px] text-slate-500 dark:text-slate-400">
                              + อีก {pendingRows.length - 3} รายการ (คลิกเพื่อดูทั้งหมด)
                            </div>
                          )}
                        </div>
                      )}

                      <div className="flex items-center gap-1.5 flex-wrap">
                        {addonSales.map(s => (
                          <span key={s} className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300 dark:bg-amber-500/20 dark:text-amber-300 dark:border-amber-500/35">
                            แอดเพิ่มโดย {s}
                          </span>
                        ))}
                        {st.linkedPOs.length > 0 && (
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-purple-100 text-purple-900 border border-purple-300 dark:bg-purple-500/20 dark:text-purple-300">
                            PO ผูกโปรเจกต์ {st.linkedPOs.length} ใบ
                          </span>
                        )}
                        {st.pendingFieldRequests.length > 0 && (
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-rose-600 text-white animate-pulse">
                            ช่างหน้างานขอเบิกเพิ่ม {st.pendingFieldRequests.length} รายการ
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-200 dark:border-white/[0.08] text-xs">
                      <span className="text-[11px] text-slate-600 dark:text-slate-400">
                        งวดเบิกแล้ว {prj.batches?.length || 0} งวด • ทั้งหมด {prj.items.length} รายการ
                      </span>
                      <span className="font-extrabold text-purple-700 dark:text-purple-300 flex items-center gap-1">
                        จัดการเบิกของ / สั่ง PO <ChevronRight className="w-4 h-4" />
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ================= TAB 2: PO TRACKING ================= */}
        {mainTab === 'po_tracking' && (
          <div className="space-y-5 mt-4">
            <label className="block max-w-xl space-y-1 text-sm font-semibold">
              <span>ค้นหาใบสั่งซื้อ</span>
              <input type="search" value={stockPoSearch} onChange={event => {
                setStockPoSearch(event.target.value);
                orderedStockPoList.setPage(1);
                receivedStockPoList.setPage(1);
              }}
                placeholder="เลข PO, ผู้ขาย, สินค้า หรือเลขเอกสารผู้ขาย"
                className="min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 dark:border-slate-700 dark:bg-slate-900" />
            </label>
            {/* Box 1: Stock POs waiting for delivery (ordered only) */}
            <div className="p-3 sm:p-4 rounded-2xl bg-purple-50/40 dark:bg-purple-500/[0.04] border border-purple-200 dark:border-purple-500/25 space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <span className="text-xs font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                  <PackageSearch className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                  <span className="sm:hidden">Stock PO รอของเข้า</span>
                  <span className="hidden sm:inline">รายการสั่งซื้อที่รอรับสินค้า</span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-purple-600 text-white">
                    {orderedStockPOs.length}
                  </span>
                </span>
                <button disabled={readOnly}
                  type="button"
                  onClick={openStockPoModal}
                  className="px-3 py-1.5 rounded-xl border bg-emerald-700 hover:bg-emerald-800 text-white border-emerald-700 text-[11px] font-bold transition cursor-pointer flex items-center gap-1 active:scale-95"
                >
                  <PackagePlus className="w-3.5 h-3.5" />
                  <span>สร้างใบสั่งซื้อ</span>
                </button>
              </div>
              {orderedStockPoList.total === 0 ? (
                <div className="text-center py-6 text-slate-500 border border-dashed border-purple-300/70 dark:border-white/[0.1] rounded-xl bg-white/60 dark:bg-transparent">
                  <PackageSearch className="w-7 h-7 mx-auto mb-1.5 text-slate-400 dark:text-slate-600" />
                  <p className="text-xs font-medium text-slate-700 dark:text-slate-300">{stockPoSearch.trim() ? 'ไม่พบรายการรอรับที่ตรงกับคำค้น' : 'ยังไม่มีรายการรอรับ'}</p>
                </div>
              ) : (
                <>
                  <ListControls
                    from={orderedStockPoList.from}
                    to={orderedStockPoList.to}
                    total={orderedStockPoList.total}
                    page={orderedStockPoList.page}
                    totalPages={orderedStockPoList.totalPages}
                    pageSize={orderedStockPoList.pageSize}
                    sort={orderedStockPoList.sort}
                    onSortChange={orderedStockPoList.setSort}
                    onPageSizeChange={orderedStockPoList.setPageSize}
                    onPageChange={orderedStockPoList.setPage}
                    pageSizeOptions={[10, 20, 30]}
                    unit="รายการ"
                    className="mb-2"
                  />
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2.5">
                    {orderedStockPoList.pageItems.map((po) => {
                      const document = getStockPoDocument(po);
                      return (
                        <button
                          key={po.id}
                          type="button"
                          onClick={() => openPoDetail(po)}
                          className="text-left p-3.5 rounded-2xl liquid-glass-card border border-purple-200 dark:border-purple-500/25 hover:border-purple-500/60 transition active:scale-[0.99] cursor-pointer flex flex-col gap-2 min-h-[136px]"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="px-2 py-0.5 rounded-md bg-purple-100 text-purple-900 border border-purple-300 dark:bg-purple-500/15 dark:text-purple-300 dark:border-purple-500/30 font-mono text-[10px] font-bold truncate">
                              {document?.number || po.po_number}
                            </span>
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-900 border border-purple-300 dark:bg-purple-500/15 dark:text-purple-300 dark:border-purple-500/30 whitespace-nowrap">
                              รอของเข้า
                            </span>
                          </div>
                          <div className="min-w-0 space-y-1">
                            <div className="flex items-start justify-between gap-2">
                              <div className="text-[15px] sm:text-base font-black text-slate-900 dark:text-white leading-snug line-clamp-2">
                                {po.product_name}
                              </div>
                              <span className="px-2 py-0.5 rounded-lg bg-[#FF6B00] text-black font-mono font-black text-xs shrink-0 shadow-sm data-key">
                                ×{po.qty}
                              </span>
                            </div>
                            <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                              {po.supplier || '-'} • {PRODUCT_CATEGORY_LABELS[po.category]}
                              {po.project_id ? ` • ผูก ${po.project_id}` : ''}
                            </div>
                            {document?.source?.kind === 'sales' && (
                              <div className="text-[10px] font-bold text-[#C2410C] dark:text-[#FF8A24] truncate">
                                บิลขาย {document.source.reference}
                              </div>
                            )}
                          </div>
                          <div className="flex items-center justify-between gap-1.5 flex-wrap mt-auto pt-1">
                            <span className="text-[10px] text-rose-700 dark:text-rose-300/80 font-mono font-bold data-key">ทุน ฿{fmt(po.unit_cost)}/หน่วย</span>
                            <span
                              className="px-2.5 py-1.5 rounded-xl bg-gradient-to-r from-teal-700 to-emerald-800 hover:from-teal-800 text-white text-[11px] font-extrabold cursor-pointer active:scale-95 transition flex items-center gap-1 shadow-sm"
                            >
                              <ShieldCheck className="w-3.5 h-3.5" />
                              <span>เปิดใบ / รับของ</span>
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </div>

            {/* Box 2: Received Stock POs (รับแล้ว) */}
            <div className="p-3 sm:p-4 rounded-2xl bg-teal-50/50 dark:bg-teal-500/[0.04] border border-teal-200 dark:border-teal-500/25 space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <span className="text-xs font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                  <span className="sm:hidden">Stock PO รับเข้าคลังแล้ว</span>
                  <span className="hidden sm:inline">รายการสั่งซื้อที่รับสินค้าแล้ว</span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-teal-600 text-white">
                    {receivedStockPOs.length}
                  </span>
                </span>
              </div>
              {receivedStockPoList.total === 0 ? (
                <div className="text-center py-6 text-slate-500 border border-dashed border-teal-300/70 dark:border-white/[0.1] rounded-xl bg-white/60 dark:bg-transparent">
                  <CheckCircle className="w-7 h-7 mx-auto mb-1.5 text-teal-500/60" />
                  <p className="text-xs font-medium text-slate-700 dark:text-slate-300">{stockPoSearch.trim() ? 'ไม่พบรายการรับแล้วที่ตรงกับคำค้น' : 'ยังไม่มีรายการรับสินค้าแล้ว'}</p>
                </div>
              ) : (
                <>
                  <ListControls
                    from={receivedStockPoList.from}
                    to={receivedStockPoList.to}
                    total={receivedStockPoList.total}
                    page={receivedStockPoList.page}
                    totalPages={receivedStockPoList.totalPages}
                    pageSize={receivedStockPoList.pageSize}
                    sort={receivedStockPoList.sort}
                    onSortChange={receivedStockPoList.setSort}
                    onPageSizeChange={receivedStockPoList.setPageSize}
                    onPageChange={receivedStockPoList.setPage}
                    pageSizeOptions={[10, 20, 30]}
                    unit="รายการ"
                    className="mb-2"
                  />
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2.5">
                    {receivedStockPoList.pageItems.map((po) => (
                      <button
                        key={po.id}
                        type="button"
                        onClick={() => openPoDetail(po)}
                        className="text-left p-3.5 rounded-2xl liquid-glass-card border border-teal-200 dark:border-teal-500/25 hover:border-teal-500/60 transition active:scale-[0.98] cursor-pointer flex flex-col gap-2 min-h-[120px]"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="px-2 py-0.5 rounded-md bg-teal-100 text-teal-900 border border-teal-300 dark:bg-teal-500/15 dark:text-teal-300 dark:border-teal-500/30 font-mono text-[10px] font-bold truncate">
                            {getStockPoDocument(po)?.number || po.po_number}
                          </span>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-teal-100 text-teal-900 border border-teal-300 dark:bg-teal-500/15 dark:text-teal-300 dark:border-teal-500/30 whitespace-nowrap">
                            รับเข้าแล้ว
                          </span>
                        </div>
                        <div className="min-w-0 space-y-1">
                          <div className="flex items-start justify-between gap-2">
                            <div className="text-[15px] sm:text-base font-black text-slate-900 dark:text-white leading-snug line-clamp-2">
                              {po.product_name}
                            </div>
                            <span className="px-2 py-0.5 rounded-lg bg-[#FF6B00]/15 text-[#C2410C] dark:text-[#FF6B00] font-mono font-black text-xs shrink-0 data-key">
                              ×{po.qty}
                            </span>
                          </div>
                          <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                            {po.supplier || '-'} • {PRODUCT_CATEGORY_LABELS[po.category]}
                            {po.project_id ? ` • ผูก ${po.project_id}` : ''}
                          </div>
                        </div>
                        <div className="flex items-center justify-between gap-1.5 flex-wrap mt-auto">
                          <span className="text-[10px] text-rose-700 dark:text-rose-300/80 font-mono font-bold data-key">ทุน ฿{fmt(po.unit_cost)}/หน่วย</span>
                          {po.received_at && (
                            <span className="text-[10px] font-mono text-teal-700 dark:text-teal-300">
                              รับ {formatThaiDateTime(po.received_at)}
                            </span>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* ================= TAB 3: INVENTORY ================= */}
        {mainTab === 'inventory' && (
          <div className="space-y-4 mt-4">
            {/* Storage Room batches with 7-day DOA countdown */}
            <div>
              <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                <span className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                  <Warehouse className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 dark:bg-amber-400 animate-pulse shrink-0" aria-hidden="true" />
                  <span>ห้องสต๊อก - ของรับเข้าแล้ว ยังไม่เตรียม (DOA 7 วัน)</span>
                </span>
                <span className="text-[11px] text-slate-600 dark:text-slate-400">
                  {rawStockBatches.length} batch • รวม {rawStockItems.length} เครื่อง
                </span>
              </div>
              {rawStockBatches.length === 0 ? (
                <div className="text-center py-8 text-slate-500 border border-dashed border-slate-300 dark:border-white/[0.1] rounded-xl">
                  <Warehouse className="w-8 h-8 mx-auto mb-2 text-slate-400 dark:text-slate-600" />
                  <p className="text-xs font-medium text-slate-700 dark:text-slate-300">ห้องสต๊อกว่าง ไม่มีของรอเตรียม</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2.5">
                  {rawStockBatches.map((batch) => {
                    const daysLeft = getDoaDaysLeft(batch.received_at);
                    const expired = daysLeft === 0;
                    const batchCount = batch.itemIds.length;
                    return (
                      <button
                        key={batch.key}
                        type="button"
                        onClick={() => setBatchDetail(batch)}
                        className="text-left p-3.5 rounded-2xl liquid-glass-card border border-slate-200 dark:border-white/[0.08] hover:border-amber-500/40 transition active:scale-[0.98] cursor-pointer flex flex-col gap-2 min-h-[120px]"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="text-sm font-bold text-slate-900 dark:text-white truncate">{batch.model_name}</div>
                            <div className="text-[10px] text-slate-600 dark:text-slate-400 font-mono truncate data-meta">PO: {batch.po_no} • {batch.supplier}</div>
                          </div>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap flex items-center gap-1 ${expired
                            ? 'bg-rose-100 text-rose-900 border border-rose-300 dark:bg-rose-500/15 dark:text-rose-300 dark:border-rose-500/30'
                            : daysLeft <= 2
                              ? 'bg-amber-100 text-amber-900 border border-amber-300 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30'
                              : 'bg-emerald-100 text-emerald-900 border border-emerald-300 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30'
                            }`}>
                            <Timer className="w-3 h-3" />
                            {expired ? 'ครบ 7 วัน' : `เหลือ ${daysLeft} วัน`}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 flex-wrap mt-auto">
                          <span className="px-2 py-0.5 rounded-md text-[11px] font-extrabold bg-[#FF6B00]/15 text-[#C2410C] dark:text-[#FF6B00] border border-[#FF6B00]/30 whitespace-nowrap data-key">
                            {batchCount} เครื่อง
                          </span>
                          <span className="text-[10px] text-slate-500 data-meta">
                            รับเข้า: {batch.received_at ? new Date(batch.received_at).toLocaleDateString('th-TH') : '-'}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Inventory list */}
            <div>
              <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
                <span className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                  <Boxes className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  <span>สินค้าคงเหลือพร้อมใช้ (Inventory)</span>
                </span>
                <span className="text-[11px] text-slate-600 dark:text-slate-400">
                  {filteredInventoryGroups.length} รุ่น • รวม {filteredInventoryGroups.reduce((sum, g) => sum + g.qty, 0)} เครื่อง
                </span>
              </div>

              {/* Search */}
              <div className="relative mb-2">
                <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="ค้นหารุ่นสินค้า..."
                  value={inventorySearch}
                  onChange={(e) => setInventorySearch(e.target.value)}
                  className="w-full liquid-glass-input rounded-xl pl-9 pr-3 py-2 text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none"
                />
              </div>

              {/* Category Filter Bar */}
              <div className="flex items-center gap-1.5 mb-3 overflow-x-auto no-scrollbar pb-1">
                {inventoryCategoryOptions.map(opt => {
                  const isActive = stockCategoryFilter === opt.value;
                  const count = opt.value === 'all'
                    ? inventoryGroups.length
                    : (inventoryCategoryCounts[opt.value] || 0);
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setStockCategoryFilter(opt.value)}
                      className={`px-3 py-1.5 rounded-full text-[11px] font-bold whitespace-nowrap transition border cursor-pointer flex items-center gap-1.5 active:scale-95 ${isActive
                        ? 'bg-emerald-100 border-emerald-400 text-emerald-900 dark:bg-emerald-500/20 dark:border-emerald-500/50 dark:text-emerald-200'
                        : 'bg-slate-50 dark:bg-white/[0.02] border-slate-200 dark:border-white/[0.08] text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/[0.05]'
                        }`}
                    >
                      <span>{opt.label}</span>
                      <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono ${isActive ? 'bg-emerald-200 text-emerald-900 dark:bg-emerald-500/30 dark:text-emerald-100' : 'bg-slate-200 dark:bg-white/10 text-slate-600 dark:text-slate-400'
                        }`}>{count}</span>
                    </button>
                  );
                })}
              </div>

              {filteredInventoryGroups.length === 0 ? (
                <div className="text-center py-8 text-slate-500 border border-dashed border-slate-300 dark:border-white/[0.1] rounded-xl">
                  <Boxes className="w-8 h-8 mx-auto mb-2 text-slate-400 dark:text-slate-600" />
                  <p className="text-xs font-medium text-slate-700 dark:text-slate-300">ไม่มีสินค้าคงเหลือในหมวดนี้</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">สินค้าที่สต๊อกหมด (0 ชิ้น) จะไม่แสดงในรายการนี้</p>
                </div>
              ) : (
                <>
                  <ListControls
                    from={inventoryList.from}
                    to={inventoryList.to}
                    total={inventoryList.total}
                    page={inventoryList.page}
                    totalPages={inventoryList.totalPages}
                    pageSize={inventoryList.pageSize}
                    sort={inventoryList.sort}
                    onSortChange={inventoryList.setSort}
                    onPageSizeChange={inventoryList.setPageSize}
                    onPageChange={inventoryList.setPage}
                    unit="รุ่น"
                    className="mb-2"
                  />
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2.5">
                    {inventoryCards.map(g => (
                      <button
                        key={g.key}
                        type="button"
                        onClick={() => setInventoryDetail(g)}
                        className="text-left p-3.5 rounded-2xl liquid-glass-card border border-slate-200 dark:border-white/[0.08] hover:border-emerald-500/40 transition active:scale-[0.98] cursor-pointer flex items-center justify-between gap-3 min-h-[96px]"
                      >
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="text-sm font-bold text-slate-900 dark:text-white truncate">{g.model_name}</div>
                          <span className="inline-block px-2 py-0.5 rounded-md text-[10px] font-bold bg-blue-100 text-blue-900 border border-blue-300 dark:bg-blue-500/15 dark:text-blue-300 dark:border-blue-500/30 whitespace-nowrap">
                            {PRODUCT_CATEGORY_LABELS[g.category]}
                          </span>
                          <div className="text-[10px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5 flex-wrap">
                            <span className="text-amber-700 dark:text-amber-300 font-medium">สต๊อก {g.rawCount}</span>
                            <span className="text-slate-400 dark:text-slate-600">/</span>
                            <span className="text-emerald-700 dark:text-emerald-300 font-medium">พร้อม {g.readyCount}</span>
                          </div>
                        </div>
                        <div className="flex-shrink-0 text-right">
                          <div className="px-3 py-1.5 rounded-xl bg-emerald-100 dark:bg-emerald-500/15 border border-emerald-300 dark:border-emerald-500/30">
                            <span className="text-lg font-extrabold font-mono text-emerald-800 dark:text-emerald-300 leading-none tabular-nums">{g.qty}</span>
                            <span className="text-[10px] text-emerald-700 dark:text-emerald-400/80 ml-1">เครื่อง</span>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* ================= TAB 4: DOA CLAIMS (แจ้งจากช่าง) ================= */}
        {mainTab === 'doa_claims' && (
          <div className="space-y-4 mt-4">
            {/* Stage Filter Pills */}
            <div className="flex overflow-x-auto no-scrollbar sm:grid sm:grid-cols-4 gap-1.5 pb-0.5 sm:pb-0">
              {[
                { key: 'all' as const, label: 'ทั้งหมด', count: allDoaItems.length, activeCls: 'bg-slate-900 text-white border-slate-900 dark:bg-white/15 dark:text-white dark:border-white/30' },
                { key: 'doa_reported' as const, label: 'รอแจ้งเคลม Supplier', count: doaReportedItems.length, activeCls: 'bg-rose-500/15 dark:bg-rose-500/20 border-rose-500/50 text-rose-900 dark:text-white' },
                { key: 'doa_sent_supplier' as const, label: 'ส่งเคลม Supplier แล้ว', count: doaSentItems.length, activeCls: 'bg-amber-500/15 dark:bg-amber-500/20 border-amber-500/50 text-amber-900 dark:text-white' },
                { key: 'doa_replaced' as const, label: 'รับตัวใหม่แล้ว', count: doaReplacedItems.length, activeCls: 'bg-emerald-500/15 dark:bg-emerald-500/20 border-emerald-500/50 text-emerald-900 dark:text-white' },
              ].map((pill) => {
                const isSelected = doaStageFilter === pill.key;
                return (
                  <button
                    key={pill.key}
                    type="button"
                    onClick={() => setDoaStageFilter(pill.key)}
                    className={`px-3 py-1.5 sm:py-2 rounded-xl text-[11px] font-bold transition active:scale-[0.97] border flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap flex-shrink-0 ${isSelected
                      ? pill.activeCls
                      : 'bg-slate-50 dark:bg-white/[0.02] border-slate-200 dark:border-white/[0.06] text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                      }`}
                  >
                    <span className="truncate">{pill.label}</span>
                    <span className="px-1.5 py-0.5 rounded-full text-[10px] font-mono bg-slate-200 dark:bg-white/10 text-slate-800 dark:text-slate-200">
                      {pill.count}
                    </span>
                  </button>
                );
              })}
            </div>

            {filteredDoaItems.length === 0 ? (
              <div className="text-center py-10 text-slate-500 border border-dashed border-slate-300 dark:border-white/[0.1] rounded-2xl">
                <ShieldCheck className="w-9 h-9 mx-auto mb-2 text-emerald-500/70" />
                <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">ไม่มีรายการเคลมของเสีย DOA ในหมวดนี้</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2.5">
                {filteredDoaItems.map((item) => {
                  const elapsed = item.status === 'doa_sent_supplier' ? getElapsedDays(item.doa_sent_date) : 0;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => openDoaClaimModal(item)}
                      className="text-left p-3.5 rounded-2xl liquid-glass-card border border-slate-200 dark:border-white/[0.08] hover:border-rose-500/50 transition active:scale-[0.98] cursor-pointer flex flex-col gap-2 min-h-[145px]"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-800 border border-slate-300 dark:bg-white/[0.06] dark:text-slate-200 dark:border-white/[0.1] font-mono text-[10px] font-bold truncate">
                          {item.po_no || 'Stock PO'}
                        </span>
                        {item.status === 'doa_reported' && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-900 border border-rose-300 dark:bg-rose-500/20 dark:text-rose-300 dark:border-rose-500/35 whitespace-nowrap flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
                            รอแจ้งเคลม Supplier
                          </span>
                        )}
                        {item.status === 'doa_sent_supplier' && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300 dark:bg-amber-500/20 dark:text-amber-300 dark:border-amber-500/35 whitespace-nowrap">
                            ส่งเคลมแล้ว • {elapsed} วัน
                          </span>
                        )}
                        {item.status === 'doa_replaced' && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-900 border border-emerald-300 dark:bg-emerald-500/20 dark:text-emerald-300 dark:border-emerald-500/35 whitespace-nowrap">
                            รับตัวใหม่แล้ว
                          </span>
                        )}
                      </div>

                      <div className="min-w-0 space-y-0.5">
                        <div className="text-sm font-bold text-slate-900 dark:text-white truncate">{item.model_name}</div>
                        <div className="text-[11px] text-slate-600 dark:text-slate-400 truncate">
                          Supplier: <span className="font-semibold text-slate-800 dark:text-slate-200">{item.supplier || '-'}</span>
                        </div>
                        <div className="text-[11px] font-mono text-[#C2410C] dark:text-[#FF6B00] truncate">
                          S/N: {item.serial_number || 'ไม่ระบุ S/N'}
                        </div>
                      </div>

                      <div className="p-2 rounded-xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/25 text-[11px] text-rose-900 dark:text-rose-200 line-clamp-2">
                        <strong>อาการ:</strong> {item.doa_reason || '-'}
                      </div>

                      <div className="flex items-center justify-between gap-2 text-[10px] text-slate-500 dark:text-slate-400 mt-auto pt-1 border-t border-slate-200/70 dark:border-white/[0.06]">
                        <span className="truncate">แจ้งโดย: {item.doa_reported_by || '-'}</span>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {item.photo_urls && item.photo_urls.length > 0 && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-500/15 dark:text-blue-300 dark:border-blue-500/30 font-bold">
                              <Camera className="w-3 h-3" />
                              {item.photo_urls.length}
                            </span>
                          )}
                          <span className="font-mono">{item.doa_rma_no ? `RMA: ${item.doa_rma_no}` : formatThaiDateTime(item.doa_reported_at)}</span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* STOCK ACTION MODAL (ออเดอร์รอดำเนินการ - เปรียบเทียบสต๊อก & ปุ่มดำเนินการ)   */}
      {/* ========================================================================= */}
      {actionOrder && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-800 shadow-2xl rounded-3xl w-full sm:w-[92vw] max-w-3xl max-h-[88dvh] sm:max-h-[90vh] flex flex-col overflow-hidden animate-modal-pop">
            <div className="p-4 sm:p-5 bg-slate-50/90 dark:bg-slate-900/95 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 flex-shrink-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="p-2.5 rounded-2xl bg-[#FF6B00]/15 text-[#E65A00] dark:text-[#FF6B00] border border-[#FF6B00]/30">
                  <ClipboardList className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white leading-tight truncate">
                    {actionOrder.sales_ref || 'SO'} • {actionOrder.customer_name}
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{actionOrder.delivery_location}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActionOrder(null)}
                className="p-2.5 rounded-xl text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white bg-slate-100 dark:bg-white/[0.04] hover:bg-slate-200 dark:hover:bg-white/[0.08] transition min-w-[44px] min-h-[44px] flex items-center justify-center flex-shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 text-xs">
              {/* Order meta */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700">
                  <div className="text-[10px] text-slate-500 dark:text-slate-400">วันที่ส่งมอบ</div>
                  <div className="font-mono text-amber-700 dark:text-amber-300 font-semibold">
                    {actionOrder.delivery_date ? new Date(actionOrder.delivery_date).toLocaleDateString('th-TH') : '-'}
                  </div>
                </div>
                <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700">
                  <div className="text-[10px] text-slate-500 dark:text-slate-400">การส่งมอบ</div>
                  <div className="font-semibold text-emerald-700 dark:text-emerald-400">
                    {actionOrder.delivery_mode === 'install' && 'ส่งพร้อมติดตั้ง'}
                    {actionOrder.delivery_mode === 'drop_off' && 'ส่งไม่ต้องติดตั้ง'}
                    {actionOrder.delivery_mode === 'customer_pickup' && 'ลูกค้ารับเองหน้าร้าน'}
                    {actionOrder.delivery_mode === 'project' && 'งานโครงการ / รับเหมา'}
                    {!actionOrder.delivery_mode && 'ส่งพร้อมติดตั้ง'}
                  </div>
                </div>
                <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700">
                  <div className="text-[10px] text-slate-500 dark:text-slate-400">เซลล์ผู้ขาย</div>
                  <div className="font-semibold text-slate-900 dark:text-white truncate">{actionOrder.salesperson || '-'}</div>
                </div>
                {actionOrder.site_notes && (
                  <div className="sm:col-span-3 p-2.5 rounded-xl bg-amber-50 dark:bg-white/[0.02] border border-amber-200 dark:border-white/[0.05] text-[11px]">
                    <span className="text-slate-600 dark:text-slate-400">หมายเหตุหน้างาน: </span>
                    <span className="text-amber-900 dark:text-amber-200">{actionOrder.site_notes}</span>
                  </div>
                )}
              </div>

              {/* Item-by-item stock comparison */}
              <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 overflow-hidden">
                <div className="p-3 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between gap-2 text-[11px] font-bold text-slate-700 dark:text-slate-300">
                  <span className="flex items-center gap-2">
                    <Boxes className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    <span>เปรียบเทียบสต๊อกกับรายการในบิล (in_stock + raw_stock)</span>
                  </span>
                  {renderStockStatusBadge(actionOrder)}
                </div>
                <div className="p-3 space-y-2">
                  {(actionOrder.items_list && actionOrder.items_list.length > 0
                    ? actionOrder.items_list
                    : [{ model_name: actionOrder._planned_model || 'BossComputech Workstation', quantity: actionOrder._planned_quantity || 1, item_type: 'hardware' as const }]
                  ).map((it, idx) => {
                    const isSvc = isServiceItem(it.model_name, it.item_type, products);
                    const available = isSvc ? 0 : getAvailableStock(it.model_name);
                    const ordered = it.quantity || 1;
                    const shortage = isSvc ? 0 : Math.max(0, ordered - available);
                    const sufficient = isSvc || available >= ordered;
                    const matchingStock = isSvc ? [] : items.filter(s => s.status === 'in_stock' && s.model_name === it.model_name);
                    const pickedStockId = stockPickInputs[`${actionOrder.id}:${idx}`] || '';
                    return (
                      <div key={idx} className="p-2.5 rounded-xl bg-white dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.06] space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 min-w-0">
                            {isSvc ? (
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-purple-100 text-purple-900 border border-purple-300 dark:bg-purple-500/20 dark:text-purple-300 dark:border-purple-500/30">บริการ (ไม่ต้องตัดสต๊อก)</span>
                            ) : (
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-blue-100 text-blue-900 border border-blue-300 dark:bg-blue-500/20 dark:text-blue-300 dark:border-blue-500/30">อุปกรณ์</span>
                            )}
                            <span className="text-slate-900 dark:text-white font-bold truncate">{it.model_name}</span>
                          </div>
                          <span className="px-2 py-0.5 rounded-md bg-[#FF6B00]/15 text-[#C2410C] dark:text-[#FF6B00] font-mono font-extrabold text-[11px] whitespace-nowrap">x{ordered}</span>
                        </div>
                        {!isSvc && (
                          <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold border ${sufficient
                            ? 'bg-emerald-50 text-emerald-900 border-emerald-300 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30'
                            : 'bg-rose-50 text-rose-900 border-rose-300 dark:bg-rose-500/15 dark:text-rose-300 dark:border-rose-500/35'
                            }`}>
                            {sufficient ? <CheckCircle className="w-3.5 h-3.5 shrink-0" /> : <AlertTriangle className="w-3.5 h-3.5 shrink-0" />}
                            <span>ต้องการ {ordered} ชิ้น | ในคลัง {available} ชิ้น | ขาด {shortage} ชิ้น</span>
                          </div>
                        )}
                        {matchingStock.length > 0 && (
                          <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 pt-1 min-w-0">
                            <span className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-300 whitespace-nowrap flex items-center gap-1">
                              <Boxes className="w-3 h-3 shrink-0" /> คลังพร้อมขาย ({matchingStock.length}):
                            </span>
                            <select disabled={readOnly}
                              value={pickedStockId}
                              onChange={(e) => setStockPickInputs({ ...stockPickInputs, [`${actionOrder.id}:${idx}`]: e.target.value })}
                              className="w-full sm:flex-1 min-w-0 rounded-lg px-2 py-1 text-[11px] bg-white dark:bg-slate-800 text-emerald-800 dark:text-emerald-200 border border-slate-300 dark:border-slate-700 font-mono focus:outline-none focus:border-blue-500 truncate"
                            >
                              <option value="" className="bg-white dark:bg-[#12141A]">— ตัดอัตโนมัติ (in_stock) —</option>
                              {matchingStock.map((s) => (
                                <option key={s.id} value={s.id} className="bg-white dark:bg-[#12141A]">
                                  {s.serial_number || '(ไม่มี S/N)'} • ติดโลโก้แล้ว
                                </option>
                              ))}
                            </select>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Collapsible Internal Costs */}
              <details className="rounded-2xl bg-rose-50/70 border border-rose-200 dark:bg-rose-500/[0.04] dark:border-rose-500/20 overflow-hidden">
                <summary className="p-3 cursor-pointer flex items-center justify-between gap-2 text-[11px] font-bold text-rose-800 dark:text-rose-300 select-none">
                  <span className="flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5" />
                    <span>ราคาทุน & ต้นทุน (ภายใน)</span>
                  </span>
                  <span className="text-[10px] font-medium opacity-75">คลิกเพื่อแก้ไข</span>
                </summary>
                <div className="px-3 pb-3 space-y-2.5 border-t border-rose-200 dark:border-rose-500/15 pt-2.5">
                  <div className="space-y-1.5">
                    {(actionOrder.items_list && actionOrder.items_list.length > 0
                      ? actionOrder.items_list
                      : [{ model_name: actionOrder._planned_model || 'BossComputech Workstation', quantity: actionOrder._planned_quantity || 1 }]
                    ).map((it, idx) => (
                      <div key={idx} className="grid grid-cols-[1fr_auto] gap-2 items-center">
                        <div className="text-[11px] text-slate-700 dark:text-slate-300 truncate">
                          <span className="text-slate-500 font-mono mr-1">{idx + 1}.</span>
                          {it.model_name} <span className="text-slate-500">(x{it.quantity})</span>
                        </div>
                        <NumberInput disabled={readOnly}
                          finishOnEnter
                          min={0}
                          placeholder="ราคาทุน/หน่วย"
                          value={getItemCost(actionOrder.id, idx, it.unit_cost) || ''}
                          onChange={(e) => setCostInputs({ ...costInputs, [`${actionOrder.id}:${idx}`]: parseFloat(e.target.value) || 0 })}
                          className="w-28 rounded-lg px-2 py-1 text-xs bg-white dark:bg-slate-800 text-rose-700 dark:text-rose-300 border border-slate-300 dark:border-slate-700 placeholder-slate-400 font-mono font-bold focus:outline-none focus:border-blue-500"
                        />
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center justify-between gap-2 pt-2 border-t border-rose-200 dark:border-rose-500/15">
                    <label className="text-[11px] text-slate-700 dark:text-slate-300">ต้นทุนค่าแรง/อื่นๆ (Extra Job Cost)</label>
                    <NumberInput disabled={readOnly}
                      finishOnEnter
                      min={0}
                      placeholder="0"
                      value={getExtraCost(actionOrder.id, actionOrder.extra_cost) || ''}
                      onChange={(e) => setExtraCostInputs({ ...extraCostInputs, [actionOrder.id]: parseFloat(e.target.value) || 0 })}
                      className="w-32 rounded-lg px-2 py-1 text-xs bg-white dark:bg-slate-800 text-rose-700 dark:text-rose-300 border border-slate-300 dark:border-slate-700 placeholder-slate-400 font-mono font-bold focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div className="flex justify-end">
                    <button disabled={readOnly}
                      type="button"
                      onClick={() => handleSaveCosts(actionOrder.id, actionOrder.sales_ref)}
                      className="px-3 py-1.5 rounded-xl bg-rose-100 hover:bg-rose-200 text-rose-900 border border-rose-300 dark:bg-rose-500/20 dark:hover:bg-rose-500/30 dark:text-rose-200 dark:border-rose-500/30 text-[11px] font-semibold transition cursor-pointer flex items-center gap-1 active:scale-95"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>บันทึกราคาทุน</span>
                    </button>
                  </div>
                </div>
              </details>

              {/* Collapsible Supplier / Bill / Prep Notes */}
              <details className="rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 overflow-hidden">
                <summary className="p-3 cursor-pointer flex items-center justify-between gap-2 text-[11px] font-bold text-slate-700 dark:text-slate-300 select-none">
                  <span className="flex items-center gap-1.5">
                    <FileCheck className="w-3.5 h-3.5 text-slate-500" />
                    <span>เลขที่บิล (INV) / Supplier / หมายเหตุช่างเตรียม</span>
                  </span>
                  <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400">คลิกเพื่อตั้งค่า</span>
                </summary>
                <div className="px-3 pb-3 border-t border-slate-200 dark:border-slate-700 pt-2.5 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[10px] text-slate-600 dark:text-slate-400 mb-1">Supplier</label>
                    <select disabled={readOnly}
                      value={supplierInputs[actionOrder.id] || actionOrder.items_list?.[0]?.supplier || 'สต๊อกร้าน (Main Store)'}
                      onChange={(e) => setSupplierInputs({ ...supplierInputs, [actionOrder.id]: e.target.value })}
                      className="w-full rounded-xl px-2.5 py-1.5 text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-300 dark:border-slate-700 focus:outline-none focus:border-blue-500"
                    >
                      {SUPPLIER_PRESETS.map((s) => (
                        <option key={s} value={s} className="bg-white dark:bg-[#12141A]">{s}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-600 dark:text-slate-400 mb-1">เลขที่ PO</label>
                    <input disabled={readOnly}
                      type="text"
                      placeholder="เช่น PO-2026-101"
                      value={poInputs[actionOrder.id] || actionOrder.items_list?.[0]?.po_no || ''}
                      onChange={(e) => setPoInputs({ ...poInputs, [actionOrder.id]: e.target.value })}
                      className="w-full rounded-xl px-2.5 py-1.5 text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-300 dark:border-slate-700 placeholder-slate-400 font-mono focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-600 dark:text-slate-400 mb-1">เลขที่บิล (INV)</label>
                    <input disabled={readOnly}
                      type="text"
                      placeholder="สร้างอัตโนมัติถ้าเว้นว่าง"
                      value={billInputs[actionOrder.id] || ''}
                      onChange={(e) => setBillInputs({ ...billInputs, [actionOrder.id]: e.target.value })}
                      className="w-full rounded-xl px-2.5 py-1.5 text-xs bg-white dark:bg-slate-800 text-[#C2410C] dark:text-[#FF6B00] border border-slate-300 dark:border-slate-700 font-mono font-bold focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-600 dark:text-slate-400 mb-1">Prep Note</label>
                    <input disabled={readOnly}
                      type="text"
                      placeholder="เช่น ประกอบด่วน"
                      value={prepNoteInputs[actionOrder.id] || ''}
                      onChange={(e) => setPrepNoteInputs({ ...prepNoteInputs, [actionOrder.id]: e.target.value })}
                      className="w-full rounded-xl px-2.5 py-1.5 text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-300 dark:border-slate-700 placeholder-slate-400 focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>
              </details>
            </div>

            {/* Footer: Strict State-Based Action Buttons (Case A / Case B / Case C) */}
            <div className="p-3 sm:p-4 bg-slate-50/95 dark:bg-slate-900/95 border-t border-slate-200 dark:border-slate-800 flex-shrink-0 space-y-2.5">
              {(() => {
                const readiness = getOrderPrepReadiness(actionOrder);
                const { stockStatus, stateCase, activePoLabel, pendingLinkedStockPOs } = readiness;

                // Case A — Stock Is Insufficient & No Active PO Yet
                if (stateCase === 'case_a') {
                  return (
                    <>
                      <div className="px-3.5 py-2.5 rounded-xl bg-rose-100 dark:bg-rose-500/20 border-2 border-rose-400 dark:border-rose-500/60 text-rose-950 dark:text-rose-100 text-xs font-extrabold flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-300 flex-shrink-0" />
                          <span>แนะนำสั่งซื้ออัตโนมัติ (ขาดของ {stockStatus.shortageItemCount} รายการ)</span>
                        </div>
                        <span className="px-2 py-0.5 rounded-md bg-rose-600 text-white text-[10px] font-mono whitespace-nowrap">
                          รวมขาด {stockStatus.totalShortage} ชิ้น
                        </span>
                      </div>
                      <button disabled={readOnly}
                        type="button"
                        onClick={() => openStockPoFromOrder(actionOrder)}
                        className="w-full px-5 py-3 bg-gradient-to-r from-[#FF6B00] to-[#E65A00] hover:from-[#FF8A24] text-black font-extrabold rounded-xl text-xs transition cursor-pointer flex items-center justify-center gap-2 shadow-lg shadow-[#FF6B00]/25 border border-white/20 active:scale-95"
                      >
                        <ShoppingCart className="w-4 h-4" />
                        <span>สั่งซื้อ PO รายการที่ขาดทันที</span>
                      </button>
                    </>
                  );
                }

                // Case B — Stock Is Insufficient & PO Has Already Been Ordered
                if (stateCase === 'case_b') {
                  return (
                    <>
                      <div className="px-3.5 py-2.5 rounded-xl bg-purple-100 dark:bg-purple-500/15 border border-purple-300 dark:border-purple-500/40 text-purple-950 dark:text-purple-100 text-xs font-bold flex items-center justify-between gap-2 flex-wrap">
                        <span className="inline-flex items-center gap-2">
                          <Clock className="w-4 h-4 text-purple-600 dark:text-purple-300 flex-shrink-0" />
                          <span>รอของเข้าจากใบ {activePoLabel}</span>
                        </span>
                        {pendingLinkedStockPOs.length > 0 && (
                          <span className="text-[11px] font-medium text-purple-800 dark:text-purple-300">
                            ({pendingLinkedStockPOs.length} รายการรอรับเข้าคลัง)
                          </span>
                        )}
                      </div>
                      {readiness.unorderedShortageCount > 0 && (
                        <button disabled={readOnly}
                          type="button"
                          onClick={() => openStockPoFromOrder(actionOrder)}
                          className="w-full px-5 py-2.5 bg-gradient-to-r from-[#FF6B00] to-[#E65A00] hover:from-[#FF8A24] text-black font-extrabold rounded-xl text-xs transition cursor-pointer flex items-center justify-center gap-2 shadow-md shadow-[#FF6B00]/20 border border-white/20 active:scale-95"
                        >
                          <ShoppingCart className="w-4 h-4" />
                          <span>สั่งซื้อ PO ส่วนที่ยังขาด ({readiness.unorderedShortageCount} ชิ้น)</span>
                        </button>
                      )}
                      {pendingLinkedStockPOs.length > 0 && (
                        <button
                          type="button"
                          onClick={() => { setActionOrder(null); setMainTab('po_tracking'); }}
                          className="w-full px-5 py-3 bg-purple-600 hover:bg-purple-500 text-white font-extrabold rounded-xl text-xs transition cursor-pointer flex items-center justify-center gap-1.5 shadow-lg shadow-purple-600/25 active:scale-95"
                        >
                          <Truck className="w-4 h-4" />
                          <span>ไปหน้ารอรับของเข้า (3. รอรับของเข้า PO)</span>
                        </button>
                      )}
                    </>
                  );
                }

                // Case C — Stock Is Sufficient (ขาด 0 ชิ้น & PO received)
                return (
                  <div className="space-y-2">
                    <button disabled={readOnly}
                      type="button"
                      onClick={() => reviewCutStockAndSendPrep(actionOrder.id)}
                      className="w-full px-5 py-3 bg-gradient-to-r from-emerald-700 to-teal-800 hover:from-emerald-800 text-white font-extrabold rounded-xl text-xs transition cursor-pointer flex items-center justify-center gap-1.5 shadow-lg shadow-emerald-500/25 border border-white/20 active:scale-95"
                    >
                      <Send className="w-4 h-4" />
                      <span>ตัดสต๊อกส่งช่างเตรียมติดวอย/จัดส่ง</span>
                    </button>
                    <button disabled={readOnly}
                      type="button"
                      onClick={() => {
                        reviewCutStockAndSendPrep(
                          actionOrder.id,
                          'ด่วน! รับของวันนี้ ส่งพรุ่งนี้ — ขอช่างเตรียมเทส & ติดวอยประกันวันนี้เลย'
                        );
                      }}
                      className="w-full px-4 py-2.5 bg-amber-100 hover:bg-amber-200 dark:bg-amber-500/20 dark:hover:bg-amber-500/30 text-amber-900 dark:text-amber-200 border border-amber-300 dark:border-amber-500/40 font-extrabold rounded-xl text-[11px] transition cursor-pointer flex items-center justify-center gap-1.5 active:scale-95"
                    >
                      <Timer className="w-3.5 h-3.5" />
                      <span>ด่วน! ตัดสต๊อก + แจ้งช่างเทส &amp; ติดวอยวันนี้ (ส่งพรุ่งนี้)</span>
                    </button>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ===== BATCH DETAIL MODAL ===== */}
      {batchDetail && createPortal(
        <ModalBackdrop className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-sm animate-fade-in" onDismiss={() => setBatchDetail(null)}>
          <div className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-800 shadow-2xl rounded-3xl w-full sm:w-[95vw] max-w-lg max-h-[88dvh] sm:max-h-[90vh] overflow-y-auto overscroll-contain pb-[max(0.5rem,env(safe-area-inset-bottom))] animate-modal-pop" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 z-10 flex items-start justify-between gap-3 p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-900/95 backdrop-blur-xl rounded-t-3xl">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-teal-100 text-teal-900 border border-teal-300 dark:bg-teal-500/15 dark:text-teal-300 dark:border-teal-500/25 tabular-nums">{batchDetail.po_no || 'PO'}</span>
                  {(() => {
                    const daysLeft = getDoaDaysLeft(batchDetail.received_at);
                    const expired = daysLeft <= 0;
                    return (
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border tabular-nums ${expired ? 'bg-rose-100 text-rose-900 border-rose-300 dark:bg-rose-500/15 dark:text-rose-300 dark:border-rose-500/25' : daysLeft <= 2 ? 'bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/25' : 'bg-emerald-100 text-emerald-900 border-emerald-300 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/25'}`}>
                        DOA {expired ? 'หมดอายุ' : `เหลือ ${daysLeft} วัน`}
                      </span>
                    );
                  })()}
                </div>
                <h3 className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-white mt-1.5 truncate">{batchDetail.model_name}</h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">Supplier: {batchDetail.supplier || '-'} · รับเข้า {formatThaiDateTime(batchDetail.received_at)}</p>
              </div>
              <button type="button" onClick={() => setBatchDetail(null)} className="shrink-0 p-2 rounded-xl bg-slate-100 dark:bg-white/[0.04] hover:bg-slate-200 dark:hover:bg-white/[0.08] text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition cursor-pointer active:scale-95">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 sm:p-5 space-y-4">
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 p-2.5 text-center">
                  <p className="text-[10px] text-slate-500 dark:text-slate-400">คงเหลือ</p>
                  <p className="text-lg font-extrabold text-slate-900 dark:text-white tabular-nums">{fmt(batchDetail.itemIds.length)}</p>
                </div>
                <div className="rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 p-2.5 text-center">
                  <p className="text-[10px] text-slate-500 dark:text-slate-400">มี S/N</p>
                  <p className="text-lg font-extrabold text-teal-700 dark:text-teal-300 tabular-nums">{batchDetail.serials.length}</p>
                </div>
                <div className="rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 p-2.5 text-center">
                  <p className="text-[10px] text-slate-500 dark:text-slate-400">DOA</p>
                  <p className="text-lg font-extrabold text-amber-700 dark:text-amber-300 tabular-nums">{getDoaDaysLeft(batchDetail.received_at)} วัน</p>
                </div>
              </div>

              {batchDetail.serials.length > 0 && (
                <div>
                  <p className="text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center gap-1"><Hash className="w-3 h-3" /> Serial Numbers</p>
                  <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
                    {batchDetail.serials.map((sn, i) => (
                      <span key={i} className="text-[10px] font-mono px-2 py-1 rounded-md bg-slate-100 dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.06] text-slate-700 dark:text-slate-300">{sn}</span>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1.5">จำนวนที่ส่งช่างเทส & ติดโลโก้</label>
                <NumberInput disabled={readOnly}
                  finishOnEnter
                  min={1}
                  max={batchDetail.itemIds.length}
                  value={batchSendQty[batchDetail.key] ?? batchDetail.itemIds.length}
                  onChange={(e) => setBatchSendQty(prev => ({ ...prev, [batchDetail.key]: Math.max(1, Math.min(batchDetail.itemIds.length, Number(e.target.value) || 1)) }))}
                  className="w-full px-3 py-2 rounded-xl text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-300 dark:border-slate-700 focus:outline-none focus:border-blue-500 tabular-nums"
                />
              </div>

              <div className="flex flex-col gap-2 pt-1">
                {(() => {
                  const modelKey = (batchDetail.model_name || '').trim().toLowerCase();
                  const matchingReadyOrders = allIncomingOrders.filter(o =>
                    (o.items_list || []).some(it => (it.model_name || '').trim().toLowerCase() === modelKey) &&
                    getOrderPrepReadiness(o).stateCase === 'case_c'
                  );
                  if (matchingReadyOrders.length === 0) return null;
                  const firstOrd = matchingReadyOrders[0];
                  return (
                    <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-300 dark:border-emerald-500/35 space-y-2">
                      <div className="text-[11px] font-bold text-emerald-900 dark:text-emerald-200">
                        พบบิลขายพร้อมส่งที่รอสินค้ารุ่นนี้: <span className="font-mono">{firstOrd.sales_ref || firstOrd.id}</span> ({firstOrd.customer_name})
                      </div>
                      <button disabled={readOnly}
                        type="button"
                        onClick={() => reviewCutStockAndSendPrep(firstOrd.id)}
                        className="w-full px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-700 to-teal-800 hover:from-emerald-800 text-white font-extrabold text-xs transition cursor-pointer flex items-center justify-center gap-1.5 shadow-md active:scale-95"
                      >
                        <Send className="w-4 h-4" />
                        <span>ตัดผูกบิล {firstOrd.sales_ref || firstOrd.id} ให้ช่างติดวอยส่งออกเลย (ไม่ต้องวนสต๊อก)</span>
                      </button>
                    </div>
                  );
                })()}
                <button disabled={readOnly}
                  type="button"
                  onClick={() => { handleSendBatchToPrep(batchDetail.key, batchDetail.model_name, batchDetail.itemIds, batchSendQty[batchDetail.key] ?? batchDetail.itemIds.length); setBatchDetail(null); }}
                  className="w-full px-5 py-3 bg-gradient-to-r from-[#FF6B00] to-[#E65A00] hover:from-[#FF8A24] text-black font-extrabold rounded-xl text-xs transition cursor-pointer flex items-center justify-center gap-1.5 shadow-lg shadow-[#FF6B00]/25 border border-white/20 active:scale-95"
                >
                  <Send className="w-4 h-4" />
                  <span>ส่งช่างเทส & ติดโลโก้เข้าคลังกลาง (Stage A)</span>
                </button>
              </div>
            </div>
          </div>
        </ModalBackdrop>,
        document.body
      )}

      {/* ===== INVENTORY DETAIL MODAL ===== */}
      {inventoryDetail && createPortal(
        <ModalBackdrop className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-sm animate-fade-in" onDismiss={() => setInventoryDetail(null)}>
          <div className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-800 shadow-2xl rounded-3xl w-full sm:w-[95vw] max-w-lg max-h-[88dvh] sm:max-h-[90vh] overflow-y-auto overscroll-contain pb-[max(0.5rem,env(safe-area-inset-bottom))] animate-modal-pop" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 z-10 flex items-start justify-between gap-3 p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-900/95 backdrop-blur-xl rounded-t-3xl">
              <div className="min-w-0">
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-indigo-100 text-indigo-900 border border-indigo-300 dark:bg-indigo-500/15 dark:text-indigo-300 dark:border-indigo-500/25">{PRODUCT_CATEGORY_LABELS[inventoryDetail.category as ProductCategory] || inventoryDetail.category}</span>
                <h3 className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-white mt-1.5 truncate">{inventoryDetail.model_name}</h3>
              </div>
              <button type="button" onClick={() => setInventoryDetail(null)} className="shrink-0 p-2 rounded-xl bg-slate-100 dark:bg-white/[0.04] hover:bg-slate-200 dark:hover:bg-white/[0.08] text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition cursor-pointer active:scale-95">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 sm:p-5 space-y-4">
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 p-2.5 text-center">
                  <p className="text-[10px] text-slate-500 dark:text-slate-400">พร้อมขาย</p>
                  <p className="text-lg font-extrabold text-emerald-700 dark:text-emerald-300 tabular-nums">{fmt(inventoryDetail.readyCount)}</p>
                </div>
                <div className="rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 p-2.5 text-center">
                  <p className="text-[10px] text-slate-500 dark:text-slate-400">ห้องสต๊อก</p>
                  <p className="text-lg font-extrabold text-amber-700 dark:text-amber-300 tabular-nums">{fmt(inventoryDetail.rawCount)}</p>
                </div>
                <div className="rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 p-2.5 text-center">
                  <p className="text-[10px] text-slate-500 dark:text-slate-400">รวม</p>
                  <p className="text-lg font-extrabold text-slate-900 dark:text-white tabular-nums">{fmt(inventoryDetail.qty)}</p>
                </div>
              </div>

              {inventoryDetail.serials.length > 0 && (
                <div>
                  <p className="text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center gap-1"><Hash className="w-3 h-3" /> Serial Numbers ({inventoryDetail.serials.length})</p>
                  <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto">
                    {inventoryDetail.serials.map((sn, i) => (
                      <span key={i} className="text-[10px] font-mono px-2 py-1 rounded-md bg-slate-100 dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.06] text-slate-700 dark:text-slate-300">{sn}</span>
                    ))}
                  </div>
                </div>
              )}

              <button
                type="button"
                onClick={() => setInventoryDetail(null)}
                className="w-full px-5 py-2.5 bg-slate-100 dark:bg-white/[0.04] hover:bg-slate-200 dark:hover:bg-white/[0.08] text-slate-700 dark:text-slate-200 font-bold rounded-xl text-xs transition cursor-pointer border border-slate-300 dark:border-slate-700 active:scale-95"
              >
                ปิด
              </button>
            </div>
          </div>
        </ModalBackdrop>,
        document.body
      )}

      {/* ===== PO DETAIL MODAL ===== */}
      {printStockPo && (
        <StockPurchaseOrderPrintModal
          selectedPo={printStockPo}
          stockPOs={stockPOs}
          onClose={() => setPrintStockPo(null)}
        />
      )}
      {poDetail && createPortal(
        <ModalBackdrop className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-sm animate-fade-in" onDismiss={() => setPoDetail(null)}>
          <div className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-800 shadow-2xl rounded-3xl w-full sm:w-[95vw] max-w-lg max-h-[88dvh] sm:max-h-[90vh] overflow-y-auto overscroll-contain pb-[max(0.5rem,env(safe-area-inset-bottom))] animate-modal-pop" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 z-10 flex items-start justify-between gap-3 p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-900/95 backdrop-blur-xl rounded-t-3xl">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-purple-100 text-purple-900 border border-purple-300 dark:bg-purple-500/15 dark:text-purple-300 dark:border-purple-500/25 font-mono">{poDocument?.number || poDetail.po_number}</span>
                  {poDetail.status === 'ordered' && <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-purple-100 text-purple-900 border border-purple-300 dark:bg-purple-500/15 dark:text-purple-300 dark:border-purple-500/25">รอของเข้า</span>}
                  {poDetail.status === 'received' && <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-teal-100 text-teal-900 border border-teal-300 dark:bg-teal-500/15 dark:text-teal-300 dark:border-teal-500/25">รับเข้าแล้ว</span>}
                  {poDetail.status === 'cancelled' && <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-200 text-slate-700 border border-slate-300 dark:bg-white/10 dark:text-slate-400 dark:border-white/10">ยกเลิก</span>}
                </div>
                <h3 className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-white mt-1.5 truncate">{poDetail.product_name}</h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{PRODUCT_CATEGORY_LABELS[poDetail.category]} · {poDetail.supplier || '-'}</p>
              </div>
              <button type="button" onClick={() => setPoDetail(null)} className="shrink-0 p-2 rounded-xl bg-slate-100 dark:bg-white/[0.04] hover:bg-slate-200 dark:hover:bg-white/[0.08] text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition cursor-pointer active:scale-95">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 sm:p-5 space-y-4">
              <dl className="grid gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm dark:border-slate-700 dark:bg-slate-800/70">
                <div><dt className="font-semibold">เลขใบเสนอราคาจากผู้ขาย</dt><dd className="break-words">{poDocument?.supplierQuote || '—'}</dd></div>
                <div>
                  <dt className="font-semibold">งานที่สั่งซื้อ</dt>
                  <dd>{poDocument?.source?.kind === 'stock' ? 'ซื้อเข้าสต๊อก'
                    : poDocument?.source ? `${poDocument.source.kind === 'sales' ? 'บิลขาย' : 'โปรเจกต์'} ${poDocument.source.reference}`
                    : poDetail.project_id ? `โปรเจกต์ ${poDetail.project_id}` : '—'}</dd>
                </div>
                {poReceipt?.deliveryNote && <div><dt className="font-semibold">เลขใบส่งของ</dt><dd className="break-words">{poReceipt.deliveryNote}</dd></div>}
                {poReceipt?.taxInvoice && <div><dt className="font-semibold">เลขใบกำกับภาษี</dt><dd className="break-words">{poReceipt.taxInvoice}</dd></div>}
              </dl>
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 p-2.5 text-center">
                  <p className="text-[10px] text-slate-500 dark:text-slate-400">จำนวน</p>
                  <p className="text-lg font-extrabold text-slate-900 dark:text-white tabular-nums">{fmt(poDetail.qty)}</p>
                </div>
                <div className="rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 p-2.5 text-center">
                  <p className="text-[10px] text-slate-500 dark:text-slate-400">ทุน/หน่วย</p>
                  <p className="text-lg font-extrabold text-rose-700 dark:text-rose-300 tabular-nums">฿{fmt(poDetail.unit_cost)}</p>
                </div>
                <div className="rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 p-2.5 text-center">
                  <p className="text-[10px] text-slate-500 dark:text-slate-400">รวม</p>
                  <p className="text-lg font-extrabold text-[#C2410C] dark:text-[#FF6B00] tabular-nums">฿{fmt(poDetail.qty * poDetail.unit_cost)}</p>
                </div>
              </div>

              <div className="text-[11px] text-slate-500 dark:text-slate-400 space-y-1">
                <p>สร้างเมื่อ: {formatThaiDateTime(poDetail.created_at)}</p>
                {poDetail.received_at && <p>รับเข้าเมื่อ: {formatThaiDateTime(poDetail.received_at)}</p>}
                {poDetail.notes && <p className="text-slate-700 dark:text-slate-300">หมายเหตุ: {poDetail.notes}</p>}
              </div>

              {poDetail.activity_logs && poDetail.activity_logs.length > 0 && (
                <details className="rounded-2xl bg-slate-50 dark:bg-white/[0.02] border border-slate-200 dark:border-white/[0.08] overflow-hidden">
                  <summary className="px-3 py-2 text-[11px] font-bold text-slate-700 dark:text-slate-300 cursor-pointer flex items-center gap-1.5">
                    <History className="w-3.5 h-3.5" /> ประวัติ ({poDetail.activity_logs.length})
                  </summary>
                  <div className="p-3 border-t border-slate-200 dark:border-white/[0.06]">
                    <ActivityTimeline logs={poDetail.activity_logs} />
                  </div>
                </details>
              )}

              <div className="flex flex-col gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setPrintStockPo(poDetail)}
                  className="flex items-center justify-center gap-2 w-full px-5 py-3 rounded-xl text-xs font-bold text-white bg-indigo-700 hover:bg-indigo-800"
                >
                  <Printer className="w-4 h-4" />
                  พิมพ์ใบสั่งซื้อ (A4)
                </button>
                {poDetail.status === 'ordered' && (
                  <form className="space-y-3 rounded-xl border border-teal-200 p-3 dark:border-teal-500/40"
                    onSubmit={event => {
                      event.preventDefault();
                      reviewReceiveStockPo(poDetail);
                    }}>
                    <h4 className="text-sm font-bold">รับสินค้ารายการนี้ · {fmt(poDetail.qty)} ชิ้น</h4>
                    <p className="text-xs text-slate-600 dark:text-slate-300">ตรวจจำนวนสินค้า แล้วกรอกเลขจากเอกสารที่ผู้ขายส่งมา หากยังไม่มีเอกสารให้เว้นว่างได้</p>
                    <label className="block text-xs font-semibold">
                      เลขใบส่งของ
                      <input disabled={readOnly} value={receiptDeliveryNote} onChange={event => setReceiptDeliveryNote(event.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-800" />
                    </label>
                    <label className="block text-xs font-semibold">
                      เลขใบกำกับภาษี
                      <input disabled={readOnly} value={receiptTaxInvoice} onChange={event => setReceiptTaxInvoice(event.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-800" />
                    </label>
                  <button disabled={readOnly}
                    type="submit"
                    className="w-full px-5 py-3 bg-gradient-to-r from-teal-700 to-emerald-800 hover:from-teal-800 text-white font-extrabold rounded-xl text-xs transition cursor-pointer flex items-center justify-center gap-1.5 shadow-lg shadow-teal-500/25 border border-white/20 active:scale-95"
                  >
                    <ShieldCheck className="w-4 h-4" />
                    <span>ตรวจสอบก่อนรับสินค้า</span>
                  </button>
                  </form>
                )}
                <button
                  type="button"
                  onClick={() => setPoDetail(null)}
                  className="w-full px-5 py-2.5 bg-slate-100 dark:bg-white/[0.04] hover:bg-slate-200 dark:hover:bg-white/[0.08] text-slate-700 dark:text-slate-200 font-bold rounded-xl text-xs transition cursor-pointer border border-slate-300 dark:border-slate-700 active:scale-95"
                >
                  ปิด
                </button>
              </div>
            </div>
          </div>
        </ModalBackdrop>,
        document.body
      )}

      {/* ===== STOCK PO MODAL ===== */}
      {isStockPoModalOpen && createPortal(
        <ModalBackdrop className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-sm animate-fade-in" onDismiss={closeStockPoForm}>
          <div className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-800 shadow-2xl rounded-3xl w-full sm:w-[95vw] max-w-2xl max-h-[88dvh] sm:max-h-[90vh] overflow-y-auto overscroll-contain pb-[max(0.5rem,env(safe-area-inset-bottom))] animate-modal-pop" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 z-10 flex items-start justify-between gap-3 p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-900/95 backdrop-blur-xl rounded-t-3xl">
              <div>
                <h3 className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-white flex items-center gap-2"><ShoppingCart className="w-4 h-4 text-[#FF6B00]" /> สร้างใบสั่งซื้อ</h3>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{purchaseSourceLabel}</p>
              </div>
              <button type="button" aria-label="ปิดแบบฟอร์มใบสั่งซื้อ" disabled={isSavingStockPo} onClick={closeStockPoForm} className="shrink-0 min-h-11 min-w-11 grid place-items-center rounded-xl bg-slate-100 dark:bg-white/[0.04] hover:bg-slate-200 dark:hover:bg-white/[0.08] text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition cursor-pointer active:scale-95">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmitStockPo} className="p-4 sm:p-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="stock-po-supplier" className="block text-sm font-bold mb-1.5">ผู้ขาย (Supplier)</label>
                  <select
                    id="stock-po-supplier"
                    required
                    value={stockPoMeta.supplier}
                    onChange={(e) => setStockPoMeta(prev => ({ ...prev, supplier: e.target.value }))}
                    className="w-full min-h-11 px-3 py-2 rounded-xl text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-300 dark:border-slate-700"
                  >
                    <option value="">เลือกผู้ขาย</option>
                    {stockPoMeta.supplier && !SUPPLIER_PRESETS.includes(stockPoMeta.supplier) && (
                      <option value={stockPoMeta.supplier}>{stockPoMeta.supplier}</option>
                    )}
                    {SUPPLIER_PRESETS.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="stock-po-supplier-quote" className="block text-sm font-bold mb-1.5">เลขใบเสนอราคาจากผู้ขาย <span className="font-normal text-slate-500 dark:text-slate-400">(ถ้ามี)</span></label>
                  <input
                    id="stock-po-supplier-quote"
                    type="text"
                    value={stockPoMeta.supplierQuote}
                    onChange={(e) => setStockPoMeta(prev => ({ ...prev, supplierQuote: e.target.value }))}
                    placeholder="เช่น QT-SIS-1234"
                    className="w-full min-h-11 px-3 py-2 rounded-xl text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-300 dark:border-slate-700"
                  />
                </div>
              </div>
              <p className="rounded-xl bg-indigo-50 px-3 py-2 text-sm text-indigo-900 dark:bg-indigo-950 dark:text-indigo-200">
                ระบบจะออกเลขใบสั่งซื้อของบริษัทให้เมื่อกดบันทึก
              </p>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300">รายการสินค้า ({stockPoLines.length})</label>
                  <button
                    type="button"
                    onClick={openPoCatalogModal}
                    className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-[#FF6B00]/15 text-[#C2410C] dark:text-[#FF6B00] border border-[#FF6B00]/30 hover:bg-[#FF6B00]/25 transition cursor-pointer active:scale-95 flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3" /> เลือกจากแคตตาล็อก
                  </button>
                </div>
                {stockPoLines.length === 0 ? (
                  <div className="rounded-xl bg-slate-50 dark:bg-white/[0.02] border border-dashed border-slate-300 dark:border-white/[0.1] p-6 text-center">
                    <PackageSearch className="w-8 h-8 text-slate-400 dark:text-slate-600 mx-auto mb-2" />
                    <p className="text-[11px] text-slate-500">ยังไม่มีรายการ — กด "เลือกจากแคตตาล็อก" เพื่อเพิ่มสินค้า</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {stockPoLines.map((line) => (
                      <div key={line.product_id} className="rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 p-2.5 flex items-center gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-bold text-slate-900 dark:text-white truncate">{line.product_name}</p>
                          <p className="text-[10px] text-slate-500 dark:text-slate-400">{PRODUCT_CATEGORY_LABELS[line.category]}</p>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <NumberInput
                            min={1}
                            value={line.qty}
                            onChange={(e) => handleUpdateStockPoLine(line.product_id, { qty: Math.max(1, Number(e.target.value) || 1) })}
                            className="w-14 px-2 py-1 rounded-lg text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-300 dark:border-slate-700 text-center tabular-nums focus:outline-none focus:border-blue-500"
                            title="จำนวน"
                          />
                          <NumberInput
                            min={0}
                            value={line.unit_cost}
                            onChange={(e) => handleUpdateStockPoLine(line.product_id, { unit_cost: Math.max(0, Number(e.target.value) || 0) })}
                            className="w-20 px-2 py-1 rounded-lg text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-300 dark:border-slate-700 text-right tabular-nums focus:outline-none focus:border-blue-500"
                            title="ทุน/หน่วย"
                          />
                          <button
                            type="button"
                            onClick={() => handleRemoveStockPoLine(line.product_id)}
                            className="p-1.5 rounded-lg bg-rose-100 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 hover:bg-rose-200 dark:hover:bg-rose-500/20 transition cursor-pointer active:scale-95"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1.5">หมายเหตุ</label>
                <textarea
                  value={stockPoMeta.notes}
                  onChange={(e) => setStockPoMeta(prev => ({ ...prev, notes: e.target.value }))}
                  rows={2}
                  className="w-full px-3 py-2 rounded-xl text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-300 dark:border-slate-700 placeholder-slate-400 focus:outline-none focus:border-blue-500 resize-none"
                  placeholder="เช่น สั่งสำรองสต๊อกประจำเดือน..."
                />
              </div>

              {stockPoLines.length > 0 && (
                <div className="rounded-xl bg-amber-50 dark:bg-[#FF6B00]/10 border border-amber-200 dark:border-[#FF6B00]/25 p-3 flex items-center justify-between">
                  <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300">ยอดรวมทั้งใบ</span>
                  <span className="text-base font-extrabold text-[#C2410C] dark:text-[#FF6B00] tabular-nums">
                    ฿{fmt(stockPoLines.reduce((s, l) => s + l.qty * l.unit_cost, 0))}
                  </span>
                </div>
              )}

              {stockPoError && <p role="alert" className="text-sm text-red-700 dark:text-red-300">{stockPoError}</p>}
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={closeStockPoForm}
                  disabled={isSavingStockPo}
                  className="flex-1 px-4 py-2.5 bg-slate-100 dark:bg-white/[0.04] hover:bg-slate-200 dark:hover:bg-white/[0.08] text-slate-700 dark:text-slate-200 font-bold rounded-xl text-xs transition cursor-pointer border border-slate-300 dark:border-slate-700 active:scale-95"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={readOnly || (isSavingStockPo || stockPoLines.length === 0)}
                  className="flex-1 px-4 py-2.5 bg-gradient-to-r from-[#FF6B00] to-[#E65A00] hover:from-[#FF8A24] text-black font-extrabold rounded-xl text-xs transition cursor-pointer shadow-lg shadow-[#FF6B00]/25 border border-white/20 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {isSavingStockPo ? 'กำลังบันทึก…' : 'บันทึกใบสั่งซื้อ'}
                </button>
              </div>
            </form>
          </div>
        </ModalBackdrop>,
        document.body
      )}

      {isPoCatalogModalOpen && (
        <ProductCatalogModal
          products={products}
          description="เลือกสินค้าและระบุจำนวนสำหรับใบสั่งซื้อ"
          confirmLabel="เพิ่มเข้าใบสั่งซื้อ"
          priceLabel="ต้นทุน"
          getPrice={item => item.cost_price}
          getStock={name => stockCountByName[name.trim().toLowerCase()] ?? 0}
          quantities={Object.fromEntries(Object.entries(poCatalogPicks).map(([id, pick]) => [id, pick.qty]))}
          total={Object.values(poCatalogPicks).reduce((sum, pick) => sum + pick.qty * pick.unit_cost, 0)}
          onToggle={togglePoCatalogPick}
          onQuantityChange={(id, qty) => updatePoCatalogPick(id, { qty })}
          onConfirm={handleConfirmPoCatalogSelection}
          onClose={() => setIsPoCatalogModalOpen(false)}
          renderActions={item => (
            <NumberInput
              finishOnEnter
              min={0}
              step="any"
              value={poCatalogPicks[item.id]?.unit_cost ?? 0}
              onChange={e => updatePoCatalogPick(item.id, { unit_cost: Number(e.target.value) || 0 })}
              aria-label={"ต้นทุนต่อหน่วย " + item.name}
              title="ต้นทุนต่อหน่วย"
              className="ml-auto w-24 rounded-lg px-2 py-1 text-[11px] bg-white dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-300 dark:border-slate-700 font-mono tabular-nums focus:outline-none focus:border-blue-500"
            />
          )}
        />
      )}
      {/* ===== DOA CLAIM TRACKING MODAL ===== */}
      {doaClaimItem && createPortal(
        <ModalBackdrop
          className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-4 bg-black/60 dark:bg-black/75 backdrop-blur-sm animate-fade-in"
          role="dialog"
          aria-modal="true"
          aria-label="ติดตามเคลมของเสีย DOA กับ Supplier"
          onDismiss={() => setDoaClaimItem(null)}
        >
          <div
            className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white border border-rose-500/30 dark:border-rose-500/40 shadow-2xl rounded-3xl w-full sm:w-[95vw] max-w-lg max-h-[88dvh] sm:max-h-[90vh] overflow-y-auto overscroll-contain pb-[max(0.5rem,env(safe-area-inset-bottom))] animate-modal-pop"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 z-10 flex items-start justify-between gap-3 p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 bg-rose-50/80 dark:bg-slate-900/95 backdrop-blur-xl rounded-t-3xl">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-200 text-slate-800 dark:bg-white/10 dark:text-slate-200 font-mono">
                    {doaClaimItem.po_no || 'Stock PO'}
                  </span>
                  {doaClaimItem.status === 'doa_reported' && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-rose-100 text-rose-900 border border-rose-300 dark:bg-rose-500/20 dark:text-rose-300 dark:border-rose-500/35">
                      รอแจ้งเคลม Supplier
                    </span>
                  )}
                  {doaClaimItem.status === 'doa_sent_supplier' && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-amber-100 text-amber-900 border border-amber-300 dark:bg-amber-500/20 dark:text-amber-300 dark:border-amber-500/35">
                      ส่งเคลมแล้ว • ผ่านมา {getElapsedDays(doaClaimItem.doa_sent_date)} วัน
                    </span>
                  )}
                  {doaClaimItem.status === 'doa_replaced' && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-900 border border-emerald-300 dark:bg-emerald-500/20 dark:text-emerald-300 dark:border-emerald-500/35">
                      รับตัวใหม่แล้ว
                    </span>
                  )}
                </div>
                <h3 className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-white mt-1.5 truncate">
                  {doaClaimItem.model_name}
                </h3>
                <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5">
                  Supplier: {doaClaimItem.supplier || '-'} · แจ้งโดย: {doaClaimItem.doa_reported_by || '-'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDoaClaimItem(null)}
                className="shrink-0 p-2 rounded-xl bg-white/80 dark:bg-white/[0.04] hover:bg-slate-200 dark:hover:bg-white/[0.08] text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition cursor-pointer active:scale-95"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 sm:p-5 space-y-4 text-xs">
              {/* Defect summary */}
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 p-2.5">
                  <p className="text-[10px] text-slate-500 dark:text-slate-400">Serial Number (เสีย)</p>
                  <p className="text-xs font-mono font-extrabold text-[#C2410C] dark:text-[#FF6B00] mt-0.5 break-all">
                    {doaClaimItem.serial_number || '-'}
                  </p>
                </div>
                <div className="rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 p-2.5">
                  <p className="text-[10px] text-slate-500 dark:text-slate-400">วันที่ช่างแจ้ง</p>
                  <p className="text-xs font-bold text-slate-800 dark:text-slate-200 mt-0.5">
                    {formatThaiDateTime(doaClaimItem.doa_reported_at)}
                  </p>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/25 space-y-1">
                <p className="text-[11px] font-bold text-rose-900 dark:text-rose-200">
                  อาการที่พบ: {doaClaimItem.doa_reason || '-'}
                </p>
                {doaClaimItem.doa_notes && (
                  <p className="text-[11px] text-rose-800/90 dark:text-rose-300/90">
                    หมายเหตุ: {doaClaimItem.doa_notes}
                  </p>
                )}
              </div>

              {doaClaimItem.photo_urls && doaClaimItem.photo_urls.length > 0 && (
                <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                  <EvidencePhotoUploader
                    value={doaClaimItem.photo_urls}
                    onChange={() => { }}
                    folder="doa"
                    editable={false}
                    label="รูปถ่ายหลักฐานอาการเสีย (จากช่างเตรียมสินค้า)"
                  />
                </div>
              )}

              {/* Stage 1: Mark Sent to Supplier */}
              {doaClaimItem.status === 'doa_reported' && (
                <form onSubmit={handleMarkDoaSent} className="space-y-3 p-3.5 rounded-2xl bg-amber-50/70 dark:bg-amber-500/[0.06] border border-amber-200 dark:border-amber-500/25">
                  <div className="text-xs font-extrabold text-amber-900 dark:text-amber-300 flex items-center gap-1.5">
                    <Send className="w-4 h-4" />
                    <span>ขั้นตอนที่ 1: บันทึกส่งเคลม Supplier</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">เลขที่ RMA / Tracking No.</label>
                      <input disabled={readOnly}
                        type="text"
                        required
                        value={doaRmaInput}
                        onChange={(e) => setDoaRmaInput(e.target.value)}
                        placeholder="เช่น RMA-SIS-69012"
                        className="w-full px-3 py-2 rounded-xl text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-300 dark:border-slate-700 font-mono focus:outline-none focus:border-amber-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">วันที่ส่งเคลม</label>
                      <input disabled={readOnly}
                        type="date"
                        value={doaSentDateInput}
                        onChange={(e) => setDoaSentDateInput(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-300 dark:border-slate-700 font-mono focus:outline-none focus:border-amber-500"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">หมายเหตุการส่งเคลม (ถ้ามี)</label>
                    <input disabled={readOnly}
                      type="text"
                      value={doaNotesInput}
                      onChange={(e) => setDoaNotesInput(e.target.value)}
                      placeholder="เช่น ส่งผ่านขนส่ง Nim Express / ฝากเซลวิ่ง..."
                      className="w-full px-3 py-2 rounded-xl text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-300 dark:border-slate-700 focus:outline-none focus:border-amber-500"
                    />
                  </div>
                  <button disabled={readOnly}
                    type="submit"
                    className="w-full px-5 py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 text-black font-extrabold rounded-xl text-xs transition cursor-pointer flex items-center justify-center gap-1.5 shadow-lg shadow-amber-500/25 border border-white/20 active:scale-95"
                  >
                    <Send className="w-4 h-4" />
                    <span>บันทึกแจ้งเคลม Supplier แล้ว</span>
                  </button>
                </form>
              )}

              {/* Stage 2: Receive Replacement Unit from Supplier */}
              {doaClaimItem.status === 'doa_sent_supplier' && (
                <div className="space-y-3 p-3.5 rounded-2xl bg-emerald-50/70 dark:bg-emerald-500/[0.06] border border-emerald-200 dark:border-emerald-500/25">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="text-xs font-extrabold text-emerald-900 dark:text-emerald-300 flex items-center gap-1.5">
                      <CheckCircle className="w-4 h-4" />
                      <span>ขั้นตอนที่ 2: รับตัวใหม่จาก Supplier</span>
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300 dark:bg-amber-500/20 dark:text-amber-300 dark:border-amber-500/35">
                      ส่งแล้ว {getElapsedDays(doaClaimItem.doa_sent_date)} วัน
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <div className="p-2 rounded-xl bg-white dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700">
                      <span className="text-[10px] text-slate-500 dark:text-slate-400 block">RMA / Tracking</span>
                      <span className="font-mono font-bold text-slate-900 dark:text-white">{doaClaimItem.doa_rma_no || '-'}</span>
                    </div>
                    <div className="p-2 rounded-xl bg-white dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700">
                      <span className="text-[10px] text-slate-500 dark:text-slate-400 block">วันที่ส่งเคลม</span>
                      <span className="font-mono font-bold text-slate-900 dark:text-white">{doaClaimItem.doa_sent_date || '-'}</span>
                    </div>
                  </div>

                  <label className="flex items-center gap-2 p-2.5 rounded-xl bg-white dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 cursor-pointer">
                    <input disabled={readOnly}
                      type="checkbox"
                      checked={doaSendDirectToPrep}
                      onChange={(e) => setDoaSendDirectToPrep(e.target.checked)}
                      className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                    />
                    <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-200">
                      ส่งตัวใหม่เข้าคิวช่างเตรียมสินค้าทันที
                    </span>
                  </label>

                  <button disabled={readOnly}
                    type="button"
                    onClick={handleConfirmDoaReplacement}
                    className="w-full px-5 py-2.5 bg-gradient-to-r from-emerald-700 to-teal-800 hover:from-emerald-800 text-white font-extrabold rounded-xl text-xs transition cursor-pointer flex items-center justify-center gap-1.5 shadow-lg shadow-emerald-500/25 border border-white/20 active:scale-95"
                  >
                    <ShieldCheck className="w-4 h-4" />
                    <span>
                      {doaSendDirectToPrep
                        ? 'รับของเคลมจาก Supplier แล้ว (ส่งเข้าคิวช่างเตรียม)'
                        : 'รับของเคลมจาก Supplier แล้ว'}
                    </span>
                  </button>
                </div>
              )}

              {/* Stage 3: Completed */}
              {doaClaimItem.status === 'doa_replaced' && (() => {
                const replacementItem = doaClaimItem.doa_replacement_item_id
                  ? items.find(i => i.id === doaClaimItem.doa_replacement_item_id)
                  : undefined;
                return (
                  <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/25 text-emerald-900 dark:text-emerald-200 text-[11px] space-y-2">
                    <p className="font-bold flex items-center gap-1.5">
                      <CheckCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                      <span>ปิดเคสเคลม DOA แล้ว — รับตัวใหม่เมื่อ {formatThaiDateTime(doaClaimItem.doa_replaced_at)}</span>
                    </p>
                    <p>RMA: <span className="font-mono">{doaClaimItem.doa_rma_no || '-'}</span></p>
                    {replacementItem?.status === 'raw_stock' && (
                      <button disabled={readOnly}
                        type="button"
                        onClick={() => {
                          handleSendRawToPrep(replacementItem.id, replacementItem.model_name);
                          setDoaClaimItem(null);
                        }}
                        className="w-full mt-1 px-4 py-2 bg-gradient-to-r from-[#FF6B00] to-[#E65A00] hover:from-[#FF8A24] text-black font-extrabold rounded-xl text-xs transition cursor-pointer flex items-center justify-center gap-1.5 shadow-md active:scale-95"
                      >
                        <Send className="w-3.5 h-3.5" />
                        <span>ส่งตัวใหม่เข้าคิวช่าง Prep (Stage A)</span>
                      </button>
                    )}
                    {replacementItem?.status === 'pending_prep' && (
                      <p className="text-[11px] font-semibold text-amber-700 dark:text-amber-300">
                        สถานะตัวใหม่: อยู่ในคิวช่างเตรียมสินค้า (Stage A) แล้ว
                      </p>
                    )}
                  </div>
                );
              })()}

              {/* Activity Timeline */}
              {doaClaimItem.activity_logs && doaClaimItem.activity_logs.length > 0 && (
                <details className="rounded-2xl bg-slate-50 dark:bg-white/[0.02] border border-slate-200 dark:border-white/[0.08] overflow-hidden" open>
                  <summary className="px-3 py-2 text-[11px] font-bold text-slate-700 dark:text-slate-300 cursor-pointer flex items-center gap-1.5">
                    <History className="w-3.5 h-3.5" /> ประวัติการเคลม DOA ({doaClaimItem.activity_logs.length})
                  </summary>
                  <div className="p-3 border-t border-slate-200 dark:border-white/[0.06]">
                    <ActivityTimeline logs={doaClaimItem.activity_logs} />
                  </div>
                </details>
              )}

              <button
                type="button"
                onClick={() => setDoaClaimItem(null)}
                className="w-full px-5 py-2.5 bg-slate-100 dark:bg-white/[0.04] hover:bg-slate-200 dark:hover:bg-white/[0.08] text-slate-700 dark:text-slate-200 font-bold rounded-xl text-xs transition cursor-pointer border border-slate-300 dark:border-slate-700 active:scale-95"
              >
                ปิด
              </button>
            </div>
          </div>
        </ModalBackdrop>,
        document.body
      )}

      {/* ========================================================================= */}
      {/* PROJECT ACTION MODAL (PRJ-... Shortage Check, Linked PO & Batch Release)  */}
      {/* ========================================================================= */}
      {actionProject && createPortal(
        <ModalBackdrop
          className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-4 bg-black/70 backdrop-blur-sm animate-fade-in overscroll-contain"
          onDismiss={() => setActionProjectId(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white border border-purple-300 dark:border-purple-500/40 shadow-2xl rounded-3xl w-full sm:w-[94vw] max-w-4xl max-h-[88dvh] sm:max-h-[90vh] flex flex-col overflow-hidden animate-modal-pop"
          >
            {/* Header */}
            <div className="p-4 sm:p-5 bg-slate-50/90 dark:bg-slate-900/95 border-b border-slate-200 dark:border-slate-800 flex items-start justify-between gap-2 flex-shrink-0">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="px-2.5 py-0.5 rounded-lg bg-purple-600 text-white font-mono font-extrabold text-xs">
                    {actionProject.id}
                  </span>
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-100 text-emerald-900 border border-emerald-300 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30">
                    เปิดโดย {actionProject.created_by}
                  </span>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                    ปล่อยงวดเบิกแล้ว {actionProject.batches?.length || 0} งวด
                  </span>
                </div>
                <h3 className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white mt-1.5 truncate">
                  {actionProject.site_name}
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  ลูกค้า: <strong>{actionProject.customer_name}</strong> • {actionProject.location}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActionProjectId(null)}
                className="p-2 rounded-xl text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white bg-slate-100 dark:bg-white/[0.04] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {(() => {
              const st = getProjectStockStatus(actionProject);
              const nextBatchNo = (actionProject.batches?.length || 0) + 1;
              return (
                <>
                  <div className="flex-1 overflow-y-auto overscroll-contain p-4 sm:p-5 space-y-4 text-xs">
                    {/* Pending Onsite Material Requests Section */}
                    {actionProject.material_requests && actionProject.material_requests.length > 0 && (
                      <div className="p-3.5 rounded-2xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/30 space-y-2">
                        <div className="font-extrabold text-rose-900 dark:text-rose-200 flex items-center gap-1.5">
                          <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400" />
                          <span>คำขอเบิกของเพิ่มจากช่างหน้างาน (Onsite Material Requests)</span>
                        </div>
                        {actionProject.material_requests.map((req) => (
                          <div key={req.id} className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-rose-200 dark:border-rose-500/20 flex flex-wrap items-center justify-between gap-2">
                            <div className="min-w-0">
                              <div className="font-bold text-slate-900 dark:text-white">
                                {req.item_name} <span className="font-mono text-[#C2410C] dark:text-[#FF6B00]">x{req.qty}</span>
                              </div>
                              <div className="text-[11px] text-slate-600 dark:text-slate-400">
                                เหตุผล: {req.reason} • ขอโดย <strong>{req.requested_by}</strong>
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {req.status === 'pending' && (
                                <button disabled={readOnly}
                                  type="button"
                                  onClick={() => updateProjectMaterialRequestStatus(actionProject.id, req.id, 'approved_ordered')}
                                  className="px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-bold cursor-pointer"
                                >
                                  อนุมัติ / สั่งของ
                                </button>
                              )}
                              {req.status !== 'fulfilled' && (
                                <button disabled={readOnly}
                                  type="button"
                                  onClick={() => {
                                    const catProduct = products.find(p => p.name.trim().toLowerCase() === req.item_name.trim().toLowerCase());
                                    setStockPoSourceOrderId(null);
                                    setStockPoSourceProjectId(actionProject.id);
                                    setStockPoLines([{
                                      product_id: catProduct ? catProduct.id : `req-${req.id}`,
                                      product_name: catProduct ? catProduct.name : req.item_name,
                                      category: catProduct ? catProduct.category : 'cctv_network',
                                      qty: Math.max(1, req.qty || 1),
                                      unit_cost: catProduct ? Math.max(0, catProduct.cost_price) : 0
                                    }]);
                                    setStockPoMeta({
                                      supplier: '',
                                      supplierQuote: '',
                                      notes: ''
                                    });
                                    setActionProjectId(null);
                                    setIsStockPoModalOpen(true);
                                  }}
                                  className="px-2.5 py-1 rounded-lg bg-[#FF6B00] hover:bg-[#FF8A24] text-black text-[10px] font-extrabold cursor-pointer"
                                >
                                  + สั่ง PO รายการนี้
                                </button>
                              )}
                              {req.status !== 'fulfilled' ? (() => {
                                const reqAvail = stockCountByName[(req.item_name || '').trim().toLowerCase()] || 0;
                                const canFulfillReq = reqAvail >= (req.qty || 1);
                                return canFulfillReq ? (
                                  <button disabled={readOnly}
                                    type="button"
                                    onClick={() => updateProjectMaterialRequestStatus(actionProject.id, req.id, 'fulfilled')}
                                    className="px-2.5 py-1 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-[10px] font-bold cursor-pointer"
                                  >
                                    จัดส่งเข้าไซต์แล้ว (มี {reqAvail})
                                  </button>
                                ) : (
                                  <span className="px-2.5 py-1 rounded-lg bg-rose-100 text-rose-800 dark:bg-rose-500/20 dark:text-rose-300 border border-rose-300 dark:border-rose-500/30 text-[10px] font-bold">
                                    คลังมี {reqAvail} (ขาด {(req.qty || 1) - reqAvail})
                                  </span>
                                );
                              })() : (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-900 dark:bg-emerald-500/20 dark:text-emerald-300">
                                  จัดส่งเข้าไซต์แล้ว
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Live Stock Comparison & Partial Batch Release Qty Picker */}
                    <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 overflow-hidden">
                      <div className="p-3 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between gap-2 flex-wrap">
                        <span className="font-extrabold text-slate-900 dark:text-white flex items-center gap-1.5">
                          <Boxes className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                          <span>เปรียบเทียบสต๊อกจริง (in_stock + raw_stock) & กำหนดจำนวนปล่อยของ งวดที่ {nextBatchNo}</span>
                        </span>
                        {st.allPhysicalAllocated ? (
                          <span className="px-3 py-1 rounded-full text-[11px] font-black bg-emerald-600 text-white shadow-sm inline-flex items-center gap-1">
                            <CheckCircle className="w-3.5 h-3.5" />
                            <span>Site นี้เบิกของครบแล้ว</span>
                          </span>
                        ) : st.allSufficient ? (
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-100 text-emerald-900 border border-emerald-300 dark:bg-emerald-500/20 dark:text-emerald-300">
                            ครบพร้อมเบิก
                          </span>
                        ) : (
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-rose-100 text-rose-900 border border-rose-300 dark:bg-rose-500/20 dark:text-rose-300">
                            ขาดของ {st.shortageItemCount} รายการ ({st.totalShortage} ชิ้น)
                          </span>
                        )}
                      </div>

                      <div className="p-3 space-y-2.5">
                        {[...st.rows]
                          .sort((a, b) => {
                            const aDone = a.isLabor || a.remainingToAllocate === 0 ? 1 : 0;
                            const bDone = b.isLabor || b.remainingToAllocate === 0 ? 1 : 0;
                            return aDone - bDone;
                          })
                          .map((row) => {
                            const it = row.item;
                            const releaseVal = batchReleaseQtyMap[it.id] ?? 0;
                            const isCompleted = !row.isLabor && row.remainingToAllocate === 0;
                            return (
                              <div
                                key={it.id}
                                className={`p-3 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition ${isCompleted
                                  ? 'bg-emerald-50/50 dark:bg-emerald-500/[0.04] border-emerald-200 dark:border-emerald-500/25'
                                  : row.isLabor
                                    ? 'bg-slate-50/80 dark:bg-white/[0.02] border-slate-200 dark:border-white/[0.08]'
                                    : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700'
                                  }`}
                              >
                                <div className="min-w-0 space-y-1 flex-1">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${row.isLabor
                                      ? 'bg-slate-100 text-slate-800 border-slate-300 dark:bg-white/[0.08] dark:text-slate-200 dark:border-white/15'
                                      : it.item_type === 'equipment'
                                        ? 'bg-blue-100 text-blue-900 border-blue-300 dark:bg-blue-500/20 dark:text-blue-300 dark:border-blue-500/30'
                                        : 'bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-500/20 dark:text-amber-300 dark:border-amber-500/30'
                                      }`}>
                                      {row.isLabor
                                        ? 'ค่าบริการ / ค่าแรง (รวมในบิลแล้ว)'
                                        : it.item_type === 'equipment'
                                          ? 'อุปกรณ์หลัก → ส่งช่าง Prep'
                                          : 'วัสดุสิ้นเปลือง → ส่งตรง Onsite'}
                                    </span>
                                    {it.is_addon && (
                                      <span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-purple-100 text-purple-900 border border-purple-300 dark:bg-purple-500/20 dark:text-purple-200 dark:border-purple-500/40">
                                        แอดเพิ่มโดย {it.added_by}
                                      </span>
                                    )}
                                  </div>
                                  <div className="font-bold text-slate-900 dark:text-white">{it.model_name}</div>
                                  <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono">
                                    {row.isLabor ? (
                                      <span className="text-slate-600 dark:text-slate-400">
                                        จำนวนในบิล: <strong>{it.qty_required}</strong> • ไม่ต้องเบิกจากสต๊อก (ออกบิลอัตโนมัติ)
                                      </span>
                                    ) : (
                                      <span className="text-slate-600 dark:text-slate-400">
                                        สัญญาทั้งหมด: <strong>{it.qty_required}</strong> • เบิกแล้ว: <strong>{it.qty_allocated}</strong> • ค้างเบิก: <strong>{row.remainingToAllocate}</strong>
                                      </span>
                                    )}
                                    {!row.isLabor && !isCompleted && (
                                      <span className={`px-2 py-0.5 rounded-md font-bold border ${row.shortage === 0 && row.available > 0
                                        ? 'bg-emerald-50 text-emerald-900 border-emerald-300 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30'
                                        : 'bg-rose-50 text-rose-900 border-rose-300 dark:bg-rose-500/15 dark:text-rose-300 dark:border-rose-500/35'
                                        }`}>
                                        {row.shortage > 0
                                          ? `ในคลังมี ${row.available} ชิ้น (ขาด ${row.shortage})`
                                          : `ในคลังมี ${row.available} ชิ้น (พร้อมเบิก)`}
                                      </span>
                                    )}
                                  </div>
                                </div>

                                <div className="flex items-center gap-2 shrink-0">
                                  {row.isLabor ? (
                                    <span className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-100 text-slate-700 border border-slate-300 dark:bg-white/[0.06] dark:text-slate-200 dark:border-white/15 text-[11px] font-bold">
                                      ไม่ต้องเบิกสต๊อก (ลงบิลแล้ว)
                                    </span>
                                  ) : isCompleted ? (
                                    <span className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-100 text-emerald-900 border border-emerald-300 dark:bg-emerald-500/20 dark:text-emerald-300 dark:border-emerald-500/40 text-xs font-black shadow-sm">
                                      <CheckCircle className="w-4 h-4" />
                                      <span>เบิกครบแล้ว</span>
                                    </span>
                                  ) : (
                                    <>
                                      {!row.isLabor && row.shortage > 0 && (
                                        <button disabled={readOnly}
                                          type="button"
                                          onClick={() => {
                                            const catProduct = products.find(p => p.name.trim().toLowerCase() === it.model_name.trim().toLowerCase());
                                            setStockPoSourceOrderId(null);
                                            setStockPoSourceProjectId(actionProject.id);
                                            setStockPoLines([{
                                              product_id: catProduct ? catProduct.id : it.id,
                                              product_name: catProduct ? catProduct.name : it.model_name,
                                              category: catProduct ? catProduct.category : 'cctv_network',
                                              qty: Math.max(1, row.shortage),
                                              unit_cost: it.unit_cost > 0 ? it.unit_cost : (catProduct ? Math.max(0, catProduct.cost_price) : 0)
                                            }]);
                                            setStockPoMeta({
                                              supplier: '',
                                              supplierQuote: '',
                                              notes: ''
                                            });
                                            setActionProjectId(null);
                                            setIsStockPoModalOpen(true);
                                          }}
                                          className="px-2.5 py-1.5 rounded-lg bg-[#FF6B00] hover:bg-[#FF8A24] text-black font-extrabold text-[11px] cursor-pointer whitespace-nowrap"
                                        >
                                          + สั่ง PO
                                        </button>
                                      )}
                                      {it.qty_allocated === 0 && (
                                        <button disabled={readOnly}
                                          type="button"
                                          onClick={() => {
                                            if (confirm(`ต้องการลบ "${it.model_name}" ออกจากโปรเจกต์ ${actionProject.id} หรือไม่? (ใช้กรณีไม่มีของ/ยกเลิกรายการ)`)) {
                                              removeProjectItem(actionProject.id, it.id);
                                              setToast(`ลบ "${it.model_name}" ออกจากโปรเจกต์แล้ว`);
                                              setTimeout(() => setToast(''), 3500);
                                            }
                                          }}
                                          title="ลบรายการที่ยังไม่เบิกออก (กรณีไม่มีของ/ยกเลิก)"
                                          className="p-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 dark:bg-rose-500/15 dark:hover:bg-rose-500/25 dark:text-rose-300 dark:border-rose-500/30 transition cursor-pointer"
                                        >
                                          <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                      )}
                                      <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400">
                                        เบิกงวดที่ {nextBatchNo}:
                                      </label>
                                      <NumberInput
                                        finishOnEnter
                                        min={0}
                                        max={row.releasableNow}
                                        disabled={readOnly || (row.releasableNow === 0)}
                                        value={Math.min(releaseVal, row.releasableNow)}
                                        onChange={(e) =>
                                          setBatchReleaseQtyMap(prev => ({
                                            ...prev,
                                            [it.id]: Math.max(0, Math.min(row.releasableNow, parseInt(e.target.value) || 0))
                                          }))
                                        }
                                        className="w-20 rounded-xl px-2.5 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-300 dark:border-slate-700 font-mono font-bold text-center disabled:opacity-40"
                                      />
                                    </>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                      </div>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                        หมายเหตุงวดเบิกที่ {nextBatchNo} (ส่งถึงช่าง Prep & ทีมช่าง Onsite)
                      </label>
                      <input disabled={readOnly}
                        type="text"
                        value={batchReleaseNote}
                        onChange={(e) => setBatchReleaseNote(e.target.value)}
                        placeholder="เช่น ปล่อยสาย LAN และสวิตช์ที่ของมาถึงก่อนเข้าไซต์งานงวดนี้"
                        className="w-full rounded-xl px-3 py-2 text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-300 dark:border-slate-700"
                      />
                    </div>

                    {/* Released Batches History */}
                    {actionProject.batches && actionProject.batches.length > 0 && (
                      <div className="space-y-1.5">
                        <div className="font-bold text-slate-800 dark:text-slate-200">
                          ประวัติการปล่อยของเป็นงวด (Released Batches • {actionProject.batches.length} งวด)
                        </div>
                        {actionProject.batches.map((b) => (
                          <div key={b.id} className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex flex-wrap items-center justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <span className="font-mono font-extrabold text-purple-700 dark:text-purple-300">
                                Batch #{b.batch_no} ({actionProject.id} • งวดที่ {b.batch_no})
                              </span>
                              <span className="text-[11px] text-slate-500 ml-2">
                                {b.items.map(bi => `${bi.model_name} x${bi.qty}`).join(', ')}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <span className="text-[10px] font-mono text-slate-500">
                                {formatThaiDateTime(b.released_at)} • {b.released_by}
                              </span>
                              <button
                                type="button"
                                onClick={() => setPrintProjectTarget({ project: actionProject, batchNo: b.batch_no })}
                                className="px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white dark:bg-white/[0.08] dark:hover:bg-white/[0.15] border border-slate-300 dark:border-white/15 text-[10px] font-bold transition cursor-pointer inline-flex items-center gap-1"
                              >
                                <Printer className="w-3 h-3 text-[#FF6B00]" />
                                <span>พิมพ์บิล งวดที่ {b.batch_no}</span>
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Footer Buttons: แสดงปุ่มปล่อยงวดเบิกเฉพาะเมื่อมีของในสต๊อกพร้อมปล่อยจริงเท่านั้น */}
                  <div className="p-3.5 sm:p-4 bg-slate-50/95 dark:bg-slate-900/95 border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 flex-shrink-0">
                    {st.allPhysicalAllocated && (
                      <div className="flex-1 py-2.5 px-4 rounded-xl bg-emerald-100 text-emerald-900 border border-emerald-300 dark:bg-emerald-500/20 dark:text-emerald-300 dark:border-emerald-500/40 font-black text-xs flex items-center justify-center gap-2">
                        <CheckCircle className="w-4 h-4 shrink-0" />
                        <span>Site นี้เบิกของครบทุกรายการตามที่ Sale เปิดบิลแล้ว</span>
                      </div>
                    )}
                    {!st.allSufficient && (
                      st.orderedLinkedPOs.length > 0 && !st.hasReleasableStock ? (
                        <button
                          type="button"
                          onClick={() => {
                            setActionProjectId(null);
                            setMainTab('po_tracking');
                          }}
                          className="flex-1 py-3 px-4 rounded-xl bg-purple-100 hover:bg-purple-200 text-purple-900 border border-purple-300 dark:bg-purple-500/20 dark:hover:bg-purple-500/30 dark:text-purple-200 dark:border-purple-500/40 font-extrabold text-xs transition cursor-pointer flex items-center justify-center gap-2"
                        >
                          <Clock className="w-4 h-4" />
                          <span>รอของเข้า PO ({st.orderedLinkedPOs.map(p => p.po_number).join(', ')})</span>
                        </button>
                      ) : (
                        <button disabled={readOnly}
                          type="button"
                          onClick={() => openStockPoFromProject(actionProject)}
                          className="flex-1 py-3 px-4 rounded-xl bg-gradient-to-r from-[#FF6B00] to-[#E65A00] hover:from-[#FF8A24] text-black font-extrabold text-xs transition cursor-pointer flex items-center justify-center gap-2 shadow-lg shadow-[#FF6B00]/25"
                        >
                          <ShoppingCart className="w-4 h-4" />
                          <span>สั่งซื้อ PO ผูกโปรเจกต์นี้ (ขาด {st.shortageItemCount} รายการ • {st.totalShortage} ชิ้น)</span>
                        </button>
                      )
                    )}
                    {st.hasReleasableStock && (
                      <button
                        type="button"
                        onClick={() => handleReleaseProjectBatchSubmit(actionProject)}
                        disabled={readOnly || (isReleasingProjectStock)}
                        className="flex-1 py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-700 to-teal-800 hover:from-emerald-800 text-white font-extrabold text-xs transition cursor-pointer flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/25"
                      >
                        <Send className="w-4 h-4" />
                        <span>ปล่อยของออกเป็นงวดเบิก (Release Batch #{nextBatchNo})</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setPrintProjectTarget({ project: actionProject, batchNo: null })}
                      className="py-3 px-4 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-900 dark:bg-white/[0.08] dark:hover:bg-white/[0.14] dark:text-white border border-slate-300 dark:border-white/15 font-bold text-xs transition cursor-pointer flex items-center justify-center gap-1.5"
                    >
                      <Printer className="w-4 h-4 text-[#FF6B00]" />
                      <span>พิมพ์บิลโปรเจกต์</span>
                    </button>
                  </div>
                </>
              );
            })()}
          </div>
        </ModalBackdrop>,
        document.body
      )}

      {confirmation && (
        <PurchasingActionConfirmation
          summary={confirmation}
          busy={confirmationBusy}
          error={confirmationError}
          onCancel={() => setConfirmation(null)}
          onConfirm={confirmPurchasingAction}
        />
      )}

      {/* Official A4 ORDER FORM 2026 Print Modal (Project / Batch) */}
      <OrderFormPrintModal
        isOpen={!!printProjectTarget}
        onClose={() => setPrintProjectTarget(null)}
        project={printProjectTarget?.project || null}
        initialBatchNo={printProjectTarget?.batchNo ?? null}
      />
    </div>
  );
};
