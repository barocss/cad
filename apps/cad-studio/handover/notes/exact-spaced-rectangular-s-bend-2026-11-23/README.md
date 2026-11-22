# D1736 — Sweep rectangular sections through a spaced S-bend

P5 Exact Sweep, rows 07 and 30. [Issue #10](https://github.com/barocss/cad/issues/10). Base `46395c479e4db2edae4f20c2832f58a2b249a558`.

Admit a bend-aligned solid rectangle or a rectangle with one centered aligned opening on a tangent arc–line–arc path that reverses the turn direction. The existing revolved bends and straight prism carry the section. The strict body and chart checks, radius limits, straight-span minimum, roll and wall clearance checks remain in use. Studio and the local Agent disclose the supported sections.

- **FAIL, base capability.** Studio opens both supported 4 × 6 mm profiles on the R12/R18 quarter-bend path with an 8 mm straight span. Exact Sweep refuses them and keeps Apply disabled and the source intact.
- **PASS, desktop Chrome / WebGPU.** The solid preview and Apply produce eight native joins. Edit the width from 4 to 8 mm. The duct preserves both open ends and 16 joins after the opening changes from 2 × 4 to 2 × 2 mm. Both fixtures support Undo, Redo, Save, fresh Open, then a second edit. In the reopened duct the center rays reach the curved interior at X5.025885 and X24.111148 mm. The adjacent wall rays hit the caps at X0 and X30 mm. Studio measures all native join angles as 0°. The accepted fixtures match the local Agent path after explicit Studio approval. Prior same-turn rectangles and the opposite-turn annulus remain editable and reproduce their recorded native body hashes. The five final browser flows contain 71 checkpoints and zero source changes.
- **PASS, independent native geometry.** Strict checks confirm one genus-zero solid with planar caps and one genus-one solid with two perforated caps. The solid has 14 faces and 28 edges. The duct has 26 faces and 56 edges. Native pcurves, reciprocal coedges, wall radii, signed curvature and independent inertia pass at both joins. Oblique cases cover 30° and 120° bends and a 0.00011 mm straight span. The quarter-bend centroid is [13.863862278019273, 19.949269774280065, 0] mm. The viewport captures show tessellated arc silhouettes.
- **PASS, affected checks.** 130 kernel, 8 Model and 9 Studio tests. Kernel build:fast, full kernel library build, Kernel and Model types, scoped ESLint, Studio production build and types, browser driver syntax and Git diff check.
- **FAIL, recovered test setup.** An adjacent circular Sweep test still expected the newly admitted aligned rectangle to fail. Replace that assertion's input with a triangle and retain typed refusal coverage. The annular desktop control also caught a change to the existing Agent description of the circular section. The final description retains that text and adds the aligned rectangle.
- **FAIL, inherited aggregate lint.** The kernel code-shape check reports unchanged `cylindrical-bore.ts` (3), `thicken-cylinder.ts` (3), and `thicken-planar.ts` (2) spreads. Scoped lint passes.
- **NOT_RUN.** Full local suites, arbitrary profiles and fitted paths, changing frame laws, WebGL2, mobile and live providers. First mechanical CAD remains 8/10. Overall completion is unmeasured. Issue #10 stays open.

The independent volume is section area × (15π + 8) mm³.

| Section | Independent volume (mm³) |
| --- | ---: |
| 4 × 6 mm solid | 1322.9733552923253 |
| 8 × 6 mm solid | 2645.9467105846506 |
| 4 × 6 mm duct, 2 × 4 mm opening | 881.9822368615503 |
| 4 × 6 mm duct, 2 × 2 mm opening | 1102.477796076938 |

The reopened solid measures 2645.94671058465 mm³ and the reopened duct measures 1102.4777960769377 mm³. The respective native hashes are `0dbd321478730ad68f606eb14a93be21aa490819380a609529babcaa9531bc00` and `46920d716dfc0f57f0d49e89fe252c1b7579706b95cc4173e8dde7a5822d75ef`. The maximum measured native angles are 1.80e-14° and 1.67e-14°.

## Reproduction

Use Node 22.19.0, the heavy gate, installed desktop Chrome and Playwright, and an external evidence directory.

```sh
node packages/barocss-cad/scripts/tool.mjs build:fast
pnpm --dir packages/barocss-cad type-check
pnpm --dir packages/barocss-cad exec tsc -p tsconfig.json
node --test --test-concurrency=1 packages/barocss-cad/test/{exact-rectangular-arc-line-arc-sweep,exact-arc-line-arc-sweep,exact-rectangular-opposite-arc-sweep,exact-rectangular-opposite-arc-duct-sweep,exact-opposite-arc-sweep,exact-rectangular-duct-sweep,exact-rectangular-elbow-sweep,exact-tangent-sweep,exact-elbow-sweep,exact-arc-sweep,exact-closed-circle-sweep,exact-straight-sweep,sweep-solid,sweep-mass-overlap}.test.mjs
D1736_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-rectangular-s-bend-browser.mjs "$OUT/solid" --spaced-opposite
D1736_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-rectangular-duct-sweep-browser.mjs "$OUT/duct" --spaced-opposite
D1732_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-rectangular-s-bend-browser.mjs "$OUT/control-solid" --spaced
D1733_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-rectangular-duct-sweep-browser.mjs "$OUT/control-duct" --spaced
D1723_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-spaced-s-bend-browser.mjs "$OUT/control-annular" --annular
TEST_CONCURRENCY=1 pnpm --dir packages/barocss-cad-model test arc-sweep-display sweep-path-history tool-contract-mcp
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test sweep-path-geometry sweep-path-feedback continuity-angle-label
pnpm --dir packages/barocss-cad-model type-check
pnpm --dir apps/cad-studio build
git diff --check
```
