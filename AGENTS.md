# Notes for AI coding agents (Claude Code)

Project: KNOT, an ITKAN hackathon app. Vanilla Node server (zero framework) + vanilla JS SPA in `public/`. One npm dependency (`postgres`).

## Architecture

- `server.js` : static files + JSON API. Same `handler` is reused by `api/[...path].js` on Vercel.
- `lib/match.js` : deterministic matcher (keyword rules + constraints). Deliberately NOT an LLM; reasons must stay traceable to stored profile fields.
- `lib/store.js` : storage dispatcher. `DATABASE_URL` set → `lib/store-pg.js` (shared Postgres/Supabase, schema auto-created); otherwise `lib/store-json.js` (local file `data/db.json`, `KNOT_DB_PATH` overrides for tests).
- `lib/session.js` logic lives in `server.js`: anonymous HttpOnly cookie (`knot_sid`). The server stamps message authors and room ownership; clients cannot claim identities.
- `public/app.js` : the whole SPA (hash routing: `#/`, `#/finder`, `#/groups`, `#/room/:id`, `#/join/:code`). If `GET /api/status` says `persistent: false`, it keeps groups in localStorage instead (Vercel without a database).

## Invariants (do not break)

- Message author identity comes from the session, never from the request body.
- Fictional demo profiles must stay tagged `demo: true` in room member payloads.
- Matching explanations must cite real stored fields; no invented availability, no compatibility percentages.
- All visible UI copy avoids em dashes; the brand palette lives in `public/styles.css` CSS variables.
- `npm test` must pass before pushing. `npm run lint` for syntax.

## Tests

- `test/match.test.js` : matcher rules incl. the judge demo goals.
- `test/api.test.js` : spins a real server on a temp DB (env `KNOT_DB_PATH`) and exercises sessions, dedupe, invite joining, permissions, restart persistence.

## Deploy

Vercel serves `public/` and runs `api/[...path].js`. Set `DATABASE_URL` (and optionally `GROQ_API_KEY`) in the Vercel project env. Production deploys come from `main`.
