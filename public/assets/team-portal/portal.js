(function(){'use strict';
 const toggle=document.getElementById('teamMenuToggle'),sidebar=document.getElementById('sidebar'),overlay=document.getElementById('teamDrawerOverlay'),main=document.getElementById('main');
 if(!toggle||!sidebar||!overlay||!main)return;let open=false,dirty=false;
 function setMenu(value){open=value;sidebar.classList.toggle('open',open);overlay.classList.toggle('visible',open);toggle.setAttribute('aria-expanded',String(open));main.inert=open;if(open){const first=sidebar.querySelector('a');if(first)first.focus();}else toggle.focus();}
 toggle.addEventListener('click',()=>setMenu(!open));overlay.addEventListener('click',()=>setMenu(false));
 document.addEventListener('keydown',e=>{if(open&&e.key==='Escape'){e.preventDefault();setMenu(false);}if(open&&e.key==='Tab'){const nodes=Array.from(sidebar.querySelectorAll('a,button:not(:disabled)')).filter(n=>n.getClientRects().length);if(!nodes.length)return;const first=nodes[0],last=nodes[nodes.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}});
 window.addEventListener('resize',()=>{if(open&&window.innerWidth>800)setMenu(false);});document.addEventListener('show.bs.modal',()=>{if(open)setMenu(false);});
 document.addEventListener('input',e=>{const field=e.target;if(field&&field.closest&&field.closest('form')&&!field.closest('#supportReportModal'))dirty=true;});
 document.addEventListener('click',e=>{const a=e.target.closest&&e.target.closest('.side-nav a');if(!a)return;if(dirty&&!window.confirm('ข้อมูลที่กรอกยังไม่ได้บันทึก ต้องการออกจากหน้านี้หรือไม่?'))e.preventDefault();});
})();
