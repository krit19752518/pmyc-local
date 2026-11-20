import path from 'node:path';
import {spawnSync} from 'node:child_process';
const root=path.resolve(__dirname,'..');
function render(name:string):any {
 const php=process.env.PHASE2_PHP_BINARY||path.join(root,'.runtime/phase2-php/php');
 const r=spawnSync(php,[path.join(root,'tests/fixtures/issue91-match-detail.php'),name],{cwd:root,encoding:'utf8',env:{PATH:process.env.PATH,LANG:'C.UTF-8'}});
 if(r.status!==0)throw Error(r.stderr||r.error?.message);return JSON.parse(r.stdout);
}
describe('issue91 contextual v17.1 match detail',()=>{
 it('renders the functional detail route in the current staff shell with canonical navigation',()=>{
  const {response:[status,html],queries}=render('schedule');
  expect(status).toBe(200);expect(html).toContain('data-match-detail-v17');expect(html).toContain('workspace-v17');
  expect(html).toContain('รายละเอียดการแข่งขัน · M01');expect(html).toContain('กำหนดการแข่งขัน');
  expect(html).toContain('ข้อมูลหลังการแข่งขัน');expect(html).toContain('ประวัติการดำเนินการ');
  expect(html).toContain('match-detail-hero');expect(html).toContain('กลับตารางการแข่งขัน');
  expect(html).not.toContain('/assets/app.css');expect(html).not.toContain('workspace-blank');
  expect(html).toMatch(/nav-link active[^>]+pending-schedule/);
  expect(html).toContain('name="version" value="7"');expect(html).toContain('name="_csrf" value="synthetic-only"');
  expect(html).toContain('name="operation" value="schedule"');expect(html).toContain('name="start_date_th"');
  const back=html.match(/href="([^"]+)">(?:<svg[^>]*><path[^>]*\/><\/svg>)?กลับตารางการแข่งขัน/)![1];
  const url=new URL(back.replace(/&amp;/g,'&'),'https://test.invalid');
  expect(url.pathname).toBe('/phase2demo/workspace/pending-schedule');
  expect(url.searchParams.get('district')).toBe('จอมทอง');expect(url.searchParams.get('data_mode')).toBe('demo');
  expect(url.searchParams.get('season_id')).toBe('00000000-0000-4000-8000-000000000005');
  expect(url.searchParams.has('match_id')).toBe(false);
  expect(html).toContain('&lt;script&gt;bad&lt;/script&gt;');expect(html).not.toContain('<script>bad');
  expect(queries.every((sql:string)=>sql.startsWith('SELECT'))).toBe(true);
 });
 it.each(['post','audit','results','lineups'])('keeps %s navigation in the current shell without inventing records',name=>{
  const {response:[status,html]}=render(name);expect(status).toBe(200);expect(html).toContain('data-match-detail-v17');
  expect(html).not.toContain('/assets/app.css');expect(html).toContain('data_mode=demo');
  if(name==='audit'){expect(html).toContain('ยังไม่มีการดำเนินการ');expect(html).not.toContain('<form');}
  if(name==='post')expect(html).toContain('ยังไม่มีผลการแข่งขันที่ยืนยัน');
 });
 it.each(['unlocked','unresolved','started','viewer'])('preserves the schedule write gate for %s',name=>{
  const {response:[status,html]}=render(name);expect(status).toBe(200);expect(html).toContain('data-match-detail-v17');
  expect(html).not.toContain('name="operation" value="schedule"');
 });
 it('allows a correctly assigned provincial officer to view the same contextual match',()=>{
  const {response:[status,html]}=render('sat');expect(status).toBe(200);expect(html).toContain('name="operation" value="schedule"');
 });
 it.each(['wrong-event','wrong-season','wrong-mode','wrong-match','bad-tab'])('rejects contradictory %s context before any writes',name=>{
  const {response,queries}=render(name);expect(response[0]).toBe(422);
  expect(queries.every((sql:string)=>sql.startsWith('SELECT'))).toBe(true);
 });
 it.each([['anonymous',403],['foreign',403],['missing',404],['csrf',403],['public',404]])('guards %s independently of presentation',(name,status)=>{
  expect(render(String(name)).response[0]).toBe(status);
 });
});
