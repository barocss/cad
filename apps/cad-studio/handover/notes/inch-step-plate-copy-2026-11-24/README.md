# D1847 — Validate the active inch STEP conversion before reconstruction

P2 [row 13](../../roadmap-rows/13.md) and P5 [row 31](../../roadmap-rows/31.md), [#320](https://github.com/barocss/cad/issues/320). Base `73c24dd17c042bb0df15ffe6f5c7c97b794c124c`.

The bounded AP214 plate accepts a conversion-based inch unit only in the solid's active length context. The verifier follows the declared length dimensions and the referenced 25.4 mm measure to the exact SI millimetre basis. The uncertainty must reference the active inch unit. The three validated conversion records are consumed as part of this proof. Extra length definitions and unrelated conversion records still refuse admission.

The origin-pivot Scale ×25.4 belongs to the imported document. The separate native candidate contains the three ordinary features with physical mm dimensions. The raw geometric key normalizes only spatial points, vector magnitudes and length uncertainty. It preserves knots, weights, orientation, topology and reference sharing. It requires exact normalized binary64 geometry and rejects cases that would need a tolerance fit.

- **PASS, actual inch and mm sources.** Both files open in Chrome WebGPU. The writer-profile inputs represent a 40 × 30 × 10 mm plate with a Ø6 mm bore at (12, 9). Their strict native bounds, centroid and 11717.256661177 mm³ volume agree to `1e-8` in millimetre units. The constructed inch fixture divides each dimensional record using binary64 25.4 and links the active length unit and uncertainty to the validated conversion chain.
- **PASS, separate editable copy.** The actual CLI reports `in` and `mm` for the two sources. Their review IDs differ and their exact candidate bytes match. The Studio copy matches the CLI file. The existing thickness parameter changes 10 → 14 mm and keeps the bore. Save and fresh Open retain the three features and 16404.159325648 mm³. The STEP bytes stay unchanged.
- **PASS, refusal and regression.** Change the declared factor to 25 mm and keep the INCH name. Ordinary Studio Open still displays the file through its existing unit route. The editable review disables Save and the CLI refuses it. Focused tests refuse wrong length dimensions, measure type, SI basis, uncertainty, cycles, an extra unit and a non-invertible normalized geometry case. The centimetre product flow also passes again.
- **PASS, affected checks.** Kernel fast build, five Kernel, 24 Model and 23 Studio focused tests. Kernel, Model and Studio types, Studio production build, scoped ESLint and Git diff check. Two desktop runs give ten states, with 1,208 frozen files per run and zero page, console or source-change errors.
- **FAIL, initial type check.** The enum predicate could return a non-Boolean falsey value. The final predicate returns Boolean for every input, and the build and both Studio runs pass.
- **NOT_RUN.** Other representations and units, a non-mm Shaft, external reader, other backends, mobile and full local suites. #320 stays open for explicit geometric associations and ambiguity evidence. First mechanical CAD remains 8/10. Whole-product completion remains unmeasured.

```sh
node packages/barocss-cad/scripts/tool.mjs build:fast
node --test packages/barocss-cad/test/step.test.mjs
node packages/barocss-cad-model/scripts/test.mjs editable-step-copy shaft-display step-units step-reference-units
pnpm --dir apps/cad-studio test editable-step-cli editable-step-preparation step-export
node apps/cad-studio/scripts/cad-cli.mjs editable-step "$IN_STEP" --named
node apps/cad-studio/scripts/cad-cli.mjs editable-step "$IN_STEP" --named --review "$REVIEW_ID" -o "$CLI_COPY"
EDITABLE_STEP_UNITS_SOURCE_FROZEN=1 node apps/cad-studio/test/editable-step-units-browser.mjs "$OUT/studio-inch" "$IN_FIXTURES" --inch
EDITABLE_STEP_UNITS_SOURCE_FROZEN=1 node apps/cad-studio/test/editable-step-units-browser.mjs "$OUT/studio-cm" "$CM_FIXTURES"
pnpm --dir packages/barocss-cad type-check
pnpm --dir packages/barocss-cad-model type-check
pnpm --dir apps/cad-studio build
git diff --check
```
