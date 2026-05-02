# CLAUDE.md — trace-app / PerifEye

Express + React SPA on Vercel · Postgres via Neon · auth via Clerk.

## Architecture at a glance

- **Backend**: Express in `src/`, deployed as one Vercel Function at `api/index.ts`
- **Frontend**: React + Vite SPA in `client/`, output to `client/dist/`
- **DB**: Postgres via Prisma (`prisma/schema.prisma`)
- **Hosting**: Vercel project `trace-app` → `https://app.perifeye.com` (production), `https://staging.app.perifeye.com` (integration)

## Local dev

```sh
npm install                  # also runs prisma generate via postinstall
npm run client:install       # client/ has its own package.json
vercel env pull .env.local   # pull Neon + Clerk envs from Vercel (development)
npm run dev                  # tsx-watched Express on :3000
```

`/api/health` returns `{"status":"ok","db":"connected"}` when wired up.

## Branching model (GitFlow)

```
feature branch → PR against staging → preview deploy on Marketplace-managed Neon fork
merge to staging → staging.app.perifeye.com  (preview/staging Neon branch, reset from main on each push)
release PR (staging → main) → app.perifeye.com  (production main Neon branch)
```

- **`main`** = production. Vercel-Git auto-deploys every push to `app.perifeye.com`.
- **`staging`** = integration branch. Auto-deploys to `staging.app.perifeye.com`.
- **PRs target `staging`**, not main. Each PR gets its own Marketplace-created Neon branch (`preview/{branch}`), wiped automatically when the PR closes.
- **Releases** = a PR from `staging` → `main`. Merging it ships to production.

## CI workflow (`.github/workflows/ci.yml`)

| Job | Triggers on |
|---|---|
| `quality` | every push + PR (lint, typecheck, test) |
| `frontend` | every push + PR (Playwright smoke) |
| `deploy-staging` | push to `staging` — resets `preview/staging` Neon branch from main, deploys to staging.app.perifeye.com |
| `deploy-production` | push to `main` — deploys to app.perifeye.com |

The `deploy-staging` job's reset step looks up the Neon branch by name (`staging` or `preview/staging`). If neither exists yet, it skips with a warning (Marketplace creates it on first deploy).

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
- Two Neon projects coexist:
  - `lively-recipe-24331581` (`neon-amethyst-cushion`) — **the Marketplace-managed project** in the `Vercel: Arnd Kohrs' projects` Neon org. This is what Vercel deploys actually use. Manage with the project-scoped `NEON_API_KEY` (org-level personal API keys can't reach it).
  - `fragrant-band-43042203` (`trace-app`) — historic personal-org project, **unused**. Safe to ignore or delete eventually.

### Migrations: single source of truth
Vercel's `buildCommand` is the only place that runs `prisma migrate deploy` against the production DB. Do not add migration steps to GH Actions deploy jobs (test jobs against the local Postgres container are unrelated and stay).

### Vercel SSO bypass for CI
Preview deploys (including `staging.app.perifeye.com` because it's preview-aliased) sit behind Vercel's Deployment Protection. CI smoke tests pass `x-vercel-protection-bypass: $VERCEL_AUTOMATION_BYPASS_SECRET` to bypass. The token is created via Vercel → Settings → Deployment Protection → Protection Bypass for Automation, and stored as a GitHub repo secret.

### Auth
- Clerk app: `perifeye` (Personal workspace, currently **Development instance** — `pk_test_*` / `sk_test_*` keys).
- `GET /api/spaces`, `/api/review` etc. return **401 unauthenticated** — expected behaviour, not a bug.

## Common gotchas

| Symptom | Cause / fix |
|---|---|
| 500 from `/api/*` after deploy | Migrations didn't run — check Vercel build logs for `prisma migrate deploy` step |
| 401 from `staging.app.perifeye.com` via plain curl | Vercel SSO gate — pass `-H "x-vercel-protection-bypass: $VERCEL_AUTOMATION_BYPASS_SECRET"` |
| `Cannot find package 'vite'` during build | Missing `npm run client:install` |
| `Your Vercel CLI version is outdated` in CI | A pinned wrapper action (e.g. `amondnet/vercel-action`) — replace with `npx vercel@latest` |
| `gh pr checks` exit 8 in until-loops | gh exits 8 on any non-passing check — wrap with `\|\| echo 1` |
| Vercel build fails with `Branch limit reached` | Neon free tier caps at 10 branches. Marketplace usually GCs `preview/{branch}` on PR close, but stragglers accumulate. Bulk delete via the Neon API (look for stale `preview/*` whose git branches no longer exist). |
| Marketplace-managed Neon branch returns 422 on `reset_to_parent` | The branch was created manually (not by Marketplace). Marketplace's reset endpoint only works on its own branches. Delete and let Marketplace recreate. |

## Don't

- Push directly to `main` or `staging` — use PRs (and direct pushes are blocked by branch protection anyway)
- Run `prisma migrate deploy` against the production Neon DB manually — let Vercel build do it
- Set `DATABASE_URL` manually as a project-level Vercel env — the Neon Marketplace webhook overrides project envs at deploy time anyway, and you'll waste hours debugging why your override "doesn't work"
- Use `db push` over `migrate deploy` in production — irrecoverable
- Create your own long-lived Neon branches in the Marketplace project for staging — Marketplace's `preview/{branch}` mechanism is the supported path

## Where to look

- **`docs/perifeye-mvp-architecture.md`** — product/domain model
- **`prisma/schema.prisma`** — current schema (Postgres)
- **`.github/workflows/ci.yml`** — current CI
- **`.claude/impl-log-vercel-neon-clerk-wiring.md`** — full session log of how the deploy pipeline came together (decisions + gotchas in detail)
