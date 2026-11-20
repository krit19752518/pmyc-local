import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
const {loadDatabaseUrl}=require('../scripts/registration-statistics/production-runner.cjs');
let directory:string;
const expected={uid:process.getuid!(),host:'143.14.36.234',port:5432,database:'my_office_db'};
beforeEach(()=>{directory=fs.mkdtempSync(path.join(os.tmpdir(),'football-statistics-production-runner-test-'));});
afterEach(()=>fs.rmSync(directory,{recursive:true,force:true}));
function file(content:string,mode=0o600){
  const name=path.join(directory,'synthetic.env');fs.writeFileSync(name,content,{mode});return name;
}
it('uses only the managed database and does not evaluate shell substitutions or copy unrelated keys',()=>{
  const value='postgres://synthetic:fixture$()@143.14.36.234:5432/my_office_db';
  const name=file('# synthetic fixture only\nOTHER_KEY=ignored\nDATABASE_URL='+value+'\n');
  expect(loadDatabaseUrl(name,expected)).toBe(value);
});
it('matches first-nonempty Passenger configuration semantics without treating comments as settings',()=>{
  const value='postgresql://synthetic@143.14.36.234/my_office_db';
  const name=file('DATABASE_URL=\n# DATABASE_URL=wrong\nDATABASE_URL='+value+'\nDATABASE_URL=postgres://synthetic@unexpected.invalid/wrong\n');
  expect(loadDatabaseUrl(name,expected)).toBe(value);
});
it('rejects a wrong host/port/database or absent URL before importing the application job',()=>{
  for(const text of ['OTHER_KEY=ignored','DATABASE_URL=postgres://fixture@localhost/my_office_db','DATABASE_URL=postgres://fixture@143.14.36.234:5433/my_office_db','DATABASE_URL=postgres://fixture@143.14.36.234/wrong']){
    const name=file(text);expect(()=>loadDatabaseUrl(name,expected)).toThrow();fs.unlinkSync(name);
  }
});
it('rejects writable-by-others, symlink and wrong-owner settings while accepting existing readonly0644 mode',()=>{
  const name=file('DATABASE_URL=postgres://synthetic@143.14.36.234/my_office_db',0o644);
  expect(loadDatabaseUrl(name,expected)).toContain('my_office_db');
  expect(()=>loadDatabaseUrl(name,{...expected,uid:expected.uid+1})).toThrow('UNSAFE_MANAGED_CONFIGURATION');
  fs.chmodSync(name,0o666);expect(()=>loadDatabaseUrl(name,expected)).toThrow('UNSAFE_MANAGED_CONFIGURATION');
  fs.chmodSync(name,0o600);const link=path.join(directory,'link.env');fs.symlinkSync(name,link);
  expect(()=>loadDatabaseUrl(link,expected)).toThrow('UNSAFE_MANAGED_CONFIGURATION');
});
it('runs from the installed private layout using managed environment, and fails closed before loading the job on wrong configuration',()=>{
  const privateRoot=path.join(directory,'.runtime/registration-statistics');
  const jobRoot=path.join(directory,'dist/jobs');
  fs.mkdirSync(privateRoot,{recursive:true});fs.mkdirSync(jobRoot,{recursive:true});
  const runner=path.join(privateRoot,'run.cjs');
  fs.copyFileSync(path.join(__dirname,'../scripts/registration-statistics/production-runner.cjs'),runner);
  fs.writeFileSync(path.join(directory,'.env'),'OTHER_KEY=not-loaded\nDATABASE_URL=postgres://synthetic@143.14.36.234/my_office_db\n',{mode:0o600});
  fs.writeFileSync(path.join(jobRoot,'refreshRegistrationStatistics.js'),"exports.main=async()=>{if(process.cwd()!==require('node:path').resolve(__dirname,'../..'))throw Error('cwd');if(process.env.DATABASE_URL!=='postgres://synthetic@143.14.36.234/my_office_db')throw Error('env');if(process.env.REGISTRATION_STATISTICS_DIR!==require('node:path').join(process.cwd(),'.runtime/registration-statistics'))throw Error('store');if(process.env.OTHER_KEY)throw Error('extra-key');console.log('synthetic_job_loaded');};");
  const options={encoding:'utf8' as const,env:{PATH:process.env.PATH,NODE_ENV:'production',DATABASE_URL:'postgres://inherited.invalid/wrong'}};
  const valid=spawnSync(process.execPath,[runner],options);
  expect(valid.status).toBe(0);expect(valid.stdout).toContain('synthetic_job_loaded');
  expect(valid.stdout).toContain('registration_statistics_run_finished');expect(valid.stderr).toBe('');
  fs.writeFileSync(path.join(directory,'.env'),'DATABASE_URL=postgres://synthetic@unexpected.invalid/wrong\n');
  const invalid=spawnSync(process.execPath,[runner],options);
  expect(invalid.status).toBe(1);expect(invalid.stdout).not.toContain('synthetic_job_loaded');
  expect(invalid.stderr).toContain('CONFIGURATION_OR_RUNTIME_CHECK_FAILED');
  expect(invalid.stderr).not.toContain('unexpected.invalid');
});
