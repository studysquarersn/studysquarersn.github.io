'use strict';

/* ==========================================================================
   Study Square — shared theme system
   Included on every page. Reads/writes the same localStorage key so a
   theme choice carries across index.html and dashboard.html.

   Each page also runs its own tiny inline script right after <body> opens
   (see the HTML) that applies a saved dark preference before first paint —
   that part has to stay inline per-page to block rendering in time. This
   file owns everything after that: wiring the toggle buttons, animating
   the crossfade, and keeping every [data-theme-toggle] button in sync.
   ========================================================================== */
(function () {
  const STORAGE_KEY = 'study-square-theme';
  const root = document.documentElement;
  const metaThemeColor = document.querySelector('meta[name="theme-color"]');

  const themes = {
    light: {
      '--background': '#eaf4ff', '--surface': '#ffffff', '--surface-alt': '#dcedff',
      '--text': '#10192b', '--text-secondary': '#3e4f68', '--text-muted': '#7286a0',
      '--border': '#10192b', '--border-soft': 'rgba(16,25,43,.16)',
      '--sun': '#ffd400', '--sun-ink': '#10192b', '--sky': '#2e7bff', '--coral': '#ff5a4e', '--mint': '#00b884',
      '--shadow-color': '#10192b'
    },
    dark: {
      '--background': '#0b1220', '--surface': '#141f35', '--surface-alt': '#1b2a47',
      '--text': '#f3f7ff', '--text-secondary': '#c3d2e8', '--text-muted': '#8ca0bc',
      '--border': '#f3f7ff', '--border-soft': 'rgba(243,247,255,.16)',
      '--sun': '#ffd400', '--sun-ink': '#10192b', '--sky': '#5fa0ff', '--coral': '#ff6f63', '--mint': '#1be39b',
      '--shadow-color': '#ffd400'
    }
  };

  // Intermediate step for the animated crossfade, so the toggle doesn't
  // jump straight between two very different brightness levels.
  const themeMidpoints = {
    light: { '--background':'#eaf4ff', '--surface':'#f2f9ff', '--surface-alt':'#bcdcff', '--text':'#23395d', '--text-secondary':'#3e4f68', '--text-muted':'#7286a0', '--border':'#23395d', '--border-soft':'rgba(35,57,93,.2)', '--sun':'#ffd400', '--sun-ink':'#10192b', '--sky':'#2e7bff', '--coral':'#ff5a4e', '--mint':'#00b884', '--shadow-color':'#23395d' },
    dark: { '--background':'#3e4f68', '--surface':'#465c7c', '--surface-alt':'#33445c', '--text':'#f3f7ff', '--text-secondary':'#eaf4ff', '--text-muted':'#d0d9e3', '--border':'#f3f7ff', '--border-soft':'rgba(243,247,255,.24)', '--sun':'#ffd400', '--sun-ink':'#10192b', '--sky':'#5fa0ff', '--coral':'#ff6f63', '--mint':'#1be39b', '--shadow-color':'#ffd400' }
  };

  function getStoredTheme() {
    try { const saved = localStorage.getItem(STORAGE_KEY); return saved === 'dark' ? 'dark' : 'light'; } catch { return 'light'; }
  }
  function storeTheme(theme) {
    try { localStorage.setItem(STORAGE_KEY, theme); } catch { /* storage unavailable */ }
  }
  function prefersReducedMotion() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  let currentTheme = getStoredTheme();

  function syncToggleButtons(theme) {
    document.querySelectorAll('[data-theme-toggle]').forEach(toggle => {
      const label = toggle.querySelector('.theme-label');
      if (label) label.textContent = theme === 'light' ? 'Dark mode' : 'Light mode';
      toggle.setAttribute('aria-label', `Switch to ${theme === 'light' ? 'dark' : 'light'} mode`);
    });
    if (metaThemeColor) metaThemeColor.setAttribute('content', theme === 'light' ? '#EAF4FF' : '#0B1220');
  }

  /**
   * Apply a theme by setting CSS custom properties on the root element.
   * @param {'light'|'dark'} theme
   * @param {boolean} [animate=true] Set to false on initial load so there's
   *   no flash/animation on first paint.
   */
  function setTheme(theme, animate = true) {
    const next = themes[theme];
    if (!next) return;

    currentTheme = theme;
    document.body.setAttribute('data-theme', theme);
    storeTheme(theme);

    if (!animate || !window.gsap || prefersReducedMotion()) {
      Object.entries(next).forEach(([key, value]) => root.style.setProperty(key, value));
    } else {
      const midpoint = themeMidpoints[theme];
      gsap.to(root, {
        ...midpoint,
        duration: .24,
        ease: 'power1.inOut',
        onComplete: () => gsap.to(root, { ...next, duration: .34, ease: 'power2.out' })
      });
    }

    syncToggleButtons(theme);
  }

  document.querySelectorAll('[data-theme-toggle]').forEach(toggle => {
    toggle.addEventListener('click', () => setTheme(currentTheme === 'light' ? 'dark' : 'light'));
  });

  // Sync labels/meta immediately; colors were already applied by the
  // per-page inline script, so this call is animate:false and cheap.
  setTheme(currentTheme, false);

  window.addEventListener('storage', event => {
    if (event.key === STORAGE_KEY) setTheme(event.newValue === 'dark' ? 'dark' : 'light', false);
  });

  window.StudySquareTheme = { setTheme, getStoredTheme };
})();
