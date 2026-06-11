<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# feedback

## Purpose

Main-process helpers that gather recent application log files into a single gzipped attachment for user feedback submissions. Consumed by `process/bridge/feedbackBridge.ts`, which ships the attachment when a user sends feedback.

## Key Files

| File      | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `logs.ts` | Locates and packages recent logs. `getRecentFeedbackLogPaths(logsDir, days=3)` scans a dir for files matching a `YYYY-MM-DD` prefix and the suffixes `.log` / `.aioncore.log` / `.aionrs.log`, then returns paths for the newest `days` dates. `collectFeedbackLogAttachment(logsDir)` reads those files, concatenates them with `=== <basename> ===` headers, gzips the result, and returns a `FeedbackLogAttachment` (`filename: 'logs.gz'`, `contentType: 'application/gzip'`) or `null` when no logs exist. |

## For AI Agents

- Main-process only: uses Node `fs`, `path`, `zlib` synchronously — never import this from renderer code.
- `getRecentFeedbackLogPaths` swallows a failed `readdirSync` and returns `[]`; preserve this fail-soft behavior so feedback submission never crashes on a missing logs dir.
- The date/suffix constants (`LOG_SUFFIXES`, `DATE_PATTERN`, `DEFAULT_LOG_DAYS`) define which logs are eligible — update them in lockstep with the logger's filename format.
- Covered by `tests/unit/feedback/feedbackBridge.test.ts`; keep those tests passing when changing the attachment shape.

## Dependencies

### Internal

- Consumed by `packages/desktop/src/process/bridge/feedbackBridge.ts`.

### External

- Node built-ins only: `node:fs`, `node:path`, `node:zlib`.

<!-- MANUAL: notes below this line are preserved on regeneration -->
