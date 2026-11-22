# D1747 — Review a pending exact line-and-arc rectangular duct

P1 Agent visual review, rows 04 and 16. [Issue #324](https://github.com/barocss/cad/issues/324). Base `8f2e9858b0853f6a7ed4ab34a0ff4ce301551667`.

Extend the existing rectangular duct review to the tagged line-and-arc geometry from [D1746](../exact-rectangular-line-arc-sweep-2026-11-23/README.md). The native check verifies the exact copied path, two rectangular loops at each mouth, both chart uses at the curved outlet, and eight bound tangent seams. The PNG and the named opening planes share the exact proposal, source, part and body revisions.

- **FAIL, original capability.** The actual desktop baseline creates and edits the duct. P1 has a valid proposal review pin, but local MCP render returns `MODEL_REVIEW_REPLAY_FAILED` and preserves the pending bytes.
- **PASS, local Agent.** Render two proposals for the same part. They have identical PNG bytes and distinct review revisions. The exact image pin returns both native opening planes and the eight shared edges. Reject a wrong base or proposal pin, a missing image pin, another proposal's image pin and a changed Direct path. The original pending files stay byte-identical.
- **PASS, desktop Studio WebGPU.** Preview P1, explicitly approve it as the Studio user, Undo, Redo, Save and fresh Open. The reopened volume is 662.6548245743669 mm³. The native body hash, PNG bytes and both plane normals match the pending evidence. Left and Back views verify both open mouths on the reopened approved solid. The approved proposal refuses pending review.
- **PASS, controls.** Three passing desktop runs have 44 checkpoints and zero page errors, console errors or source changes. The D1705 opposite-arc duct retains its published native body and four-view PNG hashes. 29 Model tests, 17 Studio tests, scoped ESLint, Model types, Studio production build, browser driver syntax and Git diff check pass.
- **FAIL, recovered browser assertion.** The first candidate run inherited the opposite-arc fixture's expectation that a mouth appears in the default image legend. The line-and-arc fixture's default front, top, right and isometric views all show exterior walls. Verify both native mouth planes through the image pin, both mouth sight lines in Studio, and record the actual visibility. D1748 covers the alternate image orientation.
- **NOT_RUN.** A wider duct family, alternate GPU backends, full local suites, mobile and live model providers. First mechanical CAD remains 8/10. Overall completion remains unmeasured. Issue #324 stays open.

| Measurement | Value |
| --- | --- |
| Copied Direct path SHA-256 | `83c7e16c4ca7f8718efca65d46c06d50570ef6c19ec0b6f272938805745f9860` |
| Candidate part revision | `1dd2d9dbebb7d4a5` |
| Native body SHA-256 | `a85fb34f60f571896b8a24d06addf30f1c0282f12566df816a342115fd6ffdf9` |
| Four-view PNG SHA-256 | `9a63956c682afed7e8f82d36ecb144e1dded17d1543ba1dd0da000f3ae84fd78` |

## Reproduction

Use Node 22.19.0, the heavy gate, installed desktop Chrome and Playwright, and external evidence directories. On the base with the candidate browser drivers, add `--expect-review-refused`.

```sh
TEST_CONCURRENCY=1 pnpm --dir packages/barocss-cad-model test rectangular-duct-proposal-review saved-chamfer-resize-review corner-proposal-review sweep-agent-remap toolset tool-contract
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test toolset-mcp tool-contract-mcp proposal-review-availability
pnpm exec eslint packages/barocss-cad-model/src/chat/{rectangularDuctProposalReview,part/modelCandidate,part/views,toolDefinitions}.ts \
  packages/barocss-cad-model/test/rectangular-duct-proposal-review.test.ts \
  apps/cad-studio/test/{exact-rectangular-duct-sweep-browser,duct-proposal-review-browser-steps}.mjs
pnpm --dir packages/barocss-cad-model type-check
pnpm --dir apps/cad-studio build
D1747_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-rectangular-duct-sweep-browser.mjs "$OUT/line-arc" --line-and-arc --review
D1705_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-rectangular-duct-sweep-browser.mjs "$OUT/opposite" --opposite-arcs --review
git diff --check
```
