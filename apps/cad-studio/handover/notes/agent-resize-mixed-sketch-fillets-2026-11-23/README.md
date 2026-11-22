# D1738 — Propose one common radius for mixed-size saved sketch Fillets

P1 Sketch and local Agent, rows 04 and 09. [Issue #21](https://github.com/barocss/cad/issues/21). Base `17e41558a7f3d294bc538e9f1e1e019d11fd1b36`.

The existing `sketchRound.fillets` operation accepts different starting radii under the current revision. It passes the stable saved arc IDs to the checked Model edit that Studio uses in [D1737](../resize-mixed-saved-sketch-fillets-2026-11-23/README.md). The command description exposes that capability. The Studio approval boundary and the existing Chamfer admission remain in use.

- **FAIL, base capability.** Studio opens a valid R4 convex / R14 reflex sketch extrusion. The local Agent discovers both IDs and current radii but refuses the R12 proposal with the same-current-radius guard. The authored file bytes and Studio document match their accepted source.
- **PASS, desktop Chrome / WebGPU and local MCP.** Discover the exact revision and both IDs. Opposite ID orders give the same dry-run diff. Stale revisions, mixed selector forms, duplicate and unsupported IDs and a collapsing R13 target are refused without changing file bytes. A valid proposal stages without applying the edit. Direct MCP acceptance is refused. The Studio preview preserves the source, and explicit approval sets both arcs to R12. Undo, Redo, Save and fresh Open pass. The reopened file refuses the old revision and a no-op repetition at the current revision without changing file bytes.
- **PASS, native parity.** Both the manual and Agent fresh Open produce the same native output with SHA-256 `34c14e53b4467233eb3adb69553375b1f76f9ac3e3cceedcd74903ec0caeb06f`. The strict 10 mm extrusion has two R12 cylinders, the same stable side IDs and exact 1 mm between their tangency endpoints. It measures 20000 mm³. The preview reports −386.28 mm³ from the mixed source. The same-size Fillet and Chamfer Agent controls also pass.
- **PASS, affected checks.** 14 Model and 21 Studio tests. Scoped ESLint, Model types, Studio production build and types, browser driver syntax and Git diff check.
- **NOT_RUN.** Different starting Chamfer setbacks, other sketch and Fillet families, full local suites, WebGL2, mobile, and live providers. First mechanical CAD remains 8/10. Overall completion remains unmeasured. Issue #21 stays open.

## Reproduction

Use Node 22.19.0, the heavy gate, installed desktop Chrome and Playwright, and an external evidence directory.

```sh
D1738_SOURCE_FROZEN=1 node apps/cad-studio/test/sketch-corner-batch-browser.mjs "$OUT/base" --mixed-fillet-radii --agent-resize-fillets --expect-no-group-proposal
D1738_SOURCE_FROZEN=1 node apps/cad-studio/test/sketch-corner-batch-browser.mjs "$OUT/verified" --mixed-fillet-radii --agent-resize-fillets
D1730_SOURCE_FROZEN=1 node apps/cad-studio/test/sketch-corner-batch-browser.mjs "$OUT/control-fillet" --agent-resize-fillets
D1731_SOURCE_FROZEN=1 node apps/cad-studio/test/sketch-corner-batch-browser.mjs "$OUT/control-chamfer" --agent-resize-chamfers
TEST_CONCURRENCY=1 pnpm --dir packages/barocss-cad-model test sketch-fillet-edit sketch-chamfer-edit sketch-corner-batch tool-contract-mcp
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test draft-sketch-history proposal-review
pnpm exec eslint packages/barocss-cad-model/src/chat/{part/sketchCorner.ts,toolDefinitions.ts} apps/cad-studio/test/sketch-corner-batch-browser.mjs
pnpm --dir packages/barocss-cad-model type-check
pnpm --dir apps/cad-studio build
git diff --check
```
