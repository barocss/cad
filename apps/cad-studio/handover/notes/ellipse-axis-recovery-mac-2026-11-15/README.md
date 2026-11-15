# D1357 — Explicit ellipse-axis recovery

Partial follow-up to barocss/cad#21, based on main `07e84a8bbc97e269c87f9c037e40b26acb2748c7`. #21 remains OPEN; this does not establish completion of its broader constraint/validity/fillet cases.

## Existing behavior and bounded change

D1085 already refused direct radius editing on the ellipse's tangent-arc approximation and explained Rx/Ry. The existing native axes editor and geometry are retained. The same warning now offers **Edit ellipse axes**. Explicit click/keyboard activation focuses and selects the existing Rx input; no unsolicited focus move occurs. Receipt ownership uses exact document and resulting sketch identity, plus click-time generation. Changed tool/draft/document cannot reuse the recovery action.

Files: `src/viewport/studioSketchViewportActions.ts`, `src/sketch/ellipseAxesRecovery.ts`, `src/App.tsx`, `src/ui/SketchPanel.tsx`; focused tests and the separate --axis-recovery browser flag.

## Verification

- Focused tests 11/11, Studio tsc, scoped lint and diff check PASS. App-wide lint still reports its pre-existing unrelated `_k` error; not changed and not represented as a full lint pass. Production build PASS.
- Actual Chrome1024/1440, separate first runs both PASS. Real ellipse creation, angle/Ry edits, Extrude, re-open and actual Dimension edge click. Select invalidates the offered action; a new Dimension hit reoffers it. Keyboard Enter on the button focuses Rx without finishing or mutating the document.
- Same editor: Rx50→54 then Ry20→22; two draft Undo and Redo restore each successive definition before Finish. Native product read and independent Python ellipse oracle pass; side IDs and following Extrude remain unchanged. Document Undo/Redo and actual Save/fresh Open pass.
- Root visually reviewed focused Rx screenshots at both widths.
- Receipts: `d1357-1024-first/receipt.json` SHA256 `f64bedfcb227518c0f6ce2b88a059a9ce8f4af2a2fbf07d30d936e6955662418`; `d1357-1440-first/receipt.json` SHA256 `758d31ce9920844ad021b313c10e92522cfe9009adbeb0e3f53ef03fae850764`. Product source frozen throughout.
- Initial full-panel SSR test could not render an existing external store without getServerSnapshot; it was replaced with action/ownership units. Actual browser supplies the markup/focus proof.

No new solver, radius/diameter semantics, ellipse-rim Fillet, schema, NURBS or manufacturing support. No full-suite/CI/screen-reader claim. Existing HOLDs retained. Next D1358/#65: readable initial inline dimension without losing exact numeric input.
