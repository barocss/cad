# D2131 — Move Studio shape placement out of App

P4 [row 15](../../roadmap-rows/15.md) and [row 22](../../roadmap-rows/22.md) · Base `917fb1828fbd945cfbb881803a35970bffbcc6da`.

`useStudioShapePlacement` owns the toolbar drag session, placement preview update and drag cancellation. The Browser reads the same session ref to guard reveal and isolation. The existing command store and viewport event entry points remain in use. App changes from 2,380 to 2,359 lines.

## Verification

- **PASS, actual desktop before and after.** Physical pointer click at (7, 18) places the Box preview at (−9, 2). A toolbar drag to (12, 6) shows a preview. Dropping outside the viewport clears the draft and the document stays empty. A second drag drops at (−9, 11). Apply creates a 32 × 32 × 16 mm solid at (−25, −5, 0) with volume 16,384 mm³. Undo restores the empty part and Redo restores the solid. Save and fresh Open preserve the exact authored document. The two native downloads match byte for byte, SHA256 `5ea5800ecb01e8e33d7807c41596cd13934bf4f3454fbd249cc3e6e72e7f4535`.
- **PASS, source custody and affected checks.** Desktop runs freeze 695 and 696 files with no source changes, page errors or console errors. 34 Studio tests, Studio type check, scoped ESLint, driver syntax, diff check and production build pass on Node 22.19.0.
- **FAIL, corrected test setup.** The first baseline opened Studio's example part. The final driver opens a new part before testing placement and queries the Box HUD by name.
- **NOT_RUN.** All shape types, other renderers, full local suites and mobile. First mechanical CAD remains 8/10 accepted. Overall completion is unmeasured.

```sh
# Node 22.19.0. Run each Studio flow and the affected checks under the heavy gate.
SHAPE_PLACEMENT_FROZEN=1 node apps/cad-studio/test/shape-placement-browser.mjs "$OUT/baseline" --baseline
SHAPE_PLACEMENT_FROZEN=1 node apps/cad-studio/test/shape-placement-browser.mjs "$OUT/candidate"
pnpm --dir apps/cad-studio test command-hud-actions command-apply-queue body-browser-reveal stop-work-ownership
pnpm --dir apps/cad-studio exec vite build --outDir "$OUT/studio-dist"
```
