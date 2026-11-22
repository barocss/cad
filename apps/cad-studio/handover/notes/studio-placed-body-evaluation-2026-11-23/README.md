# D1727 — Extract placed-body evaluation and Assembly Cut preview from Studio App

P4 Studio composition, row 22. [Issue #44](https://github.com/barocss/cad/issues/44). Base `7ca39d9f54aa956771458d758063f405049abe7b`.

Move the placed-body worker lanes and the separate Assembly Cut preview cache into `usePlacedBodyEvaluation`. App supplies the current document, worker session, and accepted result cache. The hook supplies the source contexts, viewport bodies, and accepted Render readiness. It retains the original effect triggers, per-occurrence cancellation, source checks and cache key sequence. App retains mass-result handling and feature edit actions. App.tsx decreases from 3,265 to 3,214 lines.

## Verification

- **PASS, desktop Studio WebGPU, before and after.** All nine Assembly Cut checkpoints and all six raster checkpoints match as complete recorded Studio state objects. The cut flow previews a Ø8 cut over two 60 × 40 × 5 mm placed plates, edits to one target, runs Undo and Redo, saves, opens a fresh context and deletes the cut. Five independent volume oracle inputs and outputs match. The native saved file hash matches. A whole plate measures 12,000 mm³ and a cut plate measures 11,748.672587712817 mm³.
- **PASS, raster proof.** All six exported PNG files match byte for byte between base and changed source. While an unapplied Ø12 edit stays visible in Model, Render and its PNG still use the applied Ø8 cut. The original two fixture definitions and authored placements match.
- **PASS, affected desktop STEP control.** Eight application checkpoints cover stock, an unapplied draft, an applied cut, an unaccepted edit, Cancel, Undo, Redo and fresh native Open. The built-in STEP readback checks body boundaries and confirms only the accepted cut appears. This control runs on the changed source.
- **PASS, affected checks.** 18 Studio tests for Assembly Cut, Browser reveal and instance evaluation. Scoped ESLint, Studio production build and types, and Git diff check pass. Source, page and console checks pass in all desktop runs.
- **FAIL.** None in the selected checks.
- **NOT_RUN.** Full local suites, injected stale worker replies, Drawing and path tracing, WebGL2, mobile and live providers. The first mechanical CAD baseline remains 8/10. Overall completion remains unmeasured. Issue #44 remains open.

## Reproduction

Use Node 22.19.0, the heavy gate, installed desktop Chrome and Playwright, and an external evidence directory. Run the Cut and raster flows on the base and the changed source. Compare `states`, the Cut oracle inputs and outputs, the native saved file hash, raster observations and the six exported PNGs.

```sh
ASSEMBLY_CUT_SOURCE_FROZEN=1 node apps/cad-studio/test/assembly-cut-browser.mjs "$OUT/cut"
D1024_SOURCE_FROZEN=1 node apps/cad-studio/test/assembly-cut-raster-browser.mjs "$OUT/raster"
D1026_SOURCE_FROZEN=1 node apps/cad-studio/test/assembly-cut-step-browser.mjs "$OUT/step"
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test assembly-cut body-browser-reveal instance-evaluation
pnpm exec eslint apps/cad-studio/src/{App.tsx,app/usePlacedBodyEvaluation.ts}
pnpm --dir apps/cad-studio build
git diff --check
```
