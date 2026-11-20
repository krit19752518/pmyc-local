/* Synthetic public DTOs for design review. Never read staff storage or private drafts. */
(function(root){
 'use strict';
 const PROVINCES={all:'ทุกจังหวัด',cm:'เชียงใหม่',bkk:'กรุงเทพมหานคร',cr:'เชียงราย',sp:'สมุทรปราการ'};
 const STAGES={1:'ระดับอำเภอ/เขต',2:'ระดับจังหวัด',3:'ระดับภูมิภาค',4:'ระดับประเทศ'};
 const ZONES=[['n1','ภาคเหนือ 1','เชียงราย'],['n2','ภาคเหนือ 2','กำแพงเพชร'],['ne1','ภาคตะวันออกเฉียงเหนือ 1','หนองคาย'],['ne2','ภาคตะวันออกเฉียงเหนือ 2','มุกดาหาร'],['ne3','ภาคตะวันออกเฉียงเหนือ 3','นครราชสีมา'],['e','ภาคตะวันออก','ชลบุรี'],['c1','ภาคกลาง 1','อ่างทอง'],['c2','ภาคกลาง 2','สระบุรี'],['w1','ภาคตะวันตก 1','สมุทรปราการ'],['w2','ภาคตะวันตก 2','เพชรบุรี'],['s1','ภาคใต้ 1','กระบี่'],['s2','ภาคใต้ 2','พัทลุง']].map(([id,name,referenceHost],i)=>({id,name,number:i+1,referenceHost}));
 const TEAMS=[
  {id:'mr',name:'แม่ริม ยูไนเต็ด',short:'MRU',province:'cm',district:'แม่ริม',zone:'n1',color:'#254d83',symbol:'mountain',ground:'สนามกีฬาอำเภอแม่ริม'},
  {id:'ma',name:'แม่ริม อะคาเดมี',short:'MRA',province:'cm',district:'แม่ริม',zone:'n1',color:'#267569',symbol:'star',ground:'สนามกีฬาอำเภอแม่ริม'},
  {id:'mr2',name:'ริมเหนือ เยาวชน',short:'RNY',province:'cm',district:'แม่ริม',zone:'n1',color:'#6b5d9a',symbol:'sun',ground:'สนามกีฬาอำเภอแม่ริม'},
  {id:'mr3',name:'ริมใต้ เอฟซี',short:'RTF',province:'cm',district:'แม่ริม',zone:'n1',color:'#a65056',symbol:'star',ground:'สนามกีฬาอำเภอแม่ริม'},
  {id:'mr4',name:'สันโป่ง จูเนียร์',short:'SPJ',province:'cm',district:'แม่ริม',zone:'n1',color:'#996727',symbol:'mountain',ground:'สนามกีฬาอำเภอแม่ริม'},
  {id:'mr5',name:'ห้วยทราย ยูไนเต็ด',short:'HSU',province:'cm',district:'แม่ริม',zone:'n1',color:'#356981',symbol:'sun',ground:'สนามกีฬาอำเภอแม่ริม'},
  {id:'ss',name:'สันทราย เอฟซี',short:'SSF',province:'cm',district:'สันทราย',zone:'n1',color:'#b85243',symbol:'sun',ground:'สนามเทศบาลสันทราย'},
  {id:'ss2',name:'สันทราย อะคาเดมี',short:'SSA',province:'cm',district:'สันทราย',zone:'n1',color:'#486598',symbol:'star',ground:'สนามเทศบาลสันทราย'},
  {id:'mt',name:'แม่แตง สปอร์ตคลับ',short:'MTS',province:'cm',district:'แม่แตง',zone:'n1',color:'#b28536',symbol:'mountain',ground:'สนามกีฬาแม่แตง'},
  {id:'mt2',name:'แม่แตง เยาวชน',short:'MTY',province:'cm',district:'แม่แตง',zone:'n1',color:'#438677',symbol:'sun',ground:'สนามกีฬาแม่แตง'},
  {id:'hd',name:'หางดง ยูไนเต็ด',short:'HDU',province:'cm',district:'หางดง',zone:'n1',color:'#755b90',symbol:'star',ground:'สนามกีฬาหางดง'},
  {id:'bk',name:'บางกอก เยาวชน',short:'BKY',province:'bkk',district:'บางรัก',zone:'c1',color:'#5d61a0',symbol:'star',ground:'สนามกีฬาบางรัก'},
  {id:'bk2',name:'บางรัก ยูไนเต็ด',short:'BRU',province:'bkk',district:'บางรัก',zone:'c1',color:'#8d6140',symbol:'sun',ground:'สนามกีฬาบางรัก'},
  {id:'pt',name:'ปทุมวัน ยูไนเต็ด',short:'PTU',province:'bkk',district:'ปทุมวัน',zone:'c1',color:'#296881',symbol:'sun',ground:'สนามกีฬาปทุมวัน'},
  {id:'cr',name:'เชียงราย จูเนียร์',short:'CRJ',province:'cr',district:'เมืองเชียงราย',zone:'n1',color:'#c16d31',symbol:'mountain',ground:'สนามกีฬาจังหวัดเชียงราย'},
  {id:'cr2',name:'เชียงราย อะคาเดมี',short:'CRA',province:'cr',district:'เมืองเชียงราย',zone:'n1',color:'#548567',symbol:'star',ground:'สนามกีฬาจังหวัดเชียงราย'},
  {id:'ms',name:'แม่สาย อะคาเดมี',short:'MSA',province:'cr',district:'แม่สาย',zone:'n1',color:'#965859',symbol:'star',ground:'สนามกีฬาแม่สาย'},
  {id:'sp',name:'ปากน้ำ เอฟซี',short:'PKF',province:'sp',district:'เมืองสมุทรปราการ',zone:'w1',color:'#237a83',symbol:'sun',ground:'สนามกีฬาจังหวัดสมุทรปราการ'},
  {id:'sp2',name:'ปากน้ำ เยาวชน',short:'PKY',province:'sp',district:'เมืองสมุทรปราการ',zone:'w1',color:'#ad6c3e',symbol:'mountain',ground:'สนามกีฬาจังหวัดสมุทรปราการ'},
  {id:'bp',name:'บางพลี เยาวชน',short:'BPY',province:'sp',district:'บางพลี',zone:'w1',color:'#705f43',symbol:'star',ground:'สนามกีฬาบางพลี'}
 ];
 const team=id=>TEAMS.find(t=>t.id===id);
 function match(id,home,away,date,time,stage,province,extra={}){return {id,home,away,date,time,stage,province,gender:'male',age:'U16',season:'2026-27',zone:team(home).zone,venue:team(home).ground,round:stage<=2?'รอบก่อนรองชนะเลิศ':'นัดที่ 1',published:true,resultConfirmed:false,...extra};}
 const MATCHES=[
  match('M101','mr','ma','2026-12-01','14:00','1','cm',{round:'รอบรองชนะเลิศ'}),
  match('M102','ss','ss2','2026-12-01','16:00','1','cm',{changed:true,venue:'สนามกีฬาเทศบาลสันทราย',previousPublished:{date:'2026-12-01',time:'16:00',venue:'สนามสันทราย 2'},publishedAt:'2026-11-10T09:00:00Z'}),
  match('M103','bk','bk2','2026-12-02','15:30','1','bkk'),
  match('M104','cr','cr2','2026-12-02','14:00','1','cr'),
  match('M105','sp','sp2','2026-12-03','16:00','1','sp'),
  match('M106','mt','mt2','2026-12-05','14:00','1','cm'),
  match('M107','mr','ma','2026-12-05','16:00','1','cm',{age:'U14'}),
  match('M108','mr','mt','2027-01-16','15:00','2','cm',{round:'รอบรองชนะเลิศ'}),
  match('M109','mr2','mr3','2026-12-01','16:00','1','cm',{round:'รอบรองชนะเลิศ'}),
  match('M110','ss','hd','2027-01-16','17:00','2','cm',{round:'รอบรองชนะเลิศ'}),
  match('R101','mr','mr4','2026-11-08','14:00','1','cm',{resultConfirmed:true,score:{home:2,away:1},round:'รอบก่อนรองชนะเลิศ',lineupPublic:false}),
  match('R102','ma','mr5','2026-11-08','16:00','1','cm',{resultConfirmed:true,score:{home:1,away:1,penHome:4,penAway:3},round:'รอบก่อนรองชนะเลิศ',lineupPublic:false}),
  match('R103','bk','bk2','2026-11-09','15:30','1','bkk',{age:'U18',resultConfirmed:true,score:{home:3,away:0},round:'รอบก่อนรองชนะเลิศ',lineupPublic:false}),
  match('Z101','mr','cr','2027-02-22','14:00','3','cm',{resultConfirmed:true,score:{home:2,away:1},round:'นัดที่ 1'}),
  match('Z102','ma','ms','2027-02-22','16:00','3','cm',{resultConfirmed:true,score:{home:1,away:1,penHome:5,penAway:4},round:'นัดที่ 1'}),
  match('Z103','mr','ma','2027-02-25','14:00','3','cm',{resultConfirmed:true,score:{home:1,away:1,penHome:4,penAway:3},round:'นัดที่ 2'}),
  match('Z104','cr','ms','2027-02-25','16:00','3','cm',{resultConfirmed:true,score:{home:0,away:2},round:'นัดที่ 2'}),
  match('Z105','mr','ms','2027-02-28','14:00','3','cm',{round:'นัดที่ 3'}),
  match('Z106','ma','cr','2027-02-28','16:00','3','cm',{round:'นัดที่ 3'})
 ];
 const registration={gender:'female',age:'U18',opens:'2026-12-01',closes:null,productionUrl:null};
 function normalize(input={}){
  const gender=input.gender==='female'?'female':'male';
  return {gender,age:gender==='female'?'U18':['U14','U16','U18'].includes(input.age)?input.age:'U16',season:'2026-27',stage:['all','1','2','3','4'].includes(String(input.stage))?String(input.stage):'all',province:PROVINCES[input.province]?input.province:'all',zone:ZONES.some(z=>z.id===input.zone)?input.zone:'all',district:String(input.stage)==='1'&&TEAMS.some(t=>t.district===input.district&&(input.province==='all'||!input.province||t.province===input.province))?input.district:'all'};
 }
 function publicMatch(m){
  if(!m.published)return null;
  const keys=['id','home','away','date','time','stage','province','gender','age','season','zone','venue','round','changed','publishedAt','resultConfirmed','lineupPublic'];
  const out=Object.fromEntries(keys.filter(k=>m[k]!==undefined).map(k=>[k,m[k]]));
  if(m.previousPublished)out.previousPublished=Object.fromEntries(['date','time','venue'].filter(k=>m.previousPublished[k]!==undefined).map(k=>[k,m.previousPublished[k]]));
  if(m.resultConfirmed&&m.score)out.score=Object.fromEntries(['home','away','penHome','penAway'].filter(k=>m.score[k]!==undefined).map(k=>[k,m.score[k]]));
  return out;
 }
 function fixtures(filters,mode='upcoming',query='',date='all'){
  const f=normalize(filters);return MATCHES.map(publicMatch).filter(Boolean).filter(m=>m.gender===f.gender&&m.age===f.age&&(f.stage==='all'||m.stage===f.stage)&&(f.district==='all'||team(m.home).district===f.district)&&(f.province==='all'||m.province===f.province)&&(f.zone==='all'||m.zone===f.zone)&&(mode==='all'||mode==='results'?mode==='all'||m.resultConfirmed:!m.resultConfirmed)&&(date==='all'||m.date===date)&&(!query||(team(m.home).name+' '+team(m.away).name).includes(query))).sort((a,b)=>mode==='results'?b.date.localeCompare(a.date):a.date.localeCompare(b.date)||a.time.localeCompare(b.time));
 }
 function standings(zone='n1'){
  const ids=zone==='n1'?['mr','ma','cr','ms']:[];
  const rows=Object.fromEntries(ids.map(id=>[id,{id,mp:0,w90:0,wpk:0,lpk:0,l90:0,gf:0,ga:0,gd:0,pts:0,form:[]}]));
  for(const m of MATCHES.map(publicMatch).filter(m=>m&&m.stage==='3'&&m.resultConfirmed&&m.zone===zone)){
   const h=rows[m.home],a=rows[m.away];if(!h||!a)continue;const s=m.score;h.mp++;a.mp++;h.gf+=s.home;h.ga+=s.away;a.gf+=s.away;a.ga+=s.home;
   if(s.penHome!==undefined){const w=s.penHome>s.penAway?h:a,l=w===h?a:h;w.wpk++;w.pts+=2;l.lpk++;l.pts++;w.form.push('PK');l.form.push('LP');}
   else{const w=s.home>s.away?h:a,l=w===h?a:h;w.w90++;w.pts+=3;l.l90++;w.form.push('W');l.form.push('L');}
  }
  return Object.values(rows).map(r=>({...r,gd:r.gf-r.ga})).sort((a,b)=>b.pts-a.pts);
 }
 function registrationState(today){return today<registration.opens?'upcoming':registration.closes&&today>registration.closes?'closed':'open';}
 function datesToOpen(today){return Math.max(0,Math.ceil((Date.parse(registration.opens+'T00:00:00+07:00')-Date.parse(today+'T00:00:00+07:00'))/86400000));}
 const DATA={PROVINCES,STAGES,ZONES,TEAMS,MATCHES,registration,team,normalize,publicMatch,fixtures,standings,registrationState,datesToOpen};
 root.PUBLIC_PMYC=DATA;if(typeof module!=='undefined')module.exports=DATA;
})(globalThis);
