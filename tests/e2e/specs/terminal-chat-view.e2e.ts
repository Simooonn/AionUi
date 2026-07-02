/**
 * Terminal-style chat view overlay – E2E verification.
 *
 * Verifies the header toggle button opens an overlay that covers ONLY the
 * conversation column (left sidebar, right workspace panel and the header
 * toolbar stay visible), and that clicking the toggle again closes it.
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

const TOGGLE = '[data-testid="terminal-chat-toggle"]';
const OVERLAY = '[data-testid="terminal-chat-overlay"]';

test.describe('Terminal chat view overlay', () => {
  test.setTimeout(180_000);

  test('toggle opens overlay over conversation column only, second click closes', async ({ page }) => {
    await goToGuid(page);

    // Need a real ACP conversation — claude backend. Pills are lazy-loaded,
    // so wait for any pill to appear before deciding availability.
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
    const conversationId = await sendMessageFromGuid(page, 'e2e terminal view smoke');
    expect(conversationId).toBeTruthy();

    // Toggle button should be in the header
    const toggle = page.locator(TOGGLE);
    await toggle.waitFor({ state: 'visible', timeout: 20_000 });
    await page.screenshot({ path: 'tests/e2e/results/terminal-view-01-before.png' });

    // Open the overlay
    await toggle.click();
    const overlay = page.locator(OVERLAY);
    await overlay.waitFor({ state: 'visible', timeout: 10_000 });
    await page.screenshot({ path: 'tests/e2e/results/terminal-view-02-open.png' });

    // The toggle button must STILL be visible (overlay must not cover the header)
    await expect(toggle).toBeVisible();

    // Overlay must not span the full window width — sidebars remain visible.
    const overlayBox = await overlay.boundingBox();
    const viewport =
      page.viewportSize() ?? (await page.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight })));
    expect(overlayBox).not.toBeNull();
    if (overlayBox) {
      expect(overlayBox.width).toBeLessThan(viewport.width - 100);
      expect(overlayBox.y).toBeGreaterThan(30); // below the header, not at window top
    }

    // Input row with the prompt should be visible inside the overlay
    await expect(overlay.locator('input')).toBeVisible();

    // Second click closes
    await toggle.click();
    await overlay.waitFor({ state: 'detached', timeout: 10_000 });
    await page.screenshot({ path: 'tests/e2e/results/terminal-view-03-closed.png' });

    // Cleanup: remove the smoke-test conversation
    await deleteConversation(page, conversationId).catch(() => {});
  });

  test('hudStatusline IPC replays the OMC cache through the statusLine command', async ({ page }) => {
    // End-to-end check of preload → main → /bin/sh statusline replay, using
    // this repo's own OMC HUD cache. Skips where the cache or a statusLine
    // command is absent (e.g. CI).
    const projectRoot = path.resolve(__dirname, '../../..');
    const cachePath = path.join(projectRoot, '.omc', 'state', 'hud-stdin-cache.json');
    if (!fs.existsSync(cachePath)) {
      test.skip(true, 'no OMC HUD cache in this checkout');
      return;
    }

    const result = await page.evaluate(async (ws) => {
      const api = (
        window as unknown as { electronAPI?: { hudStatusline?: (w: string) => Promise<{ text: string } | null> } }
      ).electronAPI;
      return (await api?.hudStatusline?.(ws)) ?? null;
    }, projectRoot);

    if (result === null) {
      test.skip(true, 'no statusLine command configured on this machine');
      return;
    }
    expect(result.text.length).toBeGreaterThan(0);
  });
});
