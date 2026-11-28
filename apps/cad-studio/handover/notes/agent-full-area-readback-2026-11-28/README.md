# D2134 — Read full-precision area at the reviewed revision

P0 [row 04](../../roadmap-rows/04.md) and B09 · [#324](https://github.com/barocss/cad/issues/324) · Base `159c6bc5aa069c144c5679e10e650af100b9f0b5`.

Local MCP `query.mass` accepts `areaPrecision: "full"` for the current area in mm² before output rounding. The call requires the Model revision from `query.rebuild` and, with Direct objects present, the Direct revision from `query.summary`. The response identifies native surfaces or a display mesh estimate. A stale pin returns the current revision without a measurement. The default compact reply still rounds the area to three decimal places and retains its existing fields.

## Verification

- **PASS, baseline reproduction.** After actual Studio approval, Save and fresh Open, local MCP returned only 2,189.451 mm² at R2 and 2,135.398 mm² at R2.5. It refused the precision request as unknown. The native area inspection already matched the analytic result at each radius.
- **PASS, desktop and local MCP candidate.** Preview, explicit user approval, Undo, Redo and fresh Open pass. The first native file gives 2,189.4512719466766 mm² at revision `fcd999ef2d2d1f99`. A Studio History edit from R2 to R2.5 produces 2,135.398163397448 mm² at `0431a6d0eca9263e`. The old pin and a missing pin both refuse. Readback keeps each native file byte-identical. The compact reply remains the same. The independent analytic formula matches both measurements within 10⁻⁹ relative. The baseline and final runs freeze 1,279 and 1,281 files with zero source changes, page errors or console errors.
- **PASS, affected checks.** 48 Model tests and 11 Studio tests cover the frozen tool contract, compact output, no document change, native and mesh area labels, and Direct-only staleness. Model and Studio type checks, scoped ESLint, driver syntax, diff check and Studio production build pass on Node 22.19.0.
- **FAIL, corrected tool discovery text.** Initial discovery used 25,033 characters in the per-turn registry and prompt. Moving the argument details into `describe` brings the final size to 24,989, with the 25,000 limit retained.
- **NOT_RUN.** Full local suites, live providers, mobile and broader #324 visual-review acceptance. First mechanical CAD remains 8/10 accepted. Overall completion is unmeasured.

```sh
# Node 22.19.0. Run each Studio flow and the affected checks under the heavy gate.
ROUNDED_CUBE_AREA_FROZEN=1 node apps/cad-studio/test/rounded-cube-area-browser.mjs "$OUT/baseline" --agent-area-baseline
ROUNDED_CUBE_AREA_FROZEN=1 node apps/cad-studio/test/rounded-cube-area-browser.mjs "$OUT/candidate" --agent-area
pnpm --dir packages/barocss-cad-model test surface-area toolset tool-contract api-mass-provenance
pnpm --dir apps/cad-studio test toolset-mcp tool-contract-mcp mass-provenance native-mass-client
pnpm --dir apps/cad-studio exec vite build --outDir "$OUT/studio-dist"
```
