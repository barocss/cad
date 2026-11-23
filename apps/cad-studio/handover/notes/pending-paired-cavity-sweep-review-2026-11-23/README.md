# D1772 — Review two sealed cavities in a pending exact Sweep

P1 Agent review, rows 04 and 16. [Issue #324](https://github.com/barocss/cad/issues/324). Base `610c9af964f9117ea30b6ebf52dd91e209ae6e77`.

Use the existing pending rectangular duct review for the D1770 closed Sweep with two separate rectangular cavities. Verify each native shell, its inward walls, named faces, seams, corners, charts and positive void volume. Use the same candidate body for the standard and opposite four-view images and native inspection. The images show hidden edges with dashes. Exact native inspection supplies the cavity dimensions.

- **FAIL, original capability.** The local MCP command stages the valid two-cavity Sweep. proposals.list omits the model review revision and query.render returns `MODEL_REVIEW_UNAVAILABLE`. The baseline still supports explicit Studio approval, Save and fresh Open.
- **PASS, local Agent.** Both images share the reviewed body hash and give distinct image review pins. Inspect all eight cavity plane faces through both pins. The returned names, signed planes and orientations agree with the native shell evidence. Refuse stale base, proposal and orientation pins. Read-only review preserves the pending file bytes.
- **PASS, actual desktop Studio WebGPU.** Preview and explicitly Accept the pending proposal. Save and fresh Open reproduce the same native body, plane facts and both PNG byte strings. A separate direct edit changes one cavity height from 2 mm to 1 mm. The fresh Open section shows both cavities. Six native inspector records match the base byte for byte.
- **PASS, independent geometry.** Native shell names distinguish the two sealed voids at axial intervals +1 to +3 mm and −3 to −1 mm. The rail radius is 20 mm, the nominal outer section is 4 × 10 mm and both void sections are 2 × 2 mm. The axial web is 2 mm. Each void measures 502.654824574365 mm³ and the material measures 4,021.238596594985 mm³ by quadrature. Independent section area × path length gives 160π mm³ per void and 1,280π mm³ of material. The full solid has 96 chart bindings and 48 verified shared edges. The largest native gap is 1.432e−14 mm.
- **PASS, controls.** An unequal-height fixture measures 80π and 160π mm³ for the two voids and 1,360π mm³ for the material. The original D1763 unit, native and both PNG results are retained. Four desktop runs record 52 checkpoints with zero source, page or console errors. The final candidate includes the paired proof source in its freeze capsule and reproduces both candidate PNGs exactly.
- **PASS, affected checks.** 58 Model and 17 Studio tests, scoped ESLint, Model types, Studio production build with types, browser driver syntax and Git diff check.
- **NOT_RUN.** Full local suites, other profile families, provider-based Agent runs, alternate GPU backends, mobile and cutaway rendering in the Agent. [Issue #608](https://github.com/barocss/cad/issues/608) remains held. Issue #324 remains open. First mechanical CAD remains 8/10. Whole-product completion remains unmeasured.

| Check | Value |
| --- | --- |
| Candidate part revision | `c7f947af8b07675b` |
| Native body SHA-256 | `1f000a6990bfe2e0dd511e2ebd275bfafd318cee691a022749790e51aad4c6f5` |
| Standard PNG SHA-256 | `2410743cc9496df9e7a2610e839961e3a805dc3e0d442955519e4886eb841470` |
| Opposite PNG SHA-256 | `351a072d2a234aac7dabb0c1c458b46d575feaf940ca765b940bb772def8b36b` |

## Reproduction

Use Node 22.19.0, the heavy gate, installed desktop Chrome and Playwright, and external evidence directories. Run the first desktop command on the base with the candidate driver.

```sh
D1772_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-closed-paired-cavity-sweep-browser.mjs "$OUT/base" --expect-review-unavailable
D1772_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-closed-paired-cavity-sweep-browser.mjs "$OUT/final" --review-cavities
D1763_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-closed-rectangular-duct-browser.mjs "$OUT/control" --review-cavity
TEST_CONCURRENCY=1 pnpm --dir packages/barocss-cad-model test closed-paired-rectangular-duct-evidence closed-rectangular-duct-evidence rectangular-duct-proposal-review rectangular-duct-intersection-proposal-review offset-rectangular-duct-intersection-evidence views saved-chamfer-resize-review corner-proposal-review toolset tool-contract
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test toolset-mcp tool-contract-mcp proposal-review-availability
pnpm exec eslint packages/barocss-cad-model/src/chat/{closedPairedRectangularDuctEvidence,closedRectangularDuctEvidence,rectangularDuctProposalReview,part/views}.ts packages/barocss-cad-model/test/{closed-paired-rectangular-duct-evidence,rectangular-duct-proposal-review}.test.ts apps/cad-studio/test/exact-closed-paired-cavity-sweep-browser.mjs
pnpm --dir packages/barocss-cad-model type-check
pnpm --dir apps/cad-studio build
node --check apps/cad-studio/test/exact-closed-paired-cavity-sweep-browser.mjs
git diff --check
```
