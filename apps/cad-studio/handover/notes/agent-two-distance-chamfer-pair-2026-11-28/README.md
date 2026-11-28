# D2159 — Propose two unequal Sketch Chamfers through local MCP

P1 [row 04](../../roadmap-rows/04.md), [row 09](../../roadmap-rows/09.md) and [row 16](../../roadmap-rows/16.md) · [#324](https://github.com/barocss/cad/issues/324) · Base `79fc9df298fbea8abb7f98b0200c6ea1fe7f96ff`.

The revision-pinned grouped `features.edit` accepts the existing `outgoingDistance` field when `sketchChamfer.corners` identifies exactly two original straight perpendicular corners. Both use the existing geometric planner and its shared-carrier checks. One saved unequal bevel remains individually editable. The MCP response leaves the proposal pending for explicit Studio approval. The grouped schema uses the same tools and wire fields.

## Verification

- **PASS, actual desktop baseline and final.** The baseline refused the grouped request and kept the original file bytes. The final local MCP client discovers `[e1,e2]` and `[e2,e3]` at revision `d08f72190c8dafb0`. For a 40 × 30 × 10 mm stock with setbacks of 3 and 4 mm, Studio shows a −120 mm³ preview while the accepted model stays at 12,000 mm³. Explicit user approval produces 11,880 mm³. Both native bevel faces retain their expected owners. The exact solid digest `0329dcb82edb8aeeeb843bc24588baaa77fbcc45e858ce12d860b6a0536100a4` matches the [D2158 desktop Save](../two-distance-sketch-chamfer-pair-2026-11-28/README.md). Undo, Redo, Save and a fresh Open pass. All 1,285 frozen files kept the same digests. No page or console error occurred.
- **PASS, refusal.** Stale revision, missing side, duplicate corner, three unequal corners and an outgoing distance that consumes the shared span leave the file byte-identical. An attempted local L1 accept leaves the pending proposal byte-identical.
- **PASS, affected checks.** 35 Model tests, 50 Studio tests, Model and Studio types, scoped ESLint, browser driver syntax and Studio production build.
- **NOT_RUN.** Live provider, grouped saved-bevel resize, oblique unequal pairs, mobile and full local suites. #324 remains open for its broader scope. First mechanical CAD is 8/10 accepted. Overall completion is unmeasured.

```sh
CHAMFER_PAIR_AGENT_FROZEN=1 node apps/cad-studio/test/sketch-chamfer-pair-agent-browser.mjs "$OUT/baseline" --baseline
CHAMFER_PAIR_AGENT_FROZEN=1 CHAMFER_PAIR_MANUAL="$MANUAL_BCAD" node apps/cad-studio/test/sketch-chamfer-pair-agent-browser.mjs "$OUT/final"
pnpm --dir packages/barocss-cad-model test revision-pinned-edit saved-chamfer-agent-edit corner-proposal-review corner-batch toolset tool-contract
pnpm --dir apps/cad-studio test toolset-mcp tool-contract-mcp proposal-review constraints
pnpm --dir apps/cad-studio exec vite build --outDir "$OUT/studio-dist"
```
