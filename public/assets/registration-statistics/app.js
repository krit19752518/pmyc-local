(async () => {
  'use strict';
  const host = document.querySelector('#view');
  const statusHost = document.querySelector('#statistics-status');
  document.querySelector('#mobile-menu').addEventListener('click', () => {
    const button = document.querySelector('#mobile-menu');
    const open = button.getAttribute('aria-expanded') !== 'true';
    button.setAttribute('aria-expanded', String(open));
    document.querySelector('#navigation').classList.toggle('open', open);
  });

  const ageNames = ['U14', 'U16', 'U18'];
  const format = n => new Intl.NumberFormat('en-US').format(n);
  const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const sum = rows => rows.reduce((a, r) => a.map((n, i) => n + r.ages[i]), [0, 0, 0]);
  const total = ages => ages.reduce((a, b) => a + b, 0);
  const bangkokToday = () => new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);
  const formatAsOf = iso => {
    if (!iso) return '-';
    const d = new Date(iso);
    return Number.isFinite(d.getTime()) ? new Date(d.getTime() + 7 * 3600000).toISOString().replace('T', ' ').slice(0, 19) + ' (GMT+7)' : iso;
  };

  let state, source, provinces, allDistricts, provinceNames, zoneOf, national;
  let allFiltered = [], printMode = false, toastTimer;
  let dateError = '', restrictedNotice = false, loading = false;
  const view = document.querySelector('#view');
  const dialog = document.querySelector('#district-dialog');

  function readState() {
    const p = new URLSearchParams(location.hash.split('?')[1]);
    const province = (provinces || []).find(r => r.name === p.get('province'))?.name || '';
    const preset = ['all', 'today', 'yesterday', 'week', 'month', 'custom'].includes(p.get('preset')) ? p.get('preset') : 'all';
    return {
      tab: p.get('tab') === 'approval' ? 'approval' : 'registration',
      preset,
      from: p.get('from') || '',
      to: p.get('to') || '',
      province,
      zone: province === 'กรุงเทพมหานคร' && (source?.zones || []).some(z => z.name === p.get('zone')) ? p.get('zone') : '',
      level: province || p.get('level') === 'district' ? 'district' : 'province',
      age: ageNames.includes(p.get('age')) ? p.get('age') : 'all',
      status: ['zero', 'registered'].includes(p.get('status')) ? p.get('status') : 'all',
      sort: ['total', 'name'].includes(p.get('sort')) ? p.get('sort') : 'gap',
      q: p.get('q') || '',
      page: Math.max(1, Number.parseInt(p.get('page')) || 1)
    };
  }

  function validateCustomDates(from, to) {
    if (!from || !to) return 'กรุณาระบุวันที่เริ่มต้นและวันที่สิ้นสุด';
    if (from > to) return 'วันที่เริ่มต้นต้องไม่มากกว่าวันที่สิ้นสุด';
    if (from > bangkokToday() || to > bangkokToday()) return 'ไม่สามารถเลือกวันที่ในอนาคตได้';
    return '';
  }

  function buildApiUrl(targetState, overrideBase) {
    if (targetState.tab === 'registration' && (!targetState.preset || targetState.preset === 'all')) {
      return host.dataset.api;
    }
    const baseUrl = overrideBase || (targetState.tab === 'approval' ? (host.dataset.approvalApi || '/api/authorized/age-group-approval-statistics') : host.dataset.api);
    const params = new URLSearchParams();
    params.set('preset', targetState.preset || 'all');
    if (targetState.preset === 'custom') {
      if (targetState.from) params.set('from', targetState.from);
      if (targetState.to) params.set('to', targetState.to);
    }
    params.set('includeTrend', '1');
    return baseUrl + '?' + params.toString();
  }

  async function loadSnapshot(targetState) {
    loading = true;
    if (statusHost) statusHost.textContent = 'กำลังโหลดข้อมูลสถิติ…';
    try {
      let response = await fetch(buildApiUrl(targetState), { credentials: 'same-origin', cache: 'no-store' });
      if ((response.status === 403 || response.redirected) && targetState.tab === 'approval' && host.dataset.adminApprovalApi) {
        response = await fetch(buildApiUrl(targetState, host.dataset.adminApprovalApi), { credentials: 'same-origin', cache: 'no-store' });
      }
      if ((response.status === 403 || response.redirected) && targetState.tab === 'approval') {
        restrictedNotice = true;
        loading = false;
        if (statusHost) statusHost.textContent = '';
        render();
        return true;
      }
      if (!response.ok) {
        let errPayload = null;
        try { errPayload = await response.json(); } catch {}
        if (response.status === 400 && errPayload?.message) {
          dateError = errPayload.message;
          loading = false;
          if (statusHost) statusHost.textContent = '';
          render();
          return false;
        }
        throw new Error('unavailable');
      }
      const nextSource = await response.json();
      if (typeof nextSource.includesCancelled !== 'boolean') throw new Error('invalid statistics definition');
      restrictedNotice = false;
      dateError = '';
      nextSource.asOfIso = nextSource.asOf;
      nextSource.provinces.forEach(p => { p.code = String(p.code); p.districts.forEach(d => d.code = String(d.code)); });
      source = nextSource;
      provinces = source.provinces.map(p => ({ ...p, ages: p.ages, districts: p.districts.map(d => ({ ...d, province: p.name, provinceCode: p.code })) }));
      allDistricts = provinces.flatMap(p => p.districts);
      provinceNames = [...provinces].sort((a, b) => a.name.localeCompare(b.name, 'th'));
      zoneOf = new Map(source.zones.flatMap(z => z.districts.map(d => [d, z.name])));
      national = source.ages;
      loading = false;
      if (statusHost) statusHost.textContent = '';
      return true;
    } catch {
      loading = false;
      if (source) {
        if (statusHost) statusHost.textContent = 'ไม่สามารถอัปเดตข้อมูลล่าสุดได้ กำลังแสดงข้อมูลที่ตรวจสอบผ่านล่าสุด (' + formatAsOf(source.asOfIso) + ')';
        return false;
      }
      throw new Error('unavailable');
    }
  }

  async function route(patch, replace = false) {
    const next = { ...state, ...patch };
    const needFetch = (patch.tab && patch.tab !== state.tab) ||
      (patch.preset && patch.preset !== state.preset) ||
      (patch.from !== undefined && patch.from !== state.from) ||
      (patch.to !== undefined && patch.to !== state.to);

    if (next.preset === 'custom') {
      const err = validateCustomDates(next.from, next.to);
      if (err && (patch.preset === 'custom' || patch.from !== undefined || patch.to !== undefined)) {
        dateError = err;
        state = next;
        render();
        return;
      }
    }
    dateError = '';

    const p = new URLSearchParams();
    for (const key of ['tab', 'preset', 'from', 'to', 'province', 'zone', 'level', 'age', 'status', 'q', 'sort', 'page']) {
      if (next[key] &&
        !(key === 'tab' && next[key] === 'registration') &&
        !(key === 'preset' && next[key] === 'all') &&
        !(key !== 'preset' && key === 'from' && next.preset !== 'custom') &&
        !(key !== 'preset' && key === 'to' && next.preset !== 'custom') &&
        next[key] !== 'all' &&
        !(key === 'sort' && next[key] === 'gap') &&
        !(key === 'level' && next[key] === 'province') &&
        !(key === 'page' && next[key] === 1)) {
        p.set(key, next[key]);
      }
    }
    const hash = '#stats' + (p.size ? '?' + p : '');
    if (needFetch) {
      await loadSnapshot(next);
    }
    if (replace || location.hash === hash) { history.replaceState(null, '', hash); render(); }
    else location.hash = hash;
  }

  function scope() {
    const province = provinces.find(p => p.name === state.province);
    const districts = (province ? province.districts : allDistricts).filter(d => !state.zone || zoneOf.get(d.name) === state.zone);
    return { province, districts, ages: province ? (state.zone ? sum(districts) : province.ages) : national, label: state.zone ? 'กรุงเทพมหานคร · ' + state.zone : state.province || 'ทั้งประเทศ' };
  }

  const isApproval = () => state.tab === 'approval';
  const isPeriodFiltered = () => state.preset !== 'all';
  const value = row => state.age === 'all' ? total(row.ages) : row.ages[ageNames.indexOf(state.age)];
  const isZero = row => value(row) === 0;
  const ageLabel = () => state.age === 'all' ? 'รวม 3 รุ่นอายุ' : state.age;
  const zeroLabel = () => isPeriodFiltered()
    ? (isApproval() ? 'ไม่มีรายการอนุมัติในช่วงนี้' : 'ไม่มีรายการสมัครในช่วงนี้')
    : (state.age === 'all' ? (isApproval() ? 'ยังไม่มีทีมอนุมัติ' : 'ยังไม่มีทีมสมัคร') : (isApproval() ? 'ยังไม่มีทีมอนุมัติ ' : 'ยังไม่มีทีม ') + state.age);
  const activeVerb = () => isApproval() ? 'อนุมัติแล้ว' : 'มีทีมสมัครแล้ว';
  const statusLabel = () => state.status === 'zero' ? zeroLabel() : state.status === 'registered' ? activeVerb() : 'ทุกพื้นที่';
  const coverage = rows => ({ all: rows.length, registered: rows.filter(r => !isZero(r)).length, zero: rows.filter(isZero).length });

  function filteredRows() {
    const ctx = scope();
    return (state.level === 'district' ? ctx.districts : provinces).filter(r => {
      const text = state.level === 'district' ? r.name + ' ' + r.province : r.name;
      return text.includes(state.q.trim()) && (state.status === 'all' || (state.status === 'zero' ? isZero(r) : !isZero(r)));
    }).sort((a, b) => {
      if (state.sort === 'gap' && isZero(a) !== isZero(b)) return isZero(a) ? -1 : 1;
      if (state.sort !== 'name' && value(a) !== value(b)) return value(b) - value(a);
      return (a.province || '').localeCompare(b.province || '', 'th') || a.name.localeCompare(b.name, 'th');
    });
  }

  function renderTabs() {
    return `<div class="report-tabs" role="tablist" aria-label="ประเภทรายงานสถิติ">
      <button role="tab" class="report-tab ${!isApproval() ? 'active' : ''}" aria-selected="${!isApproval()}" data-tab="registration">สถิติการสมัคร</button>
      <button role="tab" class="report-tab ${isApproval() ? 'active' : ''}" aria-selected="${isApproval()}" data-tab="approval">สถิติการอนุมัติ</button>
    </div>`;
  }

  function renderDateBar() {
    const presets = [['all', 'ทั้งหมด'], ['today', 'วันนี้'], ['yesterday', 'เมื่อวาน'], ['week', 'สัปดาห์นี้'], ['month', 'เดือนนี้'], ['custom', 'กำหนดเอง']];
    return `<section class="date-bar" aria-label="ตัวกรองช่วงเวลา">
      <div class="date-presets" role="group" aria-label="เลือกช่วงเวลา">${presets.map(([k, label]) => `<button type="button" class="date-pill ${state.preset === k ? 'active' : ''}" data-preset="${k}" aria-pressed="${state.preset === k}">${label}</button>`).join('')}</div>
      ${state.preset === 'custom' ? `<div class="date-custom"><label>จาก <input type="date" id="date-from" value="${escape(state.from)}" max="${bangkokToday()}"></label><label>ถึง <input type="date" id="date-to" value="${escape(state.to)}" max="${bangkokToday()}"></label><button type="button" class="btn" id="apply-date-range">ตกลง</button></div>` : ''}
      ${dateError ? `<p class="date-error" id="date-error" role="alert">${escape(dateError)}</p>` : ''}
    </section>`;
  }

  function renderTrend() {
    const trend = Array.isArray(source?.trend) ? source.trend : [];
    const maxVal = Math.max(...trend.map(t => t.total), 1);
    const title = isApproval() ? 'แนวโน้มการอนุมัติรายวัน' : 'แนวโน้มการสมัครรายวัน';
    return `<section class="trend-panel" aria-label="${title}">
      <div class="trend-head"><h2>${title}</h2><span class="sub">${trend.length ? `${trend.length} วันที่มีข้อมูล · เวลา Asia/Bangkok` : 'ไม่มีรายการในช่วงเวลาที่เลือก'}</span></div>
      ${trend.length ? `<div class="trend-bars">${trend.slice(-31).map(pt => `<div class="trend-col" title="${escape(pt.date)}: รวม ${pt.total} (U14:${pt.u14}, U16:${pt.u16}, U18:${pt.u18})"><span class="trend-val">${format(pt.total)}</span><div class="trend-bar-wrap"><div class="trend-bar-fill" style="height:${Math.max(4, Math.round(pt.total / maxVal * 100))}%"></div></div><span class="trend-date">${escape(pt.date.slice(5))}</span></div>`).join('')}</div>` : ''}
    </section>`;
  }

  function snapshot() {
    const rangeTxt = source?.dateRange?.from && source?.dateRange?.to ? ` · ${source.dateRange.from} ถึง ${source.dateRange.to}` : '';
    const asOfMeta = (isApproval() || isPeriodFiltered()) && source?.asOfIso ? `<span class="asof-meta">อัปเดต ${escape(formatAsOf(source.asOfIso))}</span>` : '';
    return `<div class="snapshot"><span class="season">ฤดูกาล 2569 / 2570${escape(rangeTxt)}</span>${asOfMeta}</div>`;
  }

  function renderSummary(ctx) {
    const noun = isApproval() ? 'อนุมัติ' : 'สมัคร';
    const cancellationLabel = source.includesCancelled ? 'รวมยกเลิกการสมัครแล้ว' : 'ไม่รวมรุ่นที่ยกเลิกการสมัคร';
    return `<div class="summary">${['all', ...ageNames].map((age, i) => `<button class="summary-card ${state.age === age ? 'active' : ''}" style="--accent:${['var(--gold)', 'var(--blue)', 'var(--teal)', 'var(--purple)'][i]}" data-age="${age}" aria-pressed="${state.age === age}"><span class="label">${i ? 'รุ่นอายุไม่เกิน ' + age.slice(1) + ' ปี' : `ทีม${noun}รวม`}<span aria-hidden="true">${i ? age : '↗'}</span></span><strong class="value">${format(i ? ctx.ages[i - 1] : total(ctx.ages))}<small>ทีม</small></strong><span class="hint">${i ? age + ' · กดเพื่อดูเฉพาะรุ่น' : 'รวม 3 รุ่นอายุ · ' + cancellationLabel}</span></button>`).join('')}</div>`;
  }

  function renderCoverage(ctx) {
    const c = coverage(ctx.districts);
    return `<div class="coverage"><span>${ctx.province ? escape(ctx.label) : 'ครบ ' + provinces.length + ' จังหวัด และ ' + allDistricts.length + ' อำเภอ/เขตทั่วประเทศ'}<br>นับแยกรุ่นอายุ โรงเรียนส่งครบ 3 รุ่น นับ 3 ทีม</span><a href="#methodology">วิธีนับข้อมูล ↓</a></div>
      <section class="coverage-panel" aria-label="ความครอบคลุมพื้นที่">
        <div class="coverage-tile"><span>อำเภอ/เขตทั้งหมด</span><strong>${format(c.all)}<small>พื้นที่</small></strong><p>${escape(ctx.province ? ctx.label : 'ทั่วประเทศ')} · ${ageLabel()}</p></div>
        <button class="coverage-tile registered ${state.status === 'registered' && state.level === 'district' ? 'selected' : ''}" data-coverage="registered"><span>${activeVerb()}</span><strong>${format(c.registered)}<small>พื้นที่</small></strong><p>เปิดดูรายชื่อพื้นที่ →</p></button>
        <button class="coverage-tile zero ${state.status === 'zero' && state.level === 'district' ? 'selected' : ''}" data-coverage="zero"><span><i aria-hidden="true">!</i> ${zeroLabel()}</span><strong>${format(c.zero)}<small>พื้นที่</small></strong><p>เปิดดูพื้นที่ยอด 0 →</p></button>
      </section><p class="coverage-note"><span aria-hidden="true" class="zero-key"></span> แถวพื้นแดงและป้าย “${zeroLabel()}” หมายถึงยอด 0 ตามรุ่นอายุและช่วงเวลาที่เลือก</p>`;
  }

  function renderFilters(ctx) {
    const searchLabel = state.level === 'province' ? 'ค้นหาจังหวัด' : ctx.province ? 'ค้นหาอำเภอ/เขต' : 'ค้นหาจังหวัดหรืออำเภอ/เขต';
    return `<section class="panel filters" aria-label="ตัวกรองข้อมูล"><div class="filter-row ${state.province === 'กรุงเทพมหานคร' ? 'with-zone' : ''}">
      <div class="field"><label for="province-filter">จังหวัด</label><select id="province-filter"><option value="">ทั้งหมดทั่วประเทศ</option>${provinceNames.map(p => `<option ${state.province === p.name ? 'selected' : ''}>${escape(p.name)}</option>`).join('')}</select></div>
      ${state.province === 'กรุงเทพมหานคร' ? `<div class="field"><label for="zone-filter">โซนกรุงเทพมหานคร</label><select id="zone-filter"><option value="">ทั้งหมด 3 โซน</option>${source.zones.map(z => `<option ${state.zone === z.name ? 'selected' : ''}>${escape(z.name)}</option>`).join('')}</select></div>` : ''}
      <div class="field"><label for="area-search">${searchLabel}</label><input id="area-search" type="search" autocomplete="off" placeholder="${state.level === 'province' ? 'เช่น ขอนแก่น' : ctx.province ? 'พิมพ์ชื่ออำเภอ / เขต' : 'เช่น ขอนแก่น หรือ น้ำพอง'}" value="${escape(state.q)}"></div><button class="btn" data-reset>ล้างตัวกรอง</button></div>
      <div class="age-options" role="group" aria-label="เลือกรุ่นอายุ"><span>รุ่นอายุ</span>${['all', ...ageNames].map(age => `<button class="age-pill ${age === state.age ? 'active' : ''}" data-age="${age}" aria-pressed="${age === state.age}">${age === 'all' ? 'ทุกรุ่นอายุ' : age}</button>`).join('')}</div>
      <div class="age-options status-options" role="group" aria-label="สถานะพื้นที่"><span>สถานะพื้นที่</span>${[['all', 'ทุกพื้นที่'], ['zero', zeroLabel()], ['registered', activeVerb()]].map(([key, label]) => `<button class="age-pill ${key === 'zero' ? 'zero-filter' : ''} ${key === state.status ? 'active' : ''}" data-status="${key}" aria-pressed="${key === state.status}">${key === 'zero' ? '<span aria-hidden="true">!</span> ' : ''}${label}</button>`).join('')}</div></section>`;
  }

  function renderZones(ctx) {
    if (state.province !== 'กรุงเทพมหานคร') return '';
    return `<div class="zone-cards" aria-label="จำนวนทีมแต่ละโซน">${source.zones.map(z => {
      const districts = ctx.province.districts.filter(d => zoneOf.get(d.name) === z.name), ages = sum(districts), c = coverage(districts);
      return `<button class="zone-card ${state.zone === z.name ? 'active' : ''}" data-zone="${z.name}" aria-pressed="${state.zone === z.name}"><small>${escape(z.name)} · ${c.all} เขต</small><strong>${format(value({ ages }))}</strong><span>ทีม${state.age === 'all' ? ' · 3 รุ่น' : ' · ' + state.age}</span><em>${zeroLabel()} ${c.zero} เขต</em></button>`;
    }).join('')}</div>`;
  }

  function renderUnassigned(ctx) {
    const unassigned = ctx.province ? ctx.province.unassigned : provinces.reduce((a, p) => a.map((v, i) => v + p.unassigned[i]), [...source.unassigned]);
    return '<section class="unassigned-note" aria-label="ยอดยังไม่ระบุพื้นที่"><strong>ยังไม่ระบุ' + (ctx.province ? 'อำเภอ/เขต' : 'พื้นที่') + ': ' + format(total(unassigned)) + ' ทีม</strong><span> U14 ' + format(unassigned[0]) + ' · U16 ' + format(unassigned[1]) + ' · U18 ' + format(unassigned[2]) + '</span><p>รวมในยอด' + (ctx.province ? 'จังหวัด' : 'ประเทศ') + 'แล้ว แยกจากทะเบียนพื้นที่และผลรวมแถวอำเภอ/เขต ไม่เดาโซน' + (state.zone ? ' · ยอดส่วนนี้ไม่รวมในโซนที่เลือก' : '') + '</p></section>';
  }

  function render() {
    state = readState();
    document.querySelectorAll('[data-nav]').forEach(link => { const active = link.dataset.nav === 'stats'; link.classList.toggle('active', active); if (active) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current'); });
    document.querySelector('#navigation').classList.remove('open');
    document.querySelector('#mobile-menu').setAttribute('aria-expanded', 'false');

    if (restrictedNotice) {
      view.innerHTML = `<section class="hero"><div class="wrap"><div class="breadcrumb"><a href="__HOME__">หน้าแรก</a><span>›</span><span>ข้อมูลสถิติการสมัคร</span></div><div class="hero-row"><div><p class="eyebrow">PMYC FOOTBALL · APPROVAL STATISTICS</p><h1>สถิติการอนุมัติรุ่นอายุ</h1><p class="hero-desc">อนุมัติในช่วงวันที่เลือก (จำกัดสิทธิ์เจ้าหน้าที่ กกท.)</p></div></div></div></section>
      <main id="main" class="wrap main-report">${renderTabs()}<section class="restricted-notice" role="alert"><h3>จำกัดสิทธิ์เฉพาะเจ้าหน้าที่ กกท.</h3><p>รายงานสถิติการอนุมัติรุ่นอายุเปิดให้เข้าชมเฉพาะเจ้าหน้าที่ กกท. ที่เข้าสู่ระบบแล้วเท่านั้น</p><button type="button" class="btn" data-tab="registration">กลับไปแท็บ สถิติการสมัคร</button></section></main>`;
      view.querySelectorAll('a[href="__HOME__"]').forEach(a => a.href = host.dataset.home);
      return;
    }

    const ctx = scope();
    const cancellationLabel = source.includesCancelled ? 'รวมยกเลิกการสมัครแล้ว' : 'ไม่รวมรุ่นที่ยกเลิกการสมัคร';
    const heroTitle = isApproval() ? (isPeriodFiltered() ? 'อนุมัติในช่วงวันที่เลือก' : 'สถิติการอนุมัติรุ่นอายุ') : 'ข้อมูลสถิติการสมัคร';
    document.title = `${ctx.province ? ctx.label + ' · ' : ''}${heroTitle} · PMYC Football`;
    const periodEmptyNotice = isPeriodFiltered() && total(ctx.ages) === 0
      ? `<div class="period-empty-banner" role="status">${isApproval() ? 'ไม่มีรายการอนุมัติในช่วงนี้' : 'ไม่มีรายการสมัครในช่วงนี้'} (ข้อมูลยังแสดงครบทุกพื้นที่ตามทะเบียน)</div>`
      : '';

    view.innerHTML = `<section class="hero"><div class="wrap"><div class="breadcrumb"><a href="__HOME__">หน้าแรก</a><span>›</span>${ctx.province ? '<a href="#stats">ข้อมูลสถิติการสมัคร</a><span>›</span><span>' + escape(ctx.label) + '</span>' : '<span>ข้อมูลสถิติการสมัคร</span>'}</div><div class="hero-row"><div><p class="eyebrow">PMYC FOOTBALL · ${isApproval() ? 'APPROVAL STATISTICS' : 'REGISTRATION STATISTICS'}</p><h1>${ctx.province ? escape(ctx.label) + ' · ' + heroTitle : heroTitle}</h1><p class="hero-desc">${isApproval() ? 'นับรุ่นอายุที่ กกท. จังหวัดอนุมัติในช่วงวันที่เลือก (เวลา Asia/Bangkok)' : 'ดูครบทุกจังหวัดและอำเภอ/เขต พร้อมตัวกรองช่วงเวลาและแนวโน้มรายวัน'}</p></div>${snapshot()}</div></div></section>
      <main id="main" class="wrap main-report">${renderTabs()}${renderDateBar()}${periodEmptyNotice}${renderSummary(ctx)}${renderTrend()}${renderUnassigned(ctx)}${renderCoverage(ctx)}${renderFilters(ctx)}${renderZones(ctx)}
      <div class="level-switch">${!ctx.province ? `<div class="level-tabs" role="group" aria-label="ระดับพื้นที่"><button data-level="province" class="${state.level === 'province' ? 'active' : ''}" aria-pressed="${state.level === 'province'}">รายจังหวัด <span>${provinces.length}</span></button><button data-level="district" class="${state.level === 'district' ? 'active' : ''}" aria-pressed="${state.level === 'district'}">รายอำเภอ/เขต <span>${allDistricts.length}</span></button></div>` : `<span>แสดงครบ ${ctx.districts.length} ${state.province === 'กรุงเทพมหานคร' ? 'เขต' : 'อำเภอ'}ในพื้นที่ที่เลือก</span><button class="btn link" data-national-districts>ดูอำเภอ/เขตทั่วประเทศ →</button>`}</div>
      <div class="results-grid"><section class="panel results-main" aria-labelledby="results-title"><div class="panel-head"><div><h2 id="results-title">${state.level === 'province' ? 'สถิติรายจังหวัด' : ctx.province ? 'สถิติราย' + (state.province === 'กรุงเทพมหานคร' ? 'เขต' : 'อำเภอ') : 'สถิติรายอำเภอ/เขตทั่วประเทศ'}</h2><p class="sub">${state.level === 'province' ? 'ดูยอดทีมและจำนวนอำเภอ/เขตในแต่ละจังหวัด' : 'แสดงทุกพื้นที่ รวมแถวที่มียอด 0'}</p></div><div class="toolbar"><button class="btn" id="reload-statistics">โหลดข้อมูลใหม่</button><button class="btn" id="export-csv"><span aria-hidden="true">↓</span> ดาวน์โหลด CSV</button><button class="btn" id="print-report"><span aria-hidden="true">▤</span> พิมพ์</button></div></div><div class="table-controls"><span id="result-count" role="status"></span><label>เรียงตาม <select id="sort-filter"><option value="gap" ${state.sort === 'gap' ? 'selected' : ''}>พื้นที่ยอด 0 ก่อน</option><option value="total" ${state.sort === 'total' ? 'selected' : ''}>จำนวนทีม มาก → น้อย</option><option value="name" ${state.sort === 'name' ? 'selected' : ''}>ชื่อพื้นที่ ก → ฮ</option></select></label></div><div id="table-content"></div></section><aside class="panel side" id="side-content"></aside></div>
      <details class="panel method" id="methodology"><summary>ที่มาข้อมูลและเกณฑ์การนับ</summary><ul>
      <li>${isApproval() ? 'นับรุ่นอายุที่ กกท. จังหวัดเปลี่ยนสถานะเป็น “อนุมัติ” ในช่วงวันที่เลือก (ล่าสุดของรุ่นนั้น)' : 'นับสิทธิ์การสมัครแยกรุ่น U14, U16 และ U18 ตามวันที่สร้างสิทธิ์สมัครรุ่นอายุในช่วงวันที่เลือก'} ${cancellationLabel}</li>
      <li>ใช้รายชื่อพื้นที่ครบ ${provinces.length} จังหวัด และ ${allDistricts.length} อำเภอ/เขตจาก <a href="${source.registry.url}" target="_blank" rel="noopener">Thailand Geography JSON (MIT) ↗</a> จับคู่ด้วยทะเบียนรหัสพื้นที่</li>
      <li>${source.legacyMissingTimestampCount ? `หมายเหตุ: มีข้อมูลอนุมัติเก่า ${format(source.legacyMissingTimestampCount)} รายการที่ไม่มี timestamp ใน audit log (รวมในยอดทั้งหมด แต่ไม่รวมเมื่อกรองช่วงวันที่)` : 'เวลาอ้างอิง Asia/Bangkok · แสดงเฉพาะยอดรวมระดับพื้นที่ ไม่เปิดเผยข้อมูลทีม/นักกีฬา'}</li>
      </ul></details><p class="print-only"></p></main>`;
    view.querySelectorAll('a[href="__HOME__"]').forEach(a => a.href = host.dataset.home);
    renderResults();
  }

  function rowMarkup(row, index) {
    const district = state.level === 'district', zero = isZero(row), indices = state.age === 'all' ? [0, 1, 2] : [ageNames.indexOf(state.age)];
    const action = district ? 'district' : 'province', key = district ? row.code : row.name;
    const c = district ? null : coverage(row.districts);
    return `<tr class="${zero ? 'zero-row' : ''}"><td>${index + 1}</td><td class="area"><button class="area-link" data-${action}="${escape(key)}">${escape(row.name)}</button>${district ? `<small class="area-meta">${escape(row.province)}${row.provinceCode === '10' ? ' · ' + escape(zoneOf.get(row.name)) : ''}</small>` : ''}</td>
      ${!district ? `<td class="district-coverage"><b>${c.registered}<span> / ${c.all}</span></b>${c.zero ? `<small class="gap-count">${zeroLabel()} ${c.zero} พื้นที่</small>` : '<small class="covered-all">ครบทุกพื้นที่</small>'}</td>` : ''}
      ${indices.map(i => `<td class="col-age${i} ${row.ages[i] === 0 ? 'zero-number' : ''} ${indices.length === 1 ? 'total' : ''}">${format(row.ages[i])}</td>`).join('')}
      ${indices.length === 3 ? `<td class="total ${zero ? 'zero-number' : ''}">${format(value(row))}</td>` : ''}
      <td class="area-status"><span class="status-badge ${zero ? 'zero' : 'registered'}">${zero ? '<b aria-hidden="true">!</b> ' : ''}${zero ? zeroLabel() : activeVerb()}</span></td>
      <td class="action"><button class="row-action" data-${action}="${escape(key)}">${district ? 'ดูสรุป' : 'ดูอำเภอ/เขต'} <span aria-hidden="true">→</span></button></td></tr>`;
  }

  function renderResults() {
    const ctx = scope(), district = state.level === 'district';
    allFiltered = filteredRows();
    const pages = Math.max(1, Math.ceil(allFiltered.length / 10)); state.page = Math.min(state.page, pages);
    const start = printMode ? 0 : (state.page - 1) * 10, rows = printMode ? allFiltered : allFiltered.slice(start, start + 10);
    const indices = state.age === 'all' ? [0, 1, 2] : [ageNames.indexOf(state.age)];
    const unit = district ? 'อำเภอ/เขต' : 'จังหวัด';
    const cancellationLabel = source.includesCancelled ? 'รวมยกเลิกการสมัครแล้ว' : 'ไม่รวมรุ่นที่ยกเลิกการสมัคร';
    const rangeTxt = source?.dateRange?.from && source?.dateRange?.to ? `${source.dateRange.from} ถึง ${source.dateRange.to}` : 'ทั้งหมด';
    document.querySelector('#result-count').textContent = `${format(allFiltered.length)} ${unit} · ${ageLabel()} · ${statusLabel()}`;
    document.querySelector('.print-only').textContent = `${isApproval() ? 'สถิติการอนุมัติ' : 'สถิติการสมัคร'} · ช่วง: ${rangeTxt} · พื้นที่: ${ctx.label} · ระดับ: ${unit} · รุ่น: ${ageLabel()} · ${statusLabel()}${state.q ? ' · ค้นหา: ' + state.q : ''} · ${cancellationLabel}`;
    let html;
    if (!allFiltered.length) {
      html = `<div class="empty"><h3>ไม่พบพื้นที่ที่ตรงกับตัวกรอง</h3><p>ลองเปลี่ยนคำค้น รุ่นอายุ ช่วงเวลา หรือสถานะพื้นที่</p><button class="btn" data-clear-search>ล้างคำค้นและสถานะพื้นที่</button></div>`;
    } else {
      const summed = sum(allFiltered);
      html = `<div class="table-wrap" tabindex="0" role="region" aria-label="ตารางจำนวนทีม"><table class="${indices.length === 1 ? 'single-age' : ''} ${district ? 'district-table' : 'province-table'}"><thead><tr><th scope="col">ลำดับ</th><th scope="col">${district ? 'อำเภอ/เขต' : 'จังหวัด'}</th>${!district ? '<th scope="col">อำเภอ/เขต<br>มีรายการ / ทั้งหมด</th>' : ''}${indices.map(i => `<th scope="col" class="col-age${i}">${ageNames[i]}<br>(ทีม)</th>`).join('')}${indices.length === 3 ? '<th scope="col">รวม<br>(ทีม)</th>' : ''}<th scope="col" class="area-status">สถานะพื้นที่</th><th class="action" scope="col"><span class="sr-only">รายละเอียด</span></th></tr></thead><tbody>${rows.map((r, i) => rowMarkup(r, start + i)).join('')}</tbody><tfoot><tr><td colspan="${district ? 2 : 3}">รวมตามตัวกรอง (${format(allFiltered.length)} พื้นที่)</td>${indices.map(i => `<td class="col-age${i}">${format(summed[i])}</td>`).join('')}${indices.length === 3 ? `<td class="total">${format(allFiltered.reduce((n, r) => n + value(r), 0))}</td>` : ''}<td></td><td></td></tr></tfoot></table></div><div class="pagination"><span>แสดง ${format(start + 1)}–${format(start + rows.length)} จาก ${format(allFiltered.length)} พื้นที่</span><div class="pages" aria-label="เปลี่ยนหน้าตาราง"><button data-page="${state.page - 1}" ${state.page === 1 ? 'disabled' : ''}>‹</button>${Array.from({ length: pages }, (_, i) => i + 1).filter(n => n === 1 || n === pages || Math.abs(n - state.page) < 2).map((n, i, ns) => `${i && n - ns[i - 1] > 1 ? '<span aria-hidden="true">…</span>' : ''}<button data-page="${n}" class="${n === state.page ? 'current' : ''}">${n}</button>`).join('')}<button data-page="${state.page + 1}" ${state.page === pages ? 'disabled' : ''}>›</button></div></div>`;
    }
    document.querySelector('#table-content').innerHTML = html;
    const ranking = [...provinces].map(p => ({ ...p, gaps: coverage(p.districts).zero })).filter(p => p.gaps > 0).sort((a, b) => b.gaps - a.gaps || a.name.localeCompare(b.name, 'th')).slice(0, 5);
    const max = Math.max(...ranking.map(p => p.gaps), 1);
    document.querySelector('#side-content').innerHTML = ctx.province
      ? `<h3>อ่านแถวไฮไลต์อย่างไร</h3><p class="sub">${ageLabel()}</p><span class="status-badge zero"><b aria-hidden="true">!</b> ${zeroLabel()}</span><p class="side-explanation">พื้นที่นี้มีรายชื่ออยู่ในทะเบียนอำเภอ/เขต แต่ยอดเป็น 0 ในช่วงเวลาและรุ่นอายุที่เลือก</p><div class="side-bottom">${cancellationLabel}</div>`
      : `<h3>จังหวัดที่มียอด 0 รายอำเภอ/เขต</h3><p class="sub">นับจำนวนอำเภอ/เขต · ${ageLabel()}</p>${ranking.map(p => `<button class="rank" data-province-gap="${escape(p.name)}"><span class="rank-line"><span>${escape(p.name)}</span><b class="gap-count">${p.gaps} พื้นที่</b></span><div class="bar-track"><span style="width:${p.gaps / max * 100}%;background:var(--danger)"></span></div></button>`).join('')}<div class="side-bottom">${cancellationLabel}</div>`;
  }

  function showDistrict(code) {
    const row = allDistricts.find(r => r.code === code); if (!row) return;
    const zero = total(row.ages) === 0;
    const cancellationLabel = source.includesCancelled ? 'รวมยกเลิกการสมัครแล้ว' : 'ไม่รวมรุ่นที่ยกเลิกการสมัคร';
    dialog.innerHTML = `<div class="dialog-top"><button class="close-dialog" aria-label="ปิดสรุปอำเภอ/เขต">×</button><p>${escape(row.province)}${row.provinceCode === '10' ? ' · ' + escape(zoneOf.get(row.name)) : ''}</p><h2 id="district-title">${row.provinceCode === '10' ? 'เขต' : 'อำเภอ'}${escape(row.name)}</h2></div><div class="dialog-body">${zero ? `<div class="district-zero-notice"><strong>! ${zeroLabel()}</strong><span>ยอดเป็น 0 ทั้ง 3 รุ่นอายุในช่วงเวลาที่เลือก</span></div>` : ''}<p class="sub">รวมทุกช่วงอายุ (${isApproval() ? 'อนุมัติ' : 'สมัคร'})</p><div class="district-total ${zero ? 'gap-count' : ''}">${format(total(row.ages))}<small>ทีม</small></div><div class="age-breakdown">${row.ages.map((n, i) => `<div class="${n === 0 ? 'zero-age' : ''}"><span>${ageNames[i]}</span><strong class="col-age${i}">${format(n)}</strong><span>${n === 0 ? 'ยังไม่มีทีม' : 'ทีม'}</span></div>`).join('')}</div><p class="dialog-note">${cancellationLabel} · นับแยกรุ่นอายุ</p></div>`;
    dialog.showModal();
  }

  function exportCsv() {
    const ctx = scope(), district = state.level === 'district';
    const indices = state.age === 'all' ? [0, 1, 2] : [ageNames.indexOf(state.age)];
    const cancellationLabel = source.includesCancelled ? 'รวมยกเลิกการสมัครแล้ว' : 'ไม่รวมรุ่นที่ยกเลิกการสมัคร';
    const rangeTxt = source?.dateRange?.from && source?.dateRange?.to ? ` · ${source.dateRange.from}..${source.dateRange.to}` : '';
    const ruleText = isApproval() ? `สถิติการอนุมัติ ${cancellationLabel}${rangeTxt}` : `นับแยกรุ่นอายุ ${cancellationLabel}${rangeTxt}`;
    const metadata = [ctx.label, source.asOfIso, source.snapshotId, source.registryVersion, source.definitionVersion, ruleText];
    const header = ['รหัสจังหวัด', 'จังหวัด', ...(district ? ['รหัสอำเภอ/เขต', 'อำเภอ/เขต'] : ['อำเภอ/เขตทั้งหมด', 'อำเภอ/เขตมีทีมสมัคร', 'อำเภอ/เขตยังไม่มีทีมสมัคร']), ...indices.map(i => ageNames[i]), 'รวม (ทีม)', 'สถานะพื้นที่ตามรุ่นที่เลือก', 'ขอบเขตรายงาน', 'ข้อมูล ณ', 'snapshotId', 'registryVersion', 'definitionVersion', 'เกณฑ์'];
    const rows = allFiltered.map(r => {
      const c = district ? null : coverage(r.districts);
      return [district ? r.provinceCode : r.code, district ? r.province : r.name, ...(district ? [r.code, r.name] : [c.all, c.registered, c.zero]), ...indices.map(i => r.ages[i]), value(r), isZero(r) ? zeroLabel() : 'มีทีมสมัครแล้ว', ...metadata];
    });
    const summed = sum(allFiltered);
    const unassigned = state.zone ? [0, 0, 0] : ctx.province ? ctx.province.unassigned : provinces.reduce((a, p) => a.map((v, i) => v + p.unassigned[i]), [...source.unassigned]);
    rows.push(['', 'รวมตามตัวกรอง', ...(district ? ['', ''] : ['', '', '']), ...indices.map(i => summed[i]), value({ ages: summed }), '', ...metadata]);
    rows.push(['', 'ยังไม่ระบุพื้นที่ในขอบเขต (รวมในยอดประเทศแล้ว; ไม่ใช่แถวพื้นที่ตามตัวกรอง)', ...(district ? ['', ''] : ['', '', '']), ...indices.map(i => unassigned[i]), value({ ages: unassigned }), 'ยังไม่ระบุพื้นที่', ...metadata]);
    const quote = v => '"' + String(v).replace(/"/g, '""') + '"';
    const csv = '\ufeff' + [header, ...rows].map(row => row.map(quote).join(',')).join('\r\n');
    const toast = document.querySelector('.toast');
    try {
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
      const link = document.createElement('a'); link.href = url; link.download = `PMYC-${state.tab}-${source.snapshotId.slice(0, 12)}.csv`; document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
      toast.textContent = 'ดาวน์โหลด CSV ทุกแถวตามตัวกรองแล้ว';
    } catch { toast.textContent = 'ดาวน์โหลดไม่สำเร็จ กรุณาลองอีกครั้ง'; }
    toast.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.classList.remove('show'), 4000);
  }

  document.addEventListener('click', event => {
    if (event.target.closest('a[href="#methodology"]')) { event.preventDefault(); const details = document.querySelector('#methodology'); details.open = true; details.scrollIntoView({ block: 'start', behavior: 'smooth' }); return; }
    if (event.target.closest('a[href="#main"]')) { event.preventDefault(); const main = document.querySelector('#main'); main.setAttribute('tabindex', '-1'); main.focus(); main.scrollIntoView(); return; }
    const button = event.target.closest('button'); if (!button) return;
    if (button.dataset.tab) { route({ tab: button.dataset.tab, page: 1 }); return; }
    if (button.dataset.preset) {
      if (button.dataset.preset === 'custom') {
        const today = bangkokToday();
        route({ preset: 'custom', from: state.from || today, to: state.to || today, page: 1 });
      } else {
        route({ preset: button.dataset.preset, page: 1 });
      }
      return;
    }
    if (button.id === 'apply-date-range') {
      const f = document.querySelector('#date-from')?.value || '';
      const t = document.querySelector('#date-to')?.value || '';
      route({ preset: 'custom', from: f, to: t, page: 1 });
      return;
    }
    if (button.dataset.age) route({ age: button.dataset.age, page: 1 });
    if (button.dataset.level) route({ level: button.dataset.level, q: '', page: 1 });
    if (button.dataset.status) route({ status: button.dataset.status, page: 1 });
    if (button.dataset.coverage) route({ level: 'district', status: button.dataset.coverage, q: '', page: 1 });
    if (button.hasAttribute('data-national-districts')) route({ province: '', zone: '', level: 'district', q: '', page: 1 });
    if (button.hasAttribute('data-province')) route({ province: button.dataset.province, zone: '', level: 'district', q: '', page: 1 });
    if (button.hasAttribute('data-province-gap')) route({ province: button.dataset.provinceGap, zone: '', level: 'district', status: 'zero', q: '', page: 1 });
    if (button.hasAttribute('data-zone')) route({ zone: state.zone === button.dataset.zone ? '' : button.dataset.zone, q: '', page: 1 });
    if (button.hasAttribute('data-district')) showDistrict(button.dataset.district);
    if (button.dataset.page) { route({ page: Number(button.dataset.page) }, true); document.querySelector('#results-title').scrollIntoView({ block: 'start' }); }
    if (button.hasAttribute('data-reset')) route({ preset: 'all', from: '', to: '', province: '', zone: '', level: 'province', age: 'all', status: 'all', q: '', sort: 'gap', page: 1 });
    if (button.hasAttribute('data-clear-search')) route({ q: '', status: 'all', page: 1 });
    if (button.classList.contains('close-dialog')) dialog.close();
    if (button.id === 'reload-statistics') location.reload();
    if (button.id === 'export-csv') exportCsv();
    if (button.id === 'print-report') setTimeout(() => window.print(), 0);
  });

  document.addEventListener('change', event => {
    if (event.target.id === 'province-filter') route({ province: event.target.value, zone: '', level: event.target.value ? 'district' : state.level, q: '', page: 1 });
    if (event.target.id === 'zone-filter') route({ zone: event.target.value, q: '', page: 1 });
    if (event.target.id === 'sort-filter') route({ sort: event.target.value, page: 1 }, true);
  });

  document.addEventListener('input', event => {
    if (event.target.id === 'area-search') { state.q = event.target.value; state.page = 1; renderResults(); }
  });

  dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
  window.addEventListener('hashchange', async () => {
    if (location.hash === '#home' || location.hash.startsWith('#stats')) {
      const next = readState();
      if (!state || next.tab !== state.tab || next.preset !== state.preset || next.from !== state.from || next.to !== state.to) {
        await loadSnapshot(next);
      }
      render();
      window.scrollTo(0, 0);
    }
  });
  window.addEventListener('beforeprint', () => { if (location.hash !== '#home') { printMode = true; renderResults(); } });
  window.addEventListener('afterprint', () => { if (printMode) { printMode = false; renderResults(); } });

  try {
    state = readState();
    await loadSnapshot(state);
    render();
  } catch {
    host.innerHTML = '<main id="main" class="wrap unavailable"><h1>ข้อมูลสถิติการสมัคร</h1><p role="alert">ยังไม่สามารถแสดงข้อมูลที่ตรวจสอบผ่านได้ กรุณาลองใหม่ภายหลัง</p><button type="button" id="retry-statistics" class="btn">ลองอีกครั้ง</button></main>';
    document.querySelector('#retry-statistics').addEventListener('click', () => location.reload());
  }
})();
