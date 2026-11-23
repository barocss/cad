# D1756 — Resize a saved angle-constrained Sketch Fillet

P1 daily Sketch editing, row 09. [Issue #21](https://github.com/barocss/cad/issues/21). Base `a6ad3539a7a405166ec2676878383071419e3473`.

Allow a saved radius-locked Fillet between two straight lines with an explicit angle constraint. Find the lines' virtual intersection and use the signed turn to retain tangency and the original arc branch when resizing. Use the arc bisector to scale the same radius handle in Studio. Preserve the existing right-angle geometry, side IDs and radius and angle constraints.

- **FAIL, original Studio capability.** Studio opens the valid 36.86989764584402° carrier-angle fixture and reads R6 through its generic dimension tool. The carrier-preserving Edit Fillet action and radius handle are absent.
- **PASS, desktop Studio WebGPU.** Refuse R100 while keeping the accepted R6 part. Preview and apply R9, Undo, Redo, Save and fresh Open. Reopened native Extrude retains the same geometry, side IDs and constrained carrier planes. From reopened R9, the physical handle reaches R15. Its outline matches typed R15 exactly. Both preview paths preserve the accepted document until Apply. The original carrier lines and 10 mm Extrude settings remain fixed.
- **PASS, local Agent.** Discover the R6 Fillet by saved side ID `e6`, refuse a stale revision, and stage the R9 proposal. Explicit Studio approval gives the same native B-rep and document feature nodes as numeric R9.
- **PASS, independent and control checks.** Inspect strict B-rep, cylindrical radius and center, unchanged straight side planes, and the sharp polygon area less the analytic circular wedge. Model tests include convex and reflex turns, reflected winding, reversed angle rule order, malformed metadata, oversized radius and another driving constraint. All 48 original right-angle comparisons match byte for byte. The existing R6→R8 desktop drag retains D1710's recorded native B-rep digest `7681b66cb929f4b39a58e3018636f1da717bd5619ad21ec2b7be31c943a435bd`.
- **PASS, affected checks.** 12 focused Model tests, 43 additional Model tests and 53 Studio tests. Model types, scoped ESLint, Studio types and production build, driver syntax and Git diff check. Three actual desktop runs record 22 checkpoints with zero source, page or console errors.
- **FAIL, recovered test expectation.** The first fixture treated absent optional arc-relation arrays as distinct from empty arrays. The final test uses the existing persistence semantics.
- **NOT_RUN.** Full local suites, authoring an angle-constrained non-right Fillet from its original sharp corner, unqualified lines or curved carriers, non-right Chamfer, alternate GPU backends, mobile and live providers. First mechanical CAD remains 8/10. Whole-product completion is unmeasured. Issue #21 stays open.

| Radius | Native Extrude volume | Native B-rep digest |
| --- | --- | --- |
| 6 mm | 20,995.830199582793 mm³ | `c1f4b22b735934f1d3b3b32b94230e18ec70472b01095c38f6aa2034cec4902c` |
| 9 mm | 20,990.617949061285 mm³ | `eae8911ee64dbd663011e6020d702fabab8177472775727f7630b2b1ada4fa03` |
| 15 mm | 20,973.93874739245 mm³ | `d8b85e144bfc119707840f9d520f15581b8755131333a5c6e79a27422d0e6145` |

## Reproduction

Use Node 22.19.0, the heavy gate, installed desktop Chrome and Playwright, and external evidence directories. Run the first desktop command on the base with the candidate browser driver.

```sh
TEST_CONCURRENCY=1 pnpm --dir packages/barocss-cad-model test sketch-fillet-edit
TEST_CONCURRENCY=1 pnpm --dir packages/barocss-cad-model test corner sketch-point-drag revision-pinned-edit
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test sketch-edit-identity sketchIds draft-history scalar-handle-drag
pnpm --dir packages/barocss-cad-model type-check
pnpm exec eslint packages/barocss-cad-model/{src/sketch/filletEdit.ts,test/sketch-fillet-edit.test.ts} \
  apps/cad-studio/src/viewport/SketchCornerSizeHandle.tsx apps/cad-studio/test/sketch-oblique-fillet-browser.mjs
pnpm --dir apps/cad-studio build
node --check apps/cad-studio/test/sketch-oblique-fillet-browser.mjs
D1756_SOURCE_FROZEN=1 node apps/cad-studio/test/sketch-oblique-fillet-browser.mjs "$OUT/base" --expect-unavailable
D1756_SOURCE_FROZEN=1 node apps/cad-studio/test/sketch-oblique-fillet-browser.mjs "$OUT/candidate"
D1718_SOURCE_FROZEN=1 node apps/cad-studio/test/sketch-point-drag-browser.mjs "$OUT/right-angle-control" --radius-drag
git diff --check
```
