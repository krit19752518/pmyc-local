import path from 'node:path';
import {spawnSync} from 'node:child_process';
const root=path.resolve(__dirname,'..');
function render(name:string):any {
 const php=process.env.PHASE2_PHP_BINARY||path.join(root,'.runtime/phase2-php/php');
 const r=spawnSync(php,[path.join(root,'tests/fixtures/issue91-match-detail.php'),name],{cwd:root,encoding:'utf8',env:{PATH:process.env.PATH,LANG:'C.UTF-8'}});
 if(r.status!==0)throw Error(r.stderr||r.error?.message);return JSON.parse(r.stdout);
}
it.each(['save-end','save-start','save-reason','save-venue'])('keeps %s validation in the new match design and retains editable values',name=>{
 const {response:[status,html],queries}=render(name);expect(status).toBe(422);
 expect(html).toContain('data-match-detail-v17');expect(html).toContain('workspace-v17');expect(html).not.toContain('/assets/app.css');
 expect(html).toContain('role="alert"');expect(html).toContain('ยังไม่ได้บันทึก');
 expect(html).toContain('name="operation" value="schedule"');
 expect(html).toContain('data_mode=demo');expect(html).toContain('name="end" value="2026-11-21T');
 if(name!=='save-reason')expect(html).toContain('value="แก้เวลา &lt;script&gt;typed&lt;/script&gt;"');
 if(name!=='save-venue')expect(html).toMatch(/value="00000000-0000-4000-8000-000000000006" selected/);
 expect(html).not.toContain('<script>typed');
 expect(queries.every((sql:string)=>sql.startsWith('SELECT'))).toBe(true);
});
it('rejects contradictory POST context in the staff shell before repository writes',()=>{
 const {response:[status,html],queries}=render('save-context');expect(status).toBe(422);
 expect(html).toContain('workspace-v17');expect(html).not.toContain('/assets/app.css');expect(html).not.toContain('<form');
 expect(html).toContain('data_mode=demo');expect(queries.every((sql:string)=>sql.startsWith('SELECT'))).toBe(true);
});
it('shows a committed-version success message and suppresses stale success markers',()=>{
 expect(render('saved').response[1]).toContain('บันทึกตารางแข่งขันเรียบร้อยแล้ว');
 expect(render('stale-saved').response[1]).not.toContain('บันทึกตารางแข่งขันเรียบร้อยแล้ว');
});

it('preserves the submitted version after422 so correcting invalid input cannot overwrite a concurrent edit',()=>{
 const {response:[status,html]}=render('save-stale-invalid');expect(status).toBe(422);
 const form=(html.match(/<form\b[^>]*>[\s\S]*?<\/form>/g)||[]).find((f:string)=>f.includes('name="operation" value="schedule"'));
 expect(form).toBeDefined();expect(form).toContain('name="version" value="6"');expect(form).not.toContain('name="version" value="7"');
});
