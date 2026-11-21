'use strict';
// KNOT server: static files + JSON API. Zero framework. Storage: shared Postgres (DATABASE_URL)
// or a local JSON file. The server owns all identity: sessions are HttpOnly cookies, accounts are
// scrypt-hashed, message authors and room ownership are stamped from the session, and every
// membership/role/ban check happens here, never in the browser.
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
require('./lib/env');
const store = require('./lib/store');
const { finderTurn, helpTurn, interpretGoal, roomAssistant } = require('./lib/ai');
const { demoReply } = require('./lib/demo');
const llm = require('./lib/llm');
const { examplesFor } = require('./lib/examples');
const guide = require('./lib/guide');
const { mapSkill } = require('./lib/skillmap');
const { checkMessage } = require('./lib/moderate');
const openai = require('./lib/openai');
const { parseGoal } = require('./lib/match');
const auth = require('./lib/auth');
const { profiles, SKILLS, SKILL_BY_ID, matchGoal, buildAssist, cap } = require('./lib/match');

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC = path.join(__dirname, 'public');

const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.ico': 'image/x-icon' };

// ---------- rate limiting (per address, per bucket) ----------
const hits = new Map();
function limited(req, bucket = 'ai', max = 30, windowMs = 60000) {
  const k = (req.socket.remoteAddress || 'x') + ':' + bucket, now = Date.now(), arr = (hits.get(k) || []).filter(x => now - x < windowMs);
  if (arr.length >= max) { hits.set(k, arr); return false; }
  arr.push(now); hits.set(k, arr); return true;
}
function send(res, code, body) {
  const data = JSON.stringify(body);
  res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(data);
}
function readBody(req, limit = 64 * 1024) {
  if (req.body !== undefined && req.body !== null && !(req.body instanceof Buffer)) { // Vercel pre-parses JSON
    try { return Promise.resolve(typeof req.body === 'string' ? (req.body ? JSON.parse(req.body) : {}) : req.body); } catch { return Promise.reject(new Error('Invalid JSON')); }
  }
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => { size += c.length; if (size > limit) { reject(new Error('Request too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {}); } catch { reject(new Error('Invalid JSON')); } });
    req.on('error', reject);
  });
}
const str = (v, max) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max);
const SKILL_IDS = new Set(SKILLS.map(s => s.id));

// ---------- sessions and accounts ----------
// An anonymous session identity in an HttpOnly cookie; signing in attaches an account to it.
// The principal is the account for signed-in people (identity follows them across devices) and the
// session user for anonymous users. Clients never send identity claims; the server resolves them.
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
  user._sid = sid; // internal: lets handlers refresh this user row without re-reading cookies
  if (isNew) res.setHeader('Set-Cookie', `knot_sid=${sid}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000` + (process.env.VERCEL ? '; Secure' : ''));
  return user;
}
// What a signed-in account looks like to its own client. Never includes password material.
function mePayload(user, account) {
  if (!user.accountId) return { signedIn: false, id: user.id, name: user.name, isGuest: true };
  return {
    signedIn: true, id: user.id, accountId: user.accountId,
    name: account ? account.name : user.name, email: account ? account.email : null,
    ageCategory: account ? account.ageCategory : null, isGuest: false,
    profile: account ? {
      bio: account.bio || '', interests: account.interests || [], skills: account.skills || [],
      skillLabels: account.skillLabels || [], goals: account.goals || '', city: account.city || '',
      availability: account.availability || [], mode: account.mode || 'both', avatar: account.avatar || null,
      avatarStatus: account.avatarStatus || null
    } : null
  };
}

function publicRoom(room, withMessages, user) {
  const realMembers = (room.members || []).map(m => ({
    id: m.pid, name: m.name, role: m.role || 'member', demo: false, you: user ? m.pid === (user.accountId ? 'a:' + user.accountId : String(user.id)) : false,
    city: m.city || '', modeText: m.modeText || 'Joined member', skillLabels: m.skillLabels || [],
    availabilityText: m.availabilityText || 'Not listed', availabilityDays: m.availabilityDays || null, avatar: m.avatar || null
  }));
  const demoMembers = (room.demoMembers || []).map(m => ({ ...m, demo: true, you: false }));
  // KNOT AI is listed with the members of every group, so it is a visible helper rather than a
  // surprise voice in the room. It is not a person and not a member: it takes no capacity, has no
  // profile, cannot be kicked or banned, and its own lines are stored as kind 'assistant'.
  const aiMember = {
    id: 'knot-ai', name: 'KNOT AI', role: null, demo: false, you: false, ai: true,
    city: '', avatar: null, skillLabels: [], availabilityText: '', availabilityDays: null,
    modeText: room.aiMode === 'on' ? 'Helper, replies to every message'
      : room.aiMode === 'on-demand' ? 'Helper, answers when a member asks'
        : 'Helper, switched off in this group'
  };
  const members = [...realMembers, aiMember, ...demoMembers];
  const myPid = user ? (user.accountId ? 'a:' + user.accountId : String(user.id)) : null;
  const mine = user ? room.members.find(m => m.pid === myPid) : null;
  const isMember = !!mine || (user ? !!room.members.some(m => m.pid === myPid) : false);
  // Which lines are the viewer's own is decided here, from the session, so the chat can put them on
  // the right. The client never gets to claim authorship of a message it did not send.
  const messages = (room.messages || []).map(x => ({
    ...x,
    you: !!(myPid && ((x.authorAccountId && 'a:' + x.authorAccountId === myPid) || (x.authorId && String(x.authorId) === myPid)))
  }));
  const out = {
    id: room.id, title: room.title, goal: room.goal, description: room.description || null,
    category: room.category || null, visibility: room.visibility || 'public', joinMode: room.joinMode || 'open',
    capacity: room.capacity || 12, capacityUsed: (room.members || []).length + (room.demoMembers || []).length,
    onlineOnly: !!room.onlineOnly, city: room.city || null, ageScope: room.ageScope || null,
    demo: !!room.demo, aiMode: room.aiMode || 'off', createdAt: room.createdAt,
    members, messages, myRole: mine ? (mine.role || 'member') : null, isMember
  };
  if (isMember) out.inviteCode = room.inviteCode; // invite links are for members to share
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

// Real members whose STOREED skills, interests or goals overlap the parsed goal. Reasons cite the
// stored fields only; nothing is invented. Used by the AI Finder next to the demo-profile matches.
async function peopleForGoal(goal, viewerAccountId) {
  const p = parseGoal(goal, {});
  const needLabels = p.needs.map(id => SKILL_BY_ID[id].label);
  const text = goal.toLowerCase();
  const people = await store.listPeople({ query: null, viewerAccountId }).catch(() => []);
  const scored = [];
  for (const person of people) {
    const reasons = [];
    for (const id of p.needs) if ((person.skills || []).includes(id)) reasons.push(`Lists ${SKILL_BY_ID[id].label} in their skills`);
    const interestHits = (person.interests || []).filter(i => needLabels.some(l => i.toLowerCase().includes(l.split(' ')[0])) || text.includes(i.toLowerCase()));
    for (const i of interestHits) reasons.push(`Interested in ${i}`);
    if (person.goals && p.topics.length && p.topics.some(t => person.goals.toLowerCase().includes(t))) reasons.push('Has a similar goal on their profile');
    if (reasons.length) scored.push({ person, reason: [...new Set(reasons)].slice(0, 2).join(' and ') });
  }
  return scored.slice(0, 3).map(({ person, reason }) => ({
    id: 'a:' + person.id, name: person.name, city: person.city, bio: person.bio, goals: person.goals,
    interests: person.interests, skillLabels: person.skillLabels, avatar: person.avatar,
    modeText: { both: 'in person or online', 'in-person': 'in person only', online: 'online only' }[person.mode || 'both'],
    availability: person.availability, reason, real: true
  }));
}

// When the demo community has no exact match, point at real public groups that touch the same
// topics, with the reason spelled out. Only groups the viewer is allowed to discover are listed.
async function relatedGroups(goal, user) {
  const account = user.accountId ? await store.getAccountById(user.accountId) : null;
  if (!account) return [];
  const p = parseGoal(goal, {});
  const words = goal.toLowerCase().split(/[^a-z]+/).filter(w => w.length > 3);
  const groups = await store.listPublicGroups({ ageCategory: account.ageCategory, viewerPrincipal: user.accountId }).catch(() => []);
  return groups
    .map(g => {
      const text = [g.title, g.goal, g.description, g.category].filter(Boolean).join(' ').toLowerCase();
      const hits = words.filter(w => text.includes(w)).length;
      const topicHit = p.topics.length && p.topics.some(t => text.includes(t));
      return { g, hits: hits + (topicHit ? 2 : 0) };
    })
    .filter(x => x.hits > 0)
    .sort((a, b) => b.hits - a.hits)
    .slice(0, 3)
    .map(({ g }) => ({ id: g.id, title: g.title, goal: g.goal, memberCount: g.memberCount, capacity: g.capacity, city: g.city, onlineOnly: g.onlineOnly, joinMode: g.joinMode }));
}

// Age gate: every real group is scoped teen or adult. Teens stay with teens, adults with adults,
// and anonymous users (no verified age) never enter teen spaces. Demo groups are labeled demo.
async function ageAllowsResolved(room, user) {
  if (room.demo) return !user.accountId; // demo groups are guest sandboxes; signed-in people use real groups
  if (!room.ageScope) return true;
  if (!user.accountId) return false;
  const account = await store.getAccountById(user.accountId);
  if (!account || account.deleted) return false;
  return account.ageCategory === room.ageScope;
}

async function api(req, res, url) {
  const parts = url.pathname.split('/').filter(Boolean).slice(1); // after "api"
  // On Vercel the function only receives one path segment (/api/<first>); anything deeper is
  // folded into knotpath=<rest> by the rewrite in vercel.json. Put it back so every route below
  // sees the same parts locally and in production.
  const folded = url.searchParams.get('knotpath');
  if (folded && parts.length === 1) parts.push(...folded.split('/').filter(Boolean));
  const m = req.method;

  if (m === 'GET' && parts[0] === 'status') {
    const s = llm.status();
    return send(res, 200, {
      matcher: 'local-rules', ai: s.ai, aiProvider: s.provider, aiModels: s.ai ? s.aiModels : null,
      storage: store.kind === 'postgres' ? 'shared-postgres' : (process.env.VERCEL ? 'browser' : 'data/db.json'),
      persistent: store.kind === 'postgres' || !process.env.VERCEL, profiles: profiles.length
    });
  }

  // ---------- auth ----------
  if (parts[0] === 'auth') {
    const user = await getSession(req, res);
    if (m === 'POST' && parts[1] === 'signup') {
      if (!limited(req, 'auth', Number(process.env.KNOT_AUTH_RATE_MAX) || 10)) return send(res, 429, { error: 'Too many attempts. Wait a minute and try again.' });
      const b = await readBody(req);
      const email = str(b.email, 120).toLowerCase();
      const name = str(b.name, 40);
      // KNOT is for members 18 and over. One required checkbox, no age options to game.
      if (!auth.validEmail(email)) return send(res, 400, { error: 'Enter a valid email address.' });
      if (!name) return send(res, 400, { error: 'Add a display name.' });
      const pwErr = auth.passwordProblem(b.password);
      if (pwErr) return send(res, 400, { error: pwErr });
      if (b.confirm18 !== true) return send(res, 400, { error: 'KNOT is for members 18 and over. Confirm your age to continue.' });
      const interests = (Array.isArray(b.interests) ? b.interests : []).map(x => str(x, 40)).filter(Boolean).slice(0, 3);
      const mod = await checkMessage(name + ' ' + interests.join(' '));
      if (mod.action === 'hold') return send(res, 400, { error: 'That display name or interest cannot be used. Pick something else.' });
      try {
        const account = await store.createAccount({ email, passwordHash: auth.hashPassword(b.password), name, ageCategory: 'adult', interests });
        await store.adoptAccount(user.id, account.id);
        await store.updateUser(user.id, { name, isGuest: false });
        return send(res, 201, mePayload(await store.ensureUser(user._sid), account));
      } catch (e) {
        if (e.status === 409) {
          // Someone who already made this account and pressed Create again should land in the app,
          // not on a dead end. The password proves it is theirs, exactly as signing in would.
          const existing = await store.getAccountByEmail(email);
          if (existing && !existing.deleted && auth.verifyPassword(String(b.password || ''), existing.passwordHash)) {
            await store.adoptAccount(user.id, existing.id);
            await store.updateUser(user.id, { name: existing.name, isGuest: false });
            return send(res, 200, mePayload(await store.ensureUser(user._sid), existing));
          }
        }
        if (e.status) return send(res, e.status, { error: e.message });
        console.error('KNOT signup error:', e);
        return send(res, 500, { error: 'Could not create the account right now. Try again in a moment.' });
      }
    }
    if (m === 'POST' && parts[1] === 'signin') {
      if (!limited(req, 'auth', Number(process.env.KNOT_AUTH_RATE_MAX) || 10)) return send(res, 429, { error: 'Too many attempts. Wait a minute and try again.' });
      const b = await readBody(req);
      const email = str(b.email, 120).toLowerCase();
      const account = await store.getAccountByEmail(email);
      // Same message for unknown email and wrong password: do not reveal which accounts exist.
      if (!account || account.deleted || !auth.verifyPassword(String(b.password || ''), account.passwordHash)) {
        return send(res, 401, { error: 'Email or password is not right.' });
      }
      await store.adoptAccount(user.id, account.id);
      await store.updateUser(user.id, { name: account.name, isGuest: false });
      return send(res, 200, mePayload(await store.ensureUser(user._sid), account));
    }
    if (m === 'POST' && parts[1] === 'signout') {
      await store.updateUser(user.id, { isGuest: true, accountId: null });
      return send(res, 200, { signedIn: false, id: user.id, name: user.name, isGuest: true });
    }
    if (m === 'POST' && parts[1] === 'delete-account') {
      if (!user.accountId) return send(res, 400, { error: 'You are not signed in.' });
      await store.updateAccount(user.accountId, { deleted: true });
      await store.updateUser(user.id, { isGuest: true, accountId: null });
      return send(res, 200, { signedIn: false, isGuest: true, deleted: true });
    }
    // Profile editing: every field is optional, validated and clipped here, never trusted from the client.
    if (m === 'PATCH' && parts[1] === 'me') {
      const b = await readBody(req);
      if (b.name !== undefined && !str(b.name, 40)) return send(res, 400, { error: 'Add a display name.' });
      if (!user.accountId) {
        // guests can still rename their session, but the name is moderated like any account name
        if (b.name !== undefined) {
          const guestMod = await checkMessage(str(b.name, 40));
          if (guestMod.action === 'hold') return send(res, 422, { error: 'That display name cannot be used. Pick something else.', held: true });
          await store.updateUser(user.id, { name: str(b.name, 40) });
        }
        return send(res, 200, mePayload(await store.ensureUser(user._sid), null));
      }
      const fields = {};
      if (b.name !== undefined) fields.name = str(b.name, 40);
      if (b.bio !== undefined) fields.bio = str(b.bio, 300);
      if (b.interests !== undefined) fields.interests = (Array.isArray(b.interests) ? b.interests : []).map(x => str(x, 40)).filter(Boolean).slice(0, 3);
      if (b.skills !== undefined) fields.skills = (Array.isArray(b.skills) ? b.skills : []).filter(id => SKILL_IDS.has(id)).slice(0, 12);
      if (b.goals !== undefined) fields.goals = str(b.goals, 300);
      if (b.city !== undefined) fields.city = str(b.city, 60);
      if (b.availability !== undefined) fields.availability = (Array.isArray(b.availability) ? b.availability : []).map(d => str(d, 12).toLowerCase()).slice(0, 7);
      if (b.mode !== undefined && ['both', 'in-person', 'online'].includes(b.mode)) fields.mode = b.mode;
      // The same text-moderation pass as signup: every field that will be shown to other members
      // (name, bio, goals, interests, city) is checked before anything is saved.
      if (fields.name !== undefined || fields.bio !== undefined || fields.goals !== undefined || fields.interests !== undefined || fields.city !== undefined) {
        const mod = await checkMessage([fields.name, fields.bio, fields.goals, (fields.interests || []).join(' '), fields.city].filter(Boolean).join(' '));
        if (mod.action === 'hold') return send(res, 422, { error: 'That text was held for review. Rewrite it and try again.', held: true });
      }
      const account = await store.updateAccount(user.accountId, fields);
      if (fields.name) await store.updateUser(user.id, { name: fields.name });
      return send(res, 200, mePayload(await store.ensureUser(user._sid), account));
    }
    // Profile picture: type and size validated, magic bytes checked, AI-moderated when configured.
    // A rejected picture is never stored or shown.
    if (m === 'POST' && parts[1] === 'avatar') {
      if (!user.accountId) return send(res, 401, { error: 'Sign in to add a profile picture.' });
      if (!limited(req, 'avatar', 6)) return send(res, 429, { error: 'Too many picture uploads in a minute. Try again shortly.' });
      let b; try { b = await readBody(req, 1024 * 1024); } catch { return send(res, 413, { error: 'That picture is too large. Use one under 400 KB.' }); }
      const img = String((b && b.image) || '');
      const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(img);
      if (!match) return send(res, 400, { error: 'Upload a PNG, JPEG or WebP picture.' });
      const buf = Buffer.from(match[2].slice(0, 16), 'base64');
      const magicOk = (match[1] === 'png' && buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])))
        || (match[1] === 'jpeg' && buf[0] === 0xff && buf[1] === 0xd8)
        || (match[1] === 'webp' && buf.slice(0, 4).toString() === 'RIFF');
      if (!magicOk) return send(res, 400, { error: 'That file is not a real picture. Export it as PNG, JPEG or WebP and try again.' });
      if (Math.floor(match[2].length * 3 / 4) > 400 * 1024) return send(res, 413, { error: 'Keep the picture under 400 KB.' });
      const mod = await openai.moderateImage(img);
      if (mod && mod.flagged) {
        await store.updateAccount(user.accountId, { avatar: null, avatarStatus: 'rejected' });
        await store.addReport({ reporterUser: user, roomId: null, targetPid: 'a:' + user.accountId, reason: 'Automatic photo moderation', details: 'Profile picture flagged as: ' + mod.categories.join(', '), status: 'open' }).catch(() => {});
        return send(res, 422, { error: 'That picture was flagged by moderation, so KNOT cannot use it. Pick a different photo.' });
      }
      const account = await store.updateAccount(user.accountId, { avatar: img, avatarStatus: mod ? 'approved' : 'pending' });
      return send(res, 200, mePayload(await store.ensureUser(user._sid), account));
    }
    if (m === 'GET' && parts[1] === 'me') {
      const fresh = await store.ensureUser(user._sid);
      return send(res, 200, mePayload(fresh, fresh.accountId ? await store.getAccountById(fresh.accountId) : null));
    }
  }

  if (parts[0] === 'session') {
    const user = await getSession(req, res);
    if (m === 'POST') {
      const b = await readBody(req);
      if (b.legacyClientId) await store.setLegacyClientId(user.id, str(b.legacyClientId, 80));
      const fresh = await store.ensureUser(user._sid);
      return send(res, 200, mePayload(fresh, fresh.accountId ? await store.getAccountById(fresh.accountId) : null));
    }
    return send(res, 200, mePayload(user, user.accountId ? await store.getAccountById(user.accountId) : null));
  }
  if (m === 'POST' && parts[0] === 'profile') {
    const user = await getSession(req, res);
    const b = await readBody(req);
    const name = str(b.name, 40);
    if (!name) return send(res, 400, { error: 'Add a display name first.' });
    if (user.accountId) await store.updateAccount(user.accountId, { name });
    const u = await store.updateUser(user.id, { name, isGuest: !user.accountId });
    return send(res, 200, mePayload(u, user.accountId ? await store.getAccountById(user.accountId) : null));
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
      if (!llm.enabled()) return send(res, 503, { error: 'The AI Finder is not configured on this server. Use the matching box on this page instead.' });
      const me = b.me || {};
      const clean = { skills: (Array.isArray(me.skills) ? me.skills : []).filter(id => SKILL_IDS.has(id)), availability: [] };
      try {
        const out = await finderTurn({ history: b.history, me: clean });
        out.next = guide.fromFinder(out);
        // Alongside the demo-profile matches, show real members and, when nothing fits,
        // real public groups that touch the same topic. Both come from stored data only.
        if (out.result) {
          const user = await getSession(req, res);
          // Real member profiles are for signed-in members only; a guest gets none, ever.
          out.result.people = user.accountId ? await peopleForGoal(out.goal, user.accountId) : [];
          if (!out.result.results.length) out.result.alternativeGroups = await relatedGroups(out.goal, user);
        }
        return send(res, 200, out);
      }
      catch (e) { return send(res, e.status || 502, { error: e.status ? e.message : `The AI Finder is unavailable (${e.message}). Your messages are still here; try the matching box on this page.` }); }
    }
    if (parts[1] === 'interpret') { // AI-assisted goal reading; falls back to local rules on any failure
      const b = await readBody(req);
      const goal = str(b.goal, 500);
      if (!goal) return send(res, 400, { error: 'Add a goal first.' });
      const me = b.me || {};
      const clean = { skills: (Array.isArray(me.skills) ? me.skills : []).filter(id => SKILL_IDS.has(id)) };
      const out = await interpretGoal(goal, clean);
      out.next = guide.fromMatch({ goal, hasProfile: clean.skills.length > 0, results: out.results, empty: out.empty });
      return send(res, 200, out);
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

  // ---------- people search (accounts only; real members, stored profile fields only) ----------
  if (m === 'GET' && parts[0] === 'people') {
    const user = await getSession(req, res);
    if (!user.accountId) return send(res, 401, { error: 'Sign in to search members.' });
    const people = await store.listPeople({ query: url.searchParams.get('q'), viewerAccountId: user.accountId });
    return send(res, 200, { people });
  }

  // ---------- public group discovery (accounts only; guests see labeled demo content elsewhere) ----------
  if (m === 'GET' && parts[0] === 'groups') {
    const user = await getSession(req, res);
    if (!user.accountId) return send(res, 401, { error: 'Sign in to discover public groups.' });
    const account = await store.getAccountById(user.accountId);
    if (!account || account.deleted) return send(res, 401, { error: 'Sign in to discover public groups.' });
    const q = url.searchParams;
    const groups = await store.listPublicGroups({
      query: q.get('q'), category: q.get('category'), mode: q.get('mode'), city: q.get('city'),
      hasSpace: q.get('space') === '1', ageCategory: account.ageCategory, viewerPrincipal: user.accountId
    });
    return send(res, 200, { groups, ageScope: account.ageCategory });
  }

  // ---------- rooms / groups ----------
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
      if (await store.isBanned(room, user)) return send(res, 403, { error: 'You were removed from this group, so you cannot rejoin it.' });
      if (!(await ageAllowsResolved(room, user))) return send(res, 403, { error: room.ageScope === 'teen' ? 'This group is for members aged 13 to 17. Adults cannot join teen groups.' : 'This group is for members 18 and over.' });
      // Blocks run both ways: neither side can pull the other into a group through invites or requests.
      const ownerPid = room.ownerAccountId ? 'a:' + room.ownerAccountId : (room.ownerUserId ? String(room.ownerUserId) : null);
      if (ownerPid && await store.isBlockedBetween(user, ownerPid)) return send(res, 403, { error: 'This invite is not available to you.' });
      if (!(await store.canAccessRoom(room, user))) {
        if (room.capacityUsed >= (room.capacity || 12)) return send(res, 409, { error: 'This group is full.' });
        if (room.joinMode === 'request') {
          const account = user.accountId ? await store.getAccountById(user.accountId) : null;
          await store.requestJoin(room, user, user.name, account ? account.ageCategory : null);
          return send(res, 200, { pending: true, room: publicRoom(await store.getRoomRaw(room.id), false, user) });
        }
        await store.addRoomMember(room, user);
      }
      return send(res, 200, { room: publicRoom(await store.getRoomRaw(room.id), true, user) });
    }
    if (m === 'POST' && parts.length === 1) {
      const b = await readBody(req);
      const requestId = str(b.requestId, 80);
      if (!requestId) return send(res, 400, { error: 'Missing request details. Please try again.' });
      const goal = str(b.goal, 500), title = str(b.title, 80);
      if (!goal || !title) return send(res, 400, { error: 'A group needs a name and a goal.' });
      const ids = [...new Set(Array.isArray(b.memberIds) ? b.memberIds : [])].slice(0, 5);
      const members = ids.map(id => profiles.find(p => p.id === id)).filter(Boolean).map(memberSnapshot);
      const visibility = b.visibility === 'private' ? 'private' : 'public';
      const joinMode = b.joinMode === 'request' ? 'request' : 'open';
      const capacity = Math.min(Math.max(Number(b.capacity) || 12, 2), 50);
      const ageScope = b.ageScope === 'teen' ? 'teen' : 'adult';
      const account = user.accountId ? await store.getAccountById(user.accountId) : null;
      // A person can only lead a group inside their own age scope (teens lead teen groups).
      if (account && account.ageCategory !== ageScope) return send(res, 403, { error: ageScope === 'teen' ? 'Teen groups are created by members aged 13 to 17.' : 'Adult groups are created by members 18 and over.' });
      const desc = str(b.description, 300);
      const mod = await checkMessage(title + ' ' + goal + ' ' + (desc || ''));
      if (mod.action === 'hold') return send(res, 422, { error: 'That group text was held for review, so the group was not created. Rewrite the name, goal or description.', held: true });
      const made = await store.createRoom({
        id: crypto.randomBytes(5).toString('hex'), inviteCode: crypto.randomBytes(12).toString('base64url'),
        requestId, title, goal, category: str(b.category, 40) || null,
        visibility, joinMode, capacity, onlineOnly: !!b.onlineOnly, city: str(b.city, 60) || null,
        ageScope, demo: !user.accountId, aiMode: 'off',
        ownerUserId: user.accountId ? null : user.id, ownerAccountId: user.accountId || null,
        ownerName: user.name, ownerAgeCategory: account ? account.ageCategory : null,
        legacyClientId: str(b.clientId, 80), demoMembers: members, description: desc || null
      });
      if (!made.room) return send(res, 500, { error: 'The group could not be saved. Please try again.' });
      return send(res, made.duplicate ? 200 : 201, { room: publicRoom(made.room, true, user), duplicate: made.duplicate });
    }
    if (parts.length < 2) return send(res, 404, { error: 'Not found' });
    let room = await store.getRoomRaw(parts[1]);
    if (!room) return send(res, 404, { error: 'This group could not be found. It may live on another computer or in another browser. Open My groups to see your groups, or ask the creator for an invite link.' });
    // Join straight from discovery by group id (invite codes are not needed for public groups).
    if (m === 'POST' && parts[2] === 'join') {
      if (room.visibility !== 'public' || room.demo) return send(res, 403, { error: 'This group is not open for discovery.' });
      if (await store.isBanned(room, user)) return send(res, 403, { error: 'You were removed from this group, so you cannot rejoin it.' });
      if (!(await ageAllowsResolved(room, user))) return send(res, 403, { error: room.ageScope === 'teen' ? 'This group is for members aged 13 to 17. Adults cannot join teen groups.' : 'This group is for members 18 and over.' });
      const ownerPid = room.ownerAccountId ? 'a:' + room.ownerAccountId : (room.ownerUserId ? String(room.ownerUserId) : null);
      if (ownerPid && await store.isBlockedBetween(user, ownerPid)) return send(res, 403, { error: 'This group is not available to you.' });
      if (!(await store.canAccessRoom(room, user))) {
        if (room.capacityUsed >= (room.capacity || 12)) return send(res, 409, { error: 'This group is full.' });
        if (room.joinMode === 'request') {
          const account = user.accountId ? await store.getAccountById(user.accountId) : null;
          await store.requestJoin(room, user, user.name, account ? account.ageCategory : null);
          return send(res, 200, { pending: true });
        }
        await store.addRoomMember(room, user);
      }
      return send(res, 200, { room: publicRoom(await store.getRoomRaw(room.id), true, user) });
    }
    const user2 = user;
    const myPid = user2.accountId ? 'a:' + user2.accountId : String(user2.id);
    const isMember = (room.members || []).some(m => m.pid === myPid);
    const myRole = ((room.members || []).find(m => m.pid === myPid) || {}).role || null;
    const canMod = myRole === 'owner' || myRole === 'moderator';
    if (!isMember && !(room.visibility === 'public' && !room.demo)) {
      return send(res, 403, { error: 'You are not in this group yet. Open the invite link the creator shared to join it.' });
    }
    // Public groups preview to non-members (without messages or invite code).
    if (!isMember) return send(res, 200, { room: publicRoom(await store.getRoomRaw(room.id), false, null) });
    if (m === 'GET' && parts.length === 2) {
      const payload = publicRoom(room, true, user2);
      if (canMod) { payload.joinRequests = await store.listJoinRequests(room); payload.bans = await store.listBans(room); }
      return send(res, 200, { room: payload, next: guide.fromRoom({ messages: room.messages || [] }) });
    }
    if (m === 'GET' && parts[2] === 'messages') {
      const msgs = await store.listMessagesAfter(room, url.searchParams.get('after'));
      return send(res, 200, { messages: msgs });
    }
    if (m === 'POST' && parts[2] === 'messages') {
      if (!limited(req, 'msg', 30)) return send(res, 429, { error: 'Slow down a little and try again in a minute.' });
      const b = await readBody(req);
      const text = String(b.text == null ? '' : b.text).trim().slice(0, 2000);
      if (!text) return send(res, 400, { error: 'Type a message first.' });
      // The client's /ai command is turned into this flag before it leaves the browser, so no slash
      // syntax ever reaches the server: this is just "also ask KNOT AI about this message".
      const askAi = b.askAi === true;
      if (askAi && room.aiMode === 'off') return send(res, 403, { error: 'KNOT AI is off in this group. The owner can turn it on in group settings.' });
      // Moderation BEFORE posting: held content never reaches the room; it files a report instead.
      const mod = await checkMessage(text);
      if (mod.action === 'hold') {
        await store.addReport({ reporterUser: user2, roomId: room.id, targetPid: myPid, reason: mod.reason, details: 'Automatic hold. Message text: ' + text.slice(0, 500), status: 'open' });
        return send(res, 422, { error: 'KNOT held this message for review. A group moderator will look at it. If you think this is a mistake, you can report the issue to the organizer instead.', held: true });
      }
      // The author is always this session's principal; anything the client claims about itself is
      // ignored. "kind" too: only the askAi, demo-profile and ai_mode paths ever write anything
      // other than a member's own message.
      const msg = await store.addMessage(room, {
        userId: user2.accountId ? null : user2.id, accountId: user2.accountId || null,
        authorName: user2.name, text, clientMsgId: str(b.clientMsgId, 60) || null, kind: 'user'
      });
      const replies = [];
      // The fictional demo profiles answer, so a sandbox group is a chat and not a dead room. The
      // server picks who speaks and writes the line, and it is stored as kind 'demo' so the room
      // can label it. The client never authors these.
      if (!msg.duplicate && (room.demoMembers || []).length) {
        try {
          const out = await demoReply({ room: { ...room, messages: [...(room.messages || []), msg] }, lastText: text });
          if (out && out.text) replies.push(await store.addMessage(room, { authorName: out.name, text: out.text, kind: 'demo' }));
        } catch { /* the demo is optional; the member message already posted */ }
      }
      const history = (room.messages || []).slice(-6).map(x => ({ role: x.kind === 'assistant' ? 'assistant' : 'user', content: x.text }));
      // The member asked KNOT AI something directly, so it answers that question rather than the
      // room in general. Only ever one AI line per message, never as a human.
      if (askAi && !msg.duplicate) {
        try {
          const out = await roomAssistant({ room, meProfile: null, question: text, history });
          replies.push(await store.addMessage(room, { authorName: 'KNOT AI', text: out.reply, kind: 'assistant' }));
        } catch { /* AI is optional; the member message already posted */ }
      }
      // ai_mode 'on': after each member message, KNOT AI posts one short reply (never as a human).
      // Skipped when the member already asked it something, so it never answers twice.
      if (room.aiMode === 'on' && !askAi && !msg.duplicate) {
        try {
          const out = await roomAssistant({ room, meProfile: null, question: 'Respond briefly to the latest message and move the group forward.', history });
          replies.push(await store.addMessage(room, { authorName: 'KNOT AI', text: out.reply, kind: 'assistant' }));
        } catch { /* AI is optional; the member message already posted */ }
      }
      return send(res, 201, { message: msg, replies });
    }
    if (m === 'POST' && parts[2] === 'assist') {
      const pub = publicRoom(room, false, user2);
      return send(res, 200, buildAssist({ goal: room.goal, members: pub.members }));
    }
    // ---- moderation controls (owner or moderator only) ----
    if (canMod && m === 'POST' && parts[2] === 'kick') {
      const b = await readBody(req);
      const pid = str(b.pid, 80);
      const target = room.members.find(x => x.pid === pid);
      if (!target) return send(res, 404, { error: 'That member is not in this group.' });
      if (target.role === 'owner') return send(res, 403, { error: 'The owner cannot be removed.' });
      await store.removeMember(room, user2, pid);
      await store.addModAction({ actorUser: user2, roomId: room.id, targetPid: pid, action: 'kick', reason: str(b.reason, 200) });
      return send(res, 200, { ok: true });
    }
    if (canMod && m === 'POST' && parts[2] === 'ban') {
      const b = await readBody(req);
      const pid = str(b.pid, 80);
      const target = room.members.find(x => x.pid === pid);
      if (!target) return send(res, 404, { error: 'That member is not in this group.' });
      if (target.role === 'owner') return send(res, 403, { error: 'The owner cannot be banned.' });
      if (myRole !== 'owner' && target.role === 'moderator') return send(res, 403, { error: 'A moderator cannot ban another moderator. Ask the owner.' });
      await store.banMember(room, pid, str(b.reason, 200));
      await store.addModAction({ actorUser: user2, roomId: room.id, targetPid: pid, action: 'ban', reason: str(b.reason, 200) });
      return send(res, 200, { ok: true });
    }
    if (canMod && m === 'POST' && parts[2] === 'unban') {
      const b = await readBody(req);
      const pid = str(b.pid, 80);
      const bans = await store.listBans(room);
      if (!bans.some(x => x.pid === pid)) return send(res, 404, { error: 'That member is not banned.' });
      await store.unbanMember(room, pid);
      await store.addModAction({ actorUser: user2, roomId: room.id, targetPid: pid, action: 'unban' });
      return send(res, 200, { ok: true });
    }
    if (myRole === 'owner' && m === 'POST' && parts[2] === 'promote') {
      const b = await readBody(req);
      const pid = str(b.pid, 80);
      if (!room.members.some(x => x.pid === pid)) return send(res, 404, { error: 'Pick a current member.' });
      const role = b.role === 'moderator' ? 'moderator' : 'member';
      await store.setMemberRole(room, pid, role);
      await store.addModAction({ actorUser: user2, roomId: room.id, targetPid: pid, action: 'role:' + role });
      return send(res, 200, { ok: true });
    }
    if (myRole === 'owner' && m === 'POST' && parts[2] === 'transfer') {
      const b = await readBody(req);
      const pid = str(b.pid, 80);
      if (!room.members.some(x => x.pid === pid)) return send(res, 404, { error: 'Pick a current member.' });
      await store.transferOwnership(room.id, pid);
      await store.setMemberRole(room, myPid, 'member');
      await store.addModAction({ actorUser: user2, roomId: room.id, targetPid: pid, action: 'ownership-transfer' });
      return send(res, 200, { ok: true });
    }
    if (m === 'POST' && parts[2] === 'leave') {
      if (myRole === 'owner') return send(res, 409, { error: 'The owner cannot leave. Transfer ownership first (member menu → Make owner), or delete the group from your side later.' });
      await store.removeMember(room, user2, myPid);
      return send(res, 200, { ok: true });
    }
    if (canMod && m === 'PATCH' && parts.length === 2) {
      const b = await readBody(req);
      const fields = {};
      if (b.title !== undefined) { const t = str(b.title, 80); if (t) fields.title = t; }
      if (b.description !== undefined) fields.description = str(b.description, 300);
      if (fields.title !== undefined || fields.description !== undefined) {
        const mod = await checkMessage([fields.title, fields.description].filter(Boolean).join(' '));
        if (mod.action === 'hold') return send(res, 422, { error: 'That group text was held for review, so the change was not saved.', held: true });
      }
      if (b.category !== undefined) fields.category = str(b.category, 40);
      if (b.visibility !== undefined && (b.visibility === 'public' || b.visibility === 'private')) fields.visibility = b.visibility;
      if (b.joinMode !== undefined && (b.joinMode === 'open' || b.joinMode === 'request')) fields.joinMode = b.joinMode;
      if (b.capacity !== undefined) fields.capacity = Math.min(Math.max(Number(b.capacity) || 12, 2), 50);
      if (b.aiMode !== undefined && ['off', 'on-demand', 'on'].includes(b.aiMode)) fields.aiMode = b.aiMode;
      await store.setRoomFields(room.id, fields);
      return send(res, 200, { room: publicRoom(await store.getRoomRaw(room.id), true, user2) });
    }
    // ---- join requests (approval-mode groups) ----
    if (canMod && m === 'GET' && parts[2] === 'requests') return send(res, 200, { requests: await store.listJoinRequests(room) });
    if (canMod && m === 'POST' && parts[2] === 'requests') {
      const b = await readBody(req);
      const pid = str(b.pid, 80);
      const reqRow = (await store.listJoinRequests(room)).find(r => r.pid === pid);
      if (!reqRow) return send(res, 404, { error: 'That request is gone; it may have been handled already.' });
      if (room.capacityUsed >= (room.capacity || 12)) return send(res, 409, { error: 'This group is full.' });
      const approve = b.approve === true;
      // Teen scoping is enforced again at approval time, from the requester's stored age.
      if (approve && room.ageScope === 'teen' && reqRow.ageCategory !== 'teen') return send(res, 403, { error: 'This group is for members aged 13 to 17.' });
      if (approve && room.ageScope === 'adult' && reqRow.ageCategory && reqRow.ageCategory !== 'adult') return send(res, 403, { error: 'This group is for members 18 and over.' });
      await store.decideJoinRequest(room, pid, approve);
      await store.addModAction({ actorUser: user2, roomId: room.id, targetPid: pid, action: approve ? 'approve-join' : 'decline-join' });
      return send(res, 200, { ok: true });
    }
  }

  // ---------- reports and blocks ----------
  if (m === 'POST' && parts[0] === 'reports') {
    if (!limited(req, 'reports', 10)) return send(res, 429, { error: 'Too many reports in a minute. Try again shortly.' });
    const user = await getSession(req, res);
    const b = await readBody(req);
    const reason = str(b.reason, 60);
    if (!reason) return send(res, 400, { error: 'Pick a reason for the report.' });
    const out = await store.addReport({
      reporterUser: user, roomId: str(b.roomId, 40) || null, messageId: str(b.messageId, 60) || null,
      messageText: str(b.messageText, 500) || null, targetPid: str(b.targetPid, 80) || null,
      reason, details: str(b.details, 500) || null, status: 'open'
    });
    return send(res, 201, { ok: true, id: out.id, note: 'Thanks. A report was filed for review. Nothing happens automatically to the person you reported.' });
  }
  if (m === 'POST' && parts[0] === 'blocks') {
    const user = await getSession(req, res);
    const b = await readBody(req);
    const pid = str(b.pid, 80);
    if (!pid) return send(res, 400, { error: 'Missing member to block.' });
    await store.addBlock(user, pid);
    return send(res, 200, { ok: true, note: 'Blocked. KNOT keeps this person out of your matches and join requests, both ways.' });
  }
  // Admin console: reports and moderation log, guarded by a shared admin key in the environment.
  if (parts[0] === 'admin' && process.env.ADMIN_KEY && url.searchParams.get('key') === process.env.ADMIN_KEY) {
    if (m === 'GET' && parts[1] === 'reports') {
      const reports = await store.listReports(50);
      const actions = await store.listModActions(50);
      let usage = null;
      try { usage = await store.aiUsageTotals(); } catch {}
      return send(res, 200, { reports, actions, usage });
    }
    if (m === 'POST' && parts[1] === 'reports') {
      const b = await readBody(req);
      await store.resolveReport(str(b.id, 60), b.status === 'resolved' ? 'resolved' : 'dismissed');
      return send(res, 200, { ok: true });
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
    // Errors the routes raise on purpose carry a status and a message written for members.
    // Anything else is a bug: keep the detail in the server log, show a plain sentence.
    if (!res.headersSent) {
      if (e.status) send(res, e.status, { error: e.message });
      else { console.error('KNOT error:', e); send(res, 500, { error: 'Something went wrong on our side. Try again in a moment.' }); }
    }
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
  const s = llm.status();
  console.log(`KNOT is running at http://localhost:${PORT}`);
  console.log(`AI: ${s.ai ? s.provider + ' (' + JSON.stringify(s.aiModels) + ')' : 'off (no OPENAI_API_KEY or GROQ_API_KEY; local features still work)'}. Storage: ${store.kind === 'postgres' ? 'shared Postgres (DATABASE_URL)' : 'data/db.json (this machine only; set DATABASE_URL to share across computers)'}`);
});
