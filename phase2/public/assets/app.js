(() => {
  document.querySelectorAll('[data-venue-form]').forEach(form => {
    const province = form.querySelector('[data-province]');
    const district = form.querySelector('[data-district]');
    province.addEventListener('change', () => {
      const names = window.thaiAdministrativeDivisions?.districts?.[province.value] || [];
      district.replaceChildren(new Option('เลือกอำเภอ',''), ...names.map(name => new Option(name,name)));
    });
  });
  document.querySelectorAll('[data-draw-ceremony]').forEach(ceremony => {
    const button = ceremony.querySelector('[data-draw-next]');
    const machine = ceremony.querySelector('[data-draw-machine]');
    const status = ceremony.querySelector('[data-draw-status]');
    const boxes = [...ceremony.querySelectorAll('[data-draw-reveal]')];
    let running = false;
    let completed = false;
    button.addEventListener('click', () => {
      if (running || completed || !boxes.length) return;
      running = true;
      button.disabled = true;
      machine.classList.add('running');
      status.textContent = 'กำลังเปิดผลการจับสลาก…';
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      let index = 0;
      const reveal = () => {
        const box = boxes[index++];
        box.querySelector('b').textContent = box.dataset.name;
        box.classList.add('done');
        status.textContent = `เปิดผลแล้ว ${index} จาก ${boxes.length} ทีม`;
        if (index < boxes.length) setTimeout(reveal, reduced ? 0 : 350);
        else {
          machine.classList.remove('running');
          button.textContent = 'เปิดผลครบแล้ว';
          running = false;
          completed = true;
        }
      };
      setTimeout(reveal, reduced ? 0 : 1200);
    });
  });
  const button = document.querySelector('.menu-toggle');
  const backdrop = document.querySelector('.drawer-backdrop');
  const toggle = open => {
    document.body.classList.toggle('drawer-open', open);
    button?.setAttribute('aria-expanded', String(open));
    if (backdrop) backdrop.hidden = !open;
  };
  button?.addEventListener('click', () => toggle(!document.body.classList.contains('drawer-open')));
  backdrop?.addEventListener('click', () => toggle(false));
  document.querySelectorAll('.nav a').forEach(link => link.addEventListener('click', () => toggle(false)));
  document.addEventListener('keydown', event => { if (event.key === 'Escape') { toggle(false); button?.focus(); } });
  window.addEventListener?.('resize', () => { if (window.matchMedia('(min-width: 1051px)').matches) toggle(false); });
  document.querySelectorAll('[data-competition-form]').forEach(form => {
    const stage = form.querySelector('[data-stage]');
    const division = form.querySelector('[data-division]');
    const province = form.querySelector('[data-province]');
    const district = form.querySelector('[data-district]');
    const zone = form.querySelector('[data-zone]');
    const save = form.querySelector('[data-setup-save]');
    let areas = {};
    try { const parsed = JSON.parse(form.dataset.existingAreas || '{}'); if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) areas = parsed; } catch { /* Fail closed; no static area fallback. */ }
    const female = () => division.selectedOptions?.[0]?.dataset.code === 'U18_GIRL';
    const districtScope = () => stage.value === '1' && !female();
    const current = () => areas[division.value]?.[stage.value] || {};
    const updateSave = () => { save.disabled = !division.value || !province.value || (districtScope() && !district.value) || !['1','2'].includes(stage.value); };
    const updateDistrict = () => {
      const selected = district.value;
      const names = current()[province.value] || [];
      district.replaceChildren(new Option((stage.value === '2' || female()) ? 'ใช้ระดับจังหวัด ไม่ต้องเลือกอำเภอ' : (names.length ? 'เลือกอำเภอ / เขต' : 'ไม่มีอำเภอที่มีข้อมูล'), ''), ...names.map(name => new Option(name,name)));
      district.disabled = !districtScope() || !names.length;
      district.required = districtScope(); if(!districtScope())district.value='';
      if (districtScope() && names.includes(selected)) district.value = selected;
      updateSave();
    };
    const update = () => {
      if(female()){stage.value='1';} stage.querySelectorAll('option').forEach(o=>{if(o.value==='2')o.disabled=female();if(o.value==='1')o.textContent=female()?'รอบแรกหญิง · ระดับจังหวัด':'Stage 1 อำเภอ';});
      const selected = province.value;
      const names = Object.keys(current());
      province.replaceChildren(new Option(!division.value ? 'เลือกรุ่นอายุก่อน' : (names.length ? 'เลือกจังหวัด' : 'ไม่มีจังหวัดที่มีข้อมูล'), ''), ...names.map(name => new Option(name,name)));
      province.disabled = !division.value || !names.length || !['1','2'].includes(stage.value);
      province.required = ['1','2'].includes(stage.value);
      if (names.includes(selected)) province.value = selected;
      zone.disabled = true;zone.required = false;zone.value = '';
      updateDistrict();
    };
    province.addEventListener('change', updateDistrict);
    district.addEventListener('change', updateSave);
    division.addEventListener('change', update);
    stage.addEventListener('change', update);
    update();
  });
  document.querySelectorAll('[data-setup-submit]').forEach(form => {
    const dialog = document.querySelector('[data-setup-feedback]');
    const save = form.querySelector('[data-setup-save]');
    const request = form.querySelector('[name="request_id"]');
    let running = false, saved = null;
    const feedback = (ok, message) => {
      dialog.dataset.success = String(ok);
      dialog.querySelector('[data-feedback-title]').textContent = ok ? 'บันทึกสำเร็จ' : 'บันทึกไม่สำเร็จ';
      dialog.querySelector('[data-feedback-message]').textContent = message;
      dialog.querySelector('.setup-feedback-icon').textContent = ok ? '✓' : '!';
      dialog.showModal();
    };
    dialog.querySelector('[data-feedback-close]').addEventListener('click', () => dialog.close());
    dialog.addEventListener('close', () => save.focus());
    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (running || !form.reportValidity()) return;
      running = true;
      const controls = [...form.elements].map(control => [control, control.disabled]);
      try {
        const payload = Object.fromEntries(new FormData(form).entries());
        const signature = JSON.stringify(['division_id','stage','province','district','zone'].map(key => payload[key] || ''));
        if (saved !== null && saved !== signature) { request.value = window.crypto.randomUUID(); saved = null; }
        payload.request_id = request.value;
        payload._setup_feedback = '1';
        controls.forEach(([control]) => { control.disabled = true; });
        const response = await fetch(form.action, {method:'POST', credentials:'same-origin', redirect:'error', headers:{'Content-Type':'application/json','Accept':'application/json'}, body:JSON.stringify(payload)});
        const result = response.headers.get('content-type')?.includes('application/json') ? await response.json() : null;
        if (!response.ok || result?.ok !== true) {
          feedback(false, typeof result?.message === 'string' ? result.message : 'ไม่สามารถบันทึกได้ กรุณาตรวจสอบการเข้าสู่ระบบและลองใหม่');
          return;
        }
        saved = signature;
        feedback(true, 'บันทึกการตั้งค่าการแข่งขันแล้ว');
      } catch {
        feedback(false, 'ยังยืนยันการบันทึกไม่ได้ กรุณาตรวจสอบการเชื่อมต่อและกดบันทึกอีกครั้ง');
      } finally {
        controls.forEach(([control, disabled]) => { control.disabled = disabled; });
        running = false;
      }
    });
  });
  document.querySelectorAll('[data-participants-form]').forEach(form => {
    const saved = JSON.parse(form.dataset.savedTeams).sort();
    const update = () => {
      const selected = [...form.querySelectorAll('input[name="teams[]"]:checked')].map(input => input.value).sort();
      const unchanged = saved.length > 0 && JSON.stringify(selected) === JSON.stringify(saved);
      document.querySelectorAll('[data-participants-lock]').forEach(button => {
        button.disabled = !unchanged;
        button.title = unchanged ? 'ล็อกรายชื่อที่บันทึกแล้ว' : 'บันทึกรายชื่อที่เลือกก่อนล็อก';
      });
    };
    form.addEventListener('change', update);
    update();
  });
  document.querySelectorAll('[data-assignment-form]').forEach(form => {
    const account = form.querySelector('[data-account]');
    const update = () => {
      const readOnly = account.selectedOptions[0]?.dataset.role === 'DOCUMENT_VERIFIER';
      form.querySelectorAll('input[name="permissions[]"]').forEach(input => {
        input.disabled = readOnly && input.value !== 'view';
        if (input.disabled) input.checked = false;
        if (input.value === 'view') input.checked = true;
      });
    };
    account.addEventListener('change', update);
    update();
  });
  document.querySelectorAll('[data-result-form]').forEach(form => {
    const type = form.querySelector('[data-result-type]');
    const update = () => form.querySelectorAll('[data-score-group]').forEach(group => {
      const kind = group.dataset.scoreGroup;
      const active = kind === 'normal' || (kind === 'penalties' && type.value === 'PENALTIES') || (kind === 'extra' && form.dataset.knockoutTie === 'EXTRA_TIME' && type.value !== 'NORMAL');
      group.hidden = !active;
      group.querySelectorAll('input').forEach(input => { input.disabled = !active; input.required = active; });
    });
    type.addEventListener('change', update);
    update();
  });
  document.querySelectorAll('[data-lineup-form]').forEach(form => {
    form.querySelectorAll('tbody tr').forEach(row => {
      const choices = [...row.querySelectorAll('input[type="checkbox"]')];
      choices.forEach(choice => choice.addEventListener('change', () => {
        if (choice.checked) choices.forEach(other => { if (other !== choice) other.checked = false; });
      }));
    });
  });
  const authenticated = document.body.dataset.authenticated === '1';
  if (!authenticated && document.body.dataset.ambiguous !== '1' && location.pathname === '/phase2demo') {
    fetch('/sat-admin/phase2-session-status', { credentials: 'same-origin', cache: 'no-store' })
      .then(response => response.ok ? response.json() : null)
      .then(status => { if (status?.authenticated) location.replace('/sat-admin/phase2-entry'); })
      .catch(() => {});
  }
  if (authenticated) {
    const expiry = Number(document.body.dataset.expires);
    if (Number.isFinite(expiry) && expiry > 0) setTimeout(() => location.replace('/phase2demo'), Math.max(0, expiry - Date.now()));
    const check = () => fetch('/phase2demo/session-status', { credentials: 'same-origin', cache: 'no-store' })
      .then(response => response.ok ? response.json() : null)
      .then(status => { if (status && (!status.authenticated || status.role !== document.body.dataset.role)) location.replace('/phase2demo'); })
      .catch(() => {});
    document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
    window.addEventListener('pageshow', check);
    setInterval(check, 30000);
  }
})();
