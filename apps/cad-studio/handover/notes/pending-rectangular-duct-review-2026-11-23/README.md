# D1705 — Review a pending Exact rectangular S-bend duct

P1 Agent visual review, rows 04 and 16. [Issue #324](https://github.com/barocss/cad/issues/324). Base `1810d82fa3acd7bff29ca25a7b8580bbdcabe0b1`.

Use the existing proposal render and inspection for one tagged XY rectangle with one centered rectangular opening and one visible Direct S-bend path. The native certificate checks the copied path, both end faces with their two rectangular loops, and four exterior and four interior shared tangent edges. It also checks that the source sketch and the full Direct store remain identical. Hidden Join inputs can remain present. The image, native body and Direct path revision belong to the same pending proposal.

## Verification

- **FAIL, base capability.** Local MCP found P1 at base revision `016493441673f162`. Its generic proposal pin existed. The candidate render returned `MODEL_REVIEW_UNAVAILABLE`. The exact staged file SHA-256 stayed `ed3fec9cc05b6886a1284485ad0ff5ced63f7a5be62b67b8597dd17048fabe3c`.
- **PASS, local MCP.** Two proposals with the same copied path produce identical PNG bytes and distinct review revisions. A wrong base pin, wrong proposal pin, missing image pin and another proposal's image pin are refused. The two exact named cap planes have four exterior and four interior edges each. The certificate lists eight unique joined edges. A separate copy changes only the Direct curve control points. The part revision stays `016493441673f162`, the path revision changes, and the old image request returns `MODEL_REVIEW_PROPOSAL_STALE`. Reads and refused L1 approval preserve the original staged bytes.
- **PASS, actual desktop Studio WebGPU.** Preview P1 and explicitly approve it as the Studio user. Undo restores both open proposals and the unbuilt part. Redo restores the approved body. Save and fresh Open reproduce the same exact native body, two cap planes and four-view PNG bytes. The accepted proposal refuses pending review. The fourteen checkpoints record zero source changes, page errors and console errors.
- **PASS, focused certificate checks.** The geometry tests verify both openings, eight bound seams, strict genus-one topology, independent volume, retained authored sketch data and scope refusals. Hidden Direct Join inputs remain eligible and a changed Direct store refuses the certificate.
- **PASS, affected checks.** 28 Model and 17 Studio tests, scoped ESLint, Model types, production Studio build, browser driver syntax and Git diff check. The saved Chamfer resize review still reproduces the D1702 native body, setbacks and PNG through desktop Studio approval and fresh Open.
- **NOT_RUN.** Full local suites, docs aggregate with the inherited D1704 discrepancies, mobile, WebGL2, live model provider and wider Sweep review scopes. Issue #324 remains open for the broader client and cost evaluation. First mechanical CAD remains 8/10. Overall completion is unmeasured.

| Measurement | Value |
| --- | --- |
| Copied Direct path revision | `f6b67f937f59670d64b0e937873efbc823eaceb38030a0a3fa72e260a825bf7a` |
| Candidate part revision | `e58f2135c123f536` |
| Native body SHA-256 | `7c75b0da2805376ee158c8cd8b47b09daca7f756b86c411f69231ddc39df5b6e` |
| Four-view PNG SHA-256 | `087291916598d21ffcf3df9777334910ecd73c8a63763f6bd78bbb82ce679c1f` |
| Native volume | `753.9822368615503 mm³` |

## Reproduction

Use Node 22.19.0, the heavy gate, installed desktop Chrome and Playwright, and an external evidence directory. Replay the saved D1704 proposal with the base MCP to observe the original refusal.

```sh
TEST_CONCURRENCY=1 pnpm --dir packages/barocss-cad-model test rectangular-duct-proposal-review saved-chamfer-resize-review corner-proposal-review sweep-agent-remap toolset tool-contract
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test toolset-mcp tool-contract-mcp proposal-review-availability
pnpm exec eslint packages/barocss-cad-model/src/chat/{rectangularDuctProposalReview,part/modelCandidate,part/proposals,part/views,toolDefinitions}.ts \
  packages/barocss-cad-model/test/rectangular-duct-proposal-review.test.ts \
  apps/cad-studio/test/{exact-rectangular-duct-sweep-browser,duct-proposal-review-browser-steps}.mjs
pnpm --dir packages/barocss-cad-model type-check
pnpm --dir apps/cad-studio build
node --check apps/cad-studio/test/exact-rectangular-duct-sweep-browser.mjs
node --check apps/cad-studio/test/duct-proposal-review-browser-steps.mjs
D1705_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-rectangular-duct-sweep-browser.mjs "$OUT/reviewed" --opposite-arcs --review
D1702_SOURCE_FROZEN=1 node apps/cad-studio/test/sketch-chamfer-drag-browser.mjs "$OUT/chamfer-review-control" --review-resize
git diff --check
```
