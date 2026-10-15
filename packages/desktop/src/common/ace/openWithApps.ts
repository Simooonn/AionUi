/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Configurable "Open with" apps for the workspace dropdown (fork, macOS only).
 *
 * The user picks one installed app per category (editor / terminal / browser)
 * in Settings → System; the workspace dropdown then launches it via
 * `/usr/bin/open` in the main process (process/ace/aceBridge.ts). Unset or
 * missing apps fall back to the upstream behaviour (aioncore shell /
 * in-app browser).
 *
 * Process-agnostic on purpose: imported by both the main process and the
 * renderer (renderer/ace/settings/). No Node / Electron / DOM imports, no
 * `@/common` barrel and no `node:path` — paths are joined as strings, which
 * is safe because everything here only runs on macOS.
 *
 * `createOpenWithService` takes its IO as injected deps so it lives here (and
 * is unit-tested in node) instead of in process/ace/, which is at its
 * 10-children directory limit.
 */

export type OpenWithCategory = 'editor' | 'terminal' | 'browser';

/** How a preset is launched; see buildOpenArgv for the exact argv. */
export type OpenWithLaunchSpec =
  | { kind: 'folder' }
  | { kind: 'warp-uri' }
  | { kind: 'browser-new-window'; flag: '--new-window' | '-new-window' }
  | { kind: 'browser-url' };

/** `local` = verified on a real machine by the spike; `docs` = official docs/source only. */
export type OpenWithEvidence = 'local' | 'docs';

export type OpenWithPreset = {
  id: string;
  category: OpenWithCategory;
  /** Brand name, shown as-is (not translated). */
  name: string;
  /** `.app` bundle names tried in order inside each search dir. */
  bundles: readonly string[];
  launch: OpenWithLaunchSpec;
  evidence: OpenWithEvidence;
};

/** An installed preset as reported to the renderer (icons load separately). */
export type OpenWithInstalledApp = { id: string; category: OpenWithCategory; name: string };

/** Stored per-category choice; a missing key means "use the default". */
export type OpenWithSelection = Partial<Record<OpenWithCategory, string>>;

export type OpenWithLaunchRequest = { appId: string; folderPath?: string };

export type OpenWithLaunchFailure =
  | 'unsupported-platform'
  | 'unknown-app'
  | 'not-installed'
  | 'invalid-folder'
  | 'launch-failed'
  | 'launch-timeout';

export type OpenWithLaunchResult = { ok: true } | { ok: false; reason: OpenWithLaunchFailure };

export const OPEN_WITH_STORAGE_KEY = 'workspace-open-apps';

/** Virtual browser choice meaning "the in-app browser" — the default, never stored. */
export const OPEN_WITH_BUILTIN_BROWSER_ID = 'builtin';

export const OPEN_WITH_CATEGORIES: readonly OpenWithCategory[] = ['editor', 'terminal', 'browser'];

/** Upstream WorkspaceOpenButton tool keys that have a configurable app (Finder stays fixed). */
export const OPEN_WITH_TOOL_CATEGORY = {
  vscode: 'editor',
  terminal: 'terminal',
  browser: 'browser',
} as const satisfies Record<string, OpenWithCategory>;

export type OpenWithToolKey = keyof typeof OPEN_WITH_TOOL_CATEGORY;

export const OPEN_WITH_ICON_TIMEOUT_MS = 2000;
export const OPEN_WITH_LAUNCH_TIMEOUT_MS = 5000;

/** Searched in this order; `~` expands to the user's home. System-level installs win. */
export const OPEN_WITH_SEARCH_DIRS: readonly string[] = [
  '/Applications',
  '~/Applications',
  '~/Applications/JetBrains Toolbox',
  '/System/Applications',
  '/System/Applications/Utilities',
];

const FOLDER: OpenWithLaunchSpec = { kind: 'folder' };
const CHROMIUM_NEW_WINDOW: OpenWithLaunchSpec = { kind: 'browser-new-window', flag: '--new-window' };

const editor = (id: string, name: string, bundles: readonly string[], evidence: OpenWithEvidence): OpenWithPreset => ({
  id,
  category: 'editor',
  name,
  bundles,
  launch: FOLDER,
  evidence,
});

/**
 * Preset registry, in display order. Evidence and argv per app are recorded in
 * ACE_CHANGES.md and in the plan (计划/AionUi/打开方式可配置计划/, appendix 2 §1.4–§1.5).
 */
export const OPEN_WITH_PRESETS: readonly OpenWithPreset[] = [
  editor('vscode', 'VS Code', ['Visual Studio Code.app'], 'docs'),
  editor('cursor', 'Cursor', ['Cursor.app'], 'local'),
  editor('windsurf', 'Windsurf', ['Windsurf.app'], 'docs'),
  editor('zed', 'Zed', ['Zed.app'], 'docs'),
  editor('sublime', 'Sublime Text', ['Sublime Text.app'], 'docs'),
  editor(
    'intellij',
    'IntelliJ IDEA',
    ['IntelliJ IDEA.app', 'IntelliJ IDEA Ultimate.app', 'IntelliJ IDEA CE.app', 'IntelliJ IDEA Community Edition.app'],
    'docs'
  ),
  editor('webstorm', 'WebStorm', ['WebStorm.app'], 'docs'),
  editor(
    'pycharm',
    'PyCharm',
    ['PyCharm.app', 'PyCharm Professional Edition.app', 'PyCharm CE.app', 'PyCharm Community Edition.app'],
    'docs'
  ),
  editor('goland', 'GoLand', ['GoLand.app'], 'local'),
  editor('phpstorm', 'PhpStorm', ['PhpStorm.app'], 'local'),
  editor('clion', 'CLion', ['CLion.app'], 'docs'),
  editor('rider', 'Rider', ['Rider.app'], 'docs'),
  editor('rustrover', 'RustRover', ['RustRover.app'], 'docs'),
  editor('rubymine', 'RubyMine', ['RubyMine.app'], 'docs'),
  {
    id: 'terminal',
    category: 'terminal',
    name: 'Terminal',
    bundles: ['Terminal.app'],
    launch: FOLDER,
    evidence: 'local',
  },
  { id: 'iterm2', category: 'terminal', name: 'iTerm2', bundles: ['iTerm.app'], launch: FOLDER, evidence: 'local' },
  { id: 'ghostty', category: 'terminal', name: 'Ghostty', bundles: ['Ghostty.app'], launch: FOLDER, evidence: 'docs' },
  { id: 'kitty', category: 'terminal', name: 'kitty', bundles: ['kitty.app'], launch: FOLDER, evidence: 'docs' },
  {
    id: 'warp',
    category: 'terminal',
    name: 'Warp',
    bundles: ['Warp.app'],
    launch: { kind: 'warp-uri' },
    evidence: 'docs',
  },
  {
    id: 'chrome',
    category: 'browser',
    name: 'Chrome',
    bundles: ['Google Chrome.app'],
    launch: CHROMIUM_NEW_WINDOW,
    evidence: 'local',
  },
  {
    id: 'safari',
    category: 'browser',
    name: 'Safari',
    bundles: ['Safari.app'],
    launch: { kind: 'browser-url' },
    evidence: 'local',
  },
  {
    id: 'firefox',
    category: 'browser',
    name: 'Firefox',
    bundles: ['Firefox.app'],
    launch: { kind: 'browser-new-window', flag: '-new-window' },
    evidence: 'local',
  },
  {
    id: 'edge',
    category: 'browser',
    name: 'Edge',
    bundles: ['Microsoft Edge.app'],
    launch: CHROMIUM_NEW_WINDOW,
    evidence: 'docs',
  },
  {
    id: 'brave',
    category: 'browser',
    name: 'Brave',
    bundles: ['Brave Browser.app'],
    launch: CHROMIUM_NEW_WINDOW,
    evidence: 'docs',
  },
];

const PRESET_ID_RE = /^[a-z0-9-]{1,32}$/;
const PRESETS_BY_ID = new Map(OPEN_WITH_PRESETS.map((p) => [p.id, p]));

/** Registry lookup. A Map (not an object) so prototype keys like `__proto__` never match. */
export function findOpenWithPreset(id: unknown): OpenWithPreset | undefined {
  if (typeof id !== 'string' || !PRESET_ID_RE.test(id)) return undefined;
  return PRESETS_BY_ID.get(id);
}

/** Candidate `.app` paths: search dirs outer, bundle names inner, so system-level installs win. */
export function candidateAppPaths(preset: OpenWithPreset, homeDir: string): string[] {
  return OPEN_WITH_SEARCH_DIRS.flatMap((dir) => {
    const base = dir.startsWith('~/') ? `${homeDir}${dir.slice(1)}` : dir;
    return preset.bundles.map((bundle) => `${base}/${bundle}`);
  });
}

/** argv for `/usr/bin/open`. `folder` must be the realpath'd workspace for editors/terminals. */
export function buildOpenArgv(preset: OpenWithPreset, appPath: string, folder?: string): string[] {
  const { launch } = preset;
  switch (launch.kind) {
    case 'browser-new-window':
      // `-n`: an already-running app ignores `--args`; Chromium/Firefox forward
      // the new instance's command line to the running one and exit.
      return ['-n', '-a', appPath, '--args', launch.flag, 'about:blank'];
    case 'browser-url':
      return ['-a', appPath, 'about:blank'];
    case 'folder':
    case 'warp-uri':
      if (!folder) throw new Error(`open-with: ${preset.id} needs a folder`);
      return launch.kind === 'folder'
        ? ['-a', appPath, folder]
        : ['-a', appPath, `warp://action/new_window?path=${encodeURIComponent(folder)}`];
  }
}

/** Parse the stored selection; anything unknown or in the wrong category is dropped. */
export function parseOpenWithSelection(raw: string | null): OpenWithSelection {
  if (!raw) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
  const record = parsed as Record<string, unknown>;
  const selection: OpenWithSelection = {};
  for (const category of OPEN_WITH_CATEGORIES) {
    const preset = findOpenWithPreset(record[category]);
    if (preset?.category === category) selection[category] = preset.id;
  }
  return selection;
}

/** The preset chosen for a category. Deliberately ignores installation — the main process re-checks. */
export function selectionToPreset(
  category: OpenWithCategory,
  selection: OpenWithSelection
): OpenWithPreset | undefined {
  const preset = findOpenWithPreset(selection[category]);
  return preset?.category === category ? preset : undefined;
}

export type OpenWithServiceDeps = {
  platform: string;
  homeDir: string;
  /** stat-based; false on any error. Follows symlinks (Safari is a symlink). */
  isDirectory: (path: string) => Promise<boolean>;
  realpath: (path: string) => Promise<string>;
  /** PNG data URL for an app bundle, or undefined when no usable image. */
  thumbnail: (realAppPath: string) => Promise<string | undefined>;
  /** Run `/usr/bin/open` with argv; resolves 'timeout' when killed by the timeout, rejects on other failures. */
  runOpen: (argv: string[]) => Promise<'ok' | 'timeout'>;
};

export type OpenWithService = {
  listInstalled: () => Promise<OpenWithInstalledApp[]>;
  loadIcon: (rawAppId: unknown) => Promise<string | null>;
  launch: (raw: unknown) => Promise<OpenWithLaunchResult>;
};

const MAX_FOLDER_LENGTH = 4096;

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Resolve `undefined` when `promise` does not settle in time. */
const withTimeout = <T>(promise: Promise<T>, ms: number): Promise<T | undefined> =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve(undefined), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });

/**
 * Detection, icons and launching over injected IO. All renderer input is
 * untrusted: only registry ids are accepted, app paths are resolved here, and
 * the folder must realpath to an absolute directory.
 */
export function createOpenWithService(deps: OpenWithServiceDeps): OpenWithService {
  const iconCache = new Map<string, string>();
  const iconInFlight = new Map<string, Promise<string | null>>();

  /** First existing candidate in search order (stats run in parallel, order is kept). */
  const findAppPath = async (preset: OpenWithPreset): Promise<string | undefined> => {
    const candidates = candidateAppPaths(preset, deps.homeDir);
    const exists = await Promise.all(candidates.map((candidate) => deps.isDirectory(candidate)));
    return candidates[exists.indexOf(true)];
  };

  const resolveFolder = async (raw: unknown): Promise<string | undefined> => {
    // Cheap pre-checks first; also keeps relative paths from resolving against the main process cwd.
    if (typeof raw !== 'string' || raw.length > MAX_FOLDER_LENGTH || raw.includes('\0') || !raw.startsWith('/')) {
      return undefined;
    }
    let resolved: string;
    try {
      resolved = await deps.realpath(raw);
    } catch {
      return undefined;
    }
    // The isDirectory gate is what stops Terminal / iTerm2 / Ghostty from
    // *executing* a file passed in place of a folder — never relax it.
    return resolved.startsWith('/') && (await deps.isDirectory(resolved)) ? resolved : undefined;
  };

  const fetchIcon = async (realAppPath: string): Promise<string | null> => {
    try {
      const icon = await withTimeout(deps.thumbnail(realAppPath), OPEN_WITH_ICON_TIMEOUT_MS);
      if (!icon) return null;
      iconCache.set(realAppPath, icon);
      return icon;
    } catch {
      return null;
    }
  };

  return {
    async listInstalled() {
      if (deps.platform !== 'darwin') return [];
      const found = await Promise.all(
        OPEN_WITH_PRESETS.map(async (preset) => ((await findAppPath(preset)) ? preset : null))
      );
      return found
        .filter((preset): preset is OpenWithPreset => preset !== null)
        .map(({ id, category, name }) => ({ id, category, name }));
    },

    async loadIcon(rawAppId) {
      const preset = findOpenWithPreset(rawAppId);
      if (!preset || deps.platform !== 'darwin') return null;
      const appPath = await findAppPath(preset);
      if (!appPath) return null;
      let realAppPath: string;
      try {
        realAppPath = await deps.realpath(appPath);
      } catch {
        return null;
      }
      const cached = iconCache.get(realAppPath);
      if (cached) return cached;
      let pending = iconInFlight.get(realAppPath);
      if (!pending) {
        // Only successes are cached; the in-flight entry is dropped either way so failures retry.
        pending = fetchIcon(realAppPath).finally(() => iconInFlight.delete(realAppPath));
        iconInFlight.set(realAppPath, pending);
      }
      return pending;
    },

    async launch(raw) {
      if (deps.platform !== 'darwin') return { ok: false, reason: 'unsupported-platform' };
      if (!isPlainObject(raw)) return { ok: false, reason: 'unknown-app' };
      const preset = findOpenWithPreset(raw.appId);
      if (!preset) return { ok: false, reason: 'unknown-app' };

      let folder: string | undefined;
      if (preset.category !== 'browser') {
        folder = await resolveFolder(raw.folderPath);
        if (!folder) return { ok: false, reason: 'invalid-folder' };
      }

      const appPath = await findAppPath(preset);
      if (!appPath) return { ok: false, reason: 'not-installed' };

      try {
        const outcome = await deps.runOpen(buildOpenArgv(preset, appPath, folder));
        return outcome === 'timeout' ? { ok: false, reason: 'launch-timeout' } : { ok: true };
      } catch {
        return { ok: false, reason: 'launch-failed' };
      }
    },
  };
}
