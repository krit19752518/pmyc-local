import express from 'express';
import request from 'supertest';
import http from 'node:http';
import { AddressInfo } from 'node:net';
import { createPhase2Router } from '../src/routes/phase2.router';
import { createAdminSessionToken } from '../src/services/adminSession.service';
import { AdminUser } from '../src/adminAuth';
jest.mock('../src/adminAuth', () => ({ getAdminUserByUsername: jest.fn() }));

const host = 'football-dev.pmycfootball.in.th';
const target = '/phase2demo/workspace/pending-ceremony?event_id=00000000-0000-4000-8000-000000000001&season_id=00000000-0000-4000-8000-000000000002&division_code=U14_BOY&stage=1&province=Test&district=Test&data_mode=demo';
const user: AdminUser = { id:'synthetic-issue94', username:'synthetic', fullname:'Synthetic', roleCode:'SUPER_ADMIN', roleName:'SUPER_ADMIN', permissions:[] };
const originalEnv = { NODE_ENV:process.env.NODE_ENV, FOOTBALL_VPS_DEV:process.env.FOOTBALL_VPS_DEV, ADMIN_SESSION_SECRET:process.env.ADMIN_SESSION_SECRET };
let server:http.Server, app:express.Express, cookie:string, csrf:string;
let forwarded:Array<{method:string;url:string;body:any;actor:any}>;
beforeAll(async () => {
  process.env.ADMIN_SESSION_SECRET = 'synthetic-issue94-session-secret-only';
  forwarded = [];
  server = http.createServer((req,res) => {
    const context = JSON.parse(Buffer.from(String(req.headers['x-pmyc-context']),'base64url').toString());
    let body = '';
    req.on('data',chunk => body+=chunk);
    req.on('end',() => {
      forwarded.push({method:req.method!,url:req.url!,body:body?JSON.parse(body):{},actor:context.actor});
      if(req.method==='GET') {res.setHeader('Content-Type','application/json');res.end(JSON.stringify({csrf:context.csrf}));}
      else {res.writeHead(303,{Location:target+'&competition_id=00000000-0000-4000-8000-000000000003'});res.end();}
    });
  });
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  app = express(); app.use(express.urlencoded({extended:true})); app.use(express.json());
  app.use(createPhase2Router({backend:{secret:'a'.repeat(64),port:async()=>(server.address() as AddressInfo).port},lookup:async()=>user}));
  cookie='admin_session_token='+encodeURIComponent(createAdminSessionToken(user,'central'));
  csrf=(await request(app).get(target).set('Host',host).set('Cookie',cookie)).body.csrf;
});
afterAll(async () => {
  await new Promise<void>(resolve=>server.close(()=>resolve()));
  for(const [key,value] of Object.entries(originalEnv)) value===undefined?delete process.env[key]:process.env[key]=value;
});
beforeEach(()=>{forwarded.length=0;process.env.NODE_ENV='development';process.env.FOOTBALL_VPS_DEV='1';});
function post(origin?:string, token:any=csrf, headers:Record<string,string>={}) {
  let r=request(app).post(target).set('Host',host).set('Cookie',cookie).set(headers);
  if(origin!==undefined)r=r.set('Origin',origin);
  return r.type('form').send({_csrf:token,operation:'prepare_ceremony',request_id:'00000000-0000-4000-8000-000000000004'});
}
it('accepts Dev HTTPS prepare POST behind an HTTP proxy and preserves context and redirect',async()=>{
  const r=await post('https://'+host);
  expect(r.status).toBe(303);
  expect(r.headers.location).toBe(target+'&competition_id=00000000-0000-4000-8000-000000000003');
  expect(forwarded).toHaveLength(1);
  expect(forwarded[0]).toMatchObject({method:'POST',url:target,body:{_csrf:csrf,operation:'prepare_ceremony'},actor:{role:'SUPER_ADMIN'}});
});
it.each(['https://outside.example','https://'+host+'.outside.example','http://'+host,'null','https://'+host+':444'])('rejects foreign or non-HTTPS origin %s before the backend',async(origin)=>{
  expect((await post(origin)).status).toBe(403);expect(forwarded).toHaveLength(0);
});
it.each(['', 'invalid'])('still rejects missing or invalid CSRF %s',async(token)=>{
  expect((await post('https://'+host,token)).status).toBe(403);expect(forwarded).toHaveLength(0);
});
it('still rejects expired or absent login before the backend',async()=>{
  const r=await request(app).post(target).set('Host',host).set('Origin','https://'+host).send({_csrf:csrf});
  expect(r.status).toBe(401);expect(forwarded).toHaveLength(0);
});
it('does not trust forwarded headers to admit a foreign origin',async()=>{
  expect((await post('https://outside.example',csrf,{'X-Forwarded-Host':'outside.example','X-Forwarded-Proto':'https'})).status).toBe(403);
  expect(forwarded).toHaveLength(0);
});
it('keeps Production HTTPS checking',async()=>{
  process.env.NODE_ENV='production';delete process.env.FOOTBALL_VPS_DEV;
  expect((await post('https://'+host)).status).toBe(303);
  expect((await post('http://'+host)).status).toBe(403);
  expect(forwarded).toHaveLength(1);
});
it('keeps ordinary local HTTP behavior when VPS Dev is not enabled',async()=>{
  delete process.env.FOOTBALL_VPS_DEV;
  expect((await post('http://'+host)).status).toBe(303);
  expect((await post('https://'+host)).status).toBe(403);
  expect(forwarded).toHaveLength(1);
});
it('requires the exact VPS Dev flag rather than any nonempty value',async()=>{
  process.env.FOOTBALL_VPS_DEV='0';
  expect((await post('http://'+host)).status).toBe(303);
  expect((await post('https://'+host)).status).toBe(403);
});
it('retains the existing valid-token no-Origin client behavior',async()=>{
  expect((await post()).status).toBe(303);expect(forwarded).toHaveLength(1);
});
