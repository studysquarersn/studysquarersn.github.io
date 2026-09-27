'use strict';
const SESSION_KEY='study-square-session';
let session=null;
try{session=JSON.parse(localStorage.getItem(SESSION_KEY)||'null')}catch{}
if(!session?.email){location.replace('auth.html?mode=signin');}
const email=session?.email||'';
document.getElementById('account-email').textContent=email;
document.getElementById('welcome-title').textContent=email?`Welcome, ${email.split('@')[0].split(/[._-]/)[0]}.`:'Your study space.';
document.getElementById('today-label').textContent=new Date().toLocaleDateString(undefined,{weekday:'long',month:'long',day:'numeric'});
const key='study-square-data:'+email.toLowerCase();
function load(){try{const d=JSON.parse(localStorage.getItem(key)||'{}');return{subjects:Array.isArray(d.subjects)?d.subjects:[],tasks:Array.isArray(d.tasks)?d.tasks:[]}}catch{return{subjects:[],tasks:[]}}}
let data=load();const $=id=>document.getElementById(id);const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));const uid=()=>crypto.randomUUID?crypto.randomUUID():Date.now().toString(36)+Math.random().toString(36).slice(2);

const M=window.SSMotion;

// Animate a stat number counting up to its new value.
function animateStat(el,value){
  const from=Number(el.textContent)||0;
  if(!M?.hasGsap()||M.reduced()||from===value){el.textContent=value;return}
  gsap.to({v:from},{v:value,duration:.5,ease:'power2.out',onUpdate:function(){el.textContent=Math.round(this.targets()[0].v)}});
}

function save(){localStorage.setItem(key,JSON.stringify(data));render()}
function openModal(id){$(id).hidden=false;$(id).querySelector('input,select')?.focus();if(M?.hasGsap()&&!M.reduced())gsap.from($(id).querySelector('.workspace-modal'),{scale:.92,opacity:0,y:14,duration:.35,ease:'back.out(1.8)'})}
function closeModal(id){$(id).hidden=true}
let toastTimer,toastHideTimer;
function showToast(message){
  const toast=$('workspace-toast');
  clearTimeout(toastTimer);clearTimeout(toastHideTimer);
  toast.textContent=message;toast.hidden=false;toast.classList.remove('toast-visible','toast-hiding');
  void toast.offsetWidth;
  toast.classList.add('toast-visible');
  toastTimer=setTimeout(()=>{
    toast.classList.remove('toast-visible');toast.classList.add('toast-hiding');
    toastHideTimer=setTimeout(()=>{toast.hidden=true;toast.classList.remove('toast-hiding')},220);
  },3200);
}
document.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>closeModal(b.dataset.close)));
document.querySelectorAll('.modal-backdrop').forEach(m=>m.addEventListener('click',e=>{if(e.target===m)m.hidden=true}));
$('open-subject').addEventListener('click',()=>showToast('Subject setup is unavailable right now.'));
$('open-task').addEventListener('click',()=>{if(!data.subjects.length){showToast('Add a subject before adding schoolwork.');return}populateSubjects();openModal('task-modal')});
function populateSubjects(){$('task-subject').innerHTML=data.subjects.map(s=>`<option value="${s.id}">${esc(s.name)}</option>`).join('')}
$('task-form').addEventListener('submit',e=>{e.preventDefault();const title=$('task-title').value.trim(),subjectId=$('task-subject').value;if(!title||!subjectId)return;data.tasks.push({id:uid(),title,subjectId,due:$('task-due').value,done:false});$('task-form').reset();closeModal('task-modal');save()});

function render(){
  animateStat($('stat-subjects'),data.subjects.length);
  animateStat($('stat-tasks'),data.tasks.length);
  animateStat($('stat-done'),data.tasks.filter(t=>t.done).length);

  const sc=$('subjects-content');
  if(!data.subjects.length){
    sc.innerHTML=`<div class="empty-state"><div class="empty-icon" aria-hidden="true"><span class="icon-slot" data-icon="Information"></span></div><h3>No subjects yet</h3><p>Your workspace is blank by design. Add the subjects you study to start building your own space.</p><button class="solid-button" id="empty-add-subject">Add your first subject</button></div>`;
    $('empty-add-subject').addEventListener('click',()=>showToast('Subject setup is unavailable right now.'));
  } else {
    sc.innerHTML=`<div class="subject-grid-new">${data.subjects.map(s=>`<article class="subject-tile"><div class="tile-top"><span class="tile-monogram">${esc(s.name.split(/\s+/).slice(0,2).map(w=>w[0]).join('').toUpperCase())}</span><button class="delete-mini" data-delete-subject="${s.id}" aria-label="Remove ${esc(s.name)}"><span class="icon-slot" data-icon="Trash3"></span></button></div><h3>${esc(s.name)}</h3><p>${data.tasks.filter(t=>t.subjectId===s.id&&!t.done).length} open · ${data.tasks.filter(t=>t.subjectId===s.id&&t.done).length} completed</p></article>`).join('')}</div>`;
    M?.bounceIn('.subject-tile');
  }

  const tc=$('tasks-content');
  if(!data.tasks.length){
    tc.innerHTML=`<div class="empty-state"><div class="empty-icon" aria-hidden="true"><span class="icon-slot" data-icon="Information"></span></div><h3>No schoolwork yet</h3><p>Assignments will appear here after you add them. Your list stays empty until then.</p>${data.subjects.length?'<button class="outline-button" id="empty-add-task">Add schoolwork</button>':''}</div>`;
    if($('empty-add-task'))$('empty-add-task').addEventListener('click',()=>{populateSubjects();openModal('task-modal')});
  } else {
    tc.innerHTML=`<div class="task-list">${data.tasks.map(t=>{const s=data.subjects.find(x=>x.id===t.subjectId);return `<div class="task-row ${t.done?'task-done':''}"><input type="checkbox" data-toggle-task="${t.id}" ${t.done?'checked':''} aria-label="Mark ${esc(t.title)} complete"><div class="task-text"><strong>${esc(t.title)}</strong><small>${esc(s?.name||'Subject removed')}${t.due?' · Due '+esc(t.due):''}</small></div><button class="delete-mini" data-delete-task="${t.id}" aria-label="Delete ${esc(t.title)}"><span class="icon-slot" data-icon="Trash3"></span></button></div>`}).join('')}</div>`;
    M?.bounceIn('.task-row');
  }
}

document.addEventListener('click',e=>{
  const s=e.target.closest('[data-delete-subject]');
  if(s){const id=s.dataset.deleteSubject;data.subjects=data.subjects.filter(x=>x.id!==id);data.tasks=data.tasks.filter(t=>t.subjectId!==id);save()}
  const t=e.target.closest('[data-delete-task]');
  if(t){data.tasks=data.tasks.filter(x=>x.id!==t.dataset.deleteTask);save()}
});
document.addEventListener('change',e=>{
  const c=e.target.closest('[data-toggle-task]');
  if(c){
    const t=data.tasks.find(x=>x.id===c.dataset.toggleTask);
    if(t){
      t.done=c.checked;
      if(t.done&&M?.hasGsap()&&!M.reduced()){const row=c.closest('.task-row');gsap.fromTo(row,{scale:1},{scale:1.02,duration:.15,yoyo:true,repeat:1,ease:'power1.inOut'})}
    }
    save();
  }
});
$('sign-out').addEventListener('click',()=>{localStorage.removeItem(SESSION_KEY);location.href='index.html'});
document.addEventListener('keydown',e=>{if(e.key==='Escape')document.querySelectorAll('.modal-backdrop:not([hidden])').forEach(m=>m.hidden=true)});

M?.initLenis();
render();
M?.initReveals();
M?.initMagnetic();
