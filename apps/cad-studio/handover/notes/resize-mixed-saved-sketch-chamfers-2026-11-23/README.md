# D1741 — Set a common setback on saved sketch Chamfers with different sizes

P1 Sketch and local Agent, rows 04 and 09. [Issue #21](https://github.com/barocss/cad/issues/21). Base `f1377ab0cb3429342e522e2bf7a6eb090f339041`.

The existing shared Chamfer editor and `sketchChamfer.bevels` command accept different saved starting setbacks. Both use the same checked Model operation. It shrinks larger bevels before growing smaller ones on a shared carrier and publishes the complete edit as one sketch change. The Radius and Distance editors reuse the existing mixed-value interaction.

- **FAIL, base capability.** Studio opens an independently measured C4 convex / C14 reflex sketch extrusion. Both bevels can be selected and no shared Chamfer editor is offered. The version-bound local Agent discovers both bevel IDs but refuses their mixed starting distances.
- **PASS, desktop Chrome / WebGPU.** The mixed selection opens with an empty Distance field. C13 refuses with the source and history intact. Both selection orders give the same C12 numeric preview as the real handle drag. Returning the handle to the start restores the prior draft. One Apply, Undo, Redo, Save, fresh Open and re-edit pass.
- **PASS, local MCP and explicit Studio approval.** Both ID orders give the same dry-run diff. Stale and malformed proposals, the collapsing C13 and direct MCP approval are refused without file changes. Preview keeps the source. Studio approval, Undo, Redo and fresh Open yield the same native result as the manual edit. The prior same-size Chamfer and mixed Fillet controls pass. The six final desktop runs report 57 checkpoints with zero source changes and zero page or console errors.
- **PASS, independent native geometry.** The 10 mm extrusion changes from 20900 to 20000 mm³ and retains both planar bevel walls and stable side IDs. The shared carrier is 1 mm after the edit. The manual and Agent reopened native hash is `6edeca205681e457e969752b35533887ed120f054caa0b1ff71920b0d7f3198a`. The native check proves both selection orders, the failing grow-first intermediate and the atomic refusal of a C13 target.
- **PASS, affected checks.** 16 Model and 65 Studio tests. Model types, scoped ESLint, Studio production build and types, browser driver syntax and Git diff check.
- **FAIL, recovered test setup.** The first Agent discovery assertion expected C14 to be exactly representable after dividing its saved diagonal by √2. The numeric comparison now allows 1e-10 mm. The first Model test also compared omitted tangent metadata to a canonical empty list and was corrected without changing stored geometry.
- **Known diagnostic.** Studio reports the fixture's two redundant constraints in both the source and edited sketch. The native topology and independent volume checks pass.
- **NOT_RUN.** Other Chamfer families, full local suites, WebGL2, mobile and live providers. First mechanical CAD remains 8/10. Overall completion remains unmeasured. Issue #21 stays open.

## Reproduction

Use Node 22.19.0, the heavy gate, installed desktop Chrome and Playwright, and an external evidence directory.

```sh
D1741_SOURCE_FROZEN=1 node apps/cad-studio/test/sketch-corner-batch-browser.mjs "$OUT/manual" --mixed-chamfer-setbacks
D1741_SOURCE_FROZEN=1 node apps/cad-studio/test/sketch-corner-batch-browser.mjs "$OUT/agent" --mixed-chamfer-setbacks --agent-resize-chamfers
D1728_SOURCE_FROZEN=1 node apps/cad-studio/test/sketch-corner-batch-browser.mjs "$OUT/control-chamfer" --resize-chamfers
D1731_SOURCE_FROZEN=1 node apps/cad-studio/test/sketch-corner-batch-browser.mjs "$OUT/control-agent-chamfer" --agent-resize-chamfers
D1737_SOURCE_FROZEN=1 node apps/cad-studio/test/sketch-corner-batch-browser.mjs "$OUT/control-fillet" --mixed-fillet-radii
D1738_SOURCE_FROZEN=1 node apps/cad-studio/test/sketch-corner-batch-browser.mjs "$OUT/control-agent-fillet" --mixed-fillet-radii --agent-resize-fillets
TEST_CONCURRENCY=1 pnpm --dir packages/barocss-cad-model test sketch-fillet-edit sketch-chamfer-edit sketch-corner-batch tool-contract-mcp
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test constraint-list constraints draft-sketch-history sketch-presentation proposal-review
pnpm --dir packages/barocss-cad-model type-check
pnpm --dir apps/cad-studio build
git diff --check
```
