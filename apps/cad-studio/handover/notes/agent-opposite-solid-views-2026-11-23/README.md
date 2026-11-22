# D1748 — Show opposite solid views in Agent review

P1 Agent visual review, rows 04 and 16. [Issue #324](https://github.com/barocss/cad/issues/324). Base `d5bb951c1bbf2c5d19f30ce84a10f74eb34bc253`.

Allow `orientation: "opposite"` on solid `query.render`. The four cells show Back, Top, Left and the opposite isometric. The response identifies the actual directions. Keep the standard image as the default. Cache projections by direction and bind the optional orientation to the pending candidate's image pin. Repeat that orientation when using the image pin for native `query.inspect`.

- **FAIL, original capability.** The frozen desktop baseline reviews the exact duct in the standard four directions. Local MCP responds with `UNKNOWN_ARGUMENT` when asked for the opposite orientation. The standard views list neither end face as visible.
- **PASS, local MCP and desktop Studio WebGPU.** The alternate image exposes the original inlet `n1.start` in Left and the curved outlet `n1.end` in Back. Both images share the same exact body digest and opening planes. Each orientation has a distinct review pin. Refuse an opposite pin with standard orientation and a standard pin with opposite orientation. Pending reads preserve the original bytes. Apply only after explicit Studio approval, then Undo, Redo, Save and fresh Open. Both PNGs reproduce byte for byte and the two openings are visible from the corresponding Studio cube views.
- **PASS, regression controls.** The D1747 standard image and D1705 opposite-arc duct image keep their published PNG hashes. Three desktop runs record 50 checkpoints with no page errors, console errors or source changes. 38 Model tests, 17 Studio tests, scoped ESLint, Model types, Studio production build, browser driver syntax and Git diff check pass. The focused solid test alternates the two cached orientations and checks explicit standard parity.
- **NOT_RUN.** Full local suites, new viewport GPU modes, mobile and paid model providers. Opposite orientation applies to solid views without a section. First mechanical CAD remains 8/10. Overall completion remains unmeasured. Issue #324 stays open.

| Measurement | Value |
| --- | --- |
| Candidate part revision | `1dd2d9dbebb7d4a5` |
| Native body SHA-256 | `a85fb34f60f571896b8a24d06addf30f1c0282f12566df816a342115fd6ffdf9` |
| Standard image SHA-256 | `9a63956c682afed7e8f82d36ecb144e1dded17d1543ba1dd0da000f3ae84fd78` |
| Opposite image SHA-256 | `75069d837d441a4d8491138f8aae910cc4f657fb8581f848c28e3fdc12dc8364` |

## Reproduction

Use Node 22.19.0, the heavy gate, installed desktop Chrome and Playwright, and external evidence directories. On the base with the candidate browser drivers, add `--expect-opposite-unavailable`.

```sh
TEST_CONCURRENCY=1 pnpm --dir packages/barocss-cad-model test views agent-direct-thicken-visual-review rectangular-duct-proposal-review saved-chamfer-resize-review corner-proposal-review toolset tool-contract
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test toolset-mcp tool-contract-mcp proposal-review-availability
pnpm exec eslint packages/barocss-cad-model/src/chat/{modelProposalReview,part/modelCandidate,part/views,toolDefinitions,views}.ts \
  packages/barocss-cad-model/test/views.test.ts \
  apps/cad-studio/test/{duct-proposal-review-browser-steps,exact-rectangular-duct-sweep-browser}.mjs
pnpm --dir packages/barocss-cad-model type-check
pnpm --dir apps/cad-studio build
D1748_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-rectangular-duct-sweep-browser.mjs "$OUT/opposite-view" --line-and-arc --review --opposite-image
D1705_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-rectangular-duct-sweep-browser.mjs "$OUT/opposite-arc-control" --opposite-arcs --review
git diff --check
```
