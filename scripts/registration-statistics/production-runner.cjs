'use strict';
const fs=require('node:fs');
const path=require('node:path');
// Source location: scripts/registration-statistics/production-runner.cjs.
// Installed location: .runtime/registration-statistics/run.cjs (same two-level root).
const root=path.resolve(__dirname,'../..');

function loadDatabaseUrl(file,{uid,host,port,database}){
  const stat=fs.lstatSync(file);
  if(!stat.isFile()||stat.isSymbolicLink()||stat.uid!==uid||(stat.mode&0o022)||stat.size>65536)
    throw Error('UNSAFE_MANAGED_CONFIGURATION');
  const settings=new Map();
  for(const raw of fs.readFileSync(file,'utf8').split('\n')){
    const line=raw.trim();if(!line||line.startsWith('#'))continue;
    const index=line.indexOf('=');if(index<0)continue;
    const key=line.slice(0,index).trim();
    // Match Passenger: the first nonempty value wins; do not evaluate shell syntax.
    if(!settings.get(key))settings.set(key,line.slice(index+1).trim());
  }
  const value=settings.get('DATABASE_URL');if(!value)throw Error('MISSING_MANAGED_DATABASE');
  const parsed=new URL(value);
  if(!['postgres:','postgresql:'].includes(parsed.protocol)||parsed.hostname!==host||
      Number(parsed.port||5432)!==port||decodeURIComponent(parsed.pathname.slice(1))!==database)
    throw Error('UNEXPECTED_DATABASE_IDENTITY');
  return value;
}
async function run(){
  if(process.env.NODE_ENV!=='production')throw Error('PRODUCTION_WRAPPER_REQUIRED');
  process.umask(0o077);
  console.log(JSON.stringify({event:'registration_statistics_run_started',at:new Date().toISOString()}));
  process.env.DATABASE_URL=loadDatabaseUrl(path.join(root,'.env'),{
    uid:process.getuid(),host:'143.14.36.234',port:5432,database:'my_office_db'
  });
  process.env.REGISTRATION_STATISTICS_DIR=path.join(root,'.runtime/registration-statistics');
  process.chdir(root);
  // Import only the summary job: never boot Passenger/app.js or load OCR providers.
  await require(path.join(root,'dist/jobs/refreshRegistrationStatistics.js')).main();
  console.log(JSON.stringify({event:'registration_statistics_run_finished',at:new Date().toISOString(),outcome:process.exitCode?'failed':'ok'}));
}
module.exports={loadDatabaseUrl};
if(require.main===module)run().catch(()=>{
  console.error(JSON.stringify({event:'registration_statistics_runner_failed',at:new Date().toISOString(),code:'CONFIGURATION_OR_RUNTIME_CHECK_FAILED'}));
  process.exitCode=1;
});
