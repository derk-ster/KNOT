'use strict';
// End-to-end API tests against a real server process with an isolated JSON database.
// Covers the demo-critical rules: identity comes from the session, accounts attach cross-device,
// groups persist, dedupe works, outsiders cannot read rooms, roles/bans/blocks/age gates hold,
// held messages never reach a room, and duplicate sends collapse.
const test = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const http = require('node:http');
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

async function signup(j, { email, name, password = 'hunter2abc', interests } = {}) {
  const r = await post('/api/auth/signup', { email: email || `u${Math.random().toString(36).slice(2)}@test.dev`, password, name: name || 'Test User', confirm18: true, interests }, j);
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

test('signup: 18+ confirmation required, account is always adult', async () => {
  const j = jar();
  const noBox = await post('/api/auth/signup', { email: `no18-${Date.now()}@test.dev`, password: 'hunter2abc', name: 'No Box' }, jar());
  assert.equal(noBox.status, 400, 'signup without the 18+ box is rejected');
  assert.match((await noBox.json()).error, /18 and over/);
  // the server always stores an adult account; a claimed ageCategory is ignored
  const me = await signup(j, { name: 'Ana Adult' });
  assert.ok(me.signedIn && me.ageCategory === 'adult');
  assert.ok(!(await (await get('/api/auth/me', j)).json()).isGuest);
});

test('signup: rejects bad passwords and duplicate emails; sign-in works', async () => {
  const j = jar();
  const email = `acc${Date.now()}@test.dev`;
  await signup(j, { email, name: 'Ana Adult' });
  const badPw = await post('/api/auth/signup', { email: `x${Date.now()}@test.dev`, password: 'short', name: 'X', confirm18: true }, jar());
  assert.equal(badPw.status, 400, 'weak password rejected');
  // A duplicate email with the wrong password is still refused: nothing is revealed about the
  // account, and pressing Create twice never signs someone into an account that is not theirs.
  const dup = await post('/api/auth/signup', { email, password: 'notthepass99', name: 'Ana Adult', confirm18: true }, jar());
  assert.equal(dup.status, 409, 'duplicate email rejected');
  // Pressing Create again with the password that already owns the account lands in the app
  // instead of a dead end.
  const again = await post('/api/auth/signup', { email, password: 'hunter2abc', name: 'Ana Adult', confirm18: true }, jar());
  assert.equal(again.status, 200, 'pressing Create again signs the owner in');
  assert.equal((await again.json()).signedIn, true);
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
  const people = room.members.filter(m => !m.ai);
  assert.ok(!duplicate && room.inviteCode && people.length === 2);
  assert.ok(people[0].you === true, 'creator marked as you');
  assert.ok(people[1].demo === true, 'fictional profile tagged demo');
  // KNOT AI is listed with the members but is not one: no demo tag, not you, takes no capacity.
  const ai = room.members.find(m => m.ai);
  assert.ok(ai && ai.name === 'KNOT AI' && ai.demo === false && ai.you === false, 'KNOT AI is listed as the helper');
  assert.equal(room.capacityUsed, 2, 'the helper never takes a seat');
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

test('demo profiles answer in a sandbox group, always tagged demo', async () => {
  const j = jar();
  await post('/api/session', {}, j);
  const { room } = await (await post('/api/rooms', { requestId: 'req-bot', title: 'Chess night', goal: 'Start a chess club in Plano.', memberIds: ['kai-nakamura', 'maya-okafor'] }, j)).json();
  const r = await post(`/api/rooms/${room.id}/messages`, { text: 'Hi everyone, when should we meet?' }, j);
  assert.equal(r.status, 201);
  const { replies } = await r.json();
  assert.ok(Array.isArray(replies) && replies.length === 1, 'exactly one demo profile answers');
  const bot = replies[0];
  assert.equal(bot.kind, 'demo', 'the reply is stored as a demo message');
  assert.ok(room.members.some(m => m.demo && m.name === bot.authorName), 'the speaker is one of the room demo profiles');
  assert.ok(bot.text.length > 10, 'the reply says something');
  const list = (await (await get(`/api/rooms/${room.id}/messages`, j)).json()).messages;
  assert.ok(list.some(m => m.id === bot.id && m.kind === 'demo'), 'the demo line is persisted with its tag');
  const r2 = await post(`/api/rooms/${room.id}/messages`, { text: 'I can bring a board.' }, j);
  const { replies: second } = await r2.json();
  assert.equal(second.length, 1);
  assert.notEqual(second[0].authorName, bot.authorName, 'the other demo profile takes the next turn');
});

test('a group with no demo profiles gets no reply on the member behalf', async () => {
  const j = jar();
  await signup(j, { name: 'Real Owner' });
  const { room } = await (await post('/api/rooms', { requestId: 'req-real', title: 'Real group', goal: 'A real group with real people.', memberIds: [] }, j)).json();
  const r = await post(`/api/rooms/${room.id}/messages`, { text: 'hello' }, j);
  assert.equal(r.status, 201);
  const body = await r.json();
  assert.deepEqual(body.replies, [], 'no demo members means no demo reply');
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

test('age scope: accounts are adults; guests stay out of real groups, members out of demo sandboxes', async () => {
  const adult = jar(), guest = jar();
  await post('/api/session', {}, guest);
  await signup(adult, { email: `adult${Date.now()}@test.dev`, name: 'Al Adult' });
  // an adult cannot lead a teen group
  const nope = await post('/api/rooms', { requestId: 'req-adult-teen', title: 'X', goal: 'X.', memberIds: [], ageScope: 'teen' }, adult);
  assert.equal(nope.status, 403, 'adult cannot lead a teen group');
  // guest (no verified age) cannot join an adult group even with the invite code
  const adultRoom = await (await post('/api/rooms', { requestId: 'req-adult', title: 'Career pivot', goal: 'Career pivots, online.', memberIds: [], ageScope: 'adult' }, adult)).json();
  const guestJoin = await post('/api/rooms/join', { code: adultRoom.room.inviteCode }, guest);
  assert.equal(guestJoin.status, 403, 'unverified age cannot join a real group');
  // signed-in account cannot join a guest demo sandbox group
  const demoRoom = await (await post('/api/rooms', { requestId: 'req-demo', title: 'Demo sandbox', goal: 'Guests only.', memberIds: ['rosa-mendes'] }, guest)).json();
  const adultDemoJoin = await post('/api/rooms/join', { code: demoRoom.room.inviteCode }, adult);
  assert.equal(adultDemoJoin.status, 403, 'signed-in members stay out of demo sandbox groups');
});

test('discovery: guests get 401; accounts see real public groups, never demo sandboxes', async () => {
  const guest = jar(), adult = jar();
  await post('/api/session', {}, guest);
  await signup(adult, { email: `dadult${Date.now()}@test.dev`, name: 'Dan Adult' });
  assert.equal((await get('/api/groups', guest)).status, 401, 'guests cannot browse discovery');
  const adultRoom = await (await post('/api/rooms', { requestId: 'd-adult', title: 'Disco crew', goal: 'Public group for discovery.', memberIds: [], ageScope: 'adult' }, adult)).json();
  const ownView = await (await get('/api/groups', adult)).json();
  assert.ok(!ownView.groups.some(g => g.id === adultRoom.room.id), 'your own group is not offered back to you as one to join');
  const browser = jar();
  await signup(browser, { email: `dbrowse${Date.now()}@test.dev`, name: 'Bea Browser' });
  const adultView = await (await get('/api/groups', browser)).json();
  assert.ok(adultView.groups.some(g => g.id === adultRoom.room.id), 'another account sees it as joinable');
  assert.ok(!adultView.groups.some(g => g.demo), 'demo groups never appear in discovery');
  const guestDemo = await (await post('/api/rooms', { requestId: 'd-demo', title: 'Sandbox', goal: 'Guest demo group.', memberIds: ['maya-okafor'] }, guest)).json();
  assert.ok(guestDemo.room.demo === true);
  assert.ok(!adultView.groups.some(g => g.id === guestDemo.room.id), 'guest sandbox stays out of discovery');
});

test('discovery lists groups you could join, never the ones you are already in', async () => {
  const owner = jar(), other = jar();
  await signup(owner, { name: 'Owner One' });
  await signup(other, { name: 'Owner Two' });
  const mine = (await (await post('/api/rooms', { requestId: 'req-join-1', title: 'Mine to own', goal: 'A group I own.', memberIds: [] }, owner)).json()).room;
  const theirs = (await (await post('/api/rooms', { requestId: 'req-join-2', title: 'Theirs to join', goal: 'A group to join.', memberIds: [] }, other)).json()).room;
  const seenByOwner = (await (await get('/api/groups', owner)).json()).groups;
  assert.ok(seenByOwner.some(g => g.id === theirs.id), 'another member public group is listed');
  assert.ok(!seenByOwner.some(g => g.id === mine.id), 'your own group is not listed as one to join');
  const seenByOther = (await (await get('/api/groups', other)).json()).groups;
  assert.ok(seenByOther.some(g => g.id === mine.id));
  assert.ok(!seenByOther.some(g => g.id === theirs.id));
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

test('profiles: PATCH saves optional fields, validates skills, clips interests to three', async () => {
  const j = jar();
  await signup(j, { name: 'Priya Profile', interests: ['chess', 'running'] });
  const me = await patch('/api/auth/me', {
    bio: 'Editor and runner in Plano.',
    interests: ['chess', 'running', 'film', 'baking'],   // one too many
    skills: ['video-editing', 'made-up-skill-xyz'],      // one invalid id
    goals: 'Finish a short film this spring.',
    city: 'Plano',
    availability: ['saturday', 'sunday'],
    mode: 'in-person'
  }, j);
  assert.equal(me.status, 200);
  const body = await me.json();
  assert.equal(body.profile.bio, 'Editor and runner in Plano.');
  assert.equal(body.profile.interests.length, 3, 'interests clipped to three');
  assert.deepEqual(body.profile.skills, ['video-editing'], 'invalid skill ids dropped');
  assert.ok(body.profile.skillLabels.length === 1 && body.profile.skillLabels[0] !== 'video-editing', 'skill labels exposed, not raw ids');
  assert.equal(body.profile.city, 'Plano');
  assert.deepEqual(body.profile.availability, ['saturday', 'sunday']);
  assert.equal(body.profile.mode, 'in-person');
  // a fresh read shows the same stored profile
  const again = await (await get('/api/auth/me', j)).json();
  assert.equal(again.profile.goals, 'Finish a short film this spring.');
});

test('avatars: valid PNG stored, wrong type and fake bytes rejected, size capped', async () => {
  const j = jar();
  await signup(j, { name: 'Avi Avatar' });
  // 1x1 transparent PNG
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
  const ok = await post('/api/auth/avatar', { image: png }, j);
  assert.equal(ok.status, 200, 'valid PNG accepted');
  const stored = await ok.json();
  assert.ok(stored.profile.avatar && stored.profile.avatar.startsWith('data:image/png'), 'picture stored on the profile');
  assert.ok(['approved', 'pending'].includes(stored.profile.avatarStatus), 'status is approved or pending when the AI check is unavailable');
  // guests cannot upload
  const guest = await post('/api/auth/avatar', { image: png }, jar());
  assert.equal(guest.status, 401, 'guests cannot set a profile picture');
  // wrong mime type
  const badType = await post('/api/auth/avatar', { image: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=' }, j);
  assert.equal(badType.status, 400, 'only PNG, JPEG and WebP are allowed');
  // claims PNG but the bytes are not a PNG
  const fake = 'data:image/png;base64,' + Buffer.from('this is definitely not a png file').toString('base64');
  const badMagic = await post('/api/auth/avatar', { image: fake }, j);
  assert.equal(badMagic.status, 400, 'magic bytes must match the claimed type');
  // over 400 KB
  const big = 'data:image/png;base64,iVBORw0KGgo' + 'A'.repeat(600000);
  const tooBig = await post('/api/auth/avatar', { image: big }, j);
  assert.equal(tooBig.status, 413, 'oversized pictures rejected');
});

test('people search: accounts only, matches stored fields, never returns the viewer', async () => {
  const guest = jar(), seeker = jar(), target = jar();
  await post('/api/session', {}, guest);
  await signup(seeker, { name: 'Sam Seeker' });
  await signup(target, { name: 'Talia Target' });
  await patch('/api/auth/me', { bio: 'Ukulele player and film nerd in Austin.', skills: ['guitar'], interests: ['ukulele', 'film'], goals: 'Play a live show.' }, target);
  assert.equal((await get('/api/people', guest)).status, 401, 'guests cannot search members');
  const empty = await (await get('/api/people', seeker)).json();
  assert.ok(empty.people.length >= 1, 'the target is visible');
  const found = empty.people.find(p => p.name === 'Talia Target');
  assert.ok(found, 'other members appear in search');
  assert.ok(found.skillLabels.length > 0, 'stored skills are exposed as labels');
  assert.ok(found.interests.includes('ukulele'), 'stored interests are exposed');
  assert.ok(!('passwordHash' in found) && !('email' in found), 'no credentials or email leak in people results');
  assert.ok(!empty.people.some(p => p.name === 'Sam Seeker'), 'the viewer never sees themselves');
  const byQuery = await (await get('/api/people?q=ukulele', seeker)).json();
  assert.ok(byQuery.people.some(p => p.name === 'Talia Target'), 'query filters by stored fields');
  const miss = await (await get('/api/people?q=underwater-basket-weaving', seeker)).json();
  assert.equal(miss.people.length, 0, 'no invented people');
});

test('group text: descriptions are moderated, held group names are never created', async () => {
  const j = jar();
  await signup(j, { name: 'Maddie Mod' });
  const held = await post('/api/rooms', { requestId: 'req-desc-hold', title: 'Sneaky club', goal: 'Make things.', memberIds: [], description: 'hey do this and dont tell your parents about it' }, j);
  assert.equal(held.status, 422, 'group with a held description is not created');
  const list = await (await get('/api/rooms', j)).json();
  assert.ok(!list.rooms.some(r => r.title === 'Sneaky club'), 'the held group does not exist');
  const ok = await post('/api/rooms', { requestId: 'req-desc-ok', title: 'Board game night', goal: 'Weekly board games in Plano.', memberIds: [], description: 'Casual weekly meetups, all skill levels.' }, j);
  assert.equal(ok.status, 201);
  const viewer = jar();
  await signup(viewer, { name: 'Bea Viewer' });
  const pub = await (await get('/api/groups', viewer)).json();
  const found = pub.groups.find(g => g.title === 'Board game night');
  assert.ok(found && found.description === 'Casual weekly meetups, all skill levels.', 'description shows in discovery');
});

test('room settings: AI stays off by default and can switch to on-demand, never auto for guests', async () => {
  const j = jar();
  await signup(j, { name: 'Ollie Owner' });
  const { room } = await (await post('/api/rooms', { requestId: 'req-ai', title: 'AI switch lab', goal: 'Test the assistant switch.', memberIds: [] }, j)).json();
  assert.equal(room.aiMode, 'off', 'new groups start with AI off');
  // The room's /ai command is turned into this flag by the client, so no slash syntax reaches here.
  const askOff = await post(`/api/rooms/${room.id}/messages`, { text: 'what should we do?', askAi: true }, j);
  assert.equal(askOff.status, 403, 'assistant cannot be invoked while off');
  const set = await patch(`/api/rooms/${room.id}`, { aiMode: 'on-demand' }, j);
  assert.equal(set.status, 200);
  assert.equal((await set.json()).room.aiMode, 'on-demand');
  // Asking once the room allows it posts the member's own words, with no slash and no "assistant" kind
  // from the client. With no model configured the helper still answers from the room's own stored
  // profiles, because a question that gets typing dots and then silence is the bug people notice.
  const askOn = await post(`/api/rooms/${room.id}/messages`, { text: 'who can edit?', askAi: true }, j);
  assert.equal(askOn.status, 201);
  const asked = await askOn.json();
  assert.equal(asked.message.text, 'who can edit?', 'the question posts as a plain member message');
  assert.equal(asked.message.kind, 'user', 'the client cannot make its own message an assistant line');
  const answer = (asked.replies || []).find(m => m.kind === 'assistant');
  assert.ok(answer, 'asking KNOT AI always gets an answer back in the same response');
  assert.equal(answer.authorName, 'KNOT AI');
  assert.ok(answer.text && answer.text.length > 20, 'the answer is a real sentence, not a placeholder');
  const after = (await (await get(`/api/rooms/${room.id}/messages`, j)).json()).messages;
  assert.ok(after.every(m => m.kind !== 'assistant' || m.authorName === 'KNOT AI'), 'only KNOT AI can post assistant lines');
  assert.equal(after.filter(m => m.kind === 'assistant').length, 1, 'one question gets exactly one answer');
  // A second question is answered differently: the helper does not hand back the line it just used.
  const again = await (await post(`/api/rooms/${room.id}/messages`, { text: 'when can we meet?', askAi: true }, j)).json();
  const second = (again.replies || []).find(m => m.kind === 'assistant');
  assert.ok(second && second.text !== answer.text, 'the second answer is not the first one again');
  // a member (not a moderator) cannot change settings
  const member = jar();
  await signup(member, { name: 'Mia Member' });
  await post('/api/rooms/join', { code: room.inviteCode }, member);
  const denied = await patch(`/api/rooms/${room.id}`, { aiMode: 'off' }, member);
  assert.ok([403, 404].includes(denied.status), 'members cannot change group settings');
});

test('messages: a client cannot post as KNOT AI', async () => {
  const j = jar();
  await post('/api/session', {}, j);
  const { room } = await (await post('/api/rooms', { requestId: 'req-kind', title: 'Kind lab', goal: 'Assistant impersonation test.', memberIds: [] }, j)).json();
  const r = await post(`/api/rooms/${room.id}/messages`, { text: 'pretending to be the assistant', kind: 'assistant' }, j);
  assert.equal(r.status, 201);
  const { message } = await r.json();
  assert.equal(message.kind, 'user', 'kind is stamped by the server, never taken from the body');
  const list = (await (await get(`/api/rooms/${room.id}/messages`, j)).json()).messages;
  assert.ok(!list.some(m => m.kind === 'assistant'), 'no assistant-kind message was ever stored');
  assert.ok(list.some(m => m.text === 'pretending to be the assistant' && m.kind === 'user'), 'the message posted as an ordinary member message');
});

test('typing: members see each other typing, never themselves, and outsiders see nothing', async () => {
  const owner = jar();
  await post('/api/session', {}, owner);
  const { room } = await (await post('/api/rooms', { requestId: 'req-type', title: 'Typing lab', goal: 'Show who is typing.', memberIds: [] }, owner)).json();
  const other = jar();
  await post('/api/session', {}, other);
  const joined = await (await post('/api/rooms/join', { code: room.inviteCode }, other)).json();
  assert.equal(joined.room.id, room.id);
  // nobody is typing in a fresh room
  const quiet = await (await get(`/api/rooms/${room.id}/typing`, owner)).json();
  assert.deepEqual(quiet.typing, []);
  // the second member starts typing: the owner sees their name, they do not see themselves
  assert.equal((await post(`/api/rooms/${room.id}/typing`, { typing: true }, other)).status, 200);
  const seen = await (await get(`/api/rooms/${room.id}/typing`, owner)).json();
  assert.equal(seen.typing.length, 1);
  assert.ok(seen.typing[0].name, 'the typing note carries a name from the session');
  assert.deepEqual((await (await get(`/api/rooms/${room.id}/typing`, other)).json()).typing, [], 'you never see yourself typing');
  // stopping clears it
  await post(`/api/rooms/${room.id}/typing`, { typing: false }, other);
  assert.deepEqual((await (await get(`/api/rooms/${room.id}/typing`, owner)).json()).typing, []);
  // a name in the body is ignored: presence comes from the session
  await post(`/api/rooms/${room.id}/typing`, { typing: true, name: 'NotMe' }, other);
  const named = await (await get(`/api/rooms/${room.id}/typing`, owner)).json();
  assert.ok(!named.typing.some(t => t.name === 'NotMe'), 'a client cannot claim another name');
  await post(`/api/rooms/${room.id}/typing`, { typing: false }, other);
  // KNOT AI is a helper, not a member: it can never be kicked, banned or promoted
  const ai = (await (await get(`/api/rooms/${room.id}`, owner)).json()).room.members.find(m => m.ai);
  assert.ok(ai && ai.id === 'knot-ai');
  for (const action of ['kick', 'ban', 'promote', 'transfer']) {
    const r = await post(`/api/rooms/${room.id}/${action}`, { pid: 'knot-ai' }, owner);
    assert.equal(r.status, 400, action + ' on KNOT AI is refused');
    assert.match((await r.json()).error, /helper/i, 'the refusal explains what KNOT AI is');
  }
  // muting is a group setting, saved on the server, and the helper stays listed
  const muted = await (await patch(`/api/rooms/${room.id}`, { aiMode: 'off' }, owner)).json();
  assert.equal(muted.room.aiMode, 'off');
  assert.ok(muted.room.members.some(m => m.ai), 'a muted helper is still listed for the client');
});

test('help bot: a guest is pointed at sign in, a member is offered the page', async () => {
  const guest = jar();
  const ask = async (j, q, context) => (await post('/api/ai/help', { history: [{ role: 'user', content: q }], context }, j)).json();
  const groups = await ask(guest, 'where are my groups?');
  assert.match(groups.reply, /free account/i, 'a guest hears what a guest can actually do');
  assert.equal(groups.action, 'none', 'never offers a page a guest cannot open');
  assert.equal(groups.highlight, 'auth', 'points at the sign-in button instead');
  // the answer is the bot's own sentence, not one fixed line for every question
  const other = await ask(guest, 'how do I sign in?');
  assert.notEqual(other.reply, groups.reply, 'two questions get two answers');
  assert.match(other.reply, /Sign in/);
  // signed in, the same question offers the page and keeps its own wording
  const member = jar();
  await signup(member, { name: 'Help Member' });
  const mine = await ask(member, 'where are my groups?');
  assert.equal(mine.action, 'groups');
  assert.equal(mine.hash, '#/groups');
  assert.ok(!/free account/i.test(mine.reply), 'a member is not told to sign in');
  // the app's own state still answers "what next" exactly, with a control to ring
  const next = await ask(guest, 'what do I do next?', { next: { target: 'auth' } });
  assert.equal(next.source, 'app');
  assert.equal(next.highlight, 'auth');
});

test('messages: a picture posts with the message, junk pictures are refused', async () => {
  const j = jar();
  await post('/api/session', {}, j);
  const { room } = await (await post('/api/rooms', { requestId: 'req-pic', title: 'Photo lab', goal: 'Share pictures with the group.', memberIds: [] }, j)).json();
  // A real PNG signature, so the magic-byte check passes. No model is configured here, so the
  // image moderation step is a no-op and the picture is accepted.
  const png = 'data:image/png;base64,' + Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0, 0, 0]).toString('base64');
  const ok = await post(`/api/rooms/${room.id}/messages`, { text: '', image: png }, j);
  assert.equal(ok.status, 201, 'a picture on its own is a message');
  const { message } = await ok.json();
  assert.equal(message.image, png);
  assert.equal(message.kind, 'user', 'a picture still posts as the member');
  assert.equal(message.authorName, (await (await get('/api/auth/me', j)).json()).name, 'the author is the session, not the picture');
  // not a data URL, and a data URL that is not really a picture
  assert.equal((await post(`/api/rooms/${room.id}/messages`, { image: 'https://example.com/x.png' }, j)).status, 400);
  assert.equal((await post(`/api/rooms/${room.id}/messages`, { image: 'data:image/png;base64,bm90YXBpY3R1cmU=' }, j)).status, 400);
  // a picture and a caption both land on the same message
  const both = await (await post(`/api/rooms/${room.id}/messages`, { text: 'the poster', image: png }, j)).json();
  assert.equal(both.message.text, 'the poster');
  assert.equal(both.message.image, png);
  // an empty message is still refused
  assert.equal((await post(`/api/rooms/${room.id}/messages`, { text: '' }, j)).status, 400);
  const list = (await (await get(`/api/rooms/${room.id}/messages`, j)).json()).messages;
  assert.equal(list.filter(m => m.image === png).length, 2, 'pictures are stored with their messages');
});

test('profile PATCH: held text in name, city or interests is never saved', async () => {
  const j = jar();
  await signup(j, { name: 'Norm Patch' });
  const bad = 'hey do this and dont tell your parents about it';
  for (const fields of [{ name: bad }, { city: bad }, { interests: ['chess', 'dont tell your parents about it'] }]) {
    const held = await patch('/api/auth/me', fields, j);
    assert.equal(held.status, 422, 'PATCH with policy-violating text is held: ' + JSON.stringify(fields));
  }
  const me = await (await get('/api/auth/me', j)).json();
  assert.equal(me.name, 'Norm Patch', 'held name never replaced the stored one');
  assert.deepEqual(me.profile.interests, [], 'held interests never saved');
  assert.ok(!me.profile.city, 'held city never saved');
  const ok = await patch('/api/auth/me', { city: 'Plano', interests: ['chess'] }, j);
  assert.equal(ok.status, 200, 'clean profile text still saves');
  // the guest rename branch of the same endpoint is moderated too
  const guest = jar();
  await post('/api/session', {}, guest);
  const heldGuest = await patch('/api/auth/me', { name: bad }, guest);
  assert.equal(heldGuest.status, 422, 'guests cannot set a held display name');
  const okGuest = await patch('/api/auth/me', { name: 'Friendly Guest' }, guest);
  assert.equal(okGuest.status, 200, 'clean guest names still save');
  assert.equal((await okGuest.json()).name, 'Friendly Guest');
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

// Runs the real handler in this process with the OpenAI endpoint stubbed, so the finder route
// reaches its people enrichment with a deterministic goal. Guests must never get real profiles.
test('AI Finder: guests get no real member profiles, signed-in members do', async () => {
  const ENV_KEYS = ['OPENAI_API_KEY', 'OPENAI_MODEL', 'OPENAI_FAST_MODEL', 'GROQ_API_KEY', 'DATABASE_URL', 'KNOT_DB_PATH'];
  const saved = ENV_KEYS.map(k => [k, process.env[k]]);
  const realFetch = global.fetch;
  const finderDb = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'knot-finder-')), 'db.json');
  process.env.OPENAI_API_KEY = 'test-key';
  process.env.OPENAI_MODEL = 'gpt-test';
  process.env.OPENAI_FAST_MODEL = 'gpt-fast-test';
  process.env.GROQ_API_KEY = '';
  process.env.DATABASE_URL = ''; // force the local JSON store at the temp path
  process.env.KNOT_DB_PATH = finderDb;
  global.fetch = (url, opts) => {
    if (!String(url).startsWith('https://api.openai.com/')) return realFetch(url, opts);
    const body = { choices: [{ message: { content: JSON.stringify({ reply: 'Checking matches for you.', goal: 'I need someone who can play guitar with me.' }) } }], usage: { prompt_tokens: 10, completion_tokens: 20 } };
    return Promise.resolve({ ok: true, json: async () => body });
  };
  const serverModule = require('../server.js');
  const srv = http.createServer(serverModule.handler);
  try {
    await new Promise(r => srv.listen(0, '127.0.0.1', r));
    const base = `http://127.0.0.1:${srv.address().port}`;
    const client = () => { let sid = null; return async (method, p, body) => {
      const r = await realFetch(base + p, { method, headers: { 'Content-Type': 'application/json', ...(sid ? { cookie: sid } : {}) }, body: body ? JSON.stringify(body) : undefined });
      const c = r.headers.get('set-cookie'); if (c) sid = c.split(';')[0];
      return r;
    }; };
    // a member whose stored profile matches the goal the stub will return
    const guitarist = client();
    await (await guitarist('POST', '/api/auth/signup', { email: `gig${Date.now()}@test.dev`, password: 'hunter2abc', name: 'Gigi Guitarist', confirm18: true })).json();
    await guitarist('PATCH', '/api/auth/me', { skills: ['guitar'] });
    const finderBody = { history: [{ role: 'user', content: 'I want to learn guitar.' }] };
    // guest: no real people, ever, but the demo-profile matches are untouched
    const guest = client();
    const g = await (await guest('POST', '/api/ai/finder', finderBody)).json();
    assert.ok(g.result, 'finder returns a result');
    assert.deepEqual(g.result.people, [], 'guests never receive real member profiles');
    assert.ok(g.result.results.length >= 1, 'demo-profile matches still work for guests');
    // another signed-in member does see the real guitarist
    const member = client();
    await (await member('POST', '/api/auth/signup', { email: `mem${Date.now()}@test.dev`, password: 'hunter2abc', name: 'Vera Viewer', confirm18: true })).json();
    const m = await (await member('POST', '/api/ai/finder', finderBody)).json();
    assert.ok(m.result.people.some(p => p.name === 'Gigi Guitarist' && p.real === true), 'signed-in members still get real people');
  }
  finally {
    await new Promise(r => srv.close(r));
    global.fetch = realFetch;
    for (const [k, v] of saved) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
    for (const p of ['../server.js', '../lib/store.js']) delete require.cache[require.resolve(p)];
  }
});
