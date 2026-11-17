# Script interchange

Open **Import script** from Home or within a project. The preview preserves the uploaded file, displays the source and conversion together and flags ambiguous cues. Edit the text or element type in the preview, match AV columns, and review any scene or cue links before committing a reimport. Use **Cancel** to stop the pending batch or **Skip file** to continue after an unusable source.

| Format | Editable import | Export and scope |
| --- | --- | --- |
| Final Draft (.fdx) | Script paragraphs, dual dialogue, scene numbers, basic title page fields, paper and revision markers | FDX preserves the supported script fields. Alternate dialogue, locked-page maps and custom revision metadata stay in SWDR. |
| Fountain | Core script elements, dual dialogue, numbered scenes and basic title fields | Fountain export carries those fields. Inline styling, special page breaks and proprietary revision metadata require review. |
| Word / Google Docs (.docx) | Native paragraph text, standard screenplay styles and the first suitable AV table in AV mode | Editable screenplay DOCX or an AV table with timing fields. DOCX pagination depends on Word and its installed fonts. |
| RTF and plain text | RTF text and plain text using the script element review | Plain text carries block text. |
| PDF | Local extraction for supported text-layer PDFs. Mixed or scan-only pages and detected encryption produce recovery guidance. | Shared screenplay layout in points, selectable Courier text, page and scene numbers, title page, and revision colour marks supported by the manuscript. The downloaded Courier PDF covers WinAnsi text. Use browser print or an editable export for other characters. |
| OpenDraft (.odraft) | A limited v1/v2 native reader based on the pinned open source schema. Script elements, AV rows and embedded AV storyboard images are mapped where available. | Import fixture is source-conforming and synthetic. Live OpenDraft round-trip, assets stored outside the file and other OpenDraft feature metadata require verification. |
| AV CSV / XLSX / YAML | Mapping for Video, Audio, Duration and optional Start cue. For XLSX the first worksheet is read. | Matching data columns and timings, along with AV Word and PDF exports. Storyboard images travel in the project archive. |
| SWDR project archive (.swdr) | Restore one versioned project with binary assets, named or issued document snapshots and stored links. | ZIP manifest version 1. Export from the script or AV toolbar. Restore into a fresh workspace to preserve the original IDs. |

For two-column sources without timings, select the Video and Audio columns, review the duration inputs, then confirm the use of preview timings. Include the first row as data when the table has no headers. For DOCX supplied by a cloud editor, download the editable file before opening Import.

PDF extraction supports a bounded set of page text structures. It presents a recognisable warning when a page yields no text and offers an OCR or editable re-export route. OCR happens in your chosen PDF editor. Always check the readable content against the retained source after conversion.

`.celtx`, `.cxscript`, `.wdz`, `.sbx`, `.fadein` and `.osf` need real permitted exports and an independent compatibility test. Import routes those files to an editable FDX, Fountain or DOCX conversion in the source editor. For older Final Draft `.fdr`, use Save As FDX.

Inputs are capped at 24 MB compressed and ZIP expansion is capped at 80 MB. Export a standalone archive before clearing local workspace data. Original attachments in the archive are identified by asset ID and keep their bytes.

## Repeatable checks

Run `node --import tsx --test src/interchange/interchange.test.ts` with Node 22 and installed dependencies. The fixtures check editable script fields, A4 and Letter media boxes, PDF classifications, AV timing and formats, scene and cue identity, and native project archive recovery. Commercial-format claims are limited to the supported fields and conversion exercises above.
