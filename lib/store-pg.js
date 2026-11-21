'use strict';
// Postgres storage (Supabase or any Postgres). Used when DATABASE_URL is set.
// All app data lives in shared tables, so every computer/serverless instance sees the same rooms and messages.
// Access is enforced by the server (session cookies + membership checks), not by Postgres roles;
// the app connects with one server-side connection string that is never sent to the browser.
const postgres = require('postgres');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS knot_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id text UNIQUE,
  legacy_client_id text,
  name text NOT NULL,
  is_guest boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS knot_rooms (
  id text PRIMARY KEY,
  invite_code text UNIQUE NOT NULL,
  request_id text UNIQUE,
  title text NOT NULL,
  goal text NOT NULL,
  owner_user_id uuid REFERENCES knot_users(id),
  legacy_client_id text,
  demo_members jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS knot_room_members (
  room_id text NOT NULL REFERENCES knot_rooms(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES knot_users(id),
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (room_id, user_id)
);
CREATE TABLE IF NOT EXISTS knot_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id text NOT NULL REFERENCES knot_rooms(id) ON DELETE CASCADE,
  user_id uuid REFERENCES knot_users(id),
  author_name text NOT NULL,
  kind text NOT NULL DEFAULT 'user',
  text text NOT NULL,
  ts timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_knot_messages_room_ts ON knot_messages (room_id, ts);
`;

function connect(url) {
  const isPooler = /pooler\./.test(url) || /:6543\//.test(url);
  return postgres(url, {
    prepare: false,           // transaction poolers do not support prepared statements
    max: isPooler ? 5 : 10,
    idle_timeout: 20,
    connect_timeout: 10,
    onnotice: () => {}
  });
}

module.exports = function makePgStore(url) {
  const sql = connect(url);
  let ready = null;
  const init = () => (ready = ready || sql.unsafe(SCHEMA).then(() => {}, e => { ready = null; throw e; }));
  const uuid = () => sql`SELECT gen_random_uuid() AS id`.then(r => r[0].id);

  return {
    kind: 'postgres',
    async ensureUser(sid) {
      await init();
      const rows = await sql`INSERT INTO knot_users (session_id, name, is_guest)
        VALUES (${sid}, ${'Guest ' + Math.floor(1000 + Math.random() * 9000)}, true)
        ON CONFLICT (session_id) DO UPDATE SET session_id = EXCLUDED.session_id
        RETURNING id, name, is_guest, legacy_client_id`;
      const u = rows[0];
      return { id: u.id, name: u.name, isGuest: u.is_guest, legacyClientId: u.legacy_client_id || null };
    },
    async updateUser(id, fields) {
      await init();
      const sets = [];
      if (fields.name !== undefined) sets.push(sql`name = ${fields.name}`);
      if (fields.isGuest !== undefined) sets.push(sql`is_guest = ${fields.isGuest}`);
      if (!sets.length) {
        const cur = await sql`SELECT id, name, is_guest, legacy_client_id FROM knot_users WHERE id = ${id}`;
        if (!cur.length) throw new Error('User not found');
        return { id: cur[0].id, name: cur[0].name, isGuest: cur[0].is_guest, legacyClientId: cur[0].legacy_client_id || null };
      }
      const rows = await sql`UPDATE knot_users SET ${sql.join(sets, sql`, `)} WHERE id = ${id} RETURNING id, name, is_guest, legacy_client_id`;
      if (!rows.length) throw new Error('User not found');
      return { id: rows[0].id, name: rows[0].name, isGuest: rows[0].is_guest, legacyClientId: rows[0].legacy_client_id || null };
    },
    async setLegacyClientId(id, legacyClientId) {
      if (!legacyClientId) return;
      await init();
      await sql`UPDATE knot_users SET legacy_client_id = COALESCE(legacy_client_id, ${legacyClientId}) WHERE id = ${id}`;
    },
    async listRoomsForUser(user) {
      await init();
      const rows = await sql`
        SELECT r.id, r.title, r.goal, r.created_at,
          (SELECT count(*) FROM knot_messages m WHERE m.room_id = r.id)::int AS message_count,
          (SELECT max(m.ts) FROM knot_messages m WHERE m.room_id = r.id) AS last_message_at,
          (SELECT count(*) FROM knot_room_members mm WHERE mm.room_id = r.id)::int + jsonb_array_length(r.demo_members) AS member_count
        FROM knot_rooms r
        LEFT JOIN knot_room_members mm ON mm.room_id = r.id AND mm.user_id = ${user.id}
        WHERE mm.user_id IS NOT NULL OR r.owner_user_id = ${user.id}
           OR (${user.legacyClientId || null}::text IS NOT NULL AND r.legacy_client_id = ${user.legacyClientId || null})
        ORDER BY r.created_at DESC`;
      return rows.map(r => ({ id: r.id, title: r.title, goal: r.goal, createdAt: r.created_at.toISOString(), messageCount: r.message_count, lastMessageAt: r.last_message_at ? r.last_message_at.toISOString() : null, memberCount: r.member_count }));
    },
    async getRoomRaw(roomId) {
      await init();
      const rows = await sql`SELECT * FROM knot_rooms WHERE id = ${roomId}`;
      if (!rows.length) return null;
      const r = rows[0];
      const members = await sql`
        SELECT u.id, u.name FROM knot_room_members mm JOIN knot_users u ON u.id = mm.user_id
        WHERE mm.room_id = ${roomId} ORDER BY mm.joined_at`;
      return {
        id: r.id, inviteCode: r.invite_code, requestId: r.request_id, title: r.title, goal: r.goal,
        ownerUserId: r.owner_user_id, legacyClientId: r.legacy_client_id,
        createdAt: r.created_at.toISOString(),
        demoMembers: r.demo_members || [],
        memberUserIds: members.map(m => m.id),
        memberNames: Object.fromEntries(members.map(m => [m.id, m.name])),
        messages: (await sql`SELECT id, user_id AS "authorId", author_name AS "authorName", kind, text, ts FROM knot_messages WHERE room_id = ${roomId} ORDER BY ts`)
          .map(m => ({ id: m.id, authorId: m.authorId, authorName: m.authorName, kind: m.kind, text: m.text, ts: m.ts.toISOString() }))
      };
    },
    async findRoomByInvite(code) {
      await init();
      const rows = await sql`SELECT id FROM knot_rooms WHERE lower(invite_code) = ${String(code || '').trim().toLowerCase()}`;
      return rows.length ? this.getRoomRaw(rows[0].id) : null;
    },
    async canAccessRoom(room, user) {
      if (room.ownerUserId === user.id || (room.memberUserIds || []).includes(user.id)) return true;
      if (user.legacyClientId && room.legacyClientId === user.legacyClientId) return true;
      return false;
    },
    async addRoomMember(room, user) {
      await init();
      await sql`INSERT INTO knot_room_members (room_id, user_id) VALUES (${room.id}, ${user.id}) ON CONFLICT DO NOTHING`;
    },
    async createRoom({ id, inviteCode, requestId, title, goal, ownerUserId, ownerName, legacyClientId, demoMembers }) {
      await init();
      if (requestId) {
        const dup = await sql`SELECT id FROM knot_rooms WHERE request_id = ${requestId}`;
        if (dup.length) return { room: await this.getRoomRaw(dup[0].id), duplicate: true };
      }
      await sql`INSERT INTO knot_rooms (id, invite_code, request_id, title, goal, owner_user_id, legacy_client_id, demo_members)
        VALUES (${id}, ${inviteCode}, ${requestId || null}, ${title}, ${goal}, ${ownerUserId || null}, ${legacyClientId || null}, ${sql.json(demoMembers)})
        ON CONFLICT (request_id) DO NOTHING`;
      if (ownerUserId) {
        await sql`INSERT INTO knot_users (id, name, is_guest) VALUES (${ownerUserId}, ${ownerName || 'Member'}, false) ON CONFLICT (id) DO NOTHING`;
        await sql`INSERT INTO knot_room_members (room_id, user_id) VALUES (${id}, ${ownerUserId}) ON CONFLICT DO NOTHING`;
      }
      return { room: await this.getRoomRaw(id), duplicate: false };
    },
    async addMessage(room, { userId, authorName, text, kind }) {
      await init();
      const msgId = await uuid();
      const rows = await sql`INSERT INTO knot_messages (id, room_id, user_id, author_name, kind, text)
        VALUES (${msgId}, ${room.id}, ${userId || null}, ${authorName}, ${kind === 'assistant' ? 'assistant' : 'user'}, ${text})
        RETURNING id, ts`;
      return { id: rows[0].id, authorId: userId, authorName, text, kind: kind === 'assistant' ? 'assistant' : 'user', ts: rows[0].ts.toISOString() };
    },
    async listMessagesAfter(room, afterIso) {
      if (!afterIso) return room.messages || [];
      const t = Date.parse(afterIso);
      if (Number.isNaN(t)) return room.messages || [];
      return (room.messages || []).filter(m => Date.parse(m.ts) > t);
    }
  };
};
