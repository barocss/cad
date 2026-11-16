# Edit a Detail crop in model millimetres

Baseline `8ff5f0f2882948774a9b20bcfe2ecc6b50a4449c`. P2 drawing usability, bounded #34 item 270. No schema, geometry kernel, PDF or standard-rounding change.

## Product change

The existing Details list now offers **Edit crop** for an unannotated detail, with center X/Y and radius explicitly in the parent view's model mm, not paper position. Values stay local until Apply; blur does not commit, Cancel/Escape discard. Empty/nonfinite values and radius ≤ 0 give an actionable refusal. Same-value Apply does not create another settings object.

Draft ownership includes the whole drawing, source document/model, model input, worker session, shown sheet and currentness. Changed ownership discards the editor; Apply also checks the latest owner, exact detail object and current model. The existing strict drawing-options validation is used on the whole drawing, so dimensions and standalone geometric controls on other sheets protect the crop. A visible lock reason distinguishes crop editing from scale/paper placement.

The existing annotated-empty Detail **Move** recovery is a separate, explicit repair path and is unchanged. Numeric editing does not bypass its reference protection or remove annotations. Existing scale, placement and removal actions retain their contracts.

## Verification

- Five focused tests: valid edit with scale/at/sheet preservation; blank/nonfinite/nonpositive refusal; no-op identity; stale/missing/replaced/duplicate ownership; dimensions and standalone frames on another sheet. **5/5 PASS**.
- Actual Chrome desktop 1440×1000: center (32,16)→(33,17), radius 6→7 model mm; draft blur leaves document unchanged; explicit Apply changes only crop settings. Actual parent-path bounds independently match 2 × radius × sheet scale, its screen center agrees with the displayed parent coordinate, and enlarged detail box matches 2 × radius × detail scale.
- First Undo/Redo, blank/NaN/Infinity/zero/negative refusal, Escape/Cancel, OPFS exact Save bytes→Close→reload→Open and displayed values: **PASS**.
- Opening another document with the same detail id discards a pending radius 11 draft and shows its own radius 6. Dimension-only, standalone-frame and split-sheet annotation locks preserve their documents: **PASS**.
- Existing annotated-empty Move repaired center (48,16)→(32,16), preserving dimensions and frame while clearing DETAIL_EMPTY: **PASS**.
- Final browser receipt `/tmp/cad-detail-crop-ui-03`: no page/console errors, watched-source writes or downloads. Screenshots of the full-width numeric editor and split-sheet lock were visually reviewed.
- Helper/UI/test lint: **PASS**. Whole DrawingWorkspace lint retains exactly five pre-existing unused-symbol errors (`DrawingFix`, `_sig`, `_was`, `_leader`, `_sheet`), compared with HEAD input; no new lint error.

First failures were retained: run 01 tried Project and versions while in Drawing (the control is in Model), and visual review found the editor squeezed into its parent flex row. The row now explicitly wraps and inputs override the old max-width. Run 02 passed edit/OPFS then hit the harness JSON-key-order equality guard on an imported annotated document. Imported input is now compared structurally and actual accepted state is captured before testing changes. Final run 03 passes these paths.

## Boundaries

This closes the missing general numeric crop-editing capability, not all of #34. Other Broken/Section/Detail clipping, source reconnection, sheet placement and export cases retain their separate status. No physical export/download, native-folder flow, mobile, exhaustive projections, or stale-worker failure injection is claimed. #35's analytic-radius boundary remains unresolved; all existing WIP/HOLDs are preserved.

Final Studio type-check and production build **PASS** (4.60 s; existing dynamic-import/module-directive/chunk warnings retained). The local workspace's shared installed Model sources are unchanged for this batch; all production edits are Studio-owned. Final diff-check passes. Original #126 checkout still has the same eight WIP entries and was not edited.
