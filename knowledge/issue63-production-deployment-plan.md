# ร่างแผน deploy Production — issue #63

สถานะ: deploy และผู้ใช้ตรวจรับ Production ผ่านแล้ว; issue #63 ปิด completed ที่2026-11-10T08:12:01Z ผลตรวจของagentและข้อจำกัดเดิมเก็บแยกจากuser acceptance

- Issue: [#63](https://github.com/krit19752518/pmyc-football/issues/63)
- วันที่: 2026-11-10
- วิธี deploy: Manual Selective Deployment ตาม [SOP](manual-selective-deployment-sop.md) และ [Git/release standard](git-release-standard.md)

## ผลงานและหลักฐาน Local

เปลี่ยนเฉพาะ dashboard ของ กกท.จังหวัด ให้ใช้ QR เดิมกับข้อความ “แจ้งปัญหาการใช้ระบบ” สีแดงตัวหนา แทนปุ่มและ modal เดิม โดยคง Admin ส่วนกลาง หน้า SAT อื่น หน้าทีม ประวัติปัญหา API และสิทธิ์จังหวัด/session ตามเดิม

Build ผ่าน, focused tests160/160 และ full tests912/912 ใน59 suites ผ่าน รวม syntax/diff/runtime contract ผู้ใช้ยืนยัน Local ผ่านแล้ว ส่วน agent ยังไม่ได้ตรวจหน้าจริงหรือสแกนเองเพราะเครื่องมือเบราว์เซอร์ไม่พร้อมใช้งาน บันทึกหลักฐานสองส่วนนี้แยกกัน

## ขอบเขตไฟล์

Deploy เฉพาะไฟล์นี้:

| Artifact | ขนาด | SHA-256 ของ Local ปัจจุบัน |
|---|---:|---|
| `dist/adminLayout.js` | 14472 bytes | `7f83020d21b53f3c9a1ba97d7a1cd56b26a223436ebf795541de5ce6585e5249` |

- Target: `/home/zbpzpszw/football_app/football/dist/adminLayout.js`
- Baseline ที่คาดจาก Local HEAD และหลักฐาน Production เดิม: `c466c25b755dfbfc506412c0a0d0dc0bf4e9d54d69a4bbd82d28b8a2cb9c04f8` ต้องตรวจ live ใหม่ก่อนใช้
- QR เดิม: `public/images/lineoa-support-qr.png`,51523 bytes,SHA-256 `9034927c2e5fdb244ef6b580830b866f06f9154cb85303de46c3f9d42e6feeb2`
- QR URL ที่จะตรวจ: `https://pmycfootball.in.th/images/lineoa-support-qr.png`
- `dist/teamLayout.js` เดิมที่ต้องคงไว้: SHA-256 `f6c6435d0138b54d57e5cdd9026a277c7afde9a2a13f3ebd916d9224c27f889b`

ไม่ส่งรูปหรือสร้างโฟลเดอร์เพิ่ม หาก QR บน Production หายหรือ hash เปลี่ยน ให้หยุดและทบทวนก่อน การซ่อมหรือส่ง asset เพิ่มต้องเสนอขอบเขตและอนุมัติใหม่

## เตรียม candidate และตรวจ Production แบบอ่านอย่างเดียว

1. Local root คือ `/home/krit/my-office/grit-solution/football`,branch `main`,base HEAD ปัจจุบัน `73f6655952cb279fafbf6041b6662d7b70aa21e5` ยังไม่มี candidate commit ของ issue63 และ repository นี้ไม่มี remote/upstream
2. หลังอนุมัติให้เริ่ม deploy จึง freeze source เฉพาะ6path: `src/adminLayout.ts`,`dist/adminLayout.js`,`tests/support-report.test.ts`,`tests/admin-session-security.test.ts`,`tests/production-parity.test.ts`,`tests/fixtures/issue63-sat-support-qr-runtime.json` รวมเอกสาร issue63 เฉพาะที่ตรวจรับตามจำเป็น รักษางานค้างอื่น ห้าม reset/clean/stash หรือ stage รวม
3. สร้าง isolated sparse worktree ที่กัน operational data ออก พร้อม static fixtures ที่ full tests ต้องใช้ จากนั้น build/test candidate จริง ตรวจ ancestry/changed paths/syntax/diff และ hash ให้ตรงตาราง หากเปลี่ยนต้อง reconcile และเสนอ manifest ใหม่
4. อ่านเฉพาะ metadata/hash ของ target, startup/control, Passenger entry และ Git branch/HEAD/worktree ที่ตรวจแบบกัน uploads ออก เปรียบเทียบพฤติกรรมเดิมของ target กับ runtime preservation contract ไม่ overwrite runtime drift ที่อธิบายไม่ได้
5. ตรวจ QR เดิมผ่าน HTTPS/hash และคง teamLayout กับ runtime จาก issue61/62 ตรวจ parent directory,พื้นที่ว่าง,owner/mode และ stage/backup path ไม่ชนกัน
6. ตรวจ startup call graph/side effects ของไฟล์จริง โดย pin `dist/app.js`,`dist/server.js`,`dist/adminAuth.js`,`dist/db/initTables.js` และ imports/control ที่เกี่ยวข้อง ยืนยัน Production guard ที่ข้าม initializers ไม่ถือว่า restart เป็นงานที่ไม่มีผลต่อข้อมูลโดยอัตโนมัติ
7. DB checks ทำบน DB Server เท่านั้น ใน READ ONLY transaction: schema/type/index,aggregate counts พร้อมเวลา,เงื่อนไข startup/backfill และ OCR jobs/cache leases ต้องมี schema ครบ ไม่มี pending startup writes และไม่มีงาน OCR กำลังทำงานก่อน restart ห้ามแก้ DB/jobs เพื่อให้ผ่าน check หาก guard ข้าม initializer ให้บันทึกตามจริง
8. จัด manifest/action plan ตามหลักฐานจริงและ validate ก่อน consequential actions แผนที่ยังมี precondition ไม่ยืนยันต้องไม่ระบุ proceed

## Gate A — stage1ไฟล์ และ backupใหม่1ไฟล์

เมื่อ preflight ครบ จึงเสนอ candidate SHA,artifact SHA และ path ที่ resolve แล้วเพื่อขออนุมัติ Gate A แยกต่างหาก

ใช้ target `T=/home/zbpzpszw/football_app/football/dist/adminLayout.js`:

- Stage: `T.stage-<release-idใหม่>`
- Fresh backup: `T.backup-<release-idใหม่>`
- release-id ผูกกับ candidate SHA และ timestamp ตรวจทั้งสอง path ว่ายังไม่มีและไม่ alias กับ live

หลัง Gate A อนุมัติ ส่งเฉพาะ artifact ที่ build/test แล้วไป stage เป็น0644 ตาม owner/group ของ app ที่ตรวจใหม่ ตรวจ actual filesystem mode ก่อน transfer ไม่อนุมานจาก Git100644 ตาม [บทเรียน permission ของ stage](incident-2026-11-10-selective-stage-file-modes.md)

สร้าง backup ใหม่จาก live ทันที และตรวจ SHA/size/owner/mode ให้ตรง pre-copy live ตรวจ stage/hash/metadata และยืนยัน live/startup/control/QR/teamLayout/marker/checkout ยังเดิม

Gate A ไม่รวม promotion,restart,ส่งรูปหรือสร้าง directory หากขั้นใดผิดพลาดหรือผลไม่แน่ชัด ให้หยุดและ reconcile ก่อนเขียนต่อ ไม่ retry แบบเดาสุ่ม

## Gate B — promote1ไฟล์, restart และตรวจผล

หลัง Gate A ผ่าน จึงเสนอหลักฐาน stage/backup/live และ preflight ล่าสุดเพื่อขออนุมัติ Gate B แยกต่างหาก ครอบคลุม promotion,restart,verification และ rollback ตามเงื่อนไข

1. ตรวจ candidate/manifest/live/stage/backup/hash/metadata,QR/teamLayout,startup/control/marker และ DB/schema/backfill/idle ใหม่ทันที หากต่างจากที่อนุมัติให้หยุด
2. ใช้ same-filesystem atomic rename แทนที่เฉพาะ target `dist/adminLayout.js` แล้วตรวจ hash/size/owner/mode เก็บ backup ไว้และคงทุกไฟล์นอกขอบเขต
3. ตรวจ startup/DB/idle ซ้ำทันทีก่อน restart เฉพาะ Football Passenger ผ่าน `/home/zbpzpszw/public_html/pmycfootball.in.th/tmp/restart.txt` ไม่ kill process,ไม่ restart บริการอื่น,ไม่ migration/bootstrap หรือเปลี่ยน config
4. ตรวจ new Node22 Production worker และ bounded startup-error metadata ไม่ต่ออายุ diagnostics/capture หาก readiness window หมดอายุให้บันทึกว่าไม่ใช้ beacon นั้น หาก snapshot ไม่พบ PID ใหม่ ให้ตรวจ HTTP/process/log แบบอ่านอย่างเดียวก่อนสรุป ไม่ restart ซ้ำโดยเดา
5. ตรวจ HTTPS homepage,team/Admin/SAT login และ anonymous SAT dashboard redirect ตามเดิม ตรวจ public QR200/image/png/hash และ target/backup/runtime/control ที่ต้องคงไว้ HTTPหรือimagehashอย่างเดียวไม่ใช่ผลตรวจ UI/scan
6. ใช้ session ที่อนุญาตหรือให้ผู้ใช้ทดสอบ SAT dashboard:ปุ่ม/modal เดิมหาย,QR/ข้อความแดงหนาถูกต้อง,desktop/mobile/สแกนและhistory linkถูกSATnamespace ตรวจ Adminส่วนกลาง/SATหน้าอื่นยังมีwidget และหน้าทีมissue62คงเดิม ไม่ส่ง support report/LINE message,ไม่อ่าน uploads/เรียก OCR หรือเปลี่ยน application records เพื่อ smoke test
7. ทำ DB post-check แบบ READ ONLY บน DB Server บันทึกเวลาและ counts โดยไม่อนุมานว่าความต่างเกิดจาก deploy ไม่แก้ข้อมูลเพื่อทำให้ counts เท่ากัน ตรวจ runtime/backup/startup/asset hash รอบสุดท้าย
8. ถ้า authenticated browser/scan ใช้ไม่ได้ ให้รายงาน partially verified และรอ user Production acceptance ยังไม่ปิด issue63 จนผู้ใช้ตรวจผ่านและสั่งปิด

## Rollback แบบจำกัดขอบเขต

Gate B ต้องครอบคลุม rollback เมื่อพบ critical hash/load/startup/service/UI failure ตรวจ exact fresh backup path,baseline SHA และ metadata ก่อน แล้วคืนเฉพาะ `dist/adminLayout.js` แบบ atomic โดยเก็บ backup ไว้ สามารถใช้ stage path ที่ถูก consume ไปแล้วเป็น verified rollback temporary ตรวจ startup safety อีกครั้งก่อน restart เฉพาะ Football และตรวจ HTTP/service/hash ซ้ำ

ไม่ rollback หรือแก้ QR,teamLayout,directory,DB/cache/report/review ไม่ restore/delete ทั้ง directory หาก backup หรือ restart safety ไม่ชัดเจนให้หยุด ไม่ซ่อมโดยพลการ และ reconcile timeout/readiness แบบอ่านอย่างเดียวก่อนตัดสินใจทำ consequential action ต่อ

## ข้อจำกัดและหลักฐาน

หาก Codex CLI hook lock ให้หยุดงานที่เกี่ยวข้อง บันทึก error/ผลข้างเคียงจริงและ reconcile แบบอ่านอย่างเดียว ห้ามแก้/ลบ lock หรือ retry ข้ามสิทธิ์ ใช้ user acknowledgement และ task แยกตาม flow ที่รองรับ

เก็บ source/manifest/stage/backup/live metadata,approval,restart,HTTP/process/UI/DB และ rollback evidence ลง repository release ledger และ issue63 ข้อจำกัด central software-ledger ที่ต้องมี remoteSHA แต่ Local ไม่มี remote ยังคงบันทึกแยก ห้ามสร้าง SHA เท็จหรือแก้ shared schema/profile ภายใต้งานนี้

แผนนี้ไม่รวม Git push/fetch/merge/Production checkout update,server npm install/build,deploy script,directory sync,DB/schema/config/credential change,uploads inspection หรือ paid OCR

รอบร่างแผนนี้ยังไม่ได้ติดต่อ Production,commit candidate,stage/backup/restart หรือ deploy ต้องตรวจ Production สดและขอ Gate A/B ตาม SOP ก่อน execution การอนุมัติ issue62 ไม่ครอบคลุม issue63

## ผลเตรียม deploy และสถานะรอ Gate A

- Candidate `dcf498e741b92d83faa8cafe35a1009161a9dca9`, base `73f6655952cb279fafbf6041b6662d7b70aa21e5`; isolated worktree `/tmp/football-issue63-release-dcf498e` มีเฉพาะ6pathsของissue63 ไม่มี remote/push และรักษางานเอกสารค้างเดิม
- Isolated build,focused160/160,full912/912ใน59suites,syntax,diff และ scoped clean worktree ผ่าน; artifact14472bytes/mode0644/hashตรงตารางเดิม
- Production READ ONLY preflight: targetbaseline,19controls,15preservedmodules,QR/teamLayout,Passenger productionguard/6workers และ checkoutผ่าน; DB schema/indexesผ่าน0activejobs/0runningcache; HTTPหน้าเข้าAdminที่ถูกต้องคือ`/admin/index.php` และ QR200พร้อมhashตรง
- [Gate A request](../release/issue63-dcf498e-20261110T075718Z/gate-a-request.md) ระบุ exactstage/backup/target/hash; ยังไม่ดำเนินการ Gate A/B
- [Pending action plan](../release/issue63-dcf498e-20261110T075718Z/gate-a-plan-pending.json) ตั้งdecisionstopตามสถานะรออนุมัติ; validatorคืน`RELEASE_PLAN_BLOCKED: plan decision is stop` จึงไม่ใช่ executable approval และจะ validateแผนใหม่หลังได้GateAจริง ไม่เปลี่ยนเป็นproceedเพื่อข้ามการอนุมัติ
- Hook476f12de04e178e7ปลดโดยผู้ใช้และreconcileแล้ว; sandbox/streamfdและwrongAdminURLcheckบันทึกใน[recovery record](../release/issue63-dcf498e-20261110T075718Z/read-recovery.json) แยกผลผิดพลาดเดิมจากผลตรวจที่แก้ไข ไม่มีProductionwrite

## ผล Gate B และ Production deployment

- ผู้ใช้อนุมัติ Gate B ปัจจุบัน; actionplanผ่านvalidator ก่อนpromote1ไฟล์แบบatomic จากexactstage แล้วตรวจhash/metadata/backup/controlตรงทั้งหมด
- RestartเฉพาะFootballครั้งเดียวที่`2026-11-10T08:06:44.797072Z` (15:06:44เวลาไทย);marker_ns`1794298004797071733`;schema/index/idleและproductionguardผ่านก่อนrestart;ไม่มีmigration/bootstrap
- ผลfinalruntime19controls/15preservedmodules,QR/teamLayout,checkoutและbackupผ่าน;newProductionNode22workers2ตัว;V6readyevents3รายการ;0trackedstartup-errorlinesใน474postoffsetbytes
- HTTPครั้งแรกtimeout;ไม่มีrestartซ้ำ ผลเก่าที่ถูกcopyผิดถูกระบุinvalidและเก็บแยก;[HTTPผลใหม่](../release/issue63-dcf498e-20261110T075718Z/http-after-v2.json) ผ่านพร้อมtimestampหลังrestart ส่วนสาเหตุtimeoutยังไม่ยืนยัน ดู[บทเรียน](incident-2026-11-10-post-restart-http-evidence.md)
- DBREADONLYpostcheck15:08:19+07ผ่านschema/indexes;0activejobs/0runningcache;countsบันทึกตามเวลา ไม่อ้างว่าความต่างเกิดจากdeploy
- [ผลรวม](../release/issue63-dcf498e-20261110T075718Z/result.json):deployed,partially_verified;agentยังไม่ยืนยันauthenticatedUI/scan รอuserProductionacceptance;backupเก็บไว้ rollbackไม่ได้ใช้;ยังไม่ปิดissue63

## ผู้ใช้ตรวจรับและปิด issue

ผู้ใช้ยืนยัน “เทสที่ production ผ่าน ปิด issue ได้”;freshGitHubGETยืนยันissue63closed/completedที่2026-11-10T08:12:01Z ดู[acceptance record](../release/issue63-dcf498e-20261110T075718Z/production-acceptance.json) เก็บผลdeploymentเดิมและagentUI/scanlimitationsตามจริง ไม่มีProductionwrite/restartเพิ่มในรอบปิดงาน
