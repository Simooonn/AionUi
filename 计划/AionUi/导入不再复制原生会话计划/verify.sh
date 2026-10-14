#!/usr/bin/env bash
# Read-only real-data check for 导入不再复制原生会话计划 (plan Appendix 1 §5.2).
#
# Never writes the production DB: it is copied with the sqlite3 backup API from a
# read-only connection, and every query below runs on that copy.
#
# Usage: verify.sh [snapshot-dir]   (default: a fresh mktemp -d; the snapshot is kept
#        there for forensics until the go-live check of todo 9 is accepted)
# Exit:  0 = both criteria hold; 1 = a criterion failed; 2 = setup error.
set -euo pipefail

SRC="${AIONUI_BACKEND_DB:-$HOME/.aionui/aionui-backend.db}"
OUT="${1:-$(mktemp -d)}"
HERE="$(cd "$(dirname "$0")" && pwd -P)"
REPO="$(git -C "$HERE" rev-parse --show-toplevel)"
SCHEMA="$REPO/packages/desktop/src/process/ace/aioncoreSchema.ts"

[ -f "$SRC" ] || { echo "backend DB not found: $SRC" >&2; exit 2; }
mkdir -p "$OUT"
rm -f "$OUT/snap.db" "$OUT/snap.db-wal" "$OUT/snap.db-shm"
sqlite3 -readonly "$SRC" ".backup '$OUT/snap.db'"
# The copy inherits WAL mode, which a read-only connection cannot open. Switch the COPY only.
sqlite3 "$OUT/snap.db" 'PRAGMA journal_mode=DELETE' >/dev/null
rm -f "$OUT/snap.db-wal" "$OUT/snap.db-shm"

cat >"$OUT/verify.ts" <<'TS'
import { Database } from 'bun:sqlite';
import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

type Row = Record<string, unknown>;

async function main(): Promise<number> {
  const { ACP_SESSION_IDS_SQL, DUPLICATE_IMPORT_LOSERS_SQL, IMPORTED_CLI_SESSION_IDS_SQL } = await import(process.env.SCHEMA!);
  const db = new Database(process.env.SNAP!, { readonly: true });
  const all = (sql: string, ...params: unknown[]) => db.query(sql).all(...(params as [])) as Row[];

  // ① Imported copies of a session an existing, non-imported, same-user conversation owns.
  const NATIVE_COPIES_SQL = `SELECT DISTINCT imp.id
    FROM conversations imp
    JOIN acp_session a ON a.session_id = json_extract(imp.extra, '$.cli_session_id')
                      AND a.conversation_id <> imp.id
    JOIN conversations own ON own.id = a.conversation_id AND own.user_id = imp.user_id
   WHERE json_type(imp.extra, '$.cli_session_id') = 'text'
     AND json_extract(imp.extra, '$.cli_session_id') <> ''
     AND json_extract(imp.extra, '$.fork') IS NULL
     AND json_type(own.extra, '$.cli_session_id') IS NOT 'text'`;

  // ② The pre-change rule (commit db8811fa9, aioncoreSchema.ts:125-142), verbatim: later imports of one sid.
  const OLD_LOSERS_SQL = `SELECT r.id, r.sid AS cliSessionId,
         (r.archived_at IS NOT NULL) AS archived,
         EXISTS (SELECT 1 FROM messages m WHERE m.conversation_id = r.id AND m.id NOT LIKE 'cli-%') AS hasLiveTurns,
         EXISTS (SELECT 1 FROM cron_jobs j WHERE j.conversation_id = r.id) AS hasCronJobs
    FROM (
      SELECT id, user_id, archived_at,
             json_extract(extra, '$.cli_session_id') AS sid,
             ROW_NUMBER() OVER (
               PARTITION BY user_id, json_extract(extra, '$.cli_session_id')
               ORDER BY created_at ASC, rowid ASC
             ) AS rn
        FROM conversations
       WHERE json_type(extra, '$.cli_session_id') = 'text'
         AND json_extract(extra, '$.cli_session_id') <> ''
         AND json_extract(extra, '$.fork') IS NULL
    ) AS r
   WHERE r.rn > 1
   ORDER BY r.user_id, r.sid, r.rn`;

  let failed = false;
  const idSet = (rows: Row[]) => new Set(rows.map((r) => String(r.id)));

  // Criterion 1: the new loser set equals the independent oracle ① ∪ ②.
  const losers = all(DUPLICATE_IMPORT_LOSERS_SQL);
  const actual = idSet(losers);
  const oracle = new Set([...idSet(all(NATIVE_COPIES_SQL)), ...idSet(all(OLD_LOSERS_SQL))]);
  const onlyActual = [...actual].filter((id) => !oracle.has(id));
  const onlyOracle = [...oracle].filter((id) => !actual.has(id));
  if (onlyActual.length || onlyOracle.length) {
    failed = true;
    console.log(`判据 1 失败：新 SQL 多出 ${JSON.stringify(onlyActual)}，缺少 ${JSON.stringify(onlyOracle)}`);
  } else {
    console.log(`判据 1 通过：新 SQL 淘汰集合 == 对照集合（${actual.size} 条）`);
  }

  // Criterion 2: the baseline union holds the two session ids the spec names.
  const baseline = new Set([
    ...all(IMPORTED_CLI_SESSION_IDS_SQL).map((r) => String(r.sid)),
    ...all(ACP_SESSION_IDS_SQL).map((r) => String(r.sid)),
  ]);
  const REQUIRED = {
    '979d8548-ec94-4aaa-8c7d-30db745aeb31': '甲方爸爸（原生会话 0dca1f17）',
    'e8382135-2ac4-4791-9b4e-e05cf9cbc5cb': '当前会话 7b097fde',
  };
  const missing = Object.keys(REQUIRED).filter((sid) => !baseline.has(sid));
  if (missing.length) {
    failed = true;
    console.log(`判据 2 失败：基线缺少 ${missing.map((s) => `${s}（${REQUIRED[s as keyof typeof REQUIRED]}）`).join('、')}`);
  } else {
    console.log(`判据 2 通过：基线并集 ${baseline.size} 个 sid，含规格点名的 2 个`);
  }

  // Report: what the next import click would do (open embedded terminals cannot be seen from a snapshot).
  const title = (id: string) => String(all('SELECT name FROM conversations WHERE id = ?', id)[0]?.name ?? '').slice(0, 30);
  const ownerOf = (loser: Row) => {
    const native = all(
      `SELECT c.id FROM acp_session a JOIN conversations c ON c.id = a.conversation_id
        WHERE a.session_id = ? AND json_type(c.extra, '$.cli_session_id') IS NOT 'text'
          AND c.user_id = (SELECT user_id FROM conversations WHERE id = ?) ORDER BY c.created_at LIMIT 1`,
      loser.cliSessionId,
      loser.id
    )[0];
    if (native) return String(native.id);
    const first = all(
      `SELECT id FROM conversations WHERE json_extract(extra, '$.cli_session_id') = ? AND json_extract(extra, '$.fork') IS NULL
          AND user_id = (SELECT user_id FROM conversations WHERE id = ?) ORDER BY created_at, rowid LIMIT 1`,
      loser.cliSessionId,
      loser.id
    )[0];
    return String(first?.id ?? '?');
  };
  const kept = losers.filter((r) => r.hasLiveTurns || r.hasCronJobs);
  console.log(`\n下次点"导入 CLI 会话"：将删除 ${losers.length - kept.length} 条 / 将保留 ${kept.length} 条（不含快照看不到的"打开的内嵌终端"保护）`);
  if (kept.length) {
    console.log('\n受保护副本清单');
    console.log('⚠️  不要在侧栏或归档页删除这些副本——那两个入口会按副本的 cli_session_id 把原生会话共用的 jsonl 一起删掉。');
    console.log('    安全做法：逐条点名后走后端 DELETE /api/conversations/<副本id>（删前删后比对 jsonl 的 shasum），或只归档。');
    for (const r of kept) {
      const owner = ownerOf(r);
      const why = [r.hasLiveTurns ? 'App 内消息' : '', r.hasCronJobs ? '定时任务' : ''].filter(Boolean).join('+');
      console.log(`  副本 ${r.id}「${title(String(r.id))}」 ← 保留方 ${owner}「${title(owner)}」 保护原因：${why}`);
    }
  }

  // Probe (observational): Claude sessions started by an SDK (AionUi, `claude -p`, other tools) that the
  // baseline does not cover. Expected 0; every hit needs a human verdict on whether AionUi started it.
  const root = join(homedir(), '.claude', 'projects');
  const hits: string[] = [];
  for (const dir of existsSync(root) ? readdirSync(root) : []) {
    if (dir.includes('-Library-Application-Support-AionUi') || dir.includes('--aionui')) continue;
    let files: string[] = [];
    try {
      files = readdirSync(join(root, dir)).filter((f) => f.endsWith('.jsonl'));
    } catch {
      continue;
    }
    for (const f of files) {
      const sid = f.slice(0, -'.jsonl'.length);
      if (baseline.has(sid)) continue;
      const text = await Bun.file(join(root, dir, f)).slice(0, 4_000_000).text();
      let entrypoint: string | undefined;
      let cwd: string | undefined;
      let firstUser: string | undefined;
      for (const line of text.split('\n')) {
        if (!line.trim()) continue;
        let o: Row;
        try {
          o = JSON.parse(line) as Row;
        } catch {
          continue;
        }
        if (!cwd && typeof o.cwd === 'string') cwd = o.cwd;
        if (!firstUser && o.type === 'user') {
          const c = (o.message as { content?: unknown } | undefined)?.content;
          const t = typeof c === 'string' ? c : Array.isArray(c) ? (c.find((x) => x?.type === 'text')?.text as string) : '';
          if (t) firstUser = t.replace(/\s+/g, ' ').slice(0, 60);
        }
        if (entrypoint === undefined && typeof o.entrypoint === 'string') entrypoint = o.entrypoint;
        if (entrypoint !== undefined && cwd && firstUser) break;
      }
      if (entrypoint === 'sdk-cli') hits.push(`  ${sid}  cwd=${cwd ?? '?'}  首条用户文本=${firstUser ?? '?'}`);
    }
  }
  console.log(`\n探针：未被基线覆盖的 Claude sdk-cli 会话 ${hits.length} 个（期望 0；非 0 需逐条判定是否 AionUi 来源）`);
  for (const h of hits) console.log(h);
  return failed ? 1 : 0;
}

main().then(
  (code) => process.exit(code),
  (e) => {
    console.error('verify.ts crashed:', e);
    process.exit(2);
  }
);
TS

set +e
SNAP="$OUT/snap.db" SCHEMA="$SCHEMA" bun "$OUT/verify.ts"
code=$?
set -e
echo
echo "快照（仅作取证，待办 9 验收后再删）：$OUT/snap.db"
exit "$code"
