import React from 'react';
import { RepairTicket } from '../types';

export const COMPANY_NAME = 'บริษัท บอส คอมพิวเทค แอนด์ เซอร์วิส จำกัด';
export const COMPANY_ADDRESS = '289/2 ถนนตลาดใหม่ ตำบลตลาด อำเภอเมือง จังหวัดสุราษฎร์ธานี 84000';
export const COMPANY_PHONE = 'โทรศัพท์ 077-286999 แฟกซ์';
export const RECEIPT_DISCLAIMER =
  'ทางร้านจะรับผิดชอบสินค้าเฉพาะที่ระบุตามเอกสารนี้เท่านั้น เมื่อไม่มีการติดต่อกลับจากลูกค้าหลังได้รับจากทางร้านนานเกิน 45 วัน หรือเบอร์โทรศัพท์ที่ให้ไว้ไม่สามารถติดต่อได้นานเกิน 60 วัน ทางร้านจะไม่รับผิดชอบใดๆทั้งสิ้น';

export const formatReceiptDateTime = (iso?: string | null): string => {
  if (!iso) return '-';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '-';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${dd}/${mm}/${yyyy} ${hh}:${mi}`;
};

export const inferDeviceCategory = (model?: string | null): string => {
  const m = (model || '').toLowerCase();
  if (!m) return 'อุปกรณ์อิเล็กทรอนิกส์';
  if (/(notebook|laptop|โน้ตบุ๊ก|โน้ตบุค|macbook|vivobook|ideapad|thinkpad|inspiron|pavilion)/.test(m)) return 'Notebook';
  if (/(printer|ปริ้น|ปริ๊น|พิมพ์|laserjet|deskjet|epson l|canon pixma|brother)/.test(m)) return 'Printer';
  if (/(monitor|จอ|led |lcd )/.test(m)) return 'Monitor';
  if (/(all in one|aio|desktop|pc |คอม|ตั้งโต๊ะ)/.test(m)) return 'PC / Desktop';
  if (/(tablet|ipad|แท็บเล็ต)/.test(m)) return 'Tablet';
  if (/(iphone|samsung|oppo|vivo|xiaomi|โทรศัพท์|มือถือ)/.test(m)) return 'Smartphone';
  return 'อุปกรณ์อิเล็กทรอนิกส์';
};

export const formatReceiptDate = (iso?: string | null): string => {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()}`;
};

interface RepairReceiptPrintDocumentProps {
  ticket: RepairTicket;
}

export const RepairReceiptPrintDocument: React.FC<RepairReceiptPrintDocumentProps> = ({ ticket }) => {
  const cell = 'border border-black px-1.5 py-0.5 align-top leading-tight text-black';
  const label = 'font-bold whitespace-nowrap text-black';
  const value = 'font-normal text-black';

  const category = inferDeviceCategory(ticket.device_model);
  const staffName = ticket.received_by || 'ระบบ';
  const acc =
    ticket.included_accessories ||
    [...(ticket.accessories || []), ticket.accessories_other || ''].filter(Boolean).join(', ');

  const otherAcc = [
    ticket.accessories_other || '',
    ticket.service_type === 'rma_claim' ? `ส่งเคลม: ${ticket.rma_supplier || 'ศูนย์'}` : '',
    ticket.service_type === 'rma_claim' && ticket.rma_tracking_no ? `เลขใบส่งเคลม: ${ticket.rma_tracking_no}` : '',
    ticket.replacement_sn ? `S/N ใหม่: ${ticket.replacement_sn}` : ''
  ].filter(Boolean).join(' • ');

  const notes = [
    ticket.repair_detail || '',
    ticket.parts_used ? `อะไหล่: ${ticket.parts_used}` : '',
    ticket.repair_status ? `สถานะ: ${ticket.repair_status}` : ''
  ].filter(Boolean).join(' • ');

  const dueDate = formatReceiptDate(ticket.finished_at) || formatReceiptDate(ticket.rma_returned_date);

  return (
    <div
      id="repair-receipt-print"
      className="bg-white text-black rounded-lg p-3 sm:p-4 text-[10px] leading-tight print:p-0 print:text-[10px] print:leading-tight"
    >
      {/* Official Company Header */}
      <div className="flex items-start justify-between gap-4 pb-1.5 mb-1.5 border-b-2 border-black">
        <div className="min-w-0">
          <div className="font-extrabold text-[12px] sm:text-[13px] leading-tight">{COMPANY_NAME}</div>
          <div className="mt-0.5">{COMPANY_ADDRESS}</div>
          <div className="mt-0.5">{COMPANY_PHONE}</div>
        </div>
        <div className="text-right flex-shrink-0">
          <div className="font-extrabold text-base sm:text-lg tracking-wide">ใบรับซ่อมสินค้า</div>
          <div className="mt-0.5 text-[10px]">
            <span className={label}>วันที่ </span>
            <span>{formatReceiptDateTime(ticket.received_at || ticket.created_at)}</span>
          </div>
          <div className="text-[10px]">
            <span className={label}>ออกโดย </span>
            <span>{staffName}</span>
          </div>
        </div>
      </div>

      {/* Structured Bordered Grid */}
      <table className="w-full border-collapse border border-black text-black bg-white">
        <tbody>
          {/* Row 1 */}
          <tr>
            <td className={cell + ' w-[34%]'}>
              <span className={label}>เลขที่ใบรับซ่อม : </span>
              <span className={value + ' font-mono font-bold'}>{ticket.ticket_no || '-'}</span>
            </td>
            <td className={cell + ' w-[36%]'}>
              <span className={label}>วันที่รับซ่อม : </span>
              <span className={value}>{formatReceiptDateTime(ticket.received_at || ticket.created_at)}</span>
            </td>
            <td className={cell + ' w-[30%]'}>
              <span className={label}>เบอร์ติดต่อ : </span>
              <span className={value}>{ticket.customer_phone || '-'}</span>
            </td>
          </tr>
          {/* Row 2 */}
          <tr>
            <td className={cell}>
              <span className={label}>ชื่อลูกค้า : </span>
              <span className={value + ' font-semibold'}>{ticket.customer_name || '-'}</span>
            </td>
            <td className={cell} colSpan={2}>
              <span className={label}>รุ่น : </span>
              <span className={value}>{ticket.device_model || '-'}</span>
            </td>
          </tr>
          {/* Row 2.5 */}
          <tr>
            <td className={cell} colSpan={2}>
              <span className={label}>
                {ticket.received_channel === 'onsite_pickup'
                  ? 'รับเครื่องโดย (Onsite) : '
                  : ticket.received_channel === 'onsite_service_sheet'
                  ? 'รับเครื่องโดย (Service Sheet) : '
                  : 'ผู้รับเครื่อง : '}
              </span>
              <span className={value + ' font-semibold'}>{ticket.received_by || staffName}</span>
            </td>
            <td className={cell}>
              <span className={label}>ช่างผู้ซ่อม : </span>
              <span className={value + ' font-semibold'}>{ticket.repaired_by || '-'}</span>
            </td>
          </tr>
          {/* Row 3 */}
          <tr>
            <td className={cell} colSpan={3}>
              <span className={label}>ที่อยู่ : </span>
              <span className={value}>{ticket.delivery_location || ticket.district || '-'}</span>
            </td>
          </tr>
          {/* Row 4 */}
          <tr>
            <td className={cell}>
              <span className={label}>สินค้า : </span>
              <span className={value}>{category}</span>
            </td>
            <td className={cell} colSpan={2}>
              <span className={label}>Serial No. : </span>
              <span className={value + ' font-mono'}>{ticket.walkin_sn || '-'}</span>
            </td>
          </tr>
          {/* Row 5 */}
          <tr>
            <td className={cell} colSpan={3}>
              <span className={label}>สภาพเครื่อง : </span>
              <span className={value}>
                {ticket.accessories && ticket.accessories.length > 0
                  ? 'มีอุปกรณ์ติดมาด้วย (ตามรายการด้านล่าง)'
                  : 'ตัวเครื่องเปล่า / ตามที่ตรวจรับ'}
              </span>
            </td>
          </tr>
          {/* Row 6 */}
          <tr>
            <td className={cell} colSpan={3}>
              <span className={label}>อาการเสีย : </span>
              <span className={value + ' font-semibold'}>{ticket.fault_symptom || '-'}</span>
            </td>
          </tr>
          {/* Row 7 */}
          <tr>
            <td className={cell} colSpan={3}>
              <span className={label}>อุปกรณ์ที่นำมาด้วย : </span>
              <span className={value}>{acc || 'ตัวเครื่องเปล่า (ไม่มีอุปกรณ์ติดมา)'}</span>
            </td>
          </tr>
          {/* Row 8 */}
          <tr>
            <td className={cell} colSpan={3}>
              <span className={label}>อุปกรณ์อื่นๆ : </span>
              <span className={value}>{otherAcc || '-'}</span>
            </td>
          </tr>
          {/* Row 9 */}
          <tr>
            <td className={cell} colSpan={3}>
              <span className={label}>บันทึกเพิ่มเติม : </span>
              <span className={value}>{notes || '-'}</span>
            </td>
          </tr>
          {/* Row 10 */}
          <tr>
            <td className={cell + ' w-1/2'}>
              <span className={label}>ประเมินค่าซ่อม : </span>
              <span className={value + ' font-bold'}>
                {ticket.repair_cost != null ? ticket.repair_cost.toLocaleString('th-TH') : '-'}
              </span>
              <span className={value}> บาท</span>
            </td>
            <td className={cell + ' w-1/2'} colSpan={2}>
              <span className={label}>วันนัดรับสินค้า : </span>
              <span className={value}>{dueDate || '........./........./.........'}</span>
            </td>
          </tr>
        </tbody>
      </table>

      {/* Terms & Signature Footer */}
      <div className="mt-1 text-[10px] leading-tight">
        <span className="font-bold">หมายเหตุ : </span>
        <span>{RECEIPT_DISCLAIMER}</span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-8 text-[10px] leading-tight">
        <div className="text-center">
          <div className="mb-1">ลงชื่อ ........................................ ผู้ส่งซ่อม</div>
          <div>วันที่ ........./........./.........</div>
        </div>
        <div className="text-center">
          <div className="mb-1">ลงชื่อ ........................................ พนักงาน</div>
          <div>วันที่ ........./........./.........</div>
        </div>
      </div>
    </div>
  );
};
