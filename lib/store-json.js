'use strict';
// JSON-file storage with atomic writes. One writer (this process). Used when DATABASE_URL is not set.
const fs = require('fs');
const path = require('path');
// On Vercel the project folder is read-only; /tmp works but is not shared between instances
// (the browser keeps its own copy of groups in that mode, see public/app.js).
const FILE = process.env.KNOT_DB_PATH
  || (process.env.VERCEL ? path.join(require('os').tmpdir(), 'knot-db.json') : path.join(__dirname, '..', 'data', 'db.json'));

let db = { rooms: [] };
try {
  db = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  if (!Array.isArray(db.rooms)) db.rooms = [];
} catch { /* fresh db */ }

// Upgrade pre-shared-backend rooms (owner kept a clientId and one members array) to the new shape.
db.rooms.forEach(r => {
  if (r.clientId && !r.inviteCode) {
    r.inviteCode = require('crypto').randomBytes(4).toString('hex');
    r.legacyClientId = r.clientId;
    delete r.clientId;
    r.demoMembers = (r.members || []).filter(m => !m.you);
    r.memberUserIds = [];
    delete r.members;
    delete r.ownerName;
  }
});

function save() {
  try {
    fs.writeFileSync(FILE + '.tmp', JSON.stringify(db, null, 2));
    fs.renameSync(FILE + '.tmp', FILE);
  } catch (e) { console.error('Could not save data:', e.message); }
}

const nowISO = () => new Date().toISOString();

async function ensureUser(sid) {
  let u = db.users && db.users.find(x => x.sessionId === sid);
  if (u) return { id: u.id, name: u.name, isGuest: !!u.isGuest, legacyClientId: u.legacyClientId || null };
  u = { id: 'u_' + sid.slice(0, 16), sessionId: sid, name: 'Guest ' + Math.floor(1000 + Math.random() * 9000), isGuest: true, legacyClientId: null, createdAt: nowISO() };
  db.users = db.users || []; db.users.push(u); save();
  return { id: u.id, name: u.name, isGuest: true, legacyClientId: null };
}
async function updateUser(id, fields) {
  const u = (db.users || []).find(x => x.id === id);
  if (!u) throw new Error('User not found');
  Object.assign(u, fields); save();
  return { id: u.id, name: u.name, isGuest: !!u.isGuest, legacyClientId: u.legacyClientId || null };
}
async function setLegacyClientId(id, legacyClientId) {
  const u = (db.users || []).find(x => x.id === id);
  if (u && legacyClientId && !u.legacyClientId) { u.legacyClientId = legacyClientId; save(); }
}

function brief(r) {
  const last = r.messages[r.messages.length - 1];
  return { id: r.id, title: r.title, goal: r.goal, createdAt: r.createdAt, messageCount: r.messages.length, lastMessageAt: last ? last.ts : null, memberCount: r.memberUserIds.length + r.demoMembers.length };
}
function roomVisibleTo(r, user) {
  return r.ownerUserId === user.id || (r.memberUserIds || []).includes(user.id) || (user.legacyClientId && r.legacyClientId === user.legacyClientId);
}
async function listRoomsForUser(user) {
  return db.rooms.filter(r => roomVisibleTo(r, user)).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(brief);
}
async function getRoomRaw(roomId) {
  return db.rooms.find(r => r.id === roomId) || null;
}
async function findRoomByInvite(code) {
  const c = String(code || '').trim().toLowerCase();
  return db.rooms.find(r => r.inviteCode.toLowerCase() === c) || null;
}
async function canAccessRoom(room, user) {
  return roomVisibleTo(room, user);
}
async function addRoomMember(room, user) {
  room.memberUserIds = room.memberUserIds || [];
  if (!room.memberUserIds.includes(user.id)) {
    room.memberUserIds.push(user.id);
    room.memberNames = room.memberNames || {};
    room.memberNames[user.id] = user.name || 'Member';
    save();
  }
}
async function createRoom({ id, inviteCode, requestId, title, goal, ownerUserId, ownerName, legacyClientId, demoMembers }) {
  if (requestId) {
    const dup = db.rooms.find(r => r.requestId === requestId);
    if (dup) return { room: dup, duplicate: true };
  }
  const room = { id, requestId: requestId || null, inviteCode, title, goal, ownerUserId: ownerUserId || null, ownerName: ownerName || null, legacyClientId: legacyClientId || null, createdAt: nowISO(), demoMembers, memberUserIds: ownerUserId ? [ownerUserId] : [], memberNames: ownerUserId ? { [ownerUserId]: ownerName || 'Member' } : {}, messages: [] };
  db.rooms.push(room); save();
  return { room, duplicate: false };
}
async function addMessage(room, { userId, authorName, text, kind }) {
  const msg = { id: require('crypto').randomUUID(), authorId: userId, authorName, text, kind: kind === 'assistant' ? 'assistant' : 'user', ts: nowISO() };
  room.messages.push(msg); save();
  return msg;
}
async function listMessagesAfter(room, afterIso) {
  if (!afterIso) return room.messages;
  const t = Date.parse(afterIso);
  if (Number.isNaN(t)) return room.messages;
  return room.messages.filter(m => Date.parse(m.ts) > t);
}

module.exports = {
  kind: 'file', save,
  ensureUser, updateUser, setLegacyClientId,
  listRoomsForUser, getRoomRaw, findRoomByInvite, canAccessRoom, addRoomMember, createRoom,
  addMessage, listMessagesAfter
};
