# D2260 — Verify the original Drawing tolerance and H7 PDF cases

P2 [row 11](../../roadmap-rows/11.md) and [row 25](../../roadmap-rows/25.md) · [#35](https://github.com/barocss/cad/issues/35) · Base `87f6e63dc`.

| Original condition | Evidence |
| --- | --- |
| The reported Ø12.7 interval is symmetric in both units | Actual Studio and its PDF show Ø12.7 with +0.254/−0.254 mm and Ø.500 with +.010/−.010 in. The saved mid-stage project freshly reopens with the same inch text. The model and tolerances remain exact. |
| An empty lower deviation keeps the prior value. An explicit zero saves | The [earlier actual Studio edit, undo and fresh Open](https://github.com/barocss/cad/issues/35#issuecomment-6909415022) verifies this control. It also shows millimetres as the input unit on inch sheets. |
| Reimport keeps the priority of an existing fit table | The [actual prior reimport, history and native Open](https://github.com/barocss/cad/issues/35#issuecomment-6909490062) covers replacement with an overlapping lower-priority table. The fit-table store retains that change. |
| H7 row, grade and displayed interval agree at and above the boundary | Actual Studio and PDF show Ø18 THRU H7 (+0.018/0) and Ø18.001 THRU H7 (+0.028/0) in the first table, rows 1 and 2. The lower-priority +0.041/0 table stays unused. [D2245](../original-through-bore-h7-boundary-2026-11-29/README.md) confirms the original Hole edit and exact native readback after project reopen. |
| The original Ø8 PDF retains a zero lower deviation | Actual restored-fit PDF reads Ø8 THRU H7 (+0.015/0) (est.). Missing fit data stops PDF output in both the visible-sheet and continuation-sheet controls. |

- **PASS, current desktop.** Two actual desktop Chrome flows used the original authored circle, the restored Ø8 witness and the retained D2245 fixtures. Their frozen source counts were 1,309 and 715. Both had zero console errors. All six actual Studio PDFs match a raw text reader and independent macOS PDFKit. No formatter, tolerance policy, table data or product code changed.
- **FAIL, corrected harness.** The first H7 boundary replay observed the prior document before the second file settled. The final replay waits for the authored Hole radius and a current evaluation. The PDFKit reader first expected labels where PDF uses source keys. The final assertions check the actual table ID, row and source key.
- **NOT_RUN.** Full local suites for this evidence checkpoint, the held external reference PDF, other tolerance families, mobile and live Agent. First mechanical CAD remains 8/10.

```sh
bash "$OUT/desktop.sh" fit fit-02
bash "$OUT/desktop.sh" circle circle-01
/usr/bin/swift "$OUT/pdfkit-exact.swift" "$OUT"
git diff --check
```
