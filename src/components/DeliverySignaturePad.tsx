import { useRef, useState, type PointerEvent } from 'react';

interface DeliverySignaturePadProps {
  onChange: (signature: string | null) => void;
  disabled: boolean;
}

export function DeliverySignaturePad({ onChange, disabled }: DeliverySignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pointer = useRef<number | null>(null);
  const hasInk = useRef(false);
  const [hasSignature, setHasSignature] = useState(false);

  function draw(event: PointerEvent<HTMLCanvasElement>, start: boolean) {
    const canvas = event.currentTarget;
    const context = canvas.getContext('2d');
    if (!context) return;

    const bounds = canvas.getBoundingClientRect();
    const x = (event.clientX - bounds.left) * canvas.width / bounds.width;
    const y = (event.clientY - bounds.top) * canvas.height / bounds.height;
    if (start) {
      context.beginPath();
      context.moveTo(x, y);
    } else {
      context.lineTo(x, y);
      context.lineWidth = 4;
      context.lineCap = 'round';
      context.lineJoin = 'round';
      context.strokeStyle = '#0f172a';
      context.stroke();
      context.beginPath();
      context.moveTo(x, y);
      hasInk.current = true;
    }
  }

  function finish(event: PointerEvent<HTMLCanvasElement>) {
    if (pointer.current !== event.pointerId) return;
    pointer.current = null;
    if (hasInk.current) {
      setHasSignature(true);
      onChange(event.currentTarget.toDataURL('image/png'));
    }
  }

  function clear() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
    pointer.current = null;
    hasInk.current = false;
    setHasSignature(false);
    onChange(null);
  }

  return (
    <fieldset className="space-y-2" disabled={disabled}>
      <legend className="text-sm font-bold">ลายเซ็นผู้รับสินค้า (ถ้ามี)</legend>
      <p className="text-xs text-slate-600 dark:text-slate-300">
        ให้ลูกค้าเซ็นในช่องนี้เมื่อส่งมอบแบบไร้กระดาษ
      </p>
      <canvas
        ref={canvasRef}
        width={800}
        height={240}
        aria-label="พื้นที่เซ็นชื่อผู้รับสินค้า"
        className="block aspect-[10/3] min-h-28 w-full touch-none rounded-xl border border-slate-300 bg-white dark:border-slate-600"
        onPointerDown={event => {
          if (disabled || event.button !== 0 || pointer.current !== null) return;
          pointer.current = event.pointerId;
          event.currentTarget.setPointerCapture(event.pointerId);
          draw(event, true);
        }}
        onPointerMove={event => {
          if (!disabled && pointer.current === event.pointerId) draw(event, false);
        }}
        onPointerUp={finish}
        onPointerCancel={finish}
        onLostPointerCapture={finish}
      />
      <button
        type="button"
        onClick={clear}
        disabled={!hasSignature}
        className="min-h-11 rounded-xl border border-slate-300 px-3 text-xs font-bold dark:border-slate-600 disabled:opacity-50"
      >
        ล้างลายเซ็น
      </button>
    </fieldset>
  );
}
