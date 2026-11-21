# D1529 — Verify continuous Smooth Turn on a tilted sketch plane

P5, row 07, [#630](https://github.com/barocss/cad/issues/630). Base `ab6207739a2b38e03535bf0068709706f07c6b90`. This extends test coverage of the existing Smooth Turn.

- **PASS, desktop Studio.** Start with 12 × 8 mm rectangles in a shared tilted frame. The source normal is [0.64, −0.48, 0.60], with a nonzero world translation. Create the matching +360° Ruled and Smooth turns at 40 mm. Check −360° at 40 mm and +450° at 50 mm. Undo, Redo, native Save and fresh Open pass. The comparison captures use a Front orthographic view with AO off.
- **PASS, independent native geometry.** Each Smooth result has one strict closed solid, four continuous side faces, two caps and 12 edges. An independent world basis and rotation give the correct sign on all four rails at 361 sample locations each. Axial positions and derivatives agree within 1e-8 mm and 1e-7 mm per unit parameter respectively. Both cap planes are normal to the same axis and their stations agree within 1e-8 mm. Maximum sampled radial corner deviation is 0.015248 mm at ±360° and 0.015241 mm at +450°. Native volumes are 3840.49391848883 and 4800.28012985652 mm³. The reopened +450° digest matches exactly.
- **PASS, controls and affected checks.** The original Z-axis desktop run passes. Eight Model tests, browser syntax and Git diff pass. An independent Model check on another translated origin confirms both end normals, station corners, signed angular rates, native volume and reopen equality at ±360° and ±450°.
- **FAIL.** None in the completed checks.
- **NOT_RUN.** Local product build and types for the test-only change, other profile families, helical screw, broad renderer/tessellation changes, full local suites and mobile. #630 remains open.

Run with Node 22.19.0 and installed Chrome and Playwright. Gate heavy work and retain evidence outside Git.

```sh
node packages/barocss-cad-model/scripts/test.mjs ruled-turn-command smooth-turn-angle
node --check apps/cad-studio/test/smooth-turn-browser.mjs
git diff --check
cd apps/cad-studio
SMOOTH_TURN_SOURCE_FROZEN=1 node test/smooth-turn-browser.mjs "$EVIDENCE/tilted" --tilted
SMOOTH_TURN_SOURCE_FROZEN=1 node test/smooth-turn-browser.mjs "$EVIDENCE/z-control"
```
