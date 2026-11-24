# D1959 — Restore the Sweep selection-order regression

P1 [row 7](../../roadmap-rows/07.md) and [row 16](../../roadmap-rows/16.md). [#10](https://github.com/barocss/cad/issues/10). Base `1cde337d2eaf6b0ffdca215a3e68c1a60aea9ce8`. Small test-only correction.

The regression now reads the current Sweep defaults. It checks the Path label `Line` and the separate Solid label `Faceted`. It continues to test an explicitly chosen older sketch and refuses missing, hidden and ambiguous sources.

- **FAIL, original expanded run.** The assertion expected the old combined label. It failed before testing the saved sketch ownership and the three refusal cases. The same failure reproduced with the exact pre-D1958 engine module.
- **PASS, desktop Studio.** Choose the older R3 sketch and its 32 mm rail in both orders with a newer R6 sketch and a second rail available. The preview shows the same two labels. Apply, Undo and Redo keep the same explicit input owner in both runs. Native Save and fresh Open pass.
- **PASS, independent inspection.** Both input orders and fresh Open have byte-identical inspection records. The single validated body has stations 0 and 32 mm and two 32-point rings at radius 3 mm. The saved Sweep uses the default mode. The Kernel classifies its straight polygonal supports as planar.
- **FAIL, corrected driver assertion.** The first desktop run expected the internal Kernel representation to equal the command's Faceted label. The driver now checks the saved mode, actual command label and native planar representation individually.
- **PASS, affected checks.** The expanded Model group now passes 75/75. Scoped ESLint and diff check pass.
- **NOT_RUN.** Full local suite, additional Sweep modes and mobile. #10 remains open. First mechanical CAD remains 8/10 accepted. Overall CAD stays unmeasured.

```sh
node packages/barocss-cad-model/scripts/test.mjs profiles-parameters face-end-extrude face-commands
D1167_SOURCE_FROZEN=1 node apps/cad-studio/test/sweep-input-order-browser.mjs "$OUT/studio-final"
pnpm exec eslint packages/barocss-cad-model/test/profiles-parameters.test.ts apps/cad-studio/test/sweep-input-order-browser.mjs
git diff --check
```
