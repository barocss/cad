# D2064 — Set a tangent Fillet endpoint along its verified direction

P1 [row 09](../../roadmap-rows/09.md) · [#763](https://github.com/barocss/cad/issues/763) · Reproduced on `cfdb060a258a63f1bd4747a418e9620c32372175`.

In a saved XY outline with an R6 quarter-circle Fillet, point 4 is (34, 30) mm. The mobility panel correctly reports motion parallel to sketch Y. Entering Y40 in the point field instead gave Y36.25. The old field moved the solver seed, and the numeric solve settled its coupled points to a different height from the requested input.

For the original endpoint of a verified saved tangent Fillet in an eligible active outline, solve the typed coordinate with the existing finite point-drag path. Accept the result only if its coordinate reaches the entered value within linear tolerance. A pointer can use the local direction for projection. The coordinate field keeps its own axis and reports a refusal if the validated result does not reach it. The same draft owner and history receive the verified shape. Existing non-Fillet fields keep their prior behavior.

## Verification

- **PASS, actual desktop direction and refusal.** Focusing the vertical mobility row highlights point 4. Typing X40 retains (34, 30), the model and the Undo/Redo controls, and reports the requested coordinate without naming an unproved constraint.
- **PASS, actual desktop numeric and drag parity.** Typing Y40 places point 4 at (34, 40). A physical drag towards (40, 40) projects to the same point and gives the same five outline coordinates. The typed edit has its own Undo/Redo step. Cancelling a drag restores the starting outline. The committed drag has its own Undo/Redo step. The ordinary straight point-drag control passes in the same run.
- **PASS, native geometry.** The retained quarter cylinder has radius 6 mm and centre (34, 34) mm. Its carrier planes remain tangent, and the source side IDs, radius, tangent constraints and 10 mm Extrude survive native Save and fresh Open. The strict solid measures 15922.743338823082 mm³, in agreement with `10 * (40 * 40 - 6² + 9π)`. Its reopened native SHA-256 is `a4b788723fa0002c90ad7d356bb9db9027b02aaa76ba359e0d743b9c4bc61dcd`.
- **PASS, feature checks.** Studio 22/22, Model point-drag 6/6, scoped ESLint, browser-driver syntax, Studio type check, production build and diff check. The actual desktop run retained 1,254 source files through cleanup with zero page or console errors.
- **FAIL, initial checks.** The baseline desktop run stops at Y36.25 as expected for the reproduced defect. The first feature type check found that a test assertion narrowed the collected changes to an empty tuple. Checking the length instead restores the intended type and retains the assertion.
- **NOT_RUN.** General non-tangent point drag, full local suites and mobile. The first mechanical CAD baseline remains 8/10. Overall CAD completion is unmeasured.

[D2063](../fixed-arc-radius-conflict-2026-11-27/README.md) covers the original #763 refusal, exact Fix lookup, explicit removal and persistence case. D2064 covers the remaining supported numeric and finite drag comparison. The unrelated curvilinear solver scope stays with [#172](https://github.com/barocss/cad/issues/172).

```sh
# Node 22.19.0. Gate heavy work and use the existing local Chrome and Playwright.
D1698_SOURCE_FROZEN=1 node --import "$LOCAL_PLAYWRIGHT_PRELOAD" apps/cad-studio/test/sketch-point-drag-browser.mjs "$OUT/final"
node --check apps/cad-studio/test/sketch-point-drag-browser.mjs
pnpm --dir apps/cad-studio test constraint-list panel-opposing-length coordinate-feedback
pnpm --dir packages/barocss-cad-model test sketch-point-drag
tsc --noEmit -p apps/cad-studio
pnpm --dir apps/cad-studio exec vite build --outDir "$OUT/studio-dist"
git diff --check
```

The baseline desktop receipt SHA-256 is `579d580c27609ca48dac2ec8b643a93886de78b6f55a0789db09fa03bb51f6b3`. The final desktop receipt SHA-256 is `fcfe579e5f2b88b9bd0361dd7e4034ae2f77e28473b893aaab273bba9caa45f6`.
