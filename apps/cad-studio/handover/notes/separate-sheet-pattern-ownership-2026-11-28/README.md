# D2167 — Keep separate sheet pattern occurrences editable

P1 [row 07](../../roadmap-rows/07.md), [row 08](../../roadmap-rows/08.md) and [row 16](../../roadmap-rows/16.md) · [#198](https://github.com/barocss/cad/issues/198) · Base `f957e09f21c4920df61eab8e281cff64f93267b0`.

The existing Separate bodies mode copies the authored source and then places each result as a separate body. The same exact sheet carry used by Move and Rotate preserves the bend table and original names within each copy's graph. The One body result has no per-occurrence sheet report. The change adds desktop qualification for both commands and leaves the implementation intact.

## Verification

- **PASS, actual desktop Studio WebGPU.** Separate Linear creates an original plus two copies at +60 and +120 mm. Separate Circular creates two copies at +90° and +180° around Z through (100, 0). Original and copy body IDs and native names are distinct. Centroids and bend axis origins match the independent placements. Both One body controls produce a multi-solid result without a sheet report and the native Flat API returns `CAPABILITY`.
- **PASS, native and Studio follow-on edit.** The actual viewport picks the last occurrence's retained edge `n15.end|n15.leg1.a`. Flange adds 20 mm to that copy. Editing only its source thickness from 1.5 to 2 mm changes both bends to the exact second row of the bend table. The original and first copy retain identical geometry, report and flat DXF. Their one-bend flat measures 30 × 67.392920 mm at 2,967.768245 mm³ folded. The last copy has a DOWN and an UP bend, a 30 × 83.602654 mm flat and 4,936.205720 mm³ folded. Undo/Redo and browser project Save and fresh Open reproduce the accepted document and exact native records for both patterns.
- **PASS, flat exporter.** Studio shows the enabled DXF control for the independent flats. The same native default AC1015 writer generates separate DXF content. ASCII group checks verify mm, two Ø5.5 holes and the one or two expected bend centre lines and notes per body. Browser download was not invoked.
- **PASS, affected checks.** 15 Kernel and 14 Model checks, driver syntax and diff check. Both final desktop flows report zero page or console errors and zero changes across 1,611 frozen files.
- **NOT_RUN.** Browser DXF download, external CAD and physical manufacturing, arbitrary or overlapping transforms, full local suites, mobile, type check and build for this test-only change.

The finite #198 acceptance is covered by this result plus [translation and flange](../sheet-flange-after-move-2026-11-12/README.md), [rotation and flange](../sheet-flange-after-rotate-2026-11-12/README.md), [copy-only editing](../sheet-mirror-copy-flange-2026-11-26/README.md) and [D2165 origin reflections](../sheet-principal-origin-reflections-2026-11-28/README.md). Combined and scale boundaries remain qualified refusals. The first mechanical CAD baseline remains 8/10. Overall CAD completion remains unmeasured.

```sh
SHEET_PATTERN_FROZEN=1 node apps/cad-studio/test/sheet-move-browser.mjs "$OUT/final-linear" --linear-pattern
SHEET_PATTERN_FROZEN=1 node apps/cad-studio/test/sheet-move-browser.mjs "$OUT/final-circular" --circular-pattern
node --test packages/barocss-cad/test/r12-3.test.mjs
pnpm --dir packages/barocss-cad-model test sheet-transform-flange circular-pattern-span mirror-sheet-guidance
node --check apps/cad-studio/test/sheet-pattern-flow.mjs
git diff --check
```
