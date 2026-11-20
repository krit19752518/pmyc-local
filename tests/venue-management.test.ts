import path from 'node:path';
import {spawnSync} from 'node:child_process';
const root=path.resolve(__dirname,'..');
let result:any;
beforeAll(()=>{
 const php=process.env.PHASE2_PHP_BINARY||path.join(root,'.runtime/phase2-php/php');
 const r=spawnSync(php,[path.join(root,'tests/fixtures/issue96-venues.php')],{cwd:root,encoding:'utf8',env:{PATH:process.env.PATH,LANG:'C.UTF-8'}});
 if(r.status!==0)throw Error(r.stderr||r.error?.message);result=JSON.parse(r.stdout);
});
it('shows a complete venue form, empty state, workspace navigation and geographic dependency',()=>{
 const [status,html]=result.empty;expect(status).toBe(200);expect(html).toContain('workspace-v17');
 expect(html).toContain('data-venue-form');expect(html).toContain('ยังไม่มีสนามแข่งขัน');
 for(const name of ['name','province','district','_csrf','request_id'])expect(html).toContain(`name="${name}"`);
 for(const name of ['id','created_by','created_at','request_hash'])expect(html).not.toContain(`name="${name}"`);
 expect(html.indexOf('thai-administrative-divisions.js')).toBeLessThan(html.indexOf('/assets/app.js'));
 expect(html).toMatch(/nav-link active[^>]+platform\/venues/);
 expect(html).toContain('ทั้งรายการจริงและ Demo');
 const nav=result['admin-nav'][1];expect(nav.indexOf('>ตารางการแข่งขัน</a>')).toBeLessThan(nav.indexOf('>จัดการสนามแข่งขัน</a>'));
 expect(nav).toContain('data_mode=demo');
});
it('saves once, preserves navigation, and uses server-owned identity and audit',()=>{
 expect(result.created[0]).toBe(303);expect(result.retry).toEqual(result.created);
 const url=new URL(result.created[2],'https://test.invalid');expect(url.pathname).toBe('/platform/venues');
 expect(url.searchParams.get('event_id')).toBe('00000000-0000-4000-8000-000000000002');expect(url.searchParams.get('saved')).toBe('1');
 expect(result.venue_count).toBe(1);expect(result.audit_count).toBe(1);expect(result.changed_request_count).toBe(1);
 expect(result.venue.created_by).toBe('fixture-admin');expect(result.venue.id).toMatch(/^[a-f0-9-]{36}$/);
 expect(result.venue.name).toBe('สนามทดสอบ <script>bad</script>');expect(result.venue.request_hash).toMatch(/^[a-f0-9]{64}$/);
 expect(result['no-context'][2]).toBe('/platform/venues?saved=1');
});
it('renders saved venues safely and makes them available to the existing province dropdown reader',()=>{
 const html=result.listing[1];expect(html).toContain('บันทึกสนามแข่งขันเรียบร้อยแล้ว');
 expect(html).toContain('สนามทดสอบ &lt;script&gt;bad&lt;/script&gt;');expect(html).not.toContain('<script>bad');
 expect(result.province_venues).toHaveLength(1);expect(result.province_venues[0].id).toBe(result.venue.id);
 expect(result.foreign_venues).toEqual([]);
});
it.each(['empty-name','long-name','bad-province','bad-district','array','control','bad-request','bad-query'])('rejects %s without saving',name=>{
 expect(result[name][0]).toBe(422);
});
it('retains editable values and a valid request on validation and duplicate conflicts',()=>{
 expect(result.duplicate[0]).toBe(409);expect(result.request_conflict[0]).toBe(409);
 expect(result.duplicate[1]).toContain('role="alert"');expect(result.duplicate[1]).toContain('value="เชียงใหม่" selected');
 expect(result.duplicate[1]).toContain('value="หางดง" selected');expect(result.duplicate[1]).toContain('value="  สนามทดสอบ &lt;script&gt;bad&lt;/script&gt;  "');
});
it.each(['SAT_OFFICER','DOCUMENT_VERIFIER'])('hides the menu and denies direct GET/POST for %s',role=>{
 expect(result[role][0]).toBe(403);expect(result[role+'-post'][0]).toBe(403);
 expect(result[role+'-nav'][1]).not.toContain('/platform/venues');
});
it('retains anonymous, CSRF and method guards',()=>{
 expect(result.anonymous[0]).toBe(403);expect(result.csrf[0]).toBe(403);expect(result.method[0]).toBe(405);
});
