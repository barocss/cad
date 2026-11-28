# D2135 — Preserve STEP product names in printable Unicode

P2 [row 13](../../roadmap-rows/13.md) · [#16](https://github.com/barocss/cad/issues/16) · Base `6cd36ed91761cdbc795664360246c77f9886ab89`.

The STEP header file name, product name and related representation labels encode valid non-ASCII product-name characters with the extended four-octet directive. The file remains ASCII and keeps implementation level `2;1`. Control characters and invalid Unicode still become underscores, with the Studio loss report based on the writer's predicate. [ISO 10303-21 §6.4.3.3 and §8.2.2](https://www.steptools.com/stds/step/IS_final_p21e3.html).

## Verification

- **PASS, baseline reproduction.** Desktop Studio prepares the imported 4 × 3 × 2 mm solid with the input name `부품 😀`. An independent Python reader reads `__ __.step` in the header and `__ __` in both product fields. The export panel reports the substitution and Cancel preserves the authored file.
- **PASS, actual desktop candidate.** The real Studio worker prepares ASCII STEP bytes that the independent reader decodes as `부품 😀.step` and `부품 😀`. The panel reports no additional loss for that input. The same captured bytes open in a fresh desktop context as one 24 mm³ solid. The `plate A_1` control passes and matches its baseline after timestamp normalization. The Unicode file changes seven of 167 records, all containing product metadata. Both desktop runs freeze 1,278 files with zero source changes, page errors or console errors.
- **PASS, affected checks.** 46 kernel, 30 Model and 27 Studio tests. Kernel emit, three type checks, scoped ESLint, driver syntax, diff check and production build pass on Node 22.19.0. Literal quotes, reverse solidi, controls, lone surrogates and bounding-box loss tests pass. Four fixed-timestamp ASCII and substituted-control hashes match the old writer.
- **FAIL, corrected test setup.** The independent reader's first marker assertion used a Python raw string ending in a reverse solidus. The corrected reader uses the character value and completes both cases.
- **NOT_RUN.** The final browser Export download action, Unicode native face and edge names, external CAD applications, full local suites and mobile. #16 remains open. First mechanical CAD remains 8/10 accepted. Overall completion is unmeasured.

```sh
# Node 22.19.0. Run each Studio flow and the affected checks under the heavy gate.
STEP_UNICODE_PRODUCT_NAME_FROZEN=1 node apps/cad-studio/test/step-unicode-product-name-browser.mjs "$OUT/baseline" --baseline
node packages/barocss-cad/scripts/tool.mjs build:fast
STEP_UNICODE_PRODUCT_NAME_FROZEN=1 node apps/cad-studio/test/step-unicode-product-name-browser.mjs "$OUT/candidate"
node --test --test-concurrency=1 packages/barocss-cad/test/{step,step-quoted-tokens,step-literal-backslash,step-validation,step-validation-bbox-omission,step-tessellated,step-cavity,step-sphere-representability}.test.mjs
pnpm --dir packages/barocss-cad-model test step-profile-losses step-native-name-loss step-bbox-loss editable-step
pnpm --dir apps/cad-studio test step-export-preparation step-metadata editable-step step-continuity-help
pnpm --dir apps/cad-studio exec vite build --outDir "$OUT/studio-dist"
```
