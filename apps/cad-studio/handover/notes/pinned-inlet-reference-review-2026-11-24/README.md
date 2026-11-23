# D1859 — Pin both Agent views of the plane-bound inlet

P5 [row 16](../../roadmap-rows/16.md) and [row 31](../../roadmap-rows/31.md), [#324](https://github.com/barocss/cad/issues/324). Base `2394311556649d7edad20af96bbd9d2a0d239d63`.

A pending To plane proposal on the original five-span paired inlet now returns `modelReviewRevision`. Local MCP image review and exact inspection share the same replay and native reference checks. Evidence identifies the original inlet, its live donor and the exact candidate in `pairedElbowInletPlaneOffset`. The existing outlet response retains its prior fields and candidate identity.

- **PASS, actual local MCP and desktop Studio.** Both rendered orientations certify the same candidate and donor but have different image and review digests. Each exact inspection resolves the same two faces at X = −14 mm. An inspection with the other image pin is refused. Moving the donor invalidates the stale review, leaves the proposal open and blocks approval. A fresh view of the unchanged proposal can be previewed and explicitly accepted in Studio. Save and fresh Open preserve the native candidate and donor. Two passages, all 48 joins and the fixed outlet remain. The accepted +4 mm straight extension adds 128 mm³.
- **PASS, precise identity.** Inlet candidate `8d2f775666c811070318a090fc10f7cf7e62cb0f7a00b9739576aa75ac60d4da`, donor `0bdbe3afbe081d520eee5838c9a6ec540b81b59f4e9deca98b64baca0d74611b`. The outlet control repeats D1856's exact candidate and donor digests. Both browsers recorded eight Studio states with zero source changes or runtime errors.
- **PASS, affected checks.** 25 Model tests, 19 Studio tests, Model and Studio types, scoped lint, production build and Git diff check. The focused tests also verify −4 mm with an opposed donor and +1 mm with an aligned donor, and refuse an altered reference witness.
- **FAIL.** None in the affected checks.
- **NOT_RUN.** Full local suites, paid live providers, broader proposal shapes and other clients. #324 stays open for those gaps. First mechanical CAD remains 8/10; overall completion remains unmeasured.

```sh
pnpm --dir packages/barocss-cad-model test paired-elbow-outlet-plane-proposal-review paired-elbow-outlet-offset-handle tool-contract model-proposal-review
pnpm --dir packages/barocss-cad-model type-check
pnpm --dir apps/cad-studio test proposal
pnpm --dir apps/cad-studio build
D1859_SOURCE_FROZEN=1 node apps/cad-studio/test/paired-outlet-reference-plane-browser.mjs "$OUT/inlet" --inlet --agent-review
D1856_SOURCE_FROZEN=1 node apps/cad-studio/test/paired-outlet-reference-plane-browser.mjs "$OUT/outlet" --agent-review
git diff --check
```
