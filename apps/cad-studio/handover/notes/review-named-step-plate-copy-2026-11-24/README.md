# D1842 — Review an editable STEP copy and include named drivers

P5 [row 31](../../roadmap-rows/31.md) and P2 [row 13](../../roadmap-rows/13.md), [#320](https://github.com/barocss/cad/issues/320). Base `736a0005a9049ec293cd64092b38db96e40c3c40`.

Review prepares the certified D1841 copy in the existing STEP dock. It shows the file and proposed features before writing. Cancel discards the candidate. Open, document changes and superseded requests retire it. Save checks the accepted, evaluated and shown documents and the name again before writing. The regular numeric copy is the default.

The optional copy binds actual values in the existing Extrude and Hole features to `plateThickness`, `holeCentreX`, and `holeCentreY`. The worker rechecks exact submitted geometry for the bound graph before showing the option. The bore diameter remains a numeric Hole field.

- **PASS, desktop review.** The review starts without a download. Cancel keeps the source and writes nothing. A second ready review closes when a different STEP opens. The next review saves only after explicit Save copy. Unsupported plain stock and malformed LINE input show the failure in the dock with Save disabled.
- **PASS, native drivers.** A named copy opens with the same 11717.256661177 mm³ solid. Editing `plateThickness` from 10 to 16 mm retains the Ø6 bore and gives 18747.610657883 mm³. Editing the two named hole centre values from (11, 9) to (15, 12) leaves that volume and stock bounds within `1e-8`. Undo and Redo replay the parameter edit. Native Save and fresh Open retain the exact graph and all three bindings. After Open, 16 → 13 mm gives 15232.433659530 mm³ and preserves the shifted through bore. The original STEP bytes are unchanged.
- **PASS, affected checks.** 12 Model and 65 Studio tests, Model types, Studio types and production build, scoped ESLint and Git diff check. The Chrome WebGPU flow records 19 states. All 1,207 frozen files agree and page, console and source-change errors are zero. Focused checks cover stale pending and prepared replies, even before reconciliation and after cancellation.
- **FAIL, initial browser harness.** The old broad toast selector did not identify the Hole's inline refusal. The final flow asserts **The hole misses the body** in the editor and checks that Undo returns to the prior accepted geometry. This supplies the exact refusal signal for the numeric-copy control reused from D1841. The initial Studio type check also found a test assertion that narrowed the write list to an empty tuple. The final check passes.
- **NOT_RUN.** External STEP reader, stepped shaft, other STEP representations and units, automatic diameter binding, Agent execution, other GPU backends, mobile and full local suites. #320 remains open. First mechanical CAD remains 8/10. Whole-product completion remains unmeasured.

```sh
node packages/barocss-cad-model/scripts/test.mjs editable-step-copy step-units
pnpm --dir apps/cad-studio test editable-step-preparation step-export history-feature-editor work-ownership
D1842_SOURCE_FROZEN=1 node apps/cad-studio/test/editable-step-copy-browser.mjs "$OUT/studio"
pnpm --dir packages/barocss-cad-model type-check
pnpm --dir apps/cad-studio build
git diff --check
```
