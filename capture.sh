#!/usr/bin/env bash
# Capture desktop + mobile screenshots of the running app.
# Env: CAPTURE_URL (exact URL to open), CAPTURE_DIR (output dir, kept outside the source tree).
# Exit 75 = temporary navigation/browser infrastructure failure; exit 1 = script or rendering defect.
# Never touches the app server: it is left running.
set -euo pipefail

if [[ -z "${CAPTURE_URL:-}" || -z "${CAPTURE_DIR:-}" ]]; then
  echo 'capture.sh: set CAPTURE_URL and CAPTURE_DIR.' >&2
  exit 1
fi

/usr/bin/time -p mkdir -p "$CAPTURE_DIR"
/usr/bin/time -p node "${RUNTIME_DIR:?}/scripts/default-capture.mjs"
rc=$?
if [[ $rc -ne 0 ]]; then
  echo "capture.sh: browser capture failed with exit $rc." >&2
  exit "$rc"
fi

# Rendering-defect check: both screenshots must exist and be non-trivial in size.
/usr/bin/time -p test -f "$CAPTURE_DIR/final-desktop.png"
/usr/bin/time -p test -f "$CAPTURE_DIR/final-mobile.png"
if [[ ! -s "$CAPTURE_DIR/final-desktop.png" || ! -s "$CAPTURE_DIR/final-mobile.png" ]]; then
  echo 'capture.sh: screenshots missing or empty (rendering defect).' >&2
  exit 1
fi
min_bytes=20000
for shot in final-desktop.png final-mobile.png; do
  size=$(/usr/bin/time -p wc -c < "$CAPTURE_DIR/$shot")
  if [[ "$size" -lt "$min_bytes" ]]; then
    echo "capture.sh: $shot too small ($size bytes, rendering defect)." >&2
    exit 1
  fi
done

echo "capture.sh: saved $CAPTURE_DIR/final-desktop.png + $CAPTURE_DIR/final-mobile.png"
