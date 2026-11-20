(() => {
  const node=document.querySelector('#home-statistics-summary');
  if(!node)return;
  const api=new URL(document.currentScript.src);
  api.pathname=api.pathname.replace('/assets/registration-statistics/home.js','/api/public/registration-statistics');
  api.search='';
  function reloadButton(){
    const button=document.createElement('button');button.type='button';button.className='btn btn-sm';button.textContent='โหลดข้อมูลใหม่';button.addEventListener('click',()=>location.reload());node.appendChild(button);
  }
  return fetch(api,{credentials:'same-origin',cache:'no-store'}).then(r=>{if(!r.ok)throw new Error('unavailable');return r.json();}).then(data=>{
    if(data.includesCancelled!==false)throw new Error('invalid statistics definition');
    const districts=data.provinces.flatMap(p=>p.districts);
    const registered=districts.filter(d=>d.ages.some(n=>n>0)).length;
    document.querySelector('#home-statistics-total').textContent=data.ages.reduce((a,b)=>a+b,0).toLocaleString();
    document.querySelector('#home-statistics-provinces').textContent=data.provinces.length.toLocaleString();
    document.querySelector('#home-statistics-districts').textContent=districts.length.toLocaleString();
    document.querySelector('#home-statistics-gaps').textContent='ดู '+(districts.length-registered).toLocaleString()+' พื้นที่ที่ยังไม่มีทีมสมัคร →';
    node.textContent='ยังไม่มีทีมสมัคร '+(districts.length-registered)+' พื้นที่ · มีทีมสมัครแล้ว '+registered+' พื้นที่ · ไม่รวมรุ่นที่ยกเลิกการสมัคร';
    reloadButton();
  }).catch(()=>{
    for(const id of ['total','provinces','districts']){const el=document.querySelector('#home-statistics-'+id);if(el)el.textContent='—';}
    const gaps=document.querySelector('#home-statistics-gaps');if(gaps)gaps.textContent='ดูข้อมูลสถิติการสมัคร →';
    node.textContent='ยังไม่สามารถแสดงสถิติได้ กรุณาโหลดข้อมูลใหม่';reloadButton();
  });
})();
