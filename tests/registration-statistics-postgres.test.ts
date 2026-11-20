import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { Pool } from 'pg';
import { refreshStatistics } from '../src/services/registrationStatistics.refresh';
import { StatisticsStore } from '../src/services/registrationStatistics.store';
import { readCurrentStatistics } from '../src/services/registrationStatistics.read';
import express from 'express';
import request from 'supertest';
import { createRegistrationStatisticsRouter } from '../src/routes/registrationStatistics.router';

const bin=process.env.PHASE2_TEST_PG_BIN || '/usr/lib/postgresql/18/bin';
let directory:string, database:Pool;
function run(file:string,args:string[]){
  const result=spawnSync(path.join(bin,file),args,{encoding:'utf8',env:{PATH:process.env.PATH,LANG:'C.UTF-8'}});
  if(result.status!==0)throw Error(file+' failed: '+result.stderr);
}
beforeAll(async()=>{
  directory=fs.mkdtempSync(path.join(os.tmpdir(),'football-statistics-pg-test-'));
  fs.mkdirSync(path.join(directory,'socket'));
  run('initdb',['-D',path.join(directory,'data'),'-A','trust','-U','statstest','--no-locale','--encoding=UTF8']);
  run('pg_ctl',['-D',path.join(directory,'data'),'-l',path.join(directory,'postgres.log'),'-o',"-h '' -k "+directory+'/socket -p 55472','-w','start']);
  database=new Pool({host:path.join(directory,'socket'),port:55472,database:'postgres',user:'statstest',max:4});
  // An isolated synthetic schema; no application environment/connection string is used.
  await database.query('CREATE TABLE football_registered_team (id text PRIMARY KEY, categories text, province text, district text, contact_province text, contact_district text, is_test boolean, is_deleted boolean, cancelled_categories text)');
  await database.query("INSERT INTO football_registered_team (id,categories,province,district,cancelled_categories) VALUES ('synthetic-a',' u14 , U16,U18 ','กรุงเทพฯ','เขตธนบุรี',' u14 , U18 '),('synthetic-b','U14','ขอนแก่น','unknown',NULL),('synthetic-orphan',NULL,NULL,NULL,'U14'),('synthetic-cancelled','U14,U16,U18',NULL,NULL,'U14,U16,U18')");
  await database.query("INSERT INTO football_registered_team (id,categories,is_test,is_deleted) VALUES ('synthetic-demo','U14',TRUE,FALSE),('synthetic-deleted','U18',FALSE,TRUE)");
},30000);
afterAll(async()=>{
  if(database)await database.end();
  if(directory&&fs.existsSync(path.join(directory,'data/postmaster.pid'))) run('pg_ctl',['-D',path.join(directory,'data'),'-m','fast','-w','stop']);
});
it('executes the real SQL and holds a coherent source snapshot through concurrent registration changes',async()=>{
  const store=new StatisticsStore(path.join(directory,'snapshots'));
  let inserted=false;
  const proxy={connect:async()=>{
    const client=await database.connect();
    return {release:(destroy:boolean)=>client.release(destroy),query:async(sql:string,params?:any[])=>{
      const result=await client.query(sql,params);
      if(sql.startsWith('SELECT id, categories')&&!inserted){
        inserted=true;
        await database.query("INSERT INTO football_registered_team (id,categories,province,district) VALUES ('synthetic-concurrent','U18','กรุงเทพมหานคร','ธนบุรี')");
      }
      return result;
    }};
  }} as unknown as Pool;
  expect((await refreshStatistics(proxy,store)).outcome).toBe('published');
  const result=(await store.read())!;
  expect(result.ages).toEqual([1,1,0]);
  expect(result.includesCancelled).toBe(false);
  expect(result.provinces.find(p=>p.code==='10')?.districts.find(d=>d.code==='1015')?.ages).toEqual([0,1,0]);
  expect(result.provinces.find(p=>p.name==='ขอนแก่น')?.unassigned).toEqual([1,0,0]);
  expect((await refreshStatistics(database,store)).outcome).toBe('already-published');
  const second=new StatisticsStore(path.join(directory,'other-snapshots'));
  expect((await refreshStatistics(database,second)).outcome).toBe('published');
  expect((await second.read())?.ages).toEqual([1,1,1]);
});
it('refreshes manually within the same slot after cancellation/restoration without changing source data in the job',async()=>{
  const store=new StatisticsStore(path.join(directory,'manual-snapshots'));
  await refreshStatistics(database,store);
  await database.query("UPDATE football_registered_team SET cancelled_categories='U14,U16,U18' WHERE id='synthetic-a'");
  expect((await refreshStatistics(database,store,new Date(),{force:true})).outcome).toBe('published');
  expect((await store.read())?.ages).toEqual([1,0,1]);
  await database.query("UPDATE football_registered_team SET cancelled_categories='' WHERE id='synthetic-a'");
  await refreshStatistics(database,store,new Date(),{force:true});
  expect((await store.read())?.ages).toEqual([2,1,2]);
});
it('prevents a separate worker from publishing while the session advisory lock is held',async()=>{
  const client=await database.connect();
  try{
    await client.query('SELECT pg_advisory_lock($1,$2)',[20261112,72]);
    const store=new StatisticsStore(path.join(directory,'busy-snapshots'));
    expect((await refreshStatistics(database,store)).outcome).toBe('locked');
    expect(await store.read()).toBeNull();
  }finally{await client.query('SELECT pg_advisory_unlock($1,$2)',[20261112,72]);client.release();}
});

it('serves registration, cancellation and restoration on the next API request without running a job',async()=>{
  const app=express();app.use(createRegistrationStatisticsRouter(undefined,()=>readCurrentStatistics(database)));
  const baseline=(await request(app).get('/api/public/registration-statistics')).body.ages;
  try {
    await database.query("INSERT INTO football_registered_team(id,categories,province,district) VALUES ('synthetic-live-request','U14,U16','กรุงเทพมหานคร','ธนบุรี')");
    const registered=await request(app).get('/api/public/registration-statistics');
    expect(registered.status).toBe(200);expect(registered.body.ages).toEqual([baseline[0]+1,baseline[1]+1,baseline[2]]);
    await database.query("UPDATE football_registered_team SET cancelled_categories='U14' WHERE id='synthetic-live-request'");
    const cancelled=await request(app).get('/api/public/registration-statistics');
    expect(cancelled.body.ages).toEqual([baseline[0],baseline[1]+1,baseline[2]]);
    await database.query("UPDATE football_registered_team SET cancelled_categories='' WHERE id='synthetic-live-request'");
    expect((await request(app).get('/api/public/registration-statistics')).body.ages).toEqual(registered.body.ages);
    expect(registered.text).not.toMatch(/synthetic-live-request|contact_|phone|password/);
  } finally { await database.query("DELETE FROM football_registered_team WHERE id='synthetic-live-request'"); }
});
it('keeps the live request and its independent SQL totals in the same snapshot during a concurrent registration',async()=>{
  const baseline=await readCurrentStatistics(database);let inserted=false;
  const proxy={connect:async()=>{
    const client=await database.connect();
    return {release:(destroy:boolean)=>client.release(destroy),query:async(sql:string)=>{
      const result=await client.query(sql);
      if(sql.startsWith('SELECT id, categories')&&!inserted){
        inserted=true;
        await database.query("INSERT INTO football_registered_team(id,categories) VALUES ('synthetic-live-concurrent','U18')");
      }
      return result;
    }};
  }} as unknown as Pool;
  try {
    expect((await readCurrentStatistics(proxy)).ages).toEqual(baseline.ages);
    expect((await readCurrentStatistics(database)).ages).toEqual([baseline.ages[0],baseline.ages[1],baseline.ages[2]+1]);
  } finally { await database.query("DELETE FROM football_registered_team WHERE id='synthetic-live-concurrent'"); }
});
