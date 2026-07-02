/**
 * ACP chat HUD statusline – E2E verification.
 *
 * Verifies the HUD status bar appears at the bottom of a normal ACP
 * conversation (no toggle needed) with content from the user's statusLine
 * command, and that the IPC chain works end-to-end. Skips gracefully on
 * machines without a configured statusLine command (e.g. CI).
 */
import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from '../fixtures';
import {
  goToGuid,
  selectAgent,
  sendMessageFromGuid,
  deleteConversation,
  agentPillByBackend,
  AGENT_PILL,
} from '../helpers';

const STATUS_BAR = '[data-testid="chat-hud-statusline"]';

type HudApi = {
  electronAPI?: {
    hudStatusline?: (p: { workspace: string; conversationId?: string }) => Promise<{ text: string } | null>;
  };
};

test.describe('ACP chat HUD statusline', () => {
  test.setTimeout(180_000);

  test('hudStatusline IPC runs the statusLine command against this repo', async ({ page }) => {
    const projectRoot = path.resolve(__dirname, '../../..');
    const cachePath = path.join(projectRoot, '.omc', 'state', 'hud-stdin-cache.json');
    if (!fs.existsSync(cachePath)) {
      test.skip(true, 'no OMC HUD cache in this checkout');
      return;
    }

    const result = await page.evaluate(
      async (ws) => (await (window as unknown as HudApi).electronAPI?.hudStatusline?.({ workspace: ws })) ?? null,
      projectRoot
    );

    if (result === null) {
      test.skip(true, 'no statusLine command configured on this machine');
      return;
    }
    expect(result.text.length).toBeGreaterThan(0);
  });

  test('status bar appears at the bottom of a normal claude conversation', async ({ page }) => {
    // Probe first: without a configured statusLine command the bar (correctly)
    // never appears — skip instead of failing.
    const projectRoot = path.resolve(__dirname, '../../..');
    const probe = await page.evaluate(
      async (ws) => (await (window as unknown as HudApi).electronAPI?.hudStatusline?.({ workspace: ws })) ?? null,
      projectRoot
    );
    if (probe === null) {
      test.skip(true, 'no statusLine data available on this machine');
      return;
    }

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
    const conversationId = await sendMessageFromGuid(page, 'e2e hud status bar smoke');
    expect(conversationId).toBeTruthy();

    // First refresh fires on mount; the transcript may lag the first turn, so
    // allow one 30s poll cycle before concluding.
    const bar = page.locator(STATUS_BAR);
    await bar.waitFor({ state: 'visible', timeout: 70_000 });
    const text = await bar.innerText();
    expect(text.trim().length).toBeGreaterThan(0);
    await page.screenshot({ path: 'tests/e2e/results/hud-status-bar.png' });

    // Cleanup: remove the smoke-test conversation
    await deleteConversation(page, conversationId).catch(() => {});
  });
});
