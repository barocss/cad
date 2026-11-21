# D1590 — Qualify centred circular-segment Twist AP214 exchange

P2, row 13, [#630](https://github.com/barocss/cad/issues/630). Base `b02f70ef5328008994c0c9c65c4999b58b4c61a9`.

Use the D1589 approved project. Export the −450° Twist and reverse it to +450° in History at the same 50 mm total height. The fixture uses a tilted circular-segment section, 16 stations and a fixed area centroid. This item adds verification only.

- **PASS, desktop Studio WebGPU.** Studio exports one AP214 B-rep solid in millimetres in each direction and keeps the working document. The export panel declares native feature history, semantic PMI, named datums and continuity inspection limits. Fresh Open reads the exact exported bytes into one strict closed solid with 5 faces, 9 edges, 6 vertices and 18 coedges.
- **PASS, independent reader.** The oriented shell contains three cubic rails, two rational quadratic arc walls, one chord wall and four rational quadratic cap edges. The signed angular Bernstein bound certifies all knot spans. The maximum station error is 1.63e−14 mm. Across 558 wall samples per file, the maximum support error is 2.05e−14 mm. The shared arc seam has zero gap and tangent difference below 3.14e−14.
- **PASS, independent centroid and volume.** The reader recovers circle centres and segment area centroids from 130 axial samples per file. It also derives centroid poles directly from the rational controls. The nonnegative cubic basis bounds the full-path centroid error to 2.26e−14 mm. Independent quadrature gives 276.39931201638166 and 276.39931201638177 mm³ for −450° and +450°. The maximum difference from the stored value is 1.31e−12 mm³.
- **PASS, native reread.** Wall knot and weight grids and cap weight sets agree. Against the native source, the largest differences are 1.44e−14 mm across 121 samples per rail, 2.14e−14 mm across 153 samples per wall and 1.43e−14 mm across 33 samples per cap arc. Reopened volumes are 276.3993120163829 and 276.3993120163828 mm³.
- **PASS, affected checks.** Both centred files reject all 11 oracle mutations. A common interior control-column translation preserves the cap endpoints, weights and shared boundaries and trips the independent centroid check at 0.010000000000001119 mm. Both circular-segment Screw controls also reject their 10 mutations each. All four D1580 quadrilateral exchange controls pass. 43 targeted Studio tests, scoped ESLint, browser syntax and Git diff checks pass. Both passing browser receipts have zero console errors, runtime errors and frozen source changes.
- **FAIL, first +450° desktop attempt.** The History button click exceeded the 30 s browser timeout. A fresh run of the same final source and fixture passed the complete flow.
- **FAIL, display refinement parity.** The authored display uses 20,850 and 15,110 refined triangles. The two STEP imports use the base display with 1,330 and 1,219 visible mesh vertices. D1591 measures fixed-camera rail error and native pick stability.
- **NOT_RUN.** Third-party STEP readers or producers, fixed-camera and WebGL2 parity, mobile and full local suites. #630 remains open.

Use Node 22.19.0, installed desktop Chrome and Playwright, and Python without product imports. Gate the affected checks and browser runs. Store exports, native files and screenshots outside Git.

```sh
TURN_STEP_FROZEN=1 node apps/cad-studio/test/smooth-turn-step-browser.mjs "$EVIDENCE/negative" "$APPROVED" --centred-line-arc-negative
TURN_STEP_FROZEN=1 node apps/cad-studio/test/smooth-turn-step-browser.mjs "$EVIDENCE/positive" "$APPROVED" --centred-line-arc-positive
python3 -BI apps/cad-studio/test/smooth-turn-step-oracle.py "$NEGATIVE_STEP" --centred-line-arc-negative --selftest
python3 -BI apps/cad-studio/test/smooth-turn-step-oracle.py "$POSITIVE_STEP" --centred-line-arc-positive --selftest
pnpm --dir apps/cad-studio test viewport display-mode step-export-preparation
pnpm exec eslint apps/cad-studio/test/smooth-turn-step-browser.mjs
node --check apps/cad-studio/test/smooth-turn-step-browser.mjs
git diff --check
```
