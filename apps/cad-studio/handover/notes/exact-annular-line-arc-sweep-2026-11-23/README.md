# D1744 — Sweep a concentric circular bore from a straight span into an arc

P5 Exact Sweep, rows 07 and 30. [Issue #10](https://github.com/barocss/cad/issues/10). Base `94b8d02c3ab96c952b3b5f9ce30c3db1dca9c02a`.

Admit an annular section on a line-and-arc path. Reuse the lead and revolved bend from [D1743](../exact-annular-elbow-sweep-2026-11-23/README.md), with the final annular cap at the arc end. Keep the same native section bindings, centering, wall clearance and path-axis checks. The Studio and local Agent descriptions expose the new section support.

- **FAIL, base capability.** Studio opened the R20 bend and 10 mm lead with a valid Ø4/Ø2 annular section. Exact Sweep required a disk and left the document intact.
- **PASS, desktop Chrome / WebGPU.** Create the tube, reject wall contact and edit the bore from Ø2 to Ø3 mm. Undo, Redo, Save, fresh Open and a second bore edit pass. Both center rays enter the reopened mouths. Adjacent rays land on the inlet at X−10 mm and the arc cap at Y20 mm. Studio reads 0° on all four native join edges. Explicit approval of the revision-bound local Agent proposal yields the manual native body.
- **PASS, independent native checks.** One strict genus-one body has 10 faces, 12 loops, 20 edges, 40 coedges and 12 vertices. Both end caps preserve outer and inner loops. The four joint edges have reciprocal native chart bindings. Verify independent volume and centroid, original wall turns, safe and refused wall and axis clearances, concentricity, radius bounds, reversed or malformed rail refusal and editable native reopen.
- **PASS, retained controls and checks.** The filled line-and-arc control passes. The D1743 annular elbow keeps its previously verified native hash. All three final browser flows report 41 checkpoints and zero source changes or browser errors. 64 kernel, eight Model and nine Studio tests pass. Kernel full build and types, Model types, scoped ESLint, Studio production build and types, driver syntax and Git diff check pass.
- **FAIL, inherited aggregate lint.** Kernel code-shape still reports the unchanged cylindrical-bore, thicken-cylinder and thicken-planar files.
- **NOT_RUN.** Arbitrary profiles, arc-first rails, frame laws, full local suites, WebGL2, mobile and live providers. First mechanical CAD remains 8/10. Overall completion remains unmeasured. Issue #10 stays open.

The independent volume is `π(4 − r²)(10 + 10π)` mm³. The Ø2 and Ø3 bore cases measure approximately 390.33591164037455 and 227.69594845688513 mm³. The edited body has a maximum measured native angle of 2.23e-14° and maximum native pcurve gap of 9.16e-16 mm. Its reopened native hash is `4f65ab21d7d8d9697436d35eab88d7e932702690e4658208799c67ea835ccc27`.

## Reproduction

Use Node 22.19.0, the heavy gate, installed desktop Chrome and Playwright, and an external evidence directory.

```sh
pnpm --dir packages/barocss-cad exec node scripts/tool.mjs build
pnpm --dir packages/barocss-cad exec node scripts/tool.mjs type-check
node --test --test-concurrency=1 packages/barocss-cad/test/{exact-annular-elbow-sweep,exact-elbow-sweep,exact-tangent-sweep,exact-rectangular-elbow-sweep,exact-rectangular-duct-sweep,exact-arc-line-arc-sweep,exact-opposite-arc-sweep,exact-closed-circle-sweep}.test.mjs
D1744_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-spaced-s-bend-browser.mjs "$OUT/verified" --annular-line-arc
D1670_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-tangent-sweep-browser.mjs "$OUT/control-disk"
D1743_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-spaced-s-bend-browser.mjs "$OUT/control-elbow" --annular-elbow
TEST_CONCURRENCY=1 pnpm --dir packages/barocss-cad-model test arc-sweep-display sweep-path-history tool-contract-mcp
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test sweep-path-geometry sweep-path-feedback continuity-angle-label
pnpm --dir packages/barocss-cad-model type-check
pnpm --dir apps/cad-studio build
git diff --check
```
