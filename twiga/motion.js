// Twiga — motion layer. Loaded before main.js, exposes window.Motion for it
// to call into (mainly `.reveal()` / `.shake()` when a new message appears).
//
// Everything here is defensive: GSAP and Lenis come from a CDN (see the
// <script> tags in index.html), so if a network blocks that CDN, or the
// person has prefers-reduced-motion set, the app must still work perfectly —
// it just won't bounce around while doing it. Every effect checks for its
// dependency before touching the DOM, and the loader has a hard failsafe
// timeout so nobody is ever stuck staring at it.

(() => {
  "use strict";

  const reducedMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const hasGsap = typeof window.gsap !== "undefined";
  const hasScrollTrigger = hasGsap && typeof window.ScrollTrigger !== "undefined";
  const hasLenis = typeof window.Lenis !== "undefined";
  const canAnimate = hasGsap && !reducedMotion;

  if (hasGsap && hasScrollTrigger) gsap.registerPlugin(ScrollTrigger);

  // ---------- Public API main.js calls into ----------
  window.Motion = {
    reveal(el) { revealIn(el); },
    shake(el) { shakeError(el); },
  };

  function revealIn(el) {
    if (!el) return;
    if (!canAnimate) { el.classList.add("reveal-fallback"); return; }
    gsap.fromTo(el, { y: 16, opacity: 0, scale: 0.97 }, { y: 0, opacity: 1, scale: 1, duration: 0.45, ease: "back.out(1.6)" });
  }
  function shakeError(el) {
    if (!el) return;
    if (!canAnimate) { el.classList.add("shake-fallback"); return; }
    gsap.fromTo(el, { x: 0 }, { x: 6, duration: 0.06, yoyo: true, repeat: 5, ease: "power1.inOut", clearProps: "x" });
  }

  // ---------- Loader ----------
  function runLoader() {
    const loader = document.getElementById("loader");
    if (!loader) return;

    const finishLoader = () => {
      if (loader.dataset.done) return;
      loader.dataset.done = "1";
      if (canAnimate) {
        gsap.to(loader, {
          opacity: 0, scale: 1.04, duration: 0.5, ease: "power2.inOut",
          onComplete: () => { loader.remove(); startEntrance(); },
        });
      } else {
        loader.remove();
        startEntrance();
      }
    };

    // Hard failsafe: no matter what happens with fonts/scripts/timings below,
    // the loader is gone within 4.5s.
    const failsafe = setTimeout(finishLoader, 4500);

    if (!canAnimate) { clearTimeout(failsafe); finishLoader(); return; }

    const paths = loader.querySelectorAll(".loader-mark path");
    paths.forEach((path) => {
      const length = path.getTotalLength();
      path.style.strokeDasharray = String(length);
      path.style.strokeDashoffset = String(length);
    });
    const word = loader.querySelector(".loader-word");
    const barFill = document.getElementById("loaderBarFill");

    const tl = gsap.timeline({ delay: 0.1 });
    tl.to(paths, { strokeDashoffset: 0, duration: 1, ease: "power2.inOut", stagger: 0.08 })
      .to(word, { opacity: 1, duration: 0.35 }, "-=0.5")
      .to(barFill, { width: "100%", duration: 0.6, ease: "power1.out" }, "-=0.5");

    const start = performance.now();
    const minimumMs = 1050;
    const settle = () => {
      const elapsed = performance.now() - start;
      const remaining = Math.max(0, minimumMs - elapsed);
      setTimeout(() => { clearTimeout(failsafe); finishLoader(); }, remaining);
    };
    if (document.readyState === "complete") settle();
    else window.addEventListener("load", settle, { once: true });
  }

  // ---------- Entrance reveal for the empty state ----------
  function startEntrance() {
    const targets = document.querySelectorAll("[data-reveal]");
    const mascot = document.getElementById("mascot");
    if (!canAnimate) return;
    if (mascot) gsap.fromTo(mascot, { y: 22, opacity: 0, rotate: -6 }, { y: 0, opacity: 1, rotate: 0, duration: 0.6, ease: "back.out(1.7)" });
    gsap.fromTo(targets, { y: 18, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5, ease: "power2.out", stagger: 0.08, delay: mascot ? 0.15 : 0 });
    const sidebarKids = document.querySelectorAll(".sidebar-head, .new-chat-button, .thread-list, .sidebar-foot");
    gsap.fromTo(sidebarKids, { x: -14, opacity: 0 }, { x: 0, opacity: 1, duration: 0.45, ease: "power2.out", stagger: 0.06 });
  }

  // ---------- Lenis smooth scroll, bound to the internal message list ----------
  function initLenis() {
    if (!hasLenis || !hasGsap || reducedMotion) return;
    const wrapper = document.getElementById("conversation");
    if (!wrapper) return;
    let lenis;
    try {
      lenis = new Lenis({ wrapper, content: wrapper, duration: 1.05, smoothWheel: true, wheelMultiplier: 1 });
    } catch { return; }
    lenis.on("scroll", () => { if (hasScrollTrigger) ScrollTrigger.update(); });
    gsap.ticker.add((time) => lenis.raf(time * 1000));
    gsap.ticker.lagSmoothing(0);
    window.__twigaLenis = lenis;
  }

  // ---------- 3D tilt for [data-tilt] elements (the mascot) ----------
  function initTilt() {
    if (!canAnimate) return;
    document.querySelectorAll("[data-tilt]").forEach((el) => {
      const strength = Number(el.dataset.tiltStrength) || 12;
      const rotX = gsap.quickTo(el, "rotationX", { duration: 0.4, ease: "power3.out" });
      const rotY = gsap.quickTo(el, "rotationY", { duration: 0.4, ease: "power3.out" });
      el.addEventListener("pointermove", (event) => {
        const rect = el.getBoundingClientRect();
        const relX = (event.clientX - rect.left) / rect.width - 0.5;
        const relY = (event.clientY - rect.top) / rect.height - 0.5;
        rotX(relY * -strength);
        rotY(relX * strength);
      });
      el.addEventListener("pointerleave", () => { rotX(0); rotY(0); });
    });
  }

  // ---------- Magnetic buttons: [data-magnetic] follow the cursor slightly ----------
  function initMagnetic() {
    if (!canAnimate) return;
    document.querySelectorAll("[data-magnetic]").forEach((el) => {
      const strength = Number(el.dataset.magneticStrength) || 0.3;
      const x = gsap.quickTo(el, "x", { duration: 0.35, ease: "power3.out" });
      const y = gsap.quickTo(el, "y", { duration: 0.35, ease: "power3.out" });
      el.addEventListener("pointermove", (event) => {
        const rect = el.getBoundingClientRect();
        x((event.clientX - rect.left - rect.width / 2) * strength);
        y((event.clientY - rect.top - rect.height / 2) * strength);
      });
      el.addEventListener("pointerleave", () => {
        gsap.to(el, { x: 0, y: 0, duration: 0.5, ease: "elastic.out(1, 0.4)" });
      });
    });
  }

  // ---------- Spotlight cursor tracking (pure CSS custom properties, no GSAP needed) ----------
  function initSpotlight() {
    const bind = (el) => {
      el.addEventListener("pointermove", (event) => {
        const rect = el.getBoundingClientRect();
        el.style.setProperty("--mx", `${event.clientX - rect.left}px`);
        el.style.setProperty("--my", `${event.clientY - rect.top}px`);
      });
    };
    document.querySelectorAll(".suggestion, .new-chat-button, .sidebar-profile").forEach(bind);
    const threadList = document.getElementById("threadList");
    if (threadList) {
      threadList.addEventListener("pointermove", (event) => {
        const item = event.target.closest(".thread-item");
        if (!item) return;
        const rect = item.getBoundingClientRect();
        item.style.setProperty("--mx", `${event.clientX - rect.left}px`);
        item.style.setProperty("--my", `${event.clientY - rect.top}px`);
      });
    }
  }

  // Each feature is independent and non-essential except the loader — if any
  // one of them throws (a future edit, a browser quirk, whatever), it must
  // not take the loader-removal or any other feature down with it.
  function safely(fn) {
    try { fn(); } catch (error) { console.error("Twiga motion layer:", error); }
  }
  function init() {
    // Absolute last-resort: whatever else goes wrong above, the loader is
    // gone within 6s. This timer is independent of runLoader's own internals.
    setTimeout(() => {
      const loader = document.getElementById("loader");
      if (loader && !loader.dataset.done) { loader.dataset.done = "1"; loader.remove(); }
    }, 6000);
    safely(runLoader);
    safely(initLenis);
    safely(initTilt);
    safely(initMagnetic);
    safely(initSpotlight);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
