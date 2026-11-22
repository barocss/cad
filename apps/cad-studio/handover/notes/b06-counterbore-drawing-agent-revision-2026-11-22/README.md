# D1687 — Freeze a two-sheet counterbore drawing revision for Agent evaluation

Issue [#322](https://github.com/barocss/cad/issues/322). Automation/B06, rows 04, 09, 11, 12, 13 and 16. Starting source `f26a807f1a9fb0348645e70f24ea365df2653d2a`. The seed comes from a fresh [D675 Studio replay](../two-sheet-counterbore-svg-2026-11-11/README.md) after the two A4 sheets and all six dimensions were authored.

## Frozen case

The `b06-counterbore-drawing-revision` case starts with a 4,938-byte document. Fixture SHA-256 is `0ad88b52c61fb1d1701df7eea8f123cc6f70cfc928082cd7b2ec178b4ae49991`. The user prompt SHA-256 is `342014ce9e8d479296079dbc7c3d70f3a805a2fc7f471faf3e57d72ff84f68b8`. It asks for a 4→2 mm depth change to the existing counterbore and for the two sheets, part references and current callout ownership to remain intact. It requests review before approval.

The controlled local brief checks the exact authored model and drawing, resolves both sheets from the producer, and adjudicates the approved output. The independent desktop oracle parses the native SVG exports and compares volume and centroid against a block minus a through cylinder and annular recess. Reference signatures may be filled by the edit. Their original edge names, reference locations, dimensions and view ownership must match.

## Evidence

| State | Sheet 1 | Sheet 2 Top |
| --- | --- | --- |
| Original depth 4 mm | Front and Isometric, no counterbore callout | d4 reads Ø4 THRU CBORE Ø8 × 4 DEEP |
| Approved depth 2 mm after native Open | Front and Isometric, no counterbore callout | d4 reads Ø4 THRU CBORE Ø8 × 2 DEEP |
| Reopened depth edited back to 4 mm | | d4 reads Ø4 THRU CBORE Ø8 × 4 DEEP |

- **PASS, controlled reference.** B06 passes 5/5 hard checks. B01 and B05 each still pass 5/5. Missing approval scores 1/5 and the wrong depth scores 2/5. Both runs fail. Moving the exported d4 group to Sheet 1 makes both original XML checks fail.
- **PASS, desktop Studio WebGPU.** The L1 agent finds field `n3.depth` and its current revision. Dry run preserves exact source bytes. Preview reports +75.4 mm³ while the accepted model stays at depth 4 mm. Studio records explicit user approval. Native Save and fresh browser Open preserve the accepted model and the exact saved drawing settings and proposal state. Five independently parsed SVGs validate A4, sheet number, view ownership and the original Top callout. The Sheet 2 paper radii remain 2 and 4 mm, and the Top outline remains 80 × 40 mm at 1:1. The reopened depth remains editable. Eleven captures, no page errors, console errors or source writes. The approved output has native volume 38173.80532894145 mm³. The saved native document hash is `cdaa717578d620b1f8caf2cc2545cf89a7c96bb3400bc1272bd06202aa9df74f`.
- **PASS, original D675 browser control.** Four actual SVGs pass after sharing its unchanged checks. Scoped lint, standalone evaluation TypeScript, syntax and diff checks pass.
- **FAIL, MCP callout read gap.** The approved Sheet 2 SVG contains the full current callout. `drawing.dimensions` with `include_diameters: true` returns d4 as the Ø4 geometric diameter only, measured 4.000000000000001 mm. D1688 should expose the current printable callout separately and keep the geometric read contract intact.
- **FAIL, first harness checks.** The reference initially treated added native signatures and a repeated space as authored changes. The first fresh-Open driver compared JSON property order. Only property order differed. The geometric diameter verification uses a 1e-9 mm bound for floating-point roundoff. The final drivers compare authored references, normalize label spacing and verify saved/reopened values.
- **NOT_RUN.** Actual PDF, live natural-language provider and full local suites. B06 remains 6/7 qualified groups and first mechanical CAD remains 8/10. Overall CAD and real provider success stay unmeasured.

## Reproduction

Use Node 22.19.0, installed desktop Chrome and Playwright, the workspace gate, and a fresh evidence directory outside the repository.

```sh
node apps/cad-studio/scripts/ai-eval/ai-eval.mjs validate --briefs b01-bracket-revision,b05-pin-mate-revision,b06-counterbore-drawing-revision
pnpm exec eslint apps/cad-studio/scripts/ai-eval/{briefs,counterbore-drawing-revision}.ts apps/cad-studio/test/{counterbore-drawing-agent-revision-browser,two-sheet-counterbore-svg-browser,two-sheet-counterbore-svg-oracles}.mjs
D1687_SOURCE_FROZEN=1 node apps/cad-studio/test/counterbore-drawing-agent-revision-browser.mjs "$OUT/studio"
D675_SOURCE_FROZEN=1 node apps/cad-studio/test/two-sheet-counterbore-svg-browser.mjs "$OUT/legacy"
git diff --check
```
