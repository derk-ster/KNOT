'use strict';
// Postgres storage (Supabase or any Postgres). Used when DATABASE_URL is set.
// All app data lives in shared tables, so every computer/serverless instance sees the same rooms and messages.
// Authorization is enforced by the server (session cookies + membership/role checks) on every operation;
// the app connects with one server-side connection string that is never sent to the browser.
// Schema is additive and created automatically; existing data is never dropped.
// Message kinds: a member's own words, the labeled KNOT AI assistant, or a fictional demo profile.
const kindOf = k => (k === 'assistant' || k === 'demo' ? k : 'user');
const postgres = require('postgres');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS knot_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id text UNIQUE,
  legacy_client_id text,
  name text NOT NULL,
  is_guest boolean NOT NULL DEFAULT true,
  account_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS knot_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL,
  password_hash text NOT NULL,
  name text NOT NULL,
  age_category text NOT NULL DEFAULT 'adult',
  deleted boolean NOT NULL DEFAULT false,
  bio text NOT NULL DEFAULT '',
  interests jsonb NOT NULL DEFAULT '[]'::jsonb,
  skills jsonb NOT NULL DEFAULT '[]'::jsonb,
  goals text NOT NULL DEFAULT '',
  city text NOT NULL DEFAULT '',
  availability jsonb NOT NULL DEFAULT '[]'::jsonb,
  mode text NOT NULL DEFAULT 'both',
  avatar text,
  avatar_status text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS knot_rooms (
  id text PRIMARY KEY,
  invite_code text UNIQUE NOT NULL,
  request_id text UNIQUE,
  title text NOT NULL,
  goal text NOT NULL,
  description text,
  category text,
  visibility text NOT NULL DEFAULT 'public',
  join_mode text NOT NULL DEFAULT 'open',
  capacity int NOT NULL DEFAULT 12,
  online_only boolean NOT NULL DEFAULT false,
  city text,
  age_scope text,
  demo boolean NOT NULL DEFAULT false,
  ai_mode text NOT NULL DEFAULT 'off',
  owner_user_id uuid,
  owner_account_id uuid,
  legacy_client_id text,
  demo_members jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS knot_room_members (
  room_id text NOT NULL REFERENCES knot_rooms(id) ON DELETE CASCADE,
  user_id uuid REFERENCES knot_users(id),
  account_id uuid REFERENCES knot_accounts(id),
  role text NOT NULL DEFAULT 'member',
  joined_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS knot_room_bans (
  room_id text NOT NULL REFERENCES knot_rooms(id) ON DELETE CASCADE,
  user_id uuid,
  account_id uuid,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS knot_join_requests (
  room_id text NOT NULL REFERENCES knot_rooms(id) ON DELETE CASCADE,
  user_id uuid,
  account_id uuid,
  name text NOT NULL,
  age_category text,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS knot_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id text NOT NULL REFERENCES knot_rooms(id) ON DELETE CASCADE,
  user_id uuid,
  account_id uuid,
  author_name text NOT NULL,
  kind text NOT NULL DEFAULT 'user',
  text text NOT NULL,
  client_msg_id text,
  ts timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_knot_messages_room_ts ON knot_messages (room_id, ts);
CREATE TABLE IF NOT EXISTS knot_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_user_id uuid,
  reporter_account_id uuid,
  room_id text,
  message_id uuid,
  message_text text,
  target_user_id uuid,
  target_account_id uuid,
  reason text NOT NULL,
  details text,
  status text NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS knot_blocks (
  blocker_user_id uuid,
  blocker_account_id uuid,
  blocked_user_id uuid,
  blocked_account_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS knot_moderation_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid,
  actor_account_id uuid,
  room_id text,
  target_user_id uuid,
  target_account_id uuid,
  action text NOT NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS knot_ai_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feature text NOT NULL,
  model text,
  prompt_tokens int,
  completion_tokens int,
  est_cost numeric,
  created_at timestamptz NOT NULL DEFAULT now()
);
`;

// Additive migrations for databases created by an older version: add what is missing, drop nothing.
const MIGRATIONS = `
ALTER TABLE knot_accounts ADD COLUMN IF NOT EXISTS bio text NOT NULL DEFAULT '';
ALTER TABLE knot_accounts ADD COLUMN IF NOT EXISTS interests jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE knot_accounts ADD COLUMN IF NOT EXISTS skills jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE knot_accounts ADD COLUMN IF NOT EXISTS goals text NOT NULL DEFAULT '';
ALTER TABLE knot_accounts ADD COLUMN IF NOT EXISTS city text NOT NULL DEFAULT '';
ALTER TABLE knot_accounts ADD COLUMN IF NOT EXISTS availability jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE knot_accounts ADD COLUMN IF NOT EXISTS mode text NOT NULL DEFAULT 'both';
ALTER TABLE knot_accounts ADD COLUMN IF NOT EXISTS avatar text;
ALTER TABLE knot_accounts ADD COLUMN IF NOT EXISTS avatar_status text;
ALTER TABLE knot_users ADD COLUMN IF NOT EXISTS account_id uuid;
ALTER TABLE knot_users ADD COLUMN IF NOT EXISTS legacy_client_id text;
ALTER TABLE knot_users ADD COLUMN IF NOT EXISTS is_guest boolean NOT NULL DEFAULT true;
ALTER TABLE knot_rooms ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE knot_rooms ADD COLUMN IF NOT EXISTS category text;
ALTER TABLE knot_rooms ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'public';
ALTER TABLE knot_rooms ADD COLUMN IF NOT EXISTS join_mode text NOT NULL DEFAULT 'open';
ALTER TABLE knot_rooms ADD COLUMN IF NOT EXISTS capacity int NOT NULL DEFAULT 12;
ALTER TABLE knot_rooms ADD COLUMN IF NOT EXISTS online_only boolean NOT NULL DEFAULT false;
ALTER TABLE knot_rooms ADD COLUMN IF NOT EXISTS city text;
ALTER TABLE knot_rooms ADD COLUMN IF NOT EXISTS age_scope text;
ALTER TABLE knot_rooms ADD COLUMN IF NOT EXISTS demo boolean NOT NULL DEFAULT false;
ALTER TABLE knot_rooms ADD COLUMN IF NOT EXISTS ai_mode text NOT NULL DEFAULT 'off';
ALTER TABLE knot_rooms ADD COLUMN IF NOT EXISTS owner_account_id uuid;
ALTER TABLE knot_room_members ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'member';
ALTER TABLE knot_room_members ADD COLUMN IF NOT EXISTS account_id uuid;
-- Membership, ban and join-request rows belong to an account or to an anonymous session user,
-- never both, so one of the two columns is always empty. In a primary key that empty column is
-- NOT NULL in Postgres, which rejected every such row: nobody could create, join or be banned
-- from a group. Unique indexes do the same job and allow the empty side.
ALTER TABLE knot_room_members DROP CONSTRAINT IF EXISTS knot_room_members_pkey;
ALTER TABLE knot_room_members ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE knot_room_members ALTER COLUMN account_id DROP NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS knot_room_members_identity ON knot_room_members (room_id, user_id, account_id);
CREATE UNIQUE INDEX IF NOT EXISTS knot_room_members_account ON knot_room_members (room_id, account_id) WHERE account_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS knot_room_members_user ON knot_room_members (room_id, user_id) WHERE account_id IS NULL;
ALTER TABLE knot_room_bans DROP CONSTRAINT IF EXISTS knot_room_bans_pkey;
ALTER TABLE knot_room_bans ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE knot_room_bans ALTER COLUMN account_id DROP NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS knot_room_bans_identity ON knot_room_bans (room_id, user_id, account_id);
ALTER TABLE knot_join_requests DROP CONSTRAINT IF EXISTS knot_join_requests_pkey;
ALTER TABLE knot_join_requests ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE knot_join_requests ALTER COLUMN account_id DROP NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS knot_join_requests_identity ON knot_join_requests (room_id, user_id, account_id);
ALTER TABLE knot_messages ADD COLUMN IF NOT EXISTS client_msg_id text;
ALTER TABLE knot_messages ADD COLUMN IF NOT EXISTS account_id uuid;
-- Rooms created before accounts existed have no account owner; they are guest sandboxes and must
-- stay out of discovery and teen/adult mixing. Signed-in owners (and guests who later sign up)
-- get owner_account_id set by adoptAccount, which makes their rooms real groups again.
UPDATE knot_rooms SET demo = true WHERE owner_account_id IS NULL AND demo = false;
UPDATE knot_rooms SET age_scope = NULL WHERE demo = true;
`;

function connect(url) {
  const isPooler = /pooler\./.test(url) || /:6543\//.test(url);
  return postgres(url, { prepare: false, max: isPooler ? 5 : 10, idle_timeout: 20, connect_timeout: 10, onnotice: () => {} });
}

const { SKILL_BY_ID } = require('./match');
const cap2 = s => String(s).charAt(0).toUpperCase() + String(s).slice(1);
// What an account row looks like outside the auth layer. Password material is never included;
// avatars rejected by moderation are never exposed (pending ones are shown while awaiting review).
function accountOut(r) {
  const skills = (r.skills || []).filter(id => SKILL_BY_ID[id]);
  return {
    id: r.id, email: r.email, name: r.name, ageCategory: r.age_category, deleted: r.deleted,
    bio: r.bio || '', interests: r.interests || [], skills, skillLabels: skills.map(id => SKILL_BY_ID[id].label),
    goals: r.goals || '', city: r.city || '', availability: r.availability || [], mode: r.mode || 'both',
    avatar: (r.avatar_status === 'approved' || r.avatar_status === 'pending') ? (r.avatar || null) : null,
    avatarStatus: r.avatar_status || null,
    createdAt: r.created_at ? r.created_at.toISOString() : null
  };
}

module.exports = function makePgStore(url) {
  const sql = connect(url);
  let ready = null;
  const init = () => (ready = ready || sql.unsafe(SCHEMA).then(() => sql.unsafe(MIGRATIONS)).then(() => {}, e => { ready = null; throw e; }));
  const uuid = () => sql`SELECT gen_random_uuid() AS id`.then(r => r[0].id);
  // principal: what we key permissions and records on. Signed-in users key on their account
  // (identity follows them across devices); anonymous demo users key on the session user row.
  const P = user => user.accountId ? { user_col: sql`account_id`, user_val: user.accountId } : { user_col: sql`user_id`, user_val: user.id };

  return {
    kind: 'postgres',
    async ensureUser(sid) {
      if (!sid) throw new Error('Missing session id');
      await init();
      const rows = await sql`INSERT INTO knot_users (session_id, name, is_guest)
        VALUES (${sid}, ${'Guest ' + Math.floor(1000 + Math.random() * 9000)}, true)
        ON CONFLICT (session_id) DO UPDATE SET session_id = EXCLUDED.session_id
        RETURNING id, name, is_guest, account_id, legacy_client_id`;
      const u = rows[0];
      return { id: u.id, name: u.name, isGuest: u.is_guest, accountId: u.account_id || null, legacyClientId: u.legacy_client_id || null };
    },
    async updateUser(id, fields) {
      await init();
      // postgres.js has no sql.join, so a dynamic SET list is built as an object and handed to
      // sql(patch, ...columns), which renders "col" = $1, "col2" = $2.
      const patch = {};
      if (fields.name !== undefined) patch.name = fields.name;
      if (fields.accountId !== undefined) patch.account_id = fields.accountId;
      if (fields.isGuest !== undefined) patch.is_guest = fields.isGuest;
      const cols = Object.keys(patch);
      if (!cols.length) {
        const cur = await sql`SELECT id, name, is_guest, account_id FROM knot_users WHERE id = ${id}`;
        if (!cur.length) throw new Error('User not found');
        return { id: cur[0].id, name: cur[0].name, isGuest: cur[0].is_guest, accountId: cur[0].account_id || null };
      }
      const rows = await sql`UPDATE knot_users SET ${sql(patch, ...cols)} WHERE id = ${id} RETURNING id, name, is_guest, account_id`;
      if (!rows.length) throw new Error('User not found');
      return { id: rows[0].id, name: rows[0].name, isGuest: rows[0].is_guest, accountId: rows[0].account_id || null };
    },
    async setLegacyClientId(id, legacyClientId) {
      if (!legacyClientId) return;
      await init();
      await sql`UPDATE knot_users SET legacy_client_id = COALESCE(legacy_client_id, ${legacyClientId}) WHERE id = ${id}`;
    },

    // ---------- accounts ----------
    async createAccount({ email, passwordHash, name, ageCategory, interests }) {
      await init();
      const rows = await sql`INSERT INTO knot_accounts (email, password_hash, name, age_category, interests)
        VALUES (${email}, ${passwordHash}, ${name}, ${ageCategory || 'adult'}, ${sql.json((Array.isArray(interests) ? interests : []).slice(0, 3).map(x => String(x).slice(0, 40)))})
        ON CONFLICT (email) DO NOTHING RETURNING id, email, name, age_category, interests, created_at`;
      if (!rows.length) throw Object.assign(new Error('That email already has an account. Sign in instead.'), { status: 409 });
      const a = rows[0];
      return { id: a.id, email: a.email, name: a.name, ageCategory: a.age_category, interests: a.interests || [], skills: [], goals: '', bio: '', city: '', availability: [], mode: 'both', avatar: null, deleted: false, createdAt: a.created_at.toISOString() };
    },
    async getAccountByEmail(email) {
      await init();
      const rows = await sql`SELECT * FROM knot_accounts WHERE email = ${email}`;
      if (!rows.length) return null;
      return { ...accountOut(rows[0]), passwordHash: rows[0].password_hash };
    },
    async getAccountById(id) {
      await init();
      const rows = await sql`SELECT * FROM knot_accounts WHERE id = ${id}`;
      if (!rows.length) return null;
      return accountOut(rows[0]);
    },
    async updateAccount(id, fields) {
      await init();
      const patch = {};
      if (fields.name !== undefined) patch.name = fields.name;
      if (fields.passwordHash !== undefined) patch.password_hash = fields.passwordHash;
      if (fields.ageCategory !== undefined) patch.age_category = fields.ageCategory;
      if (fields.deleted !== undefined) patch.deleted = fields.deleted;
      if (fields.bio !== undefined) patch.bio = String(fields.bio || '').slice(0, 300);
      if (fields.interests !== undefined) patch.interests = sql.json((Array.isArray(fields.interests) ? fields.interests : []).slice(0, 3).map(x => String(x).slice(0, 40)));
      if (fields.skills !== undefined) patch.skills = sql.json((Array.isArray(fields.skills) ? fields.skills : []).slice(0, 12));
      if (fields.goals !== undefined) patch.goals = String(fields.goals || '').slice(0, 300);
      if (fields.city !== undefined) patch.city = String(fields.city || '').slice(0, 60);
      if (fields.availability !== undefined) patch.availability = sql.json((Array.isArray(fields.availability) ? fields.availability : []).slice(0, 7).map(x => String(x).slice(0, 12).toLowerCase()));
      if (fields.mode !== undefined) patch.mode = ['both', 'in-person', 'online'].includes(fields.mode) ? fields.mode : 'both';
      if (fields.avatar !== undefined) patch.avatar = fields.avatar || null;
      if (fields.avatarStatus !== undefined) patch.avatar_status = fields.avatarStatus || null;
      const cols = Object.keys(patch);
      if (!cols.length) return this.getAccountById(id);
      const rows = await sql`UPDATE knot_accounts SET ${sql(patch, ...cols)} WHERE id = ${id} RETURNING *`;
      if (!rows.length) throw new Error('Account not found');
      const a = rows[0];
      if (fields.deleted) {
        await sql`UPDATE knot_accounts SET email = 'deleted+' || id::text || '@invalid', password_hash = 'deleted', name = 'Deleted account', avatar = NULL, bio = '', goals = '' WHERE id = ${id}`;
        await sql`UPDATE knot_users SET account_id = NULL WHERE account_id = ${id}`;
      }
      return accountOut(a);
    },
    // Real member search: name, interests, goals, city and skills of non-deleted accounts.
    // The filter runs in SQL so avatar data URLs are only pulled for the matched rows.
    async listPeople({ query, viewerAccountId }) {
      await init();
      const q = String(query || '').toLowerCase().trim();
      const like = q ? '%' + q.replace(/[%_]/g, '') + '%' : null;
      const rows = await sql`SELECT * FROM knot_accounts
        WHERE NOT deleted AND id <> ${viewerAccountId || null}::uuid
          AND (${like}::text IS NULL OR name ILIKE ${like} OR bio ILIKE ${like} OR goals ILIKE ${like}
               OR city ILIKE ${like} OR interests::text ILIKE ${like} OR skills::text ILIKE ${like})
        ORDER BY name LIMIT 24`;
      return rows.map(r => { const { email, ...p } = accountOut(r); return p; });
    },
    async adoptAccount(userId, accountId) {
      await init();
      await sql`UPDATE knot_users SET account_id = ${accountId}, is_guest = false WHERE id = ${userId}`;
      // historical guest memberships/ownership of THIS session user now follow the account.
      // If the account is already in one of these rooms from another device, the guest row is the
      // duplicate: drop it first, otherwise the hand-over collides with the account unique index.
      await sql`DELETE FROM knot_room_members guest USING knot_room_members member
        WHERE guest.user_id = ${userId} AND guest.account_id IS NULL AND guest.room_id = member.room_id
          AND member.account_id = ${accountId}`;
      await sql`UPDATE knot_room_members SET account_id = ${accountId} WHERE user_id = ${userId} AND account_id IS NULL`;
      await sql`UPDATE knot_rooms SET owner_account_id = ${accountId} WHERE owner_user_id = ${userId} AND owner_account_id IS NULL`;
    },

    // ---------- rooms / groups ----------
    async listRoomsForUser(user) {
      await init();
      const rows = await sql`
        SELECT r.id, r.title, r.goal, r.created_at, r.capacity, r.visibility, r.ai_mode, r.demo,
          (SELECT count(*) FROM knot_messages m WHERE m.room_id = r.id)::int AS message_count,
          (SELECT max(m.ts) FROM knot_messages m WHERE m.room_id = r.id) AS last_message_at,
          (SELECT count(*) FROM knot_room_members mm WHERE mm.room_id = r.id)::int + jsonb_array_length(r.demo_members) AS member_count
        FROM knot_rooms r
        LEFT JOIN knot_room_members mm ON mm.room_id = r.id AND (mm.user_id = ${user.id} OR (${user.accountId || null}::uuid IS NOT NULL AND mm.account_id = ${user.accountId || null}::uuid))
        WHERE mm.user_id IS NOT NULL OR (${user.accountId || null}::uuid IS NOT NULL AND mm.account_id = ${user.accountId || null}::uuid)
           OR r.owner_user_id = ${user.id} OR (${user.accountId || null}::uuid IS NOT NULL AND r.owner_account_id = ${user.accountId || null}::uuid)
           OR (${user.legacyClientId || null}::text IS NOT NULL AND r.legacy_client_id = ${user.legacyClientId || null})
        ORDER BY r.created_at DESC`;
      return rows.map(r => ({ id: r.id, title: r.title, goal: r.goal, createdAt: r.created_at.toISOString(), messageCount: r.message_count, lastMessageAt: r.last_message_at ? r.last_message_at.toISOString() : null, memberCount: r.member_count, capacity: r.capacity, visibility: r.visibility, aiMode: r.ai_mode, demo: r.demo }));
    },
    async getRoomRaw(roomId) {
      await init();
      const rows = await sql`SELECT * FROM knot_rooms WHERE id = ${roomId}`;
      if (!rows.length) return null;
      const r = rows[0];
      const members = await sql`
        SELECT COALESCE(u.id::text, 'a:' || a.id::text) AS pid, COALESCE(a.name, u.name) AS name, mm.role,
               mm.account_id, mm.user_id, a.age_category,
               a.skills AS acct_skills, a.city AS acct_city, a.availability AS acct_availability,
               a.mode AS acct_mode, a.avatar AS acct_avatar, a.avatar_status AS acct_avatar_status
        FROM knot_room_members mm
        LEFT JOIN knot_users u ON u.id = mm.user_id
        LEFT JOIN knot_accounts a ON a.id = mm.account_id
        WHERE mm.room_id = ${roomId} ORDER BY mm.joined_at`;
      const demoMembers = (r.demo_members || []);
      const capacityUsed = members.length + demoMembers.length;
      return {
        id: r.id, inviteCode: r.invite_code, requestId: r.request_id, title: r.title, goal: r.goal,
        description: r.description, category: r.category, visibility: r.visibility, joinMode: r.join_mode,
        capacity: r.capacity, capacityUsed, onlineOnly: r.online_only, city: r.city, ageScope: r.age_scope,
        demo: r.demo, aiMode: r.ai_mode,
        ownerUserId: r.owner_user_id, ownerAccountId: r.owner_account_id, legacyClientId: r.legacy_client_id,
        createdAt: r.created_at.toISOString(),
        members: members.map(m => {
          const skills = (m.acct_skills || []).filter(id => SKILL_BY_ID[id]);
          const days = (m.acct_availability || []);
          return {
            pid: m.pid, id: m.account_id || m.user_id, byAccount: !!m.account_id, name: m.name, role: m.role, ageCategory: m.age_category || null, demo: false,
            city: m.acct_city || '', modeText: m.acct_mode ? ({ both: 'in person or online', 'in-person': 'in person only', online: 'online only' }[m.acct_mode]) : 'Joined member',
            skillLabels: skills.map(id => SKILL_BY_ID[id].label),
            availabilityDays: days.length ? days : null,
            availabilityText: days.length ? days.map(cap2).join(', ') : 'Not listed',
            avatar: (m.acct_avatar_status === 'approved' || m.acct_avatar_status === 'pending') ? m.acct_avatar : null
          };
        }),
        demoMembers,
        messages: (await sql`SELECT id, user_id AS "authorId", account_id AS "authorAccountId", author_name AS "authorName", kind, text, client_msg_id AS "clientMsgId", ts FROM knot_messages WHERE room_id = ${roomId} ORDER BY ts`)
          .map(m => ({ id: m.id, authorId: m.authorId, authorAccountId: m.authorAccountId, authorName: m.authorName, kind: m.kind, text: m.text, clientMsgId: m.clientMsgId, ts: m.ts.toISOString() }))
      };
    },
    async findRoomByInvite(code) {
      await init();
      const rows = await sql`SELECT id FROM knot_rooms WHERE invite_code = ${String(code || '').trim()}`;
      return rows.length ? this.getRoomRaw(rows[0].id) : null;
    },
    async canAccessRoom(room, user) {
      if (!user) return false;
      const pid = user.accountId ? String(user.accountId) : String(user.id);
      if (room.ownerAccountId && String(room.ownerAccountId) === pid) return true;
      if (!user.accountId && room.ownerUserId && String(room.ownerUserId) === String(user.id)) return true;
      return room.members.some(m => m.pid === pid || (!user.accountId && !m.byAccount && String(m.id) === String(user.id)));
    },
    async memberRole(room, user) {
      if (!user) return null;
      const pid = user.accountId ? String(user.accountId) : String(user.id);
      const m = room.members.find(m => m.pid === pid || (!user.accountId && !m.byAccount && String(m.id) === String(user.id)));
      return m ? m.role : null;
    },
    async addRoomMember(room, user, role = 'member') {
      await init();
      await sql`INSERT INTO knot_room_members (room_id, user_id, account_id, role)
        VALUES (${room.id}, ${user.accountId ? null : user.id}, ${user.accountId || null}, ${role})
        ON CONFLICT DO NOTHING`;
    },
    async removeMember(room, user, targetPid) {
      await init();
      if (targetPid.startsWith('a:')) await sql`DELETE FROM knot_room_members WHERE room_id = ${room.id} AND account_id = ${targetPid.slice(2)}::uuid`;
      else await sql`DELETE FROM knot_room_members WHERE room_id = ${room.id} AND user_id = ${targetPid}::uuid AND account_id IS NULL`;
    },
    async setMemberRole(room, targetPid, role) {
      await init();
      if (targetPid.startsWith('a:')) await sql`UPDATE knot_room_members SET role = ${role} WHERE room_id = ${room.id} AND account_id = ${targetPid.slice(2)}::uuid`;
      else await sql`UPDATE knot_room_members SET role = ${role} WHERE room_id = ${room.id} AND user_id = ${targetPid}::uuid AND account_id IS NULL`;
    },
    async banMember(room, targetPid, reason) {
      await init();
      const [uid, aid] = targetPid.startsWith('a:') ? [null, targetPid.slice(2)] : [targetPid, null];
      await sql`INSERT INTO knot_room_bans (room_id, user_id, account_id, reason) VALUES (${room.id}, ${uid}, ${aid}, ${reason || null})
        ON CONFLICT (room_id, user_id, account_id) DO UPDATE SET reason = EXCLUDED.reason`;
      await this.removeMember(room, null, targetPid);
      await sql`DELETE FROM knot_join_requests WHERE room_id = ${room.id} AND (user_id = ${uid}::uuid OR account_id = ${aid}::uuid)`;
    },
    async unbanMember(room, targetPid) {
      await init();
      const [uid, aid] = targetPid.startsWith('a:') ? [null, targetPid.slice(2)] : [targetPid, null];
      await sql`DELETE FROM knot_room_bans WHERE room_id = ${room.id} AND user_id IS NOT DISTINCT FROM ${uid}::uuid AND account_id IS NOT DISTINCT FROM ${aid}::uuid`;
    },
    async isBanned(room, user) {
      await init();
      const rows = await sql`SELECT 1 FROM knot_room_bans WHERE room_id = ${room.id} AND
        (user_id IS NOT DISTINCT FROM ${user.accountId ? null : user.id}::uuid AND account_id IS NOT DISTINCT FROM ${user.accountId || null}::uuid)`;
      return rows.length > 0;
    },
    async listBans(room) {
      await init();
      const rows = await sql`
        SELECT COALESCE('a:' || b.account_id::text, b.user_id::text) AS pid,
               COALESCE(a.name, u.name, 'Former member') AS name, b.reason, b.created_at
        FROM knot_room_bans b
        LEFT JOIN knot_users u ON u.id = b.user_id
        LEFT JOIN knot_accounts a ON a.id = b.account_id
        WHERE b.room_id = ${room.id} ORDER BY b.created_at DESC`;
      return rows.map(r => ({ pid: r.pid, name: r.name, reason: r.reason, createdAt: r.created_at.toISOString() }));
    },
    async memberCount(roomId) {
      const rows = await sql`SELECT count(*)::int + 0 AS n FROM knot_room_members WHERE room_id = ${roomId}`;
      return rows[0].n;
    },
    async requestJoin(room, user, name, ageCategory) {
      await init();
      const uid = user.accountId ? null : user.id, aid = user.accountId || null;
      await sql`INSERT INTO knot_join_requests (room_id, user_id, account_id, name, age_category)
        VALUES (${room.id}, ${uid}, ${aid}, ${name}, ${ageCategory || null}) ON CONFLICT DO NOTHING`;
    },
    async listJoinRequests(room) {
      await init();
      const rows = await sql`SELECT COALESCE('a:' || account_id::text, user_id::text) AS pid, name, age_category, status, created_at
        FROM knot_join_requests WHERE room_id = ${room.id} AND status = 'pending' ORDER BY created_at`;
      return rows.map(r => ({ pid: r.pid, name: r.name, ageCategory: r.age_category, status: r.status, createdAt: r.created_at.toISOString() }));
    },
    async decideJoinRequest(room, targetPid, approve) {
      await init();
      const [uid, aid] = targetPid.startsWith('a:') ? [null, targetPid.slice(2)] : [targetPid, null];
      if (approve) {
        await sql`UPDATE knot_join_requests SET status = 'approved' WHERE room_id = ${room.id} AND user_id IS NOT DISTINCT FROM ${uid}::uuid AND account_id IS NOT DISTINCT FROM ${aid}::uuid`;
        await sql`INSERT INTO knot_room_members (room_id, user_id, account_id, role) VALUES (${room.id}, ${uid}, ${aid}, 'member') ON CONFLICT DO NOTHING`;
      } else {
        await sql`UPDATE knot_join_requests SET status = 'declined' WHERE room_id = ${room.id} AND user_id IS NOT DISTINCT FROM ${uid}::uuid AND account_id IS NOT DISTINCT FROM ${aid}::uuid`;
      }
    },
    async myJoinRequestStatus(room, user) {
      await init();
      const rows = await sql`SELECT status FROM knot_join_requests WHERE room_id = ${room.id}
        AND user_id IS NOT DISTINCT FROM ${user.accountId ? null : user.id}::uuid AND account_id IS NOT DISTINCT FROM ${user.accountId || null}::uuid`;
      return rows.length ? rows[0].status : null;
    },
    async listPublicGroups({ query, category, mode, city, hasSpace, ageCategory, viewerPrincipal }) {
      await init();
      const rows = await sql`
        SELECT r.id, r.title, r.goal, r.description, r.category, r.visibility, r.join_mode, r.capacity,
               r.online_only, r.city, r.age_scope, r.demo, r.created_at,
               (SELECT count(*) FROM knot_room_members mm WHERE mm.room_id = r.id)::int + jsonb_array_length(r.demo_members) AS member_count
        FROM knot_rooms r
        WHERE r.visibility = 'public' AND NOT r.demo AND (r.age_scope = ${ageCategory} OR r.age_scope IS NULL)
          AND NOT EXISTS (SELECT 1 FROM knot_room_members mine WHERE mine.room_id = r.id AND mine.account_id = ${viewerPrincipal || null})
        ORDER BY r.created_at DESC LIMIT 100`;
      let list = rows.map(r => ({ id: r.id, title: r.title, goal: r.goal, description: r.description, category: r.category, joinMode: r.join_mode, capacity: r.capacity, memberCount: r.member_count, onlineOnly: r.online_only, city: r.city, ageScope: r.age_scope, createdAt: r.created_at.toISOString() }));
      const q = (query || '').toLowerCase();
      if (q) list = list.filter(r => [r.title, r.goal, r.description, r.category].filter(Boolean).join(' ').toLowerCase().includes(q));
      if (category) list = list.filter(r => r.category === category);
      if (mode) list = list.filter(r => mode === 'online' ? r.onlineOnly : !r.onlineOnly);
      if (city) list = list.filter(r => (r.city || '').toLowerCase() === city.toLowerCase());
      if (hasSpace) list = list.filter(r => r.memberCount < r.capacity);
      return list;
    },
    async setRoomFields(roomId, fields) {
      await init();
      const patch = {};
      for (const k of ['title', 'description', 'category', 'visibility', 'joinMode', 'aiMode', 'capacity']) {
        if (fields[k] !== undefined) patch[k.replace(/[A-Z]/g, c => '_' + c.toLowerCase())] = fields[k];
      }
      const cols = Object.keys(patch);
      if (!cols.length) return;
      await sql`UPDATE knot_rooms SET ${sql(patch, ...cols)} WHERE id = ${roomId}`;
    },
    async transferOwnership(roomId, newOwnerPid) {
      await init();
      await this.setMemberRole({ id: roomId }, newOwnerPid, 'owner');
      if (newOwnerPid.startsWith('a:')) await sql`UPDATE knot_rooms SET owner_account_id = ${newOwnerPid.slice(2)}::uuid, owner_user_id = NULL WHERE id = ${roomId}`;
      else await sql`UPDATE knot_rooms SET owner_user_id = ${newOwnerPid}::uuid, owner_account_id = NULL WHERE id = ${roomId}`;
    },
    async createRoom({ id, inviteCode, requestId, title, goal, description, category, visibility, joinMode, capacity, onlineOnly, city, ageScope, demo, aiMode, ownerUserId, ownerAccountId, ownerName, legacyClientId, demoMembers }) {
      await init();
      if (requestId) {
        const dup = await sql`SELECT id FROM knot_rooms WHERE request_id = ${requestId}`;
        if (dup.length) return { room: await this.getRoomRaw(dup[0].id), duplicate: true };
      }
      await sql`INSERT INTO knot_rooms (id, invite_code, request_id, title, goal, description, category, visibility, join_mode, capacity, online_only, city, age_scope, demo, ai_mode, owner_user_id, owner_account_id, legacy_client_id, demo_members)
        VALUES (${id}, ${inviteCode}, ${requestId || null}, ${title}, ${goal}, ${description || null}, ${category || null}, ${visibility || 'public'}, ${joinMode || 'open'}, ${capacity || 12}, ${!!onlineOnly}, ${city || null}, ${ageScope || null}, ${!!demo}, ${aiMode || 'off'}, ${ownerUserId || null}, ${ownerAccountId || null}, ${legacyClientId || null}, ${sql.json(demoMembers)})
        ON CONFLICT (request_id) DO NOTHING`;
      // A signed-in owner has no knot_users row of their own: the account is the identity, and
      // inserting a row with a null id used to abort the whole create with a NOT NULL violation.
      if (ownerUserId) {
        await sql`INSERT INTO knot_users (id, name, is_guest) VALUES (${ownerUserId}, ${ownerName || 'Member'}, false) ON CONFLICT (id) DO NOTHING`;
      }
      if (ownerUserId || ownerAccountId) {
        await sql`INSERT INTO knot_room_members (room_id, user_id, account_id, role) VALUES (${id}, ${ownerAccountId ? null : ownerUserId}, ${ownerAccountId || null}, 'owner') ON CONFLICT DO NOTHING`;
      }
      return { room: await this.getRoomRaw(id), duplicate: false };
    },

    // ---------- messages ----------
    async addMessage(room, { userId, accountId, authorName, text, kind, clientMsgId }) {
      await init();
      if (clientMsgId) {
        const dup = await sql`SELECT id, ts FROM knot_messages WHERE room_id = ${room.id} AND client_msg_id = ${clientMsgId}`;
        if (dup.length) return { id: dup[0].id, authorId: userId, authorName, text, kind: kindOf(kind), ts: dup[0].ts.toISOString(), duplicate: true };
      }
      const msgId = await uuid();
      const rows = await sql`INSERT INTO knot_messages (id, room_id, user_id, account_id, author_name, kind, text, client_msg_id)
        VALUES (${msgId}, ${room.id}, ${userId || null}, ${accountId || null}, ${authorName}, ${kindOf(kind)}, ${text}, ${clientMsgId || null})
        RETURNING id, ts`;
      return { id: rows[0].id, authorId: userId, authorAccountId: accountId, authorName, text, kind: kindOf(kind), ts: rows[0].ts.toISOString(), duplicate: false };
    },
    async listMessagesAfter(room, afterIso) {
      if (!afterIso) return room.messages || [];
      const t = Date.parse(afterIso);
      if (Number.isNaN(t)) return room.messages || [];
      return (room.messages || []).filter(m => Date.parse(m.ts) > t);
    },

    // ---------- reports / blocks / moderation log ----------
    async addReport({ reporterUser, roomId, messageId, messageText, targetPid, reason, details, status }) {
      await init();
      const [ruid, raid] = reporterUser.accountId ? [null, reporterUser.accountId] : [reporterUser.id, null];
      const [tuid, taid] = (targetPid || '').startsWith('a:') ? [null, targetPid.slice(2)] : [targetPid || null, null];
      const id = await uuid();
      await sql`INSERT INTO knot_reports (id, reporter_user_id, reporter_account_id, room_id, message_id, message_text, target_user_id, target_account_id, reason, details, status)
        VALUES (${id}, ${ruid}, ${raid}, ${roomId || null}, ${messageId || null}, ${messageText || null}, ${tuid}, ${taid}, ${reason}, ${details || null}, ${status || 'open'})`;
      return { id };
    },
    async listReports(limit = 50) {
      await init();
      const rows = await sql`SELECT id, room_id, message_id, message_text, reason, details, status, created_at,
        reporter_user_id, reporter_account_id, target_user_id, target_account_id
        FROM knot_reports ORDER BY created_at DESC LIMIT ${limit}`;
      return rows.map(r => ({ id: r.id, roomId: r.room_id, messageId: r.message_id, messageText: r.message_text, reason: r.reason, details: r.details, status: r.status, createdAt: r.created_at.toISOString(),
        reporter: r.reporter_account_id ? 'a:' + r.reporter_account_id : (r.reporter_user_id || null), target: r.target_account_id ? 'a:' + r.target_account_id : (r.target_user_id || null) }));
    },
    async resolveReport(id, status) {
      await init();
      await sql`UPDATE knot_reports SET status = ${status} WHERE id = ${id}`;
    },
    async addBlock(blockerUser, targetPid) {
      await init();
      const [buid, baid] = blockerUser.accountId ? [null, blockerUser.accountId] : [blockerUser.id, null];
      const [tuid, taid] = targetPid.startsWith('a:') ? [null, targetPid.slice(2)] : [targetPid, null];
      await sql`INSERT INTO knot_blocks (blocker_user_id, blocker_account_id, blocked_user_id, blocked_account_id)
        VALUES (${buid}, ${baid}, ${tuid}, ${taid})`;
    },
    async isBlockedBetween(userA, pidB) {
      await init();
      const [auid, aaid] = userA.accountId ? [null, userA.accountId] : [userA.id, null];
      const [tuid, taid] = pidB.startsWith('a:') ? [null, pidB.slice(2)] : [pidB, null];
      const rows = await sql`SELECT 1 FROM knot_blocks WHERE
        ((blocker_user_id IS NOT DISTINCT FROM ${auid}::uuid AND blocker_account_id IS NOT DISTINCT FROM ${aaid}::uuid AND blocked_user_id IS NOT DISTINCT FROM ${tuid}::uuid AND blocked_account_id IS NOT DISTINCT FROM ${taid}::uuid)
         OR (blocker_user_id IS NOT DISTINCT FROM ${tuid}::uuid AND blocker_account_id IS NOT DISTINCT FROM ${taid}::uuid AND blocked_user_id IS NOT DISTINCT FROM ${auid}::uuid AND blocked_account_id IS NOT DISTINCT FROM ${aaid}::uuid))`;
      return rows.length > 0;
    },
    async addModAction({ actorUser, roomId, targetPid, action, reason }) {
      await init();
      const [au, aa] = actorUser.accountId ? [null, actorUser.accountId] : [actorUser.id, null];
      const [tu, ta] = (targetPid || '').startsWith('a:') ? [null, targetPid.slice(2)] : [targetPid || null, null];
      await sql`INSERT INTO knot_moderation_actions (actor_user_id, actor_account_id, room_id, target_user_id, target_account_id, action, reason)
        VALUES (${au}, ${aa}, ${roomId || null}, ${tu}, ${ta}, ${action}, ${reason || null})`;
    },
    async listModActions(limit = 50) {
      await init();
      const rows = await sql`SELECT actor_user_id, actor_account_id, room_id, target_user_id, target_account_id, action, reason, created_at
        FROM knot_moderation_actions ORDER BY created_at DESC LIMIT ${limit}`;
      return rows.map(r => ({ actor: r.actor_account_id ? 'a:' + r.actor_account_id : r.actor_user_id, roomId: r.room_id, target: r.target_account_id ? 'a:' + r.target_account_id : r.target_user_id, action: r.action, reason: r.reason, createdAt: r.created_at.toISOString() }));
    },

    // ---------- AI usage / budget ----------
    async addAiUsage({ feature, model, promptTokens, completionTokens, estCost }) {
      await init();
      await sql`INSERT INTO knot_ai_usage (feature, model, prompt_tokens, completion_tokens, est_cost)
        VALUES (${feature}, ${model || null}, ${promptTokens || 0}, ${completionTokens || 0}, ${estCost == null ? null : estCost})`;
    },
    async aiUsageTotals() {
      await init();
      const rows = await sql`SELECT
        count(*)::int AS calls,
        COALESCE(sum(prompt_tokens), 0)::int AS prompt_tokens,
        COALESCE(sum(completion_tokens), 0)::int AS completion_tokens,
        COALESCE(sum(est_cost), 0)::float8 AS est_cost,
        COALESCE(sum(CASE WHEN created_at > now() - interval '1 day' THEN 1 ELSE 0 END), 0)::int AS calls_today
        FROM knot_ai_usage`;
      const r = rows[0];
      return { calls: r.calls, promptTokens: r.prompt_tokens, completionTokens: r.completion_tokens, estCost: r.est_cost, callsToday: r.calls_today };
    }
  };
};
