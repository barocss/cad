# D1808 — Move the original straight inlet of a paired Sweep

P5 native direct face editing, rows 30 and 31. [Issue #17](https://github.com/barocss/cad/issues/17). Base `ee18ee13b952e4cafe1ea65016d69e733f998643`.

Allow a signed Offset face on the original straight inlet of a paired line–arc–line Exact Sweep. Verify the original cap and native body, change the two control points of the first straight span and retain every native boundary coefficient on the bend, tail and outlet.

- **PASS — original refusal.** Actual Studio selects the original `n1.start` cap with outward normal −X. Offset face reports the previous multiple-loop refusal, disables Apply and preserves the document.
- **PASS — independent native geometry.** The 10 mm inlet on the R20 quarter bend and 14 mm outlet moves from x = −10 mm to −14 mm or −6 mm at +4 or −4 mm. The net area is 32 mm² and the material change is ±128 mm³. Both mouths keep their two distinct apertures. All 24 tangent and charted edges and the exact retained boundaries of 25 faces survive. Native quadrature gives 1901.3096491487386 and 1645.3096491487358 mm³. Translated 30° and 120° cases cover radial X/Y and asymmetric, reordered lanes.
- **PASS — actual desktop Studio WebGPU and local Agent.** Numeric edit, collapse refusal, Undo, Redo, Save and fresh Open preserve the correct inlet. The saved History handle previews −6 mm, cancels without changes and applies with the same geometry as numeric entry. Fresh Open reproduces x = -4 mm and volume 1581.3096491487368 mm³. A local Agent dry run preserves the source and explicit Studio approval reproduces the native edited body SHA-256 `820dae4a53f3559b95a005c9911699f2e43036f24adf6496ee69e50602b10089`.
- **PASS — affected checks and controls.** 420 Kernel, 126 Model and 41 Studio tests, scoped ESLint, Kernel and Model types, Studio type check and production build and Git diff check pass. 41 desktop snapshots have unchanged source capsules and no console or page errors. The arc-first outlet and the original two-ended outlet handle retain their native digests. The two-ended pending review retains its native digest and both PNGs.
- **FAIL — corrected test expectation.** The first Model run passed 125 of 126 tests. The unsupported arc-first start returned the existing cardinal prism or cylinder cap refusal. The test now checks that actual refusal and source retention.
- **FAIL — inherited kernel code-shape check.** Spread-minmax counts remain 3, 3 and 2 in cylindrical-bore, thicken-cylinder and thicken-planar.
- **NOT_RUN.** Full local suites, other viewport backends, mobile, STEP exchange, live providers and pending Agent image review for the new inlet Offset. First mechanical CAD remains at 8/10 accepted. Overall completion is unmeasured. Issue #17 remains open for wider direct face editing.

## Reproduction

Use Node 22.19.0, the heavy gate, installed desktop Chrome and Playwright and external output directories. Add `--expect-refused` to the inlet command on base sources.

```sh
pnpm --dir packages/barocss-cad build:library
node --test --test-concurrency=1 packages/barocss-cad/test/*sweep*.test.mjs packages/barocss-cad/test/{bored-cap-offset,drafted-cap-offset,exact-cylinder-cap-offset,prism-wall-offset,edge-continuity}.test.mjs
TEST_CONCURRENCY=1 pnpm --dir packages/barocss-cad-model test paired-elbow-outlet-offset-handle paired-elbow-outlet-offset-evidence paired-line-arc-duct-evidence native-offset-face offset-face-native native-offset-result offset-to-plane offset-bored-cap offset-drafted-wall offset-exact-cylinder-cap offset-hexagonal-wall agent-offset-wall toolset tool-contract
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test offset-cap-feedback offset-plane-pick-feedback history-feature-editor command-build-failure tool-contract-mcp
pnpm --dir packages/barocss-cad type-check
pnpm --dir packages/barocss-cad exec eslint src/brep/exact-sweep.ts
pnpm --dir packages/barocss-cad-model exec eslint src/app/{nativeOffsetFace,pairedElbowOutletOffsetHandle}.ts src/chat/part/features.ts src/engine/{doc,errors}.ts test/paired-elbow-outlet-offset-handle.test.ts
pnpm --dir packages/barocss-cad-model type-check
D1808_SOURCE_FROZEN=1 node apps/cad-studio/test/offset-paired-elbow-outlet-browser.mjs "$OUT/inlet" --inlet
D1805_SOURCE_FROZEN=1 node apps/cad-studio/test/offset-paired-elbow-outlet-browser.mjs "$OUT/arc-first-outlet" --arc-first
D1788_SOURCE_FROZEN=1 node apps/cad-studio/test/offset-paired-elbow-outlet-browser.mjs "$OUT/control-handle" --history-handle
D1788_SOURCE_FROZEN=1 node apps/cad-studio/test/offset-paired-elbow-outlet-browser.mjs "$OUT/control-review" --review-outlet
pnpm --dir apps/cad-studio build
node packages/barocss-cad/scripts/code-shape.mjs --check
git diff --check
```
