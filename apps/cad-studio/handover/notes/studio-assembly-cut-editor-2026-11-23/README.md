# D1734 — Extract Assembly Cut draft editing from Studio App

P4 Studio composition, row 22. [Issue #44](https://github.com/barocss/cad/issues/44). Base `0a7633df787c7ebe5bc1983a50c2551a0b7d05b9`.

Move the Assembly Cut editor's open, input, target addition, draft trial, Apply and Cancel operations to `useAssemblyCutEditor`. Keep the draft owned by the workbench so document and tool transitions still clear it. The editor keeps the 250 ms trial delay, ownership of the accepted document and the same commit callback. App.tsx decreases from 3,214 to 3,194 lines.

## Verification

- **PASS, desktop Studio WebGPU, before and after.** All 15 recorded Studio state objects for Assembly Cut and Raster match. The two desktop widths preserve depth input and cancellation. The modeling flow previews and applies a Ø8 cut across two placed plates, changes the target, runs Undo and Redo, saves, reopens and deletes. Five independent volume oracle inputs and outputs match. The native saved file hash matches. A whole plate measures 12,000 mm³ and a holed plate measures 11,748.672587712817 mm³.
- **PASS, output controls.** All six exported raster PNG files are byte-identical before and after. Render retains the applied Ø8 body while an unapplied Ø12 edit remains in Model. The changed-source STEP control verifies eight stages through fresh Open. The built-in STEP inspection confirms the same accepted cut boundary during draft creation, draft edit, Cancel, Undo and Redo.
- **PASS, affected checks.** 14 Studio tests for Assembly Cut, instance evaluation and draft selection history. Scoped ESLint, production build and Studio types, and Git diff check pass. Desktop snapshots record no frozen-source changes, page errors or console errors.
- **FAIL.** None in the selected checks.
- **NOT_RUN.** Full local suites, injected late worker replies, Drawing, path tracing, WebGL2, mobile and live providers. First mechanical CAD remains 8/10. Overall completion remains unmeasured. Issue #44 remains open.

## Reproduction

Use Node 22.19.0, the heavy gate, installed desktop Chrome and Playwright, and an external evidence directory. Compare the complete `states`, the Cut oracle hashes, the native file hash, the raster observations and the six PNG files on the base and changed source.

```sh
ASSEMBLY_CUT_SOURCE_FROZEN=1 node apps/cad-studio/test/assembly-cut-browser.mjs "$OUT/cut"
D1024_SOURCE_FROZEN=1 node apps/cad-studio/test/assembly-cut-raster-browser.mjs "$OUT/raster"
D1026_SOURCE_FROZEN=1 node apps/cad-studio/test/assembly-cut-step-browser.mjs "$OUT/step"
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test assembly-cut instance-evaluation draft-selection-history
pnpm exec eslint apps/cad-studio/src/{App.tsx,app/useAssemblyCutEditor.ts}
pnpm --dir apps/cad-studio build
git diff --check
```
