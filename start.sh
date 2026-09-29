#!/usr/bin/env bash
# Start the Chemistry exam platform (Node.js + Express + SQLite).
# - Installs dependencies, writes deployment-output.json, serves in the FOREGROUND on $PORT (default 3000).
# - No build step: the server renders public/ directly and exposes the JSON API from the same port.
set -euo pipefail

cd "$(dirname "$0")" # shell builtin: /usr/bin/time cannot exec it; every command below is timed

/usr/bin/time -p test -f package.json
if /usr/bin/time -p test -f package-lock.json; then
  /usr/bin/time -p npm ci --no-audit --no-fund
else
  /usr/bin/time -p npm install --no-audit --no-fund
fi

# Static deployment snapshot for the controller (public/ holds index.html + assets).
WEB_DIR="${OPENCODE_WEB_DIR:-/home/runner/work/_temp/omgithub-web}"
/usr/bin/time -p mkdir -p "$WEB_DIR"
/usr/bin/time -p /usr/bin/printf '{"project":"/home/runner/work/PlayGround/PlayGround","directory":"/home/runner/work/PlayGround/PlayGround/public"}' \
  > "$WEB_DIR/deployment-output.json"
/usr/bin/time -p test -f "$WEB_DIR/deployment-output.json"
/usr/bin/time -p test -f public/index.html

export PORT="${PORT:-3000}"
export ADMIN_EMAIL="${ADMIN_EMAIL:-}"
export ADMIN_PASSWORD="${ADMIN_PASSWORD:-}"
export SESSION_SECRET="${SESSION_SECRET:-dev-only-change-me}"

exec node server.js # foreground server (exec is a shell builtin: must not be wrapped by /usr/bin/time)
