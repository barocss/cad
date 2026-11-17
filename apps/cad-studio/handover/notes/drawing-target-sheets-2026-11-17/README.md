# Datum target allocation across drawing sheets

Base `71fc616b9`. The actual baseline creates an area target on Sheet 1, then on Sheet 2: both are saved as target-1/A1, because each creation path allocates from only the active sheet’s rows. This is accepted duplication, not a refused edit or observed deletion of the original.

Point and line/area creation now share a whole-drawing allocator. Existing IDs and A-series numbers on every sheet, including unresolved legacy rows, remain reserved. The existing A-series policy and strict new-number 1–99 bound remain; exhaustion or 200 total rows refuses creation instead of inventing another letter or invalid number 100. Point reselection keeps its original identity and is not blocked by fresh-allocation exhaustion. No schema/reader, source point signature, target rendering or stored row migration change.

## Verification

- Actual baseline FAIL: expected target-2, got target-1 on the second sheet; receipt records duplicate A1.
- First fixed Chrome run PASS: Front area target-1/A1; Right area target-2/A2; Front line target-3/A3; Right exact endpoint point target-4/A4. Earlier rows remain deep-equal after each new target. Point has a captured signature. Nodes unchanged, Undo/Redo for area and point, native Save/fresh Open all rows preserved.
- Three actual SVG downloads: Front A1/A3, Right A2/A4 and reopened Right A2/A4. Texts checked in driver and independently by XML parsing. Actual screenshots reviewed, frozen source unchanged through cleanup.
- Focused allocation and adjacent area-draft tests 4/4 PASS. Covers all-sheet merge, independent ID/number gaps, other letters, unresolved/legacy number >99 reservation, A1–A99 exhaustion and 200 total rows. Limits are unit-tested, not 200-row browser qualification.
- Studio tsc and helper/test ESLint PASS. Workspace lint reports exactly its existing 3 unused bindings (DrawingFix, _leader, _sheet).
- The previous batch established pre-existing DrawingWorkspace lint 3 unused bindings and model drawing-sheets 26/27 with one plain PDF golden mismatch. Neither is caused by this allocator or claimed repaired; no PDF qualification follows.

Node 22 commands from repository root:

```
node apps/cad-studio/scripts/test.mjs drawing-target-allocation datum-target-area-draft
node node_modules/typescript/bin/tsc --noEmit -p apps/cad-studio/tsconfig.json
DRAWING_TARGET_SHEETS_FROZEN=1 PW_DIR=<playwright package> CHROME=<Chrome executable> node apps/cad-studio/test/drawing-target-sheets-browser.mjs <fresh output>
```

Synthetic 30×12×6 plate, Front/Right only. This is new-target allocation, not an audit of manual label editing or migration of existing duplicate files. No new standards, datum fitting, PDF/DXF, geometric certification or manufacturing scope; HOLDs and #180 remain open.
