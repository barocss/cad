# D1743 — Sweep a concentric circular bore through an exact elbow

P5 Exact Sweep, rows 07 and 30. [Issue #10](https://github.com/barocss/cad/issues/10). Base `c68ef9f03f9f6b836f91f6f1d0d2566972dd4ba9`.

Admit one concentric circular bore on an exact line–arc–line rail. The native lead, revolved elbow and tail use the same annular section. Match both section loops and bind each inherited edge on both charts. Keep the bore inside the outer circle with enough wall clearance and keep the path away from the bend axis.

- **FAIL, base capability.** Studio opens the R20 quarter elbow and the Ø4/Ø2 annular profile. Exact Sweep requires a disk, refuses the annulus and leaves the input intact.
- **PASS, desktop Chrome / WebGPU.** Preview and Apply the tube along the 10 mm lead, R20 bend and 14 mm tail. Reject wall contact. Increase the bore from Ø2 to Ø3 mm with the same outer native charts. Undo, Redo, Save, fresh Open and a second bore edit pass. Both center rays enter their openings and adjacent material rays land on the two end planes. Studio measures 0° at all eight native joints. The local Agent preview needs explicit approval and yields the original manual native body.
- **PASS, independent native checks.** The strict genus-one solid has 14 faces, 16 loops, 28 edges, 56 coedges and 16 vertices. Both cap loops and eight reciprocal pcurve pairs pass. Verify oriented inner walls, native normal and curvature measurements, independent volume and centroid, oblique 30° and 120° bends, and phased clockwise and counterclockwise holes. Other direct tests cover eccentric holes, wall and axis refusal, and the existing line–arc-only bound.
- **PASS, retained controls and checks.** The existing circular disk elbow and rectangular duct still pass in Studio. The opposite-turn spaced annulus retains its published native hash. 57 kernel, eight Model and nine Studio tests pass. Kernel full build and type check, Model types, scoped ESLint, Studio production build and types, driver syntax and Git diff check pass.
- **FAIL, recovered numerical test setup.** The first safe 5e-6 mm wall test found about 1e-12 mm³ of arithmetic error from reconstructing a radius near X50. The independent comparison uses a 1e-10 mm³ absolute floor for that volume.
- **FAIL, inherited aggregate lint.** The kernel code-shape check still flags spread excesses in the unchanged cylindrical-bore, thicken-cylinder and thicken-planar files.
- **NOT_RUN.** Annular line–arc without a tail in Studio, arbitrary profiles and frame laws, full local suites, WebGL2, mobile and live providers. First mechanical CAD remains 8/10. Overall completion remains unmeasured. Issue #10 stays open.

The independent volume is `π(4 − r²)(24 + 10π)` mm³. The Ø2 and Ø3 bore cases measure approximately 522.2828030911459 and 304.66496846983506 mm³. The edited maximum native angle is 3.89e-14° and maximum pcurve gap is 3.56e-15 mm. Its reopened native hash is `353d879433f5eb83b1aa2bcdf883dc9942171810430e55bcc74e121c81045996`.

## Reproduction

Use Node 22.19.0, the heavy gate, installed desktop Chrome and Playwright, and an external evidence directory.

```sh
pnpm --dir packages/barocss-cad exec node scripts/tool.mjs build
pnpm --dir packages/barocss-cad exec node scripts/tool.mjs type-check
node --test --test-concurrency=1 packages/barocss-cad/test/{exact-annular-elbow-sweep,exact-elbow-sweep,exact-tangent-sweep,exact-rectangular-elbow-sweep,exact-rectangular-duct-sweep,exact-arc-line-arc-sweep,exact-opposite-arc-sweep}.test.mjs
D1743_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-spaced-s-bend-browser.mjs "$OUT/verified" --annular-elbow
D1671_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-tangent-sweep-browser.mjs "$OUT/control-disk" --elbow
D1675_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-rectangular-duct-sweep-browser.mjs "$OUT/control-duct"
D1723_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-spaced-s-bend-browser.mjs "$OUT/control-spaced-annulus" --annular
TEST_CONCURRENCY=1 pnpm --dir packages/barocss-cad-model test arc-sweep-display sweep-path-history tool-contract-mcp
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test sweep-path-geometry sweep-path-feedback continuity-angle-label
pnpm --dir packages/barocss-cad-model type-check
pnpm --dir apps/cad-studio build
git diff --check
```
