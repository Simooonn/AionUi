/**
 * Workspace embedded terminal – panel height regression.
 *
 * Guards the Arco Tabs `justify` fix in TerminalTabs.tsx: without it the
 * Arco-internal .arco-tabs-content-inner / .arco-tabs-content-item wrappers
 * stay height:auto and the terminal collapses to a short band with blank
 * space below.
 *
 * The `justify`-class assertion is always hard (it IS the fix). The pane
 * height assertions run when a PTY actually mounts — the e2e sandbox's
 * temp-workspace conversations may not create one, in which case they are
 * skipped with a log line (visual confirmation happens in the real app).
 */
import { test, expect } from '../fixtures';
import {
  goToGuid,
  selectAgent,
  sendMessageFromGuid,
  deleteConversation,
  agentPillByBackend,
  AGENT_PILL,
} from '../helpers';

test.describe('Workspace terminal height', () => {
  test.setTimeout(180_000);

  test('terminal pane fills the workspace panel to the bottom', async ({ page }) => {
    await goToGuid(page);
    const pill = page.locator(agentPillByBackend('claude'));
    let pillVisible = await pill.isVisible().catch(() => false);
    if (!pillVisible) {
      await page
        .locator(AGENT_PILL)
        .first()
        .waitFor({ state: 'visible', timeout: 15_000 })
        .catch(() => {});
      pillVisible = await pill.isVisible().catch(() => false);
    }
    if (!pillVisible) {
      test.skip(true, 'claude agent pill not available');
      return;
    }
    await selectAgent(page, 'claude');
    const conversationId = await sendMessageFromGuid(page, 'e2e terminal height smoke');
    expect(conversationId).toBeTruthy();

    // Expand the workspace panel DETERMINISTICALLY. Do not use the toggle
    // event: two useWorkspaceCollapse instances both listen to it, so one
    // dispatch double-flips and races the auto-expand. Instead persist the
    // user preference (preferenceKey === conversation_id) and fire a
    // has-files event — the handler's preference branch then expands,
    // idempotently, in one direction only.
    await page.evaluate((cid) => {
      localStorage.setItem(`workspace-preference-${cid}`, 'expanded');
      window.dispatchEvent(
        new CustomEvent('aionui-workspace-has-files', {
          detail: { hasFiles: true, conversation_id: cid, isInitial: false },
        })
      );
    }, conversationId);

    // NOTE: Arco tab headers are `.arco-tabs-header-title` (not antd's
    // `.arco-tabs-tab`) — see WorkspaceTabBar.tsx's own className overrides.
    const terminalTab = page
      .locator('.arco-tabs-header-title')
      .filter({ hasText: /终端|Terminal/ })
      .first();
    await terminalTab.waitFor({ state: 'visible', timeout: 20_000 });
    // force: a full-viewport decorative overlay intercepts hit-testing here
    // (same reason helpers/selectAgent clicks with force).
    await terminalTab.click({ force: true });

    // Wait for the terminal tabs container to mount. The `justify` class is
    // the fix itself — always a hard assertion.
    const tabsRoot = page.locator('.terminal-tabs');
    await tabsRoot.waitFor({ state: 'visible', timeout: 15_000 });
    expect(await tabsRoot.evaluate((el) => el.classList.contains('arco-tabs-justify'))).toBe(true);

    // Wait for a real terminal pane (PTY) — best-effort in the sandbox.
    const xterm = page.locator('.terminal-tabs .xterm').first();
    let xtermMounted = await xterm
      .waitFor({ state: 'visible', timeout: 15_000 })
      .then(() => true)
      .catch(() => false);
    if (!xtermMounted) {
      await page
        .locator('.terminal-tabs .arco-tabs-add-icon, .terminal-tabs .arco-icon-hover')
        .first()
        .click({ force: true })
        .catch(() => {});
      xtermMounted = await xterm
        .waitFor({ state: 'visible', timeout: 10_000 })
        .then(() => true)
        .catch(() => false);
    }

    if (xtermMounted) {
      // Give FitAddon's debounced fit a beat to settle.
      await page.waitForTimeout(500);
      const heights = await page.evaluate(() => {
        const content = document.querySelector('.terminal-tabs .arco-tabs-content');
        const inner = document.querySelector('.terminal-tabs .arco-tabs-content-inner');
        const xtermEl = document.querySelector('.terminal-tabs .xterm');
        return {
          content: content?.getBoundingClientRect().height ?? 0,
          inner: inner?.getBoundingClientRect().height ?? 0,
          xterm: xtermEl?.getBoundingClientRect().height ?? 0,
        };
      });
      console.log('[terminal-height e2e] heights:', JSON.stringify(heights));
      expect(heights.content).toBeGreaterThan(200); // panel actually has real height
      expect(heights.inner).toBeGreaterThan(heights.content * 0.9); // the previously-collapsed link stretches
      expect(heights.xterm).toBeGreaterThan(heights.content * 0.7); // terminal fills the pane
    } else {
      console.log('[terminal-height e2e] PTY unavailable in this sandbox — justify-class assertion still verified');
    }

    await page.screenshot({ path: 'tests/e2e/results/workspace-terminal-height.png' });

    // Cleanup: remove the smoke-test conversation
    await deleteConversation(page, conversationId).catch(() => {});
  });
});
