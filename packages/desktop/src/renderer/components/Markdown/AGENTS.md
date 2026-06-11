<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# Markdown

## Purpose

Renderer-side Markdown rendering pipeline for AI chat messages. Wraps `react-markdown` with GFM/math/breaks plugins, KaTeX, custom code/diff/Mermaid blocks, and a Shadow DOM host that isolates message styles from the app's global CSS.

## Key Files

| File               | Description                                                                                                                                                                                                                                                                                                            |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `index.tsx`        | Default `MarkdownView` component. Memoized over streaming updates; normalizes input (strips `file://`, converts LaTeX delimiters), overrides `span`/`code`/`a`/`table`/`td`/`img` renderers, opens links via `openExternalUrl`, routes local image paths to `LocalImageView`, and toggles `rehypeRaw` via `allowHtml`. |
| `CodeBlock.tsx`    | Custom fenced-code renderer. Syntax highlighting via `react-syntax-highlighter` (hljs `vs`/`vs2015` themes), expand/collapse (3-line preview), copy button, diff line coloring, KaTeX, and delegates `mermaid` fences to `MermaidBlock`. Tracks `data-theme` via `MutationObserver`.                                   |
| `MermaidBlock.tsx` | Renders Mermaid diagrams (`securityLevel: 'strict'`), debounced re-render, source/preview toggle, responsive SVG injection, copy and open-in-panel (via `usePreviewContext`) actions.                                                                                                                                  |
| `ShadowView.tsx`   | Hosts rendered Markdown in a Shadow DOM root, injecting base styles, CSS variables, theme + user custom CSS, and a shared adopted KaTeX stylesheet. Subscribes to `ipcBridge.theme` for live theme/CSS updates; adapts line-height/font-size for mobile.                                                               |
| `markdownUtils.ts` | Helpers: `formatCode` (JSON pretty-print fallback), `logicRender` (ternary helper), `getDiffLineStyle` (green/red/blue diff backgrounds).                                                                                                                                                                              |

## For AI Agents

- Renderer-only code: no Node.js APIs. Cross-process data (theme, custom CSS) must come through `ipcBridge` (see `ShadowView.tsx`), never direct fs/Node access.
- Markdown content renders inside a Shadow DOM, so global app CSS and UnoCSS classes do NOT apply to message internals — element styling is injected as a `<style>` string in `ShadowView.createInitStyle` and via inline `style` props in `index.tsx` component overrides.
- Theme is read from `document.documentElement[data-theme]` and watched with `MutationObserver`; reuse this pattern rather than adding new theme listeners.
- `allowHtml` enables `rehypeRaw` (raw HTML) — only for trusted sources; keep default off.
- Keep the `components` map and plugin arrays memoized; new function identities each render unmount/remount custom blocks and lose state (see comment in `index.tsx`).

## Dependencies

### Internal

- `@renderer/utils` (`chat/latexDelimiters`, `theme/customCssProcessor`, `ui/clipboard`, `platform`), `@/renderer/styles/colors`, `@renderer/components/media/LocalImageView`, `@/renderer/pages/conversation/Preview` (`usePreviewContext`), `@/renderer/hooks/context/LayoutContext`, `@/common` (`ipcBridge`).

### External

- `react-markdown`, `remark-gfm`/`remark-math`/`remark-breaks`, `rehype-raw`/`rehype-katex`, `katex`, `mermaid`, `react-syntax-highlighter`, `@arco-design/web-react`, `@icon-park/react`, `@office-ai/platform`, `classnames`, `react-i18next`.

<!-- MANUAL: notes below this line are preserved on regeneration -->
