# D1684 — Read current feature edit fields in the Agent

Issue [#322](https://github.com/barocss/cad/issues/322). Automation/B09, rows 04, 09 and 16. Starting source `bb16d9504cc105a3c306c626d65fa5f08490df98`.

The existing L1 MCP flow needed a failed dry run to read a saved sketch's driving length. The base `query.summary` returned the B01 sketch index, stable ID and label. A direct `features.edit` was blocked at L1. The dry-run validation diagnostic could list `olen0` at 60 mm. The reproduced input and W60 revision were unchanged.

`query.edit_fields` accepts the index from `query.summary` and returns the stable feature ID, editable keys, current values, metadata and the revision used by `features.edit`. It uses the existing feature field definitions and their context, with the supported reviewed wall field included when eligible. Parameter-backed number fields can report a resolved value and binding. An unavailable numeric value is null. The action is additive within the current v2 tool contract. The action's result keeps authored strings intact. L1 edit and approval permissions are exercised on the same proposal path.

## Evidence

- **PASS, Model and MCP contracts.** 15 Model checks and 2 Studio MCP checks. Confirm read-only annotations, compatible frozen v2 schema, matching structured/text results, resolved parameter values and invalid index refusals. The base-part lookup does not evaluate a draft or write the document. After compacting the query catalog, the per-turn tool list plus system prompt is 24,966 characters against a cap of 25,000.
- **PASS, controlled bracket reference.** The frozen D1683 task includes the new read action. The local model/reference oracle passes 5/5.
- **PASS, desktop Studio WebGPU.** Discover the current W60 width and use the returned key and revision in the proposal. The query and the dry run leave the exact original file bytes. L1 still refuses direct editing and agent self-approval. Explicit Studio Accept preserves the downstream references and produces W80. Native Save and fresh Open retain W80. The same read action sees W80 against the current revision. A proposal dry run using the actual old W60 revision is refused, and the saved W80 bytes stay exact. Edit the reopened locked dimension to W60 in Studio and recover the original native body. The observed revision changes from `5732ca0b8ac008a5` to `024013a7e246b337`. Five fresh D538 oracle bindings pass, with seven screenshots and no page errors, console errors or source writes.
- **PASS, type check, scoped lint, production build, syntax and diff checks.** Scoped lint retains one existing test warning.
- **FAIL, first focused check.** The test first expected the extrusion label Height. The existing editor uses Distance. The first tool-list draft also exceeded the existing cap by 57 characters. The final run checks the shipped label and the shorter query catalog.
- **NOT_RUN.** Live provider, full local suites, other display backends and placed/nested edit-field discovery. The benchmark's local reference and desktop checks leave the first product baseline at 8/10. Overall CAD and natural-language provider success remain unmeasured.

## Reproduction

Use Node 22.19.0, installed desktop Chrome and Playwright, the workspace gate, and a fresh evidence directory outside the repository.

```sh
pnpm --dir packages/barocss-cad-model type-check
TEST_CONCURRENCY=1 pnpm --dir packages/barocss-cad-model test toolset tool-contract
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test tool-contract-mcp
node apps/cad-studio/scripts/ai-eval/ai-eval.mjs validate --briefs b01-bracket-revision
pnpm --dir apps/cad-studio build
D1683_SOURCE_FROZEN=1 node apps/cad-studio/test/bracket-agent-revision-browser.mjs "$OUT/studio"
git diff --check
```
