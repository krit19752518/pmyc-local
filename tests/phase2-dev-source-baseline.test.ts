import path from 'node:path';
import {spawnSync} from 'node:child_process';
const root=path.resolve(__dirname,'..');
function fixture(name:string):any{
 const php=process.env.PHASE2_PHP_BINARY||path.join(root,'.runtime/phase2-php/php');
 const r=spawnSync(php,[path.join(root,'tests/fixtures/issue65-dashboard.php'),name],{cwd:root,encoding:'utf8',env:{PATH:process.env.PATH,LANG:'C.UTF-8'}});
 if(r.status!==0)throw Error(r.stderr||r.error?.message);return JSON.parse(r.stdout);
}
function select(html:string,name:string):string{return html.match(new RegExp('<select\\b(?=[^>]*\\bname="'+name+'")[^>]*>([\\s\\S]*?)</select>'))?.[1]||'';}
describe('published Dev entry and filter reset source',()=>{
 it.each(['root','root-slash'])('routes authenticated %s to the current dashboard with context',name=>{
  const r=fixture('source-'+name);expect(r.response[0]).toBe(302);
  const u=new URL(r.response[2],'https://test.invalid');expect(u.pathname).toBe('/phase2demo/workspace/dashboard');
  expect(u.searchParams.get('event_id')).toBe('00000000-0000-4000-8000-000000005000');
  expect(u.searchParams.get('data_mode')).toBe('demo');expect(u.searchParams.has('dashboard_filters')).toBe(false);
  expect(r.queries).toEqual([]);
 });
 it.each([['root-anonymous',302],['root-post',405],['root-role',403],['root-mode',400],['root-foreign',403]])('retains the %s boundary',(name,status)=>{
  const r=fixture('source-'+name);expect(r.response[0]).toBe(status);expect(r.queries).toEqual([]);
  if(name==='root-anonymous')expect(r.response[2]).toBe('/phase2demo/login');
 });
 it('keeps explicit public navigation public including mode-switch intent',()=>{
  const [status,html]=fixture('source-root-public').response;expect(status).toBe(200);
  expect(html).toContain('mode=demo&amp;view=fixtures');expect(html).not.toContain('class="workspace-v17"');
 });
 it.each(['setup','bracket','schedule'])('clears visible %s fields without losing hidden event/mode',page=>{
  const {response:[status,html]}=fixture('source-'+page+'-clear');expect(status).toBe(200);
  for(const name of ['season_id','division_code','stage','province','district']){
   const control=select(html,name);expect(control).toMatch(/^<option value="">/);expect(control).not.toContain(' selected');
  }
  const clear=html.match(/href="([^"]+)">ล้างข้อมูล<\/a>/)![1].replace(/&amp;/g,'&');
  const u=new URL(clear,'https://test.invalid');expect([...u.searchParams.keys()].sort()).toEqual(['data_mode','event_id']);
  expect(u.searchParams.get('data_mode')).toBe('demo');expect(html).not.toContain('data-draw-ceremony');
  expect(html).toContain('name="event_id"');expect(html).toContain('name="data_mode"');
  for(const name of ['setup','bracket','schedule']){
   const links=[...html.matchAll(new RegExp('href="([^"]*pending-'+name+'[^"]*)"','g'))].map(m=>new URL(m[1].replace(/&amp;/g,'&'),'https://test.invalid'));
   expect(links.length).toBeGreaterThan(0);expect(links.some(x=>[...x.searchParams.keys()].sort().join(',')==='data_mode,event_id')).toBe(true);
  }
 });
 it('retains the assigned provincial field while all editable setup values are clear',()=>{
  const [status,html]=fixture('source-setup-sat-clear').response;expect(status).toBe(200);
  expect(html).toContain('value="เชียงใหม่" readonly aria-readonly="true"');
  for(const name of ['season_id','division_code','stage','district'])expect(select(html,name)).not.toContain(' selected');
  expect(html).toContain('กรุณาเลือกตัวกรองให้ครบ');
 });
 it('keeps explicit setup selections rather than replacing them with display defaults',()=>{
  const [status,html]=fixture('source-setup-complete').response;expect(status).toBe(200);
  for(const [name,value] of [['season_id','00000000-0000-4000-8000-000000006000'],['division_code','U14_BOY'],['stage','1'],['province','เชียงใหม่'],['district','แม่ริม']])
   expect(select(html,name)).toContain('value="'+value+'" selected');
 });
 it.each(['bracket','schedule'])('does not infer season or stage from partial %s inputs',page=>{
  const [status,html]=fixture('source-'+page+'-partial').response;expect(status).toBe(200);
  expect(select(html,'division_code')).toContain('value="U14_BOY" selected');
  expect(select(html,'season_id')).not.toContain(' selected');expect(select(html,'stage')).not.toContain(' selected');
  expect(html).not.toContain('class="schedule-table"');expect(html).not.toContain('class="bracket-match"');
 });
});
