# D1923 — Qualify manual extension role ownership

P2 [row 11](../../roadmap-rows/11.md), [#240](https://github.com/barocss/cad/issues/240). Base `ad0dbc71bd7efd2bbfdd5048490b0bf9051d3981`. Complete the original ordinary whole-part contract using the existing extension role, Save and Open paths. Production code and the file schema did not need a change.

- **PASS, source changes.** For a manual Top dimension between two named hole centres, Hide A stays on the original model witness. An actual edit to the A hole moves X40 to X44 and changes 18 to 22 mm without changing either saved reference or signature. Suppressing that hole leaves two visible alternatives. The original dimension is lost, its setting controls are disabled, and its SVG ink is absent. Undo restores the exact previous document and witness. Redo and native Open keep it lost. Unsuppress restores the original edited feature and witness.
- **PASS, owner and display.** Eleven Auto dimensions are generated without an extension setting, while the manual dimension keeps Hide A. Moving Top to Sheet 2 removes the dimension from the first sheet. At 1:2, inch primary and dual units, the text reads `.866 [22]`. Reversing the view mirrors the two paper positions and keeps the stored A and B references. After Save and fresh Open, the actual SVG ink matches. Hover highlights B at the original target, 11 paper mm from A. Show both restores both witnesses. A different document with the same dimension ID opens with both witnesses.
- **PASS, output.** Eighteen actual desktop checkpoints and 13 independent SVG checks. The Studio 3D annotation data loses exactly one extension and preserves all other fields, including both targets, both arrowheads and value text. The Model WebGPU viewport shows the retained annotation. The focused PDF writer test shows exactly one vector operator removed, with all other operators byte-equal. Original live R12 and R2000 readback remains recorded in D1922.
- **PASS, checks.** Seventeen Model tests, one Studio commit regression, scoped ESLint and diff check.
- **FAIL, earlier test oracles.** The unsigned fixture picked up ordinary geometry signatures during History editing. Sheet 2 selected its own automatic 2:1 scale. Plain inch formatting omits the leading zero. WebGPU exposes annotation text through its own overlay, and PDF stream coordinates use four decimals. The final checks use the signed fixture and the actual owner, format and consumer paths.
- **NOT_RUN.** Live PDF visual or standards qualification, the held ASME reference file, scoped output bodies, assembly and derived section/detail views, mobile and paid providers. First mechanical CAD remains 8/10. Overall completion is unmeasured.

```sh
D1923_SOURCE_FROZEN=1 node apps/cad-studio/test/drawing-extension-lifecycle-browser.mjs "$OUT/studio"
TEST_CONCURRENCY=1 pnpm --dir packages/barocss-cad-model test drawing-extension annotations3d
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test drawing-extension-commit
pnpm exec eslint apps/cad-studio/test/drawing-extension-lifecycle-browser.mjs packages/barocss-cad-model/test/drawing-extension.test.ts
git diff --check
```
