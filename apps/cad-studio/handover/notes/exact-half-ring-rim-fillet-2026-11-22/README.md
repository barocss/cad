# D1678 — Keep one complete half-ring rim fillet editable and measure the opposite rim

2026-11-22 · P5 row 07 and kernel row 30 · [#10](https://github.com/barocss/cad/issues/10) · Base `651c89f6423753808c6cd55e9c81caed9673799c`

An external constant-radius Fillet on one complete transverse cap rim of the Exact Sweep half ring uses the existing fitted rolling-ball solver. The inward center locus collapses when the Fillet radius reaches the tube radius. The qualified native scope refuses that radius or a larger one before solving it. After a valid fit, restore parameter curves only for complete edges that retain the original coefficients, parameter direction and both owning charts. New fitted contacts retain their reported deviation. Fresh Open keeps the original authored semicircle name when the current native parent certifies that the matcher’s alternate belongs to the same complete cap and the stored signature agrees with that cap’s center. The existing serialized signature remains valid.

- **FAIL, base.** The desktop Fillet command defaults to 3 mm on the Ø4 mm tube. The base kernel took the wrong signed offset branch and returned a strict solid despite an invalid rolling-ball witness. The first browser run was still evaluating after 30 seconds. Editing to the valid 0.5 mm in a fresh browser flow stayed in Evaluating for 90 seconds. Isolated Model preview at 3 mm exceeded 20 seconds. A fresh 0.5 mm preview took about 0.99 seconds and a 2 mm preview refused in about 0.29 seconds. Native evaluation at 0.5 and 0.75 mm already produced a fitted solid, but the two untouched opposing rim edges and four other complete seams lost all 12 of their native parameter curves.
- **FAIL, first repaired reopen.** After the valid upstream Ø6 edit, native evaluation retained the correct Fillet, but Open suppressed it. Both halves on the chosen cap have identical endpoint midpoint signatures and the generic matcher chose their sibling name. The bounded verification now keeps the originally authored native half. The Model regression confirms that a signature from the other cap still holds the feature.
- **PASS, actual desktop Studio WebGPU.** One canvas click picks one half of the target rim. The preview reports both native halves in its final scope. Studio refuses its default 3 mm in 198 ms in the recorded run. It also refuses exactly 2 mm and keeps the source document. Apply 0.5 mm, edit to 0.75 mm, and edit the upstream Sweep from Ø4 to Ø6 mm. Undo, Redo, Save and fresh Open pass. Both unmodified opposite rim halves measure 90° before and after Open with eight native samples per measurement. The reopened fitted result has the same native digest and editable radius. The existing straight-inlet elbow Fillet retains its D1672 digests, volumes and topology.
- **PASS, native geometry and independent physical checks.** The valid fit retains one strict genus-zero shell and the other cap’s exact circular edges. The four complete retained bend seams measure 0°. Max sampled deviations in mm across the Studio fixtures are opposing rim 3.55e-15, original toroidal support 3.55e-15, new cap and torus contacts 1.37e-07, and rolling-ball envelope 1.28e-07. The largest reported fitted contact, section and solved-ball deviations are 1.42e-07, 1.42e-07 and 3.8e-11 mm. The largest reported normal deviation is 1.5e-05°. The strict edge-to-surface gap is at most 5.03e-07 mm. The independent volume integrates the flux of (x,0,0) over the initial toroidal strip and the fitted design’s ideal ball envelope. Native quadrature and the Studio worker agree with the oracle within 3e−6 mm³.
- **PASS, affected checks.** Kernel 48, Model 15 and Studio 54 tests. Kernel fast build and types, Model types, scoped lint, driver syntax, Studio production build with types and Git diff check pass. Two final desktop flows have 11 and 9 captures, zero source changes and zero page or console errors.
- **FAIL, inherited.** The aggregate kernel code-shape check reports the same excess as base in `cylindrical-bore.ts`, `thicken-cylinder.ts` and `thicken-planar.ts`.
- **NOT_RUN.** Full local suites, WebGL2, oblique or offset cutters, both caps rounded in one feature, and the live provider. Keep #10 open.

| Stage | Tube diameter (mm) | Fillet radius (mm) | Native volume (mm³) | Independent volume (mm³) | Maximum sampled transition error (mm) |
| --- | ---: | ---: | ---: | ---: | ---: |
| filleted | 4 | 0.5 | 788.932549818237 | 788.932550064883 | 7.95e-08 |
| edited | 4 | 0.75 | 788.180085289060 | 788.180085805069 | 1.37e-07 |
| enlarged | 6 | 0.75 | 1774.386108394823 | 1774.386109195767 | 1.22e-07 |
| reopened | 6 | 0.75 | 1774.386108394823 | 1774.386109195767 | 1.22e-07 |

## Reproduction

Use Node 22.19.0, the heavy gate, installed Chrome and Playwright, and output paths outside Git. The current driver asserts the corrected default radius and the final shape in the same actual Studio run.

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
D1678_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-half-ring-rim-fillet-browser.mjs "$OUT/verified"
D1672_SOURCE_FROZEN=1 node apps/cad-studio/test/elbow-inlet-fillet-browser.mjs "$OUT/elbow"
git diff --check
```
