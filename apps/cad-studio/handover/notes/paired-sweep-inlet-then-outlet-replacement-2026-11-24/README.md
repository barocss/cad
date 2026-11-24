# D1891 — Replace the original Sweep outlet after its inward tilted inlet

P5 [row 07](../../roadmap-rows/07.md) and [row 31](../../roadmap-rows/31.md), [#17](https://github.com/barocss/cad/issues/17). Base `15113c086bc28d7c1ae12b2680ac465a7db12135`.

The original outlet of a native five-span paired Sweep can accept a second inward tilted Replace face after exactly one original inlet replacement. The Kernel rebuilds the original Sweep, replays the first tilt with its current donor and requires complete equivalence with the actual parent. The original outlet still uses its original straight rail and unchanged walls. Model and Studio bind the second feature to the first edit and both face names to the original Sweep.

- **FAIL, original desktop.** The first native inlet replacement applies. The pointer picks the original outlet of the resulting solid. Replace face then remains unavailable. The actual baseline reproduction passes.
- **PASS, independent native geometry.** The inlet plane is `x = −9 + y/4` and the outlet plane is `x = 35 + (y−38)/4`. They remove 64 mm³ from separate straight spans. Retained volume `32(22 + 15π)` is 2211.9644737231 mm³. Analytic centroid is (12.8208933118, 18.6575343541, 0) mm. Each cap retains both passage loops. The result is strictly valid with genus 2, 62 faces, 66 loops, 264 coedges, 132 edges and 72 vertices. The second edit changes 24 edges and retains the already-tilted inlet, all walls, native incidence and 48 join charts. The scope rules refuse reverse order, a second edit of the same cap and a third edit.
- **PASS, actual Studio.** Eight dual-tilt states and eight original outlet controls pass. The second edit uses the current edited body and an independent donor. The first donor Move changes only the inlet intercept from −9 to −8 mm. The original second outlet boundary remains identical. Native volume becomes 2179.9644737231 mm³ with the same two passages and 48 joins. Undo, Redo, Save and fresh Open retain the exact native digest `dae65c666c4ff345ac5b2a81da6322052bb4c046782be060fc9997db39f71e21`. An attempt to open a chain with a held first donor leaves the accepted model intact. An independent Sol High review found no new admission or replay defect.
- **PASS, affected checks.** 72 Kernel, 104 Model and 9 Studio tests, both package type checks, scoped lint and Studio production build.
- **NOT_RUN.** Whole local suites, reverse order as a positive result, arbitrary histories and Sweep profiles, outward tilt, updated pinned Agent review, mobile and live providers. The broader #17 remains open. First mechanical CAD remains 8/10.

## Reproduce

Use Node 22.19.0 and existing desktop Chrome and Playwright. Run heavy checks serially and freeze the checkout during Studio.

```sh
node packages/barocss-cad/scripts/tool.mjs build:fast
node --test --test-concurrency=1 packages/barocss-cad/test/exact-{spaced,line-arc,arc-line}-paired-duct-sweep.test.mjs packages/barocss-cad/test/edge-continuity.test.mjs packages/barocss-cad/test/api-part.test.mjs
pnpm --dir packages/barocss-cad-model test replace-face paired-elbow-outlet-offset-handle paired-elbow-outlet-plane-proposal-review offset-to-plane offset-face-native native-offset-face feature-handles
pnpm --dir apps/cad-studio test offset-plane-pick-feedback offset-face-launch-view command-build-failure tool-contract-mcp
pnpm --dir packages/barocss-cad type-check
pnpm --dir packages/barocss-cad-model type-check
pnpm --dir apps/cad-studio build
D1891_SOURCE_FROZEN=1 node apps/cad-studio/test/paired-sweep-two-cap-replacement-browser.mjs "$OUT/dual"
D1881_SOURCE_FROZEN=1 node apps/cad-studio/test/paired-outlet-reference-plane-browser.mjs "$OUT/outlet" --replace
```
