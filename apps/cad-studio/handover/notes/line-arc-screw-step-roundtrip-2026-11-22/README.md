# D1585 — Qualify circular-segment Screw AP214 exchange

P2, row 13, [#630](https://github.com/barocss/cad/issues/630). Base `9137e74ea953237ad43329a78a72fe17fecbb214`.

Use the approved D1584 circular-segment project. Export −450° and the +450° History edit at 40 mm pitch and 50 mm advance. Read the exact AP214 bytes independently and reopen them in fresh desktop Studio sessions.

- **PASS, actual desktop Studio WebGPU.** Export one AP214 B-rep solid in millimetres for each winding. Studio discloses feature history, semantic PMI and named datum transfer limits. Both exports retain the working documents. Opening each exact file yields one strict closed solid with 5 faces, 9 edges and 6 vertices.
- **PASS, independent reader.** Check cyclic oriented shell incidence, three cubic rails, one chord wall, two rational quadratic arc walls and four rational quadratic cap edges. The stored degrees, knots, weights and control rows share the same signed rotation. The independent Bernstein test proves the sign over every rail knot span. Derived winding is ±450° and the largest station error is below 3.2e-14 mm. Across 558 rational wall samples per file, the largest circular-section or axial error is below 1.6e-14 mm. The split seam has zero gap and tangent differences below 3.1e-14.
- **PASS, independent volume.** Four-point Gauss integration per cubic knot span of the squared common rotation factor, multiplied by the analytic circular-segment area and height, gives 276.39931201638126 mm³ for both files. The largest difference from the serialized volume is 2.786e-12 mm³.
- **PASS, native reread.** The two wall knot and weight grids and all four cap weight sets match the source. Compare 121 points per rail, 153 per rational wall and 33 per cap arc. The negative file matches all sampled source positions exactly. The positive file differs by at most 3.553e-15 mm on rails and cap arcs and 7.161e-15 mm on walls. The reopened volumes are 276.3993120163786 and 276.3993120163814 mm³.
- **FAIL, viewport parity.** The authored views use additional display meshes of 39,298 and 36,454 triangles. Fresh STEP Open gives the base display only, with 2,904 and 2,881 vertices. The reopened contours display visible facets. D1586 measures and addresses the display gap.
- **PASS, affected checks.** Both independent files reject all 10 targeted mutations. The four signed D1580 trapezoid and skew quadrilateral controls pass the retained reader. 43 Studio tests, scoped ESLint, browser syntax and Git diff pass. Both final browser receipts have zero runtime errors, console errors and frozen source changes.
- **NOT_RUN.** Third-party STEP producers or readers, fixed-camera rail error and cross-renderer parity, mobile and full local suites. #630 remains open.

Use Node 22.19.0, installed desktop Chrome and Playwright, and Python without product imports. Gate heavy runs and keep AP214 exports, native files and screenshots outside Git.

```sh
TURN_STEP_FROZEN=1 node apps/cad-studio/test/smooth-turn-step-browser.mjs "$EVIDENCE/negative" "$APPROVED" --line-arc-screw-negative
TURN_STEP_FROZEN=1 node apps/cad-studio/test/smooth-turn-step-browser.mjs "$EVIDENCE/positive" "$APPROVED" --line-arc-screw-positive
python3 -BI apps/cad-studio/test/smooth-turn-step-oracle.py "$NEGATIVE_STEP" --line-arc-screw-negative --selftest
python3 -BI apps/cad-studio/test/smooth-turn-step-oracle.py "$POSITIVE_STEP" --line-arc-screw-positive --selftest
pnpm --dir apps/cad-studio test viewport display-mode step-export-preparation
pnpm exec eslint apps/cad-studio/test/smooth-turn-step-browser.mjs
node --check apps/cad-studio/test/smooth-turn-step-browser.mjs
git diff --check
```
