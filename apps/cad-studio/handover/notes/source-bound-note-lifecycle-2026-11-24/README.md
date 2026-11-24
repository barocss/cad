# D1920 — Qualify the source-bound Drawing Note lifecycle

P2 [row 11](../../roadmap-rows/11.md), [#245](https://github.com/barocss/cad/issues/245). Base `a26b629c87781a628f42453171ac1917ddab6ef1`. Complete the adopted ordinary base-part profile from the [original endpoint implementation](../source-bound-note-2026-11-18/README.md). Production code and storage did not need a change.

- **PASS, sheet and display ownership.** Move the Front view to Sheet 2. Neither Note appears in the original SVG from Sheet 1. Both appear in the second sheet's SVG. A sheet switch cancels a pending endpoint selection without editing the document. At 1:2 with inch primary and dual units enabled, the bound 80 mm endpoint and the original free-coordinate 64 mm leader are 8 mm apart on paper. The authored endpoint and its signature are unchanged.
- **PASS, original endpoint visibility.** Turn the view to the opposite side. The bound Note stays and its arrow is omitted while the original edge is hidden. The free-coordinate leader is reprojected with the mirrored view. Undo restores the two exact half-scale arrow coordinates. The source signature is never rewritten during that operation.
- **PASS, document isolation and editing.** Hold one successful original 64 mm Drawing Worker reply. Open the repaired 80 mm document with the same Note IDs. The accepted Note placements and SVG arrow tips match before and after delivery, and all six observed document, selection, dirty and text states match. A later actual width edit to 88 mm suppresses the stale bound arrow. Explicit reselection restores it. A Note text edit keeps its endpoint and the free-coordinate Note, and survives Undo, Redo, native Save and a fresh Open.
- **PASS, output and checks.** 21 actual desktop checkpoints, 18 actual SVG files and eight actual DXF files. The preexisting R12 and R2000 captures pass the installed ezdxf 1.4.5 reader and its primitive audit. DXF carries visible TEXT, LINE and SOLID graphics. The focused 12 Model and 3 Studio tests also pass. The Model checks retain schema-compatible native JSON and project-container readback and explicit endpoint order. Driver syntax, scoped lint and Git diff check pass.
- **FAIL, earlier driver selector.** Two runs waited for the text `Connected endpoint` as a complete row. The actual row prefixes the source view. The corrected exact status suffix finds the existing visible state. Both earlier runs preserved the real sheet movement and the original DXF evidence.
- **NOT_RUN.** Live PDF, 3D Notes, scoped part/assembly, arbitrary topology, mobile and paid providers. The existing PDF HOLD stays in force. First mechanical CAD remains 8/10. Overall completion is unmeasured.

```sh
DRAWING_NOTE_TARGET_FROZEN=1 node apps/cad-studio/test/drawing-note-target-browser.mjs "$OUT/studio" --lifecycle
TEST_CONCURRENCY=1 pnpm --dir packages/barocss-cad-model test drawing-note-targets drawing-datum-targets
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test drawing-note-target-commit drawing-native
node --check apps/cad-studio/test/drawing-note-target-browser.mjs
pnpm exec eslint apps/cad-studio/test/drawing-note-target-browser.mjs
git diff --check
```
