import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
const source=fs.readFileSync(path.join(__dirname,'../phase2/public/assets/workspace.js'),'utf8');
function reveal(reduced=false,count=8) {
  const timers:Array<{callback:()=>void;delay:number}>=[];
  const balls=Array.from({length:count},(_,i)=>{
    const classes=new Set<string>();
    return {dataset:{ceremonyBall:`A${count-i}`},classes,classList:{add:(s:string)=>classes.add(s)}};
  });
  const targets=Array.from({length:count},(_,i)=>({dataset:{ceremonyTarget:`A${i+1}`},hidden:true}));
  const waits=Array.from({length:count},(_,i)=>({dataset:{ceremonyWait:`A${i+1}`},hidden:false}));
  const classes=new Set<string>();
  const machine={classList:{add:(s:string)=>classes.add(s),remove:(s:string)=>classes.delete(s)}};
  const counter={textContent:'0'}, review={hidden:true},status={textContent:''};let replaced='';
  const panel={querySelector:(q:string)=>({'[data-ceremony-machine]':machine,'[data-ceremony-counter]':counter,'[data-ceremony-review]':review,'[data-ceremony-status]':status} as Record<string,any>)[q],querySelectorAll:(q:string)=>({'[data-ceremony-ball]':balls,'[data-ceremony-target]':targets,'[data-ceremony-wait]':waits} as Record<string,any>)[q]||[]};
  const sidebar={classList:{remove:()=>{},contains:()=>false},querySelector:()=>null};
  const toggle={setAttribute:()=>{},addEventListener:()=>{},focus:()=>{}};
  const backdrop={hidden:true,addEventListener:()=>{}};
  const root={querySelector:(q:string)=>({'.sidebar':sidebar,'.mobile-toggle':toggle,'.workspace-backdrop':backdrop,'[data-ceremony-reveal]':panel} as Record<string,any>)[q]||null,querySelectorAll:()=>[]};
  const window={location:{href:'http://localhost/phase2demo/workspace/pending-ceremony?competition_id=saved&reveal=version'},history:{replaceState:(_a:any,_b:string,url:URL)=>{replaced=url.toString()}},addEventListener:()=>{},matchMedia:()=>({matches:reduced}),setTimeout:(callback:()=>void,delay:number)=>timers.push({callback,delay})};
  vm.runInNewContext(source,{document:{querySelector:()=>root,addEventListener:()=>{}},window,URL,fetch:()=>{throw Error('Replay must not mutate results');},Math:{random:()=>{throw Error('Replay must not select results');}}});
  return {balls,targets,waits,classes,counter,review,status,timers,replaced};
}
test.each([1,3,8])('reveals %i saved team slots once in committed order rather than ball display order',count=>{
  const r=reveal(false,count);
  expect(r.targets.every(t=>t.hidden)).toBe(true);
  expect(r.classes.has('running')).toBe(true);
  expect(r.review.hidden).toBe(true);
  expect(new URL(r.replaced).searchParams.has('reveal')).toBe(false);
  expect(new URL(r.replaced).searchParams.get('competition_id')).toBe('saved');
  expect(r.timers.map(t=>t.delay)).toEqual(Array.from({length:count},(_,i)=>1200+900*i));
  r.timers.forEach((timer,i)=>{
    timer.callback();
    expect(r.counter.textContent).toBe(String(i+1));
    expect(r.targets.map(t=>t.hidden)).toEqual(r.targets.map((_,j)=>j>i));
    expect(r.waits.map(t=>t.hidden)).toEqual(r.waits.map((_,j)=>j<=i));
    expect(r.balls.filter(b=>b.classes.has('consumed'))).toHaveLength(i+1);
    expect(r.review.hidden).toBe(i<count-1);
  });
  expect(r.classes.has('running')).toBe(false);
  expect(r.status.textContent).toBe('เปิดทีมครบแล้ว');
});
test('reduced motion opens all saved destinations immediately without timers',()=>{
  const r=reveal(true);
  expect(r.timers).toHaveLength(0);
  expect(r.targets.every(t=>!t.hidden)).toBe(true);
  expect(r.counter.textContent).toBe('8');
  expect(r.balls.every(b=>b.classes.has('consumed'))).toBe(true);
  expect(r.review.hidden).toBe(false);
});
test('empty data does not block result review',()=>{
  const r=reveal(false,0);expect(r.timers).toHaveLength(0);expect(r.review.hidden).toBe(false);
});
