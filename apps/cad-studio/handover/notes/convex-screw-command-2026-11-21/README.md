# D1573 — Author a convex polygon Smooth Screw from one sketch

P5, row 07, [#630](https://github.com/barocss/cad/issues/630). Base `c38ccf7b9cdd7ce9c0f12a0e88625e679508c238`.

Select one standalone straight convex polygon sketch with 5 to 64 sides. Reuse the kernel's exact convexity and external-axis clearance checks. Generate the existing compact Loft section copies with the requested local axis, signed angle and pitch. Recognize this geometry for the terminal History fields. Use the longest original axis radius to recover winding and check all of the generated section coordinates before applying an edit. The command also accepts its rectangle and straight triangle profiles.

- **FAIL, previous desktop behavior.** The palette showed Smooth Screw as unavailable for each selected pentagon and hexagon. Pressing Enter kept the palette open. Each source document kept its one sketch and zero bodies.
- **PASS, actual desktop Chrome.** Open each tilted source sketch and choose Smooth Screw. The internal local axis `(7, -5)` disables Apply and keeps the source document exact. With the axis at `(10, -3)` and pitch `40 mm`, both +360° and −360° form one strict closed native solid with 13 cubic poles per rail. At 121 samples per rail, signed rotation and axial advance are consistent. The maximum authored station error is `1.51e-14 mm` across the measured runs.
- **PASS, actual History, Save and Open.** Save each −360° result and reopen it in a fresh Chrome context. History shows the exact angle and pitch. Change the angle to +360°. The new document and the native digest match direct +360° creation. Change the pitch to 48 mm. The source and generated section sketches keep their exact node data. Save and reopen the edited project in another fresh context. The document and native digest match the edited result. Both product receipts have zero runtime errors, console errors and frozen source changes.

| Profile | Native volume at 40 mm pitch (mm³) | Native volume after 48 mm edit (mm³) | Edited native digest |
| --- | ---: | ---: | --- |
| Pentagon | 1080.13891457498 | 1296.16669748998 | `c2f2dd2feaf636a2ea831444b17c9bbac95db3ff4c47492dabf5307c16f2370b` |
| Hexagon | 1840.23666927590 | 2208.28400313108 | `326e12a15d4b91a899e30d62858df3d2f605652a19dba4afb2bd55c1d4de4396` |

- **PASS, affected checks.** 42 Model tests cover interior and boundary axis refusal, a concave outline, exact History equality with a fresh command and legacy Turn availability. The 22 Kernel API smoke tests, Kernel library build, compiled helper export, 38 Studio tests, Model types, scoped ESLint, Studio build, browser syntax and Git diff pass.
- **NOT_RUN.** Polygon profiles with curved edges, non-rectangular four-sided profiles, reviewed polygon Agent authoring, STEP exchange, mobile and full local suites. #630 remains open.

Use Node 22.19.0 and the installed desktop Chrome and Playwright. Gate heavy runs and keep captures and project files outside Git.

```sh
pnpm --dir packages/barocss-cad-model test smooth-triangular-turn smooth-screw-command smooth-turn-angle api-loft-guide
pnpm --dir packages/barocss-cad-model type-check
SCREW_LOFT_FROZEN=1 node apps/cad-studio/test/external-axis-screw-loft-browser.mjs "$EVIDENCE/pentagon" --single-sketch --pentagon
SCREW_LOFT_FROZEN=1 node apps/cad-studio/test/external-axis-screw-loft-browser.mjs "$EVIDENCE/hexagon" --single-sketch --hexagon
pnpm --dir packages/barocss-cad test:api-smoke
pnpm --dir packages/barocss-cad build:library
pnpm exec eslint packages/barocss-cad-model/src/app/{ruledTurnCommand,smoothLoftTurn}.ts packages/barocss-cad-model/test/smooth-triangular-turn.test.ts apps/cad-studio/test/external-axis-screw-loft-browser.mjs
pnpm --dir apps/cad-studio test viewport display-mode history-feature-apply
pnpm --dir apps/cad-studio build
node --check apps/cad-studio/test/external-axis-screw-loft-browser.mjs
git diff --check
```
