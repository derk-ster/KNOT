// The matcher UI, shared by the home page and the AI Finder: the goal box, the result cards with their
// "why" details, the picks that start a group, and the create-group dialog.
import { $, $$, esc, avatar, icon, toast, navigate, uid } from '../ui.js';
import { api } from '../api.js';
import { state, store, myProfile, isSignedIn } from '../state.js';
import { openDialog } from '../dialog.js';

export function goalBox(id = 'goal') {
  return `<form class="goal-box" id="goalForm" novalidate>
      <label class="sr" for="${id}">Describe your goal</label>
      <textarea id="${id}" rows="2" maxlength="500" autocomplete="off" spellcheck="true" placeholder="I want to start a band and need a drummer."></textarea>
      <div class="goal-row">
        <p class="hint">Say what, where and when.</p>
        <button class="btn primary" id="findBtn" type="submit">Find my people</button>
      </div>
    </form>
    <p class="msg err" id="finderErr" role="alert" hidden></p>`;
}

// Wires a goal box that was just rendered. `onFind` runs the match for that page.
export function wireGoal(onFind) {
  const goal = $('#goal');
  goal.value = state.goal;
  goal.addEventListener('input', () => { state.goal = goal.value; saveGoal(); hideErr(); });
  goal.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); onFind(); } });
  $('#goalForm').addEventListener('submit', e => { e.preventDefault(); onFind(); });
}
const saveGoal = () => store.set('knot.goal', state.goal);
const hideErr = () => { const e = $('#finderErr'); if (e) e.hidden = true; };
const showErr = t => { const e = $('#finderErr'); if (e) { e.textContent = t; e.hidden = false; } };

export async function findPeople(target = '#matchResults', relaxed = false) {
  const goal = state.goal.trim();
  if (!goal) return showErr('Type a goal first, or pick one of the ideas.');
  if (!myProfile().name) return navigate('#/profile');
  hideErr();
  state.match.target = target;
  if (!relaxed) state.match.relaxed = [];
  const btn = $('#findBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'Finding…'; }
  try {
    const p = myProfile();
    const resp = await api('/api/match', { method: 'POST', body: { goal, me: { skills: p.skills, availability: p.availability }, relaxed: state.match.relaxed } });
    state.match.resp = resp;
    renderResults(target, resp);
  } catch (e) {
    showErr(`KNOT could not run the match. ${e.message}`);
  } finally {
    const b = $('#findBtn');
    if (b) { b.disabled = false; b.textContent = 'Find my people'; }
  }
}

export function renderResults(sel, resp) {
  const box = $(sel);
  if (!box) return;
  const it = resp.interpreted || { offers: [], needs: [], constraints: [] };
  const chips = [`<span class="tag">You offer: ${esc(it.offers.map(o => o.label).join(', ') || 'nothing yet')}</span>`];
  if (it.needs.length) chips.push(`<span class="tag strong">Looking for: ${esc(it.needs.map(o => o.label).join(', '))}</span>`);
  it.constraints.forEach(c => chips.push(c.relaxed
    ? `<span class="tag relaxed">${esc(c.label)} (relaxed)</span>`
    : `<span class="tag">${esc(c.label)} <button type="button" class="tag-x" data-relax="${esc(c.key)}" aria-label="Relax ${esc(c.label)}">${icon.x}</button></span>`));
  const alt = resp.alternativeGroups && resp.alternativeGroups.length ? `
    <section class="panel-block">
      <h3>Closest public groups</h3>
      <p class="hint">No exact match yet, but these groups touch the same topic.</p>
      <ul class="simple-list">${resp.alternativeGroups.map(g => `<li><span class="grow"><strong>${esc(g.title)}</strong> <span class="meta">${g.memberCount}/${g.capacity} members</span><span class="hint">${esc(g.goal)}</span></span><a class="btn ghost sm" href="#/room/${esc(g.id)}">Open</a></li>`).join('')}</ul>
    </section>` : '';
  const notice = resp.notice ? `<p class="notice">${esc(resp.notice)}</p>` : '';
  if (resp.empty && !resp.results.length) {
    box.innerHTML = `<div class="interp">${chips.join('')}</div>${notice}
      <div class="empty-card">
        <h3>No one fits yet</h3>
        <p>${esc(resp.empty.message)}</p>
        ${resp.empty.options.length ? `<div class="chip-row">${resp.empty.options.map(o => `<button type="button" class="chip" data-relax="${esc(o.key)}">${esc(o.text)} <span class="chip-note">${o.count} ${o.count === 1 ? 'person' : 'people'}</span></button>`).join('')}</div>` : ''}
      </div>${alt}`;
  } else {
    box.innerHTML = `<div class="create-bar" id="createBar" hidden>
        <p id="createText"></p>
        <button class="btn primary sm" id="createBtn" type="button">Create group</button>
      </div>
      <div class="interp">${chips.join('')}</div>${notice}
      <ul class="results" role="list">${resp.results.map(resultCard).join('')}</ul>${alt}`;
  }
  wireResults(box);
  updateCreateBar();
  box.setAttribute('aria-busy', 'false');
}

function resultCard(r) {
  const sel = state.match.selected.has(r.id);
  return `<li class="result ${sel ? 'selected' : ''}" data-id="${esc(r.id)}">
    <label class="pick">
      <input type="checkbox" ${sel ? 'checked' : ''} aria-label="Add ${esc(r.name)} to a group">
      <span class="pick-text"><span class="when-off">Add to group</span><span class="when-on">Added</span></span>
    </label>
    <div class="result-head">
      ${avatar(r.name, null, '')}
      <div><h3>${esc(r.name)}</h3><p class="meta">${esc(r.city)} · ${esc(r.modeText)}</p></div>
    </div>
    <p class="reason">${esc(r.reason)}</p>
    <p class="bring"><span class="label">Brings</span>${r.bring.map(b => `<span class="chip-static">${esc(b)}</span>`).join('')}</p>
    <ul class="pairs">${r.pairs.map(p => `<li><span class="need">${esc(p.need)}</span><span class="arrow" aria-hidden="true">${icon.arrow}</span><span class="offer">${esc(p.offer)}</span></li>`).join('')}</ul>
    ${r.flags.map(f => `<p class="msg warn">${icon.alert}<span><strong>${esc(f.text)}.</strong> ${esc(f.explain)}</span></p>`).join('')}
    <button type="button" class="link-btn why-btn" aria-expanded="false" aria-controls="why-${esc(r.id)}">Why this match ${icon.chev}</button>
    <div class="why" id="why-${esc(r.id)}" hidden>
      <p class="label">Exactly what KNOT used</p>
      <dl>${r.evidence.map(e => `<div><dt>${esc(e.label)}</dt><dd>${esc(e.value)}</dd></div>`).join('')}</dl>
    </div>
  </li>`;
}

function wireResults(box) {
  $$('[data-relax]', box).forEach(b => b.addEventListener('click', () => {
    const key = b.dataset.relax;
    if (!state.match.relaxed.includes(key)) state.match.relaxed.push(key);
    findPeople(state.match.target || '#matchResults', true);
  }));
  $$('.pick input', box).forEach(cb => cb.addEventListener('change', () => {
    const li = cb.closest('li');
    if (cb.checked) state.match.selected.add(li.dataset.id); else state.match.selected.delete(li.dataset.id);
    li.classList.toggle('selected', cb.checked);
    updateCreateBar();
  }));
  $$('.why-btn', box).forEach(b => b.addEventListener('click', () => {
    const li = b.closest('li');
    const open = b.getAttribute('aria-expanded') !== 'true';
    b.setAttribute('aria-expanded', String(open));
    $('.why', li).hidden = !open;
  }));
  const cb = $('#createBtn', box);
  if (cb) cb.addEventListener('click', openCreate);
}

export function selectedResults() {
  return (state.match.resp ? state.match.resp.results : []).filter(r => state.match.selected.has(r.id));
}

export function updateCreateBar() {
  const bar = $('#createBar');
  if (!bar) return;
  const sel = selectedResults();
  bar.hidden = !sel.length;
  if (sel.length) {
    $('#createText').textContent = `${sel.map(s => firstWord(s.name)).join(', ')} selected. Ready to start a group?`;
    $('#createBtn').textContent = sel.length > 1 ? `Create group (${sel.length})` : 'Create group';
  }
}
const firstWord = n => String(n || '').split(/\s+/)[0] || '';

export function titleFromGoal(goal) {
  let t = String(goal || '').trim().replace(/^i (can|want to|would like to|'d like to|wanna|am going to)\s+/i, '').split(/\s*(?:,|;|\band i\b|\bbut i\b|\band need\b|\bneed\b|\bi need\b)/i)[0].replace(/[.!?]+$/, '').trim() || String(goal || '').trim();
  if (t.length > 60) t = t.slice(0, 57).replace(/\s+\S*$/, '') + '…';
  return t.charAt(0).toUpperCase() + t.slice(1);
}

let createRequestId = null;
export function openCreate() {
  const sel = selectedResults();
  if (!sel.length) return;
  createRequestId = uid();
  const acct = isSignedIn();
  const p = myProfile();
  const d = openDialog({
    title: 'Create your group',
    sub: 'Name it, decide who can find it, then start the chat.',
    body: `<form id="createForm" class="form" novalidate>
        <div class="goal-quote"><span class="label">Your goal</span><p>${esc(state.goal.trim())}</p></div>
        <div class="field"><label for="gName">Group name</label>
          <input id="gName" type="text" maxlength="80" value="${esc(titleFromGoal(state.goal))}" aria-describedby="gErr"></div>
        <div class="field"><label for="gDesc">Short description <span class="opt">(optional)</span></label>
          <input id="gDesc" type="text" maxlength="300" placeholder="One line people will see in Discover"></div>
        <fieldset class="field"><legend>Who is in it</legend>
          <ul class="simple-list">
            <li>${avatar(p.name || 'You', null, 'sm')}<span class="grow"><strong>${esc(p.name || 'You')}</strong> <span class="meta">you, the owner</span></span></li>
            ${sel.map(s => `<li>${avatar(s.name, null, 'sm')}<span class="grow"><strong>${esc(s.name)}</strong> <span class="meta">${esc(s.city)} · sample profile</span></span></li>`).join('')}
          </ul>
          <p class="hint">Sample profiles are fictional and labelled Demo. They reply in their own words.</p>
        </fieldset>
        ${acct ? `<details class="optional"><summary>Who can find this group</summary>
          <fieldset class="field"><legend>Visibility</legend>
            <label class="check"><input type="radio" name="gVis" value="public" checked> <span>Public: shown in Discover</span></label>
            <label class="check"><input type="radio" name="gVis" value="private"> <span>Private: invite link only</span></label></fieldset>
          <fieldset class="field"><legend>Joining</legend>
            <label class="check"><input type="radio" name="gJoin" value="open" checked> <span>Anyone can join</span></label>
            <label class="check"><input type="radio" name="gJoin" value="request"> <span>I approve each request</span></label></fieldset>
          <div class="field"><label for="gCap">Member cap</label><input id="gCap" type="number" min="2" max="50" value="12"></div>
          <label class="check"><input type="checkbox" id="gOnline"> <span>This group meets online only</span></label>
          <p class="hint">Groups are for members 18 and over, matching your account.</p>
        </details>` : `<p class="msg info">You are not signed in, so this is a sandbox group. It is not shared or listed. Create an account to make a real group.</p>`}
        <p class="msg err" id="gErr" role="alert" hidden></p>
      </form>`,
    footer: `<button type="button" class="btn ghost" data-cancel>Cancel</button><button type="submit" class="btn primary" form="createForm" id="gSubmit">Create group</button>`
  });
  $('[data-cancel]', d).addEventListener('click', () => d.close());
  $('#gName', d).focus();
  let busy = false;
  $('#createForm', d).addEventListener('submit', async e => {
    e.preventDefault();
    if (busy) return;
    const err = $('#gErr', d);
    const title = $('#gName', d).value.trim();
    if (!title) { err.textContent = 'Give the group a name so you can find it later.'; err.hidden = false; return; }
    busy = true;
    const btn = $('#gSubmit', d); btn.disabled = true; btn.textContent = 'Creating…';
    const body = {
      requestId: createRequestId, clientId: state.clientId, ownerName: p.name, ownerSkills: p.skills, title,
      goal: state.goal.trim(), memberIds: sel.map(s => s.id), description: $('#gDesc', d).value.trim()
    };
    if (acct) {
      body.visibility = ($('input[name=gVis]:checked', d) || { value: 'public' }).value;
      body.joinMode = ($('input[name=gJoin]:checked', d) || { value: 'open' }).value;
      body.capacity = $('#gCap', d).value || 12;
      body.onlineOnly = $('#gOnline', d).checked;
      body.city = p.city || null;
    }
    try {
      const { room, duplicate } = await api('/api/rooms', { method: 'POST', body });
      state.match.selected.clear();
      d.close();
      toast(duplicate ? 'That group already exists, so KNOT opened it.' : 'Group created. Say hi to get it going.', 'ok');
      navigate('#/room/' + room.id);
    } catch (ex) {
      busy = false; btn.disabled = false; btn.textContent = 'Try again';
      err.textContent = ex.message; err.hidden = false;
    }
  });
}
