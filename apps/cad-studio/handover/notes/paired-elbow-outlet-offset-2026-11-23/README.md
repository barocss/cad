# D1788 — Move the original straight outlet cap of a paired Exact Sweep

P5 direct face editing, rows 30 and 31. [Issue #17](https://github.com/barocss/cad/issues/17). Base `18612a85f5491cde366ddab6b72c822bb945e3fb`.

Use a signed Offset face on the original outlet of the D1786 paired rectangular elbow. Certify the original exact rail and B-rep before rebuilding the same native shape with a changed terminal straight span. The original Sweep and selected-face signature remain in History. Preserve the inlet, bend, wall names and seam charts. The Model uses the same original outlet frame and keeps the command in distance mode.

- **PASS, original refusal reproduced.** Pick `n1.end` on the real desktop viewport and launch Offset face. The original command refuses the multiple face loops, disables Apply and keeps the document intact.
- **PASS, native geometry and signed position.** On a 10 mm lead, R20 quarter arc and 14 mm tail, move the terminal cap from y = 34 mm to 38 mm or 30 mm. The one closed genus-two shell retains 38 faces, 42 loops, 168 coedges, 84 edges and 48 vertices. Both terminal apertures, all 24 tangent joins and the unchanged inlet and bend retain native incidence and charts. The independent volume change is ±128 mm³ and the closed-form centroid agrees. Native quadrature gives 1,901.3096491487358 and 1,645.3096491487372 mm³. Maximum chart gap is 1.066e−14 mm. The 30° and 120° fixtures retain their original bend.
- **PASS, actual desktop Studio WebGPU and local Agent.** Apply +4 mm, open the saved Offset in History, refuse −14 mm and apply −4 mm. Refusal preserves the document and Undo action. Undo, Redo, Save, fresh Open and reopened History edit pass. The local Agent's collapse dry run returns a straight-outlet message. Its valid dry run and pending preview preserve the source. Explicit Studio Accept and approved native inspection match the manually edited and reopened body SHA-256 `39ec778cbb535d30b295013d740ee15489f29a75320222b28417817028c727e3`.
- **PASS, controls and affected checks.** The prior bored-cap Offset still passes its actual drag, signed edit and fresh Open. The original paired elbow review keeps both D1787 PNGs and native evidence. The four desktop runs cover 29 checkpoints with zero source changes, page errors or console errors. 378 kernel, 93 Model and 39 Studio tests, scoped ESLint, kernel library build, Model type check, Studio production build and Git diff check pass.
- **FAIL, recovered development checks.** The first candidate browser reached the old raw-document guard and refused the valid new recipe. The bounded original-outlet admission restores preview and persistence. The first focus fixture supplied an unsupported eccentric single opening and was corrected. A reopened test used an earlier Chrome context's locator and was corrected. The Agent collapse dry run initially returned the generic geometry error. The signed-outlet refusal now gives the recoverable constraint in Studio and the local Agent.
- **FAIL, inherited aggregate kernel lint.** ESLint source checks pass. The code-shape guard reports unchanged spread-minmax counts 3, 3 and 2 in cylindrical-bore, thicken-cylinder and thicken-planar. The modified kernel files do not raise those counts.
- **NOT_RUN.** Full local suites, drag on this cap, inlet offsets, chained face offsets, pending image review for this Offset, general frame laws, STEP exchange, alternate viewport backends, mobile and live providers. First mechanical CAD stays at 8/10 accepted. Overall completion remains unmeasured. Issue #17 stays open.

## Reproduction

Use Node 22.19.0, the heavy gate, installed desktop Chrome and Playwright, and external evidence directories. Append `--expect-refused` to the outlet driver with the original sources.

```sh
pnpm --dir packages/barocss-cad build:library
node --test --test-concurrency=1 packages/barocss-cad/test/*sweep*.test.mjs packages/barocss-cad/test/{bored-cap-offset,drafted-cap-offset,exact-cylinder-cap-offset,prism-wall-offset}.test.mjs
D1788_SOURCE_FROZEN=1 node apps/cad-studio/test/offset-paired-elbow-outlet-browser.mjs "$OUT/outlet-offset"
BORE_CAP_OFFSET_FROZEN=1 node apps/cad-studio/test/offset-bored-cap-browser.mjs "$OUT/legacy-bored-cap"
D1787_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-line-arc-paired-duct-browser.mjs "$OUT/legacy-elbow-review" --straight-tail --review
TEST_CONCURRENCY=1 pnpm --dir packages/barocss-cad-model test native-offset-face offset-face-native native-offset-result offset-to-plane offset-bored-cap offset-drafted-wall offset-exact-cylinder-cap offset-hexagonal-wall agent-offset-wall toolset tool-contract
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test offset-cap-feedback offset-plane-pick-feedback history-feature-editor command-build-failure
pnpm --dir packages/barocss-cad-model type-check
pnpm --dir apps/cad-studio build
git diff --check
```
