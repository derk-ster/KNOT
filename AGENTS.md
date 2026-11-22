# Notes for AI coding agents (Claude Code)

Project: KNOT, an ITKAN hackathon app. Vanilla Node server (zero framework) + vanilla JS SPA in `public/`. One npm dependency (`postgres`).

## Architecture

- `server.js` : static files + JSON API. Same `handler` is reused by `api/[...path].js` on Vercel.
- `lib/match.js` : deterministic matcher (keyword rules + constraints). Deliberately NOT an LLM; reasons must stay traceable to stored profile fields.
- `lib/store.js` : storage dispatcher. `DATABASE_URL` set → `lib/store-pg.js` (shared Postgres/Supabase, schema auto-created); otherwise `lib/store-json.js` (local file `data/db.json`, `KNOT_DB_PATH` overrides for tests).
- `lib/demo.js` : the fictional demo profiles talking in a sandbox group. The server picks the speaker and
  writes the line (AI when configured, otherwise a local line built only from the stored demo profile);
  these messages are stored with `kind: 'demo'` and always shown with a Demo tag.
- `lib/memory.js` : what a bot may remember about a person, built fresh per reply from that person's stored
  profile and their own earlier messages in the room. Nothing is guessed, stored or carried between rooms.
- `lib/ai.js` : the Finder, the help bot and the in-room KNOT AI. Every one of them calls the provider through
  `lib/llm.js` (OpenAI, then Groq) and every one of them has a local answer built from stored data, so a
  missing key or a failed call never leaves a question unanswered or a bot repeating itself.
- `lib/session.js` logic lives in `server.js`: anonymous HttpOnly cookie (`knot_sid`). The server stamps message authors and room ownership; clients cannot claim identities.
- `public/js/` : the SPA as ES modules, no build step. `main.js` boots and routes clicks by `data-action`; `router.js` picks the page (`#/`, `#/discover`, `#/finder`, `#/groups`, `#/profile`, `#/room/:id`, `#/join/:code`); `api.js` is the one fetch path (timeouts, plain errors); `dialog.js` is the one dialog component; `components/` holds the header and the Help panel; `views/` holds one file per page, with `match.js` shared by home and the Finder.
- The room page appends messages and never repaints the composer. Sends show a pending bubble matched by `clientMsgId`; bot and KNOT AI lines are asked for step by step via `POST /api/rooms/:id/replies`, with the next step returned by the server.
- AI state comes from `lib/llm.js` `status()`: `ready`, `no-model`, `rejected` or `off`. A key without a model is reported, never answered silently. `npm run ai:check` and `npm run ai:models` verify a real key locally.

## Invariants (do not break)

- Message author identity comes from the session, never from the request body.
- Fictional demo profiles must stay tagged `demo: true` in room member payloads, and anything they say
  must stay tagged `kind: 'demo'` in messages. They never pass for real members.
- Matching explanations must cite real stored fields; no invented availability, no compatibility percentages.
- All visible UI copy avoids em dashes; the brand palette lives in `public/styles.css` CSS variables.
- `npm test` must pass before pushing. `npm run lint` for syntax.

## Tests

- `test/match.test.js` : matcher rules incl. the judge demo goals.
- `test/demo.test.js` : the demo profiles hold a conversation (greet once, answer the thread, suggest next).
- `test/ai.test.js` : the bots use the configured model, and still answer when it is missing or fails.
- `test/api.test.js` : spins a real server on a temp DB (env `KNOT_DB_PATH`) and exercises sessions, dedupe, invite joining, permissions, restart persistence.

## Deploy

Vercel serves `public/` and runs `api/[...path].js`. Set `DATABASE_URL` (and optionally `GROQ_API_KEY`) in the Vercel project env. Production deploys come from `main`. Without `DATABASE_URL` the app says so in the group page: groups and messages may not be kept.

## Browser checks

With a server running: `BASE_URL=http://localhost:3000 npm run e2e`. It signs up, signs out, signs in, sends a group message, checks the composer and profile buttons are clickable, and writes screenshots. Playwright is needed; set `KNOT_CHROMIUM` if it cannot find a browser.
