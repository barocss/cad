# D1766 — Verify adjacent right and oblique Sketch Fillets

P1 Sketch workflow, row 09. [Issue #21](https://github.com/barocss/cad/issues/21). Base `eb3749cb0eea2ea942a388965941729cb5041f1d`.

Check an existing corner group where a right corner and a 143.13010235° corner share one 30 mm side. The supplied sketch has one pre-existing redundant constraint. Preserve both fixed vertices, the authored carrier angle and the straight remainder. The current product passes the selected case. Add its repeatable Studio driver.

- **PASS, actual desktop Studio WebGPU.** Select both points, open Fillet and request R24. The shared side would have −2 mm left. Studio disables Apply and retains the original outline and document. Request R6. Both rounds preview and apply in one action. Undo, Redo, Save and fresh Open reproduce the edited part.
- **PASS, selection and Agent parity.** On another Open of the source, select the three straight carriers and apply the same R6. The local Agent discovers both stable corner pairs, refuses R24 without writing, previews R6 and stages one explicit Studio approval. Both results and the reopened body match the two-point edit.
- **PASS, independent geometry.** The contacts are `[0,6], [6,0], [28,0], [31.6,1.2]`. Both native cylinders have radius 6 mm and centers `[6,6]` and `[28,6]`. The shared straight e1 retains 22 mm. The separated carrier rule preserves the 36.86989765° turn. The 10 mm Extrude has native volume 20,918.573538405875 mm³ and digest `f8f8dddb9c4b3abb0a336baac69b6e571d44f34396c95b38b3717f8a043fa92d`.
- **PASS, affected checks.** 50 Model tests, scoped ESLint, driver syntax and Git diff check. Two passing Studio runs record 14 checkpoints and zero source, page or console errors. Five independent reads match the native digest.
- **FAIL, recovered driver setup.** The first inspector preparation failed on an incorrect package import. The corrected driver completed both desktop runs.
- **NOT_RUN.** Full local suites and build, arbitrary mixed-corner groups, group handle dragging, alternate GPU backends, live providers and mobile. Issue #21 stays open for the broader sketch scope. First mechanical CAD remains 8/10. Whole-product completion is unmeasured.

## Reproduction

Use Node 22.19.0, the heavy gate, installed desktop Chrome and Playwright, and external evidence directories.

```sh
D1766_SOURCE_FROZEN=1 node apps/cad-studio/test/sketch-adjacent-oblique-fillet-browser.mjs "$OUT/base" --observe-base
D1766_SOURCE_FROZEN=1 node apps/cad-studio/test/sketch-adjacent-oblique-fillet-browser.mjs "$OUT/verified"
TEST_CONCURRENCY=1 pnpm --dir packages/barocss-cad-model test corner sketch-fillet-edit
pnpm exec eslint apps/cad-studio/test/sketch-adjacent-oblique-fillet-browser.mjs
node --check apps/cad-studio/test/sketch-adjacent-oblique-fillet-browser.mjs
git diff --check
```
