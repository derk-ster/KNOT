'use strict';
// End-to-end API tests against a real server process with an isolated JSON database.
// These cover the demo-critical rules: identity comes from the session, groups persist,
// duplicate creates are deduped, invite links work, outsiders cannot read a room.
const test = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const PORT = 3997;
const BASE = `http://127.0.0.1:${PORT}`;

let child;
const dbFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'knot-test-')), 'db.json');
function startServer() {
  child = spawn('node', ['server.js'], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, PORT: String(PORT), KNOT_DB_PATH: dbFile, GROQ_API_KEY: '' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  child.stderr.on('data', d => process.env.KNOT_TEST_DEBUG && process.stderr.write(d));
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('server did not start')), 8000);
    const tryFetch = async () => {
      try { const r = await fetch(BASE + '/api/status'); if (r.ok) { clearTimeout(t); resolve(); } }
      catch { setTimeout(tryFetch, 150); }
    };
    tryFetch();
  });
}

test.after(async () => { if (child) { child.kill(); await new Promise(r => child.on('exit', r)); } });
test.before(startServer);

function jar() {
  let sid = null;
  return {
    header: () => sid ? { cookie: sid } : {},
    absorb: res => { const c = res.headers.get('set-cookie'); if (c) sid = c.split(';')[0]; }
  };
}
const post = async (path, body, jarObj) => { const r = await fetch(BASE + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(jarObj ? jarObj.header() : {}) }, body: JSON.stringify(body) }); if (jarObj) jarObj.absorb(r); return r; };
const get = async (path, jarObj) => { const r = await fetch(BASE + path, { headers: jarObj ? jarObj.header() : {} }); if (jarObj) jarObj.absorb(r); return r; };

test('session: anonymous identity via HttpOnly cookie, name set via profile', async () => {
  const j = jar();
  const s1 = await (await post('/api/session', { legacyClientId: 'legacy-abc' }, j)).json();
  assert.ok(s1.id && s1.isGuest);
  const j2 = jar(); // same browser, new request: server issues same sid? no - separate jar, must stay separate
  const s2 = await (await post('/api/session', {}, j2)).json();
  assert.notEqual(s1.id, s2.id, 'different browsers get different identities');
  const p = await post('/api/profile', { name: 'Derek' }, j);
  assert.equal(p.status, 200);
  assert.equal((await p.json()).name, 'Derek');
  assert.equal((await (await post('/api/profile', { name: '' }, j)).status), 400);
});

test('group creation: persisted, invite code, duplicate request deduped', async () => {
  const j = jar();
  await post('/api/session', {}, j);
  const body = { requestId: 'req-1', clientId: 'legacy-abc', title: 'Short film crew', goal: 'Make a short film in Plano and need an editor.', memberIds: ['maya-okafor'] };
  const r1 = await post('/api/rooms', body, j);
  assert.equal(r1.status, 201);
  const { room, duplicate } = await r1.json();
  assert.ok(!duplicate && room.inviteCode && room.members.length === 2);
  assert.ok(room.members[0].you === true, 'creator marked as you');
  assert.ok(room.members[1].demo === true, 'fictional profile tagged demo');
  const r2 = await post('/api/rooms', { ...body, requestId: 'req-1' }, j);
  const d2 = await r2.json();
  assert.equal(d2.duplicate, true, 'repeated clicks return the same room');
  assert.equal(d2.room.id, room.id);
});

test('messages: author stamped by server, client claims ignored', async () => {
  const j = jar();
  await post('/api/session', {}, j);
  const { room } = await (await post('/api/rooms', { requestId: 'req-m', title: 'T', goal: 'Play chess in Plano.', memberIds: ['kai-nakamura'] }, j)).json();
  const r = await post(`/api/rooms/${room.id}/messages`, { text: 'hello group', authorId: 'fake-id', authorName: 'NotMe' }, j);
  assert.equal(r.status, 201);
  const { message } = await r.json();
  assert.ok(!['fake-id', 'NotMe'].includes(message.authorName), 'server never trusts client identity');
  const list = (await (await get(`/api/rooms/${room.id}/messages`, j)).json()).messages;
  assert.ok(list.some(m => m.text === 'hello group'));
  const bad = await post(`/api/rooms/${room.id}/messages`, { text: '' }, j);
  assert.equal(bad.status, 400, 'empty messages rejected');
});

test('outsider cannot read the room; invite link joins them', async () => {
  const owner = jar(), stranger = jar();
  await post('/api/session', {}, owner);
  await post('/api/session', {}, stranger);
  const { room } = await (await post('/api/rooms', { requestId: 'req-x', title: 'Secret plan', goal: 'Plan something in Frisco.', memberIds: ['rosa-mendes'] }, owner)).json();
  const denied = await get(`/api/rooms/${room.id}`, stranger);
  assert.equal(denied.status, 403, 'no cookie-free snooping');
  const badCode = await post('/api/rooms/join', { code: 'zzzz' }, stranger);
  assert.equal(badCode.status, 404, 'invalid invite rejected');
  const ok = await post('/api/rooms/join', { code: room.inviteCode }, stranger);
  assert.ok([200, 201].includes(ok.status));
  const { room: joined } = await ok.json();
  assert.equal(joined.id, room.id);
  assert.ok(joined.members.some(m => m.demo === false && m.you === true), 'stranger is now a real member');
  const msg = await post(`/api/rooms/${room.id}/messages`, { text: 'hi from the other computer' }, stranger);
  assert.equal(msg.status, 201);
  const seen = (await (await get(`/api/rooms/${room.id}`, owner)).json()).room;
  assert.ok(seen.messages.some(m => m.text === 'hi from the other computer'), 'owner sees the joined member message');
});

test('rooms list and persistence across restart', async () => {
  const j = jar();
  await post('/api/session', { legacyClientId: 'legacy-abc' }, j);
  const { rooms } = await (await get('/api/rooms', j)).json();
  assert.ok(rooms.some(r => r.title === 'Short film crew'), 'created group listed for its creator');
  // restart the server on the same db file: data survives
  child.kill();
  await new Promise(r => child.on('exit', r));
  await startServer();
  const j2 = jar();
  await post('/api/session', { legacyClientId: 'legacy-abc' }, j2);
  const { rooms: after } = await (await get('/api/rooms', j2)).json();
  assert.ok(after.some(r => r.title === 'Short film crew'), 'groups survive a server restart');
});
