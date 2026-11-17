# #270 — explicit native body drawing scope (bounded acceptance)

## Implemented scope

Explicit selection of one current native base-part solid, saved as exact body key + explicit feature ID + kind (`extrude` or `revolve`). Selection is applied before HLR and drawing bounds. Viewport selection, hide and isolation do not choose the drawing body. Names and output array positions are not ownership evidence. The original full model and excluded output remain unchanged.

The first scope is a single ordinary sheet. Assembly/instance scope, sections, details, breaks, multiple sheets, sourced tables/BOM, balloons and weld output are unsupported. Missing or unsupported ownership must not silently become whole-part projection. A separate explicit **Use whole base part** action uses the existing reference-change guard. Saved missing/held ownership can remain stored, but drawing runtime refuses it rather than falling back.

## Actual acceptance

`test/drawing-body-scope-browser.mjs`, first run `cad-drawing-body-scope-01`: **PASS**, no earlier actual failures. Synthetic A = 30×12×6 and an occluding B; both native outputs remain present. This is not a user document.

- Merely choosing A in the control leaves the document unchanged; explicit Apply stores b1/n1/extrude.
- Native A volume 2160 mm³ and B volume 960 mm³; current front 30×6 and top 30×12. Original Worker response confirms A's visible sides despite B's occlusion in whole-part projection.
- Whole-part action and Undo restore the exact selected scope.
- Public Auto-dimension retains the chosen native body. Its oracle checks native/Worker geometry only (`svgDxf:false`), not a separate export assertion.
- Source Width 30→40 yields A volume 2880 mm³, front 40×6 and top 40×12. B and other source nodes remain unchanged.
- Undo/Redo, native Save and fresh Open retain exact accepted document and selector. Original SVG/DXF Blob geometry is independently compared for A-only, Width40 and fresh Open stages; no file-download approval or PDF claim.
- Browser contexts, browser and server closed. No console errors or source changes; frozen/after/after-cleanup capsule counts are each 1031.

## Important unresolved reference qualification

**This is not an ALL-references-PASS result.** The fresh-open screenshot visibly reports `0 matched again · 6 need a choice`. The three auto dimensions retain six authored endpoint signatures of length 30 (midpoint x=15) after Width40. Current projection resolves their existing names and displays 12/40/6, while Open's signature verification requests explicit decisions. The pre-save Width40 and reopened documents are exactly equal.

The actual assertions prove selected-body ownership, current geometry, source-preserving output and persistence, not complete reference repair. Whether the reference decisions are a pre-existing whole-part policy boundary or a new regression is not established by this run. No automatic signature rewrite was added.

## Validation

- Model focused: **25/25 PASS**; Model TypeScript and targeted lint PASS (Model owner).
- Studio focused: **3/3 PASS**; final TypeScript and targeted lint PASS; production build **5.91 s PASS**.
- DrawingWorkspace full-file lint remains **3 FAIL**, not included in a blanket lint-pass claim. Actual current/HEAD stdin comparison (without overwriting source) found identical unused variables: `DrawingFix` 42:84; `_leader` current754:21 / HEAD752:21; `_sheet` current754:37 / HEAD752:37.
- Initial Studio test authoring checks had an invalid empty-output assumption and two fixture type errors; these were corrected before final validation and actual execution, not classified as product failures.

## Evidence and privacy

- [A-only sheet](02-A-only.png)
- [Width40 fresh-open sheet and pending references](06-fresh-drawing.png)
- [Privacy-minimized receipt and artifact hashes](receipt.json)
- [A-only oracle](02-A-only-oracle.json), [auto-dimension oracle](03-auto-selected-oracle.json), [Width40 oracle](04-width40-drawing-oracle.json), [fresh-open oracle](06-fresh-drawing-oracle.json).

Both PNGs were directly reviewed by the executing agent and root; only synthetic geometry and generic labels are visible. JSON copies contain numerical geometry checks; the minimized receipt omits local environment/process details.

## Not run / still open

Revolve actual acceptance, late responses, suppression/deletion, same-key replacement documents, manual-reference refusal through public UI, and the full unsupported-scope actual matrix were not exercised. No import/split/assembly-subset support, PDF/ASME approval or manufacturing scope is claimed. #270 remains open pending its remaining acceptance and reference qualification.

## Bounded old-policy reference control

The width-40 and fresh-open documents are byte-identical (SHA256 `ffd4a260a79b343226bf949a192069ec21b0012a380def1e69a805e4f62a4dc1`). A read-only `verifyReferences` control compared (1) the current document with selected-body scope, (2) the same document with only the selector removed, and (3) that selector-removed document through actual e5674441d modules supplied from Git objects. All three return the same six problems, zero changes, identical candidate arrays, and leave the document unchanged. The stored endpoint signatures retain length 30 and midpoint X=15 while native b1 measures bounds [0,0,0]…[40,12,6] and volume 2880.000000000001 mm³.

Thus the observed warning is the existing reference-verification policy, not an automatic switch to another body introduced by the selector. Some explicit candidate choices include b3 edges, also identically in the old control; none were applied. This does not resolve those six references, qualify recovery-choice UX, or substitute for an actual old whole-part UI workflow (NOT_RUN). No signatures were silently refreshed.

A separate old-consumer probe used the e5674441d scope/options/evaluate/savedDrawing/chat modules: its actual readStudioFile preserves the new selector, then drawingInputs refuses `[DRAWING_SCOPE] unknown scope field`. It does not silently draw the whole part. This is separate from the test's simplified old-field-rule assertion.
