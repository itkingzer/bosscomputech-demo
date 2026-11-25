import { PhoneInput, normalizePhone } from './ui/FormInputs';
import React, { useEffect, useMemo, useState } from 'react';
import { Wrench, Printer, ScanLine, CheckCircle2 } from 'lucide-react';
import { useApp } from '../context/AppContext';
import {
  IntakeChannel,
  ReceivedChannel,
  RepairTicket,
  formatDateDMY,
  getRouteByDistrict
} from '../types';
import {
  Modal,
  modalInputClass,
  modalLabelClass,
  modalPrimaryBtnClass,
  modalSecondaryBtnClass
} from './ui/Modal';
import { BarcodeScannerModal } from './BarcodeScannerModal';
import { RepairReceiptPrintModal } from './RepairReceiptPrintModal';
import { EvidencePhotoUploader } from './EvidencePhotoUploader';
import { lookupPurchaseBySn } from '../utils/snLookup';

const DISTRICT_OPTIONS = [
  { district: 'พุนพิน', zone: 'สาย 1 (โซนเหนือ)' },
  { district: 'ท่าฉาง', zone: 'สาย 1 (โซนเหนือ)' },
  { district: 'ไชยา', zone: 'สาย 1 (โซนเหนือ)' },
  { district: 'ท่าชนะ', zone: 'สาย 1 (โซนเหนือ)' },
  { district: 'คีรีรัฐนิคม', zone: 'สาย 2 (โซนตะวันตก)' },
  { district: 'บ้านตาขุน', zone: 'สาย 2 (โซนตะวันตก)' },
  { district: 'พนม', zone: 'สาย 2 (โซนตะวันตก)' },
  { district: 'บ้านนาเดิม', zone: 'สาย 3 (โซนใต้)' },
  { district: 'บ้านนาสาร', zone: 'สาย 3 (โซนใต้)' },
  { district: 'เวียงสระ', zone: 'สาย 3 (โซนใต้)' },
  { district: 'พระแสง', zone: 'สาย 3 (โซนใต้)' },
  { district: 'กาญจนดิษฐ์', zone: 'สาย 4 (โซนตะวันออก)' },
  { district: 'ดอนสัก', zone: 'สาย 4 (โซนตะวันออก)' },
  { district: 'ขนอม', zone: 'สาย 4 (โซนตะวันออก)' },
  { district: 'เมืองสุราษฎร์ธานี', zone: 'สาย 5 (ในเมือง / รอบเมือง)' },
  { district: 'ต่างจังหวัด / งานเหมาพิเศษ', zone: 'สาย 6 (ต่างจังหวัด / ชั่วคราว)' }
];

const ACCESSORY_PRESETS = [
  'Adapter / หม้อแปลง',
  'สาย Power',
  'สายชาร์จ',
  'สายสัญญาณ (LAN/HDMI/USB)',
  'กระเป๋า / กล่อง',
  'ตัวเครื่องเปล่า (ไม่มีอุปกรณ์ติดมา)'
];

export interface RepairIntakeInitialValues {
  customer_name?: string;
  customer_phone?: string;
  district?: string;
  delivery_location?: string;
}

export interface RepairIntakeModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  intakeChannel?: IntakeChannel;
  receivedChannel?: ReceivedChannel;
  initialValues?: RepairIntakeInitialValues | null;
  onToast?: (msg: string) => void;
}

export const RepairIntakeModal: React.FC<RepairIntakeModalProps> = ({
  open,
  onClose,
  title = 'รับเครื่องซ่อมหน้าร้าน',
  subtitle = 'Repair Intake · สร้างใบรับซ่อมเข้าคิวช่างในร้าน',
  intakeChannel = 'front_desk_walkin',
  receivedChannel = 'front_desk',
  initialValues = null,
  onToast
}) => {
  const { currentUser, items, orders, repairTickets, createRepairTicket } = useApp();

  const [intakeScannerOpen, setIntakeScannerOpen] = useState(false);
  const [inName, setInName] = useState('');
  const [inPhone, setInPhone] = useState('');
  const [inDevice, setInDevice] = useState('');
  const [inSn, setInSn] = useState('');
  const [inSymptom, setInSymptom] = useState('');
  const [inAccessories, setInAccessories] = useState<string[]>(['Adapter / หม้อแปลง']);
  const [inAccessoriesOther, setInAccessoriesOther] = useState('');
  const [inDistrict, setInDistrict] = useState('เมืองสุราษฎร์ธานี');
  const [inLocation, setInLocation] = useState('');
  const [inMatchedItemId, setInMatchedItemId] = useState<string | null>(null);
  const [inAutoFilledSn, setInAutoFilledSn] = useState<string | null>(null);
  const [lastIntakeTicket, setLastIntakeTicket] = useState<RepairTicket | null>(null);
  const [printModalTicket, setPrintModalTicket] = useState<RepairTicket | null>(null);
  const [photos, setPhotos] = useState<string[]>([]);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const isOnsiteServiceSheet = receivedChannel === 'onsite_service_sheet';

  useEffect(() => {
    if (!open) return;
    if (initialValues) {
      if (initialValues.customer_name) setInName(initialValues.customer_name);
      if (initialValues.customer_phone) setInPhone(normalizePhone(initialValues.customer_phone));
      if (initialValues.district && DISTRICT_OPTIONS.some((d) => d.district === initialValues.district)) {
        setInDistrict(initialValues.district);
      }
      setInLocation(initialValues.delivery_location || '');
    } else {
      setInLocation('');
    }
  }, [open, initialValues]);

  const inSnLookup = useMemo(
    () => lookupPurchaseBySn(inSn, items, orders, repairTickets),
    [inSn, items, orders, repairTickets]
  );

  const handleInSnChange = (val: string) => {
    setInSn(val);
    const res = lookupPurchaseBySn(val, items, orders, repairTickets);
    if (res.found) {
      if (res.customerName) setInName(res.customerName);
      if (res.customerPhone) setInPhone(normalizePhone(res.customerPhone));
      if (res.deviceModel) setInDevice(res.deviceModel);
      if (res.district && DISTRICT_OPTIONS.some((d) => d.district === res.district)) {
        setInDistrict(res.district);
      }
      setInMatchedItemId(res.itemId);
      setInAutoFilledSn(val.trim());
    } else if (inAutoFilledSn && val.trim() !== inAutoFilledSn) {
      setInMatchedItemId(null);
      setInAutoFilledSn(null);
    }
  };

  const clearInAutoFill = () => {
    setInName('');
    setInPhone('');
    setInDevice('');
    setInMatchedItemId(null);
    setInAutoFilledSn(null);
  };

  const resetIntake = () => {
    setInName('');
    setInPhone('');
    setInDevice('');
    setInSn('');
    setInSymptom('');
    setInAccessories(['Adapter / หม้อแปลง']);
    setInAccessoriesOther('');
    setInDistrict('เมืองสุราษฎร์ธานี');
    setInLocation('');
    setInMatchedItemId(null);
    setInAutoFilledSn(null);
    setPhotos([]);
    setSaveError('');
  };

  const toggleAccessory = (acc: string) => {
    if (acc === 'ตัวเครื่องเปล่า (ไม่มีอุปกรณ์ติดมา)') {
      setInAccessories((prev) => (prev.includes(acc) ? [] : [acc]));
      return;
    }
    setInAccessories((prev) => {
      const cleaned = prev.filter((a) => a !== 'ตัวเครื่องเปล่า (ไม่มีอุปกรณ์ติดมา)');
      return cleaned.includes(acc) ? cleaned.filter((a) => a !== acc) : [...cleaned, acc];
    });
  };

  const submitIntake = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving || uploadingPhotos) return;
    if (!inName.trim() || !inSymptom.trim()) {
      onToast?.('กรุณากรอกชื่อลูกค้าและอาการเสีย');
      return;
    }
    setSaving(true);
    setSaveError('');
    try {
      const created = await createRepairTicket({
        item_id: inMatchedItemId,
        walkin_sn: inSn.trim(),
        customer_name: inName.trim(),
        customer_phone: inPhone.trim() || null,
        intake_channel: intakeChannel,
        device_model: inDevice.trim() || null,
        accessories: inAccessories,
        accessories_other: inAccessoriesOther.trim() || null,
        fault_symptom: inSymptom.trim(),
        repair_detail: null,
        parts_used: null,
        repair_outcome: null,
        district: inDistrict,
        route_code: getRouteByDistrict(inDistrict),
        delivery_location: inLocation.trim(),
        job_category: 'repair_pickup',
        assigned_techs: [],
        assigned_onsite_tech: null,
        finished_at: null,
        received_by: currentUser?.name || 'ระบบ',
        received_channel: receivedChannel,
        service_type: 'in_house_repair',
        repair_status: 'pending_check',
        ...(isOnsiteServiceSheet && photos.length ? { photo_urls: photos } : {})
        });
        setLastIntakeTicket(created);
        onClose();
        resetIntake();
        onToast?.('สร้างใบรับซ่อมสำเร็จ ส่งเข้าคิวช่างซ่อมในร้านแล้ว');
    } catch {
      setSaveError('บันทึกใบรับซ่อมไม่สำเร็จ กรุณาลองอีกครั้ง');
    } finally {
      setSaving(false);
    }
  };

  const closeIntake = () => {
    if (saving || uploadingPhotos) return;
    if (isOnsiteServiceSheet) resetIntake();
    onClose();
  };

  return (
    <>
      <Modal
        open={open}
        onClose={closeIntake}
        title={title}
        subtitle={subtitle}
        icon={<Wrench className="w-5 h-5" />}
        maxWidthClass="max-w-2xl"
        accentClass="border-[#FF6B00]/40"
        footer={
          <div className="flex gap-2">
            <button type="button" onClick={closeIntake} disabled={saving || uploadingPhotos} className={modalSecondaryBtnClass}>
              ยกเลิก
            </button>
            <button type="submit" form="shared-repair-intake-form" disabled={saving || uploadingPhotos} className={modalPrimaryBtnClass}>
              <Printer className="w-4 h-4" />
              {saving ? 'กำลังบันทึก…' : 'บันทึก & พิมพ์ใบรับซ่อม'}
            </button>
          </div>
        }
      >
        <form id="shared-repair-intake-form" onSubmit={submitIntake} className="space-y-3.5">
          {isOnsiteServiceSheet && (
            <EvidencePhotoUploader
              value={photos}
              onChange={setPhotos}
              onUploadingChange={setUploadingPhotos}
              editable={!saving}
              folder="onsite"
              label="รูปอุปกรณ์ที่รับกลับมาซ่อม"
              helperText="ถ่ายสภาพเครื่อง ตำหนิ หรืออุปกรณ์ที่รับมาด้วย แนบได้สูงสุด 3 รูป"
            />
          )}
          {/* S/N Smart Search & Auto-Fill */}
          <div className="rounded-2xl p-3.5 border border-slate-200 dark:border-white/[0.1] bg-slate-50 dark:bg-white/[0.03] space-y-2">
            <div className="flex items-center justify-between gap-2">
              <label className={modalLabelClass + ' mb-0'}>
                ค้นหาด้วย Serial Number (S/N) เพื่อดึงข้อมูลอัตโนมัติ
              </label>
              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                หรือกรอกข้อมูลเองด้านล่าง
              </span>
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={inSn}
                onChange={(e) => handleInSnChange(e.target.value)}
                placeholder="สแกนหรือพิมพ์ S/N เช่น BC-2026-001 (ถ้าซื้อจากร้านระบบจะกรอกให้เอง)"
                className={modalInputClass + ' font-mono'}
              />
              <button
                type="button"
                onClick={() => setIntakeScannerOpen(true)}
                className="shrink-0 px-3 rounded-xl bg-[#FF6B00]/15 hover:bg-[#FF6B00]/25 text-[#FF6B00] border border-[#FF6B00]/30 transition-colors active:scale-[0.97] cursor-pointer"
                aria-label="สแกนบาร์โค้ด S/N"
              >
                <ScanLine className="w-5 h-5" />
              </button>
            </div>

            {inSnLookup.found ? (
              <div className="rounded-xl p-2.5 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="text-emerald-800 dark:text-emerald-200 space-y-0.5">
                  <div className="font-bold flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <span>พบข้อมูลในระบบ — กรอกชื่อลูกค้าและรุ่นเครื่องให้อัตโนมัติแล้ว</span>
                  </div>
                  <div className="text-[11px] opacity-90 flex flex-wrap gap-x-3">
                    {(inSnLookup.billNo || inSnLookup.salesRef) && (
                      <span className="font-mono">
                        เอกสาร: {inSnLookup.billNo || inSnLookup.salesRef}
                      </span>
                    )}
                    <span>
                      ประกัน:{' '}
                      <strong>
                        {inSnLookup.warranty.state === 'active'
                          ? `อยู่ในประกัน (${inSnLookup.warranty.durationLabel}, หมด ${formatDateDMY(inSnLookup.warranty.expireDate)})`
                          : inSnLookup.warranty.state === 'expired'
                            ? `หมดประกันแล้ว (${formatDateDMY(inSnLookup.warranty.expireDate)})`
                            : inSnLookup.warranty.state === 'waiting'
                              ? `รอแปะวอย (${inSnLookup.warranty.durationLabel})`
                              : 'ไม่มีข้อมูลประกัน'}
                      </strong>
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={clearInAutoFill}
                  className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-white dark:bg-white/10 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-white/15 hover:bg-slate-100 dark:hover:bg-white/20 transition cursor-pointer"
                >
                  ล้างเพื่อกรอกเอง
                </button>
              </div>
            ) : inSn.trim().length >= 3 ? (
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                ไม่พบ S/N "{inSn.trim()}" ในประวัติการขาย — สามารถกรอกข้อมูลลูกค้าและรุ่นเครื่องเองด้านล่างได้เลย
              </p>
            ) : null}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={modalLabelClass}>
                ชื่อลูกค้า <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={inName}
                onChange={(e) => setInName(e.target.value)}
                placeholder="เช่น คุณสมชาย ใจดี"
                className={modalInputClass}
                required
              />
            </div>
            <div>
              <label htmlFor="repair-intake-phone" className={modalLabelClass}>เบอร์โทรศัพท์</label>
              <PhoneInput
                id="repair-intake-phone"
                value={inPhone}
                onChange={(e) => setInPhone(e.target.value)}
                className={modalInputClass}
              />
            </div>
          </div>

          <div>
            <label className={modalLabelClass}>รุ่น / ประเภทเครื่อง</label>
            <input
              type="text"
              value={inDevice}
              onChange={(e) => setInDevice(e.target.value)}
              placeholder="เช่น Lenovo ThinkPad T14"
              className={modalInputClass}
            />
          </div>

          <div>
            <label className={modalLabelClass}>
              อาการเสีย / ปัญหา <span className="text-rose-500">*</span>
            </label>
            <textarea
              value={inSymptom}
              onChange={(e) => setInSymptom(e.target.value)}
              rows={3}
              placeholder="อธิบายอาการเสียที่ลูกค้าแจ้ง"
              className={modalInputClass}
              required
            />
          </div>

          <div>
            <label className={modalLabelClass}>อุปกรณ์ที่ติดมาด้วย</label>
            <div className="flex flex-wrap gap-2">
              {ACCESSORY_PRESETS.map((acc) => {
                const active = inAccessories.includes(acc);
                return (
                  <button
                    key={acc}
                    type="button"
                    onClick={() => toggleAccessory(acc)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors active:scale-[0.97] ${active
                      ? 'bg-[#FF6B00]/10 border-[#FF6B00]/50 text-[#FF6B00]'
                      : 'bg-white dark:bg-white/[0.03] border-slate-200 dark:border-white/[0.08] text-slate-600 dark:text-slate-300'
                      }`}
                  >
                    {acc}
                  </button>
                );
              })}
            </div>
            <input
              type="text"
              value={inAccessoriesOther}
              onChange={(e) => setInAccessoriesOther(e.target.value)}
              placeholder="อุปกรณ์อื่นๆ เพิ่มเติม (ถ้ามี)"
              className={`${modalInputClass} mt-2`}
            />
          </div>

          <div>
            <label className={modalLabelClass}>อำเภอ / เขตพื้นที่</label>
            <select
              value={inDistrict}
              onChange={(e) => setInDistrict(e.target.value)}
              className={modalInputClass}
            >
              {DISTRICT_OPTIONS.map((opt) => (
                <option key={opt.district} value={opt.district}>
                  {opt.district} — {opt.zone}
                </option>
              ))}
            </select>
          </div>
          {saveError && <p role="alert" className="text-sm text-rose-600 dark:text-rose-300">{saveError}</p>}
        </form>
      </Modal>

      {/* Intake Receipt Success Modal */}
      <Modal
        open={!!lastIntakeTicket}
        onClose={() => setLastIntakeTicket(null)}
        title="สร้างใบรับซ่อมสำเร็จ"
        subtitle="พิมพ์ใบรับซ่อมสินค้า (ครึ่ง A4) ให้ลูกค้า"
        icon={<CheckCircle2 className="w-5 h-5" />}
        maxWidthClass="max-w-lg"
        accentClass="border-emerald-500/40"
        footer={
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setLastIntakeTicket(null)}
              className={modalSecondaryBtnClass}
            >
              ปิด
            </button>
            <button
              type="button"
              onClick={() => {
                if (lastIntakeTicket) {
                  setPrintModalTicket(lastIntakeTicket);
                }
              }}
              className={modalPrimaryBtnClass}
            >
              <Printer className="w-4 h-4" />
              พิมพ์ใบรับซ่อม
            </button>
          </div>
        }
      >
        {lastIntakeTicket && (
          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2 rounded-xl bg-emerald-500/10 border border-emerald-500/30 p-3 text-emerald-700 dark:text-emerald-300">
              <CheckCircle2 className="w-5 h-5 shrink-0" />
              <span className="text-xs font-semibold">ส่งเข้าคิวช่างซ่อมในร้านเรียบร้อยแล้ว</span>
            </div>
            <div className="rounded-xl border border-slate-200 dark:border-white/[0.08] p-3 space-y-1.5">
              <div className="flex justify-between">
                <span className="text-slate-500 dark:text-slate-400">ลูกค้า</span>
                <b className="text-slate-900 dark:text-white">{lastIntakeTicket.customer_name}</b>
              </div>
              {lastIntakeTicket.customer_phone && (
                <div className="flex justify-between">
                  <span className="text-slate-500 dark:text-slate-400">โทร</span>
                  <b className="text-slate-900 dark:text-white">{lastIntakeTicket.customer_phone}</b>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-slate-500 dark:text-slate-400">เครื่อง</span>
                <b className="text-slate-900 dark:text-white">{lastIntakeTicket.device_model || '-'}</b>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 dark:text-slate-400">S/N</span>
                <b className="text-slate-900 dark:text-white">{lastIntakeTicket.walkin_sn || '-'}</b>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 dark:text-slate-400">ผู้รับเครื่อง</span>
                <b className="text-slate-900 dark:text-white">{lastIntakeTicket.received_by}</b>
              </div>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">{lastIntakeTicket.fault_symptom}</p>
          </div>
        )}
      </Modal>

      {/* Barcode scanner for intake S/N */}
      <BarcodeScannerModal
        open={intakeScannerOpen}
        onClose={() => setIntakeScannerOpen(false)}
        onScan={(code) => {
          handleInSnChange(code);
          setIntakeScannerOpen(false);
        }}
        title="สแกน S/N เครื่อง"
        hint="ส่องบาร์โค้ดที่ตัวเครื่องเพื่อกรอก Serial Number อัตโนมัติ"
      />

      {/* Repair Receipt Print Preview Modal */}
      <RepairReceiptPrintModal
        isOpen={!!printModalTicket}
        onClose={() => setPrintModalTicket(null)}
        ticket={printModalTicket}
      />
    </>
  );
};

