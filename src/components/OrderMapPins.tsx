import { useId, useState } from 'react';
import { MapPin } from 'lucide-react';
import { useApp } from '../context/AppContext';
import type { OnsiteMapPin, Order } from '../types';
import { directionsFromGoogleMapsPin, googleMapsDirectionsUrl, googleMapsPinUrl, googleMapsSearchUrl } from '../utils/googleMaps';

const controlClass = 'inline-flex min-h-11 items-center gap-1 rounded-lg border border-slate-300 px-3 text-xs font-semibold text-slate-800 hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50 dark:border-slate-600 dark:text-slate-100 dark:hover:bg-slate-800';

export function OrderMapLinkField({ address, value, onChange }: {
  address: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const id = useId();
  const invalid = Boolean(value.trim() && !googleMapsPinUrl(value));
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-xs font-semibold">ลิงก์หมุด Google Maps (ไม่บังคับ)</label>
      <input id={id} type="text" inputMode="url" autoComplete="off" maxLength={2048}
        placeholder="https://maps.app.goo.gl/…"
        value={value} onChange={event => onChange(event.target.value)}
        aria-invalid={invalid} aria-describedby={invalid ? id + '-error' : undefined}
        className="w-full min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-base dark:border-slate-600 dark:bg-slate-800" />
      {invalid && <p id={id + '-error'} role="alert" className="text-xs text-red-600 dark:text-red-300">กรุณาวางลิงก์แชร์หมุดจาก Google Maps</p>}
      {address.trim() && <a href={googleMapsSearchUrl(address)} target="_blank" rel="noopener noreferrer" className={controlClass}>
        ค้นหาที่อยู่ใน Google Maps
      </a>}
      <p className="text-xs text-slate-600 dark:text-slate-300">เลือกจุดหมายใน Google Maps แล้วคัดลอกลิงก์กลับมาวางที่นี่</p>
    </div>
  );
}

export function OrderMapLinkEditor({ order }: { order: Order }) {
  const { updateOrderMap } = useApp();
  const [draft, setDraft] = useState<string>();
  const [status, setStatus] = useState('');
  const [saving, setSaving] = useState(false);
  const value = draft ?? order.delivery_map_url ?? '';
  const url = googleMapsPinUrl(value);
  const savedUrl = googleMapsPinUrl(order.delivery_map_url ?? '');

  const save = async () => {
    if (saving || (value.trim() && !url)) return;
    setSaving(true);
    const saved = await updateOrderMap(order, { delivery_map_url: url }).catch(() => false);
    if (saved) setDraft(undefined);
    setStatus(saved ? 'บันทึกหมุดสำหรับเดินทางแล้ว' : 'บันทึกหมุดไม่สำเร็จ กรุณาเปิดใบงานใหม่แล้วลองอีกครั้ง');
    setSaving(false);
  };
  return (
    <details className="space-y-2">
      <summary className={controlClass + ' cursor-pointer list-none [&::-webkit-details-marker]:hidden'}>
        <MapPin size={16} aria-hidden="true" />
        {savedUrl ? 'แก้ไขหมุด Google Maps' : 'แนบหมุด Google Maps (ไม่บังคับ)'}
      </summary>
      {savedUrl && <a href={savedUrl} target="_blank" rel="noopener noreferrer" className={controlClass}>เปิดหมุดที่บันทึกไว้</a>}
      <div onKeyDown={event => {
        if (event.key === 'Enter' && event.target instanceof HTMLInputElement) event.preventDefault();
      }}>
      <OrderMapLinkField address={[order.delivery_location, order.district, order.province_custom].filter(Boolean).join(' ')} value={value}
        onChange={next => { setDraft(next); setStatus(''); }} />
      </div>
      <button type="button" className={controlClass} onClick={() => void save()}
        disabled={saving || (value.trim() !== '' && !url) || url === (order.delivery_map_url ?? null)}>
        {saving ? 'กำลังบันทึก…' : 'บันทึกลิงก์หมุด'}
      </button>
      {status && <p role="status" className="text-xs">{status}</p>}
    </details>
  );
}

export function OnsiteOrderMap({ order, canCapture }: { order: Order; canCapture: boolean }) {
  const { updateOrderMap } = useApp();
  const [pendingPin, setPendingPin] = useState<OnsiteMapPin | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [routing, setRouting] = useState(false);
  const [routeUnavailable, setRouteUnavailable] = useState(false);
  const destination = googleMapsPinUrl(order.delivery_map_url ?? '');
  const directions = destination ? directionsFromGoogleMapsPin(destination) : null;
  const saved = order.onsite_map_pin;
  const pinUrl = (pin: OnsiteMapPin) => googleMapsDirectionsUrl(`${pin.latitude},${pin.longitude}`);

  const startNavigation = async () => {
    if (!destination || routing) return;
    setRouting(true);
    setRouteUnavailable(false);
    try {
      const response = await fetch('/api/google-maps-directions', { method: 'POST', body: destination });
      if (!response.ok) throw new Error('Destination unavailable');
      const result: { directions: string } = await response.json();
      window.location.assign(result.directions);
    } catch {
      setRouteUnavailable(true);
    } finally {
      setRouting(false);
    }
  };

  const capture = () => {
    if (!canCapture || busy) return;
    setError('');
    setPendingPin(null);
    if (!navigator.geolocation) {
      setError('เบราว์เซอร์นี้อ่าน GPS ไม่ได้ ใช้ที่อยู่ในใบงานได้ตามปกติ');
      return;
    }
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      ({ coords, timestamp }) => {
        setPendingPin({ latitude: coords.latitude, longitude: coords.longitude, accuracy: coords.accuracy, captured_at: new Date(timestamp).toISOString() });
        setBusy(false);
      },
      ({ code }) => {
        setError(code === 1 ? 'กรุณาอนุญาตใช้ตำแหน่งในเบราว์เซอร์แล้วลองใหม่' : 'อ่านตำแหน่งไม่ได้ กรุณาลองใหม่ในจุดที่ GPS รับสัญญาณได้');
        setBusy(false);
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 },
    );
  };

  const save = async () => {
    if (!canCapture || !pendingPin || busy) return;
    setBusy(true);
    setError('');
    const updated = await updateOrderMap(order, { onsite_map_pin: pendingPin }).catch(() => false);
    if (updated) setPendingPin(null);
    else setError('บันทึกหมุดไม่สำเร็จ กรุณาตรวจการเชื่อมต่อแล้วลองอีกครั้ง');
    setBusy(false);
  };

  if (!destination && !saved && !canCapture) return null;
  return (
    <section aria-label="หมุดหน้างาน" className="space-y-2 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
      <div className="flex flex-wrap gap-2">
        {directions ? (
          <a href={directions} target="_blank" rel="noopener noreferrer" className={controlClass}><MapPin size={16} aria-hidden="true" />นำทางจากตำแหน่งปัจจุบัน</a>
        ) : destination && (
          <button type="button" className={controlClass} disabled={routing} onClick={() => void startNavigation()}>
            <MapPin size={16} aria-hidden="true" />{routing ? 'กำลังอ่านหมุดปลายทาง…' : 'นำทางจากตำแหน่งปัจจุบัน'}
          </button>
        )}
        {saved && <a href={pinUrl(saved)} target="_blank" rel="noopener noreferrer" className={controlClass}><MapPin size={16} aria-hidden="true" />เปิดเส้นทางจาก GPS ช่าง</a>}
        {canCapture && <button type="button" className={controlClass} disabled={busy} onClick={capture}>
          <MapPin size={16} aria-hidden="true" />{busy && !pendingPin ? 'กำลังอ่าน GPS…' : 'ปักหมุดจากตำแหน่งปัจจุบัน'}
        </button>}
      </div>
      {routeUnavailable && destination && !directions && <div className="space-y-1">
        <p role="status" className="text-xs">เปิดเส้นทางจากลิงก์นี้โดยตรงไม่ได้ เปิดหมุดแล้วกด «เส้นทาง» ใน Google Maps ได้ครับ</p>
        <a href={destination} target="_blank" rel="noopener noreferrer" className={controlClass}>เปิดหมุดที่หน้าร้านแนบ</a>
      </div>}
      {canCapture && pendingPin && (
        <div className="space-y-2">
          <p role="status" className="text-xs">ความแม่นยำประมาณ ±{Math.ceil(pendingPin.accuracy)} เมตร {pendingPin.accuracy > 100 && 'ควรลองใหม่หากตำแหน่งคลาดเคลื่อน'}</p>
          <div className="flex flex-wrap gap-2">
            <a href={pinUrl(pendingPin)} target="_blank" rel="noopener noreferrer" className={controlClass}>ตรวจหมุดใน Google Maps</a>
            <button type="button" className={controlClass} disabled={busy} onClick={() => void save()}>{busy ? 'กำลังบันทึก…' : saved ? 'ยืนยันแทนที่หมุด GPS' : 'ยืนยันบันทึกหมุด GPS'}</button>
            <button type="button" className={controlClass} disabled={busy} onClick={() => setPendingPin(null)}>ยกเลิก</button>
          </div>
        </div>
      )}
      {error && <p role="alert" className="text-xs text-red-600 dark:text-red-300">{error}</p>}
    </section>
  );
}
