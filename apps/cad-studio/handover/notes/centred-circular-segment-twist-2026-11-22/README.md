# D1587 — Build a centred circular-segment Twist through Smooth Loft

P5, row 07, [#630](https://github.com/barocss/cad/issues/630). Base `0ee458f4dcb4866616b3dcfca355605adfab916e`.

Admit matching closed line-and-arc sections rotating about their fixed analytic area centroid. Reuse the compact rational Loft construction and shared cap and wall controls. Confirm that each section keeps the same centre and follows one signed angular law. Use all adjacent signed phase increments to recover that law on the centred path. Retain the existing angular residual and station-step limits.

- **FAIL, previous desktop Studio.** Both 13-section inputs at ±360° exceeded the native surface pole limit. Apply stayed disabled and the sources stayed exact.
- **FAIL, initial tilted projection.** The first compact candidate built +360° in Studio. The −360° source still failed both real Studio and the matching Model regression. Extrapolation from the rounded first step gave a factor residual of 1.252009e-9. Recovering the step from all signed increments gave 3.145906e-10 against the existing 1e-9 limit.
- **PASS, actual desktop Studio WebGPU.** Preview, Apply, Save and fresh Open the original +360° and −360° input sets over 40 mm. Each final result is one strict closed solid with 5 faces, 9 edges, 6 vertices and three shared cubic rails. Each saved document and native digest match after Open. The largest authored station error is 1.386e-9 mm. At the authored stations the measured area-centroid deviation is below 4.34e-10 mm. The two arc walls share a zero-gap seam with unit tangent differences below 7.71e-15.
- **PASS, independent volume and native controls.** The D1582 analytic segment area and independent squared cubic rotation integral give 221.13498549200997 mm³. The Studio results give 221.13498541494673 and 221.13498541494658 mm³, within 7.71e-8 mm³. Direct Kernel tests sample the straight centroid path and circular sections at 121 heights, including a translated axis. The regressions detect a disabled centred path and an arbitrary interior pivot. The Model's single-sketch Screw still refuses a pivot inside the supporting disc, including the exact segment centroid.
- **PASS, affected checks.** 8 focused Kernel, 50 Model and 38 Studio tests, Kernel and Model types, scoped ESLint, Studio build, browser syntax and Git diff. Final Studio receipts have zero runtime errors, console errors and frozen source changes.
- **NOT_RUN.** One-sketch Smooth Turn authoring and History for the circular segment, Agent and STEP exchange for the centred case, mobile and full local suites. #630 remains open.

Use Node 22.19.0 and installed desktop Chrome and Playwright. Gate heavy runs and keep native files, screenshots and mutated files outside Git.

```sh
pnpm --dir packages/barocss-cad exec node scripts/tool.mjs build:fast
node --test --test-concurrency=1 packages/barocss-cad/test/smooth-rectangular-turn.test.mjs
pnpm --dir packages/barocss-cad-model test smooth-screw-command smooth-turn-angle smooth-triangular-turn api-loft-guide
pnpm --dir packages/barocss-cad type-check
pnpm --dir packages/barocss-cad-model type-check
pnpm exec eslint packages/barocss-cad/src/features/{loft,loft-rectangular-turn}.ts packages/barocss-cad/test/smooth-rectangular-turn.test.mjs packages/barocss-cad-model/src/app/lineArcScrew.ts packages/barocss-cad-model/test/smooth-screw-command.test.ts apps/cad-studio/test/external-axis-screw-loft-browser.mjs
SCREW_LOFT_FROZEN=1 node apps/cad-studio/test/external-axis-screw-loft-browser.mjs "$EVIDENCE/studio" --centred-line-arc
pnpm --dir apps/cad-studio test viewport display-mode history-feature-apply
pnpm --dir apps/cad-studio build
node --check apps/cad-studio/test/external-axis-screw-loft-browser.mjs
git diff --check
```
