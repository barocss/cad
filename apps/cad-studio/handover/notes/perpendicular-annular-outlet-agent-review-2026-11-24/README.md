# D1925 — Pin local Agent review of the original annular outlet Offset

P5 [row 16](../../roadmap-rows/16.md) and [row 31](../../roadmap-rows/31.md), [#324](https://github.com/barocss/cad/issues/324). Base `3d09c4509c73253a135de6761e081b74d641ee89`.

A single signed Distance proposal on the original perpendicular annular outlet now has a model review revision. The existing local MCP image and inspection endpoints share the reviewed candidate, native receipt and revision checks. The review independently compares the original and proposed geometry and does not run a second Sweep producer. The prior rectangular review response and existing approval implementation stay in use.

- **FAIL, previous pinned review.** The local MCP client stages the −4 mm proposal. Studio opens its pending preview. The pinned model review returns `MODEL_REVIEW_UNAVAILABLE` and leaves the source file byte-identical.
- **PASS, local MCP and actual desktop Studio.** Both exact four-view PNGs have unique review revisions and one native candidate. Each matching inspection returns the same face geometry and evidence. Mismatched base, proposal and image-orientation pins refuse. Query calls leave the native input file unchanged. L1 Agent acceptance refuses and the actual Studio Preview keeps the source document. The explicit Studio Accept creates the reviewed candidate. Native Open preserves its original signature and native body SHA-256 `adde10aad944a7f515ad12a4a5b022ccca5ab9b7718f036512caef226368869e`. After Open, both render orientations reproduce the reviewed PNG bytes. The accepted proposal is no longer open for pending review.
- **PASS, independent native evidence.** The source cap at (12, 30, 28) mm moves to (12, 30, 24) mm. The inlet at (−10, 0, 0) mm and all 12 joints retain their native packets. The section area is `3π mm²`. Signed material change is −37.69911184308319 mm³. Native quadrature and independent volume and first-moment integration agree. The evidence rejects an equal-volume inlet move, the wrong sign and incomplete original or candidate chart ownership.
- **PASS, affected checks.** Four current actual Agent/Studio checkpoints, two original Agent PNGs and six actual direct-outlet control states. Sixteen native, 51 Model and eight Studio tests, affected types, scoped ESLint, Kernel library and Studio production build passed.
- **FAIL, earlier harness and type check.** MCP dry-run display rounds volume to three decimals. The focused evidence uses native precision while the dry-run fixture uses its documented precision. The initial type check inferred the default tolerance as a literal; the final verifier has a numeric tolerance type.
- **NOT_RUN.** Different MCP clients, paid providers, broader client or cost qualification, earlier Offset/Boolean/Finish targets, retained Direct rail, annular inlet review, full local suites and mobile. #324 remains open. First mechanical CAD remains 8/10. Overall completion is unmeasured.

```sh
D1925_SOURCE_FROZEN=1 node apps/cad-studio/test/perpendicular-sweep-inlet-offset-browser.mjs "$OUT/studio" --review
D1924_SOURCE_FROZEN=1 node apps/cad-studio/test/perpendicular-sweep-inlet-offset-browser.mjs "$OUT/outlet-control" --outlet
pnpm --dir packages/barocss-cad build:library
node --test packages/barocss-cad/test/exact-perpendicular-{annular-inlet-offset,annular-outlet-offset,both-ends-sweep}.test.mjs
TEST_CONCURRENCY=1 pnpm --dir packages/barocss-cad-model test perpendicular-annular-inlet-offset perpendicular-annular-outlet-offset-evidence rectangular-duct-proposal-review paired-elbow-outlet-plane-proposal-review paired-elbow-outlet-offset-evidence
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test tool-contract-mcp offset-cap-feedback offset-face-launch-view
pnpm --dir apps/cad-studio build
git diff --check
```
