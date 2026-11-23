# D1763 — Review the sealed cavity in a pending exact Sweep

P1 Agent review, rows 04 and 16. [Issue #324](https://github.com/barocss/cad/issues/324). Base `537aa766bc3b7884bee529901d7dafc53ff4adb2`.

Extend the existing rectangular duct review to the centered rectangular cavity from [D1762](../exact-closed-rectangular-duct-2026-11-23/README.md). Bind native wall dimensions, shell orientation and material volume to the same path, candidate B-rep and image revision. Both four-view PNGs show exterior faces and dashed hidden edges. The native evidence verifies the sealed cavity.

- **FAIL, original capability.** On the base, local MCP stages the valid duct and offers a model review revision. The image call returns `MODEL_REVIEW_REPLAY_FAILED`. The Studio baseline still creates the native body and approves the proposed feature. The refused call leaves all staged bytes unchanged.
- **PASS, local Agent.** Both image orientations share native evidence and use distinct review pins. Candidate inspection reads the named R22 outer wall and the R21 cavity wall with opposite normals. Wrong proposal, changed Direct path, image and orientation pins fail. The candidate review leaves the staged document bytes unchanged.
- **PASS, actual desktop Studio WebGPU.** Preview the pending proposal and explicitly Accept. Save and fresh Open reproduce the native body, face facts and both Agent PNGs. The actual Y section through the edited cavity shows the material and internal space.
- **PASS, native evidence.** One body, two closed genus-one shells, 16 half-walls, 32 edges and 64 chart bindings. Read the R20 rail and native 4 × 6 mm outer and 2 × 4 mm inner section. Verify 1 mm radial and axial clearance on each side, inward cavity wall normals and 16 tangent seams. Independent rectangular wall area × path length gives 640π mm³, which matches native quadrature.
- **PASS, affected checks and controls.** 45 Model and 17 Studio tests, scoped ESLint, Model types, Studio production build, browser syntax and Git diff check pass. Geometry fixtures cover reversed travel, swapped radial axes and an outward cavity shell that passes strict topology but fails evidence. The D1752 open arc-and-line candidate revision, native metadata and both PNG byte strings match. Three desktop runs record 43 checkpoints with zero source, page or console errors.
- **FAIL, recovered test types.** The first Model type check rejected ES2023 array methods and two fixture values under the ES2022 test contract. Corrected the fixtures and reran the affected Model checks. Product source and desktop proof stayed unchanged.
- **NOT_RUN.** Full local suites, general nonrectangular cavity review, cutaway rendering in the Agent, alternate GPU backends, live providers and mobile. Issue #324 stays open. First mechanical CAD remains 8/10. Whole-product completion remains unmeasured.

| Check | Value |
| --- | --- |
| Direct path SHA-256 | `e52469b8dc8dc4e2f9d35212cde167c80612d40d93ae0ba71eb8ebc7e925f390` |
| Candidate part revision | `feac8fb853c0b9a9` |
| Native body SHA-256 | `ec8b60e48a1872d84394b3a8c62c7517fe698fe0d44699e092073448f12cd8e0` |
| Standard PNG SHA-256 | `279e87f991fea617989dfaef0d65ee5d26aa2dccdcb50f10f6b5b7e63fbfd733` |
| Opposite PNG SHA-256 | `b82cec6574f743458f37b306958d96d5028b80d88daf41e0d9444e24f6dc798e` |
| Native quadrature volume | 2,010.619298297463 mm³ |
| Maximum native chart and boundary gap | 1.066e−14 mm |

## Reproduction

Use Node 22.19.0, the heavy gate, installed desktop Chrome and Playwright, and external evidence directories. Run the first desktop command on the base with the candidate driver.

```sh
TEST_CONCURRENCY=1 pnpm --dir packages/barocss-cad-model test closed-rectangular-duct-evidence rectangular-duct-proposal-review views saved-chamfer-resize-review corner-proposal-review sweep-agent-remap toolset tool-contract
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test toolset-mcp tool-contract-mcp proposal-review-availability
pnpm exec eslint packages/barocss-cad-model/src/chat/{closedRectangularDuctEvidence,rectangularDuctProposalReview}.ts \
  packages/barocss-cad-model/test/{closed-rectangular-duct-evidence,rectangular-duct-proposal-review}.test.ts \
  apps/cad-studio/test/exact-closed-rectangular-duct-browser.mjs
pnpm --dir packages/barocss-cad-model type-check
pnpm --dir apps/cad-studio build
node --check apps/cad-studio/test/exact-closed-rectangular-duct-browser.mjs
D1763_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-closed-rectangular-duct-browser.mjs "$OUT/base" --expect-review-refused
D1763_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-closed-rectangular-duct-browser.mjs "$OUT/closed" --review-cavity
D1752_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-rectangular-duct-sweep-browser.mjs "$OUT/open-control" --arc-and-line --review --opposite-image
git diff --check
```
