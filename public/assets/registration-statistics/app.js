(async () => {
  'use strict';
  const host = document.querySelector('#view');
  // Keep navigation usable even when no snapshot can be loaded.
  document.querySelector('#mobile-menu').addEventListener('click',()=>{
    const button=document.querySelector('#mobile-menu');
    const open=button.getAttribute('aria-expanded')!=='true';
    button.setAttribute('aria-expanded',String(open));
    document.querySelector('#navigation').classList.toggle('open',open);
  });
  try {
  const response = await fetch(host.dataset.api, {credentials:'same-origin',cache:'no-store'});
  if (!response.ok) throw new Error('unavailable');
  const source = await response.json();
  if (typeof source.includesCancelled !== 'boolean') throw new Error('invalid statistics definition');
  const cancellationLabel = source.includesCancelled ? 'รวมยกเลิกการสมัครแล้ว' : 'ไม่รวมรุ่นที่ยกเลิกการสมัคร';
  source.asOfIso = source.asOf;
  source.provinces.forEach(p => { p.code=String(p.code); p.districts.forEach(d => d.code=String(d.code)); });
  const ageNames = ['U14', 'U16', 'U18'];
  const format = n => new Intl.NumberFormat('en-US').format(n);
  const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const sum = rows => rows.reduce((a,r) => a.map((n,i) => n+r.ages[i]), [0,0,0]);
  const total = ages => ages.reduce((a,b) => a+b,0);
  const provinces = source.provinces.map(p => ({...p, ages:p.ages, districts:p.districts.map(d => ({...d, province:p.name, provinceCode:p.code}))}));
  const allDistricts = provinces.flatMap(p => p.districts);
  const provinceNames = [...provinces].sort((a,b) => a.name.localeCompare(b.name,'th'));
  const zoneOf = new Map(source.zones.flatMap(z => z.districts.map(d => [d,z.name])));
  const national = source.ages;
  const view = document.querySelector('#view');
  const dialog = document.querySelector('#district-dialog');
  let state, allFiltered = [], printMode = false, toastTimer;

  function readState() {
    const p = new URLSearchParams(location.hash.split('?')[1]);
    const province = provinces.find(r => r.name===p.get('province'))?.name || '';
    return {
      province,
      zone:province==='กรุงเทพมหานคร' && source.zones.some(z => z.name===p.get('zone')) ? p.get('zone') : '',
      level:province || p.get('level')==='district' ? 'district' : 'province',
      age:ageNames.includes(p.get('age')) ? p.get('age') : 'all',
      status:['zero','registered'].includes(p.get('status')) ? p.get('status') : 'all',
      sort:['total','name'].includes(p.get('sort')) ? p.get('sort') : 'gap',
      q:p.get('q') || '', page:Math.max(1,Number.parseInt(p.get('page')) || 1)
    };
  }
  function route(patch, replace=false) {
    const next = {...state,...patch};
    const p = new URLSearchParams();
    for (const key of ['province','zone','level','age','status','q','sort','page']) {
      if (next[key] && next[key]!=='all' && !(key==='sort' && next[key]==='gap') && !(key==='level' && next[key]==='province') && !(key==='page' && next[key]===1)) p.set(key,next[key]);
    }
    const hash='#stats'+(p.size?'?'+p:'');
    if(replace || location.hash===hash) {history.replaceState(null,'',hash);render();}
    else location.hash=hash;
  }
  function scope() {
    const province=provinces.find(p => p.name===state.province);
    const districts=(province?province.districts:allDistricts).filter(d => !state.zone || zoneOf.get(d.name)===state.zone);
    return {province,districts,ages:province?(state.zone?sum(districts):province.ages):national,label:state.zone?'กรุงเทพมหานคร · '+state.zone:state.province || 'ทั้งประเทศ'};
  }
  const value = row => state.age==='all' ? total(row.ages) : row.ages[ageNames.indexOf(state.age)];
  const isZero = row => value(row)===0;
  const ageLabel = () => state.age==='all'?'รวม 3 รุ่นอายุ':state.age;
  const zeroLabel = () => state.age==='all'?'ยังไม่มีทีมสมัคร':'ยังไม่มีทีม '+state.age;
  const statusLabel = () => state.status==='zero'?zeroLabel():state.status==='registered'?'มีทีมสมัครแล้ว':'ทุกพื้นที่';
  const coverage = rows => ({all:rows.length, registered:rows.filter(r => !isZero(r)).length, zero:rows.filter(isZero).length});
  function filteredRows() {
    const ctx=scope();
    return (state.level==='district'?ctx.districts:provinces).filter(r => {
      const text=state.level==='district'?r.name+' '+r.province:r.name;
      return text.includes(state.q.trim()) && (state.status==='all' || (state.status==='zero'?isZero(r):!isZero(r)));
    }).sort((a,b) => {
      if(state.sort==='gap' && isZero(a)!==isZero(b)) return isZero(a)?-1:1;
      if(state.sort!=='name' && value(a)!==value(b)) return value(b)-value(a);
      return (a.province||'').localeCompare(b.province||'','th') || a.name.localeCompare(b.name,'th');
    });
  }
  function snapshot() {
    return `<div class="snapshot"><span class="season">ฤดูกาล 2569 / 2570</span></div>`;
  }
  function renderSummary(ctx) {
    return `<div class="summary">${['all',...ageNames].map((age,i) => `<button class="summary-card ${state.age===age?'active':''}" style="--accent:${['var(--gold)','var(--blue)','var(--teal)','var(--purple)'][i]}" data-age="${age}" aria-pressed="${state.age===age}"><span class="label">${i?'รุ่นอายุไม่เกิน '+age.slice(1)+' ปี':'ทีมสมัครรวม'}<span aria-hidden="true">${i?age:'↗'}</span></span><strong class="value">${format(i?ctx.ages[i-1]:total(ctx.ages))}<small>ทีม</small></strong><span class="hint">${i?age+' · กดเพื่อดูเฉพาะรุ่น':'รวม 3 รุ่นอายุ · '+cancellationLabel}</span></button>`).join('')}</div>`;
  }
  function renderCoverage(ctx) {
    const c=coverage(ctx.districts);
    return `<div class="coverage"><span>${ctx.province?escape(ctx.label):'ครบ '+provinces.length+' จังหวัด และ '+allDistricts.length+' อำเภอ/เขตทั่วประเทศ'}<br>นับแยกรุ่นอายุ โรงเรียนส่งครบ 3 รุ่น นับ 3 ทีม</span><a href="#methodology">วิธีนับข้อมูล ↓</a></div>
      <section class="coverage-panel" aria-label="ความครอบคลุมการสมัคร">
        <div class="coverage-tile"><span>อำเภอ/เขตทั้งหมด</span><strong>${format(c.all)}<small>พื้นที่</small></strong><p>${escape(ctx.province?ctx.label:'ทั่วประเทศ')} · ${ageLabel()}</p></div>
        <button class="coverage-tile registered ${state.status==='registered'&&state.level==='district'?'selected':''}" data-coverage="registered" aria-label="ดูอำเภอ/เขตที่มีทีมสมัครแล้ว ${c.registered} พื้นที่"><span>มีทีมสมัครแล้ว</span><strong>${format(c.registered)}<small>พื้นที่</small></strong><p>เปิดดูรายชื่อพื้นที่ →</p></button>
        <button class="coverage-tile zero ${state.status==='zero'&&state.level==='district'?'selected':''}" data-coverage="zero" aria-label="ดูอำเภอ/เขตที่ยังไม่มีทีมสมัคร ${c.zero} พื้นที่"><span><i aria-hidden="true">!</i> ${zeroLabel()}</span><strong>${format(c.zero)}<small>พื้นที่</small></strong><p>เปิดดูพื้นที่ที่ยังไม่มีทีม →</p></button>
      </section><p class="coverage-note"><span aria-hidden="true" class="zero-key"></span> แถวพื้นแดงและป้าย “${zeroLabel()}” หมายถึงยอด 0 ตามรุ่นอายุที่เลือก</p>`;
  }
  function renderFilters(ctx) {
    const searchLabel=state.level==='province'?'ค้นหาจังหวัด':ctx.province?'ค้นหาอำเภอ/เขต':'ค้นหาจังหวัดหรืออำเภอ/เขต';
    return `<section class="panel filters" aria-label="ตัวกรองข้อมูล"><div class="filter-row ${state.province==='กรุงเทพมหานคร'?'with-zone':''}">
      <div class="field"><label for="province-filter">จังหวัด</label><select id="province-filter"><option value="">ทั้งหมดทั่วประเทศ</option>${provinceNames.map(p => `<option ${state.province===p.name?'selected':''}>${escape(p.name)}</option>`).join('')}</select></div>
      ${state.province==='กรุงเทพมหานคร'?`<div class="field"><label for="zone-filter">โซนกรุงเทพมหานคร</label><select id="zone-filter"><option value="">ทั้งหมด 3 โซน</option>${source.zones.map(z => `<option ${state.zone===z.name?'selected':''}>${escape(z.name)}</option>`).join('')}</select></div>`:''}
      <div class="field"><label for="area-search">${searchLabel}</label><input id="area-search" type="search" autocomplete="off" placeholder="${state.level==='province'?'เช่น ขอนแก่น':ctx.province?'พิมพ์ชื่ออำเภอ / เขต':'เช่น ขอนแก่น หรือ น้ำพอง'}" value="${escape(state.q)}"></div><button class="btn" data-reset>ล้างตัวกรอง</button></div>
      <div class="age-options" role="group" aria-label="เลือกรุ่นอายุ"><span>รุ่นอายุ</span>${['all',...ageNames].map(age => `<button class="age-pill ${age===state.age?'active':''}" data-age="${age}" aria-pressed="${age===state.age}">${age==='all'?'ทุกรุ่นอายุ':age}</button>`).join('')}</div>
      <div class="age-options status-options" role="group" aria-label="สถานะพื้นที่"><span>สถานะพื้นที่</span>${[['all','ทุกพื้นที่'],['zero',zeroLabel()],['registered','มีทีมสมัครแล้ว']].map(([key,label]) => `<button class="age-pill ${key==='zero'?'zero-filter':''} ${key===state.status?'active':''}" data-status="${key}" aria-pressed="${key===state.status}">${key==='zero'?'<span aria-hidden="true">!</span> ':''}${label}</button>`).join('')}</div></section>`;
  }
  function renderZones(ctx) {
    if(state.province!=='กรุงเทพมหานคร') return '';
    return `<div class="zone-cards" aria-label="จำนวนทีมแต่ละโซน">${source.zones.map(z => {
      const districts=ctx.province.districts.filter(d => zoneOf.get(d.name)===z.name), ages=sum(districts), c=coverage(districts);
      return `<button class="zone-card ${state.zone===z.name?'active':''}" data-zone="${z.name}" aria-pressed="${state.zone===z.name}"><small>${escape(z.name)} · ${c.all} เขต</small><strong>${format(value({ages}))}</strong><span>ทีม${state.age==='all'?' · 3 รุ่น':' · '+state.age}</span><em>${zeroLabel()} ${c.zero} เขต</em></button>`;
    }).join('')}</div>`;
  }
  function render() {
    state=readState();
    const home=false;
    document.querySelectorAll('[data-nav]').forEach(link => {const active=link.dataset.nav===(home?'home':'stats');link.classList.toggle('active',active);if(active)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');});
    document.querySelector('#navigation').classList.remove('open');
    document.querySelector('#mobile-menu').setAttribute('aria-expanded','false');

    const ctx=scope();
    document.title=`${ctx.province?ctx.label+' · ':''}ข้อมูลสถิติการสมัคร · PMYC Football`;
    view.innerHTML=`<section class="hero"><div class="wrap"><div class="breadcrumb"><a href="__HOME__">หน้าแรก</a><span>›</span>${ctx.province?'<a href="#stats">ข้อมูลสถิติการสมัคร</a><span>›</span><span>'+escape(ctx.label)+'</span>':'<span>ข้อมูลสถิติการสมัคร</span>'}</div><div class="hero-row"><div><p class="eyebrow">PMYC FOOTBALL · REGISTRATION STATISTICS</p><h1>${ctx.province?escape(ctx.label):'ข้อมูลสถิติการสมัคร'}</h1><p class="hero-desc">${ctx.province?'ดูครบทุกอำเภอ/เขต พร้อมพื้นที่ที่ยังไม่มีทีมสมัคร':'ดูครบทุกจังหวัดและอำเภอ/เขต พร้อมพื้นที่ที่ยังไม่มีทีมสมัคร'}</p></div>${snapshot()}</div></div></section>
      <main id="main" class="wrap main-report">${renderSummary(ctx)}${renderUnassigned(ctx)}${renderCoverage(ctx)}${renderFilters(ctx)}${renderZones(ctx)}
      <div class="level-switch">${!ctx.province?`<div class="level-tabs" role="group" aria-label="ระดับพื้นที่"><button data-level="province" class="${state.level==='province'?'active':''}" aria-pressed="${state.level==='province'}">รายจังหวัด <span>${provinces.length}</span></button><button data-level="district" class="${state.level==='district'?'active':''}" aria-pressed="${state.level==='district'}">รายอำเภอ/เขต <span>${allDistricts.length}</span></button></div>`:`<span>แสดงครบ ${ctx.districts.length} ${state.province==='กรุงเทพมหานคร'?'เขต':'อำเภอ'}ในพื้นที่ที่เลือก</span><button class="btn link" data-national-districts>ดูอำเภอ/เขตทั่วประเทศ →</button>`}</div>
      <div class="results-grid"><section class="panel results-main" aria-labelledby="results-title"><div class="panel-head"><div><h2 id="results-title">${state.level==='province'?'สถิติรายจังหวัด':ctx.province?'สถิติราย'+(state.province==='กรุงเทพมหานคร'?'เขต':'อำเภอ'):'สถิติรายอำเภอ/เขตทั่วประเทศ'}</h2><p class="sub">${state.level==='province'?'ดูยอดทีมและจำนวนอำเภอ/เขตที่ยังไม่มีทีมในแต่ละจังหวัด':'แสดงทุกพื้นที่ รวมแถวที่ยังไม่มีทีมสมัคร'}</p></div><div class="toolbar"><button class="btn" id="reload-statistics">โหลดข้อมูลใหม่</button><button class="btn" id="export-csv"><span aria-hidden="true">↓</span> ดาวน์โหลด CSV</button><button class="btn" id="print-report"><span aria-hidden="true">▤</span> พิมพ์</button></div></div><div class="table-controls"><span id="result-count" role="status"></span><label>เรียงตาม <select id="sort-filter"><option value="gap" ${state.sort==='gap'?'selected':''}>พื้นที่ยังไม่มีทีมก่อน</option><option value="total" ${state.sort==='total'?'selected':''}>จำนวนทีม มาก → น้อย</option><option value="name" ${state.sort==='name'?'selected':''}>ชื่อพื้นที่ ก → ฮ</option></select></label></div><div id="table-content"></div></section><aside class="panel side" id="side-content"></aside></div>
      <details class="panel method" id="methodology"><summary>ที่มาข้อมูลและเกณฑ์การนับ</summary><ul>
      <li>นับสิทธิ์การสมัครแยกรุ่น U14, U16 และ U18 โรงเรียนหรือสโมสรเดียวที่ส่งครบ 3 รุ่น นับเป็น 3 ทีม ${cancellationLabel} และรวมรายการรอตรวจสอบ รอเพิ่มนักกีฬา หรือยังไม่ระบุอำเภอ ตามเกณฑ์รายงานสรุปการสมัคร</li>
      <li>ไม่นับรายการที่ถูกลบ ช่องว่าง ไม่ได้ส่งทีม และช่อง “ตรวจสอบสถานะรุ่น”</li>
      <li>ใช้รายชื่อพื้นที่ครบ ${provinces.length} จังหวัด และ ${allDistricts.length} อำเภอ/เขตจาก <a href="${source.registry.url}" target="_blank" rel="noopener">Thailand Geography JSON (MIT) ↗</a> ประกอบด้วยอำเภอ ${allDistricts.length-provinces.find(p=>p.code==='10').districts.length} แห่งและเขตกรุงเทพฯ ${provinces.find(p=>p.code==='10').districts.length} แห่ง จับคู่ข้อมูลการสมัครด้วยทะเบียนรหัสพื้นที่ ยอดที่ยังจับคู่ไม่ได้แสดงแยกและรวมในยอดประเทศแล้ว</li>
      <li>พื้นที่ที่จับคู่กับทะเบียนแล้วไม่พบสิทธิ์สมัครในชุดข้อมูลนี้แสดง 0 และไฮไลต์สีแดง หากเลือกเฉพาะรุ่น เช่น U14 คำว่า “ยังไม่มีทีม U14” หมายถึงยอดเฉพาะรุ่นนั้นเป็น 0 ส่วนรุ่นอื่นอาจมีทีมสมัครแล้ว</li>
      <li>กรุงเทพมหานครแบ่งเป็นฝั่งธนบุรี 15 เขต ฝั่งพระนคร 1 จำนวน 16 เขต และฝั่งพระนคร 2 จำนวน 19 เขต หากยังไม่ระบุเขตจะแสดงแยกและไม่เดาโซน</li>
      <li>การ์ดความครอบคลุมนับจำนวนอำเภอ/เขตในพื้นที่และรุ่นอายุที่เลือก ส่วนคำค้นและสถานะพื้นที่ใช้กรองเฉพาะตาราง ผลรวมท้ายตารางและ CSV รวมทุกแถวตามตัวกรอง ไม่จำกัดเฉพาะหน้าที่มองเห็น</li>
      </ul><p>โหลดข้อมูลล่าสุดเมื่อเปิดหน้า หรือกดโหลดข้อมูลใหม่ · แสดงเฉพาะยอดรวมระดับพื้นที่</p></details><p class="print-only"></p></main>`;
    view.querySelectorAll('a[href="__HOME__"]').forEach(a => a.href=host.dataset.home);
    renderResults();
  }
  function rowMarkup(row,index) {
    const district=state.level==='district', zero=isZero(row), indices=state.age==='all'?[0,1,2]:[ageNames.indexOf(state.age)];
    const action=district?'district':'province', key=district?row.code:row.name;
    const c=district?null:coverage(row.districts);
    return `<tr class="${zero?'zero-row':''}"><td>${index+1}</td><td class="area"><button class="area-link" data-${action}="${escape(key)}">${escape(row.name)}</button>${district?`<small class="area-meta">${escape(row.province)}${row.provinceCode==='10'?' · '+escape(zoneOf.get(row.name)):''}</small>`:''}</td>
      ${!district?`<td class="district-coverage"><b>${c.registered}<span> / ${c.all}</span></b>${c.zero?`<small class="gap-count">${zeroLabel()} ${c.zero} พื้นที่</small>`:'<small class="covered-all">ครบทุกพื้นที่</small>'}</td>`:''}
      ${indices.map(i=>`<td class="col-age${i} ${row.ages[i]===0?'zero-number':''} ${indices.length===1?'total':''}">${format(row.ages[i])}</td>`).join('')}
      ${indices.length===3?`<td class="total ${zero?'zero-number':''}">${format(value(row))}</td>`:''}
      <td class="area-status"><span class="status-badge ${zero?'zero':'registered'}">${zero?'<b aria-hidden="true">!</b> ':''}${zero?zeroLabel():'มีทีมสมัครแล้ว'}</span></td>
      <td class="action"><button class="row-action" data-${action}="${escape(key)}" aria-label="ดู${district?'สรุป':'อำเภอ/เขต'} ${escape(row.name)}${district?' '+escape(row.province):''}">${district?'ดูสรุป':'ดูอำเภอ/เขต'} <span aria-hidden="true">→</span></button></td></tr>`;
  }
  function renderResults() {
    const ctx=scope(), district=state.level==='district';
    allFiltered=filteredRows();
    const pages=Math.max(1,Math.ceil(allFiltered.length/10));state.page=Math.min(state.page,pages);
    const start=printMode?0:(state.page-1)*10, rows=printMode?allFiltered:allFiltered.slice(start,start+10);
    const indices=state.age==='all'?[0,1,2]:[ageNames.indexOf(state.age)];
    const unit=district?'อำเภอ/เขต':'จังหวัด';
    document.querySelector('#result-count').textContent=`${format(allFiltered.length)} ${unit} · ${ageLabel()} · ${statusLabel()}`;
    document.querySelector('.print-only').textContent=`พื้นที่: ${ctx.label} · ระดับ: ${unit} · รุ่น: ${ageLabel()} · ${statusLabel()}${state.q?' · ค้นหา: '+state.q:''} · ${cancellationLabel}`;
    let html;
    if(!allFiltered.length) {
      const zeroProvinces=!district && state.status==='zero' && !state.q;
      html=`<div class="empty"><h3>${zeroProvinces?'ทุกจังหวัดมีทีมสมัครแล้วในรุ่นที่เลือก':'ไม่พบพื้นที่ที่ตรงกับตัวกรอง'}</h3><p>${zeroProvinces?'ยังมีอำเภอ/เขตที่ไม่มีทีมสมัคร เปิดดูได้จากปุ่มด้านล่าง':'ลองเปลี่ยนคำค้น รุ่นอายุ หรือสถานะพื้นที่'}</p><button class="btn ${zeroProvinces?'zero-outline':''}" ${zeroProvinces?'data-coverage="zero"':'data-clear-search'}>${zeroProvinces?'ดูอำเภอ/เขตที่ยังไม่มีทีมสมัคร →':'ล้างคำค้นและสถานะพื้นที่'}</button></div>`;
    } else {
      const summed=sum(allFiltered);
      html=`<div class="table-wrap" tabindex="0" role="region" aria-label="ตารางจำนวนทีม เลื่อนแนวนอนได้"><table class="${indices.length===1?'single-age':''} ${district?'district-table':'province-table'}"><caption class="sr-only">จำนวนทีมสมัคร ${escape(ctx.label)} ${ageLabel()} ${statusLabel()}</caption><thead><tr><th scope="col">ลำดับ</th><th scope="col">${district?'อำเภอ/เขต':'จังหวัด'}</th>${!district?'<th scope="col">อำเภอ/เขต<br>สมัครแล้ว / ทั้งหมด</th>':''}${indices.map(i=>`<th scope="col" class="col-age${i}">${ageNames[i]}<br>(ทีม)</th>`).join('')}${indices.length===3?'<th scope="col">รวม<br>(ทีม)</th>':''}<th scope="col" class="area-status">สถานะพื้นที่</th><th class="action" scope="col"><span class="sr-only">รายละเอียด</span></th></tr></thead><tbody>${rows.map((r,i)=>rowMarkup(r,start+i)).join('')}</tbody><tfoot><tr><td colspan="${district?2:3}">รวมตามตัวกรอง (${format(allFiltered.length)} พื้นที่)</td>${indices.map(i=>`<td class="col-age${i}">${format(summed[i])}</td>`).join('')}${indices.length===3?`<td class="total">${format(allFiltered.reduce((n,r)=>n+value(r),0))}</td>`:''}<td></td><td></td></tr></tfoot></table></div><div class="pagination"><span>แสดง ${format(start+1)}–${format(start+rows.length)} จาก ${format(allFiltered.length)} พื้นที่</span><div class="pages" aria-label="เปลี่ยนหน้าตาราง"><button data-page="${state.page-1}" ${state.page===1?'disabled':''} aria-label="หน้าก่อนหน้า">‹</button>${Array.from({length:pages},(_,i)=>i+1).filter(n=>n===1||n===pages||Math.abs(n-state.page)<2).map((n,i,ns)=>`${i&&n-ns[i-1]>1?'<span aria-hidden="true">…</span>':''}<button data-page="${n}" class="${n===state.page?'current':''}" ${n===state.page?'aria-current="page"':''} aria-label="หน้า ${n}">${n}</button>`).join('')}<button data-page="${state.page+1}" ${state.page===pages?'disabled':''} aria-label="หน้าถัดไป">›</button></div></div>`;
    }
    document.querySelector('#table-content').innerHTML=html;
    const ranking=[...provinces].map(p=>({...p,gaps:coverage(p.districts).zero})).filter(p=>p.gaps>0).sort((a,b)=>b.gaps-a.gaps||a.name.localeCompare(b.name,'th')).slice(0,5);
    const max=Math.max(...ranking.map(p=>p.gaps),1);
    document.querySelector('#side-content').innerHTML=ctx.province?`<h3>อ่านแถวไฮไลต์อย่างไร</h3><p class="sub">${ageLabel()}</p><span class="status-badge zero"><b aria-hidden="true">!</b> ${zeroLabel()}</span><p class="side-explanation">พื้นที่นี้มีรายชื่ออยู่ในทะเบียนอำเภอ/เขต แต่ยังไม่พบทีมสมัครในรุ่นที่เลือก ณ เวลาของข้อมูล</p><div class="side-bottom">${state.age==='all'?'ยอดเป็น 0 ทั้ง U14, U16 และ U18':'รุ่นอื่นอาจมีทีมสมัครแล้ว กดดูสรุปเพื่อดูครบ 3 รุ่น'}<br>${cancellationLabel}</div>`:`<h3>จังหวัดที่ยังมีพื้นที่ไม่มีทีมสมัคร</h3><p class="sub">นับจำนวนอำเภอ/เขต · ${ageLabel()}</p>${ranking.map(p=>`<button class="rank" data-province-gap="${escape(p.name)}"><span class="rank-line"><span>${escape(p.name)}</span><b class="gap-count">${p.gaps} พื้นที่</b></span><div class="bar-track"><span style="width:${p.gaps/max*100}%;background:var(--danger)"></span></div></button>`).join('')}<div class="side-bottom">กดชื่อจังหวัดเพื่อเปิดรายชื่ออำเภอ/เขตที่ยังไม่มีทีมสมัคร</div>`;
  }
  function showDistrict(code) {
    const row=allDistricts.find(r=>r.code===code);if(!row)return;
    const zero=total(row.ages)===0;
    dialog.innerHTML=`<div class="dialog-top"><button class="close-dialog" aria-label="ปิดสรุปอำเภอ/เขต">×</button><p>${escape(row.province)}${row.provinceCode==='10'?' · '+escape(zoneOf.get(row.name)):''}</p><h2 id="district-title">${row.provinceCode==='10'?'เขต':'อำเภอ'}${escape(row.name)}</h2></div><div class="dialog-body">${zero?'<div class="district-zero-notice"><strong>! ยังไม่มีทีมสมัคร</strong><span>ยอดสมัครเป็น 0 ทั้ง 3 รุ่นอายุ ณ เวลาข้อมูล</span></div>':''}<p class="sub">ทีมสมัครรวมทุกช่วงอายุ</p><div class="district-total ${zero?'gap-count':''}">${format(total(row.ages))}<small>ทีม</small></div><div class="age-breakdown">${row.ages.map((n,i)=>`<div class="${n===0?'zero-age':''}"><span>${ageNames[i]}</span><strong class="col-age${i}">${format(n)}</strong><span>${n===0?'ยังไม่มีทีม':'ทีม'}</span></div>`).join('')}</div><p class="dialog-note">${cancellationLabel} · นับแยกรุ่นอายุ</p></div>`;
    dialog.showModal();
  }
  function exportCsv() {
    // Export the response already displayed, even if registrations change meanwhile.
    const ctx=scope(), district=state.level==='district';
    const indices=state.age==='all'?[0,1,2]:[ageNames.indexOf(state.age)];
    const metadata=[ctx.label,source.asOfIso,source.snapshotId,source.registryVersion,source.definitionVersion,
      'นับแยกรุ่นอายุ '+cancellationLabel];
    const header=['รหัสจังหวัด','จังหวัด',...(district?['รหัสอำเภอ/เขต','อำเภอ/เขต']:['อำเภอ/เขตทั้งหมด','อำเภอ/เขตมีทีมสมัคร','อำเภอ/เขตยังไม่มีทีมสมัคร']),...indices.map(i=>ageNames[i]),'รวม (ทีม)','สถานะพื้นที่ตามรุ่นที่เลือก','ขอบเขตรายงาน','ข้อมูล ณ','snapshotId','registryVersion','definitionVersion','เกณฑ์'];
    const rows=allFiltered.map(r=>{
      const c=district?null:coverage(r.districts);
      return [district?r.provinceCode:r.code,district?r.province:r.name,...(district?[r.code,r.name]:[c.all,c.registered,c.zero]),...indices.map(i=>r.ages[i]),value(r),isZero(r)?zeroLabel():'มีทีมสมัครแล้ว',...metadata];
    });
    const summed=sum(allFiltered);
    const unassigned=state.zone?[0,0,0]:ctx.province?ctx.province.unassigned:provinces.reduce((a,p)=>a.map((v,i)=>v+p.unassigned[i]),[...source.unassigned]);
    rows.push(['','รวมตามตัวกรอง',...(district?['','']:['','','']),...indices.map(i=>summed[i]),value({ages:summed}),'',...metadata]);
    rows.push(['','ยังไม่ระบุพื้นที่ในขอบเขต (รวมในยอดประเทศแล้ว; ไม่ใช่แถวพื้นที่ตามตัวกรอง)',...(district?['','']:['','','']),...indices.map(i=>unassigned[i]),value({ages:unassigned}),'ยังไม่ระบุพื้นที่',...metadata]);
    const quote=v=>'"'+String(v).replace(/"/g,'""')+'"';
    const csv='\ufeff'+[header,...rows].map(row=>row.map(quote).join(',')).join('\r\n');
    const toast=document.querySelector('.toast');
    try {
      const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
      const link=document.createElement('a');link.href=url;link.download='PMYC-registration-'+source.snapshotId+'.csv';document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);
      toast.textContent='ดาวน์โหลด CSV ทุกแถวตามตัวกรองแล้ว';
    } catch { toast.textContent='ดาวน์โหลดไม่สำเร็จ กรุณาลองอีกครั้ง'; }
    toast.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>toast.classList.remove('show'),4000);
  }
  function renderUnassigned(ctx) {
    const unassigned=ctx.province?ctx.province.unassigned:provinces.reduce((a,p)=>a.map((v,i)=>v+p.unassigned[i]),[...source.unassigned]);
    return '<section class="unassigned-note" aria-label="ยอดยังไม่ระบุพื้นที่"><strong>ยังไม่ระบุ'+(ctx.province?'อำเภอ/เขต':'พื้นที่')+': '+format(total(unassigned))+' ทีม</strong><span> U14 '+format(unassigned[0])+' · U16 '+format(unassigned[1])+' · U18 '+format(unassigned[2])+'</span><p>รวมในยอด'+(ctx.province?'จังหวัด':'ประเทศ')+'แล้ว แยกจากทะเบียนพื้นที่และผลรวมแถวอำเภอ/เขต ไม่เดาโซน'+(state.zone?' · ยอดส่วนนี้ไม่รวมในโซนที่เลือก':'')+'</p></section>';
  }
  document.addEventListener('click',event=>{
    if(event.target.closest('a[href="#methodology"]')){event.preventDefault();const details=document.querySelector('#methodology');details.open=true;details.scrollIntoView({block:'start',behavior:'smooth'});return;}
    if(event.target.closest('a[href="#main"]')){event.preventDefault();const main=document.querySelector('#main');main.setAttribute('tabindex','-1');main.focus();main.scrollIntoView();return;}
    const button=event.target.closest('button');if(!button)return;
    if(button.dataset.age)route({age:button.dataset.age,page:1});
    if(button.dataset.level)route({level:button.dataset.level,q:'',page:1});
    if(button.dataset.status)route({status:button.dataset.status,page:1});
    if(button.dataset.coverage)route({level:'district',status:button.dataset.coverage,q:'',page:1});
    if(button.hasAttribute('data-national-districts'))route({province:'',zone:'',level:'district',q:'',page:1});
    if(button.hasAttribute('data-province'))route({province:button.dataset.province,zone:'',level:'district',q:'',page:1});
    if(button.hasAttribute('data-province-gap'))route({province:button.dataset.provinceGap,zone:'',level:'district',status:'zero',q:'',page:1});
    if(button.hasAttribute('data-zone'))route({zone:state.zone===button.dataset.zone?'':button.dataset.zone,q:'',page:1});
    if(button.hasAttribute('data-district'))showDistrict(button.dataset.district);
    if(button.dataset.page){route({page:Number(button.dataset.page)},true);document.querySelector('#results-title').scrollIntoView({block:'start'});}
    if(button.hasAttribute('data-reset'))route({province:'',zone:'',level:'province',age:'all',status:'all',q:'',sort:'gap',page:1});
    if(button.hasAttribute('data-clear-search'))route({q:'',status:'all',page:1});
    if(button.classList.contains('close-dialog'))dialog.close();
    if(button.id==='reload-statistics')location.reload();
    if(button.id==='export-csv')exportCsv();
    if(button.id==='print-report')setTimeout(()=>window.print(),0);
  });
  document.addEventListener('change',event=>{
    if(event.target.id==='province-filter')route({province:event.target.value,zone:'',level:event.target.value?'district':state.level,q:'',page:1});
    if(event.target.id==='zone-filter')route({zone:event.target.value,q:'',page:1});
    if(event.target.id==='sort-filter')route({sort:event.target.value,page:1},true);
  });
  document.addEventListener('input',event=>{
    if(event.target.id==='area-search'){state.q=event.target.value;state.page=1;const p=new URLSearchParams(location.hash.split('?')[1]);state.q?p.set('q',state.q):p.delete('q');p.delete('page');history.replaceState(null,'','#stats'+(p.size?'?'+p:''));renderResults();}
  });
  dialog.addEventListener('click',event=>{if(event.target===dialog)dialog.close();});
  window.addEventListener('hashchange',()=>{if(location.hash==='#home'||location.hash.startsWith('#stats')){render();window.scrollTo(0,0);}});
  window.addEventListener('beforeprint',()=>{if(location.hash!=='#home'){printMode=true;renderResults();}});
  window.addEventListener('afterprint',()=>{if(printMode){printMode=false;renderResults();}});
  render();
  view.querySelectorAll('a[href="__HOME__"]').forEach(a => a.href=host.dataset.home);
  } catch {
    host.innerHTML='<main id="main" class="wrap unavailable"><h1>ข้อมูลสถิติการสมัคร</h1><p role="alert">ยังไม่สามารถแสดงข้อมูลที่ตรวจสอบผ่านได้ กรุณาลองใหม่ภายหลัง</p><button type="button" id="retry-statistics" class="btn">ลองอีกครั้ง</button></main>';
    document.querySelector('#retry-statistics').addEventListener('click',()=>location.reload());
  }
})();
