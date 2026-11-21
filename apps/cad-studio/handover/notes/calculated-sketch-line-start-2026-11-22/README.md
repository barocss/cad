# D1613 — Start an ordinary Line at a calculated sketch point

P1, row 09, [#229](https://github.com/barocss/cad/issues/229). Base `c9d850f12d0fe88e4787e49d5efd4430f13cfda4`.

An ordinary Line can use Two-point snap for its first point. One confirmation transfers the calculated point to the same sketch gesture as a normal first click. Continue the line chain with the regular picks and close the profile at the original first point. The construction segment remains an independent reference.

- **PASS, desktop Studio WebGPU.** Cancel after the first reference pick and re-arm the calculation from its initial state. Use ratio 0.25 on the segment (0, 0) to (31, 12) mm. Confirm once. Studio records the first point as (7.75, 3) mm with the 1 mm grid active. Pick (22, 3) and (22, 12) mm, then close at the first point. Finish stores the three corners and the separate construction segment.
- **PASS, native geometry.** Independent triangle area is 64.125 mm². The 2 mm Extrude has volume 128.25 mm³, six matching native vertices and centroid (17.25, 6, 1) mm. Undo and Redo restore the exact documents. Native Save and fresh Open reproduce the same strict solid and inspection. The existing calculated Slot desktop path passes.
- **PASS, affected checks.** 50 Studio tests, types, scoped lint, production build, driver syntax and Git diff. The focused hook test verifies one transfer and stale-owner refusal. Each final Studio run tracks 1158 frozen files with zero changes, runtime errors or console errors.
- **FAIL, corrected first driver setup.** The initial test toggled Construction off while its open line was still the current shape. Switch tools to retire that draft before starting a new ordinary Line and repeat the test. The base product also lacked a calculated Line start.
- **NOT_RUN.** Calculated points inside an ongoing chain, other new sketch producers, other renderers, mobile, exchange and full local suites. #229 remains open.

Use Node 22.19.0 and installed desktop Chrome and Playwright. Acquire the heavy gate and keep screenshots and native files outside Git.

```sh
pnpm exec eslint apps/cad-studio/src/{sketch/useTwoPointSnap.ts,viewport/viewportPointerInput.ts} apps/cad-studio/test/{two-point-snap-ownership.test.ts,two-point-snap-line-browser.mjs}
pnpm --dir apps/cad-studio test two-point-snap slot-placement-history sketch-draft-history sketch-line trim
pnpm --dir apps/cad-studio build
node --check apps/cad-studio/test/two-point-snap-line-browser.mjs
D1613_SOURCE_FROZEN=1 node apps/cad-studio/test/two-point-snap-line-browser.mjs "$EVIDENCE/line"
D1608_SOURCE_FROZEN=1 node apps/cad-studio/test/two-point-snap-slot-browser.mjs "$EVIDENCE/slot"
git diff --check
```
