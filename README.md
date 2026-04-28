# trace-app

MVP repository for the Trace product.

## Current state

This repository was provisioned from an empty upstream and is being bootstrapped under `TRAAAA-72`.

## MVP focus

- establish a deployable web/API foundation
- add persistence + migrations
- ship first vertical slice for trace record create/list

## Quick start

1. Install Node.js 20+.
2. Install dependencies:
   - `npm install`
3. Run local checks:
   - `npm run lint`
   - `npm run typecheck`
   - `npm run test`

## Repo conventions

- TypeScript-first codebase
- quality gates via lint/typecheck/test/build
- incremental delivery tracked in Paperclip child issues
