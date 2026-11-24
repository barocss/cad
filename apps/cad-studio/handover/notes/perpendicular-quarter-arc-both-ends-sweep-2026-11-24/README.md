# D1916 — Add both straight ends to a perpendicular Exact Sweep

P5 [row 08](../../roadmap-rows/08.md) and [row 16](../../roadmap-rows/16.md), [#10](https://github.com/barocss/cad/issues/10). Base `5d51c451e9e363c138d9a7af34ef51550e39868c`.

Admit a forward straight inlet and outlet on the same two perpendicular tangent quarter arcs. Use the existing rational quadratic straight-end and bend admission. Preserve the first bend frame. Verify the nonadjacent inlet and outlet with positive-weight surface bounds. Keep the existing section limits and native circular boundary checks. The stored path uses the existing Exact Sweep representation.

- **PASS, native geometry.** The R12 and R18 bends join the 10 mm inlet and 10 mm outlet on three exact circular sections. The annulus with R2 outside and R1 inside gives `45π² + 60π` mm³. Native volume is 632.627757264409 mm³ and centroid is (8.261470069869471, 15.57547813008663, 6.163051800043896) mm. One strict genus-1 shell has 18 faces, 20 loops, 72 coedges, 36 edges and 20 vertices. All 12 circular seam edges have reciprocal coedges and both pcurves. Maximum gap is 7.11e−15 mm. The maximum measured tangent angle is 1.44e−13 degrees. The disk, phased bore, independent end lengths, caps and carrier retention also pass.
- **PASS, desktop Studio.** Three actual Join commands give the nine-pole rational rail. Exact preview and Apply produce the closed annulus. Contact at bore R2 refuses and retains the document. Bore R1.5 yields 369.03285840423825 mm³ with unchanged exterior surfaces. Undo, Redo and fresh native Open preserve the accepted result. A revision-bound local Agent dry run preserves the input file. Explicit Studio approval yields the same native digest as the regular command. Nine new checkpoints and the existing nine inlet and nine outlet control checkpoints pass.
- **PASS, refusal boundaries.** The native controls cover short, reversed, kinked and weighted ends, unsupported bend geometry or extra spans, eccentric or multiple openings, wall contact, radius limits, rectangular profiles and incorrect representation.
- **PASS, affected checks.** 318 native, 35 Model and 10 Studio tests. Kernel and Model types, scoped lint, Studio production build, driver syntax and Git diff check pass.
- **NOT_RUN.** Whole local suites, general nonplanar paths, downstream Boolean or Fillet on this rail, arbitrary profile or frame laws, Offset and Replace, mobile and paid providers. The first mechanical CAD baseline remains 8/10. Overall completion is unmeasured. #10 remains open.

```sh
pnpm --dir packages/barocss-cad exec node scripts/tool.mjs build:fast
node --test --test-concurrency=1 packages/barocss-cad/test/exact-*-sweep.test.mjs packages/barocss-cad/test/part-model.test.mjs
pnpm --dir packages/barocss-cad-model test sweep-path-history sweep-agent-remap sweep-history-edit arc-sweep-display arc-sweep-mixed-display toolset tool-contract
pnpm --dir apps/cad-studio test sweep-path-feedback sweep-path-geometry tool-contract-mcp
D1916_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-perpendicular-inlet-sweep-browser.mjs "$OUT/studio" --both-ends
D1914_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-perpendicular-inlet-sweep-browser.mjs "$OUT/inlet-control"
D1906_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-perpendicular-outlet-sweep-browser.mjs "$OUT/outlet-control"
pnpm --dir packages/barocss-cad type-check
pnpm --dir packages/barocss-cad-model type-check
pnpm --dir apps/cad-studio build
git diff --check
```
