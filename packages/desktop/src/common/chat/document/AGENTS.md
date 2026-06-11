<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# document

## Purpose

Markdown-centric document conversion for editable Office files. Converts Word/Excel `ArrayBuffer`s to Markdown for unified in-app editing, then back to `.docx`/`.xlsx` on save (Word/Excel → Markdown → edit → Word/Excel).

## Key Files

| File                   | Description                                                                                                                                                                                                                                                                                                                                                                                                     |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DocumentConverter.ts` | `DocumentConverter` class plus a shared `documentConverter` singleton. Methods: `wordToMarkdown` (mammoth → HTML → turndown+gfm), `markdownToWord` (line-by-line `docx` paragraphs, ATX headings only), `excelToMarkdown` (SheetJS → GFM tables, one `## SheetName` heading per sheet when multiple), `markdownToExcel` (parses GFM tables back into a workbook), and the private `parseMarkdownTables` helper. |

## For AI Agents

- All conversion libs (`mammoth`, `turndown`, `turndown-plugin-gfm`, `docx`, `xlsx-republish`) are loaded via dynamic `import()` to keep initial bundle/load small — preserve this pattern when adding converters.
- `markdownToWord` is intentionally simplistic: only handles `#`/`##`/`###` headings and plain paragraphs; bold/italic/lists/tables are NOT rendered. Don't assume full Markdown fidelity round-trips.
- Sheet detection in `markdownToExcel`/`parseMarkdownTables` keys off `## ` headings and `|`-delimited rows; the separator row (`|---|`) is skipped via a `/^-+$/` test. Keep `excelToMarkdown` output format in sync with the parser.
- Buffer/ArrayBuffer slicing (`buffer.slice(byteOffset, …)`) is deliberate to return a clean `ArrayBuffer` to the renderer — keep it when editing return values.
- This file lives in `common/` (shared by both processes) but uses no Node or DOM globals; keep it environment-agnostic. Note the existing `any[][]` casts on SheetJS data are a pre-existing relaxation of the strict-no-`any` rule.

## Dependencies

### External

`mammoth`, `turndown`, `turndown-plugin-gfm`, `docx`, `xlsx-republish`

<!-- MANUAL: notes below this line are preserved on regeneration -->
