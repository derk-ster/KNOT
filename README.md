# KNOT

Describe what you want to do. KNOT finds people who can do it with you, shows exactly why they fit, and starts the group chat.
Built for the ITKAN AI Hackathon (Plano, TX). KNOT is for members 18 and over.

## Launch

```bash
node server.js
```

Then open http://localhost:3000. Needs Node 18+ (tested on Node 24). One dependency (`postgres`) if you use a shared database; without one, no `npm install` is even needed for local use.

**Optional AI:** copy `.env.example` to `.env`, set `OPENAI_API_KEY` and `OPENAI_MODEL` (one model is enough; it covers both tiers). `GROQ_API_KEY` is a fallback. Run `npm run ai:models` to list the models your key can use, then `npm run ai:check` to test them. Keys are read by the server only, never sent to the browser, and `.env` is git-ignored. Without any key the site still works: the AI Finder chat is disabled and the matching box runs on KNOT's local rules.
Use `PORT=4000 node server.js` for another port. To reset local data, stop the server and delete `data/db.json`.

## Deploying on Vercel

The repo is Vercel-ready: `public/` is served as static files and `api/[...path].js` runs the same API as `server.js`.
1. Import the GitHub repo in Vercel (no build command needed; `vercel.json` sets the output folder).
2. Optional AI: add `OPENAI_API_KEY` together with `OPENAI_MODEL` and `OPENAI_FAST_MODEL` under Project Settings → Environment Variables (never in the repo), then redeploy. Set `OPENAI_MODEL` (and optionally `OPENAI_FAST_MODEL`). A key without a model is shown in the app as needing one, rather than answered with canned text. Scope them to every environment you demo from, because Production-only variables are not passed to Preview deployments.
3. For shared data, add `DATABASE_URL` (Supabase Postgres; the schema is created automatically, additively only). Without it, Vercel functions cannot keep files and **groups and chat are stored in the visitor's browser**. Locally, `node server.js` stores them in `data/db.json`.
4. See `docs/SETUP.md` for the step-by-step Supabase setup and `docs/DEMO.md` for the presentation script.

## What is real and what is simulated

| Area | Actual mode |
|---|---|
| **Accounts** | Real email + password accounts (18+ only, one confirmation box, about a minute to sign up). Scrypt password hashing; anonymous HttpOnly cookie sessions for guests. Profile fields (bio, interests, skills, goals, city, availability, meeting preference) are stored per account and editable. |
| **Profile pictures** | Resized in the browser, then validated server-side (type, magic bytes, 400 KB cap) and checked by OpenAI image moderation. Rejected pictures are never stored or shown; flagged uploads file an automatic report for human review. |
| **Matching** | **Local rules by default.** A deterministic matcher in `lib/match.js` reads skills, city, in-person vs. online and days from the goal text, applies explicit requirements first, then ranks by overlap. Every reason shown cites a stored profile field. With AI on, a model only reads the goal text; the people shown still come from profile data. |
| **AI Finder** | With `OPENAI_API_KEY` set, a short chat turns your words into a goal and matches. Results always include real members whose stored skills, interests or goals overlap the parsed goal, and when nothing fits, real public groups that touch the topic, each with the stored-field reason. |
| **Group assistant** | Off by default. Owners can switch it to On-demand (`/askknot` or the Ask button). Participants see a notice when AI is on. |
| **Moderation** | Local pattern rules always; OpenAI moderation for messages, profile text, group text and photos when configured. Held content never reaches a room; a report is filed for human review instead. Reports alone never penalize anyone automatically. |
| **Storage** | With `DATABASE_URL`: shared Postgres (Supabase). Groups, memberships, messages, accounts and reports live in shared tables. Without it: `data/db.json` locally, or each visitor's browser on Vercel without a database. |
| **Members** | The 51 profiles in `data/profiles.json` are fictional demo profiles (tagged `demo: true` everywhere). They never reply. Real groups are created by signed-in accounts with real members. |

## Files

- `server.js` : static server + JSON API (`/api/auth/*`, `/api/match`, `/api/people`, `/api/groups`, `/api/rooms`, `/api/ai/finder`, `/api/reports`, `/api/blocks`, `/api/admin/*`); same handler runs on Vercel via `api/[...path].js`
- `lib/match.js` : the deterministic matcher and skill vocabulary
- `lib/llm.js` : OpenAI-first dispatcher (Groq fallback) with budget tracking (`lib/aiusage.js`)
- `lib/moderate.js`, `lib/openai.js` : message and image moderation
- `lib/store.js` : storage dispatcher (Postgres when `DATABASE_URL` is set, else `lib/store-json.js`)
- `lib/store-pg.js` : additive-only Postgres schema and migrations
- `data/profiles.json` : fictional demo profiles
- `public/` : `index.html`, `js/` (the SPA as ES modules, entry `js/main.js`), `styles.css`, `assets/art`, `assets/fonts`
- `Media/` : original supplied art (untouched); `prep/` : the web copies made from it

## Try these (the matcher understands skills like editing, filming, design, music, basketball, tutoring)

- `I can shoot a short film in Plano this Saturday and need someone who can edit.` → Maya (free Saturday, Plano) and Priya (**availability unknown**, online only)
- Change "in Plano" to "online" → the "online only" caveat disappears and the Plano chip becomes Online.
- `I want to build a study app for our hackathon online and need a designer.` → Devon and Iris.
- A goal with no match → KNOT says what limited the search and offers one click to relax it.

## Known limits

- The local keyword matcher knows the skill vocabulary in `lib/match.js`; unknown skills get an honest "couldn't tell which skill you're looking for".
- Plain-text goal parsing: "online", "in person", known cities and weekday names are the recognized constraints.
- Profile pictures are moderated but not human-reviewed by default; the admin console (`ADMIN_KEY`) surfaces reports for a human to resolve.
- Not audited for security or legal compliance; treat it as a hackathon build.
- Not tested with a screen reader; keyboard use and reduced motion were built in and spot-checked.
