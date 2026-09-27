# Study Square

A responsive student workspace prototype with a public landing page, dedicated school-account sign-in/create-account page, and a clean dashboard that starts empty.

## Design system (2026 refresh)

The whole site — home, sign in / create account, and dashboard — now shares one "notebook desk" visual language:

- **Look:** soft neo-brutalism. Thick ink borders, hard offset shadows that lift on hover, rounded corners (friendly rather than harsh), sticker badges, washi-tape accents, and a highlighter swash under the hero headline.
- **Color:** pale-sky background, near-black ink for text/borders, three accents — sun yellow, sky blue, coral — carried over and pushed bolder from the original brand palette. Dark mode flips borders to off-white and shadows to a yellow glow.
- **Type:** Bricolage Grotesque for headings/display (playful, chunky), Plus Jakarta Sans for everything else (rounded, easy to read).
- **Motion:** Lenis smooth scroll, a GSAP entrance sequence + scroll reveals, magnetic buttons, mouse-tilt 3D on cards, a custom cursor dot, and a page loader on the home page. Everything respects `prefers-reduced-motion` and degrades gracefully with no JavaScript at all — the site is fully usable either way.
- **New shared file:** `motion.js` holds all of the above as small reusable helpers (`SSMotion`), included on every page.

**On React Bits:** it's a React component library, and this project is plain HTML/CSS/JS, so it can't be imported directly. The same playful, over-engineered interactions (magnetic buttons, tilt, reveals) were hand-built with GSAP instead to get an equivalent feel without adding a framework.

**Logo note:** the source `logo.png` had large transparent padding baked in, which made it nearly invisible at header size — it's been trimmed to its visible mark. A separate `favicon.png` (the mark on a solid color tile) is used for the browser tab and social-share previews, since the original file was solid near-white and invisible on a plain white tab background.

All of this is layered on top of the same functionality as before — no business logic changed (see below).

## Run locally

Open `index.html` in a browser, or serve this folder through a local web server (recommended for browser cryptography APIs). For example, with Python:

```bash
python -m http.server 8000
```

Then open `http://localhost:8000`.

## School email rule

The account interface accepts addresses matching the Rusinga student format, for example `john.doe@student.rusinga.ac.ke`. The domain is restricted to `student.rusinga.ac.ke`.

## Important security limitation

This is a **front-end prototype, not a production authentication system**. It uses browser-local storage for demo accounts and workspace data, and a salted PBKDF2 password hash for the demo password. It cannot verify that a user owns their school email, securely protect accounts across devices, or provide server-side authorization. Do not use real or reused passwords. A production deployment needs a backend, verified school-email ownership (verification link or school SSO), server-side password hashing and session management, rate limiting, secure cookies, and authorization checks.

## Dashboard behavior

- New accounts begin with no subjects and no assignments.
- Students add and remove their own subjects and schoolwork.
- Completion counts update from the user's actual task data.
- Workspace data is stored separately per school email in this browser.
- Signing out clears the active session but does not delete the demo account or its saved workspace.

