# KNOT

Describe what you want to do. KNOT finds people who can do it with you, shows exactly why they fit, and starts the group chat.
Built for the ITKAN AI Hackathon (Plano, TX).

## Launch

```bash
node server.js
```

Then open http://localhost:3000. Needs Node 18+ (tested on Node 24). No `npm install`, no dependencies.

**Optional AI (Groq):** copy `.env.example` to `.env` and set `GROQ_API_KEY`. The key is read by the server only, never sent to the browser, and `.env` is git-ignored. Without a key the site still works: the AI Finder tab is disabled and the help bot falls back to basic local rules.
Use `PORT=4000 node server.js` for another port. To reset the demo (delete all groups and messages), stop the server and delete `data/db.json`.

## Deploying on Vercel (demo)

The repo is Vercel-ready: `public/` is served as static files and `api/[...path].js` runs the same API as `server.js`.
1. Import the GitHub repo in Vercel (no build command needed; `vercel.json` sets the output folder).
2. Optional AI: add `GROQ_API_KEY` under Project Settings, Environment Variables (never in the repo), then redeploy.
3. For shared data across computers, add `DATABASE_URL` (Supabase Postgres) under Project Settings → Environment Variables; the schema is created automatically. Without it, Vercel functions can't keep files and **groups and chat are stored in the visitor's browser**. Locally, `node server.js` still stores them in `data/db.json`.
4. Optional AI: add `GROQ_API_KEY` the same way. See `docs/SETUP.md` for the step-by-step Supabase setup and `docs/DEMO.md` for the presentation script.

## What is real and what is simulated

| Area | Actual mode |
|---|---|
| **Matching** | **Local rules, no AI model at runtime.** A deterministic matcher in `lib/match.js` reads skills, a city, in-person vs. online and a day from the goal text with keyword rules, applies explicit requirements first, then ranks by skill and topic overlap. Every sentence shown comes from a stored profile field. The UI labels this "Local matcher". |
| **AI Finder tab + Help bot** | Groq models (`openai/gpt-oss-120b` for the Finder, `openai/gpt-oss-20b` for the help bot), called server-side. The Finder only turns a short chat into a goal; **the people shown still come from the local matcher and profile data**. The help bot returns an allow-listed page to open; the "how to get there / get back" text is fixed, not model-written. If the AI call fails, the UI says so. |
| **Assistant ("Help us get started")** | A **template**, not an AI. It fills in the goal, members' stated skills and shared free days. It is labeled as a draft, can be edited, posted or discarded. |
| **Storage** | With `DATABASE_URL` set: shared Postgres (Supabase). Groups, memberships and messages live in shared tables, so every computer and the deployed site see the same data; the schema is created automatically. Without it: `data/db.json` on the machine running the server (or, on Vercel without a database, each visitor's browser). Your profile, goal and session live in a browser cookie plus `localStorage`. |
| **Accounts** | None. No email, no sign-in. An anonymous session (HttpOnly cookie) is issued by the server; it stamps message authors and room ownership, so a browser cannot post as someone else. Different devices join the same room through an invite link, not by session sharing. |
| **Access control** | Only the creator and invited members can read or post in a room (server-enforced; outsiders get 403). Duplicate group creation is deduped server-side by request id. |
| **Members** | The 51 profiles in `data/profiles.json` are fictional (work, school and plain-fun skills; six are "open to anything" so every goal returns people, with an honest *Closest fit* note). Typed custom skills are mapped to the nearest known skill by the AI, or by local keyword rules if it is off. They never reply. Nothing pretends they are online. |
| **Accounts** | None. No email, no sign-in. "My groups" is per browser (its client id). |
| **How AI was used** | Claude Code (Claude Opus/Sonnet) helped write this code, and the art pack was supplied by the team. No model is called while the site runs. |

## Files

- `server.js` : static server + JSON API (`/api/match`, `/api/rooms`, `/api/rooms/:id/messages`, `/api/rooms/:id/assist`, `/api/ai/finder`, `/api/ai/help`); AI calls are rate-limited (30/min per address)
- `lib/env.js`, `lib/groq.js`, `lib/ai.js`, `lib/store.js` : .env loader, Groq client, AI features, JSON-file storage
- `lib/match.js` : the matcher and the assistant template
- `data/profiles.json` : fictional profiles (structured facts the matcher uses)
- `public/` : `index.html`, `app.js`, `styles.css`, `assets/art` (chrome art), `assets/fonts`
- `Media/` : original supplied art (untouched); `prep/` : the web copies made from it

## Credits

- Chrome art, knot mark and hero: supplied KNOT asset pack (`Media/KNOT_ALL_ASSETS`)
- Fonts: Bricolage Grotesque and DM Sans (SIL Open Font License; copies in `public/assets/fonts`)
- Layout inspiration: hildenkaira.fi (bold headline, floating metal accents). All layouts and copy here are original.
- No third-party JavaScript libraries or APIs.

## Try these (the matcher understands skills like editing, filming, design, music, basketball, tutoring)

- `I can shoot a short film in Plano this Saturday and need someone who can edit.` → Maya (free Saturday, Plano) and Priya (**availability unknown**, online only)
- Change "in Plano" to "online" → the "online only" caveat disappears and the Plano chip becomes Online.
- Change "in Plano" to "in person in Dallas" → Theo (Dallas, in person, free Saturday).
- `I want a hiking buddy this Saturday` or `something fun` → fun matches too; unknown goals fall back to the open-to-anything people.
- `I want to build a study app for our hackathon online and need a designer.` → Devon and Iris.

## Four-minute demo

1. **0:00 The goal.** "I'm a filmmaker and I need an editor." Click the first example, then **Find my people**. The profile step asks only for a name and one skill; the goal is kept.
2. **0:45 The people.** Point to the chips: KNOT understood *you offer filming, looking for video editing, Plano, Saturday*. Open **Why this match?** on Maya and show the exact profile fields used. Point at Priya's ochre "Availability unknown".
3. **1:30 The change.** Ask a judge for a change, or edit "in Plano" to "online". Focus and scroll stay put, one chip changes, and the results update in place.
4. **2:15 The failure case.** Type a goal with no match (the Frisco basketball example): KNOT says what limited the search and offers one click to relax it. The goal stays intact.
5. **2:45 The group.** Select Maya and Priya (a violet strand joins the goal to each), **Create group**, watch the strands tie into the knot, and see the teal "Group created".
6. **3:20 The first step.** Click **Help us get started**, show the labeled draft, edit a word, post it, send one message. Refresh the page to show it persists.

## Three likely judge questions

1. **"Where is the AI?"** Honest answer: the running site uses a transparent local matcher and a template for the starter message, so every reason is traceable to profile data (that's what "Why this match?" shows). We used Claude Code to build it. The matcher's `parseGoal` and `buildAssist` are the two places a model would slot in.
2. **"Are these real people? What about privacy?"** The 51 community profiles are fictional and tagged as demo. Real use would need accounts, consent and moderation; today there are no accounts, only city-level location and no email collected.
3. **"Can multiple people really chat?"** Yes, technically: rooms and messages live on the server, so a second browser opening the same room link sees the same messages (it refreshes every 4 seconds). The fictional members don't answer, and we say so in the UI.

## Known limits

- Single laptop server; no authentication; the room link is the only access control.
- Keyword matching only understands the 20 skills in `lib/match.js`; unknown skills get an honest "couldn't tell which skill you're looking for".
- Plain-text goal parsing: "online", "in person", a known city and weekday names are the recognized constraints.
- No leave-group action yet, so the untie animation in the pack is unused.
- Not tested with a screen reader; keyboard use and reduced motion were built in and spot-checked.
