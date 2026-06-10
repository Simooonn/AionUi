<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# scripts

## Purpose
Build tooling for the AionUi React Native mobile app. Wraps `eas build` to auto-increment the build number and optionally submit iOS artifacts to TestFlight.

## Key Files
| File | Description |
| --- | --- |
| `build.js` | Node CLI (`#!/usr/bin/env node`, CommonJS). Parses `--profile`/`--platform`/`--local`/`--auto-submit`/`--direct-submit` flags, bumps `buildNumber` in `../versions/version.json`, then runs `eas build`. Reverts the bump if the build fails. For local iOS builds it injects Apple env vars (`EXPO_APPLE_TEAM_ID`, `EXPO_APPLE_ID`, `EXPO_APPLE_PASSWORD` from Keychain `AC_PASSWORD`) and submits via `eas submit` or directly via `xcrun altool --upload-app`. |

## For AI Agents
- Plain CommonJS Node script (`require`, not ESM) — this is mobile build tooling, not part of the Electron Main/Renderer split, so the no-DOM/no-Node rules do not apply.
- The single source of truth for the version is `../versions/version.json`; `build.js` reads/writes its `buildNumber` and `version` fields. Keep that JSON shape in sync if you change it.
- Hardcoded defaults exist for `EXPO_APPLE_TEAM_ID`, `EXPO_APPLE_ID`, and `APPLE_ID` — treat these as fallbacks and prefer env vars. Direct submit reads the App-Specific Password from Keychain entry `AC_PASSWORD`.
- `--profile` is required; the script exits with code 1 if missing. Build failures and missing artifacts also `process.exit(1)`.

## Dependencies
### Internal
- `../versions/version.json` (read/written for build number bumping)
### External
- Node built-ins only (`fs`, `path`, `child_process`). Invokes external CLIs at runtime: `eas` (Expo Application Services), `xcrun altool`, `security` (macOS Keychain).

<!-- MANUAL: notes below this line are preserved on regeneration -->
