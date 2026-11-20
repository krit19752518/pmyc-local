const thaiDigits = '๐๑๒๓๔๕๖๗๘๙';
export const asciiDigits = (text: string) => text.replace(/[๐-๙]/g, char => String(thaiDigits.indexOf(char)));
const months = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
const short = ['มค', 'กพ', 'มีค', 'เมย', 'พค', 'มิย', 'กค', 'สค', 'กย', 'ตค', 'พย', 'ธค'];
const english = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
export function normalizeDate(input: unknown): string | null {
  const text = asciiDigits(String(input || '')).trim();
  let year: number, month: number, day: number;
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:T\d{2}:.*)?$/);
  const numeric = text.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  const named = text.replace(/พ\.?\s*ศ\.?|ค\.?\s*ศ\.?/g, '').match(/^(\d{1,2})\s*([^\d]+?)\s*(\d{4})$/);
  if (iso) [, year, month, day] = iso.map(Number);
  else if (numeric) [, day, month, year] = numeric.map(Number);
  else if (named) {
    day = Number(named[1]); year = Number(named[3]);
    const name = named[2].replace(/[.\s]/g, '').toLowerCase();
    month = months.indexOf(name) + 1 || short.indexOf(name) + 1 || english.indexOf(name.slice(0, 3)) + 1;
    if (/^[a-z]+$/.test(name) && ![...english, 'january', 'february', 'march', 'april', 'june', 'july', 'august', 'september', 'october', 'november', 'december'].includes(name)) return null;
  } else return null;
  if (year > 2400) year -= 543;
  if (year < 1900 || year > 2200 || month < 1 || month > 12) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
    ? date.toISOString().slice(0, 10) : null;
}
export function normalizeThaiName(value: string): string {
  return value.normalize('NFC').trim().replace(/^ด\s*\.\s*ช\s*\.?\s*/, 'เด็กชาย')
    .replace(/^ด\s*\.\s*ญ\s*\.?\s*/, 'เด็กหญิง').replace(/^น\s*\.\s*ส\s*\.?\s*/, 'นางสาว').replace(/\s+/g, '');
}
/** Calendar dates in Thailand, independent of the server's timezone/UTC day. */
export function bangkokToday(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', calendar: 'iso8601', numberingSystem: 'latn', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const part = (name: string) => parts.find(p => p.type === name)!.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}
export function previousCalendarDay(today: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today) || normalizeDate(today) !== today) throw new Error('Invalid comparison date');
  const date = new Date(today + 'T00:00:00Z');
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}
export function validThaiId(value: string): boolean {
  if (!/^\d{13}$/.test(value) || /^0+$/.test(value)) return false;
  const sum = [...value.slice(0, 12)].reduce((n, digit, i) => n + Number(digit) * (13 - i), 0);
  return (11 - sum % 11) % 10 === Number(value[12]);
}
