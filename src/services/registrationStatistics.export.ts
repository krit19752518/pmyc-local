import { AGES, Counts, StatisticsSnapshot, add, sum, total, zero } from './registrationStatistics.service';
import { BANGKOK_ZONES } from './registrationStatistics.registry';

export function filteredStatistics(snapshot: StatisticsSnapshot, query: Record<string, unknown>) {
  const text = (key: string) => typeof query[key] === 'string' ? String(query[key]) : '';
  const province = snapshot.provinces.find(p => p.name === text('province'));
  const zone = province?.code === '10' ? BANGKOK_ZONES.find(z => z.name === text('zone')) : undefined;
  const age = AGES.includes(text('age') as typeof AGES[number]) ? AGES.indexOf(text('age') as typeof AGES[number]) : -1;
  const value = (row: { ages: Counts }) => age < 0 ? total(row.ages) : row.ages[age];
  const district = Boolean(province) || text('level') === 'district';
  const rows = (district ? (province ? [province] : snapshot.provinces).flatMap(p => p.districts.map(d => ({ ...d, province: p.name, provinceCode: p.code, districts: [] }))) : snapshot.provinces.map(p => ({ ...p, province: '', provinceCode: p.code })))
    .filter(r => (!zone || zone.districts.includes(r.name)) && (r.name + ' ' + r.province).includes(text('q').trim()) && (text('status') === 'zero' ? value(r) === 0 : text('status') === 'registered' ? value(r) > 0 : true))
    .sort((a, b) => {
      if (!['total','name'].includes(text('sort')) && (value(a) === 0) !== (value(b) === 0)) return value(a) === 0 ? -1 : 1;
      if (text('sort') !== 'name' && value(a) !== value(b)) return value(b) - value(a);
      return a.province.localeCompare(b.province, 'th') || a.name.localeCompare(b.name, 'th');
    });
  const unassigned = zone ? zero() : province ? province.unassigned : snapshot.provinces.reduce((a, p) => add(a, p.unassigned), snapshot.unassigned);
  return { rows, district, age, value, unassigned, label: zone ? province!.name + ' · ' + zone.name : province?.name || 'ทั้งประเทศ' };
}
export function statisticsCsv(snapshot: StatisticsSnapshot, query: Record<string, unknown>) {
  const ctx = filteredStatistics(snapshot, query);
  const indices = ctx.age < 0 ? [0,1,2] : [ctx.age];
  const metadata = [ctx.label, snapshot.asOf, snapshot.snapshotId, snapshot.registryVersion, snapshot.definitionVersion,
    'นับแยกรุ่นอายุ ' + (snapshot.includesCancelled ? 'รวมยกเลิกการสมัครแล้ว' : 'ไม่รวมรุ่นที่ยกเลิกการสมัคร')];
  const zeroLabel = ctx.age < 0 ? 'ยังไม่มีทีมสมัคร' : 'ยังไม่มีทีม ' + AGES[ctx.age];
  const coverage = (row: typeof ctx.rows[number]) => [row.districts.length, row.districts.filter(d => ctx.value(d) > 0).length, row.districts.filter(d => ctx.value(d) === 0).length];
  const header = ['รหัสจังหวัด','จังหวัด',...(ctx.district ? ['รหัสอำเภอ/เขต','อำเภอ/เขต'] : ['อำเภอ/เขตทั้งหมด','อำเภอ/เขตมีทีมสมัคร','อำเภอ/เขตยังไม่มีทีมสมัคร']),...indices.map(i => AGES[i]),'รวม (ทีม)','สถานะพื้นที่ตามรุ่นที่เลือก','ขอบเขตรายงาน','ข้อมูล ณ','snapshotId','registryVersion','definitionVersion','เกณฑ์'];
  const body: unknown[][] = ctx.rows.map(r => [r.provinceCode,ctx.district ? r.province : r.name,...(ctx.district ? [r.code,r.name] : coverage(r)),...indices.map(i => r.ages[i]),ctx.value(r),ctx.value(r) === 0 ? zeroLabel : 'มีทีมสมัครแล้ว',...metadata]);
  const summed = sum(ctx.rows);
  body.push(['','รวมตามตัวกรอง',...(ctx.district ? ['',''] : ['','','']),...indices.map(i => summed[i]),ctx.value({ ages: summed }),'',...metadata]);
  body.push(['','ยังไม่ระบุพื้นที่ในขอบเขต (รวมในยอดประเทศแล้ว; ไม่ใช่แถวพื้นที่ตามตัวกรอง)',...(ctx.district ? ['',''] : ['','','']),...indices.map(i => ctx.unassigned[i]),ctx.value({ ages: ctx.unassigned }),'ยังไม่ระบุพื้นที่',...metadata]);
  const quote = (value: unknown) => '"' + String(value).replace(/"/g, '""') + '"';
  return '\ufeff' + [header,...body].map(row => row.map(quote).join(',')).join('\r\n');
}
