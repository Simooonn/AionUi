// Live check for the HUD-in-context-popover change, run against the dev app
// (electron-vite dev --remoteDebuggingPort 9231). Creates one DELTEST-HUD
// conversation in ~/.aionui/live-verify, sends one short message, inspects the
// sendbox entry + popover, then deletes the conversation it created.
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '../../../node_modules/playwright/index.mjs';

const WORKSPACE = path.join(os.homedir(), '.aionui', 'live-verify');
const SHOT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ENTRY = '.context-usage-indicator, .context-usage-hud-icon';
const HUD = '[data-testid="chat-hud-statusline"]';
const CTX_RE = /(?:ctx|上下文):(?:\[[^\]]*\])?\d{1,3}%/;

const log = (label, value) => console.log(`${label}: ${typeof value === 'string' ? value : JSON.stringify(value)}`);

const browser = await chromium.connectOverCDP('http://127.0.0.1:9231');
const page = browser
  .contexts()[0]
  .pages()
  .find((p) => p.url().startsWith('http://localhost:5173'));
if (!page) throw new Error('dev renderer page not found');

const api = (method, url, body) =>
  page.evaluate(
    async ({ method, url, body }) => {
      const port = window.__backendPort;
      const res = await fetch(`http://127.0.0.1:${port}${url}`, {
        method,
        headers: { 'content-type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      });
      return { status: res.status, json: await res.json().catch(() => null) };
    },
    { method, url, body }
  );

const created = await api('POST', '/api/conversations', {
  type: 'acp',
  name: 'DELTEST-HUD popover',
  extra: { backend: 'claude', workspace: WORKSPACE, custom_workspace: true },
});
const id = created.json?.data?.id ?? created.json?.id;
log('create', { status: created.status, id });
if (!id) throw new Error(`create failed: ${JSON.stringify(created.json)}`);

const hoverEntry = async () => {
  await page.mouse.move(0, 0);
  await page.locator(ENTRY).first().hover({ timeout: 5_000 });
  await page.locator(HUD).first().waitFor({ state: 'visible', timeout: 3_000 });
};

/** Re-hover until the popover shows the HUD (poller runs every 30s). */
const waitForHud = async (timeoutMs) => {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      await hoverEntry();
      return true;
    } catch {
      if (Date.now() > deadline) return false;
      await page.waitForTimeout(3_000);
    }
  }
};

const inspect = async (label) => {
  const popover = page.locator('.context-usage-popover').last();
  const hud = page.locator(HUD).first();
  const hudText = await hud.innerText();
  const popoverText = await popover.innerText();
  const box = await popover.boundingBox();
  const viewport = page.viewportSize() ?? (await page.evaluate(() => ({ width: innerWidth, height: innerHeight })));
  const hudScroll = await hud.evaluate((el) => ({ scrollWidth: el.scrollWidth, clientWidth: el.clientWidth }));
  const colored = await hud.evaluate((el) => {
    const spans = [...el.querySelectorAll('span[class]')];
    return [...new Set(spans.map((s) => getComputedStyle(s).color))].length;
  });
  log(`${label} hud text`, hudText.replace(/\n/g, ' ⏎ '));
  log(`${label} popover has ctx element`, CTX_RE.test(popoverText));
  log(`${label} hud has ctx element`, CTX_RE.test(hudText));
  log(
    `${label} popover box`,
    box && { x: Math.round(box.x), w: Math.round(box.width), right: Math.round(box.x + box.width) }
  );
  log(`${label} viewport width`, viewport.width);
  log(`${label} hud horizontal overflow`, hudScroll.scrollWidth > hudScroll.clientWidth + 1);
  log(`${label} distinct span colors`, colored);
  await page.screenshot({ path: path.join(SHOT_DIR, `${label}.png`) });
};

try {
  await page.evaluate((cid) => {
    location.hash = `#/conversation/${cid}`;
  }, id);
  await page.locator('[data-testid="sendbox-input"], textarea').first().waitFor({ state: 'visible', timeout: 30_000 });
  await page.waitForTimeout(2_000);

  log('bottom bar outside popover', await page.locator(HUD).count());
  log('entry before first turn', {
    ring: await page.locator('.context-usage-indicator').count(),
    infoIcon: await page.locator('.context-usage-hud-icon').count(),
  });

  const input = page.locator('[data-testid="sendbox-input"], textarea').first();
  await input.click();
  await input.fill('Reply with the single word: ok');
  await page.keyboard.press('Enter');

  // HUD-only window: right after the first turn the transcript exists while the
  // usage report may not have arrived yet.
  const hudOnlySeen = await page
    .locator('.context-usage-hud-icon')
    .first()
    .waitFor({ state: 'visible', timeout: 45_000 })
    .then(() => true)
    .catch(() => false);
  log('info icon seen during first turn', hudOnlySeen);
  if (hudOnlySeen && (await waitForHud(10_000))) await inspect('01-hud-only');

  await page.locator('.context-usage-indicator').first().waitFor({ state: 'visible', timeout: 180_000 });
  log('ring after usage report', true);
  log('info icon after usage report', await page.locator('.context-usage-hud-icon').count());

  const found = await waitForHud(75_000);
  log('hud in ring popover', found);
  if (found) await inspect('02-ring-with-hud');
  await page.mouse.move(0, 0);
  await page.waitForTimeout(500);
  log('hud nodes after popover closed', await page.locator(HUD).count());
} finally {
  const del = await api('DELETE', `/api/conversations/${id}`);
  log('delete', del.status);
  await browser.close();
}
