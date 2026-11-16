# Exact historical Round recovery: functional pass, ideal accuracy failure

Issue #21 row3391's original report points to the desktop-f2d5e0a98-sketch-round-lock-order-ux-verified evidence. Its original native input equals both the captured Finish and freshly reopened documents. This exact synthetic CAD document is retained as test/fixtures/historical-collapsed-round.bcad, SHA256 de9909089229a143d552ac12dbe0e88e4201b17fe266be35f3be752239b664b1. No fabricated or rounded replacement was used.

Original R20 source chord0.003197184884392718mm and R10 fillet had native volume5571.116042280099mm³. Current actual Chrome opens those exact bytes and changes Arc4 to R5 in the same draft without Cancel/reopen. Finish restores a source chord above20mm, keeps R20/R5 locks, side tags and following Extrude. Native checkOutput.valid is true. Document Undo/Redo and Save/fresh Open preserve exact documents. Screenshots reviewed; errors/console/source changes empty. Functional lifecycle `/tmp/cad-historical-round-02` PASS.

**Ideal numerical accuracy remains FAIL.** Recovered native volume7054.30138713098mm³ differs from retained ideal R5 reference7054.30137981 by7.320980330405291e-6mm³, above the unchanged1e-7mm³ budget. Run01 stopped at this assertion. Run02 explicitly reports idealAccuracy=FAIL while separately completing the UI/storage lifecycle. A top-level functional receipt PASS is not an accuracy pass. Original saved coordinates already differ from ideal lines by about1.8e-8mm; this is evidence, not a proved complete cause. No coordinate rounding, solver change or tolerance relaxation. #21 remains open.

Run: HISTORICAL_ROUND_FROZEN=1 PW_DIR=... CHROME=... node test/historical-round-recovery-browser.mjs OUTPUT, under the shared heavy gate. No product changes for this historical investigation. Final driver lint and Studio tsc passed. Existing protected WIP/HOLD unchanged.

## Independent authored-coordinate resolution

The original ideal-coordinate comparison above remains FAIL. A separate standard-library-only `test/historical-round-oracle.py` now derives the tangent circles from the **unchanged original anchor** A=(1.436047693296095e-22,19.999999982063688), fixed endpoint E=(20,40), R20 and r5. C=(E.x,E.y−R); dy=A.y+r−C.y; dx=sqrt((R−r)^2−dy^2); F=(C.x+dx,A.y+r); line contact=(F.x,A.y); arc contact=C+R/(R−r)*(F−C). Polygon cross-products plus two circular-segment areas give the independently predicted volume. A second Green integral uses the actual saved bulges, independently of the native kernel.

- ideal A=(0,20):7054.301379805951mm³
- actual authored anchor analytic:7054.301387198078mm³
- native:7054.30138713098mm³
- actual-outline Green integral:7054.301387131765mm³
- native−authored:−6.7097971623e-8mm³, within unchanged1e-7
- native−Green:−7.8489392763e-10mm³
- maximum contact-point error:3.3715995476e-10mm, within unchanged1e-8

The original anchor accounts for+7.3921273724e-6mm³ versus the ideal coordinate design. Exact original bytes/coordinate intent are preserved rather than rounded to make the old comparator pass. Existing analytic radius-edit recognition cannot admit the old R10 branch: its offset margin~1.79363e-8 is below existing linearTolerance1e-7, so ordinary solveShape handles the recovery. No branch policy was loosened.

`/tmp/cad-historical-round-03` actual frozen Chrome with the integrated independent oracle PASS for authored-coordinate recovery, Undo/Redo and Save/fresh Open; idealAccuracy remains explicitly FAIL in both reports. This supersedes the unresolved-cause statement above, not the recorded earlier failure. No product fix is needed for this fixture. Broad #21 acceptance remains separate.
