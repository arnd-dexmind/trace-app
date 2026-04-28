#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${PAPERCLIP_API_URL:-}" || -z "${PAPERCLIP_API_KEY:-}" ]]; then
  echo "Missing PAPERCLIP_API_URL or PAPERCLIP_API_KEY" >&2
  exit 1
fi

ISSUE_ID="${1:-TRAAAA-80}"
COMMENT_BODY="${2:-Closeout recommendation: MVP checkpoint remains green (npm test + npm run build pass on 2026-04-28). Hardening is split into TRAAAA-78/79 follow-ons, so TRAAAA-80 can be marked done as the recommendation/drive issue.}"

echo "Waiting for Paperclip API at ${PAPERCLIP_API_URL} ..."
for _ in $(seq 1 30); do
  if curl -fsS --max-time 3 "${PAPERCLIP_API_URL}/api/health" >/dev/null; then
    break
  fi
  sleep 2
done

curl -fsS --max-time 5 "${PAPERCLIP_API_URL}/api/health" >/dev/null
echo "API reachable. Posting closeout updates for ${ISSUE_ID}."

paperclipai issue comment "${ISSUE_ID}" --body "${COMMENT_BODY}"
paperclipai issue update "${ISSUE_ID}" --status done

echo "Issue ${ISSUE_ID} commented and marked done."
