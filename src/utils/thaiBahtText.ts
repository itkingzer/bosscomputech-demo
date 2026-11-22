const THAI_DIGITS = ['ศูนย์', 'หนึ่ง', 'สอง', 'สาม', 'สี่', 'ห้า', 'หก', 'เจ็ด', 'แปด', 'เก้า'];
const THAI_POSITIONS = ['', 'สิบ', 'ร้อย', 'พัน', 'หมื่น', 'แสน', 'ล้าน'];

function convertIntegerGroup(numStr: string): string {
  const len = numStr.length;
  let result = '';
  for (let i = 0; i < len; i++) {
    const digit = parseInt(numStr[i], 10);
    const pos = len - i - 1;
    if (digit === 0) continue;
    if (pos === 0 && digit === 1 && i > 0 && parseInt(numStr.slice(0, i), 10) > 0) {
      result += 'เอ็ด';
    } else if (pos === 1 && digit === 2) {
      result += 'ยี่สิบ';
    } else if (pos === 1 && digit === 1) {
      result += 'สิบ';
    } else {
      result += THAI_DIGITS[digit] + THAI_POSITIONS[pos];
    }
  }
  return result;
}

function convertIntegerToThai(num: number): string {
  if (num === 0) return 'ศูนย์';
  const str = String(Math.floor(num));
  const groups: string[] = [];
  for (let i = str.length; i > 0; i -= 6) {
    groups.unshift(str.slice(Math.max(0, i - 6), i));
  }
  return groups
    .map((group, idx) => {
      const text = convertIntegerGroup(group);
      const isLast = idx === groups.length - 1;
      if (!text && !isLast) return 'ล้าน';
      return text + (isLast ? '' : 'ล้าน');
    })
    .join('');
}

export function thaiBahtText(amount: number): string {
  if (!isFinite(amount) || isNaN(amount)) return 'ศูนย์บาทถ้วน';
  const negative = amount < 0;
  const abs = Math.abs(amount);
  const fixed = abs.toFixed(2);
  const [intPartStr, decPartStr] = fixed.split('.');
  const intVal = parseInt(intPartStr, 10);
  const decVal = parseInt(decPartStr, 10);

  let text = '';
  if (intVal === 0 && decVal === 0) {
    text = 'ศูนย์บาทถ้วน';
  } else {
    if (intVal > 0) {
      text += convertIntegerToThai(intVal) + 'บาท';
    }
    if (decVal === 0) {
      text += 'ถ้วน';
    } else {
      text += convertIntegerToThai(decVal) + 'สตางค์';
    }
  }
  return (negative ? 'ลบ' : '') + text;
}
