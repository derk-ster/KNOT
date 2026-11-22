// AI Finder: the goal box and matcher, with a chat beside it for talking a goal through. It says plainly
// whether AI is ready, so nobody has to guess why an answer reads like a canned line.
import { $, esc, icon } from '../ui.js';
import { api } from '../api.js';
import { state, store, myProfile } from '../state.js';
import { goalBox, wireGoal, findPeople, renderResults } from './match.js';

const IDEAS = ['I want to make a Roblox game, but I need someone who understands scripting', 'I need someone to edit my short film', 'Looking for a board game night in Plano'];
const AI_WORDS = {
  ready: 'AI is on',
  'no-model': 'AI needs a model name. Until it has one, the Finder answers from the saved fields only',
  rejected: 'The AI key was refused. The Finder answers from the saved fields only',
  off: 'AI is off on this server. The matcher still works from the saved fields'
};

export function renderFinder() {
  const s = state.status || {};
  const aiLine = s.ai ? `${AI_WORDS.ready}${s.aiModel ? ` (${esc(s.aiModel)})` : ''}.` : esc(AI_WORDS[s.aiState] || AI_WORDS.off) + '.';
  $('#main').innerHTML = `
  <section class="page finder-page">
    <h1 tabindex="-1" id="pageH1" class="page-title">AI Finder</h1>
    <p class="lead">Describe what you want to do. KNOT finds the people who fit, and says why.</p>
    <p class="status-line ${s.ai ? 'ok' : 'warn'}">${aiLine}</p>
    ${goalBox()}
    <div id="finderResults" class="match-results" aria-live="polite"></div>

    <section class="chat-card" aria-labelledby="chatH">
      <h2 id="chatH">Talk it through</h2>
      <div class="chat-log" id="fLog" role="log" aria-live="polite" aria-label="Conversation with the AI Finder"></div>
      <div class="chip-row" id="fIdeas"></div>
      <form id="fForm" class="composer" novalidate>
        <label class="sr" for="fInput">Message to the AI Finder</label>
        <input id="fInput" type="text" maxlength="300" autocomplete="off" placeholder="What do you want to do?" ${s.ai ? '' : 'disabled'}>
        <button class="btn primary" id="fSend" type="submit" ${s.ai ? '' : 'disabled'}>Send ${icon.send}</button>
      </form>
      ${s.ai ? '' : '<p class="hint">The chat needs AI to be ready. The goal box above still finds people.</p>'}
    </section>
  </section>`;
  $('#pageH1').focus({ preventScroll: true });
  wireGoal(() => findPeople('#finderResults'));
  if (state.match.resp && state.match.target === '#finderResults') renderResults('#finderResults', state.match.resp);

  $('#fIdeas').innerHTML = `<span class="label">Try one of these</span>` + IDEAS.map(x => `<button type="button" class="chip" data-idea="${esc(x)}">${esc(x)}</button>`).join('');
  $('#fIdeas').addEventListener('click', e => { const b = e.target.closest('[data-idea]'); if (b) send(b.dataset.idea); });
  $('#fForm').addEventListener('submit', e => { e.preventDefault(); send($('#fInput').value); });
  $('#fLog').addEventListener('click', e => {
    const o = e.target.closest('[data-use]');
    if (!o) return;
    state.goal = o.dataset.use; store.set('knot.goal', state.goal);
    $('#goal').value = state.goal;
    findPeople('#finderResults');
    $('#finderResults').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  paintLog();
}

function send(text) {
  text = String(text || '').trim();
  if (!text || state.finder.busy) return;
  state.finder.items.push({ role: 'user', content: text });
  $('#fInput').value = '';
  ask();
}

async function ask() {
  const f = state.finder;
  f.busy = true; f.error = null; paintLog();
  try {
    const history = f.items.map(m => ({ role: m.role, content: m.content }));
    const out = await api('/api/ai/finder', { method: 'POST', body: { history, me: { skills: myProfile().skills } } });
    f.items.push({ role: 'assistant', content: out.reply, goal: out.goal, result: out.result });
  } catch (e) { f.error = e.message; }
  f.busy = false; paintLog();
  const i = $('#fInput'); if (i) i.focus({ preventScroll: true });
}

function paintLog() {
  const log = $('#fLog'); if (!log) return;
  const items = state.finder.items;
  const card = p => `<li class="mini"><strong>${esc(p.name)}</strong><span>${esc(p.reason || '')}</span></li>`;
  const bubble = m => {
    if (m.role === 'user') return `<div class="bubble me">${esc(m.content)}</div>`;
    let extra = '';
    if (m.result) {
      const res = m.result.results || [], people = m.result.people || [], alts = m.result.alternativeGroups || [];
      if (res.length) extra += `<ul class="mini-list">${res.map(r => `<li class="mini"><strong>${esc(r.name)}</strong><span>${esc(r.reason)}</span></li>`).join('')}</ul>`;
      if (people.length) extra += `<p class="label">Real members</p><ul class="mini-list">${people.map(card).join('')}</ul>`;
      if (alts.length) extra += `<p class="label">Related public groups</p><ul class="mini-list">${alts.map(g => `<li class="mini"><strong>${esc(g.title)}</strong><span>${esc(g.goal)}</span></li>`).join('')}</ul>`;
      if (!res.length && !people.length && !alts.length) extra = `<p class="hint">${esc((m.result.empty && m.result.empty.message) || 'No one fits that yet.')}</p>`;
      if (m.goal) extra += `<button type="button" class="btn ghost sm" data-use="${esc(m.goal)}">Show in the matcher ${icon.arrow}</button>`;
    }
    return `<div class="bubble bot">${esc(m.content)}${extra}</div>`;
  };
  log.innerHTML = (items.length ? '' : `<div class="bubble bot">Hi. Tell me what you want to do and who you need, and I will turn it into matches.</div>`)
    + items.map(bubble).join('')
    + (state.finder.busy ? '<div class="bubble bot typing" aria-label="KNOT is thinking"><i></i><i></i><i></i></div>' : '')
    + (state.finder.error ? `<p class="msg err" role="alert">${icon.alert}<span>${esc(state.finder.error)}</span></p>` : '');
  log.scrollTop = log.scrollHeight;
  const btn = $('#fSend'); if (btn) btn.disabled = state.finder.busy;
}
