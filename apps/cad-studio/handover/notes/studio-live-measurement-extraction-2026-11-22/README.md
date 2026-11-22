# D1663 — Extract Studio live measurement

P4, row 22. Base `847b818831776361c912ec90a4f4515125495baf`.

Move current target resolution, selection, readout and distance provenance to `useLiveMeasurement.ts`. App supplies the workspace eligibility and the current source snapshot. The viewport picker uses the same evaluated occurrence map as the readout. Live and pinned measurements use the same overlay formatter. App.tsx decreases from 3,427 to 3,412 lines.

- **FAIL, initial baseline driver.** The driver attempted to parse a displacement containing the displayed `mm` suffix as a number. Three assertions now check the complete signed displacement text. The second baseline ran with the original product source.
- **PASS, affected checks.** 15 Studio tests, scoped ESLint, driver syntax, Studio type check and production build, and Git diff check.
- **PASS, actual desktop Studio WebGPU.** Six flows pass before and after. They cover measurement in both directions between the base part and a placed part, the placed-face context menu, the curved-face approximation, the context measurement pin through edit, Undo and Redo, original section-face picks with generated-cap exclusion, and target suppression and recovery.
- **PASS, equivalence.** All 26 captured state records match field for field across the six flows (5 + 4 + 1 + 4 + 4 + 8). Recorded observations also match. The placed pair reads 20.62 mm, with a 5 mm normal distance and a signed displacement of `20, 0, 5 mm` in the reverse direction. The coaxial curved-wall readout reports `5.38 mm (mesh approximation)` and displays `≈5.38 mm` on the canvas. A suppressed target clears the distance and overlay until Undo restores it or the user picks a new target. Each run freezes 632–633 files with zero source changes, page errors or console errors.
- **NOT_RUN.** Full local suites, WebGL2 and mobile.

Use Node 22.19.0, the heavy gate, installed Chrome and Playwright (`CHROME`, `PW_DIR`), and output directories outside Git. Run the same desktop commands on the base with the corrected driver and on the revised product source.

```sh
pnpm exec eslint apps/cad-studio/src/App.tsx apps/cad-studio/src/state/useLiveMeasurement.ts apps/cad-studio/test/measure-placed-face-browser.mjs
node --check apps/cad-studio/test/measure-placed-face-browser.mjs
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test measure-pick-hint pinned-face-measure measure-quantity-text measure-secondary-units section-selective-core
pnpm --dir apps/cad-studio build
D1036_SOURCE_FROZEN=1 node apps/cad-studio/test/measure-placed-face-browser.mjs "$OUT/placed"
D1040_SOURCE_FROZEN=1 node apps/cad-studio/test/measure-placed-face-browser.mjs "$OUT/placed-menu" --context
D1037_SOURCE_FROZEN=1 node apps/cad-studio/test/measure-curved-provenance-browser.mjs "$OUT/curved" --fixed
D1038_SOURCE_FROZEN=1 node apps/cad-studio/test/measure-context-pin-browser.mjs "$OUT/pin"
D1013_SOURCE_FROZEN=1 node apps/cad-studio/test/section-original-measure-browser.mjs "$OUT/section"
D1035_SOURCE_FROZEN=1 node apps/cad-studio/test/measure-target-suppression-browser.mjs "$OUT/suppressed" --fixed
git diff --check
```
