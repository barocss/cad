# D1516 — Qualify a full ruled turn with copied Loft guides

P5, row 07, [#630](https://github.com/barocss/cad/issues/630). Base `81e312cf7003cfcc9be794f4b4bd1c7ccec4feef`.

The existing Ruled Loft can connect a full signed turn when the document supplies the intervening sections and a guide through their corresponding corners. Use five 12 × 8 mm rectangles at z = 0, 8, 18, 31 and 40 mm around the line through (13, −8). The end sections have the same outline. The four spans turn 90° each. One degree-one polynomial NURBS guide fixes the corner pairing in each span. The opposite guide changes the sign while keeping each copied station exact.

- **PASS, desktop Studio.** Pick the five original Sketch rows out of order. Create an unguided control, Undo, then create the guided +360° Loft. Change the copied guide to −360° in History. Undo, Redo, Save and fresh Open preserve the expected file and geometry. The saved negative native B-rep digest is unchanged after reopening.
- **PASS, native geometry.** Both guided outputs contain one strict closed solid, 18 faces and 20 station vertices. Independently calculated corner pairings agree with all 16 native ruling endpoints and midpoints to 1e-8 mm. Each span linearly interpolates corresponding sections. Its area is 96 × ((1 − t)² + t²) mm², so the volume is 2560 mm³. Actual values are 2560 and 2560.0000000000005 mm³. The unguided control pairs nearby corners, exchanges width and depth, and gives 3946.6666666666665 mm³. This test distinguishes the corner paths even when both guided solids have the same volume.
- **PASS, focused checks.** 29 Model and 91 existing Kernel tests, browser driver syntax and Git diff check. Initial driver setup needed the existing Model digest import and the palette focus step. The final desktop run verifies frozen sources and reports no browser errors.
- **FAIL, existing unrelated Sweep assertion.** The wider `profiles-parameters` batch has 46 PASS / 1 FAIL. Its Sweep preview expectation still uses the older path label and step list. This decision changes only the browser driver and records.
- **NOT_RUN.** Continuous twist law, helical screw, arbitrary axis, smooth and varying sections in the turn, full local suites, mobile and STEP for this part. #630 remains open.

Use Node 22.19.0, desktop Chrome and installed Playwright. Run heavy work through the gate and keep the worktree frozen during Studio. Keep screenshots and native receipts outside Git.

```sh
node packages/barocss-cad-model/scripts/test.mjs loft-guide-command loft-section-history-edit api-loft-guide
node --test packages/barocss-cad/test/{loft-nurbs-guide,loft-two-guides,oriented-loft,loft-guide-control-range}.test.mjs
node --check apps/cad-studio/test/loft-full-turn-sections-browser.mjs
git diff --check
cd apps/cad-studio
LOFT_FULL_TURN_SOURCE_FROZEN=1 node test/loft-full-turn-sections-browser.mjs "$EVIDENCE"
```
