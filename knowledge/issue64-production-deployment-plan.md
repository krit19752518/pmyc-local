# ร่างแผน deploy Production — issue #64

สถานะ: deploy และผู้ใช้ตรวจรับ Production ผ่านแล้ว;issue #64 ปิด completed ที่2026-11-10T09:06:47Z ผลตรวจagentและข้อจำกัดเดิมเก็บแยกจากuser acceptance

- Issue: [#64](https://github.com/krit19752518/pmyc-football/issues/64)
- วันที่: 2026-11-10
- Workflow: Manual Selective Deployment ตาม [SOP](manual-selective-deployment-sop.md) และ [release standard](git-release-standard.md)

## ผลลัพธ์ที่จะ deploy

หน้า `/team/team.php` ถอด field ใบรายชื่อนักกีฬาทั้ง label/OPTIONAL/ปุ่มเลือกแนบ/รีวิว/สถานะไฟล์เดิม และรายการ client-side validation ของช่องนี้ คงหนังสือรับรองทีม ข้อมูลอื่น ปุ่มบันทึก เอกสารที่เคยแนบ และ API/schema เดิม

Local build ผ่าน; focused133/133,full913/913ใน59suites,syntax/diff ผ่าน ผู้ใช้ตรวจรับ Local แล้ว Agent ยังไม่ได้ตรวจ authenticated desktop/mobile เพราะ browser host ไม่พร้อม จึงแยก user acceptance ออกจาก agent verification

## ไฟล์และตัวตน release

Deploy runtime 1 ไฟล์:

| Artifact | Bytes | SHA-256 ของ Local ปัจจุบัน |
|---|---:|---|
| `dist/routes/team/teamRoster.router.js` | 274635 | `976ba1f1a5794d1ec1977883c0bc858aa21be24beca62e190213d465c41b0f57` |

- Target: `/home/zbpzpszw/football_app/football/dist/routes/team/teamRoster.router.js`
- Local HEAD/base ปัจจุบัน: `dcf498e741b92d83faa8cafe35a1009161a9dca9`,branch main ไม่มี remote/upstream;ยังไม่มี candidate commit issue64
- Source/test path ที่จะ freeze หลังอนุมัติเริ่ม deploy: `src/routes/team/teamRoster.router.ts`,`dist/routes/team/teamRoster.router.js`,`tests/team-profile-update.test.ts`,`tests/production-parity.test.ts`,`tests/fixtures/issue64-team-profile-roster-runtime.json` รวม5paths ไม่รวมงาน knowledge/ledger ที่ค้างจาก issueอื่น
- ใช้ isolated sparse worktree ที่ exclude uploads/runtime data ก่อน materialize;ไม่ clone/fetch/push;build และรัน focused/fulltests/syntax/diff กับ candidate จริง ตรวจ ancestry/complete changed paths/scopedclean state และ hash/modeอีกครั้ง
- หาก hash หรือขอบเขตเปลี่ยน ให้ reconcile และเสนอ manifest ใหม่ก่อน Production write

### Baseline ต้องแยก Local กับ Production

หลักฐาน issue63ล่าสุด (`release/issue63-dcf498e-20261110T075718Z/runtime-final.json`) ระบุ Production target275882bytes,rawSHA `2bec27a36da906729c575dd48be94a1c09511ee580ab6c722058dda56d8f169c`,0644,uid1482/gid1486

Local HEAD ก่อน issue64 มี rawSHA `660a61c04080061645af3c0933c91c67fc8b329ed7f7e065fdf548af46fd16a9` จึงห้ามใช้ Local HEAD rawhash แทน livebaseline/backup identity

Production contract ใน `tests/fixtures/production-parity-20261109.json` ผูก rawSHA2becฯ กับ canonicalSHA `691f5c31e6dd18b7117830076d543dbe0ba9754b0d58d86251be524b6e8b0b79` Localก่อนแก้ตรง canonicalนี้ และ issue64 fixtureย้อน2editsกลับไปเทียบทั้งmoduleเดิมผ่าน โดย newcanonicalคือ `34f33620b2a42fa15144955dbcc5d40d5413d85d9a03e48f43449bf07cca4edd`

ก่อน deploy ต้องตรวจ liverawhash/metadata ใหม่ เทียบ contract และ review preservation ทั้งmodule ไม่ใช่ดูเฉพาะฟังก์ชันหน้าเป้าหมาย หาก liveต่างจาก baseline หรือมีพฤติกรรมที่ candidateไม่ครอบคลุม ให้หยุด targeted reconciliation ไม่ overwrite โดยสมมติ ดู[บทเรียน runtime drift](incident-2026-11-09-release-source-runtime-drift.md)

## Preflight ก่อนขอ Gate A

1. ยืนยัน candidate ที่ build/testแล้วและ exact allowlist1runtime;รักษางานค้างและ worktrees อื่น ไม่ reset/clean/stash/stageรวม
2. Production แบบอ่านอย่างเดียว: exact target/realpath/type/hash/bytes/owner/mode,parent filesystem/space/permissions;Appcheckout branch/HEADและสถานะที่ exclude uploads;Passenger entry mapping และ marker metadata ไม่ถือcheckoutSHAเป็นruntime identity
3. Preserve runtimeนอกtarget โดยเฉพาะ issue63adminLayout SHA `7f83020d21b53f3c9a1ba97d7a1cd56b26a223436ebf795541de5ce6585e5249`,issue62teamLayout SHA `f6c6435d0138b54d57e5cdd9026a277c7afde9a2a13f3ebd916d9224c27f889b`,QR SHA `9034927c2e5fdb244ef6b580830b866f06f9154cb85303de46c3f9d42e6feeb2` รวมstartup/controlและknown runtime drift เดิม;ไม่มีการส่ง asset หรือสร้าง directory
4. ตรวจ actual startupcallgraph โดย pin `dist/app.js`,`dist/server.js`,`dist/adminAuth.js`,`dist/db/initTables.js` และimports/controlที่เกี่ยวข้อง ยืนยันproductionguardข้ามinitializers;ทบทวนผลข้างเคียงของimport/debug retention ที่ได้รับอนุญาตเดิม ห้ามเพิ่มcapture/ขยายexpiry/เปิดinitializer
5. DB Serverเท่านั้น ใน READ ONLY transaction: schema/type/index,countsพร้อมเวลา,release/startup predicates และ0pendingbackfillที่อาจถูกเรียก;guardข้ามinitializerให้บันทึกว่าไม่ถูกเรียก ไม่อ้างว่าตรวจpredicateที่ไม่ได้คำนวณ ตรวจOCRjobs/cache leasesว่าidleก่อนrestart ไม่เปลี่ยนDBเพื่อทำให้preflightผ่าน
6. ยืนยัน actual filesystem modeของcandidate0644ก่อนSCP ไม่อนุมานจากGit100644 ตาม[บทเรียน stage permissions](incident-2026-11-10-selective-stage-file-modes.md) ตรวจstage/backuppathsใหม่ไม่ชน ไม่aliasและsamefilesystem
7. สร้าง machine-readable manifest/action plan ระบุสถานะหลักฐานตามจริง Validate ก่อน consequential actions;pending approval/preconditionsไม่ครบต้องdecisionstop ไม่ทำเป็นproceedเพื่อให้validatorผ่าน

รอบร่างแผนนี้ไม่ได้เชื่อมต่อ Production สถานะจาก issue63เป็น historical baseline ที่ต้องตรวจสด ไม่ใช่ fresh preflight issue64

## Gate A — stage1และfreshbackup1

หลังpreflightครบ เสนอcandidateSHA/artifactSHAและexactpathsเพื่อขอ Gate A แยก

กำหนด `T=/home/zbpzpszw/football_app/football/dist/routes/team/teamRoster.router.js`:

- Stage: `T.stage-<issue64-candidate-timestamp>`
- Backup: `T.backup-<issue64-candidate-timestamp>`

หลังอนุมัติ จึงส่งไฟล์candidateเดียวไปstage0644/ownergroupของappที่ตรวจสด ตรวจSHA/size/regularfile/owner/mode/noalias แล้วcopyliveไปfreshbackupแบบไม่เขียนทับ ตรวจbackupตรงกับimmediatelypre-copyliveทุกค่า เก็บbackupไว้ ตรวจlive/control/QR/layouts/checkout/markerยังเดิม

Gate Aไม่รวมpromotion/restart/assetupload/directorycreation หากtransfer/metadata/backupผิดหรือผลไม่แน่ชัด ให้หยุดและreconcileก่อนเขียนต่อ

## Gate B — promote,restart,verify และconditionalrollback

หลัง Gate Aผ่าน เสนอexactstage/target/backupและSHA พร้อมstartup/DBหลักฐานใหม่เพื่อขอ Gate B แยก

1. หลังอนุมัติ recheckcandidate/manifest,live/stage/backup/hash/metadata,noalias,startup/control/marker และDB/schema/backfill/idleล่าสุด หากต่างให้หยุด
2. Same-filesystem atomic rename stageไปexacttarget1ไฟล์ ตรวจcandidateSHA/bytes/owner/modeทันที และpreservebackup/ไฟล์อื่น
3. ตรวจstartupguard/controlและDB/idleซ้ำทันทีก่อนtouchเฉพาะFootball Passenger marker `/home/zbpzpszw/public_html/pmycfootball.in.th/tmp/restart.txt` ไม่killworkers/restartบริการอื่น/migration/bootstrap
4. บันทึกrestarttimestamp,ยืนยันnewProductionNode22workerและboundedstartup-error/readinessmetadata หากreadinessbeaconหมดอายุไม่ต่ออายุหรืออ้างreadyeventที่ไม่ใช่รอบนี้ หากHTTPtimeout/ไม่พบPIDใหม่ ให้หยุดconsequentialactionsและreconcileแบบอ่านอย่างเดียว ไม่restartซ้ำโดยเดา
5. HTTPHTTPS: homepage,Adminlogin`/admin/index.php`,SATlogin,teamlogin,anonymousprotectedpage redirect และQRเดิม;ใช้outputเฉพาะoperationและtimestampหลังrestart ห้ามนำpassedJSONเก่ามาอ้างเมื่อproducerfail ตาม[บทเรียน HTTP freshness](incident-2026-11-10-post-restart-http-evidence.md)
6. AuthenticatedUIด้วยsessionที่อนุญาตหรือให้ผู้ใช้ทดสอบ:หน้าข้อมูลทีมไม่มีfield/ปุ่มแนบ/รีวิวใบรายชื่อ หนังสือรับรองทีม/ข้อมูล/ปุ่มบันทึกแสดงถูกdesktop/mobile หน้าplayers/download/registerและQRdashboardจาก62/63ยังเดิม การsmokeโดยagentใช้read-only ไม่submitฟอร์มหรือแนบไฟล์จริงเพื่อทดสอบDBwrite
7. DBREADONLYpostcheckบนDBServer บันทึกcounts/schema/indexและเวลา ไม่อนุมานความต่างของcountsว่าเกิดจากdeploy ตรวจfinaltarget/backup/control/layouts/QR/checkoutอีกครั้ง
8. บันทึกผลจริง ถ้าไม่มีauthorizedbrowser/UIให้partially_verifiedและรอuserProductionacceptanceก่อนปิดissue64 ไม่อ้างHTTP200เป็นผลตรวจUI

## Rollback

Gate Bครอบคลุมconditionalrollbackเมื่อพบcriticalhash/load/startup/service/UIfailure ต้องยืนยันexactfreshbackupSHA/metadataและstartup safetyก่อน คืนเฉพาะteamRoster.router.jsแบบatomicโดยคงbackupไว้ ตรวจhashแล้วrestartเฉพาะFootballเมื่อguard/DB/idleผ่านและตรวจผลซ้ำ ไม่คืนทั้งdirectory/DB/QR/layouts ไม่ลบเอกสารเดิม หากbackupหรือstartup safetyไม่ชัดให้หยุดและreconcile ไม่ซ่อมโดยพลการ

## Hook lock และขอบเขต

หากCodexCLIhooklock ให้หยุดrecordactualerror/sideeffects,reconcileแบบอ่านอย่างเดียว ไม่แก้/ลบlock ไม่blindretryหรือใช้surfaceอื่นข้ามข้อห้าม ใช้userunlockและtaskใหม่ตามflowที่รองรับ Permission/namespace mismatch ต้องใช้สิทธิ์ที่อนุญาตอย่างเจาะจงและตรวจidentityก่อนmutation

ไม่รวมProductionGitcheckoutupdate,push/fetch/merge,serverinstall/build,deployscripts/sync,DB/schema/configchange,uploadsinspectionหรือการลบไฟล์เก่า,OCR/LINE/supportreportsubmission

เก็บapproval/manifest/stage/backup/live/restart/HTTP/process/DB/UI evidenceในrepositoryreleaseledgerและissue64 แยกsource/remote/checkout/runtime identityตามจริง ข้อจำกัดcentralsoftwareledgerที่ต้องremoteSHAแต่Localไม่มีremoteยังเก็บแยก ไม่สร้างSHAเท็จหรือแก้sharedschema/profileในงานนี้

## ผลเตรียม release และคำขอ Gate A

- Candidate `726ec90639b399d1ce85dcada8feb24c7cf0ef9a`,base`dcf498e741b92d83faa8cafe35a1009161a9dca9`;commitเฉพาะ5pathsตามแผน isolatedworktree`/tmp/football-issue64-release-726ec90` excludeuploads/runtimeก่อนmaterialize;ไม่มีremote/push และรักษางานเอกสารค้างเดิม
- Isolatedbuild,133focused,913full/59suites,syntax/diff,wholemodule inverse2edits และ scopedcleanworktreeผ่าน;artifacthash/274635bytes/0644ตรงแผน
- Freshread-onlyruntime08:37:04Zตรงbaseline2becฯ,20controls/14preservedmodulesและ7Productionworker environments;DBREADONLY15:36:56+07ผ่านschema/index/0activejobs/0runningcache;HTTP/QR08:37:45Zผ่าน;stage/backup08:37:48Zยืนยันว่ายังไม่มี,writableparent,samefilesystem
- [Baseline reconciliation](../release/issue64-726ec90-20261110T083739Z/baseline-reconciliation.json) แยกrawProductionจากrawLocal และยืนยันcanonicalทั้งmodule
- [คำขอ Gate A พร้อม exactpaths/hash](../release/issue64-726ec90-20261110T083739Z/gate-a-request.md);[pending action plan](../release/issue64-726ec90-20261110T083739Z/gate-a-plan-pending.json) คงdecisionstopจนอนุมัติ แล้วจึงตรวจใหม่และvalidateapprovedplan ไม่ใช้pendingplanอนุญาตmutation
- ยังไม่มีProductionwrite/stage/backup/promotion/restartของissue64 และยังไม่ขอหรือใช้GateB

## ผล Gate A และคำขอ Gate B

ผู้ใช้อนุมัติ Gate Aแล้ว approvedactionplanผ่านvalidator ส่งstage1ไฟล์และสร้างfreshbackup1ไฟล์แบบไม่เขียนทับ ผล08:42:34Zตรวจผ่านcandidateSHA976ฯ/274635bytesและbackup/liveSHA2becฯ/275882bytes ทั้ง0644/uid1482gid1486/noalias พร้อม20controls/14preservedmodules/QR/layouts/checkout/markerเดิม DBREADONLY15:42:14+07ผ่านschema/indexและ0activejobs/0runningcache

[ผลGateA](../release/issue64-726ec90-20261110T083739Z/gate-a-result.json) และ[คำขอ Gate B exactpaths/hashes](../release/issue64-726ec90-20261110T083739Z/gate-b-request.md) ยังไม่promote/restartและไม่ใช้GateBจนมีfreshapproval

## ผล Gate B และ Production deployment

ผู้ใช้อนุมัติ Gate Bแล้ว approvedplanผ่านvalidatorก่อนatomicpromote1ไฟล์ ตรวจtargetSHA/metadataและbackup/controlตรงทั้งหมด ตรวจstartup/DBทันทีอีกครั้งก่อนrestartเฉพาะFootballครั้งเดียวที่`2026-11-10T08:45:34.014881+00:00` (15:45:34ไทย) marker_ns`1794300334014881386`

[ผลรวม](../release/issue64-726ec90-20261110T083739Z/result.json) เป็นdeployed,partially_verified:finalruntime/20controls/14preservedmodules/QR/layouts/checkout/backupผ่าน,newProductionNode22workerพร้อม,0trackedstartup-errors;HTTPชุดใหม่เริ่มหลังrestartทั้งหมดผ่าน;DBREADONLYpostcheckschema/index/0activejobs/0runningcacheผ่าน ไม่อ้างสาเหตุcount differences

Backupเก็บไว้ rollbackไม่ถูกใช้ ไม่มีProductionDBwrite/อ่านuploads/submitฟอร์มจริง/OCR/LINEหรือส่งasset รอบdeployไม่พบhooklock rejection ยังไม่ยืนยันauthenticateddesktop/mobile/savingbehaviorโดยagent รอuserProductionacceptanceก่อนปิดissue64

## ผู้ใช้ตรวจรับและปิด issue

ผู้ใช้ยืนยัน “เทสที่ production ผ่าน ปิด issue ได้”;freshGitHubGETยืนยันissue64closed/completedที่2026-11-10T09:06:47Z ดู[acceptance record](../release/issue64-726ec90-20261110T083739Z/production-acceptance.json) เก็บผลdeploymentเดิมและagentUI/savinglimitationsตามจริง ไม่มีProductionwrite/restartเพิ่มในรอบปิดงาน
