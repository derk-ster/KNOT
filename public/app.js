(() => {
'use strict';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage blocked */ } }
};
const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const CITIES = ['Plano', 'Dallas', 'Frisco', 'Richardson', 'Allen', 'McKinney', 'Irving', 'Garland', 'Austin', 'Houston'];
const EXAMPLES = [
  'I can shoot a short film in Plano this Saturday and need someone who can edit.',
  'I want to find people to play board games in Plano this Friday.',
  'I want to build a study app for our hackathon online and need a designer.'
];
const PLACEHOLDERS = [
  'I want to make a short film in Plano, and I need someone who can edit.',
  'I’m looking for a hiking buddy this Saturday.',
  'I want to start a band and need a drummer.',
  'Let’s run a 5K together in Frisco this Sunday.',
  'I’m building a game and need someone who can draw.'
];
const PLACEHOLDER = PLACEHOLDERS[Math.floor(Math.random() * PLACEHOLDERS.length)];

const icon = {
  check: '<svg class="ic" viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 10.5l4 4 8-9"/></svg>',
  alert: '<svg class="ic" viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="10" cy="10" r="8"/><path d="M10 6v5M10 14h.01"/></svg>',
  x: '<svg class="ic" viewBox="0 0 20 20" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M5 5l10 10M15 5L5 15"/></svg>',
  chev: '<svg class="ic chev" viewBox="0 0 20 20" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 8l5 5 5-5"/></svg>',
  send: '<svg class="ic" viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10l14-6-5 13-2-5-7-2z"/></svg>',
  pencil: '<svg class="ic" viewBox="0 0 20 20" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17l1-4L14 3l3 3L7 16l-4 1zM12 5l3 3"/></svg>',
  arrow: '<svg class="ic" viewBox="0 0 20 20" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 10h12M11 5l5 5-5 5"/></svg>'
};
const markImg = (w = 42) => `<img src="assets/art/knot-mark.svg" width="${w}" height="${Math.round(w * 0.75)}" alt="" class="mark">`;
const hueOf = n => [...n].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 360, 7);
const initials = n => n.split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();

// ---------- state ----------
const state = {
  clientId: store.get('knot.clientId', null) || uid(),
  sessionId: null, sessionName: null,
  acct: null,             // signed-in account: {accountId, name, email, ageCategory} or null (guest)
  me: store.get('knot.me', null),
  goal: store.get('knot.goal', ''),
  relaxed: [],
  resp: null, respKey: null,
  selected: new Set(),
  skills: [],
  pollTimer: null
};
store.set('knot.clientId', state.clientId);

let localRooms = false;   // true on serverless hosts: groups and chat live in this browser
async function api(path, opts = {}) {
  if (localRooms && path.startsWith('/api/rooms')) return localRoomApi(path, opts);
  return apiRaw(path, opts);
}
async function localRoomApi(path, opts) {
  const method = (opts.method || 'GET').toUpperCase(), url = new URL(path, location.origin);
  const parts = url.pathname.split('/').filter(Boolean).slice(2), rooms = store.get('knot.rooms', []);
  const save = () => store.set('knot.rooms', rooms);
  const body = () => { try { return JSON.parse(opts.body || '{}'); } catch { return {}; } };
  const brief = ({ messages, ...r }) => ({ ...r, messageCount: messages.length, lastMessageAt: messages.length ? messages[messages.length - 1].ts : null });
  if (!parts.length && method === 'GET') {
    const cid = url.searchParams.get('clientId');
    return { rooms: rooms.filter(r => r.clientId === cid).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(brief) };
  }
  if (!parts.length && method === 'POST') {
    const b = body(), dup = rooms.find(r => r.requestId === b.requestId);
    if (dup) return { room: dup, duplicate: true };
    if (!b.title || !b.goal) throw new Error('A group needs a name and a goal.');
    const { members } = await apiRaw('/api/members', { method: 'POST', body: JSON.stringify({ ids: b.memberIds }) });
    if (!members.length) throw new Error('Select at least one person for the group.');
    members.forEach(m => { m.demo = true; m.you = false; });
    const label = id => (state.skills.find(s => s.id === id) || { label: id }).label;
    const owner = { id: b.clientId, name: b.ownerName, you: true, demo: false, skillLabels: (b.ownerSkills || []).map(label), availabilityDays: null, availabilityText: 'You' };
    const room = { id: uid(), requestId: b.requestId, clientId: b.clientId, title: b.title, goal: b.goal, ownerName: b.ownerName, createdAt: new Date().toISOString(), members: [owner, ...members], messages: [] };
    rooms.push(room); save(); return { room };
  }
  const room = rooms.find(r => r.id === parts[0]);
  if (!room) throw new Error('This group could not be found. It lives in the browser that created it. Open My groups to see the ones saved here.');
  if (parts.length === 1) return { room, next: room.messages.length ? null : { target: 'assist' } };
  if (parts[1] === 'messages') {
    const b = body(), text = String(b.text || '').trim().slice(0, 2000);
    if (!text) throw new Error('Type a message first.');
    const message = { id: uid(), authorId: b.authorId, authorName: b.authorName || 'Someone', text, kind: b.kind === 'assistant' ? 'assistant' : 'user', ts: new Date().toISOString() };
    room.messages.push(message); save(); return { message };
  }
  if (parts[1] === 'assist') return apiRaw('/api/assist', { method: 'POST', body: JSON.stringify({ room: { goal: room.goal, members: room.members } }) });
  throw new Error('Not found');
}
async function apiRaw(path, opts = {}) {
  const r = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...opts });
  let d = null; try { d = await r.json(); } catch { /* non-json */ }
  if (!r.ok) { const e = new Error((d && d.error) || `Request failed (${r.status})`); if (d && d.held) e.held = true; throw e; }
  return d;
}
const say = t => { const l = $('#live'); l.textContent = ''; setTimeout(() => { l.textContent = t; }, 30); };
const meForApi = () => state.me ? { skills: state.me.skills, availability: state.me.availability } : {};
const skillLabel = id => (state.skills.find(s => s.id === id) || { label: id }).label;

// ---------- header ----------
function paintHeader() {
  const who = state.acct ? state.acct.name : (state.me ? state.me.name : null);
  $('#profileAvatar').textContent = who ? initials(who) : '?';
  $('#profileLabel').textContent = who ? who.split(' ')[0] : 'Profile';
  const ab = $('#authBtn'); if (ab) ab.textContent = state.acct ? 'Sign out' : 'Sign in';
  const h = location.hash || '#/';
  $('#navHome').setAttribute('aria-current', h === '#/' || h === '' ? 'page' : 'false');
  $('#navDiscover').setAttribute('aria-current', h.startsWith('#/discover') ? 'page' : 'false');
  $('#navFinder').setAttribute('aria-current', h.startsWith('#/finder') ? 'page' : 'false');
  $('#navGroups').setAttribute('aria-current', h.startsWith('#/groups') || h.startsWith('#/room') ? 'page' : 'false');
}
async function refreshGroupCount() {
  try {
    const { rooms } = await api('/api/rooms?clientId=' + encodeURIComponent(state.clientId));
    const c = $('#groupCount'); c.textContent = rooms.length; c.hidden = !rooms.length;
    return rooms;
  } catch { return []; }
}


// ---------- guidance: highlight the one control the user should use next ----------
// The server (lib/guide.js) names the next step for the current situation; this maps it to a control.
const NEXT_SEL = {
  goal: '.goal-wrap', find: '#findBtn', profile: '#profileBtn', need: '[data-edit=need]', offer: '[data-edit=offer]',
  relax: '#empty [data-relax]', pick: '#results .pick:not(:has(input:checked))', create: '#createBtn', open: '#fLog [data-open]',
  assist: '#assistBtn', finderInput: '#fInput', startFind: '#groupList .btn.primary'
};
function currentNext() {
  const h = location.hash || '#/';
  if (h === '#/') {
    if (!$('#goal')) return null;
    if (!state.goal.trim()) return { target: 'goal' };
    if (!state.me) return { target: 'find' };
    if (!state.resp || $('#resultsSection').hidden) return { target: 'find' };
    if (state.selected.size) return { target: 'create' };
    return state.resp.next || { target: 'pick' };
  }
  if (h === '#/finder') {
    const it = state.finder.items, last = it[it.length - 1];
    return last && last.role === 'assistant' && last.result ? { target: 'open' } : { target: 'finderInput' };
  }
  if (h === '#/groups') return $('#groupList .empty') ? { target: 'startFind' } : null;
  if (h.startsWith('#/room/')) return state.roomNext || null;
  return null;
}
function applyNext() {
  $$('.next').forEach(e => e.classList.remove('next'));
  const n = currentNext(); if (!n) return;
  [n.target, ...(n.also || [])].forEach(tg => {
    const sel = NEXT_SEL[tg]; if (!sel) return;
    (tg === 'relax' ? $$(sel) : [$(sel)]).forEach(el => el && el.classList.add('next'));
  });
}
let nxRaf = 0;
const queueNext = () => { cancelAnimationFrame(nxRaf); nxRaf = requestAnimationFrame(applyNext); };
window.knotNext = () => currentNext();
window.knotHighlight = target => {   // used by Help AI: pulse the control hard and bring it into view
  const el = NEXT_SEL[target] && $(NEXT_SEL[target]); if (!el) return false;
  el.classList.add('next', 'next-hard'); el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  setTimeout(() => el.classList.remove('next-hard'), 6000); return true;
};

// ---------- routing ----------
function route(initial) {
  stopPoll();
  const h = location.hash || '#/';
  paintHeader();
  $('#createDialog').open && $('#createDialog').close();
  if (h.startsWith('#/room/')) renderRoom(h.slice(7));
  else if (h.startsWith('#/join/')) renderJoin(h.slice(7));
  else if (h === '#/discover') renderDiscover();
  else if (h === '#/groups') renderGroups();
  else if (h === '#/finder') renderFinder();
  else renderHome(initial);
  refreshGroupCount();
  setTimeout(queueNext, 150);
}
window.addEventListener('hashchange', () => route(false));


// ---------- personalised examples ----------
let exTimer = 0, exToken = 0;
function paintExamples(list, label, into = '#examples') {
  const box = $(into); if (!box) return;
  const key = label + '|' + list.join('|'); if (box.dataset.key === key) return; box.dataset.key = key;
  box.innerHTML = `<span class="ex-label">${esc(label)}</span>` + list.map(e => `<button type="button" class="chip example" data-text="${esc(e)}">${esc(e)}</button>`).join('');
}
async function fetchExamples() {
  return api('/api/examples', { method: 'POST', body: JSON.stringify({ goal: state.goal || '', skills: state.me ? state.me.skills : [] }) });
}
async function refreshExamples() {
  const tok = ++exToken;
  try { const r = await fetchExamples(); if (tok === exToken) paintExamples(r.examples, r.label); } catch { /* keep the current examples */ }
}
function scheduleExamples() { clearTimeout(exTimer); exTimer = setTimeout(refreshExamples, 450); }

// ---------- HOME ----------
function renderHome(initial) {
  const main = $('#main');
  main.innerHTML = `
  <div id="home" class="home">
    <section class="hero" aria-labelledby="h1">
      <div class="hero-copy">
        <div class="h1-wrap"><div class="hero-art" aria-hidden="true"><img class="hero-knot" src="assets/art/hero-knot.png" width="1200" height="311" alt=""></div>
        <h1 id="h1" class="mega"><span class="w w1">What do</span> <span class="you">you</span> <span class="w w3">want to do?</span></h1></div>
        <div class="goal-wrap"><i class="ring" aria-hidden="true"></i><i class="ring r2" aria-hidden="true"></i><i class="ring r3" aria-hidden="true"></i>
        <form id="goalForm" class="goal-form" novalidate>
          <textarea id="goal" rows="2" maxlength="500" autocomplete="off" spellcheck="true" aria-labelledby="h1" aria-describedby="goalHelp goalErr" placeholder="${esc(PLACEHOLDER)}"></textarea>
          <div class="goal-row">
            <p id="goalHelp" class="hint">Work project, game night or just for fun: say what, where and when.</p>
            <button class="btn primary" id="findBtn" type="submit"><span class="btn-label">Find my people</span></button>
          </div>
        </form></div>
        <p id="goalErr" class="msg err" role="alert" hidden></p>
        <div class="examples" id="examples" aria-live="polite"></div>
      </div>
    </section>

    <section id="startGuide" class="guide" aria-labelledby="gdh">
      <h2 id="gdh">New here? Three quick steps</h2>
      <ol class="steps">
        <li><span class="n" aria-hidden="true">1</span><div><strong>Say what you want to do</strong><p>Type it in the box above: what, where and when. Not sure how to word it? Tap an example, or chat it out in the <a href="#/finder">AI Finder</a>.</p></div></li>
        <li><span class="n" aria-hidden="true">2</span><div><strong>Pick your people</strong><p>KNOT shows up to three matches and says exactly why. Press <b>Add to group</b> on the ones you like.</p></div></li>
        <li><span class="n" aria-hidden="true">3</span><div><strong>Start the group</strong><p>Press <b>Create group</b>, then chat in the room. “Help us get started” writes a first message for you.</p></div></li>
      </ol>
      <p class="guide-tip">Nothing typed yet? Write one sentence, like <em>“I need someone who can edit my video this Saturday.”</em>, then press <b>Find my people</b>.</p>
    </section>

    <section id="resultsSection" class="results-section" aria-labelledby="resHead" hidden>
      <div class="res-head">
        <h2 id="resHead">People who fit</h2>
        <span class="badge neutral" id="matcherBadge" title="Matches come from KNOT's local rules over stored profiles.">Local matcher</span>
        <button type="button" class="btn quiet sm" id="aiReadBtn" hidden title="Let the AI model re-read your goal first, then match locally as always">Try AI reading</button>
      </div>
      <div id="interp" class="interp" aria-label="What KNOT understood"></div>
      <p id="notice" class="notice" hidden></p>
      <p id="pickHint" class="pick-hint">Next step: press <strong>Add to group</strong> on the people you want, then <strong>Create group</strong>.</p>
      <p id="matchErr" class="msg err" role="alert" hidden></p>
      <ul id="results" class="results"></ul>
      <div id="empty" class="empty" hidden></div>
    </section>

    <section id="homeGroups" class="home-groups reveal" aria-labelledby="hgh">
      <h2 id="hgh">Groups open right now</h2>
      <p class="lead">Public groups of real members. Pick one and join, or start your own.</p>
      <div id="homeGroupsList" aria-live="polite"><p class="hint">Loading…</p></div>
    </section>

    <section id="homeAi" class="home-ai reveal" aria-labelledby="haih">
      <h2 id="haih">Where AI helps, and where it does not</h2>
      <ul class="ai-list">
        <li><strong>Reading your goal.</strong> KNOT turns your one sentence into the skills, city and days to match on. The matches themselves come from KNOT's local rules over real profile data, so every match shows exactly why.</li>
        <li><strong>The AI Finder.</strong> Chat a sentence or two and KNOT builds the goal for you.</li>
        <li><strong>KNOT AI in rooms.</strong> A group owner can switch on a small assistant that answers questions from the group's real member profiles. It never speaks as a human and never invents people.</li>
        <li><strong>Never without you.</strong> If no AI is configured, everything above falls back to the local matcher. Matches, groups and chat keep working.</li>
      </ul>
    </section>

    <section id="homeCta" class="home-cta reveal" aria-labelledby="hch">
      <img src="assets/art/knot-mark.svg" width="56" height="42" alt="">
      <h2 id="hch">One sentence is enough</h2>
      <p>Say what you want to do. KNOT finds the people, explains why they fit, and starts the chat.</p>
      <button type="button" class="btn primary" id="ctaFind">Find my people</button>
    </section>
    <footer class="site-foot reveal">
      <p><strong>KNOT</strong> · find your people</p>
      <p class="small">Made for ITKAN. Matching runs on local rules with AI assistance where switched on. Demo profiles are fictional and always labeled. Group owners moderate their groups; report anything that worries you. KNOT cannot promise anyone is safe: meet in public, bring a friend, tell someone where you are.</p>
    </footer>

    <div id="createBar" class="create-bar" hidden>
      ${markImg(34)}
      <p id="createText"></p>
      <button class="btn primary" id="createBtn" type="button">Create group</button>
    </div>
  </div>`;
  const goal = $('#goal');
  goal.value = state.goal;
  goal.addEventListener('input', () => {
    if (state.goal !== goal.value) { state.relaxed = []; }
    state.goal = goal.value; store.set('knot.goal', state.goal); hideErr('#goalErr'); scheduleExamples(); queueNext();
  });
  goal.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); findPeople(); } });
  $('#goalForm').addEventListener('submit', e => { e.preventDefault(); findPeople(); });
  $('#examples').addEventListener('click', e => {
    const b = e.target.closest('.example'); if (!b) return;
    goal.value = b.dataset.text; goal.dispatchEvent(new Event('input')); goal.focus();
    goal.setSelectionRange(goal.value.length, goal.value.length);
  });
  paintExamples(EXAMPLES, 'Try an example'); refreshExamples();
  $('#results').addEventListener('click', onResultsClick);
  $('#results').addEventListener('change', onResultsChange);
  $('#interp').addEventListener('click', onRelaxClick);
  $('#empty').addEventListener('click', onRelaxClick);
  $('#createBtn').addEventListener('click', openCreate);
  $('#ctaFind').addEventListener('click', () => { $('#goal').scrollIntoView({ behavior: 'smooth', block: 'center' }); $('#goal').focus({ preventScroll: true }); });

  // entrance animation: hero first, then the rest, within 300 to 700ms, honoring reduced motion
  if (!reduceMotion()) requestAnimationFrame(() => { document.body.classList.add('booted'); paintHomeGroups(); });
  else paintHomeGroups();
  apiRaw('/api/status').then(s => {
    if (s.ai) { const b = $('#aiReadBtn'); if (b) { b.hidden = false; b.addEventListener('click', () => { state.aiRead = true; findPeople(true); }); } }
  }).catch(() => {});

  if (state.resp) { renderResults(state.resp, true); }
  else if (store.get('knot.searched', false) && state.goal.trim() && state.me) findPeople();
  if (initial || !state.resp) goal.focus({ preventScroll: true }); else $('#h1').focus({ preventScroll: true });
  queueNext();
}

function showErr(sel, text) { const e = $(sel); if (!e) return; e.innerHTML = icon.alert + `<span>${esc(text)}</span>`; e.hidden = false; }
function hideErr(sel) { const e = $(sel); if (e) { e.hidden = true; e.innerHTML = ''; } const g = $('#goal'); if (g && sel === '#goalErr') g.removeAttribute('aria-invalid'); }

// Public groups preview on Home. Real accounts see real groups in their age scope;
// guests see the sign-in call to action instead (demo content is never passed off as live groups).
async function paintHomeGroups() {
  const box = $('#homeGroupsList'); if (!box) return;
  if (!state.acct) {
    box.innerHTML = `<div class="empty center small-pad"><div><p>Discover is for members.</p><p class="small">Create a free account (email and password, 13+ with a guardian's OK) to see and join public groups. Everything else works without one.</p><button type="button" class="btn primary sm" id="hgSignin">Create account</button></div></div>`;
    const b = $('#hgSignin'); if (b) b.addEventListener('click', () => openAuth('up'));
    return;
  }
  try {
    const { groups } = await apiRaw('/api/groups');
    if (!groups.length) { box.innerHTML = `<p class="hint">No public groups yet. Create one from a match and it shows up here.</p>`; return; }
    box.innerHTML = `<ul class="group-list">${groups.slice(0, 3).map(g => `<li><div class="group-row">${markImg(52)}<span class="g-main"><strong>${esc(g.title)}</strong><span class="g-goal">“${esc(g.goal)}”</span><span class="meta">${g.memberCount}/${g.capacity} members · ${g.onlineOnly ? 'online' : 'in person'}</span></span><a class="btn primary sm" href="#/room/${esc(g.id)}">Open</a></div></li>`).join('')}</ul>
      <p class="small"><a href="#/discover">See all groups in Discover</a></p>`;
  } catch { box.innerHTML = `<p class="hint">Could not load groups right now.</p>`; }
}

function setBusy(on) {
  const b = $('#findBtn'); if (!b) return;
  b.disabled = on; b.setAttribute('aria-busy', on);
  $('.btn-label', b).textContent = on ? 'Finding…' : 'Find my people';
  b.classList.toggle('busy', on);
}

async function findPeople(force) {
  const goal = state.goal.trim();
  if (!goal) {
    showErr('#goalErr', 'Your goal box is empty. Type one sentence about what you want to do and who you need, like “I need someone who can edit video this Saturday”, or tap an example below.');
    const g = $('#goal'); g.setAttribute('aria-invalid', 'true'); g.focus();
    return;
  }
  if (!state.me) { openProfile({ thenSearch: true }); return; }
  const key = JSON.stringify([goal, [...state.relaxed].sort(), meForApi()]);
  if (!force && state.resp && state.respKey === key) { renderResults(state.resp); return; }
  hideErr('#matchErr'); setBusy(true);
  try {
    let resp;
    if (state.aiRead) {
      // AI-assisted: the model re-reads the goal, then the same local matcher runs over validated fields.
      try {
        resp = await api('/api/ai/interpret', { method: 'POST', body: JSON.stringify({ goal, me: meForApi() }) });
        resp.relaxed = state.relaxed;
      } catch (aiErr) { state.aiRead = false; const bb = $('#aiReadBtn'); if (bb) { bb.hidden = true; bb.textContent = 'AI reading unavailable'; } }
    }
    if (!resp) resp = await api('/api/match', { method: 'POST', body: JSON.stringify({ goal, me: meForApi(), relaxed: state.relaxed }) });
    state.resp = resp; state.respKey = null; store.set('knot.searched', true);
    renderResults(resp);
  } catch (e) {
    $('#resultsSection').hidden = false; const sg2 = $('#startGuide'); if (sg2) sg2.hidden = true;
    $('#matchErr').innerHTML = icon.alert + `<span>KNOT couldn't reach its matcher (${esc(e.message)}). Your goal is saved. Check that the KNOT server is still running, then try again. </span><button type="button" class="link-btn" id="retryBtn">Try again</button>`;
    $('#matchErr').hidden = false;
    $('#retryBtn').addEventListener('click', () => findPeople(true));
  } finally { setBusy(false); }
}

function onRelaxClick(e) {
  const ed = e.target.closest('[data-edit]');
  if (ed) {
    if (ed.dataset.edit === 'offer') openProfile({ rerun: true, focusSkills: true });
    else { const g = $('#goal'); g.scrollIntoView({ behavior: 'smooth', block: 'center' }); g.focus({ preventScroll: true }); g.setSelectionRange(g.value.length, g.value.length); }
    return;
  }
  const b = e.target.closest('[data-relax]'); if (!b) return;
  const k = b.dataset.relax;
  if (!state.relaxed.includes(k)) state.relaxed.push(k);
  findPeople();
}

// render the understood-constraints row, results (keyed), and empty state
function renderResults(resp, restoring) {
  const y = scrollY, active = document.activeElement;
  $('#resultsSection').hidden = false; const sg = $('#startGuide'); if (sg) sg.hidden = true;
  hideErr('#matchErr');
  const badge = $('#matcherBadge'); if (badge) {
    badge.textContent = resp.matcher === 'ai-assisted local rules' ? 'AI reading + local rules' : 'Local matcher';
    badge.title = resp.matcher === 'ai-assisted local rules'
      ? 'An AI model re-read your goal; matches still come from KNOT\'s local rules over stored profiles.'
      : 'Matches come from KNOT\'s local rules over stored profiles.';
  }
  const it = resp.interpreted;
  const chips = [];
  chips.push(`<button type="button" class="tag editable" data-edit="offer" aria-label="You offer: ${esc(it.offers.map(o => o.label).join(', ') || 'nothing yet')}. Change what you offer">You offer: ${esc(it.offers.map(o => o.label).join(', ') || 'nothing yet')}${icon.pencil}<span class="tag-hint">Change</span></button>`);
  chips.push(it.needs.length ? `<button type="button" class="tag strong editable" data-edit="need" aria-label="Looking for: ${esc(it.needs.map(o => o.label).join(', '))}. Edit your goal">Looking for: ${esc(it.needs.map(o => o.label).join(', '))}${icon.pencil}<span class="tag-hint">Edit goal</span></button>` : '<button type="button" class="tag editable" data-edit="need">No specific skill found. Edit your goal' + icon.pencil + '</button>');
  it.constraints.forEach(c => chips.push(c.relaxed
    ? `<span class="tag relaxed">${esc(c.label)} <span class="tag-note">(relaxed)</span></span>`
    : `<span class="tag req">${esc(c.label)}<button type="button" class="tag-x" data-relax="${c.key}" aria-label="Relax requirement: ${esc(c.label)}">${icon.x}</button></span>`));
  $('#interp').innerHTML = chips.join('');

  const ids = new Set(resp.results.map(r => r.id));
  [...state.selected].forEach(id => { if (!ids.has(id)) state.selected.delete(id); });
  reconcile(resp.results, restoring);

  const ph = $('#pickHint'); if (ph) ph.hidden = !resp.results.length;
  const aiFields = (it.aiParsedFields || []).length;
  const aiNote = aiFields ? `KNOT's AI reading picked the ${it.aiParsedFields.join(', ')} from your goal. Every match still comes from stored profiles, with the reason shown on each card.` : null;
  const nt = $('#notice'); if (nt) { nt.hidden = !(resp.notice || aiNote); nt.textContent = resp.notice || aiNote || ''; }
  const empty = $('#empty');
  if (resp.empty) {
    empty.hidden = false;
    empty.innerHTML = `<img src="assets/art/navigation_arrow.png" width="140" height="148" alt="" class="empty-art" loading="lazy">
      <div><h3>No one fits yet</h3><p>${esc(resp.empty.message)}</p>
      ${resp.empty.options.length ? `<div class="relax-row">${resp.empty.options.map(o => `<button type="button" class="chip" data-relax="${o.key}">${esc(o.text)} <span class="chip-note">${o.count} ${o.count === 1 ? 'person' : 'people'}</span></button>`).join('')}</div>` : ''}
      <p class="small">Your goal stays exactly as you typed it. Edit it above or relax a requirement.</p></div>`;
  } else { empty.hidden = true; empty.innerHTML = ''; }
  queueNext();

  updateCreateBar();
  if (!restoring) {
    if (scrollY !== y) scrollTo(0, y);
    if (active && active !== document.body && !document.contains(active)) $('#goal').focus({ preventScroll: true });
    say(resp.results.length ? `${resp.results.length} ${resp.results.length === 1 ? 'person fits' : 'people fit'} your goal.` : 'No one fits yet. See suggestions below the goal.');
  }
}

function cardInner(r, open) {
  const sel = state.selected.has(r.id);
  return `<div class="card-grid">
    <label class="pick"><input type="checkbox" ${sel ? 'checked' : ''} aria-label="Add ${esc(r.name)} to a group"><span class="box">${icon.check}</span><span class="pick-text"><span class="when-off">Add to group</span><span class="when-on">Added</span></span></label>
    <div class="avatar" style="--hue:${hueOf(r.name)}" aria-hidden="true">${esc(initials(r.name))}</div>
    <div class="card-body">
      <div class="card-top"><h3>${esc(r.name)}</h3><span class="meta">${esc(r.city)} · ${esc(r.modeText)}</span></div>
      <p class="bring"><span class="bring-label">Brings</span>${r.bring.map(b => `<span class="skill-chip">${esc(b)}</span>`).join('')}</p>
      <p class="reason">${esc(r.reason)}</p>
      <ul class="pairs">${r.pairs.map(p => `<li><span class="need">${esc(p.need)}</span><span class="pair-arrow" aria-hidden="true">${icon.arrow}</span><span class="offer">${esc(p.offer)}</span></li>`).join('')}</ul>
      ${r.flags.map(f => `<p class="msg warn">${icon.alert}<span><strong>${esc(f.text)}.</strong> ${esc(f.explain)}</span></p>`).join('')}
      <button type="button" class="why-btn" aria-expanded="${open}" aria-controls="why-${r.id}">Why this match? ${icon.chev}</button>
      <div class="why" id="why-${r.id}" ${open ? '' : 'hidden'}>
        <p class="why-title">Exactly what KNOT used</p>
        <dl>${r.evidence.map(e => `<div><dt>${esc(e.label)}</dt><dd>${esc(e.value)}</dd></div>`).join('')}</dl>
      </div>
    </div></div>`;
}

function reconcile(list, restoring) {
  const ul = $('#results');
  const old = new Map([...ul.children].map(li => [li.dataset.id, li]));
  list.forEach((r, i) => {
    const sig = JSON.stringify(r);
    let li = old.get(r.id);
    if (li) {
      old.delete(r.id);
      if (li._sig !== sig) {
        li.innerHTML = cardInner(r, li.dataset.open === '1'); li._sig = sig; flash(li, 'changed');
      }
      if (li._idx !== i && !restoring) flash(li, 'moved');
    } else {
      li = document.createElement('li'); li.className = 'card'; li.dataset.id = r.id;
      li.innerHTML = cardInner(r, false); li._sig = sig;
      if (!restoring) flash(li, 'enter');
    }
    li._idx = i;
    li.classList.toggle('selected', state.selected.has(r.id));
    if (ul.children[i] !== li) ul.insertBefore(li, ul.children[i] || null);
  });
  old.forEach(li => li.remove());
}
function flash(el, cls) {
  if (reduceMotion()) return;
  el.classList.remove('enter', 'changed', 'moved'); void el.offsetWidth; el.classList.add(cls);
  setTimeout(() => el.classList.remove(cls), 450);
}

function onResultsClick(e) {
  const b = e.target.closest('.why-btn'); if (!b) return;
  const li = b.closest('li'); const open = b.getAttribute('aria-expanded') !== 'true';
  b.setAttribute('aria-expanded', open); $('.why', li).hidden = !open; li.dataset.open = open ? '1' : '0';
}
function onResultsChange(e) {
  const cb = e.target.closest('input[type=checkbox]'); if (!cb) return;
  const li = cb.closest('li'); const id = li.dataset.id;
  cb.checked ? state.selected.add(id) : state.selected.delete(id);
  li.classList.toggle('selected', cb.checked);
  updateCreateBar();
}

function selectedResults() { return (state.resp ? state.resp.results : []).filter(r => state.selected.has(r.id)); }
function updateCreateBar() {
  const bar = $('#createBar'); if (!bar) return;
  const sel = selectedResults();
  bar.hidden = !sel.length;
  if (sel.length) {
    $('#createText').textContent = `${sel.map(s => s.name.split(' ')[0]).join(', ')} selected. Ready to start a group?`;
    $('#createBtn').textContent = sel.length > 1 ? `Create group (${sel.length})` : 'Create group';
  }
  queueNext();
}


// ---------- ACCOUNTS (sign in / create account) ----------
// Accounts are how identity follows a person across devices. Guests keep the anonymous session
// experience. Teen accounts (13 to 17) and adult accounts never share groups with each other.
function openAuth(mode = 'in') {
  const d = $('#authDialog');
  const isUp = mode === 'up';
  d.innerHTML = `<form method="dialog" id="authForm" novalidate class="dlg">
    <div class="dlg-head">
      <img src="assets/art/artists_palette.png" width="96" height="73" alt="" class="dlg-art">
      <div><h2 id="authTitle">${isUp ? 'Create your KNOT account' : 'Welcome back'}</h2>
      <p class="hint">${isUp ? 'An email and password only. Your groups follow you to any device.' : 'Sign in to reach your groups on this device.'}</p></div>
    </div>
    <div class="field"><label for="aEmail">Email</label>
      <input id="aEmail" type="email" maxlength="120" autocomplete="email" required aria-describedby="aAuthErr">
    </div>
    <div class="field"><label for="aPass">Password</label>
      <input id="aPass" type="password" maxlength="200" autocomplete="${isUp ? 'new-password' : 'current-password'}" aria-describedby="aPassHint aAuthErr">
      ${isUp ? '<p class="hint" id="aPassHint">At least 8 characters, with letters and numbers.</p>' : ''}
    </div>
    ${isUp ? `
    <div class="field"><label for="aName">Display name</label>
      <input id="aName" type="text" maxlength="40" autocomplete="nickname" aria-describedby="aAuthErr">
    </div>
    <fieldset class="field"><legend>Age group <span class="req">(required)</span></legend>
      <div class="chips">
        <label class="toggle"><input type="radio" name="aAge" value="teen"><span>13 to 17</span></label>
        <label class="toggle"><input type="radio" name="aAge" value="adult" checked><span>18 and over</span></label>
      </div>
      <p class="hint">Teens and adults use separate groups. Adults cannot join teen groups and never message them.</p>
    </fieldset>
    <div class="field"><label class="toggle agree"><input type="checkbox" id="aGuard"><span>I am 13 or older. If I pick 13 to 17, I have a parent or guardian permission to use KNOT.</span></label></div>` : ''}
    <p class="msg err" id="aAuthErr" role="alert" hidden></p>
    <div class="dlg-actions">
      <button type="button" class="btn ghost" id="aSwap">${isUp ? 'I have an account' : 'New here? Create an account'}</button>
      <button type="submit" class="btn primary" id="aSubmit">${isUp ? 'Create account' : 'Sign in'}</button>
    </div></form>`;
  d.showModal();
  $('#aEmail').focus();
  $('#aSwap').addEventListener('click', () => { d.close(); openAuth(isUp ? 'in' : 'up'); });
  $('#authForm').addEventListener('submit', async e => {
    e.preventDefault();
    const err = $('#aAuthErr'), submit = $('#aSubmit');
    const email = $('#aEmail').value.trim(), pass = $('#aPass').value;
    const age = isUp ? (($('input[name=aAge]:checked') || {}).value || 'adult') : null;
    err.hidden = true;
    if (!email || !pass) { err.innerHTML = icon.alert + '<span>Enter your email and password.</span>'; err.hidden = false; return; }
    if (isUp) {
      if (!$('#aName').value.trim()) { err.innerHTML = icon.alert + '<span>Add a display name so groups know who you are.</span>'; err.hidden = false; return; }
      if (age === 'teen' && !$('#aGuard').checked) { err.innerHTML = icon.alert + '<span>Teen accounts need the permission checkbox ticked.</span>'; err.hidden = false; return; }
    }
    submit.disabled = true; submit.textContent = isUp ? 'Creating…' : 'Signing in…';
    try {
      const body = isUp
        ? { email, password: pass, name: $('#aName').value.trim(), ageCategory: age, confirm13: age === 'teen' ? $('#aGuard').checked : undefined }
        : { email, password: pass };
      const me = await apiRaw('/api/auth/' + (isUp ? 'signup' : 'signin'), { method: 'POST', body: JSON.stringify(body) });
      state.acct = me.signedIn ? me : null;
      if (state.acct && state.me && state.me.name !== me.name) state.me.name = me.name;
      d.close(); paintHeader(); route(false);
      say(isUp ? 'Account created. Your groups now follow you across devices.' : 'Signed in.');
      if (state.acct) openProfile();
    } catch (ex) {
      submit.disabled = false; submit.textContent = isUp ? 'Try again' : 'Sign in';
      err.innerHTML = icon.alert + `<span>${esc(ex.message)}</span>`; err.hidden = false;
    }
  });
}
async function signOut() {
  try { await apiRaw('/api/auth/signout', { method: 'POST', body: '{}' }); } catch { /* offline */ }
  state.acct = null; paintHeader();
  say('Signed out. Your groups are still here under your account.');
}
function openProfile(opts = {}) {
  const d = $('#profileDialog'); const me = state.me || { name: '', skills: [], interests: '', city: '', availability: [], mode: 'both' };
  d.innerHTML = `<form method="dialog" id="profileForm" novalidate class="dlg">
    <div class="dlg-head">
      <img src="assets/art/artists_palette.png" width="96" height="73" alt="" class="dlg-art">
      <div><h2 id="profileTitle">${state.me ? 'Your profile' : 'A little about you'}</h2>
      <p class="hint">${opts.thenSearch ? 'Your goal is saved. Add your name and skills, then we’ll find your people.' : 'Just your name and one skill or hobby. No email, no account.'}</p></div>
    </div>
    <div class="field"><label for="pName">Display name <span class="req">(required)</span></label>
      <input id="pName" type="text" maxlength="40" autocomplete="nickname" value="${esc(me.name)}" aria-describedby="pNameErr">
      <p class="msg err" id="pNameErr" role="alert" hidden></p></div>
    <fieldset class="field"><legend>Skills or hobbies you can bring <span class="req">(pick at least one)</span></legend>
      <div class="chips" id="pSkills">${state.skills.map(s => `<label class="toggle"><input type="checkbox" value="${s.id}" ${me.skills.includes(s.id) ? 'checked' : ''}><span>${esc(s.label)}</span></label>`).join('')}</div>
      <div class="custom-skill"><label for="pCustom">Something else? Type any skill or hobby</label>
        <input id="pCustom" type="text" maxlength="40" autocomplete="off" value="${esc(me.custom ? me.custom.text : '')}" placeholder="e.g. ukulele, speedrunning, sourdough, public art" aria-describedby="pCustomNote">
        <p class="hint" id="pCustomNote">${me.custom && me.custom.labels && me.custom.labels.length ? `KNOT treats “${esc(me.custom.text)}” like ${esc(me.custom.labels.join(' and '))}.` : 'Work, school or just for fun. KNOT finds the closest match for it.'}</p></div>
      <p class="msg err" id="pSkillsErr" role="alert" hidden></p></fieldset>
    <details class="optional" ${state.me && (me.city || me.interests || me.availability.length) ? 'open' : ''}><summary>Optional details</summary>
      <div class="field"><label for="pInterests">Interests</label><input id="pInterests" type="text" maxlength="120" value="${esc(me.interests)}" placeholder="e.g. short films, jazz"></div>
      <div class="field"><label for="pCity">City</label><select id="pCity"><option value="">Prefer not to say</option>${CITIES.map(c => `<option ${me.city === c ? 'selected' : ''}>${c}</option>`).join('')}</select></div>
      <fieldset class="field"><legend>Days you’re usually free</legend><div class="chips" id="pDays">${DAYS.map(x => `<label class="toggle"><input type="checkbox" value="${x}" ${me.availability.includes(x) ? 'checked' : ''}><span>${cap(x.slice(0, 3))}</span></label>`).join('')}</div></fieldset>
      <fieldset class="field"><legend>Meeting preference</legend><div class="chips">${[['both', 'Either'], ['in-person', 'In person'], ['online', 'Online']].map(([v, l]) => `<label class="toggle"><input type="radio" name="pMode" value="${v}" ${me.mode === v ? 'checked' : ''}><span>${l}</span></label>`).join('')}</div></fieldset>
    </details>
    <div class="dlg-actions">
      ${state.me || !opts.thenSearch ? '<button type="button" class="btn ghost" id="pCancel">Cancel</button>' : '<button type="button" class="btn ghost" id="pCancel">Not now</button>'}
      <button type="submit" class="btn primary">${opts.thenSearch ? 'Save and find my people' : 'Save profile'}</button>
    </div></form>`;
  d.showModal();
  (opts.focusSkills ? $('#pSkills input') : $('#pName')).focus();
  $('#pCancel').addEventListener('click', () => d.close());
  $('#profileForm').addEventListener('submit', async e => {
    e.preventDefault();
    const name = $('#pName').value.trim(), skills = $$('#pSkills input:checked').map(i => i.value), ctext = $('#pCustom').value.trim();
    let bad = false;
    const nerr = $('#pNameErr'), serr = $('#pSkillsErr');
    nerr.hidden = !!name; serr.hidden = skills.length > 0 || !!ctext;
    if (!name) { nerr.innerHTML = icon.alert + '<span>Enter a display name so your group knows who you are.</span>'; bad = true; $('#pName').setAttribute('aria-invalid', 'true'); }
    if (!skills.length && !ctext) { serr.innerHTML = icon.alert + '<span>Pick a skill or hobby above, or type your own in the box below them.</span>'; if (!bad) $('#pSkills input').focus(); bad = true; }
    if (!name) $('#pName').focus();
    if (bad) return;
    let custom = null;
    if (ctext) {
      if (state.me && state.me.custom && state.me.custom.text === ctext) custom = state.me.custom;
      else {
        const sb = $('#profileForm button[type=submit]'); sb.disabled = true; sb.textContent = 'Matching your skill…';
        try { const r = await api('/api/skills/map', { method: 'POST', body: JSON.stringify({ text: ctext }) }); custom = { text: ctext, ids: r.ids, labels: r.labels, note: r.note || '' }; }
        catch { /* keep going without a mapping */ }
        sb.disabled = false; sb.textContent = opts.thenSearch ? 'Save and find my people' : 'Save profile';
      }
      if (custom) custom.ids.forEach(id => { if (!skills.includes(id)) skills.push(id); });
    }
    if (!skills.length) { serr.innerHTML = icon.alert + `<span>We couldn’t match “${esc(ctext)}” to anything yet. Try another word, or pick a skill above.</span>`; serr.hidden = false; $('#pCustom').focus(); return; }
    state.me = { name, skills, custom, interests: $('#pInterests').value.trim(), city: $('#pCity').value, availability: $$('#pDays input:checked').map(i => i.value), mode: ($('input[name=pMode]:checked') || { value: 'both' }).value };
    store.set('knot.me', state.me); state.respKey = null; if ($('#examples')) refreshExamples();
    if (name !== state.sessionName) apiRaw('/api/profile', { method: 'POST', body: JSON.stringify({ name }) }).then(u => { state.sessionName = u.name; }).catch(() => {});
    d.close(); paintHeader();
    if (opts.thenSearch || (opts.rerun && state.goal.trim())) findPeople(true); else say('Profile saved.');
  });
}

// ---------- CREATE GROUP ----------
function titleFromGoal(goal) {
  let t = goal.trim().replace(/^i (can|want to|would like to|'d like to|wanna|am going to)\s+/i, '').split(/\s*(?:,|;|\band i\b|\bbut i\b|\band need\b|\bneed\b|\bi need\b)/i)[0].replace(/[.!?]+$/, '').trim() || goal.trim();
  if (t.length > 60) t = t.slice(0, 57).replace(/\s+\S*$/, '') + '…';
  return cap(t);
}
let createRequestId = null;
function openCreate() {
  const sel = selectedResults(); if (!sel.length) return;
  createRequestId = uid();
  const acct = state.acct;
  const d = $('#createDialog');
  const demoNote = !acct ? `<p class="msg info small">You are not signed in, so this is a demo sandbox group: fictional profiles, kept off Discover, and not shared across devices. Create an account to make a real group that others can find and join.</p>` : '';
  const memberNote = sel.length ? `<p class="msg info small">The people you picked are fictional demo profiles. They won’t reply, but you can chat and plan here.</p>` : '';
  d.innerHTML = `<form id="createForm" method="dialog" novalidate class="dlg">
    <div class="dlg-head">${markImg(64)}<div><h2 id="createTitle">Create your group</h2><p class="hint">Name it, decide who can find it, then start the chat.</p></div></div>
    <div class="goal-quote"><span class="gq-label">Your goal</span><p>“${esc(state.goal.trim())}”</p></div>
    <div class="field"><label for="gName">Group name</label><input id="gName" type="text" maxlength="80" value="${esc(titleFromGoal(state.goal))}" aria-describedby="gNameErr"><p class="msg err" id="gNameErr" role="alert" hidden></p></div>
    <div class="field"><label for="gDesc">Short description <span class="opt">(optional)</span></label><input id="gDesc" type="text" maxlength="300" placeholder="One line people will see in Discover"></div>
    <fieldset class="field"><legend>Who’s included</legend>
      <ul class="member-list"><li><span class="avatar sm" aria-hidden="true">${esc(initials(state.me.name))}</span><span><strong>${esc(state.me.name)}</strong> (you)</span></li>
      ${sel.map(s => `<li><span class="avatar sm" aria-hidden="true">${esc(initials(s.name))}</span><span><strong>${esc(s.name)}</strong> <span class="meta">${esc(s.city)}</span></span></li>`).join('')}</ul>
    </fieldset>
    ${memberNote}${demoNote}
    ${acct ? `<details class="optional"><summary>Who can find this group</summary>
      <fieldset class="field"><legend>Visibility</legend><div class="chips">
        <label class="toggle"><input type="radio" name="gVis" value="public" checked><span>Public (in Discover)</span></label>
        <label class="toggle"><input type="radio" name="gVis" value="private"><span>Private (invite link only)</span></label></div></fieldset>
      <fieldset class="field"><legend>Joining</legend><div class="chips">
        <label class="toggle"><input type="radio" name="gJoin" value="open" checked><span>Anyone can join</span></label>
        <label class="toggle"><input type="radio" name="gJoin" value="request"><span>You approve each request</span></label></div></fieldset>
      <div class="field"><label for="gCap">Member cap</label><input id="gCap" type="number" min="2" max="50" value="12"></div>
      <div class="field"><label class="toggle"><input type="checkbox" id="gOnline"><span>This group meets online only</span></label></div>
      <p class="hint">Age groups never mix: this group is for ${esc(acct.ageCategory === 'teen' ? 'members 13 to 17' : 'members 18 and over')} because that is your account's age group.</p>
    </details>` : ''}
    <p class="msg err" id="gErr" role="alert" hidden></p>
    <div class="dlg-actions"><button type="button" class="btn ghost" id="gCancel">Cancel</button><button type="submit" class="btn primary" id="gSubmit">Create group</button></div>
  </form>`;
  d.showModal(); $('#gName').focus(); $('#gName').select();
  $('#gCancel').addEventListener('click', () => d.close());
  let busy = false;
  $('#createForm').addEventListener('submit', async e => {
    e.preventDefault(); if (busy) return;
    const title = $('#gName').value.trim();
    if (!title) { const er = $('#gNameErr'); er.innerHTML = icon.alert + '<span>Give the group a name so you can find it later.</span>'; er.hidden = false; $('#gName').focus(); return; }
    busy = true; const btn = $('#gSubmit'); btn.disabled = true; btn.textContent = 'Creating…'; btn.setAttribute('aria-busy', 'true');
    try {
      const body = { requestId: createRequestId, clientId: state.clientId, ownerName: state.me.name, ownerSkills: state.me.skills, title, goal: state.goal.trim(), memberIds: sel.map(s => s.id), description: $('#gDesc') ? $('#gDesc').value.trim() : '' };
      if (acct) {
        body.visibility = ($('input[name=gVis]:checked') || { value: 'public' }).value;
        body.joinMode = ($('input[name=gJoin]:checked') || { value: 'open' }).value;
        body.capacity = Number($('#gCap').value) || 12;
        body.onlineOnly = $('#gOnline').checked;
        body.ageScope = acct.ageCategory;
      }
      const { room } = await api('/api/rooms', { method: 'POST', body: JSON.stringify(body) });
      d.close(); state.selected.clear();
      await playKnot(room);
      location.hash = '#/room/' + room.id;
    } catch (err) {
      busy = false; btn.disabled = false; btn.textContent = 'Try again'; btn.removeAttribute('aria-busy');
      const g = $('#gErr'); g.innerHTML = icon.alert + `<span>We couldn’t create the group (${esc(err.message)}). Nothing was lost. Try again.</span>`; g.hidden = false;
    }
  });
}

// knot animation: the two strands tie into the KNOT mark, played once after the room exists
function playKnot(room) {
  return new Promise(resolve => {
    const root = $('#overlayRoot'); const still = reduceMotion();
    root.innerHTML = `<div class="knot-overlay ${still ? 'still' : ''}" role="status">
      <svg viewBox="0 0 256 192" width="260" height="195" aria-hidden="true">
        <defs>
          <linearGradient id="kv" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#342168"/><stop offset=".43" stop-color="#9271E3"/><stop offset="1" stop-color="#5938B5"/></linearGradient>
          <linearGradient id="km" x1="0" y1="0" x2=".35" y2="1"><stop offset="0" stop-color="#5B5462"/><stop offset=".22" stop-color="#F7F4ED"/><stop offset=".43" stop-color="#9E98A8"/><stop offset=".67" stop-color="#E9E8EF"/><stop offset="1" stop-color="#4C455A"/></linearGradient>
        </defs>
        <g fill="none" stroke-linecap="round">
          <path class="k k1" pathLength="1" d="M14 89 C43 89 48 136 88 135 C129 134 136 53 178 53 C209 53 214 89 242 89" stroke="#211E28" stroke-width="28"/>
          <path class="k k1" pathLength="1" d="M14 89 C43 89 48 136 88 135 C129 134 136 53 178 53 C209 53 214 89 242 89" stroke="url(#kv)" stroke-width="22"/>
          <path class="k k2" pathLength="1" d="M14 111 C49 111 50 57 91 57 C130 57 139 130 179 130 C210 130 216 111 242 111" stroke="#302B3A" stroke-width="30"/>
          <path class="k k2" pathLength="1" d="M14 111 C49 111 50 57 91 57 C130 57 139 130 179 130 C210 130 216 111 242 111" stroke="url(#km)" stroke-width="24"/>
        </g></svg>
      <p class="msg ok big">${icon.check}<span>Group created: ${esc(room.title)}</span></p></div>`;
    say('Group created: ' + room.title);
    setTimeout(() => { root.innerHTML = ''; resolve(); }, still ? 900 : 1300);
  });
}

// ---------- DISCOVER ----------
// Public groups of real members only. Demo and private groups never appear here, and every viewer
// is only shown groups inside their own age scope (the server enforces this; the client just paints).
async function renderDiscover() {
  const main = $('#main');
  main.innerHTML = `<section class="page discover" aria-labelledby="dh">
    <h1 id="dh" tabindex="-1" class="page-title">Discover groups</h1>
    <p class="lead">Public groups open to people like you. Demo profiles and private groups are never listed here.</p>
    <div id="discBody" aria-live="polite"><p class="hint">Loading…</p></div></section>`;
  $('#dh').focus({ preventScroll: true });
  const body = $('#discBody'); if (!body) return;
  let acct = state.acct;
  if (!acct) {
    body.innerHTML = `<div class="empty center"><img src="assets/art/puzzle_piece.png" width="150" height="152" alt="" class="empty-art"><div><h2>Sign in to discover groups</h2><p>Public discovery is for members with accounts, so groups stay inside their age group and blocked people stay apart.</p><button type="button" class="btn primary" id="discSignin">Sign in</button></div></div>`;
    $('#discSignin').addEventListener('click', () => openAuth('in'));
    return;
  }
  let groups = [], q = '', mode = '';
  const paint = () => {
    const list = groups.filter(g =>
      (!q || [g.title, g.goal, g.description, g.category].filter(Boolean).join(' ').toLowerCase().includes(q.toLowerCase())) &&
      (!mode || (mode === 'online' ? g.onlineOnly : !g.onlineOnly)));
    if (!list.length) {
      body.innerHTML = `<div class="empty center"><img src="assets/art/puzzle_piece.png" width="150" height="152" alt="" class="empty-art"><div><h2>Nothing here yet</h2><p>No public groups match. Groups you create can show up here for others.</p><a class="btn primary" href="#/">Start with a goal</a></div></div>`;
      return;
    }
    body.innerHTML = `<div class="disc-filters">
        <input id="discQ" type="search" maxlength="60" placeholder="Search groups" aria-label="Search groups" value="${esc(q)}">
        <div class="chips">${[['', 'All'], ['online', 'Online'], ['in-person', 'In person']].map(([v, l]) => `<label class="toggle"><input type="radio" name="discMode" value="${v}" ${mode === v ? 'checked' : ''}><span>${l}</span></label>`).join('')}</div></div>
      <ul class="group-list">${list.map(g => `<li><div class="group-row disc-row">${markImg(52)}<span class="g-main"><strong>${esc(g.title)}</strong><span class="g-goal">“${esc(g.goal)}”</span>
        <span class="meta">${g.memberCount}/${g.capacity} members · ${g.onlineOnly ? 'online' : 'in person'}${g.city ? ' · ' + esc(g.city) : ''}${g.joinMode === 'request' ? ' · asks to join' : ''}</span></span>
        <button type="button" class="btn primary sm" data-join="${esc(g.id)}" data-mode="${g.joinMode}">${g.joinMode === 'request' ? 'Ask to join' : 'Join'}</button></div></li>`).join('')}</ul>`;
    $('#discQ').addEventListener('input', e => { q = e.target.value; const keep = document.activeElement; paint(); const nq = $('#discQ'); if (nq && keep === e.target) { nq.focus(); nq.setSelectionRange(nq.value.length, nq.value.length); } });
    $$('input[name=discMode]', body).forEach(r => r.addEventListener('change', e => { mode = e.target.value; paint(); }));
    $$('[data-join]', body).forEach(b => b.addEventListener('click', async () => {
      b.disabled = true;
      try {
        const r = await apiRaw(`/api/rooms/${b.dataset.join}/join`, { method: 'POST', body: '{}' });
        if (r.pending) { b.textContent = 'Request sent'; b.disabled = true; say('Join request sent. The group owner will approve it.'); return; }
        location.hash = '#/room/' + r.room.id;
      } catch (ex) { say(ex.message); b.disabled = false; b.textContent = b.dataset.mode === 'request' ? 'Ask to join' : 'Join'; }
    }));
  };
  paint();
  try { const r = await apiRaw('/api/groups'); groups = r.groups; paint(); } catch (ex) { body.innerHTML = `<p class="msg err" role="alert">${icon.alert}<span>${esc(ex.message)}</span></p>`; }
}

// ---------- AI FINDER ----------
state.finder = { items: [], busy: false };
const FINDER_HELLO = 'Hi! Tell me what you want to do and who you need. I’ll find people from KNOT’s community.';
const FINDER_IDEAS = ['I need someone to edit my short film', 'I want a hiking buddy this weekend', 'Looking for a board game night in Plano'];

function finderCard(r) {
  const flag = r.flags && r.flags[0];
  return `<li class="fcard"><div class="avatar sm" style="--hue:${hueOf(r.name)}" aria-hidden="true">${esc(initials(r.name))}</div>
    <div><strong>${esc(r.name)}</strong> <span class="meta">${esc(r.city)} · ${esc(r.modeText)}</span>
    <p>${esc(r.reason)}</p>${flag ? `<p class="fflag">${icon.alert}<span>${esc(flag.text)}</span></p>` : ''}</div></li>`;
}
function finderBubble(m, i) {
  if (m.role === 'user') return `<div class="bubble me">${esc(m.content)}</div>`;
  let extra = '';
  if (m.result) {
    const res = m.result.results || [];
    extra = res.length
      ? `<ul class="fcards">${res.map(finderCard).join('')}</ul><button type="button" class="btn primary sm" data-open="${i}">Open full matches ${icon.arrow}</button>`
      : `<p class="fnone">${esc((m.result.empty && m.result.empty.message) || 'No one fits that yet.')}</p><button type="button" class="btn ghost sm" data-open="${i}">Adjust on Home ${icon.arrow}</button>`;
  }
  return `<div class="bubble bot">${esc(m.content)}${extra}</div>`;
}
function paintFinder() {
  const log = $('#fLog'); if (!log) return;
  log.innerHTML = `<div class="bubble bot">${esc(FINDER_HELLO)}</div>` + state.finder.items.map(finderBubble).join('') +
    (state.finder.busy ? '<div class="bubble bot typing" aria-label="KNOT is thinking"><i></i><i></i><i></i></div>' : '') +
    (state.finder.error ? `<p class="msg err" role="alert">${icon.alert}<span>${esc(state.finder.error)} </span>${state.finder.items.length && state.finder.items[state.finder.items.length - 1].role === 'user' ? '<button type="button" class="link-btn" id="fRetry">Try again</button>' : ''}</p>` : '');
  log.scrollTop = log.scrollHeight; queueNext();
  const send = $('#fSend'); if (send) { send.disabled = state.finder.busy; send.setAttribute('aria-busy', state.finder.busy); }
}
async function finderAsk() {
  const f = state.finder; f.busy = true; f.error = null; paintFinder();
  try {
    const history = f.items.map(m => ({ role: m.role, content: m.content }));
    const out = await api('/api/ai/finder', { method: 'POST', body: JSON.stringify({ history, me: { skills: state.me ? state.me.skills : [] } }) });
    f.items.push({ role: 'assistant', content: out.reply, goal: out.goal, result: out.result });
  } catch (e) { f.error = e.message; }
  f.busy = false; paintFinder();
  const i = $('#fInput'); if (i) i.focus({ preventScroll: true });
}
function finderOpen(i) {
  const m = state.finder.items[i]; if (!m || !m.goal) return;
  state.goal = m.goal; store.set('knot.goal', m.goal); store.set('knot.searched', true);
  state.relaxed = []; state.resp = null; state.respKey = null; state.selected.clear();
  location.hash = '#/';
  setTimeout(() => findPeople(true), 80);
}
async function renderFinder() {
  $('#main').innerHTML = `<section class="finder" aria-labelledby="fh">
    <h1 id="fh" tabindex="-1">AI Finder</h1>
    <p class="lead">Chat about what you want to do, for work or for fun. I’ll find people who’d be into it.</p>
    <div id="fOff" class="msg warn" hidden></div>
    <div class="chat" id="fLog" role="log" aria-live="polite" aria-label="Conversation"></div>
    <div class="ideas" id="fIdeas"></div>
    <form id="fForm" class="chat-form" novalidate>
      <label class="sr" for="fInput">Message to the AI Finder</label>
      <input id="fInput" type="text" maxlength="300" autocomplete="off" placeholder="What do you want to do?">
      <button class="btn primary" id="fSend" type="submit">Send ${icon.send}</button>
    </form></section>`;
  paintFinder();
  const ideas = (list, label) => { const b = $('#fIdeas'); if (b) b.innerHTML = `<span class="ex-label">${esc(label)}</span>` + list.map(x => `<button type="button" class="chip example" data-idea="${esc(x)}">${esc(x)}</button>`).join(''); };
  ideas(FINDER_IDEAS, 'Try one of these');
  fetchExamples().then(r => ideas(r.examples, r.label)).catch(() => {});
  const send = txt => {
    txt = txt.trim();
    if (!txt) { state.finder.error = 'Your message is empty. Type what you want to do, for example “I need someone to edit my short film”, then press Send.'; paintFinder(); $('#fInput').focus(); return; }
    if (state.finder.busy) return;
    state.finder.items.push({ role: 'user', content: txt }); $('#fInput').value = ''; finderAsk();
  };
  $('#fForm').addEventListener('submit', e => { e.preventDefault(); send($('#fInput').value); });
  $('#fIdeas').addEventListener('click', e => { const b = e.target.closest('[data-idea]'); if (b) send(b.dataset.idea); });
  $('#fLog').addEventListener('click', e => {
    const o = e.target.closest('[data-open]'); if (o) finderOpen(Number(o.dataset.open));
    if (e.target.closest('#fRetry')) finderAsk();
  });
  $('#fInput').focus({ preventScroll: true });
  try {
    const s = await api('/api/status');
    if (!s.ai) { const o = $('#fOff'); if (!o) return; o.hidden = false; o.innerHTML = icon.alert + '<span>The AI Finder isn’t switched on for this server, so chatting is disabled. Use <a href="#/">Home</a> to describe your goal.</span>'; $('#fInput').disabled = true; $('#fSend').disabled = true; }
  } catch { /* status is optional */ }
}

async function renderGroups() {
  const main = $('#main');
  main.innerHTML = `<section class="page"><h1 id="h1" tabindex="-1" class="page-title">My groups</h1><div id="groupList" aria-live="polite"><p class="hint">Loading…</p></div></section>`;
  $('#h1').focus({ preventScroll: true });
  const rooms = await refreshGroupCount();
  const list = $('#groupList'); if (!list) return;
  if (!rooms.length) {
    list.innerHTML = `<div class="empty center"><img src="assets/art/puzzle_piece.png" width="150" height="152" alt="" class="empty-art"><div><h2>No groups yet</h2><p>Describe what you want to do, pick the people who fit, and your first group will show up here.</p><a class="btn primary" href="#/">Find my people</a></div></div>`;
    queueNext(); return;
  }
  list.innerHTML = `<ul class="group-list">${rooms.map(r => `<li><a class="group-row" href="#/room/${r.id}">${markImg(52)}<span class="g-main"><strong>${esc(r.title)}</strong><span class="g-goal">“${esc(r.goal)}”</span><span class="meta">${r.memberCount} ${r.memberCount === 1 ? 'person' : 'people'} · ${r.messageCount} ${r.messageCount === 1 ? 'message' : 'messages'}${r.demo ? ' · demo' : ''}</span></span>${icon.arrow}</a></li>`).join('')}</ul>`;
}

// ---------- ROOM ----------
const timeFmt = ts => new Date(ts).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
function stopPoll() { clearInterval(state.pollTimer); state.pollTimer = null; }

// Joining someone else's group through their invite link: #/join/<code>
async function renderJoin(code) {
  const main = $('#main');
  main.innerHTML = '<section class="page"><p class="hint">Joining group…</p></section>';
  try {
    const r = await api('/api/rooms/join', { method: 'POST', body: JSON.stringify({ code }) });
    if (r.pending) {
      main.innerHTML = `<section class="page"><div class="empty center"><img src="assets/art/heart_chat.png" width="150" height="130" alt="" class="empty-art"><div><h1 id="h1" tabindex="-1">Request sent</h1><p>The group owner will approve or decline your request. If they approve, the group shows up in My groups.</p><a class="btn primary" href="#/groups">Go to My groups</a></div></div></section>`;
      $('#h1').focus();
      say('Join request sent. The owner will review it.');
      return;
    }
    say('Joined ' + r.room.title);
    location.hash = '#/room/' + r.room.id;
  } catch (e) {
    main.innerHTML = `<section class="page"><div class="empty center"><img src="assets/art/puzzle_piece.png" width="150" height="152" alt="" class="empty-art"><div><h1 id="h1" tabindex="-1">That invite didn’t work</h1><p>${esc(e.message)}</p><a class="btn primary" href="#/">Go to KNOT</a></div></div></section>`;
    $('#h1').focus();
  }
}

async function renderRoom(id) {
  const main = $('#main');
  main.innerHTML = '<section class="page"><p class="hint">Opening group…</p></section>';
  let room;
  try { const d = await api('/api/rooms/' + encodeURIComponent(id)); room = d.room; state.roomNext = d.next; }
  catch (e) {
    main.innerHTML = `<section class="page"><div class="empty center"><img src="assets/art/puzzle_piece.png" width="150" height="152" alt="" class="empty-art"><div><h1 id="h1" tabindex="-1">We couldn’t open that group</h1><p>${esc(e.message)}</p><a class="btn primary" href="#/groups">Back to My groups</a></div></div></section>`;
    $('#h1').focus(); return;
  }
  if (!room.isMember) { // public preview: read-only card with a join button
    main.innerHTML = `<section class="room"><a class="back" href="#/discover">← Discover</a>
      <header class="room-head">${markImg(64)}<div><h1 id="h1" tabindex="-1">${esc(room.title)}</h1>
      <p class="room-goal"><span class="gq-label">Goal</span> “${esc(room.goal)}”</p>
      <p class="meta">${room.capacityUsed}/${room.capacity} members · ${room.joinMode === 'request' ? 'asks to join' : 'open to join'}${room.demo ? ' · demo group' : ''}</p>
      <button type="button" class="btn primary" id="previewJoin">${room.joinMode === 'request' ? 'Ask to join' : 'Join group'}</button></div></header>
      <p class="msg info small">Join to see messages and chat. ${room.demo ? 'This is a guest demo group kept out of Discover.' : 'Only members can read this group.'}</p></section>`;
    $('#h1').focus({ preventScroll: true });
    $('#previewJoin').addEventListener('click', async e => {
      e.target.disabled = true;
      try {
        const r = await apiRaw(`/api/rooms/${id}/join`, { method: 'POST', body: '{}' });
        if (r.pending) { e.target.textContent = 'Request sent'; say('Join request sent. The owner will approve it.'); return; }
        renderRoom(id);
      } catch (ex) { e.target.disabled = false; say(ex.message); }
    });
    return;
  }
  const isOwner = room.myRole === 'owner';
  const canMod = isOwner || room.myRole === 'moderator';
  const askknotOn = room.aiMode !== 'off' && !localRooms;
  main.innerHTML = `<section class="room">
    <a class="back" href="#/groups">← My groups</a>
    <header class="room-head">${markImg(64)}<div><h1 id="h1" tabindex="-1">${esc(room.title)}</h1>
      <p class="room-goal"><span class="gq-label">Goal</span> “${esc(room.goal)}”</p>
      <p class="meta">${room.capacityUsed}/${room.capacity} members${room.ageScope ? ' · ' + (room.ageScope === 'teen' ? '13 to 17' : '18+') : ''}${room.aiMode !== 'off' ? ' · KNOT AI ' + room.aiMode : ''} · you are ${esc(room.myRole || 'member')}</p>
      <div class="room-actions">
        ${room.inviteCode ? `<button type="button" class="btn quiet sm" id="inviteBtn">Copy invite link</button>` : ''}
        ${!isOwner ? `<button type="button" class="btn quiet sm" id="leaveBtn">Leave group</button>` : ''}
        ${isOwner ? `<button type="button" class="btn quiet sm" id="settingsBtn">Group settings</button>` : ''}
      </div>
      <span id="inviteCopied" class="hint" hidden>Invite link copied. Anyone who opens it can ask to join this room.</span>
    </div></header>
    <div class="room-grid">
      <div class="chat">
        <ol id="msgs" class="msgs" aria-label="Messages" aria-live="polite"></ol>
        <div id="draftBox" class="draft" hidden></div>
        <form id="composer" class="composer" novalidate>
          <label for="msgText" class="sr">Message</label>
          <textarea id="msgText" rows="2" maxlength="2000" placeholder="${askknotOn ? 'Write a message, or type /askknot to ask KNOT AI' : 'Write a message to the group'}" aria-describedby="msgErr"></textarea>
          <div class="composer-row">
            <button type="button" class="btn quiet" id="assistBtn"><img src="assets/art/sparkle.png" width="20" height="20" alt="" class="spark"><span>Help us get started</span></button>
            <span id="sentOk" class="msg ok" hidden>${icon.check}<span>Message sent</span></span>
            <button type="submit" class="btn primary" id="sendBtn">${icon.send}<span>Send</span></button>
          </div>
          <p class="msg err" id="msgErr" role="alert" hidden></p>
        </form>
      </div>
      <aside class="members" aria-labelledby="memHead">
        <h2 id="memHead">Members</h2>
        ${canMod && (room.joinRequests || []).length ? `<div class="mod-block"><h3>Join requests</h3><ul>${room.joinRequests.map(r => `<li class="req-row"><span><strong>${esc(r.name)}</strong> <span class="meta">asked to join</span></span><span><button type="button" class="btn primary sm" data-approve="${esc(r.pid)}">Approve</button><button type="button" class="btn ghost sm" data-decline="${esc(r.pid)}">Decline</button></span></li>`).join('')}</ul></div>` : ''}
        <ul id="memberList">${room.members.map(m => {
          const isDemo = m.demo !== false;
          const roleBadge = !isDemo && m.role && m.role !== 'member' ? `<span class="badge role">${esc(cap(m.role))}</span>` : '';
          const badge = !isDemo ? (m.you ? roleBadge : `<span class="badge neutral">Real member</span> ${roleBadge}`) : '<span class="badge neutral">Demo profile</span>';
          const meta = m.you ? 'You' : (!isDemo ? esc(m.modeText) : esc(m.city ? `${m.city} · ` : '') + esc(m.modeText));
          const extra = !isDemo ? '' : `<span class="meta">${esc((m.skillLabels || []).join(', '))}</span><span class="meta ${m.availabilityDays ? '' : 'unk'}">${m.availabilityDays ? 'Free: ' : ''}${esc(m.availabilityText)}</span>`;
          const menu = (!isDemo && !m.you) ? `<details class="member-menu"><summary aria-label="Actions for ${esc(m.name)}">⋯</summary><div class="menu-pop">
            ${isOwner && m.role !== 'owner' ? `<button type="button" data-action="promote" data-pid="${esc(m.id)}" data-role="moderator">Make moderator</button>
            ${m.role === 'moderator' ? '<button type="button" data-action="promote" data-pid="' + esc(m.id) + '" data-role="member">Make member</button>' : ''}
            <button type="button" data-action="transfer" data-pid="${esc(m.id)}">Make owner</button>` : ''}
            ${canMod && m.role !== 'owner' ? `<button type="button" data-action="kick" data-pid="${esc(m.id)}">Remove from group</button>
            <button type="button" class="danger" data-action="ban" data-pid="${esc(m.id)}">Remove and ban</button>` : ''}
            <button type="button" data-action="report" data-pid="${esc(m.id)}">Report to organizer</button>
            <button type="button" data-action="block" data-pid="${esc(m.id)}">Block (keeps them out of your matches)</button>
          </div></details>` : '';
          return `<li><span class="avatar sm" aria-hidden="true">${esc(initials(m.name))}</span><span class="mem-main"><strong>${esc(m.name)}</strong>${m.you ? ' (you)' : ''} ${badge}<span class="meta">${meta}</span>${extra}</span>${menu}</li>`;
        }).join('')}</ul>
        ${canMod && (room.bans || []).length ? `<div class="mod-block"><h3>Removed (banned)</h3><ul>${room.bans.map(b => `<li><span><strong>${esc(b.name)}</strong> <span class="meta">${esc(b.reason || 'no reason given')}</span></span><button type="button" class="btn ghost sm" data-unban="${esc(b.pid)}">Allow back in</button></li>`).join('')}</ul></div>` : ''}
        <p class="msg info small">Profiles tagged “Demo profile” are fictional examples from the KNOT community. They won’t reply. Everyone who joins through the invite link is a real member and can chat here.</p>
        <p class="msg info small">Meet new people in public places, bring a friend, and tell someone where you are going. Use Report for anything worrying; KNOT never claims members are screened.</p>
      </aside>
    </div></section>`;
  $('#h1').focus({ preventScroll: true });
  let lastCount = -1;
  const mineMsg = m => (state.acct ? m.authorAccountId === state.acct.accountId : (m.authorId === state.sessionId || m.authorId === state.clientId));
  const paint = (r, force) => {
    if (!force && r.messages.length === lastCount) return;
    const box = $('#msgs'); const near = box.scrollHeight - box.scrollTop - box.clientHeight < 80 || lastCount < 0;
    lastCount = r.messages.length; if (lastCount) state.roomNext = null; queueNext();
    box.innerHTML = r.messages.length ? r.messages.map(m => `<li class="msg-item ${m.kind === 'assistant' ? 'ai' : (mineMsg(m) ? 'mine' : '')}"><div class="bubble"><div class="m-head"><strong>${esc(m.authorName)}</strong>${m.kind === 'assistant' ? '<span class="badge assistant">KNOT AI</span>' : ''}<time datetime="${esc(m.ts)}">${esc(timeFmt(m.ts))}</time></div><p>${esc(m.text)}</p></div></li>`).join('')
      : `<li class="msg-empty"><img src="assets/art/heart_chat.png" width="120" height="104" alt="" loading="lazy"><p><strong>Say hello.</strong> Start the conversation, or ask for a first step.</p></li>`;
    if (near) box.scrollTop = box.scrollHeight;
  };
  paint(room, true); queueNext();
  let lastModSig = JSON.stringify([room.joinRequests, room.bans, room.myRole]);
  state.pollTimer = setInterval(async () => {
    try {
      const d = await api('/api/rooms/' + id);
      const sig = JSON.stringify([d.room.joinRequests, d.room.bans, d.room.myRole]);
      room.messages = d.room.messages; room.members = d.room.members;
      room.joinRequests = d.room.joinRequests; room.bans = d.room.bans;
      room.aiMode = d.room.aiMode; room.myRole = d.room.myRole;
      paint(d.room);
      if (sig !== lastModSig) { lastModSig = sig; renderRoom(id); } // a request or role changed: full repaint
    } catch { /* offline: keep showing */ }
  }, 2500);

  if (!room.inviteCode) { const ib = $('#inviteBtn'); if (ib) ib.hidden = true; }
  else $('#inviteBtn').addEventListener('click', async () => {
    const link = location.origin + location.pathname + '#/join/' + room.inviteCode;
    try { await navigator.clipboard.writeText(link); }
    catch { prompt('Copy this invite link and share it with your group:', link); }
    const ok = $('#inviteCopied'); if (ok) { ok.hidden = false; setTimeout(() => { ok.hidden = true; }, 4000); }
    say('Invite link copied');
  });

  const refresh = async () => {
    try {
      const d = await api('/api/rooms/' + id);
      room = Object.assign(room, d.room);
      paint(room, true);
      clearInterval(state.pollTimer); state.pollTimer = null;
      renderRoom(id); // full repaint keeps role menus and mod blocks in sync
    } catch { /* keep current view */ }
  };
  const modAction = async (action, body) => {
    try { await apiRaw(`/api/rooms/${id}/${action}`, { method: 'POST', body: JSON.stringify(body || {}) }); say('Done'); refresh(); }
    catch (ex) { say(ex.message); }
  };
  $('#memberList').addEventListener('click', async e => {
    const b = e.target.closest('[data-action]'); if (!b) return;
    const pid = b.dataset.pid, action = b.dataset.action;
    if (action === 'report') return openReport({ roomId: id, targetPid: pid });
    if (action === 'block') { try { await apiRaw('/api/blocks', { method: 'POST', body: JSON.stringify({ pid }) }); say('Blocked. They stay out of your matches and join requests.'); } catch (ex) { say(ex.message); } return; }
    if (action === 'promote') return modAction('promote', { pid, role: b.dataset.role });
    if (action === 'transfer') { if (confirm('Hand this group over to ' + (room.members.find(m => m.id === pid) || {}).name + '? You become a regular member.')) modAction('transfer', { pid }); return; }
    if (action === 'kick') { if (confirm('Remove this member from the group?')) modAction('kick', { pid }); return; }
    if (action === 'ban') { if (confirm('Remove AND ban? They cannot rejoin unless a moderator unbans them.')) modAction('ban', { pid, reason: 'Removed by ' + (state.acct ? state.acct.name : 'moderator') }); return; }
  });
  document.addEventListener('click', e => { if (!e.target.closest('.member-menu')) $$('.member-menu[open]').forEach(d => d.removeAttribute('open')); }, { capture: true });
  $$('.mod-block [data-unban]').forEach(b => b.addEventListener('click', () => modAction('unban', { pid: b.dataset.unban })));
  $$('.mod-block [data-approve]').forEach(b => b.addEventListener('click', () => modAction('requests', { pid: b.dataset.approve, approve: true })));
  $$('.mod-block [data-decline]').forEach(b => b.addEventListener('click', () => modAction('requests', { pid: b.dataset.decline, approve: false })));

  const leaveBtn = $('#leaveBtn'); if (leaveBtn) leaveBtn.addEventListener('click', async () => {
    if (!confirm('Leave this group?')) return;
    try { await apiRaw(`/api/rooms/${id}/leave`, { method: 'POST', body: '{}' }); location.hash = '#/groups'; } catch (ex) { say(ex.message); }
  });
  const settingsBtn = $('#settingsBtn'); if (settingsBtn) settingsBtn.addEventListener('click', () => openSettings(room, refresh));

  const post = async (text, kind) => {
    // In shared mode the server stamps the author from the session cookie; the browser never names itself.
    const body = localRooms ? { text, kind, authorId: state.clientId, authorName: state.me ? state.me.name : 'You' } : { text, kind, clientMsgId: uid() };
    const { message } = await api(`/api/rooms/${id}/messages`, { method: 'POST', body: JSON.stringify(body) });
    if (!message.duplicate) { room.messages.push(message); paint(room, true); }
    const ok = $('#sentOk'); ok.hidden = false; say('Message sent'); clearTimeout(ok._t); ok._t = setTimeout(() => { ok.hidden = true; }, 3000);
  };
  const ta = $('#msgText');
  ta.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); $('#composer').requestSubmit(); } });
  ta.addEventListener('input', () => { $('#msgErr').hidden = true; });
  let sending = false;
  $('#composer').addEventListener('submit', async e => {
    e.preventDefault(); if (sending) return;
    const text = ta.value.trim();
    if (!text) { const er = $('#msgErr'); er.innerHTML = icon.alert + '<span>Type a message first.</span>'; er.hidden = false; ta.focus(); return; }
    sending = true; $('#sendBtn').disabled = true;
    try { await post(text, 'user'); ta.value = ''; ta.focus(); }
    catch (err) {
      const er = $('#msgErr');
      er.innerHTML = icon.alert + `<span>${esc(err.message)}</span>`; er.hidden = false;
      if (!err.held) er.insertAdjacentHTML('beforeend', ' <span>Your message is still in the box.</span>');
      if (err.held) ta.value = '';
    }
    finally { sending = false; $('#sendBtn').disabled = false; }
  });

  $('#assistBtn').addEventListener('click', async () => {
    const btn = $('#assistBtn'); btn.disabled = true; btn.setAttribute('aria-busy', 'true');
    const box = $('#draftBox');
    try {
      const { text } = await api(`/api/rooms/${id}/assist`, { method: 'POST', body: '{}' });
      box.hidden = false;
      box.innerHTML = `<div class="draft-head"><span class="badge assistant">Assistant draft</span><span class="hint">Built from your goal and members’ profiles by KNOT’s starter template. No AI model is connected. Edit anything before posting.</span></div>
        <label for="draftText" class="sr">Draft message</label><textarea id="draftText" rows="9">${esc(text)}</textarea>
        <div class="draft-actions"><button type="button" class="btn ghost" id="draftDiscard">Discard</button><button type="button" class="btn primary" id="draftPost">Post draft</button></div>`;
      $('#draftText').focus();
      $('#draftDiscard').addEventListener('click', () => { box.hidden = true; box.innerHTML = ''; btn.focus(); });
      $('#draftPost').addEventListener('click', async () => {
        const t = $('#draftText').value.trim(); if (!t) return;
        $('#draftPost').disabled = true;
        try { await post(t, 'assistant'); box.hidden = true; box.innerHTML = ''; ta.focus(); }
        catch (err) { $('#draftPost').disabled = false; box.insertAdjacentHTML('beforeend', `<p class="msg err" role="alert">${icon.alert}<span>Couldn’t post the draft (${esc(err.message)}). Try again.</span></p>`); }
      });
    } catch (err) {
      box.hidden = false;
      box.innerHTML = `<p class="msg err" role="alert">${icon.alert}<span>The starter helper isn’t available right now (${esc(err.message)}). You can still chat normally.</span></p>`;
    } finally { btn.disabled = false; btn.removeAttribute('aria-busy'); }
  });
}

// Group settings dialog (owner): title, AI mode, joining, visibility, capacity.
function openSettings(room, onSaved) {
  const d = $('#settingsDialog');
  const aiOptions = [['off', 'Off (default)'], ['on-demand', 'On demand: members type /askknot'], ['on', 'On: replies after each message']];
  d.innerHTML = `<form method="dialog" id="settingsForm" novalidate class="dlg">
    <div class="dlg-head">${markImg(48)}<div><h2 id="settingsTitle">Group settings</h2><p class="hint">Only you, the owner, can change these.</p></div></div>
    <div class="field"><label for="sTitle">Group name</label><input id="sTitle" type="text" maxlength="80" value="${esc(room.title)}"></div>
    <fieldset class="field"><legend>KNOT AI in this room</legend>
      <div class="chips" role="radiogroup">${aiOptions.map(([v, l]) => `<label class="toggle"><input type="radio" name="sAi" value="${v}" ${room.aiMode === v ? 'checked' : ''}><span>${esc(l)}</span></label>`).join('')}</div>
      <p class="hint">KNOT AI answers from this group's real member profiles. It never speaks as a human, and members see the “KNOT AI” badge on its messages. With no AI configured, this stays off.</p>
    </fieldset>
    <fieldset class="field"><legend>Joining</legend><div class="chips">
      <label class="toggle"><input type="radio" name="sJoin" value="open" ${room.joinMode === 'open' ? 'checked' : ''}><span>Anyone can join</span></label>
      <label class="toggle"><input type="radio" name="sJoin" value="request" ${room.joinMode === 'request' ? 'checked' : ''}><span>You approve each request</span></label></div></fieldset>
    <fieldset class="field"><legend>Visibility</legend><div class="chips">
      <label class="toggle"><input type="radio" name="sVis" value="public" ${room.visibility === 'public' ? 'checked' : ''}><span>Public (in Discover)</span></label>
      <label class="toggle"><input type="radio" name="sVis" value="private" ${room.visibility === 'private' ? 'checked' : ''}><span>Private (invite only)</span></label></div></fieldset>
    <div class="field"><label for="sCap">Member cap</label><input id="sCap" type="number" min="2" max="50" value="${room.capacity || 12}"></div>
    <p class="msg err" id="sErr" role="alert" hidden></p>
    <div class="dlg-actions"><button type="button" class="btn ghost" id="sCancel">Cancel</button><button type="submit" class="btn primary">Save settings</button></div></form>`;
  d.showModal();
  $('#sCancel').addEventListener('click', () => d.close());
  $('#settingsForm').addEventListener('submit', async e => {
    e.preventDefault();
    const body = {
      title: $('#sTitle').value.trim(), aiMode: ($('input[name=sAi]:checked') || { value: 'off' }).value,
      joinMode: ($('input[name=sJoin]:checked') || { value: 'open' }).value,
      visibility: ($('input[name=sVis]:checked') || { value: 'public' }).value,
      capacity: Number($('#sCap').value) || 12
    };
    try { await apiRaw('/api/rooms/' + room.id, { method: 'PATCH', body: JSON.stringify(body) }); d.close(); say('Settings saved'); onSaved && onSaved(); }
    catch (ex) { const er = $('#sErr'); er.innerHTML = icon.alert + `<span>${esc(ex.message)}</span>`; er.hidden = false; }
  });
}

// Report dialog: files a report for a human to review; nothing happens automatically.
function openReport({ roomId, targetPid, messageId, messageText }) {
  const d = $('#settingsDialog');
  const reasons = ['Harassment or bullying', 'Sexual content', 'Safety concern or pressure to meet secretly', 'Scam or payment solicitation', 'Someone pretending to be me', 'Something else'];
  d.innerHTML = `<form method="dialog" id="reportForm" novalidate class="dlg">
    <div class="dlg-head"><img src="assets/art/artists_palette.png" width="72" height="55" alt="" class="dlg-art"><div><h2 id="reportTitle">Report a concern</h2><p class="hint">A report goes to the organizers for human review. Nothing happens automatically to anyone.</p></div></div>
    <fieldset class="field"><legend>What happened?</legend>
      <div class="chips chips-col">${reasons.map((r, i) => `<label class="toggle"><input type="radio" name="rReason" value="${esc(r)}" ${i === 0 ? 'checked' : ''}><span>${esc(r)}</span></label>`).join('')}</div>
    </fieldset>
    <div class="field"><label for="rDetails">Anything else organizers should know <span class="opt">(optional)</span></label><textarea id="rDetails" rows="3" maxlength="500"></textarea></div>
    <div class="dlg-actions"><button type="button" class="btn ghost" id="rCancel">Cancel</button><button type="submit" class="btn primary">Send report</button></div></form>`;
  d.showModal();
  $('#rCancel').addEventListener('click', () => d.close());
  $('#reportForm').addEventListener('submit', async e => {
    e.preventDefault();
    try {
      const r = await apiRaw('/api/reports', { method: 'POST', body: JSON.stringify({ roomId, targetPid, messageId, messageText, reason: ($('input[name=rReason]:checked') || { value: 'Something else' }).value, details: $('#rDetails').value.trim() }) });
      d.close(); say(r.note || 'Report sent.');
    } catch (ex) { d.close(); say(ex.message); }
  });
}

// ---------- boot ----------
async function boot() {
  $('#profileBtn').addEventListener('click', () => openProfile());
  $('#authBtn').addEventListener('click', () => { state.acct ? signOut() : openAuth('in'); });
  ['profileDialog', 'createDialog', 'authDialog', 'settingsDialog'].forEach(id => { const d = $('#' + id); d.addEventListener('click', e => { if (e.target === d) d.close(); }); });
  try {
    const s = await apiRaw('/api/status');
    localRooms = s.persistent === false;
    if (localRooms) { const db = $('#authBtn'); if (db) db.hidden = true; const dv = $('#navDiscover'); if (dv) dv.hidden = true; }
  } catch { /* older server */ }
  // Server-side anonymous session (HttpOnly cookie). The server stamps message authors and group
  // ownership from it; the browser cannot claim an identity. legacyClientId keeps groups that were
  // created before this upgrade visible in My groups. A signed-in session returns the account here.
  try {
    const s = await apiRaw('/api/session', { method: 'POST', body: JSON.stringify({ legacyClientId: state.clientId }) });
    state.sessionId = s.id; state.sessionName = s.name;
    state.acct = s.signedIn ? s : null;
    if (state.me && state.me.name && state.me.name !== s.name && !s.signedIn) {
      apiRaw('/api/profile', { method: 'POST', body: JSON.stringify({ name: state.me.name }) }).catch(() => {});
    }
  } catch { /* offline: local-only identity until reload */ }
  paintHeader();
  for (let i = 0; i < 3 && !state.skills.length; i++) { try { state.skills = (await apiRaw('/api/skills')).skills; } catch { await new Promise(r => setTimeout(r, 400)); } }
  route(true);
}
boot();
})();
