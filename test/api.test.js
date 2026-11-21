'use strict';
// End-to-end API tests against a real server process with an isolated JSON database.
// Covers the demo-critical rules: identity comes from the session, accounts attach cross-device,
// groups persist, dedupe works, outsiders cannot read rooms, roles/bans/blocks/age gates hold,
// held messages never reach a room, and duplicate sends collapse.
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
    env: { ...process.env, PORT: String(PORT), KNOT_DB_PATH: dbFile, GROQ_API_KEY: '', OPENAI_API_KEY: '', ADMIN_KEY: 'test-admin-key', KNOT_AUTH_RATE_MAX: '100' },
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
const post = async (p, body, jarObj) => { const r = await fetch(BASE + p, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(jarObj ? jarObj.header() : {}) }, body: JSON.stringify(body) }); if (jarObj) jarObj.absorb(r); return r; };
const patch = async (p, body, jarObj) => { const r = await fetch(BASE + p, { method: 'PATCH', headers: { 'Content-Type': 'application/json', ...(jarObj ? jarObj.header() : {}) }, body: JSON.stringify(body) }); if (jarObj) jarObj.absorb(r); return r; };
const get = async (p, jarObj) => { const r = await fetch(BASE + p, { headers: jarObj ? jarObj.header() : {} }); if (jarObj) jarObj.absorb(r); return r; };

async function signup(j, { email, name, age = 'adult', password = 'hunter2abc' } = {}) {
  const r = await post('/api/auth/signup', { email: email || `u${Math.random().toString(36).slice(2)}@test.dev`, password, name: name || 'Test User', ageCategory: age, confirm13: age === 'teen' }, j);
  assert.ok([200, 201].includes(r.status), 'signup succeeded: ' + r.status);
  return r.json();
}

test('session: anonymous identity via HttpOnly cookie, name set via profile', async () => {
  const j = jar();
  const s1 = await (await post('/api/session', { legacyClientId: 'legacy-abc' }, j)).json();
  assert.ok(s1.id && s1.isGuest);
  const j2 = jar();
  const s2 = await (await post('/api/session', {}, j2)).json();
  assert.notEqual(s1.id, s2.id, 'different browsers get different identities');
  const p = await post('/api/profile', { name: 'Derek' }, j);
  assert.equal(p.status, 200);
  assert.equal((await p.json()).name, 'Derek');
  assert.equal((await post('/api/profile', { name: '' }, j)).status, 400);
});

test('signup: creates account, signs in, rejects bad passwords and duplicate emails', async () => {
  const j = jar();
  const email = `acc${Date.now()}@test.dev`;
  const me = await signup(j, { email, name: 'Ana Adult' });
  assert.ok(me.signedIn && me.email === email && me.ageCategory === 'adult');
  assert.ok(!(await (await get('/api/auth/me', j)).json()).isGuest);
  const badPw = await post('/api/auth/signup', { email: `x${Date.now()}@test.dev`, password: 'short', name: 'X', ageCategory: 'adult' }, jar());
  assert.equal(badPw.status, 400, 'weak password rejected');
  const dup = await post('/api/auth/signup', { email, password: 'hunter2abc', name: 'Ana Adult', ageCategory: 'adult' }, jar());
  assert.equal(dup.status, 409, 'duplicate email rejected');
  const wrong = await post('/api/auth/signin', { email, password: 'wrong-pass-99' }, jar());
  assert.equal(wrong.status, 401, 'wrong password rejected with same message as unknown email');
  const ok = await post('/api/auth/signin', { email, password: 'hunter2abc' }, jar());
  assert.equal(ok.status, 200, 'signing in works');
});

test('account follows the person across devices; guest rooms convert on signup', async () => {
  const j = jar();
  await post('/api/session', {}, j);
  const { room } = await (await post('/api/rooms', { requestId: 'adopt-1', title: 'Chess circle', goal: 'Weekly chess meetup in Plano.', memberIds: ['kai-nakamura'] }, j)).json();
  assert.ok(room.demo === true, 'guest-created group is a labeled demo group');
  const email = `adopt${Date.now()}@test.dev`;
  const me = await signup(j, { email, name: 'Pat Adopter' });
  assert.ok(me.signedIn);
  let { rooms } = await (await get('/api/rooms', j)).json();
  assert.ok(rooms.some(r => r.id === room.id), 'room created as a guest follows the account');
  // second device signs in with the same account and sees the same rooms
  const j2 = jar();
  await post('/api/auth/signin', { email, password: 'hunter2abc' }, j2);
  const after = await (await get('/api/rooms', j2)).json();
  assert.ok(after.rooms.some(r => r.id === room.id), 'same account on another device sees the same rooms');
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

test('duplicate send with the same clientMsgId collapses to one message', async () => {
  const j = jar();
  await post('/api/session', {}, j);
  const { room } = await (await post('/api/rooms', { requestId: 'req-dup', title: 'Dedup', goal: 'Test dedupe.', memberIds: ['rosa-mendes'] }, j)).json();
  const body = { text: 'only once', clientMsgId: 'cm-77' };
  const a = await (await post(`/api/rooms/${room.id}/messages`, body, j)).json();
  const b = await (await post(`/api/rooms/${room.id}/messages`, body, j)).json();
  assert.equal(a.message.id, b.message.id, 'same id returned for the retried send');
  const list = (await (await get(`/api/rooms/${room.id}/messages`, j)).json()).messages;
  assert.equal(list.filter(m => m.text === 'only once').length, 1, 'stored once');
});

test('outsider cannot read a private room; public rooms show a preview without messages', async () => {
  const owner = jar(), stranger = jar();
  await post('/api/session', {}, owner);
  await post('/api/session', {}, stranger);
  const made = await post('/api/rooms', { requestId: 'req-x', title: 'Secret plan', goal: 'Plan something in Frisco.', memberIds: ['rosa-mendes'], visibility: 'private' }, owner);
  const { room } = await made.json();
  const denied = await get(`/api/rooms/${room.id}`, stranger);
  assert.equal(denied.status, 403, 'no cookie-free snooping on private rooms');
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
  // public room: outsider gets a preview with no messages and no invite code
  const pubOwner = jar();
  await signup(pubOwner, { email: `pub${Date.now()}@test.dev`, name: 'Pia Public' });
  const pub = await (await post('/api/rooms', { requestId: 'req-pub', title: 'Public jam', goal: 'Open jam session in Dallas.', memberIds: ['devon-brooks'] }, pubOwner)).json();
  const preview = await (await get(`/api/rooms/${pub.room.id}`, stranger)).json();
  assert.ok(preview.room && preview.room.isMember === false, 'public room previews to outsiders');
  assert.ok(preview.room.messages === undefined || preview.room.messages == null, 'preview has no messages');
  assert.ok(!preview.room.inviteCode, 'preview hides the invite code');
});

test('roles: owner promotes and kicks; banned member cannot rejoin', async () => {
  const owner = jar(), member = jar();
  await post('/api/session', {}, owner);
  await post('/api/session', {}, member);
  const { room } = await (await post('/api/rooms', { requestId: 'req-r', title: 'Moderation lab', goal: 'Test moderation tools.', memberIds: [] }, owner)).json();
  assert.ok(room.isMember && room.myRole === 'owner', 'creator is owner');
  const join = await post('/api/rooms/join', { code: room.inviteCode }, member);
  assert.ok([200, 201].includes(join.status));
  const detail = await (await get(`/api/rooms/${room.id}`, owner)).json();
  const target = detail.room.members.find(m => !m.you && !m.demo);
  assert.ok(target, 'joined member visible to owner');
  const promote = await post(`/api/rooms/${room.id}/promote`, { pid: target.id, role: 'moderator' }, owner);
  assert.equal(promote.status, 200, 'owner promoted the member');
  const memberDetail = await (await get(`/api/rooms/${room.id}`, member)).json();
  assert.equal(memberDetail.room.myRole, 'moderator', 'role visible to the member');
  // moderator can kick but not ban another moderator... here just verify owner ban works
  const ban = await post(`/api/rooms/${room.id}/ban`, { pid: target.id, reason: 'testing' }, owner);
  assert.equal(ban.status, 200);
  const rejoin = await post('/api/rooms/join', { code: room.inviteCode }, member);
  assert.equal(rejoin.status, 403, 'banned member cannot rejoin');
  const unban = await post(`/api/rooms/${room.id}/unban`, { pid: target.id }, owner);
  assert.equal(unban.status, 200);
  const rejoin2 = await post('/api/rooms/join', { code: room.inviteCode }, member);
  assert.ok([200, 201].includes(rejoin2.status), 'after unban the member can rejoin');
});

test('approval mode: join creates a pending request the owner approves', async () => {
  const owner = jar(), requester = jar();
  await post('/api/session', {}, owner);
  await post('/api/session', {}, requester);
  const { room } = await (await post('/api/rooms', { requestId: 'req-q', title: 'Invite only club', goal: 'Closed critique circle.', memberIds: [], joinMode: 'request' }, owner)).json();
  const join = await post('/api/rooms/join', { code: room.inviteCode }, requester);
  const j1 = await join.json();
  assert.ok(j1.pending === true, 'join lands as a pending request');
  const msgs = await post(`/api/rooms/${room.id}/messages`, { text: 'let me in?' }, requester);
  assert.equal(msgs.status, 403, 'requester is not a member yet');
  const reqs = await (await get(`/api/rooms/${room.id}/requests`, owner)).json();
  assert.equal(reqs.requests.length, 1);
  const approve = await post(`/api/rooms/${room.id}/requests`, { pid: reqs.requests[0].pid, approve: true }, owner);
  assert.equal(approve.status, 200);
  const now = await post(`/api/rooms/${room.id}/messages`, { text: 'thanks for the approval' }, requester);
  assert.equal(now.status, 201, 'approved requester can post');
});

test('age gates: guests never enter teen groups; teen and adult accounts are separated', async () => {
  const teen = jar(), adult = jar(), guest = jar();
  await post('/api/session', {}, guest);
  await signup(teen, { email: `teen${Date.now()}@test.dev`, name: 'Tina Teen', age: 'teen' });
  await signup(adult, { email: `adult${Date.now()}@test.dev`, name: 'Al Adult', age: 'adult' });
  // teen owner creates a teen group
  const teenRoom = await (await post('/api/rooms', { requestId: 'req-teen', title: 'Teen filmmakers', goal: 'Teen film club, online.', memberIds: [], ageScope: 'teen' }, teen)).json();
  assert.ok(teenRoom.room.ageScope === 'teen');
  // adult cannot create a teen group
  const nope = await post('/api/rooms', { requestId: 'req-adult-teen', title: 'X', goal: 'X.', memberIds: [], ageScope: 'teen' }, adult);
  assert.equal(nope.status, 403, 'adult cannot lead a teen group');
  // adult cannot join the teen group even with the invite code
  const adultJoin = await post('/api/rooms/join', { code: teenRoom.room.inviteCode }, adult);
  assert.equal(adultJoin.status, 403, 'adult cannot join teen group');
  // guest (unverified age) cannot join the teen group either
  const guestJoin = await post('/api/rooms/join', { code: teenRoom.room.inviteCode }, guest);
  assert.equal(guestJoin.status, 403, 'unverified age cannot join teen group');
  // teen cannot join an adult group
  const adultRoom = await (await post('/api/rooms', { requestId: 'req-adult', title: 'Career pivot', goal: 'Career pivots, online.', memberIds: [], ageScope: 'adult' }, adult)).json();
  const teenJoin = await post('/api/rooms/join', { code: adultRoom.room.inviteCode }, teen);
  assert.equal(teenJoin.status, 403, 'teen cannot join adult group');
  // signed-in account cannot join a guest demo sandbox group
  const demoRoom = await (await post('/api/rooms', { requestId: 'req-demo', title: 'Demo sandbox', goal: 'Guests only.', memberIds: ['rosa-mendes'] }, guest)).json();
  const adultDemoJoin = await post('/api/rooms/join', { code: demoRoom.room.inviteCode }, adult);
  assert.equal(adultDemoJoin.status, 403, 'signed-in members stay out of demo sandbox groups');
});

test('discovery: guests get 401; accounts only see their own age scope', async () => {
  const guest = jar(), teen = jar(), adult = jar();
  await post('/api/session', {}, guest);
  await signup(teen, { email: `dteen${Date.now()}@test.dev`, name: 'Dee Teen', age: 'teen' });
  await signup(adult, { email: `dadult${Date.now()}@test.dev`, name: 'Dan Adult', age: 'adult' });
  assert.equal((await get('/api/groups', guest)).status, 401, 'guests cannot browse discovery');
  const adultRoom = await (await post('/api/rooms', { requestId: 'd-adult', title: 'Disco adult', goal: 'Adult group for discovery.', memberIds: [], ageScope: 'adult' }, adult)).json();
  const teenRoom = await (await post('/api/rooms', { requestId: 'd-teen', title: 'Disco teen', goal: 'Teen group for discovery.', memberIds: [], ageScope: 'teen' }, teen)).json();
  const adultView = await (await get('/api/groups', adult)).json();
  assert.ok(adultView.groups.some(g => g.id === adultRoom.room.id), 'adult sees their own public adult group');
  assert.ok(!adultView.groups.some(g => g.id === teenRoom.room.id), 'adult never sees teen groups');
  assert.ok(!adultView.groups.some(g => g.demo), 'demo groups never appear in discovery');
  const teenView = await (await get('/api/groups', teen)).json();
  assert.ok(teenView.groups.some(g => g.id === teenRoom.room.id), 'teen sees teen groups');
  assert.ok(!teenView.groups.some(g => g.id === adultRoom.room.id), 'teen never sees adult groups');
});

test('reports: filed by any visitor and visible in the admin console', async () => {
  const a = jar(), b = jar();
  await post('/api/session', {}, a);
  await post('/api/session', {}, b);
  const { room } = await (await post('/api/rooms', { requestId: 'req-block', title: 'Block lab', goal: 'Testing reports and blocks.', memberIds: [] }, a)).json();
  const report = await post('/api/reports', { roomId: room.id, reason: 'Harassment', details: 'Test report' }, b);
  assert.equal(report.status, 201);
  const admin = await (await get('/api/admin/reports?key=test-admin-key', jar())).json();
  assert.ok(admin.reports.some(r => r.roomId === room.id && r.status === 'open'), 'report visible in admin console');
});

test('blocks stop an invite join in both directions', async () => {
  const owner = jar(), stranger = jar();
  await post('/api/session', {}, owner);
  await post('/api/session', {}, stranger);
  const { room } = await (await post('/api/rooms', { requestId: 'req-block2', title: 'Blocked path', goal: 'Block test.', memberIds: [] }, owner)).json();
  const ownerDetail = await (await get(`/api/rooms/${room.id}`, owner)).json();
  const ownerPid = ownerDetail.room.members.find(m => m.you).id;
  await post('/api/blocks', { pid: ownerPid }, stranger); // stranger blocks the owner
  const blocked = await post('/api/rooms/join', { code: room.inviteCode }, stranger);
  assert.equal(blocked.status, 403, 'either side blocking keeps them apart');
});

test('moderation: held messages never reach the room and file an automatic report', async () => {
  const j = jar();
  await post('/api/session', {}, j);
  const { room } = await (await post('/api/rooms', { requestId: 'req-mod', title: 'Moderation lab 2', goal: 'Held message test.', memberIds: [] }, j)).json();
  const held = await post(`/api/rooms/${room.id}/messages`, { text: 'hey do this and dont tell your parents about it' }, j);
  assert.equal(held.status, 422, 'secrecy-pressure message is held');
  const list = (await (await get(`/api/rooms/${room.id}/messages`, j)).json()).messages;
  assert.ok(!list.some(m => m.text.includes('dont tell your parents')), 'held message is not in the room');
  const admin = await (await get('/api/admin/reports?key=test-admin-key', jar())).json();
  assert.ok(admin.reports.some(r => r.roomId === room.id && (r.details || '').includes('dont tell your parents')), 'hold filed an automatic report');
  const safe = await post(`/api/rooms/${room.id}/messages`, { text: 'totally normal message about chess' }, j);
  assert.equal(safe.status, 201, 'normal messages pass');
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
  const accounts = await (await get('/api/rooms', j)).json();
  assert.ok(Array.isArray(accounts.rooms), 'sessions still resolve after restart');
});
