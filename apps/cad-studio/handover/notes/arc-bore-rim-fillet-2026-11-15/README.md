# D1302 — Fillet the start rim of a circular Sweep bore

2026-11-15 · FEATURE · P5, rows 07 and 30

Studio displays the two native semicircles of the start rim as one selectable circle. The kernel grouped those semicircles as a closed-form tool before it checked the support axes. The plane and bore torus have different axes. That grouping skipped one of the two arcs and the fillet refused the remaining open input. A full circular fillet now uses closed-form grouping only when each support pair qualifies. The existing rolling-ball fitter receives the entire noncoaxial ring. The result uses fitted native B-rep patches. The Chamfer path keeps its existing admission.

- **PASS — desktop Studio WebGPU.** A pointer click on the start rim selected both native edge names in the Fillet preview. Radius 10 mm was refused with Apply disabled and the source part preserved. Radius 0.20 mm applied. History edit to 0.25 mm, Undo, Redo, native Save and fresh Open passed. Local MCP read back the edited feature and reported 4281.483 mm³ from the saved file.
- **PASS — native geometry.** Both results are one strict genus-1 solid and retain an inner loop on each cap. At 0.20 mm the fitter used 252 stations and 10 patches. At 0.25 mm it used 204 stations and eight patches. Over both radii, the maximum sampled edge-to-surface gap was 3.89e-8 mm, the fitter's maximum contact error was 3.99e-8 mm, and its maximum section error was 4.98e-8 mm. The independent plane and torus contact equations verify the new edge owners and both sides of the fitted blend at 13 points per contact edge. Independent divergence integration of the ideal rolling-ball envelope agrees with the native volumes, 4281.516087405 and 4281.483417170 mm³, within 3.59e-8 mm³.
- **PASS — focused regressions.** 15 Kernel tests and 19 Model tests passed. Controls include plane/cylinder and coaxial fillets, existing general closed chains, radius refusal, and the public variable radius history. Kernel and Model type checks, Kernel fast build and code shape, scoped lint and Studio production build passed.
- **FAIL, corrected — desktop driver.** The first run expected two independently pickable display edges. Both halves share one display edge. The final run uses one pointer pick and verifies both native names through the HUD and committed feature.
- **FAIL — existing robot contact assertion.** The broad Model filter `sweep` also ran `robot-sweep-budget`. Its exact equality assertion expected contact at `s=0.0390231616736922` and measured `0.03902333010941327`. Rebundling that test with the untouched baseline `7902b30db` version of the one modified product source reproduced the same value and failure. The contact still identifies `post` and `b` at 80 samples. This delivery leaves robot motion code and assertions in place.
- **NOT_RUN.** The cut rim from D1301, variable-radius noncoaxial fillets, WebGL2, mobile, hosted inference and full local suites. The reopened solid still shows faceting. Display refinement has a separate next step. Wider Sweep acceptance remains open in [#10](https://github.com/barocss/cad/issues/10).

## Commands and evidence

Node 22.19.0. The heavy gate serialized the checks. The passing Studio run matched all 907 frozen sources after cleanup, with zero page errors, console errors or observed worktree changes.

Receipt SHA-256 `2e167adc37c83ed7d386ddf32701a57951d3fa578633167b031c11736132dbdc`. Native Save SHA-256 `fe949a8a3f6587ed95eb679c23f99cedb7d2594001498481ce4305b9fbc4555b`.

```sh
pnpm --filter @barocss/cad type-check
(cd packages/barocss-cad && node scripts/tool.mjs build:fast && node scripts/code-shape.mjs --check)
node --test --test-concurrency=1 packages/barocss-cad/test/{arc-sweep-bore-fillet,r10-1,r10-2,r10-b}.test.mjs
pnpm --filter @barocss/cad-model type-check
TEST_CONCURRENCY=1 pnpm --filter @barocss/cad-model test api-face-fillet api-variable-fillet finish-limits arc-sweep sweep-agent-remap
D1302_SOURCE_FROZEN=1 node apps/cad-studio/test/arc-bore-fillet-browser.mjs <external-evidence>
pnpm exec eslint packages/barocss-cad/src/blend/edge-finish.ts packages/barocss-cad/test/arc-sweep-bore-fillet.test.mjs apps/cad-studio/test/arc-bore-fillet-browser.mjs
pnpm --filter @barocss/cad-studio-app build --outDir <external-build>
git diff --check
```
