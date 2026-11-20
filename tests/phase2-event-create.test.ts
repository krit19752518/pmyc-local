import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

const root=path.resolve(__dirname,'..');
const bin=process.env.PHASE2_TEST_PG_BIN || '/usr/lib/postgresql/18/bin';
const php=process.env.PHASE2_PHP_BINARY || path.join(root,'.runtime/phase2-php/php');
let directory:string;
let result:any;
function run(file:string,args:string[],env:NodeJS.ProcessEnv={PATH:process.env.PATH,LANG:'C.UTF-8'}){
  const r=spawnSync(file,args,{env,encoding:'utf8',maxBuffer:4*1024*1024});
  if(r.status!==0)throw Error(path.basename(file)+' failed: '+r.stderr+' '+r.stdout);
  return r.stdout;
}
beforeAll(()=>{
  directory=fs.mkdtempSync(path.join(os.tmpdir(),'pmyc-p2-event-test-'));
  fs.mkdirSync(path.join(directory,'socket'));
  run(path.join(bin,'initdb'),['-D',path.join(directory,'data'),'-A','trust','-U','p2test','--no-locale','--encoding=UTF8']);
  // Unix socket only, private temporary cluster: never use the application database.
  run(path.join(bin,'pg_ctl'),['-D',path.join(directory,'data'),'-l',path.join(directory,'postgres.log'),'-o',`-h '' -k ${directory}/socket -p 55469`,'-w','start']);
  result=JSON.parse(run(php,[path.join(__dirname,'fixtures/phase2-event-create.php')],{
    PATH:process.env.PATH,LANG:'C.UTF-8',PHASE2_TEST_DATABASE:'1',PHASE2_TEST_USER:'p2test',
    PHASE2_TEST_DSN:`pgsql:host=${directory}/socket;port=55469;dbname=postgres`
  }));
},30000);
afterAll(()=>{
  if(directory && fs.existsSync(path.join(directory,'data/postmaster.pid')))
    run(path.join(bin,'pg_ctl'),['-D',path.join(directory,'data'),'-m','fast','-w','stop']);
  // Keep fixture logs available on failure; no application files are removed.
});
it('explains unavailable persistence on both new/preview and rejects direct writes',()=>{
  expect(result.unconfigured[1]).toContain('ยังไม่ได้เชื่อมต่อฐานข้อมูล');
  expect(result.unconfigured[1]).toContain('disabled');
  expect(result.unconfigured_new[1]).toContain('ยังไม่ได้เชื่อมต่อฐานข้อมูล');
  expect(result.unconfigured_submit[0]).toBe(503);
  expect(result.missing_schema[1]).toContain('ตารางหรือเทมเพลท');
});
it('shows the confirmation when ready and keeps preview read-only',()=>{
  expect(result.ready).toBe(true);
  expect(result.preview[1]).toContain('action="/platform/events"');
  expect(result.preview[1]).toContain('ยืนยันสร้างรายการแข่งขัน</button>');
  expect(result.preview[1]).toContain('Fixture &lt;script&gt;');
  expect(result.before_preview).toBe(0);
  expect(result.after_preview).toBe(0);
});
it('persists once and redirects identically on retry',()=>{
  expect(result.created[0]).toBe(303);
  expect(result.retry).toEqual(result.created);
  expect(result.event_count).toBe(1);
});
it('retains role, CSRF, and validation guards',()=>{
  expect(result.forbidden[0]).toBe(403);
  expect(result.csrf[0]).toBe(403);
  expect(result.invalid[0]).toBe(422);
});
it('uses Phase1 source team IDs, excludes real teams, creates fixtures and reads dashboard',()=>{
  expect(result.roster.teams.map((t:any)=>t.source_team_id).sort()).toEqual(['phase1-demo-a','phase1-demo-b']);
  expect(result.phase1_unchanged).toBe(true);
  expect(result.match_count).toBe(1);
  expect(result.dashboard.team_count).toBe(2);
  expect(result.dashboard.match_count).toBe(1);
  expect(result.frozen_roster.teams_source).toBe('roster');
  expect(result.frozen_roster.team_count).toBe(2);
  expect(result.frozen_roster.eligible_teams.map((t:any)=>t.source_team_id).sort()).toEqual(['phase1-demo-a','phase1-demo-b']);
});
it('refuses bootstrap over existing tables without losing records',()=>{
  expect(result.repeat_rejected).toBe(true);
  expect(result.event_survived).toBe(3);
});
it('reuses Phase1 teams in a new event after closing the first, with independent fixtures',()=>{
  expect(result.second_created[0]).toBe(303);
  expect(result.second_created[2]).not.toBe(result.created[2]);
  expect(result.second_team_ids.sort()).toEqual(['phase1-demo-a','phase1-demo-b']);
  expect(result.second_dashboard.team_count).toBe(2);
  expect(result.second_dashboard.match_count).toBe(0);
  expect(result.first_dashboard_after_second.match_count).toBe(1);
  expect(result.original_draw_unchanged).toBe(true);
});
it('opens a new event with only the five v16 filters while preserving hidden event context',()=>{
  expect(result.fresh_page[0]).toBe(200);
  const html=result.fresh_page[1];
  const form=html.match(/<form class="card workspace-filters"[\s\S]*?<\/form>/)?.[0] || '';
  const labels=[...form.matchAll(/<label[^>]*>([^<]+)/g)].map(m=>m[1]);
  expect(labels).toEqual(['ฤดูกาล','รุ่นอายุ','ระดับการแข่งขัน','จังหวัด','อำเภอ/เขต']);
  expect(form).toContain('type="hidden" name="event_id" value="'+result.fresh_dashboard.event.event_id+'"');
  expect(form).toContain('type="hidden" name="data_mode" value="demo"');
  expect(form).not.toContain('type="submit"');
  expect(form).toContain('แสดงข้อมูลตามขอบเขตที่เลือกโดยอัตโนมัติ');
  expect(html).not.toContain('Fixture &lt;script&gt;');
  expect(html).not.toContain('จัดการการแข่งขันย่อย');
  expect(html).not.toContain('กลับหน้ารายการแข่งขัน');
  expect(html).not.toContain('workspace-context-row');
  expect(result.fresh_page[1]).not.toContain('ไม่มีสิทธิ์เข้าถึงรายการนี้');
  expect(result.fresh_dashboard.setup_state).toBe('needs_setup');
  expect(result.fresh_dashboard.event.division_codes).toEqual(['U14_BOY']);
  expect(Object.values(result.fresh_catalog.options.events)).toContain('Fixture <script>');
  expect(result.fresh_no_children).toBe(true);
});
it('preserves event context in the team preview and the three future menus',()=>{
  expect(result.fresh_placeholders.setup[0]).toBe(200);
  expect(result.fresh_placeholders.setup[1]).toContain('ทีมที่มีสิทธิ์เข้าร่วมการแข่งขัน');
  for(const response of Object.entries(result.fresh_placeholders).filter(([key])=>key!=='setup').map(([,value])=>value) as any[]){
    expect(response[0]).toBe(200);
    expect(response[1]).toContain('workspace-blank');
    expect(response[1]).toContain(result.fresh_dashboard.event.event_id);
    expect(response[1]).not.toContain('<form');
  }
});
it('returns 404 for missing events and 400 for contradictory event filters',()=>{
  expect(result.missing_event[0]).toBe(404);
  expect(result.missing_event_placeholder[0]).toBe(404);
  for(const response of Object.values(result.fresh_conflicts) as any[])expect(response[0]).toBe(400);
});
it('allows staff to preview source teams before assignment without exposing competition history',()=>{
  for(const role of ['SAT_OFFICER','DOCUMENT_VERIFIER']){
    expect(result.unassigned[role][0]).toBe(200);
    expect(result.unassigned_placeholder[role][0]).toBe(200);
    expect(result.unassigned[role][1]).not.toContain('Fixture &lt;script&gt;');
    expect(Object.keys(result.unassigned_catalog[role].options.events)).toEqual([result.fresh_dashboard.event.event_id]);
    expect(result.unassigned_catalog[role].match_count).toBe(0);
  }
});
it('distinguishes Stage3-only events from missing permissions and defaults to an opened division',()=>{
  expect(result.stage3_page[0]).toBe(200);
  expect(result.stage3_dashboard.setup_state).toBe('outside_workspace');
  expect(result.stage3_dashboard.filters.division_code).toBe('U18_GIRL');
  expect(result.stage3_page[1]).toContain('แดชบอร์ดการแข่งขัน');
  expect(result.stage3_page[1]).not.toContain('ยังไม่มีการแข่งขันย่อย Stage 1–2');
});
it('preserves assigned competition visibility while allowing another event source preview',()=>{
  for(const role of ['SAT_OFFICER','DOCUMENT_VERIFIER']){
    expect(result.assigned[role][0]).toBe(200);
    expect(result.assigned[role][1]).not.toContain('>จัดการการแข่งขันย่อย</a>');
    expect(Object.keys(result.assigned_catalog[role].options.events)).toEqual([result.fresh_dashboard.event.event_id]);
    expect(result.assigned_other_event[role][0]).toBe(200);
  }
});
it('commits a single pending draw and renders its stored reveal on retry or refresh',()=>{
  const c=result.ceremony;
  expect(c.missing[1]).toContain('ยังไม่มีการแข่งขันย่อย');
  expect(c.cases[0].form[1]).not.toContain('data-ceremony-form');
  for(const count of [1,3,8]){
    const draw=c.cases[count];
    expect(draw.form[1]).toContain('data-ceremony-form');
    expect(draw.post[0]).toBe(303);
    expect(draw.retry).toEqual(draw.post);
    expect(draw.history_count).toBe(1);
    expect(draw.fixture_count).toBe(count-1);
    expect(draw.status).toBe('PENDING_CONFIRMATION');
    expect(draw.refresh[1]).toContain('รอยืนยันผลจับสลาก');
    expect(draw.refresh[1]).not.toContain('data-ceremony-reveal');
  }
  expect(c.cases[1].refresh[1]).toContain('ผ่านเข้ารอบอัตโนมัติ');
  expect(c.cases[3].refresh[1]).toContain('ceremony-bracket');
  expect(c.reveal[1]).toContain('data-ceremony-reveal');
  expect(c.different_request[0]).toBe(409);
});

it('rechecks permissions, eligibility and lifecycle gates at the ceremony write',()=>{
  const c=result.ceremony;
  expect(c.wrong_mode[0]).toBe(400);
  expect(c.csrf[0]).toBe(403);
  expect(c.wrong_province[0]).toBe(403);
  expect(c.unassigned[0]).toBe(403);
  expect(c.stale[0]).toBe(409);
  expect(c.stale_draw_absent).toBe(true);
  expect(c.legacy_publish_blocked).toBe(true);
  expect(c.pending_schedule_blocked).toBe(true);
  expect(c.redraw_missing_reason[0]).toBe(400);
  expect(c.redraw[0]).toBe(303);
  expect(c.redraw_versions).toEqual([2,1]);
  expect(c.locked_redraw[0]).toBe(403);
  expect(c.stage2_waiting[1]).toContain('กรุณาล็อกรายชื่อทีมผ่านเข้ารอบ');
  expect(c.stage2_post[0]).toBe(303);
  expect(c.stage2_roster_used).toBe(true);
});

it('locks exactly the reviewed draw for its operator and enables private scheduling',()=>{
  const c=result.ceremony;
  expect(c.cases[0].empty_review[1]).toContain('ยังไม่มีผลการจับสลาก');
  expect(c.cases[1].review[1]).toContain('ผ่านเข้ารอบอัตโนมัติ');
  expect(c.cases[1].confirm[0]).toBe(303);
  expect(c.cases[8].review[1].match(/data-ceremony-pair/g)).toHaveLength(4);
  expect(c.cases[8].confirm[0]).toBe(303);
  expect(c.stage2_confirm[0]).toBe(303);
  expect(c.reveal[1]).toContain('data-ceremony-review hidden');
  expect(c.stale_confirm[0]).toBe(409);
  expect(c.stale_confirm[1]).toContain('โหลดผลล่าสุด');
  expect(c.other_review[1]).not.toContain('data-open-draw-confirm');
  expect(c.other_confirm[0]).toBe(403);
  expect(c.foreign_confirm[0]).toBe(403);
  expect(c.confirm[0]).toBe(303);
  expect(c.confirm_retry).toEqual(c.confirm);
  expect(c.confirm_again).toEqual(c.confirm);
  expect(c.confirm_count).toBe(1);
  expect(c.confirmed_state.status).toBe('CONFIRMED_LOCKED');
  expect(c.confirmed_state.actor_id).toBe('fixture-admin');
  expect(c.confirmed_state.created_at).toBeTruthy();
  expect(c.locked_review[1]).toContain('พร้อมจัดวัน เวลา และสนาม');
  expect(c.locked_review[1]).not.toContain('data-open-draw-confirm');
  expect(c.same_draw).toBe(true);
  expect(c.scheduled_after_confirm).toBe(true);
  expect(c.private_after_confirm).toBe(true);
});

it('lists schedules after draw lock and publishes selected snapshots with individual republication',()=>{
  const c=result.ceremony;
  expect(c.schedule_csrf[0]).toBe(403);
  expect(c.schedule_page[0]).toBe(200);
  expect(c.schedule_page[1]).toContain('ตารางการแข่งขัน');
  expect(c.schedule_page[1]).toContain('สถานะตาราง');
  expect(c.schedule_page[1]).toContain('พร้อมเผยแพร่');
  expect(c.schedule_page[1]).toContain('schedule-publish-form');
  expect(c.before_publication_empty).toBe(true);
  expect(c.first_publication[0]).toBe(303);
  expect(c.public_match_count_after_selection).toBe(1);
  expect(c.first_public_snapshot).toContain('2026-12-02 09:00');
  expect(c.public_schedule_page).toContain('02/12/2026');
  expect(c.public_schedule_page).toContain('09:00 – 10:00');
  expect(c.public_schedule_page).toContain('เผยแพร่ตารางแข่งขันแล้ว');
  expect(c.public_schedule_page).not.toContain('ดูก้างปลาและผลจับสลาก');
  expect(c.publication_retry[0]).toBe(303);
  expect(c.schedule_after_edit[1]).toContain('เปลี่ยนแปลงการแข่งขัน');
  expect(c.schedule_after_edit[1]).toContain('เผยแพร่กำหนดใหม่');
  expect(c.public_snapshot_unchanged).toBe(true);
  expect(c.republish[0]).toBe(303);
  expect(c.public_snapshot_after_republish).toContain('2026-12-02 09:30');
  expect(c.public_match_count_after_republish).toBe(1);
});

it('shows immutable draw history with the current and previous versions in order',()=>{
  const c=result.ceremony;
  expect(c.empty_history[1]).toContain('ยังไม่มีประวัติการจับสลาก');
  expect(c.single_history[1]).toContain('ผ่านเข้ารอบอัตโนมัติ');
  expect(c.pending_history[1]).toContain('รอยืนยันผลจับสลาก');
  expect(c.locked_review[1]).toContain('pending-history?');
  const html=c.locked_history[1];
  expect(c.locked_history[0]).toBe(200);
  expect(html).toContain('pending-result?');
  expect(html).toContain('เวอร์ชัน 2 · เวอร์ชันปัจจุบัน');
  expect(html.indexOf('เวอร์ชัน 2 · เวอร์ชันปัจจุบัน')).toBeLessThan(html.indexOf('<h2>เวอร์ชัน 1'));
  expect(html).toContain('เวอร์ชันก่อนหน้า');
  expect(html).toContain('Fixture redraw');
  expect(html).toContain('ยืนยันและล็อกเมื่อ');
  expect(html).toContain('ยืนยันและล็อกผลจับสลากแล้ว');
  expect(html).toContain('รอแข่งขันรอบหลัก');
  expect(html).not.toContain('<form');
  expect(c.history_unchanged).toBe(true);
  expect(result.legacy_history[1]).toContain('fixture-admin');
  expect(c.history_post[0]).toBe(405);
  expect(c.history_wrong_mode[0]).toBe(400);
  expect(c.history_foreign[0]).toBe(403);
  expect(c.history_unassigned[0]).toBe(403);
});

it('renders the current bracket by round and links only authorized match details',()=>{
  const c=result.ceremony;
  expect(result.empty_bracket[0]).toBe(200);
  expect(result.empty_bracket[1]).toContain('ยังไม่มีผลจับสลาก');
  const pending=c.pending_bracket[1];
  expect(c.pending_bracket[0]).toBe(200);
  expect(pending).toContain('รอยืนยันผลจับสลาก');
  expect(pending).toContain('ตำแหน่งทีมยังเปลี่ยนแปลงได้');
  expect(pending).toContain('ผู้ชนะ M');
  expect(pending).not.toContain('จัดวัน เวลา และสนาม');
  const locked=c.locked_bracket[1];
  expect(c.locked_bracket[0]).toBe(200);
  expect(locked).toContain('ยืนยันและล็อกผลจับสลากแล้ว');
  expect(locked).toContain('/matches/');
  expect(c.assigned_bracket[0]).toBe(200);
  expect(c.assigned_bracket[1]).toContain('readonly aria-readonly="true"');
  expect(c.foreign_bracket[0]).toBe(403);
  expect(c.scheduled_bracket[1]).toContain('จัดตารางแล้ว');
  expect(c.scheduled_bracket[1]).toContain('02/12/2026 09:00 น.');
  expect(c.scheduled_bracket[1]).not.toContain('<form method="post"');
  expect(c.resolved_bracket[0]).toBe(200);
  expect(c.resolved_bracket[1]).toContain(c.resolved_winner);
  expect(c.resolved_bracket[1]).not.toContain('ผู้ชนะ M1');
});

it('uses Demo source areas, real master areas and the assigned SAT province',()=>{
  const s=result.selection;
  expect(Object.keys(s.no_selection.options.provinces).sort()).toEqual(['กรุงเทพมหานคร','เชียงใหม่']);
  expect(Object.keys(s.real_options.options.provinces)).toHaveLength(77);
  expect(s.no_selection.team_count).toBeNull();
  expect(Object.keys(s.roles.DOCUMENT_VERIFIER.options.provinces).sort()).toEqual(['กรุงเทพมหานคร','เชียงใหม่']);
  expect(Object.keys(s.roles.SAT_OFFICER.options.provinces)).toEqual(['เชียงใหม่']);
  expect(s.roles.SAT_OFFICER.options.districts['แม่ริม']).toBe('แม่ริม');
  expect(s.role_setup.SAT_OFFICER[1]).toContain('readonly aria-readonly="true"');
  for(const response of Object.values(s.foreign_province) as any[])expect(response[0]).toBe(403);
  for(const response of Object.values(s.wrong_district) as any[])expect(response[0]).toBe(400);
});
it('loads the same first eight fully eligible Phase1 teams for Dashboard, preview and draw',()=>{
  const s=result.selection;
  const ids=Array.from({length:8},(_,i)=>'rank-'+String(i+1).padStart(2,'0'));
  expect(s.full_ids).toEqual(ids);
  expect(s.summary.map((t:any)=>t.source_team_id)).toEqual(ids);
  expect(s.dashboard.eligible_teams.map((t:any)=>t.source_team_id)).toEqual(ids);
  expect(s.dashboard.team_count).toBe(8);
  expect(s.dashboard.teams_source).toBe('registration');
  expect(s.summary.every((t:any)=>!('players' in t)&&!('officials' in t))).toBe(true);
  expect(s.setup[0]).toBe(200);
  expect(s.setup[1]).toContain('&lt;img src=x onerror=alert(1)&gt;');
  expect(s.setup[1]).not.toContain('<img src=x');
  expect(s.setup[1]).not.toContain('Synthetic rank-09');
  expect(s.no_implicit_competitions).toBe(true);
});
it.each([0,1,2,3,4,5,6,7,8,10])('supports %i eligible teams without requiring eight before the draw',(n)=>{
  const s=result.selection.sizes[n];
  expect(s.count).toBe(Math.min(n,8));
  expect(s.page[0]).toBe(200);
  if(n>0){
    expect(s.page[1]).toContain('เข้าสู่พิธีจับสลาก');
    expect(s.fixtures).toBe(Math.min(n,8)-1);
  }else expect(s.page[1]).not.toContain('>เข้าสู่พิธีจับสลาก');
  if(n===1)expect(s.qualifiers).toBe(1);
});
it('keeps Demo/real and Stage2 qualification separate and refreshes eligibility before drawing',()=>{
  const s=result.selection;
  expect(s.real_ids).toEqual(['real-team']);
  expect(s.stage2.eligible_teams).toBeNull();
  expect(s.stage2.filters.district).toBe('');
  expect(s.after_approval_ids[0]).toBe('invalid-pending-player');
  expect(s.after_approval_ids).toHaveLength(8);
});
it('rejects valid master areas without Demo records and handles a SAT province without Demo data',()=>{
  const s=result.selection;
  for(const response of Object.values(s.non_demo_province) as any[])expect(response[0]).toBe(400);
  for(const response of Object.values(s.non_demo_district) as any[])expect(response[0]).toBe(400);
  expect(Object.keys(s.sat_no_demo.options.provinces)).toEqual(['ภูเก็ต']);
  expect(s.sat_no_demo.options.districts).toEqual([]);
  expect(s.sat_no_demo.no_demo_area).toBe(true);
  expect(s.sat_no_demo_page[0]).toBe(200);
  expect(s.sat_no_demo_page[1]).toContain('ยังไม่มีข้อมูล Demo ในจังหวัดและรุ่นที่เลือก');
  expect(s.empty_division.options.provinces).toEqual([]);
  expect(s.empty_division.no_demo_area).toBe(true);
  expect(Object.keys(s.u16_areas.options.provinces).sort()).toEqual(['กรุงเทพมหานคร','เชียงใหม่']);
  expect(s.u16_bangkok_page[0]).toBe(200);
  expect(s.u16_bangkok_page[1]).toContain('<select name="province" id="workspace-province">');
  expect(s.u16_bangkok_page[1]).toContain('<option value="กรุงเทพมหานคร" selected>กรุงเทพมหานคร</option>');
  expect(s.u16_bangkok_page[1]).toContain('<option value="เชียงใหม่">เชียงใหม่</option>');
  expect(s.u16_bangkok_page[1]).not.toContain('<datalist');
});
it('discovers new Demo areas dynamically before approval without treating the team as eligible',()=>{
  const s=result.selection;
  expect(Object.keys(s.after_new_demo_province.options.provinces).sort()).toEqual(['กรุงเทพมหานคร','ขอนแก่น','เชียงใหม่']);
  expect(Object.keys(s.no_selection.options.provinces).sort()).toEqual(['กรุงเทพมหานคร','เชียงใหม่']);
});

it('prepares a missing ceremony scope only after an authorized explicit POST, without drawing yet',()=>{
  const p=result.ceremony.preparation;
  expect(p.page[0]).toBe(200);
  expect(p.page[1]).toContain('data-ceremony-prepare');
  expect(p.page[1]).toContain('8 ทีม');
  expect(p.page[1]).not.toContain('data-ceremony-form');
  expect(p.get_readonly).toBe(true);
  expect(p.csrf[0]).toBe(403);
  for(const page of Object.values(p.forbidden) as any[])expect(page[0]).toBe(403);
  expect(p.stage2[0]).toBe(400);
  expect(p.bad_request[0]).toBe(400);
  expect(p.no_eligible[0]).toBe(409);
  expect(result.ceremony.prepare_zero[0]).toBe(409);
  expect(p.closed[0]).toBe(409);
  expect(p.guards_readonly).toBe(true);
  expect(p.post[0]).toBe(303);
  expect(p.post[2]).toContain('/phase2demo/workspace/pending-ceremony?');
  expect(p.post[2]).toContain('competition_id=');
  expect(p.retry).toEqual(p.post);
  expect(p.new_request).toEqual(p.post);
  expect(p.only_competition_created).toBe(true);
  expect(result.ceremony.cases[8].form[1]).toContain('data-ceremony-form');
});
it('keeps the ceremony panel on refresh and offers read-only replay of the committed version',()=>{
  const c=result.ceremony.cases[8];
  expect(c.post[0]).toBe(303);
  expect(c.reveal[1]).toContain('data-ceremony-reveal');
  expect(c.reveal[1]).toContain('data-ceremony-counter');
  expect(c.reveal[1].match(/data-ceremony-ball=/g)).toHaveLength(8);
  expect(c.refresh[1]).not.toContain('data-ceremony-reveal');
  expect(c.refresh[1]).not.toContain('data-ceremony-ball=');
  expect(c.refresh[1]).toContain('มีการจับสลากไปแล้ว 1 ครั้ง');
  expect(c.refresh[1]).toContain('ประวัติการจับสลาก');
  expect(c.refresh[1]).toContain('จับฉลากอีกครั้ง');
  expect(c.refresh[1]).toContain('ถ้ามีการจับสลากอีกรอบจะต้องใส่เหตุผลด้วย');
  expect(c.refresh[1]).toContain('ก้างปลาการแข่งขัน');
  expect(c.refresh[1]).not.toContain('data-ceremony-form');
  expect(c.locked_replay[1]).toContain('ยืนยันและล็อกผลจับสลากแล้ว');
  expect(c.locked_replay[1]).toContain('data-ceremony-reveal');
  expect(c.locked_replay[1]).not.toContain('data-ceremony-form');
  expect(c.replay_history_count).toBe(1);
  expect(c.history_count).toBe(1);
});

it('renders one named ball and one bracket destination per committed team including odd and single-team draws',()=>{
  for (const count of [1,3,8]) {
    const c=result.ceremony.cases[count];
    expect(c.form[1].match(/data-ceremony-ball=/g)).toHaveLength(count);
    expect(c.reveal[1].match(/data-ceremony-ball=/g)).toHaveLength(count);
    expect(c.reveal[1].match(/data-ceremony-target=/g)).toHaveLength(count);
    for(let i=1;i<=count;i++) {
      expect(c.reveal[1]).toContain(`data-ceremony-target="A${i}" hidden`);
      expect(c.refresh[1]).toContain(`data-ceremony-target="A${i}">`);
    }
    expect(c.locked_replay?.[1] || c.reveal[1]).toContain('data-ceremony-reveal');
    expect(c.history_count).toBe(1);
  }
});

it('escapes long team labels in both ball tooltip and bracket while retaining full source text',()=>{
  const html=result.ceremony.long_team_presentation;
  expect(html).toContain('title="โรงเรียนตัวอย่างชื่อทีมฟุตบอลเยาวชนยาวมากสำหรับทดสอบหลายบรรทัด &lt;script&gt;alert(1)&lt;/script&gt;"');
  expect(html).not.toContain('<script>alert(1)</script>');
  expect(html.match(/data-ceremony-target=/g)).toHaveLength(8);
});

it('persists the complete venue master through the UI handler exactly once in disposable PostgreSQL',()=>{
 const v=result.venues;expect(v.created[0]).toBe(303);expect(v.retry).toEqual(v.created);
 expect(v.duplicate_status).toBe(409);expect(v.count_delta).toBe(1);expect(v.audit_count).toBe(1);
 expect(v.complete).toBe(true);expect(v.visible).toBe(true);expect(v.foreign_hidden).toBe(true);
 expect(v.listing[0]).toBe(200);expect(v.listing[1]).toContain('สนาม fixture96');
});

it.each(['end','start','format','reason','venue','foreign','outside','stale','started','cancelled','overlap','unlocked','context','stale_invalid'])('keeps schedule %s failures in the new shell without partial DB/history/audit writes',name=>{
 const e=result.ceremony.schedule_save.errors[name];
 expect(e.status).toBe(['stale','started','cancelled','overlap','unlocked'].includes(name)?409:422);
 expect(e.new_shell).toBe(true);expect(e.legacy_css).toBe(false);expect(e.alert).toBe(true);
 expect(e.unchanged).toBe(true);expect(e.transaction_closed).toBe(true);expect(e.unsafe).toBe(false);
 if(name==='stale_invalid')expect(e.stale_version_preserved).toBe(true);
 if(['stale','overlap'].includes(name)){expect(e.disabled).toBe(true);expect(e.reload).toBe(true);expect(e.escaped).toBe(true);}
});
it('commits schedule POST, follows the contextual redirect and renders persisted values in the new design',()=>{
 const s=result.ceremony.schedule_save;
 expect(s.saved.status).toBe(303);expect(s.change_delta).toBe(1);expect(s.audit_delta).toBe(1);
 expect(s.stored.state).toBe('SCHEDULED');expect(s.stored.venue_id).toMatch(/^[a-f0-9-]{36}$/);
 expect(s.stored.scheduled_start).toContain('2026-12-02 09:00');expect(s.stored.scheduled_end).toContain('2026-12-02 10:00');
 expect(s.follow.status).toBe(200);expect(s.follow.new_shell).toBe(true);expect(s.follow.success).toBe(true);
 expect(s.follow.start).toBe('2026-12-02T09:00');expect(s.follow.end).toBe('2026-12-02T10:00');
 expect(s.follow_context.data_mode).toBe('demo');expect(s.follow_context.competition_id).toBe(s.stored.competition_id);
 expect(s.follow_context.event_id).toBe(result.selection.event_id);expect(s.follow_context.province).toBe('เชียงใหม่');
 expect(s.follow_context.district).toBeTruthy();expect(s.refresh.new_shell).toBe(true);expect(s.refresh.start).toBe(s.follow.start);
 expect(s.stale_success.success).toBe(false);
});
it('keeps schedule request idempotency, CSRF, roles and conflict reload rules',()=>{
 const s=result.ceremony.schedule_save;
 expect(s.retry.location).toBe(s.saved.location);expect(s.retry_unchanged).toBe(true);
 expect(s.request_conflict.status).toBe(409);expect(s.request_conflict.disabled).toBe(true);expect(s.conflict_unchanged).toBe(true);
 expect(s.csrf).toBe(403);expect(s.forbidden).toBe(403);expect(s.guard_unchanged).toBe(true);
});
