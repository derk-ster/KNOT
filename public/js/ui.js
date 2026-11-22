// Small shared helpers: escaping, icons, avatars, the toast and picture resizing.
// Everything rendered from data goes through esc(); the only raw HTML is the fixed icon set below.

export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const cap = s => String(s).charAt(0).toUpperCase() + String(s).slice(1);
export const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));
export const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
export const initials = n => String(n || '?').trim().split(/\s+/).map(w => w[0] || '').slice(0, 2).join('').toUpperCase() || '?';
export const firstName = n => String(n || '').trim().split(/\s+/)[0] || '';
export const fmtTime = ts => new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const hueOf = n => [...String(n)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 360, 7);

const svg = (body, size = 18, stroke = 2) => `<svg viewBox="0 0 20 20" width="${size}" height="${size}" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
export const icon = {
  check: svg('<path d="M4 10.5l4 4 8-9"/>', 18, 2.2),
  alert: svg('<circle cx="10" cy="10" r="8"/><path d="M10 6v5M10 14h.01"/>'),
  x: svg('<path d="M5 5l10 10M15 5L5 15"/>', 16, 2.2),
  chev: svg('<path d="M5 8l5 5 5-5"/>', 16),
  send: svg('<path d="M3 10l14-6-5 13-2-5-7-2z"/>'),
  arrow: svg('<path d="M4 10h12M11 5l5 5-5 5"/>', 16),
  back: svg('<path d="M12 4l-6 6 6 6"/>', 16),
  photo: svg('<rect x="2.5" y="4" width="15" height="12" rx="2.5"/><circle cx="7.4" cy="8.4" r="1.4"/><path d="M3 14l4.3-4.2 3 2.8 2.7-2.5L17 14"/>', 18, 1.8),
  more: '<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" fill="currentColor"><circle cx="5" cy="10" r="1.7"/><circle cx="10" cy="10" r="1.7"/><circle cx="15" cy="10" r="1.7"/></svg>'
};

// A profile picture if there is one, otherwise coloured initials. Size is a class: '', 'sm', 'lg'.
export function avatar(name, pic, size = '') {
  const cls = `avatar ${size}`.trim();
  if (pic) return `<span class="${cls}" aria-hidden="true"><img src="${esc(pic)}" alt=""></span>`;
  return `<span class="${cls}" style="--hue:${hueOf(name || '?')}" aria-hidden="true">${esc(initials(name))}</span>`;
}

// The toast is the same sentence the screen reader hears, shown for a moment under the header.
let toastTimer = null;
export function toast(text, tone = '') {
  const box = $('#toast');
  if (!box) return;
  box.textContent = text;
  box.className = `toast on ${tone}`.trim();
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => box.classList.remove('on'), 3200);
}

// Go to a page. If the page is already the current hash, the route is run again so it re-renders.
export function navigate(hash) {
  if (location.hash === hash) window.dispatchEvent(new HashChangeEvent('hashchange'));
  else location.hash = hash;
}

export function copyText(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text).catch(() => {});
  const i = document.createElement('textarea');
  i.value = text; document.body.append(i); i.select();
  try { document.execCommand('copy'); } catch { /* old browsers */ }
  i.remove();
  return Promise.resolve();
}

// Shrinks a picture in this browser before it is sent. With a byte limit it re-encodes until it fits,
// so a photo is never refused after it was already shown. The server keeps message pictures under
// 300 KB and profile pictures under 400 KB; a data URL carries four characters for every three bytes.
export const imageLimit = kb => Math.floor(kb * 1024 * 4 / 3);
export function resizeImage(file, max = 512, maxChars = 0) {
  return new Promise((resolve, reject) => {
    if (!file || !['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) return reject(new Error('Pick a PNG, JPEG or WebP picture.'));
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const c = document.createElement('canvas');
      const g = c.getContext('2d');
      let limit = max, quality = 0.85;
      const draw = () => {
        const scale = Math.min(1, limit / Math.max(img.width, img.height));
        c.width = Math.max(1, Math.round(img.width * scale));
        c.height = Math.max(1, Math.round(img.height * scale));
        g.drawImage(img, 0, 0, c.width, c.height);
      };
      draw();
      let out = c.toDataURL('image/jpeg', quality);
      let guard = 0;
      while (maxChars && out.length > maxChars && limit > 200 && guard++ < 12) {
        if (quality > 0.55) quality -= 0.15;
        else { limit = Math.round(limit * 0.8); quality = 0.7; draw(); }
        out = c.toDataURL('image/jpeg', quality);
      }
      resolve(out);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('That file could not be read as a picture.')); };
    img.src = url;
  });
}
