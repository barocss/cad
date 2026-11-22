# D1699 — Keep orthogonal Chamfer setbacks during a sketch drag

P1 advanced sketch, row 09, with Agent regression on row 16. [Issue #21](https://github.com/barocss/cad/issues/21). Parent `a7de3d7f1431d2253297645b7aa5259be4db9a34`.

When a new Chamfer trims a pair of constrained orthogonal straight sides, it adds two ordinary sketch constraints. The bevel length is the requested setback times √2. Its first joint angle is 135°, with the directed turn taken from the actual convex or reflex corner. Orthogonality comes from the existing horizontal and vertical constraints or a direct perpendicular relation. The two constraints retain both setbacks when the outline changes. The Studio command and Agent operation use the same implementation.

## Verification

- **FAIL, parent.** An existing C6 rectangular Chamfer accepted a drag that changed its setbacks to 12 mm and 6 mm. Replaying the D1696 saved mixed-turn output (`cb6a77d223c1c5902b4d94acc196249dd047a721bd4deb692e7b677cd29bdc74`) through D1698's drag to `[50,44]` changed the first pair from `[6,6]` to `[12,10]`. Its second pair stayed `[6,6]`.
- **PASS, actual desktop Studio WebGPU.** Apply one 6 mm Chamfer group to a convex and a reflex vertex of a notched outline. Drag the first bevel endpoint from `[44,40]` to `[50,44]`. Both bevels move via their shared carrier. Moving on to `[60,44]` would collapse the incoming side. The preview keeps its last valid result and release commits it once. One sketch Undo and one Redo restore the exact displayed before and after geometry. Finish, Save, fresh Open and Edit sketch retain the accepted shape and constraints.
- **PASS, native geometry.** The two bevels keep walls `n1.side[e9]` and `n1.side[e10]` and the same four native seams. The four measured setbacks are exactly 6 mm in this fixture, using the intersections of the two pairs of native carrier planes. The convex and reflex directions survive. The 10 mm extrusion passes strict closed B-rep validation and an independent polygon area-to-volume check. The unbound notch floor settles at 15.000063 mm after the drag. Eight Studio checkpoints record zero page errors, console errors and worktree changes.
- **PASS, affected regressions.** The direct Studio single-corner workflow, single-corner local Agent proposal and grouped Agent visual review passed in desktop Studio. The independent Model regression also moves a rotated outline with a direct perpendicular relation, verifies both 6 mm distances from native carrier intersections, reopens it and moves it again. Another case trims a carrier referenced by an earlier bevel angle and keeps both bevels. Scoped results include 50 Model tests, 50 Studio tests, Model and Studio type checks, Studio production build, ESLint, driver syntax and Git diff check.
- **NOT_RUN.** A dedicated edit of a saved Chamfer setback, wider desktop scenarios for unconstrained or nonorthogonal carriers, full local suites, mobile, live AI provider and the held B06 PDF. First mechanical CAD remains 8/10 and B06 remains 6/7. Overall completion is unmeasured.

| Exact native output | Reconstructed support intersections in mm | Volume in mm³ | Native body SHA-256 |
| --- | --- | ---: | --- |
| Before drag | (38, 40) and (38, 15) | 20000 | `a2f99254a4d226221dd11c82054da761b2dd661137aadc48444adef28cd360d5` |
| After drag and fresh Open | (44, 44) and (44, 15.000063) | 19140.01386 | `b99c264046e3a51fbe847bcd2db5fd855b5142a50b8dcf883d8c76ea6c469049` |

## Reproduction

Use Node 22.19.0, the workspace gate, installed desktop Chrome and Playwright, and an external evidence directory.

```sh
TEST_CONCURRENCY=1 pnpm --dir packages/barocss-cad-model test corner sketch-chamfer-retention sketch-point-drag revision-pinned-edit
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test sketch-edit-identity sketchIds draft-history proposal-review-availability
pnpm --dir packages/barocss-cad-model type-check
pnpm --dir apps/cad-studio build
pnpm exec eslint packages/barocss-cad-model/src/sketch/corner.ts \
  packages/barocss-cad-model/test/{corner,corner-batch,sketch-chamfer-retention,revision-pinned-edit}.test.ts \
  apps/cad-studio/test/{sketch-chamfer-browser,sketch-chamfer-agent-browser,sketch-chamfer-drag-browser,sketch-corner-batch-browser}.mjs
node --check apps/cad-studio/test/sketch-chamfer-drag-browser.mjs
D1699_SOURCE_FROZEN=1 node apps/cad-studio/test/sketch-chamfer-drag-browser.mjs "$OUT/drag"
D1691_SOURCE_FROZEN=1 node apps/cad-studio/test/sketch-chamfer-browser.mjs "$OUT/single"
D1692_SOURCE_FROZEN=1 node apps/cad-studio/test/sketch-chamfer-agent-browser.mjs "$OUT/agent-single"
D1697_SOURCE_FROZEN=1 node apps/cad-studio/test/sketch-corner-batch-browser.mjs "$OUT/agent-review" --review
git diff --check
```
