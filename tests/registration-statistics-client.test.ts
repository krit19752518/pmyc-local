import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { buildStatistics } from '../src/services/registrationStatistics.service';
import { BANGKOK_ZONES } from '../src/services/registrationStatistics.registry';
import { statisticsCsv } from '../src/services/registrationStatistics.export';
const approved=require('./fixtures/issue72-approved-statistics.json');
const script=fs.readFileSync(path.join(__dirname,'../public/assets/registration-statistics/app.js'),'utf8');
// Execute the shipped client logic with an in-memory DOM adapter. This is not browser/visual QA.
async function client(hash='', payload?: any, ok=true) {
  const nodes=new Map<string,any>(), events:Record<string,Function>={}, windowEvents:Record<string,Function>={};
  const node=(selector:string):any=>{
    if(!nodes.has(selector)) nodes.set(selector,{innerHTML:'',textContent:'',dataset:{api:'/api/public/registration-statistics',home:'/index.php'},
      classList:{add(){},remove(){},toggle(){}},setAttribute(){},removeAttribute(){},getAttribute(){return 'false';},
      querySelectorAll(){return [];},addEventListener(type:string,fn:Function){events[selector+':'+type]=fn;},
      scrollIntoView(){},focus(){},close(){},showModal:jest.fn()});
    return nodes.get(selector);
  };
  const location={hash,reload:jest.fn()};
  const downloads: Blob[]=[];
  const browserURL={createObjectURL:(blob:Blob)=>{downloads.push(blob);return 'blob:synthetic';},revokeObjectURL(){}};
  const fetch=jest.fn(async()=>({ok,json:async()=>source}));
  const document={querySelector:node,querySelectorAll:()=>[],addEventListener:(type:string,fn:Function)=>{events[type]=fn;},title:'',body:{appendChild(){}},createElement:()=>({click(){},remove(){}})};
  const source=payload||{...approved,includesCancelled:false,asOf:'2026-11-12T04:06:00.000Z',ages:[628,683,525],unassigned:[0,0,0],snapshotId:'a'.repeat(64),stale:false,provinces:approved.provinces.map((p:any)=>({...p,ages:p.districts.reduce((a:number[],d:any)=>a.map((n,i)=>n+d.ages[i]),[0,0,0]),unassigned:[0,0,0]}))};
  await vm.runInNewContext(script,{document,location,fetch,Intl,URLSearchParams,URL:browserURL,Blob,history:{replaceState(){}},setTimeout:(fn:Function)=>0,clearTimeout,window:{addEventListener:(type:string,fn:Function)=>{windowEvents[type]=fn;},scrollTo(){}}});
  const click=(dataset:Record<string,string>)=>{
    const button={dataset,id:'',hasAttribute:(key:string)=>key.startsWith('data-')&&key.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase()) in dataset,classList:{contains:()=>false}};
    events.click({target:{closest:(selector:string)=>selector==='button'?button:null}});
  };
  return {nodes,node,source,events,windowEvents,location,click,downloads,fetch};
}
it('renders snapshot-driven cards, filtered zero rows and all-age district details', async()=>{
  const c=await client('#stats?province='+encodeURIComponent('กรุงเทพมหานคร')+'&level=district&age=U14&status=zero&q='+encodeURIComponent('ธนบุรี'));
  expect(c.node('#view').innerHTML).toContain('156');
  expect(c.node('#table-content').innerHTML).toContain('ยังไม่มีทีม U14');
  expect(c.node('#result-count').textContent).toContain('1 อำเภอ/เขต');
  c.click({district:'1015'});
  expect(c.node('#district-dialog').showModal).toHaveBeenCalled();
  expect(c.node('#district-dialog').innerHTML).toContain('U18');
  expect(c.node('#district-dialog').innerHTML).toContain('>1</strong>');
  expect(c.node('#district-dialog').innerHTML).not.toContain('district-zero-notice');
  expect(c.node('#view').innerHTML).toContain('ไม่รวมรุ่นที่ยกเลิกการสมัคร');
  expect(c.node('#district-dialog').innerHTML).toContain('ไม่รวมรุ่นที่ยกเลิกการสมัคร');
  expect(c.node('#side-content').innerHTML).toContain('ไม่รวมรุ่นที่ยกเลิกการสมัคร');
  expect(c.node('.print-only').textContent).toContain('ไม่รวมรุ่นที่ยกเลิกการสมัคร');
  expect(c.node('#view').innerHTML).not.toContain('รวมยกเลิกการสมัคร');
});
it('renders ten rows on screen and all 928 filtered rows during printing, then restores pagination',async()=>{
  const c=await client('#stats?level=district');
  const count=()=> (c.node('#table-content').innerHTML.match(/<tr class=/g)||[]).length;
  expect(count()).toBe(10);
  c.windowEvents.beforeprint(); expect(count()).toBe(928);
  c.windowEvents.afterprint(); expect(count()).toBe(10);
});
it('reports unavailable without rendering fake zeros and exposes retry',async()=>{
  const c=await client('',undefined,false);
  expect(c.node('#view').innerHTML).toContain('ยังไม่สามารถแสดงข้อมูล');
  expect(c.node('#view').innerHTML).not.toContain('summary-card');
  c.events['#retry-statistics:click']();
  expect(c.location.reload).toHaveBeenCalled();
});
it('renders stale and unknown geography separately without inventing official districts',async()=>{
  const c=await client();
  c.source.stale=true; c.source.unassigned=[2,0,0]; c.source.ages=[630,683,525];
  const next=await client('#stats?level=district',{...c.source,asOf:c.source.asOfIso});
  expect(next.node('#statistics-status').textContent).toBe('');
  expect(next.node('#view').innerHTML).not.toContain('ข้อมูล ณ');
  expect(next.node('#district-dialog').innerHTML).not.toContain('ข้อมูล ณ');
  expect(next.node('#view').innerHTML).toContain('ยังไม่ระบุพื้นที่: 2 ทีม');
  expect(next.node('#result-count').textContent).toContain('928 อำเภอ/เขต');
});

it('uses same-origin access for protected Dev and provides an explicit fresh reload without polling',async()=>{
  const c=await client();
  expect(c.fetch).toHaveBeenCalledWith('/api/public/registration-statistics',{credentials:'same-origin',cache:'no-store'});
  c.click({}); // ordinary filter rendering does not refetch or run a job
  expect(c.fetch).toHaveBeenCalledTimes(1);
  const fn=c.events.click;
  fn({target:{closest:(selector:string)=>selector==='button'?({dataset:{},id:'reload-statistics',hasAttribute:()=>false,classList:{contains:()=>false}}):null}});
  expect(c.location.reload).toHaveBeenCalledTimes(1);
});

it.each(['','#stats?level=district','#stats?province='+encodeURIComponent('กรุงเทพมหานคร')+'&age=U14&status=zero&q='+encodeURIComponent('ธนบุรี'),'#stats?province='+encodeURIComponent('กรุงเทพมหานคร')+'&zone='+encodeURIComponent('ฝั่งธนบุรี')+'&sort=name'])('exports the displayed response without another API request: %s',async(hash)=>{
  const data=buildStatistics([{id:'synthetic-a',categories:'U14,U16',province:'กรุงเทพมหานคร',district:'ธนบุรี',cancelled_categories:'U14'},{id:'synthetic-b',categories:'U18',province:'ขอนแก่น',district:'unknown'}],'2026-11-16T00:00:00.000Z','2026-11-16T00:00:00.000Z');
  const c=await client(hash,{...data,zones:BANGKOK_ZONES,registry:{url:'https://example.test'},stale:false});
  c.events.click({target:{closest:(selector:string)=>selector==='button'?({dataset:{},id:'export-csv',hasAttribute:()=>false,classList:{contains:()=>false}}):null}});
  expect(c.downloads).toHaveLength(1);
  const csv=Buffer.from(await c.downloads[0].arrayBuffer()).toString('utf8');
  expect(csv).toBe(statisticsCsv(data,Object.fromEntries(new URLSearchParams(hash.split('?')[1]))));
  expect(c.fetch).toHaveBeenCalledTimes(1);
  expect(c.node('.print-only').textContent).not.toContain('ข้อมูล ณ');
  expect(c.node('.print-only').textContent).not.toContain('Snapshot');
});
