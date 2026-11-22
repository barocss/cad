# D1712 — Extract viewport Hole regions from Studio App

P4 Studio structure, row 22. [Issue #44](https://github.com/barocss/cad/issues/44). Base `68a09d363f09b87321438f63633c93feb64211bb`.

`useViewportHoleRegions` prepares the translucent hole regions from the active feature context or the saved Hole and its selected body. The viewport consumes the same regions. The hook retains the renderer, drawing and sketch guards and the original memo dependencies. `App.tsx` has 3,274 lines, down from 3,286.

## Verification

- **PASS, desktop Studio WebGPU.** Run each of three flows on the base and on the extraction. Two states cover a new Hole that misses the body and its repaired preview. Twelve states cover saved Hole editing, Undo and Redo on X, Y and legacy Z. Four states cover context-menu and snap placement with the corresponding saved feature editor. All 18 complete state records match. The paired 800 × 590 viewport crops have zero changed RGB pixels. Both runs record zero source changes, page errors and console errors.
- **PASS, affected checks.** 64 Studio tests, scoped ESLint, production Studio build and type check, and Git diff check passed.
- **NOT_RUN.** Render, Drawing and Sketch suppression in separate browser flows, full local suites, WebGL2 and mobile. The source retains the original guards. First mechanical CAD remains 8/10. Issue #44 stays open.

## Reproduction

Use Node 22.19.0, the heavy gate, installed desktop Chrome and Playwright, and an external evidence directory. Run these commands on the base and on the extraction into separate directories. Pair the 18 states by label. Compare the state JSON and RGB crops from x=180 to 980 and y=130 to 720.

```sh
HOLE_ATTRIBUTION_FROZEN=1 node apps/cad-studio/test/new-hole-preview-attribution-browser.mjs "$OUT/new"
D1000_SOURCE_FROZEN=1 node apps/cad-studio/test/hole-history-centre-browser.mjs "$OUT/history"
D1179_SOURCE_FROZEN=1 node apps/cad-studio/test/hole-pick-position-browser.mjs "$OUT/placement"
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test hole command-apply history-editor
pnpm exec eslint apps/cad-studio/src/App.tsx apps/cad-studio/src/viewport/useViewportHoleRegions.ts
pnpm --dir apps/cad-studio build
git diff --check
```
