# D1549 — Verify AP214 exchange of the approved triangular Smooth Turn

2026-11-21 · P2 · [Roadmap row 13](../../roadmap-rows/13.md) · [#630](https://github.com/barocss/cad/issues/630) · Base 463826026467e7b3c4d53c46f40bd27675861e57.

Use the D1548 Studio-approved −450°, 50 mm triangular Turn. Capture the actual Studio STEP export bytes locally and open them in a fresh Studio context. Use the existing independent Part 21 parser and cubic evaluator in the known tilted frame.

- **PASS, independent AP214 geometry.** The file declares millimetres and contains one closed solid with 5 faces, 9 edges and 6 vertices. Every shell edge has two opposite uses. Three cubic rails with 16 poles bind to the three side supports. Independent de Boor evaluation matches all 48 station corners within 1.84e-14 mm. The independent section integral gives 1050.0612784061157 mm³, Studio native gives 1050.061278406116 mm³, and fresh STEP Open gives 1050.0612784061154 mm³.
- **PASS, actual desktop Studio.** The export panel includes one output body and discloses the loss of editable feature History and native parameter-curve inspection. Export retains the accepted native document. Fresh Open reads the exact exported bytes as one Import node and validates the same native counts and volume. The approval ledger and native construction History are absent from the imported document. The original Model uses the refined 690-triangle packet. The triangle after STEP Open uses the canonical packet because the current exchange recognizer covers rectangles. The two scenes are independent Fit captures.
- **PASS, controls.** The D1542 two-solid rectangular fixture still exports and opens in desktop Studio. The independent reader verifies both AP214 files. Fifteen Model and 16 Studio tests, scoped ESLint, browser syntax and Git diff pass. The two final frozen receipts report zero console and runtime errors and zero source changes.
- **FAIL, corrected setup and assertions.** Studio's report uses the plural label for one body. A single-body import omits the optional solids field. The test now checks both real forms. One rerun reported an old driver change event although the frozen and cleanup SHA-256 values matched. The clean rerun passed with zero events.
- **NOT_RUN.** Another CAD application, triangle-specific refined STEP display, mobile, local builds and types for the verification-only change, and full local suites. #630 remains open.

Use Node 22.19.0, Python 3 and installed desktop Chrome and Playwright. Run serially under the heavy gate and keep capture files outside Git.

```sh
node packages/barocss-cad-model/scripts/test.mjs smooth-triangular-turn smooth-turn-angle step-export-scope
pnpm --dir apps/cad-studio test step-export-preparation step-metadata
pnpm exec eslint apps/cad-studio/test/smooth-turn-step-browser.mjs
node --check apps/cad-studio/test/smooth-turn-step-browser.mjs
git diff --check
TURN_STEP_FROZEN=1 node apps/cad-studio/test/smooth-turn-step-browser.mjs "$EVIDENCE/triangle" "$D1548/reviewed-smooth-turn-reversed.bcad" --triangle
TURN_STEP_FROZEN=1 node apps/cad-studio/test/smooth-turn-step-browser.mjs "$EVIDENCE/control" "$D1541/reviewed-smooth-turn-widened.bcad"
python3 -BI apps/cad-studio/test/smooth-turn-step-oracle.py "$EVIDENCE/triangle/approved-turn-from-studio.step" --triangle
```
