# CLAUDE.md — trace-app / PerifEye

Express + React SPA on Vercel · Postgres via Neon · auth via Clerk.

## Architecture at a glance

- **Backend**: Express in `src/`, deployed as one Vercel Function at `api/index.ts`
- **Frontend**: React + Vite SPA in `client/`, output to `client/dist/`
- **DB**: Postgres via Prisma (`prisma/schema.prisma`)
- **Hosting**: Vercel project `trace-app` → `https://app.perifeye.com`

## Local dev

```sh
npm install                  # also runs prisma generate via postinstall
npm run client:install       # client/ has its own package.json
vercel env pull .env.local   # pull Neon + Clerk envs from Vercel (development)
npm run dev                  # tsx-watched Express on :3000
```

`/api/health` returns `{"status":"ok","db":"connected"}` when wired up.

## Deploy pipeline

- **Push to `main`** → Vercel-Git auto-deploys to `app.perifeye.com`. Vercel's `buildCommand` runs `prisma migrate deploy` (using `DATABASE_URL_UNPOOLED`) before building.
- **GH Actions** runs tests, then `deploy-staging` (just deploy + smoke; **does not migrate** — Vercel build owns that).
- **Tag push (`v*`)** → `deploy-production` job. Same shape; not yet exercised end-to-end.
- **Smoke test** against `https://app.perifeye.com/api/health`, never preview URLs (those are SSO-gated and return 401 to anonymous curl).

## Critical conventions

### DB connection URLs (Neon)
- `DATABASE_URL` — pooled (PgBouncer transaction mode). Runtime queries **only**.
- `DATABASE_URL_UNPOOLED` — direct connection. Required for `prisma migrate deploy` (PgBouncer breaks Prisma's session-based migration queries).
- Both auto-injected by the Neon Vercel Marketplace integration. **Don't set manually.**

### `vercel.json` — modern format only
- Uses `functions` + `rewrites` + `outputDirectory: "client/dist"`.
- **Never re-introduce the legacy `builds` array** — it silently overrides `buildCommand`, which means migrations stop running on Vercel deploys.

### Project boundaries (don't confuse these)
- `trace-app` Vercel project = **this repo**, prod at `app.perifeye.com`
- `trace-web` Vercel project = **separate marketing site** at `www.perifeye.com`
- `client/` subtree has its own `package.json` — root `npm install` doesn't reach it

### Migrations: single source of truth
Vercel's `buildCommand` is the only place that runs `prisma migrate deploy` against the production DB. Do not add migration steps to GH Actions deploy jobs (test jobs against the local Postgres container are unrelated and stay).

### Auth
- Clerk app: `perifeye` (Personal workspace, currently **Development instance** — `pk_test_*` / `sk_test_*` keys).
- `GET /api/spaces`, `/api/review` etc. return **401 unauthenticated** — expected behaviour, not a bug.

## Common gotchas

| Symptom | Cause / fix |
|---|---|
| 500 from `/api/*` after deploy | Migrations didn't run — check Vercel build logs for `prisma migrate deploy` step |
| 401 from preview URL via curl | Vercel SSO Deployment Protection — hit `app.perifeye.com` instead, or use `vercel curl` |
| `Cannot find package 'vite'` during build | Missing `npm run client:install` |
| `Your Vercel CLI version is outdated` in CI | A pinned wrapper action (e.g. amondnet) — replace with `npx vercel@latest` |
| `gh pr checks` exit 8 in until-loops | gh exits 8 on any non-passing check — wrap with `\|\| echo 1` |

## Don't

- Push directly to `main` — use PR + squash-merge (direct pushes are blocked anyway)
- Run `prisma migrate deploy` against the production Neon DB manually — let Vercel build do it
- Set `DATABASE_URL` manually in Vercel envs — the Neon Marketplace owns that
- Trust preview URLs for unauthenticated smoke tests (SSO gate)
- Use `db push` over `migrate deploy` in production — irrecoverable

## Where to look

- **`docs/perifeye-mvp-architecture.md`** — product/domain model
- **`prisma/schema.prisma`** — current schema (Postgres)
- **`.github/workflows/ci.yml`** — current CI
- **`.claude/impl-log-vercel-neon-clerk-wiring.md`** — full session log of how the deploy pipeline came together (decisions + gotchas in detail)
