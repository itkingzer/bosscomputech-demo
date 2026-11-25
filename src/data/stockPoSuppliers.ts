interface SupplierDetails {
  name: string;
  address: string;
  taxId?: string;
  contact: string;
}

const supplierDetails = new Map<string, SupplierDetails>([
  // https://www.sisthai.com/สำนักงานใหญ่
  ['sis distribution', {
    name: 'บริษัท เอสไอเอส ดิสทริบิวชั่น (ประเทศไทย) จำกัด (มหาชน)',
    address: '9 อาคารภคินท์ ชั้น 9 ห้อง 901 ถนนรัชดาภิเษก แขวงดินแดง เขตดินแดง กรุงเทพมหานคร 10400',
    taxId: '0107547000052 (สำนักงานใหญ่)',
    contact: '02-020-3000 · sis@sisthai.com',
  }],
  // https://www.synnex.co.th/Th/Components/Main/Home.aspx
  ['synnex (thailand)', {
    name: 'บริษัท ซินเน็ค (ประเทศไทย) จำกัด (มหาชน)',
    address: '433 ถนนสุคนธสวัสดิ์ แขวงลาดพร้าว เขตลาดพร้าว กรุงเทพมหานคร 10230',
    contact: '02-553-8899',
  }],
  // https://www.abshop.in.th/contactus
  ['abshop', {
    name: 'บริษัท เอบี โกลบอล ซัพพลาย จำกัด (สำนักงานใหญ่)',
    address: '155/15 หมู่ 4 ตำบลบ้านกลาง อำเภอเมืองลำพูน จังหวัดลำพูน 51000',
    contact: '095-312-4003',
  }],
]);

export const getStockPoSupplierDetails = (name: string) => supplierDetails.get(name.trim().toLowerCase());
