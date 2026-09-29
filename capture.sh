#!/usr/bin/env bash
# Capture desktop + mobile screenshots of CAPTURE_URL into CAPTURE_DIR.
# Exit 75 for temporary navigation/browser infrastructure failures,
# exit 1 for script usage or rendering defects. Never touches the app server.
set -euo pipefail

step() { echo ">>> [${SECONDS}s] $*"; }
done_step() { echo "<<< [${SECONDS}s] exit=$1 :: $2"; }
run() { step "$*"; /usr/bin/time -p "$@"; local rc=$?; done_step "$rc" "$*"; return "$rc"; }
check() { step "$*"; "$@"; local rc=$?; done_step "$rc" "$*"; return "$rc"; }
fail() { local code=$1; shift; echo "capture: $*" >&2; exit "$code"; }

step "capture: validating environment"
[[ -n "${CAPTURE_URL:-}" ]] || fail 1 "CAPTURE_URL is required."
[[ -n "${CAPTURE_DIR:-}" ]] || fail 1 "CAPTURE_DIR is required."
case "$CAPTURE_URL" in http://*|https://*) ;; *) fail 1 "CAPTURE_URL must be http(s), got '$CAPTURE_URL'.";; esac
RUNTIME_DIR="${RUNTIME_DIR:-/home/runner/work/_temp/omgithub-runtime}"
CAPTURE_SCRIPT="$RUNTIME_DIR/scripts/default-capture.mjs"
[[ -f "$CAPTURE_SCRIPT" ]] || fail 75 "capture runtime missing: $CAPTURE_SCRIPT."
command -v node >/dev/null 2>&1 || fail 75 "node is not installed."
done_step 0 "environment OK url=$CAPTURE_URL dir=$CAPTURE_DIR"

step "capture: preparing output directory (outside project source)"
run mkdir -p "$CAPTURE_DIR"

step "capture: opening exact URL and screenshotting desktop + mobile"
export CAPTURE_URL CAPTURE_DIR RUNTIME_DIR
if run node "$CAPTURE_SCRIPT"; then
  capture_rc=0
else
  capture_rc=$?
fi
done_step "$capture_rc" "node default-capture.mjs exit=$capture_rc"
if [[ "$capture_rc" -eq 75 ]]; then fail 75 "temporary navigation/browser infrastructure failure (see log above)."; fi
if [[ "$capture_rc" -ne 0 ]]; then fail 1 "capture script failed with exit $capture_rc."; fi

step "capture: verifying final PNGs"
for name in final-desktop.png final-mobile.png; do
  check test -f "$CAPTURE_DIR/$name"
  [[ -s "$CAPTURE_DIR/$name" ]] || fail 1 "rendering defect: $name is missing or empty."
  if check python3 -c "import sys; sys.exit(0 if open(sys.argv[1],'rb').read(8)==b'\x89PNG\r\n\x1a\n' else 1)" "$CAPTURE_DIR/$name"; then
    step "capture: $name is a valid PNG"
  else
    fail 1 "rendering defect: $name is not a valid PNG."
  fi
done
run ls -la "$CAPTURE_DIR/final-desktop.png" "$CAPTURE_DIR/final-mobile.png"

step "capture: leaving app server running (no restart/stop performed)"
echo "capture: done."
