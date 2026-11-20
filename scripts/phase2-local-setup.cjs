// Explicit, operator-approved Local setup. Never imported by the application.
const fs=require('node:fs');
const path=require('node:path');
const {createHash}=require('node:crypto');
const {Pool}=require('pg');
const root=path.resolve(__dirname,'..');
let stage='PRECHECK';
async function main(){
  const args=process.argv.slice(2);
  const apply=args[0]==='--apply';
  if(!(args.length===0 || args.length===1&&args[0]==='--check' || apply&&args.length===2&&/^[a-f0-9]{64}$/.test(args[1])))throw Error('INVALID_ARGUMENTS');
  const sql=fs.readFileSync(path.join(root,'sql/phase2-local-bootstrap.sql'),'utf8');
  const hash=createHash('sha256').update(sql).digest('hex');
  if(apply&&args[1]!==hash)throw Error('MIGRATION_HASH_MISMATCH');
  const file=path.join(root,'.runtime/local-server.private.json');
  const stat=fs.lstatSync(file);
  if(!stat.isFile()||stat.isSymbolicLink()||(stat.mode&0o077))throw Error('UNSAFE_CONFIGURATION');
  const config=JSON.parse(fs.readFileSync(file,'utf8'));
  const url=new URL(config.databaseUrl);
  if(!['postgres:','postgresql:'].includes(url.protocol)||!['localhost','127.0.0.1','[::1]'].includes(url.hostname))throw Error('NON_LOCAL_TARGET');
  const marker=path.join(root,'phase2/.runtime/database-enabled.json');
  if(fs.existsSync(marker))throw Error('EXISTING_MARKER_REQUIRES_RECONCILIATION');
  const pool=new Pool({connectionString:config.databaseUrl,max:1,connectionTimeoutMillis:3000});
  try{
    const db=await pool.connect();
    try{
      await db.query('BEGIN READ ONLY');
      await db.query("SET LOCAL statement_timeout='5s'");
      const {rows:[identity]}=await db.query('SELECT host(inet_server_addr()) AS address,current_database() AS database,pg_is_in_recovery() AS replica');
      if(!['127.0.0.1','::1'].includes(identity.address)||identity.database!==decodeURIComponent(url.pathname.slice(1))||identity.replica)throw Error('LOCAL_IDENTITY_MISMATCH');
      const {rows:[tables]}=await db.query("SELECT count(*)::int AS count FROM pg_tables WHERE schemaname='public' AND left(tablename,3)='p2_'");
      if(tables.count!==0)throw Error('EXISTING_SCHEMA_REQUIRES_RECONCILIATION');
      for(const table of ['football_registered_team','football_player','football_official']){
        const {rows:[row]}=await db.query('SELECT to_regclass($1) IS NOT NULL AS present',[table]);
        if(!row.present)throw Error('PHASE1_SCHEMA_MISSING');
      }
      await db.query('ROLLBACK');
      console.log(JSON.stringify({local_identity_verified:true,phase1_tables_present:true,phase2_tables_absent:true,migration_sha256:hash,apply_requested:apply}));
      if(!apply)return;
      stage='MIGRATION_ATTEMPTED';
      await db.query(sql);
      stage='MIGRATION_COMMITTED_MARKER_PENDING';
      // No URL, username, password or session secret is written into this marker.
      fs.mkdirSync(path.dirname(marker),{recursive:true,mode:0o700});
      fs.writeFileSync(marker,JSON.stringify({host:url.hostname,port:Number(url.port||5432),database:decodeURIComponent(url.pathname.slice(1))})+'\n',{flag:'wx',mode:0o600});
      stage='COMPLETE';
      console.log(JSON.stringify({phase2_schema_created:true,phase2_marker_created:true,phase1_data_modified:false,restart_required:true}));
    }finally{db.release();}
  }finally{await pool.end();}
}
main().catch(error=>{
  // Do not echo driver messages or connection strings. No automatic retries.
  console.error(JSON.stringify({error:'LOCAL_PHASE2_SETUP_STOPPED',stage,code:error.code||'CHECK_FAILED'}));
  process.exitCode=1;
});
