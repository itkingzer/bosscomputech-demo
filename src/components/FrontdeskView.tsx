import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { 
  UserCheck, TicketPlus, FileSpreadsheet, Send, Wrench, 
  Download, Printer, CheckCircle, PlusCircle, AlertCircle, Clock, XCircle,
  MapPin, Navigation, Truck, Package, RotateCcw
} from 'lucide-react';
import { 
  IntakeChannel, RepairStatus, ROUTE_DEFINITIONS, RouteCode, getRouteByDistrict 
} from '../types';

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

export const FrontdeskView: React.FC = () => {
  const { 
    items, orders, repairTickets, assignOnsite, 
    assignRepairTicketOnsite, createRepairTicket, closeRepairTicket, users 
  } = useApp();

  const [activeTab, setActiveTab] = useState<'dispatch' | 'intake' | 'reports'>('dispatch');
  
  // Route Filter in Dispatch tab
  const [selectedRoute, setSelectedRoute] = useState<'all' | RouteCode>('all');

  // Intake Form State
  const [channel, setChannel] = useState<IntakeChannel>('front_desk_walkin');
  const [sn, setSn] = useState('');
  const [custName, setCustName] = useState('');
  const [custPhone, setCustPhone] = useState('');
  const [district, setDistrict] = useState('เมืองสุราษฎร์ธานี');
  const [provinceCustom, setProvinceCustom] = useState('');
  const [deliveryLocation, setDeliveryLocation] = useState('');
  const [symptom, setSymptom] = useState('');
  
  // Dispatch State
  const [selectedTech, setSelectedTech] = useState<Record<string, string>>({});
  const [selectedRepairTech, setSelectedRepairTech] = useState<Record<string, string>>({});
  const [batchTechName, setBatchTechName] = useState('');
  const [toast, setToast] = useState('');

  const readyItems = items.filter(i => i.status === 'ready_for_dispatch');
  const returnReadyTickets = repairTickets.filter(r => r.status === 'repaired' && !r.assigned_onsite_tech);
  const onsiteIntakeTickets = repairTickets.filter(r => r.intake_channel === 'onsite_pickup' && r.status === 'open' && !r.assigned_onsite_tech);
  const onsiteTechs = users.filter(u => u.role === 'onsite');

  // Filtered by selected route
  const filteredReadyItems = readyItems.filter(item => {
    if (selectedRoute === 'all') return true;
    const order = orders.find(o => o.id === item.order_id);
    return order?.route_code === selectedRoute;
  });

  const filteredReturnTickets = returnReadyTickets.filter(ticket => {
    if (selectedRoute === 'all') return true;
    return ticket.route_code === selectedRoute;
  });

  const filteredPickupTickets = onsiteIntakeTickets.filter(ticket => {
    if (selectedRoute === 'all') return true;
    return ticket.route_code === selectedRoute;
  });

  const totalRouteJobs = filteredReadyItems.length + filteredReturnTickets.length + filteredPickupTickets.length;

  // Computed Route for repair intake form
  const currentIntakeRoute = getRouteByDistrict(district);
  const intakeRouteMeta = ROUTE_DEFINITIONS[currentIntakeRoute];

  const handleDispatch = (itemId: string) => {
    const defaultTech = onsiteTechs[0]?.name || 'ช่างเอ (สายส่งด่วน Onsite)';
    const techName = selectedTech[itemId] || defaultTech;

    assignOnsite(itemId, techName);
    setToast(`จ่ายงานสำเร็จ! มอบหมายส่งสินค้าให้ ${techName} เรียบร้อยแล้ว`);
    setTimeout(() => setToast(''), 3500);
  };

  const handleDispatchRepair = (ticketId: string) => {
    const defaultTech = onsiteTechs[0]?.name || 'ช่างเอ (สายส่งด่วน Onsite)';
    const techName = selectedRepairTech[ticketId] || defaultTech;

    assignRepairTicketOnsite(ticketId, techName);
    setToast(`จ่ายงานสำเร็จ! มอบหมายส่งคืนเครื่องซ่อมให้ ${techName} เรียบร้อยแล้ว`);
    setTimeout(() => setToast(''), 3500);
  };

  const handleDispatchOnsitePickup = (ticketId: string) => {
    const defaultTech = onsiteTechs[0]?.name || 'ช่างเอ (สายส่งด่วน Onsite)';
    const techName = selectedRepairTech[ticketId] || defaultTech;

    assignRepairTicketOnsite(ticketId, techName);
    setToast(`จ่ายงานสำเร็จ! มอบหมายออกไปรับเครื่องให้ ${techName} เรียบร้อยแล้ว`);
    setTimeout(() => setToast(''), 3500);
  };

  // One-click dispatch all jobs of the selected route to a single technician
  const handleBatchDispatchRoute = () => {
    if (selectedRoute === 'all') {
      alert('กรุณาเลือกสายรถที่ต้องการจ่ายงานแบบทั้งสายก่อนครับ');
      return;
    }
    const techName = batchTechName || (onsiteTechs[0]?.name || 'ช่างเอ (สายส่งด่วน Onsite)');

    // 1. Dispatch outbound items of this route
    filteredReadyItems.forEach(item => {
      assignOnsite(item.id, techName);
    });

    // 2. Dispatch repaired return tickets of this route
    filteredReturnTickets.forEach(ticket => {
      assignRepairTicketOnsite(ticket.id, techName);
    });

    // 3. Dispatch onsite pickup tickets of this route
    filteredPickupTickets.forEach(ticket => {
      assignRepairTicketOnsite(ticket.id, techName);
    });

    const totalCount = filteredReadyItems.length + filteredReturnTickets.length + filteredPickupTickets.length;
    setToast(`จ่ายงานสายรถ ${ROUTE_DEFINITIONS[selectedRoute].shortName} รวม ${totalCount} งาน ให้ "${techName}" สำเร็จในคลิกเดียว!`);
    setTimeout(() => setToast(''), 4000);
  };

  const handleIntakeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!custName || !symptom) return;

    createRepairTicket({
      item_id: null,
      walkin_sn: sn || `SN-MANUAL-${Math.floor(1000 + Math.random() * 9000)}`,
      customer_name: custName,
      customer_phone: custPhone,
      intake_channel: channel,
      district: district,
      route_code: currentIntakeRoute,
      province_custom: currentIntakeRoute === 'route_6' ? provinceCustom : undefined,
      delivery_location: deliveryLocation,
      fault_symptom: symptom,
      repair_detail: null,
      parts_used: null,
      repair_outcome: null,
      assigned_onsite_tech: null,
      finished_at: null
    });

    setSn('');
    setCustName('');
    setCustPhone('');
    setDeliveryLocation('');
    setProvinceCustom('');
    setSymptom('');
    setToast(`เปิด Job รับซ่อม (${intakeRouteMeta.shortName}) เรียบร้อย และส่งต่อไปยังช่างแล้ว`);
    setTimeout(() => setToast(''), 3500);
  };

  const exportCSV = () => {
    let csv = "Type,ID_SN,Customer,Detail,Outcome,Parts,Timestamp\n";
    items.filter(i => i.prepped_at).forEach(i => {
      const order = orders.find(o => o.id === i.order_id);
      csv += `"PREPPED","${i.serial_number}","${order ? order.customer_name : ''}","${i.model_name}","-","-","${i.prepped_at}"\n`;
    });
    repairTickets.filter(r => r.finished_at || r.status !== 'open').forEach(r => {
      csv += `"REPAIR","${r.walkin_sn}","${r.customer_name}","${r.fault_symptom} / ${r.repair_detail || ''}","${r.repair_outcome || r.status}","${r.parts_used || ''}","${r.finished_at || ''}"\n`;
    });

    const blob = new Blob(["\uFEFF" + csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `BossComputech_Report_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  // Clean, single-line, non-overlapping badge rendering
  const renderRepairStatusBadge = (status: RepairStatus, outcome?: string | null) => {
    switch (status) {
      case 'open':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap bg-amber-500/15 text-amber-400 border border-amber-500/30">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse"></span>
            <span>รับเครื่องแล้ว</span>
          </span>
        );
      case 'in_progress':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap bg-purple-500/15 text-purple-400 border border-purple-500/30">
            <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse"></span>
            <span>กำลังตรวจซ่อม</span>
          </span>
        );
      case 'repaired':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
            <span>ซ่อมได้ (สำเร็จ)</span>
          </span>
        );
      case 'unrepairable_warranty':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap bg-blue-500/15 text-blue-400 border border-blue-500/30">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400"></span>
            <span>ซ่อมไม่ได้ ส่งประกัน</span>
          </span>
        );
      case 'expired_warranty':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap bg-amber-500/15 text-amber-400 border border-amber-500/30">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
            <span>หมดประกัน (เสนอราคา)</span>
          </span>
        );
      case 'unrepairable':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap bg-rose-500/15 text-rose-400 border border-rose-500/30">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-400"></span>
            <span>ซ่อมไม่ได้ (คืนเครื่อง)</span>
          </span>
        );
      case 'returned_closed':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap bg-slate-500/15 text-slate-400 border border-slate-500/30">
            <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
            <span>ปิดงานส่งคืนแล้ว</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap bg-white/[0.05] text-slate-300 border border-white/[0.08]">
            {outcome || status}
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 p-4 rounded-2xl liquid-glass border border-[#FF6B00] text-white text-xs flex items-center gap-2 shadow-2xl">
          <CheckCircle className="w-4 h-4 text-[#FF6B00]" />
          <span>{toast}</span>
        </div>
      )}

      {/* Frontdesk Sub-navigation Tabs */}
      <div className="flex gap-2 pb-1 overflow-x-auto">
        <button
          onClick={() => setActiveTab('dispatch')}
          className={`px-4 py-2.5 text-xs font-semibold rounded-2xl transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'dispatch' 
              ? 'liquid-glass-active font-extrabold shadow-lg shadow-[#FF6B00]/25' 
              : 'liquid-glass-card text-slate-400 hover:text-white'
          }`}
        >
          จัดคิวงานให้ช่าง Onsite ({readyItems.length})
        </button>
        <button
          onClick={() => setActiveTab('intake')}
          className={`px-4 py-2.5 text-xs font-semibold rounded-2xl transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'intake' 
              ? 'liquid-glass-active font-extrabold shadow-lg shadow-[#FF6B00]/25' 
              : 'liquid-glass-card text-slate-400 hover:text-white'
          }`}
        >
          รับเครื่องซ่อมหน้าร้าน / เปิด Job ({repairTickets.length})
        </button>
        <button
          onClick={() => setActiveTab('reports')}
          className={`px-4 py-2.5 text-xs font-semibold rounded-2xl transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'reports' 
              ? 'liquid-glass-active font-extrabold shadow-lg shadow-[#FF6B00]/25' 
              : 'liquid-glass-card text-slate-400 hover:text-white'
          }`}
        >
          รายงานประจำวันอัตโนมัติ (Auto Reports)
        </button>
      </div>

      {/* Tab 1: Dispatch to Onsite */}
      {activeTab === 'dispatch' && (
        <div className="space-y-6">
          {/* Route Filter Pills Bar */}
          <div className="liquid-glass rounded-3xl p-5 border border-white/[0.08]">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Truck className="w-4 h-4 text-[#FF6B00]" />
                  <span>จัดคิวงานตามสายวิ่งรถ 6 สาย (Route-Based Dispatching)</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  รวมทั้ง "ส่งของใหม่", "ส่งคืนงานซ่อม" และ "ออกไปรับเครื่อง" ในแต่ละสาย ให้จ่ายงานทีมรถได้ในคลิกเดียว
                </p>
              </div>

              {/* Batch dispatch button if route selected */}
              {selectedRoute !== 'all' && totalRouteJobs > 0 && (
                <div className="flex items-center gap-2 p-2 rounded-2xl bg-white/[0.04] border border-white/[0.08]">
                  <span className="text-xs text-slate-300 font-medium">จ่ายทั้งสาย ({totalRouteJobs} งาน) ให้:</span>
                  <select
                    value={batchTechName || (onsiteTechs[0]?.name || '')}
                    onChange={(e) => setBatchTechName(e.target.value)}
                    className="liquid-glass-input rounded-xl px-2.5 py-1 text-xs text-white focus:outline-none"
                  >
                    {onsiteTechs.map(t => (
                      <option key={t.id} value={t.name} className="bg-[#12141A]">{t.name}</option>
                    ))}
                    {onsiteTechs.length === 0 && (
                      <option value="ช่างเอ (สายส่งด่วน Onsite)" className="bg-[#12141A]">ช่างเอ (สายส่งด่วน Onsite)</option>
                    )}
                  </select>
                  <button
                    onClick={handleBatchDispatchRoute}
                    className="px-3.5 py-1.5 bg-gradient-to-r from-[#FF6B00] to-[#E65A00] hover:from-[#FF8A24] text-black font-extrabold rounded-xl text-xs transition cursor-pointer shadow-md shadow-[#FF6B00]/25 whitespace-nowrap"
                  >
                    จ่ายงานทั้งสายทันที
                  </button>
                </div>
              )}
            </div>

            {/* Route Tabs */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1">
              <button
                onClick={() => setSelectedRoute('all')}
                className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                  selectedRoute === 'all'
                    ? 'bg-white/20 text-white border border-white/40 shadow-sm font-bold'
                    : 'bg-white/[0.04] text-slate-400 hover:text-white border border-white/[0.06]'
                }`}
              >
                <span>ทั้งหมด</span>
                <span className="px-1.5 py-0.2 rounded-full bg-white/20 text-[10px]">
                  {readyItems.length + returnReadyTickets.length + onsiteIntakeTickets.length}
                </span>
              </button>

              {(Object.keys(ROUTE_DEFINITIONS) as RouteCode[]).map((rCode) => {
                const r = ROUTE_DEFINITIONS[rCode];
                const routeReadyCount = readyItems.filter(i => orders.find(o => o.id === i.order_id)?.route_code === rCode).length;
                const routeReturnCount = returnReadyTickets.filter(t => t.route_code === rCode).length;
                const routePickupCount = onsiteIntakeTickets.filter(t => t.route_code === rCode).length;
                const count = routeReadyCount + routeReturnCount + routePickupCount;

                return (
                  <button
                    key={rCode}
                    onClick={() => setSelectedRoute(rCode)}
                    className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition cursor-pointer whitespace-nowrap flex items-center gap-2 ${
                      selectedRoute === rCode
                        ? `${r.badgeBg} ${r.badgeText} ${r.badgeBorder} border shadow-lg font-bold`
                        : 'bg-white/[0.04] text-slate-400 hover:text-slate-200 border border-white/[0.06]'
                    }`}
                  >
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: r.color }}></span>
                    <span>{r.name}</span>
                    <span className="px-1.5 py-0.2 rounded-full bg-white/10 text-[10px] font-mono">
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Jobs Breakdown for Selected Route */}
          <div className="space-y-6">
            {/* Section A: New Goods Ready for Delivery (ส่งของใหม่) */}
            <div className="liquid-glass rounded-3xl p-6 shadow-2xl border border-white/[0.08]">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-1 rounded-xl bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 text-xs font-bold flex items-center gap-1.5">
                    <Package className="w-3.5 h-3.5" />
                    [1] ส่งของใหม่ (ช่างเตรียมติดวอยแล้ว)
                  </span>
                  <span className="text-xs text-slate-400">({filteredReadyItems.length} ชิ้น)</span>
                </div>
              </div>

              {filteredReadyItems.length === 0 ? (
                <div className="text-center py-8 text-slate-500 border border-dashed border-white/[0.08] rounded-2xl text-xs">
                  ไม่มีสินค้าใหม่รอจัดส่งในสายรถนี้
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-white/[0.03] text-slate-400 border-b border-white/[0.06]">
                      <tr>
                        <th className="py-2.5 px-3 whitespace-nowrap">สายรถ</th>
                        <th className="py-2.5 px-3 whitespace-nowrap">S/N สินค้า</th>
                        <th className="py-2.5 px-3 whitespace-nowrap">รุ่นสินค้า</th>
                        <th className="py-2.5 px-3 whitespace-nowrap">ลูกค้า & พื้นที่</th>
                        <th className="py-2.5 px-3 whitespace-nowrap">ช่าง Onsite รับงาน</th>
                        <th className="py-2.5 px-3 text-right whitespace-nowrap">ดำเนินการ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.05]">
                      {filteredReadyItems.map((item) => {
                        const order = orders.find(o => o.id === item.order_id);
                        const rMeta = order?.route_code ? ROUTE_DEFINITIONS[order.route_code] : null;

                        return (
                          <tr key={item.id} className="hover:bg-white/[0.03] transition">
                            <td className="py-3 px-3 whitespace-nowrap">
                              {rMeta ? (
                                <span className={`px-2 py-0.5 rounded-lg text-[11px] font-bold border ${rMeta.badgeBg} ${rMeta.badgeBorder} ${rMeta.badgeText}`}>
                                  {rMeta.shortName} ({order?.district || '-'})
                                </span>
                              ) : '-'}
                            </td>
                            <td className="py-3 px-3 font-mono font-bold text-[#FF6B00] whitespace-nowrap">
                              {item.serial_number}
                            </td>
                            <td className="py-3 px-3 text-white font-medium whitespace-nowrap">
                              {item.model_name}
                            </td>
                            <td className="py-3 px-3">
                              <div className="text-slate-200 font-medium whitespace-nowrap">{order?.customer_name || '-'}</div>
                              <div className="text-[11px] text-slate-500 truncate max-w-xs">{order?.delivery_location || '-'}</div>
                            </td>
                            <td className="py-3 px-3 whitespace-nowrap">
                              <select
                                value={selectedTech[item.id] || (onsiteTechs[0]?.name || 'ช่างเอ (สายส่งด่วน Onsite)')}
                                onChange={(e) => setSelectedTech({ ...selectedTech, [item.id]: e.target.value })}
                                className="liquid-glass-input rounded-xl px-2.5 py-1 text-xs text-white focus:outline-none"
                              >
                                {onsiteTechs.map(t => (
                                  <option key={t.id} value={t.name} className="bg-[#12141A]">{t.name}</option>
                                ))}
                                {onsiteTechs.length === 0 && (
                                  <option value="ช่างเอ (สายส่งด่วน Onsite)" className="bg-[#12141A]">ช่างเอ (สายส่งด่วน Onsite)</option>
                                )}
                              </select>
                            </td>
                            <td className="py-3 px-3 text-right whitespace-nowrap">
                              <button
                                onClick={() => handleDispatch(item.id)}
                                className="px-3 py-1 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-400 text-white font-semibold rounded-xl text-xs transition cursor-pointer shadow-md shadow-blue-500/20 whitespace-nowrap inline-flex items-center gap-1"
                              >
                                <Send className="w-3 h-3" />
                                <span>จ่ายงาน</span>
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Section B: Repaired Units Ready to Return (ส่งคืนงานซ่อมเสร็จ) */}
            <div className="liquid-glass rounded-3xl p-6 shadow-2xl border border-white/[0.08]">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-1 rounded-xl bg-purple-500/15 text-purple-400 border border-purple-500/30 text-xs font-bold flex items-center gap-1.5">
                    <RotateCcw className="w-3.5 h-3.5" />
                    [2] ส่งคืนงานซ่อมเสร็จ (Repaired Return)
                  </span>
                  <span className="text-xs text-slate-400">({filteredReturnTickets.length} เครื่อง)</span>
                </div>
              </div>

              {filteredReturnTickets.length === 0 ? (
                <div className="text-center py-8 text-slate-500 border border-dashed border-white/[0.08] rounded-2xl text-xs">
                  ไม่มีเครื่องซ่อมเสร็จรอส่งคืนในสายรถนี้
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-white/[0.03] text-slate-400 border-b border-white/[0.06]">
                      <tr>
                        <th className="py-2.5 px-3 whitespace-nowrap">สายรถ</th>
                        <th className="py-2.5 px-3 whitespace-nowrap">Ticket / S/N</th>
                        <th className="py-2.5 px-3 whitespace-nowrap">ลูกค้า & ที่อยู่</th>
                        <th className="py-2.5 px-3 whitespace-nowrap">ผลการซ่อม</th>
                        <th className="py-2.5 px-3 whitespace-nowrap">ช่าง Onsite รับงาน</th>
                        <th className="py-2.5 px-3 text-right whitespace-nowrap">ดำเนินการ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.05]">
                      {filteredReturnTickets.map((ticket) => {
                        const rMeta = ticket.route_code ? ROUTE_DEFINITIONS[ticket.route_code] : null;

                        return (
                          <tr key={ticket.id} className="hover:bg-white/[0.03] transition">
                            <td className="py-3 px-3 whitespace-nowrap">
                              {rMeta ? (
                                <span className={`px-2 py-0.5 rounded-lg text-[11px] font-bold border ${rMeta.badgeBg} ${rMeta.badgeBorder} ${rMeta.badgeText}`}>
                                  {rMeta.shortName} ({ticket.district || '-'})
                                </span>
                              ) : '-'}
                            </td>
                            <td className="py-3 px-3 whitespace-nowrap">
                              <div className="font-mono font-bold text-white">{ticket.ticket_no}</div>
                              <div className="font-mono text-[#FF6B00] text-[11px]">{ticket.walkin_sn}</div>
                            </td>
                            <td className="py-3 px-3">
                              <div className="text-slate-200 font-medium whitespace-nowrap">{ticket.customer_name}</div>
                              <div className="text-[11px] text-slate-500 truncate max-w-xs">{ticket.delivery_location || ticket.customer_phone || '-'}</div>
                            </td>
                            <td className="py-3 px-3 whitespace-nowrap">
                              <span className="px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[11px] font-semibold">
                                ซ่อมเสร็จแล้ว ({ticket.parts_used || 'พร้อมใช้งาน'})
                              </span>
                            </td>
                            <td className="py-3 px-3 whitespace-nowrap">
                              <select
                                value={selectedRepairTech[ticket.id] || (onsiteTechs[0]?.name || 'ช่างเอ (สายส่งด่วน Onsite)')}
                                onChange={(e) => setSelectedRepairTech({ ...selectedRepairTech, [ticket.id]: e.target.value })}
                                className="liquid-glass-input rounded-xl px-2.5 py-1 text-xs text-white focus:outline-none"
                              >
                                {onsiteTechs.map(t => (
                                  <option key={t.id} value={t.name} className="bg-[#12141A]">{t.name}</option>
                                ))}
                                {onsiteTechs.length === 0 && (
                                  <option value="ช่างเอ (สายส่งด่วน Onsite)" className="bg-[#12141A]">ช่างเอ (สายส่งด่วน Onsite)</option>
                                )}
                              </select>
                            </td>
                            <td className="py-3 px-3 text-right whitespace-nowrap">
                              <button
                                onClick={() => handleDispatchRepair(ticket.id)}
                                className="px-3 py-1 bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-400 text-white font-semibold rounded-xl text-xs transition cursor-pointer shadow-md shadow-purple-500/20 whitespace-nowrap inline-flex items-center gap-1"
                              >
                                <Send className="w-3 h-3" />
                                <span>จ่ายงานส่งคืน</span>
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Section C: Onsite Pickup/Repair Jobs (งานแจ้งซ่อมหน้างาน / วิ่งไปรับเครื่อง) */}
            <div className="liquid-glass rounded-3xl p-6 shadow-2xl border border-white/[0.08]">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-1 rounded-xl bg-amber-500/15 text-amber-400 border border-amber-500/30 text-xs font-bold flex items-center gap-1.5">
                    <Wrench className="w-3.5 h-3.5" />
                    [3] งานแจ้งซ่อมหน้างาน / รับเครื่องกลับร้าน (Onsite Pickup)
                  </span>
                  <span className="text-xs text-slate-400">({filteredPickupTickets.length} งาน)</span>
                </div>
              </div>

              {filteredPickupTickets.length === 0 ? (
                <div className="text-center py-8 text-slate-500 border border-dashed border-white/[0.08] rounded-2xl text-xs">
                  ไม่มีคิวงานวิ่งไปรับเครื่องซ่อมในสายรถนี้
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-white/[0.03] text-slate-400 border-b border-white/[0.06]">
                      <tr>
                        <th className="py-2.5 px-3 whitespace-nowrap">สายรถ</th>
                        <th className="py-2.5 px-3 whitespace-nowrap">Ticket ID</th>
                        <th className="py-2.5 px-3 whitespace-nowrap">ลูกค้า & ไซต์งาน</th>
                        <th className="py-2.5 px-3 whitespace-nowrap">อาการเสียที่แจ้ง</th>
                        <th className="py-2.5 px-3 whitespace-nowrap">ช่าง Onsite รับงาน</th>
                        <th className="py-2.5 px-3 text-right whitespace-nowrap">ดำเนินการ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.05]">
                      {filteredPickupTickets.map((ticket) => {
                        const rMeta = ticket.route_code ? ROUTE_DEFINITIONS[ticket.route_code] : null;

                        return (
                          <tr key={ticket.id} className="hover:bg-white/[0.03] transition">
                            <td className="py-3 px-3 whitespace-nowrap">
                              {rMeta ? (
                                <span className={`px-2 py-0.5 rounded-lg text-[11px] font-bold border ${rMeta.badgeBg} ${rMeta.badgeBorder} ${rMeta.badgeText}`}>
                                  {rMeta.shortName} ({ticket.district || '-'})
                                </span>
                              ) : '-'}
                            </td>
                            <td className="py-3 px-3 font-mono font-bold text-amber-400 whitespace-nowrap">
                              {ticket.ticket_no}
                            </td>
                            <td className="py-3 px-3">
                              <div className="text-slate-200 font-medium whitespace-nowrap">{ticket.customer_name}</div>
                              <div className="text-[11px] text-slate-500 truncate max-w-xs">{ticket.delivery_location || ticket.customer_phone || '-'}</div>
                            </td>
                            <td className="py-3 px-3 text-slate-300 max-w-xs truncate">
                              {ticket.fault_symptom}
                            </td>
                            <td className="py-3 px-3 whitespace-nowrap">
                              <select
                                value={selectedRepairTech[ticket.id] || (onsiteTechs[0]?.name || 'ช่างเอ (สายส่งด่วน Onsite)')}
                                onChange={(e) => setSelectedRepairTech({ ...selectedRepairTech, [ticket.id]: e.target.value })}
                                className="liquid-glass-input rounded-xl px-2.5 py-1 text-xs text-white focus:outline-none"
                              >
                                {onsiteTechs.map(t => (
                                  <option key={t.id} value={t.name} className="bg-[#12141A]">{t.name}</option>
                                ))}
                                {onsiteTechs.length === 0 && (
                                  <option value="ช่างเอ (สายส่งด่วน Onsite)" className="bg-[#12141A]">ช่างเอ (สายส่งด่วน Onsite)</option>
                                )}
                              </select>
                            </td>
                            <td className="py-3 px-3 text-right whitespace-nowrap">
                              <button
                                onClick={() => handleDispatchOnsitePickup(ticket.id)}
                                className="px-3 py-1 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 text-black font-semibold rounded-xl text-xs transition cursor-pointer shadow-md shadow-amber-500/20 whitespace-nowrap inline-flex items-center gap-1"
                              >
                                <Send className="w-3 h-3" />
                                <span>จ่ายงานรับเครื่อง</span>
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Walk-in Intake */}
      {activeTab === 'intake' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="liquid-glass rounded-3xl p-6 shadow-2xl border border-white/[0.08]">
            <h3 className="text-sm font-bold text-white mb-1 flex items-center gap-2">
              <TicketPlus className="w-4 h-4 text-[#FF6B00]" />
              เปิดใบรับซ่อม (Create Repair Ticket)
            </h3>
            <p className="text-xs text-slate-400 mb-4">ลูกค้านำส่งซ่อมหน้าร้าน หรือให้ช่างไปรับกลับมา</p>

            <form onSubmit={handleIntakeSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-300 font-medium mb-1">ช่องทางการรับเครื่อง *</label>
                <select
                  value={channel}
                  onChange={(e) => setChannel(e.target.value as IntakeChannel)}
                  className="w-full liquid-glass-input rounded-2xl px-3 py-2 text-white focus:outline-none"
                >
                  <option value="front_desk_walkin" className="bg-[#12141A]">ลูกค้านำส่งซ่อมหน้าร้าน (Walk-in)</option>
                  <option value="onsite_pickup" className="bg-[#12141A]">ช่าง Onsite ไปรับเครื่องกลับมาจากไซต์</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Serial Number (S/N) *</label>
                <input
                  type="text"
                  required
                  placeholder="เช่น BC-2026-001 หรือระบุถ้าไม่มี S/N บอสคอม"
                  value={sn}
                  onChange={(e) => setSn(e.target.value)}
                  className="w-full liquid-glass-input rounded-2xl px-3 py-2 text-white font-mono focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">ชื่อลูกค้า / บริษัท *</label>
                <input
                  type="text"
                  required
                  placeholder="ชื่อผู้ติดต่อหรือบริษัท"
                  value={custName}
                  onChange={(e) => setCustName(e.target.value)}
                  className="w-full liquid-glass-input rounded-2xl px-3 py-2 text-white focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">เบอร์ติดต่อลูกค้า</label>
                <input
                  type="text"
                  placeholder="08x-xxx-xxxx"
                  value={custPhone}
                  onChange={(e) => setCustPhone(e.target.value)}
                  className="w-full liquid-glass-input rounded-2xl px-3 py-2 text-white focus:outline-none"
                />
              </div>

              {/* District & Route Auto-Calculation */}
              <div>
                <label className="block text-slate-300 font-medium mb-1">อำเภอ / พื้นที่ (จัดสายรถอัตโนมัติ) *</label>
                <select
                  value={district}
                  onChange={(e) => setDistrict(e.target.value)}
                  className="w-full liquid-glass-input rounded-2xl px-3 py-2 text-white focus:outline-none"
                >
                  {DISTRICT_OPTIONS.map(opt => (
                    <option key={opt.district} value={opt.district} className="bg-[#12141A]">
                      {opt.district} - [{opt.zone}]
                    </option>
                  ))}
                </select>
              </div>

              {/* Prominent Auto-computed Route Badge */}
              <div className={`p-3 rounded-2xl border flex items-center justify-between ${intakeRouteMeta.badgeBg} ${intakeRouteMeta.badgeBorder} ${intakeRouteMeta.badgeText}`}>
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: intakeRouteMeta.color }}></span>
                  <span className="text-xs font-extrabold">{intakeRouteMeta.name}</span>
                </div>
                <span className="text-[10px] font-medium opacity-85">จัดสายรถอัตโนมัติ</span>
              </div>

              {/* Custom province if Route 6 */}
              {currentIntakeRoute === 'route_6' && (
                <div>
                  <label className="block text-amber-400 font-medium mb-1">ระบุจังหวัด / รายละเอียดพื้นที่พิเศษ *</label>
                  <input
                    type="text"
                    required
                    placeholder="เช่น ชุมพร, นครศรีธรรมราช, ระนอง"
                    value={provinceCustom}
                    onChange={(e) => setProvinceCustom(e.target.value)}
                    className="w-full liquid-glass-input rounded-2xl px-3 py-2 text-white border-amber-500/50 focus:outline-none"
                  />
                </div>
              )}

              <div>
                <label className="block text-slate-300 font-medium mb-1">ที่อยู่หน้างาน / จุดรับส่งเครื่อง</label>
                <input
                  type="text"
                  placeholder="เช่น เลขที่ 99/2 หมู่ 3 ใกล้ตลาดสด"
                  value={deliveryLocation}
                  onChange={(e) => setDeliveryLocation(e.target.value)}
                  className="w-full liquid-glass-input rounded-2xl px-3 py-2 text-white focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">อาการเสียที่ได้รับแจ้ง *</label>
                <textarea
                  rows={3}
                  required
                  placeholder="เช่น เปิดไม่ติด ไฟเข้าแต่พัดลมไม่หมุน, จอฟ้าโค้ด 0x000001"
                  value={symptom}
                  onChange={(e) => setSymptom(e.target.value)}
                  className="w-full liquid-glass-input rounded-2xl px-3 py-2 text-white focus:outline-none"
                />
              </div>

              <button
                type="submit"
                className="w-full py-2.5 bg-gradient-to-r from-[#FF6B00] to-[#E65A00] hover:from-[#FF8A24] hover:to-[#FF6B00] text-black font-extrabold rounded-2xl text-xs transition-all duration-200 cursor-pointer flex items-center justify-center gap-1.5 shadow-xl shadow-[#FF6B00]/25 border border-white/20"
              >
                <PlusCircle className="w-4 h-4" />
                <span>เปิด Job รับซ่อม & ส่งให้ช่างในร้าน</span>
              </button>
            </form>
          </div>

          <div className="lg:col-span-2 liquid-glass rounded-3xl p-6 shadow-2xl border border-white/[0.08]">
            <h3 className="text-sm font-bold text-white mb-4 flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Wrench className="w-4 h-4 text-[#FF6B00]" />
                รายการเครื่องที่กำลังอยู่ในกระบวนการซ่อม
              </span>
              <span className="text-xs text-slate-500">{repairTickets.length} ใบรับซ่อม</span>
            </h3>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-white/[0.03] text-slate-400 border-b border-white/[0.06]">
                  <tr>
                    <th className="py-3 px-3 whitespace-nowrap">Ticket ID</th>
                    <th className="py-3 px-3 whitespace-nowrap">สายรถ</th>
                    <th className="py-3 px-3 whitespace-nowrap">S/N</th>
                    <th className="py-3 px-3 whitespace-nowrap">ลูกค้า</th>
                    <th className="py-3 px-3 whitespace-nowrap">อาการเสีย</th>
                    <th className="py-3 px-3 whitespace-nowrap min-w-[190px]">ข้อสรุปผลตรวจซ่อม</th>
                    <th className="py-3 px-3 text-right whitespace-nowrap">ดำเนินการ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.05]">
                  {repairTickets.map((t) => {
                    const rMeta = t.route_code ? ROUTE_DEFINITIONS[t.route_code] : null;

                    return (
                      <tr key={t.id} className="hover:bg-white/[0.03] transition">
                        <td className="py-3.5 px-3 font-mono font-bold text-slate-300 whitespace-nowrap">{t.ticket_no}</td>
                        <td className="py-3.5 px-3 whitespace-nowrap">
                          {rMeta ? (
                            <span className={`px-2 py-0.5 rounded-lg text-[10px] font-bold border ${rMeta.badgeBg} ${rMeta.badgeBorder} ${rMeta.badgeText}`}>
                              {rMeta.shortName}
                            </span>
                          ) : (
                            <span className="text-slate-500 text-[10px]">-</span>
                          )}
                        </td>
                        <td className="py-3.5 px-3 font-mono text-[#FF6B00] whitespace-nowrap">{t.walkin_sn}</td>
                        <td className="py-3.5 px-3 whitespace-nowrap">
                          <div className="text-white font-medium">{t.customer_name}</div>
                          <div className="text-[10px] text-slate-500">{t.district || t.customer_phone || '-'}</div>
                        </td>
                        <td className="py-3.5 px-3 text-slate-300 max-w-xs truncate">{t.fault_symptom}</td>
                        <td className="py-3.5 px-3 whitespace-nowrap">
                          {renderRepairStatusBadge(t.status, t.repair_outcome)}
                        </td>
                        <td className="py-3.5 px-3 text-right whitespace-nowrap">
                          {t.status !== 'open' && t.status !== 'in_progress' && t.status !== 'returned_closed' ? (
                            <button
                              onClick={() => {
                                closeRepairTicket(t.id);
                                setToast('ปิดงานและส่งคืนเครื่องให้ลูกค้าเรียบร้อยแล้ว');
                              }}
                              className="px-3 py-1 bg-emerald-500 hover:bg-emerald-600 text-black font-semibold rounded-xl text-[11px] transition cursor-pointer shadow-md shadow-emerald-500/20 whitespace-nowrap"
                            >
                              ส่งคืนลูกค้า / ปิดงาน
                            </button>
                          ) : (
                            <span className="text-[11px] text-slate-500">-</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: Auto Reports */}
      {activeTab === 'reports' && (
        <div className="liquid-glass rounded-3xl p-6 sm:p-7 shadow-2xl border border-white/[0.08]" id="print-section">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 pb-4 border-b border-white/[0.08] no-print">
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-emerald-400" />
                รายงานสรุปผลงานอัตโนมัติ (Automated Daily Operations Report)
              </h3>
              <p className="text-xs text-slate-400">
                หมดปัญหาช่างต้องเสียเวลาพิมพ์รายงานสรุปสิ้นวัน ระบบรวบรวมข้อมูลให้อัตโนมัติและส่งออกได้ทันที
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={exportCSV}
                className="px-3.5 py-2 rounded-2xl liquid-glass-card hover:border-emerald-500/50 text-emerald-400 text-xs font-semibold transition cursor-pointer flex items-center gap-1.5"
              >
                <Download className="w-4 h-4" />
                <span>ดาวน์โหลด CSV</span>
              </button>
              <button
                onClick={() => window.print()}
                className="px-3.5 py-2 rounded-2xl bg-[#FF6B00] hover:bg-[#E65A00] text-black text-xs font-extrabold transition cursor-pointer flex items-center gap-1.5 shadow-md shadow-[#FF6B00]/25 border border-white/20"
              >
                <Printer className="w-4 h-4" />
                <span>พิมพ์รายงาน / PDF</span>
              </button>
            </div>
          </div>

          <div className="mb-4 text-center">
            <h2 className="text-lg font-bold text-white">รายงานสรุปการเตรียมสินค้าและการปิดงานซ่อมประจำวัน</h2>
            <p className="text-xs text-slate-400">บริษัท บอส คอมพิวเทค จำกัด (BossComputech Co., Ltd.)</p>
            <p className="text-xs text-[#FF6B00] font-medium mt-1">วันที่ออกรายงาน: {new Date().toLocaleDateString('th-TH')}</p>
          </div>

          <div className="space-y-6">
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-[#FF6B00] mb-2 flex items-center gap-1.5">
                <CheckCircle className="w-3.5 h-3.5" />
                1. สรุปสินค้าที่ช่างเตรียมเครื่องเสร็จสิ้น (Prepped Units)
              </h4>
              <div className="overflow-x-auto border border-white/[0.08] rounded-2xl">
                <table className="w-full text-left text-xs">
                  <thead className="bg-white/[0.03] text-slate-400">
                    <tr>
                      <th className="py-2.5 px-3 whitespace-nowrap">S/N</th>
                      <th className="py-2.5 px-3 whitespace-nowrap">รุ่นสินค้า</th>
                      <th className="py-2.5 px-3 whitespace-nowrap">ลูกค้า</th>
                      <th className="py-2.5 px-3 whitespace-nowrap">เวลาที่เตรียมเสร็จ</th>
                      <th className="py-2.5 px-3 whitespace-nowrap">สถานะโลโก้ & วอย</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.05]">
                    {items.filter(i => i.prepped_at).map(i => {
                      const o = orders.find(ord => ord.id === i.order_id);
                      return (
                        <tr key={i.id}>
                          <td className="py-2.5 px-3 font-mono font-bold text-[#FF6B00] whitespace-nowrap">{i.serial_number}</td>
                          <td className="py-2.5 px-3 text-white whitespace-nowrap">{i.model_name}</td>
                          <td className="py-2.5 px-3 text-slate-300 whitespace-nowrap">{o ? o.customer_name : '-'}</td>
                          <td className="py-2.5 px-3 text-slate-400 font-mono whitespace-nowrap">{new Date(i.prepped_at!).toLocaleString('th-TH')}</td>
                          <td className="py-2.5 px-3 text-emerald-400 font-semibold whitespace-nowrap">
                            ติดโลโก้ & วอย ({i.void_date || 'สำเร็จ'}) แล้ว
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-rose-400 mb-2 flex items-center gap-1.5">
                <CheckCircle className="w-3.5 h-3.5" />
                2. สรุปงานซ่อมที่ปิดงานเรียบร้อย (Completed Repairs)
              </h4>
              <div className="overflow-x-auto border border-white/[0.08] rounded-2xl">
                <table className="w-full text-left text-xs">
                  <thead className="bg-white/[0.03] text-slate-400">
                    <tr>
                      <th className="py-2.5 px-3 whitespace-nowrap">Ticket</th>
                      <th className="py-2.5 px-3 whitespace-nowrap">S/N</th>
                      <th className="py-2.5 px-3 whitespace-nowrap">ลูกค้า</th>
                      <th className="py-2.5 px-3 whitespace-nowrap">อาการเสีย</th>
                      <th className="py-2.5 px-3 whitespace-nowrap">ผลการวินิจฉัย & อะไหล่</th>
                      <th className="py-2.5 px-3 whitespace-nowrap">เวลาเสร็จสิ้น</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.05]">
                    {repairTickets.filter(r => r.finished_at || r.status !== 'open').map(r => (
                      <tr key={r.id}>
                        <td className="py-2.5 px-3 font-mono font-bold text-slate-300 whitespace-nowrap">{r.ticket_no}</td>
                        <td className="py-2.5 px-3 font-mono text-[#FF6B00] whitespace-nowrap">{r.walkin_sn}</td>
                        <td className="py-2.5 px-3 text-white whitespace-nowrap">{r.customer_name}</td>
                        <td className="py-2.5 px-3 text-slate-300">{r.fault_symptom}</td>
                        <td className="py-2.5 px-3 text-slate-300">
                          <span className="font-semibold text-white mr-1">[{r.repair_outcome || r.status}]</span>
                          {r.repair_detail || '-'} (อะไหล่: {r.parts_used || '-'})
                        </td>
                        <td className="py-2.5 px-3 text-slate-400 font-mono whitespace-nowrap">{r.finished_at ? new Date(r.finished_at).toLocaleString('th-TH') : '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
