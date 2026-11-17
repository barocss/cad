# Face datum creation respects the visible sheet

Baseline main 5052b91a010a9405780b6cfd175de03d1a0a5296, bounded #180 follow-up.

Actual defect: after adding datum A to Top on Sheet 1, the Top selection persisted when switching to the Right-only second sheet. Add face datum remained enabled and saved B with view=top, on the other sheet. B's position was also computed with the current second sheet's scale. The second sheet continued to show zero datums. Original datum A was preserved.

Fix: supply the views actually displayed by the current sheet to DatumsEditor. Add is disabled and guarded when the selected view is unavailable; that option says '(not shown on this sheet)' and a wrapping status explains choosing a shown view. Do not silently substitute another view, move existing annotations, change their face anchors or migrate old files. Existing local remove/clear behavior and global ID allocation remain.

Studio type check, component/driver lint and related allocation tests 3/3 PASS.

Actual Chrome fixed first run PASS: Top stays explicitly selected but cannot author on the Right-only sheet, document unchanged. Explicit Right selection then creates B on this sheet, preserving A and nodes. Undo/Redo, sheet-local Clear and Undo, native Save/fresh Open and sheet-local readback pass. Actual SVG B independently XML-parsed. Baseline/fixed sources frozen through cleanup and both screenshots visually inspected. The longer select option is clipped at the compact native field width, but the full explanation below is visible and wraps.

```sh
# Node 22.19.0; PW_DIR and CHROME point to installed Playwright/Chrome
DRAWING_DATUM_VIEW_OWNER_FROZEN=1 node apps/cad-studio/test/drawing-datum-view-owner-browser.mjs <fresh-output-directory>
node apps/cad-studio/scripts/test.mjs drawing-datum-allocation
node node_modules/eslint/bin/eslint.js apps/cad-studio/src/ui/drawing/DatumsEditor.tsx apps/cad-studio/test/drawing-datum-view-owner-browser.mjs
node node_modules/typescript/bin/tsc --noEmit -p apps/cad-studio/tsconfig.json
```

No full-sheet layout redesign, GD&T solver/standards certification, PDF/DXF or manufacturing qualification. Browser coverage is Top/Right face datums on a synthetic plate, not Section/Detail datums. Existing Workspace unused-variable lint findings and previous PDF golden mismatch are separate; HOLDs/#180 remain open.
