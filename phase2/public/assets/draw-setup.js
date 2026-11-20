(() => {
  const root = document.querySelector('[data-unified-draw]');
  if (!root) return;
  const form = root.querySelector('[data-draw-setup-form]');
  const fields = Object.fromEntries(['event_id','division_id','stage','province','district'].map(name => [name, form.querySelector(`[name="${name}"]`)]));
  const save = root.querySelector('[data-draw-save]'), start = root.querySelector('[data-draw-start]');
  const notice = root.querySelector('[data-draw-notice]'), tbody = root.querySelector('[data-draw-teams]');
  const dialog = document.querySelector('[data-draw-feedback]');
  const initial = JSON.parse(root.dataset.initial);
  let metadata = initial.metadata, preview = initial.preview, epoch = 0, busy = false, saveKey = null, startKey = null, startNonce = null;
  let savedTicket = preview?.setup_request_id || null;
  const values = () => Object.fromEntries(Object.entries(fields).map(([name, field]) => [name, field.value]));
  const complete = () => fields.event_id.value && fields.division_id.value && fields.province.value && (fields.stage.value === '2' || fields.district.value);
  const options = (field, items, placeholder, selected = '') => {
    field.replaceChildren(new Option(placeholder, ''), ...items.map(([value, label]) => new Option(label, value)));
    field.value = items.some(([value]) => value === String(selected)) ? String(selected) : '';
    field.disabled = items.length === 0;
  };
  const areas = () => metadata.areas?.[fields.division_id.value]?.[fields.stage.value] || {};
  const districtOptions = (selected = '') => {
    const names = areas()[fields.province.value] || [];
    options(fields.district, names.map(name => [name,name]), fields.stage.value === '2' ? 'Stage 2 ใช้ระดับจังหวัด' : 'เลือกเขต/อำเภอ', selected);
    fields.district.required = fields.stage.value === '1';
    if (fields.stage.value === '2') fields.district.disabled = true;
  };
  const provinceOptions = (province = '', district = '') => {
    options(fields.province, Object.keys(areas()).map(name => [name,name]), 'เลือกจังหวัด', province);
    districtOptions(district);
  };
  const render = () => {
    const teams = preview?.teams || [], structure = preview?.structure;
    root.querySelector('[data-draw-mode]').textContent = metadata.data_mode || '';
    root.querySelector('[data-draw-format]').replaceChildren(new Option(metadata.format || 'เลือกฤดูกาลและรายการก่อน'));
    root.querySelector('[data-draw-teams-title]').textContent = `${preview?.historical ? 'ทีมที่ใช้จับสลาก' : 'ทีม Approved'}${fields.district.value || fields.province.value ? ' · ' + (fields.district.value || fields.province.value) : ''}`;
    root.querySelector('[data-draw-teams-count]').textContent = `${teams.length} ทีม`;
    tbody.replaceChildren();
    teams.forEach((team, i) => {
      const row = document.createElement('tr');
      [String(i + 1), team.name, preview.historical ? 'บันทึกแล้ว' : 'อนุมัติแล้ว', 'มีสิทธิ์'].forEach((text, index) => {
        const cell = document.createElement('td');
        if (index === 2) { const badge = document.createElement('span'); badge.className = 'badge b-green'; badge.textContent = text; cell.append(badge); }
        else cell.textContent = text;
        row.append(cell);
      });
      tbody.append(row);
    });
    if (!teams.length) { const row = document.createElement('tr'), cell = document.createElement('td'); cell.colSpan = 4; cell.className = 'empty'; cell.textContent = preview ? 'ยังไม่มีทีมที่ผ่านเกณฑ์ในรุ่นและพื้นที่ที่เลือก' : 'เลือกข้อมูลให้ครบถึงเขต/อำเภอเพื่อแสดงทีม'; row.append(cell); tbody.append(row); }
    const summary = structure ? {count:`${structure.count} ทีม`,main_round:structure.count ? `${structure.main_round} ทีม` : '—',playoff_pairs:`${structure.playoff_pairs} คู่`,direct_count:`${structure.direct_entry_slots.length} ทีม`,direct_slots:structure.direct_entry_slots.join(', ') || 'ไม่มี',method:structure.count ? `สุ่มทีมเข้าสู่ตำแหน่ง A1${structure.count > 1 ? '–A'+structure.count : ''}` : '—'} : {};
    root.querySelectorAll('[data-draw-summary]').forEach(item => { item.textContent = summary[item.dataset.drawSummary] || '—'; });
    let explanation = 'เลือกฤดูกาล รุ่น และพื้นที่เพื่อคำนวณโครงสร้างการแข่งขัน';
    if (structure?.count === 1) explanation = 'มีทีมผ่านเกณฑ์ 1 ทีม ผ่านเข้ารอบโดยอัตโนมัติ ไม่มีคู่แข่งขันหรือสกอร์สมมติ';
    else if (structure?.count > 1) explanation = structure.playoff_pairs ? `${structure.count} ทีม: ตำแหน่ง ${structure.direct_entry_slots.join(', ')} รอเล่นรอบหลัก ${structure.main_round} ทีม ส่วน Play-off: ${structure.playoff_slots.map(pair => pair.join('–')).join(', ')} จากนั้นผู้ชนะเข้าสู่รอบหลัก` : `${structure.count} ทีม: เข้ารอบหลัก ${structure.main_round} ทีมทั้งหมด ไม่มีรอบ Play-off และไม่มีทีมผ่านโดยตรง`;
    root.querySelector('[data-draw-explanation]').textContent = explanation;
    notice.textContent = preview?.notice || 'เลือกข้อมูลให้ครบถึงเขต/อำเภอเพื่อโหลดทีมที่ได้รับอนุมัติ';
    save.disabled = busy || !!savedTicket || root.dataset.canSave !== '1' || !complete() || !preview || preview.can_save === false;
    start.disabled = busy || !complete() || !preview?.competition_id || (!preview?.ceremony_url && (!savedTicket || !preview?.can_start));
    start.textContent = preview?.ceremony_url ? 'เข้าสู่พิธีจับสลาก →' : 'เริ่มพิธีจับสลาก →';
    const advancement = root.querySelector('[data-draw-advancement]');
    advancement.hidden = !preview?.advancement_url || !!preview?.historical;
    if (preview?.advancement_url) advancement.href = preview.advancement_url;
  };
  const read = async (url, config) => {
    let response;
    try { response = await fetch(url, {credentials:'same-origin', redirect:'error', ...config}); }
    catch { throw Error('การเชื่อมต่อขัดข้อง กรุณาตรวจสอบและลองใหม่อีกครั้ง'); }
    const result = response.headers.get('content-type')?.includes('application/json') ? await response.json().catch(() => null) : null;
    if (!response.ok || result?.ok !== true) throw Error(typeof result?.message === 'string' ? result.message : 'ไม่สามารถโหลดหรือบันทึกได้ กรุณาตรวจสอบการเข้าสู่ระบบและลองใหม่');
    return result;
  };
  const endpoint = params => '/phase2demo/workspace/draw-setup?' + new URLSearchParams(params);
  const invalidateSaved = () => {
    savedTicket = null; startKey = null; startNonce = null; saveKey = null;
    form.querySelector('[name="request_id"]').value = window.crypto.randomUUID();
    // Do not let refresh restore the old saved Competition after a filter change.
    window.history.replaceState(null,'',endpoint(Object.fromEntries(Object.entries(values()).filter(([,value]) => value !== ''))));
  };
  const loadPreview = async () => {
    const ticket = ++epoch;
    preview = null; render();
    if (!complete()) return;
    notice.textContent = 'กำลังตรวจทีมที่อนุมัติและคำนวณรอบการแข่งขัน…';
    try { const result = await read(endpoint({...values(),preview:'1'})); if (ticket !== epoch) return; preview = result; render(); }
    catch (error) { if (ticket !== epoch) return; notice.textContent = error.message; }
  };
  fields.event_id.addEventListener('change', async () => {
    const ticket = ++epoch;
    metadata = {areas:{},divisions:[]}; preview = null;
    options(fields.division_id, [], 'เลือกรุ่นอายุ'); provinceOptions(); invalidateSaved(); render();
    if (!fields.event_id.value) return;
    notice.textContent = 'กำลังโหลดรุ่นและพื้นที่ของรายการ…';
    try {
      const result = await read(endpoint({event_id:fields.event_id.value,metadata:'1'}));
      if (ticket !== epoch) return;
      metadata = result;
      options(fields.division_id, metadata.divisions.map(d => [d.id,d.label]), 'เลือกรุ่นอายุ'); render();
    } catch (error) { if (ticket === epoch) notice.textContent = error.message; }
  });
  fields.division_id.addEventListener('change', () => { provinceOptions(); invalidateSaved(); return loadPreview(); });
  fields.stage.addEventListener('change', () => { provinceOptions(); invalidateSaved(); return loadPreview(); });
  fields.province.addEventListener('change', () => { districtOptions(); invalidateSaved(); return loadPreview(); });
  fields.district.addEventListener('change', () => { invalidateSaved(); return loadPreview(); });
  const feedback = (ok, text) => {
    dialog.dataset.success = String(ok);
    dialog.querySelector('[data-feedback-title]').textContent = ok ? 'บันทึกสำเร็จ' : 'ดำเนินการไม่สำเร็จ';
    dialog.querySelector('[data-feedback-message]').textContent = text;
    dialog.querySelector('.setup-feedback-icon').textContent = ok ? '✓' : '!';
    dialog.showModal();
  };
  dialog.querySelector('[data-feedback-close]').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => (savedTicket && !start.disabled ? start : save).focus());
  const post = async work => {
    if (busy) return;
    busy = true; const disabled = Object.values(fields).map(field => [field,field.disabled]);
    disabled.forEach(([field]) => { field.disabled = true; }); render();
    try { await work(); }
    catch (error) { feedback(false, error.message); }
    finally { disabled.forEach(([field, state]) => { field.disabled = state; }); busy = false; render(); }
  };
  const jsonPost = (url,payload) => read(url,{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify(payload)});
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (save.disabled || !form.reportValidity()) return;
    const selection = values(), key = JSON.stringify(selection), request = form.querySelector('[name="request_id"]');
    if (saveKey !== null && saveKey !== key) request.value = window.crypto.randomUUID();
    saveKey = key;
    await post(async () => {
      const result = await jsonPost(form.action, {...selection,_csrf:form.querySelector('[name="_csrf"]').value,request_id:request.value,operation:'save'});
      preview = result.preview;
      savedTicket = preview.setup_request_id;
      window.history.replaceState(null,'',result.setup_url);
      feedback(true,'บันทึกการตั้งค่าการแข่งขันแล้ว');
    });
  });
  start.addEventListener('click', async () => {
    if (start.disabled) return;
    if (preview.ceremony_url) { window.location.assign(preview.ceremony_url); return; }
    const current = preview, key = current.competition_id + ':' + current.eligibility_hash;
    if (key !== startKey) { startKey = key; startNonce = window.crypto.randomUUID(); }
    await post(async () => {
      const result = await jsonPost(current.start_url, {_csrf:form.querySelector('[name="_csrf"]').value,request_id:startNonce,operation:'start',version:'0',eligibility_hash:current.eligibility_hash,setup_request_id:savedTicket,_draw_feedback:'1'});
      window.location.assign(result.ceremony_url);
    });
  });
  options(fields.division_id, metadata.divisions.map(d => [d.id,d.label]), 'เลือกรุ่นอายุ', initial.selection.division_id);
  fields.stage.value = String(initial.selection.stage || '1');
  provinceOptions(initial.selection.province, initial.selection.district);
  render();
})();
