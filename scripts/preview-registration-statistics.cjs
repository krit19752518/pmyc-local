'use strict';
// Local review only: approved synthetic fixture, never reads registration DB/config/uploads.
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const express=require('express');
const {buildStatistics}=require('../dist/services/registrationStatistics.service');
const {StatisticsStore}=require('../dist/services/registrationStatistics.store');
const {createRegistrationStatisticsRouter}=require('../dist/routes/registrationStatistics.router');
async function main(){
  const fixture=require('../tests/fixtures/issue72-approved-statistics.json');
  const rows=fixture.provinces.flatMap(p=>p.districts.flatMap(d=>d.ages.flatMap((n,i)=>Array.from({length:n},(_,j)=>({id:'synthetic-'+d.code+'-'+i+'-'+j,province:p.name,district:d.name,categories:['U14','U16','U18'][i]})))));
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'football-statistics-preview-'));
  const store=new StatisticsStore(directory);
  const asOf=new Date(fixture.asOfIso).toISOString();
  await store.publish(buildStatistics(rows,asOf,asOf));
  const app=express();
  app.use('/assets',express.static(path.join(__dirname,'../public/assets')));
  app.use(createRegistrationStatisticsRouter(store));
  app.get('/',(_req,res)=>res.redirect('/registration-statistics.php#stats?level=district&status=zero'));
  const server=app.listen(4572,'127.0.0.1',()=>console.log('LOCAL APPROVED FIXTURE (12 Nov 2026, not current data): http://127.0.0.1:4572/'));
  server.on('error',async error=>{console.error(error.code || 'preview failed');await fs.rm(directory,{recursive:true,force:true});process.exitCode=1;});
  const stop=()=>server.close(async()=>{await fs.rm(directory,{recursive:true,force:true});process.exit(0);});
  process.once('SIGINT',stop);process.once('SIGTERM',stop);
}
main().catch(()=>{console.error('Preview failed; no production action performed.');process.exitCode=1;});
