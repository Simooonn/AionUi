#!/usr/bin/env bash
# Run from Terminal.app AFTER quitting AionUi with Cmd+Q, then reopen AionUi.
# Terminal starts in ~, so always invoke this script by its absolute path:
#   /Users/wmm/wmm-code/ace-diy/AionUi/计划/AionUi/渠道会话归入渠道项目计划/swap-aioncore.sh            install the new build
#   /Users/wmm/wmm-code/ace-diy/AionUi/计划/AionUi/渠道会话归入渠道项目计划/swap-aioncore.sh rollback   restore the 3e09b1c2 backup
set -euo pipefail
BUNDLE=/Applications/AionUi.app
APP=$BUNDLE/Contents/Resources/bundled-aioncore/darwin-arm64
NEW=/Users/wmm/wmm-code/ace-diy/AionCore/target/release/aioncore
BAK=/Users/wmm/wmm-code/ace-diy/AionUi/.local/aioncore-rollback/aioncore-3e09b1c2
# AionCore f218d0fa, built 2026-10-29.
NEW_SHA=71fd2c7b9406d69d1740d35a6ba4c21770dbdf0eeb95c7af83d193db1fad7094
OLD_SHA_PREFIX=3e09b1c2

# Match on the executable path only (pgrep -f would also hit claude processes that
# merely mention the aioncore path in their --mcp-config argument).
if pgrep -f "^$BUNDLE/Contents/MacOS/AionUi" >/dev/null || pgrep -f "^$APP/aioncore" >/dev/null; then
  echo "AionUi is still running; quit it with Cmd+Q first. Processes running from the app bundle:" >&2
  pgrep -fl "^$BUNDLE/" >&2 || true
  exit 1
fi

if [ "${1:-}" = rollback ]; then SRC=$BAK; WANT=$OLD_SHA_PREFIX; else SRC=$NEW; WANT=$NEW_SHA; fi
[ -f "$SRC" ] || { echo "missing $SRC" >&2; exit 1; }
GOT=$(shasum -a 256 "$SRC" | cut -d' ' -f1)
case "$GOT" in
  "$WANT"*) ;;
  *) echo "refusing: $SRC has sha256 $GOT, expected $WANT" >&2; exit 1 ;;
esac

# Two separate statements on purpose: set -e aborts if cp fails, and a rerun
# (including rollback) still works when the previous swap stopped half-way.
rm -f "$APP/aioncore"
cp "$SRC" "$APP/aioncore"      # fresh inode; a same-inode overwrite gets SIGKILLed by macOS
codesign --force --deep --sign - "$BUNDLE"
shasum -a 256 "$SRC" "$APP/aioncore"
cmp -s "$SRC" "$APP/aioncore" && echo "OK: /Applications aioncore now matches $SRC"
