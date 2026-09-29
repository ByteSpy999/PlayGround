#!/usr/bin/env bash
# Once-per-worker prerequisites for the PlayGround static preview.
# The controller executes this saved hook on worker start; it must stay
# idempotent and fast when everything is already provisioned.
set -euo pipefail

step() { echo ">>> [${SECONDS}s] $*"; }
done_step() { echo "<<< [${SECONDS}s] exit=$1 :: $2"; }
# run() wraps external commands only (/usr/bin/time cannot exec shell builtins).
run() { step "$*"; /usr/bin/time -p "$@"; local rc=$?; done_step "$rc" "$*"; return "$rc"; }
# check() verifies a shell builtin/conditional with explicit timing markers.
check() { step "$*"; "$@"; local rc=$?; done_step "$rc" "$*"; return "$rc"; }

RUNTIME_DIR="${RUNTIME_DIR:-/home/runner/work/_temp/omgithub-runtime}"
PW_RUNTIME="$HOME/.local/share/omgithub-playwright"

step "startup: required CLIs present"
check command -v python3
check command -v node

if command -v ffmpeg >/dev/null 2>&1; then
  step "startup: ffmpeg already installed ($(command -v ffmpeg))"
else
  step "startup: installing ffmpeg (missing)"
  run sudo -n apt-get update
  run sudo -n apt-get install -y ffmpeg
fi
check command -v ffmpeg

playwright_healthy() {
  [[ -x "$PW_RUNTIME/node_modules/.bin/playwright" ]] \
    && ls "$HOME/.cache/ms-playwright/chromium-"*/chrome-linux*/chrome >/dev/null 2>&1 \
    && [[ -s "$PW_RUNTIME/display" ]] \
    && kill -0 "$(cat "$PW_RUNTIME/xvfb.pid" 2>/dev/null)" 2>/dev/null
}

if playwright_healthy; then
  step "startup: playwright browser + Xvfb already healthy"
else
  step "startup: provisioning playwright browser + Xvfb"
  run bash "$RUNTIME_DIR/scripts/setup-linux-playwright.sh"
fi

step "startup: re-verifying playwright health"
playwright_healthy
rc=$?
done_step "$rc" "playwright_healthy"
exit "$rc"
