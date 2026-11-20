/* Issue #11 mixed-cache compatibility: initialize the shared pure resolver when old HTML lacks it. */
if (!window.PmycTeamArea) {
window.PmycTeamArea = (function(){const bangkokDistrictNames=["คลองสาน","คลองสามวา","คลองเตย","คันนายาว","จตุจักร","จอมทอง","ดอนเมือง","ดินแดง","ดุสิต","ตลิ่งชัน","ทุ่งครุ","ธนบุรี","บางกอกน้อย","บางกอกใหญ่","บางกะปิ","บางขุนเทียน","บางคอแหลม","บางซื่อ","บางนา","บางบอน","บางพลัด","บางรัก","บางเขน","บางแค","บึงกุ่ม","ปทุมวัน","ประเวศ","ป้อมปราบศัตรูพ่าย","พญาไท","พระนคร","พระโขนง","ภาษีเจริญ","มีนบุรี","ยานนาวา","ราชเทวี","ราษฎร์บูรณะ","ลาดกระบัง","ลาดพร้าว","วังทองหลาง","วัฒนา","สวนหลวง","สะพานสูง","สัมพันธวงศ์","สาทร","สายไหม","หนองจอก","หนองแขม","หลักสี่","ห้วยขวาง","ทวีวัฒนา"];function normalizeProvince(value) {
    const province = String(value ?? '').trim();
    return ['กรุงเทพฯ', 'กรุงเทพมหานคร (กกท. ประจำจังหวัด)'].includes(province) ? 'กรุงเทพมหานคร' : province;
};function normalizeDistrictName(value, province) {
    const district = String(value ?? '').trim();
    return normalizeProvince(province) === 'กรุงเทพมหานคร' ? district.replace(/^เขต\s*/, '').trim() : district;
};function isValidDistrict(value, province) {
    const district = normalizeDistrictName(value, province);
    return Boolean(district) && (normalizeProvince(province) !== 'กรุงเทพมหานคร' || bangkokDistrictNames.includes(district));
};function getRegistrationArea(team) {
    const province = normalizeProvince(String(team.province ?? '').trim() || team.contact_province);
    let rawDistrict = String(team.district ?? '').trim();
    // Legacy contact fallback is allowed only when its province is explicitly the same.
    if (!rawDistrict && normalizeProvince(team.contact_province) === province)
        rawDistrict = String(team.contact_district ?? '').trim();
    return { province, district: isValidDistrict(rawDistrict, province) ? normalizeDistrictName(rawDistrict, province) : '' };
};function getTeamDistrictName(team) {
    const area = getRegistrationArea(team);
    return normalizeDistrictName(String(team.district ?? '').trim() || area.district, area.province);
};return {normalizeProvince,normalizeDistrictName,isValidDistrict,getRegistrationArea,getTeamDistrictName};})();
}
// Client-side script for AJAX Form Handling & SweetAlert2 Integration
document.addEventListener('DOMContentLoaded', function () {
  // District Map Data per Province
  const districtMap = window.thaiAdministrativeDivisions.districts;

  const bkkZoneMap = {
    "ฝั่งธนบุรี": ["เขตธนบุรี","เขตคลองสาน","เขตจอมทอง","เขตบางกอกใหญ่","เขตบางกอกน้อย","เขตบางพลัด","เขตภาษีเจริญ","เขตตลิ่งชัน","เขตบางขุนเทียน","เขตบางบอน","เขตทุ่งครุ","เขตราษฎร์บูรณะ","เขตหนองแขม","เขตบางแค","เขตทวีวัฒนา"],
    "พระนคร 1": ["เขตพระนคร","เขตดุสิต","เขตป้อมปราบศัตรูพ่าย","เขตสัมพันธวงศ์","เขตดินแดง","เขตห้วยขวาง","เขตพญาไท","เขตราชเทวี","เขตวังทองหลาง","เขตจตุจักร","เขตบางซื่อ","เขตลาดพร้าว","เขตหลักสี่","เขตดอนเมือง","เขตบางเขน","เขตสายไหม"],
    "พระนคร 2": ["เขตปทุมวัน","เขตบางรัก","เขตสาทร","เขตบางคอแหลม","เขตยานนาวา","เขตคลองเตย","เขตวัฒนา","เขตพระโขนง","เขตสวนหลวง","เขตบางนา","เขตมีนบุรี","เขตหนองจอก","เขตลาดกระบัง","เขตบึงกุ่ม","เขตคันนายาว","เขตสะพานสูง","เขตคลองสามวา","เขตประเวศ","เขตบางกะปิ"]
  };

  const districtToZoneMap = {};
  Object.keys(bkkZoneMap).forEach(function (zone) {
    bkkZoneMap[zone].forEach(function (dist) {
      districtToZoneMap[dist] = zone;
      const cleanDist = dist.replace(/^เขต/, '').trim();
      districtToZoneMap[cleanDist] = zone;
    });
  });

  // Subdistrict Map Data per District
  const subdistrictMap = window.thaiAdministrativeDivisions.subdistricts;

  function getSubdistricts(distName, provinceName) {
    if (!distName || !provinceName) return [];
    const trimmed = distName.trim();
    const cleanDist = trimmed.replace(/^(อำเภอ|เขต)/, '').trim();
    const provinceSubdistricts = subdistrictMap[provinceName];
    return provinceSubdistricts[trimmed] || provinceSubdistricts[cleanDist] || [];
  }

  // Automatic District, Subdistrict & BKK Zone Select Event Listener & Immediate Cascade
  const provinceSelects = document.querySelectorAll('select[name="province"], select[name="contact_province"]');
  provinceSelects.forEach(function (provinceSelect) {
    const isContact = provinceSelect.name === 'contact_province';
    const form = provinceSelect.closest('form') || document;
    const bkkZoneContainer = isContact ? null : form.querySelector('#bkkZoneContainer');
    const bkkZoneSelect = isContact ? null : form.querySelector('select[name="bkk_zone"]');
    const districtSelect = form.querySelector('select[data-province-field="' + provinceSelect.name + '"]') || form.querySelector('select[name="district"], select[name="contact_district"]');
    const targetSubdistrictField = isContact ? 'contact_subdistrict' : 'subdistrict';
    const subdistrictSelects = form.querySelectorAll(
      'select[data-district-field="' + (districtSelect ? districtSelect.name : '') + '"], select[name="' + targetSubdistrictField + '"]'
    );
    const isSequentialContactAddress = provinceSelect.getAttribute('data-contact-address-step') === 'province';

    if (isSequentialContactAddress) {
      const selectedProvince = provinceSelect.value || provinceSelect.getAttribute('data-current-val') || '';
      provinceSelect.innerHTML = '<option value="">— เลือกจังหวัด —</option>';
      Object.keys(districtMap).sort(function (a, b) { return a.localeCompare(b, 'th'); }).forEach(function (province) {
        provinceSelect.appendChild(new Option(province, province));
      });
      if (selectedProvince && !Object.prototype.hasOwnProperty.call(districtMap, selectedProvince)) {
        provinceSelect.appendChild(new Option(selectedProvince, selectedProvince));
      }
      provinceSelect.value = selectedProvince;
    }

    function clearContactAddressChildren() {
      if (!isSequentialContactAddress || !districtSelect) return;
      districtSelect.value = '';
      districtSelect.setAttribute('data-current-val', '');
      subdistrictSelects.forEach(function (subdistrictSelect) {
        subdistrictSelect.value = '';
        subdistrictSelect.setAttribute('data-current-val', '');
      });
    }

    let previousContactProvince = provinceSelect.value || '';
    let previousContactDistrict = districtSelect ? (districtSelect.value || '') : '';

    function updateSubdistricts() {
      if (!districtSelect) return;
      const distVal = (districtSelect.value || '').trim();
      subdistrictSelects.forEach(function (subdSelect) {
        if (subdSelect.tagName.toLowerCase() !== 'select') return;
        const previousVal = subdSelect.value;
        let currentSubdVal = previousVal || subdSelect.getAttribute('data-current-val') || '';
        if (currentSubdVal === '{' || currentSubdVal === '}' || currentSubdVal === 'null' || currentSubdVal === 'undefined') {
          currentSubdVal = '';
        }
        subdSelect.innerHTML = '<option value="">— เลือกตำบล/แขวง —</option>';
        if (!distVal) return;

        const list = getSubdistricts(distVal, (provinceSelect.value || '').trim());
        let matched = false;

        list.forEach(function (subd) {
          if (!subd || subd === '{' || subd === '}') return;
          const opt = document.createElement('option');
          opt.value = subd;
          opt.textContent = subd;
          if (subd === currentSubdVal) {
            opt.selected = true;
            matched = true;
          }
          subdSelect.appendChild(opt);
        });

        if (currentSubdVal && !matched && currentSubdVal !== '{' && currentSubdVal !== '}') {
          const opt = document.createElement('option');
          opt.value = currentSubdVal;
          opt.textContent = currentSubdVal;
          opt.selected = true;
          subdSelect.appendChild(opt);
        }

        // Update data-current-val so subsequent updates preserve current selection
        if (subdSelect.value) {
          subdSelect.setAttribute('data-current-val', subdSelect.value);
        }
      });
    }

    function updateCascade() {
      const provVal = window.PmycTeamArea.normalizeProvince(provinceSelect.value);

      if (bkkZoneContainer && bkkZoneSelect) {
        if (provVal === 'กรุงเทพมหานคร') {
          bkkZoneContainer.style.display = 'block';
        } else {
          bkkZoneContainer.style.display = 'none';
          bkkZoneSelect.value = '';
        }
      }

      if (districtSelect) {
        const label = districtSelect.name === 'contact_district' ? '— เลือกเขต/อำเภอ —' : '— เลือกอำเภอ/เขต —';
        const rawCurrentDistVal = districtSelect.value || districtSelect.getAttribute('data-current-val') || '';
        const currentDistVal = window.PmycTeamArea.isValidDistrict(rawCurrentDistVal, provVal)
          ? window.PmycTeamArea.normalizeDistrictName(rawCurrentDistVal, provVal) : rawCurrentDistVal;
        districtSelect.innerHTML = '<option value="">' + label + '</option>';

        let allowedDistricts = [];
        if (provVal === 'กรุงเทพมหานคร') {
          const selectedZone = bkkZoneSelect ? bkkZoneSelect.value : '';
          if (selectedZone && bkkZoneMap[selectedZone]) {
            allowedDistricts = bkkZoneMap[selectedZone];
          } else {
            allowedDistricts = districtMap["กรุงเทพมหานคร"] || [];
          }
        } else if (provVal && districtMap[provVal]) {
          allowedDistricts = districtMap[provVal];
        }

        let distMatched = false;
        allowedDistricts.forEach(function (rawDist) {
          const dist = window.PmycTeamArea.normalizeDistrictName(rawDist, provVal);
          const opt = document.createElement('option');
          opt.value = dist;
          opt.textContent = dist;
          if (dist === currentDistVal) {
            opt.selected = true;
            distMatched = true;
          }
          districtSelect.appendChild(opt);
        });

        if (currentDistVal && !distMatched) {
          const opt = document.createElement('option');
          opt.value = currentDistVal;
          opt.textContent = currentDistVal;
          opt.selected = true;
          districtSelect.appendChild(opt);
        }
      }

      updateSubdistricts();
    }

    ['change', 'input'].forEach(function (evtType) {
      provinceSelect.addEventListener(evtType, function () {
        if (isSequentialContactAddress) {
          const selectedProvince = (provinceSelect.value || '').trim();
          if (selectedProvince !== previousContactProvince) {
            clearContactAddressChildren();
            previousContactProvince = selectedProvince;
            previousContactDistrict = '';
          }
        }
        updateCascade();
      });
    });
    if (bkkZoneSelect) {
      ['change', 'input'].forEach(function (evtType) {
        bkkZoneSelect.addEventListener(evtType, updateCascade);
      });
    }
    if (districtSelect) {
      ['change', 'input'].forEach(function (evtType) {
        districtSelect.addEventListener(evtType, function () {
          const provVal = window.PmycTeamArea.normalizeProvince(provinceSelect.value);
          const selectedDist = (districtSelect.value || '').trim();
          if (isSequentialContactAddress && selectedDist !== previousContactDistrict) {
            subdistrictSelects.forEach(function (subdistrictSelect) {
              subdistrictSelect.value = '';
              subdistrictSelect.setAttribute('data-current-val', '');
            });
            previousContactDistrict = selectedDist;
          }
          if (selectedDist) {
            districtSelect.setAttribute('data-current-val', selectedDist);
          }
          if (provVal === 'กรุงเทพมหานคร' && bkkZoneSelect) {
            const cleanDistName = selectedDist.replace(/^เขต/, '').trim();
            const matchedZone = districtToZoneMap[selectedDist] || districtToZoneMap[cleanDistName] || districtToZoneMap['เขต' + cleanDistName];
            if (matchedZone && bkkZoneSelect.value !== matchedZone) {
              bkkZoneSelect.value = matchedZone;
            }
          }
          updateSubdistricts();
        });
      });
    }

    subdistrictSelects.forEach(function (subdSelect) {
      ['change', 'input'].forEach(function (evtType) {
        subdSelect.addEventListener(evtType, function () {
          if (subdSelect.value) {
            subdSelect.setAttribute('data-current-val', subdSelect.value);
          }
        });
      });
    });

    updateCascade();
  });

  // 1. Team Profile Update Form AJAX Handler (Sends Multipart FormData)
  const teamForm = document.querySelector('form[action*="/api/team/team-update"]');
  if (teamForm) {
    // Custom validity message in Thai for native browser tooltips
    teamForm.querySelectorAll('input, select').forEach(function(input) {
      input.addEventListener('invalid', function() {
        if (input.validity.valueMissing) {
          input.setCustomValidity('กรุณากรอกข้อมูลในช่องนี้');
        } else if (input.validity.typeMismatch && input.type === 'email') {
          input.setCustomValidity('กรุณากรอกรูปแบบอีเมลให้ถูกต้อง (เช่น example@email.com)');
        }
      });
      input.addEventListener('input', function() {
        input.setCustomValidity('');
        input.classList.remove('is-invalid');
        const err = input.parentNode.querySelector('.invalid-feedback');
        if (err) err.remove();
      });
    });

    teamForm.addEventListener('submit', async function (e) {
      e.preventDefault();

      // Clear previous validation errors
      teamForm.querySelectorAll('.is-invalid').forEach(el => el.classList.remove('is-invalid'));
      teamForm.querySelectorAll('.invalid-feedback').forEach(el => el.remove());

      let isValid = true;
      let firstInvalidInput = null;

      // Validate required fields
      const requiredInputs = teamForm.querySelectorAll('[required]');
      requiredInputs.forEach(input => {
        const val = (input.value || '').trim();
        if (!val) {
          isValid = false;
          input.classList.add('is-invalid');
          if (!firstInvalidInput) firstInvalidInput = input;

          const err = document.createElement('div');
          err.className = 'invalid-feedback d-block';
          err.innerText = 'กรุณากรอกข้อมูลในช่องนี้';

          const targetParent = input.closest('.input-group') || input.parentNode;
          if (!targetParent.querySelector('.invalid-feedback')) {
            targetParent.appendChild(err);
          }
        } else if (input.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) {
          isValid = false;
          input.classList.add('is-invalid');
          if (!firstInvalidInput) firstInvalidInput = input;

          const err = document.createElement('div');
          err.className = 'invalid-feedback d-block';
          err.innerText = 'กรุณากรอกรูปแบบอีเมลให้ถูกต้อง (เช่น example@email.com)';

          const targetParent = input.closest('.input-group') || input.parentNode;
          if (!targetParent.querySelector('.invalid-feedback')) {
            targetParent.appendChild(err);
          }
        }
      });

      if (!isValid) {
        if (firstInvalidInput) {
          firstInvalidInput.focus();
          firstInvalidInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        return;
      }

      const actionUrl = teamForm.getAttribute('action');
      const formData = new FormData(teamForm);
      teamForm.querySelectorAll('select[data-contact-address-step]').forEach(function (addressField) {
        formData.set(addressField.name, addressField.value);
      });

      Swal.fire({
        title: 'กำลังบันทึกข้อมูล...',
        text: 'กรุณารอสักครู่',
        allowOutsideClick: false,
        didOpen: () => {
          Swal.showLoading();
        }
      });

      try {
        const response = await fetch(actionUrl, {
          method: 'POST',
          headers: {
            'Accept': 'application/json',
            'X-Requested-With': 'XMLHttpRequest'
          },
          body: formData
        });

        const data = await response.json();

        if (data.success) {
          Swal.fire({
            icon: 'success',
            title: 'บันทึกสำเร็จ!',
            text: data.message || 'บันทึกการแก้ไขข้อมูลทีมเรียบร้อยแล้ว',
            confirmButtonText: 'ตกลง',
            confirmButtonColor: '#0b2a5b',
            customClass: { popup: 'rounded-4 shadow-lg' }
          }).then(() => {
            if (data.redirectUrl) {
              window.location.href = data.redirectUrl;
            } else {
              window.location.reload();
            }
          });
        } else {
          Swal.fire({
            icon: 'error',
            title: 'เกิดข้อผิดพลาด',
            text: data.error || 'ไม่สามารถบันทึกข้อมูลได้ กรุณาลองใหม่อีกครั้ง',
            confirmButtonText: 'ตกลง',
            confirmButtonColor: '#0b2a5b',
            customClass: { popup: 'rounded-4 shadow-lg' }
          });
        }
      } catch (err) {
        Swal.fire({
          icon: 'error',
          title: 'ข้อผิดพลาดเครือข่าย',
          text: 'ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้ กรุณาลองใหม่อีกครั้ง',
          confirmButtonText: 'ตกลง',
          confirmButtonColor: '#0b2a5b',
          customClass: { popup: 'rounded-4 shadow-lg' }
        });
      }
    });
  }

  // 1.5. Team Register Form Client-side Validation & AJAX Handler
  const regForm = document.querySelector('form[action*="/api/team/register"]');
  if (regForm) {
    regForm.addEventListener('submit', async function (e) {
      e.preventDefault();

      // Clear previous validation errors completely
      regForm.querySelectorAll('.is-invalid').forEach(el => el.classList.remove('is-invalid'));
      regForm.querySelectorAll('.invalid-feedback').forEach(el => el.remove());

      let isValid = true;
      let firstInvalidInput = null;

      // Validate required fields
      const requiredInputs = regForm.querySelectorAll('[required]');
      requiredInputs.forEach(input => {
        const val = (input.value || '').trim();
        if (!val) {
          isValid = false;
          input.classList.add('is-invalid');
          if (!firstInvalidInput) firstInvalidInput = input;

          const err = document.createElement('div');
          err.className = 'invalid-feedback d-block';
          err.innerText = 'กรุณากรอกข้อมูลในช่องนี้';

          const targetParent = input.closest('.input-group') || input.parentNode;
          if (!targetParent.querySelector('.invalid-feedback')) {
            targetParent.appendChild(err);
          }
        }
      });

      // Validate password confirmation match
      const pass = regForm.querySelector('input[name="password"]');
      const passConf = regForm.querySelector('input[name="password_confirm"]');
      if (pass && passConf && pass.value && passConf.value && pass.value !== passConf.value) {
        isValid = false;
        passConf.classList.add('is-invalid');
        if (!firstInvalidInput) firstInvalidInput = passConf;

        const targetParent = passConf.closest('.input-group') || passConf.parentNode;
        if (!targetParent.querySelector('.invalid-feedback')) {
          const err = document.createElement('div');
          err.className = 'invalid-feedback d-block';
          err.innerText = 'รหัสผ่านและยืนยันรหัสผ่านไม่ตรงกัน';
          targetParent.appendChild(err);
        }
      }

      if (!isValid) {
        if (firstInvalidInput) {
          firstInvalidInput.focus();
          firstInvalidInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        return;
      }

      // Submit via AJAX if client validation passes
      const actionUrl = regForm.getAttribute('action');
      const formData = new FormData(regForm);
      const payload = {};

      formData.forEach((value, key) => {
        if (key.endsWith('[]')) {
          if (!payload[key]) {
            payload[key] = [];
          }
          payload[key].push(value);
        } else if (payload[key] !== undefined) {
          if (!Array.isArray(payload[key])) {
            payload[key] = [payload[key]];
          }
          payload[key].push(value);
        } else {
          payload[key] = value;
        }
      });

      Swal.fire({
        title: 'กำลังลงทะเบียน...',
        text: 'กรุณารอสักครู่',
        allowOutsideClick: false,
        didOpen: () => {
          Swal.showLoading();
        }
      });

      try {
        const response = await fetch(actionUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'X-Requested-With': 'XMLHttpRequest'
          },
          body: JSON.stringify(payload)
        });

        const data = await response.json();

        if (data.success) {
          Swal.fire({
            icon: 'success',
            title: 'ลงทะเบียนสำเร็จ!',
            text: data.message || 'ลงทะเบียนทีมเรียบร้อยแล้ว',
            confirmButtonText: 'เข้าสู่ระบบ',
            confirmButtonColor: '#0b2a5b',
            customClass: { popup: 'rounded-4 shadow-lg' }
          }).then(() => {
            window.location.href = data.redirectUrl || '/team/login.php';
          });
        } else {
          Swal.fire({
            icon: 'error',
            title: 'ลงทะเบียนไม่สำเร็จ',
            text: data.error || 'กรุณาตรวจสอบข้อมูลและลองใหม่อีกครั้ง',
            confirmButtonText: 'ตกลง',
            confirmButtonColor: '#0b2a5b',
            customClass: { popup: 'rounded-4 shadow-lg' }
          });
        }
      } catch (err) {
        Swal.fire({
          icon: 'error',
          title: 'ข้อผิดพลาดเครือข่าย',
          text: 'ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้',
          confirmButtonText: 'ตกลง',
          confirmButtonColor: '#0b2a5b',
          customClass: { popup: 'rounded-4 shadow-lg' }
        });
      }
    });
  }

  // 2. Team Login Form AJAX Handler
  const loginForm = document.querySelector('form[action*="/api/team/login"]');
  if (loginForm) {
    loginForm.addEventListener('submit', async function (e) {
      e.preventDefault();
      const actionUrl = loginForm.getAttribute('action');
      const formData = new FormData(loginForm);
      const payload = Object.fromEntries(formData.entries());

      Swal.fire({
        title: 'กำลังเข้าสู่ระบบ...',
        text: 'กรุณารอสักครู่',
        allowOutsideClick: false,
        didOpen: () => {
          Swal.showLoading();
        }
      });

      try {
        const response = await fetch(actionUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify(payload)
        });

        const data = await response.json();

        if (data.success) {
          Swal.fire({
            icon: 'success',
            title: 'เข้าสู่ระบบสำเร็จ!',
            text: 'กำลังนำท่านเข้าสู่ระบบจัดการทีม',
            timer: 1500,
            showConfirmButton: false,
            customClass: { popup: 'rounded-4 shadow-lg' }
          }).then(() => {
            window.location.href = data.redirectUrl || '/team/index.php';
          });
        } else {
          Swal.fire({
            icon: 'error',
            title: 'เข้าสู่ระบบไม่สำเร็จ',
            text: data.error || 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง',
            confirmButtonText: 'ตกลง',
            confirmButtonColor: '#0b2a5b',
            customClass: { popup: 'rounded-4 shadow-lg' }
          });
        }
      } catch (err) {
        Swal.fire({
          icon: 'error',
          title: 'ข้อผิดพลาดเครือข่าย',
          text: 'ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้',
          confirmButtonText: 'ตกลง',
          confirmButtonColor: '#0b2a5b',
          customClass: { popup: 'rounded-4 shadow-lg' }
        });
      }
    });
  }

  // 3. Global File/Image Preview Modal Handler (Supports Image & PDF)
  window.viewPhoto = function (title, imgUrl) {
    if (!imgUrl || imgUrl === 'null' || imgUrl === 'undefined' || imgUrl.trim() === '') {
      Swal.fire({
        icon: 'info',
        title: title,
        text: 'ยังไม่ได้อัปโหลดรูปถ่าย/เอกสาร',
        confirmButtonColor: '#0b2a5b',
        customClass: { popup: 'rounded-4 shadow-lg' }
      });
      return;
    }

    // Normalize potential double slashes in URL path (e.g. http://localhost:4500//uploads/... => http://localhost:4500/uploads/...)
    let cleanUrl = imgUrl.trim();
    cleanUrl = cleanUrl.replace(/([^:]\/)\/+/g, '$1');

    const isPdf = cleanUrl.toLowerCase().endsWith('.pdf');
    if (isPdf) {
      Swal.fire({
        title: title,
        html: '<iframe src="' + cleanUrl + '" style="width:100%; height:500px; border:none;" class="rounded border"></iframe>',
        width: 800,
        customClass: { popup: 'rounded-4 shadow-lg' },
        showCloseButton: true,
        confirmButtonText: 'ปิดหน้าต่าง',
        confirmButtonColor: '#0b2a5b'
      });
    } else {
      Swal.fire({
        title: title,
        imageUrl: cleanUrl,
        imageAlt: title,
        imageWidth: 450,
        imageHeight: 450,
        customClass: {
          popup: 'rounded-4 shadow-lg',
          image: 'object-fit-contain rounded border'
        },
        showCloseButton: true,
        confirmButtonText: 'ปิดหน้าต่าง',
        confirmButtonColor: '#0b2a5b',
        didOpen: function () {
          const img = Swal.getImage();
          if (img) {
            img.onerror = function () {
              Swal.fire({
                icon: 'warning',
                title: title,
                text: 'ไม่สามารถโหลดไฟล์รูปภาพได้ หรือยังไม่ได้อัปโหลดไฟล์ในระบบ',
                confirmButtonColor: '#0b2a5b',
                customClass: { popup: 'rounded-4 shadow-lg' }
              });
            };
          }
        }
      });
    }
  };
  // 4. Global Photo Upload Trigger Handler
  window.triggerPhotoUpload = function (type, id, name, base) {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.onchange = async function (e) {
      const file = e.target.files[0];
      if (!file) return;

      const formData = new FormData();
      formData.append('photo', file);
      formData.append('type', type);
      formData.append('id', id);

      Swal.fire({
        title: 'กำลังอัปโหลดรูปถ่าย...',
        text: 'กรุณารอสักครู่',
        allowOutsideClick: false,
        didOpen: () => { Swal.showLoading(); }
      });

      try {
        const response = await fetch((base || '') + '/api/upload-photo', {
          method: 'POST',
          body: formData
        });
        const data = await response.json();
        if (data.success) {
          Swal.fire({
            icon: 'success',
            title: 'อัปโหลดสำเร็จ!',
            text: data.message || 'รูปถ่ายได้รับการบันทึกเรียบร้อยแล้ว',
            confirmButtonColor: '#0b2a5b',
            customClass: { popup: 'rounded-4 shadow-lg' }
          }).then(() => {
            window.location.reload();
          });
        } else {
          Swal.fire({
            icon: 'error',
            title: 'เกิดข้อผิดพลาด',
            text: data.error || 'ไม่สามารถอัปโหลดรูปถ่ายได้',
            confirmButtonColor: '#0b2a5b',
            customClass: { popup: 'rounded-4 shadow-lg' }
          });
        }
      } catch (err) {
        Swal.fire({
          icon: 'error',
          title: 'ข้อผิดพลาดเครือข่าย',
          text: 'ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้',
          confirmButtonColor: '#0b2a5b',
          customClass: { popup: 'rounded-4 shadow-lg' }
        });
      }
    };
    fileInput.click();
  };

  // 5. Global Password Visibility Toggle Handler
  window.togglePasswordVisibility = function (inputId, btn) {
    const input = document.getElementById(inputId);
    if (!input) return;

    const icon = btn.querySelector('i');
    if (input.type === 'password') {
      input.type = 'text';
      if (icon) {
        icon.classList.remove('bi-eye');
        icon.classList.add('bi-eye-slash');
      }
    } else {
      input.type = 'password';
      if (icon) {
        icon.classList.remove('bi-eye-slash');
        icon.classList.add('bi-eye');
      }
    }
  };
});
