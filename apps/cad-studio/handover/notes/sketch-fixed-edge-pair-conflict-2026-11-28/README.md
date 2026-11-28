# D2137 — Locate fixed endpoints in a refused edge relationship

P1 [row 09](../../roadmap-rows/09.md) and [row 16](../../roadmap-rows/16.md) · [#183](https://github.com/barocss/cad/issues/183) · Base `fb9c45070c124f94eca4f6e6955d723ed19735dc`.

After a refused Parallel or Perpendicular constraint on two disjoint straight edges, Studio links the four explicit Fix rows when their targets prove that the relationship is impossible within the solver tolerances. The angle test includes both sign branches and the maximum direction change from permitted Fix coordinate error on each edge. The diagnostic uses the existing selection and sketch ownership checks. The solver and document format stay the same.

## Verification

- **PASS, baseline reproduction.** Chrome Desktop refused the two relationships on the 10,000 mm³ source part. Both cases reported numerical nonconvergence and provided no links to the Fix rows.
- **PASS, desktop candidate.** Both refusals leave the accepted document intact and name the two selected edges. Each of the four links identifies one Fix row. Using the point 3 link focuses that row and its canvas mark. Removing that Fix allows the requested relationship to apply while retaining the reference edge and the other three Fix constraints. The Parallel result is 9,400 mm³. In the Perpendicular case one degree of freedom remains. The settled shoulder is at Y20.696096 mm and the independent two-rectangle calculation predicts 9,608.8288 mm³. Studio matches both. Undo restores the source, Redo restores the relationship, and native Save/fresh Open preserve the exact accepted document. Both successful runs freeze 696 files with zero changes, page errors or console errors.
- **PASS, affected checks.** 56 Studio tests, including near-tolerance targets, a minimum-length edge, a duplicate Fix, a missing Fix, an arc and unsupported selection shapes. Studio type check, scoped ESLint, driver syntax, diff check and production build pass on Node 22.19.0.
- **FAIL, corrected test expectations.** The first baseline assertion did not recognize the solver's nonconvergence text. The first candidate assumed an unfixed shoulder coordinate was invariant in the Perpendicular case. The final candidate verifies the constraint and checks the volume independently from the accepted shoulder.
- **NOT_RUN.** Shared-endpoint or curved edge diagnostics, the full solver acceptance card, full local suites and mobile. #183 remains open. First mechanical CAD remains 8/10 accepted. Overall completion is unmeasured.

```sh
# Node 22.19.0. Run the desktop checks under the heavy gate.
FIXED_EDGE_PAIR_FROZEN=1 node apps/cad-studio/test/fixed-edge-pair-conflict-browser.mjs "$OUT/baseline-retry" --baseline
FIXED_EDGE_PAIR_FROZEN=1 node apps/cad-studio/test/fixed-edge-pair-conflict-browser.mjs "$OUT/final"
pnpm --dir apps/cad-studio test constraints constraint-list constraint-mark sketch-mobility
pnpm --dir apps/cad-studio exec vite build --outDir "$OUT/studio-dist"
```
