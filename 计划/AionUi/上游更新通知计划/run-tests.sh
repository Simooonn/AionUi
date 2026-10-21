#!/usr/bin/env bash
# Test harness for .github/workflows/upstream-commit-notify.yml (lives on the fork's main only).
# Extracts the step's run script and executes it the way GitHub does for `shell: bash`
# (bash --noprofile --norc -eo pipefail), with `gh` and `curl` replaced by stubs on PATH.
# Expected values are hard-coded or computed by an independent Python reference.
# Usage: WF=<path to the workflow yml> bash run-tests.sh
#   e.g. git show origin/main:.github/workflows/upstream-commit-notify.yml >/tmp/ucn.yml && WF=/tmp/ucn.yml bash run-tests.sh
set -u

WF=${WF:?set WF to the workflow yml (see Usage above)}
HERE=$(cd "$(dirname "$0")" && pwd)
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

fail=0
pass=0
check() { # check <description> <command...>
  local desc=$1
  shift
  if "$@"; then
    pass=$((pass + 1))
    echo "  ok   $desc"
  else
    fail=$((fail + 1))
    echo "  FAIL $desc"
  fi
}

# --- extract script and workflow-level env from the YAML ---
ruby -ryaml -e '
  y = YAML.load_file(ARGV[0])
  step = y["jobs"]["notify"]["steps"].find { |s| s["name"] == "Post unsynced upstream commits to Lark" }
  File.write(ARGV[1], step["run"])
  File.write(ARGV[2], y["env"].map { |k, v| "export #{k}=#{v}\n" }.join)
' "$WF" "$WORK/step.sh" "$WORK/wf-env.sh" 2>/dev/null || {
  echo "FAIL could not extract step script from $WF"
  exit 1
}

# --- stubs ---
mkdir -p "$WORK/bin"
cat >"$WORK/bin/gh" <<'EOF'
#!/usr/bin/env bash
echo "$*" >>"$CASE_DIR/gh.calls"
cat "$CASE_DIR/compare.json"
exit "${GH_EXIT:-0}"
EOF
cat >"$WORK/bin/curl" <<'EOF'
#!/usr/bin/env bash
echo "$*" >>"$CASE_DIR/curl.calls"
while [ $# -gt 0 ]; do
  case $1 in
    -d) printf '%s' "$2" >"$CASE_DIR/payload.json"; shift ;;
  esac
  shift
done
cat "$CASE_DIR/response.json"
exit "${CURL_EXIT:-0}"
EOF
chmod +x "$WORK/bin/gh" "$WORK/bin/curl"

# make_compare <dir> <count> : synthetic compare response, commits oldest first
make_compare() {
  python3 -I - "$1/compare.json" "$2" <<'EOF'
import json, sys
path, n = sys.argv[1], int(sys.argv[2])
commits = []
for i in range(1, n + 1):
    date = f"2026-10-{(i % 9) + 10:02d}T0{i % 10}:15:00Z"
    if i == n:
        date = "2026-10-20T18:00:00Z"  # newest; crosses midnight in UTC+8
    commits.append({
        "sha": f"{i:07d}" + "a" * 33,
        "commit": {"author": {"name": f"dev{i}"}, "committer": {"date": date},
                   "message": f"feat: change {i}\n\nbody line"},
    })
json.dump({"status": "ahead", "ahead_by": n, "html_url": "https://github.com/iOfficeAI/AionUi/compare/Simooonn:main...iOfficeAI:main", "commits": commits}, open(path, "w"), ensure_ascii=False)
EOF
}

# run_case <name> [env assignments...] : runs the step; sets CASE_DIR, RC, OUT.
# compare.json / response.json default to the real-data fixture and a Lark success reply.
run_case() {
  CASE_DIR=$WORK/$1
  shift
  mkdir -p "$CASE_DIR"
  [ -f "$CASE_DIR/compare.json" ] || cp "$HERE/fixture-behind2.json" "$CASE_DIR/compare.json"
  [ -f "$CASE_DIR/response.json" ] || echo '{"StatusCode":0,"StatusMessage":"success","code":0,"data":{},"msg":"success"}' >"$CASE_DIR/response.json"
  # shellcheck disable=SC2016 # $1/$2 belong to the inner bash
  OUT=$(
    env -i PATH="$WORK/bin:$PATH" HOME="$HOME" CASE_DIR="$CASE_DIR" \
      GITHUB_REPOSITORY_OWNER=Simooonn GH_TOKEN=test-token \
      LARK_WEBHOOK_URL=https://open.larksuite.com/open-apis/bot/v2/hook/test LARK_WEBHOOK_SECRET=test-secret \
      "$@" bash --noprofile --norc -c '. "$1"; exec bash --noprofile --norc -eo pipefail "$2"' _ "$WORK/wf-env.sh" "$WORK/step.sh" 2>&1
  )
  RC=$?
}

calls() { [ -f "$CASE_DIR/$1.calls" ] && wc -l <"$CASE_DIR/$1.calls" | tr -d ' ' || echo 0; }
payload() { jq -r "$1" "$CASE_DIR/payload.json"; }
lines() { jq -r '.content.post.zh_cn.content[] | map(.text) | join("")' "$CASE_DIR/payload.json"; }

echo "case: behind=2 (real upstream commits)"
run_case behind2
check "exit 0" [ "$RC" -eq 0 ]
check "gh called once with cross-fork compare" [ "$(cat "$CASE_DIR/gh.calls")" = "api repos/iOfficeAI/AionUi/compare/Simooonn:main...iOfficeAI:main" ]
check "curl called once" [ "$(calls curl)" -eq 1 ]
check "msg_type post" [ "$(payload .msg_type)" = post ]
check "title has count" [ "$(payload .content.post.zh_cn.title)" = "上游 iOfficeAI/AionUi 有 2 个提交未同步到 fork main" ]
EXPECTED=$(printf '%s\n' \
  '886dcbd  2026-10-19 21:25  瓦砾: chore(docs): update WeChat group QR code to wx-25 (#4337)' \
  'c140550  2026-10-14 12:18  瓦砾: chore(docs): update WeChat group QR code to wx-24 (#4320)' \
  '查看全部差异')
check "commit lines newest first in UTC+8, then link" [ "$(lines)" = "$EXPECTED" ]
check "link href is compare html_url" [ "$(payload '.content.post.zh_cn.content[-1][0].href')" = "https://github.com/iOfficeAI/AionUi/compare/Simooonn:main...iOfficeAI:main" ]
REF_SIGN=$(python3 -I -c 'import base64,hashlib,hmac,sys; print(base64.b64encode(hmac.new(f"{sys.argv[1]}\n{sys.argv[2]}".encode(), b"", hashlib.sha256).digest()).decode())' "$(payload .timestamp)" test-secret)
check "sign matches Python reference" [ "$(payload .sign)" = "$REF_SIGN" ]
check "timestamp is current epoch seconds" python3 -I -c 'import sys,time; sys.exit(abs(int(sys.argv[1]) - time.time()) > 120)' "$(payload .timestamp)"
check "log reports posted count" grep -q 'Posted 2 unsynced commit(s) to Lark.' <<<"$OUT"

echo "case: behind=23 (truncate to 20)"
mkdir -p "$WORK/behind23"
make_compare "$WORK/behind23" 23
run_case behind23
check "exit 0" [ "$RC" -eq 0 ]
check "title has count 23" [ "$(payload .content.post.zh_cn.title)" = "上游 iOfficeAI/AionUi 有 23 个提交未同步到 fork main" ]
check "22 rows (20 commits + more + link)" [ "$(lines | wc -l | tr -d ' ')" -eq 22 ]
check "first row is newest, midnight rollover" [ "$(lines | sed -n 1p)" = "0000023  2026-10-21 02:00  dev23: feat: change 23" ]
check "20th row is commit 4" [ "$(lines | sed -n 20p | cut -c1-7)" = 0000004 ]
check "more row says 3" [ "$(lines | sed -n 21p)" = "……另有 3 个更早的提交未列出" ]

echo "case: in sync"
mkdir -p "$WORK/sync"
echo '{"status":"identical","ahead_by":0,"html_url":"x","commits":[]}' >"$WORK/sync/compare.json"
run_case sync
check "exit 0" [ "$RC" -eq 0 ]
check "curl never called" [ "$(calls curl)" -eq 0 ]
check "log says in sync" grep -q 'Fork main is in sync with iOfficeAI/AionUi; nothing to notify.' <<<"$OUT"

echo "case: Lark rejects (code 19021)"
mkdir -p "$WORK/reject"
echo '{"code":19021,"data":{},"msg":"sign match fail or timestamp is not within one hour from current time"}' >"$WORK/reject/response.json"
run_case reject
check "exit non-zero" [ "$RC" -ne 0 ]
check "log has Lark response" grep -q '::error::Lark rejected the message: .*19021.*sign match fail' <<<"$OUT"

echo "case: curl transport failure"
mkdir -p "$WORK/curlfail"
echo 'curl: (6) Could not resolve host' >"$WORK/curlfail/response.json"
run_case curlfail CURL_EXIT=6
check "exit non-zero" [ "$RC" -ne 0 ]
check "log has error" grep -q '::error::Lark rejected the message: curl: (6)' <<<"$OUT"

echo "case: Lark returns non-JSON"
mkdir -p "$WORK/nonjson"
echo '<html>502 Bad Gateway</html>' >"$WORK/nonjson/response.json"
run_case nonjson
check "exit non-zero" [ "$RC" -ne 0 ]
check "log has raw response" grep -q '::error::Lark rejected the message: <html>502' <<<"$OUT"

echo "case: gh api fails"
mkdir -p "$WORK/ghfail"
echo '{"message":"Not Found","status":"404"}' >"$WORK/ghfail/compare.json"
run_case ghfail GH_EXIT=1
check "exit non-zero" [ "$RC" -ne 0 ]
check "curl never called" [ "$(calls curl)" -eq 0 ]

echo "case: compare without ahead_by"
mkdir -p "$WORK/noahead"
echo '{"status":"ahead","commits":[]}' >"$WORK/noahead/compare.json"
run_case noahead
check "exit non-zero" [ "$RC" -ne 0 ]
check "curl never called" [ "$(calls curl)" -eq 0 ]

echo "case: compare with non-numeric ahead_by"
mkdir -p "$WORK/strahead"
echo '{"status":"ahead","ahead_by":"unknown","html_url":"x","commits":[]}' >"$WORK/strahead/compare.json"
run_case strahead
check "exit non-zero" [ "$RC" -ne 0 ]
check "curl never called" [ "$(calls curl)" -eq 0 ]

echo "case: secrets missing"
run_case nosecret LARK_WEBHOOK_URL= LARK_WEBHOOK_SECRET=
check "exit non-zero" [ "$RC" -ne 0 ]
check "names both secrets" grep -q '::error::Missing repository secret(s): LARK_WEBHOOK_URL LARK_WEBHOOK_SECRET' <<<"$OUT"
check "gh never called" [ "$(calls gh)" -eq 0 ]

echo "case: one secret missing"
run_case nosecret1 LARK_WEBHOOK_SECRET=
check "names only the missing secret" grep -q '::error::Missing repository secret(s): LARK_WEBHOOK_SECRET$' <<<"$OUT"

echo
echo "passed=$pass failed=$fail"
[ "$fail" -eq 0 ]
