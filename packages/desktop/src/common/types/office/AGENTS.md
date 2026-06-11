<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# office

## Purpose

Shared TypeScript type definitions for AionUi's office-document handling: format conversion (Word/Excel/PowerPoint/PDF) and file preview. These interfaces are consumed by both the Main process (conversion services) and the Renderer (preview UI) and form the contract carried across the IPC bridge.

## Key Files

| File            | Description                                                                                                                                                                                                                                                                                                                                                                                         |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ------------- |
| `conversion.ts` | Conversion contract types: generic `ConversionResult<T>`, Excel/PPT intermediate JSON shapes (`ExcelWorkbookData`, `ExcelSheetData`, `ExcelSheetImage`, `PPTJsonData`, `PPTSlideData`), the `ConversionServiceApi` interface (word/excel/ppt/pdf converters), and the unified `DocumentConversionRequest` / `DocumentConversionResponse` (discriminated on `DocumentConversionTarget` = `'markdown' | 'excel-json' | 'ppt-json'`). |
| `preview.ts`    | Preview types: `PreviewContentType` union (markdown, diff, code, html, pdf, ppt, word, excel, image, url), `PreviewHistoryTarget`, `PreviewSnapshotInfo`, and `RemoteImageFetchRequest`.                                                                                                                                                                                                            |

## For AI Agents

- Type-only declarations — no runtime code, no DOM or Node APIs; safe for both process types.
- Field naming mixes snake_case (`file_path`, `file_name`, `conversation_id`) with camelCase (`contentType`, `slideNumber`); match the existing key style in each interface rather than normalizing.
- Comments are bilingual (Chinese / English) inline on fields; keep that convention when adding fields.
- `ExcelSheetData.data`, `PPTSlideData.content`, and `PPTJsonData.raw` are typed `any` here despite the project's no-`any` rule (raw spreadsheet/PPTX payloads); do not tighten without verifying the conversion-service callers.
- `DocumentConversionResponse` is a discriminated union keyed by `to`; extend the union (not the request) when adding a conversion target, and keep `DocumentConversionTarget` in sync.

## Dependencies

### Internal

None — self-contained type module with no imports.
