/* Public football page templates. Uses only confirmed public fixtures supplied by data.js. */
(function(root){
 'use strict';

 function aggregateTeamStats(matches){
  const rows=new Map();
  function row(id){if(!rows.has(id))rows.set(id,{id,mp:0,w90:0,wpk:0,lpk:0,l90:0,d90:0,gf:0,ga:0,gd:0});return rows.get(id);}
  for(const m of matches||[]){
   const s=m&&m.score;
   if(!m||m.published===false||!m.resultConfirmed||!s||!m.home||!m.away||m.home===m.away||![s.home,s.away].every(n=>Number.isInteger(n)&&n>=0))continue;
   const h=row(m.home),a=row(m.away);h.mp++;a.mp++;h.gf+=s.home;h.ga+=s.away;a.gf+=s.away;a.ga+=s.home;
   if(s.home>s.away){h.w90++;a.l90++;}
   else if(s.away>s.home){a.w90++;h.l90++;}
   else if([s.penHome,s.penAway].every(n=>Number.isInteger(n)&&n>=0)&&s.penHome!==s.penAway){const winner=s.penHome>s.penAway?h:a,loser=winner===h?a:h;winner.wpk++;loser.lpk++;}
   else{h.d90++;a.d90++;}
  }
  return [...rows.values()].map(r=>({...r,gd:r.gf-r.ga})).sort((a,b)=>b.gf-a.gf||b.gd-a.gd||String(a.id).localeCompare(String(b.id)));
 }

 function createViews(C){
  const {D,filters,params,link,icon,masthead,empty,notice,crest,team,esc,genderName}=C;
  const titleGender=()=>genderName()+(filters.gender==='female'?' U18':' '+filters.age);
  const main=html=>'<main id="main" tabindex="-1" class="wrap main-content extra-page">'+html+'</main>';
  const scope=()=>titleGender()+' · ฤดูกาล 2569/70';
  const teamData=id=>D.team(id);
  const teamName=id=>teamData(id)?.name||'ทีมที่เผยแพร่';
  function filterOptions(source,current){return Object.entries(source).map(([value,label])=>'<option value="'+esc(value)+'" '+(current===value?'selected':'')+'>'+esc(label)+'</option>').join('');}
  function statsFilters(){
   const districts=[...new Set(D.TEAMS.filter(t=>filters.province==='all'||t.province===filters.province).map(t=>t.district))];
   const area=filters.stage==='1'?'<label>อำเภอ/เขต<select id="district-filter" aria-label="อำเภอ/เขต"><option value="all">ทุกอำเภอ/เขต</option>'+districts.map(d=>'<option value="'+esc(d)+'" '+(filters.district===d?'selected':'')+'>'+esc(d)+'</option>').join('')+'</select></label>':'<label>โซน<select id="zone-filter" aria-label="โซน"><option value="all">ทุกโซน</option>'+D.ZONES.map(z=>'<option value="'+z.id+'" '+(filters.zone===z.id?'selected':'')+'>โซน '+z.number+' · '+esc(z.name)+'</option>').join('')+'</select></label>';
   return '<section class="card xp-filter-card"><div class="filters"><label>ระดับการแข่งขัน<select id="stage-filter" aria-label="ระดับการแข่งขัน">'+filterOptions({all:'ทุกระดับ',...D.STAGES},filters.stage)+'</select></label><label>จังหวัด<select id="province-filter" aria-label="จังหวัด">'+filterOptions(D.PROVINCES,filters.province)+'</select></label>'+area+'</div></section>';
  }

  function stats(){
   const heading=masthead('สถิติ','สถิติ'+titleGender(),'สถิติทีมจากผลการแข่งขันที่ยืนยันและเผยแพร่แล้ว');
   const matches=D.fixtures(filters,'results'),rows=aggregateTeamStats(matches).filter(r=>teamData(r.id));
   if(!rows.length)return heading+main((filters.gender==='female'?'':statsFilters())+'<section class="card">'+empty('ยังไม่มีสถิติสำหรับตัวเลือกนี้','สถิติจะแสดงเมื่อมีผลแข่งขันที่ยืนยันและเผยแพร่ โดยไม่ใช้ข้อมูลของประเภทหรือรุ่นอื่นแทน',link('fixtures','ดูตารางและผลการแข่งขัน','btn primary'))+'</section>');
   const leaders=[['gf','ประตูได้มากที่สุด','ประตู'],['w90','ชนะในเวลามากที่สุด','นัด'],['gd','ผลต่างประตูสูงที่สุด','ประตู'],['wpk','ชนะจุดโทษมากที่สุด','นัด']].map(([key,label,unit])=>{
    const value=Math.max(...rows.map(r=>r[key])),tied=rows.filter(r=>r[key]===value),first=tied[0];
    const body=value>0?'<div class="xp-leader-team">'+crest(teamData(first.id))+'<div>'+link('team',esc(teamName(first.id)),'',{id:first.id})+(tied.length>1?'<small>ร่วมกับอีก '+(tied.length-1)+' ทีม</small>':'')+'</div></div><div class="xp-leader-value">'+value+'<small>'+unit+'</small></div>':'<p class="xp-leader-pending">ยังไม่มี'+(key==='wpk'?'ผลชนะจุดโทษ':'ข้อมูลผลงานประเภทนี้')+'</p>';
    return '<article class="card xp-leader-card"><h2>'+label+'</h2>'+body+'</article>';
   }).join('');
   const table='<section class="card xp-stat-table"><div class="card-head"><div><h2>สถิติรายทีม</h2><p>'+esc(scope())+' · ผลยืนยัน '+matches.length+' คู่</p></div><span class="xp-sample">ข้อมูลตัวอย่าง</span></div><div class="xp-table-scroll"><table><thead><tr><th class="xp-team-col">ทีม</th><th>แข่ง</th><th>ชนะในเวลา</th><th>ชนะ PK</th><th>เสมอ</th><th>แพ้ PK</th><th>แพ้ในเวลา</th><th>ได้</th><th>เสีย</th><th>ผลต่าง</th></tr></thead><tbody>'+rows.map(r=>'<tr><td class="xp-team-col">'+link('team',team(teamData(r.id)),'',{id:r.id})+'</td><td>'+r.mp+'</td><td>'+r.w90+'</td><td>'+r.wpk+'</td><td>'+r.d90+'</td><td>'+r.lpk+'</td><td>'+r.l90+'</td><td>'+r.gf+'</td><td>'+r.ga+'</td><td class="xp-stat-difference">'+(r.gd>0?'+':'')+r.gd+'</td></tr>').join('')+'</tbody></table></div><p class="xp-table-note">ประตูจากการดวลจุดโทษไม่นับรวมในประตูได้–เสีย · ตารางนี้เป็นสถิติทีม ไม่ใช่อันดับตัดสินแชมป์</p></section>';
   return heading+main(statsFilters()+'<div class="xp-stat-leaders">'+leaders+'</div>'+table+notice('สถิติรายบุคคล','ยังไม่มีชุดสถิตินักกีฬาที่อนุญาตเผยแพร่ การไม่บันทึกรายชื่อผู้เล่นไม่ได้หมายความว่านักกีฬาลงเล่นเป็นศูนย์นัด'));
  }

  const albums=[
   {id:'official-project',kind:'campaign',label:'สื่อโครงการ',title:'ภาพประชาสัมพันธ์โครงการ PMYC Football',description:'ภาพประชาสัมพันธ์จากเว็บไซต์ฟุตบอลเดิมของโครงการ ไม่ใช่ภาพรายงานการแข่งขันในต้นแบบ',image:'/public-v4/assets/official-football-poster.jpg',count:1},
   {id:'women-u18',kind:'announcement',label:'ประกาศรับสมัคร',title:'ฟุตบอลหญิง U18 เปิดรับสมัคร 1 ธันวาคม 2569',description:'ภาพประกาศที่จัดทำสำหรับต้นแบบ UX/UI ด้วยข้อความที่ Owner ยืนยัน ไม่มีภาพนักกีฬาหรือการแข่งขันสมมติ',image:null,count:1}
  ];
  function womenArtwork(){return '<div class="xp-women-art" role="img" aria-label="ฟุตบอลหญิง U18 เปิดรับสมัคร 1 ธันวาคม 2569"><span class="xp-women-kicker">PMYC FOOTBALL · WOMEN</span><strong>U18</strong><p>รุ่นอายุไม่เกิน 18 ปี</p><div class="xp-women-date"><b>01</b><span>ธันวาคม<br>2569</span></div><svg class="xp-football-lines" viewBox="0 0 160 160" aria-hidden="true"><circle cx="80" cy="80" r="68"/><path d="M80 43l35 25-13 41H58L45 68z M80 12v31 M145 59l-30 9 M121 135l-19-26 M39 135l19-26 M15 59l30 9"/></svg></div>';}
  function albumCover(a){return a.image?'<img src="'+a.image+'" alt="โปสเตอร์ประชาสัมพันธ์โครงการ PMYC Football">':womenArtwork();}
  function gallery(){
   const selected=params.get('gallery-kind')==='announcement'?'announcement':'all',shown=albums.filter(a=>selected==='all'||a.kind==='announcement');
   const tabs='<nav class="xp-filter-tabs" aria-label="ประเภทแกลเลอรี">'+link('gallery','ทั้งหมด','xp-filter-tab '+(selected==='all'?'active':''),{'gallery-kind':'all'})+link('gallery','ประกาศรับสมัคร','xp-filter-tab '+(selected==='announcement'?'active':''),{'gallery-kind':'announcement'})+'</nav>';
   const cards='<div class="xp-gallery-grid">'+shown.map(a=>link('album','<div class="xp-gallery-cover">'+albumCover(a)+'</div><div class="xp-gallery-copy"><span>'+a.label+'</span><h2>'+a.title+'</h2><p>'+a.count+' ภาพ · สื่อประชาสัมพันธ์</p><div class="xp-gallery-action">เปิดอัลบั้ม '+icon('arrow')+'</div></div>','card xp-gallery-card',{id:a.id})).join('')+'</div>';
   return masthead('แกลเลอรี','แกลเลอรีภาพ','สื่อประชาสัมพันธ์โครงการฟุตบอลเยาวชน')+main(tabs+cards+'<p class="xp-media-note">ต้นแบบนี้มีสื่อประชาสัมพันธ์ 2 อัลบั้ม ยังไม่มีอัลบั้มภาพแข่งขันฟุตบอลที่เผยแพร่ ติดตามอัลบั้มภาพกิจกรรมและการแข่งขันฟุตบอลได้เมื่อโครงการเผยแพร่</p>');
  }
  function album(){
   const a=albums.find(a=>a.id===params.get('id'));
   if(!a)return masthead('แกลเลอรี','ไม่พบอัลบั้มที่เลือก')+main(empty('ยังไม่มีอัลบั้มนี้ที่เผยแพร่','เลือกดูอัลบั้มที่เปิดเผยในหน้าแกลเลอรี',link('gallery','กลับแกลเลอรี','btn primary')));
   const action=a.image?'<button type="button" class="btn" data-action="gallery-lightbox" data-image="'+a.image+'">ดูภาพขนาดเต็ม '+icon('photo')+'</button>':link('register','รายละเอียดรับสมัครหญิง U18','btn gold',{gender:'female',age:'U18',stage:'all',province:'all',zone:'all',district:'all'});
   return masthead('แกลเลอรี',a.title,a.label+' · '+a.count+' ภาพ')+main('<div class="xp-album-top">'+link('gallery',icon('back')+'กลับแกลเลอรี','btn text')+'<span>ภาพ 1 / 1</span></div><figure class="card xp-album-content">'+albumCover(a)+'<figcaption>'+a.description+'</figcaption></figure><div class="xp-album-actions">'+action+'</div>');
  }

  function certificates(){return masthead('เกียรติบัตร','ดาวน์โหลดเกียรติบัตร','ตรวจสอบการเผยแพร่เกียรติบัตรของโครงการ')+main('<section class="card xp-certificate-state"><div class="xp-certificate-icon" aria-hidden="true"><svg viewBox="0 0 80 80"><rect x="13" y="10" width="54" height="47" rx="4"/><path d="M24 23h32M24 32h24M24 41h19"/><circle cx="54" cy="52" r="10"/><path d="M48 61l-2 12 8-4 8 4-2-12"/></svg></div><h2>ยังไม่มีเกียรติบัตรที่เผยแพร่</h2><p>'+esc(scope())+'</p><p class="xp-certificate-help">สามารถดาวน์โหลดได้เมื่อโครงการประกาศเปิดให้บริการ โปรดติดตามข่าวและประกาศล่าสุด</p><div class="actions">'+link('news','ดูข่าวและประกาศ','btn primary')+link('home','กลับหน้าแรก','btn')+'</div></section>');}

  function national(){
   const heading=masthead('รอบประเทศ','รอบชิงชนะเลิศระดับประเทศ',scope());
   if(filters.gender==='female')return heading+main('<section class="card">'+empty('ยังไม่มีข้อมูลรอบประเทศฟุตบอลหญิงที่เผยแพร่','รูปแบบและข้อมูลการแข่งขันจะแสดงตามประกาศของโครงการ',link('fixtures','ดูตารางและผลการแข่งขัน','btn primary'))+'</section>');
   const groups='<div class="xp-national-groups">'+['A','B'].map(group=>'<section class="card xp-group-card"><div class="card-head"><h2>กลุ่ม '+group+'</h2><span class="xp-state-pill">รอประกาศทีม</span></div><div class="xp-table-scroll"><table><thead><tr><th class="xp-team-col">ทีม</th><th>แข่ง</th><th>คะแนน</th></tr></thead><tbody>'+Array.from({length:6},(_,i)=>'<tr><td class="xp-team-col"><span class="xp-group-slot">'+String(i+1).padStart(2,'0')+'</span><span class="xp-pending-team">รอประกาศทีม</span></td><td>—</td><td>—</td></tr>').join('')+'</tbody></table></div></section>').join('')+'</div>';
   const pendingMatch=(label,highlight=false)=>'<article class="card xp-national-match '+(highlight?'xp-national-final':'')+'"><header><h3>'+label+'</h3><span>ยังไม่มีโปรแกรมเผยแพร่</span></header><div class="xp-national-teams"><div><span class="xp-empty-crest" aria-hidden="true">?</span><p>รอประกาศทีม</p></div><b>—</b><div><span class="xp-empty-crest" aria-hidden="true">?</span><p>รอประกาศทีม</p></div></div><footer>วัน เวลา และสนามรอประกาศ</footer></article>';
   return heading+main(notice('รอข้อมูลการแข่งขันระดับประเทศ','จะแสดงรายชื่อทีม โปรแกรม ผล และทีมผ่านเข้ารอบเมื่อมีการยืนยันและเผยแพร่แล้ว')+groups+'<section class="xp-national-round"><h2>รอบรองชนะเลิศ</h2><div class="xp-national-match-grid">'+pendingMatch('รอบรองชนะเลิศ คู่ที่ 1')+pendingMatch('รอบรองชนะเลิศ คู่ที่ 2')+'</div></section><section class="xp-national-round"><h2>รอบชิงอันดับและชิงชนะเลิศ</h2><div class="xp-national-match-grid">'+pendingMatch('นัดชิงอันดับที่ 3')+pendingMatch('นัดชิงชนะเลิศ',true)+'</div></section><p class="xp-table-note">— หมายถึงยังไม่มีข้อมูลเผยแพร่ ไม่ใช่คะแนนหรือจำนวนการแข่งขันเป็นศูนย์</p>'+link('fixtures','ดูตารางการแข่งขันระดับประเทศ '+icon('arrow'),'btn primary',{stage:'4',province:'all',zone:'all',district:'all'}));
  }

  return {stats,gallery,album,certificates,national};
 }

 root.PMYC_EXTRA_VIEWS=createViews;
 if(typeof module!=='undefined'&&module.exports)module.exports={aggregateTeamStats,createViews};
})(typeof window!=='undefined'?window:globalThis);
