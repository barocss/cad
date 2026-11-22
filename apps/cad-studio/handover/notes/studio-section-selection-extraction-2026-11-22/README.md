# D1655 — Extract Studio section selection mapping

P4, row 22. Base `6a4ce94b2c1e4ce20821bf71e2e73ce815026cde`.

`useSectionSelection` groups retained edge mapping, original face lookup, the generated-cap distinction and section selection display. App supplies the current section and source bodies and connects the result to the viewport. App.tsx decreases from 3,459 to 3,431 lines.

- **PASS, focused checks.** 16 Studio tests, scoped ESLint, Studio type check and production build, and Git diff check.
- **PASS, actual desktop Studio WebGPU.** Ran the three original face, edge and measurement flows before and after the change. The retained edge maps to its source and measures 20 mm. A trimmed edge and a generated cut rim do not enter the active measurement. The generated cap keeps its context menu. Left and right picks on surviving faces return the original face, and the original-face Hole entry still edits the intended body.
- **PASS, equivalence.** All 15 checkpoints match for the document, bodies, selection, History and available section and measurement readouts. The two original face areas are 800 and 760 mm², the distance is 12.81 mm, the normal distance is 8 mm and the angle is 0°. The overlay still shows 12.81 mm. Each final flow records 630 unchanged frozen files and zero source changes, page errors or console errors.
- **FAIL.** Zero failures in the executed checks.
- **NOT_RUN.** Full local suites, WebGL2, mobile and unrelated Studio flows.

Use Node 22.19.0, the heavy gate, installed Chrome and Playwright (`CHROME`, `PW_DIR`) and output directories outside Git. Run the same desktop commands on the base and the changed source with distinct output directories.

```sh
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test section-cutout section-face-pick-escape section-planes section-selective-core measure-pick-hint pinned-face-measure
pnpm exec eslint apps/cad-studio/src/{App.tsx,viewport/useSectionSelection.ts,viewport/useViewportPicking.ts}
pnpm --dir apps/cad-studio build
D1010_SOURCE_FROZEN=1 node apps/cad-studio/test/section-original-face-browser.mjs "$OUT/face"
D1016_SOURCE_FROZEN=1 node apps/cad-studio/test/section-original-edge-browser.mjs "$OUT/edge"
D1013_SOURCE_FROZEN=1 node apps/cad-studio/test/section-original-measure-browser.mjs "$OUT/measure"
git diff --check
```
