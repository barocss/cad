# D1608 — Start a Slot at a calculated sketch point

P1, row 09, [#229](https://github.com/barocss/cad/issues/229). Base `7ec9e041d1b58f1f9c863049a14a808a0d464db8`.

An ordinary Slot can use Two-point snap for its first centre. One confirmation starts the same Slot gesture as a pointer click. The next two picks set the other centre and the width. The calculation retires after confirmation or a tool change and keeps the construction segment independent.

- **PASS, desktop Studio WebGPU.** Switch away after one reference pick and verify that the next calculation needs a new first pick. Take 0.25 of the segment from (0, 0) to (31, 12) mm. Confirm once to place the first centre at (7.75, 3) mm with the 1 mm grid active. Pick (24, 3) mm for the other centre. The final sketch has centre distance 16.25 mm and width 8 mm, and it retains the original construction segment.
- **PASS, native geometry.** Finish and Extrude by 2 mm, then Undo, Redo, Save and fresh Open. The native result is one valid solid with two R4 cylindrical ends and centroid (15.875, 3, 1) mm within 1e−8 mm. Its volume is 360.53096491487287 mm³. The independent formula 2 × (8 × 16.25 + 16π) agrees within 6e−13 mm³. The native read after Open is identical.
- **PASS, affected checks.** 26 Studio tests, types, scoped lint, production build, driver syntax and Git diff. The production hook transfers the point once and rejects stale owners in its focused test. The existing desktop Circle two-point snap, its competing circle mode and its native Open also pass. The actual runs report zero frozen-file changes, runtime errors and console errors.
- **FAIL, base capability by source inspection.** The preceding hook and first-point gesture accepted Rectangle and Circle only.
- **NOT_RUN.** Other sketch producers, a repeated actual Rectangle run, other renderers, mobile, exchange and the full local suite. #229 remains open.

Use Node 22.19.0 and installed desktop Chrome and Playwright. Acquire the heavy gate and keep captures outside Git.

```sh
pnpm exec eslint apps/cad-studio/src/{sketch/useTwoPointSnap.ts,viewport/viewportPointerInput.ts} apps/cad-studio/test/{two-point-snap-ownership.test.ts,two-point-snap-slot-browser.mjs}
pnpm --dir apps/cad-studio test two-point-snap slot-placement-history slot-width slot-endpoint slot-centre
pnpm --dir apps/cad-studio build
node --check apps/cad-studio/test/two-point-snap-slot-browser.mjs
D1608_SOURCE_FROZEN=1 node apps/cad-studio/test/two-point-snap-slot-browser.mjs "$EVIDENCE/slot"
D1598_SOURCE_FROZEN=1 node apps/cad-studio/test/two-point-snap-circle-browser.mjs "$EVIDENCE/circle"
git diff --check
```
