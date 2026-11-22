# D1679 — Round both complete rims of a box-cut Exact Sweep half ring

2026-11-22 · P5 row 07 and kernel row 30 · [#10](https://github.com/barocss/cad/issues/10) · Base `183267dfba825ffa7c0898ff3db8838d154b33eb`

One constant circular Fillet expands one authored semicircle from each cap into two separate complete rims. Certify both rims and reject the singular or excessive radius before either rolling solve. The two fitted tool hulls have positive weights and lie strictly on opposite sides of the cap-center bisector. Each fitted contact retains its measured deviation. Keep exact parameter curves only on unchanged complete curves with both original charts. Fresh Open keeps the certified authored names and holds a cross-cap match.

- **FAIL, base.** Studio picked two native edges but its default 3 mm radius on the Ø4 part was still evaluating after 15 s. The standalone base kernel incorrectly accepted it after 1.88 s, returning two past-center fits and 756.708880806 mm³. A radius of 2 mm failed only after the first fit began. The base accepted valid 0.5 and 0.75 mm radii with four expanded edges but dropped the native chart bindings. The base Model reopened both authored halves as their siblings and marked both references re-matched.
- **PASS, actual desktop Studio WebGPU.** A canvas click and Shift-click pick one half from each cap. The preview names two picked edges and two tangent additions. The default 3 mm is refused in 237 ms in the recorded run. The 2 mm singular case also leaves the source document intact. Apply 0.5 mm, edit to 0.75 mm, edit the upstream diameter from 4 to 6 mm, Undo, Redo, Save and fresh Open. Both native bend seams still measure 0° in Studio. The accepted data, native digest and editable radius survive Open.
- **PASS, native geometry.** Strict checking reports one closed genus-zero shell. The two inherited seams keep all four native parameter-curve uses. Including both cap and torus contacts at each end, the maximum sampled contact error is 1.37e-07 mm, the ball-envelope error is 1.32e-07 mm and the maximum edge-to-surface gap is 5.03e-07 mm. The transverse centroid differs from the independent symmetric prediction by at most 2.74e-10 mm. The independent ideal rolling-ball flux is evaluated once per end. Native mass, quadrature and the Studio worker agree within 3e−6 mm³. The pre-solve guard refuses 2 and 3 mm with zero rolling refinement trace events. The Model regression verifies that a cross-cap saved signature holds the feature.
- **PASS, affected checks.** Kernel 50, Model 16 and Studio 54 tests. Kernel build and types, Model types, scoped lint, driver syntax, production Studio build with types and Git diff check pass. The final dual-rim run has 11 captures. The single-rim control has 11 captures and preserves all D1678 native result digests, volumes and topology. Both runs report zero source changes and zero page or console errors.
- **FAIL, inherited.** The aggregate kernel code-shape check reports the same excess as base in `cylindrical-bore.ts`, `thicken-cylinder.ts` and `thicken-planar.ts`.
- **NOT_RUN.** Full local suites, WebGL2, arbitrary oblique or offset cutters, unequal or variable rim radii, and the live provider. Keep #10 open.

| Stage | Tube diameter (mm) | Fillet radius (mm) | Native volume (mm³) | Independent volume (mm³) | Maximum sampled contact error (mm) |
| --- | --- | --- | --- | --- | --- |
| filleted | 4 | 0.5 | 788.296747608750 | 788.296748042618 | 7.95e-08 |
| edited | 4 | 0.75 | 786.791818566792 | 786.791819522988 | 1.37e-07 |
| enlarged | 6 | 0.75 | 1772.243424722470 | 1772.243426195449 | 1.22e-07 |
| reopened | 6 | 0.75 | 1772.243424722470 | 1772.243426195449 | 1.22e-07 |

## Reproduction

Use Node 22.19.0, the heavy gate, installed Chrome and Playwright, and output paths outside Git.

```sh
pnpm --dir packages/barocss-cad exec node scripts/tool.mjs build:fast
pnpm --dir packages/barocss-cad type-check
pnpm --dir packages/barocss-cad exec node scripts/code-shape.mjs --check
pnpm --dir packages/barocss-cad exec eslint src/blend/edge-finish.ts src/brep/exact-ring-intersect.ts test/exact-half-ring-fillet.test.mjs
node --test --test-concurrency=1 packages/barocss-cad/test/{exact-half-ring-fillet,exact-ring-intersect,exact-closed-circle-sweep,edge-continuity,edge-finish,arc-sweep-bore-fillet,face-fillet}.test.mjs
pnpm exec eslint apps/cad-studio/test/exact-half-ring-rim-fillet-browser.mjs packages/barocss-cad-model/src/engine/{evaluate,references}.ts packages/barocss-cad-model/test/half-ring-fillet-reference.test.ts
node --check apps/cad-studio/test/exact-half-ring-rim-fillet-browser.mjs
pnpm --dir packages/barocss-cad-model type-check
TEST_CONCURRENCY=1 pnpm --dir packages/barocss-cad-model test half-ring-fillet-reference edge-continuity sweep-path-history arc-sweep-exterior-detail api-variable-fillet
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test continuity-angle-label edge-continuity-scope fillet-family history-feature-editor
pnpm --dir apps/cad-studio build
D1679_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-half-ring-rim-fillet-browser.mjs "$OUT/verified" both-rims
D1678_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-half-ring-rim-fillet-browser.mjs "$OUT/single-rim-control"
git diff --check
```
