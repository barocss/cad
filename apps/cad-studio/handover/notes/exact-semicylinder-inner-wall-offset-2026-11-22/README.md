# D1657 — Offset the original inner wall of an Exact semicylinder

P5, row 31. [#17](https://github.com/barocss/cad/issues/17) and [#629](https://github.com/barocss/cad/issues/629). Base `82efd2828240f8cdfc6ba903f14f7ea3c33ec734`.

Offset face now accepts either original physical cylindrical skin of an upright, two-quarter Exact cylinder Thicken. The inner wall points toward the axis, so positive distance adds material and reduces the inside radius. Both skins use the same native regeneration and retained-boundary checks. The inner operation leaves the outer support, both axial stations and the original topology identities intact. It refuses contact with the axis or outer wall under the existing native tolerance.

- **FAIL, on base.** The existing outer-wall test passed and the new inner-wall case was refused before the command opened. The same inner-wall case passes after the change.
- **PASS, affected checks.** 122 Kernel, 58 Model and 17 Studio tests, Kernel and Model type checks, Studio type check and production build, scoped ESLint, script syntax and Git diff check. The cases include non-dyadic offsets, reversed V, strict native support and refusal at and within tolerance of both contacts. Model radial-wall checks measure 4 and 1 mm from the original two skins.
- **PASS, actual desktop Studio WebGPU and local Agent.** Picked the original inside wall, dragged the radial preview from +2 to +3 mm and applied +2 mm. Studio and the revision-pinned local MCP produced the same document. History refused −2 mm at the outer wall and +8 mm at the axis. Both refusals kept the accepted document. Applied −1 mm, then verified Undo, Redo, Save, fresh Open and the restored −1 mm editor. Six captures recorded 1,173 unchanged files and zero page errors, console errors or source changes. The original outer-wall desktop control passed.
- **PASS, native geometry.** Inside R8 moved to R6 and then R9 mm. Outside R10, the axis, Z=0/12 mm ends, radial wall supports and topology IDs are retained. The fixed outer face, edges, coedges and vertices match the original records. Native and Studio volume and centroid match the independent half-annulus within 1e−8 in their respective units. Native volumes are 1,206.3715789784799 and 358.141562509236 mm³. The maximum pcurve gap is 8.89e−15 mm. Fresh Open reproduces digest `ab5805922b500d6aaf3c0ac4884564f8ca9408aac30b6e9a60c650321ee4ecc1`.
- **NOT_RUN.** Full local suites, WebGL2, mobile, exchange and paid live models. Existing chart representability limits and the retained-boundary check apply. Both issues stay open for broader edits.

Use Node 22.19.0, the heavy gate, installed Chrome and Playwright (`CHROME`, `PW_DIR`) and output directories outside Git.

```sh
pnpm --dir packages/barocss-cad exec node scripts/tool.mjs build:fast
TEST_CONCURRENCY=1 pnpm --dir packages/barocss-cad-model test offset-exact-cylinder-wall offset-exact-cylinder-cap offset-face-native offset-to-plane replace-face agent-offset-wall agent-axial-wall
pnpm --dir packages/barocss-cad type-check
pnpm --dir packages/barocss-cad-model type-check
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test offset-plane-pick-feedback offset-face-launch-view offset-cap-feedback history-feature-apply
pnpm --dir apps/cad-studio build
node --test --test-concurrency=1 packages/barocss-cad/test/{exact-cylinder-cap-offset,bored-cap-offset,drafted-cap-offset,api-thicken,thicken-solid}.test.mjs
D1657_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-semicylinder-wall-offset-browser.mjs "$OUT/inner-wall" --inner
D1656_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-semicylinder-wall-offset-browser.mjs "$OUT/outer-control"
git diff --check
```
