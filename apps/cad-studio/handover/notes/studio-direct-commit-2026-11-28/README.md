# D2222 — Extract the Direct geometry commit path from Studio App

P4 [row 16](../../roadmap-rows/16.md) and [row 20](../../roadmap-rows/20.md) · Base `bf204d16b`.

`useStudioDirectCommit` owns the existing Direct input checks, dependent candidate reservation and the document commit. The App retains render and workspace wiring. `App.tsx` decreased from 2,271 to 2,246 lines.

- **PASS, actual desktop.** Before and after the extraction, an unconsumed surface blocked blank Move input and moved its four control points by exactly +2.5 mm in Z. The dependent pattern kept 23,680 mm³ through Move, refused deletion of its required path without adding an Undo step, then accepted Stretch. Independent stock-minus-cut moments matched the centroid change from `(30.135135, 20.121622, 5)` to `(30.108108, 20.148649, 5)` mm. Undo, Redo and project Save → Close → reload → Open passed. The four native measurement and curve-control receipts match byte for byte across both runs. The refusal and reopen document, History and selection snapshots also match.
- **PASS, affected checks.** 21 focused Studio tests, scoped ESLint, Studio types and whitespace.
- **FAIL, first baseline assertion.** The driver initially used the first pole as the Stretch origin. The existing control stretches around the bounds centre. The corrected absolute coordinates passed before and after.
- **NOT_RUN.** Full local suites, route authoring, mobile and live models. First mechanical CAD remains 8/10. Overall CAD and natural-language completion remain unmeasured.

```sh
bash "$OUT/desktop.sh" before --baseline
bash "$OUT/desktop.sh" fixed
pnpm --dir apps/cad-studio test direct-curve-candidate stop-work-ownership
git diff --check
```
