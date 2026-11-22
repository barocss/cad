# D1637 — Agent image review for a pending Exact Thicken

P5, row 08, [#322](https://github.com/barocss/cad/issues/322) and [#324](https://github.com/barocss/cad/issues/324). Base `82d5067591e2cb17761f5d9938e68b1c53e8dc7f`.

For an open Exact Thicken proposal, `proposals.list` supplies `directReviewRevision`. The agent passes it and the proposal ID to `query.render` with the original `expectedDirectRevision`. The handler replays the proposal privately and renders four engineering views of the candidate solids on one 1000 × 1000 PNG. The response includes the candidate model revision, Direct revision and image digest. The existing Direct Ruled review continues to render the proposed sheet. The solid review uses the standard renderer for base-part solids.

- **PASS, focused checks.** Model 16/16 unique checks. An exact planar Thicken candidate beside an existing box renders both solids and returns identical PNG bytes after approval. Ruled sheet review continues to work. A mismatched proposal pin, changed source, rejected proposal and already accepted proposal produce no image. Model type check, scoped ESLint, browser syntax, generated agent docs check, Studio build and Git diff pass. MCP inventory stays at 13 groups and 24,915 per-turn characters.
- **PASS, local MCP and desktop Studio WebGPU.** Render the pending 2 mm inward semicylinder through local MCP. Studio shows the same pending exact body, with radius 8 mm inside, 10 mm outside and native volume 678.584013175393 mm³. Hiding a source rail in Studio invalidates the old source pin and the proposal pin. Approve from the original source, then Save and fresh Open. Rendering the reopened native part through local MCP yields the same PNG bytes and face legend as before approval. The Studio screenshots show the interactive viewport for the same geometry. The pending and approved files remain byte-identical across the read calls.
- **PASS, recorded identity.** Candidate model revision `8354e1b3edac790f`. PNG SHA-256 `44805b04dac3d3252019e54540ed991dc2f36f9c454dbd88936dde8b326c4e82`. Native B-rep digest `f41ce4f456834492a37cf01c78e45705d9be3c6fba7c0d2e78b7710324fe3cea`. Studio inspected 1,170 frozen source files with zero changes, page errors and console errors.
- **FAIL, initial test expectation.** The test assumed the Direct revision covered the Direct sources alone. The corrected check compares the candidate with the Direct revision of the replayed part.
- **NOT_RUN.** Full local suites, WebGL2, placed assemblies and paid live models. The linked issues remain open.

Use Node 22.19.0, installed desktop Playwright and Chrome, the heavy gate and an output directory outside the worktree.

```sh
pnpm --dir packages/barocss-cad-model test agent-direct-thicken agent-direct-ruled toolset
pnpm --dir packages/barocss-cad-model type-check
node apps/library-docs/scripts/agent-tools.mjs --check
node --check apps/cad-studio/test/direct-thicken-agent-proposal-browser.mjs
pnpm --dir apps/cad-studio build
D1637_SOURCE_FROZEN=1 node apps/cad-studio/test/direct-thicken-agent-proposal-browser.mjs "$OUT" --candidate-image
cmp "$OUT/01-mcp-exact-candidate.png" "$OUT/05-mcp-approved-exact.png"
git diff --check
```
