<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# utils

## Purpose
Renderer-side helper functions for the guid (welcome/onboarding) page. Covers textarea caret-position geometry (for the prompt input) and provider model filtering used when populating model selectors.

## Key Files
| File | Description |
| --- | --- |
| `caretUtils.ts` | `measureCaretTop(textarea, position)` computes the caret's vertical pixel offset by rendering a hidden mirror `<div>` with the textarea's computed styles; `scrollCaretToLastLine(textarea, caretTop)` scrolls the textarea so the caret sits on the last visible line. |
| `modelUtils.ts` | `getAvailableModels(provider)` returns the provider's primary, non-disabled models (cached by `Map` keyed on id + models + `model_enabled` state), filtering by `function_calling` capability and excluding `excludeFromPrimary`; `hasAvailableModels(provider)` is a boolean convenience wrapper. |

## For AI Agents
- Renderer-only code: `caretUtils.ts` uses DOM APIs (`document`, `getComputedStyle`, `HTMLTextAreaElement`) directly — never move this into the main process.
- `modelUtils.ts` keeps a module-level cache (`available_modelsCache`); the cache key must include any new field that affects model availability, otherwise stale results will be returned.
- Capability checks rely on `hasSpecificModelCapability` returning `true | false | undefined`; the "available" predicate treats `function_calling === undefined` as enabled — preserve this tri-state logic.
- Existing inline comments here are in Chinese; follow the surrounding style when editing those lines, but new public functions should keep English JSDoc.

## Dependencies
### Internal
- `@/common/config/storage` (`IProvider` type)
- `@/renderer/utils/model/modelCapabilities` (`hasSpecificModelCapability`)

<!-- MANUAL: notes below this line are preserved on regeneration -->
