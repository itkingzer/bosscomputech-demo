import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { HelpCircle, X, Printer } from 'lucide-react';

interface PrintGuideButtonProps {
  docType: 'repair_receipt' | 'order_form';
}

export const PrintGuideButton: React.FC<PrintGuideButtonProps> = ({ docType }) => {
  const [open, setOpen] = useState(false);

  const isRepair = docType === 'repair_receipt';

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="px-2.5 py-1.5 rounded-xl text-xs font-bold border transition cursor-pointer flex items-center gap-1.5 whitespace-nowrap bg-amber-50 text-amber-900 border-amber-300 hover:bg-amber-100 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/40 dark:hover:bg-amber-500/25"
        title="คำแนะนำการตั้งค่าพิมพ์กระดาษพิมพ์เข็มใน Chrome / Edge"
      >
        <HelpCircle className="w-4 h-4 shrink-0" />
        <span>วิธีตั้งค่าพิมพ์</span>
      </button>

      {open &&
        createPortal(
          <div
            className="no-print fixed inset-0 z-[10010] bg-black/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5 animate-fade-in"
            onClick={() => setOpen(false)}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-lg rounded-2xl bg-white dark:bg-slate-900 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-700 shadow-2xl overflow-hidden"
            >
              <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/80">
                <div className="flex items-center gap-2">
                  <Printer className="w-4 h-4 text-[#FF6B00]" />
                  <h4 className="text-sm font-extrabold">
                    คำแนะนำการพิมพ์ (Chrome / Edge · กระดาษพิมพ์เข็ม)
                  </h4>
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="ปิดคำแนะนำการพิมพ์"
                  className="p-1.5 rounded-lg bg-slate-200/70 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-4 space-y-3 text-xs leading-relaxed max-h-[75vh] overflow-y-auto">
                <div className="rounded-xl p-3 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 space-y-1.5">
                  <div className="font-extrabold text-amber-900 dark:text-amber-200">
                    1. ตั้งค่าในหน้าต่าง Print ของ Chrome / Edge (กด More settings)
                  </div>
                  <ul className="list-disc pl-4 space-y-1 text-slate-700 dark:text-slate-200">
                    <li>
                      <b>Destination:</b> เลือกเครื่องพิมพ์เข็ม (เช่น Epson LQ-310)
                    </li>
                    <li>
                      <b>Layout (การวางแนว):</b>{' '}
                      {isRepair ? (
                        <>เลือก <b>Landscape (แนวนอน)</b></>
                      ) : (
                        <>เลือก <b>Portrait (แนวตั้ง)</b></>
                      )}
                    </li>
                    <li>
                      <b>Paper size (ขนาดกระดาษ):</b>{' '}
                      {isRepair ? (
                        <>
                          เลือก <b>A5</b> หรือ <b>9x5.5</b> (Half Letter)
                        </>
                      ) : (
                        <>
                          เลือก <b>9x11</b> / <b>Letter</b> หรือ <b>A4</b>
                        </>
                      )}
                    </li>
                    <li>
                      <b>Margins (ระยะขอบ):</b> เลือก <b>Default</b> หรือ <b>None</b>{' '}
                      (ระบบเว้นขอบรูหนามเตยซ้าย-ขวา 8mm ไว้ให้แล้ว)
                    </li>
                    <li>
                      <b>Scale (มาตราส่วน):</b> <b>Default (100%)</b> (ถ้าล้นขอบล่างเล็กน้อยปรับเป็น 95%)
                    </li>
                    <li>
                      <b>Options:</b>{' '}
                      <span className="text-rose-600 dark:text-rose-400 font-bold">
                        เอาติ๊กถูก Headers and footers ออก
                      </span>{' '}
                      เพื่อไม่ให้วันที่/ลิงก์เว็บติดหัวท้ายกระดาษ
                    </li>
                  </ul>
                </div>

                <div className="rounded-xl p-3 bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] space-y-1.5">
                  <div className="font-extrabold text-slate-900 dark:text-white">
                    2. ถ้าไม่มีขนาด {isRepair ? '9×5.5"' : '9×11"'} ใน Windows (ตั้งครั้งเดียวใช้ได้ตลอด)
                  </div>
                  <ol className="list-decimal pl-4 space-y-1 text-slate-600 dark:text-slate-300">
                    <li>เปิด <b>Control Panel → Devices and Printers</b></li>
                    <li>คลิกเครื่องพิมพ์เข็ม → เลือก <b>Print server properties</b> → แท็บ <b>Forms</b></li>
                    <li>
                      ติ๊ก <b>Create a new form</b> ตั้งชื่อ{' '}
                      {isRepair ? (
                        <>
                          <code className="font-mono font-bold">9x5.5</code> ขนาด{' '}
                          <b>Width: 22.86 cm / Height: 13.97 cm</b>
                        </>
                      ) : (
                        <>
                          <code className="font-mono font-bold">9x11</code> ขนาด{' '}
                          <b>Width: 22.86 cm / Height: 27.94 cm</b>
                        </>
                      )}{' '}
                      แล้วกด <b>Save Form</b>
                    </li>
                  </ol>
                </div>
              </div>

              <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-800 flex justify-end">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="px-4 py-2 rounded-xl bg-[#FF6B00] hover:bg-[#FF8A24] text-black font-extrabold text-xs cursor-pointer"
                >
                  เข้าใจแล้ว
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
};
