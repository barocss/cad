# Dimension-attached control IDs across sheets (#645)

Base `a8538de93`. Actual baseline: a valid imported Right/Sheet 2 standalone flatness frame has ID `control-d1`; Top/Sheet 1 has the unique dimension `d1`. Clicking Add geometric control on Top allocates that same frame ID from the local sheet list. The whole document still has only the original Right frame afterwards. **The new control disappears; the existing frame is not deleted.**

Attached-frame allocation now reserves IDs across the whole drawing, including standalone and attached controls, and respects the global 200-frame ceiling. It chooses `control-d1-2` in this fixture rather than renaming valid saved data. `changeFrame` validates the merged whole-drawing frame list before committing creation or edits. Existing dimension references, geometry and other-sheet control values remain untouched. Existing duplicate-dimension refusal and reader contracts are unchanged.

## Verification

- Focused allocation tests **4/4 PASS**: standalone/attached shared namespace; global count; global attached allocation; edit preserving the other sheet; colliding merged frame list refusal.
- Studio types **PASS** after adding required `near` coordinates to the new unit fixture. Scoped lint for allocator, FrameEditor, unit and browser driver **PASS**. DrawingWorkspace still reports its three previously documented unused bindings: `DrawingFix`, `_leader`, `_sheet`; they are not introduced or repaired here.
- Actual baseline **FAIL**, 1 versus 2 frames. Fixed run01 reaches creation/history/edit, then its SVG assertion wrongly assumes standalone groups have `data-dim`. Run02 waits on that same incorrect selector and times out. The original SVG and screenshot already contain the standalone control, using `data-standalone-frame`; **no blank-export product defect is claimed**.
- After selector correction, run03 completes all functional steps but fails its source-watch gate due to driver/unit-file change events. Every frozen/cleanup hash still matches; this run is retained as FAIL, not promoted to PASS. With no additional edits, clean run04 **PASS**.
- Final actual flow creates 2 unique frames, keeps the original Right row identical, verifies first Undo/Redo, edits attached tolerance to 0.3 without changing Right 0.2, downloads real SVG for each sheet, saves native and reopens in a fresh context. Independent XML parsing finds exactly one `control-d1-2` attached group with `Ø0.3` in original/reopened Top SVG, and exactly one standalone `control-d1` with `0.2` in Right SVG.
- All five source-frozen capsules equal after-cleanup; only run03 has source-watch events. Baseline and final reopened screenshots visually inspected. The original standalone frame's overlap warning is retained; the fix does not reposition it or certify GD&T semantics.

Scope is one ordinary unique dimension plus a valid custom imported frame ID on another sheet. Global cap and malformed merged candidates are focused tests, not 200-frame desktop measurements. No PDF/DXF, GD&T solver, manufacturing certification or existing HOLD change. Prior drawing PDF golden limitations remain separate.

Reproduce with Node 22 from repository root:

```
node apps/cad-studio/scripts/test.mjs drawing-frame-allocation
node node_modules/typescript/bin/tsc --noEmit -p apps/cad-studio/tsconfig.json
DRAWING_ATTACHED_FRAME_SHEETS_FROZEN=1 PW_DIR=<playwright package> CHROME=<Chrome executable> node apps/cad-studio/test/drawing-attached-frame-sheets-browser.mjs <fresh output>
```
