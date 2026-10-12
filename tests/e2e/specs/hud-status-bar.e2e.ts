/**
 * ACP chat HUD statusline – E2E verification.
 *
 * Case 1 only verifies the AC6b contract: with no conversation identity the
 * `hudStatusline` IPC returns null and executes no statusLine command. The
 * positive leg – actually running the command and showing its output in the
 * status bar of a real conversation – is case 2, which sends a real message
 * and is therefore disabled by default. Both cases skip gracefully on
 * machines without a configured statusLine command (e.g. CI).
 */
import fs from 'node:fs';
import os from 'node:os';
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

/**
 * Read the user's statusLine command the same way the main process does
 * (`hudStatusline.ts`: `claudeConfigDir()` + `readStatuslineCommand()`), so
 * the gate below and the code under test always read the same settings file —
 * including on machines that set CLAUDE_CONFIG_DIR.
 */
function readConfiguredStatusLine(): string | null {
  try {
    const configDir = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
    const raw = fs.readFileSync(path.join(configDir, 'settings.json'), 'utf8');
    const settings = JSON.parse(raw) as { statusLine?: { type?: string; command?: string } };
    const line = settings.statusLine;
    if (line?.type === 'command' && typeof line.command === 'string' && line.command.trim()) {
      return line.command;
    }
  } catch {
    /* missing or unparsable settings → no statusline configured */
  }
  return null;
}

test.describe('ACP chat HUD statusline', () => {
  test.setTimeout(180_000);

  test('hudStatusline IPC returns null without a conversation (AC6b)', async ({ page }) => {
    const projectRoot = path.resolve(__dirname, '../../..');
    if (!readConfiguredStatusLine()) {
      test.skip(true, 'no statusLine command configured on this machine');
      return;
    }

    const result = await page.evaluate(async (ws) => {
      const api = (window as unknown as HudApi).electronAPI;
      if (!api?.hudStatusline) return 'no-api';
      try {
        return (await api.hudStatusline({ workspace: ws })) ?? null;
      } catch (e) {
        return `threw:${String(e)}`;
      }
    }, projectRoot);

    // A missing bridge ('no-api') or a throwing handler ('threw:…') must not be
    // able to masquerade as the AC6b null, hence the distinguishable values.
    expect(result).toBeNull();
  });

  test('status bar appears at the bottom of a normal claude conversation', async ({ page }) => {
    // Probe first: without a configured statusLine command the bar (correctly)
    // never appears — skip instead of failing. Gate on the settings file, not
    // on an IPC call, because a call without a conversation is always null now.
    if (!readConfiguredStatusLine()) {
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
