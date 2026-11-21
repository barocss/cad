# D1598 — Use a calculated point as a sketch circle centre

P1, row 09, [#229](https://github.com/barocss/cad/issues/229). Base `03b136812e473cfd510e62add18e73aa48e547d3`.

In the Circle tool, use the existing Two-point snap to pick two visible construction endpoints. Enter a ratio or distance. Use point starts the ordinary circle at the calculated centre. Make the next click to set its radius. Starting Circle from two points cancels the calculated snap, and starting the snap cancels Circle from two points. The calculation is a one-time position input. It adds no persistent feature or constraint.

- **PASS, desktop Studio WebGPU.** Draw construction from (0, 0) to (31, 13) mm. Switch between the two Circle input modes after each has a point. The newly opened mode asks for its first point. Enter ratio 0.25 in Two-point snap. The canvas marker and numeric fields show centre (7.75, 3.25) mm with the 1 mm grid active. One Enter supplies only the centre. The ordinary midpoint at (15.5, 6.5) mm sets the radius. Finish and Extrude 2 mm. Undo, Redo, native Save and fresh Open retain the complete native read.
- **PASS, independent geometry.** The radius is √1130/4 mm (8.403868156985807 mm in the sketch). The native result is a valid cylinder with two cylindrical patches. The independent volume π × 1130/8 agrees with 443.7499623195585 mm³. The centre of mass is (7.75, 3.25, 1) mm within 1e−10 mm. The original construction endpoints are unchanged.
- **PASS, affected checks.** 42 Studio and 9 Model tests, Studio types and production build, scoped lint, driver syntax and Git diff. The controlled hook tests cover one-time transfer and stale sketch refusal. Three frozen desktop runs pass for calculated Circle, the existing Rectangle and Circle from two points. The calculated Circle run tracks 1158 source files with zero changes, page errors and console errors.
- **FAIL, corrected harness attempts.** The first launcher did not export the installed Chrome and Playwright paths. In the first desktop run the native inspector assertion read `radius` instead of the cylinder support's `r` field. The final run resolves both and completes Save and Open.
- **NOT_RUN.** Previous-version desktop run, other planes or renderers for Circle, other sketch tools, mobile and full local suites. #229 remains open.

Use Node 22.19.0, installed desktop Chrome and Playwright. Gate the runs and keep captures outside Git.

```sh
pnpm --dir apps/cad-studio test two-point-snap-ownership circle-from-chord sketch-draft-history viewport sketch-snap
pnpm --dir packages/barocss-cad-model test osnap
pnpm exec eslint apps/cad-studio/src/{App.tsx,sketch/useTwoPointSnap.ts,viewport/Viewport.tsx,viewport/viewportPointerInput.ts} apps/cad-studio/test/{two-point-snap-ownership.test.ts,two-point-snap-circle-browser.mjs}
pnpm --dir apps/cad-studio build
D1598_SOURCE_FROZEN=1 node apps/cad-studio/test/two-point-snap-circle-browser.mjs "$EVIDENCE/circle"
D793_SOURCE_FROZEN=1 node apps/cad-studio/test/two-point-snap-browser.mjs "$EVIDENCE/rectangle"
D878_SOURCE_FROZEN=1 node apps/cad-studio/test/circle-from-chord-browser.mjs "$EVIDENCE/chord"
node --check apps/cad-studio/test/two-point-snap-circle-browser.mjs
git diff --check
```
