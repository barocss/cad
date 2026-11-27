# D2071 — Create an independent native Bridge Curve

P5 [row 08](../../roadmap-rows/08.md), [row 31](../../roadmap-rows/31.md) · [#750](https://github.com/barocss/cad/issues/750) · Base `43baddf05ea1717c0b5820ff564ff6d868401596`.

Select a native root edge near the intended end, then Shift-select the second edge near its intended end. **Bridge curve** opens a preview with both endpoint markers. Change either end in the panel. G0 creates a degree-one segment. G1 creates a degree-three Bézier with a handle of one third of the gap at each end. The arrows show traversal out of the first edge and into the second. Apply adds one Direct curve as a snapshot. The original geometry stays in place. Cancel discards the preview.

The input contract covers a pair of unmerged straight root edges or a pair of visible, straight Direct curves. Read the exact native curve from its owner. Accept clamped degree-one segments and the exact unit-weight degree-two segments that Studio uses for a straight sketch outline. Require distinct inputs and endpoints separated by the modeling tolerance. The native source writer stores every control coordinate with round-trip binary64 precision. A temporary renderer item carries the line and markers without entering Direct selection or the saved document.

## Verification

- **PASS, focused native tests.** Seven tests cover analytic G0 and G1, all endpoint combinations, the actual Studio outline, unequal positive line weights, invalid and refused sources, no input mutations, and detection of a tangent handle lost to coordinate rounding.
- **PASS, desktop Chrome WebGPU.** Pick two root edges near their endpoints on XY faces at `z = 6 mm` and `z = 14 mm`. Verify G0 preview and Cancel with selection, history and document intact. Change the first end, restore it, switch to G1 and Apply. Exactly one native Direct object is added. Undo and Redo restore the complete expected documents. Save and open the BCAD in a fresh context. The source B-rep SHA-256 digests and the native curve readback match at Apply, Redo and fresh Open.
- **PASS, independent endpoint and derivative check.** In the reopened native curve, the endpoints are exactly `(20, 0, 6)` and `(43, 12, 14)` mm. The derivatives are `(27.14774392099646, 0, 0)` and `(0, 27.147743920996454, 0)`. The cross products with the analytic directions +X and +Y are zero and both dot products are positive.
- **PASS, desktop Chrome WebGL2.** Refuse the reversed copy of the first segment, a closed path, and a `5e-8 mm` source with individual reasons and no document or history writes. Preview and apply a native G0 from `(20, 0, 2)` to `(28, 8, 9)` mm. Its only two poles are its endpoints. All five Direct source records and shape inputs remain unchanged.
- **PASS, feature build.** Studio and Model type checks, scoped ESLint, browser-driver syntax, diff check, and production Studio build. ESLint reports the existing renderer diagnostic warning. The final browser run retains 1,258 frozen source hashes through cleanup, with zero page and console errors.
- **FAIL, first browser harness.** The inspector expected the import label alone. Studio correctly appends the curve ID to the imported label. The subsequent run reads the actual curve and passes.
- **NOT_RUN.** Mixed root and Direct pairs, live references, curved sources, editing handle lengths, G2, full local suites and mobile. First mechanical CAD remains 8/10. Product-wide completion remains unmeasured.

```sh
# Node 22.19.0. Use the heavy gate for the desktop run and build.
pnpm --dir packages/barocss-cad-model test bridge-curve
tsc --noEmit -p apps/cad-studio
tsc --noEmit -p packages/barocss-cad-model
pnpm --dir apps/cad-studio exec vite build --outDir "$OUT/studio-dist"
BRIDGE_CURVE_SOURCE_FROZEN=1 node --import "$LOCAL_PLAYWRIGHT_PRELOAD" apps/cad-studio/test/bridge-curve-browser.mjs "$OUT/final"
```
