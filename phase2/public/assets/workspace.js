(() => {
  const root = document.querySelector('[data-workspace-v16]');
  if (!root) return;
  root.querySelectorAll('.thai-date-wrap').forEach(wrap => {
    const textInput = wrap.querySelector('[data-thai-date-input]');
    if (!textInput) return;
    const months = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
    const weekdays = ['อา','จ','อ','พ','พฤ','ศ','ส'];
    const now = new Date();
    const parseThai = str => {
      const parts = (str || '').trim().split(/\s+/);
      if (parts.length !== 3) return null;
      const d = Number(parts[0]);
      const mIdx = months.indexOf(parts[1]);
      const y = Number(parts[2]) - 543;
      if (!Number.isInteger(d) || mIdx < 0 || !Number.isInteger(y) || y < 1970) return null;
      return new Date(y, mIdx, d);
    };
    const formatThai = (y, mIdx, d) => `${d} ${months[mIdx]} ${y + 543}`;

    const popover = document.createElement('div');
    popover.className = 'thai-cal-popover';
    popover.setAttribute('role', 'dialog');
    popover.setAttribute('aria-label', 'เลือกวันที่แข่งขัน');
    popover.hidden = true;
    wrap.appendChild(popover);

    let selected = parseThai(textInput.value);
    let viewDate = selected ? new Date(selected.getFullYear(), selected.getMonth(), 1) : new Date(now.getFullYear(), now.getMonth(), 1);

    const renderCal = () => {
      const y = viewDate.getFullYear();
      const m = viewDate.getMonth();
      const firstDay = new Date(y, m, 1).getDay();
      const daysInMonth = new Date(y, m + 1, 0).getDate();
      popover.innerHTML = '';

      const head = document.createElement('div');
      head.className = 'thai-cal-head';
      const prevBtn = document.createElement('button');
      prevBtn.type = 'button'; prevBtn.className = 'thai-cal-nav'; prevBtn.textContent = '‹';
      prevBtn.setAttribute('aria-label', 'เดือนก่อนหน้า');
      prevBtn.addEventListener('click', e => { e.stopPropagation(); viewDate = new Date(y, m - 1, 1); renderCal(); });

      const title = document.createElement('strong');
      title.textContent = `${months[m]} ${y + 543}`;

      const nextBtn = document.createElement('button');
      nextBtn.type = 'button'; nextBtn.className = 'thai-cal-nav'; nextBtn.textContent = '›';
      nextBtn.setAttribute('aria-label', 'เดือนถัดไป');
      nextBtn.addEventListener('click', e => { e.stopPropagation(); viewDate = new Date(y, m + 1, 1); renderCal(); });
      head.append(prevBtn, title, nextBtn);
      popover.appendChild(head);

      const wdRow = document.createElement('div');
      wdRow.className = 'thai-cal-weekdays';
      weekdays.forEach(w => { const s = document.createElement('span'); s.textContent = w; wdRow.appendChild(s); });
      popover.appendChild(wdRow);

      const grid = document.createElement('div');
      grid.className = 'thai-cal-grid';
      for (let i = 0; i < firstDay; i++) {
        const blank = document.createElement('span');
        blank.className = 'thai-cal-blank';
        grid.appendChild(blank);
      }
      for (let d = 1; d <= daysInMonth; d++) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'thai-cal-day';
        btn.textContent = String(d);
        if (y === now.getFullYear() && m === now.getMonth() && d === now.getDate()) btn.classList.add('is-today');
        if (selected && y === selected.getFullYear() && m === selected.getMonth() && d === selected.getDate()) btn.classList.add('is-selected');
        btn.addEventListener('click', e => {
          e.stopPropagation();
          selected = new Date(y, m, d);
          textInput.value = formatThai(y, m, d);
          popover.hidden = true;
        });
        grid.appendChild(btn);
      }
      popover.appendChild(grid);

      const foot = document.createElement('div');
      foot.className = 'thai-cal-foot';
      const todayBtn = document.createElement('button');
      todayBtn.type = 'button'; todayBtn.className = 'thai-cal-action'; todayBtn.textContent = 'วันนี้';
      todayBtn.addEventListener('click', e => {
        e.stopPropagation();
        selected = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        viewDate = new Date(now.getFullYear(), now.getMonth(), 1);
        textInput.value = formatThai(now.getFullYear(), now.getMonth(), now.getDate());
        popover.hidden = true;
      });
      const closeBtn = document.createElement('button');
      closeBtn.type = 'button'; closeBtn.className = 'thai-cal-action'; closeBtn.textContent = 'ปิด';
      closeBtn.addEventListener('click', e => { e.stopPropagation(); popover.hidden = true; });
      foot.append(todayBtn, closeBtn);
      popover.appendChild(foot);
    };

    const openCal = () => {
      selected = parseThai(textInput.value);
      if (selected) viewDate = new Date(selected.getFullYear(), selected.getMonth(), 1);
      renderCal();
      popover.hidden = false;
    };

    textInput.addEventListener('click', e => { e.stopPropagation(); openCal(); });
    textInput.addEventListener('focus', () => { if (popover.hidden) openCal(); });
    document.addEventListener('click', e => { if (!wrap.contains(e.target)) popover.hidden = true; });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') popover.hidden = true; });
  });
  const sidebar = root.querySelector('.sidebar');
  const toggle = root.querySelector('.mobile-toggle');
  const backdrop = root.querySelector('.workspace-backdrop');
  const close = (restore = false) => {
    sidebar.classList.remove('open'); toggle.setAttribute('aria-expanded', 'false'); backdrop.hidden = true;
    if (restore) toggle.focus();
  };
  toggle.addEventListener('click', () => {
    const open = !sidebar.classList.contains('open');
    sidebar.classList.toggle('open', open); toggle.setAttribute('aria-expanded', String(open)); backdrop.hidden = !open;
    if (open) sidebar.querySelector('a')?.focus();
  });
  backdrop.addEventListener('click', () => close(true));
  root.querySelector('.sidebar-close')?.addEventListener('click', () => close(true));
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && sidebar.classList.contains('open')) close(true); });
  window.addEventListener('resize', () => { if (window.matchMedia('(min-width: 801px)').matches) close(); });
  const ceremony = root.querySelector('[data-ceremony-form]');
  if (ceremony) {
    const reasonField = ceremony.querySelector('textarea[name="reason"]');
    const submitBtn = ceremony.querySelector('button[type="submit"]');
    const statusEl = ceremony.querySelector('[data-ceremony-submit-status]');
    const syncReasonGate = () => {
      if (!reasonField || !submitBtn || ceremony.dataset.submitting === 'true') return;
      const hasReason = reasonField.value.trim().length > 0;
      submitBtn.disabled = !hasReason;
      if (statusEl) {
        statusEl.textContent = hasReason ? 'พร้อมเริ่มพิธีจับสลาก' : 'กรุณากรอกเหตุผลในการจับสลากใหม่ก่อนเริ่มพิธีจับสลาก';
      }
    };
    syncReasonGate();
    reasonField?.addEventListener('input', syncReasonGate);
    ceremony.addEventListener('submit', event => {
      if (reasonField && reasonField.value.trim().length === 0) {
        event.preventDefault();
        syncReasonGate();
        reasonField.focus();
        return;
      }
      if (ceremony.dataset.submitting === 'true') {
        event.preventDefault();
        return;
      }
      ceremony.dataset.submitting = 'true';
      if (submitBtn) submitBtn.disabled = true;
      if (statusEl) statusEl.textContent = 'กำลังบันทึกผลจับสลาก';
    });
  }
  window.addEventListener('pageshow', event => {
    if (!event.persisted || !ceremony) return;
    delete ceremony.dataset.submitting;
    ceremony.querySelector('button[type="submit"]').disabled = false;
    ceremony.querySelector('[data-ceremony-submit-status]').textContent = 'พร้อมเริ่มพิธีจับสลาก';
  });
  const reveal = root.querySelector('[data-ceremony-reveal]');
  const confirmDialog = root.querySelector('[data-draw-confirm]');
  if (confirmDialog) {
    const open = root.querySelector('[data-open-draw-confirm]');
    const submit = confirmDialog.querySelector('button[type="submit"]');
    open.addEventListener('click', () => confirmDialog.showModal());
    confirmDialog.querySelector('[data-close-draw-confirm]').addEventListener('click', () => confirmDialog.close());
    confirmDialog.addEventListener('close', () => open.focus());
    confirmDialog.querySelector('form').addEventListener('submit', event => {
      if (submit.disabled) event.preventDefault();
      else submit.disabled = true;
    });
    window.addEventListener('pageshow', event => {
      if (event.persisted) submit.disabled = false;
    });
  }
  if (reveal) {
    const url = new URL(window.location.href);
    url.searchParams.delete('reveal');
    window.history.replaceState(null, '', url);
    const balls = [...reveal.querySelectorAll('[data-ceremony-ball]')];
    const targets = [...reveal.querySelectorAll('[data-ceremony-target]')];
    const waits = [...reveal.querySelectorAll('[data-ceremony-wait]')];
    const machine = reveal.querySelector('[data-ceremony-machine]');
    const status = reveal.querySelector('[data-ceremony-status]');
    const review = reveal.querySelector('[data-ceremony-review]');
    const counter = reveal.querySelector('[data-ceremony-counter]');
    // A1..An are the saved draw slots, never browser-generated selections.
    const ordered = [...balls].sort((a, b) => Number(a.dataset.ceremonyBall.slice(1)) - Number(b.dataset.ceremonyBall.slice(1)));
    const open = (ball, index) => {
      ball.classList.add('consumed');
      const slot = ball.dataset.ceremonyBall;
      targets.filter(target => target.dataset.ceremonyTarget === slot).forEach(target => { target.hidden = false; });
      waits.filter(wait => wait.dataset.ceremonyWait === slot).forEach(wait => { wait.hidden = true; });
      if (counter) counter.textContent = String(index + 1);
      if (status) status.textContent = index + 1 === ordered.length ? 'เปิดทีมครบแล้ว' : `เปิดแล้ว ${index + 1} จาก ${ordered.length} ทีม`;
      if (index + 1 === ordered.length) {
        machine?.classList.remove('running');
        machine?.classList.add('complete');
        if (review) review.hidden = false;
      }
    };
    if (!ordered.length || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      ordered.forEach(open);
      if (review) review.hidden = false;
    } else {
      machine?.classList.add('running');
      ordered.forEach((ball, index) => window.setTimeout(() => open(ball, index), 1200 + 900 * index));
    }
  }

  const scheduleForm = root.querySelector('#schedule-publish-form');
  const scheduleChoices = [...root.querySelectorAll('[data-schedule-select]')];
  const selectAll = root.querySelector('[data-schedule-select-all]');
  const publish = root.querySelector('[data-schedule-publish]');
  const updateScheduleSelection = () => {
    const selected = scheduleChoices.filter(choice => choice.checked).length;
    if (publish) {
      publish.disabled = selected === 0;
      publish.textContent = selected ? `เผยแพร่รายการที่เลือก (${selected})` : 'เผยแพร่รายการที่เลือก';
    }
    if (selectAll) {
      selectAll.checked = scheduleChoices.length > 0 && selected === scheduleChoices.length;
      selectAll.indeterminate = selected > 0 && selected < scheduleChoices.length;
    }
  };
  scheduleChoices.forEach(choice => choice.addEventListener('change', updateScheduleSelection));
  selectAll?.addEventListener('change', () => {
    scheduleChoices.forEach(choice => { choice.checked = selectAll.checked; });
    updateScheduleSelection();
  });
  scheduleForm?.addEventListener('submit', event => {
    if (scheduleForm.dataset.submitting === 'true' || !scheduleChoices.some(choice => choice.checked)) {
      event.preventDefault();
      return;
    }
    if (!window.confirm(`ยืนยันเผยแพร่กำหนดการแข่งขัน ${scheduleChoices.filter(choice => choice.checked).length} คู่ที่เลือกหรือไม่`)) {
      event.preventDefault();
      return;
    }
    scheduleForm.dataset.submitting = 'true';
    if (publish) publish.disabled = true;
  });
  root.querySelectorAll('.schedule-republish').forEach(form => form.addEventListener('submit', event => {
    if (form.dataset.submitting === 'true') { event.preventDefault(); return; }
    if (!window.confirm('ยืนยันเผยแพร่กำหนดการแข่งขันฉบับแก้ไขของคู่นี้หรือไม่')) { event.preventDefault(); return; }
    form.dataset.submitting = 'true';
    form.querySelector('button[type="submit"]').disabled = true;
  }));
  updateScheduleSelection();
  const scopeNames = ['season_id', 'division_code', 'stage', 'province', 'district'];
  const currentUrl = new URL(window.location.href);
  const form = root.querySelector('.workspace-filters');
  const ctxEventId = form?.elements.namedItem('event_id')?.value || currentUrl.searchParams.get('event_id') || '';
  const ctxDataMode = form?.elements.namedItem('data_mode')?.value || currentUrl.searchParams.get('data_mode') || '';
  const storageKey = ctxEventId || ctxDataMode ? `pmyc-workspace-filters:${ctxEventId}:${ctxDataMode}` : '';
  const saveScopeFilters = srcForm => {
    if (!storageKey || !srcForm) return;
    const data = {};
    let hasAny = false;
    for (const name of scopeNames) {
      const val = srcForm.elements.namedItem(name)?.value || '';
      if (val) hasAny = true;
      data[name] = val;
    }
    try {
      if (hasAny) sessionStorage.setItem(storageKey, JSON.stringify(data));
      else sessionStorage.removeItem(storageKey);
    } catch (_) {}
  };
  const clearSavedFilters = () => {
    if (!storageKey) return;
    try { sessionStorage.removeItem(storageKey); } catch (_) {}
  };
  const loadSavedFilters = () => {
    if (!storageKey) return null;
    try {
      const raw = sessionStorage.getItem(storageKey);
      return raw ? JSON.parse(raw) : null;
    } catch (_) { return null; }
  };
  if (form && (currentUrl.searchParams.get('dashboard_filters') === '1' || scopeNames.some(n => currentUrl.searchParams.get(n)))) {
    saveScopeFilters(form);
  }
  const savedFilters = loadSavedFilters();
  if (savedFilters) {
    root.querySelectorAll('a[href*="/phase2demo/workspace/dashboard"], a[href*="/phase2demo/workspace/pending-setup"]').forEach(link => {
      if (link.closest('.page-heading')) return;
      const target = new URL(link.getAttribute('href'), window.location.href);
      const isDash = target.pathname.endsWith('/dashboard');
      const hasScope = scopeNames.some(n => target.searchParams.get(n));
      if (!hasScope) {
        for (const name of scopeNames) {
          if (savedFilters[name]) target.searchParams.set(name, savedFilters[name]);
        }
        if (isDash) target.searchParams.set('dashboard_filters', '1');
        link.setAttribute('href', target.pathname + target.search);
      }
    });
  }
  root.querySelectorAll('.page-heading a.btn[href*="/phase2demo/workspace/pending-setup"]').forEach(btn => {
    btn.addEventListener('click', clearSavedFilters);
  });
  if (!form) return;
  let activeFetch = null;
  const isDashboardPage = () => Boolean(root.querySelector('.workspace-filters input[name="dashboard_filters"]'));
  const validProvince = targetForm => {
    const prov = targetForm?.elements.namedItem('province');
    if (!prov || prov.readOnly) return true;
    if (prov.tagName === 'SELECT') return prov.checkValidity();
    prov.value = prov.value.trim();
    const choices = [...targetForm.querySelectorAll('#workspace-provinces option')].map(x => x.value);
    prov.setCustomValidity(prov.value && !choices.includes(prov.value) ? 'กรุณาเลือกจังหวัดที่มีสิทธิ์จากรายการ' : '');
    return prov.checkValidity();
  };
  const fetchDashboard = async (targetUrl, pushHistory = true) => {
    const curMain = root.querySelector('main');
    if (!curMain || typeof window.fetch !== 'function' || typeof window.DOMParser !== 'function') {
      window.location.assign(targetUrl);
      return;
    }
    if (activeFetch) activeFetch.abort();
    activeFetch = typeof AbortController === 'function' ? new AbortController() : null;
    curMain.setAttribute('aria-busy', 'true');
    curMain.style.opacity = '0.65';
    try {
      const res = await fetch(targetUrl, {
        credentials: 'same-origin',
        headers: { 'X-Requested-With': 'fetch' },
        signal: activeFetch ? activeFetch.signal : undefined
      });
      if (!res.ok || (res.url && !new URL(res.url, window.location.href).pathname.endsWith('/dashboard'))) {
        window.location.assign(targetUrl);
        return;
      }
      const html = await res.text();
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const newMain = doc.querySelector('main');
      if (!newMain) {
        window.location.assign(targetUrl);
        return;
      }
      curMain.innerHTML = newMain.innerHTML;
      const curNav = root.querySelector('.sidebar nav');
      const newNav = doc.querySelector('.sidebar nav');
      if (curNav && newNav) curNav.innerHTML = newNav.innerHTML;
      const curBrand = root.querySelector('.topbar .brand');
      const newBrand = doc.querySelector('.topbar .brand');
      if (curBrand && newBrand && newBrand.hasAttribute('href')) {
        curBrand.setAttribute('href', newBrand.getAttribute('href'));
      }
      if (pushHistory && window.history && typeof window.history.pushState === 'function') {
        window.history.pushState({ dashboardUrl: targetUrl }, '', targetUrl);
      }
      const updatedForm = root.querySelector('.workspace-filters');
      const updatedUrl = new URL(targetUrl, window.location.href);
      if (updatedForm && (updatedUrl.searchParams.get('dashboard_filters') === '1' || scopeNames.some(n => updatedUrl.searchParams.get(n)))) {
        saveScopeFilters(updatedForm);
      }
    } catch (err) {
      if (err && err.name === 'AbortError') return;
      window.location.assign(targetUrl);
    } finally {
      curMain.removeAttribute('aria-busy');
      curMain.style.opacity = '';
    }
  };
  const onClearClick = e => {
    const activeForm = root.querySelector('.workspace-filters');
    if (!activeForm || !activeForm.elements.namedItem('dashboard_filters')) return;
    if (e && typeof e.preventDefault === 'function') e.preventDefault();
    clearSavedFilters();
    const url = new URL(activeForm.action, window.location.href);
    for (const name of ['event_id', 'data_mode']) {
      const value = activeForm.elements.namedItem(name)?.value;
      if (value) url.searchParams.set(name, value);
    }
    fetchDashboard(url.toString(), true);
  };
  const onFormSubmit = (e, activeForm) => {
    const prov = activeForm.elements.namedItem('province');
    if (!validProvince(activeForm)) {
      e.preventDefault();
      prov?.reportValidity();
      return;
    }
    if (activeForm.elements.namedItem('dashboard_filters')) {
      e.preventDefault();
      try { sessionStorage.setItem('pmyc-dashboard-submit', '1'); } catch (_) {}
      const url = new URL(activeForm.action, window.location.href);
      const params = new URLSearchParams();
      for (const [k, v] of new FormData(activeForm).entries()) {
        params.append(k, String(v));
      }
      url.search = params.toString();
      fetchDashboard(url.toString(), true);
    }
  };
  const onFormChange = (e, activeForm) => {
    const name = e.target.name;
    if (!name) return;
    const prov = activeForm.elements.namedItem('province');
    const dist = activeForm.elements.namedItem('district');
    if (!validProvince(activeForm)) {
      prov?.reportValidity();
      return;
    }
    if (['province', 'division_code', 'stage', 'season_id'].includes(name) && dist) dist.value = '';
    if (name === 'division_code' && activeForm.elements.namedItem('data_mode')?.value === 'demo' && prov && !prov.readOnly) prov.value = '';
    if (name === 'season_id') {
      const divEl = activeForm.elements.namedItem('division_code');
      if (divEl) divEl.value = '';
      if (prov && !prov.readOnly) prov.value = '';
    }
    activeForm.requestSubmit();
  };
  if (typeof root.addEventListener === 'function') {
    root.addEventListener('click', e => {
      if (e.target.closest?.('[data-dashboard-clear]')) onClearClick(e);
    });
    root.addEventListener('input', e => {
      if (e.target && e.target.name === 'province' && e.target.closest?.('.workspace-filters')) {
        e.target.setCustomValidity('');
      }
    });
    root.addEventListener('submit', e => {
      const activeForm = e.target.closest?.('.workspace-filters');
      if (activeForm) onFormSubmit(e, activeForm);
    });
    root.addEventListener('change', e => {
      const activeForm = e.target.closest?.('.workspace-filters');
      if (activeForm) onFormChange(e, activeForm);
    });
  } else {
    root.querySelector('[data-dashboard-clear]')?.addEventListener('click', onClearClick);
    form.elements.namedItem('province')?.addEventListener('input', e => e.target.setCustomValidity(''));
    form.addEventListener('submit', e => onFormSubmit(e, form));
    form.addEventListener('change', e => onFormChange(e, form));
  }
  if (typeof window.addEventListener === 'function') {
    window.addEventListener('popstate', () => {
      if (isDashboardPage()) fetchDashboard(window.location.href, false);
    });
  }

})();

/* Issue #7: Interactive 7-Block Dashboard drill-down */
(() => {
  const root = document.querySelector('[data-workspace-v16]');
  if (!root) return;
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const scheduleLabels = { unscheduled: 'รอจัดตาราง', ready: 'พร้อมเผยแพร่', published: 'เผยแพร่แล้ว', cancelled: 'ยกเลิก' };

  const handleBlockClick = event => {
    const btn = event.target.closest('[data-dashboard-block]');
    if (!btn || btn.disabled) return;
    const dash = btn.closest('[data-dashboard-payload]');
    if (!dash) return;
    let payload;
    try { payload = JSON.parse(dash.getAttribute('data-dashboard-payload') || '{}'); } catch { return; }
    const titles = {
      'team:all': 'ทีมทั้งหมดที่อนุมัติในขอบเขต',
      'team:outside': 'ทีมที่ยังไม่อยู่ในผลจับสลาก',
      'team:draw': 'ทีมที่จับสลากแล้วและยังมีสิทธิ์',
      'team:changed': 'ทีมในผลจับสลากที่สิทธิ์เปลี่ยน',
      'schedule:all': 'คู่แข่งขันทั้งหมด (ครบสองทีม)',
      'schedule:unscheduled': payload.pending ? 'ตรวจและยืนยันผลจับสลากก่อนจัดตาราง' : 'คู่รอจัดตาราง',
      'schedule:ready': 'คู่พร้อมเผยแพร่ตาราง',
      'post:awaiting': 'คู่รอบันทึกผลหลังแข่งขัน'
    };
    const view = btn.getAttribute('data-dashboard-block');
    if (!view) return;
    dash.querySelectorAll('[data-dashboard-block]').forEach(el => {
      el.setAttribute('aria-pressed', el.getAttribute('data-dashboard-block') === view ? 'true' : 'false');
    });
    const listTitle = dash.querySelector('#dashboard-list-title');
    const listCount = dash.querySelector('#dashboard-list-count');
    const listBody = dash.querySelector('#dashboard-list-body');
    if (!listTitle || !listCount || !listBody) return;

    const [kind] = view.split(':');
    const rows = (payload.lists && payload.lists[view]) || [];
    listTitle.textContent = titles[view] || '';

    if (kind === 'team' && payload.error) {
      listCount.textContent = '—';
      listBody.innerHTML = '<p class="d-note d-error">โหลดข้อมูลการอนุมัติไม่สำเร็จ จึงยังระบุยอดทีมปัจจุบันไม่ได้</p>';
      return;
    }

    listCount.textContent = `${rows.length} ${kind === 'team' ? 'ทีม' : 'คู่'}`;
    if (!rows.length) {
      listBody.innerHTML = `<p class="muted">${kind === 'team' ? 'ไม่มีทีมในกลุ่มนี้' : 'ไม่มีคู่แข่งขันในสถานะนี้'}</p>`;
      return;
    }

    if (kind === 'team') {
      const targetUrl = (payload.urls && payload.urls.setup) || '#';
      listBody.innerHTML = `<div class="d-tablewrap"><table><thead><tr><th>ทีม</th><th>สถานะในผลจับสลาก</th><th>ดำเนินการ</th></tr></thead><tbody>${rows.map(r => `<tr><td>${esc(r.name)}</td><td>${r.in_draw ? 'อยู่ในผลจับสลาก' : 'ยังไม่อยู่ในผล'}</td><td><a class="btn text compact" href="${esc(targetUrl)}">เปิดหน้าทีม/จับสลาก →</a></td></tr>`).join('')}</tbody></table></div>`;
    } else {
      const nextUrl = view === 'schedule:unscheduled' && payload.pending
        ? ((payload.urls && payload.urls.result) || '#')
        : ((payload.urls && payload.urls.schedule) || '#');
      const nextLabel = view === 'schedule:unscheduled' && payload.pending ? 'ตรวจและยืนยันผลจับสลาก' : (kind === 'post' ? 'บันทึกผลแข่งขัน' : 'จัดการตาราง');
      listBody.innerHTML = `<div class="d-tablewrap"><table><thead><tr><th>คู่</th><th>ทีมแข่งขัน</th><th>สถานะ</th><th>สนาม / เวลา</th><th>ดำเนินการ</th></tr></thead><tbody>${rows.map(r => `<tr><td><strong>${esc(r.number)}</strong><br><small class="muted">รอบ ${esc(r.round)}</small></td><td>${esc(r.home)} – ${esc(r.away)}</td><td>${r.awaiting ? 'รอบันทึกผล' : esc(scheduleLabels[r.status] || r.status)}</td><td>${esc(r.venue)}${r.scheduled_start ? '<br><small class="muted">' + esc(r.scheduled_start) + '</small>' : ''}</td><td><a class="btn text compact" href="${esc(nextUrl)}">${nextLabel} →</a></td></tr>`).join('')}</tbody></table></div>`;
    }
  };
  if (typeof root.addEventListener === 'function') {
    root.addEventListener('click', handleBlockClick);
  } else {
    document.querySelector('[data-dashboard-payload]')?.addEventListener?.('click', handleBlockClick);
  }
})();
