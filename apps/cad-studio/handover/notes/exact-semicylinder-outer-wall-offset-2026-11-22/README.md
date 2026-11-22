# D1656 — Offset the original outer wall of an Exact semicylinder

P5, row 31. [#17](https://github.com/barocss/cad/issues/17) and [#629](https://github.com/barocss/cad/issues/629). Base `216139053b14d9334075e3c25467ad753a4f883f`.

Offset face now supports signed radial movement of the original physical outer cylindrical skin of an upright, two-quarter Exact cylinder Thicken. The native producer continues the outer radius while retaining the inner face, rims and vertices, the common axis and both axial stations. It refuses contact with the retained wall and uses the existing native linear tolerance and strict B-rep check. A change of the native profile chart that would alter the retained inner representation is refused.

- **FAIL, on base.** The Model refused an original outer-wall pick before building Offset. The first Kernel check after implementation also exposed a producer range error before Offset could describe it. The radial control-point range check now refuses that move with an Offset diagnostic.
- **PASS, affected checks.** 115 Kernel, 57 Model and 17 Studio tests, Kernel and Model type checks, Studio type check and production build, scoped ESLint, script syntax and Git diff check. The Kernel covers both movement signs, a non-dyadic distance, reversed V, strict geometry and refusal for wall contact, range, unsupported face, stale ownership and a chained edit. Model radial-wall checks measure 4 and 1 mm from the original skins at the two edited radii.
- **PASS, actual desktop Studio WebGPU and local Agent.** Picked the outer skin, dragged the radial preview from +2 to +3 mm and applied +2 mm. Studio and the revision-pinned Local MCP produced the same document. History refused −2 mm at contact and kept the accepted document. Applied −1 mm, then verified Undo, Redo, Save, fresh Open and the restored −1 mm editor. Five captures recorded 1,173 unchanged frozen files and zero page errors, console errors or file changes. The full-tube outer Offset and Exact semicylinder inclined-replacement evidence controls also passed.
- **PASS, native geometry.** Outside R10 moved to R12 and then R9 mm. Inside R8, the axis, stations Z=0/12 mm, radial wall supports and all topology IDs are retained. The inner face, its coedges, edges and vertices compare equal to the source. Independent half-annulus volume and centroid match Studio and the strict native solid within 1e−8 in their respective units. Native volumes are 1,507.964473723096 and 320.4424506661571 mm³. The maximum pcurve gap is 5.03e−15 mm. Fresh Open reproduces digest `622ce7b16bf03385c4a38de2822d78770ccb8496e0abd139641dc6076ed5f6cb`.
- **NOT_RUN.** Full local suites, WebGL2, mobile, exchange and paid live models. This decision qualifies the original outer wall. Both issues stay open for broader edits.

Use Node 22.19.0, the heavy gate, installed Chrome and Playwright (`CHROME`, `PW_DIR`) and output directories outside Git.

```sh
pnpm --dir packages/barocss-cad exec node scripts/tool.mjs build:fast
node --test --test-concurrency=1 packages/barocss-cad/test/{exact-cylinder-cap-offset,bored-cap-offset,drafted-cap-offset,api-thicken,thicken-solid}.test.mjs
TEST_CONCURRENCY=1 pnpm --dir packages/barocss-cad-model test offset-exact-cylinder-wall offset-exact-cylinder-cap offset-face-native offset-to-plane replace-face agent-offset-wall agent-axial-wall
pnpm --dir packages/barocss-cad type-check
pnpm --dir packages/barocss-cad-model type-check
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test offset-plane-pick-feedback offset-face-launch-view offset-cap-feedback history-feature-apply
pnpm --dir apps/cad-studio build
D1656_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-semicylinder-wall-offset-browser.mjs "$OUT/outer-wall"
CIRCULAR_WALL_FROZEN=1 node apps/cad-studio/test/circular-wall-offset-browser.mjs "$OUT/tube-control" --tube-outer
D1654_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-semicylinder-cap-replacement-browser.mjs "$OUT/inclined-control"
git diff --check
```
