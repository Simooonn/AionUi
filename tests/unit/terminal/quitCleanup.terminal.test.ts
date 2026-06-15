/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Unit tests for terminal disposal during app-quit cleanup (Step 6 lifecycle).
 * Runs in the `node` Vitest project.
 *
 * The plan injects terminal teardown as `QuitCleanupDeps.disposeTerminals`, run
 * inside `runQuitCleanup`'s cleanup phase (NOT a parallel before-quit handler that
 * would race the 10s preventDefault timeout). These tests drive the real
 * `installQuitCleanup` with fully faked deps.
 */

import { describe, expect, it, vi } from 'vitest';
import { installQuitCleanup } from '@/process/startup/quitCleanup';

type Deps = Parameters<typeof installQuitCleanup>[0];

function makeHarness(overrides: Partial<Deps> = {}) {
  let beforeQuit: ((event: { preventDefault: () => void }) => void) | undefined;
  const preventDefault = vi.fn();

  const deps = {
    onBeforeQuit: (handler: (event: { preventDefault: () => void }) => void) => {
      beforeQuit = handler;
    },
    quitApp: vi.fn(),
    setIsQuitting: vi.fn(),
    markExplicitQuit: vi.fn(),
    destroyTray: vi.fn(),
    disposeCronResumeListener: vi.fn(),
    disposeTerminals: vi.fn(),
    stopBackend: vi.fn().mockResolvedValue(undefined),
    destroyPetWindow: vi.fn().mockResolvedValue(undefined),
    logInfo: vi.fn(),
    logWarn: vi.fn(),
    logError: vi.fn(),
    ...overrides,
  } satisfies Deps;

  installQuitCleanup(deps);

  return {
    deps,
    preventDefault,
    fireBeforeQuit: () => beforeQuit!({ preventDefault }),
  };
}

describe('quitCleanup — terminal disposal', () => {
  it('invokes disposeTerminals during cleanup and then quits', async () => {
    const h = makeHarness();
    h.fireBeforeQuit();

    expect(h.preventDefault).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(h.deps.quitApp).toHaveBeenCalledTimes(1));
    expect(h.deps.disposeTerminals).toHaveBeenCalledTimes(1);
  });

  it('disposes terminals before stopping the backend (no orphaned shells)', async () => {
    const h = makeHarness();
    h.fireBeforeQuit();
    await vi.waitFor(() => expect(h.deps.quitApp).toHaveBeenCalled());

    const disposeOrder = h.deps.disposeTerminals.mock.invocationCallOrder[0];
    const stopOrder = h.deps.stopBackend.mock.invocationCallOrder[0];
    expect(disposeOrder).toBeLessThan(stopOrder);
  });

  it('does not run cleanup twice on repeated before-quit events', async () => {
    const h = makeHarness();
    h.fireBeforeQuit();
    h.fireBeforeQuit();
    await vi.waitFor(() => expect(h.deps.quitApp).toHaveBeenCalled());

    expect(h.deps.disposeTerminals).toHaveBeenCalledTimes(1);
    expect(h.preventDefault).toHaveBeenCalledTimes(2); // both events are prevented
  });

  it('still quits when disposeTerminals throws (error is logged, not fatal)', async () => {
    const h = makeHarness({
      disposeTerminals: vi.fn(() => {
        throw new Error('kill failed');
      }),
    });
    h.fireBeforeQuit();

    await vi.waitFor(() => expect(h.deps.quitApp).toHaveBeenCalledTimes(1));
    expect(h.deps.logError).toHaveBeenCalledWith('[App] Failed to dispose terminals:', expect.any(Error));
  });

  it('forces quit within the timeout window even if the backend stop hangs', async () => {
    const h = makeHarness({
      timeoutMs: 50,
      // Never resolves — the timeout must still force the quit.
      stopBackend: vi.fn(() => new Promise<void>(() => {})),
    });
    h.fireBeforeQuit();

    // disposeTerminals runs before the hanging stopBackend.
    expect(h.deps.disposeTerminals).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(h.deps.quitApp).toHaveBeenCalledTimes(1), { timeout: 1000 });
    expect(h.deps.logWarn).toHaveBeenCalled();
  });
});
