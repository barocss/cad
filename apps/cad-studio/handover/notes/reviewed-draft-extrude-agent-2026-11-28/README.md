# D2129 — Bind Agent Draft Extrude to the reviewed sketch

P0 [row 04](../../roadmap-rows/04.md), P5 [row 07](../../roadmap-rows/07.md) and B09 · [#324](https://github.com/barocss/cad/issues/324) · Base `10d5721684a3e382381e91b0d6163c2f0bd6ca26`.

For a distance Draft Extrude, `features.command` accepts `values.sketch`, numeric `h` in mm and nonzero numeric `draft` in degrees with the current `expectedRevision`. The ID must identify one active standalone finished sketch with no holes or extra regions. The existing Extrude command builds from the reviewed selection and the local L1 policy requires user approval. Selecting a sketch by ID leaves the implicit Extrude path and the existing To face contract intact.

## Verification

- **PASS, baseline reproduction.** On a native document with quarter disk `n3` followed by rectangle `n8`, the local MCP proposal refuses `values.sketch`. The old implicit command previews the latest rectangle at 1185.372 mm³ in actual desktop Studio.
- **PASS, local MCP and actual Studio.** Discovery returns both IDs and the current part revision. Explicit `n3` proposes 510.350 mm³. Missing and stale pins, an unknown ID and a +30° collapse refuse without changing the file. Local L1 refuses direct execution and Agent acceptance. Studio Preview, Hide and retry leave the part untouched until the user accepts. Undo and Redo restore the pending proposal and approved solid respectively. Save and fresh Open preserve both sketches, the `n3` reference, and user approval. Both Chrome runs freeze 1,277 files with zero source changes, page errors and console errors.
- **PASS, independent native checks.** The approved quarter disk has one valid native solid and six native faces. Its volume 510.34997581646195 mm³ agrees with the independent D2128 integral 510.3499758161529 mm³. The reopened native SHA256 is `821f0ec85628e44b373b12a4f1734da7318454f9db51c8fe5b92c4b66ef960ff`. The Model regression compares both signs against the shared manual command and covers duplicate IDs, suppression, attachment, invalid ranges and conflicting selections.
- **PASS, affected checks.** 78 Model tests, 5 Studio tests, Model and Studio type checks, scoped ESLint, driver syntax, diff check and Studio production build on Node 22.19.0.
- **FAIL, corrected test setup.** The first candidate MCP driver expected a generic failure. The kernel returned a specific shallow-angle or shorter-distance hint for collapse. The driver now checks that refusal. The Model fixture needed literal suppression and explicit sketch-kind narrowing for the type check.
- **NOT_RUN.** General profile and placed-part support, full local suites, mobile, and live language models. The broader #324 remains open. First mechanical CAD remains 8/10 accepted. Whole product completion is unmeasured.

```sh
# Node 22.19.0. Run each Studio flow and the affected checks under the heavy gate.
REVIEWED_DRAFT_AGENT_FROZEN=1 node apps/cad-studio/test/reviewed-draft-agent-browser.mjs "$OUT/baseline" --baseline
REVIEWED_DRAFT_AGENT_FROZEN=1 node apps/cad-studio/test/reviewed-draft-agent-browser.mjs "$OUT/candidate"
pnpm --dir packages/barocss-cad-model test revision-pinned-command face-end-extrude extrude-draft-binding toolset tool-contract
pnpm --dir apps/cad-studio test toolset-mcp tool-contract-mcp proposals
pnpm --dir apps/cad-studio exec vite build --outDir "$OUT/studio-dist"
```
