# D1416 — Reference-plane Offset face on an axis-aligned hexagonal wall

2026-11-21 · P5, row 31 · [#17](https://github.com/barocss/cad/issues/17)

Starting main `b03285121fdd19839f579f109f508f3ae94489b4` admitted a signed distance on the axis-aligned wall. On actual desktop Studio the new command displayed only Offset. History could select and preview the same parallel reference. The new command now follows the existing native direct-offset source rule for straight hexagonal extrusions. Both axis-aligned and oblique upright walls offer **To plane**. Z caps retain the distance-only recipe.

- **PASS, desktop Studio.** In Chrome at 1440 × 1000, selected `n1.side0` by clicking the canvas. The command refused the reference solid's perpendicular cap. It accepted `n3.side0` at y = −1 mm. Moving the reference solid by +2 mm in Y drove the existing feature to y = +1 mm. History retargeted the feature to `n3.side2` at y = +6 mm and retained the feature ID. Undo, Redo, Save and fresh Open retained the accepted document. A separate file whose reference collapsed the wall at y = +8 mm was refused and left the open document intact. The existing oblique fixture passed the same lifecycle. Both runs recorded zero page errors, console errors and watched source changes.
- **PASS, independent geometry.** For signed move d, the wall is at y = −d and its lower endpoints are (3d/4, −d) and (18 − 3d/4, −d). The independent volume is 3840 + 180d − 7.5d² mm³. At d = +1, −1 and −6 mm the native and Studio volumes were 4012.5, 3652.5 and 2490 mm³. The face trim and control points agreed with the reference support within 8.89 × 10⁻¹⁶ mm. The native incidence digest stayed constant across all three moves and fresh Open. The strict B-rep count stayed at 8 faces, 18 edges, 12 vertices and 36 coedges.
- **PASS, affected checks.** 47 Model and 8 Studio tests, scoped ESLint, browser script syntax check, Model type-check and Studio production build including type-check passed.
- **FAIL, at baseline.** The new focused test detected the missing Mode field. The exploratory Studio flow confirmed the missing field and also timed out in History because its locator expected a bare face name. The final flow checks the face name inside the full reference label.
- **NOT_RUN.** Full local suites, mobile and STEP export. The wider #17 direct-editing scope remains open.

Run with Node 22.19.0, a configured desktop Chrome and Playwright, and an output directory outside the repository. Run the two browser flows in sequence under the heavy gate.

```sh
pnpm exec eslint packages/barocss-cad-model/src/app/profileCommands.ts apps/cad-studio/test/offset-hex-side-feedback.test.ts
node --check apps/cad-studio/test/offset-to-plane-browser.mjs
node packages/barocss-cad-model/scripts/test.mjs offset-to-plane native-offset-face offset-face
node apps/cad-studio/scripts/test.mjs offset-hex-side-feedback offset-face-launch-view
pnpm --filter @barocss/cad-model type-check
cd apps/cad-studio
pnpm build
D1265_SOURCE_FROZEN=1 node test/offset-to-plane-browser.mjs "$OUTPUT/axis" axis
D1265_SOURCE_FROZEN=1 node test/offset-to-plane-browser.mjs "$OUTPUT/oblique"
```
