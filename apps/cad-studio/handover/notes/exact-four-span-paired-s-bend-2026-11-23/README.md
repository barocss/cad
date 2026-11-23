# D1812 — Sweep paired passages through a four-span S-bend

P5 advanced modeling and reference accuracy, rows 07 and 16. [Issue #10](https://github.com/barocss/cad/issues/10). Base `e95ed14f87e3ca7e6ac2d77df2d05bc13f9a19bc`.

Allow a planar linear lead, circular arc, straight spacer and opposite-turn circular arc for a bend-aligned rectangle with two radially centered openings. Reuse the D1810 lead join and the D1792 S-bend producer. Every join requires a common forward tangent. The kernel accepts the rail only if an analytical bound proves separation between the straight inlet and the second bend with the existing precision margin.

- **PASS — original refusal reproduced.** Desktop Studio reads the authored four spans and selects Exact Sweep. It reports the previous same-turn requirement, disables Apply and preserves the source.
- **PASS — independent native geometry.** For a 10 mm lead, 8 mm spacer and R12/R18 quarter arcs, the two cap centers are (−10, 0, 0) and (30, 38, 0) mm, with outward −X and +X normals. The solid has one genus-two shell, 50 faces, 54 loops, 216 coedges, 108 edges and 60 vertices. All 36 internal tangent edges have two charts. The lead cap has 12 paired charts and the revolved cap has its exact planar loops. Tests cover both radial axes, both turn polarities, radius order, oblique angles, rounded weights, individual passage editing, unchanged native ownership and unsupported source retention.
- **PASS — actual Studio desktop Chrome WebGPU and local Agent.** Apply the S-bend, inspect all 36 tangent joints and check both ends. Narrow the first passage from 2 × 2 to 2 × 1 mm and retain the other passage. Eccentric and touching edits refuse. Undo, Redo, Save and fresh Open reproduce the intended result. Local Agent validation, explicit Studio Accept and fresh Open reproduce the original native body.
- **PASS — affected checks and controls.** 260 Kernel, 73 Model and 13 Studio tests, Kernel library build, scoped ESLint, Kernel and Model types, Studio types and production build, browser driver syntax and Git diff check pass. The four updated desktop runs contain 62 checkpoints with zero source changes or browser errors. The same-turn four-span and opposite-turn three-span controls reproduce the recorded native and Agent image hashes. The closed-circle control reproduces the D1770 native hashes.
- **FAIL — inherited code-shape check.** The unchanged spread-minmax counts exceed the baseline by 3 in cylindrical-bore, 3 in thicken-cylinder and 2 in thicken-planar.
- **Observed Inspector labeling.** The selected exact body shows `Faces 32` in the Inspector. That row uses the display mesh face count. The independently checked B-rep has 50 faces. D1813 addresses the ambiguous label.
- **NOT_RUN.** Pending Agent image review for the new opposite-turn route, downstream operations, full local suites, alternate viewport backends, mobile, STEP and live providers. The first mechanical CAD baseline remains 8/10 accepted. Overall completion remains unmeasured. The wider path and frame scope of #10 remains open.

Let `h` be the radial half-width and `γ` half the first turn angle. On the first bend's half-angle tangent axis, the gap between the maximum lead support and the minimum opposite-turn second-bend support is at least `2(R1−h) sin γ + L cos γ`. The fixture has a gap of 14√2 mm. For length `ℓ = 18 + 15π` mm and the original 32 mm² net area, the independent centroid is `[(270π−134)/ℓ, (252π+308)/ℓ, 0]` mm. Native quadrature agrees. Maximum measured chart gap is 1.0658141036401503e-14 mm.

| First passage | Independent volume (mm³) | Native volume (mm³) | Native body SHA-256 |
| --- | ---: | ---: | --- |
| 2 × 2 mm | 2083.96447372310 | 2083.9644737230897 | `7dddf8c18a08523f7f9bf6d7ee9f44dc5f9012ac5b7d3b9c3e4d4c656c112acf` |
| 2 × 1 mm | 2214.21225333079 | 2214.2122533307897 | `27c22c9fe0ed68cfd37a3f927d72e4c79149c395807bc333a3b8ccfee37d8a7f` |

## Reproduction

Use Node 22.19.0, the heavy gate, installed desktop Chrome and Playwright and external output directories. The fixture changes the last control point of the [D1810 rail](../exact-four-span-paired-duct-sweep-2026-11-23/README.md) to `[30,38,0]`. On the base source, open that sketch and rail, select Exact and expand Kernel detail to read the same-turn refusal.

```sh
pnpm --dir packages/barocss-cad build:library
node --test --test-concurrency=1 packages/barocss-cad/test/*sweep*.test.mjs packages/barocss-cad/test/edge-continuity.test.mjs
TEST_CONCURRENCY=1 pnpm --dir packages/barocss-cad-model test sweep-history-edit sweep-agent-remap sweep-path-history paired-spaced-arc-duct-evidence rectangular-duct-proposal-review toolset tool-contract
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test sweep-path-geometry sweep-path-feedback edge-continuity-scope command-build-failure tool-contract-mcp
pnpm --dir packages/barocss-cad type-check
pnpm --dir packages/barocss-cad-model type-check
pnpm exec eslint packages/barocss-cad/src/brep/exact-sweep.ts packages/barocss-cad/test/exact-spaced-paired-duct-sweep.test.mjs packages/barocss-cad-model/src/{chat/part/features,engine/errors}.ts apps/cad-studio/test/exact-line-arc-paired-duct-browser.mjs
node --check apps/cad-studio/test/exact-line-arc-paired-duct-browser.mjs
D1812_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-line-arc-paired-duct-browser.mjs "$OUT/studio" --lead-opposite
D1811_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-line-arc-paired-duct-browser.mjs "$OUT/four-span-same-turn" --lead-same-turn --review
D1794_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-line-arc-paired-duct-browser.mjs "$OUT/three-span-opposite" --spaced-opposite --review
D1770_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-closed-paired-cavity-sweep-browser.mjs "$OUT/closed-control"
pnpm --dir apps/cad-studio build
node packages/barocss-cad/scripts/code-shape.mjs --check
git diff --check
```
