import { Router, Request, Response } from 'express';
import { renderLayout } from '../../layout';
import { getBaseUrl, parseCookies } from '../../utils/helpers';
import { getDbRegisteredTeams, passwordResetTokensStore } from '../../app';
import { AdminUser, getAdminUserByUsername } from '../../adminAuth';
import { renderAdminLayout } from '../../adminLayout';

export const teamAuthRouter = Router();

// Page 3: /team/register.php
teamAuthRouter.get('/team/register.php', (req: Request, res: Response) => renderTeamRegistrationPage(req, res));

teamAuthRouter.get('/team/register-demo.php', async (req: Request, res: Response) => {
  const cookies = parseCookies(req);
  const adminUser = cookies.admin_session === 'true' && cookies.admin_user
    ? await getAdminUserByUsername(cookies.admin_user)
    : null;
  if (adminUser?.roleCode !== 'SUPER_ADMIN') return res.redirect(`${getBaseUrl(req)}/admin/index.php?error=unauthorized`);
  return renderTeamRegistrationPage(req, res, true, adminUser);
});

async function renderTeamRegistrationPage(req: Request, res: Response, isDemo = false, currentUser?: AdminUser) {
  const base = getBaseUrl(req);

  const content = `
  <div class="row justify-content-center">
    <div class="col-xl-10">
      <div class="card shadow-sm border-0 rounded-3">
        <div class="card-header bg-navy text-white p-3 fw-bold fs-5"><i class="bi bi-pencil-square me-2 text-warning"></i> ลงทะเบียนทีมเข้าร่วมการแข่งขัน${isDemo ? ' <span class="badge bg-warning text-dark">DEMO</span>' : ''}</div>
        <div class="card-body p-4">
          ${isDemo ? '<div class="alert alert-info mb-3 border-0 shadow-sm"><i class="bi bi-info-circle-fill me-2"></i>ข้อมูลจากแบบฟอร์มนี้เป็นข้อมูล Demo และไม่รวมในรายงานข้อมูลจริง</div>' : ''}
          <p class="text-muted small mb-3">รายการ: <strong>Prime Minister's Youth CUP Football ประจำปี 2569</strong></p>
          <div class="mb-4">
            <a class="btn btn-outline-primary btn-sm fw-semibold" href="${base}/rules.php">
              <i class="bi bi-journal-text me-1"></i> ระเบียบการแข่งขัน
            </a>
          </div>
          
          <form action="${base}/api/team/register${isDemo ? '-demo' : ''}" method="post" enctype="multipart/form-data" novalidate id="team_register_form">
            
            <script>
              document.addEventListener('DOMContentLoaded', function() {
                var regForm = document.getElementById('team_register_form');
                if (regForm) {
                  regForm.addEventListener('submit', function(e) {
                    e.preventDefault();

                    var mobileInput = regForm.querySelector('input[name="mobile"]');
                    if (!mobileInput || !/^0[0-9]{9}$/.test(mobileInput.value.trim())) {
                      Swal.fire({icon: 'warning', title: 'กรุณาระบุหมายเลขโทรศัพท์มือถือ 10 หลัก เริ่มต้นด้วย 0'});
                      if (mobileInput) mobileInput.focus();
                      return;
                    }

                    // 4. AJAX Submission
                    Swal.fire({
                      title: 'กำลังส่งข้อมูลลงทะเบียน...',
                      text: 'กรุณารอครู่ ระบบกำลังอัปโหลดเอกสารและสร้างบัญชีทีม',
                      allowOutsideClick: false,
                      didOpen: function() {
                        Swal.showLoading();
                      }
                    });

                    var formData = new FormData(regForm);
                    fetch(regForm.action || '${base}/api/team/register', {
                      method: 'POST',
                      headers: {
                        'X-Requested-With': 'XMLHttpRequest',
                        'Accept': 'application/json'
                      },
                      body: formData
                    })
                    .then(function(res) { return res.json(); })
                    .then(function(data) {
                      if (data.success) {
                        Swal.fire({
                          icon: 'success',
                          title: 'ลงทะเบียนสำเร็จ!',
                          text: data.message || 'ลงทะเบียนทีมเข้าร่วมการแข่งขันเรียบร้อยแล้ว',
                          confirmButtonText: '${isDemo ? 'กลับหน้าระบบสมัครทีม Demo' : 'เข้าสู่ระบบจัดการทีม'}',
                          confirmButtonColor: '#0b2a5b',
                          customClass: { popup: 'rounded-4 shadow-lg' }
                        }).then(function() {
                          window.location.href = data.redirectUrl || '${base}/team/index.php';
                        });
                      } else {
                        Swal.fire({
                          icon: 'error',
                          title: 'ลงทะเบียนไม่สำเร็จ',
                          text: data.error || 'เกิดข้อผิดพลาดในการลงทะเบียน กรุณาตรวจสอบข้อมูลและลองใหม่อีกครั้ง',
                          confirmButtonText: 'ตกลง',
                          confirmButtonColor: '#0b2a5b',
                          customClass: { popup: 'rounded-4 shadow-lg' }
                        });
                      }
                    })
                    .catch(function(err) {
                      console.error('Registration error:', err);
                      Swal.fire({
                        icon: 'error',
                        title: 'เกิดข้อผิดพลาดในการเชื่อมต่อ',
                        text: 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้ กรุณาลองใหม่อีกครั้ง',
                        confirmButtonText: 'ตกลง',
                        confirmButtonColor: '#0b2a5b'
                      });
                    });
                  });
                }
              });
            </script>

            <p class="text-danger fw-semibold mb-3">กรุณากรอกข้อมูลให้ครบถ้วน โดยใช้อีเมลเป็นชื่อผู้ใช้ และหมายเลขโทรศัพท์มือถือเป็นรหัสผ่านเริ่มต้นสำหรับเข้าสู่ระบบ</p>
            <div class="row g-3 mb-4">
              <div class="col-12 col-md-6">
                <label class="form-label required">สโมสร / โรงเรียน / อะคาเดมี่ / สังกัด</label>
                <input name="school" value="" class="form-control" required placeholder="ระบุชื่อสโมสร โรงเรียน อะคาเดมี่ หรือสังกัด">
              </div>
              <div class="col-12 col-md-6">
                <label class="form-label">รหัสสถานศึกษา</label>
                <input name="school_code" value="" class="form-control" inputmode="numeric" placeholder="เช่น 1050012345">
                <div class="form-text">สถานศึกษาเดียวกันใช้รหัสนี้ซ้ำกันได้ โดยสมัครได้ 1 ทีมชาย และ 1 ทีมหญิง (ข้อ 4.1)</div>
              </div>
              <div class="col-12 col-md-6">
                <label class="form-label required">จังหวัด</label>
                <select name="province" class="form-select" required>
                  <option value="">— เลือกจังหวัด —</option>
                  <option value="กระบี่">กระบี่</option>
                  <option value="กรุงเทพมหานคร">กรุงเทพมหานคร</option>
                  <option value="กาญจนบุรี">กาญจนบุรี</option>
                  <option value="กาฬสินธุ์">กาฬสินธุ์</option>
                  <option value="กำแพงเพชร">กำแพงเพชร</option>
                  <option value="ขอนแก่น">ขอนแก่น</option>
                  <option value="จันทบุรี">จันทบุรี</option>
                  <option value="ฉะเชิงเทรา">ฉะเชิงเทรา</option>
                  <option value="ชลบุรี">ชลบุรี</option>
                  <option value="ชัยนาท">ชัยนาท</option>
                  <option value="ชัยภูมิ">ชัยภูมิ</option>
                  <option value="ชุมพร">ชุมพร</option>
                  <option value="ตรัง">ตรัง</option>
                  <option value="ตราด">ตราด</option>
                  <option value="ตาก">ตาก</option>
                  <option value="นครนายก">นครนายก</option>
                  <option value="นครปฐม">นครปฐม</option>
                  <option value="นครพนม">นครพนม</option>
                  <option value="นครราชสีมา">นครราชสีมา</option>
                  <option value="นครศรีธรรมราช">นครศรีธรรมราช</option>
                  <option value="นครสวรรค์">นครสวรรค์</option>
                  <option value="นนทบุรี">นนทบุรี</option>
                  <option value="นราธิวาส">นราธิวาส</option>
                  <option value="น่าน">น่าน</option>
                  <option value="บึงกาฬ">บึงกาฬ</option>
                  <option value="บุรีรัมย์">บุรีรัมย์</option>
                  <option value="ปทุมธานี">ปทุมธานี</option>
                  <option value="ประจวบคีรีขันธ์">ประจวบคีรีขันธ์</option>
                  <option value="ปราจีนบุรี">ปราจีนบุรี</option>
                  <option value="ปัตตานี">ปัตตานี</option>
                  <option value="พระนครศรีอยุธยา">พระนครศรีอยุธยา</option>
                  <option value="พะเยา">พะเยา</option>
                  <option value="พังงา">พังงา</option>
                  <option value="พัทลุง">พัทลุง</option>
                  <option value="พิจิตร">พิจิตร</option>
                  <option value="พิษณุโลก">พิษณุโลก</option>
                  <option value="ภูเก็ต">ภูเก็ต</option>
                  <option value="มหาสารคาม">มหาสารคาม</option>
                  <option value="มุกดาหาร">มุกดาหาร</option>
                  <option value="ยะลา">ยะลา</option>
                  <option value="ยโสธร">ยโสธร</option>
                  <option value="ระนอง">ระนอง</option>
                  <option value="ระยอง">ระยอง</option>
                  <option value="ราชบุรี">ราชบุรี</option>
                  <option value="ร้อยเอ็ด">ร้อยเอ็ด</option>
                  <option value="ลพบุรี">ลพบุรี</option>
                  <option value="ลำปาง">ลำปาง</option>
                  <option value="ลำพูน">ลำพูน</option>
                  <option value="ศรีสะเกษ">ศรีสะเกษ</option>
                  <option value="สกลนคร">สกลนคร</option>
                  <option value="สงขลา">สงขลา</option>
                  <option value="สตูล">สตูล</option>
                  <option value="สมุทรปราการ">สมุทรปราการ</option>
                  <option value="สมุทรสงคราม">สมุทรสงคราม</option>
                  <option value="สมุทรสาคร">สมุทรสาคร</option>
                  <option value="สระบุรี">สระบุรี</option>
                  <option value="สระแก้ว">สระแก้ว</option>
                  <option value="สิงห์บุรี">สิงห์บุรี</option>
                  <option value="สุพรรณบุรี">สุพรรณบุรี</option>
                  <option value="สุราษฎร์ธานี">สุราษฎร์ธานี</option>
                  <option value="สุรินทร์">สุรินทร์</option>
                  <option value="สุโขทัย">สุโขทัย</option>
                  <option value="หนองคาย">หนองคาย</option>
                  <option value="หนองบัวลำภู">หนองบัวลำภู</option>
                  <option value="อำนาจเจริญ">อำนาจเจริญ</option>
                  <option value="อุดรธานี">อุดรธานี</option>
                  <option value="อุตรดิตถ์">อุตรดิตถ์</option>
                  <option value="อุทัยธานี">อุทัยธานี</option>
                  <option value="อุบลราชธานี">อุบลราชธานี</option>
                  <option value="อ่างทอง">อ่างทอง</option>
                  <option value="เชียงราย">เชียงราย</option>
                  <option value="เชียงใหม่">เชียงใหม่</option>
                  <option value="เพชรบุรี">เพชรบุรี</option>
                  <option value="เพชรบูรณ์">เพชรบูรณ์</option>
                  <option value="เลย">เลย</option>
                  <option value="แพร่">แพร่</option>
                  <option value="แม่ฮ่องสอน">แม่ฮ่องสอน</option>
                </select>
              </div>
              <div class="col-12 col-md-6">
                <label class="form-label required">อำเภอ/เขต</label>
                <select name="district" class="form-select" data-district-select data-province-field="province" required>
                  <option value="">— เลือกอำเภอ/เขต —</option>
                </select>
              </div>
              <div class="col-12" id="bkkZoneContainer" style="display: none;">
                <label class="form-label required">โซนพื้นที่ (กรุงเทพมหานคร)</label>
                <select name="bkk_zone" class="form-select" data-bkk-zone-select>
                  <option value="">— เลือกโซนพื้นที่ —</option>
                  <option value="ฝั่งธนบุรี">ฝั่งธนบุรี (15 เขต)</option>
                  <option value="พระนคร 1">พระนคร 1 (กรุงเทพกลาง & กรุงเทพเหนือ - 16 เขต)</option>
                  <option value="พระนคร 2">พระนคร 2 (กรุงเทพใต้ & กรุงเทพตะวันออก - 19 เขต)</option>
                </select>
              </div>
            </div>

            <h2 class="h6 text-primary">ผู้ประสานงาน</h2>
            <div class="row g-3 mb-4">
              <div class="col-12">
                <label class="form-label required">ชื่อ-นามสกุล</label>
                <input name="name" value="" class="form-control" required placeholder="ระบุชื่อ-นามสกุล ผู้ประสานงาน">
              </div>
              <div class="col-12">
                <label class="form-label required">อีเมล์ (ชื่อผู้ใช้)</label>
                <input type="email" name="email" value="" class="form-control" required inputmode="email" placeholder="example@email.com">
              </div>
              <div class="col-12 col-md-6">
                <label class="form-label required text-danger fw-bold">หมายเลขโทรศัพท์มือถือ (ใช้เป็นรหัสผ่านสำหรับเข้าสู่ระบบ)</label>
                <input name="mobile" value="" class="form-control" required inputmode="tel" pattern="0[0-9]{9}" maxlength="10" placeholder="เช่น 0812345678">
              </div>
              <div class="col-md-6">
                <label class="form-label">โทรศัพท์บ้าน/สำนักงาน</label>
                <input name="phone" value="" class="form-control" inputmode="tel" placeholder="เบอร์โทรศัพท์บ้าน/สำนักงาน (ถ้ามี)">
              </div>
              <div class="col-12">
                <label class="form-label required">LINE ID</label>
                <input name="line_id" value="" class="form-control" required placeholder="LINE ID สำหรับติดต่อ">
              </div>
            </div>

            <h2 class="h6 text-primary">ที่อยู่สำหรับติดต่อ</h2>
            <div class="row g-3 mb-4">
              <div class="col-md-6"><label class="form-label">เลขที่/ห้อง</label><input name="house_no" value="" class="form-control"></div>
              <div class="col-md-6"><label class="form-label">หมู่บ้าน/อาคาร</label><input name="village" value="" class="form-control"></div>
              <div class="col-md-6"><label class="form-label">หมู่ที่</label><input name="moo" value="" class="form-control"></div>
              <div class="col-md-6"><label class="form-label">ซอย/ตรอก</label><input name="soi" value="" class="form-control"></div>
              <div class="col-md-6"><label class="form-label">ถนน</label><input name="road" value="" class="form-control"></div>
              <div class="col-md-6">
                <label class="form-label">จังหวัด</label>
                <select name="contact_province" class="form-select">
                  <option value="">— เลือกจังหวัด —</option>
                  <option value="กระบี่">กระบี่</option>
                  <option value="กรุงเทพมหานคร">กรุงเทพมหานคร</option>
                  <option value="กาญจนบุรี">กาญจนบุรี</option>
                  <option value="กาฬสินธุ์">กาฬสินธุ์</option>
                  <option value="กำแพงเพชร">กำแพงเพชร</option>
                  <option value="ขอนแก่น">ขอนแก่น</option>
                  <option value="จันทบุรี">จันทบุรี</option>
                  <option value="ฉะเชิงเทรา">ฉะเชิงเทรา</option>
                  <option value="ชลบุรี">ชลบุรี</option>
                  <option value="ชัยนาท">ชัยนาท</option>
                  <option value="ชัยภูมิ">ชัยภูมิ</option>
                  <option value="ชุมพร">ชุมพร</option>
                  <option value="ตรัง">ตรัง</option>
                  <option value="ตราด">ตราด</option>
                  <option value="ตาก">ตาก</option>
                  <option value="นครนายก">นครนายก</option>
                  <option value="นครปฐม">นครปฐม</option>
                  <option value="นครพนม">นครพนม</option>
                  <option value="นครราชสีมา">นครราชสีมา</option>
                  <option value="นครศรีธรรมราช">นครศรีธรรมราช</option>
                  <option value="นครสวรรค์">นครสวรรค์</option>
                  <option value="นนทบุรี">นนทบุรี</option>
                  <option value="นราธิวาส">นราธิวาส</option>
                  <option value="น่าน">น่าน</option>
                  <option value="บึงกาฬ">บึงกาฬ</option>
                  <option value="บุรีรัมย์">บุรีรัมย์</option>
                  <option value="ปทุมธานี">ปทุมธานี</option>
                  <option value="ประจวบคีรีขันธ์">ประจวบคีรีขันธ์</option>
                  <option value="ปราจีนบุรี">ปราจีนบุรี</option>
                  <option value="ปัตตานี">ปัตตานี</option>
                  <option value="พระนครศรีอยุธยา">พระนครศรีอยุธยา</option>
                  <option value="พะเยา">พะเยา</option>
                  <option value="พังงา">พังงา</option>
                  <option value="พัทลุง">พัทลุง</option>
                  <option value="พิจิตร">พิจิตร</option>
                  <option value="พิษณุโลก">พิษณุโลก</option>
                  <option value="ภูเก็ต">ภูเก็ต</option>
                  <option value="มหาสารคาม">มหาสารคาม</option>
                  <option value="มุกดาหาร">มุกดาหาร</option>
                  <option value="ยะลา">ยะลา</option>
                  <option value="ยโสธร">ยโสธร</option>
                  <option value="ระนอง">ระนอง</option>
                  <option value="ระยอง">ระยอง</option>
                  <option value="ราชบุรี">ราชบุรี</option>
                  <option value="ร้อยเอ็ด">ร้อยเอ็ด</option>
                  <option value="ลพบุรี">ลพบุรี</option>
                  <option value="ลำปาง">ลำปาง</option>
                  <option value="ลำพูน">ลำพูน</option>
                  <option value="ศรีสะเกษ">ศรีสะเกษ</option>
                  <option value="สกลนคร">สกลนคร</option>
                  <option value="สงขลา">สงขลา</option>
                  <option value="สตูล">สตูล</option>
                  <option value="สมุทรปราการ">สมุทรปราการ</option>
                  <option value="สมุทรสงคราม">สมุทรสงคราม</option>
                  <option value="สมุทรสาคร">สมุทรสาคร</option>
                  <option value="สระบุรี">สระบุรี</option>
                  <option value="สระแก้ว">สระแก้ว</option>
                  <option value="สิงห์บุรี">สิงห์บุรี</option>
                  <option value="สุพรรณบุรี">สุพรรณบุรี</option>
                  <option value="สุราษฎร์ธานี">สุราษฎร์ธานี</option>
                  <option value="สุรินทร์">สุรินทร์</option>
                  <option value="สุโขทัย">สุโขทัย</option>
                  <option value="หนองคาย">หนองคาย</option>
                  <option value="หนองบัวลำภู">หนองบัวลำภู</option>
                  <option value="อำนาจเจริญ">อำนาจเจริญ</option>
                  <option value="อุดรธานี">อุดรธานี</option>
                  <option value="อุตรดิตถ์">อุตรดิตถ์</option>
                  <option value="อุทัยธานี">อุทัยธานี</option>
                  <option value="อุบลราชธานี">อุบลราชธานี</option>
                  <option value="อ่างทอง">อ่างทอง</option>
                  <option value="เชียงราย">เชียงราย</option>
                  <option value="เชียงใหม่">เชียงใหม่</option>
                  <option value="เพชรบุรี">เพชรบุรี</option>
                  <option value="เพชรบูรณ์">เพชรบูรณ์</option>
                  <option value="เลย">เลย</option>
                  <option value="แพร่">แพร่</option>
                  <option value="แม่ฮ่องสอน">แม่ฮ่องสอน</option>
                </select>
              </div>
              <div class="col-md-6">
                <label class="form-label">เขต/อำเภอ</label>
                <select name="contact_district" class="form-select" data-district-select data-province-field="contact_province">
                  <option value="">— เลือกเขต/อำเภอ —</option>
                </select>
              </div>
              <div class="col-md-6">
                <label class="form-label">แขวง/ตำบล</label>
                <select name="subdistrict" class="form-select" data-subdistrict-select data-district-field="contact_district">
                  <option value="">— เลือกตำบล/แขวง —</option>
                </select>
              </div>
              <div class="col-md-6"><label class="form-label">รหัสไปรษณีย์</label><input name="postal_code" value="" class="form-control" inputmode="numeric" maxlength="5"></div>
            </div>

            <!-- เอกสารประจำทีม (Team Documents Upload Section) -->
            <h2 class="h6 text-primary fw-bold mb-3"><i class="bi bi-file-earmark-check-fill me-1"></i> เอกสารยื่นประกอบการลงทะเบียนทีม (JPG, PNG หรือ PDF ไม่เกิน 4 MB)</h2>
            <div class="row g-3 mb-4">
              <div class="col-12">
                <div class="d-flex justify-content-between align-items-center mb-1">
                  <label class="form-label fw-semibold text-dark mb-0">หนังสือรับรองทีม <span class="badge bg-secondary ms-1">OPTIONAL</span></label>
                  <a href="https://docs.google.com/document/d/18_1gkpsljBl2__aYNtGMQ4fXv_QdPG7COYojv2pNdTo/edit?tab=t.0" target="_blank" rel="noopener noreferrer" class="btn btn-sm btn-outline-primary py-1 px-2 fs-7 fw-semibold text-center leading-sm">
                    <i class="bi bi-file-earmark-word me-1"></i>ดาวน์โหลดแบบฟอร์ม<br>หนังสือรับรองการเป็นตัวแทนสถานศึกษา
                  </a>
                </div>
                <input type="file" name="doc_team_cert" class="form-control" accept=".jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf">
              </div>
            </div>

            <div class="d-flex flex-column flex-sm-row gap-2 align-items-stretch align-items-sm-center">
              <button type="submit" class="btn btn-primary btn-lg"><i class="bi bi-check2-circle"></i> ลงทะเบียน</button>
              <a class="btn btn-link" href="${base}/team/login.php">มีบัญชีแล้ว? เข้าสู่ระบบ</a>
            </div>
          </form>
        </div>
      </div>
    </div>
  </div>`;
  const demoTeams = isDemo ? (await getDbRegisteredTeams(true)).filter(team => team.isTest || team.is_test) : [];
  const demoTeamList = isDemo ? `
  <div class="card shadow-sm border-0 rounded-3 mt-4">
    <div class="card-header bg-light p-3 fw-bold"><i class="bi bi-people-fill me-2 text-primary"></i>ทีมที่สมัครในระบบ Demo (${demoTeams.length})</div>
    <div class="card-body p-0">
      ${demoTeams.length ? `
      <div class="table-responsive">
        <table class="table table-hover align-middle mb-0">
          <thead class="table-light"><tr><th>ทีม</th><th>จังหวัด</th><th>รุ่น</th><th>ผู้จัดการทีม</th><th>สถานะ</th><th>วันที่สมัคร</th></tr></thead>
          <tbody>${demoTeams
            .sort((a, b) => new Date(b.createdAt || b.created_at || 0).getTime() - new Date(a.createdAt || a.created_at || 0).getTime())
            .map(team => {
              const status = team.status === 'APPROVED' ? 'อนุมัติ' : team.status === 'REJECTED' ? 'ไม่อนุมัติ' : 'รอตรวจสอบ';
              const createdAt = team.createdAt || team.created_at;
              const dateLabel = createdAt && !Number.isNaN(new Date(createdAt).getTime()) ? new Date(createdAt).toLocaleString('th-TH') : '-';
              return `<tr>
                <td><strong>${escapeRegistrationHtml(team.teamName || team.team_name || team.name || '-')}</strong><div class="small text-muted">${escapeRegistrationHtml(team.id || '-')}</div></td>
                <td>${escapeRegistrationHtml(team.province || '-')}</td>
                <td>${escapeRegistrationHtml(Array.isArray(team.categories) ? team.categories.join(', ') : team.categories || '-')}</td>
                <td>${escapeRegistrationHtml(team.managerName || team.manager_name || '-')}</td>
                <td><span class="badge ${team.status === 'APPROVED' ? 'bg-success' : team.status === 'REJECTED' ? 'bg-danger' : 'bg-secondary'}">${status}</span></td>
                <td class="text-nowrap small">${escapeRegistrationHtml(dateLabel)}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>` : '<div class="text-center text-muted py-4"><i class="bi bi-inbox fs-3 d-block mb-2"></i>ยังไม่มีทีมสมัครในระบบ Demo</div>'}
    </div>
  </div>` : '';
  const title = `${isDemo ? '[DEMO] ' : ''}ลงทะเบียนทีม`;
  res.send(isDemo
    ? renderAdminLayout(title, `${content}${demoTeamList}`, 'team-register-demo', base, currentUser)
    : renderLayout(title, content, 'register', base));
}

function escapeRegistrationHtml(value: unknown): string {
  const escapedCharacters: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  };
  return String(value ?? '').replace(/[&<>"']/g, character => escapedCharacters[character] || character);
}

// Page 4: /team/login.php
teamAuthRouter.get('/team/login.php', (req: Request, res: Response) => {
  const base = getBaseUrl(req);
  const isExpired = req.query.expired === '1';
  const expiredAlertHtml = isExpired ? `
    <div class="alert alert-warning alert-dismissible fade show d-flex align-items-center mb-3 shadow-sm rounded-3" role="alert">
      <i class="bi bi-clock-history fs-4 me-2"></i>
      <div><strong>Session หมดอายุ:</strong> ไม่มีการใช้งานเกิน 30 นาที กรุณาเข้าสู่ระบบใหม่อีกครั้ง</div>
      <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
    </div>
  ` : '';

  const content = `
  <div class="row justify-content-center">
    <div class="col-sm-10 col-md-7 col-lg-5 col-xl-4">
      ${expiredAlertHtml}
      <div class="card shadow-sm">
        <div class="card-header bg-navy text-white text-center fw-bold py-3">
          <i class="bi bi-shield-lock me-1"></i> เข้าสู่ระบบจัดการทีม
        </div>
        <div class="card-body p-4">
          <form action="${base}/api/team/login" method="POST" autocomplete="on">
            <div class="mb-3">
              <label class="form-label fw-semibold">อีเมล์ (ชื่อผู้ใช้) / Username</label>
              <input name="username" id="login_username" class="form-control" placeholder="เช่น example@email.com หรือ username" required autofocus autocomplete="username">
            </div>
            <div class="mb-3">
              <div class="d-flex justify-content-between align-items-center mb-1">
                <label class="form-label fw-semibold mb-0">รหัสผ่าน (Password)</label>
              </div>
              <div class="input-group">
                <input type="password" name="password" id="login_password" class="form-control" placeholder="••••••••" required autocomplete="current-password">
                <button class="btn btn-outline-secondary" type="button" onclick="togglePasswordVisibility('login_password', this)">
                  <i class="bi bi-eye"></i>
                </button>
              </div>
            </div>
            <button type="submit" class="btn btn-primary w-100 fw-bold py-2">
              <i class="bi bi-box-arrow-in-right me-1"></i> เข้าสู่ระบบ
            </button>
          </form>
          <hr class="my-4">
          <div class="text-center small">
            ยังไม่มีบัญชี? <a href="${base}/team/register.php" class="fw-semibold text-decoration-none">ลงทะเบียนทีมใหม่</a>
          </div>
        </div>
      </div>
    </div>
  </div>

  <script>
    function handleForgotPassword(basePath) {
      const currentUsername = document.getElementById('login_username') ? document.getElementById('login_username').value.trim() : '';
      Swal.fire({
        title: 'ลืมรหัสผ่าน?',
        text: 'กรุณากรอกชื่อผู้ใช้ (Username) หรือ อีเมล ที่ลงทะเบียนไว้เพื่อขอรับลิงก์รีเซตรหัสผ่าน',
        input: 'text',
        inputValue: currentUsername,
        inputPlaceholder: 'กรอก Username หรือ อีเมล',
        showCancelButton: true,
        confirmButtonText: 'ส่งลิงก์รีเซตรหัสผ่าน',
        cancelButtonText: 'ยกเลิก',
        confirmButtonColor: '#0b2a5b',
        inputValidator: (value) => {
          if (!value || !value.trim()) {
            return 'กรุณากรอก Username หรือ อีเมล';
          }
        }
      }).then((result) => {
        if (result.isConfirmed) {
          const accountInput = result.value.trim();
          Swal.fire({
            title: 'กำลังดำเนินการ...',
            allowOutsideClick: false,
            didOpen: () => { Swal.showLoading(); }
          });
          
          fetch(basePath + '/api/team/forgot-password', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Requested-With': 'XMLHttpRequest'
            },
            body: JSON.stringify({ account: accountInput, email: accountInput, username: accountInput })
          })
          .then(res => res.json())
          .then(data => {
            if (data.success) {
              const hasPreview = !!data.previewUrl;
              Swal.fire({
                icon: 'success',
                title: 'ส่งขั้นตอนเรียบร้อยแล้ว',
                html: '<p class="mb-3">ระบบจะส่งขั้นตอนการรีเซตรหัสผ่านไปให้ทางอีเมล์ กรุณาเข้าตรวจสอบที่อีเมล์ของท่าน และทำตามขั้นตอน</p>' +
                      (hasPreview ? '<div class="alert alert-info py-2 px-3 small text-start shadow-sm mt-3 mb-0">' +
                      '<strong><i class="bi bi-envelope-fill me-1"></i> Developer Test Inbox:</strong><br>' +
                      'สามารถเปิดดูอีเมลจำลองและกดลิงก์ตั้งรหัสผ่านได้ทันทีที่:<br>' +
                      '<a href="' + data.previewUrl + '" target="_blank" class="fw-bold text-navy text-break">' + data.previewUrl + '</a>' +
                      '</div>' : ''),
                confirmButtonText: 'ตกลง',
                showDenyButton: hasPreview,
                denyButtonText: '<i class="bi bi-envelope-open-fill me-1"></i> เปิดดูอีเมลจำลอง (Ethereal)',
                denyButtonColor: '#0d6efd',
                confirmButtonColor: '#0b2a5b'
              }).then((swalRes) => {
                if (swalRes.isDenied && data.previewUrl) {
                  window.open(data.previewUrl, '_blank');
                }
              });
            } else {
              Swal.fire({
                icon: 'error',
                title: 'ไม่พบข้อมูลบัญชี',
                text: data.error || 'ไม่พบอีเมลหรือชื่อผู้ใช้นี้ในระบบ',
                confirmButtonColor: '#0b2a5b'
              });
            }
          })
          .catch(err => {
            Swal.fire({
              icon: 'error',
              title: 'เกิดข้อผิดพลาด',
              text: 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้ กรุณาลองใหม่อีกครั้ง',
              confirmButtonColor: '#0b2a5b'
            });
          });
        }
      });
    }
  </script>`;
  res.send(renderLayout('เข้าสู่ระบบจัดการทีม', content, 'team', base));
});

// Page 4.1: /team/reset-password.php
teamAuthRouter.get('/team/reset-password.php', async (req: Request, res: Response) => {
  const base = getBaseUrl(req);
  const token = (req.query.token as string || '').trim();

  if (!token) {
    const errorContent = `
    <div class="row justify-content-center">
      <div class="col-md-6">
        <div class="alert alert-danger text-center shadow-sm p-4 rounded-3">
          <i class="bi bi-exclamation-triangle-fill fs-1 d-block mb-2 text-danger"></i>
          <h5 class="fw-bold">ลิงก์รีเซตรหัสผ่านไม่ถูกต้อง</h5>
          <p class="mb-3 text-muted">ไม่พบ รหัส Token สำหรับตั้งรหัสผ่านใหม่ กรุณาขอลิงก์รีเซตรหัสผ่านใหม่อีกครั้ง</p>
          <a href="${base}/team/login.php" class="btn btn-primary fw-semibold">กลับสู่หน้าเข้าสู่ระบบ</a>
        </div>
      </div>
    </div>`;
    return res.send(renderLayout('ลิงก์ไม่ถูกต้อง - รีเซตรหัสผ่าน', errorContent, 'team', base));
  }

  const content = `
  <div class="row justify-content-center">
    <div class="col-sm-10 col-md-7 col-lg-5 col-xl-4">
      <div class="card shadow-sm border-0 rounded-3">
        <div class="card-header bg-navy text-white text-center fw-bold py-3">
          <i class="bi bi-key-fill me-1"></i> ตั้งรหัสผ่านใหม่
        </div>
        <div class="card-body p-4">
          <form id="reset_password_form" action="${base}/api/team/reset-password" method="POST">
            <input type="hidden" name="token" value="${token}">
            
            <div class="mb-3">
              <label class="form-label fw-semibold required">รหัสผ่านใหม่ (อย่างน้อย 8 ตัว)</label>
              <div class="input-group">
                <input type="password" name="password" id="reset_new_password" class="form-control" placeholder="••••••••" required minlength="8" autofocus>
                <button class="btn btn-outline-secondary" type="button" onclick="togglePasswordVisibility('reset_new_password', this)">
                  <i class="bi bi-eye"></i>
                </button>
              </div>
            </div>

            <div class="mb-4">
              <label class="form-label fw-semibold required">ยืนยันรหัสผ่านใหม่</label>
              <div class="input-group">
                <input type="password" name="password_confirm" id="reset_confirm_password" class="form-control" placeholder="••••••••" required minlength="8">
                <button class="btn btn-outline-secondary" type="button" onclick="togglePasswordVisibility('reset_confirm_password', this)">
                  <i class="bi bi-eye"></i>
                </button>
              </div>
            </div>

            <button type="submit" class="btn btn-success w-100 fw-bold py-2 fs-6 shadow-sm">
              <i class="bi bi-check-circle-fill me-1"></i> ตั้งรหัสผ่าน
            </button>
          </form>
        </div>
      </div>
    </div>
  </div>

  <script>
    document.addEventListener('DOMContentLoaded', function() {
      const form = document.getElementById('reset_password_form');
      if (form) {
        form.addEventListener('submit', function(e) {
          e.preventDefault();
          const pass = document.getElementById('reset_new_password').value.trim();
          const confirmPass = document.getElementById('reset_confirm_password').value.trim();
          const tokenVal = form.querySelector('input[name="token"]').value;

          if (pass.length < 8) {
            Swal.fire({
              icon: 'error',
              title: 'รหัสผ่านสั้นเกินไป',
              text: 'กรุณากรอกรหัสผ่านอย่างน้อย 8 ตัวอักษร',
              confirmButtonColor: '#0b2a5b'
            });
            return;
          }

          if (pass !== confirmPass) {
            Swal.fire({
              icon: 'error',
              title: 'รหัสผ่านไม่ตรงกัน',
              text: 'กรุณาตรวจสอบการยืนยันรหัสผ่านให้อีกครั้ง',
              confirmButtonColor: '#0b2a5b'
            });
            return;
          }

          Swal.fire({
            title: 'กำลังบันทึกรหัสผ่านใหม่...',
            allowOutsideClick: false,
            didOpen: () => { Swal.showLoading(); }
          });

          fetch('${base}/api/team/reset-password', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Requested-With': 'XMLHttpRequest'
            },
            body: JSON.stringify({
              token: tokenVal,
              password: pass,
              password_confirm: confirmPass
            })
          })
          .then(res => res.json())
          .then(data => {
            if (data.success) {
              Swal.fire({
                icon: 'success',
                title: 'สำเร็จ',
                text: 'ท่านได้ทำการตั้งรหัสผ่านเรียบร้อยแล้ว',
                confirmButtonColor: '#0b2a5b'
              }).then(() => {
                window.location.href = '${base}/team/login.php';
              });
            } else {
              Swal.fire({
                icon: 'error',
                title: 'เกิดข้อผิดพลาด',
                text: data.error || 'ไม่สามารถตั้งรหัสผ่านได้ ลิงก์อาจหมดอายุแล้ว',
                confirmButtonColor: '#0b2a5b'
              });
            }
          })
          .catch(err => {
            Swal.fire({
              icon: 'error',
              title: 'เกิดข้อผิดพลาด',
              text: 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้',
              confirmButtonColor: '#0b2a5b'
            });
          });
        });
      }
    });
  </script>`;
  res.send(renderLayout('ตั้งรหัสผ่านใหม่', content, 'team', base));
});
