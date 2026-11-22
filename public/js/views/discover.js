// Discover: public groups you could join, and the real members who have saved a profile. Members only.
import { $, $$, esc, avatar, icon, toast, navigate } from '../ui.js';
import { api } from '../api.js';

let tab = 'groups', query = '', groups = [], people = [];

export async function renderDiscover() {
  tab = 'groups'; query = '';
  $('#main').innerHTML = `
  <section class="page">
    <h1 tabindex="-1" id="pageH1" class="page-title">Discover</h1>
    <p class="lead">Public groups you could join, and members who have saved a profile.</p>
    <div class="toolbar">
      <div class="tabs" role="tablist" aria-label="Discover">
        <button type="button" class="tab" role="tab" data-tab="groups" aria-selected="true">Groups</button>
        <button type="button" class="tab" role="tab" data-tab="people" aria-selected="false">People</button>
      </div>
      <input id="dq" type="search" maxlength="60" placeholder="Search" aria-label="Search">
    </div>
    <div id="dBody" aria-live="polite"><p class="hint">Loading…</p></div>
  </section>`;
  $('#pageH1').focus({ preventScroll: true });
  $('#dq').addEventListener('input', e => { query = e.target.value; paint(); });
  $$('[data-tab]').forEach(b => b.addEventListener('click', () => { tab = b.dataset.tab; query = ''; $('#dq').value = ''; paint(); }));
  // Attached to the body element this visit just created, so visits never stack listeners.
  $('#dBody').addEventListener('click', onJoin);
  paint();
  try {
    groups = (await api('/api/groups')).groups || [];
    paint();
    people = (await api('/api/people')).people || [];
    paint();
  } catch (e) { $('#dBody').innerHTML = `<p class="msg err" role="alert">${icon.alert}<span>${esc(e.message)}</span></p>`; }
}

function paint() {
  const body = $('#dBody'); if (!body) return;
  const q = query.trim().toLowerCase();
  $$('[data-tab]').forEach(b => { const on = b.dataset.tab === tab; b.setAttribute('aria-selected', String(on)); b.classList.toggle('on', on); });
  if (tab === 'groups') {
    const list = groups.filter(g => !q || [g.title, g.goal, g.description, g.category].filter(Boolean).join(' ').toLowerCase().includes(q));
    body.innerHTML = list.length
      ? `<div class="card-grid">${list.map(g => `
          <article class="group-card">
            <strong class="group-title">${esc(g.title)}</strong>
            <span class="group-goal">${esc(g.description || g.goal)}</span>
            <span class="meta">${g.memberCount}/${g.capacity} members · ${g.onlineOnly ? 'online' : (g.city ? esc(g.city) : 'in person')}${g.joinMode === 'request' ? ' · asks to join' : ''}</span>
            <span class="card-actions"><a class="btn ghost sm" href="#/room/${esc(g.id)}">Preview</a><button type="button" class="btn primary sm" data-join="${esc(g.id)}" data-mode="${esc(g.joinMode)}">${g.joinMode === 'request' ? 'Ask to join' : 'Join'}</button></span>
          </article>`).join('')}</div>`
      : `<div class="empty-card wide"><h3>Nothing to join right now</h3><p>No public groups match. Your own groups are in My groups.</p><a class="btn ghost sm" href="#/groups">My groups</a></div>`;
  } else {
    const list = people.filter(p => !q || [p.name, p.bio, p.goals, p.city, ...(p.interests || []), ...(p.skillLabels || [])].filter(Boolean).join(' ').toLowerCase().includes(q));
    body.innerHTML = list.length
      ? `<ul class="people-list">${list.map(p => `
          <li class="person">
            ${avatar(p.name, p.avatar)}
            <div class="grow">
              <strong>${esc(p.name)}</strong> <span class="meta">${esc(p.city || 'Location not set')}</span>
              ${p.skillLabels && p.skillLabels.length ? `<p class="chip-row tight">${p.skillLabels.slice(0, 5).map(s => `<span class="chip-static">${esc(s)}</span>`).join('')}</p>` : ''}
              ${p.goals ? `<p class="hint">${esc(p.goals)}</p>` : ''}
              ${p.bio ? `<p class="hint">${esc(p.bio)}</p>` : ''}
            </div>
          </li>`).join('')}</ul>`
      : `<div class="empty-card wide"><h3>No members match</h3><p>Try a different interest, skill or goal.</p></div>`;
  }
}

// Join from a card: a public group that accepts everyone opens straight away; one that asks shows a
// sent state, so the button never pretends a request was granted.
async function onJoin(e) {
  const b = e.target.closest('[data-join]');
  if (!b) return;
  b.disabled = true;
  try {
    const r = await api(`/api/rooms/${encodeURIComponent(b.dataset.join)}/join`, { method: 'POST', body: {} });
    if (r.pending) { b.textContent = 'Request sent'; toast('Request sent. The owner will approve it.', 'ok'); return; }
    navigate('#/room/' + r.room.id);
  } catch (ex) { toast(ex.message, 'err'); b.disabled = false; }
}
