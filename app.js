'use strict';
// Homepage entry points lead to the dedicated school-account page.
['sign-in', 'get-started', 'closing-start', 'mobile-sign-in'].forEach(id => {
  const el = document.getElementById(id);
  if (el) el.addEventListener('click', () => { window.location.href = 'auth.html?mode=signin'; });
});

const M = window.SSMotion;
M.initLenis();

function heroEntrance() {
  if (!M.hasGsap() || M.reduced()) return;
  const swash = document.querySelector('.swash svg path');
  const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });
  tl.from('.sticker', { opacity: 0, y: -10, rotate: -10, duration: .5 })
    .from('h1', { opacity: 0, y: 22, duration: .7 }, '-=.25')
    .from('.hero-lede', { opacity: 0, y: 16, duration: .6 }, '-=.4')
    .from('.hero-actions > *', { opacity: 0, y: 12, duration: .5, stagger: .08 }, '-=.35')
    .from('.hero-note', { opacity: 0, duration: .5 }, '-=.2')
    .from('.desk-card', { opacity: 0, x: 26, rotate: 2, duration: .8, ease: 'power2.out' }, '-=.9')
    .from('.preview-item', { opacity: 0, x: 10, duration: .45, stagger: .08 }, '-=.45');
  if (swash) {
    const len = swash.getTotalLength();
    gsap.set(swash, { strokeDasharray: len, strokeDashoffset: len });
    tl.to(swash, { strokeDashoffset: 0, duration: .6, ease: 'power2.inOut' }, '-=.5');
  }
}

M.runLoader(() => {
  heroEntrance();
  M.initReveals();
  M.initMagnetic();
  M.initTilt();
});
