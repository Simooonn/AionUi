/**
 * ACP chat HUD statusline – E2E verification.
 *
 * Case 1 only verifies the AC6b contract: with no conversation identity the
 * `hudStatusline` IPC returns null and executes no statusLine command. The
 * positive leg – actually running the command and showing its output in the
 * context-usage popover of a real conversation – is case 2, which sends a real
 * message. Both cases skip gracefully on machines without a configured
 * statusLine command (e.g. CI).
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

const HUD_TEXT = '[data-testid="chat-hud-statusline"]';
// The HUD opens from the context-usage entry: the usage ring, or a neutral
// info icon while the agent has not reported usage yet.
const HUD_ENTRY = '.context-usage-indicator, .context-usage-hud-icon';
// A ctx element as OMC renders it (`ctx:[####]64%`, `ctx:64%`, `上下文:64%`).
const CTX_ELEMENT_RE = /(?:ctx|上下文):(?:\[[^\]]*\])?\d{1,3}%/;

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

  test('HUD shows inside the context-usage popover of a normal claude conversation', async ({ page }) => {
    // Probe first: without a configured statusLine command the HUD (correctly)
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

    // The bottom bar is gone: nothing HUD-like may render outside the popover.
    expect(await page.locator(HUD_TEXT).count()).toBe(0);

    // First refresh fires on mount; the transcript may lag the first turn, so
    // allow a couple of 30s poll cycles. The popover content only mounts while
    // it is open, so re-hover until the HUD text shows up.
    const entry = page.locator(HUD_ENTRY).first();
    const hud = page.locator(HUD_TEXT);
    await expect(async () => {
      await entry.hover({ timeout: 5_000 });
      await hud.waitFor({ state: 'visible', timeout: 3_000 });
    }).toPass({ timeout: 90_000, intervals: [2_000, 5_000, 10_000] });

    const text = await hud.innerText();
    expect(text.trim().length).toBeGreaterThan(0);
    // The popover header already reports context usage; the HUD's own ctx
    // element is stripped so the two numbers never sit side by side.
    expect(text).not.toMatch(CTX_ELEMENT_RE);
    await page.screenshot({ path: 'tests/e2e/results/hud-status-bar.png' });

    // Cleanup: remove the smoke-test conversation
    await deleteConversation(page, conversationId).catch(() => {});
  });
});
