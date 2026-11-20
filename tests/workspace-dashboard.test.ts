import fs from 'node:fs';
import path from 'node:path';
import { spawnSync, spawn, ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { createHash, createHmac, randomBytes } from 'node:crypto';

const root=path.resolve(__dirname,'..');
const php=process.env.PHASE2_PHP_BINARY || path.join(root,'.runtime/phase2-php/php');
function fixture(name:string):any {
  const result=spawnSync(php,[path.join(__dirname,'fixtures/issue65-dashboard.php'),name],{
    cwd:root,encoding:'utf8',maxBuffer:4*1024*1024,
    // Do not inherit any database URL, bridge key, or operational credentials.
    env:{PATH:process.env.PATH,LANG:'C.UTF-8'}
  });
  if(result.status!==0)throw new Error('PHP synthetic fixture failed: '+name+': '+(result.stderr || result.error?.message));
  return JSON.parse(result.stdout);
}

describe('issue65 v16 workspace dashboard and blank navigation',()=>{
  it('renders the v17.1 shell with the official logo and actual role without a demo role switch',()=>{
    const {response}=fixture('context');
    expect(response[0]).toBe(200);
    const html=response[1];
    expect(html).toContain('class="workspace-v17" data-workspace-v16');
    expect(html).toContain('src="/assets/img/pmyc_top_logo.png"');
    expect(html).toContain('class="site-header"');
    expect(html).toContain('class="utility-bar"');
    expect(html).toContain('class="sidebar-close"');
    expect(html).toContain('aria-controls="workspace-navigation"');
    expect(html).not.toContain('data-action="demo-role"');
    const css=fs.readFileSync(path.join(root,'phase2/public/assets/workspace.css'),'utf8');
    expect(css).toContain('font-size:16px;font-weight:400;line-height:24px');
    expect(css).toContain('@media(max-width:600px)');
    expect(css).toContain('.workspace-v17 .nav-sub .nav-link{font-size:14px');
  });

  it('starts Dashboard filters blank and suppresses statistics while preserving event context',()=>{
    const [status,html]=fixture('dashboard-clear').response;
    expect(status).toBe(200);
    expect(html).toMatch(/ตารางการแข่งขัน<\/a><button[^>]*data-dashboard-clear>ล้างข้อมูล<\/button>/);
    expect(html).toContain('กรุณาเลือกตัวกรองให้ครบเพื่อแสดงสถิติ');
    expect(html).not.toContain('ทีมในขอบเขตที่เลือก');
    expect(html).toContain('name="event_id" value="00000000-0000-4000-8000-000000005000"');
    for(const name of ['season_id','division_code','stage','province','district']) {
      const control=html.match(new RegExp('<select name="'+name+'"[^>]*>([\\s\\S]*?)</select>'))?.[1] || '';
      expect(control).toMatch(/^<option value="">/);
      expect(control).not.toContain(' selected');
    }
  });
  it('keeps the account province read-only when clearing the Dashboard',()=>{
    const [status,html]=fixture('dashboard-sat-clear').response;
    expect(status).toBe(200);
    expect(html).toContain('name="province" autocomplete="off" value="เชียงใหม่" readonly aria-readonly="true"');
    expect(html).toContain('กรุณาเลือกตัวกรองให้ครบเพื่อแสดงสถิติ');
  });
  it('keeps partial selections without displaying statistics and shows them only when complete',()=>{
    const partial=fixture('dashboard-partial').response;
    expect(partial[0]).toBe(200);expect(partial[1]).toContain('value="U14_BOY" selected');
    expect(partial[1]).toContain('กรุณาเลือกตัวกรองให้ครบเพื่อแสดงสถิติ');
    const complete=fixture('dashboard-complete').response;
    expect(complete[0]).toBe(200);expect(complete[1]).toContain('ทีมในขอบเขตที่เลือก');
    expect(complete[1]).not.toContain('กรุณาเลือกตัวกรองให้ครบเพื่อแสดงสถิติ');
  });

  it('counts all 250 authorized scopes in a consistent read-only snapshot with a separate event catalog',()=>{
    const r=fixture('large');
    expect(r.data.scope_count).toBe(250);
    expect(r.data.team_count).toBe(500);
    expect(r.data.match_count).toBe(250);
    expect(r.data.confirmed_count).toBe(125);
    expect(r.data.matches).toHaveLength(4);
    expect(r.data.activity).toHaveLength(4);
    expect(r.queries).toHaveLength(6);
    expect(r.queries[0].sql).not.toContain('LIMIT 200');
    expect(r.commands).toContain('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY');
    expect(r.rollbacks).toBe(1);
    expect(r.queries.every((q:any)=>/^\s*SELECT\b/i.test(q.sql))).toBe(true);
    expect(r.queries[1].sql).not.toContain('r.*');
    expect(r.html).toContain('50%');
  });

  it('retains the legacy list limit without changing the dashboard total',()=>{
    expect(fixture('legacy-limit').count).toBe(200);
  });

  it('keeps publication unavailable rather than treating scheduled/published draws as schedule publication',()=>{
    const {html}=fixture('large');
    const cards=[...html.matchAll(/<div class="kpi[^"]*" data-publication-unavailable>[\s\S]*?(?=<div class="kpi">)/g)];
    expect(cards.length).toBeGreaterThan(0);
    expect((html.match(/data-publication-unavailable/g)||[])).toHaveLength(2);
    expect(html).toContain('ยังไม่มีข้อมูลสถานะตาราง');
    expect(html).toContain('class="kpi-value">—<small>คู่');
    expect(html).not.toContain('IN_PROGRESS');
    expect(html).not.toContain('CONFIRMED_LOCKED');
  });

  it('retains U18 girls and filters the same dataset for every summary',()=>{
    const r=fixture('girl');
    expect(r.data.filters.division_code).toBe('U18_GIRL');
    expect(r.data.scope_count).toBe(1);
    expect(r.data.team_count).toBe(2);
    expect(r.html).toContain('value="U18_GIRL" selected');
    expect(r.html).toContain('U18 หญิง');
  });

  it('does not carry a district into Stage2 or import from registration for that stage',()=>{
    const r=fixture('stage2');
    expect(r.data.filters.district).toBe('');
    expect(r.data.scope_count).toBe(1);
    expect(r.html).toContain('name="district" disabled');
    expect(r.queries.some((q:any)=>q.sql.includes("status='APPROVED'")||q.sql.includes('FROM football_player'))).toBe(false);
  });

  it.each([['season','2570/71'],['real','ข้อมูลจริง']])('separates %s context from other seasons or demo data',(name,label)=>{
    const r=fixture(name);
    expect(r.data.scope_count).toBe(1);
    expect(r.data.team_count).toBe(2);
    expect(r.html).toContain(label);
    expect(r.data.filters.data_mode).toBe(name==='real'?'real':'demo');
  });

  it('does not misreport absent roster/fixtures as zero eligible teams or a fabricated percentage',()=>{
    const r=fixture('no-roster');
    expect(r.data.team_count).toBeNull();
    expect(r.data.match_count).toBe(0);
    expect(r.html).toContain('ยังไม่มีข้อมูลทีมในขอบเขตนี้');
    expect(r.html).toContain('ยังไม่มีข้อมูลคู่แข่งขันสำหรับคำนวณ');
    expect(r.html).not.toContain('>0%</b>');
    expect(r.html).not.toContain('<progress');
  });

  it('uses the existing assignment/province visibility predicate for SAT',()=>{
    const r=fixture('sat');
    expect(r.data.filters.province).toBe('เชียงใหม่');
    expect(r.queries[0].sql).toContain("jsonb_exists(a.permissions,'view')");
    expect(r.queries[0].sql).toContain('c.province=? AND c.stage IN (1,2)');
    expect(r.queries[0].values).toEqual(['sat-1','SAT_OFFICER','เชียงใหม่']);
    expect(r.html).toContain('readonly aria-readonly="true"');
    expect(r.html).not.toContain('data-action="demo-role"');
  });

  it.each(['foreign-province','foreign-context'])('rejects %s without exposing another province',(name)=>{
    const r=fixture(name);
    expect(r.response[0]).toBe(403);
    expect(r.response[1]).not.toContain('ปทุมวัน');
    expect(r.response[1]).not.toContain('สนามทดสอบ');
    expect(r.commands).toEqual([]);
  });

  it('authorizes a contextual match placeholder without running aggregates',()=>{
    const r=fixture('context');
    expect(r.response[0]).toBe(200);
    expect(r.response[1]).toContain('workspace-blank');
    expect(r.queries).toHaveLength(2);
    expect(r.commands).toEqual([]);
  });

  it.each(['bad-filter','conflicting-event'])('rejects malformed or contradictory %s filters',(name)=>{
    expect(fixture(name).response[0]).toBe(400);
  });

  it('routes the implemented bracket and keeps the two future destinations blank',()=>{
    const r=fixture('blank');
    expect(Object.keys(r.responses)).toHaveLength(3);
    expect(r.responses.bracket[0]).toBe(503);
    expect(r.responses.bracket[1]).toContain('ยังไม่ได้เชื่อมข้อมูลการแข่งขัน');
    expect(r.responses.schedule[0]).toBe(503);
    expect(r.responses.schedule[1]).toContain('ตารางการแข่งขัน');
    expect(r.responses.schedule[1]).not.toContain('workspace-blank');
    for(const key of ['detail']){
      const response=r.responses[key];
      expect(response[0]).toBe(200);
      expect(response[1]).toContain('workspace-blank');
      expect(response[1]).toContain('/assets/workspace.css');
      expect(response[1]).not.toContain('<form');
      expect(response[1]).not.toContain('data-draw-ceremony');
      expect(response[1]).not.toContain('โหมดทดลอง');
    }
    expect(r.queries).toEqual([]);
  });

  it('keeps anonymous and POST guards on the new pages',()=>{
    expect(fixture('anonymous').response[0]).toBe(403);
    expect(fixture('post').response[0]).toBe(403);
  });

  it('leaves the old functional workspace route and layout available',()=>{
    const r=fixture('legacy');
    expect(r.response[0]).toBe(200);
    expect(r.response[1]).toContain('/assets/app.css');
    expect(r.response[1]).not.toContain('/assets/workspace.css');
  });

  it('rolls back failed read snapshots and hides database error details',()=>{
    const r=fixture('error');
    expect(r.response[0]).toBe(503);
    expect(r.response[1]).not.toContain('PRIVATE_DATABASE_DETAIL');
    expect(r.rollbacks).toBe(1);
  });

  it('escapes account and team values and retains session metadata/contextual links',()=>{
    const {response}=fixture('render');
    expect(response[0]).toBe(200);
    const html=response[1];
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('data-expires=');
    expect(html).toContain('pending-detail?');
    expect(html).toContain('match_id=');
    expect(html).not.toContain('style=');
    expect(html).toContain('/phase2demo/logout');
  });

  it('serves dedicated CSP-compatible assets without changing legacy asset registrations',()=>{
    const router=fs.readFileSync(path.join(root,'phase2/public/router.php'),'utf8');
    const css=fs.readFileSync(path.join(root,'phase2/public/assets/workspace.css'),'utf8');
    const js=fs.readFileSync(path.join(root,'phase2/public/assets/workspace.js'),'utf8');
    expect(router).toContain("'/phase2demo/assets/workspace.css'");
    expect(router).toContain("'/phase2demo/assets/workspace.js'");
    expect(router).toContain("'/phase2demo/assets/app.css'");
    expect(css).not.toContain('@import');
    expect(css).toContain('/assets/fonts/Prompt-');
    expect(css).toContain('/assets/fonts/NotoSansThai-Variable-5a1c559b.ttf');
    expect(fs.existsSync(path.join(root,'phase2/public/assets/fonts/NotoSansThai-OFL.txt'))).toBe(true);
    expect(js).not.toContain('localStorage');
    expect(js).not.toContain('method: \'POST\'');
    expect(js).toContain('requestSubmit');
  });
});

describe('issue65 actual PHP bridge with synthetic identity and no database',()=>{
  let server:ChildProcess;
  let port:number;
  const secret=randomBytes(32).toString('hex');
  beforeAll(async()=>{
    port=await new Promise<number>((resolve,reject)=>{
      const socket=createServer();socket.once('error',reject);
      socket.listen(0,'127.0.0.1',()=>{const value=(socket.address() as any).port;socket.close(()=>resolve(value));});
    });
    await new Promise<void>((resolve,reject)=>{
      server=spawn(php,['-S','127.0.0.1:'+port,'-t',path.join(root,'phase2/public'),path.join(root,'phase2/public/router.php')],{
        cwd:path.join(root,'phase2'),env:{PATH:process.env.PATH,LANG:'C.UTF-8',PMYC_PHASE2_BRIDGE_SECRET:secret},
        stdio:['ignore','ignore','pipe']
      });
      const timer=setTimeout(()=>reject(new Error('Synthetic PHP server not ready')),5000);
      server.once('error',error=>{clearTimeout(timer);reject(error);});
      server.stderr?.on('data',data=>{if(data.toString().includes('Development Server')){clearTimeout(timer);resolve();}});
      server.once('exit',code=>{clearTimeout(timer);if(code)reject(new Error('Synthetic PHP server exit '+code));});
    });
  },10000);
  afterAll(async()=>{
    if(server&&server.exitCode===null)await new Promise<void>(resolve=>{server.once('exit',()=>resolve());server.kill('SIGTERM');});
  });
  async function signed(url:string,method='GET',actor:any={id:'synthetic-admin',name:'Fixture User',role:'SUPER_ADMIN',portal:'central',province:null}){
    const context=Buffer.from(JSON.stringify({actor,expiresAt:Date.now()+60000,ambiguous:false,csrf:'fixture-only'})).toString('base64url');
    const stamp=String(Date.now()),nonce=randomBytes(16).toString('hex');
    const body=method==='POST'?'{}':'';
    const signature=createHmac('sha256',secret).update([stamp,nonce,method,url,createHash('sha256').update(body).digest('hex'),context].join('\n')).digest('hex');
    return fetch('http://127.0.0.1:'+port+url,{method,body:body||undefined,headers:{
      'x-pmyc-time':stamp,'x-pmyc-nonce':nonce,'x-pmyc-context':context,'x-pmyc-signature':signature,
      'content-type':'application/json'
    },redirect:'manual'});
  }
  it('renders new Dashboard and blank menus through the real router without needing a database',async()=>{
    const page=await signed('/phase2demo/workspace/dashboard');
    expect(page.status).toBe(200);const html=await page.text();
    expect(html).toContain('data-workspace-v16');expect(html).toContain('ยังไม่ได้เชื่อมข้อมูลการแข่งขัน');
    expect(html).toContain('/phase2demo/assets/workspace.js?v=ceremony-teams-2');
    expect(html).not.toContain('/phase2demo/assets/workspace.js?v=65-6');
    expect(page.headers.get('content-security-policy')).toContain("style-src 'self'");
    const schedule=await signed('/phase2demo/workspace/pending-schedule');
    expect(schedule.status).toBe(503);expect(await schedule.text()).toContain('ตารางการแข่งขัน');
  });
  it('serves dedicated CSS/JS/local font with exact bytes via the signed asset allowlist',async()=>{
    for(const [url,file] of [
      ['/phase2demo/assets/workspace.css','workspace.css'],
      ['/phase2demo/assets/workspace.js','workspace.js'],
      ['/phase2demo/assets/fonts/NotoSansThai-Variable-5a1c559b.ttf','fonts/NotoSansThai-Variable-5a1c559b.ttf']
    ]){
      const response=await signed(url);expect(response.status).toBe(200);
      expect(Buffer.from(await response.arrayBuffer())).toEqual(fs.readFileSync(path.join(root,'phase2/public/assets',file)));
    }
  });
  it('rejects unsigned bridge requests, unauthenticated data requests, and placeholder writes',async()=>{
    expect((await fetch('http://127.0.0.1:'+port+'/phase2demo/assets/workspace.css')).status).toBe(403);
    expect((await signed('/phase2demo/workspace/dashboard','GET',null)).status).toBe(403);
    expect((await signed('/phase2demo/workspace/pending-ceremony','GET')).status).toBe(200);
    expect((await signed('/phase2demo/workspace/pending-ceremony','POST')).status).toBe(403);
    expect((await signed('/phase2demo/workspace/pending-result','GET')).status).toBe(200);
    expect((await signed('/phase2demo/workspace/pending-result','POST')).status).toBe(403);
    expect((await signed('/phase2demo/workspace/pending-history','GET')).status).toBe(200);
    expect((await signed('/phase2demo/workspace/pending-history','POST')).status).toBe(405);
  });
});
