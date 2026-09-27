'use strict';

/* ==========================================================================
   Study Square — shared mobile nav panel
   Included on every page that has the hamburger header (#mobile-menu /
   #mobile-nav — same markup pattern on index.html and dashboard.html).
   Exposes window.StudySquareNav.close() so a page-specific script (e.g.
   opening a dialog from a link inside the panel) can close it too.
   ========================================================================== */
(function () {
  const menuButton = document.getElementById('mobile-menu');
  const nav = document.getElementById('mobile-nav');
  if (!menuButton || !nav) return;

  function setOpen(open) {
    nav.hidden = !open;
    menuButton.setAttribute('aria-expanded', String(open));
  }

  menuButton.addEventListener('click', () => setOpen(nav.hidden));
  nav.querySelectorAll('a').forEach(link => link.addEventListener('click', () => setOpen(false)));

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !nav.hidden) setOpen(false);
  });

  // Close if the viewport grows past the mobile breakpoint while open
  // (rotating a tablet, resizing a window) so it doesn't linger.
  window.addEventListener('resize', () => {
    if (window.innerWidth > 900 && !nav.hidden) setOpen(false);
  });

  window.StudySquareNav = { close: () => setOpen(false) };
})();
