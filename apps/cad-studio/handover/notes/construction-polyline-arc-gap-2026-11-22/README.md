# D1607 — Cut a fixed-length gap in a construction polyline arc

P1, row 09, [#226](https://github.com/barocss/cad/issues/226). Base `1fdcf4a691255248549873b627a8233ed57f688b`.

Cut polyline gap now admits an open, unconstrained construction polyline with one circular span and straight remaining spans. The editor first chooses the nearest unique finite span. It measures the gap along that span, keeps path direction and surviving point IDs, and refuses a cut through a corner or one whose endpoints would touch another span within 0.0001 mm. The existing arc and document formats store the two retained fragments.

- **PASS, desktop Studio WebGPU.** On a clockwise R15 quarter arc, refuse a 4 mm gap near the corner and leave the document intact. Preview the gap, cancel, then apply it in the arc interior. Preserve both adjoining straight spans and original IDs e5 through e8. The editor assigns e9 and e10 to the two new ends. Undo and Redo restore the exact documents. The adjacent rectangle still extrudes to one valid 50 mm³ solid.
- **PASS, independent geometry and persistence.** The saved cut ends are [23.077512, 29.102433] and [25.897566, 31.922487] mm. The inferred arc length is 3.999999934170793 mm and the chord is 3.9881586134244973 mm. Both retained arcs have radius 15 mm within 1e−5 mm and clockwise direction. The retained and removed sweeps give the original quarter turn within the existing path-length tolerance. Save to a browser Project, close, reload and open the same saved document, then edit the source sketch in Studio. Both retained fragments are present and the file bytes decode to the exact accepted document.
- **PASS, controls.** The existing straight-polyline desktop flow still cuts 4.0000000000000036 mm. Focused tests cover both arc directions, the angle seam, a major arc, nearest finite selection and corner and contact refusal. 53 Studio tests, types, scoped lint, production build, driver syntax and Git diff pass. Both final runs tracked 1159 frozen files with zero changes, runtime errors or console errors.
- **FAIL, corrected first type check.** The focused tests ran, but the build refused a widened fixture flag and a test that did not narrow the prepared-path variant. Correct both test types before running Studio. The base source also denied any curved polyline.
- **NOT_RUN.** Multiple arcs in one polyline, constrained or ordinary mixed polylines as supported edits, other renderers, exchange, mobile and the full local suite. #226 remains open.

Run with Node 22.19.0, installed Chrome and Playwright. Acquire the heavy gate. Keep evidence outside Git.

```sh
pnpm exec eslint apps/cad-studio/src/sketch/{pathGap.ts,usePathGap.ts} apps/cad-studio/test/{path-gap-preview.test.ts,line-path-gap-browser.mjs}
pnpm --dir apps/cad-studio test path-gap arcPathGap linePathGap circlePathGap trim split-gap
pnpm --dir apps/cad-studio build
node --check apps/cad-studio/test/line-path-gap-browser.mjs
D1607_SOURCE_FROZEN=1 node apps/cad-studio/test/line-path-gap-browser.mjs "$EVIDENCE/curved" --curved-polyline
D1602_SOURCE_FROZEN=1 node apps/cad-studio/test/line-path-gap-browser.mjs "$EVIDENCE/straight" --polyline
git diff --check
```
