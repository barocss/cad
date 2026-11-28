# D2146 — Propose edits to a saved two-distance Sketch Chamfer

P1 [row 09](../../roadmap-rows/09.md) and [row 16](../../roadmap-rows/16.md) · [#324](https://github.com/barocss/cad/issues/324) · Base `685380368125306a1f2b334add38aa7855151d2e`.

`query.edit_fields` with `includeSketchCorners: true` returns `sketchTwoDistanceChamfers` for the supported saved bevels. Each entry names the bevel side ID and supplies `distance` (incoming) and `outgoingDistance` in sketch mm. Send both values in `features.edit.sketchChamfer` with the returned index, sketch ID and `expectedRevision`. One matching saved bevel is required. The local Agent proposes the edit and a user approves it in Studio using the existing transaction. The equal-distance API and native file representation remain compatible.

## Verification

- **PASS, actual local MCP baseline.** The previous head evaluates the D2145 Studio file at revision `05684814106f4e97`. It returns no entry for the saved e5 two-distance bevel and refuses the proposed extra field. The file bytes and proposal list stay unchanged.
- **PASS, local L1 discovery and validation.** Both text and structured responses give e5, incoming 3 mm and outgoing 4 mm. Read without the opt-in omits these fields. Missing or stale revisions, wrong side ID, missing outgoing value, a grouped selector, carrier collapse and no-op are refused without a proposal or changed bytes. The dry run predicts −60 mm³ and one changed feature, n0. A valid request stages one proposal with the original nodes and outputs. L1 direct edit and direct acceptance are refused.
- **PASS, actual desktop Studio and native comparison.** Preview and Hide keep the source. Explicit user approval changes only the incoming setback to 6 mm. At endpoints (34, 0) and (40, 4), the seven-face native part measures 11,880 mm³ and matches the D2145 manual edit's nodes and exact B-rep digest `c6f349424c7d5d26698b28596fe237124d3167bcb54181bdb654f030f82d181b`. Undo restores the proposal and original geometry. Redo, native Save and fresh Open restore the approved result. Local MCP reads e5 at 6 and 4 mm under the new revision and refuses the old pin. The browser freezes 1,286 files with no source changes, page errors or console errors.
- **PASS, affected checks.** 44 Model and 19 Studio tests, both type checks, scoped ESLint, driver syntax, diff check and Studio production build pass on Node 22.19.0.
- **NOT_RUN.** Live language-model performance, standalone proposal image/geometry certification for this recipe, multiple unequal bevels, external CAD, mobile and full local suites. #324 remains open. First mechanical CAD remains 8/10 accepted. Overall completion is unmeasured.

```sh
TWO_SETBACK_AGENT_SOURCE="$SAVED_D2145_SOURCE" TWO_SETBACK_MANUAL_EDIT="$D2145_INCOMING_EDIT" \
  TWO_SETBACK_CHAMFER_FROZEN=1 node apps/cad-studio/test/sketch-two-setback-chamfer-browser.mjs "$OUT/candidate" --agent
pnpm --dir packages/barocss-cad-model test saved-chamfer-agent-edit sketch-chamfer-edit corner-proposal-review revision-pinned-edit tool-contract toolset
pnpm --dir apps/cad-studio test toolset-mcp tool-contract-mcp batch-changes-mcp proposal-review-availability
pnpm --dir apps/cad-studio exec vite build --outDir "$OUT/studio-dist"
```
