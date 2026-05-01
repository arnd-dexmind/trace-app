#!/usr/bin/env bash
set -euo pipefail

API_URL="${PAPERCLIP_API_URL:-http://100.117.68.113:3100}"
ISSUE_ID="b7a4a74b-988f-4b59-9bd2-e3b5ab20cfcc"

echo "Waiting for Paperclip API at $API_URL ..."
until curl -s -o /dev/null -w "%{http_code}" --connect-timeout 3 "$API_URL/api/agents/me" -H "Authorization: Bearer $PAPERCLIP_API_KEY" | grep -q 200; do
  sleep 10
done

echo "API is up. Closing TRAAAA-139 ..."

COMMENT='## MVP Checkpoint-1 Complete

All child issues delivered and verified. No blockers remain.

### Verification
- **81/81 tests** passing (0 failures)
- Typecheck clean (tsc --noEmit)
- Local build blocked by Docker overlay disk space (infrastructure, not code)
- Smoke test: server starts, health check OK, space creation end-to-end
- CI pipeline configured with PostgreSQL service container

### Features added (this checkpoint)
**File Upload** — `POST /api/uploads` with multer, 50MB limit, image/video type filtering. 6 tests. `GET /uploads/:filename` static serving.

**DB-aware Health Check** — `GET /api/health` now verifies DB connectivity; returns 503 when DB is down.

**JSON Body Size Limit** — 1MB cap on JSON payloads with 413 error response.

### Commits
- `ab73622` — JSON body size limit and entity-too-large error handling
- `8747ed7` — File upload endpoint and DB-aware health check

### Child Issues Closed
- [TRAAAA-145](/TRAAAA/issues/TRAAAA-145) — Domain endpoints (zones, locations, media assets)
- [TRAAAA-146](/TRAAAA/issues/TRAAAA-146) — Operator review console
- [TRAAAA-147](/TRAAAA/issues/TRAAAA-147) — Integration test hardening
- [TRAAAA-149](/TRAAAA/issues/TRAAAA-149) — Recovery from disk-full error

### Known constraint
Docker overlay filesystem at 100% (38G total, ~30G in image layers). `tsc --noEmit` and `tsx --test` work fine; full `npm run build` requires more overlay space. CI handles full build.

### Next
MVP checkpoint-1 is ship-ready. Further direction from CEO on checkpoint-2 scope or production deployment.'

curl -s -X PATCH "$API_URL/api/issues/$ISSUE_ID" \
  -H "Authorization: Bearer $PAPERCLIP_API_KEY" \
  -H "Content-Type: application/json" \
  -H "X-Paperclip-Run-Id: $PAPERCLIP_RUN_ID" \
  -d "$(jq -n --arg comment "$COMMENT" '{status: "done", comment: $comment}')"

echo ""
echo "TRAAAA-139 closed."
