# Architecture map

One-page guide to where things live, so multiple developers can work without collisions.

```
server.js            static file server + JSON API + session middleware (HTTP layer only)
api/[...path].js     Vercel serverless entry; reuses the same handler as server.js
lib/
  match.js           deterministic matcher + assistant template (pure logic, no I/O)
  skillmap.js        free-text → known-skill mapping (Groq fast tier, local fallback)
  ai.js              AI Finder chat + help bot orchestration (Groq smart tier)
  groq.js            Groq HTTP client (server-side only, key from env)
  env.js             .env loader (no dependency)
  store.js           storage dispatcher: DATABASE_URL → store-pg, else store-json
  store-pg.js        shared Postgres/Supabase storage (schema auto-created on first use)
  store-json.js      local JSON-file storage (data/db.json; KNOT_DB_PATH for tests)
  guide.js           "what to do next" hints shared by server and client
  examples.js        example-goal selection
data/profiles.json   the 51 fictional community profiles (matching reads this directly)
public/
  index.html         single shell page (SPA)
  app.js             entire frontend: hash router, views, polling, dialogs
  styles.css         brand tokens + all styling (CSS variables; do not redesign)
  helper.js          on-page helper widget
  assets/art|fonts   optimized web copies of the Media/ pack (originals untouched)
test/                match.test.js (matcher rules) + api.test.js (full API, temp DB)
bin/                 lint.js (syntax check), db-check.js (DATABASE_URL verification)
docs/                SETUP, TEAM_WORKFLOW, DEMO, ARCHITECTURE
```

## Contracts

- **Identity**: anonymous HttpOnly cookie `knot_sid`; server creates a user row and stamps message authors/room ownership. Clients never send identity.
- **Room member payload**: demo profiles carry `demo: true`; real members `demo: false` and are resolved server-side from the session.
- **Storage interface** (`lib/store.js` exports): `ensureUser, updateUser, setLegacyClientId, listRoomsForUser, getRoomRaw, findRoomByInvite, canAccessRoom, addRoomMember, createRoom, addMessage, listMessagesAfter`. Both implementations must keep this shape; new features add methods to both.
- **Match response**: `{ interpreted, results, empty, notice, next, matcher }` — see `lib/match.js`; UI renders it verbatim.

## Adding a feature

1. New data → extend the store interface in **both** store files, then the API route in `server.js`.
2. New UI → new view function in `public/app.js`, hash route in `route()`, styles in `styles.css` using existing CSS variables.
3. New matching skill → add to `SKILLS` in `lib/match.js` + a profile in `data/profiles.json`, then extend `test/match.test.js`.

## Deployment

Vercel, framework preset **Other** (correct for this stack): static `public/` + one Node serverless function (`api/[...path].js`). Env vars `DATABASE_URL` (Supabase Postgres) and optionally `GROQ_API_KEY`. Production deploys from `main`.
