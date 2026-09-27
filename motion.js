'use strict';
/* ==========================================================================
   Study Square — shared motion system
   Powers: smooth scroll (Lenis), entrance choreography + scroll reveals
  (GSAP + ScrollTrigger), magnetic buttons, 3D tilt cards, and the page loader.
  Included on every page, after the GSAP /
   Lenis CDN tags and before each page's own script.
   ========================================================================== */
window.SSMotion = (function () {
  const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const hasGsap = () => !!window.gsap;
  if (hasGsap() && window.ScrollTrigger) gsap.registerPlugin(ScrollTrigger);

  /* ---------- Smooth scroll ---------- */
  function initLenis() {
    if (!window.Lenis || reduced()) return null;
    const lenis = new Lenis({ duration: 1.05, smoothWheel: true, syncTouch: false, easing: t => 1 - Math.pow(1 - t, 3) });
    function raf(time) { lenis.raf(time); requestAnimationFrame(raf); }
    requestAnimationFrame(raf);
    if (hasGsap() && window.ScrollTrigger) lenis.on('scroll', ScrollTrigger.update);
    return lenis;
  }

  /* ---------- Page loader ---------- */
  function runLoader(onDone) {
    const el = document.querySelector('.ss-loader');
    if (!el) { onDone && onDone(); return; }
    if (reduced() || !hasGsap()) { el.remove(); onDone && onDone(); return; }
    const fill = el.querySelector('.ss-loader-fill');
    const tl = gsap.timeline({ onComplete: () => { el.remove(); onDone && onDone(); } });
    tl.set(fill, { width: '0%' })
      .to(fill, { width: '100%', duration: .7, ease: 'power2.inOut' })
      .to(el, { yPercent: -100, duration: .6, ease: 'power3.inOut' }, '+=.05');
  }

  /* ---------- Scroll reveals ---------- */
  function initReveals(selector = '[data-reveal]') {
    document.body.classList.add('reveal-ready');
    if (!hasGsap() || reduced()) {
      document.querySelectorAll(selector).forEach(el => { el.style.opacity = 1; el.style.transform = 'none'; });
      return;
    }
    const groups = {};
    document.querySelectorAll(selector).forEach(el => {
      const key = el.dataset.revealGroup || el;
      (groups[key] = groups[key] || []).push(el);
    });
    Object.values(groups).forEach(els => {
      gsap.to(els, {
        opacity: 1, y: 0, duration: .8, ease: 'power3.out', stagger: .09,
        scrollTrigger: { trigger: els[0], start: 'top 88%' }
      });
    });
  }

  /* ---------- Magnetic buttons ---------- */
  function initMagnetic(selector = '.primary-button, .solid-button, .outline-button, .sign-in, .auth-submit, .theme-toggle') {
    if (reduced() || matchMedia('(hover: none)').matches) return;
    document.querySelectorAll(selector).forEach(btn => {
      let bound = false;
      const strength = 0.28;
      btn.addEventListener('mousemove', e => {
        const r = btn.getBoundingClientRect();
        const x = (e.clientX - r.left - r.width / 2) * strength;
        const y = (e.clientY - r.top - r.height / 2) * strength;
        if (hasGsap()) gsap.to(btn, { x, y, duration: .35, ease: 'power2.out' });
      });
      btn.addEventListener('mouseleave', () => {
        if (hasGsap()) gsap.to(btn, { x: 0, y: 0, duration: .5, ease: 'elastic.out(1, .4)' });
      });
    });
  }

  /* ---------- 3D tilt ---------- */
  function initTilt(selector = '[data-tilt]') {
    if (reduced() || matchMedia('(hover: none)').matches) return;
    document.querySelectorAll(selector).forEach(card => {
      const max = Number(card.dataset.tiltMax || 8);
      card.addEventListener('mousemove', e => {
        const r = card.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width - 0.5;
        const py = (e.clientY - r.top) / r.height - 0.5;
        if (hasGsap()) gsap.to(card, { rotateX: -py * max * 2, rotateY: px * max * 2, duration: .4, ease: 'power2.out', transformPerspective: 900 });
      });
      card.addEventListener('mouseleave', () => {
        if (hasGsap()) gsap.to(card, { rotateX: 0, rotateY: 0, duration: .6, ease: 'elastic.out(1, .5)' });
      });
    });
  }

  /* ---------- Generic helpers page scripts can call ---------- */
  function fromTo(target, from, to, opts = {}) {
    if (!hasGsap() || reduced()) return;
    gsap.fromTo(target, from, { ...to, ...opts });
  }
  function bounceIn(target, opts = {}) {
    if (!hasGsap() || reduced()) return;
    gsap.from(target, { scale: .9, opacity: 0, duration: .45, ease: 'back.out(2.2)', stagger: .05, ...opts });
  }

  return { reduced, hasGsap, initLenis, runLoader, initReveals, initMagnetic, initTilt, fromTo, bounceIn };
})();
