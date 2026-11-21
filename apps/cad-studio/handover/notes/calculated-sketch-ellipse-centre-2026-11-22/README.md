# D1616 — Place an Ellipse centre at a calculated sketch point

P1, row 09, [#229](https://github.com/barocss/cad/issues/229). Base `3dc4e2d0a0f530f517e9d2a6771157b061e30681`.

Two-point snap can start an ordinary Ellipse. The calculated point takes the place of the first centre pick. The next two pointer picks set the semi-axes as before. The point is consumed once and does not add a separate history step. An existing Ellipse draft keeps its centre.

- **PASS, desktop Studio WebGPU.** Apply the 0.25 position of the construction segment from (0, 0) to (31, 12) mm with the 1 mm grid active. Studio keeps the centre at (7.75, 3) mm, then completes Rx 12.25 mm and Ry 6 mm with two ordinary picks. Finish, Undo, Redo, Save and fresh Open retain the construction line and editable ellipse definition.
- **PASS, native curve consumer.** Use Make curves on the reopened sketch. The rational quadratic curve has bounds X [−4.5, 20] mm and Y [−3, 9] mm. In 129 samples the maximum residual against the independent implicit ellipse equation is 9.053e−11, within the existing 1e−9 limit. The conversion leaves the sketch nodes identical. Both native curves match after saving and opening the converted document.
- **PASS, affected checks.** 22 Studio and 24 Model tests, scoped lint, Studio types and build, browser syntax and Git diff. The production hook transfers the point once and rejects a replaced sketch. The final actual run checks 1,014 frozen files and records zero runtime errors, console errors and file changes.
- **FAIL, baseline and harness corrections.** Ellipse was absent from the calculated first-point tool gate. Initial browser attempts stopped on an inspector import, a sketch History selector and a curve identification assertion. The final run uses the public sketch History button and identifies the rational curve by its weights.
- **NOT_RUN.** Other working planes, ellipse solid accuracy, other renderers, mobile and full local suites. #229 remains open.

Use Node 22.19.0 and installed desktop Chrome and Playwright. Use the heavy gate and keep screenshots outside Git.

```sh
pnpm exec eslint apps/cad-studio/src/{sketch/useTwoPointSnap.ts,viewport/viewportPointerInput.ts} apps/cad-studio/test/{two-point-snap-ownership.test.ts,two-point-snap-ellipse-browser.mjs}
pnpm --dir apps/cad-studio test two-point-snap ellipse-draft ellipse-placement draft-history
pnpm --dir packages/barocss-cad-model test sketch-ellipse sketch-osnap
pnpm --dir apps/cad-studio build
node --check apps/cad-studio/test/two-point-snap-ellipse-browser.mjs
D1616_SOURCE_FROZEN=1 node apps/cad-studio/test/two-point-snap-ellipse-browser.mjs "$EVIDENCE"
git diff --check
```
