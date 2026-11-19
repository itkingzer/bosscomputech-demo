import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { Calculator, PackagePlus, CheckCircle, Info, MapPin } from 'lucide-react';

export const AccountingView: React.FC = () => {
  const { orders, cutStock } = useApp();
  const [billInputs, setBillInputs] = useState<Record<string, string>>({});
  const [toast, setToast] = useState('');

  const pendingOrders = orders.filter(o => o.order_status === 'pending_accounting');

  const handleCutStock = (orderId: string, modelName: string, quantity: number) => {
    const defaultBill = `INV-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`;
    const billNo = (billInputs[orderId] || defaultBill).trim();

    cutStock(orderId, billNo, modelName, quantity);

    setToast(`ตัดสต๊อกบิล ${billNo} สำเร็จ! สร้างคิวงาน ${quantity} เครื่องให้ช่างเตรียมแล้ว`);
    setTimeout(() => setToast(''), 3500);
  };

  return (
    <div className="space-y-6">
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 p-4 rounded-2xl liquid-glass border border-[#FF6B00] text-white text-xs flex items-center gap-2 shadow-2xl">
          <CheckCircle className="w-4 h-4 text-[#FF6B00]" />
          <span>{toast}</span>
        </div>
      )}

      <div className="liquid-glass rounded-3xl p-6 sm:p-7 shadow-2xl border border-white/[0.08]">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-6 pb-4 border-b border-white/[0.08]">
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <div className="p-2 rounded-xl bg-amber-500/15 text-amber-400 border border-amber-500/30">
                <Calculator className="w-5 h-5" />
              </div>
              <span>คิวตรวจสอบบิล & ตัดสต๊อกสินค้า (Accounting & Inventory)</span>
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              ตรวจสอบรายการสั่งขาย ออกเลขที่บิล/ใบเบิก และอนุมัติส่งให้ช่างเตรียมสินค้า
            </p>
          </div>
          <div className="text-xs bg-amber-500/15 border border-amber-500/30 text-amber-300 px-3.5 py-2 rounded-2xl flex items-center gap-1.5">
            <Info className="w-4 h-4 flex-shrink-0" />
            <span>เมื่อกดตัดสต๊อก ระบบจะสร้างรายการสินค้ารายชิ้น (Pending Prep) อัตโนมัติ</span>
          </div>
        </div>

        {pendingOrders.length === 0 ? (
          <div className="text-center py-12 text-slate-500 border border-dashed border-white/[0.1] rounded-2xl">
            <CheckCircle className="w-10 h-10 mx-auto mb-2 text-emerald-400 opacity-60" />
            <p className="text-sm font-medium text-slate-200">ไม่มีออเดอร์ค้างตัดสต๊อก</p>
            <p className="text-xs text-slate-500 mt-0.5">ฝ่ายขายยังไม่มีรายการใหม่ หรือเคลียร์ครบทุกบิลแล้ว</p>
          </div>
        ) : (
          <div className="space-y-4">
            {pendingOrders.map((order) => {
              const plannedModel = order._planned_model || 'BossComputech Core-i7 Workstation Pro';
              const plannedQty = order._planned_quantity || 1;
              const suggestedBillNo = billInputs[order.id] !== undefined 
                ? billInputs[order.id] 
                : `INV-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`;

              return (
                <div
                  key={order.id}
                  className="p-5 rounded-2xl liquid-glass-card flex flex-col md:flex-row md:items-center justify-between gap-4"
                >
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] bg-[#FF6B00] text-black font-extrabold font-mono shadow-md shadow-[#FF6B00]/25">
                        {order.sales_ref || 'SO'}
                      </span>
                      <span className="text-sm font-bold text-white">{order.customer_name}</span>
                    </div>
                    <p className="text-xs text-slate-300 flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5 text-slate-500" />
                      <span>{order.delivery_location}</span>
                    </p>
                    <div className="text-xs text-[#FF6B00] font-medium">
                      รุ่นสินค้า: {plannedModel} (จำนวนเบิก: {plannedQty} เครื่อง)
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="flex flex-col">
                      <label className="text-[10px] text-slate-400 mb-0.5">เลขที่บิล / ใบเบิกบัญชี:</label>
                      <input
                        type="text"
                        value={suggestedBillNo}
                        onChange={(e) => setBillInputs({ ...billInputs, [order.id]: e.target.value })}
                        className="liquid-glass-input rounded-xl px-3 py-1.5 text-xs text-white font-mono focus:outline-none"
                      />
                    </div>
                    <button
                      onClick={() => handleCutStock(order.id, plannedModel, plannedQty)}
                      className="mt-4 px-4 py-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 active:scale-95 text-black font-extrabold rounded-xl text-xs transition-all duration-200 cursor-pointer flex items-center gap-1.5 shadow-lg shadow-amber-500/25 border border-white/20"
                    >
                      <PackagePlus className="w-4 h-4" />
                      <span>ตัดสต๊อก & ส่งให้ช่างเตรียม</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
