import {sendPasswordResetEmail} from '../src/services/mailer.service';
it('suppresses external password-reset delivery in explicit VPS Dev',async()=>{
 const old={...process.env};
 try{
  Object.assign(process.env,{NODE_ENV:'development',FOOTBALL_VPS_DEV:'1'});
  await expect(sendPasswordResetEmail('fixture@example.invalid','fixture-user','https://example.invalid/reset')).resolves.toEqual({success:true,messageId:'dev-email-disabled'});
 }finally{process.env=old;}
});
