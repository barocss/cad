# Cancel drawing section coordinate drafts

Baseline: `9689861c8a9074959ebef5ae0adb1d393eacf2f1`.

Actual Chrome reproduced Section Y=10 -> type13 -> Escape -> Tab committing at13. Escape previously did not dismiss this draft; subsequent ordinary blur accepted it. The baseline screenshot records the changed cut and dirty document.

SheetSettings full/extra cut coordinates and SectionKind half centreline/offset from/depth now handle Escape locally: discard the draft, prevent default, stop propagation, preserve focus. Enter and blur still accept valid finite values. No source geometry, cut formulas, schema, annotation or numeric admission changes.

## Checks

- Actual Chrome final driver PASS: nine numeric/empty cancellation cases, exact document equality after later Tab, preserved focus, full-section hatch edit availability restored after cancelling its pending cut. Full/extra section depth, half centreline and both offset step coordinates covered.
- Explicit Enter A=13, blur half centreline=28, Enter first offset depth=14; unchanged source nodes and other section fields. Undo/Redo and native Save/fresh Open pass.
- Actual SVG download includes A/B/C section labels; attached SVG is the accepted final drawing. This is not independent export geometry certification.
- First fixed run passed input cases but failed final current-cut wait: the synthetic top section was mistakenly at+4 (outside at Z=-4). Fixture changed to -4, matching top view depth convention; no product change for that failure. Final run passed all stages. Baseline A-cancellation failure remains valid independently of the unrelated B fixture error.
- Focused existing hatch UI/custom scale/paper-position tests:9/9 PASS before and after. Studio TypeScript, targeted ESLint, git diff --check PASS.
- Screenshots manually inspected. A3 fixture has free space; general layout/fit is not certified.

Run from repository root with Node22.19.0:

```sh
PW_DIR=/Users/user/.cache/barocss-playwright \
CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' \
DRAWING_SECTION_INPUT_CANCEL_FROZEN=1 \
node apps/cad-studio/test/drawing-section-input-cancel-browser.mjs /private/tmp/cad-section-input-new
node apps/cad-studio/scripts/test.mjs drawing-section-hatch-ui section-custom-scale section-paper-position
node node_modules/typescript/bin/tsc --noEmit -p apps/cad-studio/tsconfig.json
```

Limits: principal full/half/offset sections on one part. Aligned sections, assembly references, PDF/DXF and physical printing NOT_RUN. #180 and existing HOLD boundaries remain open/unchanged.
