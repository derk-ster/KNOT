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
| `OPENAI_API_KEY` | optional | Enables the AI Finder chat, the help bot, AI goal reading, the group assistant and image moderation. Matching itself never needs AI. |
| `OPENAI_MODEL` | required with `OPENAI_API_KEY` | The chat model. Set it explicitly, there is no default. A key without a model name is not enough: the server raises an error rather than inventing one. |
| `OPENAI_FAST_MODEL` | required with `OPENAI_API_KEY` | The cheaper model used for the fast tier (reading the goal text). |
| `OPENAI_MODERATION_MODEL` | optional | Moderation model, defaults to `omni-moderation-latest`. |
| `GROQ_API_KEY` | optional | Fallback provider, used only when OpenAI is unconfigured or a call fails. |
| `ADMIN_KEY` | optional | Enables the organizer console behind `/api/admin/*`. |
| `KNOT_AI_BUDGET_USD` / `KNOT_AI_WARN_USD` / `KNOT_AI_STOP_USD` | optional | AI spend budget, defaults $25 / warn at $20 / hard stop at $23. |
| `KNOT_AI_MAX_CALLS_DAY` | optional | Daily call cap (default 600), used when a model has no known pricing. |
| `KNOT_AI_PRICING` | optional | JSON overrides for per-million-token pricing. |

Never put real keys in committed files. `.env` is git-ignored.

**On Vercel, scope these to the environments you actually demo from.** A variable set to Production only is not passed to Preview deployments. A preview without `DATABASE_URL` falls back to per-visitor browser storage, and a preview without the `OPENAI_*` trio runs matching on local rules. Both look healthy while proving nothing.

## Configure the shared database (one-time, ~5 minutes)

1. Create a free project at [supabase.com](https://supabase.com) (name it `knot`).
2. In the project: **Project Settings → Database → Connection string → URI**, choose the **Transaction pooler** (port **6543**) tab, copy it, and replace `[YOUR-PASSWORD]` with the database password you set when creating the project.
3. Put that string in `.env.local`-style `.env` locally as `DATABASE_URL=...`, and later in Vercel as an environment variable.
4. Verify it: `npm run db:check` → should print `Connected. Storage: postgres`.
5. That's all. The `knot_*` tables (11 of them, covering users, accounts, rooms, members, bans, join requests, messages, reports, blocks, moderation actions and AI usage) are created automatically on first use. Existing tables gain new columns additively, never destructively.

## Commands

| Command | Purpose |
|---|---|
| `npm run dev` / `npm start` | Start the app at localhost:3000 |
| `npm test` | Matcher rules + full API tests (sessions, accounts, discovery, roles, moderation, invites, persistence, permissions) |
| `npm run lint` | Syntax-check every JS file |
| `npm run db:check` | Verify `DATABASE_URL` connectivity |

## Troubleshooting

- **Port in use**: another KNOT instance is running. `pkill -f "node server.js"` or use another `PORT`.
- **`npm run db:check` fails**: re-check the connection string (pooler host, port 6543, password). Supabase pauses free projects after inactivity; restore the project in the dashboard.
- **AI Finder says it's switched off**: no `OPENAI_API_KEY` on that server, or the key is set but `OPENAI_MODEL` / `OPENAI_FAST_MODEL` are missing. Matching still works fully without it.
- **Everything looks local after a deploy**: check the environment scope. Variables set to Production only are invisible to Preview deployments, which then fall back to browser storage and local matching rules.
- **A teen-scoped group or "members 18 and over" error in an old database**: expected. New signups are adults only. Groups created by earlier builds stay teen-scoped, so they refuse new adult accounts rather than silently changing age rules. This is not a broken flow.
