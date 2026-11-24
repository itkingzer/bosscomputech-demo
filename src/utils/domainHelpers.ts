import type { Item, Order, Project, StockPO, UserRole } from '../types';

export const LOW_MARGIN_THRESHOLD = 10;

/**
 * ตรวจสอบว่าเป็นสายสัญญาณ สายไฟ สายเน็ต สาย Fiber ตู้ Rack หรือวัสดุสิ้นเปลืองที่ไม่ต้องส่งให้ช่างเตรียมเทส/ติดโลโก้
 * (รับเข้าคลังพร้อมใช้ได้ทันที และตัดสต๊อกส่งตรง Onsite ได้เลย)
 */
export const isNonPrepCableOrConsumable = (modelName?: string | null): boolean => {
  const name = (modelName || '').trim();
  if (!name) return false;
  return /สายไฟ|สายเน็ต|สายแลน|สาย\s*lan|สายสัญญาณ|สาย\s*fiber|fiber\s*optic|สาย\s*hdmi|สาย\s*vga|สาย\s*usb|cat5|cat6|cat7|utp|ftp|patch\s*cord|power\s*cord|ท่อร้อยสาย|ปลั๊กพ่วง|รางปลั๊ก|ตู้\s*rack|rack|pdu|rj45|หัว\s*lan|หัว\s*rj|รางสาย/i.test(
    name
  );
};

/**
 * ตรวจสอบว่าเป็นรายการ "ค่าบริการ / ค่าแรง" ที่ไม่ต้องตัดสต๊อกและไม่ต้องเข้าคลังสินค้า
 * เช่น ค่าบริการเดินสาย LAN ท่อร้อยสาย และจัดตู้ Rack Server (ต่อจุด), ค่าติดตั้ง, ค่า MA
 */
export const isServiceItem = (
  modelName?: string | null,
  itemType?: 'hardware' | 'service' | string | null,
  products?: { name: string; category?: string; item_type?: string }[]
): boolean => {
  if (itemType === 'service') return true;
  const name = (modelName || '').trim();
  if (!name) return false;
  if (/ค่าบริการ|ค่าแรง/.test(name)) return true;
  if (products && products.length > 0) {
    const key = name.toLowerCase();
    const matched = products.find((p) => (p.name || '').trim().toLowerCase() === key);
    if (matched && (matched.category === 'service' || matched.item_type === 'service')) {
      return true;
    }
  }
  return false;
};

export const fmtCurrency = (n: number): string =>
  n.toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

/**
 * แปลงเบอร์โทรศัพท์เป็นลิงก์ tel: เพื่อกดโทรออกผ่านแอปโทรศัพท์ได้ทันที
 */
export const toTelHref = (phone?: string | null): string | null => {
  const cleaned = (phone || '').replace(/[^0-9+]/g, '');
  return cleaned.length >= 6 ? `tel:${cleaned}` : null;
};

export const DISTRICT_OPTIONS: string[] = [
  'เมืองสุราษฎร์ธานี',
  'พุนพิน',
  'ท่าฉาง',
  'ไชยา',
  'ท่าชนะ',
  'คีรีรัฐนิคม',
  'บ้านตาขุน',
  'พนม',
  'บ้านนาเดิม',
  'บ้านนาสาร',
  'เวียงสระ',
  'พระแสง',
  'กาญจนดิษฐ์',
  'ดอนสัก',
  'ขนอม',
  'ต่างจังหวัด / งานเหมาพิเศษ',
];

export const ACCESSORY_PRESETS: string[] = [
  'Adapter / สายชาร์จ',
  'สาย Power AC',
  'เมาส์ / คีย์บอร์ด',
  'กระเป๋าใส่เครื่อง',
  'สาย HDMI / VGA',
  'กล่องบรรจุภัณฑ์เดิม',
];

export const ROLE_OPTIONS: { value: UserRole; label: string }[] = [
  { value: 'sales', label: 'ฝ่ายขาย (Sales)' },
  { value: 'accounting', label: 'จัดซื้อ & สต๊อก' },
  { value: 'finance', label: 'บัญชี (Accounting)' },
  { value: 'prep', label: 'ช่างเตรียมสินค้า' },
  { value: 'frontdesk', label: 'แอดมินหน้าร้าน' },
  { value: 'onsite', label: 'ช่าง Onsite' },
  { value: 'repair', label: 'ช่างซ่อมในร้าน' },
  { value: 'hr', label: 'บุคคล (HR)' },
  { value: 'admin', label: 'Super Admin' },
];

export const getRoleDisplayName = (role: string): string => {
  const found = ROLE_OPTIONS.find((r) => r.value === role);
  if (found) return found.label;
  if (role === 'manager') return 'ผู้บริหาร (Manager)';
  return role.toUpperCase();
};

export interface OrderFinancials {
  revenue: number;
  itemsCost: number;
  extraCost: number;
  totalCost: number;
  gp: number;
  marginPct: number;
}

export const computeOrderFinancials = (order: Order): OrderFinancials => {
  const list = order.items_list || [];
  const revenue = list.reduce((sum, it) => sum + (it.unit_price || 0) * (it.quantity || 0), 0);
  const itemsCost = list.reduce((sum, it) => sum + (it.unit_cost || 0) * (it.quantity || 0), 0);
  const extraCost = Math.max(0, order.extra_cost || 0);
  const totalCost = itemsCost + extraCost;
  const gp = revenue - totalCost;
  const marginPct = revenue > 0 ? (gp / revenue) * 100 : 0;
  return { revenue, itemsCost, extraCost, totalCost, gp, marginPct };
};

export interface ProjectFinancials {
  baseTotal: number;
  addonTotal: number;
  revenue: number;
  itemCost: number;
  linkedPoCost: number;
  totalCost: number;
  gp: number;
  marginPct: number;
}

export const computeProjectFinancials = (
  project: Project,
  stockPOs: StockPO[] = []
): ProjectFinancials => {
  const prjItems = project.items || [];
  let baseTotal = 0;
  let addonTotal = 0;
  let itemCost = 0;
  for (const it of prjItems) {
    const lineRev = (it.unit_price || 0) * (it.qty_required || 0);
    const lineCost = (it.unit_cost || 0) * (it.qty_required || 0);
    if (it.is_addon) addonTotal += lineRev;
    else baseTotal += lineRev;
    itemCost += lineCost;
  }
  const linkedPoCost = stockPOs
    .filter((p) => p.project_id === project.id && p.status !== 'cancelled')
    .reduce((sum, p) => sum + (p.unit_cost || 0) * (p.qty || 0), 0);
  const revenue = baseTotal + addonTotal;
  const totalCost = Math.max(itemCost, linkedPoCost);
  const gp = revenue - totalCost;
  const marginPct = revenue > 0 ? (gp / revenue) * 100 : 0;
  return { baseTotal, addonTotal, revenue, itemCost, linkedPoCost, totalCost, gp, marginPct };
};

/** Generate a valid RFC4122 v4 UUID suitable for PostgreSQL UUID columns. */
export const newUuid = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

/** Case-insensitive S/N duplicate check across items (excluding optional itemId). */
export const isSerialDuplicate = (
  items: Item[],
  serialNumber: string,
  excludeItemId?: string
): boolean => {
  const sn = serialNumber.trim().toLowerCase();
  if (!sn) return false;
  return items.some(
    (i) => i.id !== excludeItemId && (i.serial_number || '').trim().toLowerCase() === sn
  );
};
