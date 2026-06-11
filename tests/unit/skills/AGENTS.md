<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# skills

## Purpose

Unit tests for the Skills Hub feature area (N4a) — covers the renderer skill-suggestion parser, the SkillsHubSettings page component, and the useAssistantSkills hook's httpBridge integration.

## Key Files

| File                                        | Description                                                                                                                                                                                                                                   |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `skillSuggestParser.test.ts`                | Tests `parseSkillSuggest`, `stripSkillSuggest`, `hasSkillSuggest` from `@/renderer/utils/chat/skillSuggestParser` — `[SKILL_SUGGEST]` block parsing, frontmatter validation, placeholder/malformed/empty-body rejection, and block stripping. |
| `SkillsHubSettings.dom.test.tsx`            | Smoke/structure checks for `@/renderer/pages/settings/SkillsHubSettings` — verifies it exports a function component, has a name/displayName, and is JSX-instantiable.                                                                         |
| `useAssistantSkillsIntegration.dom.test.ts` | Integration checks around `@/common/adapter/httpBridge` `httpGet` for the useAssistantSkills hook — confirms mocked getter is callable, returns an empty array by default, and supports repeated invokes.                                     |

## For AI Agents

- Framework: Vitest 4 (`describe`/`it`/`expect`); `react-i18next` and `@/common/adapter/httpBridge` stubbed via `vi.mock`.
- `.dom.test.*` files run in the DOM environment; the component test stays shallow (no render, only export/JSX-element assertions).
- Path aliases `@/renderer/*` and `@/common/*` are used directly in imports.
- Run a single file: `bun run test tests/unit/skills/skillSuggestParser.test.ts`.
- The parser test uses inline template-string fixtures for SKILL.md frontmatter and `[SKILL_SUGGEST]` blocks — extend those when covering new validation rules.

## Dependencies

### Internal

`packages/desktop/src/renderer/utils/chat/skillSuggestParser`, `packages/desktop/src/renderer/pages/settings/SkillsHubSettings`, `packages/desktop/src/common/adapter/httpBridge`.

### External

`vitest`, `react`, `react-i18next` (mocked).

<!-- MANUAL: notes below this line are preserved on regeneration -->
