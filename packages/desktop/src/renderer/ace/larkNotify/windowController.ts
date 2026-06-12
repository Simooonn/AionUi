/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Fixed-window debounce for Lark notifications: the FIRST trigger opens the
 * window; later triggers within it are absorbed (no re-arm / no extension);
 * expiry fires `onExpire` exactly once. Plain timers — testable with vitest
 * fake timers.
 */
export class LarkNotifyWindowController {
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly windowMs: number,
    private readonly onExpire: () => void
  ) {}

  /** Open the window if not already open; absorbed otherwise. */
  trigger(): void {
    if (this.timer !== null) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.onExpire();
    }, this.windowMs);
  }

  get isOpen(): boolean {
    return this.timer !== null;
  }

  dispose(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}
