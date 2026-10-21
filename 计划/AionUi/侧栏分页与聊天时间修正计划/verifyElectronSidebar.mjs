import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const idsFile = join(dir, 'live-session-ids.json');
const ids = JSON.parse(readFileSync(idsFile, 'utf8'));
const workspace = '/Users/wmm/.aionui/live-verify';
const prompt = 'Reply only OK. Do not use tools, read files, or make changes.';
const afterRestart = process.argv.includes('--after-restart');
const report = afterRestart
  ? JSON.parse(readFileSync(join(dir, 'electron-live-results.json'), 'utf8'))
  : { startedAt: new Date().toISOString(), ids, checks: [], snapshots: [], errors: [], mainRestartVerified: false };
if (afterRestart && report.checks.some((c) => c.name.startsWith('main restart'))) {
  report.restartAttempts ??= [];
  report.restartAttempts.push({
    at: report.finishedAt,
    checks: report.checks.filter((c) => c.name.startsWith('main restart')),
    snapshot: report.snapshots.at(-1),
    note: 'Initial sampling preceded sidebar DOM readiness; retained as timing evidence.',
  });
  report.checks = report.checks.filter((c) => !c.name.startsWith('main restart'));
}
const save = () => writeFileSync(join(dir, 'electron-live-results.json'), JSON.stringify(report, null, 2) + '\n');
const check = (name, ok, evidence) => {
  report.checks.push({ name, ok: Boolean(ok), evidence });
  save();
  console.log(name, Boolean(ok));
};
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
let browser;
let page;
let port;
async function api(path, method = 'GET', body) {
  const match = path.match(/^\/api\/conversations\/([^/]+)/);
  if (match && !Object.values(ids).includes(match[1])) throw new Error('Non-test conversation access denied');
  const r = await fetch(`http://127.0.0.1:${port}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const result = await r.json();
  if (!r.ok || !result.success) throw new Error(`API ${method} ${path}: ${JSON.stringify(result)}`);
  return result.data;
}
async function refresh() {
  await page.evaluate(async () => {
    const urls = performance
      .getEntriesByType('resource')
      .map((e) => e.name)
      .filter((n) => n.includes('/hooks/useConversationListSync.ts'));
    for (const u of urls.reverse()) {
      const m = await import(u);
      if (m.getConversationListSyncSnapshot().hasLoadedOnce) {
        await m.refreshConversations();
        return;
      }
    }
    const { emitter } = await import('/utils/emitter.ts');
    emitter.emit('chat.history.refresh');
  });
  await page.waitForTimeout(900);
}
async function snapshot(label) {
  await refresh();
  const value = await page.evaluate(
    async ({ ids, workspace }) => {
      const urls = performance
        .getEntriesByType('resource')
        .map((e) => e.name)
        .filter((n) => n.includes('/hooks/useConversationListSync.ts'));
      let s;
      let moduleUrl;
      for (const u of urls.reverse()) {
        const candidate = (await import(u)).getConversationListSyncSnapshot();
        if (candidate.hasLoadedOnce) {
          s = candidate;
          moduleUrl = u;
          break;
        }
      }
      if (!s) throw new Error('No live sidebar store found');
      const times = await window.electronAPI.conversationActivityTimes();
      const members = s.conversations.filter((c) => c.extra?.workspace === workspace);
      const helperUrls = performance
        .getEntriesByType('resource')
        .map((e) => e.name)
        .filter((n) => n.includes('/utils/groupingHelpers.ts'));
      const grouped = (
        await import(helperUrls.at(-1) || '/pages/conversation/GroupedHistory/utils/groupingHelpers.ts')
      ).buildGroupedHistory(members, (x) => x);
      const project = grouped.timelineSections
        .flatMap((x) => x.items)
        .find((x) => x.workspaceGroup?.workspace === workspace);
      const rows = [...document.querySelectorAll('.conversation-item')].map((e) => ({
        id: e.id,
        workspace: Boolean(e.closest('.workspace-collapse')),
      }));
      const owned = Object.values(ids);
      return {
        moduleUrl,
        activityStatus: s.activityStatus,
        complete: s.isConversationListComplete,
        conversations: s.conversations
          .filter((c) => owned.includes(c.id))
          .map((c) => ({
            id: c.id,
            name: c.name,
            modifiedAt: c.modified_at,
            activityAt: c.chat_activity_at,
            pinned: c.extra?.pinned,
            pinnedAt: c.extra?.pinned_at,
          })),
        ipc: { ok: times.ok, times: Object.fromEntries(owned.map((id) => [id, times.times?.[id] ?? null])) },
        projectTime: project?.time,
        projectOrder: project?.workspaceGroup.conversations.map((c) => c.id) || [],
        pinnedOrder: grouped.pinnedConversations.map((c) => c.id),
        recentDom: rows.filter((r) => r.id.startsWith('rc-')).map((r) => r.id.slice(3)),
        projectDom: rows.filter((r) => r.workspace).map((r) => r.id),
        otherDom: rows.filter((r) => !r.workspace && !r.id.startsWith('rc-')).map((r) => r.id),
      };
    },
    { ids, workspace }
  );
  report.snapshots.push({ label, at: new Date().toISOString(), ...value });
  save();
  return value;
}
async function menu(id, text) {
  if (!Object.values(ids).includes(id)) throw new Error('Non-test UI target denied');
  await page.keyboard.press('Escape');
  await page.locator(`#rc-${id}`).hover();
  await page.locator(`#rc-${id} [data-testid="conversation-row-menu-${id}"]`).click();
  await page.locator('.arco-dropdown-menu-item:visible').getByText(text, { exact: true }).click();
  await page.waitForTimeout(600);
}
async function sendAndWait(id) {
  const before = (await api(`/api/conversations/${id}/messages`)).items.length;
  await api(`/api/conversations/${id}/messages`, 'POST', { content: prompt });
  const end = Date.now() + 100000;
  while (Date.now() < end) {
    await new Promise((r) => setTimeout(r, 1500));
    const detail = await api(`/api/conversations/${id}`);
    const messages = await api(`/api/conversations/${id}/messages`);
    if (detail.runtime.state === 'idle' && messages.items.length >= before + 2) {
      report.messageEvidence ??= [];
      report.messageEvidence.push({
        id,
        runtime: detail.runtime.state,
        before,
        after: messages.items.length,
        types: messages.items.map((m) => m.type || m.role),
      });
      save();
      return;
    }
  }
  throw new Error(`Message completion timeout: ${id}`);
}
function stable(label, before, after, omitted = []) {
  check(`${label}: activity unchanged`, same(before.ipc, after.ipc), { before: before.ipc, after: after.ipc });
  check(`${label}: project time unchanged`, before.projectTime === after.projectTime, [
    before.projectTime,
    after.projectTime,
  ]);
  check(
    `${label}: remaining member order unchanged`,
    same(
      before.projectOrder.filter((id) => !omitted.includes(id)),
      after.projectOrder.filter((id) => !omitted.includes(id))
    ),
    { before: before.projectOrder, after: after.projectOrder }
  );
  check(`${label}: recent order unchanged`, same(before.recentDom, after.recentDom), [
    before.recentDom,
    after.recentDom,
  ]);
}
try {
  const processes = execFileSync('ps', ['-axo', 'pid,ppid,command'], { encoding: 'utf8' });
  const devBackend = processes
    .split('\n')
    .find((l) => l.includes('/resources/bundled-aioncore/') && l.includes('--data-dir /Users/wmm/.aionui-dev '));
  if (!devBackend) throw new Error('Development backend process not verified');
  if (afterRestart)
    report.preRestart ??= {
      devBackendProcess: report.devBackendProcess,
      backendPort: report.backendPort,
      snapshot: report.snapshots.at(-1),
    };
  report.devBackendProcess = devBackend.trim();
  browser = await chromium.connectOverCDP('http://127.0.0.1:9231');
  page = browser
    .contexts()
    .flatMap((c) => c.pages())
    .find((p) => p.url().startsWith('http://localhost:5173/'));
  if (!page) throw new Error('Development renderer not verified');
  page.setDefaultTimeout(12000);
  port = await page.evaluate(() => window.__backendPort);
  report.backendPort = port;
  const sockets = execFileSync('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN'], { encoding: 'utf8' });
  if (!sockets.includes(devBackend.trim().split(/\s+/)[0]))
    throw new Error('Backend port does not belong to dev process');
  report.backendSocket = sockets;
  const a = await api(`/api/conversations/${ids.A}`);
  if (ids.A !== '9478bf64' || a.extra.workspace !== workspace) throw new Error('A identity mismatch');
  if (afterRestart) {
    await page.locator(`#rc-${ids.A}`).waitFor({ state: 'visible', timeout: 30000 });
    const restarted = await snapshot('main-process-restart');
    const before = report.preRestart.snapshot;
    stable('main restart', before, restarted);
    check('main restart preserves manual pin order', same(before.pinnedOrder, restarted.pinnedOrder), [
      before.pinnedOrder,
      restarted.pinnedOrder,
    ]);
    check(
      'main restart preserves renamed C',
      restarted.conversations.find((c) => c.id === ids.C)?.name === 'DELTEST-SIDEBAR-20261019-C-RENAMED'
    );
    const previousPid = report.preRestart.devBackendProcess.split(/\s+/)[0];
    const nextPid = report.devBackendProcess.split(/\s+/)[0];
    check('main restart uses a new dev backend process', previousPid !== nextPid, {
      previousPid,
      nextPid,
      beforePort: report.preRestart.backendPort,
      afterPort: port,
    });
    report.runtimeAfterRestart = [];
    for (const id of Object.values(ids)) {
      const detail = await api(`/api/conversations/${id}`);
      report.runtimeAfterRestart.push({ id, state: detail.runtime.state, workspace: detail.extra.workspace });
    }
    check(
      'main restart preserves A/B/C and shared workspace',
      report.runtimeAfterRestart.every((c) => c.state === 'idle' && c.workspace === workspace),
      report.runtimeAfterRestart
    );
    report.mainRestartVerified = report.checks.filter((c) => c.name.startsWith('main restart')).every((c) => c.ok);
  } else {
    for (const key of ['B', 'C']) {
      if (!ids[key]) {
        const c = await api('/api/conversations', 'POST', {
          type: 'acp',
          name: `DELTEST-SIDEBAR-20261019-${key}`,
          extra: { backend: 'claude', workspace, custom_workspace: true },
        });
        ids[key] = c.id;
        writeFileSync(idsFile, JSON.stringify(ids, null, 2) + '\n');
        save();
      }
      const detail = await api(`/api/conversations/${ids[key]}`);
      if (detail.extra.workspace !== workspace) throw new Error('Workspace mismatch');
      if ((await api(`/api/conversations/${ids[key]}/messages`)).items.length === 0) await sendAndWait(ids[key]);
    }
    await page.reload();
    await page.waitForTimeout(1200);
    await refresh();
    await page.mouse.click(700, 80);
    const folder = page
      .locator('.workspace-collapse')
      .filter({ has: page.getByText('live-verify', { exact: true }) })
      .first();
    if (await folder.locator('.i-icon-folder-close').count())
      await folder.getByText('live-verify', { exact: true }).first().click();
    let initial = await snapshot('initial');
    for (const id of [ids.A, ids.B]) if (initial.pinnedOrder.includes(id)) await menu(id, '取消置顶');
    const baseline = await snapshot('baseline');
    await menu(ids.A, '置顶');
    const pin = await snapshot('pin-A');
    stable('pin A', baseline, pin, [ids.A]);
    check(
      'pin A: actual UI contains standalone row',
      pin.pinnedOrder.includes(ids.A) && pin.otherDom.some((id) => id.includes(ids.A)),
      pin.otherDom
    );
    await menu(ids.A, '取消置顶');
    const unpin = await snapshot('unpin-A');
    stable('unpin A', baseline, unpin);
    await menu(ids.C, '重命名');
    const dialog = page.getByRole('dialog', { name: '重命名对话' });
    await dialog.locator('input').fill('DELTEST-SIDEBAR-20261019-C-RENAMED');
    await dialog.getByRole('button', { name: /确定|确认|保存|OK/ }).click();
    const renamed = await snapshot('rename-C');
    stable('rename C', unpin, renamed);
    check(
      'rename C: actual UI name updated',
      await page
        .locator(`#rc-${ids.C}`)
        .innerText()
        .then((t) => t.includes('DELTEST-SIDEBAR-20261019-C-RENAMED'))
    );
    await page.locator(`#rc-${ids.A}`).click();
    await page.waitForTimeout(2000);
    const opened = await snapshot('open-A-without-message');
    stable('open A without message', renamed, opened);
    check('open A: selected route', page.url().includes(ids.A), page.url());
    await menu(ids.A, '置顶');
    await menu(ids.B, '置顶');
    const beforeMessage = await snapshot('before-new-message');
    await sendAndWait(ids.A);
    const sent = await snapshot('after-new-message');
    check('new message advances chat activity', sent.ipc.times[ids.A] > beforeMessage.ipc.times[ids.A], [
      beforeMessage.ipc.times[ids.A],
      sent.ipc.times[ids.A],
    ]);
    check(
      'new message moves A to recent front',
      sent.recentDom[0] === ids.A && beforeMessage.recentDom.indexOf(ids.A) > 0,
      [beforeMessage.recentDom, sent.recentDom]
    );
    check(
      'new message preserves manual pin order',
      beforeMessage.pinnedOrder.length >= 2 && same(sent.pinnedOrder, beforeMessage.pinnedOrder),
      [beforeMessage.pinnedOrder, sent.pinnedOrder]
    );
    check('new message advances project time including pinned member', sent.projectTime > beforeMessage.projectTime, [
      beforeMessage.projectTime,
      sent.projectTime,
    ]);
    await page.reload();
    await page.waitForTimeout(2000);
    const reloaded = await snapshot('page-reload');
    stable('page reload', sent, reloaded);
    check('page reload preserves manual pin order', same(sent.pinnedOrder, reloaded.pinnedOrder), [
      sent.pinnedOrder,
      reloaded.pinnedOrder,
    ]);
  }
  await page.screenshot({ path: join(dir, 'electron-sidebar-verified.png'), fullPage: true });
  report.screenshot = 'electron-sidebar-verified.png';
} catch (error) {
  report.errors.push(String(error.stack || error));
  console.error(error);
  if (page) {
    await page.screenshot({ path: join(dir, 'electron-sidebar-verified.png'), fullPage: true }).catch(() => {});
    report.screenshot = 'electron-sidebar-verified.png';
  }
} finally {
  report.finishedAt = new Date().toISOString();
  report.status = report.errors.length ? 'driver-error' : report.checks.some((c) => !c.ok) ? 'failed' : 'passed';
  save();
  await browser?.close();
  console.log(JSON.stringify({ status: report.status, ids, checks: report.checks.length, errors: report.errors }));
  process.exitCode = report.status === 'passed' ? 0 : 1;
}
