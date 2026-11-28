# D2132 — Locate the fixed endpoints that block an axis constraint

P1 [row 09](../../roadmap-rows/09.md) and [row 16](../../roadmap-rows/16.md) · [#183](https://github.com/barocss/cad/issues/183) · Base `2b5bdb0836425e1dbb090e6965c69e958c89f974`.

After a single straight edge refuses Horizontal or Vertical, Studio names both explicit Fix rows if their relevant coordinates differ beyond the solver margin. The existing Find fixed point controls focus the exact current rows and their canvas marks. The refusal belongs to the current sketch and selection. Applying a constraint still uses the same solver and document history.

## Verification

- **PASS, baseline reproduction.** Desktop Studio refused Vertical on a fixed edge with a 6 mm X difference. It also refused Horizontal on the rotated control with a 6 mm Y difference. Both cases showed the general conflict without actions for the fixed points.
- **PASS, desktop candidate.** In each case, the alert identifies points 2 and 3 and the conflicting axis difference. Find fixed point 3 focuses that row. Removing that Fix clears the old diagnostic. Applying the same axis constraint then succeeds, with the remaining Fix preserved. Finish rebuilds the 10 mm extrusion from 8,600 to 8,000 mm³, as calculated from trapezoid and rectangle areas. Undo restores the prior sketch and part. Redo, native Save and fresh Open preserve the applied axis. Both runs freeze 696 files and record zero source changes, page errors and console errors.
- **PASS, affected checks.** 72 Studio tests, including fixed, ambiguous, near-coincident and already aligned inputs. Studio type check, scoped ESLint, driver syntax, diff check and production build pass on Node 22.19.0.
- **FAIL, corrected test setup.** The first candidate kept the constraint list filtered to Fixed after focusing the row. The final driver clears the filter before checking the newly added axis row.
- **NOT_RUN.** Multiple edges at once, curved outlines, the full bounded solver card, full local suites and mobile. #183 remains open. First mechanical CAD remains 8/10 accepted. Overall completion is unmeasured.

```sh
# Node 22.19.0. Run each Studio flow and the affected checks under the heavy gate.
FIXED_EDGE_AXIS_FROZEN=1 node apps/cad-studio/test/fixed-edge-axis-conflict-browser.mjs "$OUT/baseline" --baseline
FIXED_EDGE_AXIS_FROZEN=1 node apps/cad-studio/test/fixed-edge-axis-conflict-browser.mjs "$OUT/candidate"
pnpm --dir apps/cad-studio test constraint-list panel-opposing-length sketch-constraint-mark draft-sketch-history constraints.test
pnpm --dir apps/cad-studio exec vite build --outDir "$OUT/studio-dist"
```
