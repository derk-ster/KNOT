# Architecture map

One-page guide to where things live, so multiple developers can work without collisions.

```
server.js            static file server + JSON API + sessions/accounts/authz (HTTP layer only)
api/[...path].js     Vercel serverless entry; reuses the same handler as server.js
lib/
  match.js           deterministic matcher + assistant template (pure logic, no I/O)
  skillmap.js        free-text → known-skill mapping (AI fast tier, local fallback)
  ai.js              AI Finder chat, help bot, goal interpretation, room assistant
  llm.js             provider dispatcher: OpenAI first, Groq fallback, honest error otherwise
  openai.js          OpenAI client (chat + moderation), key server-side only
  groq.js            Groq client (fallback provider)
  aiusage.js         spend tracking + budget gates for every model call
  moderate.js        message moderation: local prefilter + OpenAI moderation → hold + auto-report
  auth.js            scrypt password hashing, email/password validation
  env.js             .env loader (no dependency)
  store.js           storage dispatcher: DATABASE_URL → store-pg, else store-json
  store-pg.js        shared Postgres/Supabase storage (schema auto-created, additive only)
  store-json.js      local JSON-file storage (data/db.json; KNOT_DB_PATH for tests)
  guide.js           "what to do next" hints shared by server and client
  examples.js        example-goal selection
data/profiles.json   the 51 fictional community profiles (matching reads this directly)
public/
  index.html         single shell page (SPA)
  app.js             entire frontend: hash router, views, polling, dialogs
  styles.css         brand tokens + all styling (CSS variables; do not redesign)
  assets/art|fonts   optimized web copies of the Media/ pack (originals untouched)
test/                match.test.js (matcher rules) + api.test.js (full API, temp DB)
bin/                 lint.js (syntax check), db-check.js (DATABASE_URL verification)
docs/                SETUP, TEAM_WORKFLOW, DEMO, ARCHITECTURE
```

## Contracts

- **Identity**: anonymous HttpOnly cookie `knot_sid`; signing in attaches an account to the session (scrypt-hashed, in `knot_accounts`). The principal is the account when signed in (cross-device) or the session user for guests. The server stamps message authors and room ownership; clients never send identity.
- **Authorization**: rooms carry visibility (public/private), join mode (open/request), capacity, age scope (teen/adult, never mixed), and member roles (owner/moderator/member). Bans, join requests, reports and blocks are all enforced server-side by principal.
- **Demo profiles** carry `demo: true`; real members `demo: false`. Guest-created groups are `demo: true` and excluded from discovery; signed-in members never join them.
- **Moderation**: messages are checked before posting (local prefilter + OpenAI moderation when configured). Held content never reaches a room and files an automatic report for human review.
- **Storage interface**: both store files must implement the same method list (users, accounts, rooms, members, roles, bans, join requests, discovery, messages, reports, blocks, mod actions, AI usage). New features add methods to both.
- **Match response**: `{ interpreted, results, empty, notice, next, matcher }` — see `lib/match.js`; UI renders it verbatim. `matcher` says honestly whether an AI reading fed the local rules.

## Adding a feature

1. New data → extend the store interface in **both** store files, then the API route in `server.js`.
2. New UI → new view function in `public/app.js`, hash route in `route()`, styles in `styles.css` using existing CSS variables.
3. New matching skill → add to `SKILLS` in `lib/match.js` + a profile in `data/profiles.json`, then extend `test/match.test.js`.

## Deployment

Vercel, framework preset **Other** (correct for this stack): static `public/` + one Node serverless function (`api/[...path].js`). Env vars `DATABASE_URL` (Supabase Postgres) and optionally `OPENAI_API_KEY` with `OPENAI_MODEL` and `OPENAI_FAST_MODEL` (the Groq fallback uses `GROQ_API_KEY`). Scope variables to every environment you demo from: Production-only variables are not passed to Preview deployments. Production deploys from `main`.

The function's `maxDuration` is 10s, so any outbound call must abort below that. `lib/openai.js` keeps its chat and image moderation timeouts under 10s for this reason. Raising one above the other reintroduces a server-side kill that users see as a generic failure.
