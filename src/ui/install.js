// =============================================================================
// WELCOME + INSTALL — the first-open greeting and how to add photo-pointer to
// your home screen (a real PWA install: full-screen, offline, no browser chrome).
// =============================================================================
// A new arrival sees a welcome pop-up that says what the app is and — because
// on iPhone/iPad the OS hides installing behind the Share sheet — spells out the
// platform-specific steps (or fires the native install sheet where the browser
// offers one). It shows once (remembered), and stays reachable afterwards from
// the Backup dialog. Nothing about installing shows once already installed.
// =============================================================================
import { el, closeOnBackdrop, toast } from './dom.js';
import { CHANGELOG, VERSION } from '../data/changelog.js';

// Manual "Check for updates" — asks the browser to re-fetch the service worker
// now. If a newer version exists it installs and takes control, and main.js's
// controllerchange handler reloads the page to it (so this button can end in an
// automatic refresh). Reports each step so the button label + a toast stay
// honest. Fails soft offline.
async function checkForUpdates(setStatus) {
  if (!('serviceWorker' in navigator)) { setStatus('unavailable'); return; }
  let reg = null;
  try { reg = await navigator.serviceWorker.getRegistration(); } catch { /* blocked */ }
  if (!reg) { setStatus('unavailable'); return; }
  setStatus('checking');
  let found = false;
  const onFound = () => { found = true; setStatus('updating'); };
  reg.addEventListener('updatefound', onFound);
  try {
    await reg.update();
  } catch {
    reg.removeEventListener('updatefound', onFound);
    setStatus('offline');
    return;
  }
  // No new worker turned up within a moment → we're already current.
  setTimeout(() => { reg.removeEventListener('updatefound', onFound); if (!found) setStatus('current'); }, 2000);
}

// The About-panel button that drives checkForUpdates and narrates the result.
function updateButton() {
  const btn = el('button', { class: 'update-btn', type: 'button' }, 'Check for updates');
  btn.addEventListener('click', () => {
    checkForUpdates((s) => {
      if (s === 'checking') { btn.disabled = true; btn.textContent = 'Checking…'; return; }
      if (s === 'updating') { btn.textContent = 'Updating…'; toast('New version found — updating…'); return; }
      btn.disabled = false; btn.textContent = 'Check for updates';
      if (s === 'current') toast(`You’re on the latest version (v${VERSION})`);
      else if (s === 'offline') toast('Can’t check for updates while offline');
      else if (s === 'unavailable') toast('Updates aren’t available in this browser');
    });
  });
  return btn;
}

const WELCOMED_KEY = 'pointer.welcomed';
const SEEN_VERSION_KEY = 'pointer.seenVersion';

// Compare x.y.z versions: >0 if a is newer than b.
function cmpVer(a, b) {
  const pa = String(a).split('.').map(Number);
  const pb = String(b).split('.').map(Number);
  for (let i = 0; i < 3; i++) { const d = (pa[i] || 0) - (pb[i] || 0); if (d) return d; }
  return 0;
}
function seenVersion() { try { return localStorage.getItem(SEEN_VERSION_KEY); } catch { return null; } }
function markVersionSeen() { try { localStorage.setItem(SEEN_VERSION_KEY, VERSION); } catch { /* private mode */ } }

// Chrome/Edge (Android + desktop) fire `beforeinstallprompt`; stash it so a
// button can open the real OS install sheet. iOS Safari never fires it — there
// the only route is Share → Add to Home Screen, which we spell out.
let deferredPrompt = null;
let justInstalled = false;
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredPrompt = e; });
  window.addEventListener('appinstalled', () => { justInstalled = true; deferredPrompt = null; });
}

export function isStandalone() {
  if (typeof window === 'undefined') return false;
  return window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

// iPadOS Safari reports as "MacIntel" with touch — treat it as iOS.
export function platform() {
  const ua = navigator.userAgent || '';
  const iOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (iOS) return 'ios';
  if (/Android/.test(ua)) return 'android';
  return 'desktop';
}

function welcomed() { try { return localStorage.getItem(WELCOMED_KEY) === '1'; } catch { return false; } }
function rememberWelcomed() { try { localStorage.setItem(WELCOMED_KEY, '1'); } catch { /* private mode — reappears */ } }

function canPrompt() { return !!deferredPrompt; }
async function promptInstall() {
  if (!deferredPrompt) return false;
  deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;
  deferredPrompt = null;
  return outcome === 'accepted';
}

// iOS Share glyph (square with an up arrow) so step 1 matches what's on screen.
const SHARE_GLYPH = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 15V4"/><path d="M8.5 7.5 12 4l3.5 3.5"/><path d="M6 11H5a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7a1 1 0 0 0-1-1h-1"/></svg>';

// el() has no innerHTML path; wrap raw SVG in a span so it can be a child.
function glyph(markup) {
  const s = document.createElement('span');
  s.className = 'inline-ico';
  s.setAttribute('aria-hidden', 'true');
  s.innerHTML = markup;
  return s;
}

// Platform-specific steps, shared by the welcome pop-up and the Backup entry.
function stepsFor(p) {
  if (p === 'ios') {
    return [
      el('p', {}, 'On iPhone or iPad, in Safari:'),
      el('ol', { class: 'install-steps' }, [
        el('li', {}, ['Tap the ', el('strong', {}, 'Share'), ' button ', glyph(SHARE_GLYPH), ' (bottom of the screen).']),
        el('li', {}, ['Scroll down and tap ', el('strong', {}, 'Add to Home Screen'), '.']),
        el('li', {}, ['Tap ', el('strong', {}, 'Add'), '. photo-pointer lands on your home screen, opens full-screen, and works offline in the field.']),
      ]),
      el('p', { class: 'dim' }, '“Add to Home Screen” is a Safari feature. If you’re in Chrome or another browser, open this page in Safari first.'),
    ];
  }
  if (p === 'android') {
    return [
      el('p', {}, 'On Android, in Chrome:'),
      el('ol', { class: 'install-steps' }, [
        el('li', {}, ['Tap ', el('strong', {}, 'Install app'), ' above, or open the ', el('strong', {}, '⋮'), ' menu and choose ', el('strong', {}, 'Install app'), ' (or ', el('strong', {}, 'Add to Home screen'), ').']),
        el('li', {}, 'Confirm. photo-pointer installs and opens full-screen — offline-ready.'),
      ]),
    ];
  }
  return [
    el('p', {}, 'On a computer, in Chrome or Edge:'),
    el('ol', { class: 'install-steps' }, [
      el('li', {}, ['Click ', el('strong', {}, 'Install app'), ' above, or the install icon in the address bar (a monitor with a ↓).']),
      el('li', {}, 'Confirm. photo-pointer opens in its own window.'),
    ]),
  ];
}

// A native Install button when the browser offers one, then the written steps.
function installBody() {
  if (isStandalone()) return [el('p', { class: 'install-done' }, '✓ photo-pointer is installed — you’re running the home-screen app.')];
  if (justInstalled) return [el('p', { class: 'install-done' }, '✓ Installed. Open photo-pointer from your home screen.')];
  const kids = [];
  if (canPrompt()) {
    const btn = el('button', {
      class: 'tip-primary',
      onClick: async () => {
        const ok = await promptInstall();
        if (ok) btn.replaceWith(el('p', { class: 'install-done' }, '✓ Installing — look for photo-pointer on your home screen.'));
      },
    }, 'Install app');
    kids.push(btn);
  }
  kids.push(...stepsFor(platform()));
  return kids;
}

// WHY the app exists — the product thesis, in the user's terms.
function whySection() {
  return [
    el('p', {}, 'Photo scouting is scattered across a dozen apps that don’t talk to each other — viewpoints in one, historic markers in another, campsites, trailheads, bird hotspots and dark-sky maps all separate.'),
    el('p', {}, 'photo-pointer pulls them onto one region map, built only on free, license-clean open data, and puts a photographer’s questions first: what’s the subject, when’s the light, how hard is the access. It’s a personal tool — free, on your device, works offline, no account.'),
  ];
}

// The changelog, collapsed behind a native disclosure so it's there when wanted
// and out of the way otherwise.
function changelogSection() {
  return el('details', { class: 'changelog' }, [
    el('summary', {}, 'What’s new'),
    el('ul', { class: 'changelog-list' }, CHANGELOG.map((c) =>
      el('li', {}, [
        el('span', { class: 'cl-v' }, c.v),
        el('span', { class: 'cl-t' }, c.t),
        el('span', { class: 'cl-n' }, c.n),
      ])
    )),
  ]);
}

// The ⓘ panel: why the app exists, how to install it, and the changelog — all
// in one place. `welcome` frames it as a greeting on first open; `onShowAll`
// (optional) adds a one-tap way out of the empty map.
export function openAbout({ welcome = false, onShowAll } = {}) {
  const dlg = el('dialog', { class: 'welcome-dialog' }, [
    el('button', { class: 'welcome-x', 'aria-label': 'Close', onClick: () => dlg.close() }, '×'),
    el('h2', {}, welcome ? 'Welcome to photo-pointer' : 'About photo-pointer'),
    ...whySection(),
    onShowAll
      ? el('p', { class: 'dim' }, 'The map opens with every pin type off, so it starts empty — turn on a category up top, or:')
      : null,
    onShowAll
      ? el('button', { class: 'tip-primary', onClick: () => { onShowAll(); dlg.close(); } }, 'Show all pins')
      : null,
    el('h3', { class: 'welcome-sub' }, 'Drop your own pins'),
    el('p', {}, [
      'Press and hold anywhere on the map — a long-press on a phone, or a right-click on a computer — to drop your own pin and give it a name. ',
      'It saves on this device only.',
    ]),
    el('p', {}, [
      'To remove one, tap a pin you dropped and choose ', el('strong', {}, 'Remove pin'), ' (you get an undo). ',
      'Back up your pins and saved favorites, or move them to another device, from the ', el('strong', {}, '⤓'), ' button in the top bar.',
    ]),
    el('h3', { class: 'welcome-sub' }, 'Add it to your home screen'),
    el('p', { class: 'dim' }, 'photo-pointer runs best installed: full-screen, and offline in the field with no signal.'),
    ...installBody(),
    el('h3', { class: 'welcome-sub' }, 'Updates'),
    el('p', { class: 'dim' }, 'photo-pointer updates itself the next time you open it — no need to reinstall. To pull the newest version right now:'),
    updateButton(),
    changelogSection(),
    el('div', { class: 'dialog-row welcome-foot' }, [
      el('button', { class: 'dialog-close', onClick: () => dlg.close() }, welcome ? 'Start exploring' : 'Close'),
      el('span', { class: 'cl-stamp' }, `Version ${VERSION}`),
    ]),
  ]);
  dlg.addEventListener('close', () => dlg.remove());
  closeOnBackdrop(dlg);
  document.body.append(dlg);
  dlg.showModal();
  if (welcome) { rememberWelcomed(); markVersionSeen(); }
}

// Show the welcome pop-up on a first visit only. Returns true if it opened, so
// the caller can skip any other first-open prompt. Never shows once installed.
export function maybeShowWelcome(opts) {
  if (welcomed() || isStandalone()) return false;
  openAbout({ welcome: true, ...opts });
  return true;
}

// "What's new" — the changelog entries added since this device last opened the
// app. Shown after an update (not on a first visit — the welcome covers that,
// and it seeds the seen version). Newest-first, just the fresh entries.
export function openWhatsNew(entries) {
  const dlg = el('dialog', { class: 'welcome-dialog whatsnew-dialog' }, [
    el('button', { class: 'welcome-x', 'aria-label': 'Close', onClick: () => dlg.close() }, '×'),
    el('h2', {}, 'What’s new'),
    el('p', { class: 'dim' }, `You’re now on version ${VERSION}.`),
    el('ul', { class: 'changelog-list' }, entries.map((c) =>
      el('li', {}, [
        el('span', { class: 'cl-v' }, c.v),
        el('span', { class: 'cl-t' }, c.t),
        el('span', { class: 'cl-n' }, c.n),
      ])
    )),
    el('div', { class: 'dialog-row welcome-foot' }, [
      el('button', { class: 'dialog-close', onClick: () => dlg.close() }, 'Got it'),
    ]),
  ]);
  dlg.addEventListener('close', () => dlg.remove());
  closeOnBackdrop(dlg);
  document.body.append(dlg);
  dlg.showModal();
}

// Show "What's new" when the app has updated since this device last saw it.
// Returns true if it opened. First-ever run (no baseline) shows just the current
// entry, so the very first rollout of this feature still surfaces once; after
// that it's the exact delta. A brand-new user never reaches here (the welcome
// runs first and seeds the version).
export function maybeShowWhatsNew() {
  const seen = seenVersion();
  if (seen === VERSION) return false;
  markVersionSeen();
  const fresh = seen ? CHANGELOG.filter((c) => cmpVer(c.v, seen) > 0) : CHANGELOG.slice(0, 1);
  if (!fresh.length) return false;
  openWhatsNew(fresh);
  return true;
}
