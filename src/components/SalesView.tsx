import { useDepartmentReadOnly } from '../context/DepartmentAccess';
import { ModalBackdrop } from './ui/ModalBackdrop';
import { ProductEditorModal } from './ProductEditorModal';
import { ProductCatalogModal } from './ProductCatalogModal';
import { PhoneInput, NumberInput, normalizePhone } from './ui/FormInputs';
import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useApp } from '../context/AppContext';
import { ToastBanner } from './ui/ToastBanner';
import { Modal, modalInputClass, modalLabelClass, modalSecondaryBtnClass } from './ui/Modal';
import {
  FilePlus2, Send, ListOrdered, Plus,
  Sparkles, Layers, Trash2, Calendar, CreditCard,
  FileText, Truck, Search, ShoppingBag, X, Check,
  UserCheck, Pencil, TrendingUp, AlertTriangle, ShieldCheck,
  Receipt, Package, Printer, Wifi, Server, Monitor, Wrench, FileCheck2, Lock, Building2, UserRound, ChevronRight
} from 'lucide-react';
import {
  ROUTE_DEFINITIONS, getRouteByDistrict, RouteCode, BillType, PaymentTerm, DeliveryMode, OrderItem,
  Product, ProductUnit,
  WARRANTY_PRESET_YEARS, formatThaiDateTime, Order, OrderCustomerType,
  Project, ProjectItemType,
  Contract, BillingCategoryType, BillingSubType, BillingBadgeKey,
  BILLING_BADGE_META, getOrderBillingBadgeKey, getProjectDeadlineRisk, formatDateDMY
} from '../types';
import { ListControls, useListControls } from './ListControls';
import { canChangeDraftOrder, isNonPrepCableOrConsumable, worksInPosition } from '../utils/domainHelpers';
import { ActivityTimeline } from './ActivityTimeline';
import { OrderFormPrintModal } from './OrderFormPrintModal';

const DISTRICT_OPTIONS = [
  // สาย 1 (โซนเหนือ)
  { district: 'พุนพิน', zone: 'สาย 1 (โซนเหนือ)' },
  { district: 'ท่าฉาง', zone: 'สาย 1 (โซนเหนือ)' },
  { district: 'ไชยา', zone: 'สาย 1 (โซนเหนือ)' },
  { district: 'ท่าชนะ', zone: 'สาย 1 (โซนเหนือ)' },
  // สาย 2 (โซนตะวันตก)
  { district: 'คีรีรัฐนิคม', zone: 'สาย 2 (โซนตะวันตก)' },
  { district: 'บ้านตาขุน', zone: 'สาย 2 (โซนตะวันตก)' },
  { district: 'พนม', zone: 'สาย 2 (โซนตะวันตก)' },
  // สาย 3 (โซนใต้)
  { district: 'บ้านนาเดิม', zone: 'สาย 3 (โซนใต้)' },
  { district: 'บ้านนาสาร', zone: 'สาย 3 (โซนใต้)' },
  { district: 'เวียงสระ', zone: 'สาย 3 (โซนใต้)' },
  { district: 'พระแสง', zone: 'สาย 3 (โซนใต้)' },
  // สาย 4 (โซนตะวันออก)
  { district: 'กาญจนดิษฐ์', zone: 'สาย 4 (โซนตะวันออก)' },
  { district: 'ดอนสัก', zone: 'สาย 4 (โซนตะวันออก)' },
  { district: 'ขนอม', zone: 'สาย 4 (โซนตะวันออก)' },
  // สาย 5 (ในเมือง / รอบเมือง)
  { district: 'เมืองสุราษฎร์ธานี', zone: 'สาย 5 (ในเมือง / รอบเมือง)' },
  // สาย 6 (ต่างจังหวัด / งานเหมาพิเศษ)
  { district: 'ต่างจังหวัด / งานเหมาพิเศษ', zone: 'สาย 6 (ต่างจังหวัด / ชั่วคราว)' }
];

const LOW_MARGIN_THRESHOLD = 10; // GP ต่ำกว่า 10% = เตือน

const fmt = (n: number) => n.toLocaleString('th-TH', { maximumFractionDigits: 0 });

// คำนวณยอดเงินรวมของออเดอร์ (จาก items_list)
const orderTotal = (ord: Order): number => {
  if (ord.items_list && ord.items_list.length > 0) {
    return ord.items_list.reduce((s, it) => s + (it.unit_price || 0) * (it.quantity || 1), 0);
  }
  return 0;
};

const orderGp = (ord: Order): number => {
  if (ord.items_list && ord.items_list.length > 0) {
    const revenue = ord.items_list.reduce((s, it) => s + (it.unit_price || 0) * (it.quantity || 1), 0);
    const cost = ord.items_list.reduce((s, it) => s + (it.unit_cost || 0) * (it.quantity || 1), 0) + Math.max(0, ord.extra_cost || 0);
    return revenue - cost;
  }
  return 0;
};

const orderItemCount = (ord: Order): number => {
  if (ord.items_list && ord.items_list.length > 0) {
    return ord.items_list.reduce((s, it) => s + (it.quantity || 1), 0);
  }
  return ord._planned_quantity || 1;
};

const DELIVERY_MODE_META: Record<DeliveryMode, { label: string; cls: string }> = {
  install: { label: 'ส่งพร้อมติดตั้ง', cls: 'bg-blue-500/15 text-blue-300 border-blue-500/30' },
  drop_off: { label: 'ส่งอย่างเดียว', cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
  customer_pickup: { label: 'รับเองหน้าร้าน', cls: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
  project: { label: 'งานโครงการ/รับเหมา', cls: 'bg-purple-500/15 text-purple-300 border-purple-500/30' }
};

export const SalesView: React.FC = () => {
  const {
    orders, createOrder, editOrder, deleteDraftOrder, currentUser, users, products, addProduct, updateProduct, deleteProduct, items,
    projects, createProject, addProjectAddonItems, contracts, addContract, updateContractStatus
  } = useApp();
  const readOnly = useDepartmentReadOnly();

  // ชื่อพนักงานขายที่ล็อกอินอยู่ (auto-tag ลงทุกออเดอร์ ไม่ต้องเลือกเอง)
  const salespersonName = currentUser?.name || 'ไม่ระบุตัวตน';

  // Sales Order Form Inputs (แทนใบขาว ORDER FORM 2026)
  const [salesRef, setSalesRef] = useState(`SO-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [district, setDistrict] = useState('เมืองสุราษฎร์ธานี');
  const [provinceCustom, setProvinceCustom] = useState('');
  const [deliveryLoc, setDeliveryLoc] = useState('');
  const [deliveryDate, setDeliveryDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().split('T')[0];
  });
  const [billType, setBillType] = useState<BillType>('tax_invoice');
  const [paymentTerm, setPaymentTerm] = useState<PaymentTerm>('cash');
  const [deliveryMode, setDeliveryMode] = useState<DeliveryMode>('install');
  const [siteNotes, setSiteNotes] = useState('');
  // ต้นทุนแฝง / ค่าดำเนินการหน้างาน (INTERNAL ONLY)
  const [extraJobCost, setExtraJobCost] = useState<number>(0);
  // ยอดมัดจำที่รับแล้ว (บาท)
  const [depositAmount, setDepositAmount] = useState<number>(0);

  // Multi-item Order List on White Sheet
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);

  // Modal State: Billing Type Selector + Create Order Modal + Rental/MA Modal + Catalog Modal + Order Detail Modal + Project Modals
  const [isBillingTypeModalOpen, setIsBillingTypeModalOpen] = useState(false);
  const [isCustomerTypeModalOpen, setIsCustomerTypeModalOpen] = useState(false);
  const [customerType, setCustomerType] = useState<OrderCustomerType>('individual');
  const [customerContactName, setCustomerContactName] = useState('');
  const [isSavingOrder, setIsSavingOrder] = useState(false);
  const [orderSaveError, setOrderSaveError] = useState('');
  const [orderBillingType, setOrderBillingType] = useState<BillingCategoryType>('sales');
  const [orderContractId, setOrderContractId] = useState<string>('');
  const [orderCustomerId, setOrderCustomerId] = useState<string>('');
  const [orderDueDate, setOrderDueDate] = useState<string>('');

  // Rental / MA Recurring Contract Billing Modal State
  const [isContractBillingOpen, setIsContractBillingOpen] = useState(false);
  const [contractBillingMode, setContractBillingMode] = useState<'rental' | 'ma'>('rental');
  const [selectedContractCustomerId, setSelectedContractCustomerId] = useState<string>('');
  const [selectedContractId, setSelectedContractId] = useState<string>('');
  const [contractSalesRef, setContractSalesRef] = useState('');
  const [contractBillingPeriod, setContractBillingPeriod] = useState('');
  const [contractPeriodStart, setContractPeriodStart] = useState('');
  const [contractPeriodEnd, setContractPeriodEnd] = useState('');
  const [contractIssueDate, setContractIssueDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [contractDueDate, setContractDueDate] = useState('');
  const [contractBillType, setContractBillType] = useState<BillType>('tax_invoice');
  const [contractPaymentTerm, setContractPaymentTerm] = useState<PaymentTerm>('credit_30');
  const [contractSiteNotes, setContractSiteNotes] = useState('');
  const [contractOrderItems, setContractOrderItems] = useState<OrderItem[]>([]);

  // Order List Filters (ประเภทบิล + สถานะการชำระเงิน)
  const [orderBillingTypeFilter, setOrderBillingTypeFilter] = useState<'all' | BillingBadgeKey>('all');
  const [orderPaymentStatusFilter, setOrderPaymentStatusFilter] = useState<'all' | 'pending' | 'billed'>('all');

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isCatalogModalOpen, setIsCatalogModalOpen] = useState(false);
  const [catalogTarget, setCatalogTarget] = useState<'order' | 'contract_order' | 'contract_template' | 'project_equipment' | 'project_consumable' | 'addon'>('order');

  // Contract Manager & Add Contract Modal State
  const [isContractManagerOpen, setIsContractManagerOpen] = useState(false);
  const [showAddContractForm, setShowAddContractForm] = useState(false);
  const [ctrType, setCtrType] = useState<'rental' | 'ma'>('rental');
  const [ctrSubType, setCtrSubType] = useState<Contract['sub_type']>('internet_rental');
  const [ctrBillingCycle, setCtrBillingCycle] = useState<Contract['billing_cycle']>('monthly');
  const [ctrNo, setCtrNo] = useState('');
  const [ctrCustomerName, setCtrCustomerName] = useState('');
  const [ctrCustomerPhone, setCtrCustomerPhone] = useState('');
  const [ctrDistrict, setCtrDistrict] = useState('เมืองสุราษฎร์ธานี');
  const [ctrLocation, setCtrLocation] = useState('');
  const [ctrStartDate, setCtrStartDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [ctrEndDate, setCtrEndDate] = useState(() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() + 1);
    d.setDate(d.getDate() - 1);
    return d.toISOString().split('T')[0];
  });
  const [ctrNotes, setCtrNotes] = useState('');
  const [ctrItems, setCtrItems] = useState<OrderItem[]>([]);
  const [selectedDetailOrder, setDetailOrder] = useState<Order | null>(null);
  const detailOrder = orders.find(order => order.id === selectedDetailOrder?.id) ?? null;
  const [printTarget, setPrintTarget] = useState<{ order?: Order | null; project?: Project | null; initialBatchNo?: number | null } | null>(null);
  const [editingOrder, setEditingOrder] = useState<{ order: Order; draft: boolean } | null>(null);
  const orderFieldsLocked = !!editingOrder && !editingOrder.draft;
  const [showDeleteOrder, setShowDeleteOrder] = useState(false);
  const [isDeletingOrder, setIsDeletingOrder] = useState(false);
  const [deleteOrderError, setDeleteOrderError] = useState('');
  const canDeleteDetailOrder = !!detailOrder && canChangeDraftOrder(detailOrder, items);

  const handleDeleteOrder = async () => {
    if (!detailOrder || !canDeleteDetailOrder || isDeletingOrder) return;
    setIsDeletingOrder(true);
    setDeleteOrderError('');
    const success = await deleteDraftOrder(detailOrder.id).catch(() => false);
    setIsDeletingOrder(false);
    if (!success) {
      setDeleteOrderError('ลบบิลไม่สำเร็จ กรุณาตรวจสอบสถานะบิลแล้วลองอีกครั้ง');
      return;
    }
    setShowDeleteOrder(false);
    setDetailOrder(null);
    setToast('ลบบิลแล้ว');
  };

  // ---- Project & Site Installation (PRJ-...) State ----
  const [isCreateProjectOpen, setIsCreateProjectOpen] = useState(false);
  const [detailProjectId, setDetailProjectId] = useState<string | null>(null);
  const [addonProjectId, setAddonProjectId] = useState<string | null>(null);

  // Create Project Form State
  const [prjCode, setPrjCode] = useState(() => `PRJ-${new Date().getFullYear()}-${String(Math.floor(100 + Math.random() * 900))}`);
  const [prjSiteName, setPrjSiteName] = useState('');
  const [prjCustomerName, setPrjCustomerName] = useState('');
  const [prjPhone, setPrjPhone] = useState('');
  const [prjDistrict, setPrjDistrict] = useState('เมืองสุราษฎร์ธานี');
  const [prjLocation, setPrjLocation] = useState('');
  const [prjStartDate, setPrjStartDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [prjDueDate, setPrjDueDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toISOString().split('T')[0];
  });
  const [prjAssignedTechs, setPrjAssignedTechs] = useState<string[]>(['ช่างซี']);
  const [prjItems, setPrjItems] = useState<{
    product_id?: string;
    model_name: string;
    item_type: ProjectItemType;
    unit: ProductUnit;
    qty_required: number;
    unit_cost: number;
    unit_price: number;
    warranty_years: number;
  }[]>([]);

  // Add-On Modal Form State (Multi-Sales Add-On Attribution — supports multiple items at once)
  const [addonAddedBy, setAddonAddedBy] = useState('');
  const [addonItems, setAddonItems] = useState<{
    product_id?: string;
    model_name: string;
    item_type: ProjectItemType;
    unit: ProductUnit;
    qty_required: number;
    unit_cost: number;
    unit_price: number;
    warranty_years: number;
  }[]>([]);
  const [addonNote, setAddonNote] = useState('');

  const detailProject = useMemo(
    () => (detailProjectId ? projects.find(p => p.id === detailProjectId) || null : null),
    [projects, detailProjectId]
  );
  const addonProject = useMemo(
    () => (addonProjectId ? projects.find(p => p.id === addonProjectId) || null : null),
    [projects, addonProjectId]
  );
  const salesUsersList = useMemo(
    () => users.filter(u => (worksInPosition(u, 'sales') || u.role === 'admin') && u.is_active !== false),
    [users]
  );
  const onsiteUsersList = useMemo(
    () => users.filter(u => worksInPosition(u, 'onsite') && u.is_active !== false),
    [users]
  );
  const [showCustomerSuggestions, setShowCustomerSuggestions] = useState(false);
  const [autoFilledCustomer, setAutoFilledCustomer] = useState<string | null>(null);

  // Build deduplicated directory of returning customers / companies from past orders (latest order wins)
  const customerDirectory = useMemo(() => {
    const map = new Map<string, {
      name: string;
      contactName: string;
      phone: string;
      district: string;
      deliveryLocation: string;
      provinceCustom: string;
      orderCount: number;
      latestAt: number;
    }>();
    const sorted = [...orders].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
    sorted.forEach(o => {
      if (o.customer_type && o.customer_type !== customerType) return;
      const name = (o.customer_name || '').trim();
      if (!name) return;
      const key = name.toLowerCase();
      const existing = map.get(key);
      if (!existing) {
        map.set(key, {
          name,
          contactName: (o.customer_contact_name || '').trim(),
          phone: (o.customer_phone || '').trim(),
          district: o.district || '',
          deliveryLocation: (o.delivery_location || '').trim(),
          provinceCustom: (o.province_custom || '').trim(),
          orderCount: 1,
          latestAt: new Date(o.created_at).getTime()
        });
      } else {
        existing.orderCount += 1;
        if (!existing.contactName && o.customer_contact_name) {
          existing.contactName = o.customer_contact_name.trim();
        }
        if (!existing.phone && o.customer_phone) existing.phone = o.customer_phone.trim();
        if (!existing.deliveryLocation && o.delivery_location) existing.deliveryLocation = o.delivery_location.trim();
      }
    });
    return Array.from(map.values());
  }, [orders, customerType]);

  const customerSuggestions = useMemo(() => {
    const q = customerName.trim().toLowerCase();
    if (!q) return customerDirectory.slice(0, 5);
    const phoneQuery = /^[0-9๐-๙+()\s-]+$/.test(q) ? normalizePhone(q) : '';
    return customerDirectory
      .filter(c => c.name.toLowerCase().includes(q) || (phoneQuery && normalizePhone(c.phone).includes(phoneQuery)) ||
        (customerType === 'organization' && c.contactName.toLowerCase().includes(q)))
      .slice(0, 6);
  }, [customerDirectory, customerName, customerType]);

  const applyReturningCustomer = (cust: typeof customerDirectory[number]) => {
    setCustomerName(cust.name);
    setCustomerContactName(cust.contactName);
    if (cust.phone) setCustomerPhone(normalizePhone(cust.phone));
    if (cust.district && DISTRICT_OPTIONS.some(d => d.district === cust.district)) {
      setDistrict(cust.district);
    }
    if (cust.deliveryLocation) setDeliveryLoc(cust.deliveryLocation);
    if (cust.provinceCustom) setProvinceCustom(cust.provinceCustom);
    setAutoFilledCustomer(cust.name);
    setShowCustomerSuggestions(false);
  };

  const handleCustomerNameChange = (val: string) => {
    setCustomerName(val);
    if (val.trim().toLowerCase() !== customerName.trim().toLowerCase()) {
      setCustomerContactName('');
    }
    setShowCustomerSuggestions(true);
    const exact = customerDirectory.find(c => c.name.toLowerCase() === val.trim().toLowerCase());
    if (exact) {
      setCustomerContactName(exact.contactName);
      if (!customerPhone.trim() && exact.phone) setCustomerPhone(normalizePhone(exact.phone));
      if (exact.district && DISTRICT_OPTIONS.some(d => d.district === exact.district)) {
        setDistrict(exact.district);
      }
      if (!deliveryLoc.trim() && exact.deliveryLocation) setDeliveryLoc(exact.deliveryLocation);
      if (!provinceCustom.trim() && exact.provinceCustom) setProvinceCustom(exact.provinceCustom);
      setAutoFilledCustomer(exact.name);
    } else if (autoFilledCustomer && val.trim().toLowerCase() !== autoFilledCustomer.toLowerCase()) {
      setAutoFilledCustomer(null);
    }
  };

  // Selected items inside the Modal: mapping productId -> quantity
  const [modalSelectedMap, setModalSelectedMap] = useState<Record<string, number>>({});

  // Inline Add / Edit Product Form within Modal
  const [productEditor, setProductEditor] = useState<{ product?: Product } | null>(null);

  // Order list search
  const [orderSearch, setOrderSearch] = useState('');

  const [toast, setToast] = useState('');

  // คำนวณสายรถอัตโนมัติตามอำเภอที่เลือก
  const currentRouteCode: RouteCode = editingOrder && (editingOrder.order.district ?? '') === district
    ? editingOrder.order.route_code ?? getRouteByDistrict(district)
    : getRouteByDistrict(district);
  const routeMeta = ROUTE_DEFINITIONS[currentRouteCode];

  // Lock background scroll while any modal is open
  const anyModalOpen = !!productEditor || isCreateModalOpen || isCatalogModalOpen || !!detailOrder || isCreateProjectOpen || !!detailProject || !!addonProject;
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

  // ---- Helper: Default Billing Period & Dates for Contract ----
  const getDefaultBillingPeriod = (cycle: Contract['billing_cycle']) => {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth() + 1;
    const pad = (n: number) => String(n).padStart(2, '0');
    if (cycle === 'yearly') {
      return {
        period: `${y}`,
        start: `${y}-01-01`,
        end: `${y}-12-31`
      };
    }
    if (cycle === 'quarterly') {
      const q = Math.floor((m - 1) / 3) + 1;
      const startMonth = (q - 1) * 3 + 1;
      const endMonth = q * 3;
      const lastDay = new Date(y, endMonth, 0).getDate();
      return {
        period: `${y}-Q${q}`,
        start: `${y}-${pad(startMonth)}-01`,
        end: `${y}-${pad(endMonth)}-${pad(lastDay)}`
      };
    }
    const lastDay = new Date(y, m, 0).getDate();
    return {
      period: `${y}-${pad(m)}`,
      start: `${y}-${pad(m)}-01`,
      end: `${y}-${pad(m)}-${pad(lastDay)}`
    };
  };

  // Active contracts matching current contractBillingMode ('rental' | 'ma')
  const matchingActiveContracts = useMemo(
    () => contracts.filter(c => c.status === 'active' && c.contract_type === contractBillingMode),
    [contracts, contractBillingMode]
  );

  // Customers who have active contracts of matching type
  const contractCustomers = useMemo(() => {
    const map = new Map<string, { customer_id: string; customer_name: string; customer_phone?: string }>();
    matchingActiveContracts.forEach(c => {
      if (!map.has(c.customer_id)) {
        map.set(c.customer_id, {
          customer_id: c.customer_id,
          customer_name: c.customer_name,
          customer_phone: c.customer_phone
        });
      }
    });
    return Array.from(map.values());
  }, [matchingActiveContracts]);

  const customerActiveContracts = useMemo(
    () =>
      selectedContractCustomerId
        ? matchingActiveContracts.filter(c => c.customer_id === selectedContractCustomerId)
        : matchingActiveContracts,
    [matchingActiveContracts, selectedContractCustomerId]
  );

  const selectedContract = useMemo(
    () => matchingActiveContracts.find(c => c.id === selectedContractId) || null,
    [matchingActiveContracts, selectedContractId]
  );

  // Duplicate Period Check: same contract_id + billing_period
  const duplicatePeriodOrder = useMemo(() => {
    if (!selectedContractId || !contractBillingPeriod.trim()) return null;
    const normPeriod = contractBillingPeriod.trim().toLowerCase();
    return (
      orders.find(
        o =>
          o.contract_id === selectedContractId &&
          (o.billing_period || '').trim().toLowerCase() === normPeriod
      ) || null
    );
  }, [orders, selectedContractId, contractBillingPeriod]);

  const applySelectedContract = (ctr: Contract | null) => {
    if (!ctr) {
      setSelectedContractId('');
      setContractOrderItems([]);
      return;
    }
    setSelectedContractCustomerId(ctr.customer_id);
    setSelectedContractId(ctr.id);
    const defaults = getDefaultBillingPeriod(ctr.billing_cycle);
    setContractBillingPeriod(defaults.period);
    setContractPeriodStart(defaults.start);
    setContractPeriodEnd(defaults.end);
    const todayStr = new Date().toISOString().split('T')[0];
    const dueObj = new Date();
    dueObj.setDate(dueObj.getDate() + 30);
    setContractIssueDate(todayStr);
    setContractDueDate(dueObj.toISOString().split('T')[0]);
    setContractSiteNotes(ctr.notes || '');
    setContractOrderItems(
      (ctr.items || []).map(ci => ({
        model_name: ci.model_name,
        item_type: ci.item_type,
        quantity: ci.quantity,
        unit: ci.unit,
        unit_price: ci.unit_price,
        unit_cost: ci.unit_cost,
        warranty_years: 0
      }))
    );
  };

  const handleOpenContractBillingModal = (mode: 'rental' | 'ma') => {
    setIsBillingTypeModalOpen(false);
    setContractBillingMode(mode);
    const prefix = mode === 'rental' ? 'RN' : 'MA';
    setContractSalesRef(`${prefix}-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`);
    setContractBillType('tax_invoice');
    setContractPaymentTerm('credit_30');
    const firstActive = contracts.find(c => c.status === 'active' && c.contract_type === mode) || null;
    if (firstActive) {
      applySelectedContract(firstActive);
    } else {
      setSelectedContractCustomerId('');
      setSelectedContractId('');
      setContractBillingPeriod('');
      setContractPeriodStart('');
      setContractPeriodEnd('');
      setContractIssueDate(new Date().toISOString().split('T')[0]);
      setContractDueDate('');
      setContractSiteNotes('');
      setContractOrderItems([]);
    }
    setIsContractBillingOpen(true);
  };

  const handleSubmitContractBilling = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedContract) {
      alert('กรุณาเลือกลูกค้าและสัญญาที่ใช้งานอยู่');
      return;
    }
    if (!contractBillingPeriod.trim()) {
      alert('กรุณาระบุงวดการวางบิล (Billing Period)');
      return;
    }
    if (duplicatePeriodOrder) {
      alert(`พบการออกบิลซ้ำในงวด ${contractBillingPeriod} สำหรับสัญญา ${selectedContract.contract_no} แล้ว (${duplicatePeriodOrder.sales_ref || duplicatePeriodOrder.id})`);
      return;
    }
    if (contractOrderItems.length === 0) {
      alert('กรุณามีรายการอย่างน้อย 1 รายการในบิล');
      return;
    }

    const totalQty = contractOrderItems.reduce((acc, curr) => acc + (curr.quantity || 0), 0);
    createOrder({
      sales_ref: contractSalesRef,
      salesperson: salespersonName,
      customer_id: selectedContract.customer_id,
      customer_name: selectedContract.customer_name,
      customer_phone: selectedContract.customer_phone || '',
      delivery_location: selectedContract.delivery_location || `อ.${selectedContract.district || 'เมืองสุราษฎร์ธานี'}`,
      district: selectedContract.district || 'เมืองสุราษฎร์ธานี',
      route_code: getRouteByDistrict(selectedContract.district || 'เมืองสุราษฎร์ธานี'),
      delivery_date: contractIssueDate || new Date().toISOString().split('T')[0],
      issue_date: contractIssueDate || new Date().toISOString().split('T')[0],
      due_date: contractDueDate || null,
      bill_type: contractBillType,
      payment_term: contractPaymentTerm,
      delivery_mode: 'install',
      site_notes: contractSiteNotes.trim(),
      items_list: contractOrderItems,
      extra_cost: 0,
      deposit_amount: 0,
      planned_model: contractOrderItems[0]?.model_name || '',
      planned_quantity: totalQty,
      bill_no: null,
      billing_type: contractBillingMode,
      sub_type: selectedContract.sub_type,
      contract_id: selectedContract.id,
      billing_period: contractBillingPeriod.trim(),
      period_start: contractPeriodStart || null,
      period_end: contractPeriodEnd || null,
      billing_status: 'pending'
    });

    setToast(`เปิดบิล ${contractSalesRef} (${selectedContract.contract_no} • งวด ${contractBillingPeriod}) เรียบร้อยแล้ว`);
    setIsContractBillingOpen(false);
    setTimeout(() => setToast(''), 4500);
  };

  // ---- Contract Manager & Add Contract Handlers ----
  const makeContractNo = (subType: Contract['sub_type']) => {
    const y = new Date().getFullYear();
    const num = String(contracts.length + 1).padStart(3, '0');
    const prefix =
      subType === 'internet_rental' ? 'RENT-NET' :
      subType === 'system_rental' ? 'RENT-SYS' :
      subType === 'equipment_rental' ? 'RENT-EQ' : 'MA';
    return `${prefix}-${y}-${num}`;
  };

  const handleOpenContractManager = (openForm = false, presetType: 'rental' | 'ma' = 'rental') => {
    const defaultSub: Contract['sub_type'] = presetType === 'ma' ? 'ma_monthly' : 'internet_rental';
    setCtrType(presetType);
    setCtrSubType(defaultSub);
    setCtrBillingCycle('monthly');
    setCtrNo(makeContractNo(defaultSub));
    setCtrCustomerName('');
    setCtrCustomerPhone('');
    setCtrDistrict('เมืองสุราษฎร์ธานี');
    setCtrLocation('');
    const today = new Date();
    const nextYear = new Date(today);
    nextYear.setFullYear(nextYear.getFullYear() + 1);
    nextYear.setDate(nextYear.getDate() - 1);
    setCtrStartDate(today.toISOString().split('T')[0]);
    setCtrEndDate(nextYear.toISOString().split('T')[0]);
    setCtrNotes('');
    setCtrItems([]);
    setShowAddContractForm(openForm);
    setIsContractManagerOpen(true);
  };

  const handleSaveNewContract = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ctrCustomerName.trim() || !ctrNo.trim() || ctrItems.length === 0) {
      alert('กรุณากรอกเลขที่สัญญา ชื่อลูกค้า และเพิ่มรายการในสัญญาอย่างน้อย 1 รายการ');
      return;
    }
    const custSlug = `cust-${ctrCustomerName.trim().toLowerCase().replace(/[^a-z0-9ก-๙]+/gi, '-').slice(0, 24)}-${Date.now().toString().slice(-4)}`;
    const created = addContract({
      contract_no: ctrNo.trim(),
      customer_id: custSlug,
      customer_name: ctrCustomerName.trim(),
      customer_phone: ctrCustomerPhone.trim(),
      district: ctrDistrict,
      delivery_location: ctrLocation.trim() || `อ.${ctrDistrict}`,
      contract_type: ctrType,
      sub_type: ctrSubType,
      billing_cycle: ctrBillingCycle,
      start_date: ctrStartDate,
      end_date: ctrEndDate,
      status: 'active',
      notes: ctrNotes.trim(),
      items: ctrItems.map(it => ({
        model_name: it.model_name,
        item_type: it.item_type || 'service',
        unit: it.unit || 'รายการ',
        quantity: it.quantity || 1,
        unit_price: it.unit_price || 0,
        unit_cost: it.unit_cost || 0
      }))
    });

    setToast(`เพิ่มสัญญา ${created.contract_no} (${created.customer_name}) เรียบร้อยแล้ว`);
    setShowAddContractForm(false);

    // If user opened this from inside Rental/MA billing modal, auto-select the newly created contract
    if (isContractBillingOpen && created.contract_type === contractBillingMode) {
      setIsContractManagerOpen(false);
      setTimeout(() => {
        setSelectedContractCustomerId(created.customer_id);
        setSelectedContractId(created.id);
        const defaults = getDefaultBillingPeriod(created.billing_cycle);
        setContractBillingPeriod(defaults.period);
        setContractPeriodStart(defaults.start);
        setContractPeriodEnd(defaults.end);
        setContractSiteNotes(created.notes || '');
        setContractOrderItems(
          created.items.map(ci => ({
            model_name: ci.model_name,
            item_type: ci.item_type,
            quantity: ci.quantity,
            unit: ci.unit,
            unit_price: ci.unit_price,
            unit_cost: ci.unit_cost,
            warranty_years: 0
          }))
        );
      }, 0);
    }
    setTimeout(() => setToast(''), 4500);
  };

  // ---- Create Order Modal (Sales / Addon) ----
  const handleOpenCustomerTypeModal = (mode: 'sales' | 'addon') => {
    setEditingOrder(null);
    setIsBillingTypeModalOpen(false);
    setOrderBillingType(mode);
    setOrderContractId('');
    setOrderCustomerId('');
    setSalesRef(`${mode === 'addon' ? 'ADD' : 'SO'}-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`);
    setCustomerName('');
    setCustomerPhone('');
    setCustomerContactName('');
    setOrderSaveError('');
    setDistrict('เมืองสุราษฎร์ธานี');
    setProvinceCustom('');
    setDeliveryLoc('');
    setDeliveryDate('');
    setOrderDueDate('');
    setBillType('tax_invoice');
    setPaymentTerm('cash');
    setDeliveryMode('install');
    setSiteNotes('');
    setExtraJobCost(0);
    setDepositAmount(0);
    setOrderItems([]);
    setAutoFilledCustomer(null);
    setShowCustomerSuggestions(false);
    setIsCustomerTypeModalOpen(true);
  };

  const handleCloseCreateModal = () => {
    if (isSavingOrder) return;
    setIsCreateModalOpen(false);
    setEditingOrder(null);
  };

  const handleOpenEditOrder = (order: Order) => {
    setEditingOrder({ order, draft: canChangeDraftOrder(order, items) });
    setOrderBillingType(order.billing_type ?? 'sales');
    setOrderContractId(order.contract_id ?? '');
    setOrderCustomerId(order.customer_id ?? '');
    setSalesRef(order.sales_ref ?? order.id);
    setCustomerType(order.customer_type ?? 'individual');
    setCustomerName(order.customer_name);
    setCustomerContactName(order.customer_contact_name ?? '');
    setCustomerPhone(normalizePhone(order.customer_phone ?? ''));
    setDistrict(order.district ?? '');
    setProvinceCustom(order.province_custom ?? '');
    setDeliveryLoc(order.delivery_location ?? '');
    setDeliveryDate(order.delivery_date ?? '');
    setOrderDueDate(order.due_date ?? '');
    setBillType(order.bill_type ?? 'tax_invoice');
    setPaymentTerm(order.payment_term ?? 'cash');
    setDeliveryMode(order.delivery_mode ?? 'install');
    setSiteNotes(order.site_notes ?? '');
    setExtraJobCost(order.extra_cost ?? 0);
    setDepositAmount(order.deposit_amount ?? 0);
    setOrderItems(order.items_list ?? []);
    setOrderSaveError('');
    setAutoFilledCustomer(null);
    setShowCustomerSuggestions(false);
    setIsCreateModalOpen(true);
  };

  // เปิดบิลใหม่จากโปรเจกต์ที่ส่งมอบปิดงานแล้ว — ดึงเฉพาะข้อมูลลูกค้า & สถานที่ (ไม่ดึงรายการสินค้าเก่า)
  const handleCreateFollowUpBillFromClosedProject = (prj: Project) => {
    handleOpenCustomerTypeModal('addon');
    setCustomerName(prj.customer_name || '');
    setCustomerPhone(normalizePhone(prj.phone || ''));
    setDistrict(prj.district || 'เมืองสุราษฎร์ธานี');
    setDeliveryLoc(prj.location || '');
    setSiteNotes(`งานเพิ่มเติม/แก้ไขต่อจากโปรเจกต์ที่ส่งมอบแล้ว ${prj.id} (${prj.site_name})`);
    setOrderItems([]);
    setDetailProjectId(null);
  };

  // Open Catalog Modal
  const handleOpenCatalogModal = (target: 'order' | 'contract_order' | 'contract_template' | 'project_equipment' | 'project_consumable' | 'addon' = 'order') => {
    setCatalogTarget(target);
    setModalSelectedMap({});
    setIsCatalogModalOpen(true);
  };

  // Toggle selection in Modal
  const handleToggleSelectModalItem = (item: Product) => {
    setModalSelectedMap(prev => {
      const copy = { ...prev };
      if (copy[item.id] !== undefined) {
        delete copy[item.id];
      } else {
        copy[item.id] = 1;
      }
      return copy;
    });
  };

  const handleUpdateModalItemQty = (itemId: string, qty: number) => {
    const validQty = Math.max(1, qty);
    setModalSelectedMap(prev => ({ ...prev, [itemId]: validQty }));
  };

  // Delete item from Catalog
  const handleDeleteCatalogItem = (itemId: string, itemName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm(`ต้องการลบ "${itemName}" ออกจากแคตตาล็อกหรือไม่?`)) {
      deleteProduct(itemId);
      setModalSelectedMap(prev => {
        const copy = { ...prev };
        delete copy[itemId];
        return copy;
      });
    }
  };

  // Confirm selected items from Modal back to Order / Project / Add-On Form
  const handleConfirmModalSelection = () => {
    const selectedIds = Object.keys(modalSelectedMap);
    if (selectedIds.length === 0) {
      alert('กรุณาติ๊กเลือกสินค้าหรือบริการอย่างน้อย 1 รายการ');
      return;
    }

    if (catalogTarget === 'project_equipment' || catalogTarget === 'project_consumable') {
      const targetType: ProjectItemType = catalogTarget === 'project_equipment' ? 'equipment' : 'consumable';
      const newPrjItems = selectedIds
        .map(id => {
          const catItem = products.find(c => c.id === id);
          if (!catItem) return null;
          const resolvedType: ProjectItemType = isNonPrepCableOrConsumable(catItem.name) ? 'consumable' : targetType;
          return {
            product_id: catItem.id,
            model_name: catItem.name,
            item_type: resolvedType,
            unit: catItem.unit,
            qty_required: modalSelectedMap[id] || 1,
            unit_cost: catItem.cost_price,
            unit_price: catItem.sell_price,
            warranty_years: resolvedType === 'equipment' ? 1 : 0
          };
        })
        .filter((x): x is NonNullable<typeof x> => x !== null);

      setPrjItems(prev => [...prev, ...newPrjItems]);
      setIsCatalogModalOpen(false);
      setToast(`เพิ่ม ${newPrjItems.length} รายการเข้าโปรเจกต์เรียบร้อยแล้ว`);
      setTimeout(() => setToast(''), 3500);
      return;
    }

    if (catalogTarget === 'addon') {
      const pickedAddons = selectedIds
        .map(id => {
          const catItem = products.find(c => c.id === id);
          if (!catItem) return null;
          const inferredType: ProjectItemType =
            catItem.item_type === 'service' || /สายสัญญาณ|ท่อ|ค่าบริการ|ค่าแรง/.test(catItem.name)
              ? 'consumable'
              : 'equipment';
          return {
            product_id: catItem.id,
            model_name: catItem.name,
            item_type: inferredType,
            unit: catItem.unit,
            qty_required: modalSelectedMap[id] || 1,
            unit_cost: catItem.cost_price,
            unit_price: catItem.sell_price,
            warranty_years: inferredType === 'equipment' ? 1 : 0
          };
        })
        .filter((x): x is NonNullable<typeof x> => x !== null);

      setAddonItems(prev => [...prev, ...pickedAddons]);
      setIsCatalogModalOpen(false);
      setToast(`เพิ่ม ${pickedAddons.length} รายการเข้าชุด Add-on แล้ว`);
      setTimeout(() => setToast(''), 3000);
      return;
    }

    const itemsToAdd: OrderItem[] = [];
    selectedIds.forEach(id => {
      const catItem = products.find(c => c.id === id);
      if (catItem) {
        itemsToAdd.push({
          model_name: catItem.name,
          quantity: modalSelectedMap[id] || 1,
          item_type: catItem.item_type,
          unit: catItem.unit,
          unit_price: catItem.sell_price,
          unit_cost: catItem.cost_price,
          // ค่าเริ่มต้น: อุปกรณ์ฮาร์ดแวร์ 1 ปี / บริการ 0 ปี (ไม่มีประกัน)
          warranty_years: catItem.item_type === 'service' ? 0 : 1
        });
      }
    });

    if (catalogTarget === 'contract_order') {
      setContractOrderItems(prev => [...prev, ...itemsToAdd]);
    } else if (catalogTarget === 'contract_template') {
      setCtrItems(prev => [...prev, ...itemsToAdd]);
    } else {
      setOrderItems(prev => [...prev, ...itemsToAdd]);
    }

    setIsCatalogModalOpen(false);
    setToast(`เพิ่ม ${itemsToAdd.length} รายการเข้าบิลเรียบร้อยแล้ว`);
    setTimeout(() => setToast(''), 3500);
  };

  const handleRemoveItemFromOrder = (index: number) => {
    setOrderItems(prev => prev.filter((_, i) => i !== index));
  };

  const handleUpdateItemQuantity = (index: number, newQty: number) => {
    const validQty = Math.max(1, newQty);
    setOrderItems(prev => prev.map((item, i) => i === index ? { ...item, quantity: validQty } : item));
  };

  const handleUpdateItemUnitPrice = (index: number, price: number) => {
    const validPrice = Math.max(0, price);
    setOrderItems(prev => prev.map((item, i) => i === index ? { ...item, unit_price: validPrice } : item));
  };

  const handleUpdateItemUnitCost = (index: number, cost: number) => {
    const validCost = Math.max(0, cost);
    setOrderItems(prev => prev.map((item, i) => i === index ? { ...item, unit_cost: validCost } : item));
  };

  const handleUpdateItemWarranty = (index: number, years: number) => {
    const validYears = Math.max(0, Math.floor(years) || 0);
    setOrderItems(prev => prev.map((item, i) => i === index ? { ...item, warranty_years: validYears } : item));
  };

  const handleSubmitOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSavingOrder) return;
    if (!customerName.trim() || (!orderFieldsLocked && orderItems.length === 0)) {
      setOrderSaveError('กรุณากรอกชื่อลูกค้าและเพิ่มรายการสินค้า');
      return;
    }
    if (customerType === 'organization' && !customerContactName.trim()) {
      setOrderSaveError('กรุณากรอกชื่อผู้ติดต่อ');
      return;
    }

    const totalQty = orderItems.reduce((acc, curr) => acc + curr.quantity, 0);

    setIsSavingOrder(true);
    setOrderSaveError('');
    const customerDetails = {
      customer_name: customerName.trim(),
      customer_phone: customerPhone.trim(),
      delivery_location: deliveryLoc.trim() || (district ? `อ.${district}` : ''),
      site_notes: siteNotes.trim(),
      ...(customerType === 'organization' ? { customer_contact_name: customerContactName.trim() } : {}),
    };
    const draftDetails = {
      customer_id: orderCustomerId || null,
      contract_id: orderContractId || null,
      district: district,
      route_code: currentRouteCode,
      province_custom: currentRouteCode === 'route_6' ? provinceCustom.trim() : '',
      delivery_date: deliveryDate,
      due_date: orderDueDate || null,
      bill_type: billType,
      payment_term: paymentTerm,
      delivery_mode: deliveryMode,
      items_list: orderItems,
      extra_cost: Math.max(0, extraJobCost),
      deposit_amount: Math.max(0, depositAmount),
    };
    const request = editingOrder
      ? editOrder(editingOrder.order, customerDetails, editingOrder.draft ? draftDetails : undefined)
      : createOrder({
        ...customerDetails,
        ...draftDetails,
        sales_ref: salesRef,
        salesperson: salespersonName,
        customer_type: customerType,
        issue_date: deliveryDate || new Date().toISOString().split('T')[0],
        planned_model: orderItems[0]?.model_name || '',
        planned_quantity: totalQty,
        bill_no: null,
        billing_type: orderBillingType,
        sub_type: orderBillingType === 'addon' ? 'addon_service' : 'standard',
        billing_status: 'pending'
      });
    const saved = await request.catch(() => false);
    setIsSavingOrder(false);
    if (!saved) {
      setOrderSaveError(editingOrder
        ? 'บันทึกการแก้ไขไม่สำเร็จ กรุณาเปิดบิลอีกครั้งเพื่อตรวจสอบข้อมูลล่าสุด'
        : 'บันทึกบิลไม่สำเร็จ กรุณาลองอีกครั้ง');
      return;
    }

    setToast(editingOrder ? 'บันทึกการแก้ไขบิลแล้ว' : `สร้างใบสั่งขายรหัส ${salesRef} รวม ${totalQty} ชิ้น ส่งต่อจัดซื้อ & สต๊อกแล้ว`);
    setIsCreateModalOpen(false);
    setEditingOrder(null);
    setCustomerName('');
    setCustomerPhone('');
    setDeliveryLoc('');
    setSiteNotes('');
    setExtraJobCost(0);
    setDepositAmount(0);
    setOrderItems([]);
    setAutoFilledCustomer(null);
    setShowCustomerSuggestions(false);
    setSalesRef(`SO-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`);
    setTimeout(() => setToast(''), 4500);
  };

  const getOrderStatusBadge = (status: string) => {
    switch (status) {
      case 'pending_purchasing':
        return <span className="px-2.5 py-1 rounded-full text-[10px] font-semibold bg-blue-500/15 text-blue-400 border border-blue-500/30 whitespace-nowrap">รอจัดซื้อ/เช็กสต๊อก</span>;
      case 'waiting_po':
        return <span className="px-2.5 py-1 rounded-full text-[10px] font-semibold bg-purple-500/15 text-purple-400 border border-purple-500/30 whitespace-nowrap">รอสั่งซื้อของเข้า (รอ PO)</span>;
      case 'po_received_in_stock':
        return <span className="px-2.5 py-1 rounded-full text-[10px] font-semibold bg-teal-500/15 text-teal-400 border border-teal-500/30 whitespace-nowrap">ของเข้าสต๊อกแล้ว (รอช่างเตรียม)</span>;
      case 'approved_for_prep':
        return <span className="px-2.5 py-1 rounded-full text-[10px] font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30 whitespace-nowrap">ตัดสต๊อกแล้ว (ช่างกำลังเตรียม)</span>;
      case 'fulfilled':
        return <span className="px-2.5 py-1 rounded-full text-[10px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 whitespace-nowrap">ส่งมอบสมบูรณ์แล้ว</span>;
      default:
        return <span className="px-2.5 py-1 rounded-full text-[10px] font-semibold bg-white/10 text-slate-300 whitespace-nowrap">{status}</span>;
    }
  };

  // Live stock counts per product name (normalized name.trim().toLowerCase())
  const stockByName = useMemo(() => {
    const map: Record<string, { inStock: number; incoming: number }> = {};
    items.forEach(it => {
      const key = (it.model_name || '').trim().toLowerCase();
      if (!key) return;
      if (!map[key]) map[key] = { inStock: 0, incoming: 0 };
      if (it.status === 'raw_stock' || it.status === 'in_stock') map[key].inStock += 1;
    });
    orders.forEach(o => {
      if (o.order_status !== 'waiting_po') return;
      (o.items_list || []).forEach(it => {
        if (it.item_type === 'service') return;
        const key = (it.model_name || '').trim().toLowerCase();
        if (!key) return;
        if (!map[key]) map[key] = { inStock: 0, incoming: 0 };
        map[key].incoming += it.quantity || 1;
      });
    });
    return map;
  }, [items, orders]);

  // Filter orders by search, ประเภทบิล (billing category), and สถานะการชำระเงิน (billing_status) BEFORE pagination
  const filteredOrders = useMemo(() => {
    const q = orderSearch.trim().toLowerCase();
    return orders.filter(o => {
      if (orderBillingTypeFilter !== 'all' && getOrderBillingBadgeKey(o) !== orderBillingTypeFilter) {
        return false;
      }
      if (orderPaymentStatusFilter === 'pending' && o.billing_status === 'billed') {
        return false;
      }
      if (orderPaymentStatusFilter === 'billed' && o.billing_status !== 'billed') {
        return false;
      }
      if (!q) return true;
      return (
        (o.customer_name || '').toLowerCase().includes(q) ||
        (o.sales_ref || '').toLowerCase().includes(q) ||
        (o.bill_no || '').toLowerCase().includes(q) ||
        (o.billing_period || '').toLowerCase().includes(q)
      );
    });
  }, [orders, orderSearch, orderBillingTypeFilter, orderPaymentStatusFilter]);

  // Sort + pagination สำหรับการ์ดติดตามออเดอร์
  const ordersList = useListControls(filteredOrders, {
    getDate: (o) => o.created_at,
    getValue: (o) => (o.items_list || []).reduce((s, it) => s + (it.unit_price || 0) * it.quantity, 0),
    initialSort: 'newest',
  });

  const searchedOrders = ordersList.pageItems;

  const modalTotalAmount = Object.keys(modalSelectedMap).reduce((sum, id) => {
    const item = products.find(c => c.id === id);
    const qty = modalSelectedMap[id] || 1;
    return sum + (item ? item.sell_price * qty : 0);
  }, 0);

  // Live Order Financials (INTERNAL ONLY)
  const financials = useMemo(() => {
    const revenue = orderItems.reduce((sum, it) => sum + (it.unit_price || 0) * it.quantity, 0);
    const itemCost = orderItems.reduce((sum, it) => sum + (it.unit_cost || 0) * it.quantity, 0);
    const totalCost = itemCost + Math.max(0, extraJobCost);
    const gp = revenue - totalCost;
    const marginPct = revenue > 0 ? (gp / revenue) * 100 : 0;
    const belowCost = revenue > 0 && gp < 0;
    const lowMargin = revenue > 0 && !belowCost && marginPct < LOW_MARGIN_THRESHOLD;
    return { revenue, itemCost, totalCost, gp, marginPct, belowCost, lowMargin };
  }, [orderItems, extraJobCost]);

  // KPI Summary (รวมทั้งบิลขาย SO และงานโปรเจกต์ PRJ)
  const kpi = useMemo(() => {
    const orderRev = orders.reduce((s, o) => s + orderTotal(o), 0);
    const orderGross = orders.reduce((s, o) => s + orderGp(o), 0);
    const prjRev = projects.reduce(
      (s, p) => s + (p.items || []).reduce((acc, it) => acc + (it.unit_price || 0) * (it.qty_required || 0), 0),
      0
    );
    const prjCost = projects.reduce(
      (s, p) => s + (p.items || []).reduce((acc, it) => acc + (it.unit_cost || 0) * (it.qty_required || 0), 0),
      0
    );
    return {
      count: orders.length,
      projectCount: projects.length,
      totalRevenue: orderRev + prjRev,
      totalGp: orderGross + (prjRev - prjCost)
    };
  }, [orders, projects]);

  const handleOpenCreateProjectModal = () => {
    const currentYear = new Date().getFullYear();
    const existingMax = projects.reduce((max, p) => {
      const m = p.id.match(/^PRJ-\d{4}-(\d+)$/);
      return m ? Math.max(max, parseInt(m[1], 10)) : max;
    }, 0);
    const nextNum = String(Math.max(projects.length, existingMax) + 1).padStart(3, '0');
    setPrjCode(`PRJ-${currentYear}-${nextNum}`);
    setPrjSiteName('');
    setPrjCustomerName('');
    setPrjPhone('');
    setPrjDistrict('เมืองสุราษฎร์ธานี');
    setPrjLocation('');
    const todayIso = new Date().toISOString().split('T')[0];
    const nextWeek = new Date();
    nextWeek.setDate(nextWeek.getDate() + 7);
    setPrjStartDate(todayIso);
    setPrjDueDate(nextWeek.toISOString().split('T')[0]);
    setPrjAssignedTechs(onsiteUsersList.length > 0 ? [onsiteUsersList[0].name] : []);
    setPrjItems([]);
    setIsCreateProjectOpen(true);
  };

  const handleSubmitCreateProject = (e: React.FormEvent) => {
    e.preventDefault();
    if (!prjSiteName.trim() || !prjCustomerName.trim() || prjItems.length === 0) {
      alert('กรุณากรอกชื่อโครงการ ชื่อลูกค้า และเพิ่มรายการในโปรเจกต์อย่างน้อย 1 รายการ');
      return;
    }
    const created = createProject({
      id: prjCode,
      site_name: prjSiteName,
      customer_name: prjCustomerName,
      phone: prjPhone,
      location: prjLocation || `อ.${prjDistrict}`,
      district: prjDistrict,
      created_by: salespersonName,
      start_date: prjStartDate,
      due_date: prjDueDate,
      assigned_techs: [],
      items: prjItems
    });
    setIsCreateProjectOpen(false);
    setToast(`เปิดโปรเจกต์ ${created.id} (${created.site_name}) เรียบร้อยแล้ว ส่งต่อจัดซื้อ & ทีมหน้างาน`);
    setTimeout(() => setToast(''), 4500);
  };

  const handleOpenAddonModal = (prj: Project, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setAddonProjectId(prj.id);
    setAddonAddedBy(currentUser?.name || salesUsersList[0]?.name || 'เซลล์บี');
    setAddonItems([]);
    setAddonNote('');
  };

  const handleSubmitAddon = (e: React.FormEvent) => {
    e.preventDefault();
    if (!addonProject || !addonAddedBy.trim() || addonItems.length === 0) {
      alert('กรุณาระบุชื่อเซลล์ผู้แอดเพิ่ม และเลือกรายการสินค้า/วัสดุอย่างน้อย 1 รายการ');
      return;
    }
    addProjectAddonItems(addonProject.id, {
      added_by: addonAddedBy.trim(),
      note: addonNote.trim() || undefined,
      items: addonItems
    });
    const totalQty = addonItems.reduce((s, it) => s + it.qty_required, 0);
    setToast(`แอดเพิ่ม ${addonItems.length} รายการ (รวม ${totalQty} ชิ้น) เข้าโปรเจกต์ ${addonProject.id} (โดย ${addonAddedBy}) เรียบร้อย`);
    setAddonProjectId(null);
    setTimeout(() => setToast(''), 4500);
  };

  const getProjectFinancials = (prj: Project) => {
    const baseItems = (prj.items || []).filter(i => !i.is_addon);
    const addonItems = (prj.items || []).filter(i => i.is_addon);
    const baseRev = baseItems.reduce((s, i) => s + (i.unit_price || 0) * (i.qty_required || 0), 0);
    const baseCost = baseItems.reduce((s, i) => s + (i.unit_cost || 0) * (i.qty_required || 0), 0);
    const addonRev = addonItems.reduce((s, i) => s + (i.unit_price || 0) * (i.qty_required || 0), 0);
    const addonCost = addonItems.reduce((s, i) => s + (i.unit_cost || 0) * (i.qty_required || 0), 0);
    const totalRev = baseRev + addonRev;
    const totalCost = baseCost + addonCost;
    const totalGp = totalRev - totalCost;
    return { baseItems, addonItems, baseRev, baseCost, addonRev, addonCost, totalRev, totalCost, totalGp };
  };

  const getProjectStatusBadge = (status: Project['status']) => {
    switch (status) {
      case 'planning':
        return <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30 whitespace-nowrap">วางแผน / รอเบิกงวดแรก</span>;
      case 'in_progress':
        return <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-purple-500/15 text-purple-700 dark:text-purple-300 border border-purple-500/30 whitespace-nowrap">กำลังติดตั้งหน้างาน</span>;
      case 'handover_pending':
        return <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 border border-cyan-500/30 whitespace-nowrap">รอส่งมอบปิดโปรเจกต์</span>;
      case 'completed':
        return <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 whitespace-nowrap">ส่งมอบปิดโปรเจกต์แล้ว</span>;
    }
  };

  return (
    <div className="space-y-6">
      <ToastBanner message={toast} onClose={() => setToast('')} />

      {/* ================= TOP ACTION BAR + KPI ================= */}
      <div className="liquid-glass rounded-3xl p-5 sm:p-6 shadow-2xl border border-white/[0.08]">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-[#FF6B00]/15 text-[#FF6B00] border border-[#FF6B00]/30">
              <FilePlus2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">ฝ่ายขาย (Sales)</h2>
              <p className="text-[11px] text-slate-400 mt-0.5">เปิดบิลขาย เลือกสินค้าจากแคตตาล็อก และติดตามสถานะออเดอร์</p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 flex-wrap">
            <button disabled={readOnly}
              type="button"
              onClick={() => setIsBillingTypeModalOpen(true)}
              className="px-5 py-2.5 min-h-[44px] rounded-xl bg-gradient-to-r from-[#FF6B00] to-[#E65A00] hover:from-[#FF8A24] hover:brightness-105 text-black font-extrabold text-xs transition-all duration-150 cursor-pointer flex items-center justify-center gap-2 shadow-lg shadow-[#FF6B00]/25 border border-white/20 active:scale-[0.97]"
            >
              <Plus className="w-4 h-4" />
              <span>เปิดบิล</span>
            </button>
            <button
              type="button"
              onClick={() => handleOpenContractManager(false, 'rental')}
              className="px-4 py-2.5 min-h-[44px] rounded-xl bg-indigo-500/15 hover:bg-indigo-500/25 text-indigo-700 dark:text-indigo-300 border border-indigo-500/30 font-bold text-xs transition-all duration-150 cursor-pointer flex items-center justify-center gap-2 active:scale-[0.97]"
            >
              <FileCheck2 className="w-4 h-4" />
              <span>จัดการ / เพิ่มสัญญา ({contracts.filter(c => c.status === 'active').length})</span>
            </button>
            <button
              type="button"
              onClick={() => handleOpenCatalogModal('order')}
              className="px-4 py-2.5 min-h-[44px] rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-300 dark:bg-white/[0.04] dark:hover:bg-white/[0.08] dark:text-slate-200 dark:border-white/[0.1] font-bold text-xs transition-all duration-150 cursor-pointer flex items-center justify-center gap-2 active:scale-[0.97]"
            >
              <ShoppingBag className="w-4 h-4 text-[#FF6B00]" />
              <span>จัดการแคตตาล็อก</span>
            </button>
            <button disabled={readOnly}
              type="button"
              onClick={() => setProductEditor({})}
              className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-[#FF6B00]/40 bg-[#FF6B00]/15 px-4 py-2.5 text-xs font-bold text-orange-900 transition hover:bg-[#FF6B00]/25 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600 dark:text-orange-200 dark:focus-visible:outline-orange-400"
            >
              <Plus className="size-4" aria-hidden="true" />
              เพิ่มสินค้าใหม่
            </button>
          </div>
        </div>

        {/* KPI Pills */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4">
          <div className="px-3.5 py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.08] flex items-center justify-between gap-2">
            <span className="text-[11px] text-slate-400 flex items-center gap-1.5">
              <ListOrdered className="w-3.5 h-3.5 text-blue-400" />
              บิลขาย (SO)
            </span>
            <span className="text-base font-extrabold font-mono text-white tabular-nums">{fmt(kpi.count)}</span>
          </div>
          <div className="px-3.5 py-2.5 rounded-xl bg-purple-500/10 border border-purple-500/25 flex items-center justify-between gap-2">
            <span className="text-[11px] text-slate-400 flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-purple-400" />
              โปรเจกต์ (PRJ)
            </span>
            <span className="text-base font-extrabold font-mono text-purple-300 tabular-nums">{fmt(kpi.projectCount)}</span>
          </div>
          <div className="px-3.5 py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-between gap-2">
            <span className="text-[11px] text-slate-400 flex items-center gap-1.5">
              <Receipt className="w-3.5 h-3.5 text-emerald-400" />
              ยอดขายรวม
            </span>
            <span className="text-base font-extrabold font-mono text-emerald-400 tabular-nums">฿{fmt(kpi.totalRevenue)}</span>
          </div>
          <div className="px-3.5 py-2.5 rounded-xl bg-[#FF6B00]/10 border border-[#FF6B00]/25 flex items-center justify-between gap-2">
            <span className="text-[11px] text-slate-400 flex items-center gap-1.5">
              <TrendingUp className="w-3.5 h-3.5 text-[#FF6B00]" />
              กำไรขั้นต้น GP
            </span>
            <span className={`text-base font-extrabold font-mono tabular-nums ${kpi.totalGp >= 0 ? 'text-[#FF6B00]' : 'text-rose-400'}`}>฿{fmt(kpi.totalGp)}</span>
          </div>
        </div>
      </div>

      {/* ================= PROJECT & SITE INSTALLATION CARDS (PRJ-...) ================= */}
      <div className="liquid-glass rounded-3xl p-5 sm:p-6 shadow-2xl border border-purple-500/30">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-purple-500 dark:text-purple-400" />
              <span>งานรับเหมา / ติดตั้งระบบหน้างาน (Project Sites • PRJ-...)</span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-purple-500/15 text-purple-700 dark:text-purple-300 border border-purple-500/30">
                {projects.length} โปรเจกต์
              </span>
            </h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              เซลล์ทุกคนสามารถกด <strong className="text-purple-700 dark:text-purple-300">"+ แอดรายการเพิ่มเข้าโปรเจกต์ (Add-on)"</strong> เพื่อขายพ่วงเข้าไซต์งานได้ตลอดเวลา
            </p>
          </div>
          <button disabled={readOnly}
            type="button"
            onClick={handleOpenCreateProjectModal}
            className="px-3.5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs transition cursor-pointer flex items-center justify-center gap-1.5 shadow-md shadow-purple-500/20 active:scale-95"
          >
            <Plus className="w-4 h-4" />
            <span>เปิดโปรเจกต์ใหม่ (PRJ)</span>
          </button>
        </div>

        {projects.length === 0 ? (
          <div className="text-center py-10 text-slate-500 border border-dashed border-slate-300 dark:border-white/[0.1] rounded-2xl text-xs">
            ยังไม่มีงานโปรเจกต์รับเหมา / ติดตั้ง
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {projects.map((prj) => {
              const fin = getProjectFinancials(prj);
              const latestProgress = prj.daily_logs && prj.daily_logs.length > 0
                ? prj.daily_logs[prj.daily_logs.length - 1].progress_percent
                : 0;
              const pendingFieldReqs = (prj.material_requests || []).filter(r => r.status === 'pending');
              const addonSalesSet = Array.from(new Set(fin.addonItems.map(a => a.added_by).filter(Boolean)));

              return (
                <div
                  key={prj.id}
                  onClick={() => setDetailProjectId(prj.id)}
                  className="p-4 rounded-2xl bg-white/80 dark:bg-white/[0.03] hover:bg-slate-50 dark:hover:bg-white/[0.06] border border-purple-200 dark:border-purple-500/25 hover:border-purple-400 dark:hover:border-purple-400/50 transition cursor-pointer flex flex-col justify-between gap-3"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-extrabold text-sm text-purple-700 dark:text-purple-300">
                          {prj.id}
                        </span>
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-100 text-emerald-900 border border-emerald-300 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30">
                          เปิดโดย {prj.created_by}
                        </span>
                      </div>
                      {getProjectStatusBadge(prj.status)}
                    </div>

                    <div>
                      <h4 className="text-sm font-extrabold text-slate-900 dark:text-white leading-snug">
                        {prj.site_name}
                      </h4>
                      <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
                        ลูกค้า: <strong className="text-slate-900 dark:text-white">{prj.customer_name}</strong> • {prj.location}
                      </p>
                    </div>

                    {/* Add-on attribution badges + deadline risk + scheduled visits summary */}
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {(() => {
                        const risk = getProjectDeadlineRisk(prj.due_date, prj.status);
                        return (
                          <span className={`px-2 py-0.5 rounded-md text-[10px] font-extrabold border ${risk.badgeCls}`}>
                            กำหนดส่ง {formatDateDMY(prj.due_date)} • {risk.label}
                          </span>
                        );
                      })()}
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 text-slate-800 border border-slate-300 dark:bg-white/[0.06] dark:text-slate-200 dark:border-white/[0.1]">
                        นัดเข้าไซต์ {prj.site_visits?.length || 0} รอบ • งวดเบิก {prj.batches?.length || 0} งวด • คืบหน้า {latestProgress}%
                      </span>
                      {addonSalesSet.map((saleName) => (
                        <span
                          key={saleName}
                          className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300 dark:bg-amber-500/20 dark:text-amber-300 dark:border-amber-500/35"
                        >
                          แอดเพิ่มโดย {saleName}
                        </span>
                      ))}
                      {pendingFieldReqs.length > 0 && (
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-rose-100 text-rose-900 border border-rose-300 dark:bg-rose-500/20 dark:text-rose-200 dark:border-rose-500/40 animate-pulse">
                          ช่างขอเบิกเพิ่มหน้างาน {pendingFieldReqs.length} รายการ
                        </span>
                      )}
                    </div>

                    {/* Base vs Add-on Subtotals */}
                    <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-200 dark:border-white/[0.08] text-xs">
                      <div className="p-2 rounded-xl bg-slate-100/80 dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.06]">
                        <div className="text-[10px] text-slate-500 dark:text-slate-400">ยอดตั้งต้น</div>
                        <div className="font-mono font-bold text-slate-900 dark:text-white">฿{fmt(fin.baseRev)}</div>
                      </div>
                      <div className="p-2 rounded-xl bg-purple-50 dark:bg-purple-500/10 border border-purple-200 dark:border-purple-500/25">
                        <div className="text-[10px] text-purple-700 dark:text-purple-300">ยอดแอดเพิ่ม ({fin.addonItems.length})</div>
                        <div className="font-mono font-bold text-purple-800 dark:text-purple-200">+฿{fmt(fin.addonRev)}</div>
                      </div>
                      <div className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/25">
                        <div className="text-[10px] text-emerald-700 dark:text-emerald-300">รวมสุทธิ (GP ฿{fmt(fin.totalGp)})</div>
                        <div className="font-mono font-extrabold text-emerald-800 dark:text-emerald-300">฿{fmt(fin.totalRev)}</div>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-200 dark:border-white/[0.08]">
                    {prj.status === 'completed' ? (
                      <button disabled={readOnly}
                        type="button"
                        onClick={() => handleCreateFollowUpBillFromClosedProject(prj)}
                        className="flex-1 py-2 px-3 rounded-xl border bg-emerald-700 hover:bg-emerald-800 text-white border-emerald-700 font-extrabold text-xs transition cursor-pointer flex items-center justify-center gap-1.5 active:scale-95"
                      >
                        <FilePlus2 className="w-3.5 h-3.5" />
                        <span>เปิดบิลใหม่จากลูกค้า/ไซต์นี้</span>
                      </button>
                    ) : (
                      <button disabled={readOnly}
                        type="button"
                        onClick={(e) => handleOpenAddonModal(prj, e)}
                        className="flex-1 py-2 px-3 rounded-xl bg-gradient-to-r from-[#FF6B00] to-[#E65A00] hover:from-[#FF8A24] text-black font-extrabold text-xs transition cursor-pointer flex items-center justify-center gap-1.5 shadow-sm active:scale-95"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>+ แอดรายการเพิ่มเข้าโปรเจกต์ (Add-on)</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setDetailProjectId(prj.id)}
                      className="py-2 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-white/[0.06] dark:hover:bg-white/[0.12] text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-white/[0.1] font-bold text-xs transition cursor-pointer"
                    >
                      ดูรายละเอียด
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ================= COMPACT ORDER CARDS ================= */}
      <div className="liquid-glass rounded-3xl p-5 sm:p-6 shadow-2xl border border-white/[0.08]">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <ListOrdered className="w-4 h-4 text-[#FF6B00]" />
            <span>รายการออเดอร์ / บิลฝ่ายขาย</span>
            <span className="text-[11px] font-normal text-slate-500 dark:text-slate-400">({filteredOrders.length}/{orders.length})</span>
          </h3>
          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="ค้นหาลูกค้า / เลขที่บิล / งวด..."
              value={orderSearch}
              onChange={(e) => setOrderSearch(e.target.value)}
              className="w-full liquid-glass-input rounded-xl pl-9 pr-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none"
            />
          </div>
        </div>

        {/* Filter Controls: ประเภทบิล & สถานะการชำระเงิน */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2.5 mb-4 p-3 rounded-2xl bg-slate-100/80 dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.08]">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[11px] font-bold text-slate-600 dark:text-slate-400 mr-1">ประเภทบิล:</span>
            {([
              { id: 'all', label: 'ทั้งหมด' },
              { id: 'sales', label: 'ขาย' },
              { id: 'internet_rental', label: 'เช่าเน็ต' },
              { id: 'system_rental', label: 'เช่าระบบ' },
              { id: 'equipment_rental', label: 'เช่าอุปกรณ์' },
              { id: 'ma', label: 'ดูแลระบบ MA' },
              { id: 'addon', label: 'นอกสัญญา / เพิ่มเติม' }
            ] as const).map(tab => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setOrderBillingTypeFilter(tab.id)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                  orderBillingTypeFilter === tab.id
                    ? 'bg-[#FF6B00] text-black shadow-sm'
                    : 'bg-white dark:bg-white/[0.05] text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-white/[0.08] hover:bg-slate-50 dark:hover:bg-white/[0.1]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[11px] font-bold text-slate-600 dark:text-slate-400 mr-1">สถานะชำระเงิน:</span>
            {([
              { id: 'all', label: 'ทั้งหมด' },
              { id: 'pending', label: 'รอวางบิล / รอชำระ' },
              { id: 'billed', label: 'วางบิล / ชำระแล้ว' }
            ] as const).map(st => (
              <button
                key={st.id}
                type="button"
                onClick={() => setOrderPaymentStatusFilter(st.id)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                  orderPaymentStatusFilter === st.id
                    ? 'bg-slate-900 dark:bg-white text-white dark:text-black shadow-sm'
                    : 'bg-white dark:bg-white/[0.05] text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-white/[0.08] hover:bg-slate-50 dark:hover:bg-white/[0.1]'
                }`}
              >
                {st.label}
              </button>
            ))}
          </div>
        </div>

        <ListControls
          from={ordersList.from}
          to={ordersList.to}
          total={ordersList.total}
          page={ordersList.page}
          totalPages={ordersList.totalPages}
          pageSize={ordersList.pageSize}
          sort={ordersList.sort}
          onSortChange={ordersList.setSort}
          onPageSizeChange={ordersList.setPageSize}
          onPageChange={ordersList.setPage}
          unit="ออเดอร์"
          className="mb-3"
        />

        {searchedOrders.length === 0 ? (
          <div className="text-center py-12 text-slate-500 border border-dashed border-white/[0.1] rounded-2xl text-xs">
            <Package className="w-9 h-9 mx-auto mb-2 text-slate-600" />
            ยังไม่มีออเดอร์ หรือไม่พบรายการที่ค้นหา
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {searchedOrders.map((ord) => {
              const total = orderTotal(ord);
              const gp = orderGp(ord);
              const modeMeta = ord.delivery_mode ? DELIVERY_MODE_META[ord.delivery_mode] : null;
              const billingBadge = BILLING_BADGE_META[getOrderBillingBadgeKey(ord)];
              return (
                <button
                  key={ord.id}
                  type="button"
                  onClick={() => {
                    setShowDeleteOrder(false);
                    setDetailOrder(ord);
                  }}
                  className="text-left p-4 rounded-2xl bg-white/[0.02] hover:bg-white/[0.05] border border-white/[0.08] hover:border-[#FF6B00]/40 transition-all duration-150 cursor-pointer active:scale-[0.97] flex flex-col gap-2.5 min-h-[148px]"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono font-extrabold text-[#FF6B00] text-sm tabular-nums truncate">
                      {ord.sales_ref || 'SO-AUTO'}
                    </span>
                    {getOrderStatusBadge(ord.order_status)}
                  </div>

                  <div className="text-slate-900 dark:text-white font-bold text-sm truncate">{ord.customer_name}</div>

                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${billingBadge.cls}`}>
                      {billingBadge.label}
                    </span>
                    {ord.billing_period && (
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-slate-100 text-slate-800 border border-slate-300 dark:bg-white/[0.06] dark:text-slate-200 dark:border-white/[0.12]">
                        งวด {ord.billing_period}
                      </span>
                    )}
                    {ord.billing_status === 'billed' ? (
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30">
                        วางบิลแล้ว
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30">
                        รอวางบิล
                      </span>
                    )}
                    {modeMeta && (
                      <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${modeMeta.cls}`}>
                        {modeMeta.label}
                      </span>
                    )}
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-white/[0.05] text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-white/[0.08]">
                      {orderItemCount(ord)} ชิ้น
                    </span>
                  </div>

                  <div className="mt-auto flex items-center justify-between gap-2 pt-2 border-t border-slate-200 dark:border-white/[0.06]">
                    <span className="font-mono font-extrabold text-slate-900 dark:text-white text-sm tabular-nums">฿{fmt(total)}</span>
                    <span className={`px-2 py-0.5 rounded-md text-[10px] font-extrabold font-mono tabular-nums border ${gp >= 0
                      ? 'bg-[#FF6B00]/15 text-[#FF6B00] border-[#FF6B00]/30'
                      : 'bg-rose-500/15 text-rose-300 border-rose-500/30'
                      }`}>
                      GP ฿{fmt(gp)}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* CREATE SALES ORDER MODAL                                                  */}
      {/* ========================================================================= */}
      {isCreateModalOpen && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-6 bg-black/60 backdrop-blur-sm animate-fade-in overscroll-contain">
          <div className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-800 shadow-2xl rounded-3xl w-full sm:w-[92vw] max-w-5xl max-h-[94dvh] sm:max-h-[82dvh] sm:max-h-[86dvh] flex flex-col overflow-hidden animate-modal-pop">

            {/* Modal Header */}
            <div className="p-4 sm:p-5 bg-slate-50/90 dark:bg-slate-900/95 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 flex-shrink-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="p-2.5 rounded-2xl bg-[#FF6B00]/15 text-[#E65A00] dark:text-[#FF6B00] border border-[#FF6B00]/30">
                  <FilePlus2 className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white leading-tight">
                      {editingOrder ? 'แก้ไขบิล' : orderBillingType === 'addon'
                        ? 'เปิดบิลค่าใช้จ่ายเพิ่มเติม / นอกสัญญา (Add-on)'
                        : 'เปิดบิลขายใหม่ (New Sales Order)'}
                    </h3>
                    <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${BILLING_BADGE_META[editingOrder ? getOrderBillingBadgeKey(editingOrder.order) : orderBillingType === 'addon' ? 'addon' : 'sales'].cls}`}>
                      {BILLING_BADGE_META[editingOrder ? getOrderBillingBadgeKey(editingOrder.order) : orderBillingType === 'addon' ? 'addon' : 'sales'].label}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">เลขที่เอกสาร: <strong className="text-[#E65A00] dark:text-[#FF6B00]">{salesRef}</strong></p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleCloseCreateModal}
                aria-label={editingOrder ? 'ปิดหน้าต่างแก้ไขบิล' : 'ปิดหน้าต่างเปิดบิลขาย'}
                className="p-2.5 rounded-xl text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white bg-slate-100 dark:bg-white/[0.04] hover:bg-slate-200 dark:hover:bg-white/[0.08] transition min-w-[44px] min-h-[44px] flex items-center justify-center flex-shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitOrder} className="flex-1 overflow-y-auto overscroll-contain p-4 sm:p-6 space-y-5">
              {/* Salesperson badge */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-100 text-emerald-900 border border-emerald-300 dark:bg-emerald-500/10 dark:border-emerald-500/30 text-[11px] font-semibold dark:text-emerald-300">
                  <UserCheck className="w-3.5 h-3.5" />
                  <span>ผู้เปิดบิล: <strong className="text-emerald-950 dark:text-emerald-200">{editingOrder ? editingOrder.order.salesperson || editingOrder.order.created_by || '—' : salespersonName}</strong></span>
                </span>
              </div>
              {orderFieldsLocked && (
                <p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
                  บิลผ่านขั้นตอนจัดซื้อหรือวางบิลแล้ว แก้ไขได้เฉพาะข้อมูลลูกค้า สถานที่ส่งมอบ และหมายเหตุ
                </p>
              )}

              {/* Optional Contract Reference for Add-on Bills */}
              {orderBillingType === 'addon' && (
                <fieldset disabled={orderFieldsLocked} className="min-w-0 p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 grid grid-cols-1 md:grid-cols-2 gap-3 disabled:opacity-70">
                  <div>
                    <label className="block text-xs font-bold text-amber-900 dark:text-amber-200 mb-1">
                      อ้างอิงสัญญาเดิมที่ใช้งานอยู่ (ไม่บังคับ)
                    </label>
                    <select
                      value={orderContractId}
                      onChange={(e) => {
                        const cid = e.target.value;
                        setOrderContractId(cid);
                        const ctr = contracts.find(c => c.id === cid);
                        if (ctr) {
                          setOrderCustomerId(ctr.customer_id);
                          setCustomerName(ctr.customer_name);
                          setCustomerContactName('');
                          if (ctr.customer_phone) setCustomerPhone(normalizePhone(ctr.customer_phone));
                          if (ctr.district && DISTRICT_OPTIONS.some(d => d.district === ctr.district)) {
                            setDistrict(ctr.district);
                          }
                          if (ctr.delivery_location) setDeliveryLoc(ctr.delivery_location);
                          setAutoFilledCustomer(ctr.customer_name);
                        } else {
                          setOrderCustomerId('');
                        }
                      }}
                      className="w-full rounded-xl px-3 py-2 text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-white border border-amber-300 dark:border-amber-500/40 focus:outline-none"
                    >
                      <option value="">-- ไม่ผูกสัญญา (เปิดบิลนอกสัญญาทั่วไป) --</option>
                      {contracts.filter(c => c.status === 'active').map(c => (
                        <option key={c.id} value={c.id}>
                          {c.contract_no} — {c.customer_name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-amber-900 dark:text-amber-200 mb-1">
                      วันครบกำหนดชำระ (Due Date)
                    </label>
                    <input
                      type="date"
                      value={orderDueDate}
                      onChange={(e) => setOrderDueDate(e.target.value)}
                      className="w-full rounded-xl px-3 py-2 text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-white border border-amber-300 dark:border-amber-500/40 font-mono focus:outline-none"
                    />
                  </div>
                </fieldset>
              )}

              {/* Section 1: Customer Details */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div
                  className="relative"
                  onBlur={(e) => {
                    if (!e.currentTarget.contains(e.relatedTarget)) setShowCustomerSuggestions(false);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape' && showCustomerSuggestions) {
                      e.stopPropagation();
                      e.currentTarget.querySelector('input')?.focus();
                      setShowCustomerSuggestions(false);
                    }
                  }}
                >
                  <label htmlFor="sales-customer-name" className={modalLabelClass}>
                    {customerType === 'organization' ? 'ชื่อบริษัท / องค์กร' : 'ชื่อ-นามสกุลลูกค้า'} *
                  </label>
                  <input
                    id="sales-customer-name"
                    type="text"
                    required
                    placeholder={customerType === 'organization' ? 'พิมพ์ชื่อเพื่อค้นหาองค์กรเดิม' : 'พิมพ์ชื่อเพื่อค้นหาลูกค้าเดิม'}
                    value={customerName}
                    onFocus={() => setShowCustomerSuggestions(true)}
                    onChange={(e) => handleCustomerNameChange(e.target.value)}
                    className="w-full rounded-xl px-3 py-2 text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-300 dark:border-slate-700 placeholder-slate-400 focus:outline-none focus:border-blue-500"
                    autoComplete="off"
                  />

                  {/* Returning Customer Suggestions Dropdown */}
                  {showCustomerSuggestions && customerSuggestions.length > 0 && (
                    <div className="absolute left-0 right-0 top-full mt-1 z-30 rounded-2xl border border-slate-200 dark:border-white/[0.12] bg-white dark:bg-[#1A1D26] shadow-2xl overflow-hidden max-h-56 overflow-y-auto">
                      <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-white/[0.03] border-b border-slate-200 dark:border-white/[0.08]">
                        {customerType === 'organization' ? 'บริษัท / องค์กรที่เคยเปิดบิล' : 'ลูกค้าที่เคยเปิดบิล'}
                      </div>
                      {customerSuggestions.map((cust) => (
                        <button
                          key={cust.name}
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={(e) => {
                            e.currentTarget.closest('.relative')?.querySelector('input')?.focus();
                            applyReturningCustomer(cust);
                          }}
                          className="w-full !min-h-11 text-left px-3 py-2 hover:bg-blue-50 dark:hover:bg-white/[0.06] focus-visible:bg-blue-50 dark:focus-visible:bg-white/[0.08] border-b last:border-b-0 border-slate-100 dark:border-white/[0.05] transition cursor-pointer"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-bold text-slate-900 dark:text-white truncate">
                              {cust.name}
                            </span>
                            <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 shrink-0">
                              ลูกค้าเดิม • {cust.orderCount} บิล
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 flex flex-wrap gap-x-3">
                            {customerType === 'organization' && cust.contactName && <span>{cust.contactName}</span>}
                            <span className="font-mono">{cust.phone || 'ไม่มีเบอร์'}</span>
                            {cust.district && <span>อ.{cust.district}</span>}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}

                  {autoFilledCustomer && (
                    <div className="mt-1.5 flex items-center justify-between gap-2 px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 text-[11px] text-emerald-800 dark:text-emerald-200">
                      <span className="font-semibold truncate">ใช้ข้อมูลจากบิลเดิม</span>
                      <button
                        type="button"
                        onClick={() => {
                          setCustomerName('');
                          setCustomerContactName('');
                          setCustomerPhone('');
                          setDeliveryLoc('');
                          setAutoFilledCustomer(null);
                        }}
                        className="font-bold underline shrink-0 cursor-pointer"
                      >
                        ล้าง
                      </button>
                    </div>
                  )}
                </div>
                {customerType === 'organization' && (
                  <div>
                    <label htmlFor="sales-customer-contact" className={modalLabelClass}>ชื่อผู้ติดต่อ *</label>
                    <input
                      id="sales-customer-contact"
                      type="text"
                      required
                      placeholder="เช่น สมชาย ใจดี"
                      value={customerContactName}
                      onChange={(e) => setCustomerContactName(e.target.value)}
                      className={modalInputClass}
                    />
                  </div>
                )}
                <div>
                  <label htmlFor="sales-customer-phone" className={modalLabelClass}>เบอร์โทรติดต่อลูกค้า *</label>
                  <PhoneInput
                    id="sales-customer-phone"
                    required={!editingOrder || !!editingOrder.order.customer_phone}
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    className="w-full rounded-xl px-3 py-2 text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-300 dark:border-slate-700 placeholder-slate-400 focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">อำเภอ / พื้นที่ (จัดสายรถอัตโนมัติ) *</label>
                  <select
                    value={district}
                    disabled={orderFieldsLocked}
                    onChange={(e) => setDistrict(e.target.value)}
                    className="w-full rounded-xl px-3 py-2 text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-300 dark:border-slate-700 focus:outline-none focus:border-blue-500"
                  >
                    {editingOrder && !DISTRICT_OPTIONS.some(opt => opt.district === district) && (
                      <option value={district}>{district || 'ยังไม่ระบุพื้นที่'}</option>
                    )}
                    {DISTRICT_OPTIONS.map(opt => (
                      <option key={opt.district} value={opt.district} className="bg-white dark:bg-[#12141A]">
                        {opt.district} - [{opt.zone}]
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Route Badge & Custom Province */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className={`p-3 rounded-2xl border flex items-center justify-between ${routeMeta.badgeBg} ${routeMeta.badgeBorder} ${routeMeta.badgeText}`}>
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: routeMeta.color }}></span>
                    <span className="text-xs font-extrabold">{routeMeta.name}</span>
                    <span className="text-[11px] opacity-80">({district})</span>
                  </div>
                  <span className="text-[10px] uppercase font-mono tracking-wider opacity-90">Auto-Routing</span>
                </div>

                {currentRouteCode === 'route_6' && (
                  <div>
                    <input
                      type="text"
                      required={!editingOrder || district !== (editingOrder.order.district ?? '')}
                      disabled={orderFieldsLocked}
                      placeholder="ระบุจังหวัด / รายละเอียดพื้นที่พิเศษ เช่น ชุมพร, ระนอง"
                      value={provinceCustom}
                      onChange={(e) => setProvinceCustom(e.target.value)}
                      className="w-full rounded-2xl px-3 py-2.5 text-xs bg-white dark:bg-slate-800 text-amber-800 dark:text-amber-300 border border-amber-400 dark:border-amber-500/50 placeholder-slate-400 focus:outline-none focus:border-blue-500"
                    />
                  </div>
                )}
              </div>

              {/* Section 2: Delivery Mode (4 modes) */}
              <fieldset disabled={orderFieldsLocked} className="min-w-0 disabled:opacity-70">
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5 flex items-center gap-1">
                  <Truck className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
                  <span>ประเภทการส่งมอบ (Delivery Mode) *</span>
                </label>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                  {([
                    { id: 'install', label: 'ส่งพร้อมติดตั้ง' },
                    { id: 'drop_off', label: 'ส่งอย่างเดียว' },
                    { id: 'customer_pickup', label: 'รับเองหน้าร้าน' },
                    { id: 'project', label: 'งานโครงการ/รับเหมา' }
                  ] as { id: DeliveryMode; label: string }[]).map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setDeliveryMode(m.id)}
                      className={`px-3 py-2.5 rounded-xl text-[11px] font-bold border transition-all duration-150 cursor-pointer active:scale-[0.97] ${deliveryMode === m.id
                        ? 'bg-[#FF6B00]/15 dark:bg-[#FF6B00]/20 border-[#FF6B00]/60 dark:border-[#FF6B00]/50 text-[#C2410C] dark:text-[#FF6B00]'
                        : 'bg-slate-50 dark:bg-white/[0.02] border-slate-200 dark:border-white/[0.08] text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/[0.05]'
                        }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </fieldset>

              {/* Section 3: Delivery & Payment Details */}
              <fieldset disabled={orderFieldsLocked} className="min-w-0 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 pt-3 border-t border-slate-200 dark:border-white/[0.06] disabled:opacity-70">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
                    <span>วันที่ต้องการส่งมอบ *</span>
                  </label>
                  <input
                    type="date"
                    required={!editingOrder || !!editingOrder.order.delivery_date}
                    value={deliveryDate}
                    onChange={(e) => setDeliveryDate(e.target.value)}
                    className="w-full rounded-xl px-3 py-2 text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-300 dark:border-slate-700 font-mono focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1">
                    <FileText className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
                    <span>ประเภทบิล *</span>
                  </label>
                  <select
                    value={billType}
                    onChange={(e) => setBillType(e.target.value as BillType)}
                    className="w-full rounded-xl px-3 py-2 text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-300 dark:border-slate-700 focus:outline-none focus:border-blue-500"
                  >
                    <option value="tax_invoice" className="bg-white dark:bg-[#12141A]">ใบกำกับภาษีเต็มรูป (VAT 7%)</option>
                    <option value="cash_bill_quotation" className="bg-white dark:bg-[#12141A]">ใบเสนอราคา / บิลเงินสด</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1">
                    <CreditCard className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
                    <span>เงื่อนไขชำระเงิน *</span>
                  </label>
                  <select
                    value={paymentTerm}
                    onChange={(e) => setPaymentTerm(e.target.value as PaymentTerm)}
                    className="w-full rounded-xl px-3 py-2 text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-300 dark:border-slate-700 focus:outline-none focus:border-blue-500"
                  >
                    <option value="cash" className="bg-white dark:bg-[#12141A]">เงินสด / โอนเงิน (Cash/Transfer)</option>
                    <option value="credit_30" className="bg-white dark:bg-[#12141A]">เครดิต 30 วัน (Credit 30 Days)</option>
                    <option value="project" className="bg-white dark:bg-[#12141A]">งานโครงการ / มัดจำตามงวด (PROJECT)</option>
                    <option value="government" className="bg-white dark:bg-[#12141A]">งานราชการ / งานประมูล (Government / Bidding)</option>
                  </select>
                </div>
              </fieldset>

              {/* Section 4: Delivery Location & Site Notes */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">ที่อยู่จัดส่ง / แผนที่หน้างาน *</label>
                  <input
                    type="text"
                    required
                    placeholder="เช่น เลขที่ 123 หมู่ 2 ถ.สุราษฎร์-พุนพิน ต.ท่าข้าม"
                    value={deliveryLoc}
                    onChange={(e) => setDeliveryLoc(e.target.value)}
                    className="w-full rounded-xl px-3 py-2 text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-300 dark:border-slate-700 placeholder-slate-400 focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">หมายเหตุหน้างาน (Site Notes)</label>
                  <input
                    type="text"
                    placeholder="เช่น อาคาร 3 ชั้น 2 ต้องมีบันได 2 เมตร"
                    value={siteNotes}
                    onChange={(e) => setSiteNotes(e.target.value)}
                    className="w-full rounded-xl px-3 py-2 text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-300 dark:border-slate-700 placeholder-slate-400 focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              {/* Section 5: Items in this Order */}
              <fieldset disabled={orderFieldsLocked} className="min-w-0 pt-3 border-t border-slate-200 dark:border-white/[0.06] disabled:opacity-70">
                <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
                  <label className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                    <Package className="w-3.5 h-3.5 text-[#FF6B00]" />
                    <span>รายการสินค้าในบิลนี้</span>
                    <span className="px-1.5 py-0.5 rounded-md bg-slate-100 dark:bg-white/[0.06] text-[10px] font-mono text-slate-700 dark:text-slate-300">{orderItems.length} รายการ</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => handleOpenCatalogModal('order')}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#FF6B00]/15 hover:bg-[#FF6B00]/25 border border-[#FF6B00]/40 text-[#C2410C] dark:text-[#FF6B00] text-[11px] font-bold transition active:scale-[0.97] cursor-pointer"
                  >
                    <Layers className="w-3.5 h-3.5" />
                    <span>เลือกจากแคตตาล็อก</span>
                  </button>
                </div>

                {orderItems.length === 0 ? (
                  <div className="p-6 rounded-2xl border border-dashed border-slate-300 dark:border-white/[0.12] bg-slate-50 dark:bg-white/[0.02] text-center">
                    <ShoppingBag className="w-8 h-8 text-slate-400 dark:text-slate-600 mx-auto mb-2" />
                    <p className="text-xs text-slate-500 dark:text-slate-400">ยังไม่มีสินค้าในบิล — กด "เลือกจากแคตตาล็อก" เพื่อเพิ่มสินค้า</p>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {orderItems.map((it, idx) => {
                      const lineRevenue = (it.unit_price || 0) * (it.quantity || 1);
                      const lineCost = (it.unit_cost || 0) * (it.quantity || 1);
                      const lineGp = lineRevenue - lineCost;
                      const isBelowCost = lineGp < 0;
                      return (
                        <div key={`${it.model_name}-${idx}`} className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 space-y-2.5">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-bold text-slate-900 dark:text-white leading-snug truncate">{it.model_name}</p>
                              <p className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">{it.item_type === 'service' ? 'ค่าบริการ/ค่าแรง' : (it.unit || 'เครื่อง')}</p>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleRemoveItemFromOrder(idx)}
                              aria-label="ลบรายการสินค้า"
                              className="p-1.5 rounded-lg text-rose-600 dark:text-rose-400 hover:text-rose-700 dark:hover:text-rose-300 bg-rose-100 dark:bg-rose-500/10 hover:bg-rose-200 dark:hover:bg-rose-500/20 transition flex-shrink-0 cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                            <div>
                              <label className="block text-[10px] text-slate-600 dark:text-slate-400 mb-0.5">จำนวน</label>
                              <NumberInput
                                min={1}
                                value={it.quantity}
                                onChange={(e) => handleUpdateItemQuantity(idx, parseInt(e.target.value) || 1)}
                                className="w-full rounded-lg px-2 py-1.5 text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-300 dark:border-slate-700 font-mono tabular-nums focus:outline-none focus:border-blue-500"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] text-slate-600 dark:text-slate-400 mb-0.5">ต้นทุน/หน่วย</label>
                              <NumberInput
                                min={0}
                                step="0.01"
                                value={it.unit_cost ?? 0}
                                onChange={(e) => handleUpdateItemUnitCost(idx, parseFloat(e.target.value) || 0)}
                                className="w-full rounded-lg px-2 py-1.5 text-xs bg-white dark:bg-slate-800 text-amber-700 dark:text-amber-300 border border-slate-300 dark:border-slate-700 font-mono tabular-nums focus:outline-none focus:border-blue-500"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] text-slate-600 dark:text-slate-400 mb-0.5">ราคาขาย/หน่วย</label>
                              <NumberInput
                                min={0}
                                step="0.01"
                                value={it.unit_price ?? 0}
                                onChange={(e) => handleUpdateItemUnitPrice(idx, parseFloat(e.target.value) || 0)}
                                className="w-full rounded-lg px-2 py-1.5 text-xs bg-white dark:bg-slate-800 text-emerald-700 dark:text-emerald-300 border border-slate-300 dark:border-slate-700 font-mono tabular-nums focus:outline-none focus:border-blue-500"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] text-slate-600 dark:text-slate-400 mb-0.5">GP รายการ</label>
                              <div className={`w-full rounded-lg px-2 py-1.5 text-xs font-mono font-bold tabular-nums border ${isBelowCost
                                ? 'bg-rose-100 border-rose-300 text-rose-900 dark:bg-rose-500/10 dark:border-rose-500/30 dark:text-rose-300'
                                : 'bg-emerald-100 border-emerald-300 text-emerald-900 dark:bg-emerald-500/10 dark:border-emerald-500/30 dark:text-emerald-300'
                                }`}>
                                ฿{lineGp.toLocaleString('th-TH', { maximumFractionDigits: 0 })}
                              </div>
                            </div>
                          </div>

                          {/* Warranty selector */}
                          <div className="flex items-center gap-2 flex-wrap pt-1">
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-600 dark:text-slate-400">
                              <ShieldCheck className="w-3 h-3 text-blue-600 dark:text-blue-400" />
                              <span>ประกัน:</span>
                            </span>
                            {WARRANTY_PRESET_YEARS.map((y) => (
                              <button
                                key={y}
                                type="button"
                                onClick={() => handleUpdateItemWarranty(idx, y)}
                                className={`px-2 py-1 rounded-lg text-[10px] font-bold border transition active:scale-[0.97] cursor-pointer ${(it.warranty_years ?? 0) === y
                                  ? 'bg-blue-100 border-blue-400 text-blue-900 dark:bg-blue-500/20 dark:border-blue-500/50 dark:text-blue-300'
                                  : 'bg-white dark:bg-white/[0.02] border-slate-300 dark:border-white/[0.08] text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                                  }`}
                              >
                                {y} ปี
                              </button>
                            ))}
                            <NumberInput
                              min={0}
                              value={it.warranty_years ?? 0}
                              onChange={(e) => handleUpdateItemWarranty(idx, parseInt(e.target.value) || 0)}
                              className="w-16 rounded-lg px-2 py-1 text-[10px] bg-white dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-300 dark:border-slate-700 font-mono tabular-nums focus:outline-none focus:border-blue-500"
                            />
                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-amber-100 border border-amber-300 text-amber-900 dark:bg-amber-500/10 dark:border-amber-500/30 text-[9px] font-semibold dark:text-amber-300">
                              <Calendar className="w-2.5 h-2.5" />
                              เริ่มนับประกันตั้งแต่วันแปะวอย
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Extra Job Cost & Deposit Amount */}
                <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">ค่าใช้จ่ายเพิ่มเติม / ค่าดำเนินการ (Extra Cost)</label>
                    <NumberInput
                      min={0}
                      step="0.01"
                      value={extraJobCost}
                      onChange={(e) => setExtraJobCost(parseFloat(e.target.value) || 0)}
                      className="w-full rounded-xl px-3 py-2 text-xs bg-white dark:bg-slate-800 text-amber-700 dark:text-amber-300 border border-slate-300 dark:border-slate-700 font-mono tabular-nums focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">เงินมัดจำที่รับแล้ว (Deposit · บาท)</label>
                    <NumberInput
                      min={0}
                      step="0.01"
                      value={depositAmount}
                      onChange={(e) => setDepositAmount(Math.max(0, parseFloat(e.target.value) || 0))}
                      placeholder="0"
                      className="w-full rounded-xl px-3 py-2 text-xs bg-white dark:bg-slate-800 text-emerald-700 dark:text-emerald-300 border border-slate-300 dark:border-slate-700 font-mono tabular-nums focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>
              </fieldset>

              {/* Section 6: Live GP & Deposit Summary */}
              <div className="pt-3 border-t border-slate-200 dark:border-white/[0.06]">
                <div className="grid grid-cols-2 lg:grid-cols-5 gap-2.5">
                  <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700">
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 mb-0.5">ยอดขายรวม (Revenue)</p>
                    <p className="text-sm font-extrabold text-slate-900 dark:text-white font-mono tabular-nums">฿{financials.revenue.toLocaleString('th-TH', { maximumFractionDigits: 0 })}</p>
                  </div>
                  <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700">
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 mb-0.5">ต้นทุนรวม (Cost)</p>
                    <p className="text-sm font-extrabold text-amber-700 dark:text-amber-300 font-mono tabular-nums">฿{financials.totalCost.toLocaleString('th-TH', { maximumFractionDigits: 0 })}</p>
                  </div>
                  <div className={`p-3 rounded-2xl border ${financials.gp < 0 ? 'bg-rose-100 border-rose-300 dark:bg-rose-500/10 dark:border-rose-500/30' : 'bg-emerald-100 border-emerald-300 dark:bg-emerald-500/10 dark:border-emerald-500/30'}`}>
                    <p className="text-[10px] text-slate-600 dark:text-slate-400 mb-0.5">กำไรขั้นต้น (GP)</p>
                    <p className={`text-sm font-extrabold font-mono tabular-nums ${financials.gp < 0 ? 'text-rose-800 dark:text-rose-300' : 'text-emerald-800 dark:text-emerald-300'}`}>฿{financials.gp.toLocaleString('th-TH', { maximumFractionDigits: 0 })}</p>
                  </div>
                  <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700">
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 mb-0.5">อัตรากำไร (Margin)</p>
                    <p className={`text-sm font-extrabold font-mono tabular-nums ${financials.marginPct < 0 ? 'text-rose-700 dark:text-rose-300' : 'text-blue-700 dark:text-blue-300'}`}>{financials.marginPct.toFixed(1)}%</p>
                  </div>
                  <div className="p-3 rounded-2xl bg-sky-50 dark:bg-sky-500/10 border border-sky-200 dark:border-sky-500/30">
                    <p className="text-[10px] text-sky-700 dark:text-sky-300 mb-0.5">ยอดคงค้างชำระ (หลังหักมัดจำ)</p>
                    <p className="text-sm font-extrabold text-sky-900 dark:text-sky-200 font-mono tabular-nums">
                      ฿{Math.max(0, financials.revenue - depositAmount).toLocaleString('th-TH', { maximumFractionDigits: 0 })}
                    </p>
                  </div>
                </div>

                {financials.belowCost && (
                  <div className="mt-2.5 p-2.5 rounded-xl bg-rose-100 border border-rose-300 text-rose-900 dark:bg-rose-500/10 dark:border-rose-500/30 dark:text-rose-300 flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400 flex-shrink-0 mt-0.5" />
                    <p className="text-[11px]">ราคาขายต่ำกว่าต้นทุน — ตรวจสอบราคาก่อนยืนยันบิล</p>
                  </div>
                )}
                {financials.lowMargin && (
                  <div className="mt-2.5 p-2.5 rounded-xl bg-amber-100 border border-amber-300 text-amber-900 dark:bg-amber-500/10 dark:border-amber-500/30 dark:text-amber-300 flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                    <p className="text-[11px]">อัตรากำไรต่ำกว่า 10% — พิจารณาปรับราคาขาย</p>
                  </div>
                )}
              </div>

              {/* Footer Actions */}
              {orderSaveError && (
                <p role="alert" className="text-xs font-semibold text-red-700 dark:text-red-300">{orderSaveError}</p>
              )}
              <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={handleCloseCreateModal}
                  className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-white/[0.04] hover:bg-slate-200 dark:hover:bg-white/[0.08] border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold transition active:scale-[0.97] cursor-pointer"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={readOnly || ((!orderFieldsLocked && orderItems.length === 0) || isSavingOrder)}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-[#FF6B00] hover:bg-[#FF8A33] disabled:opacity-40 disabled:cursor-not-allowed text-black dark:text-white text-xs font-bold shadow-lg shadow-[#FF6B00]/30 transition active:scale-[0.97] cursor-pointer"
                >
                  <Send className="w-4 h-4" />
                  <span>{isSavingOrder ? 'กำลังบันทึก…' : editingOrder ? 'บันทึกการแก้ไข' : 'ส่งใบสั่งขาย (Create Order)'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* ========================================================================= */}
      {/* PRODUCT CATALOG MODAL (nested, z-[10001])                                  */}
      {/* ========================================================================= */}
      {isCatalogModalOpen && (
        <ProductCatalogModal
          products={products}
          description="เลือกสินค้าเข้าบิล หรือเพิ่ม/แก้ไขสินค้าในแคตตาล็อก"
          confirmLabel={catalogTarget === 'order' ? 'เพิ่มเข้าบิล' : catalogTarget === 'addon' ? 'เพิ่มเข้า Add-on' : 'เพิ่มเข้าโปรเจกต์'}
          priceLabel="ราคา"
          getPrice={item => item.sell_price}
          getStock={name => stockByName[name.trim().toLowerCase()]?.inStock ?? 0}
          quantities={modalSelectedMap}
          total={modalTotalAmount}
          onToggle={handleToggleSelectModalItem}
          onQuantityChange={(id, qty) => handleUpdateModalItemQty(id, Math.trunc(qty))}
          onConfirm={handleConfirmModalSelection}
          onClose={() => setIsCatalogModalOpen(false)}
          onAdd={readOnly ? undefined : () => setProductEditor({})}
          onEdit={readOnly ? undefined : product => setProductEditor({ product })}
          renderActions={item => (
            <div className="flex items-center gap-1">
              <button disabled={readOnly}
                type="button"
                onClick={(e) => handleDeleteCatalogItem(item.id, item.name, e)}
                aria-label="ลบสินค้า"
                className="p-1 rounded-md text-rose-600 dark:text-rose-400 hover:text-rose-700 dark:hover:text-rose-300 bg-rose-100 dark:bg-rose-500/10 hover:bg-rose-200 dark:hover:bg-rose-500/20 transition cursor-pointer"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          )}
        />
      )}

      {productEditor && (
        <ProductEditorModal
          product={productEditor.product}
          onClose={() => setProductEditor(null)}
          onSave={draft => {
            if (productEditor.product) {
              updateProduct(productEditor.product.id, draft);
              setToast(`อัปเดต "${draft.name}" ในแคตตาล็อกแล้ว`);
            } else {
              addProduct(draft);
              setToast(`เพิ่ม "${draft.name}" เข้าแคตตาล็อกแล้ว`);
            }
            setProductEditor(null);
            setTimeout(() => setToast(''), 3000);
          }}
        />
      )}

      {/* ========================================================================= */}
      {/* SALES ORDER DETAIL & TIMELINE MODAL (z-[9999])                             */}
      {/* ========================================================================= */}
      {detailOrder && !isCreateModalOpen && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-6 bg-black/60 backdrop-blur-sm animate-fade-in overscroll-contain">
          <div className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-800 shadow-2xl rounded-3xl w-full sm:w-[92vw] max-w-3xl max-h-[94dvh] sm:max-h-[82dvh] sm:max-h-[86dvh] flex flex-col overflow-hidden animate-modal-pop">

            {/* Header */}
            <div className="p-4 sm:p-5 bg-slate-50/90 dark:bg-slate-900/95 border-b border-slate-200 dark:border-slate-800 flex items-start justify-between gap-2 flex-shrink-0">
              <div className="min-w-0 space-y-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="p-2.5 rounded-2xl bg-[#FF6B00]/15 text-[#E65A00] dark:text-[#FF6B00] border border-[#FF6B00]/30">
                    <Receipt className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white leading-tight truncate">{detailOrder.customer_name}</h3>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">{detailOrder.sales_ref || detailOrder.id}</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowDeleteOrder(false);
                      handleOpenEditOrder(detailOrder);
                    }}
                    disabled={readOnly || (isDeletingOrder)}
                    className="inline-flex h-8 !min-h-8 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-semibold text-slate-800 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700 cursor-pointer disabled:opacity-50"
                  >
                    <Pencil className="size-3.5" aria-hidden="true" /> แก้ไขบิล
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowDeleteOrder(!showDeleteOrder);
                      setDeleteOrderError('');
                    }}
                    aria-expanded={showDeleteOrder}
                    disabled={readOnly || (isDeletingOrder)}
                    className="inline-flex h-8 !min-h-8 items-center gap-1.5 rounded-lg border border-rose-300 bg-rose-50 px-2.5 text-xs font-semibold text-rose-700 hover:bg-rose-100 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-300 dark:hover:bg-rose-500/20 cursor-pointer disabled:opacity-50"
                  >
                    <Trash2 className="size-3.5" aria-hidden="true" /> ลบบิล
                  </button>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setDetailOrder(null);
                  setShowDeleteOrder(false);
                }}
                disabled={isDeletingOrder}
                aria-label="ปิดรายละเอียดออเดอร์"
                className="p-2.5 rounded-xl text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white bg-slate-100 dark:bg-white/[0.04] hover:bg-slate-200 dark:hover:bg-white/[0.08] transition min-w-[44px] min-h-[44px] flex items-center justify-center flex-shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto overscroll-contain p-4 sm:p-5 space-y-4">
              {showDeleteOrder && (
                <section aria-label="ยืนยันการลบบิล" className="space-y-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-900 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-100">
                  <p>{canDeleteDetailOrder
                    ? 'ยืนยันลบบิลนี้? การลบย้อนกลับไม่ได้'
                    : 'ลบได้เฉพาะบิลที่ยังอยู่ในคิวรอจัดซื้อและยังไม่มีรายการผูกกับบิล'}</p>
                  {deleteOrderError && <p role="alert" className="font-semibold">{deleteOrderError}</p>}
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => setShowDeleteOrder(false)} disabled={isDeletingOrder} className={`${modalSecondaryBtnClass} sm:w-auto`}>ยกเลิก</button>
                    {canDeleteDetailOrder && (
                      <button type="button" onClick={() => void handleDeleteOrder()} disabled={readOnly || (isDeletingOrder)} className="min-h-11 rounded-xl bg-rose-700 px-4 font-bold text-white hover:bg-rose-800 cursor-pointer disabled:opacity-50">
                        {isDeletingOrder ? 'กำลังลบ…' : 'ยืนยันลบบิล'}
                      </button>
                    )}
                  </div>
                </section>
              )}
              {/* Status + meta badges */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold border ${BILLING_BADGE_META[getOrderBillingBadgeKey(detailOrder)].cls}`}>
                  {BILLING_BADGE_META[getOrderBillingBadgeKey(detailOrder)].label}
                </span>
                {detailOrder.billing_period && (
                  <span className="px-2.5 py-1 rounded-full text-[10px] font-mono font-bold bg-slate-100 text-slate-800 border border-slate-300 dark:bg-white/[0.06] dark:text-slate-200 dark:border-white/[0.12]">
                    งวด {detailOrder.billing_period}
                  </span>
                )}
                {detailOrder.due_date && (
                  <span className="px-2.5 py-1 rounded-full text-[10px] font-mono font-semibold bg-amber-100 text-amber-900 border border-amber-300 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30">
                    ครบกำหนด {detailOrder.due_date}
                  </span>
                )}
                {getOrderStatusBadge(detailOrder.order_status)}
                {detailOrder.delivery_mode && (
                  <span className={`px-2.5 py-1 rounded-full text-[10px] font-semibold border ${DELIVERY_MODE_META[detailOrder.delivery_mode].cls}`}>
                    {DELIVERY_MODE_META[detailOrder.delivery_mode].label}
                  </span>
                )}
                {detailOrder.route_code && (
                  <span className="px-2.5 py-1 rounded-full text-[10px] font-semibold bg-slate-100 dark:bg-white/[0.06] text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-white/[0.1]">
                    {ROUTE_DEFINITIONS[detailOrder.route_code].name}
                  </span>
                )}
              </div>

              {/* Customer info grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700">
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 mb-0.5">เบอร์โทรลูกค้า</p>
                  <p className="text-xs font-semibold text-slate-900 dark:text-white font-mono">{detailOrder.customer_phone || '-'}</p>
                  {detailOrder.customer_contact_name && (
                    <p className="mt-1 text-xs text-slate-700 dark:text-slate-300">ผู้ติดต่อ {detailOrder.customer_contact_name}</p>
                  )}
                </div>
                <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700">
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 mb-0.5">วันที่ส่งมอบ</p>
                  <p className="text-xs font-semibold text-slate-900 dark:text-white font-mono">{detailOrder.delivery_date || '-'}</p>
                </div>
                <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 sm:col-span-2">
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 mb-0.5">ที่อยู่จัดส่ง / หน้างาน</p>
                  <p className="text-xs font-semibold text-slate-900 dark:text-white">{detailOrder.delivery_location || '-'}</p>
                  {detailOrder.site_notes && <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-1">หมายเหตุ: {detailOrder.site_notes}</p>}
                </div>
                <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700">
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 mb-0.5">ผู้เปิดบิล</p>
                  <p className="text-xs font-semibold text-slate-900 dark:text-white">{detailOrder.salesperson || detailOrder.created_by || '-'}</p>
                </div>
                <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700">
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 mb-0.5">เปิดบิลเมื่อ</p>
                  <p className="text-xs font-semibold text-slate-900 dark:text-white font-mono">{formatThaiDateTime(detailOrder.created_at_log || detailOrder.created_at)}</p>
                </div>
              </div>

              {/* Itemized breakdown */}
              <div>
                <p className="text-xs font-bold text-slate-900 dark:text-white mb-2 flex items-center gap-1.5">
                  <Package className="w-3.5 h-3.5 text-[#FF6B00]" />
                  <span>รายการสินค้า ({(detailOrder.items_list || []).length} รายการ)</span>
                </p>
                <div className="space-y-2">
                  {(detailOrder.items_list || []).map((it, idx) => {
                    const lineTotal = (it.unit_price || 0) * (it.quantity || 1);
                    const lineGp = lineTotal - (it.unit_cost || 0) * (it.quantity || 1);
                    return (
                      <div key={idx} className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-bold text-slate-900 dark:text-white truncate">{it.model_name}</p>
                            <p className="text-[10px] text-slate-500 dark:text-slate-400">
                              {it.quantity} × ฿{(it.unit_price || 0).toLocaleString('th-TH')}
                              {it.warranty_years ? ` • ประกัน ${it.warranty_years} ปี` : ' • ไม่มีประกัน'}
                            </p>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <p className="text-xs font-bold text-slate-900 dark:text-white font-mono tabular-nums">฿{lineTotal.toLocaleString('th-TH', { maximumFractionDigits: 0 })}</p>
                            <p className={`text-[10px] font-mono tabular-nums ${lineGp < 0 ? 'text-rose-700 dark:text-rose-400' : 'text-emerald-700 dark:text-emerald-400'}`}>GP ฿{lineGp.toLocaleString('th-TH', { maximumFractionDigits: 0 })}</p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Financial summary */}
              <div className="grid grid-cols-2 gap-2.5">
                <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700">
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 mb-0.5">ยอดขายรวม</p>
                  <p className="text-sm font-extrabold text-slate-900 dark:text-white font-mono tabular-nums">฿{orderTotal(detailOrder).toLocaleString('th-TH', { maximumFractionDigits: 0 })}</p>
                </div>
                <div className="p-3 rounded-2xl bg-emerald-100 border border-emerald-300 dark:bg-emerald-500/10 dark:border-emerald-500/30">
                  <p className="text-[10px] text-slate-600 dark:text-slate-400 mb-0.5">กำไรขั้นต้น (GP)</p>
                  <p className="text-sm font-extrabold text-emerald-800 dark:text-emerald-300 font-mono tabular-nums">฿{orderGp(detailOrder).toLocaleString('th-TH', { maximumFractionDigits: 0 })}</p>
                </div>
              </div>

              {/* Activity logs (collapsible) */}
              {detailOrder.activity_logs && detailOrder.activity_logs.length > 0 && (
                <details className="rounded-2xl bg-slate-50 dark:bg-white/[0.02] border border-slate-200 dark:border-white/[0.08] overflow-hidden">
                  <summary className="px-3 py-2.5 text-xs font-bold text-slate-700 dark:text-slate-300 cursor-pointer hover:text-slate-900 dark:hover:text-white transition select-none">
                    ประวัติการดำเนินการ ({detailOrder.activity_logs.length})
                  </summary>
                  <div className="px-3 pb-3">
                    <ActivityTimeline logs={detailOrder.activity_logs} />
                  </div>
                </details>
              )}
            </div>

            {/* Footer */}
            <div className="p-3 sm:p-4 bg-slate-50/90 dark:bg-slate-900/95 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 flex-shrink-0">
              <button
                type="button"
                onClick={() => setPrintTarget({ order: detailOrder })}
                className="px-4 py-2 rounded-xl bg-[#FF6B00] hover:bg-[#FF8A24] text-black text-xs font-extrabold transition active:scale-[0.97] cursor-pointer flex items-center gap-1.5 shadow-sm"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>พิมพ์ใบสั่งงาน (ORDER FORM 2026)</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setDetailOrder(null);
                  setShowDeleteOrder(false);
                }}
                disabled={isDeletingOrder}
                className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-white/[0.04] hover:bg-slate-200 dark:hover:bg-white/[0.08] border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold transition active:scale-[0.97] cursor-pointer"
              >
                ปิด
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ========================================================================= */}
      {/* CREATE PROJECT SITE MODAL (PRJ-2026-XXX, createPortal, z-[9999])          */}
      {/* ========================================================================= */}
      {isCreateProjectOpen && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-6 bg-black/60 backdrop-blur-sm animate-fade-in overscroll-contain">
          <div className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white border border-purple-300 dark:border-purple-500/40 shadow-2xl rounded-3xl w-full sm:w-[94vw] max-w-5xl max-h-[94dvh] sm:max-h-[82dvh] sm:max-h-[86dvh] flex flex-col overflow-hidden animate-modal-pop">
            <div className="p-4 sm:p-5 bg-slate-50/90 dark:bg-slate-900/95 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 flex-shrink-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="p-2.5 rounded-2xl bg-purple-500/15 text-purple-700 dark:text-purple-300 border border-purple-500/30">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white leading-tight">
                    เปิดงานรับเหมา / ติดตั้งระบบหน้างาน (Create Project Site)
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                    รหัสโปรเจกต์: <strong className="text-purple-700 dark:text-purple-300">{prjCode}</strong> • เซลล์ผู้เปิด: <strong>{salespersonName}</strong>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsCreateProjectOpen(false)}
                className="p-2.5 rounded-xl text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white bg-slate-100 dark:bg-white/[0.04] hover:bg-slate-200 dark:hover:bg-white/[0.08] transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitCreateProject} className="flex-1 overflow-y-auto overscroll-contain p-4 sm:p-6 space-y-5 text-xs">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">ชื่อโครงการ / ไซต์งานติดตั้ง *</label>
                  <input
                    type="text"
                    required
                    value={prjSiteName}
                    onChange={(e) => setPrjSiteName(e.target.value)}
                    placeholder="เช่น โครงการติดตั้งระบบ Network & CCTV อาคารสำนักงานใหม่"
                    className="w-full rounded-xl px-3 py-2 text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-300 dark:border-slate-700 focus:outline-none focus:border-purple-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">ชื่อลูกค้า / บริษัทผู้ว่าจ้าง *</label>
                  <input
                    type="text"
                    required
                    value={prjCustomerName}
                    onChange={(e) => setPrjCustomerName(e.target.value)}
                    placeholder="เช่น บจก. สุราษฎร์ โลจิสติกส์ พาร์ค"
                    className="w-full rounded-xl px-3 py-2 text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-300 dark:border-slate-700 focus:outline-none focus:border-purple-500"
                  />
                </div>
                <div>
                  <label htmlFor="sales-project-phone" className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">เบอร์โทรผู้ประสานงานหน้างาน *</label>
                  <PhoneInput
                    id="sales-project-phone"
                    required
                    value={prjPhone}
                    onChange={(e) => setPrjPhone(e.target.value)}
                    className="w-full rounded-xl px-3 py-2 text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-300 dark:border-slate-700 focus:outline-none focus:border-purple-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">อำเภอ / โซนสายรถ *</label>
                  <select
                    value={prjDistrict}
                    onChange={(e) => setPrjDistrict(e.target.value)}
                    className="w-full rounded-xl px-3 py-2 text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-300 dark:border-slate-700 focus:outline-none focus:border-purple-500"
                  >
                    {DISTRICT_OPTIONS.map(opt => (
                      <option key={opt.district} value={opt.district} className="bg-white dark:bg-[#12141A]">
                        {opt.district} - [{opt.zone}]
                      </option>
                    ))}
                  </select>
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">สถานที่ติดตั้ง / พิกัดไซต์งาน *</label>
                  <input
                    type="text"
                    required
                    value={prjLocation}
                    onChange={(e) => setPrjLocation(e.target.value)}
                    placeholder="ระบุอาคาร ชั้น หรือพิกัดหน้างาน"
                    className="w-full rounded-xl px-3 py-2 text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-300 dark:border-slate-700 focus:outline-none focus:border-purple-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">วันเริ่มเข้าหน้างาน (Start Date) *</label>
                  <input
                    type="date"
                    required
                    value={prjStartDate}
                    onChange={(e) => setPrjStartDate(e.target.value)}
                    className="w-full rounded-xl px-3 py-2 text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-300 dark:border-slate-700 font-mono focus:outline-none focus:border-purple-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-rose-700 dark:text-rose-300 mb-1">วันกำหนดส่งมอบห้ามช้า (Contract Deadline) *</label>
                  <input
                    type="date"
                    required
                    value={prjDueDate}
                    onChange={(e) => setPrjDueDate(e.target.value)}
                    className="w-full rounded-xl px-3 py-2 text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-white border border-rose-300 dark:border-rose-500/40 font-mono focus:outline-none focus:border-purple-500"
                  />
                </div>
              </div>

              <div className="p-3 rounded-2xl bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-500/30 text-[11px] text-indigo-900 dark:text-indigo-200">
                <strong>หมายเหตุการจัดทีมช่าง:</strong> ฝ่ายขายกำหนดเฉพาะขอบเขตงาน รายการสินค้า และวันกำหนดส่งมอบตามสัญญา — <strong>ฝ่ายหน้าร้าน (Front-Desk)</strong> จะเป็นผู้จัดชุดช่างและนัดวันเข้าไซต์รายวันให้เอง
              </div>

              {/* Separate Lists: อุปกรณ์หลัก vs วัสดุสิ้นเปลือง/ค่าแรง — เลือกผ่าน Product Catalog Modal */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-3.5 rounded-2xl bg-blue-50/60 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/30 space-y-2.5">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-extrabold text-blue-900 dark:text-blue-200">
                        1. อุปกรณ์หลัก (ต้องเตรียม / S/N / ติดวอย)
                      </span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-blue-600 text-white">
                        {prjItems.filter(i => i.item_type === 'equipment').length}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleOpenCatalogModal('project_equipment')}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-bold transition active:scale-[0.97] cursor-pointer shadow-sm"
                    >
                      <Layers className="w-3.5 h-3.5" />
                      <span>+ เลือกจากแคตตาล็อก</span>
                    </button>
                  </div>
                  {prjItems.filter(i => i.item_type === 'equipment').length === 0 ? (
                    <div className="py-5 text-center border border-dashed border-blue-300/70 dark:border-blue-500/25 rounded-xl">
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        ยังไม่มีอุปกรณ์หลัก — กด &quot;+ เลือกจากแคตตาล็อก&quot;
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {prjItems.map((it, idx) =>
                        it.item_type === 'equipment' ? (
                          <div key={idx} className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-blue-200 dark:border-blue-500/20 space-y-2">
                            <div className="flex items-center justify-between gap-2">
                              <div className="font-bold text-slate-900 dark:text-white truncate">{it.model_name}</div>
                              <button
                                type="button"
                                onClick={() => setPrjItems(prev => prev.filter((_, i) => i !== idx))}
                                className="p-1 rounded-lg text-rose-600 hover:bg-rose-100 dark:hover:bg-rose-500/20 cursor-pointer shrink-0"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                            <div className="grid grid-cols-3 gap-1.5">
                              <div>
                                <label className="block text-[9px] text-slate-500 mb-0.5">จำนวน</label>
                                <NumberInput
                                  min={1}
                                  value={it.qty_required}
                                  onChange={(e) => {
                                    const val = Math.max(1, parseInt(e.target.value) || 1);
                                    setPrjItems(prev => prev.map((row, i) => i === idx ? { ...row, qty_required: val } : row));
                                  }}
                                  className="w-full rounded-lg px-2 py-1 text-[11px] bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-300 dark:border-slate-700 font-mono text-center"
                                />
                              </div>
                              <div>
                                <label className="block text-[9px] text-slate-500 mb-0.5">ทุน/หน่วย</label>
                                <NumberInput
                                  min={0}
                                  value={it.unit_cost}
                                  onChange={(e) => {
                                    const val = Math.max(0, parseFloat(e.target.value) || 0);
                                    setPrjItems(prev => prev.map((row, i) => i === idx ? { ...row, unit_cost: val } : row));
                                  }}
                                  className="w-full rounded-lg px-2 py-1 text-[11px] bg-slate-50 dark:bg-slate-800 text-amber-700 dark:text-amber-300 border border-slate-300 dark:border-slate-700 font-mono"
                                />
                              </div>
                              <div>
                                <label className="block text-[9px] text-slate-500 mb-0.5">ขาย/หน่วย</label>
                                <NumberInput
                                  min={0}
                                  value={it.unit_price}
                                  onChange={(e) => {
                                    const val = Math.max(0, parseFloat(e.target.value) || 0);
                                    setPrjItems(prev => prev.map((row, i) => i === idx ? { ...row, unit_price: val } : row));
                                  }}
                                  className="w-full rounded-lg px-2 py-1 text-[11px] bg-slate-50 dark:bg-slate-800 text-emerald-700 dark:text-emerald-300 border border-slate-300 dark:border-slate-700 font-mono"
                                />
                              </div>
                            </div>
                          </div>
                        ) : null
                      )}
                    </div>
                  )}
                </div>

                <div className="p-3.5 rounded-2xl bg-amber-50/60 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 space-y-2.5">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-extrabold text-amber-900 dark:text-amber-200">
                        2. วัสดุสิ้นเปลือง / ค่าแรง (ส่งตรง Onsite)
                      </span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-500 text-black">
                        {prjItems.filter(i => i.item_type === 'consumable').length}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleOpenCatalogModal('project_consumable')}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-[11px] font-bold transition active:scale-[0.97] cursor-pointer shadow-sm"
                    >
                      <Layers className="w-3.5 h-3.5" />
                      <span>+ เลือกจากแคตตาล็อก</span>
                    </button>
                  </div>
                  {prjItems.filter(i => i.item_type === 'consumable').length === 0 ? (
                    <div className="py-5 text-center border border-dashed border-amber-300/70 dark:border-amber-500/25 rounded-xl">
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        ยังไม่มีวัสดุ/ค่าแรง — กด &quot;+ เลือกจากแคตตาล็อก&quot;
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {prjItems.map((it, idx) =>
                        it.item_type === 'consumable' ? (
                          <div key={idx} className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-500/20 space-y-2">
                            <div className="flex items-center justify-between gap-2">
                              <div className="font-bold text-slate-900 dark:text-white truncate">{it.model_name}</div>
                              <button
                                type="button"
                                onClick={() => setPrjItems(prev => prev.filter((_, i) => i !== idx))}
                                className="p-1 rounded-lg text-rose-600 hover:bg-rose-100 dark:hover:bg-rose-500/20 cursor-pointer shrink-0"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                            <div className="grid grid-cols-3 gap-1.5">
                              <div>
                                <label className="block text-[9px] text-slate-500 mb-0.5">จำนวน</label>
                                <NumberInput
                                  min={1}
                                  value={it.qty_required}
                                  onChange={(e) => {
                                    const val = Math.max(1, parseInt(e.target.value) || 1);
                                    setPrjItems(prev => prev.map((row, i) => i === idx ? { ...row, qty_required: val } : row));
                                  }}
                                  className="w-full rounded-lg px-2 py-1 text-[11px] bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-300 dark:border-slate-700 font-mono text-center"
                                />
                              </div>
                              <div>
                                <label className="block text-[9px] text-slate-500 mb-0.5">ทุน/หน่วย</label>
                                <NumberInput
                                  min={0}
                                  value={it.unit_cost}
                                  onChange={(e) => {
                                    const val = Math.max(0, parseFloat(e.target.value) || 0);
                                    setPrjItems(prev => prev.map((row, i) => i === idx ? { ...row, unit_cost: val } : row));
                                  }}
                                  className="w-full rounded-lg px-2 py-1 text-[11px] bg-slate-50 dark:bg-slate-800 text-amber-700 dark:text-amber-300 border border-slate-300 dark:border-slate-700 font-mono"
                                />
                              </div>
                              <div>
                                <label className="block text-[9px] text-slate-500 mb-0.5">ขาย/หน่วย</label>
                                <NumberInput
                                  min={0}
                                  value={it.unit_price}
                                  onChange={(e) => {
                                    const val = Math.max(0, parseFloat(e.target.value) || 0);
                                    setPrjItems(prev => prev.map((row, i) => i === idx ? { ...row, unit_price: val } : row));
                                  }}
                                  className="w-full rounded-lg px-2 py-1 text-[11px] bg-slate-50 dark:bg-slate-800 text-emerald-700 dark:text-emerald-300 border border-slate-300 dark:border-slate-700 font-mono"
                                />
                              </div>
                            </div>
                          </div>
                        ) : null
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsCreateProjectOpen(false)}
                  className="px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-white/[0.04] text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700 font-bold text-xs cursor-pointer"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={readOnly || (prjItems.length === 0)}
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 disabled:opacity-40 text-white font-extrabold text-xs shadow-lg shadow-purple-500/30 cursor-pointer flex items-center gap-2"
                >
                  <Send className="w-4 h-4" />
                  <span>ยืนยันเปิดโปรเจกต์ ({prjCode})</span>
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* ========================================================================= */}
      {/* PROJECT DETAIL & MULTI-SALES ADD-ON BREAKDOWN MODAL (z-[9999])            */}
      {/* ========================================================================= */}
      {detailProject && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-6 bg-black/60 backdrop-blur-sm animate-fade-in overscroll-contain">
          <div className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white border border-purple-300 dark:border-purple-500/40 shadow-2xl rounded-3xl w-full sm:w-[94vw] max-w-4xl max-h-[94dvh] sm:max-h-[82dvh] sm:max-h-[86dvh] flex flex-col overflow-hidden animate-modal-pop">
            <div className="p-4 sm:p-5 bg-slate-50/90 dark:bg-slate-900/95 border-b border-slate-200 dark:border-slate-800 flex items-start justify-between gap-2 flex-shrink-0">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono font-extrabold text-sm text-purple-700 dark:text-purple-300">{detailProject.id}</span>
                  {getProjectStatusBadge(detailProject.status)}
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-100 text-emerald-900 border border-emerald-300 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30">
                    เซลล์เจ้าของโครงการ: {detailProject.created_by}
                  </span>
                </div>
                <h3 className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white mt-1 truncate">
                  {detailProject.site_name}
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  ลูกค้า: {detailProject.customer_name} ({detailProject.phone}) • {detailProject.location}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setPrintTarget({ project: detailProject })}
                  className="px-3 py-2 rounded-xl bg-[#FF6B00] hover:bg-[#FF8A24] text-black text-xs font-extrabold cursor-pointer flex items-center gap-1.5 shadow-sm"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">พิมพ์ ORDER FORM 2026</span>
                  <span className="sm:hidden">พิมพ์</span>
                </button>
                <button
                  type="button"
                  onClick={() => setDetailProjectId(null)}
                  className="p-2 rounded-xl text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white bg-slate-100 dark:bg-white/[0.04] cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {(() => {
              const fin = getProjectFinancials(detailProject);
              return (
                <div className="flex-1 overflow-y-auto overscroll-contain p-4 sm:p-5 space-y-4 text-xs">
                  {/* Top action: Lock Add-on when completed; allow opening a fresh follow-up bill with customer info only */}
                  {detailProject.status === 'completed' ? (
                    <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-500/10 border-2 border-emerald-300 dark:border-emerald-500/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-start gap-2.5">
                        <div className="p-2 rounded-xl bg-emerald-600 text-white shrink-0">
                          <Lock className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="font-black text-sm text-emerald-900 dark:text-emerald-200">
                            ส่งมอบปิดโปรเจกต์เรียบร้อยแล้ว (ล็อกการแก้ไขบิลเดิม)
                          </div>
                          <p className="text-[11px] text-emerald-800 dark:text-emerald-300/90 mt-0.5">
                            โปรเจกต์นี้ปิดงานสมบูรณ์แล้ว ไม่สามารถเพิ่มหรือแก้ไขรายการในบิลนี้ได้ — หากมีงานเพิ่มเติมหรือแก้ไข กดเปิดบิลใหม่โดยดึงเฉพาะข้อมูลลูกค้าและสถานที่ (ไม่ดึงรายการสินค้าเก่า)
                          </p>
                        </div>
                      </div>
                      <button disabled={readOnly}
                        type="button"
                        onClick={() => handleCreateFollowUpBillFromClosedProject(detailProject)}
                        className="px-4 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-extrabold text-xs transition cursor-pointer flex items-center justify-center gap-1.5 shadow-md shrink-0 active:scale-95"
                      >
                        <FilePlus2 className="w-4 h-4" />
                        <span>+ เปิดบิลใหม่จากลูกค้า/ไซต์นี้</span>
                      </button>
                    </div>
                  ) : (
                    <div className="p-3.5 rounded-2xl bg-purple-50 dark:bg-purple-500/10 border border-purple-200 dark:border-purple-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <div className="font-extrabold text-purple-900 dark:text-purple-200">
                          ระบบแอดรายการเพิ่มข้ามเซลล์ (Multi-Sales Add-On Attribution)
                        </div>
                        <p className="text-[11px] text-purple-800/80 dark:text-purple-300/80">
                          เซลล์ทุกคนสามารถแอดสินค้า/สายไฟ/ค่าแรงเพิ่มเข้าไซต์งานนี้ได้ ระบบจะระบุชื่อผู้แอดและแยกยอดตั้งต้น vs ยอดแอดเพิ่มอัตโนมัติ
                        </p>
                      </div>
                      <button disabled={readOnly}
                        type="button"
                        onClick={(e) => handleOpenAddonModal(detailProject, e)}
                        className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#FF6B00] to-[#E65A00] hover:from-[#FF8A24] text-black font-extrabold text-xs transition cursor-pointer flex items-center justify-center gap-1.5 shadow-md shrink-0"
                      >
                        <Plus className="w-4 h-4" />
                        <span>+ แอดรายการเพิ่มเข้าโปรเจกต์ (Add-on)</span>
                      </button>
                    </div>
                  )}

                  {/* Separate Subtotals: ยอดตั้งต้น vs ยอดแอดเพิ่ม */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700">
                      <div className="text-[10px] text-slate-500 dark:text-slate-400">ยอดตั้งต้น ({fin.baseItems.length} รายการ)</div>
                      <div className="text-base font-extrabold font-mono text-slate-900 dark:text-white mt-0.5">฿{fmt(fin.baseRev)}</div>
                      <div className="text-[10px] text-slate-500 font-mono">ทุน ฿{fmt(fin.baseCost)} • โดย {detailProject.created_by}</div>
                    </div>
                    <div className="p-3 rounded-2xl bg-purple-50 dark:bg-purple-500/10 border border-purple-200 dark:border-purple-500/30">
                      <div className="text-[10px] text-purple-700 dark:text-purple-300">ยอดแอดเพิ่ม ({fin.addonItems.length} รายการ)</div>
                      <div className="text-base font-extrabold font-mono text-purple-800 dark:text-purple-200 mt-0.5">+฿{fmt(fin.addonRev)}</div>
                      <div className="text-[10px] text-purple-600 dark:text-purple-300 font-mono">ทุน ฿{fmt(fin.addonCost)}</div>
                    </div>
                    <div className="p-3 rounded-2xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30">
                      <div className="text-[10px] text-emerald-700 dark:text-emerald-300">รวมทั้งโครงการ & GP สุทธิ</div>
                      <div className="text-base font-extrabold font-mono text-emerald-800 dark:text-emerald-200 mt-0.5">฿{fmt(fin.totalRev)}</div>
                      <div className="text-[10px] text-[#C2410C] dark:text-[#FF6B00] font-mono font-bold">GP สุทธิ ฿{fmt(fin.totalGp)}</div>
                    </div>
                  </div>

                  {/* Field Material Requests from Onsite Techs */}
                  {detailProject.material_requests && detailProject.material_requests.length > 0 && (
                    <div className="p-3.5 rounded-2xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/30 space-y-2">
                      <div className="font-extrabold text-rose-900 dark:text-rose-200 flex items-center gap-1.5">
                        <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400" />
                        <span>รายการที่ช่างหน้างานขอเบิกเพิ่ม (Field Material Requests)</span>
                      </div>
                      {detailProject.material_requests.map((req) => (
                        <div key={req.id} className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-rose-200 dark:border-rose-500/20 flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <div className="font-bold text-slate-900 dark:text-white">
                              {req.item_name} <span className="font-mono text-[#C2410C] dark:text-[#FF6B00]">x{req.qty}</span>
                            </div>
                            <div className="text-[11px] text-slate-600 dark:text-slate-400">
                              เหตุผลหน้างาน: {req.reason} • ขอโดย <strong>{req.requested_by}</strong>
                            </div>
                          </div>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300 dark:bg-amber-500/20 dark:text-amber-300">
                            {req.status === 'pending' ? 'รอเซลล์แอดเพิ่ม / จัดซื้อเบิก' : req.status === 'approved_ordered' ? 'อนุมัติสั่งซื้อแล้ว' : 'ส่งเข้าไซต์งานแล้ว'}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Line Items List with Add-on Badges */}
                  <div className="space-y-2">
                    <div className="font-extrabold text-slate-900 dark:text-white">
                      รายการอุปกรณ์หลัก & วัสดุสิ้นเปลือง ({detailProject.items.length} รายการ)
                    </div>
                    {detailProject.items.map((it) => {
                      const lineTotal = (it.unit_price || 0) * (it.qty_required || 0);
                      const lineGp = lineTotal - (it.unit_cost || 0) * (it.qty_required || 0);
                      return (
                        <div key={it.id} className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <div className="space-y-1 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                                it.item_type === 'equipment'
                                  ? 'bg-blue-100 text-blue-900 border-blue-300 dark:bg-blue-500/20 dark:text-blue-300 dark:border-blue-500/30'
                                  : 'bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-500/20 dark:text-amber-300 dark:border-amber-500/30'
                              }`}>
                                {it.item_type === 'equipment' ? 'อุปกรณ์หลัก (ต้องเตรียม/S/N)' : 'วัสดุสิ้นเปลือง/ค่าแรง'}
                              </span>
                              {it.is_addon ? (
                                <span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-purple-100 text-purple-900 border border-purple-300 dark:bg-purple-500/20 dark:text-purple-200 dark:border-purple-500/40">
                                  แอดเพิ่มโดย {it.added_by || 'ฝ่ายขาย'}
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-slate-200 text-slate-800 dark:bg-white/10 dark:text-slate-300">
                                  รายการตั้งต้น
                                </span>
                              )}
                            </div>
                            <div className="font-bold text-slate-900 dark:text-white">{it.model_name}</div>
                            <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                              ต้องการ {it.qty_required} {it.unit || 'ชิ้น'} • เบิกแล้ว {it.qty_allocated}/{it.qty_required} • เตรียมเสร็จ {it.qty_prepared}/{it.qty_required}
                              {it.serial_numbers && it.serial_numbers.length > 0 && ` • S/N: ${it.serial_numbers.join(', ')}`}
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <div className="font-mono font-extrabold text-sm text-slate-900 dark:text-white">฿{fmt(lineTotal)}</div>
                            <div className="text-[10px] font-mono text-emerald-700 dark:text-emerald-400">GP ฿{fmt(lineGp)}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Read-only Scheduled Site Visits */}
                  <div className="space-y-2">
                    <div className="font-bold text-slate-800 dark:text-slate-200 flex items-center justify-between gap-2">
                      <span>ตารางนัดเข้าไซต์งาน (จัดทีมโดยหน้าร้าน) ({detailProject.site_visits?.length || 0} รอบ)</span>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${getProjectDeadlineRisk(detailProject.due_date, detailProject.status).badgeCls}`}>
                        {getProjectDeadlineRisk(detailProject.due_date, detailProject.status).label}
                      </span>
                    </div>
                    {!detailProject.site_visits || detailProject.site_visits.length === 0 ? (
                      <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-dashed border-slate-300 dark:border-slate-700 text-[11px] text-slate-500">
                        รอหน้าร้านนัดวันเข้าไซต์ &amp; จัดชุดช่าง
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {detailProject.site_visits.map((sv, idx) => (
                          <div key={sv.id} className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 space-y-1">
                            <div className="flex items-center justify-between gap-1">
                              <span className="font-mono font-bold text-indigo-700 dark:text-indigo-300">
                                รอบ #{idx + 1} • {formatDateDMY(sv.visit_date)} ({sv.time_slot})
                              </span>
                              <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                                sv.visit_status === 'completed'
                                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300'
                                  : 'bg-sky-100 text-sky-800 dark:bg-sky-500/20 dark:text-sky-300'
                              }`}>
                                {sv.visit_status === 'completed' ? 'เสร็จสิ้น' : sv.visit_status === 'in_progress' ? 'กำลังเข้าไซต์' : 'นัดหมายแล้ว'}
                              </span>
                            </div>
                            <div className="text-[11px] text-slate-700 dark:text-slate-200 font-semibold">{sv.visit_scope}</div>
                            <div className="text-[10px] text-slate-500 dark:text-slate-400">
                              ทีมช่าง: {sv.assigned_techs.join(', ') || '-'} • สิ่งที่จะนำไป: {sv.items_to_take.length} รายการ
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Released Batches with per-batch print */}
                  {detailProject.batches && detailProject.batches.length > 0 && (
                    <div className="space-y-2">
                      <div className="font-bold text-slate-800 dark:text-slate-200">
                        งวดเบิกของที่ปล่อยแล้ว ({detailProject.batches.length} งวด)
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {detailProject.batches.map((b) => (
                          <div key={b.id} className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <div className="font-bold text-purple-700 dark:text-purple-300">งวดที่ {b.batch_no}</div>
                              <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                                {formatThaiDateTime(b.released_at)} • {b.items.length} รายการ
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => setPrintTarget({ project: detailProject, initialBatchNo: b.batch_no })}
                              className="px-2.5 py-1.5 rounded-lg bg-[#FF6B00]/15 hover:bg-[#FF6B00]/25 text-[#C2410C] dark:text-[#FF6B00] border border-[#FF6B00]/30 text-[11px] font-bold cursor-pointer flex items-center gap-1 shrink-0"
                            >
                              <Printer className="w-3 h-3" />
                              <span>พิมพ์บิล งวดที่ {b.batch_no}</span>
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Activity Timeline */}
                  {detailProject.activity_logs && detailProject.activity_logs.length > 0 && (
                    <div className="pt-2 border-t border-slate-200 dark:border-white/[0.08]">
                      <div className="font-bold text-slate-800 dark:text-slate-200 mb-2">
                        ประวัติการดำเนินการโปรเจกต์ ({detailProject.activity_logs.length})
                      </div>
                      <ActivityTimeline logs={detailProject.activity_logs} />
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        </div>,
        document.body
      )}

      {/* ========================================================================= */}
      {/* ADD-ON MODAL FOR ANY SALES USER (createPortal, z-[10000])                 */}
      {/* ========================================================================= */}
      {addonProject && createPortal(
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 sm:p-6 bg-black/70 backdrop-blur-sm animate-fade-in overscroll-contain">
          <div className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white border border-[#FF6B00]/50 shadow-2xl rounded-3xl w-full sm:w-[92vw] max-w-lg max-h-[88dvh] flex flex-col overflow-hidden animate-modal-pop">
            <div className="p-4 sm:p-5 bg-slate-50/90 dark:bg-slate-900/95 border-b border-slate-200 dark:border-slate-800 flex items-start justify-between gap-2">
              <div>
                <h3 className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white">
                  + แอดรายการเพิ่มเข้าโปรเจกต์ (Multi-Sales Add-On)
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono mt-0.5">
                  {addonProject.id} • {addonProject.site_name} (เปิดโดย {addonProject.created_by})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAddonProjectId(null)}
                className="p-2 rounded-xl text-slate-500 hover:text-slate-900 dark:hover:text-white bg-slate-100 dark:bg-white/[0.04] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitAddon} className="p-4 sm:p-5 space-y-4 overflow-y-auto text-xs">
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  ผู้แอดรายการเพิ่ม (added_by — เซลล์คนใดก็ได้) *
                </label>
                <div className="flex gap-2">
                  <select
                    value={addonAddedBy}
                    onChange={(e) => setAddonAddedBy(e.target.value)}
                    className="flex-1 rounded-xl px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-300 dark:border-slate-700 font-bold"
                  >
                    {salesUsersList.map(u => (
                      <option key={u.id} value={u.name}>{u.name} ({u.badge || u.role})</option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={addonAddedBy}
                    onChange={(e) => setAddonAddedBy(e.target.value)}
                    placeholder="หรือพิมพ์ชื่อเซลล์"
                    className="flex-1 rounded-xl px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-300 dark:border-slate-700"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between gap-2 flex-wrap">
                <label className="font-bold text-slate-700 dark:text-slate-300">
                  รายการที่แอดเพิ่ม ({addonItems.length} รายการ) *
                </label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleOpenCatalogModal('addon')}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#FF6B00]/15 hover:bg-[#FF6B00]/25 border border-[#FF6B00]/40 text-[#C2410C] dark:text-[#FF6B00] text-[11px] font-bold transition active:scale-[0.97] cursor-pointer"
                  >
                    <Layers className="w-3.5 h-3.5" />
                    <span>+ เลือกจากแคตตาล็อก (เลือกได้หลายรายการ)</span>
                  </button>
                </div>
              </div>

              {addonItems.length === 0 ? (
                <div className="py-6 px-4 text-center border border-dashed border-slate-300 dark:border-slate-700 rounded-2xl bg-slate-50 dark:bg-white/[0.02]">
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    ยังไม่มีรายการที่เลือก — กด &quot;+ เลือกจากแคตตาล็อก&quot; เพื่อติ๊กเลือกได้หลายรายการพร้อมกัน
                  </p>
                </div>
              ) : (
                <div className="space-y-2.5 max-h-64 overflow-y-auto pr-1">
                  {addonItems.map((it, idx) => (
                    <div key={`${it.model_name}-${idx}`} className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="font-bold text-slate-900 dark:text-white truncate">{it.model_name}</div>
                          <div className="flex items-center gap-1.5 mt-1">
                            <button
                              type="button"
                              onClick={() => setAddonItems(prev => prev.map((row, i) => i === idx ? { ...row, item_type: 'equipment', warranty_years: 1 } : row))}
                              className={`px-2 py-0.5 rounded text-[10px] font-bold border cursor-pointer ${
                                it.item_type === 'equipment'
                                  ? 'bg-blue-600 text-white border-blue-600'
                                  : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-700'
                              }`}
                            >
                              อุปกรณ์หลัก (S/N)
                            </button>
                            <button
                              type="button"
                              onClick={() => setAddonItems(prev => prev.map((row, i) => i === idx ? { ...row, item_type: 'consumable', warranty_years: 0 } : row))}
                              className={`px-2 py-0.5 rounded text-[10px] font-bold border cursor-pointer ${
                                it.item_type === 'consumable'
                                  ? 'bg-amber-500 text-black border-amber-500'
                                  : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-700'
                              }`}
                            >
                              วัสดุ / ค่าแรง
                            </button>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setAddonItems(prev => prev.filter((_, i) => i !== idx))}
                          className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-100 dark:hover:bg-rose-500/20 cursor-pointer shrink-0"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <label className="block text-[9px] text-slate-500 mb-0.5">จำนวน</label>
                          <NumberInput
                            min={1}
                            value={it.qty_required}
                            onChange={(e) => {
                              const val = Math.max(1, parseInt(e.target.value) || 1);
                              setAddonItems(prev => prev.map((row, i) => i === idx ? { ...row, qty_required: val } : row));
                            }}
                            className="w-full rounded-lg px-2 py-1 text-[11px] bg-white dark:bg-slate-900 text-slate-900 dark:text-white border border-slate-300 dark:border-slate-700 font-mono text-center"
                          />
                        </div>
                        <div>
                          <label className="block text-[9px] text-slate-500 mb-0.5">ทุน/หน่วย</label>
                          <NumberInput
                            min={0}
                            value={it.unit_cost}
                            onChange={(e) => {
                              const val = Math.max(0, parseFloat(e.target.value) || 0);
                              setAddonItems(prev => prev.map((row, i) => i === idx ? { ...row, unit_cost: val } : row));
                            }}
                            className="w-full rounded-lg px-2 py-1 text-[11px] bg-white dark:bg-slate-900 text-amber-700 dark:text-amber-300 border border-slate-300 dark:border-slate-700 font-mono"
                          />
                        </div>
                        <div>
                          <label className="block text-[9px] text-slate-500 mb-0.5">ขาย/หน่วย</label>
                          <NumberInput
                            min={0}
                            value={it.unit_price}
                            onChange={(e) => {
                              const val = Math.max(0, parseFloat(e.target.value) || 0);
                              setAddonItems(prev => prev.map((row, i) => i === idx ? { ...row, unit_price: val } : row));
                            }}
                            className="w-full rounded-lg px-2 py-1 text-[11px] bg-white dark:bg-slate-900 text-emerald-700 dark:text-emerald-300 border border-slate-300 dark:border-slate-700 font-mono"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">หมายเหตุการแอดเพิ่ม</label>
                <input
                  type="text"
                  value={addonNote}
                  onChange={(e) => setAddonNote(e.target.value)}
                  placeholder="เช่น ลูกค้าสั่งเพิ่มจุดกระจายสัญญาณ Wi-Fi และเดินสาย LAN เพิ่ม"
                  className="w-full rounded-xl px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-300 dark:border-slate-700"
                />
              </div>

              <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 flex items-center justify-between">
                <span className="font-bold text-amber-900 dark:text-amber-200">
                  ติดป้าย: &quot;แอดเพิ่มโดย {addonAddedBy || '-'}&quot; ({addonItems.length} รายการ)
                </span>
                <span className="font-mono font-extrabold text-sm text-emerald-700 dark:text-emerald-300">
                  รวม +฿{fmt(addonItems.reduce((s, it) => s + it.unit_price * it.qty_required, 0))}
                </span>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setAddonProjectId(null)}
                  className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-white/[0.04] text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700 font-bold cursor-pointer"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={readOnly || (addonItems.length === 0)}
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#FF6B00] to-[#E65A00] hover:from-[#FF8A24] disabled:opacity-40 text-black font-extrabold shadow-lg shadow-[#FF6B00]/25 cursor-pointer flex items-center gap-1.5"
                >
                  <Check className="w-4 h-4" />
                  <span>บันทึกแอดเพิ่ม ({addonItems.length} รายการ)</span>
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* ========================================================================= */}
      {/* BILLING TYPE SELECTION PORTAL MODAL (z-[9999])                            */}
      {/* ========================================================================= */}
      {isBillingTypeModalOpen && createPortal(
        <ModalBackdrop
          className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6 animate-fade-in overscroll-contain"
          onDismiss={() => setIsBillingTypeModalOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-800 shadow-2xl rounded-3xl w-full sm:w-[92vw] max-w-2xl overflow-hidden animate-modal-pop"
          >
            <div className="p-4 sm:p-5 bg-slate-50/90 dark:bg-slate-900/95 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <div className="p-2.5 rounded-2xl bg-[#FF6B00]/15 text-[#E65A00] dark:text-[#FF6B00] border border-[#FF6B00]/30">
                  <Receipt className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white">เลือกประเภทการเปิดบิล</h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">เลือกรูปแบบบิลที่ต้องการสร้างเพื่อเข้าสู่ขั้นตอนที่เหมาะสม</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsBillingTypeModalOpen(false)}
                aria-label="ปิดหน้าต่างเลือกประเภทบิล"
                className="p-2 rounded-xl bg-slate-100 dark:bg-white/[0.06] text-slate-500 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 sm:p-6 grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* 1. Sales */}
              <button
                type="button"
                onClick={() => handleOpenCustomerTypeModal('sales')}
                className="text-left p-4 rounded-2xl bg-sky-50/80 hover:bg-sky-100/80 dark:bg-sky-500/10 dark:hover:bg-sky-500/20 border border-sky-200 dark:border-sky-500/30 transition cursor-pointer group active:scale-[0.98]"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="p-2.5 rounded-xl bg-sky-500/20 text-sky-700 dark:text-sky-300">
                    <ShoppingBag className="w-5 h-5" />
                  </div>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-100 text-sky-800 dark:bg-sky-500/20 dark:text-sky-300">ขาย</span>
                </div>
                <div className="text-sm font-extrabold text-slate-900 dark:text-white">บิลขายสินค้า / งานทั่วไป</div>
                <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-1">
                  ขายอุปกรณ์ฮาร์ดแวร์ คอมพิวเตอร์ ปริ้นเตอร์ และงานติดตั้งทั่วไป
                </p>
              </button>

              {/* 2. Rental */}
              <button
                type="button"
                onClick={() => handleOpenContractBillingModal('rental')}
                className="text-left p-4 rounded-2xl bg-indigo-50/80 hover:bg-indigo-100/80 dark:bg-indigo-500/10 dark:hover:bg-indigo-500/20 border border-indigo-200 dark:border-indigo-500/30 transition cursor-pointer group active:scale-[0.98]"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="p-2.5 rounded-xl bg-indigo-500/20 text-indigo-700 dark:text-indigo-300">
                    <Wifi className="w-5 h-5" />
                  </div>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-800 dark:bg-indigo-500/20 dark:text-indigo-300">เช่าเน็ต / ระบบ / อุปกรณ์</span>
                </div>
                <div className="text-sm font-extrabold text-slate-900 dark:text-white">บิลงานเช่า (Rental)</div>
                <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-1">
                  เช่าอินเทอร์เน็ต เช่าระบบ POS/Cloud และเช่าอุปกรณ์ตามสัญญาที่ใช้งานอยู่
                </p>
              </button>

              {/* 3. MA */}
              <button
                type="button"
                onClick={() => handleOpenContractBillingModal('ma')}
                className="text-left p-4 rounded-2xl bg-emerald-50/80 hover:bg-emerald-100/80 dark:bg-emerald-500/10 dark:hover:bg-emerald-500/20 border border-emerald-200 dark:border-emerald-500/30 transition cursor-pointer group active:scale-[0.98]"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="p-2.5 rounded-xl bg-emerald-500/20 text-emerald-700 dark:text-emerald-300">
                    <FileCheck2 className="w-5 h-5" />
                  </div>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300">ดูแลระบบ MA</span>
                </div>
                <div className="text-sm font-extrabold text-slate-900 dark:text-white">บิลดูแลระบบ (MA)</div>
                <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-1">
                  วางบิลสัญญาดูแลรักษาระบบรายเดือน รายไตรมาส หรือรายปี (PM & Support)
                </p>
              </button>

              {/* 4. Add-on */}
              <button
                type="button"
                onClick={() => handleOpenCustomerTypeModal('addon')}
                className="text-left p-4 rounded-2xl bg-amber-50/80 hover:bg-amber-100/80 dark:bg-amber-500/10 dark:hover:bg-amber-500/20 border border-amber-200 dark:border-amber-500/30 transition cursor-pointer group active:scale-[0.98]"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="p-2.5 rounded-xl bg-amber-500/20 text-amber-700 dark:text-amber-300">
                    <Wrench className="w-5 h-5" />
                  </div>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300">นอกสัญญา / เพิ่มเติม</span>
                </div>
                <div className="text-sm font-extrabold text-slate-900 dark:text-white">บิลค่าใช้จ่ายเพิ่มเติม / นอกสัญญา</div>
                <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-1">
                  งานเดินจุดเพิ่ม อุปกรณ์เสริม หรือบริการนอกขอบเขตสัญญาเดิม
                </p>
              </button>
            </div>
          </div>
        </ModalBackdrop>,
        document.body
      )}

      {/* ========================================================================= */}
      {/* CUSTOMER TYPE SELECTION */}
      <Modal
        open={isCustomerTypeModalOpen}
        onClose={() => setIsCustomerTypeModalOpen(false)}
        title="เปิดบิลให้ใคร?"
        icon={<UserRound aria-hidden="true" className="size-5" />}
      >
        <div className="grid gap-2.5">
          {([
            { type: 'individual', label: 'บุคคลธรรมดา', description: 'ชื่อ-นามสกุล และเบอร์โทร', Icon: UserRound },
            { type: 'organization', label: 'บริษัท / องค์กร', description: 'ชื่อองค์กร ชื่อผู้ติดต่อ และเบอร์โทร', Icon: Building2 },
          ] as const).map(({ type, label, description, Icon }) => (
            <button
              key={type}
              type="button"
              autoFocus={type === 'individual'}
              onClick={() => {
                setCustomerType(type);
                setIsCustomerTypeModalOpen(false);
                setIsCreateModalOpen(true);
              }}
              className="flex min-h-16 w-full cursor-pointer items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-left transition-colors hover:border-orange-400 hover:bg-orange-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-500 dark:border-slate-700 dark:bg-slate-800/70 dark:hover:border-orange-400 dark:hover:bg-orange-500/10"
            >
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300">
                <Icon aria-hidden="true" className="size-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold">{label}</span>
                <span className="block text-xs text-slate-600 dark:text-slate-300">{description}</span>
              </span>
              <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-slate-500 dark:text-slate-400" />
            </button>
          ))}
        </div>
      </Modal>

      {/* RENTAL & MA RECURRING CONTRACT BILLING MODAL (z-[9999])                   */}
      {/* ========================================================================= */}
      {isContractBillingOpen && createPortal(
        <ModalBackdrop
          className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6 animate-fade-in overscroll-contain"
          onDismiss={() => setIsContractBillingOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-800 shadow-2xl rounded-3xl w-full sm:w-[92vw] max-w-4xl max-h-[94dvh] sm:max-h-[82dvh] sm:max-h-[86dvh] flex flex-col overflow-hidden animate-modal-pop"
          >

            <div className="p-4 sm:p-5 bg-slate-50/90 dark:bg-slate-900/95 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 flex-shrink-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className={`p-2.5 rounded-2xl border ${
                  contractBillingMode === 'rental'
                    ? 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border-indigo-500/30'
                    : 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                }`}>
                  {contractBillingMode === 'rental' ? <Server className="w-5 h-5" /> : <FileCheck2 className="w-5 h-5" />}
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white leading-tight">
                    {contractBillingMode === 'rental' ? 'เปิดบิลงานเช่าตามสัญญา (Rental Billing)' : 'เปิดบิลดูแลระบบตามสัญญา (MA Billing)'}
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                    เลขที่เอกสาร: <strong className="text-[#FF6B00]">{contractSalesRef}</strong>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsContractBillingOpen(false)}
                aria-label="ปิดหน้าต่างเปิดบิลตามสัญญา"
                className="p-2 rounded-xl bg-slate-100 dark:bg-white/[0.06] text-slate-500 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitContractBilling} className="flex-1 overflow-y-auto overscroll-contain p-4 sm:p-6 space-y-5">
              {matchingActiveContracts.length === 0 ? (
                <div className="p-8 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 text-center space-y-3">
                  <AlertTriangle className="w-8 h-8 text-amber-500 mx-auto" />
                  <p className="text-sm font-bold text-slate-800 dark:text-slate-200">
                    ไม่พบสัญญา{contractBillingMode === 'rental' ? 'งานเช่า' : 'ดูแลระบบ MA'} ที่สถานะ Active
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    กดปุ่มด้านล่างเพื่อเพิ่มสัญญาใหม่ หรือใช้การเปิดบิลแบบทั่วไป/นอกสัญญา
                  </p>
                  <button
                    type="button"
                    onClick={() => handleOpenContractManager(true, contractBillingMode)}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#FF6B00] hover:bg-[#FF8A24] text-black font-extrabold text-xs cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    <span>+ เพิ่มสัญญา{contractBillingMode === 'rental' ? 'งานเช่า' : ' MA '}ใหม่</span>
                  </button>
                </div>
              ) : (
                <>
                  {/* 1. เลือกลูกค้า & สัญญา Active */}
                  <div className="flex items-center justify-end">
                    <button
                      type="button"
                      onClick={() => handleOpenContractManager(true, contractBillingMode)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-indigo-50 dark:bg-indigo-500/15 hover:bg-indigo-100 dark:hover:bg-indigo-500/25 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-500/30 text-[11px] font-bold cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>+ เพิ่มสัญญาใหม่</span>
                    </button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                        1. เลือกลูกค้า (ที่มีสัญญา Active) *
                      </label>
                      <select
                        value={selectedContractCustomerId}
                        onChange={(e) => {
                          const cid = e.target.value;
                          setSelectedContractCustomerId(cid);
                          const firstCtr = matchingActiveContracts.find(c => c.customer_id === cid) || null;
                          applySelectedContract(firstCtr);
                        }}
                        className="w-full rounded-xl px-3 py-2.5 text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-300 dark:border-slate-700 focus:outline-none focus:border-[#FF6B00]"
                      >
                        {contractCustomers.map(c => (
                          <option key={c.customer_id} value={c.customer_id}>
                            {c.customer_name} {c.customer_phone ? `(${c.customer_phone})` : ''}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                        2. เลือกสัญญาที่ใช้งานอยู่ (Active Contract) *
                      </label>
                      <select
                        value={selectedContractId}
                        onChange={(e) => {
                          const ctr = matchingActiveContracts.find(c => c.id === e.target.value) || null;
                          applySelectedContract(ctr);
                        }}
                        className="w-full rounded-xl px-3 py-2.5 text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-300 dark:border-slate-700 focus:outline-none focus:border-[#FF6B00]"
                      >
                        {customerActiveContracts.map(c => {
                          const subLabel =
                            c.sub_type === 'internet_rental' ? 'เช่าเน็ต' :
                            c.sub_type === 'system_rental' ? 'เช่าระบบ' :
                            c.sub_type === 'equipment_rental' ? 'เช่าอุปกรณ์' :
                            c.sub_type === 'ma_monthly' ? 'MA รายเดือน' :
                            c.sub_type === 'ma_quarterly' ? 'MA รายไตรมาส' : 'MA รายปี';
                          return (
                            <option key={c.id} value={c.id}>
                              [{subLabel}] {c.contract_no} ({c.start_date} ถึง {c.end_date})
                            </option>
                          );
                        })}
                      </select>
                    </div>
                  </div>

                  {/* Contract Summary Strip */}
                  {selectedContract && (
                    <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 flex flex-wrap items-center justify-between gap-2 text-xs">
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono font-extrabold text-[#FF6B00]">{selectedContract.contract_no}</span>
                          <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${BILLING_BADGE_META[getOrderBillingBadgeKey({ billing_type: contractBillingMode, sub_type: selectedContract.sub_type })].cls}`}>
                            {BILLING_BADGE_META[getOrderBillingBadgeKey({ billing_type: contractBillingMode, sub_type: selectedContract.sub_type })].label}
                          </span>
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300">
                            Active ({selectedContract.billing_cycle})
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">
                          {selectedContract.delivery_location || `อ.${selectedContract.district || '-'}`}
                        </div>
                      </div>
                      <div className="text-[11px] font-mono text-slate-600 dark:text-slate-300">
                        อายุสัญญา: {selectedContract.start_date} → {selectedContract.end_date}
                      </div>
                    </div>
                  )}

                  {/* 2. งวดการวางบิล & วันที่ */}
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                        งวดวางบิล (Period) *
                      </label>
                      <input
                        type="text"
                        required
                        value={contractBillingPeriod}
                        onChange={(e) => setContractBillingPeriod(e.target.value)}
                        placeholder="เช่น 2026-11 หรือ Q4/2026"
                        className="w-full rounded-xl px-3 py-2 text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-300 dark:border-slate-700 font-mono focus:outline-none focus:border-[#FF6B00]"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">เริ่มรอบบริการ</label>
                      <input
                        type="date"
                        value={contractPeriodStart}
                        onChange={(e) => setContractPeriodStart(e.target.value)}
                        className="w-full rounded-xl px-2.5 py-2 text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-300 dark:border-slate-700 font-mono focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">สิ้นสุดรอบบริการ</label>
                      <input
                        type="date"
                        value={contractPeriodEnd}
                        onChange={(e) => setContractPeriodEnd(e.target.value)}
                        className="w-full rounded-xl px-2.5 py-2 text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-300 dark:border-slate-700 font-mono focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">วันที่ออกบิล</label>
                      <input
                        type="date"
                        value={contractIssueDate}
                        onChange={(e) => setContractIssueDate(e.target.value)}
                        className="w-full rounded-xl px-2.5 py-2 text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-300 dark:border-slate-700 font-mono focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">วันครบกำหนดชำระ</label>
                      <input
                        type="date"
                        value={contractDueDate}
                        onChange={(e) => setContractDueDate(e.target.value)}
                        className="w-full rounded-xl px-2.5 py-2 text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-300 dark:border-slate-700 font-mono focus:outline-none"
                      />
                    </div>
                  </div>

                  {/* Duplicate Period Guard Warning */}
                  {duplicatePeriodOrder && (
                    <div className="p-3.5 rounded-2xl bg-rose-100 border border-rose-300 text-rose-900 dark:bg-rose-500/15 dark:border-rose-500/40 dark:text-rose-200 flex items-start gap-2.5">
                      <AlertTriangle className="w-5 h-5 text-rose-600 dark:text-rose-400 flex-shrink-0 mt-0.5" />
                      <div className="text-xs space-y-0.5">
                        <p className="font-extrabold">
                          พบการเปิดบิลซ้ำในงวด &quot;{contractBillingPeriod}&quot; ของสัญญา {selectedContract?.contract_no} แล้ว!
                        </p>
                        <p className="text-[11px]">
                          อ้างอิงบิลเดิม: <strong className="font-mono">{duplicatePeriodOrder.sales_ref || duplicatePeriodOrder.bill_no || duplicatePeriodOrder.id}</strong> • สถานะ: {duplicatePeriodOrder.billing_status === 'billed' ? 'วางบิลแล้ว' : 'รอวางบิล'} — กรุณาเปลี่ยนงวดการวางบิลก่อนบันทึก
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Bill Type & Payment Term & Notes */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">ประเภทเอกสาร</label>
                      <select
                        value={contractBillType}
                        onChange={(e) => setContractBillType(e.target.value as BillType)}
                        className="w-full rounded-xl px-3 py-2 text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-300 dark:border-slate-700"
                      >
                        <option value="tax_invoice">ใบกำกับภาษี / ใบแจ้งหนี้</option>
                        <option value="cash_bill_quotation">บิลเงินสด / ใบเสนอราคา</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">เงื่อนไขชำระเงิน</label>
                      <select
                        value={contractPaymentTerm}
                        onChange={(e) => setContractPaymentTerm(e.target.value as PaymentTerm)}
                        className="w-full rounded-xl px-3 py-2 text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-300 dark:border-slate-700"
                      >
                        <option value="credit_30">เครดิต 30 วัน</option>
                        <option value="cash">เงินสด / โอนทันที</option>
                        <option value="project">วางบิลตามงวด</option>
                        <option value="government">งานราชการ</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">หมายเหตุเพิ่มเติม (Prorate / ฯลฯ)</label>
                      <input
                        type="text"
                        value={contractSiteNotes}
                        onChange={(e) => setContractSiteNotes(e.target.value)}
                        placeholder="เช่น คิดค่าบริการเฉลี่ยตามวันเริ่มใช้งานจริง"
                        className="w-full rounded-xl px-3 py-2 text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-300 dark:border-slate-700"
                      />
                    </div>
                  </div>

                  {/* 3. Auto-populated Line Items (Editable + Append Sub-items) */}
                  <div className="space-y-2.5 pt-2 border-t border-slate-200 dark:border-slate-800">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <label className="text-xs font-extrabold text-slate-900 dark:text-white flex items-center gap-1.5">
                        <Package className="w-4 h-4 text-[#FF6B00]" />
                        <span>รายการในสัญญา (ปรับราคา/จำนวนสำหรับ Prorate หรือเพิ่มรายการย่อยได้)</span>
                      </label>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleOpenCatalogModal('contract_order')}
                          className="px-3 py-1.5 rounded-xl bg-[#FF6B00]/15 hover:bg-[#FF6B00]/25 border border-[#FF6B00]/40 text-[#C2410C] dark:text-[#FF6B00] text-[11px] font-bold cursor-pointer flex items-center gap-1"
                        >
                          <Layers className="w-3.5 h-3.5" />
                          <span>เพิ่มจากแคตตาล็อก</span>
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setContractOrderItems(prev => [
                              ...prev,
                              {
                                model_name: 'รายการค่าบริการเพิ่มเติม',
                                item_type: 'service',
                                quantity: 1,
                                unit: 'รายการ',
                                unit_price: 0,
                                unit_cost: 0,
                                warranty_years: 0
                              }
                            ])
                          }
                          className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-white/[0.06] hover:bg-slate-200 dark:hover:bg-white/[0.12] border border-slate-300 dark:border-white/[0.1] text-slate-800 dark:text-white text-[11px] font-bold cursor-pointer flex items-center gap-1"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>เพิ่มรายการย่อย</span>
                        </button>
                      </div>
                    </div>

                    {contractOrderItems.map((it, idx) => (
                      <div key={idx} className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 space-y-2">
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={it.model_name}
                            onChange={(e) => {
                              const val = e.target.value;
                              setContractOrderItems(prev => prev.map((row, i) => i === idx ? { ...row, model_name: val } : row));
                            }}
                            className="flex-1 rounded-lg px-2.5 py-1.5 text-xs font-bold bg-white dark:bg-slate-900 text-slate-900 dark:text-white border border-slate-300 dark:border-slate-700"
                          />
                          <button
                            type="button"
                            onClick={() => setContractOrderItems(prev => prev.filter((_, i) => i !== idx))}
                            className="p-1.5 rounded-lg text-rose-600 dark:text-rose-400 bg-rose-100 dark:bg-rose-500/10 hover:bg-rose-200 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                          <div>
                            <label className="block text-[10px] text-slate-500 dark:text-slate-400 mb-0.5">จำนวน</label>
                            <NumberInput
                              min={0.1}
                              step="0.1"
                              value={it.quantity}
                              onChange={(e) => {
                                const val = Math.max(0.1, parseFloat(e.target.value) || 1);
                                setContractOrderItems(prev => prev.map((row, i) => i === idx ? { ...row, quantity: val } : row));
                              }}
                              className="w-full rounded-lg px-2 py-1.5 text-xs font-mono bg-white dark:bg-slate-900 text-slate-900 dark:text-white border border-slate-300 dark:border-slate-700"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] text-slate-500 dark:text-slate-400 mb-0.5">ต้นทุน/หน่วย</label>
                            <NumberInput
                              min={0}
                              step="0.01"
                              value={it.unit_cost ?? 0}
                              onChange={(e) => {
                                const val = Math.max(0, parseFloat(e.target.value) || 0);
                                setContractOrderItems(prev => prev.map((row, i) => i === idx ? { ...row, unit_cost: val } : row));
                              }}
                              className="w-full rounded-lg px-2 py-1.5 text-xs font-mono bg-white dark:bg-slate-900 text-amber-700 dark:text-amber-300 border border-slate-300 dark:border-slate-700"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] text-slate-500 dark:text-slate-400 mb-0.5">ราคาขาย/หน่วย</label>
                            <NumberInput
                              min={0}
                              step="0.01"
                              value={it.unit_price ?? 0}
                              onChange={(e) => {
                                const val = Math.max(0, parseFloat(e.target.value) || 0);
                                setContractOrderItems(prev => prev.map((row, i) => i === idx ? { ...row, unit_price: val } : row));
                              }}
                              className="w-full rounded-lg px-2 py-1.5 text-xs font-mono bg-white dark:bg-slate-900 text-emerald-700 dark:text-emerald-300 border border-slate-300 dark:border-slate-700"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] text-slate-500 dark:text-slate-400 mb-0.5">รวมรายการ</label>
                            <div className="w-full rounded-lg px-2 py-1.5 text-xs font-mono font-bold bg-slate-100 dark:bg-slate-900/60 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-700">
                              ฿{fmt((it.unit_price || 0) * (it.quantity || 0))}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Summary + Submit */}
                  <div className="p-3.5 rounded-2xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 flex items-center justify-between flex-wrap gap-2">
                    <div className="text-xs text-emerald-900 dark:text-emerald-200">
                      ยอดรวมบิลรอบ <strong>{contractBillingPeriod || '-'}</strong> ({contractOrderItems.length} รายการ)
                    </div>
                    <div className="font-mono font-extrabold text-base text-emerald-800 dark:text-emerald-300">
                      ฿{fmt(contractOrderItems.reduce((s, it) => s + (it.unit_price || 0) * (it.quantity || 0), 0))}
                    </div>
                  </div>
                </>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsContractBillingOpen(false)}
                  className="px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-white/[0.04] text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700 text-xs font-bold cursor-pointer"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={readOnly || (!selectedContract || !!duplicatePeriodOrder || contractOrderItems.length === 0)}
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#FF6B00] to-[#E65A00] hover:from-[#FF8A24] disabled:opacity-40 disabled:cursor-not-allowed text-black text-xs font-extrabold shadow-lg shadow-[#FF6B00]/25 cursor-pointer flex items-center gap-1.5"
                >
                  <Send className="w-4 h-4" />
                  <span>บันทึกเปิดบิล{contractBillingMode === 'rental' ? 'งานเช่า' : 'ดูแลระบบ MA'}</span>
                </button>
              </div>
            </form>
          </div>
        </ModalBackdrop>,
        document.body
      )}

      {/* ========================================================================= */}
      {/* CONTRACT MANAGER & ADD CONTRACT PORTAL MODAL (z-[10000])                  */}
      {/* ========================================================================= */}
      {isContractManagerOpen && createPortal(
        <ModalBackdrop
          className="fixed inset-0 z-[10000] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6 animate-fade-in overscroll-contain"
          onDismiss={() => setIsContractManagerOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-800 shadow-2xl rounded-3xl w-full sm:w-[92vw] max-w-4xl max-h-[94dvh] sm:max-h-[82dvh] sm:max-h-[86dvh] flex flex-col overflow-hidden animate-modal-pop"
          >

            <div className="p-4 sm:p-5 bg-slate-50/90 dark:bg-slate-900/95 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 flex-shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="p-2.5 rounded-2xl bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border border-indigo-500/30">
                  <FileCheck2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white">
                    {showAddContractForm ? 'เพิ่มสัญญาใหม่ (เช่า / ดูแลระบบ MA)' : 'จัดการสัญญาลูกค้า (เช่าเน็ต / เช่าระบบ / เช่าอุปกรณ์ / MA)'}
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    สัญญาที่สถานะ Active จะสามารถเลือกออกบิลรายงวดได้ทันที
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {!showAddContractForm && (
                  <button disabled={readOnly}
                    type="button"
                    onClick={() => handleOpenContractManager(true, 'rental')}
                    className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-[#FF6B00] to-[#E65A00] text-black font-extrabold text-xs cursor-pointer flex items-center gap-1.5 shadow-sm"
                  >
                    <Plus className="w-4 h-4" />
                    <span>+ เพิ่มสัญญาใหม่</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setIsContractManagerOpen(false)}
                  aria-label="ปิดหน้าต่างจัดการสัญญา"
                  className="p-2 rounded-xl bg-slate-100 dark:bg-white/[0.06] text-slate-500 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {showAddContractForm ? (
              <form onSubmit={handleSaveNewContract} className="flex-1 overflow-y-auto overscroll-contain p-4 sm:p-6 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">ประเภทสัญญาหลัก *</label>
                    <select
                      value={ctrType}
                      onChange={(e) => {
                        const nextType = e.target.value as 'rental' | 'ma';
                        setCtrType(nextType);
                        const nextSub: Contract['sub_type'] = nextType === 'ma' ? 'ma_monthly' : 'internet_rental';
                        setCtrSubType(nextSub);
                        setCtrBillingCycle('monthly');
                        setCtrNo(makeContractNo(nextSub));
                      }}
                      className="w-full rounded-xl px-3 py-2 text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-300 dark:border-slate-700"
                    >
                      <option value="rental">สัญญาเช่า (Rental)</option>
                      <option value="ma">สัญญาดูแลระบบ (MA)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">ประเภทย่อย *</label>
                    <select
                      value={ctrSubType}
                      onChange={(e) => {
                        const nextSub = e.target.value as Contract['sub_type'];
                        setCtrSubType(nextSub);
                        setCtrNo(makeContractNo(nextSub));
                        if (nextSub === 'ma_quarterly') setCtrBillingCycle('quarterly');
                        else if (nextSub === 'ma_yearly') setCtrBillingCycle('yearly');
                        else setCtrBillingCycle('monthly');
                      }}
                      className="w-full rounded-xl px-3 py-2 text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-300 dark:border-slate-700"
                    >
                      {ctrType === 'rental' ? (
                        <>
                          <option value="internet_rental">เช่าอินเทอร์เน็ต (เช่าเน็ต)</option>
                          <option value="system_rental">เช่าระบบ (POS / Cloud / Software)</option>
                          <option value="equipment_rental">เช่าอุปกรณ์ (Printer / PC / Network)</option>
                        </>
                      ) : (
                        <>
                          <option value="ma_monthly">ดูแลระบบ MA รายเดือน</option>
                          <option value="ma_quarterly">ดูแลระบบ MA รายไตรมาส</option>
                          <option value="ma_yearly">ดูแลระบบ MA รายปี</option>
                        </>
                      )}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">เลขที่สัญญา *</label>
                    <input
                      type="text"
                      required
                      value={ctrNo}
                      onChange={(e) => setCtrNo(e.target.value)}
                      className="w-full rounded-xl px-3 py-2 text-xs font-mono bg-white dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-300 dark:border-slate-700"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">ชื่อลูกค้า / บริษัท *</label>
                    <input
                      type="text"
                      required
                      value={ctrCustomerName}
                      onChange={(e) => setCtrCustomerName(e.target.value)}
                      placeholder="เช่น บจก. สุราษฎร์..."
                      className="w-full rounded-xl px-3 py-2 text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-300 dark:border-slate-700"
                    />
                  </div>
                  <div>
                    <label htmlFor="sales-contract-phone" className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">เบอร์โทร</label>
                    <PhoneInput
                      id="sales-contract-phone"
                      value={ctrCustomerPhone}
                      onChange={(e) => setCtrCustomerPhone(e.target.value)}
                      className="w-full rounded-xl px-3 py-2 text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-300 dark:border-slate-700"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">อำเภอ / พื้นที่</label>
                    <select
                      value={ctrDistrict}
                      onChange={(e) => setCtrDistrict(e.target.value)}
                      className="w-full rounded-xl px-3 py-2 text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-300 dark:border-slate-700"
                    >
                      {DISTRICT_OPTIONS.map(d => (
                        <option key={d.district} value={d.district}>{d.district}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">ที่อยู่ / สถานที่ติดตั้ง</label>
                    <input
                      type="text"
                      value={ctrLocation}
                      onChange={(e) => setCtrLocation(e.target.value)}
                      placeholder="เช่น 88/9 ถ.ตลาดใหม่ อ.เมือง..."
                      className="w-full rounded-xl px-3 py-2 text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-300 dark:border-slate-700"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">วันเริ่มสัญญา *</label>
                    <input
                      type="date"
                      required
                      value={ctrStartDate}
                      onChange={(e) => setCtrStartDate(e.target.value)}
                      className="w-full rounded-xl px-3 py-2 text-xs font-mono bg-white dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-300 dark:border-slate-700"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">วันสิ้นสุดสัญญา *</label>
                    <input
                      type="date"
                      required
                      value={ctrEndDate}
                      onChange={(e) => setCtrEndDate(e.target.value)}
                      className="w-full rounded-xl px-3 py-2 text-xs font-mono bg-white dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-300 dark:border-slate-700"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">หมายเหตุสัญญา</label>
                  <input
                    type="text"
                    value={ctrNotes}
                    onChange={(e) => setCtrNotes(e.target.value)}
                    placeholder="รายละเอียดเงื่อนไข SLA / รอบเข้าตรวจ PM"
                    className="w-full rounded-xl px-3 py-2 text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-300 dark:border-slate-700"
                  />
                </div>

                {/* Contract Line Items */}
                <div className="space-y-2.5 pt-2 border-t border-slate-200 dark:border-slate-800">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <label className="text-xs font-extrabold text-slate-900 dark:text-white">
                      รายการในสัญญา (จะถูกดึงอัตโนมัติเมื่อเปิดบิลรายงวด) *
                    </label>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleOpenCatalogModal('contract_template')}
                        className="px-3 py-1.5 rounded-xl bg-[#FF6B00]/15 hover:bg-[#FF6B00]/25 border border-[#FF6B00]/40 text-[#C2410C] dark:text-[#FF6B00] text-[11px] font-bold cursor-pointer flex items-center gap-1"
                      >
                        <Layers className="w-3.5 h-3.5" />
                        <span>เลือกจากแคตตาล็อก</span>
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setCtrItems(prev => [
                            ...prev,
                            {
                              model_name: ctrType === 'rental' ? 'ค่าบริการเช่า...' : 'ค่าบริการดูแลระบบ MA...',
                              item_type: 'service',
                              quantity: 1,
                              unit: 'รายการ',
                              unit_price: 0,
                              unit_cost: 0
                            }
                          ])
                        }
                        className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-white/[0.06] border border-slate-300 dark:border-white/[0.1] text-slate-800 dark:text-white text-[11px] font-bold cursor-pointer flex items-center gap-1"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>เพิ่มรายการเอง</span>
                      </button>
                    </div>
                  </div>

                  {ctrItems.length === 0 ? (
                    <div className="p-5 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 text-center text-xs text-slate-500">
                      ยังไม่มีรายการในสัญญา — กด &quot;เลือกจากแคตตาล็อก&quot; หรือ &quot;เพิ่มรายการเอง&quot;
                    </div>
                  ) : (
                    ctrItems.map((it, idx) => (
                      <div key={idx} className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 space-y-2">
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            required
                            value={it.model_name}
                            onChange={(e) => {
                              const val = e.target.value;
                              setCtrItems(prev => prev.map((row, i) => i === idx ? { ...row, model_name: val } : row));
                            }}
                            className="flex-1 rounded-lg px-2.5 py-1.5 text-xs font-bold bg-white dark:bg-slate-900 text-slate-900 dark:text-white border border-slate-300 dark:border-slate-700"
                          />
                          <button
                            type="button"
                            onClick={() => setCtrItems(prev => prev.filter((_, i) => i !== idx))}
                            className="p-1.5 rounded-lg text-rose-600 dark:text-rose-400 bg-rose-100 dark:bg-rose-500/10 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                          <div>
                            <label className="block text-[10px] text-slate-500 mb-0.5">จำนวน</label>
                            <NumberInput
                              min={1}
                              value={it.quantity}
                              onChange={(e) => {
                                const val = Math.max(1, parseInt(e.target.value) || 1);
                                setCtrItems(prev => prev.map((row, i) => i === idx ? { ...row, quantity: val } : row));
                              }}
                              className="w-full rounded-lg px-2 py-1.5 text-xs font-mono bg-white dark:bg-slate-900 text-slate-900 dark:text-white border border-slate-300 dark:border-slate-700"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] text-slate-500 mb-0.5">ต้นทุน/งวด</label>
                            <NumberInput
                              min={0}
                              value={it.unit_cost ?? 0}
                              onChange={(e) => {
                                const val = Math.max(0, parseFloat(e.target.value) || 0);
                                setCtrItems(prev => prev.map((row, i) => i === idx ? { ...row, unit_cost: val } : row));
                              }}
                              className="w-full rounded-lg px-2 py-1.5 text-xs font-mono bg-white dark:bg-slate-900 text-amber-700 dark:text-amber-300 border border-slate-300 dark:border-slate-700"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] text-slate-500 mb-0.5">ค่าบริการ/งวด</label>
                            <NumberInput
                              min={0}
                              value={it.unit_price ?? 0}
                              onChange={(e) => {
                                const val = Math.max(0, parseFloat(e.target.value) || 0);
                                setCtrItems(prev => prev.map((row, i) => i === idx ? { ...row, unit_price: val } : row));
                              }}
                              className="w-full rounded-lg px-2 py-1.5 text-xs font-mono bg-white dark:bg-slate-900 text-emerald-700 dark:text-emerald-300 border border-slate-300 dark:border-slate-700"
                            />
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => setShowAddContractForm(false)}
                    className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-white/[0.06] text-slate-700 dark:text-slate-300 text-xs font-bold cursor-pointer"
                  >
                    กลับหน้ารายการสัญญา
                  </button>
                  <button
                    type="submit"
                    disabled={readOnly || (ctrItems.length === 0)}
                    className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#FF6B00] to-[#E65A00] disabled:opacity-40 text-black font-extrabold text-xs cursor-pointer flex items-center gap-1.5 shadow-md"
                  >
                    <Check className="w-4 h-4" />
                    <span>บันทึกสัญญาใหม่</span>
                  </button>
                </div>
              </form>
            ) : (
              <div className="flex-1 overflow-y-auto overscroll-contain p-4 sm:p-6 space-y-3">
                {contracts.length === 0 ? (
                  <div className="p-8 text-center text-xs text-slate-500 border border-dashed border-slate-300 dark:border-slate-700 rounded-2xl">
                    ยังไม่มีสัญญาในระบบ — กด &quot;+ เพิ่มสัญญาใหม่&quot; ด้านบน
                  </div>
                ) : (
                  contracts.map(ctr => {
                    const badge = BILLING_BADGE_META[getOrderBillingBadgeKey({ billing_type: ctr.contract_type, sub_type: ctr.sub_type })];
                    const totalVal = (ctr.items || []).reduce((s, i) => s + i.unit_price * i.quantity, 0);
                    return (
                      <div key={ctr.id} className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono font-extrabold text-xs text-[#FF6B00]">{ctr.contract_no}</span>
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${badge.cls}`}>{badge.label}</span>
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              ctr.status === 'active'
                                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300'
                                : 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300'
                            }`}>
                              {ctr.status} ({ctr.billing_cycle})
                            </span>
                          </div>
                          <div className="text-sm font-bold text-slate-900 dark:text-white">{ctr.customer_name}</div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400">
                            {ctr.start_date} → {ctr.end_date} • ฿{fmt(totalVal)}/งวด ({ctr.items.length} รายการ)
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {ctr.status === 'active' ? (
                            <>
                              <button disabled={readOnly}
                                type="button"
                                onClick={() => {
                                  setIsContractManagerOpen(false);
                                  setContractBillingMode(ctr.contract_type);
                                  const prefix = ctr.contract_type === 'rental' ? 'RN' : 'MA';
                                  setContractSalesRef(`${prefix}-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`);
                                  applySelectedContract(ctr);
                                  setIsContractBillingOpen(true);
                                }}
                                className="px-3 py-1.5 rounded-xl bg-[#FF6B00] hover:bg-[#FF8A24] text-black font-extrabold text-xs cursor-pointer"
                              >
                                เปิดบิลจากสัญญานี้
                              </button>
                              <button disabled={readOnly}
                                type="button"
                                onClick={() => updateContractStatus(ctr.id, 'cancelled')}
                                className="px-2.5 py-1.5 rounded-xl bg-rose-100 dark:bg-rose-500/15 text-rose-700 dark:text-rose-300 text-[11px] font-bold cursor-pointer"
                              >
                                ปิดสัญญา
                              </button>
                            </>
                          ) : (
                            <button disabled={readOnly}
                              type="button"
                              onClick={() => updateContractStatus(ctr.id, 'active')}
                              className="px-3 py-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white border-emerald-700 text-xs font-bold cursor-pointer"
                            >
                              เปิดใช้งานอีกครั้ง
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>
        </ModalBackdrop>,
        document.body
      )}

      <OrderFormPrintModal
        isOpen={!!printTarget}
        onClose={() => setPrintTarget(null)}
        order={printTarget?.order}
        project={printTarget?.project}
        initialBatchNo={printTarget?.initialBatchNo ?? null}
      />
    </div>
  );
};
