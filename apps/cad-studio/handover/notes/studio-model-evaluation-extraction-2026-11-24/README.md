# D1897 — Extract Studio Model evaluation from App

P4 [row 15](../../roadmap-rows/15.md) and [row 21](../../roadmap-rows/21.md), [#44](https://github.com/barocss/cad/issues/44). Base `11388463aefbf9b55323b8188239a11edb949697`.

Move evaluation ownership, candidate staging, accepted-result installation and preview ownership to `useStudioModelEvaluation`. Keep the three effects at the same point in App with the same dependencies. Deferred getters preserve the current stored body and evaluation identities. App keeps commit, History traversal, visible controls and Worker restart. App goes from 2,663 to 2,556 lines and from 221,027 to 213,002 bytes.

- **PASS, actual desktop parameter retry.** Four states before and four after match in document, bodies, History and selection. At 1024 and 1440 px the 0 mm width refuses and the first valid 50 or 60 mm submission succeeds. Computed volume is 5,000 or 6,000 mm³. Bindings, configuration and Undo/Redo pass.
- **PASS, actual desktop Worker Stop.** Five states before and five after match in document, bodies, selection, History and Undo/Redo. A test-only FIFO holds the authentic Box result and its mass messages. Stop terminates the claimed Worker, discards both messages and restores the original 4,000 mm³ stock. Redo on the new Worker produces 1,000 and 4,000 mm³. Undo restores the stock.
- **PASS, affected checks.** 63 Studio tests, type check, scoped lint, browser syntax, Studio production build and Git diff check.
- **FAIL, combined browser fixture on the unchanged base.** The legacy starter label check and the recovery precondition fail before the Stop steps. The first isolated harness also used the Extrude dialog locator for Box. The final isolated flow passes both before and after the extraction.
- **NOT_RUN.** Whole local suites, all branches of the evaluation hook and mobile. #44 remains open for its wider checklist. First mechanical CAD remains 8/10. Whole-product completion is unmeasured.

```sh
pnpm --dir apps/cad-studio test evaluation-evidence candidate-references stop-work-ownership command-apply-queue parameter-height-finish parameter-pattern-hole-spacing
PARAMETER_RETRY_SOURCE_FROZEN=1 node apps/cad-studio/test/parameter-geometry-retry-browser.mjs "$OUT/after-param"
D1897_SOURCE_FROZEN=1 node apps/cad-studio/test/model-evaluation-stop-browser.mjs "$OUT/after-stop-framed"
pnpm --dir apps/cad-studio type-check
pnpm --dir apps/cad-studio build
git diff --check
```
