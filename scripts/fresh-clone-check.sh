#!/usr/bin/env bash
# What a judge does: clone the public repo (no data/, no seed.json), `docker compose up --build`,
# then open the apps. Run it after every merge.
#
#   scripts/fresh-clone-check.sh [git-ref]      (default: HEAD of this checkout, committed files only)
#   DIRTY=1 scripts/fresh-clone-check.sh        also apply uncommitted changes to tracked files (pre-commit check)
#
# It clones into a temp dir, builds and starts the stack on spare ports (3100/3101/4100) under its
# own compose project so it never touches your dev servers or volumes, waits for health, runs the
# Playwright walkthrough against it (synthetic seed), then tears everything down.
# KEEP=1 leaves the stack running for a manual look.
set -euo pipefail

REF="${1:-HEAD}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/dash-fresh-XXXXXX")"
PROJECT="dashfresh"
export WEB_PORT=3100 ADMIN_PORT=3101 API_PORT=4100

cleanup() {
  if [[ "${KEEP:-0}" != "1" ]]; then
    (cd "$WORK/repo" 2>/dev/null && docker compose -p "$PROJECT" down -v --remove-orphans >/dev/null 2>&1) || true
    rm -rf "$WORK"
  else
    echo "KEEP=1: stack left running in $WORK/repo (docker compose -p $PROJECT down -v to stop)"
  fi
}
trap cleanup EXIT

echo "▸ Cloning $REF into $WORK/repo"
git clone --quiet "$ROOT" "$WORK/repo"
git -C "$WORK/repo" checkout --quiet "$(git -C "$ROOT" rev-parse "$REF")"
cd "$WORK/repo"
if [[ "${DIRTY:-0}" == "1" ]]; then
  echo "▸ Applying uncommitted changes to tracked files"
  git -C "$ROOT" diff --binary HEAD | git apply --allow-empty
fi
for p in data packages/core/src/seed.json .data; do
  [[ -e "$p" ]] && { echo "✗ $p is in the clone: it must never be committed"; exit 1; }
done

echo "▸ docker compose up --build (project $PROJECT, ports $WEB_PORT/$ADMIN_PORT/$API_PORT)"
cp .env.example .env
docker compose -p "$PROJECT" down -v --remove-orphans >/dev/null 2>&1 || true
docker compose -p "$PROJECT" up --build -d

wait_for() {
  local url="$1" name="$2"
  for _ in $(seq 1 120); do
    curl -fsS -o /dev/null "$url" && { echo "  ✓ $name $url"; return 0; }
    sleep 2
  done
  echo "✗ $name never answered at $url"; docker compose -p "$PROJECT" logs --tail 80; exit 1
}
wait_for "http://localhost:$API_PORT/api/health" "API"
wait_for "http://localhost:$WEB_PORT/" "DASH"
wait_for "http://localhost:$ADMIN_PORT/" "Waypoint People"

echo "▸ Seed check: a fresh clone must boot the synthetic DEMO- seed"
curl -fsS "http://localhost:$API_PORT/api/health"; echo

echo "▸ Playwright walkthrough against the fresh stack"
cd "$ROOT"
WEB_URL="http://localhost:$WEB_PORT" ADMIN_URL="http://localhost:$ADMIN_PORT" API_URL="http://localhost:$API_PORT" EXPECT_SEED=synthetic \
  npm run e2e
echo "✓ Fresh clone passes"
