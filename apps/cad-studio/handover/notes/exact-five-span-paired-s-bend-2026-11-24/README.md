# D1819 — Add a straight outlet to the paired Exact Sweep S-bend

P5 advanced modeling and native reference accuracy, rows 07 and 16. [Issue #10](https://github.com/barocss/cad/issues/10). Base `01bcac45e5da7990904f5b026caf7ceeaf695865`.

Accept one planar quadratic lead, circular bend, spacer, opposite-turn circular bend and outlet. Both ends are original tangent straight spans. The section uses an aligned rectangle and two independent, radially centered rectangular passages. The ordinary Sweep command, History and local Agent use the same Exact mode and saved rail.

- **PASS — actual original refusal.** The prior Studio classifies the five authored spans as a single circular arc and rejects its two passages. Apply is disabled, and the source remains exact.
- **PASS — analytical separation and native geometry.** Reuse the four-span producer and join one straight outlet in the terminal frame. Certify the inlet versus the second bend and the outlet versus the first bend on the corresponding half-angle tangent planes. For the two ends, the larger bend gives a forward projection at least one half. Each support gap is at least `2(R−h) sin(θ/2) + L cos(θ/2)`, where `h` is radial half-width and `L` is the spacer length. Keep the existing tolerance and refuse unresolved overlap. The fixture has one genus-two shell, 62 faces, 66 loops, 264 coedges, 132 edges and 72 vertices. Each of the 48 internal join edges has two native charts. Both terminal loops retain all 12 edge pairs per end. The maximum measured chart gap is 1.0658141036401503e-14 mm.
- **PASS — actual Studio and local Agent.** Apply the R12/R18 S-bend with a 10 mm lead, 8 mm spacer and 6 mm outlet. Confirm the two mouths, terminal normals and all 48 joins. Narrow the first opening from 2 × 2 to 2 × 1 mm while preserving the second opening and native IDs. Eccentric and touching edits refuse. Undo, Redo, Save and fresh Open restore the corresponding exact bodies. Local Agent dry run, pending preview, explicit Studio Accept and fresh Open reproduce the original native body. The new and control runs record 35 checkpoints with zero source changes or browser errors.
- **PASS — affected checks.** 265 Kernel, 79 Model and 14 Studio tests. Kernel library build, Kernel/Model/Studio types, scoped ESLint, Studio build and browser driver syntax pass. The four-span opposite-turn Studio control reproduces both original D1812 native hashes for its original and edited section.
- **FAIL — corrected regressions in verification.** The first baseline driver used the wrong accessible Browser name. The first kernel run rejected an existing unrelated five-quarter-circle path with the new five-span message, because the recognizer claimed every 11-pole path. Require a straight lead weight before claiming the route. The existing refusal and all 265 affected tests pass on rerun.
- **FAIL — inherited code-shape gate.** The unchanged spread-minmax counts remain above baseline by 3 in cylindrical-bore, 3 in thicken-cylinder and 2 in thicken-planar.
- **NOT_RUN.** Pending Agent image review on the new route, downstream Booleans or Fillet, full local suites, alternate backends, STEP, mobile and live providers. Issue #10 retains its wider path and frame scope. First mechanical CAD remains 8/10 accepted. Overall CAD completion remains unmeasured.

The independent original path length is `24 + 15π` mm. Its lead and outlet centers are (−10, 0, 0) and (36, 38, 0) mm, with outward normals −X and +X. Its independent unedited centroid is `[(270π+64)/(24+15π), (252π+536)/(24+15π), 0]` mm.

| First opening | Analytic volume (mm³) | Native quadrature volume (mm³) | Native body SHA-256 |
| --- | --- | --- | --- |
| 2 × 2 mm | 2275.9644737231006 | 2275.9644737230983 | `f2a1809523c880f60f1dd5cefcaf530b103dea69c3404d13a5798c3b7afd0c2b` |
| 2 × 1 mm | 2418.2122533307943 | 2418.2122533307866 | `f3a89a7ee4a48e2e5b1b746e1297cb7f5453e5568f28b9edbcb4770f3c9f9487` |

## Reproduction

Use Node 22.19.0, the heavy gate, installed desktop Chrome and Playwright and external output. Append two control points `[33,38,0]` and `[36,38,0]` to the [D1812 rail](../exact-four-span-paired-s-bend-2026-11-23/README.md). Use weights 1 at those points and endpoint knot sequence `[4,4,5,5,5]` after the spacer and bend knots. The baseline shows the one-circular-hole refusal on that input.

```sh
pnpm --dir packages/barocss-cad build:library
node --test --test-concurrency=1 packages/barocss-cad/test/*sweep*.test.mjs packages/barocss-cad/test/edge-continuity.test.mjs
TEST_CONCURRENCY=1 pnpm --dir packages/barocss-cad-model test sweep-history-edit sweep-agent-remap sweep-path-history paired-spaced-arc-duct-evidence rectangular-duct-proposal-review toolset tool-contract
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test sweep-path-geometry sweep-path-feedback edge-continuity-scope command-build-failure tool-contract-mcp
pnpm --dir packages/barocss-cad type-check
pnpm --dir packages/barocss-cad-model type-check
pnpm --dir apps/cad-studio type-check
pnpm exec eslint packages/barocss-cad/src/brep/exact-sweep.ts packages/barocss-cad/test/exact-spaced-paired-duct-sweep.test.mjs packages/barocss-cad-model/src/{app/profileCommands,engine/errors,chat/part/features}.ts apps/cad-studio/test/{sweep-path-geometry.test.ts,exact-line-arc-paired-duct-browser.mjs}
node --check apps/cad-studio/test/exact-line-arc-paired-duct-browser.mjs
pnpm --dir apps/cad-studio build
node packages/barocss-cad/scripts/code-shape.mjs --check
D1819_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-line-arc-paired-duct-browser.mjs "$OUT/studio" --lead-outlet
D1812_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-line-arc-paired-duct-browser.mjs "$OUT/control" --lead-opposite
git diff --check
```
