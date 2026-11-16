# Datum target outside recovery (#71)

Base: e8b7a67ea0c3b9f06c44f399f6fd2b9629882dae. Desktop Chrome, 2026-11-16.

## Change
Drawing Issues now routes a target reference to the matching target row, opens Datum targets, focuses its selection button and highlights it on the sheet. Click, Enter and Space are supported. Selection cancels pending placement without changing the document. Dimension issue selection remains the fallback; nested fix buttons retain their own handling.

The outside warning explains the currently supported geometry recovery: note the label and size, Remove, then Add the same kind at new view points. It explicitly distinguishes Move symbol from moving the target line/area. No new geometry translation operation or schema change.

## Verification
- App TypeScript/Vite build PASS.
- ESLint PASS: IssuesList, DatumTargetsEditor, new browser driver. DrawingWorkspace still has the same five pre-existing unused-variable errors (DrawingFix, _sig, _was, _leader, _sheet), not a whole-file lint pass.
- datum-target-area-draft unit: 1/1 PASS.
- New datum-target-outside-browser: PASS at 1024x900 and 1440x900. Bracket Front, rectangle 6x4 and circle diameter 4 centred [30,0], line [30,0] to [35,3]. Warning selects/focuses a target even with the editor collapsed. Click/Enter/Space are exercised across these cases. Document remains unchanged on selection. Move symbol keeps area/line geometry and warning. Undo/Redo, actual Save/fresh Open preserve the warning; selection still works after reopening. Remove supports Undo/Redo; re-add at [25,3] (line end [20,3]) clears the outside warning.
- Existing datum-target-area-draft-browser: PASS at both desktop widths, including pending size edits, invalid size refusal, saved target Move symbol preservation, Undo/Redo/Save/fresh Open/SVG and Escape.
- Inspected 1024 rectangle selection screenshot: target row and sheet highlight visible.
- Local evidence: /tmp/cad-datum-outside-20261116 and /tmp/cad-datum-outside-area-regression-20261116.

Limits: no screen-reader, mobile, PDF/DXF, or arbitrary geometry coverage. Geometry recovery deliberately uses existing Remove/Add, not an in-place move. Protected #126 WIP untouched and excluded.
