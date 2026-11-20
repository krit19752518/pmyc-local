import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const {readLocalDatabase}=require('../scripts/refresh-registration-statistics-local.cjs');
let directory:string;
beforeEach(()=>{directory=fs.mkdtempSync(path.join(os.tmpdir(),'football-local-statistics-config-test-'));});
afterEach(()=>fs.rmSync(directory,{recursive:true,force:true}));
function file(value:string,mode=0o600){
  const name=path.join(directory,'synthetic.json');
  fs.writeFileSync(name,JSON.stringify({databaseUrl:value}),{mode});
  return name;
}
it('allows only private regular loopback PostgreSQL configuration with an explicit database',()=>{
  for(const url of ['postgres://fixture@127.0.0.1/fixture','postgresql://fixture@localhost/fixture','postgres://fixture@[::1]/fixture']){
    const name=file(url);
    expect(readLocalDatabase(name).database).toBe('fixture');
    fs.unlinkSync(name);
  }
});
it('rejects nonloopback/protocol/default-database targets before opening any connection',()=>{
  for(const url of ['postgres://fixture@example.invalid/fixture','https://localhost/fixture','postgres://fixture@127.0.0.1/']){
    const name=file(url);expect(()=>readLocalDatabase(name)).toThrow('LOCAL_LOOPBACK_DATABASE_REQUIRED');fs.unlinkSync(name);
  }
});
it('rejects permissive files and symlinks',()=>{
  const name=file('postgres://fixture@127.0.0.1/fixture',0o644);
  expect(()=>readLocalDatabase(name)).toThrow('LOCAL_PRIVATE_CONFIGURATION_REQUIRED');
  fs.chmodSync(name,0o600);
  const link=path.join(directory,'link.json');fs.symlinkSync(name,link);
  expect(()=>readLocalDatabase(link)).toThrow('LOCAL_PRIVATE_CONFIGURATION_REQUIRED');
});
