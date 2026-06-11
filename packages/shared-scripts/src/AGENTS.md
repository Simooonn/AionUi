<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# src

## Purpose

Build-time CommonJS Node scripts that bundle the AionCore backend binary into the Electron app. They download the `aioncore` binary from GitHub releases, stage its managed resources, and verify the bundled layout before packaging. Not part of the runtime app — invoked by the packaging/build pipeline.

## Key Files

| File                                   | Description                                                                                                                                                                                                                                                                                                                                                                                              |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `prepare-aioncore.js`                  | Exports `prepareAioncore({ projectRoot, platform, arch, version })`. Resolves the release tag (defaults to `latest` via `gh` CLI / `curl` against `iOfficeAI/AionCore`), downloads + extracts the platform/arch asset, copies the binary to `resources/bundled-aioncore/{platform}-{arch}/`, runs the binary's `prepare-managed-resources` subcommand, and writes `manifest.json`.                       |
| `verify-bundled-aioncore-resources.js` | Exports `verifyBundledAioncoreResources({ resourcesDir, electronPlatformName, targetArch })`. Walks the bundled-aioncore tree for a runtime key and returns `{ runtimeKey, checked, missing }`, asserting presence of the binary, `manifest.json`, `managed-resources/`, a managed `node` executable, and `codex-acp` / `claude-agent-acp` ACP tool entrypoints (read from each tool's `manifest.json`). |

## For AI Agents

- These are plain `require`-style Node scripts (no ESM, no TypeScript, no DOM/renderer APIs) — they run on the build host, not in Electron's main/renderer processes. Keep them CommonJS.
- Platform/arch mapping is convention-bound: arch `x64`→`x86_64`, `arm64`→`aarch64`; platforms map to Rust target triples (`apple-darwin`, `unknown-linux-gnu`, `pc-windows-msvc`). Asset name format is `aioncore-{tag}-{arch}-{platform}.{tar.gz|zip}` — changing the AionCore release naming requires updating `getAssetName`.
- The bundled directory layout (`bundled-aioncore/{platform}-{arch}/`, `managed-resources/node/*`, `managed-resources/acp/{toolId}/*/{runtimeKey}/`) is shared between the two files; keep `prepare` and `verify` in sync if it changes.
- Download/extract shells out to `gh`, `curl`/`wget`, `tar`, `unzip`, and PowerShell on Windows. The aioncore binary has no `--version` flag, so the release tag is treated as the authoritative version in `manifest.json`.

## Dependencies

### External

Node built-ins only: `child_process` (`execSync`/`execFileSync`), `fs`, `os`, `path`. No npm packages.

<!-- MANUAL: notes below this line are preserved on regeneration -->
