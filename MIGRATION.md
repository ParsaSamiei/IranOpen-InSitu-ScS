# Migration: SQLite → Postgres, deployed on Vercel

## What changed

| File                   | Change                                                                                        |
| ---------------------- | --------------------------------------------------------------------------------------------- |
| `api/db.js`            | New — Postgres connection pool + table creation (replaces `server/db.js`)                     |
| `api/index.js`         | New — same routes as `server/index.js`, but async/await + Postgres, exported for Vercel       |
| `api/scoringConfig.js` | Copied unchanged — no DB calls in here, so nothing to migrate                                 |
| `package.json` (root)  | New — lists `pg` instead of `better-sqlite3`; same `express`/`cors`/`xlsx` versions as before |
| `vercel.json`          | New — routes `/api/*` to the serverless function, everything else to the built client         |
| `client/src/api.js`    | `BASE` now reads `import.meta.env.VITE_API_URL`, falling back to `/api`                       |
| `client/.env.example`  | New — for local dev only                                                                      |
| `.env.example` (root)  | New — shows the `DATABASE_URL` shape                                                          |

The old `server/` folder is left in place as a reference/backup. It's no longer used by the deployed app — you can delete it once you've confirmed everything works, or just leave it and add it to `.gitignore` review later. Note `server/scores.db` was already tracked in git before this; `.gitignore` now excludes it going forward, but you'll want to `git rm --cached server/scores.db server/scores.db-wal server/scores.db-shm` if you want it fully removed from the repo.

## Steps to actually deploy

1. **Get a free Postgres database.** Easiest: go to vercel.com → your project (once created) → Storage tab → Create Database → Postgres (this is Neon under the hood). Or sign up directly at neon.tech. Either way, copy the connection string — it looks like `postgres://user:password@host/dbname?sslmode=require`.

2. **Test locally first (recommended):**

   ```bash
   npm install -g vercel   # if you don't have it
   npm install             # installs root deps (express, pg, cors, xlsx)
   cd client && npm install && cd ..
   ```

   Create a root `.env` file (copy `.env.example`) with your real `DATABASE_URL`, then run:

   ```bash
   vercel dev
   ```

   This simulates the exact Vercel routing/serverless setup locally. Open the URL it gives you and test adding a team, scoring, and the leaderboard.

3. **Push to GitHub:**

   ```bash
   git add .
   git commit -m "Migrate to Postgres for Vercel deployment"
   git push
   ```

4. **Import into Vercel:**
   - vercel.com → Add New → Project → import `IranOpen-InSitu-ScS-App`
   - In the project's Environment Variables settings, add `DATABASE_URL` with your real connection string
   - Deploy

5. **Verify on the live URL** — add a team, submit a score, check the leaderboard, try the Excel export.

## If something breaks

- **"relation does not exist" errors** → the tables weren't created; check the `DATABASE_URL` env var is set correctly in Vercel and redeploy (this triggers `initDb()` again).
- **CORS errors in the browser console** → shouldn't happen since client and API share an origin in production, but if you test the client against a separately-hosted API, double check `VITE_API_URL`.
- **SSL connection errors to Postgres** → make sure the connection string includes `?sslmode=require` (Neon requires this).
