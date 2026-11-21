'use strict';
// KNOT server: static files + JSON API. Zero dependencies. Storage: data/db.json.
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
require('./lib/env');
const store = require('./lib/store');
const groq = require('./lib/groq');
const { finderTurn, helpTurn } = require('./lib/ai');
const { examplesFor } = require('./lib/examples');
const guide = require('./lib/guide');
const { mapSkill } = require('./lib/skillmap');
const { parseGoal } = require('./lib/match');
const { profiles, SKILLS, SKILL_BY_ID, matchGoal, buildAssist, cap } = require('./lib/match');

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC = path.join(__dirname, 'public');

const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.ico': 'image/x-icon' };

const hits = new Map();
function limited(req) { // 30 AI calls per minute per address
  const k = req.socket.remoteAddress || 'x', now = Date.now(), arr = (hits.get(k) || []).filter(x => now - x < 60000);
  if (arr.length >= 30) { hits.set(k, arr); return false; }
  arr.push(now); hits.set(k, arr); return true;
}
function send(res, code, body) {
  const data = JSON.stringify(body);
  res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(data);
}
function readBody(req) {
  if (req.body !== undefined && req.body !== null && !(req.body instanceof Buffer)) { // Vercel pre-parses JSON
    try { return Promise.resolve(typeof req.body === 'string' ? (req.body ? JSON.parse(req.body) : {}) : req.body); } catch { return Promise.reject(new Error('Invalid JSON')); }
  }
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => { size += c.length; if (size > 64 * 1024) { reject(new Error('Request too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {}); } catch { reject(new Error('Invalid JSON')); } });
    req.on('error', reject);
  });
}
const str = (v, max) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max);
const SKILL_IDS = new Set(SKILLS.map(s => s.id));

// ---------- sessions ----------
// An anonymous identity, kept in an HttpOnly cookie. The server stamps message authors and group
// ownership from this session, so a browser cannot claim to be someone else. No email, no password.
const SID_RE = /^[a-f0-9]{32}$/;
function parseCookies(req) {
  const out = {};
  String(req.headers.cookie || '').split(';').forEach(part => {
    const i = part.indexOf('=');
    if (i < 0) return;
    try { out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim()); } catch { /* skip bad cookie */ }
  });
  return out;
}
async function getSession(req, res) {
  const c = parseCookies(req);
  let sid = c.knot_sid && SID_RE.test(c.knot_sid) ? c.knot_sid : null;
  let isNew = false;
  if (!sid) { sid = crypto.randomBytes(16).toString('hex'); isNew = true; }
  const user = await store.ensureUser(sid);
  if (isNew) res.setHeader('Set-Cookie', `knot_sid=${sid}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000` + (process.env.VERCEL ? '; Secure' : ''));
  return user;
}

function publicRoom(room, withMessages, meId) {
  const realMembers = (room.memberUserIds || []).map(uid => ({
    id: uid, name: (room.memberNames || {})[uid] || 'Member', demo: false, you: uid === meId,
    city: '', modeText: 'Joined via invite', skillLabels: [], availabilityText: 'Just joined', availabilityDays: null
  }));
  const demoMembers = (room.demoMembers || []).map(m => ({ ...m, demo: true, you: false }));
  const out = {
    id: room.id, inviteCode: room.inviteCode, title: room.title, goal: room.goal,
    createdAt: room.createdAt, members: [...realMembers, ...demoMembers],
    messages: room.messages || []
  };
  if (!withMessages) {
    const last = out.messages[out.messages.length - 1];
    return { ...out, messageCount: out.messages.length, lastMessageAt: last ? last.ts : null, messages: undefined };
  }
  return out;
}

function memberSnapshot(p) {
  return { id: p.id, name: p.name, city: p.city, modeText: { both: 'in person or online', 'in-person': 'in person only', online: 'online only' }[p.mode],
    skillLabels: p.skills.map(s => SKILL_BY_ID[s.id].label), availabilityDays: p.availability ? p.availability.days : null,
    availabilityText: p.availability ? p.availability.days.map(cap).join(', ') : 'Availability unknown' };
}

async function api(req, res, url) {
  const parts = url.pathname.split('/').filter(Boolean).slice(1); // after "api"
  const m = req.method;

  if (m === 'GET' && parts[0] === 'status') return send(res, 200, {
    matcher: 'local-rules', ai: groq.enabled(), aiModels: groq.enabled() ? groq.MODELS : null,
    storage: store.kind === 'postgres' ? 'shared-postgres' : (process.env.VERCEL ? 'browser' : 'data/db.json'),
    persistent: store.kind === 'postgres' || !process.env.VERCEL, profiles: profiles.length
  });

  if (parts[0] === 'session') {
    const user = await getSession(req, res);
    if (m === 'POST') {
      const b = await readBody(req);
      if (b.legacyClientId) await store.setLegacyClientId(user.id, str(b.legacyClientId, 80));
    }
    return send(res, 200, user);
  }
  if (m === 'POST' && parts[0] === 'profile') {
    const user = await getSession(req, res);
    const b = await readBody(req);
    const name = str(b.name, 40);
    if (!name) return send(res, 400, { error: 'Add a display name first.' });
    const u = await store.updateUser(user.id, { name, isGuest: false });
    return send(res, 200, u);
  }

  if (m === 'POST' && parts[0] === 'skills' && parts[1] === 'map') {
    const b = await readBody(req); const text = str(b.text, 60);
    if (!text) return send(res, 400, { error: 'Type a skill or hobby first.' });
    const r = await mapSkill(text);
    return send(res, 200, { ...r, labels: r.ids.map(id => SKILL_BY_ID[id].label) });
  }
  if (m === 'POST' && parts[0] === 'members') { // stateless snapshots, used when groups live in the browser
    const b = await readBody(req);
    return send(res, 200, { members: [...new Set(Array.isArray(b.ids) ? b.ids : [])].slice(0, 5).map(id => profiles.find(p => p.id === id)).filter(Boolean).map(memberSnapshot) });
  }
  if (m === 'POST' && parts[0] === 'assist') {
    const b = await readBody(req); const r = b.room || {};
    if (!Array.isArray(r.members) || !r.members.length) return send(res, 400, { error: 'Open a group first.' });
    return send(res, 200, buildAssist({ goal: str(r.goal, 500), members: r.members.slice(0, 6) }));
  }

  if (m === 'POST' && parts[0] === 'ai') {
    if (!limited(req)) return send(res, 429, { error: 'Slow down a little and try again in a minute.' });
    const b = await readBody(req);
    if (parts[1] === 'help') return send(res, 200, await helpTurn({ history: b.history, context: b.context }));
    if (parts[1] === 'finder') {
      if (!groq.enabled()) return send(res, 503, { error: 'The AI Finder is not configured on this server. Use the Home page to describe your goal instead.' });
      const me = b.me || {};
      const clean = { skills: (Array.isArray(me.skills) ? me.skills : []).filter(id => SKILL_IDS.has(id)), availability: [] };
      try { const out = await finderTurn({ history: b.history, me: clean }); out.next = guide.fromFinder(out); return send(res, 200, out); }
      catch (e) { return send(res, e.status || 502, { error: e.status ? e.message : `The AI Finder is unavailable (${e.message}). Your messages are still here; try again, or use the Home page.` }); }
    }
    return send(res, 404, { error: 'Not found' });
  }
  if (m === 'GET' && parts[0] === 'skills') return send(res, 200, { skills: SKILLS.map(s => ({ id: s.id, label: s.label })) });

  if (m === 'POST' && parts[0] === 'examples') {
    const b = await readBody(req);
    return send(res, 200, examplesFor({ goal: str(b.goal, 300), skills: (Array.isArray(b.skills) ? b.skills : []).filter(id => SKILL_IDS.has(id)) }));
  }

  if (m === 'POST' && parts[0] === 'match') {
    const b = await readBody(req);
    const goal = str(b.goal, 500);
    if (!goal) return send(res, 400, { error: 'Add a goal first.' });
    const me = b.me || {};
    const clean = { skills: (Array.isArray(me.skills) ? me.skills : []).filter(id => SKILL_IDS.has(id)), availability: (Array.isArray(me.availability) ? me.availability : []).map(d => str(d, 12).toLowerCase()).slice(0, 7) };
    let extraNeeds = [], mapped = null;
    const pg = parseGoal(goal, clean);
    if (!pg.needs.length && !pg.topics.length) { mapped = await mapSkill(goal); extraNeeds = mapped.ids; }
    const out = matchGoal({ goal, me: clean, relaxed: Array.isArray(b.relaxed) ? b.relaxed.slice(0, 5) : [], extraNeeds });
    if (mapped && mapped.ids.length && !mapped.ids.includes('anything')) out.notice = `KNOT read that as ${mapped.ids.map(id => SKILL_BY_ID[id].label).join(' and ')}, the closest thing it knows.`;
    out.next = guide.fromMatch({ goal, hasProfile: clean.skills.length > 0, results: out.results, empty: out.empty });
    return send(res, 200, out);
  }

  if (parts[0] === 'rooms') {
    const user = await getSession(req, res);
    if (m === 'GET' && parts.length === 1) {
      const rooms = await store.listRoomsForUser(user);
      return send(res, 200, { rooms });
    }
    if (parts[1] === 'join' && m === 'POST') {
      const b = await readBody(req);
      const room = await store.findRoomByInvite(b.code);
      if (!room) return send(res, 404, { error: 'That invite link is not valid. Ask the group creator to copy the invite link again from inside the room.' });
      const allowed = await store.canAccessRoom(room, user);
      if (!allowed) await store.addRoomMember(room, user);
      return send(res, 200, { room: publicRoom(await store.getRoomRaw(room.id), true, user.id) });
    }
    if (m === 'POST' && parts.length === 1) {
      const b = await readBody(req);
      const requestId = str(b.requestId, 80);
      if (!requestId) return send(res, 400, { error: 'Missing request details. Please try again.' });
      const goal = str(b.goal, 500), title = str(b.title, 80);
      if (!goal || !title) return send(res, 400, { error: 'A group needs a name and a goal.' });
      const ids = [...new Set(Array.isArray(b.memberIds) ? b.memberIds : [])].slice(0, 5);
      const members = ids.map(id => profiles.find(p => p.id === id)).filter(Boolean).map(memberSnapshot);
      if (!members.length) return send(res, 400, { error: 'Select at least one person for the group.' });
      const ownerSkills = (Array.isArray(b.ownerSkills) ? b.ownerSkills : []).filter(id => SKILL_IDS.has(id));
      const owner = { id: user.id, name: user.name, you: true, skillLabels: ownerSkills.map(id => SKILL_BY_ID[id].label), availabilityDays: null, availabilityText: 'You', demo: false };
      const made = await store.createRoom({
        id: crypto.randomBytes(5).toString('hex'), inviteCode: crypto.randomBytes(4).toString('hex'),
        requestId, title, goal, ownerUserId: user.id, ownerName: user.name, legacyClientId: str(b.clientId, 80),
        demoMembers: members
      });
      if (!made.room) return send(res, 500, { error: 'The group could not be saved. Please try again.' });
      return send(res, made.duplicate ? 200 : 201, { room: publicRoom(made.room, true, user.id), duplicate: made.duplicate });
    }
    if (parts.length < 2) return send(res, 404, { error: 'Not found' });
    let room = await store.getRoomRaw(parts[1]);
    if (!room) return send(res, 404, { error: 'This group could not be found. It may live on another computer or in another browser. Open My groups to see your groups, or ask the creator for an invite link.' });
    const allowed = await store.canAccessRoom(room, user);
    if (!allowed) return send(res, 403, { error: 'You are not in this group yet. Open the invite link the creator shared to join it.' });
    if (m === 'GET' && parts.length === 2) return send(res, 200, { room: publicRoom(room, true, user.id), next: guide.fromRoom({ messages: room.messages || [] }) });
    if (m === 'GET' && parts[2] === 'messages') {
      const msgs = await store.listMessagesAfter(room, url.searchParams.get('after'));
      return send(res, 200, { messages: msgs });
    }
    if (m === 'POST' && parts[2] === 'messages') {
      if (!limited(req)) return send(res, 429, { error: 'Slow down a little and try again in a minute.' });
      const b = await readBody(req);
      const text = String(b.text == null ? '' : b.text).trim().slice(0, 2000);
      if (!text) return send(res, 400, { error: 'Type a message first.' });
      // The author is always this session's user; anything the client claims about itself is ignored.
      const msg = await store.addMessage(room, { userId: user.id, authorName: user.name, text, kind: b.kind });
      return send(res, 201, { message: msg });
    }
    if (m === 'POST' && parts[2] === 'assist') {
      const pub = publicRoom(room, false, user.id);
      return send(res, 200, buildAssist({ goal: room.goal, members: pub.members }));
    }
  }
  return send(res, 404, { error: 'Not found' });
}

function serveStatic(req, res, url) {
  let p = decodeURIComponent(url.pathname);
  if (p === '/') p = '/index.html';
  const file = path.normalize(path.join(PUBLIC, p));
  if (!file.startsWith(PUBLIC + path.sep)) { res.writeHead(403); return res.end('Forbidden'); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin' });
    res.end(data);
  });
}

const handler = async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (url.pathname.startsWith('/api/')) await api(req, res, url);
    else if (req.method === 'GET' || req.method === 'HEAD') serveStatic(req, res, url);
    else { res.writeHead(405); res.end(); }
  } catch (e) {
    if (!res.headersSent) send(res, 400, { error: e.message || 'Something went wrong.' });
  }
};
module.exports = { handler };
if (require.main !== module) return;
const server = http.createServer(handler);
server.on('error', e => {
  if (e.code === 'EADDRINUSE') console.error(`Port ${PORT} is already in use. KNOT may already be running at http://localhost:${PORT}.\nTo stop it: pkill -f "node server.js"   Or use another port: PORT=4000 node server.js`);
  else console.error(e.message);
  process.exit(1);
});
server.listen(PORT, () => {
  console.log(`KNOT is running at http://localhost:${PORT}`);
  console.log(`Matching: local rules. AI chat + help: ${groq.enabled() ? 'on (Groq, key read from .env, server-side only)' : 'off (no GROQ_API_KEY; help bot uses basic local rules)'}. Storage: ${store.kind === 'postgres' ? 'shared Postgres (DATABASE_URL)' : 'data/db.json (this machine only; set DATABASE_URL to share across computers)'}`);
});
