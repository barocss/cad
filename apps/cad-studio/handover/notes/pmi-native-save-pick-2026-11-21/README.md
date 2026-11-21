# D1528 — Verify WebGPU annotation picking across native Save and Open

P4, row 06, [#268](https://github.com/barocss/cad/issues/268). Base `dcf7907bdf3414888819ed5f44169c36677a030f`. Existing Studio behavior verified through the native file path.

- **PASS, desktop Studio.** In the Top orthographic facing mode at DPR 1, segment actual on/off WebGPU PNG pixels. Nine glyph components qualify before and after reopening. Eight physical sample picks in each state select annotation `frontwidth`. The label reads `4× 30 ±0.1234`. The saved and reopened accepted documents agree exactly.
- **PASS, session state.** Select the last observed glyph, then use the toolbar's native Save. Fresh Open starts with annotations hidden and no selected annotation. A physical click at the old glyph position selects only ordinary geometry. Enable annotations, locate the new raster and click it. The same authored annotation and source edge select. The view, authored file, clean state and independent 2160 mm³ volume agree with the accepted part through these picks.
- **PASS, affected checks.** 12 Studio PMI tests, browser syntax and Git diff. The actual browser run has one native download, zero runtime or console errors, and zero frozen source changes.
- **FAIL.** None in the completed checks.
- **NOT_RUN.** Product build and types locally for the test-only change, full suites, DPR 2 native round-trip, other devices or camera layouts, additional annotations and renderer recovery. #268 remains open.

Use Node 22.19.0 and installed Chrome and Playwright. Gate heavy work and keep evidence outside Git.

```sh
pnpm --dir apps/cad-studio test pmi-gpu-bounds pmi-svg-bounds pmi
node --check apps/cad-studio/test/pmi-gpu-hit-browser.mjs
git diff --check
PMI_GPU_HIT_FROZEN=1 node apps/cad-studio/test/pmi-gpu-hit-browser.mjs "$EVIDENCE/native" --save-reopen
```
