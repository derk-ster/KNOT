# Setup

## Requirements

- Node 18+ (tested on Node 24). Check with `node --version`.
- No global tools needed. `npm install` installs the single dependency (`postgres`).

## Run locally

```bash
git clone https://github.com/derk-ster/KNOT.git
cd KNOT
npm install
cp .env.example .env     # optional, for AI
npm run dev              # same as: node server.js
```

Open http://localhost:3000. Use `PORT=4000 npm run dev` if 3000 is busy.

## Environment variables

| Variable | Required | What it does |
|---|---|---|
| `DATABASE_URL` | recommended | Postgres (Supabase) connection string. When set, groups, messages and identities are shared: every computer and the deployed site see the same data. When unset, data stays in `data/db.json` on one machine. |
| `GROQ_API_KEY` | optional | Enables the AI Finder chat and help bot. Matching itself never needs AI. |

Never put real keys in committed files. `.env` is git-ignored.

## Configure the shared database (one-time, ~5 minutes)

1. Create a free project at [supabase.com](https://supabase.com) (name it `knot`).
2. In the project: **Project Settings → Database → Connection string → URI**, choose the **Transaction pooler** (port **6543**) tab, copy it, and replace `[YOUR-PASSWORD]` with the database password you set when creating the project.
3. Put that string in `.env.local`-style `.env` locally as `DATABASE_URL=...`, and later in Vercel as an environment variable.
4. Verify it: `npm run db:check` → should print `Connected. Storage: postgres`.
5. That's all. Tables (`knot_users`, `knot_rooms`, `knot_room_members`, `knot_messages`) are created automatically on first use.

## Commands

| Command | Purpose |
|---|---|
| `npm run dev` / `npm start` | Start the app at localhost:3000 |
| `npm test` | Matcher rules + full API tests (sessions, invites, persistence, permissions) |
| `npm run lint` | Syntax-check every JS file |
| `npm run db:check` | Verify `DATABASE_URL` connectivity |

## Troubleshooting

- **Port in use**: another KNOT instance is running. `pkill -f "node server.js"` or use another `PORT`.
- **`npm run db:check` fails**: re-check the connection string (pooler host, port 6543, password). Supabase pauses free projects after inactivity; restore the project in the dashboard.
- **AI Finder says it's switched off**: no `GROQ_API_KEY` on that server. Matching still works fully without it.
