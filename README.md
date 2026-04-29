# Space Memory

Know this space and watch over it.

## Product

Space Memory ingests home walkthrough videos and uses AI to build and maintain an inventory of every room, item, and repair issue. Two core questions:

- **"Where was this item last seen?"** — location history across walkthroughs
- **"What needs fixing?"** — repair punch list updated on each pass

For full architecture, see [Space Memory MVP Architecture and 90-Day Plan](docs/space-memory-mvp-architecture.md).

## MVP Phase 1 — Canonical Pipeline (Days 1-30)

- Walkthrough upload with processing lifecycle
- AI-assisted extraction of items, locations, and repair candidates
- Operator review console for quality control
- Searchable inventory with location history
- Repair issue tracking

## Quick start

1. Node.js 20+
2. `npm install`
3. `npm run db:generate && npm run db:migrate`
4. `npm run dev`
5. Local checks: `npm run lint && npm run typecheck && npm run test`

## Stack

- TypeScript, Express, Prisma, SQLite (local dev)
- Postgres (production)
- Object storage for video and frame evidence

## Repo conventions

- TypeScript-first, strict types
- Quality gates via lint/typecheck/test/build
- Incremental delivery tracked in Paperclip child issues
