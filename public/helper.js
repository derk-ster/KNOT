'use strict';
// Small help bot (bottom-right). Answers "where is X?" briefly and navigates for the user.
(function () {
  const root = document.createElement('div');
  root.className = 'help';
  root.innerHTML = `
    <section class="help-panel" id="helpPanel" role="dialog" aria-label="KNOT quick help" hidden>
      <header><strong>Quick help</strong><button type="button" class="help-x" id="helpClose" aria-label="Close help">×</button></header>
      <div class="help-log" id="helpLog" role="log" aria-live="polite"></div>
      <div class="help-quick" id="helpQuick">
        <button type="button">Find my groups</button><button type="button">Change what I offer</button><button type="button">How do I create a group?</button>
      </div>
      <form id="helpForm" novalidate><label class="sr" for="helpInput">Ask for help</label>
        <input id="helpInput" type="text" maxlength="200" autocomplete="off" placeholder="Where do you want to go?">
        <button type="submit" class="btn primary sm" id="helpSend">Ask</button></form>
    </section>
    <button type="button" class="help-fab" id="helpFab" aria-expanded="false" aria-controls="helpPanel">
      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/></svg><span>Help</span>
    </button>`;
  document.body.appendChild(root);
  const $ = s => root.querySelector(s);
  const panel = $('#helpPanel'), fab = $('#helpFab'), log = $('#helpLog'), input = $('#helpInput');
  const history = []; let busy = false;
  // Keep the help button clear of the floating "Create group" bar, whatever height it wraps to.
  let barRaf = 0;
  function syncBar() {
    cancelAnimationFrame(barRaf);
    barRaf = requestAnimationFrame(() => { const b = document.getElementById('createBar'); document.documentElement.style.setProperty('--bar-h', b && !b.hidden ? (b.offsetHeight + 16) + 'px' : '0px'); });
  }
  new MutationObserver(syncBar).observe(document.getElementById('main'), { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden'] });
  addEventListener('resize', syncBar); syncBar();

  const add = (cls, text) => { const d = document.createElement('div'); d.className = 'hb ' + cls; d.textContent = text; log.appendChild(d); log.scrollTop = log.scrollHeight; return d; };
  function open(v) {
    panel.hidden = !v; fab.setAttribute('aria-expanded', v);
    if (v) { if (!log.children.length) add('bot', 'Hi! Ask me where something is and I’ll take you there.'); input.focus(); }
    else fab.focus();
  }
  fab.addEventListener('click', () => open(panel.hidden));
  $('#helpClose').addEventListener('click', () => open(false));
  root.addEventListener('keydown', e => { if (e.key === 'Escape' && !panel.hidden) open(false); });

  async function ask(q) {
    q = q.trim(); if (!q || busy) return;
    busy = true; $('#helpSend').disabled = true; input.value = '';
    add('me', q); history.push({ role: 'user', content: q });
    const wait = add('bot typing', '…');
    try {
      const r = await fetch('/api/ai/help', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ history: history.slice(-6) }) });
      const d = await r.json(); if (!r.ok) throw new Error(d.error || 'Help is unavailable');
      wait.className = 'hb bot'; wait.textContent = d.reply + (d.source === 'local' ? ' (basic help: AI is offline)' : '');
      history.push({ role: 'assistant', content: d.reply });
      if (d.action === 'profile') { const b = document.getElementById('profileBtn'); if (b) b.click(); }
      else if (d.hash) { if (location.hash === d.hash || (d.hash === '#/' && !location.hash)) window.scrollTo({ top: 0, behavior: 'smooth' }); else location.hash = d.hash; }
    } catch (e) { wait.className = 'hb bot err'; wait.textContent = 'Sorry, help is unavailable right now (' + e.message + '). Use the top bar: Home, AI Finder, My groups.'; }
    busy = false; $('#helpSend').disabled = false; input.focus();
  }
  $('#helpForm').addEventListener('submit', e => { e.preventDefault(); ask(input.value); });
  $('#helpQuick').addEventListener('click', e => { const b = e.target.closest('button'); if (b) ask(b.textContent); });
})();
