# D1900 — Verify the three-vertex Sketch snapshot lifecycle

P1 [row 09](../../roadmap-rows/09.md) and [row 15](../../roadmap-rows/15.md), [#216](https://github.com/barocss/cad/issues/216). Base `86cebaabae77a8fbd280ba3f23d40e9135e4da1d`. Evidence-only change. The current product meets the bounded ordered native prism capture and independent snapshot contract.

| Original acceptance | Evidence |
| --- | --- |
| Native authority, ordered frame and projection | [D792](../three-vertex-sketch-plane-2026-11-12/README.md) checks exact P0, X and normal, perspective and orthographic selections, hidden endpoint refusal and eight native extrusion corners. The frame test checks swapped order and mapping residual. [Direction guidance](../three-vertex-frame-guidance-2026-11-17/README.md) confirms the same ordered semantics in Studio. |
| Precision and rejection | [D1126](../vertex-sketch-refusal-reasons-2026-11-14/README.md) checks mixed-body and collinear picks. [D1127](../orthographic-native-vertex-overlap-2026-11-14/README.md) checks the front corner at a near-overlap. Focused checks cover native ID stability at three mesh qualities, ambiguous overlapping topology, mixed selection, short baseline, near-axis mapping, nonfinite points, two and four picks, and stale or absent bodies. |
| Before adoption | Actual Studio refuses two and four picks and preserves the part and Undo label. A source width edit, source deletion and same-ID File Open each retire the selected points. The subsequent independent sketch uses current XY. A duplicate Sketch request preserves the active ordered plane. Cancel preserves the original part and Undo label. |
| Stored plane and local edit | Actual Studio authors an 8×6 mm rectangle and an independent 2 mm extrusion. Delete the source, save to the native browser project and open the exact bytes in a fresh context. Editing Edge 1 from 8 to 10 mm rebuilds 96 to 120 mm³. The native corners match the independent frame, and the saved plane and four side IDs stay exact. Undo and Redo restore both results. |

- **PASS.** Seventeen actual desktop states, 10 Model and 10 Studio tests, focused lint, browser syntax and Git diff. No browser errors, source changes or downloads.
- **FAIL, intermediate harness.** Two runs reached fresh Open but looked for the primitive Width field. In the reopened sketch, the rectangle uses the constrained outline editor. The final run uses its public Edge 1 length and verifies the native result.
- **NOT_RUN.** Whole local suites, local production build, mobile, other native source families and associative plane behavior. First mechanical CAD remains 8/10. Whole-product completion is unmeasured.

```sh
D1900_SOURCE_FROZEN=1 node apps/cad-studio/test/three-vertex-sketch-browser.mjs "$OUT/local-dimension" --lifecycle
pnpm --dir packages/barocss-cad-model test sketch-plane-precision mesh-vertex-provenance
pnpm --dir apps/cad-studio test vertex-pick-filter vertex-plane-summary
node --check apps/cad-studio/test/three-vertex-sketch-browser.mjs
git diff --check
```
