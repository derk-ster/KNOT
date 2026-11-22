// The one dialog component. The close button sits in the header flow (never absolutely placed over
// content), the body scrolls, and the footer holds the actions. Backdrop click and Escape also close.
import { $, esc, icon } from './ui.js';

// `body` and `sub` are HTML written by the caller; `title` and any user text must already be escaped.
export function openDialog({ title, sub = '', body = '', footer = '', wide = false, onClose = null }) {
  const d = document.createElement('dialog');
  d.className = 'kdlg' + (wide ? ' wide' : '');
  d.setAttribute('aria-label', title);
  d.innerHTML = `<div class="kdlg-box">
      <header class="kdlg-head">
        <div class="kdlg-title"><h2>${title}</h2>${sub ? `<p class="hint">${sub}</p>` : ''}</div>
        <button type="button" class="kdlg-x" data-close aria-label="Close">${icon.x}</button>
      </header>
      <div class="kdlg-body">${body}</div>
      ${footer ? `<footer class="kdlg-foot">${footer}</footer>` : ''}
    </div>`;
  $('#dialogRoot').append(d);
  d.querySelector('[data-close]').addEventListener('click', () => d.close());
  d.addEventListener('click', e => { if (e.target === d) d.close(); });
  d.addEventListener('close', () => { if (onClose) onClose(d); d.remove(); });
  d.showModal();
  return d;
}

// A question before something that cannot be undone. Resolves true only on the explicit yes; closing
// the dialog in any other way is the safe answer. Focus starts on the safe choice for dangerous asks.
export function askConfirm({ title, body, yes = 'Continue', no = 'Cancel', danger = false }) {
  return new Promise(resolve => {
    let answered = false;
    const done = v => { if (answered) return; answered = true; resolve(v); d.close(); };
    const d = openDialog({
      title: esc(title),
      sub: esc(body),
      footer: `<button type="button" class="btn ghost" data-no>${esc(no)}</button><button type="button" class="btn ${danger ? 'danger' : 'primary'}" data-yes>${esc(yes)}</button>`,
      onClose: () => done(false)
    });
    d.querySelector('[data-yes]').addEventListener('click', () => done(true));
    d.querySelector('[data-no]').addEventListener('click', () => done(false));
    (danger ? d.querySelector('[data-no]') : d.querySelector('[data-yes]')).focus();
  });
}
