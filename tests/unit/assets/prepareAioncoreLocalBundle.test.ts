import { describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const { prepareAioncore } = require('../../../packages/shared-scripts/src/prepare-aioncore');

describe('prepare-aioncore local bundle input', () => {
  it('refuses a local bundle dir that is the bundle target itself and leaves it untouched', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'aionui-local-bundle-'));
    const projectRoot = join(tmp, 'project');
    const targetDir = join(projectRoot, 'resources', 'bundled-aioncore', 'darwin-arm64');
    mkdirSync(join(targetDir, 'managed-resources'), { recursive: true });
    writeFileSync(join(targetDir, 'aioncore'), 'patched-binary');

    const previous = process.env.AIONUI_BACKEND_LOCAL_BUNDLE_DIR;
    process.env.AIONUI_BACKEND_LOCAL_BUNDLE_DIR = targetDir;
    try {
      expect(() =>
        prepareAioncore({
          projectRoot,
          platform: 'darwin',
          arch: 'arm64',
          version: 'v0.2.2',
        })
      ).toThrow(/must not be the bundle target itself/);
      expect(existsSync(join(targetDir, 'aioncore'))).toBe(true);
    } finally {
      if (previous === undefined) delete process.env.AIONUI_BACKEND_LOCAL_BUNDLE_DIR;
      else process.env.AIONUI_BACKEND_LOCAL_BUNDLE_DIR = previous;
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('hard fails local bundle input that lacks managed-resources manifest', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'aionui-local-bundle-'));
    const projectRoot = join(tmp, 'project');
    const localBundle = join(tmp, 'bundle');
    mkdirSync(join(localBundle, 'managed-resources'), { recursive: true });
    writeFileSync(join(localBundle, 'aioncore.exe'), '');

    const previous = process.env.AIONUI_BACKEND_LOCAL_BUNDLE_DIR;
    process.env.AIONUI_BACKEND_LOCAL_BUNDLE_DIR = localBundle;
    try {
      expect(() =>
        prepareAioncore({
          projectRoot,
          platform: 'win32',
          arch: 'x64',
          version: 'v0.1.46',
        })
      ).toThrow(/managed-resources\/manifest\.json/);
    } finally {
      if (previous === undefined) delete process.env.AIONUI_BACKEND_LOCAL_BUNDLE_DIR;
      else process.env.AIONUI_BACKEND_LOCAL_BUNDLE_DIR = previous;
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
