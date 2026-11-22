// My groups: every group this member is in, newest first, with the message count. Members only.
import { $, esc, icon } from '../ui.js';
import { api } from '../api.js';
import { state } from '../state.js';

export async function renderGroups() {
  $('#main').innerHTML = `
  <section class="page">
    <h1 tabindex="-1" id="pageH1" class="page-title">My groups</h1>
    <p class="lead">Your groups follow your account, so you can open them from any device.</p>
    <div id="groupList" aria-live="polite"><p class="hint">Loading…</p></div>
  </section>`;
  $('#pageH1').focus({ preventScroll: true });
  let rooms = state.rooms;
  try {
    rooms = (await api('/api/rooms')).rooms;
    state.rooms = rooms;
  } catch { /* keep what we had */ }
  const list = $('#groupList');
  if (!rooms.length) {
    list.innerHTML = `<div class="empty-card wide"><h3>No groups yet</h3><p>Describe what you want to do, pick the people who fit, and your first group appears here.</p><a class="btn primary" href="#/finder">Find your people</a></div>`;
    return;
  }
  list.innerHTML = `<ul class="room-list">${rooms.map(r => `
    <li><a class="room-row" href="#/room/${esc(r.id)}">
      <span class="grow">
        <strong>${esc(r.title)}</strong>
        <span class="hint">${esc(r.goal)}</span>
        <span class="meta">${r.memberCount} ${r.memberCount === 1 ? 'member' : 'members'} · ${r.messageCount} ${r.messageCount === 1 ? 'message' : 'messages'}${r.demo ? ' · sandbox' : ''}</span>
      </span>
      <span class="row-arrow" aria-hidden="true">${icon.arrow}</span>
    </a></li>`).join('')}</ul>`;
}
