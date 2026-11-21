# D1618 — Cut a measured gap in one of several construction arcs

P1, row 09, [#226](https://github.com/barocss/cad/issues/226). Base `94c8a0c0a1f077aaa5817a833c95262453a854fa`.

Cut polyline gap accepts an open, unconstrained construction polyline with more than one circular span. Preparation stores the exact finite arc for each curved span. Selection and cut-end contact checks use those finite arcs. The gap must fit in the selected span. The saved fragments retain the other arc coefficients and existing point IDs.

- **PASS, desktop Studio WebGPU.** Open a construction chain with three alternating R10 semicircles. Near a corner, a 4 mm cut refuses without changing the document. Preview and cancel in the middle arc, then apply the same gap. The other two semicircles keep their original bulges. Existing point IDs e5 through e10 remain, and the new ends are e11 and e12. Undo and Redo restore the exact documents.
- **PASS, independent geometry and persistence.** The centre of the selected arc is (20, 20) mm. The independently computed cut angles are π/2 ± 0.2 radians. Saved ends (21.986693, 29.800666) and (18.013306, 29.800666) mm give a chord of 3.973387 mm and an inferred arc length of 4.0000003919109 mm. The retained arcs keep R10 within 1e−5 mm. Extrude the separate stock to one valid 50 mm³ solid. Save to a browser project, close, reload, Open and edit the source sketch. Both retained fragments and the accepted document match the saved file.
- **PASS, affected checks.** 58 Studio tests, scoped lint, Studio types, production build, browser syntax and Git diff. Focused cases cover both sweep signs, straight-span selection, a malformed later arc, overlap ambiguity and a cut-end contact inside a different arc. The actual run checks 1,159 frozen files and records zero runtime errors, console errors and file changes.
- **FAIL, base capability by source inspection.** A second circular span caused the old path preparation to refuse the entire chain.
- **NOT_RUN.** Gaps across spans, constrained or ordinary mixed polylines, other renderers, exchange, mobile and full local suites. The contact guard is scoped to the cut ends. #226 remains open.

Use Node 22.19.0 and installed desktop Chrome and Playwright. Acquire the heavy gate and keep evidence outside Git.

```sh
pnpm exec eslint apps/cad-studio/src/sketch/pathGap.ts apps/cad-studio/test/{path-gap-preview.test.ts,line-path-gap-browser.mjs}
pnpm --dir apps/cad-studio test path-gap arcPathGap linePathGap circlePathGap trim split-gap
pnpm --dir apps/cad-studio build
node --check apps/cad-studio/test/line-path-gap-browser.mjs
D1618_SOURCE_FROZEN=1 node apps/cad-studio/test/line-path-gap-browser.mjs "$EVIDENCE" --multi-arc-polyline
git diff --check
```
