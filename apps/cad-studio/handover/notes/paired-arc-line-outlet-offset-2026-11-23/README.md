# D1805 — Move the straight outlet after an arc-first paired Sweep

P5 native direct face editing, rows 30 and 31. [Issue #17](https://github.com/barocss/cad/issues/17). Base `c0ada298cb6da13ba602dfe3d1421580971ec52d`.

Allow a signed Offset face on the original straight outlet of a paired arc–line Exact Sweep. Bind the selected native cap to the original rail and B-rep. Move the last two authored points to change the terminal straight length. Require stable native IDs and exact retained inlet, bend and tangent boundaries before returning a candidate.

- **PASS — original refusal.** Actual desktop Studio selects `n1.end` (outward −X). Offset face reports the old multiple-loop refusal, disables Apply and preserves the source.
- **PASS — independent native geometry.** A 4 × 10 mm section with two 2 × 2 mm passages has net area 32 mm². The R20 quarter bend and 10 mm straight outlet give a cap at x = −10 mm. A signed +4 or −4 mm move shifts it to x = −14 or −6 mm and changes volume by +128 or −128 mm³. The one genus-two shell retains 26 faces, 30 loops, 120 coedges, 60 edges and 36 vertices. Both apertures and all 12 charted joins persist. Native quadrature is 1453.309649148729 and 1197.3096491487277 mm³. Translated 30° and 120° cases in both radial axes pass with unequal passages and retained inlet and bend coefficients.
- **PASS — actual desktop Studio WebGPU and local Agent.** Pick the cap, apply a signed edit, refuse collapse at −10 mm, edit in History, Undo, Redo, Save and fresh Open. The refusal preserves the document and the Undo action. The saved cap handle previews −6 mm and preserves the retained body on Cancel. Apply, Undo, Redo, typed parity and fresh Open reproduce the moved cap at x = −4 mm, volume 1133.3096491487286 mm³ and native SHA-256 `c810c0196808a5e3f14f59f62b7eb793afb189542b53ab9ff30e0129cf7a3c53`. The Agent's refused and valid dry runs preserve the source. Explicit Studio Accept reproduces the manually edited body SHA-256 `e299366b4a53c4c8a325317ae352395b716edb8bbd58932218f88e4ffc1f1873`.
- **PASS — affected checks and controls.** 417 Kernel, 119 Model and 41 Studio tests pass. Kernel library build, scoped lint, Kernel and Model types, Studio type check and production build, browser-driver syntax and Git diff check pass. The five desktop flows record 37 snapshots with unchanged source capsules and no page or console errors. Original line–arc–line numeric edit, saved handle and pending review reproduce their prior native and PNG digests.
- **FAIL — inherited kernel code-shape check.** The spread-minmax counts stay at 3, 3 and 2 in cylindrical-bore, thicken-cylinder and thicken-planar.
- **NOT_RUN.** Full local suites, alternate viewport backends, mobile, STEP exchange, live providers and pending Agent image review for the new arc-first Offset. First mechanical CAD remains 8/10 accepted. Overall completion is unmeasured. Issue #17 remains open for wider direct face editing.

## Reproduction

Use Node 22.19.0, the heavy gate, installed desktop Chrome and Playwright, and external output directories. Add `--expect-refused` to the arc-first command on base sources.

```sh
pnpm --dir packages/barocss-cad build:library
node --test --test-concurrency=1 packages/barocss-cad/test/*sweep*.test.mjs packages/barocss-cad/test/{bored-cap-offset,drafted-cap-offset,exact-cylinder-cap-offset,prism-wall-offset,edge-continuity}.test.mjs
TEST_CONCURRENCY=1 pnpm --dir packages/barocss-cad-model test paired-elbow-outlet-offset-handle paired-elbow-outlet-offset-evidence paired-line-arc-duct-evidence native-offset-face offset-face-native native-offset-result offset-to-plane offset-bored-cap offset-drafted-wall offset-exact-cylinder-cap offset-hexagonal-wall agent-offset-wall toolset tool-contract
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test offset-cap-feedback offset-plane-pick-feedback history-feature-editor command-build-failure tool-contract-mcp
pnpm --dir packages/barocss-cad type-check
pnpm --dir packages/barocss-cad exec eslint src/brep/exact-sweep.ts
pnpm --dir packages/barocss-cad-model exec eslint src/app/pairedElbowOutletOffsetHandle.ts src/chat/{pairedElbowOutletProposalReview,part/features}.ts src/engine/doc.ts test/paired-elbow-outlet-offset-handle.test.ts
pnpm --dir packages/barocss-cad-model type-check
D1805_SOURCE_FROZEN=1 node apps/cad-studio/test/offset-paired-elbow-outlet-browser.mjs "$OUT/studio" --arc-first
D1788_SOURCE_FROZEN=1 node apps/cad-studio/test/offset-paired-elbow-outlet-browser.mjs "$OUT/control-original"
D1788_SOURCE_FROZEN=1 node apps/cad-studio/test/offset-paired-elbow-outlet-browser.mjs "$OUT/control-handle" --history-handle
D1788_SOURCE_FROZEN=1 node apps/cad-studio/test/offset-paired-elbow-outlet-browser.mjs "$OUT/control-review" --review-outlet
pnpm --dir apps/cad-studio build
node packages/barocss-cad/scripts/code-shape.mjs --check
git diff --check
```
