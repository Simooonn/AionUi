#!/usr/bin/env bash
# Verification + safe-restore helper for 实测验证工作区统一与导入排除计划.
#
# Every subcommand is self-contained: it needs no variables or git config from an
# earlier shell, so it is safe to run from separate tool calls.
#
#   bash verify.sh baseline [--force]  # BEFORE editing anything: snapshot dirty paths + the user's uncommitted diff
#   bash verify.sh restore             # undo NEW off-scope rewrites of code files only (backed up first)
#   bash verify.sh user-check          # exit 0 iff the user's pre-existing uncommitted edits are byte-identical
#   bash verify.sh all                 # lint:fix → restore → scoped oxfmt → tsc → tests → restore → checks
#
# `all` runs the full test suite: give the Bash tool `timeout: 600000` or run it in the background.
set -euo pipefail

ROOT="$(git -C "$(dirname "$0")" rev-parse --show-toplevel)"
cd "$ROOT"

# core.quotePath=false on EVERY git call: the baseline and later reads must use the
# same quoting, or non-ASCII paths stop matching.
GIT=(git -c core.quotePath=false)

STATE_DIR="$ROOT/.omc/state/live-verify"
BASELINE_PATHS="$STATE_DIR/baseline-paths.txt"
BASELINE_META="$STATE_DIR/baseline-meta.txt"
USER_DIFF="$STATE_DIR/user-uncommitted.diff"
USER_PATH="计划/AionUi/归档会话不再重复导入计划"
MEMORY="$HOME/.claude/projects/-Users-wmm-wmm-code-ace-diy-AionUi/memory/live-verify-workspace-convention.md"
EXISTING_TESTS=(tests/unit/ace-import-filter.test.ts tests/unit/process/aceImportDedupe.test.ts)

# The files this plan creates or modifies (the test file and the plan doc may be untracked).
SCOPE=(
  packages/desktop/src/process/ace/importCliSessions.ts
  tests/unit/process/aceImportWorkspaceFilter.test.ts
  .claude/skills/testing/SKILL.md
  AGENTS.md
  ACE_CHANGES.md
  "计划/AionUi/实测验证工作区统一与导入排除计划/实测验证工作区统一与导入排除计划.md"
)
[ "${#SCOPE[@]}" -eq 6 ] || { echo "verify.sh: SCOPE must list 6 paths" >&2; exit 2; }

in_scope() {
  local p="$1" s
  for s in "${SCOPE[@]}"; do [ "$p" = "$s" ] && return 0; done
  return 1
}

# Path part of a `git status --porcelain` line (status prefix and surrounding quotes stripped).
status_path() {
  local p="${1:3}"
  p="${p#\"}"; p="${p%\"}"
  printf '%s\n' "$p"
}

# Only files that `oxlint --fix` (package.json lint:fix) or vitest can write are auto-restored.
auto_restorable() {
  case "$1" in
    *.ts | *.tsx | *.js | *.jsx | *.mjs | *.cjs | *.mts | *.cts | *.snap) return 0 ;;
    *) return 1 ;;
  esac
}

require_baseline() {
  [ -f "$BASELINE_PATHS" ] && [ -f "$BASELINE_META" ] && [ -f "$USER_DIFF" ] ||
    { echo "verify.sh: run 'verify.sh baseline' first" >&2; exit 2; }
}

cmd_baseline() {
  if [ -f "$BASELINE_META" ] && [ "${1:-}" != "--force" ]; then
    echo "verify.sh: a baseline already exists ($(cat "$BASELINE_META")); refusing to overwrite." >&2
    echo "           Re-taking it mid-way would hide rewrites made since. Use 'baseline --force' only on a clean restart." >&2
    exit 2
  fi
  mkdir -p "$STATE_DIR"
  "${GIT[@]}" status --porcelain | while IFS= read -r line; do status_path "$line"; done >"$BASELINE_PATHS"
  "${GIT[@]}" diff -- "$USER_PATH" >"$USER_DIFF"
  echo "HEAD $("${GIT[@]}" rev-parse --short HEAD) at $(date '+%Y-%m-%d %H:%M:%S')" >"$BASELINE_META"
  echo "baseline saved: $(wc -l <"$BASELINE_PATHS" | tr -d ' ') dirty path(s); $(cat "$BASELINE_META")"
}

# Prints off-scope changes that need a human look; returns 1 if any restore failed.
cmd_restore() {
  require_baseline
  local line p rc=0 backup
  backup="$STATE_DIR/restored-$(date +%Y%m%d-%H%M%S).diff"
  while IFS= read -r line; do
    p="$(status_path "$line")"
    grep -qxF -- "$p" "$BASELINE_PATHS" && continue # dirty before we started: never touch, whatever its status now
    in_scope "$p" && continue
    case "$line" in
      '?? '*) echo "REVIEW untracked off-scope file (left alone): $p"; continue ;;
    esac
    if ! auto_restorable "$p"; then
      echo "REVIEW off-scope change to a non-code file (left alone): $p"
      continue
    fi
    "${GIT[@]}" diff -- "$p" >>"$backup" || true
    if "${GIT[@]}" restore -- "$p"; then
      echo "restored off-scope rewrite: $p (backup: $backup)"
    else
      echo "FAILED to restore: $p" >&2
      rc=1
    fi
  done < <("${GIT[@]}" status --porcelain)
  return "$rc"
}

# True when nothing off-scope is left for a human to review. Output is captured first:
# negating a pipeline under pipefail would report "clean" when restore failed AND items exist.
no_offscope_review_items() {
  local out
  out="$(cmd_restore 2>&1)" || true
  if printf '%s\n' "$out" | grep -q '^REVIEW '; then
    printf '%s\n' "$out" | grep '^REVIEW '
    return 1
  fi
  return 0
}

cmd_user_check() {
  require_baseline
  "${GIT[@]}" diff -- "$USER_PATH" | cmp -s - "$USER_DIFF"
}

FAILED=()
step() {
  local name="$1"; shift
  echo "== $name"
  if "$@"; then echo "   ok"; else echo "   FAILED: $name"; FAILED+=("$name"); fi
}

count_is() { [ -f "$3" ] && [ "$(grep -c -- "$2" "$3" || true)" -eq "$1" ]; }
count_at_least() { [ -f "$3" ] && [ "$(grep -cE -- "$2" "$3" || true)" -ge "$1" ]; }
tests_dir_ok() { [ -d tests/unit/process ] && [ "$(ls tests/unit/process | wc -l)" -le 10 ]; }
memory_ok() { grep -qF 'do NOT `mkdir` it as a real directory' "$MEMORY" && ! grep -qF 'create it if missing' "$MEMORY"; }
head_unchanged() { grep -q "^HEAD $("${GIT[@]}" rev-parse --short HEAD) " "$BASELINE_META"; }

cmd_all() {
  require_baseline
  echo "baseline: $(cat "$BASELINE_META")"
  step baseline-head-unchanged head_unchanged
  # Before any restore, so an accidental edit to these files is reported instead of silently undone.
  step ac3-existing-tests-untouched "${GIT[@]}" diff --quiet HEAD -- "${EXISTING_TESTS[@]}"
  step lint:fix bun run lint:fix
  step restore-after-lint cmd_restore
  step oxfmt bunx oxfmt "${SCOPE[@]}"
  step oxfmt-check bunx oxfmt --check "${SCOPE[@]}"
  step tsc bunx tsc --noEmit
  step vitest-targeted bunx vitest run tests/unit/process/aceImportWorkspaceFilter.test.ts "${EXISTING_TESTS[@]}"
  step test-all bun run test
  step restore-after-tests cmd_restore
  step no-offscope-changes-to-review no_offscope_review_items
  step user-edits-intact cmd_user_check
  step tests-dir-size tests_dir_ok
  step ac4-agents-markers count_is 1 'ace:start live-verify' AGENTS.md
  step ac4-agents-markers-end count_is 1 'ace:end live-verify' AGENTS.md
  step ac4-skill-markers count_is 1 'ace:start live-verify' .claude/skills/testing/SKILL.md
  step ac4-skill-markers-end count_is 1 'ace:end live-verify' .claude/skills/testing/SKILL.md
  step ac5-importer-row count_at_least 1 'isAionUiInternalWorkspace' ACE_CHANGES.md
  step ac5-test-row count_at_least 1 'aceImportWorkspaceFilter\.test\.ts' ACE_CHANGES.md
  step ac5-mount-rows count_at_least 2 'testing/SKILL\.md.*Live Verification|AGENTS\.md.*live-verify' ACE_CHANGES.md
  step ac5-check-item count_at_least 1 '\(c\) 统一内部工作区排除' ACE_CHANGES.md
  step ac7-memory memory_ok
  echo
  if [ "${#FAILED[@]}" -eq 0 ]; then
    echo "ALL CHECKS PASSED"
  else
    printf 'FAILED: %s\n' "${FAILED[@]}"
    exit 1
  fi
}

case "${1:-}" in
  baseline) cmd_baseline "${2:-}" ;;
  restore) cmd_restore ;;
  user-check) cmd_user_check && echo "user edits intact" ;;
  all) cmd_all ;;
  *) echo "usage: bash verify.sh {baseline [--force]|restore|user-check|all}" >&2; exit 2 ;;
esac
