// Help: one panel under the header button. It answers from the server (the help bot, with a local
// fallback), and offers the page or control it names as a button, so a how-to never yanks the page.
import { $, esc, icon, reduceMotion } from '../ui.js';
import { api } from '../api.js';
import { state, isSignedIn } from '../state.js';

const IDEAS = ['What do I do next?', 'Take me to my groups', 'How do I make a group?', 'Where is my profile?'];
const TARGETS = { goal: '.goal-box', find: '#findBtn', finderInput: '#fInput', profile: '.account', auth: '[data-action="signin"]', offer: '#offerInput', create: '#createBtn' };
const PAGE_NAMES = { '#/': 'Home', '#/discover': 'Discover', '#/finder': 'AI Finder', '#/groups': 'My groups', '#/profile': 'your profile' };

export function toggleHelp(force) {
  const panel = $('#helpPanel');
  const open = force === undefined ? panel.hidden : force;
  if (open) {
    if (!panel.dataset.ready) {
      panel.innerHTML = `<div class="help-head">
          <h2>Help</h2>
          <button type="button" class="kdlg-x" data-help-close aria-label="Close help">${icon.x}</button>
        </div>
        <div class="help-log" id="helpLog" role="log" aria-live="polite" aria-label="Help conversation"></div>
        <div class="help-ideas">${IDEAS.map(x => `<button type="button" class="chip" data-help-idea="${esc(x)}">${esc(x)}</button>`).join('')}</div>
        <form class="help-form" id="helpForm" novalidate>
          <label class="sr" for="helpInput">Ask a question</label>
          <input id="helpInput" type="text" maxlength="200" autocomplete="off" placeholder="Where do I find my groups?">
          <button class="btn primary sm" type="submit">Ask</button>
        </form>`;
      panel.dataset.ready = '1';
      $('#helpForm', panel).addEventListener('submit', e => { e.preventDefault(); ask($('#helpInput', panel).value); });
      $('#helpLog', panel).addEventListener('click', e => {
        const go = e.target.closest('[data-go]');
        if (go) act({ hash: go.dataset.go || null, label: go.dataset.goLabel || '' });
      });
    }
    panel.hidden = false;
    $('#helpInput', panel).focus();
    paint();
  } else {
    panel.hidden = true;
  }
  document.querySelector('[data-action="help"]').setAttribute('aria-expanded', String(!panel.hidden));
}

function paint() {
  const box = $('#helpLog');
  if (!box) return;
  box.innerHTML = state.help.log.length ? state.help.log.map(m => m.wait
    ? `<p class="help-bubble bot wait" aria-label="Help is typing"><span class="typing-dots" aria-hidden="true"><i></i><i></i><i></i></span></p>`
    : `<p class="help-bubble ${m.role === 'user' ? 'me' : 'bot'}">${esc(m.text)}${m.go ? `<button type="button" class="help-go" data-go="${esc(m.go.hash || '')}" data-go-label="${esc(m.go.label || '')}">Take me to ${esc(m.go.label || 'there')}</button>` : ''}</p>`).join('')
    : `<p class="help-bubble bot">Ask where things are, or what to do next.</p>`;
  box.scrollTop = box.scrollHeight;
}

function next() {
  if (state.match.resp && state.match.resp.next) return state.match.resp.next;
  if (!isSignedIn()) return { target: 'auth' };
  const h = location.hash || '#/';
  if ((h === '#/' || h === '#/finder') && $('#goal')) return { target: 'goal' };
  return null;
}

async function ask(text) {
  text = String(text || '').trim().slice(0, 200);
  if (!text || state.help.busy) return;
  const input = $('#helpInput'); if (input) input.value = '';
  state.help.log.push({ role: 'user', text }, { role: 'bot', wait: true });
  state.help.busy = true; paint();
  try {
    const out = await api('/api/ai/help', {
      method: 'POST',
      body: {
        history: state.help.log.filter(m => !m.wait).map(m => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.text })),
        context: { next: next(), groups: state.rooms.map(r => ({ id: r.id, title: r.title })) }
      }
    });
    state.help.log.pop();
    const go = destination(out);
    state.help.log.push({ role: 'bot', text: out.reply || 'How can I help?', go });
    paint();
    if (out.navigate && go) setTimeout(() => act(go), 650);
    else if (out.highlight) flash(out.highlight, 0);
  } catch {
    state.help.log.pop();
    state.help.log.push({ role: 'bot', text: isSignedIn() ? 'I could not answer just now. The top bar goes to Home, Discover, AI Finder and My groups.' : 'I could not answer just now. Sign in is at the top right.' });
    paint();
  } finally { state.help.busy = false; }
}

function destination(out) {
  if (!out) return null;
  if (out.hash) return { hash: out.hash, label: out.label || PAGE_NAMES[out.hash] || 'there' };
  if (out.dialog === 'profile') return { hash: '#/profile', label: out.label || 'your profile' };
  return null;
}

function act(go) {
  toggleHelp(false);
  if (go.hash && go.hash !== (location.hash || '#/')) {
    location.hash = go.hash;
  }
  if (go.highlight) flash(go.highlight, go.hash ? 400 : 0);
}

function flash(target, delay = 0) {
  const sel = TARGETS[target];
  if (!sel) return;
  let tries = 0;
  const ring = () => {
    const el = document.querySelector(sel);
    if (!el) { if (tries++ < 12) setTimeout(ring, 150); return; }
    el.classList.remove('help-flash'); void el.offsetWidth; el.classList.add('help-flash');
    el.scrollIntoView({ block: 'center', behavior: reduceMotion() ? 'auto' : 'smooth' });
    setTimeout(() => el.classList.remove('help-flash'), 2400);
  };
  setTimeout(ring, delay);
}

// The panel is a popover: Escape or a click outside closes it, and the header button toggles it.
export function wireHelp() {
  document.addEventListener('click', e => {
    const panel = $('#helpPanel');
    if (!panel || panel.hidden) return;
    if (e.target.closest('#helpPanel') || e.target.closest('[data-action="help"]')) {
      const idea = e.target.closest('[data-help-idea]');
      if (idea) ask(idea.dataset.helpIdea);
      if (e.target.closest('[data-help-close]')) toggleHelp(false);
      return;
    }
    toggleHelp(false);
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#helpPanel').hidden) toggleHelp(false); });
}
