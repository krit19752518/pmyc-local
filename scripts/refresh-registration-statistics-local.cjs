'use strict';
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');

function readLocalDatabase(file) {
  const stat=fs.lstatSync(file);
  if(!stat.isFile()||stat.isSymbolicLink()||(stat.mode&0o077))throw new Error('LOCAL_PRIVATE_CONFIGURATION_REQUIRED');
  const config=JSON.parse(fs.readFileSync(file,'utf8'));
  const url=new URL(config.databaseUrl);
  if(!['postgres:','postgresql:'].includes(url.protocol)||!['localhost','127.0.0.1','[::1]'].includes(url.hostname)||url.pathname.length<2)
    throw new Error('LOCAL_LOOPBACK_DATABASE_REQUIRED');
  return {connectionString:config.databaseUrl,database:decodeURIComponent(url.pathname.slice(1))};
}
async function refreshLocal({force=false} = {}) {
  const settings=readLocalDatabase(path.join(root,'.runtime/local-server.private.json'));
  const {Pool}=require('pg');
  const pool=new Pool({connectionString:settings.connectionString,max:2,connectionTimeoutMillis:3000});
  try {
    const identity=await pool.query('SELECT host(inet_server_addr()) AS address, current_database() AS database, pg_is_in_recovery() AS replica');
    if(!['127.0.0.1','::1'].includes(identity.rows[0]?.address)||identity.rows[0]?.database!==settings.database||identity.rows[0]?.replica)
      throw new Error('LOCAL_DATABASE_IDENTITY_MISMATCH');
    const {refreshStatistics}=require('../dist/services/registrationStatistics.refresh');
    const {StatisticsStore}=require('../dist/services/registrationStatistics.store');
    const result=await refreshStatistics(pool,new StatisticsStore(path.join(root,'.runtime/registration-statistics')),new Date(),{force});
    console.log(JSON.stringify(result)); // public snapshot metadata only
  } finally { await pool.end(); }
}
module.exports={readLocalDatabase,refreshLocal};
if(require.main===module)refreshLocal({force:process.argv.slice(2).includes('--force')}).catch(()=>{
  console.error('Local statistics refresh stopped: LOCAL_STATISTICS_REFRESH_FAILED');
  process.exitCode=1;
});
