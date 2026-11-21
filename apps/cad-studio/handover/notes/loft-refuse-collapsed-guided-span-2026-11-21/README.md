# D1517 — Refuse a copied Loft guide that collapses a four-sided span

P5, row 07, [#630](https://github.com/barocss/cad/issues/630). Base `d4ae73d8f7abb164ef17146e0b55d82124bbd701`.

Two 10 × 6 mm rectangular sections lie 10 mm apart, centred at (13, −8). A guide pairs opposite corners across the span. Before the fix, actual Studio accepted this result in both creation and History. All four corner rulings met at (13, −8, 5). The result reported 200 mm³ and one closed solid. A strict native read refused its face loops.

After the NURBS guide sets the corner order, the ruled Loft checks each span with four paired straight sides. The displacement from the guide is the same for every point at the same height. It cancels when comparing the corner midpoints. The kernel refuses a section whose midpoints coincide within the native linear tolerance and reports the adjacent station numbers. The comparison uses local profile size. Studio uses the existing preview and History error notice.

## Verification

- **PASS, desktop Studio.** The 180° guide produced the invalid B-rep on the parent. The fixed creation preview refuses it and disables Apply. Enter leaves the original sketches and document exact. History refuses the same guide and leaves the accepted Loft exact. Undo and Redo still return the expected states. The straight guide gives one strict closed solid at 600 mm³. Save and fresh Open keep its native digest exact.
- **PASS, positive controls.** Actual Studio creates the 179° guide as one strict closed solid at 200.03046096454935 mm³. Its smallest corner midpoint gap agrees with 6 × cos(179°/2), about 0.05236 mm, within 1e-8 mm. The five-section +360° and −360° desktop workflow stays valid through its existing guide change and native reopening.
- **PASS, local checks.** 97 Kernel tests, 29 Model tests, scoped lint, Kernel build, Model and Studio types, Studio build, syntax and Git diff. The focused Kernel cases cover an invalid middle span between translated rotated sections, valid unguided pairing and signed ±179° and ±179.9999° controls.
- **NOT_RUN.** Other collapse families, arbitrary cross-section self-intersection discovery, legacy files containing the invalid accepted output, full local suites, STEP and mobile. #630 remains open.

Use Node 22.19.0 and installed desktop Chrome and Playwright. Gate heavy work. Freeze sources during desktop execution and keep evidence outside Git.

```sh
pnpm --filter @barocss/cad build:library
node --test packages/barocss-cad/test/{loft-nurbs-guide,loft-two-guides,oriented-loft,loft-guide-control-range,loft-multi-conic}.test.mjs
node packages/barocss-cad-model/scripts/test.mjs loft-guide-command loft-section-history-edit api-loft-guide error
pnpm exec eslint packages/barocss-cad/src/features/loft.ts packages/barocss-cad-model/src/engine/errors.ts
pnpm --filter @barocss/cad-model type-check
pnpm --filter @barocss/cad-studio-app build
node --check apps/cad-studio/test/loft-collapsed-span-browser.mjs
git diff --check
cd apps/cad-studio
LOFT_COLLAPSE_SOURCE_FROZEN=1 node test/loft-collapsed-span-browser.mjs "$EVIDENCE/baseline" --baseline
LOFT_COLLAPSE_SOURCE_FROZEN=1 node test/loft-collapsed-span-browser.mjs "$EVIDENCE/candidate"
LOFT_FULL_TURN_SOURCE_FROZEN=1 node test/loft-full-turn-sections-browser.mjs "$EVIDENCE/full-turn-control"
```
