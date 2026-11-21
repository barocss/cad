# D1542 — Verify AP214 exchange for an approved Smooth Turn

P2, row 13, [#630](https://github.com/barocss/cad/issues/630). Base `81be3ebd7895a5aa8ed46ec2c3b22b42d2aeefe4`. Source: the D1541 approved 20 × 8 mm, +360°, 40 mm Smooth Turn beside its Ruled Turn control.

- **PASS, actual desktop Studio export and fresh Open.** Open the approved native document and use Export STEP. The panel reports AP214 B-rep in mm, two root bodies, the omission of native feature history and limits on later edge continuity inspection. The Export button builds the observed local STEP bytes. The browser test captures the emitted blob locally. Open those exact bytes in a fresh Studio context. Both strict solids keep their face counts, edge counts, generated face labels under the Import feature's namespace, and individual volumes. The new document contains one Import feature and no original proposal or feature history.
- **PASS, independent Part 21 graph and numeric read.** A Python standard-library oracle reads the emitted AP214 records with no product imports. It checks the shape's millimetre context, derived validation units, complete face loops and opposite edge uses. The Ruled and Smooth shells have 18/36/20 and 6/12/8 faces, edges and vertices respectively. It verifies four cubic rails with simple interior knots and checks that each support uses the matching two rail control rows. Independent de Boor evaluation agrees with all 52 expected rotated station corners within 1.48e-14 mm. Independent section integral gives 6400.823197481376 mm³ for the Smooth Turn. Native and Studio reopened reads both give 6400.823197481391 mm³. The Ruled Turn reads 2559.9999999999986 mm³ before and after Open.
- **PASS, affected checks.** Ten Model and 16 Studio tests, browser syntax, scoped lint and Git diff. The independent oracle rejects separate length-unit, oriented-edge and knot-multiplicity changes. Studio reports zero runtime errors, console errors and frozen-source edits. Export leaves the approved native document exact.
- **FAIL, corrected test expectation.** The initial fresh Open assertion expected raw source face labels. Studio prefixes the generated labels with the new Import feature ID, and the corrected assertion checks that exact mapping.
- **NOT_RUN.** A separate CAD application's geometry import, local build and types for this test-only change, full local suites, mobile and other renderers. Reopened display density is a separate Model concern. #630 stays open.

Run with Node 22.19.0, installed desktop Chrome and Playwright, and Python 3. Gate heavy work and keep evidence outside Git.

```sh
node packages/barocss-cad-model/scripts/test.mjs step-export-scope smooth-turn-angle
pnpm --dir apps/cad-studio test step-export-preparation step-metadata
pnpm exec eslint apps/cad-studio/test/smooth-turn-step-browser.mjs
node --check apps/cad-studio/test/smooth-turn-step-browser.mjs
git diff --check
TURN_STEP_FROZEN=1 node apps/cad-studio/test/smooth-turn-step-browser.mjs "$EVIDENCE" "$D1541/reviewed-smooth-turn-widened.bcad"
python3 -BI apps/cad-studio/test/smooth-turn-step-oracle.py "$EVIDENCE/approved-turn-from-studio.step"
```
