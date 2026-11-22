'use strict';
// Account names and AI status, against a real server on a database prepared the way an earlier
// build left it: one account whose stored name is its password. Covers the sign-in repair, the
// refusal of password-shaped names, and the status states an admin sees when AI is half set up.
const test = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const auth = require('../lib/auth');

const PORT = 3996;
const BASE = `http://127.0.0.1:${PORT}`;
const OLD_PASSWORD = 'Sunny2026x';
const EMAIL = 'old.name@example.com';

const dbFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'knot-auth-')), 'db.json');
fs.writeFileSync(dbFile, JSON.stringify({
  users: [], rooms: [], bans: [], joinRequests: [], reports: [], blocks: [], modActions: [], aiUsage: [],
  accounts: [{
    id: '11111111-1111-4111-8111-111111111111', email: EMAIL, passwordHash: auth.hashPassword(OLD_PASSWORD), name: OLD_PASSWORD,
    ageCategory: 'adult', deleted: false, createdAt: new Date().toISOString(), bio: '', interests: [], skills: [], goals: '',
    city: '', availability: [], mode: 'both', avatar: null, avatarStatus: null
  }]
}));

let child;
function startServer() {
  // A key with no model is the half-set-up case: AI must say so, and no network call is made for it.
  child = spawn('node', ['server.js'], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, PORT: String(PORT), KNOT_DB_PATH: dbFile, OPENAI_API_KEY: 'sk-test-not-real', OPENAI_MODEL: '', OPENAI_FAST_MODEL: '', GROQ_API_KEY: '', KNOT_AUTH_RATE_MAX: '100' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('server did not start')), 8000);
    const tryFetch = async () => {
      try { const r = await fetch(BASE + '/api/status'); if (r.ok) { clearTimeout(t); resolve(); } }
      catch { setTimeout(tryFetch, 150); }
    };
    tryFetch();
  });
}
test.before(startServer);
test.after(async () => { if (child) { child.kill(); await new Promise(r => child.on('exit', r)); } });

function jar() {
  let sid = null;
  return {
    header: () => sid ? { cookie: sid } : {},
    absorb: res => { const c = res.headers.get('set-cookie'); if (c) sid = c.split(';')[0]; }
  };
}
const post = async (p, body, j) => { const r = await fetch(BASE + p, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(j ? j.header() : {}) }, body: JSON.stringify(body) }); if (j) j.absorb(r); return r; };
const patch = async (p, body, j) => { const r = await fetch(BASE + p, { method: 'PATCH', headers: { 'Content-Type': 'application/json', ...(j ? j.header() : {}) }, body: JSON.stringify(body) }); if (j) j.absorb(r); return r; };
const get = async (p, j) => { const r = await fetch(BASE + p, { headers: j ? j.header() : {} }); if (j) j.absorb(r); return r; };

test('sign-in repairs an account whose name is its password, then leaves it alone', async () => {
  const j = jar();
  const r = await post('/api/auth/signin', { email: EMAIL, password: OLD_PASSWORD }, j);
  assert.equal(r.status, 200);
  const out = await r.json();
  assert.equal(out.nameReset, true, 'the reset is reported so the profile opens');
  assert.equal(out.name, 'old.name', 'the name becomes the email first part');
  assert.notEqual(out.name, OLD_PASSWORD);
  const again = await (await post('/api/auth/signin', { email: EMAIL, password: OLD_PASSWORD }, jar())).json();
  assert.equal(again.nameReset, undefined, 'a second sign-in does not reset it again');
  assert.equal(again.name, 'old.name');
  assert.equal((await (await get('/api/auth/me', j)).json()).name, 'old.name');
});

test('sign-up refuses names that are the password, contain it, or are the email', async () => {
  const pw = 'Maple2026q';
  const tryName = name => post('/api/auth/signup', { email: `n${Math.random().toString(36).slice(2)}@test.dev`, password: pw, name, confirm18: true }, jar());
  const same = await tryName(pw);
  assert.equal(same.status, 400);
  assert.match((await same.json()).error, /cannot be your password/);
  const contains = await tryName('my' + pw + 'x');
  assert.equal(contains.status, 400, 'a name that contains the password is refused');
  const emailName = await post('/api/auth/signup', { email: 'justme@test.dev', password: pw, name: 'justme', confirm18: true }, jar());
  assert.equal(emailName.status, 400);
  assert.match((await emailName.json()).error, /email address/);
  const noLetters = await tryName('1234');
  assert.equal(noLetters.status, 400);
  assert.match((await noLetters.json()).error, /at least one letter/);
  const fine = await post('/api/auth/signup', { email: `ok${Math.random().toString(36).slice(2)}@test.dev`, password: pw, name: 'Ada Lovelace', confirm18: true }, jar());
  assert.equal(fine.status, 201);
});

test('profile save refuses a new name equal to the stored password', async () => {
  const j = jar();
  const pw = 'Cedar2026z';
  const created = await post('/api/auth/signup', { email: `p${Math.random().toString(36).slice(2)}@test.dev`, password: pw, name: 'Priya Test', confirm18: true }, j);
  assert.equal(created.status, 201);
  const refused = await patch('/api/auth/me', { name: pw }, j);
  assert.equal(refused.status, 400, 'the password cannot become the display name later either');
  assert.match((await refused.json()).error, /cannot be your password/);
  const ok = await patch('/api/auth/me', { name: 'Priya T' }, j);
  assert.equal(ok.status, 200);
  assert.equal((await ok.json()).name, 'Priya T');
});

test('status reports a key with no model as no-model, and says AI is not ready', async () => {
  const s = await (await get('/api/status')).json();
  assert.equal(s.ai, false, 'a key alone does not count as AI being ready');
  assert.equal(s.aiState, 'no-model');
  assert.equal(s.aiProvider, 'openai');
});
