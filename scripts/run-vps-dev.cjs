'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');

function validateConfig(c,root){
 if(root!=='/home/zbpzpszw/football-dev/workspace')throw Error('Unexpected Dev workspace');
 const u=new URL(c.databaseUrl);
 if(!['postgres:','postgresql:'].includes(u.protocol)||u.hostname!=='143.14.36.234'||(u.port||'5432')!=='5432'||u.pathname!=='/football_dev'||decodeURIComponent(u.username)!=='football_dev_app'||!u.password||u.search||u.hash)throw Error('Unexpected Dev database');
 if(c.tlsServername!=='gritsolution'||c.caFile!=='/home/zbpzpszw/football-dev/shared/db-ca.pem'||!/^[a-f0-9]{64}$/.test(c.caSha256||''))throw Error('Unexpected Dev TLS configuration');
 if(!/^[a-f0-9]{64}$/.test(c.accessDigest||''))throw Error('Dev access protection missing');
 if(!/^[a-f0-9]{64}$/.test(c.adminSessionSecret||'')||!/^[a-f0-9]{64}$/.test(c.teamSessionSecret||''))throw Error('Dev session secrets missing');
 if(c.phpBinary!=='/home/zbpzpszw/football-dev/workspace/scripts/php-vps-dev.sh')throw Error('Unexpected PHP binary');
 if(c.playerOcrConfigFile!==undefined&&(typeof c.playerOcrConfigFile!=='string'||!c.playerOcrConfigFile.startsWith('/home/zbpzpszw/football-dev/shared/')))throw Error('Unexpected Dev OCR config path');
 return c;
}
function privateFile(file){
 const st=fs.lstatSync(file);
 if(!st.isFile()||st.isSymbolicLink()||(st.mode&0o077)||(typeof process.getuid==='function'&&st.uid!==process.getuid()))throw Error('Configuration must be an owned private regular file');
 return fs.readFileSync(file,'utf8');
}
function authorize(header,digest){
 const value=typeof header==='string'&&header.startsWith('Basic ')?header.slice(6):'';
 if(!value)return false;
 let decoded;try{decoded=Buffer.from(value,'base64').toString('utf8');}catch{return false;}
 return crypto.timingSafeEqual(crypto.createHash('sha256').update(decoded).digest(),Buffer.from(digest,'hex'));
}
async function main(){
 const root=fs.realpathSync(path.resolve(__dirname,'..'));
 const configFile=process.env.FOOTBALL_VPS_DEV_CONFIG;
 if(configFile!=='/home/zbpzpszw/football-dev/shared/dev.private.json')throw Error('Dev config path is not configured');
 const c=validateConfig(JSON.parse(privateFile(configFile)),root);
 const ca=fs.readFileSync(c.caFile);
 if(crypto.createHash('sha256').update(ca).digest('hex')!==c.caSha256)throw Error('Dev CA fingerprint mismatch');
 process.chdir(root);
 for(const key of ['PHASE2_PRODUCTION_CONFIG','PHASE2_TEST_DATABASE','PHASE2_TEST_DSN','PHASE2_TEST_USER'])delete process.env[key];
 Object.assign(process.env,{NODE_ENV:'development',FOOTBALL_VPS_DEV:'1',DATABASE_URL:c.databaseUrl,
  BASE_URL:'',FOOTBALL_LOCAL_CONTENT_ROOT:root,FOOTBALL_LOCAL_SKIP_INIT:'true',
  FOOTBALL_DEV_DB_CA_FILE:c.caFile,FOOTBALL_DEV_DB_TLS_NAME:c.tlsServername,
  ADMIN_SESSION_SECRET:c.adminSessionSecret,TEAM_SESSION_SECRET:c.teamSessionSecret,
  PLAYER_OCR_ENABLED:c.ocrEnabled===true?'true':'false',...(c.playerOcrConfigFile?{PLAYER_OCR_CONFIG_FILE:c.playerOcrConfigFile}:{}),PHASE2_ROOT:path.join(root,'phase2'),PHASE2_DATABASE_URL:c.databaseUrl,
  PHASE2_PHP_BINARY:c.phpBinary});
 const {Pool}=require('pg');
 const probe=new Pool({connectionString:c.databaseUrl,max:1,connectionTimeoutMillis:5000,ssl:{ca,servername:c.tlsServername,rejectUnauthorized:true}});
 try{
  const {rows}=await probe.query("SELECT current_database() AS database,current_user AS role,host(inet_server_addr()) AS address,(SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()) AS ssl");
  const r=rows[0];if(r.database!=='football_dev'||r.role!=='football_dev_app'||r.address!=='143.14.36.234'||r.ssl!==true)throw Error('Dev database identity mismatch');
 }finally{await probe.end();}
 const marker=path.join(root,'phase2/.runtime/database-enabled.json');
 fs.mkdirSync(path.dirname(marker),{recursive:true,mode:0o700});
 const identity=JSON.stringify({host:'143.14.36.234',port:5432,database:'football_dev'})+'\n';
 if(fs.existsSync(marker)){if(privateFile(marker)!==identity)throw Error('Phase 2 Dev DB marker differs');}
 else fs.writeFileSync(marker,identity,{mode:0o600,flag:'wx'});
 const express=require('express');const front=express();front.disable('x-powered-by');
 front.use((req,res,next)=>{
  res.setHeader('X-Robots-Tag','noindex, nofollow');
  res.setHeader('Cache-Control','no-store');
  if(req.headers.host?.split(':')[0]!=='football-dev.pmycfootball.in.th')return res.status(421).send('Unexpected host');
  if(!authorize(req.headers.authorization,c.accessDigest)){res.setHeader('WWW-Authenticate','Basic realm="Football Dev", charset="UTF-8"');return res.status(401).send('Football Dev requires sign-in');}
  next();
 });
 front.use(require(path.join(root,'dist/app.js')).app);
 front.listen(process.env.PORT||4500,()=>console.log('Football Dev started with verified Dev database'));
}
module.exports={validateConfig,authorize,main};
if(require.main===module)main().catch(e=>{console.error('Dev startup stopped:',e.code||'DEV_CONFIGURATION_OR_IDENTITY_CHECK_FAILED');process.exitCode=1;});
