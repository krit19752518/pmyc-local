import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
const script=fs.readFileSync(path.join(__dirname,'../public/assets/registration-statistics/home.js'),'utf8');
async function home(ok=true) {
  const nodes=new Map<string,any>(),reload=jest.fn();
  const node=(id:string)=>{if(!nodes.has(id))nodes.set(id,{textContent:'old sentinel',children:[],appendChild(child:any){this.children.push(child);}});return nodes.get(id);};
  const document={currentScript:{src:'https://dev.example.test/assets/registration-statistics/home.js?v=issue89'},querySelector:node,createElement:()=>({addEventListener(type:string,fn:Function){(this as any)[type]=fn;}})};
  const fetch=jest.fn(async(_url:unknown,_options:unknown)=>({ok,json:async()=>({ages:[2,3,4],includesCancelled:false,stale:true,asOf:'2026-11-13T08:55:00Z',provinces:[{districts:[{ages:[2,3,4]},{ages:[0,0,0]}]}]})}));
  await vm.runInNewContext(script,{document,fetch,URL,location:{reload}});
  return {node,fetch,reload};
}
it('renders current response totals without stale dates and permits an explicit fresh reload',async()=>{
  const c=await home();
  expect(c.fetch).toHaveBeenCalledTimes(1);
  expect(String(c.fetch.mock.calls[0][0])).toBe('https://dev.example.test/api/public/registration-statistics');
  expect(c.fetch.mock.calls[0][1]).toEqual({credentials:'same-origin',cache:'no-store'});
  expect(c.node('#home-statistics-total').textContent).toBe('9');
  const summary=c.node('#home-statistics-summary');
  expect(summary.textContent).toContain('ไม่รวมรุ่นที่ยกเลิกการสมัคร');
  expect(summary.textContent).not.toMatch(/ข้อมูล ณ|ข้อมูลยังไม่อัปเดต|2569|Asia\/Bangkok/);
  summary.children[0].click();expect(c.reload).toHaveBeenCalledTimes(1);
});
it('clears old totals on request failure without reporting false zeros',async()=>{
  const c=await home(false);
  expect(c.node('#home-statistics-total').textContent).toBe('—');
  expect(c.node('#home-statistics-summary').textContent).toContain('ยังไม่สามารถแสดงสถิติ');
});
