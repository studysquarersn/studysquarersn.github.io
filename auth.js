'use strict';
const DOMAIN=/^[A-Za-z0-9]+(?:[._-][A-Za-z0-9]+)*@student\.rusinga\.ac\.ke$/i;
const ACCOUNTS='study-square-demo-accounts';const SESSION='study-square-session';
const $=id=>document.getElementById(id);
function accounts(){try{return JSON.parse(localStorage.getItem(ACCOUNTS)||'{}')}catch{return {}}}

const M=window.SSMotion;
const glider=$('auth-tab-glider');
function moveGlider(create){
  if(!glider)return;
  if(M?.hasGsap()&&!M.reduced())gsap.to(glider,{xPercent:create?100:0,duration:.4,ease:'back.out(1.6)'});
  else glider.style.transform=`translateX(${create?100:0}%)`;
}
function setMode(mode){const create=mode==='create';$('signin-form').hidden=create;$('create-form').hidden=!create;$('tab-signin').setAttribute('aria-selected',String(!create));$('tab-create').setAttribute('aria-selected',String(create));$('auth-title').textContent=create?'Create your account':'Welcome back';$('auth-subtitle').textContent=create?'Create a Study Square profile connected to your official school email.':'Use your Rusinga student email to continue to your workspace.';moveGlider(create)}
$('tab-signin').addEventListener('click',()=>setMode('signin'));$('tab-create').addEventListener('click',()=>setMode('create'));
const params=new URLSearchParams(location.search);if(params.get('mode')==='create')setMode('create');else moveGlider(false);

function shake(el){if(!el)return;el.classList.remove('shake');void el.offsetWidth;el.classList.add('shake')}

async function hashPassword(password,salt){const enc=new TextEncoder();const material=await crypto.subtle.importKey('raw',enc.encode(password),'PBKDF2',false,['deriveBits']);const bits=await crypto.subtle.deriveBits({name:'PBKDF2',salt:enc.encode(salt),iterations:210000,hash:'SHA-256'},material,256);return [...new Uint8Array(bits)].map(b=>b.toString(16).padStart(2,'0')).join('')}
function validEmail(email){return DOMAIN.test(email.trim())}

$('create-form').addEventListener('submit',async e=>{
  e.preventDefault();
  const email=$('create-email').value.trim().toLowerCase(),pw=$('create-password').value,confirm=$('create-confirm').value,msg=$('create-message');
  msg.className='auth-message';msg.textContent='';
  if(!validEmail(email)){msg.textContent='Use a valid school address ending in @student.rusinga.ac.ke.';shake($('create-form'));return}
  if(pw.length<12){msg.textContent='Your password must contain at least 12 characters.';shake($('create-form'));return}
  if(pw!==confirm){msg.textContent='The passwords do not match.';shake($('create-form'));return}
  const all=accounts();
  if(all[email]){msg.textContent='An account for this email already exists. Try signing in.';shake($('create-form'));return}
  const salt=crypto.randomUUID?crypto.randomUUID():String(Math.random())+Date.now();
  try{
    all[email]={salt,hash:await hashPassword(pw,salt),createdAt:new Date().toISOString()};
    localStorage.setItem(ACCOUNTS,JSON.stringify(all));
    localStorage.setItem(SESSION,JSON.stringify({email}));
    msg.className='auth-message success';msg.textContent='Account created. Opening your workspace…';
    setTimeout(()=>location.href='dashboard.html',350);
  }catch{msg.textContent='Secure browser storage is unavailable. Try a modern browser over localhost or HTTPS.';shake($('create-form'))}
});

$('signin-form').addEventListener('submit',async e=>{
  e.preventDefault();
  const email=$('signin-email').value.trim().toLowerCase(),pw=$('signin-password').value,msg=$('signin-message');
  msg.className='auth-message';msg.textContent='';
  if(!validEmail(email)){msg.textContent='Only @student.rusinga.ac.ke school accounts are accepted.';shake($('signin-form'));return}
  const record=accounts()[email];
  if(!record){msg.textContent='No Study Square account was found. Create an account first.';shake($('signin-form'));return}
  try{
    const hash=await hashPassword(pw,record.salt);
    if(hash!==record.hash){msg.textContent='Incorrect email or password.';shake($('signin-form'));return}
    localStorage.setItem(SESSION,JSON.stringify({email}));
    msg.className='auth-message success';msg.textContent='Signed in. Opening your workspace…';
    setTimeout(()=>location.href='dashboard.html',300);
  }catch{msg.textContent='Unable to sign in in this browser.';shake($('signin-form'))}
});

if(M?.hasGsap()&&!M.reduced()){
  gsap.from('.auth-pitch > *',{opacity:0,y:14,duration:.6,stagger:.08,ease:'power2.out'});
  gsap.from('.auth-card > *',{opacity:0,y:12,duration:.5,stagger:.06,ease:'power2.out',delay:.1});
}
M?.initMagnetic();
