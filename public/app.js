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
  'I want to build a study app for our hackathon online and need a designer.'
];
const PLACEHOLDER = 'I want to make a short film in Plano, and I need someone who can edit.';

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
  me: store.get('knot.me', null),
  goal: store.get('knot.goal', ''),
  relaxed: [],
  resp: null, respKey: null,
  selected: new Set(),
  skills: [],
  pollTimer: null
};
store.set('knot.clientId', state.clientId);

async function api(path, opts = {}) {
  const r = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...opts });
  let d = null; try { d = await r.json(); } catch { /* non-json */ }
  if (!r.ok) throw new Error((d && d.error) || `Request failed (${r.status})`);
  return d;
}
const say = t => { const l = $('#live'); l.textContent = ''; setTimeout(() => { l.textContent = t; }, 30); };
const meForApi = () => state.me ? { skills: state.me.skills, availability: state.me.availability } : {};
const skillLabel = id => (state.skills.find(s => s.id === id) || { label: id }).label;

// ---------- header ----------
function paintHeader() {
  $('#profileAvatar').textContent = state.me ? initials(state.me.name) : '?';
  $('#profileLabel').textContent = state.me ? state.me.name.split(' ')[0] : 'Profile';
  const h = location.hash || '#/';
  $('#navHome').setAttribute('aria-current', h === '#/' || h === '' ? 'page' : 'false');
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

// ---------- routing ----------
function route(initial) {
  stopPoll();
  const h = location.hash || '#/';
  paintHeader();
  $('#createDialog').open && $('#createDialog').close();
  if (h.startsWith('#/room/')) renderRoom(h.slice(7));
  else if (h === '#/groups') renderGroups();
  else if (h === '#/finder') renderFinder();
  else renderHome(initial);
  refreshGroupCount();
}
window.addEventListener('hashchange', () => route(false));

// ---------- HOME ----------
function renderHome(initial) {
  const main = $('#main');
  main.innerHTML = `
  <div id="home" class="home">
    <svg id="strands" class="strands" aria-hidden="true" focusable="false"></svg>
    <section class="hero" aria-labelledby="h1">
      <div class="hero-copy">
        <h1 id="h1" class="mega"><span class="w w1">What do</span> <span class="you">you</span> <span class="w w3">want to do?</span></h1>
        <div class="goal-wrap"><i class="ring" aria-hidden="true"></i><i class="ring r2" aria-hidden="true"></i><i class="ring r3" aria-hidden="true"></i>
        <form id="goalForm" class="goal-form" novalidate>
          <textarea id="goal" rows="2" maxlength="500" autocomplete="off" spellcheck="true" aria-labelledby="h1" aria-describedby="goalHelp goalErr" placeholder="${esc(PLACEHOLDER)}"></textarea>
          <div class="goal-row">
            <p id="goalHelp" class="hint">Say what, where and when. KNOT looks for people with the skills you need.</p>
            <button class="btn primary" id="findBtn" type="submit"><span class="btn-label">Find my people</span></button>
          </div>
        </form></div>
        <p id="goalErr" class="msg err" role="alert" hidden></p>
        <div class="examples"><span class="ex-label">Try an example</span>
          ${EXAMPLES.map((e, i) => `<button type="button" class="chip example" data-i="${i}">${esc(e)}</button>`).join('')}
        </div>
      </div>
      <div class="hero-art" aria-hidden="true">
        <img class="hero-knot" src="assets/art/hero-knot.png" width="1200" height="311" alt="">
      </div>
    </section>

    <section id="resultsSection" class="results-section" aria-labelledby="resHead" hidden>
      <div class="res-head">
        <h2 id="resHead">People who fit</h2>
        <span class="badge neutral" title="No AI model is connected. Matches come from KNOT's local rules.">Local matcher</span>
      </div>
      <div id="interp" class="interp" aria-label="What KNOT understood"></div>
      <p id="pickHint" class="pick-hint">Next step: press <strong>Add to group</strong> on the people you want, then <strong>Create group</strong>.</p>
      <p id="matchErr" class="msg err" role="alert" hidden></p>
      <ul id="results" class="results"></ul>
      <div id="empty" class="empty" hidden></div>
    </section>
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
    state.goal = goal.value; store.set('knot.goal', state.goal); hideErr('#goalErr');
  });
  goal.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); findPeople(); } });
  $('#goalForm').addEventListener('submit', e => { e.preventDefault(); findPeople(); });
  $$('.example').forEach(b => b.addEventListener('click', () => {
    goal.value = EXAMPLES[b.dataset.i]; goal.dispatchEvent(new Event('input')); goal.focus();
    goal.setSelectionRange(goal.value.length, goal.value.length);
  }));
  $('#results').addEventListener('click', onResultsClick);
  $('#results').addEventListener('change', onResultsChange);
  $('#interp').addEventListener('click', onRelaxClick);
  $('#empty').addEventListener('click', onRelaxClick);
  $('#createBtn').addEventListener('click', openCreate);
  window.addEventListener('resize', scheduleStrands);

  if (state.resp) { renderResults(state.resp, true); }
  else if (store.get('knot.searched', false) && state.goal.trim() && state.me) findPeople();
  if (initial || !state.resp) goal.focus({ preventScroll: true }); else $('#h1').focus({ preventScroll: true });
}

function showErr(sel, text) { const e = $(sel); if (!e) return; e.innerHTML = icon.alert + `<span>${esc(text)}</span>`; e.hidden = false; }
function hideErr(sel) { const e = $(sel); if (e) { e.hidden = true; e.innerHTML = ''; } const g = $('#goal'); if (g && sel === '#goalErr') g.removeAttribute('aria-invalid'); }

function setBusy(on) {
  const b = $('#findBtn'); if (!b) return;
  b.disabled = on; b.setAttribute('aria-busy', on);
  $('.btn-label', b).textContent = on ? 'Finding…' : 'Find my people';
  b.classList.toggle('busy', on);
}

async function findPeople(force) {
  const goal = state.goal.trim();
  if (!goal) {
    showErr('#goalErr', 'Add a goal first. Try: “I need someone who can edit video this Saturday.”');
    const g = $('#goal'); g.setAttribute('aria-invalid', 'true'); g.focus();
    return;
  }
  if (!state.me) { openProfile({ thenSearch: true }); return; }
  const key = JSON.stringify([goal, [...state.relaxed].sort(), meForApi()]);
  if (!force && state.resp && state.respKey === key) { renderResults(state.resp); return; }
  hideErr('#matchErr'); setBusy(true);
  try {
    const resp = await api('/api/match', { method: 'POST', body: JSON.stringify({ goal, me: meForApi(), relaxed: state.relaxed }) });
    state.resp = resp; state.respKey = key; store.set('knot.searched', true);
    renderResults(resp);
  } catch (e) {
    $('#resultsSection').hidden = false;
    $('#matchErr').innerHTML = icon.alert + `<span>KNOT couldn't reach its matcher (${esc(e.message)}). Your goal is saved. </span><button type="button" class="link-btn" id="retryBtn">Try again</button>`;
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
  $('#resultsSection').hidden = false;
  hideErr('#matchErr');
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

  const empty = $('#empty');
  if (resp.empty) {
    empty.hidden = false;
    empty.innerHTML = `<img src="assets/art/navigation_arrow.png" width="140" height="148" alt="" class="empty-art" loading="lazy">
      <div><h3>No one fits yet</h3><p>${esc(resp.empty.message)}</p>
      ${resp.empty.options.length ? `<div class="relax-row">${resp.empty.options.map(o => `<button type="button" class="chip" data-relax="${o.key}">${esc(o.text)} <span class="chip-note">${o.count} ${o.count === 1 ? 'person' : 'people'}</span></button>`).join('')}</div>` : ''}
      <p class="small">Your goal stays exactly as you typed it. Edit it above or relax a requirement.</p></div>`;
  } else { empty.hidden = true; empty.innerHTML = ''; }

  updateCreateBar(); scheduleStrands();
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
  scheduleStrands();
}
function onResultsChange(e) {
  const cb = e.target.closest('input[type=checkbox]'); if (!cb) return;
  const li = cb.closest('li'); const id = li.dataset.id;
  cb.checked ? state.selected.add(id) : state.selected.delete(id);
  li.classList.toggle('selected', cb.checked);
  updateCreateBar(); scheduleStrands();
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
}

// ---------- thread: strands from goal to selected people ----------
let strandRaf = 0;
function scheduleStrands() { cancelAnimationFrame(strandRaf); strandRaf = requestAnimationFrame(drawStrands); }
const strandPaths = new Map();
function drawStrands() {
  const svg = $('#strands'), home = $('#home'); if (!svg || !home) return;
  if (innerWidth < 900) { svg.innerHTML = ''; strandPaths.clear(); return; }
  const hr = home.getBoundingClientRect(), g = $('.goal-wrap').getBoundingClientRect();
  const ax = g.left - hr.left - 34, sx = g.left - hr.left + 8, ay = g.top - hr.top + g.height / 2;
  svg.setAttribute('width', hr.width); svg.setAttribute('height', hr.height);
  const want = new Set();
  $$('#results li.selected').forEach(li => {
    const box = $('.box', li).getBoundingClientRect(); const id = li.dataset.id; want.add(id);
    const tx = li.getBoundingClientRect().left - hr.left + 2, ty = box.top - hr.top + box.height / 2;
    const d = `M${sx} ${ay} C${ax} ${ay + 30}, ${ax} ${ty - 120}, ${tx - 12} ${ty - 6} S${tx - 6} ${ty}, ${tx} ${ty}`;
    let p = strandPaths.get(id);
    if (!p) {
      p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      p.setAttribute('pathLength', '1'); p.setAttribute('class', 'strand'); svg.appendChild(p); strandPaths.set(id, p);
      if (!reduceMotion()) { p.style.strokeDasharray = '1'; p.style.strokeDashoffset = '1'; p.getBoundingClientRect(); p.style.transition = 'stroke-dashoffset 380ms cubic-bezier(.2,.7,.2,1)'; requestAnimationFrame(() => { p.style.strokeDashoffset = '0'; }); }
    }
    p.setAttribute('d', d);
  });
  strandPaths.forEach((p, id) => { if (!want.has(id)) { p.remove(); strandPaths.delete(id); } });
}

// ---------- PROFILE ----------
function openProfile(opts = {}) {
  const d = $('#profileDialog'); const me = state.me || { name: '', skills: [], interests: '', city: '', availability: [], mode: 'both' };
  d.innerHTML = `<form method="dialog" id="profileForm" novalidate class="dlg">
    <div class="dlg-head">
      <img src="assets/art/artists_palette.png" width="96" height="73" alt="" class="dlg-art">
      <div><h2 id="profileTitle">${state.me ? 'Your profile' : 'A little about you'}</h2>
      <p class="hint">${opts.thenSearch ? 'Your goal is saved. Add your name and skills, then we’ll find your people.' : 'Only your name and skills are needed. No email, no account.'}</p></div>
    </div>
    <div class="field"><label for="pName">Display name <span class="req">(required)</span></label>
      <input id="pName" type="text" maxlength="40" autocomplete="nickname" value="${esc(me.name)}" aria-describedby="pNameErr">
      <p class="msg err" id="pNameErr" role="alert" hidden></p></div>
    <fieldset class="field"><legend>Skills you can offer <span class="req">(pick at least one)</span></legend>
      <div class="chips" id="pSkills">${state.skills.map(s => `<label class="toggle"><input type="checkbox" value="${s.id}" ${me.skills.includes(s.id) ? 'checked' : ''}><span>${esc(s.label)}</span></label>`).join('')}</div>
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
  $('#profileForm').addEventListener('submit', e => {
    e.preventDefault();
    const name = $('#pName').value.trim(), skills = $$('#pSkills input:checked').map(i => i.value);
    let bad = false;
    const nerr = $('#pNameErr'), serr = $('#pSkillsErr');
    nerr.hidden = !!name; serr.hidden = skills.length > 0;
    if (!name) { nerr.innerHTML = icon.alert + '<span>Enter a display name so your group knows who you are.</span>'; bad = true; $('#pName').setAttribute('aria-invalid', 'true'); }
    if (!skills.length) { serr.innerHTML = icon.alert + '<span>Pick at least one skill you can offer.</span>'; if (!bad) $('#pSkills input').focus(); bad = true; }
    if (!name) $('#pName').focus();
    if (bad) return;
    state.me = { name, skills, interests: $('#pInterests').value.trim(), city: $('#pCity').value, availability: $$('#pDays input:checked').map(i => i.value), mode: ($('input[name=pMode]:checked') || { value: 'both' }).value };
    store.set('knot.me', state.me); state.respKey = null;
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
  const d = $('#createDialog');
  d.innerHTML = `<form id="createForm" method="dialog" novalidate class="dlg">
    <div class="dlg-head">${markImg(64)}<div><h2 id="createTitle">Create your group</h2><p class="hint">Check who’s in and name the room.</p></div></div>
    <div class="goal-quote"><span class="gq-label">Your goal</span><p>“${esc(state.goal.trim())}”</p></div>
    <div class="field"><label for="gName">Group name</label><input id="gName" type="text" maxlength="80" value="${esc(titleFromGoal(state.goal))}" aria-describedby="gNameErr"><p class="msg err" id="gNameErr" role="alert" hidden></p></div>
    <fieldset class="field"><legend>Who’s included</legend>
      <ul class="member-list"><li><span class="avatar sm" aria-hidden="true">${esc(initials(state.me.name))}</span><span><strong>${esc(state.me.name)}</strong> (you)</span></li>
      ${sel.map(s => `<li><span class="avatar sm" aria-hidden="true">${esc(initials(s.name))}</span><span><strong>${esc(s.name)}</strong> <span class="meta">${esc(s.city)}</span></span></li>`).join('')}</ul>
    </fieldset>
    <p class="msg info small">These are fictional demo profiles. They won’t reply, but you can chat and plan here.</p>
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
      const { room } = await api('/api/rooms', { method: 'POST', body: JSON.stringify({ requestId: createRequestId, clientId: state.clientId, ownerName: state.me.name, ownerSkills: state.me.skills, title, goal: state.goal.trim(), memberIds: sel.map(s => s.id) }) });
      d.close(); state.selected.clear(); strandPaths.clear();
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

// ---------- GROUPS ----------

// ---------- AI FINDER ----------
state.finder = { items: [], busy: false };
const FINDER_HELLO = 'Hi! Tell me what you want to do and who you need. I’ll find people from KNOT’s community.';
const FINDER_IDEAS = ['I need someone to edit my short film', 'I want a study partner for coding, online', 'Looking for a basketball group in Frisco'];

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
    (state.finder.error ? `<p class="msg err" role="alert">${icon.alert}<span>${esc(state.finder.error)} </span><button type="button" class="link-btn" id="fRetry">Try again</button></p>` : '');
  log.scrollTop = log.scrollHeight;
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
    <p class="lead">A quick chat to work out who you need. Matches come from KNOT’s people and rules, never from the AI’s imagination.</p>
    <div id="fOff" class="msg warn" hidden></div>
    <div class="chat" id="fLog" role="log" aria-live="polite" aria-label="Conversation"></div>
    <div class="ideas" id="fIdeas">${FINDER_IDEAS.map(x => `<button type="button" class="chip example" data-idea="${esc(x)}">${esc(x)}</button>`).join('')}</div>
    <form id="fForm" class="chat-form" novalidate>
      <label class="sr" for="fInput">Message to the AI Finder</label>
      <input id="fInput" type="text" maxlength="300" autocomplete="off" placeholder="What do you want to do?">
      <button class="btn primary" id="fSend" type="submit">Send ${icon.send}</button>
    </form></section>`;
  paintFinder();
  const send = txt => {
    txt = txt.trim(); if (!txt || state.finder.busy) return;
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
    return;
  }
  list.innerHTML = `<ul class="group-list">${rooms.map(r => `<li><a class="group-row" href="#/room/${r.id}">${markImg(52)}<span class="g-main"><strong>${esc(r.title)}</strong><span class="g-goal">“${esc(r.goal)}”</span><span class="meta">${r.members.length} ${r.members.length === 1 ? 'person' : 'people'} · ${r.messageCount} ${r.messageCount === 1 ? 'message' : 'messages'}</span></span>${icon.arrow}</a></li>`).join('')}</ul>`;
}

// ---------- ROOM ----------
const timeFmt = ts => new Date(ts).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
function stopPoll() { clearInterval(state.pollTimer); state.pollTimer = null; }

async function renderRoom(id) {
  const main = $('#main');
  main.innerHTML = '<section class="page"><p class="hint">Opening group…</p></section>';
  let room;
  try { room = (await api('/api/rooms/' + encodeURIComponent(id))).room; }
  catch (e) {
    main.innerHTML = `<section class="page"><div class="empty center"><img src="assets/art/puzzle_piece.png" width="150" height="152" alt="" class="empty-art"><div><h1 id="h1" tabindex="-1">We couldn’t open that group</h1><p>${esc(e.message)}</p><a class="btn primary" href="#/groups">Back to My groups</a></div></div></section>`;
    $('#h1').focus(); return;
  }
  main.innerHTML = `<section class="room">
    <a class="back" href="#/groups">← My groups</a>
    <header class="room-head">${markImg(64)}<div><h1 id="h1" tabindex="-1">${esc(room.title)}</h1>
      <p class="room-goal"><span class="gq-label">Goal</span> “${esc(room.goal)}”</p></div></header>
    <div class="room-grid">
      <div class="chat">
        <ol id="msgs" class="msgs" aria-label="Messages" aria-live="polite"></ol>
        <div id="draftBox" class="draft" hidden></div>
        <form id="composer" class="composer" novalidate>
          <label for="msgText" class="sr">Message</label>
          <textarea id="msgText" rows="2" maxlength="2000" placeholder="Write a message to the group" aria-describedby="msgErr"></textarea>
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
        <ul>${room.members.map(m => `<li><span class="avatar sm" aria-hidden="true">${esc(initials(m.name))}</span><span><strong>${esc(m.name)}</strong>${m.you ? ' (you)' : ''}<span class="meta">${m.you ? 'Group creator' : esc(m.city) + ' · ' + esc(m.modeText)}</span>${!m.you ? `<span class="meta">${esc(m.skillLabels.join(', '))}</span>` : ''}${!m.you ? `<span class="meta ${m.availabilityDays ? '' : 'unk'}">${m.availabilityDays ? 'Free: ' : ''}${esc(m.availabilityText)}</span>` : ''}</span></li>`).join('')}</ul>
        <p class="msg info small">Fictional demo profiles. They won’t reply. Messages are saved on this KNOT server, so they survive a refresh.</p>
      </aside>
    </div></section>`;
  $('#h1').focus({ preventScroll: true });
  let lastCount = -1;
  const paint = (r, force) => {
    if (!force && r.messages.length === lastCount) return;
    const box = $('#msgs'); const near = box.scrollHeight - box.scrollTop - box.clientHeight < 80 || lastCount < 0;
    lastCount = r.messages.length;
    box.innerHTML = r.messages.length ? r.messages.map(m => `<li class="msg-item ${m.authorId === state.clientId ? 'mine' : ''}"><div class="bubble"><div class="m-head"><strong>${esc(m.authorName)}</strong>${m.kind === 'assistant' ? '<span class="badge assistant">Assistant draft</span>' : ''}<time datetime="${esc(m.ts)}">${esc(timeFmt(m.ts))}</time></div><p>${esc(m.text)}</p></div></li>`).join('')
      : `<li class="msg-empty"><img src="assets/art/heart_chat.png" width="120" height="104" alt="" loading="lazy"><p><strong>Say hello.</strong> Start the conversation, or ask for a first step.</p></li>`;
    if (near) box.scrollTop = box.scrollHeight;
  };
  paint(room, true);
  state.pollTimer = setInterval(async () => { try { const r = (await api('/api/rooms/' + id)).room; paint(r); } catch { /* offline: keep showing */ } }, 4000);

  const post = async (text, kind) => {
    const { message } = await api(`/api/rooms/${id}/messages`, { method: 'POST', body: JSON.stringify({ text, kind, authorId: state.clientId, authorName: state.me ? state.me.name : 'You' }) });
    room.messages.push(message); paint(room, true);
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
    catch (err) { const er = $('#msgErr'); er.innerHTML = icon.alert + `<span>Your message wasn’t sent (${esc(err.message)}). It’s still in the box. Try again.</span>`; er.hidden = false; }
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

// ---------- boot ----------
async function boot() {
  $('#profileBtn').addEventListener('click', () => openProfile());
  ['profileDialog', 'createDialog'].forEach(id => { const d = $('#' + id); d.addEventListener('click', e => { if (e.target === d) d.close(); }); });
  try { state.skills = (await api('/api/skills')).skills; } catch { state.skills = []; }
  route(true);
}
boot();
})();
