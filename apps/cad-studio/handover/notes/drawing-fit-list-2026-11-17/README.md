# #269 — drawing-linked fit dimension list

## Implemented boundary

A user can explicitly add, remove and position a `fits` table on a single base-part drawing sheet. The position is in paper millimetres. Stable dimension IDs, original edge/face provenance, nominal diameter, authored multiplier, classes/deviations and table-row sources are derived from the current resolved sheet and accepted document. A row represents a drawing dimension, **not a physical part or hole count**.

The shared sheet callback supplies the exact resolved dimensions and settings from that build. Fits bypass the earlier source-table cache and use the whole accepted source document/settings, so scoped instance data cannot be mistaken for the base part. The Model refuses unsupported or unresolved inputs rather than displaying previous successful limits or treating failure as an empty successful list. Existing table sources retain their prior path. Stored settings contain the source and position, not a stale independent row snapshot.

The table explicitly uses primary units, including in dual-unit drawings; existing dimension callouts retain their dual display. No new tolerance calculator, kernel fit law, schema migration or manufacturing approval is introduced.

## Actual runs

### First run: FAIL, retained

`cad-drawing-fit-list-01` failed because the test supplied a guessed tube edge/near reference that did not resolve in the actual top projection. Both authored dimensions were lost, and the new table correctly displayed **NOT AVAILABLE** with the lost-reference reason. This is evidence of that refusal only, **not successful list acceptance**. The original receipt, failure HTML and PNG remain preserved locally.

The fixture was corrected using the existing `auto_dimension` path to obtain the actual ordinary Ø12 bore reference. The driver then authored two explicit stable IDs/placements on that same face. No product code changed between runs. Independent expected nominal and fit limits remain literal arithmetic, not copied from the generated list.

### Final run: PASS

`cad-drawing-fit-list-02` passed through real Chrome UI:

1. Open the synthetic Ø12 tube with two diameter IDs, `fit-a` and `fit-b`, on the same bore. The second has an authored multiplier of 2; this still creates two dimension rows, not a physical quantity of three.
2. Explicitly **Add fit dimension list**. The table is not automatically added by Open or class assignment.
3. Enter X=15, Y=175 mm and **Move fit list fits**. Remove it explicitly, then Undo to restore the exact table settings. Actual table bounds stay inside the A3 sheet.
4. Through Library's public fit-table input, replace `shop-test` with the same table ID, changed upper deviation and source ID. The table updates from `synthetic-A` to `synthetic-B` without changing geometry or dimension references.
5. Undo/Redo the replacement; native Save and fresh Open restore the exact accepted document and derived table.
6. Capture original application SVG/DXF Blobs and independently verify the added, replaced and reopened rows.

| Stage | Nominal | H7 lower / upper deviation (mm) | Independent limits (mm) | Source ID |
| --- | ---: | --- | --- | --- |
| Added | 12 | 0 / +0.018 | 12 … 12.018 | synthetic-A |
| Replaced and fresh Open | 12 | 0 / +0.02 | 12 … 12.02 | synthetic-B |

These are synthetic user-source rows, **not certified standard values**. Source and estimate are mutually exclusive in the existing fit-row contract, so this actual fixture uses named synthetic sources rather than claiming estimate coverage.

## Independent output evidence

The standalone Python reader imports no product helper. It reads actual SVG text and DXF TEXT group codes with Unicode decoding and checks both dimension IDs, nominal/class/deviation text, table ID/row, source ID and edge/face provenance. Expected limits use independent literal arithmetic. It is a bounded text/entity reader, not a general DXF viewer or glyph/geometry measurement oracle.

- [After source replacement](02-source-replaced.png)
- [After fresh Open](04-fresh-open.png)
- [Added oracle](01-added-oracle.json)
- [Replaced oracle](02-source-replaced-oracle.json)
- [Fresh-open oracle](04-fresh-open-oracle.json)
- [Privacy-minimized receipt](receipt.json), with original receipt hash and copied artifact hashes

Both actual PNGs were directly inspected by the executing agent and parent. They contain only synthetic CAD content and no personal data. Export downloads were suppressed at the original Blob anchor boundary; the one `.bcad` download is the intended native Save. All 1,247 frozen source entries remained unchanged through cleanup. Runtime errors, console errors and source changes were empty; both contexts, browser and server were closed.

The screenshot shows **three drawing issues**: the intentionally duplicated diameter plus the minimal fixture's missing hole-size/overall dimensions. They are not table-source failures. This run does not claim the whole drawing is complete or issue-free.

## Verification accounting

- Model new tests: **9/9 PASS**.
- Model adjacent tests: **22/23 PASS**. The one drawing-table DXF frozen-golden failure also reproduces on the original HEAD; no golden was changed.
- Model type-check and targeted lint: PASS.
- Studio focused helper tests: **3/3 PASS**.
- Final Studio type-check and targeted lint: PASS; production build **4.91 s PASS**.
- Browser driver syntax and targeted lint: PASS.
- Actual01: FAIL as described; Actual02: PASS. They are not combined into an all-runs-PASS claim.

## Remaining actual acceptance / issue status

Keep #269 open for remaining acceptance. **Actual NOT_RUN in this bounded run:** paired hole/shaft rows, estimate rows, nominal geometry edits and row-boundary changes, inch/dual display, late worker results, Open/New interruptions, source deletion/class/pair changes, dimension reorder/delete, and the complete unsupported-input matrix. Model tests cover some of these contracts but are not relabeled as desktop acceptance. No PDF/ASME acceptance, external data download, manufacturing certification or existing HOLD expansion is claimed.
