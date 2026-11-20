/* Real forms only. No seed, localStorage, demo role or client approval authority. */
(()=>{'use strict';
 document.querySelectorAll('[data-women-form]').forEach(form=>form.addEventListener('submit',async event=>{
  event.preventDefault();if(form.hasAttribute('data-women-wizard')&&form.querySelector('[data-register-step="2"]').hidden){form.querySelector('[data-register-next]').click();return;}if(!form.reportValidity())return;if(form.dataset.confirm&&!window.confirm(form.dataset.confirm))return;
  const buttons=[...form.querySelectorAll('button')];buttons.forEach(b=>b.disabled=true);
  let message=form.querySelector('[data-form-message]');if(!message){message=document.createElement('p');message.dataset.formMessage='';message.setAttribute('role','alert');form.prepend(message);}message.textContent='กำลังบันทึก…';
  try{const response=await fetch(form.action,{method:'POST',body:new FormData(form),credentials:'same-origin',headers:{Accept:'application/json'}});const data=await response.json();if(!response.ok||!data.success)throw Error(data.error||'ไม่สามารถบันทึกได้');location.assign(data.redirectUrl||location.href);}
  catch(error){message.textContent=error.message;buttons.forEach(b=>b.disabled=false);}
 }));
 const wizard=document.querySelector('[data-women-wizard]');if(!wizard)return;
 let step=0;const panels=[...wizard.querySelectorAll('[data-register-step]')],next=wizard.querySelector('[data-register-next]'),back=wizard.querySelector('[data-register-back]'),submit=wizard.querySelector('[data-register-submit]');
 function draw(){panels.forEach((p,i)=>{p.hidden=i!==step;p.querySelectorAll('input,select,textarea').forEach(f=>f.disabled=i!==step&&step!==2);});back.hidden=step===0;next.hidden=step===2;submit.hidden=step!==2;
  document.querySelectorAll('[data-step-indicator]').forEach((p,i)=>p.classList.toggle('active',i===step));
  if(step===2){panels.forEach(p=>p.querySelectorAll('input,select,textarea').forEach(f=>f.disabled=false));const summary=wizard.querySelector('[data-register-summary]');summary.replaceChildren();for(const name of ['team_name','province','district','manager_name','email','phone']){const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=wizard.elements[name].closest('label').childNodes[0].textContent;dd.textContent=wizard.elements[name].value;summary.append(dt,dd);}}
 }
 next.addEventListener('click',()=>{for(const f of panels[step].querySelectorAll('input,select,textarea'))if(!f.reportValidity())return;step=Math.min(2,step+1);draw();});back.addEventListener('click',()=>{step=Math.max(0,step-1);draw();});
 wizard.elements.enroll_women.addEventListener('change',()=>submit.textContent=wizard.elements.enroll_women.checked?'ลงทะเบียนทีมและสมัครรุ่น18 (หญิง)':'ลงทะเบียนบัญชีทีมเท่านั้น');
 const province=wizard.querySelector('[data-women-province]'),district=wizard.querySelector('[data-women-district]');
 const areas=window.thaiAdministrativeDivisions;
 function fill(select,values,placeholder){select.replaceChildren(new Option(placeholder,''),...values.map(v=>new Option(v,v)));}
 if(areas?.districts){fill(province,Object.keys(areas.districts),'เลือกจังหวัด');province.addEventListener('change',()=>fill(district,areas.districts[province.value]||[],'เลือกอำเภอ/เขต'));}
 const cp=wizard.querySelector('[data-contact-province]'),cd=wizard.querySelector('[data-contact-district]');if(areas?.districts&&cp&&cd){fill(cp,Object.keys(areas.districts),'ใช้จังหวัดเดียวกับทีม');cp.addEventListener('change',()=>fill(cd,areas.districts[cp.value]||[],'เลือกอำเภอที่อยู่ติดต่อ'));}
 draw();
})();
