#!/usr/bin/env bash
# Build the PlayGround static preview and serve it in the foreground.
# The controller runs this inside the tmux `app-server` session via
# scripts/start-project.sh and reuses the server while $PORT responds.
set -euo pipefail

step() { echo ">>> [${SECONDS}s] $*"; }
done_step() { echo "<<< [${SECONDS}s] exit=$1 :: $2"; }
# run() wraps external commands only (/usr/bin/time cannot exec shell builtins).
run() { step "$*"; /usr/bin/time -p "$@"; local rc=$?; done_step "$rc" "$*"; return "$rc"; }
check() { step "$*"; "$@"; local rc=$?; done_step "$rc" "$*"; return "$rc"; }

step "start: change to project directory"
cd "$(dirname "${BASH_SOURCE[0]}")"
PROJECT_DIR="$PWD"
done_step 0 "cd $PROJECT_DIR"

PORT="${PORT:-3000}"
if ! [[ "$PORT" =~ ^[0-9]+$ ]]; then echo "start: PORT must be numeric, got '$PORT'." >&2; exit 1; fi
step "start: serving on PORT=$PORT"

OPENCODE_WEB_DIR="${OPENCODE_WEB_DIR:-/home/runner/work/_temp/omgithub-web}"
run mkdir -p "$OPENCODE_WEB_DIR"

step "start: install dependencies when a manifest exists"
if [[ -f "$PROJECT_DIR/package.json" ]]; then
  if [[ -f "$PROJECT_DIR/package-lock.json" ]]; then run npm ci --no-audit --no-fund
  else run npm install --no-audit --no-fund; fi
elif [[ -f "$PROJECT_DIR/requirements.txt" ]]; then
  run pip install -r "$PROJECT_DIR/requirements.txt"
else
  step "start: no package.json or requirements.txt; skipping install"
fi

step "start: build static output when needed"
DIST="$PROJECT_DIR/dist"
SRC="$PROJECT_DIR/ad.html"
if [[ ! -f "$SRC" ]]; then echo "start: build source $SRC is missing." >&2; exit 1; fi
if [[ ! -f "$DIST/index.html" || "$SRC" -nt "$DIST/index.html" ]]; then
  run mkdir -p "$DIST"
  run cp "$SRC" "$DIST/index.html"
else
  step "start: dist/index.html is up to date; skipping build"
fi
check test -f "$DIST/index.html"

step "start: declare built static output"
run python3 - "$OPENCODE_WEB_DIR/deployment-output.json" "$PROJECT_DIR" "$DIST" <<'PY'
import json, sys
out, project, directory = sys.argv[1], sys.argv[2], sys.argv[3]
with open(out, 'w') as f:
    json.dump({"project": project, "directory": directory}, f)
PY
run cat "$OPENCODE_WEB_DIR/deployment-output.json"

step "start: serving $DIST in the foreground on $PORT"
exec python3 -m http.server "$PORT" --directory "$DIST"
