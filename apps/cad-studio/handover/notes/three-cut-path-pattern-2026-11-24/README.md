# D1853 — Repeat the first of three cuts along a linked XY path

P1 [row 15](../../roadmap-rows/15.md) and [row 16](../../roadmap-rows/16.md), [#25](https://github.com/barocss/cad/issues/25). Base `c7b32b8503cb0288f89fd3be964b491ec500ee5e`.

All four cut patterns share the same limit of two consecutive newer Difference features. The Path pattern keeps fixed orientation and admits a complete open level path of native straight spans. Only the later target body is consumed. The original cutter, original linked curve, both later apertures and the new native face ownership remain.

- **PASS, native and Model.** Exact straight degree-one and degree-two encodings give the same analytic result. The native tests cover entire-path admission, signed incidence, both newer collisions, curved/nonlevel/closed input, the farther-source boundary and current-cutter curved and 3D controls. One local command uses the first feature ID, linked path ID and current document revision.
- **PASS, actual desktop Studio.** Sketch and Make curves author the three spans (0,0) → (34,0) → (34,18) → (0,18) mm. Pitch 20 mm adds apertures centred at (30,9) and (44,15) mm. Pitch 22 mm changes them to (32,9) and (44,19). Independent cap positions and material moments agree on 23,560 mm³, genus five and 26 native faces. Spacing 44 with Count 3 exceeds the path, spacing 32 collides with the third cut, and spacing 86 with Count 2 collides with the second cut at the endpoint. Each refusal preserves the accepted document and Undo label. Browser and History apply the same recipe. Edit, Undo, Redo, native Save and fresh Open preserve both reference owners and the exact curve. With four original cuts, choosing the first still refuses and leaves the latest-cutter control available. Three runs capture 27 states with zero source changes, page errors or console errors.
- **PASS, affected checks.** 66 Kernel, 49 Model and 9 Studio tests. Kernel library build, Kernel/Model/Studio types, Studio production build, scoped ESLint, browser syntax and Git diff check pass.
- **FAIL.** None in the affected checks.
- **NOT_RUN.** Whole local suites, previous reader execution, mobile, other renderers, live providers and arbitrary earlier cut geometry or ancestry. #25 remains open for the broader scope. First mechanical CAD remains 8/10 and whole-product completion remains unmeasured.

```sh
pnpm --dir packages/barocss-cad build:library
node --test --test-concurrency=1 packages/barocss-cad/test/{linear,rectangular,prior-rectangular,prior-linear,fill,prior-fill,curve,prior-path}-cut-pattern.test.mjs packages/barocss-cad/test/three-cut-feature-pattern.test.mjs
pnpm --dir packages/barocss-cad-model test rectangular-feature-pattern api-curve-feature-pattern quadratic-feature-pattern toolset tool-contract
pnpm --dir apps/cad-studio test command-build-failure tool-contract-mcp fill-pattern-candidate
D1853_SOURCE_FROZEN=1 node apps/cad-studio/test/prior-path-cut-pattern-browser.mjs "$OUT/studio" --three
D1832_SOURCE_FROZEN=1 node apps/cad-studio/test/prior-path-cut-pattern-browser.mjs "$OUT/direct-path"
HISTORY_CUT_SOURCE_FROZEN=1 node apps/cad-studio/test/history-cut-source-browser.mjs "$OUT/farther-path-refusal"
git diff --check
```
