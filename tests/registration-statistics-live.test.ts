import express from 'express';
import request from 'supertest';
import type { Pool } from 'pg';
import { readCurrentStatistics } from '../src/services/registrationStatistics.read';
import { createRegistrationStatisticsRouter } from '../src/routes/registrationStatistics.router';
import { StatisticsStore } from '../src/services/registrationStatistics.store';
import { registeredEntitlements, sum } from '../src/services/registrationStatistics.service';

function database() {
  let rows: any[] = [{id:'synthetic-live',categories:'U14,U16',cancelled_categories:'U14',province:'กรุงเทพมหานคร',district:'ธนบุรี'}];
  const query=jest.fn(async(sql:string):Promise<any>=>{
    if(sql.includes('transaction_timestamp'))return {rows:[{as_of:new Date()}]};
    if(sql.includes('COUNT(DISTINCT id)')) { const a=sum(registeredEntitlements(rows,{includeCancelled:false}));return {rows:[{u14:a[0],u16:a[1],u18:a[2]}]}; }
    if(sql.startsWith('SELECT id, categories'))return {rows};
    return {rows:[]};
  });
  const release=jest.fn(),connect=jest.fn(async()=>({query,release}));
  return {pool:{connect} as unknown as Pool,query,release,connect,setRows:(next:any[])=>{rows=next;}};
}

it('reads again on every request without current.json, publication or an advisory job lock',async()=>{
  const db=database(),store=new StatisticsStore('/tmp/football-live-no-snapshot-required');
  const disk=jest.spyOn(store,'read').mockRejectedValue(Error('disk must not be used'));
  const publish=jest.spyOn(store,'publish');
  const app=express();app.use(createRegistrationStatisticsRouter(store,()=>readCurrentStatistics(db.pool)));
  const first=await request(app).get('/api/public/registration-statistics');
  expect(first.status).toBe(200);expect(first.body.ages).toEqual([0,1,0]);
  expect(first.body.stale).toBe(false);expect(first.headers['cache-control']).toBe('no-store');
  expect(first.headers['set-cookie']).toBeUndefined();
  db.setRows([{id:'synthetic-next',categories:'U14,U16,U18'}]);
  const next=await request(app).get('/api/public/registration-statistics');
  expect(next.body.ages).toEqual([1,1,1]);expect(db.connect).toHaveBeenCalledTimes(2);
  expect(disk).not.toHaveBeenCalled();expect(publish).not.toHaveBeenCalled();
  const sql=db.query.mock.calls.flat().join('\n');
  expect(sql).toContain('REPEATABLE READ READ ONLY');expect(sql).toContain("statement_timeout = '5s'");
  expect(sql).not.toMatch(/SELECT \*|pg_(?:try_)?advisory|\b(?:INSERT|UPDATE|DELETE|CREATE)\b|football_player|phone|password/i);
  expect(first.text).not.toMatch(/synthetic-live|contact_|password|email|phone|team_id/);
  jest.restoreAllMocks();
});

it('shows genuine empty data as zero while DB failure returns503 and never falls back to a prior response',async()=>{
  const db=database();db.setRows([]);
  const app=express();app.use(createRegistrationStatisticsRouter(undefined,()=>readCurrentStatistics(db.pool)));
  const empty=await request(app).get('/api/public/registration-statistics');
  expect(empty.status).toBe(200);expect(empty.body.ages).toEqual([0,0,0]);expect(empty.body.provinces).toHaveLength(77);
  const original=db.query.getMockImplementation()!;
  db.query.mockImplementation(async(sql:string)=>{if(sql.startsWith('SELECT id'))throw Error('synthetic timeout private details');return original(sql);});
  const failed=await request(app).get('/api/public/registration-statistics');
  expect(failed.status).toBe(503);expect(failed.body).toEqual({error:'statistics_unavailable'});
  expect(db.query.mock.calls.some(c=>c[0]==='ROLLBACK')).toBe(true);expect(db.release).toHaveBeenLastCalledWith(false);
});

it('rolls back a reconciliation mismatch and discards a connection if rollback itself fails',async()=>{
  const db=database(),original=db.query.getMockImplementation()!;
  db.query.mockImplementation(async(sql:string)=>{
    if(sql.includes('COUNT(DISTINCT id)'))return {rows:[{u14:99,u16:0,u18:0}]};
    if(sql==='ROLLBACK')throw Error('synthetic broken connection');
    return original(sql);
  });
  await expect(readCurrentStatistics(db.pool)).rejects.toThrow('totals do not reconcile');
  expect(db.release).toHaveBeenCalledWith(true);
});

it('rejects invalid or unpinned historical exports before opening a DB connection',async()=>{
  const db=database(),app=express();app.use(createRegistrationStatisticsRouter(undefined,()=>readCurrentStatistics(db.pool)));
  expect((await request(app).get('/api/public/registration-statistics.csv')).status).toBe(400);
  expect((await request(app).get('/api/public/registration-statistics?snapshotId=invalid')).status).toBe(400);
  expect(db.connect).not.toHaveBeenCalled();
});
