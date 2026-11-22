// A group. The page is built once per visit. The message list only gets new lines appended, each send
// shows a bubble at once and is matched to its saved line by clientMsgId, a failed send keeps its text
// with a Retry button, and the composer is never repainted by a poll.
import { $, $$, esc, avatar, icon, toast, navigate, copyText, uid, fmtTime, imageLimit, resizeImage } from '../ui.js';
import { api } from '../api.js';
import { state, store, myPid, isSignedIn, myProfile } from '../state.js';
import { openDialog, askConfirm } from '../dialog.js';

const enc = encodeURIComponent;
const COMMANDS = [
  { key: 'ai', label: 'Ask KNOT AI', hint: 'Ask a question about this group', fill: '/ai ' },
  { key: 'plan', label: 'Plan the next steps', hint: 'KNOT AI suggests what to do next', fill: '/plan', prompt: 'Plan the next steps for this group.' },
  { key: 'catchup', label: 'Catch me up', hint: 'KNOT AI sums up what has been decided', fill: '/catchup', prompt: 'Catch me up on what this group has decided so far.' },
  { key: 'help', label: 'What can KNOT AI do?', hint: 'Show these commands', fill: null }
];
const REPORT_REASONS = ['Harassment or hate', 'Spam or scam', 'Inappropriate content', 'Safety concern', 'Someone is not 18+', 'Other'];

let view = null;      // the open group: { id, room, seen, pending, failed, since, typing, pic }
let timers = [];

export function stopRoom() { timers.forEach(clearInterval); timers = []; view = null; }

export async function renderRoom(id) {
  stopRoom();
  $('#main').innerHTML = `<section class="page room-page"><p class="hint">Opening the group…</p></section>`;
  let room;
  try { room = (await api(`/api/rooms/${enc(id)}`)).room; }
  catch (e) {
    $('#main').innerHTML = `<section class="page"><div class="empty-card wide"><h2>Group not found</h2><p>${esc(e.message)}</p><a class="btn ghost" href="#/groups">Back to my groups</a></div></section>`;
    return;
  }
  view = { id, room, seen: new Set(), pending: new Map(), failed: new Map(), since: null, typing: [], pic: null };
  view.since = (room.messages && room.messages.length) ? room.messages[room.messages.length - 1].ts : room.createdAt;
  paintPage();
  absorb(room.messages || []);
  if (room.isMember) {
    timers.push(setInterval(pollMessages, 2500));
    timers.push(setInterval(pollRoom, 15000));
    timers.push(setInterval(pollTyping, 1500));
  }
}

// ---------- page ----------
function paintPage() {
  const room = view.room;
  const composer = room.isMember ? `
    <form id="msgForm" class="composer" novalidate>
      <div class="composer-field">
        <div class="cmd-pop" id="cmdPop" role="listbox" aria-label="KNOT AI commands" hidden></div>
        <div class="attach" id="attach" hidden>
          <img id="attachThumb" alt="The picture to send">
          <span class="hint">Ready to send.</span>
          <button type="button" class="icon-btn sm" id="attachClear" aria-label="Remove the picture">${icon.x}</button>
        </div>
        <input id="msgInput" type="text" maxlength="2000" autocomplete="off" aria-describedby="chatHint" placeholder="${room.aiMode !== 'off' ? 'Message the group, or type / for KNOT AI' : 'Message the group'}">
      </div>
      <label class="icon-btn photo-btn" title="Send a picture"><span class="sr">Send a picture</span>${icon.photo}<input id="msgPhoto" type="file" accept="image/png,image/jpeg,image/webp" class="sr"></label>
      <button class="btn primary" type="submit">Send ${icon.send}</button>
    </form>
    <p class="hint" id="chatHint">${room.aiMode !== 'off' ? 'Type / to ask KNOT AI. Paste a picture to share it.' : 'KNOT AI is off here. Paste a picture to share it.'}</p>` : '';
  $('#main').innerHTML = `
  <section class="page room-page" id="roomPage">
    <a class="back-link" href="#/groups">${icon.back} My groups</a>
    <div id="roomHead"></div>
    <div id="roomNotes"></div>
    <div class="room-grid">
      <section class="chat-card" aria-label="Group chat">
        <div class="chat-log" id="msgLog" role="log" aria-live="polite" aria-label="Messages"></div>
        <div class="typing" id="typingRow" hidden></div>
        ${composer}
        <p class="msg err" id="msgErr" role="alert" hidden></p>
      </section>
      <aside class="members-card" id="roomAside" aria-label="Members"></aside>
    </div>
  </section>`;
  paintHead();
  paintNotes();
  paintAside();
  const log = $('#msgLog');
  log.innerHTML = view.room.messages && view.room.messages.length ? '' : `<div class="bubble bot">The group is quiet. Say hi to get it going.</div>`;
  if (room.isMember) wireComposer();
  $('#roomPage').addEventListener('click', onClick);
}

function paintHead() {
  const r = view.room;
  const box = $('#roomHead'); if (!box) return;
  const isMod = r.myRole === 'owner' || r.myRole === 'moderator';
  const aiLabel = r.aiMode === 'on' ? 'KNOT AI replies to everyone' : r.aiMode === 'on-demand' ? 'KNOT AI answers when asked' : 'KNOT AI is off';
  box.innerHTML = `
    <div class="room-head">
      <div class="grow">
        <h1 id="roomTitle" tabindex="-1">${esc(r.title)}</h1>
        <p class="goal-line">Goal: ${esc(r.goal)}</p>
        <p class="meta">${r.capacityUsed}/${r.capacity} members · ${r.visibility === 'public' ? 'Public' : 'Private'} · ${r.joinMode === 'request' ? 'owner approves joins' : 'anyone can join'}${r.onlineOnly ? ' · online only' : (r.city ? ' · ' + esc(r.city) : '')} · ${esc(aiLabel)}</p>
        ${r.description ? `<p class="room-desc">${esc(r.description)}</p>` : ''}
      </div>
      <div class="room-actions">
        ${r.isMember && r.inviteCode ? `<button type="button" class="btn ghost sm" data-act="invite">Invite</button>` : ''}
        ${isMod ? `<button type="button" class="btn ghost sm" data-act="settings">Group settings</button>` : ''}
        ${r.isMember && r.myRole !== 'owner' ? `<button type="button" class="btn ghost sm" data-act="leave">Leave</button>` : ''}
      </div>
    </div>`;
}

function paintNotes() {
  const r = view.room;
  const box = $('#roomNotes'); if (!box) return;
  const notes = [];
  if (state.status && state.status.persistent === false) notes.push(`<p class="msg warn">${icon.alert}<span>This copy of KNOT has no shared database, so groups and messages may not be kept. Set DATABASE_URL to keep them.</span></p>`);
  if (r.demo) notes.push(`<p class="msg info">This is a sandbox group. Its members are sample profiles, labelled Demo. Create an account to make a real group.</p>`);
  if (r.aiMode !== 'off' && r.isMember) notes.push(`<p class="msg info">KNOT AI is on here. Messages may be shared with the AI provider to help the group.</p>`);
  if (!r.isMember && r.visibility === 'public') notes.push(`<div class="msg info preview"><span>You are previewing this group. Join to read and write in the chat.</span><button type="button" class="btn primary sm" data-act="join">${r.joinMode === 'request' ? 'Ask to join' : 'Join group'}</button></div>`);
  const isMod = r.myRole === 'owner' || r.myRole === 'moderator';
  if (isMod && r.joinRequests && r.joinRequests.length) {
    notes.push(`<section class="panel-block requests"><h2>Join requests</h2><ul class="simple-list">${r.joinRequests.map(q => `<li><span class="grow"><strong>${esc(q.name)}</strong> <span class="meta">${q.ageCategory === 'teen' ? 'age 13 to 17' : '18+'}</span></span><span class="row-actions"><button type="button" class="btn primary sm" data-req="approve" data-pid="${esc(q.pid)}">Approve</button><button type="button" class="btn ghost sm" data-req="decline" data-pid="${esc(q.pid)}">Decline</button></span></li>`).join('')}</ul></section>`);
  }
  box.innerHTML = notes.join('');
}

function paintAside() {
  const r = view.room;
  const box = $('#roomAside'); if (!box) return;
  const isMod = r.myRole === 'owner' || r.myRole === 'moderator';
  let seat = 0;
  const rows = r.members.map(m => memberRow(m, r, m.ai ? 0 : ++seat)).join('');
  box.innerHTML = `
    <h2 class="small-title">Members</h2>
    <ul class="member-list">${rows}</ul>
    ${r.inviteCode ? `<div class="aside-block"><h3 class="small-title">Invite link</h3><p class="hint">Share this so people can join directly.</p><div class="input-row"><input readonly value="${esc(location.origin + '/#/join/' + r.inviteCode)}" aria-label="Invite link"><button type="button" class="btn ghost sm" data-act="copy-invite">Copy</button></div></div>` : ''}
    ${isMod && r.bans && r.bans.length ? `<div class="aside-block"><h3 class="small-title">Removed people</h3><ul class="simple-list">${r.bans.map(b => `<li><span class="grow">${esc(b.name || 'Someone')}</span><button type="button" class="btn ghost sm" data-unban="${esc(b.pid)}">Let back in</button></li>`).join('')}</ul></div>` : ''}`;
}

function memberRow(m, r, seatNo) {
  if (m.ai) {
    const mute = r.myRole === 'owner'
      ? `<button type="button" class="btn ghost sm" data-ai-toggle="${r.aiMode === 'off' ? 'on-demand' : 'off'}">${r.aiMode === 'off' ? 'Turn on' : 'Mute'}</button>` : '';
    return `<li class="member ai">${avatar('KNOT AI', null, 'sm')}<div class="grow"><strong>KNOT AI</strong> <span class="chip-static ai-tag">Helper</span><span class="meta">${esc(m.modeText || 'Helper')}</span></div>${mute}</li>`;
  }
  const isMod = r.myRole === 'owner' || r.myRole === 'moderator';
  const canAct = !m.you && !m.demo;
  const tags = [
    seatNo ? `<span class="chip-static">#${seatNo}</span>` : '',
    m.you ? '<span class="chip-static">You</span>' : '',
    m.role === 'owner' ? '<span class="chip-static strong">Owner</span>' : (m.role === 'moderator' ? '<span class="chip-static">Moderator</span>' : ''),
    m.demo ? '<span class="chip-static demo">Demo</span>' : ''
  ].join('');
  const menu = canAct ? `
    <button type="button" class="icon-btn sm" data-menu="${esc(m.id)}" aria-haspopup="menu" aria-expanded="false" aria-label="Options for ${esc(m.name)}">${icon.more}</button>
    <div class="menu" role="menu" data-menu-for="${esc(m.id)}" hidden>
      ${r.myRole === 'owner' ? `<button role="menuitem" type="button" data-act-member="role" data-pid="${esc(m.id)}" data-target="${m.role === 'moderator' ? 'member' : 'moderator'}">${m.role === 'moderator' ? 'Set as member' : 'Make moderator'}</button>` : ''}
      ${r.myRole === 'owner' ? `<button role="menuitem" type="button" data-act-member="owner" data-pid="${esc(m.id)}">Make owner</button>` : ''}
      ${isMod && m.role !== 'owner' ? `<button role="menuitem" type="button" data-act-member="kick" data-pid="${esc(m.id)}">Remove (they can rejoin)</button>` : ''}
      ${r.myRole === 'owner' && m.role !== 'owner' ? `<button role="menuitem" type="button" data-act-member="ban" data-pid="${esc(m.id)}">Ban (they cannot rejoin)</button>` : ''}
      <button role="menuitem" type="button" data-act-member="block" data-pid="${esc(m.id)}">Block</button>
      <button role="menuitem" type="button" data-act-member="report" data-pid="${esc(m.id)}" data-name="${esc(m.name)}">Report</button>
    </div>` : '';
  return `<li class="member ${m.you ? 'you' : ''}">${avatar(m.name, m.avatar, 'sm')}
    <div class="grow"><strong>${esc(m.name)}</strong> <span class="tags">${tags}</span>
      ${m.skillLabels && m.skillLabels.length ? `<p class="hint small">${m.skillLabels.slice(0, 4).map(esc).join(', ')}</p>` : ''}
      ${m.city ? `<p class="meta">${esc(m.city)} · ${esc(m.modeText || '')}</p>` : ''}
    </div>
    <div class="member-menu-wrap">${menu}</div>
  </li>`;
}

// ---------- messages ----------
function bubble(m, state2 = '') {
  const pic = m.image ? `<img class="bubble-img" src="${esc(m.image)}" alt="Picture from ${esc(m.authorName || 'a member')}" loading="lazy">` : '';
  const text = m.text ? `<p class="bubble-text">${esc(m.text)}</p>` : '';
  const when = m.ts ? `<span class="when">${esc(fmtTime(m.ts))}</span>` : '';
  if (m.kind === 'assistant') return `<div class="msg-row ai ${state2}" data-id="${esc(m.id || '')}">${avatar('KNOT AI', null, 'sm')}<div class="bubble"><span class="who">KNOT AI</span>${pic}${text}${when}</div></div>`;
  if (m.kind === 'demo') return `<div class="msg-row them demo ${state2}" data-id="${esc(m.id || '')}"><div class="bubble"><span class="who">${esc(m.authorName)} <span class="demo-tag">Demo</span></span>${pic}${text}${when}</div></div>`;
  const mine = !!m.you;
  return `<div class="msg-row ${mine ? 'mine' : 'them'} ${state2}" data-id="${esc(m.id || '')}"><div class="bubble"><span class="who">${esc(mine ? 'You' : m.authorName)}</span>${pic}${text}${when}</div></div>`;
}
const htmlEl = html => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
const logEl = () => $('#msgLog');
const nearBottom = () => { const l = logEl(); return !l || (l.scrollHeight - l.scrollTop - l.clientHeight) < 80; };
const scrollBottom = () => { const l = logEl(); if (l) l.scrollTop = l.scrollHeight; };

// Adds lines the browser has not shown yet. A line that answers a pending send replaces its bubble.
function absorb(list) {
  if (!view || !list || !list.length) return;
  const log = logEl(); if (!log) return;
  const stick = nearBottom();
  const placeholder = log.querySelector('.bubble.bot:not(.msg-row)');
  for (const m of list) {
    if (!m || !m.id || view.seen.has(m.id)) continue;
    view.seen.add(m.id);
    if (!view.since || m.ts > view.since) view.since = m.ts;
    if (placeholder && placeholder.isConnected) placeholder.remove();
    if (m.clientMsgId && view.pending.has(m.clientMsgId)) {
      const old = view.pending.get(m.clientMsgId);
      view.pending.delete(m.clientMsgId);
      old.replaceWith(htmlEl(bubble({ ...m, you: true })));
    } else {
      log.append(htmlEl(bubble(m)));
    }
  }
  if (stick) scrollBottom();
}

async function pollMessages() {
  if (!view || document.hidden) return;
  const id = view.id;
  try {
    const out = await api(`/api/rooms/${enc(id)}/messages?after=${enc(view.since || '')}`);
    if (view && view.id === id) absorb(out.messages);
  } catch { /* the next tick tries again */ }
}

async function pollRoom() {
  if (!view || document.hidden) return;
  const id = view.id;
  try {
    const { room } = await api(`/api/rooms/${enc(id)}`);
    if (!view || view.id !== id) return;
    view.room = room;
    paintHead(); paintNotes(); paintAside();
  } catch { /* try again on the next tick */ }
}

async function pollTyping() {
  if (!view || document.hidden) return;
  const id = view.id;
  try {
    const out = await api(`/api/rooms/${enc(id)}/typing`);
    if (!view || view.id !== id) return;
    view.typing = out.typing || [];
    paintTyping();
  } catch { /* presence is a courtesy */ }
}

function paintTyping() {
  const box = $('#typingRow'); if (!box) return;
  const seen = new Set();
  const rows = (view.typing || []).map(t => (t.ai ? 'KNOT AI' : String(t.name || '').trim())).filter(n => n && !seen.has(n) && seen.add(n));
  box.hidden = !rows.length;
  box.innerHTML = rows.map(n => `<p class="typing-row"><span class="typing-dots" aria-hidden="true"><i></i><i></i><i></i></span>${esc(n)} is typing</p>`).join('');
}

// ---------- sending ----------
function wireComposer() {
  const form = $('#msgForm');
  const input = $('#msgInput');
  const cmdPop = $('#cmdPop');
  let cmdItems = COMMANDS, cmdIndex = 0, pendingImage = null;

  const setImage = url => {
    pendingImage = url;
    const thumb = $('#attachThumb');
    if (url) thumb.src = url; else thumb.removeAttribute('src');
    $('#attach').hidden = !url;
  };
  const takeFile = async file => {
    try { setImage(await resizeImage(file, 1024, imageLimit(300))); }
    catch (ex) { showErr(ex.message); }
  };
  $('#attachClear').addEventListener('click', () => { setImage(null); $('#msgPhoto').value = ''; input.focus(); });
  $('#msgPhoto').addEventListener('change', () => takeFile($('#msgPhoto').files[0]));
  form.addEventListener('paste', e => {
    const item = [...((e.clipboardData && e.clipboardData.items) || [])].find(i => i.kind === 'file' && i.type.startsWith('image/'));
    if (!item) return;
    e.preventDefault();
    takeFile(item.getAsFile());
  });

  const paintCmds = () => {
    const q = (input.value.slice(1) || '').toLowerCase();
    cmdItems = COMMANDS.filter(c => !q || c.key.startsWith(q) || c.label.toLowerCase().includes(q));
    if (!cmdItems.length) { cmdPop.hidden = true; return; }
    cmdIndex = Math.min(cmdIndex, cmdItems.length - 1);
    cmdPop.innerHTML = cmdItems.map((c, i) => `<button type="button" class="cmd-row ${i === cmdIndex ? 'on' : ''}" role="option" aria-selected="${i === cmdIndex}" data-cmd="${i}"><span class="cmd-key">/${esc(c.key)}</span><span><strong>${esc(c.label)}</strong><span class="cmd-hint">${esc(c.hint)}</span></span></button>`).join('');
    cmdPop.hidden = false;
  };
  const pickCmd = c => {
    if (!c) return;
    cmdPop.hidden = true;
    if (!c.fill) { input.value = ''; paintCmds(); input.focus(); return; }
    input.value = c.fill; input.focus();
  };
  cmdPop.addEventListener('mousedown', e => { const b = e.target.closest('[data-cmd]'); if (b) { e.preventDefault(); pickCmd(cmdItems[Number(b.dataset.cmd)]); } });
  input.addEventListener('input', () => {
    const v = input.value;
    if (!v.startsWith('/') || /\s/.test(v)) cmdPop.hidden = true; else { cmdIndex = 0; paintCmds(); }
    noteTyping();
  });
  input.addEventListener('keydown', e => {
    if (cmdPop.hidden) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); cmdIndex = (cmdIndex + 1) % cmdItems.length; paintCmds(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); cmdIndex = (cmdIndex - 1 + cmdItems.length) % cmdItems.length; paintCmds(); }
    else if (e.key === 'Enter') { e.preventDefault(); pickCmd(cmdItems[cmdIndex]); }
    else if (e.key === 'Escape') { cmdPop.hidden = true; }
  });

  form.addEventListener('submit', e => {
    e.preventDefault();
    const raw = input.value.trim();
    if (!raw && !pendingImage) return;
    const cmd = raw.startsWith('/') ? parseCommand(raw) : null;
    if (cmd && cmd.help) { input.value = ''; paintCmds(); input.focus(); return; }
    if (cmd && cmd.unknown) return showErr(`There is no /${cmd.unknown} command. Type / to see what KNOT AI can do.`);
    if (cmd) {
      if (view.room.aiMode === 'off') return showErr('KNOT AI is off in this group. The owner can turn it on in group settings.');
      if (!cmd.question) return showErr('Add your question after /ai, for example /ai what should we do first?');
      input.value = ''; setImage(null); stopTyping();
      return send({ text: '/' + cmd.key + ' ' + cmd.question, askAi: true, aiQuestion: cmd.question });
    }
    const image = pendingImage;
    input.value = ''; setImage(null); stopTyping();
    send({ text: raw, image });
  });
  paintCmds();
  cmdPop.hidden = true;
  view.pic = { setImage };
}

function parseCommand(raw) {
  const body = raw.slice(1).trim();
  if (!body) return { help: true };
  const sp = body.search(/\s/);
  const key = (sp === -1 ? body : body.slice(0, sp)).toLowerCase();
  const rest = sp === -1 ? '' : body.slice(sp).trim();
  if (key === 'help') return { help: true };
  const c = COMMANDS.find(x => x.key === key);
  if (!c) return { unknown: key };
  return { key, question: rest || c.prompt || '' };
}

function showErr(t) { const e = $('#msgErr'); if (e) { e.textContent = t; e.hidden = false; } }

async function send({ text = '', image = null, askAi = false, aiQuestion = null, cid = null }) {
  if (!view) return;
  const id = view.id;
  const clientMsgId = cid || uid();
  $('#msgErr') && ($('#msgErr').hidden = true);
  const log = logEl();
  const el = htmlEl(bubble({ authorName: myProfile().name || 'You', text, image, you: true, ts: new Date().toISOString() }, 'sending'));
  el.dataset.cid = clientMsgId;
  log.append(el);
  scrollBottom();
  view.pending.set(clientMsgId, el);
  view.failed.set(clientMsgId, { text, image, askAi, aiQuestion });
  const body = { text, clientMsgId };
  if (image) body.image = image;
  if (askAi) { body.askAi = true; body.aiQuestion = aiQuestion; }
  try {
    const out = await api(`/api/rooms/${enc(id)}/messages`, { method: 'POST', body });
    if (!view || view.id !== id) return;
    view.failed.delete(clientMsgId);
    // The bubble is replaced by the saved line. A retried send may already be in the list by id, in
    // which case only the pending bubble goes.
    const pendingEl = view.pending.get(clientMsgId);
    view.pending.delete(clientMsgId);
    if (pendingEl) pendingEl.remove();
    absorb([{ ...out.message, you: true }]);
    await runReplies(id, out.next);
  } catch (ex) {
    if (!view || view.id !== id) return;
    el.classList.remove('sending'); el.classList.add('failed');
    el.querySelector('.bubble').insertAdjacentHTML('beforeend', `<p class="failed-note">${icon.alert}<span>${esc(ex.message)}</span> <button type="button" class="link-btn" data-retry="${esc(clientMsgId)}">Retry</button></p>`);
    view.pending.delete(clientMsgId);
  }
}

// The answers to a message: each step is asked for in turn, and each one's lines appear as they land.
async function runReplies(id, next) {
  let step = next;
  try {
    for (let i = 0; step && i < 10; i++) {
      const got = await api(`/api/rooms/${enc(id)}/replies`, { method: 'POST', body: { next: step } });
      if (!view || view.id !== id) return;
      absorb(got.messages || []);
      step = got.next;
    }
  } catch { toast('KNOT could not finish the replies. Your message is saved.', 'warn'); }
  pollTyping();
}

let typingSent = 0, typingIdle = null;
function noteTyping() {
  const box = $('#msgInput');
  const has = !!(box && box.value.trim());
  if (typingIdle) { clearTimeout(typingIdle); typingIdle = null; }
  if (!has) { stopTyping(); return; }
  const now = Date.now();
  if (now - typingSent > 2500) { typingSent = now; tellTyping(true); }
  typingIdle = setTimeout(stopTyping, 3500);
}
function stopTyping() {
  if (typingIdle) { clearTimeout(typingIdle); typingIdle = null; }
  if (typingSent && view) { typingSent = 0; tellTyping(false); }
  typingSent = 0;
}
function tellTyping(on) {
  if (!view) return;
  api(`/api/rooms/${enc(view.id)}/typing`, { method: 'POST', body: { typing: on } }).catch(() => {});
}

// ---------- actions ----------
function onClick(e) {
  const t = e.target;
  const retry = t.closest('[data-retry]');
  if (retry) {
    const cid = retry.dataset.retry;
    const payload = view.failed.get(cid);
    const el = view.pending.get(cid) || logEl().querySelector(`[data-cid="${cid}"]`);
    if (el) el.remove();
    if (payload) send({ ...payload, cid });
    return;
  }
  const menuBtn = t.closest('[data-menu]');
  if (menuBtn) {
    const menu = $(`[data-menu-for="${CSS.escape(menuBtn.dataset.menu)}"]`);
    const open = menu.hidden;
    $$('.members-card .menu').forEach(m => { m.hidden = true; });
    $$('.members-card [data-menu]').forEach(b => b.setAttribute('aria-expanded', 'false'));
    menu.hidden = !open;
    menuBtn.setAttribute('aria-expanded', String(open));
    return;
  }
  const act = t.closest('[data-act]');
  if (act) return roomAction(act.dataset.act);
  const memberAct = t.closest('[data-act-member]');
  if (memberAct) return memberAction(memberAct);
  const aiToggle = t.closest('[data-ai-toggle]');
  if (aiToggle) return setAi(aiToggle.dataset.aiToggle);
  const unban = t.closest('[data-unban]');
  if (unban) return modAct('unban', { pid: unban.dataset.unban }, 'They can join again.');
  const req = t.closest('[data-req]');
  if (req) return modAct('requests', { pid: req.dataset.pid, approve: req.dataset.req === 'approve' }, req.dataset.req === 'approve' ? 'Approved.' : 'Declined.');
}

async function roomAction(act) {
  const r = view.room;
  if (act === 'join') {
    try {
      const out = await api(`/api/rooms/${enc(r.id)}/join`, { method: 'POST', body: {} });
      if (out.pending) { toast('Request sent. The owner will approve it.', 'ok'); return; }
      renderRoom(r.id);
    } catch (ex) { toast(ex.message, 'err'); }
  }
  if (act === 'invite' || act === 'copy-invite') {
    copyText(location.origin + '/#/join/' + r.inviteCode);
    toast('Invite link copied.', 'ok');
  }
  if (act === 'settings') openSettings();
  if (act === 'leave') {
    const ok = await askConfirm({ title: 'Leave this group?', body: 'You will need a new invite to come back.', yes: 'Leave group', no: 'Stay in the group', danger: true });
    if (!ok) return;
    try { await api(`/api/rooms/${enc(r.id)}/leave`, { method: 'POST', body: {} }); toast('You left the group.'); navigate('#/groups'); }
    catch (ex) { toast(ex.message, 'err'); }
  }
}

async function setAi(mode) {
  try {
    const out = await api(`/api/rooms/${enc(view.room.id)}`, { method: 'PATCH', body: { aiMode: mode } });
    view.room = out.room; paintHead(); paintNotes(); paintAside();
    toast(mode === 'off' ? 'KNOT AI is muted in this group.' : 'KNOT AI can answer when a member asks.', 'ok');
  } catch (ex) { toast(ex.message, 'err'); }
}

async function memberAction(btn) {
  const kind = btn.dataset.actMember;
  const pid = btn.dataset.pid;
  const r = view.room;
  if (kind === 'kick') {
    if (!await askConfirm({ title: 'Remove this person?', body: 'They can join again with the invite link.', yes: 'Remove', no: 'Keep them in the group' })) return;
    return modAct('kick', { pid }, 'Removed. They can join again with the invite link.');
  }
  if (kind === 'ban') {
    if (!await askConfirm({ title: 'Ban this person?', body: 'They cannot rejoin this group. You can undo it from Removed people.', yes: 'Ban', no: 'Cancel', danger: true })) return;
    return modAct('ban', { pid, reason: 'Removed by a moderator' }, 'Banned. They cannot rejoin unless you let them back in.');
  }
  if (kind === 'role') return modAct('promote', { pid, role: btn.dataset.target || 'member' }, 'Role updated.');
  if (kind === 'owner') {
    if (!await askConfirm({ title: 'Make this member the owner?', body: 'You become a regular member and lose the owner controls.', yes: 'Transfer ownership', no: 'Cancel' })) return;
    return modAct('transfer', { pid }, 'Ownership transferred.');
  }
  if (kind === 'block') {
    try { const out = await api('/api/blocks', { method: 'POST', body: { pid } }); toast(out.note || 'Blocked.', 'ok'); }
    catch (ex) { toast(ex.message, 'err'); }
    return;
  }
  if (kind === 'report') return openReport(r, { pid, name: btn.dataset.name });
}

async function modAct(path, payload, ok) {
  try {
    await api(`/api/rooms/${enc(view.room.id)}/${path}`, { method: 'POST', body: payload });
    toast(ok, 'ok');
    await pollRoom();
  } catch (ex) { toast(ex.message, 'err'); }
}

function openSettings() {
  const r = view.room;
  const owner = r.myRole === 'owner';
  const d = openDialog({
    title: 'Group settings',
    sub: owner ? 'You own this group.' : 'You can moderate this group.',
    body: `<form id="setForm" class="form">
        <div class="field"><label for="sTitle">Group name</label><input id="sTitle" type="text" maxlength="80" value="${esc(r.title)}"></div>
        <div class="field"><label for="sDesc">Short description</label><input id="sDesc" type="text" maxlength="300" value="${esc(r.description || '')}"></div>
        <fieldset class="field"><legend>KNOT AI in this chat</legend>
          <label class="check"><input type="radio" name="sAi" value="off" ${r.aiMode === 'off' ? 'checked' : ''}> <span>Off</span></label>
          <label class="check"><input type="radio" name="sAi" value="on-demand" ${r.aiMode !== 'on' && r.aiMode !== 'off' ? 'checked' : ''}> <span>Only when asked (/ai)</span></label>
          <label class="check"><input type="radio" name="sAi" value="on" ${r.aiMode === 'on' ? 'checked' : ''}> <span>Replies to everyone</span></label>
          <p class="hint">Members always see which setting is on.</p>
        </fieldset>
        ${owner ? `<fieldset class="field"><legend>Visibility</legend>
          <label class="check"><input type="radio" name="sVis" value="public" ${r.visibility === 'public' ? 'checked' : ''}> <span>Public: shown in Discover</span></label>
          <label class="check"><input type="radio" name="sVis" value="private" ${r.visibility !== 'public' ? 'checked' : ''}> <span>Private: invite link only</span></label></fieldset>
          <fieldset class="field"><legend>Joining</legend>
          <label class="check"><input type="radio" name="sJoin" value="open" ${r.joinMode === 'open' ? 'checked' : ''}> <span>Anyone can join</span></label>
          <label class="check"><input type="radio" name="sJoin" value="request" ${r.joinMode === 'request' ? 'checked' : ''}> <span>I approve each request</span></label></fieldset>
          <div class="field"><label for="sCap">Member cap</label><input id="sCap" type="number" min="2" max="50" value="${r.capacity}"></div>` : ''}
        <p class="msg err" id="sErr" role="alert" hidden></p>
      </form>`,
    footer: `<button type="button" class="btn ghost" data-cancel>Cancel</button><button type="submit" form="setForm" class="btn primary">Save settings</button>`
  });
  $('[data-cancel]', d).addEventListener('click', () => d.close());
  $('#setForm', d).addEventListener('submit', async e => {
    e.preventDefault();
    const fields = { title: $('#sTitle', d).value.trim(), description: $('#sDesc', d).value.trim(), aiMode: ($('input[name=sAi]:checked', d) || { value: 'off' }).value };
    if (owner) {
      fields.visibility = ($('input[name=sVis]:checked', d) || { value: r.visibility }).value;
      fields.joinMode = ($('input[name=sJoin]:checked', d) || { value: r.joinMode }).value;
      fields.capacity = $('#sCap', d).value || r.capacity;
    }
    try {
      const out = await api(`/api/rooms/${enc(r.id)}`, { method: 'PATCH', body: fields });
      view.room = out.room; paintHead(); paintNotes(); paintAside();
      d.close(); toast('Settings saved.', 'ok');
    } catch (ex) { const er = $('#sErr', d); er.textContent = ex.message; er.hidden = false; }
  });
}

function openReport(room, target) {
  const d = openDialog({
    title: 'Report to moderators',
    sub: 'A person looks at every report. Nothing happens to the person automatically, and they are not told who reported them.',
    body: `<form id="repForm" class="form">
        <p class="hint">Reporting: <strong>${esc(target.name || 'a member')}</strong></p>
        <fieldset class="field"><legend>Reason</legend>
          ${REPORT_REASONS.map((x, i) => `<label class="check"><input type="radio" name="repReason" value="${esc(x)}" ${i === 0 ? 'checked' : ''}> <span>${esc(x)}</span></label>`).join('')}
        </fieldset>
        <div class="field"><label for="repDetails">What happened? <span class="opt">(optional)</span></label><textarea id="repDetails" rows="3" maxlength="500"></textarea></div>
        <p class="msg err" id="repErr" role="alert" hidden></p>
      </form>`,
    footer: `<button type="button" class="btn ghost" data-cancel>Cancel</button><button type="submit" form="repForm" class="btn primary">Send report</button>`
  });
  $('[data-cancel]', d).addEventListener('click', () => d.close());
  $('#repForm', d).addEventListener('submit', async e => {
    e.preventDefault();
    const reason = ($('input[name=repReason]:checked', d) || { value: 'Other' }).value;
    try {
      const r = await api('/api/reports', { method: 'POST', body: { roomId: room.id, targetPid: target.pid, reason, details: $('#repDetails', d).value.trim() } });
      d.close(); toast(r.note || 'Report filed for review.', 'ok');
    } catch (ex) { const er = $('#repErr', d); er.textContent = ex.message; er.hidden = false; }
  });
}

// ---------- invite links ----------
export async function renderJoin(code) {
  $('#main').innerHTML = `<section class="page narrow"><p class="hint">Opening the invite…</p></section>`;
  if (!isSignedIn()) {
    $('#main').innerHTML = `<section class="page narrow"><div class="empty-card wide"><h2>Sign in to join</h2><p>Invites open a group for members. Sign in, or create an account, and the invite opens straight after.</p><button type="button" class="btn primary" data-action="signin">Sign in</button></div></section>`;
    store.set('knot.pendingInvite', code);
    return;
  }
  try {
    const { room } = await api('/api/rooms/join', { method: 'POST', body: { code } });
    navigate('#/room/' + room.id);
    toast(room.isMember ? 'You are in. Say hi to the group.' : 'You are previewing this group.', 'ok');
  } catch (ex) {
    $('#main').innerHTML = `<section class="page narrow"><div class="empty-card wide"><h2>Invite problem</h2><p>${esc(ex.message)}</p><a class="btn ghost" href="#/groups">Back to my groups</a></div></section>`;
  }
}
