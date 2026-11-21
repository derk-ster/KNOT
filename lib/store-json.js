'use strict';
// JSON-file storage: local dev / tests / no-database deploys. Same interface as store-pg.js.
// NOT used for production data: Vercel's filesystem is ephemeral, so production must set DATABASE_URL.
// Message kinds: a member's own words, the labeled KNOT AI assistant, or a fictional demo profile.
const kindOf = k => (k === 'assistant' || k === 'demo' ? k : 'user');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const uuidV4 = () => crypto.randomUUID();

// Key a member/permission check on the account for signed-in users (cross-device), else the session user.
function pid(user) { return user.accountId ? 'a:' + user.accountId : String(user.id); }
function pidSplit(p) { return String(p || '').startsWith('a:') ? [null, String(p).slice(2)] : [String(p || ''), null]; }
function pidMatch(m, user) {
  if (user.accountId) return m.accountId === user.accountId;
  return !m.byAccount && String(m.id) === String(user.id);
}
function memberPid(m) { return m.byAccount ? 'a:' + m.id : String(m.id); }
const st = fn => async (...args) => fn(...args); // json store is sync underneath; keeps methods awaitable

const { SKILL_BY_ID } = require('./match');
const cap2 = s => String(s).charAt(0).toUpperCase() + String(s).slice(1);
// What an account looks like outside the auth layer. Password material is never included;
// avatars rejected by moderation are never exposed (pending ones are shown while awaiting review).
function accountPublic(a) {
  const skills = (a.skills || []).filter(id => SKILL_BY_ID[id]);
  return {
    id: a.id, email: a.email, name: a.name, ageCategory: a.ageCategory, deleted: a.deleted, createdAt: a.createdAt,
    bio: a.bio || '', interests: a.interests || [], skills, skillLabels: skills.map(id => SKILL_BY_ID[id].label),
    goals: a.goals || '', city: a.city || '', availability: a.availability || [], mode: a.mode || 'both',
    avatar: (a.avatarStatus === 'approved' || a.avatarStatus === 'pending') ? a.avatar : null,
    avatarStatus: a.avatarStatus || null
  };
}

module.exports = function makeJsonStore(dbPath) {
  let db = { users: [], accounts: [], rooms: [], bans: [], joinRequests: [], reports: [], blocks: [], modActions: [], aiUsage: [] };
  let saveT = null;
  function load() {
    try {
      const parsed = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
      db = Object.assign(db, parsed);
      for (const k of ['users', 'accounts', 'rooms', 'bans', 'joinRequests', 'reports', 'blocks', 'modActions', 'aiUsage']) if (!Array.isArray(db[k])) db[k] = [];
    } catch {}
  }
  function saveNow() { clearTimeout(saveT); try { fs.mkdirSync(path.dirname(dbPath), { recursive: true }); fs.writeFileSync(dbPath, JSON.stringify(db, null, 1)); } catch (e) { console.error('[store-json] save failed:', e.message); } }
  function save() { clearTimeout(saveT); saveT = setTimeout(saveNow, 25); }
  load();
  process.on('exit', saveNow);
  process.on('SIGINT', () => { saveNow(); process.exit(0); });
  process.on('SIGTERM', () => { saveNow(); process.exit(0); });

  function getRoomRaw(roomId) {
    const r = db.rooms.find(r => r.id === roomId);
    if (!r) return null;
    const capacityUsed = r.members.length + (r.demoMembers || []).length;
    return {
      id: r.id, inviteCode: r.inviteCode, requestId: r.requestId || null, title: r.title, goal: r.goal,
      description: r.description || null, category: r.category || null, visibility: r.visibility || 'public',
      joinMode: r.joinMode || 'open', capacity: r.capacity || 12, capacityUsed, onlineOnly: !!r.onlineOnly,
      city: r.city || null, ageScope: r.ageScope || null, demo: !!r.demo, aiMode: r.aiMode || 'off',
      ownerUserId: r.ownerUserId || null, ownerAccountId: r.ownerAccountId || null, legacyClientId: r.legacyClientId || null,
      createdAt: r.createdAt,
      members: r.members.map(m => {
        const acct = m.byAccount ? db.accounts.find(a => a.id === m.id) : null;
        const skills = acct ? (acct.skills || []).filter(id => SKILL_BY_ID[id]) : [];
        const days = acct ? (acct.availability || []) : [];
        return {
          pid: memberPid(m), id: m.id, byAccount: !!m.byAccount, name: m.name, role: m.role || 'member', ageCategory: m.ageCategory || null, demo: false,
          city: (acct && acct.city) || '', modeText: acct ? ({ both: 'in person or online', 'in-person': 'in person only', online: 'online only' }[acct.mode || 'both']) : 'Joined member',
          skillLabels: skills.map(id => SKILL_BY_ID[id].label),
          availabilityDays: days.length ? days : null,
          availabilityText: days.length ? days.map(cap2).join(', ') : 'Not listed',
          avatar: acct && (acct.avatarStatus === 'approved' || acct.avatarStatus === 'pending') ? acct.avatar : null
        };
      }),
      demoMembers: r.demoMembers || [],
      messages: r.messages || []
    };
  }

  return {
    kind: 'json-file',
    // ---------- users ----------
    ensureUser: st(sid => {
      if (!sid) throw new Error('Missing session id');
      let u = db.users.find(u => u.sessionId === sid);
      if (!u) { u = { id: uuidV4(), sessionId: sid, name: 'Guest ' + Math.floor(1000 + Math.random() * 9000), isGuest: true, accountId: null, legacyClientId: null, createdAt: new Date().toISOString() }; db.users.push(u); save(); }
      return { id: u.id, name: u.name, isGuest: u.isGuest, accountId: u.accountId || null, legacyClientId: u.legacyClientId || null };
    }),
    updateUser: st((id, fields) => {
      const u = db.users.find(u => u.id === id);
      if (!u) throw new Error('User not found');
      if (fields.name !== undefined) u.name = String(fields.name);
      if (fields.accountId !== undefined) u.accountId = fields.accountId;
      if (fields.isGuest !== undefined) u.isGuest = !!fields.isGuest;
      save();
      return { id: u.id, name: u.name, isGuest: u.isGuest, accountId: u.accountId || null };
    }),
    setLegacyClientId: st((id, legacyClientId) => {
      if (!legacyClientId) return;
      const u = db.users.find(u => u.id === id);
      if (u && !u.legacyClientId) { u.legacyClientId = legacyClientId; save(); }
    }),

    // ---------- accounts ----------
    createAccount: st(({ email, passwordHash, name, ageCategory, interests }) => {
      if (db.accounts.some(a => a.email === email && !a.deleted)) throw Object.assign(new Error('That email already has an account. Sign in instead.'), { status: 409 });
      const a = {
        id: uuidV4(), email, passwordHash, name, ageCategory: ageCategory || 'adult', deleted: false, createdAt: new Date().toISOString(),
        bio: '', interests: Array.isArray(interests) ? interests.slice(0, 3).map(x => String(x).slice(0, 40)) : [],
        skills: [], goals: '', city: '', availability: [], mode: 'both', avatar: null, avatarStatus: null
      };
      db.accounts.push(a); save();
      return accountPublic(a);
    }),
    getAccountByEmail: st(email => {
      const a = db.accounts.find(a => a.email === email);
      return a ? { ...accountPublic(a), passwordHash: a.passwordHash } : null;
    }),
    getAccountById: st(id => {
      const a = db.accounts.find(a => a.id === id);
      return a ? accountPublic(a) : null;
    }),
    updateAccount: st((id, fields) => {
      const a = db.accounts.find(a => a.id === id);
      if (!a) throw new Error('Account not found');
      if (fields.name !== undefined) a.name = String(fields.name);
      if (fields.passwordHash !== undefined) a.passwordHash = String(fields.passwordHash);
      if (fields.ageCategory !== undefined) a.ageCategory = String(fields.ageCategory);
      if (fields.deleted !== undefined) a.deleted = !!fields.deleted;
      if (fields.bio !== undefined) a.bio = String(fields.bio || '').slice(0, 300);
      if (fields.interests !== undefined) a.interests = (Array.isArray(fields.interests) ? fields.interests : []).slice(0, 3).map(x => String(x).slice(0, 40));
      if (fields.skills !== undefined) a.skills = (Array.isArray(fields.skills) ? fields.skills : []).slice(0, 12);
      if (fields.goals !== undefined) a.goals = String(fields.goals || '').slice(0, 300);
      if (fields.city !== undefined) a.city = String(fields.city || '').slice(0, 60);
      if (fields.availability !== undefined) a.availability = (Array.isArray(fields.availability) ? fields.availability : []).slice(0, 7).map(x => String(x).slice(0, 12).toLowerCase());
      if (fields.mode !== undefined) a.mode = ['both', 'in-person', 'online'].includes(fields.mode) ? fields.mode : 'both';
      if (fields.avatar !== undefined) a.avatar = fields.avatar || null;
      if (fields.avatarStatus !== undefined) a.avatarStatus = fields.avatarStatus || null;
      if (a.deleted) { a.email = 'deleted+' + a.id + '@invalid'; a.passwordHash = 'deleted'; a.name = 'Deleted account'; a.avatar = null; a.bio = ''; a.goals = ''; for (const u of db.users) if (u.accountId === a.id) u.accountId = null; }
      save();
      return accountPublic(a);
    }),
    // Real member search: name, interests, goals and skills of non-deleted accounts.
    listPeople: st(({ query, viewerAccountId }) => {
      const q = String(query || '').toLowerCase().trim();
      let list = db.accounts.filter(a => !a.deleted).map(a => { const { email, ...p } = accountPublic(a); return p; });
      if (q) list = list.filter(p => [p.name, p.bio, p.goals, p.city, ...(p.interests || []), ...(p.skillLabels || [])].filter(Boolean).join(' ').toLowerCase().includes(q));
      return list.filter(p => p.id !== viewerAccountId).sort((a, b) => a.name.localeCompare(b.name)).slice(0, 24);
    }),
    adoptAccount: st((userId, accountId) => {
      const u = db.users.find(u => u.id === userId);
      if (u) { u.accountId = accountId; u.isGuest = false; }
      for (const r of db.rooms) {
        for (const m of r.members) if (!m.byAccount && m.id === userId) { m.byAccount = true; m.id = accountId; }
        if (r.ownerUserId === userId && !r.ownerAccountId) { r.ownerAccountId = accountId; r.ownerUserId = null; }
      }
      save();
    }),

    // ---------- rooms / groups ----------
    listRoomsForUser: st(user => {
      return db.rooms
        .filter(r => r.members.some(m => pidMatch(m, user)) || (r.ownerAccountId && r.ownerAccountId === user.accountId) || (!user.accountId && r.ownerUserId === user.id) || (user.legacyClientId && r.legacyClientId === user.legacyClientId))
        .map(r => ({ id: r.id, title: r.title, goal: r.goal, createdAt: r.createdAt, messageCount: (r.messages || []).length, lastMessageAt: r.messages && r.messages.length ? r.messages[r.messages.length - 1].ts : null, memberCount: r.members.length + (r.demoMembers || []).length, capacity: r.capacity || 12, visibility: r.visibility || 'public', aiMode: r.aiMode || 'off', demo: !!r.demo }))
        .sort((a, b) => a.createdAt < b.createdAt ? 1 : -1);
    }),
    getRoomRaw,
    findRoomByInvite: st(code => { const c = String(code || '').trim(); const r = db.rooms.find(r => r.inviteCode === c); return r ? getRoomRaw(r.id) : null; }),
    canAccessRoom: st((room, user) => {
      if (!user) return false;
      if (user.accountId && room.ownerAccountId === user.accountId) return true;
      if (!user.accountId && room.ownerUserId === user.id) return true;
      return (room.members || []).some(m => pidMatch(m, user));
    }),
    memberRole: st((room, user) => {
      const m = (room.members || []).find(m => pidMatch(m, user));
      return m ? (m.role || 'member') : null;
    }),
    addRoomMember: st((room, user, role = 'member') => {
      const r = db.rooms.find(r => r.id === room.id);
      if (!r) return;
      if (!r.members.some(m => pidMatch(m, user))) { r.members.push({ id: user.accountId || user.id, byAccount: !!user.accountId, name: user.name || 'Member', role, joinedAt: new Date().toISOString(), ageCategory: user.ageCategory || null }); save(); }
    }),
    removeMember: st((room, _user, targetPid) => {
      const r = db.rooms.find(r => r.id === room.id);
      if (!r) return;
      const [uid, aid] = pidSplit(targetPid);
      r.members = r.members.filter(m => m.byAccount ? m.id !== aid : m.id !== uid);
      save();
    }),
    setMemberRole: st((room, targetPid, role) => {
      const r = db.rooms.find(r => r.id === room.id);
      if (!r) return;
      const [uid, aid] = pidSplit(targetPid);
      const m = r.members.find(m => m.byAccount ? m.id === aid : m.id === uid);
      if (m) { m.role = role; save(); }
    }),
    banMember: st((room, targetPid, reason) => {
      const [uid, aid] = pidSplit(targetPid);
      const r = db.rooms.find(r => r.id === room.id);
      if (!r) return;
      const existing = r.members.find(m => m.byAccount ? m.id === aid : m.id === uid);
      db.bans = db.bans.filter(b => !(b.roomId === room.id && b.userId === uid && b.accountId === aid));
      db.bans.push({ roomId: room.id, userId: uid, accountId: aid, reason: reason || null, createdAt: new Date().toISOString() });
      r.members = r.members.filter(m => m.byAccount ? m.id !== aid : m.id !== uid);
      db.joinRequests = db.joinRequests.filter(j => !(j.roomId === room.id && j.userId === uid && j.accountId === aid));
      save();
    }),
    unbanMember: st((room, targetPid) => {
      const [uid, aid] = pidSplit(targetPid);
      db.bans = db.bans.filter(b => !(b.roomId === room.id && b.userId === uid && b.accountId === aid));
      save();
    }),
    isBanned: st((room, user) => {
      const [uid, aid] = user.accountId ? [null, user.accountId] : [user.id, null];
      return db.bans.some(b => b.roomId === room.id && b.userId === uid && b.accountId === aid);
    }),
    listBans: st(room => db.bans.filter(b => b.roomId === room.id).map(b => {
      const name = (b.accountId && db.accounts.find(a => a.id === b.accountId)?.name) || (b.userId && db.users.find(u => u.id === b.userId)?.name) || 'Former member';
      return { pid: b.accountId ? 'a:' + b.accountId : b.userId, name, reason: b.reason, createdAt: b.createdAt };
    })),
    memberCount: st(roomId => { const r = db.rooms.find(r => r.id === roomId); return r ? r.members.length : 0; }),
    requestJoin: st((room, user, name, ageCategory) => {
      const [uid, aid] = user.accountId ? [null, user.accountId] : [user.id, null];
      if (!db.joinRequests.some(j => j.roomId === room.id && j.userId === uid && j.accountId === aid)) {
        db.joinRequests.push({ roomId: room.id, userId: uid, accountId: aid, name, ageCategory: ageCategory || null, status: 'pending', createdAt: new Date().toISOString() });
        save();
      }
    }),
    listJoinRequests: st(room => db.joinRequests.filter(j => j.roomId === room.id && j.status === 'pending').map(j => ({ pid: j.accountId ? 'a:' + j.accountId : j.userId, name: j.name, ageCategory: j.ageCategory, status: j.status, createdAt: j.createdAt }))),
    decideJoinRequest: st((room, targetPid, approve) => {
      const [uid, aid] = pidSplit(targetPid);
      const j = db.joinRequests.find(x => x.roomId === room.id && x.userId === uid && x.accountId === aid);
      if (!j) return;
      j.status = approve ? 'approved' : 'declined';
      if (approve) {
        const r = db.rooms.find(r => r.id === room.id);
        if (r && !r.members.some(m => m.byAccount ? m.id === aid : m.id === uid)) r.members.push({ id: aid || uid, byAccount: !!aid, name: j.name, role: 'member', joinedAt: new Date().toISOString(), ageCategory: j.ageCategory });
      }
      save();
    }),
    myJoinRequestStatus: st((room, user) => {
      const [uid, aid] = user.accountId ? [null, user.accountId] : [user.id, null];
      const j = db.joinRequests.find(x => x.roomId === room.id && x.userId === uid && x.accountId === aid);
      return j ? j.status : null;
    }),
    listPublicGroups: st(({ query, category, mode, city, hasSpace, ageCategory, viewerPrincipal }) => {
      // Only groups the viewer could actually join: public, real, inside their age scope, and not one
      // they are already in. Your own groups live in My groups, not in a list of things to join.
      const viewerPid = viewerPrincipal ? 'a:' + viewerPrincipal : null;
      let list = db.rooms.filter(r => (r.visibility || 'public') === 'public' && !r.demo && (!r.ageScope || r.ageScope === ageCategory))
        .filter(r => !viewerPid || !r.members.some(m => memberPid(m) === viewerPid))
        .map(r => ({ id: r.id, title: r.title, goal: r.goal, description: r.description || null, category: r.category || null, joinMode: r.joinMode || 'open', capacity: r.capacity || 12, memberCount: r.members.length + (r.demoMembers || []).length, onlineOnly: !!r.onlineOnly, city: r.city || null, ageScope: r.ageScope || null, createdAt: r.createdAt }));
      const q = (query || '').toLowerCase();
      if (q) list = list.filter(r => [r.title, r.goal, r.description, r.category].filter(Boolean).join(' ').toLowerCase().includes(q));
      if (category) list = list.filter(r => r.category === category);
      if (mode) list = list.filter(r => mode === 'online' ? r.onlineOnly : !r.onlineOnly);
      if (city) list = list.filter(r => (r.city || '').toLowerCase() === city.toLowerCase());
      if (hasSpace) list = list.filter(r => r.memberCount < r.capacity);
      return list.sort((a, b) => a.createdAt < b.createdAt ? 1 : -1).slice(0, 100);
    }),
    setRoomFields: st((roomId, fields) => {
      const r = db.rooms.find(r => r.id === roomId);
      if (!r) return;
      for (const k of ['title', 'description', 'category', 'visibility', 'joinMode', 'aiMode', 'capacity']) if (fields[k] !== undefined) r[k] = fields[k];
      save();
    }),
    transferOwnership: st((roomId, newOwnerPid) => {
      const r = db.rooms.find(r => r.id === roomId);
      if (!r) return;
      const [uid, aid] = pidSplit(newOwnerPid);
      const m = r.members.find(m => m.byAccount ? m.id === aid : m.id === uid);
      if (m) m.role = 'owner';
      r.ownerAccountId = aid; r.ownerUserId = aid ? null : uid;
      save();
    }),
    createRoom: st(o => {
      if (o.requestId) {
        const dup = db.rooms.find(r => r.requestId === o.requestId);
        if (dup) return { room: getRoomRaw(dup.id), duplicate: true };
      }
      db.rooms.push({
        id: o.id, inviteCode: o.inviteCode, requestId: o.requestId || null, title: o.title, goal: o.goal,
        description: o.description || null, category: o.category || null, visibility: o.visibility || 'public',
        joinMode: o.joinMode || 'open', capacity: o.capacity || 12, onlineOnly: !!o.onlineOnly, city: o.city || null,
        ageScope: o.ageScope || null, demo: !!o.demo, aiMode: o.aiMode || 'off',
        ownerUserId: o.ownerUserId || null, ownerAccountId: o.ownerAccountId || null,
        legacyClientId: o.legacyClientId || null, demoMembers: o.demoMembers || [],
        createdAt: new Date().toISOString(), members: [], messages: []
      });
      if (o.ownerUserId || o.ownerAccountId) {
        db.rooms[db.rooms.length - 1].members.push({ id: o.ownerAccountId || o.ownerUserId, byAccount: !!o.ownerAccountId, name: o.ownerName || 'Member', role: 'owner', joinedAt: new Date().toISOString(), ageCategory: o.ownerAgeCategory || null });
      }
      save();
      return { room: getRoomRaw(o.id), duplicate: false };
    }),

    // ---------- messages ----------
    addMessage: st((room, { userId, accountId, authorName, text, kind, clientMsgId }) => {
      const r = db.rooms.find(x => x.id === room.id);
      if (!r) throw new Error('Room not found');
      if (clientMsgId) {
        const dup = r.messages.find(m => m.clientMsgId === clientMsgId);
        if (dup) return Object.assign({}, dup, { duplicate: true });
      }
      const msg = { id: uuidV4(), authorId: userId || null, authorAccountId: accountId || null, authorName, kind: kindOf(kind), text, clientMsgId: clientMsgId || null, ts: new Date().toISOString() };
      r.messages.push(msg); save();
      return Object.assign({}, msg, { duplicate: false });
    }),
    listMessagesAfter: st((room, afterIso) => {
      if (!afterIso) return room.messages || [];
      const t = Date.parse(afterIso);
      if (Number.isNaN(t)) return room.messages || [];
      return (room.messages || []).filter(m => Date.parse(m.ts) > t);
    }),

    // ---------- reports / blocks / moderation log ----------
    addReport: st(o => {
      const rep = { id: uuidV4(), reporterUserId: o.reporterUser.accountId ? null : o.reporterUser.id, reporterAccountId: o.reporterUser.accountId || null, roomId: o.roomId || null, messageId: o.messageId || null, messageText: o.messageText || null, targetPid: o.targetPid || null, reason: o.reason, details: o.details || null, status: o.status || 'open', createdAt: new Date().toISOString() };
      db.reports.push(rep); save();
      return { id: rep.id };
    }),
    listReports: st((limit = 50) => db.reports.slice(-limit).reverse().map(r => ({ id: r.id, roomId: r.roomId, messageId: r.messageId, messageText: r.messageText, reason: r.reason, details: r.details, status: r.status, createdAt: r.createdAt, reporter: r.reporterAccountId ? 'a:' + r.reporterAccountId : (r.reporterUserId || null), target: r.targetPid || null }))),
    resolveReport: st((id, status) => { const r = db.reports.find(r => r.id === id); if (r) { r.status = status; save(); } }),
    addBlock: st((blockerUser, targetPid) => {
      const [buid, baid] = blockerUser.accountId ? [null, blockerUser.accountId] : [blockerUser.id, null];
      const [tuid, taid] = pidSplit(targetPid);
      if (!db.blocks.some(b => b.blockerUserId === buid && b.blockerAccountId === baid && b.blockedUserId === tuid && b.blockedAccountId === taid)) {
        db.blocks.push({ blockerUserId: buid, blockerAccountId: baid, blockedUserId: tuid, blockedAccountId: taid, createdAt: new Date().toISOString() });
        save();
      }
    }),
    isBlockedBetween: st((userA, pidB) => {
      const [auid, aaid] = userA.accountId ? [null, userA.accountId] : [userA.id, null];
      const [tuid, taid] = pidSplit(pidB);
      return db.blocks.some(b => (b.blockerUserId === auid && b.blockerAccountId === aaid && b.blockedUserId === tuid && b.blockedAccountId === taid) || (b.blockerUserId === tuid && b.blockerAccountId === taid && b.blockedUserId === auid && b.blockedAccountId === aaid));
    }),
    addModAction: st(o => {
      db.modActions.push({ id: uuidV4(), actorUserId: o.actorUser.accountId ? null : o.actorUser.id, actorAccountId: o.actorUser.accountId || null, roomId: o.roomId || null, targetPid: o.targetPid || null, action: o.action, reason: o.reason || null, createdAt: new Date().toISOString() });
      save();
    }),
    listModActions: st((limit = 50) => db.modActions.slice(-limit).reverse().map(a => ({ actor: a.actorAccountId ? 'a:' + a.actorAccountId : a.actorUserId, roomId: a.roomId, target: a.targetPid, action: a.action, reason: a.reason, createdAt: a.createdAt }))),

    // ---------- AI usage / budget ----------
    addAiUsage: st(o => { db.aiUsage.push({ id: uuidV4(), feature: o.feature, model: o.model || null, promptTokens: o.promptTokens || 0, completionTokens: o.completionTokens || 0, estCost: o.estCost == null ? null : o.estCost, createdAt: new Date().toISOString() }); save(); }),
    aiUsageTotals: st(() => {
      const dayAgo = Date.now() - 24 * 3600 * 1000;
      return {
        calls: db.aiUsage.length,
        promptTokens: db.aiUsage.reduce((s, u) => s + (u.promptTokens || 0), 0),
        completionTokens: db.aiUsage.reduce((s, u) => s + (u.completionTokens || 0), 0),
        estCost: db.aiUsage.reduce((s, u) => s + (u.estCost || 0), 0),
        callsToday: db.aiUsage.filter(u => Date.parse(u.createdAt) > dayAgo).length
      };
    })
  };
};
