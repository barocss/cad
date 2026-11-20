# D1418 — Separate SceneViewport selection routing

2026-11-21 · P4, row 22 · Base `de5e567f671597b4c02d4a225e98630749c99932`

`sceneSelection` resolves which editor receives a pick. An active History preview takes precedence, followed by Draft face replacement, finish-edge replacement, and proposal-instance protection. The selector supplies the active filter and the displayed selection together through `modelSelection`. SceneViewport passes these to the existing renderer and pointer input. The SceneViewport JSX call in App went from 82 to 74 attributes including ref. App went from 3953 to 3950 lines.

- **PASS, baseline comparison.** Before and after, the same 22 actual desktop crossing-box checkpoints had identical document, selection, History and notice values. The test covers triangle crossings, holes, partial and contained windows, additive selection, hidden bodies, filter switches, active commands, and Open.
- **PASS, desktop Studio.** Five final Chrome flows passed. The pointer test covers wheel, captured pan, window selection, and the Width X drag from 10 to 11 mm with Undo. The resulting box volume was 1100 mm³. Held variable Fillet edge replacement, cancel during pending evaluation, native checks and reopen passed. Both Band rails remained pickable with their source cylinders hidden. The single-plane instance section passed with ordinary WebGPU and the forced CPU route inside WebGPU, including Save and fresh Open. All five receipts had zero page errors, console errors and watched source changes.
- **PASS, affected checks.** ESLint, 24 focused Studio tests, `git diff --check`, and Studio production build including type-check passed.
- **FAIL, intermediate.** The first type-check found four test calls missing the profile selection's additive argument. The calls were corrected before the final build and browser checks.
- **NOT_RUN.** Full local suites, actual WebGL2 and mobile.

Run with Node 22.19.0, configured desktop Chrome and Playwright, and output outside the repository. Use the heavy gate for one browser flow at a time. Run the same crossing command at the baseline and candidate for comparison.

```sh
pnpm exec eslint apps/cad-studio/src/App.tsx apps/cad-studio/src/viewport/{SceneViewport.tsx,sceneSelection.ts,useViewportPicking.ts} apps/cad-studio/test/scene-selection.test.ts
node apps/cad-studio/scripts/test.mjs scene-selection box-selection held-finish-replacement held-draft-face-replacement
cd apps/cad-studio
pnpm build
D719_SOURCE_FROZEN=1 node test/crossing-box-selection-browser.mjs "$OUTPUT/crossing"
D555_SOURCE_FROZEN=1 node test/viewport-pointer-boundary-browser.mjs "$OUTPUT/pointer"
HELD_VARIABLE_FILLET_FROZEN=1 node test/held-variable-fillet-replacement-browser.mjs "$OUTPUT/held-fillet"
D1147_SOURCE_FROZEN=1 node test/band-rail-zoom-browser.mjs "$OUTPUT/band" --display
SECTION_SELECTIVE_FROZEN=1 node test/section-selective-instance-browser.mjs "$OUTPUT/section"
```
