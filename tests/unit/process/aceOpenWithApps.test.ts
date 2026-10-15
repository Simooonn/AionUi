/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Configurable "Open with" apps (fork, ace/) — common/ace/openWithApps.ts:
 *  - registry invariants (ids, evidence, bundles, dropped presets)
 *  - pure helpers: preset lookup, candidate paths order, argv per launch kind,
 *    selection parsing / resolution
 *  - createOpenWithService with fake deps: listInstalled never loads icons,
 *    icons cache only successes (failures retry), launch validates in order
 *    and never reaches `open` on a rejected request
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  OPEN_WITH_BUILTIN_BROWSER_ID,
  OPEN_WITH_PRESETS,
  OPEN_WITH_SEARCH_DIRS,
  OPEN_WITH_STORAGE_KEY,
  OPEN_WITH_TOOL_CATEGORY,
  buildOpenArgv,
  candidateAppPaths,
  createOpenWithService,
  findOpenWithPreset,
  parseOpenWithSelection,
  selectionToPreset,
  type OpenWithPreset,
  type OpenWithServiceDeps,
} from '@/common/ace/openWithApps';

const HOME = '/Users/tester';
const preset = (id: string): OpenWithPreset => {
  const p = findOpenWithPreset(id);
  if (!p) throw new Error(`missing preset ${id}`);
  return p;
};

/** Fake filesystem: a set of existing directories plus a symlink map. */
const makeDeps = (
  opts: {
    dirs?: string[];
    links?: Record<string, string>;
    platform?: string;
    thumbnail?: OpenWithServiceDeps['thumbnail'];
    runOpen?: OpenWithServiceDeps['runOpen'];
  } = {}
) => {
  const dirs = new Set(opts.dirs ?? []);
  const links = opts.links ?? {};
  const deps = {
    platform: opts.platform ?? 'darwin',
    homeDir: HOME,
    isDirectory: vi.fn(async (p: string) => dirs.has(p)),
    realpath: vi.fn(async (p: string) => {
      const target = links[p] ?? p;
      if (!dirs.has(target) && !(target in FILES)) throw new Error(`ENOENT ${p}`);
      return target;
    }),
    thumbnail: vi.fn(opts.thumbnail ?? (async (p: string) => `data:image/png;base64,${p.length}`)),
    runOpen: vi.fn(opts.runOpen ?? (async () => 'ok' as const)),
  };
  return deps;
};
/** Regular files known to the fake fs (realpath succeeds, isDirectory is false). */
const FILES: Record<string, true> = { '/work/script.sh': true };

describe('registry', () => {
  it('has unique, safe ids and valid evidence', () => {
    const ids = OPEN_WITH_PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const p of OPEN_WITH_PRESETS) {
      expect(p.id).toMatch(/^[a-z0-9-]{1,32}$/);
      expect(['local', 'docs']).toContain(p.evidence);
      expect(p.bundles.length).toBeGreaterThan(0);
      for (const b of p.bundles) expect(b.endsWith('.app')).toBe(true);
    }
  });

  it('drops the rejected presets and keeps builtin out of the registry', () => {
    const ids = OPEN_WITH_PRESETS.map((p) => p.id);
    for (const dropped of ['wezterm', 'alacritty', 'arc', 'antigravity', OPEN_WITH_BUILTIN_BROWSER_ID]) {
      expect(ids).not.toContain(dropped);
    }
  });

  it('marks the spike-verified presets as local', () => {
    const local = OPEN_WITH_PRESETS.filter((p) => p.evidence === 'local').map((p) => p.id);
    expect(local.toSorted()).toEqual([
      'chrome',
      'cursor',
      'firefox',
      'goland',
      'iterm2',
      'phpstorm',
      'safari',
      'terminal',
    ]);
    expect(OPEN_WITH_PRESETS).toHaveLength(24);
  });

  it('maps upstream tool keys to categories (explorer excluded)', () => {
    expect(OPEN_WITH_TOOL_CATEGORY).toEqual({ vscode: 'editor', terminal: 'terminal', browser: 'browser' });
    expect(OPEN_WITH_STORAGE_KEY).toBe('workspace-open-apps');
  });
});

describe('findOpenWithPreset', () => {
  it('finds by id and rejects anything else', () => {
    expect(findOpenWithPreset('cursor')?.name).toBe('Cursor');
    for (const bad of ['__proto__', 'constructor', 'toString', '../../bin/sh', 'Cursor', '', 42, null, undefined, {}]) {
      expect(findOpenWithPreset(bad)).toBeUndefined();
    }
  });
});

describe('candidateAppPaths', () => {
  it('iterates search dirs outer, bundles inner, expanding ~', () => {
    expect(OPEN_WITH_SEARCH_DIRS[0]).toBe('/Applications');
    const paths = candidateAppPaths(preset('intellij'), HOME);
    expect(paths.slice(0, 5)).toEqual([
      '/Applications/IntelliJ IDEA.app',
      '/Applications/IntelliJ IDEA Ultimate.app',
      '/Applications/IntelliJ IDEA CE.app',
      '/Applications/IntelliJ IDEA Community Edition.app',
      `${HOME}/Applications/IntelliJ IDEA.app`,
    ]);
    expect(paths).toContain(`${HOME}/Applications/JetBrains Toolbox/IntelliJ IDEA.app`);
    expect(paths.at(-1)).toBe('/System/Applications/Utilities/IntelliJ IDEA Community Edition.app');
    expect(paths).toHaveLength(OPEN_WITH_SEARCH_DIRS.length * 4);
  });
});

describe('buildOpenArgv', () => {
  const tricky = "/Users/t/my dir/它's $(rm -rf ~) `x`";

  it('folder kind passes the folder as one argv element', () => {
    expect(buildOpenArgv(preset('cursor'), '/Applications/Cursor.app', tricky)).toEqual([
      '-a',
      '/Applications/Cursor.app',
      tricky,
    ]);
    expect(buildOpenArgv(preset('iterm2'), '/Applications/iTerm.app', '/w')).toEqual([
      '-a',
      '/Applications/iTerm.app',
      '/w',
    ]);
  });

  it('warp uses the URI scheme with an encoded path', () => {
    const argv = buildOpenArgv(preset('warp'), '/Applications/Warp.app', '/a b&c=d?e#f');
    expect(argv).toEqual(['-a', '/Applications/Warp.app', 'warp://action/new_window?path=%2Fa%20b%26c%3Dd%3Fe%23f']);
  });

  it('browsers open a blank page', () => {
    expect(buildOpenArgv(preset('chrome'), '/Applications/Google Chrome.app')).toEqual([
      '-n',
      '-a',
      '/Applications/Google Chrome.app',
      '--args',
      '--new-window',
      'about:blank',
    ]);
    expect(buildOpenArgv(preset('firefox'), '/Applications/Firefox.app')).toEqual([
      '-n',
      '-a',
      '/Applications/Firefox.app',
      '--args',
      '-new-window',
      'about:blank',
    ]);
    expect(buildOpenArgv(preset('safari'), '/Applications/Safari.app')).toEqual([
      '-a',
      '/Applications/Safari.app',
      'about:blank',
    ]);
  });

  it('throws when a folder kind gets no folder', () => {
    expect(() => buildOpenArgv(preset('terminal'), '/System/Applications/Utilities/Terminal.app')).toThrow();
  });
});

describe('parseOpenWithSelection / selectionToPreset', () => {
  it('keeps known ids in their own category only', () => {
    expect(
      parseOpenWithSelection(
        JSON.stringify({ editor: 'cursor', terminal: 'chrome', browser: 'safari', extra: 'x', explorer: 'finder' })
      )
    ).toEqual({ editor: 'cursor', browser: 'safari' });
  });

  it('drops unknown ids, builtin and non-string values', () => {
    expect(parseOpenWithSelection(JSON.stringify({ editor: 'nope', terminal: 7, browser: 'builtin' }))).toEqual({});
  });

  it('treats broken or non-object JSON as empty', () => {
    for (const raw of [null, '', '{', '[]', '"cursor"', 'null', '42']) {
      expect(parseOpenWithSelection(raw)).toEqual({});
    }
  });

  it('resolves a category to its preset without checking installation', () => {
    expect(selectionToPreset('editor', { editor: 'zed' })?.id).toBe('zed');
    expect(selectionToPreset('terminal', { editor: 'zed' })).toBeUndefined();
    expect(selectionToPreset('terminal', { terminal: 'cursor' })).toBeUndefined();
  });
});

describe('createOpenWithService.listInstalled', () => {
  it('returns installed presets in registry order without loading icons', async () => {
    const deps = makeDeps({
      dirs: [
        '/Applications/Cursor.app',
        `${HOME}/Applications/GoLand.app`,
        '/System/Applications/Utilities/Terminal.app',
        '/Applications/Safari.app',
      ],
    });
    const svc = createOpenWithService(deps);
    expect(await svc.listInstalled()).toEqual([
      { id: 'cursor', category: 'editor', name: 'Cursor' },
      { id: 'goland', category: 'editor', name: 'GoLand' },
      { id: 'terminal', category: 'terminal', name: 'Terminal' },
      { id: 'safari', category: 'browser', name: 'Safari' },
    ]);
    expect(deps.thumbnail).not.toHaveBeenCalled();
  });

  it('prefers the system-level install over ~/Applications', async () => {
    const deps = makeDeps({ dirs: ['/Applications/GoLand.app', `${HOME}/Applications/GoLand.app`, '/work'] });
    const svc = createOpenWithService(deps);
    await svc.launch({ appId: 'goland', folderPath: '/work' });
    expect(deps.runOpen).toHaveBeenCalledWith(['-a', '/Applications/GoLand.app', '/work']);
  });

  it('is empty off macOS', async () => {
    const deps = makeDeps({ platform: 'linux', dirs: ['/Applications/Cursor.app'] });
    expect(await createOpenWithService(deps).listInstalled()).toEqual([]);
    expect(deps.isDirectory).not.toHaveBeenCalled();
  });
});

describe('createOpenWithService.loadIcon', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('loads from the realpath and caches successes', async () => {
    const deps = makeDeps({
      dirs: ['/Applications/Safari.app', '/Cryptexes/Safari.app'],
      links: { '/Applications/Safari.app': '/Cryptexes/Safari.app' },
    });
    const svc = createOpenWithService(deps);
    const first = await svc.loadIcon('safari');
    expect(first).toMatch(/^data:image\/png/);
    expect(deps.thumbnail).toHaveBeenCalledWith('/Cryptexes/Safari.app');
    expect(await svc.loadIcon('safari')).toBe(first);
    expect(deps.thumbnail).toHaveBeenCalledTimes(1);
  });

  it('shares one in-flight request between concurrent callers', async () => {
    let release: (v: string) => void = () => {};
    const deps = makeDeps({
      dirs: ['/Applications/Cursor.app'],
      thumbnail: () =>
        new Promise<string>((resolve) => {
          release = resolve;
        }),
    });
    const svc = createOpenWithService(deps);
    const a = svc.loadIcon('cursor');
    const b = svc.loadIcon('cursor');
    await vi.waitFor(() => expect(deps.thumbnail).toHaveBeenCalledTimes(1));
    release('data:image/png;base64,AAA');
    expect(await a).toBe('data:image/png;base64,AAA');
    expect(await b).toBe('data:image/png;base64,AAA');
  });

  it('does not cache failures, empty images or timeouts', async () => {
    vi.useFakeTimers();
    const results: Array<() => Promise<string | undefined>> = [
      async () => {
        throw new Error('quicklook failed');
      },
      async () => undefined,
      () => new Promise<string | undefined>(() => {}),
      async () => 'data:image/png;base64,OK',
    ];
    const deps = makeDeps({ dirs: ['/Applications/Cursor.app'], thumbnail: () => results.shift()!() });
    const svc = createOpenWithService(deps);
    expect(await svc.loadIcon('cursor')).toBeNull();
    expect(await svc.loadIcon('cursor')).toBeNull();
    const timedOut = svc.loadIcon('cursor');
    await vi.advanceTimersByTimeAsync(2000);
    expect(await timedOut).toBeNull();
    expect(await svc.loadIcon('cursor')).toBe('data:image/png;base64,OK');
    expect(deps.thumbnail).toHaveBeenCalledTimes(4);
  });

  it('returns null for unknown or missing apps', async () => {
    const deps = makeDeps();
    const svc = createOpenWithService(deps);
    expect(await svc.loadIcon('../../x')).toBeNull();
    expect(await svc.loadIcon('cursor')).toBeNull();
    expect(deps.thumbnail).not.toHaveBeenCalled();
  });
});

describe('createOpenWithService.launch', () => {
  const installed = [
    '/Applications/iTerm.app',
    '/Applications/Google Chrome.app',
    '/Applications/Cursor.app',
    '/work',
    '/real/work',
  ];

  it('opens the configured app with the resolved folder', async () => {
    const deps = makeDeps({ dirs: installed, links: { '/link/work': '/real/work' } });
    const svc = createOpenWithService(deps);
    expect(await svc.launch({ appId: 'iterm2', folderPath: '/link/work' })).toEqual({ ok: true });
    expect(deps.runOpen).toHaveBeenCalledWith(['-a', '/Applications/iTerm.app', '/real/work']);
  });

  it('ignores the folder for browsers', async () => {
    const deps = makeDeps({ dirs: installed });
    const svc = createOpenWithService(deps);
    expect(await svc.launch({ appId: 'chrome', folderPath: 'relative/../junk' })).toEqual({ ok: true });
    expect(deps.realpath).not.toHaveBeenCalled();
  });

  it.each([
    ['unsupported-platform', { appId: 'iterm2', folderPath: '/work' }, 'linux'],
    ['unknown-app', null, 'darwin'],
    ['unknown-app', 'iterm2', 'darwin'],
    ['unknown-app', [], 'darwin'],
    ['unknown-app', { appId: '../../bin/sh', folderPath: '/work' }, 'darwin'],
    ['unknown-app', { appId: '__proto__', folderPath: '/work' }, 'darwin'],
    ['invalid-folder', { appId: 'iterm2' }, 'darwin'],
    ['invalid-folder', { appId: 'iterm2', folderPath: 'relative' }, 'darwin'],
    ['invalid-folder', { appId: 'iterm2', folderPath: '/nonexistent' }, 'darwin'],
    ['invalid-folder', { appId: 'iterm2', folderPath: '/work/script.sh' }, 'darwin'],
    ['invalid-folder', { appId: 'iterm2', folderPath: '/wo\0rk' }, 'darwin'],
    ['invalid-folder', { appId: 'iterm2', folderPath: `/${'a'.repeat(4096)}` }, 'darwin'],
    ['not-installed', { appId: 'zed', folderPath: '/work' }, 'darwin'],
  ] as const)('returns %s for %j without running open', async (reason, raw, platform) => {
    const deps = makeDeps({ dirs: installed, platform });
    const svc = createOpenWithService(deps);
    expect(await svc.launch(raw)).toEqual({ ok: false, reason });
    expect(deps.runOpen).not.toHaveBeenCalled();
  });

  it('maps a timeout and a failure from open', async () => {
    const timeoutDeps = makeDeps({ dirs: installed, runOpen: async () => 'timeout' });
    expect(await createOpenWithService(timeoutDeps).launch({ appId: 'cursor', folderPath: '/work' })).toEqual({
      ok: false,
      reason: 'launch-timeout',
    });
    const failDeps = makeDeps({
      dirs: installed,
      runOpen: async () => {
        throw new Error('exit 1');
      },
    });
    expect(await createOpenWithService(failDeps).launch({ appId: 'cursor', folderPath: '/work' })).toEqual({
      ok: false,
      reason: 'launch-failed',
    });
  });
});
