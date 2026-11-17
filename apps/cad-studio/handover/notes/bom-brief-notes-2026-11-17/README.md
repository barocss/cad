# #274: opt-in existing design-brief notes in BOM (partial)

Parent: `0bf3aa254ae2857d2affc42da15295ba1af501ed`. This is a read-only consumer of existing `Brief.notes`, not a new part-description editor, approval, or manufacturing instruction. No saved schema/field, geometry, BOM grouping, quantity, mass, or default purchase CSV semantics changed.

## Contract

- Default off. The explicit consent belongs to the exact document, BOM result and filename; reopening or replacing them requires a fresh opt-in.
- The exact accepted BOM source/result pair supplies top-level ordinary made-part definitions. A reconstructed/foreign result refuses. Nested, bought/library, generated fastener and element rows are excluded rather than guessed.
- Preserve full `Field<string>` values and metadata, grouping equal fields by occurrence IDs inside the original BOM row. Distinguish absent, empty, invalid and excluded. No first-value loss and no quantity repetition per note variant.
- Separate opt-in CSV uses one original BOM row with JSON field/occurrence mapping. Existing purchase CSV remains unchanged. Export checks current ownership before and after serializing.

## Verification

- Model final new tests: 10/10 PASS. Earlier directly affected suite: 28/28 PASS (before the last standalone library/fastener admission test). Final Model tsc and targeted lint PASS.
- Studio recording/adjacent tests: 15/15 PASS, tsc/targeted lint PASS; build 5.85s PASS. The initial recording whitespace expectation failed and was corrected without product changes.
- Actual Chrome run `cad-bom-brief-notes-02`: PASS. Source freeze across 521 files unchanged through cleanup; contexts, browser and server closed. No collected browser errors or source changes.
- Synthetic same-geometry shared p1/p2 plus independent p3: one BOM row, qty 3. Existing UI displayed 0.8 g before/after; this is display invariance, **not independent native mass accuracy**.
- A→p1,p2 and B→p3 retain Unicode/newline/quotes, basis/source/why and absence of confirmation. Independent Python CSV/JSON parser PASS: one row, qty 3, two groups, full Field round trip. Formula-like B remains a JSON string, not a promoted instruction.
- Default purchase CSV literal and opt-in before/after bytes identical. Native Save Blob equals accepted document; fresh-context Open equals saved document, defaults notes off and produces identical notes CSV after explicit opt-in. Close/reopen also resets opt-in.
- Screenshots `02-notes-shown.png` and `04-fresh-notes.png` were visually reviewed: actual rendered UI, synthetic data only, no personal/authentication data.

## Preserved failure and limits

Actual run 01 stopped in the separate native inspector: exit code null, empty stdout/stderr. Signal was not captured; cause is unknown, not asserted SIGKILL or product failure. Its local receipt remains preserved. The second driver deliberately removed that inspector rather than repeating native work; no independent native mass/shape PASS is claimed.

Issue #274 remains OPEN. This does not complete description designation/editing, shared/independent edits, source revision Keep/Accept/Dismiss, baseline currentness/approval, delayed-worker/Open/New races, broad legacy-reader or unsupported-family actual coverage. Controlled admission tests are not actual native library/fastener execution. Existing WIP/HOLD remain untouched.
