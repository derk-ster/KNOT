# Team workflow

Five people, one repo, everyone on Claude Code. The rules below keep that safe.

## Branches

- `main` is the shared integration branch and what deploys to Vercel. It should always work.
- Do feature work on branches: `feature/<your-name>-<topic>`, e.g. `feature/anvi-finder-polish`.
- Push your branch and open a pull request into `main`. Another teammate reviews before merge.

## Everyday loop

```bash
git pull origin main          # 1. start fresh
git switch -c feature/your-topic   # 2. branch for your task
# ...work, test with npm test...
git add <files>               # 3. add only what you changed
git commit -m "Short, clear message"
git push -u origin feature/your-topic  # 4. push your branch
# 5. open a PR on GitHub, get a review, merge
```

## Rules that protect everyone's work

- Never `git push --force`, never `git reset --hard` on shared branches, never rewrite pushed history.
- If `git push` is rejected: `git pull --rebase origin main`, resolve conflicts by keeping BOTH sides where sensible, re-run `npm test`, then push.
- Claim files: tell the team (chat) which files you are editing before you edit them. The natural split:
  - `public/app.js`, `public/styles.css` (frontend/UI)
  - `lib/match.js`, `data/profiles.json` (matching/seed data)
  - `server.js`, `lib/store-*.js` (backend)
  - `docs/` (PM)
- Coordinate in chat before touching another area; small PRs merge cleanly, big ones do not.
- Run `npm test` before every push. It catches matcher regressions and API/permission breakage.

## Conflicts

Conflict markers look like `<<<<<<< HEAD`. Don't delete the other side blindly; ask the teammate whose code it is. After resolving: `git add` the files, `git rebase --continue` (or commit), run tests, push.

## Backend truth

Source code syncs through GitHub. Application data syncs only through the shared database (see `docs/SETUP.md`). If `DATABASE_URL` is unset on your machine, groups you create are visible only to you.
