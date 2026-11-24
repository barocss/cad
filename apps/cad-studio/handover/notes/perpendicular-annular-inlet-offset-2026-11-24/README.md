# D1921 — Offset the original perpendicular annular inlet

P5 [row 08](../../roadmap-rows/08.md), [row 16](../../roadmap-rows/16.md) and [row 31](../../roadmap-rows/31.md), [#17](https://github.com/barocss/cad/issues/17). Base `7fd89f2acbbf731293e9a742712ad825977df4c8`.

Signed Offset face now moves the original straight inlet of the four-span perpendicular Exact Sweep with one concentric bore. The Kernel checks the cap, two cylindrical ends, two toroidal bends and all 20 circular edges with their 40 directed chart bindings. It replays the original Sweep before moving the first two rail poles and checks the revised native cap and retained faces. Moving the inlet to the first join or through it is refused. The existing saved Offset format and source face signature carry the edit.

- **FAIL, original desktop Studio.** Selecting the actual annular land picked `n1.start`. Offset face refused both loops and disabled Apply. The original document matched after refusal.
- **PASS, current desktop Studio.** Apply +4 mm at the original cap, then open the signed Offset in History. Refuse −10 mm without changing the accepted feature. Edit to −4 mm, then Undo, Redo, Save and fresh Open. Six actual checkpoints preserve the native source signature and the last accepted geometry. The original five-span rectangular paired inlet still follows a native reference plane across six current desktop checkpoints.
- **PASS, independent native and displayed geometry.** The inlet X coordinate moves from −10 to −14 and −6 mm. Volumes 670.3268691074823 and 594.9286454213302 mm³ agree with the independently integrated `3π(15π + 20 + d)`. Independent centroid coordinates agree within `1e-7 mm`. The original R2/R1 rims, fixed outlet and both toroidal carriers remain exact. All 12 join edges retain their identity and directed pcurves. Their measured angular error is within `1e-6°` with maximum pcurve gap `7.11e-15 mm`. Both results have strict genus 1 with 18 faces, 20 loops, 72 coedges, 36 edges and 20 vertices.
- **PASS, affected checks.** Ten native tests, 34 Model tests, 10 Studio tests, Kernel and Model types, scoped ESLint and Studio production build.
- **FAIL, earlier candidates and controls.** The first candidate used the profile circle reader on a native Curve, so the cap was refused. The corrected candidate uses the native circle reader. Two older five-span controls assumed Distance was the only mode. The current five-span flow also offers To plane, which the current control above verifies.
- **NOT_RUN.** Offset on the perpendicular outlet, linked plane, Replace face, a prior Boolean or Fillet target, general curved face editing, full local suites, mobile and paid providers. The parent #17 remains open. First mechanical CAD remains 8/10. Overall completion is unmeasured.

Use Node 22.19.0, installed desktop Chrome and Playwright, the heavy gate and external evidence folders.

```sh
D1921_SOURCE_FROZEN=1 node apps/cad-studio/test/perpendicular-sweep-inlet-offset-browser.mjs "$OUT/studio"
D1858_SOURCE_FROZEN=1 node apps/cad-studio/test/paired-outlet-reference-plane-browser.mjs "$OUT/paired-inlet-plane-control" --inlet
pnpm --dir packages/barocss-cad build
node --test packages/barocss-cad/test/exact-perpendicular-annular-inlet-offset.test.mjs packages/barocss-cad/test/exact-perpendicular-both-ends-sweep.test.mjs
TEST_CONCURRENCY=1 pnpm --dir packages/barocss-cad-model test perpendicular-annular-inlet-offset paired-elbow-outlet-offset-handle offset-to-plane offset-plane-retention native-offset-face
pnpm --dir apps/cad-studio test offset-cap-feedback offset-face-launch-view tool-contract-mcp offset-face-hud offset-plane
pnpm --dir apps/cad-studio build
git diff --check
```
