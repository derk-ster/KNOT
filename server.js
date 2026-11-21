'use strict';
// KNOT server: static files + JSON API. Zero dependencies. Storage: data/db.json.
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { profiles, SKILLS, SKILL_BY_ID, matchGoal, buildAssist, cap } = require('./lib/match');

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC = path.join(__dirname, 'public');
const DB_FILE = path.join(__dirname, 'data', 'db.json');

let db = { rooms: [] };
try { db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); if (!Array.isArray(db.rooms)) db.rooms = []; } catch { /* fresh db */ }
function save() {
  fs.writeFileSync(DB_FILE + '.tmp', JSON.stringify(db, null, 2));
  fs.renameSync(DB_FILE + '.tmp', DB_FILE);
}

const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.ico': 'image/x-icon' };

function send(res, code, body) {
  const data = JSON.stringify(body);
  res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(data);
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => { size += c.length; if (size > 64 * 1024) { reject(new Error('Request too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {}); } catch { reject(new Error('Invalid JSON')); } });
    req.on('error', reject);
  });
}
const str = (v, max) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max);
const SKILL_IDS = new Set(SKILLS.map(s => s.id));

function publicRoom(room, withMessages) {
  const { requestId, clientId, ...rest } = room;
  if (!withMessages) { const last = room.messages[room.messages.length - 1]; delete rest.messages; return { ...rest, messageCount: room.messages.length, lastMessageAt: last ? last.ts : null }; }
  return rest;
}

function memberSnapshot(p) {
  return { id: p.id, name: p.name, city: p.city, modeText: { both: 'in person or online', 'in-person': 'in person only', online: 'online only' }[p.mode],
    skillLabels: p.skills.map(s => SKILL_BY_ID[s.id].label), availabilityDays: p.availability ? p.availability.days : null,
    availabilityText: p.availability ? p.availability.days.map(cap).join(', ') : 'Availability unknown' };
}

async function api(req, res, url) {
  const parts = url.pathname.split('/').filter(Boolean).slice(1); // after "api"
  const m = req.method;

  if (m === 'GET' && parts[0] === 'status') return send(res, 200, { matcher: 'local-rules', ai: false, storage: 'data/db.json', profiles: profiles.length });
  if (m === 'GET' && parts[0] === 'skills') return send(res, 200, { skills: SKILLS.map(s => ({ id: s.id, label: s.label })) });

  if (m === 'POST' && parts[0] === 'match') {
    const b = await readBody(req);
    const goal = str(b.goal, 500);
    if (!goal) return send(res, 400, { error: 'Add a goal first.' });
    const me = b.me || {};
    const clean = { skills: (Array.isArray(me.skills) ? me.skills : []).filter(id => SKILL_IDS.has(id)), availability: (Array.isArray(me.availability) ? me.availability : []).map(d => str(d, 12).toLowerCase()).slice(0, 7) };
    return send(res, 200, matchGoal({ goal, me: clean, relaxed: Array.isArray(b.relaxed) ? b.relaxed.slice(0, 5) : [] }));
  }

  if (parts[0] === 'rooms') {
    if (m === 'GET' && parts.length === 1) {
      const cid = str(url.searchParams.get('clientId'), 80);
      const rooms = db.rooms.filter(r => r.clientId === cid).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(r => publicRoom(r, false));
      return send(res, 200, { rooms });
    }
    if (m === 'POST' && parts.length === 1) {
      const b = await readBody(req);
      const requestId = str(b.requestId, 80), clientId = str(b.clientId, 80);
      if (!requestId || !clientId) return send(res, 400, { error: 'Missing request details. Please try again.' });
      const dup = db.rooms.find(r => r.requestId === requestId);
      if (dup) return send(res, 200, { room: publicRoom(dup, true), duplicate: true });
      const goal = str(b.goal, 500), title = str(b.title, 80), ownerName = str(b.ownerName, 40);
      if (!goal || !title || !ownerName) return send(res, 400, { error: 'A group needs a name and a goal.' });
      const ids = [...new Set(Array.isArray(b.memberIds) ? b.memberIds : [])].slice(0, 5);
      const members = ids.map(id => profiles.find(p => p.id === id)).filter(Boolean).map(memberSnapshot);
      if (!members.length) return send(res, 400, { error: 'Select at least one person for the group.' });
      const ownerSkills = (Array.isArray(b.ownerSkills) ? b.ownerSkills : []).filter(id => SKILL_IDS.has(id));
      const owner = { id: clientId, name: ownerName, you: true, skillLabels: ownerSkills.map(id => SKILL_BY_ID[id].label), availabilityDays: null, availabilityText: 'You' };
      const room = { id: crypto.randomBytes(5).toString('hex'), requestId, clientId, title, goal, ownerName, createdAt: new Date().toISOString(), members: [owner, ...members], messages: [] };
      db.rooms.push(room); save();
      return send(res, 201, { room: publicRoom(room, true) });
    }
    const room = db.rooms.find(r => r.id === parts[1]);
    if (!room) return send(res, 404, { error: 'This group could not be found. It may have been created on another computer.' });
    if (m === 'GET' && parts.length === 2) return send(res, 200, { room: publicRoom(room, true) });
    if (m === 'POST' && parts[2] === 'messages') {
      const b = await readBody(req);
      const text = String(b.text == null ? '' : b.text).trim().slice(0, 2000);
      if (!text) return send(res, 400, { error: 'Type a message first.' });
      const msg = { id: crypto.randomUUID(), authorId: str(b.authorId, 80), authorName: str(b.authorName, 40) || 'Someone', text, kind: b.kind === 'assistant' ? 'assistant' : 'user', ts: new Date().toISOString() };
      room.messages.push(msg); save();
      return send(res, 201, { message: msg });
    }
    if (m === 'POST' && parts[2] === 'assist') return send(res, 200, buildAssist(room));
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
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (url.pathname.startsWith('/api/')) await api(req, res, url);
    else if (req.method === 'GET' || req.method === 'HEAD') serveStatic(req, res, url);
    else { res.writeHead(405); res.end(); }
  } catch (e) {
    if (!res.headersSent) send(res, 400, { error: e.message || 'Something went wrong.' });
  }
});
server.on('error', e => {
  if (e.code === 'EADDRINUSE') console.error(`Port ${PORT} is already in use. KNOT may already be running at http://localhost:${PORT}.\nTo stop it: pkill -f "node server.js"   Or use another port: PORT=4000 node server.js`);
  else console.error(e.message);
  process.exit(1);
});
server.listen(PORT, () => {
  console.log(`KNOT is running at http://localhost:${PORT}`);
  console.log('Matching: local rules (no AI model). Storage: data/db.json');
});
