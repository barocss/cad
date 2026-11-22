# D1641 — Cut the axial end of an Exact semicylinder Thicken

P5, row 08. [#175](https://github.com/barocss/cad/issues/175) and [#368](https://github.com/barocss/cad/issues/368). Base `913e0a0d25f0e765b6e8d51d8206a1c4dccc5138`.

The fixture uses the two-quarter semicircular support from D1635, with outer radius 10 mm, inner radius 8 mm and axial extent 0–12 mm. Studio **Combine → Subtract** uses the existing analytic Boolean with the wall as the target and a rectangular extruded tool. The tool clears the full XY section and reaches beyond the top of the wall.

- **PASS, actual Studio WebGPU.** Created the Cut with both original operands. Edited the cutter's Start Z from 8 to 6 mm in History, then verified Undo, Redo, native Save and fresh Open. The rebuilt file has one output with the same editable Thicken, Extrude and Cut chain. Studio checked 1,163 frozen files with zero source changes, page errors or console errors.
- **PASS, native topology and edges.** Both outputs are strict closed solids of genus 0, with six faces, 12 edges and eight vertices. The cylindrical faces retain `n0.normal` and `n0.reverse`, their radii and their opposing outward senses. The radial side faces and original bottom remain. The old upper cap is replaced by the cutter's `n2.bottom`, with outward normal +Z. The two quadratic rim curves have radii 8 and 10 mm at 17 evaluated parameters each and meet the crown of the corresponding semicircle. Two 2 mm radial edges close the new cap.
- **PASS, independent measurements.** The half-annulus volume is `18πh` mm³. Native and Studio volumes are 452.3893421169297 and 339.2920065876959 mm³ at the two heights. Each agrees within 1e−8 mm³, and the native centroid matches `[20, 20 + 488/(27π), h/2]` within 1e−8 mm. Fresh Open reproduces B-rep digest `5351e879b33a029ebed9e955911e86b56334a153eb2cec52b16e43435fc8e0ba`.
- **PASS, affected checks.** Native Model probe at both heights, browser syntax, scoped ESLint and Git diff check. The browser flow records a reusable regression for the existing product path.
- **FAIL, corrected comparison.** A supplementary numeric check first required exact binary64 equality for the centroid. The 8 mm result was 4.000000000000003 mm in Z. The comparison passed with the same 1e−8 mm bound used by the browser regression.
- **NOT_RUN.** Full local suites, WebGL2, other cutter orientations, partial footprint cutters and paid live models. The linked issues remain open.

Use Node 22.19.0, installed Playwright and Chrome (`PW_DIR`, `CHROME`), the heavy gate and an output directory outside Git.

```sh
node --check apps/cad-studio/test/exact-cylinder-axial-cut-browser.mjs
pnpm exec eslint apps/cad-studio/test/exact-cylinder-axial-cut-browser.mjs
D1641_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-cylinder-axial-cut-browser.mjs "$OUT"
git diff --check
```
