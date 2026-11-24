# D1881 — Replace the original five-span Sweep outlet with an inward tilted plane

P5 [row 07](../../roadmap-rows/07.md) and [row 31](../../roadmap-rows/31.md), [#17](https://github.com/barocss/cad/issues/17). Base `a91a6cd8ac9e304a3b8af56326ed92a081f1d651`.

Replace face accepts the original outlet of the exact line–arc–line–arc–line Sweep with one rectangular exterior and two rectangular passages. The tilted replacement stays strictly inside the original straight tail. A complete replay checks the source coefficients before the cap is lifted along the tail. The original planar tail surfaces remain available to bind the shortened edges. The moved cap retains its three original loops. The new trims affect 12 vertices and 24 linear edges. The existing Offset face route continues to require a parallel donor. The linked replacement uses a separate current donor and refuses a held, suppressed, missing or changed owner.

- **FAIL, unchanged desktop.** An actual pointer picked the original outlet on the valid five-span solid. Replace face showed its unsupported-source reason and could not open. The detached fixture already supplied the exact tilted plane. The first baseline assertion mistook an arbitrary point on that plane for its authored origin. The final reproduction checks the implicit plane equation.
- **PASS, independent native geometry.** The plane `x = 35 + (y − 38)/4` intersects the original cap's rectangle at X34.5–35.5 mm. The expected retained volume is `32(23 + 15π)` = 2243.9644737231 mm³. The independent centroid is (12.503292360, 18.397113817, 0) mm. The result is one strict solid with genus 2, 62 faces, 66 loops, 264 coedges, 132 edges and 72 vertices. Both passage loops, every existing native ID and all 48 join charts are retained. The Kernel checks each changed edge against both native charts and refuses parallel, perpendicular, outward and join-crossing references. Touching the old cap or the preceding join also refuses.
- **PASS, actual desktop Studio.** The tilted route captures eight states and the parallel control captures six. Both complete without page, console or source-change errors. The existing Offset face mode refuses the actual tilted donor. The original Replace face previews and applies it. Editing the donor Move shifts the cap to X34 at Y38. Retargeting to the opposite donor face changes the intercept to X34.5153882032. Undo, Redo, native Save and fresh Open preserve the linked model and native digest `9f7327aca3d28a87c8054ebf86783115f91b3a6bfe35ba0ac88a82806198deec`. A collapse and a held donor both leave the accepted part intact. The existing parallel desktop flow remains a positive control.
- **PASS, affected checks.** 70 Kernel, 94 Model and 9 Studio tests, Kernel and Model types, scoped lint and Studio production build. The local named command opens the same supported source and rejects stale revisions, held donors and other source faces. Sol High independently reviewed the geometry and identified the held-donor authorization gap, which is fixed and covered.
- **NOT_RUN.** Whole local suites, outward tilted extension, inlet replacement, other profile families, other renderers, mobile and live providers. #17 retains its wider scope. First mechanical CAD remains 8/10.

## Reproduce the affected checks

Use Node 22.19.0 and the existing Chrome and Playwright setup. Run the heavy checks serially and freeze the worktree during Studio.

```sh
node packages/barocss-cad/scripts/tool.mjs build:fast
node --test --test-concurrency=1 packages/barocss-cad/test/exact-{spaced,line-arc,arc-line}-paired-duct-sweep.test.mjs packages/barocss-cad/test/edge-continuity.test.mjs packages/barocss-cad/test/api-part.test.mjs
pnpm --dir packages/barocss-cad-model test replace-face paired-elbow-outlet-offset-handle offset-to-plane offset-face-native native-offset-face feature-handles
pnpm --dir apps/cad-studio test offset-plane-pick-feedback offset-face-launch-view command-build-failure tool-contract-mcp
pnpm --dir packages/barocss-cad type-check
pnpm --dir packages/barocss-cad-model type-check
pnpm --dir apps/cad-studio build
D1881_SOURCE_FROZEN=1 node apps/cad-studio/test/paired-outlet-reference-plane-browser.mjs "$OUT/tilted" --replace
D1854_SOURCE_FROZEN=1 node apps/cad-studio/test/paired-outlet-reference-plane-browser.mjs "$OUT/parallel"
```
