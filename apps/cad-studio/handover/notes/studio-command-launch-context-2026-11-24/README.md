# D1863 — Extract Studio command launch context from App

P4 [row 15](../../roadmap-rows/15.md), [row 16](../../roadmap-rows/16.md) and [row 22](../../roadmap-rows/22.md), [#44](https://github.com/barocss/cad/issues/44). Base `aa809e6b3bf4e1ca1fe9976428d1f6c7ff0d3688`.

The command launch module now matches the explicit cut source against the current document and selection. It then prepares the input context for a specific tool. The pre-availability guard and later context capture keep their existing order. App retains work ownership, mode changes, focus and preview timing. App.tsx falls from 2,847 to 2,825 lines.

- **PASS, actual desktop Studio.** Browser and History both refuse an earlier cut outside the admitted range and leave the current document, selection and History intact. Selecting the body restores the ordinary Path command. The admitted first-of-three quadratic Path retains its original source through edit and fresh Open.
- **PASS, actual desktop Studio.** Split uses the picked native plane, refuses the tangent control, then preserves the original reference box when the valid split is applied and its height edited. Extrude to face retains the exact annular reference, both coverage refusals and native fresh Open.
- **PASS, affected checks.** Eight Studio tests, 26 recorded states across four source-frozen desktop runs, Studio types and production build, scoped lint and Git diff check.
- **FAIL.** None in the affected checks.
- **NOT_RUN.** Whole local suites, other renderers, mobile and live providers. Bearing, Loft, Hole and linked inset lack a fresh desktop run in this refactor. Their launch context expressions were retained. #44 remains at 211/220. First mechanical CAD remains 8/10. Whole-product completion remains unmeasured.

```sh
pnpm --dir apps/cad-studio test command-build-failure extrude-end-face-pick split-source-receipt loft-two-guide-feedback
pnpm --dir apps/cad-studio build
HISTORY_CUT_SOURCE_FROZEN=1 node apps/cad-studio/test/history-cut-source-browser.mjs "$OUT/farther-source"
D1862_SOURCE_FROZEN=1 node apps/cad-studio/test/prior-path-cut-pattern-browser.mjs "$OUT/quadratic" --quadratic
D1197_SOURCE_FROZEN=1 node apps/cad-studio/test/split-picked-plane-browser.mjs "$OUT/split"
D1861_SOURCE_FROZEN=1 node apps/cad-studio/test/annular-face-end-extrude-browser.mjs "$OUT/annular-extrude" --circle
git diff --check
```
