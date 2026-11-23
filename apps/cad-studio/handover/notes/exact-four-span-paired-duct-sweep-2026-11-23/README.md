# D1810 — Sweep two rectangular passages through four planar spans

P5 advanced modeling and reference accuracy, rows 07 and 16. [Issue #10](https://github.com/barocss/cad/issues/10). Base `b96def488cbbd4da3fb2307e856d9ab3c0d58e11`.

Support an exact straight lead, circular arc, straight spacer and second circular arc for a bend-aligned rectangle with two radially centered, disjoint rectangular openings. The spans are coplanar, both bends turn the same way and each join has a common forward tangent. Reuse the three-span paired-duct body and insert a native lead prism. Require a strict analytical separation bound for the lead and second bend before joining. A failed bound gives a refusal because separation is unproven. The existing tolerances and all other path classifiers stay fixed.

- **PASS — original refusal reproduced.** On the base source, actual desktop Studio opened the authored four-span rail. Exact Sweep reported the closed-circle tangent refusal, disabled Apply and preserved the source document. The first harness attempt used the wrong Browser locator. The corrected run reached the kernel diagnostic.
- **PASS — independent native geometry.** A 10 mm lead, 8 mm spacer and R12/R18 same-turn quarter arcs carry a 4 × 10 mm rectangle with two 2 × 2 mm apertures centered at Z −2 and +2 mm. The single genus-two shell has 50 faces, 54 loops, 216 coedges, 108 edges and 60 vertices. The inlet and outlet lie at (−10, 0, 0) and (−6, 38, 0) mm, each with two four-edge openings and an outward −X normal. All 36 internal edges have both native charts and the correct wall owners. The straight inlet has 12 paired charts and the revolved outlet retains its existing planar boundary with zero stored pairs. The independent support-plane separation is 14√2 mm. Reversed radius order, oblique angles, either radial axis, opposite-turn refusal, insufficient separation and unchanged closed-circle dispatch have focused kernel coverage.
- **FAIL — corrected initial test expectation.** Kernel tests initially passed 253 of 256. Three positive cases required stored chart pairs on the existing revolved outlet. The corrected tests require the exact outlet boundary and verify its zero stored pairs. They still require 36 charted internal edges and all 12 inlet pairs.
- **PASS — actual Studio desktop Chrome WebGPU and local Agent.** Apply the Sweep, inspect all 36 tangent joins and narrow the first aperture from 2 × 2 to 2 × 1 mm. The second aperture keeps its original dimensions and lane. Eccentric and touching apertures refuse without changes. Undo, Redo, Save and fresh Open preserve the correct state. Restoring the first aperture reproduces the original native hash. A local Agent dry run keeps the document source intact. Stage, explicit Studio Accept, Save and fresh Open reproduce the same original native result.
- **PASS — prior controls.** The same-turn three-span control reproduces native SHA-256 `3b3874616b42406e1d731d90851d412df222eaabbbd06d812f91949d9d6fe234` and both D1796 PNG hashes. The D1770 closed-circle control reproduces native SHA-256 `1f000a6990bfe2e0dd511e2ebd275bfafd318cee691a022749790e51aad4c6f5` and its edited hash. All three current Chrome runs record 45 checkpoints, zero source changes and zero browser errors.

- **PASS — affected checks.** 256 Kernel, 68 Model and 13 Studio tests pass. Kernel library build, scoped ESLint, Kernel and Model type checks, Studio type check and production build, browser driver syntax and Git diff check pass.
- **FAIL — inherited code-shape check.** The unchanged spread-minmax counts exceed the baseline by 3 in cylindrical-bore, 3 in thicken-cylinder and 2 in thicken-planar.

The length is 18 + 15π mm. For the original profile the net section area is 32 mm². The native centroid matches the analytical centroid `[(514+19/6−54π)/(18+15π), (252π+308)/(18+15π), 0]` mm. The largest measured internal chart gap in the Studio run is 7.944109290391274e-15 mm.

| First passage | Independent volume (mm³) | Native volume (mm³) | Native body SHA-256 |
| --- | ---: | ---: | --- |
| 2 × 2 mm | 2083.96447372310 | 2083.964473723095 | `6725e37a71bd69c6db8b770746ce6011b1e58a93ffb319529278d2f3171ff2a2` |
| 2 × 1 mm | 2214.21225333079 | 2214.212253330785 | `4e76f655acabfb2a5b65970569e3cdb6fd81948d584813375507d74481bd898b` |

- **NOT_RUN.** Pending Agent image review for the new four-span path, further downstream operations, full local suites, alternate viewport backends, mobile, STEP and live providers. Other path and frame laws remain open in #10. The first mechanical CAD baseline remains at 8/10 accepted. Overall CAD completion remains unmeasured.

## Reproduction

Use Node 22.19.0, the heavy gate, installed desktop Chrome and Playwright and external output directories. On the base source, open a rectangle sketch with `min=[-2,-5]`, `max=[2,5]` and the two rectangular apertures above. Select the sketch and Direct curve with these degree-two NURBS fields, start Sweep and select Exact.

```text
controlPoints = [[-10,0,0],[-5,0,0],[0,0,0],[12,0,0],[12,12,0],[12,16,0],[12,20,0],[12,38,0],[-6,38,0]]
knots = [0,0,0,1,1,2,2,3,3,4,4,4]
weights = [1,1,1,√0.5,1,1,1,√0.5,1]
```

```sh
pnpm --dir packages/barocss-cad build:library
node --test --test-concurrency=1 packages/barocss-cad/test/*sweep*.test.mjs packages/barocss-cad/test/edge-continuity.test.mjs
TEST_CONCURRENCY=1 pnpm --dir packages/barocss-cad-model test sweep-history-edit sweep-agent-remap sweep-path-history paired-spaced-arc-duct-evidence rectangular-duct-proposal-review toolset tool-contract
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test sweep-path-geometry sweep-path-feedback edge-continuity-scope command-build-failure tool-contract-mcp
pnpm --dir packages/barocss-cad type-check
pnpm --dir packages/barocss-cad-model type-check
pnpm exec eslint packages/barocss-cad/src/brep/exact-sweep.ts packages/barocss-cad/test/exact-spaced-paired-duct-sweep.test.mjs packages/barocss-cad-model/src/{app/profileCommands,chat/part/features,engine/errors}.ts apps/cad-studio/test/{sweep-path-geometry.test.ts,exact-line-arc-paired-duct-browser.mjs}
node --check apps/cad-studio/test/exact-line-arc-paired-duct-browser.mjs
D1810_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-line-arc-paired-duct-browser.mjs "$OUT/studio" --lead-same-turn
D1796_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-line-arc-paired-duct-browser.mjs "$OUT/three-span-control" --spaced-same-turn --review
D1770_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-closed-paired-cavity-sweep-browser.mjs "$OUT/closed-control"
pnpm --dir apps/cad-studio build
node packages/barocss-cad/scripts/code-shape.mjs --check
git diff --check
```
