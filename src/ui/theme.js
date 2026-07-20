// Light/dark theme. State in localStorage 'pointer.theme'; an inline boot
// script in index.html applies it pre-paint so there is no flash.

import { el } from './dom.js';

function stored() {
  try {
    return localStorage.getItem('pointer.theme');
  } catch {
    return null;
  }
}

export function currentTheme() {
  return stored() ?? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
}

export function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    meta.content = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
  }
}

export function themeToggle(onChange) {
  const btn = el('button', {
    class: 'theme-toggle',
    'aria-label': 'Switch between light and dark theme',
    onClick: () => {
      const next = currentTheme() === 'dark' ? 'light' : 'dark';
      try {
        localStorage.setItem('pointer.theme', next);
      } catch { /* private mode */ }
      applyTheme(next);
      btn.textContent = next === 'dark' ? '☀' : '☾';
      onChange?.(next);
    },
  }, currentTheme() === 'dark' ? '☀' : '☾');
  return btn;
}
