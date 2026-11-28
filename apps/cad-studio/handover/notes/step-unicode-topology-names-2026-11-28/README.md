# D2136 — Preserve Unicode STEP face and edge names

P2 [row 13](../../roadmap-rows/13.md) and [row 16](../../roadmap-rows/16.md) · [#16](https://github.com/barocss/cad/issues/16) · Base `ea00d4a2ec200527afbf781bcf228651dc60a3e0`.

Exact `ADVANCED_FACE` and `EDGE_CURVE` names use the same ASCII encoding as the product name. The STEP reader decodes the writer's X4 runs and literal reverse solidi once. The reader keeps a field unchanged when its encoding is unsupported or malformed. Exact name substitutions for controls and invalid Unicode have a specific loss report. The mesh conversion path retains its existing name policy. The STEP opened notice lists product and body labels among its omissions.

## Verification

- **PASS, baseline reproduction.** In desktop Studio the exact face name `면 😀` and edge name `모서리 Ø` become underscore substitutions in the actual worker output. The independent Python reader verifies both substitutions. The source file remains unchanged after preparation and Cancel.
- **PASS, desktop candidate.** The same reader decodes both exact names from the actual worker bytes. A fresh Studio context reads those bytes, retains the correct native face and edge names with the normal import prefixes, and displays one 4 × 3 × 2 mm solid of 24 mm³. The export panel reports no loss for these names. Only the two topology name records differ among 167 records after timestamp normalization. The ASCII and Unicode product-name controls pass. The final desktop retry verifies the revised import notice. Each run freezes 1,278 files and reports zero source changes, page errors and console errors.
- **PASS, affected checks.** 47 kernel, 31 Model and 27 Studio tests. Kernel emit, three type checks, scoped ESLint, driver syntax, diff check and production build pass on Node 22.19.0. The kernel checks include a literal X4-looking label next to actual X4 tokens, an apostrophe and malformed scalar controls.
- **FAIL, corrected test setup.** The first baseline invocation exited before startup because the source freeze environment flag was missing. The protected browser baseline then passed.
- **NOT_RUN.** The final browser Export download action, external CAD applications, full local suites and mobile. #16 remains open for the broader assembly, presentation, PMI and surface scope. First mechanical CAD remains 8/10 accepted. Overall completion is unmeasured.

```sh
# Node 22.19.0. Run each desktop flow and the affected checks under the heavy gate.
STEP_UNICODE_PRODUCT_NAME_FROZEN=1 node apps/cad-studio/test/step-unicode-product-name-browser.mjs "$OUT/baseline" --native-names --baseline
node packages/barocss-cad/scripts/tool.mjs build:fast
STEP_UNICODE_PRODUCT_NAME_FROZEN=1 node apps/cad-studio/test/step-unicode-product-name-browser.mjs "$OUT/final" --native-names
STEP_UNICODE_PRODUCT_NAME_FROZEN=1 node apps/cad-studio/test/step-unicode-product-name-browser.mjs "$OUT/product-control"
node --test --test-concurrency=1 packages/barocss-cad/test/{step,step-quoted-tokens,step-literal-backslash,step-validation,step-validation-bbox-omission,step-tessellated,step-cavity,step-sphere-representability}.test.mjs
pnpm --dir packages/barocss-cad-model test step-profile-losses step-native-name-loss step-bbox-loss editable-step
pnpm --dir apps/cad-studio test step-export-preparation step-metadata editable-step step-continuity-help
pnpm --dir apps/cad-studio exec vite build --outDir "$OUT/final-dist"
```
