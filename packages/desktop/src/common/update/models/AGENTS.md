<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# models

## Purpose

Domain model for app version-update state, shared by both desktop processes. Wraps semver comparison logic in an immutable `VersionInfo` value object that decides whether an update is available, which release channel it falls into, and whether it must be forced.

## Key Files

| File             | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `VersionInfo.ts` | Immutable class plus `VersionInfoJSON` payload type and `VersionUpdateType` union (`'major' \| 'minor' \| 'patch' \| 'none'`). Built via static `create`/`fromJSON` (validating `current`, `latest`, optional `minimumRequired` with `semver.valid`). Computed accessors: `isUpdateAvailable`, `isForced`. Methods: `getUpdateType`, `isBreakingUpdate`, `requiresForceUpdate`, `satisfiesMinimumVersion`, `getVersionGap`, plus copy-with helpers `withLatestVersion`/`afterUpgrade` and statics `isValidVersion`/`compareVersions`. |

## For AI Agents

- Pure shared logic (in `common/`): no DOM and no Node.js APIs — keep it that way so both main and renderer can import it.
- The class is immutable: the constructor is `private`; never mutate instances. Produce a changed copy via `withLatestVersion`/`afterUpgrade`, which re-validate through `create`.
- All version strings flow through `assertValidVersion`, which throws field-specific `Error`s on invalid input — callers must pass strict semver. `getUpdateType` maps `pre*` diffs (`premajor`/`preminor`/`prerelease`, etc.) onto the base type, so prerelease versions are still classified.

## Dependencies

### External

- `semver` — version validation and comparison (`valid`, `gt`, `lt`, `gte`, `diff`, `compare`).

<!-- MANUAL: notes below this line are preserved on regeneration -->
