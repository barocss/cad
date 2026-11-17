# Circular pattern cardinal-axis origin invariance

Baseline `00c98262f`. An axis origin may move along that same axis without changing any rotation. The existing origin+R(seed-origin) calculation lost small axial coordinates by subtraction/addition cancellation: world-Z originZ=1e16, seed[12,0,1] generated copies at Z=0 instead of1. OriginZ=0 was correct. This is an accepted API/file input's wrong-success, though extreme coordinates are uncommon in manual CAD work.

The first draft test used the wrong helper import (`addInstance`); corrected to existing `addPart` before the retained geometric baseline FAIL. No product changes were made to obtain the baseline.

## Correction

For exact cardinal ±X/Y/Z, do not subtract the irrelevant axial origin component and retain the seed's axial position directly. Rotation, transverse position formula and general oblique-axis path remain unchanged. Authored origin is preserved in the document. No arbitrary coordinate clamp, schema/API/kernel or domain expansion.

## Verification

- Baseline focused1 FAIL: all three copyZ values0, expected1.
- Final Model37/37 PASS: existing patterns26 and extreme direction7 plus4 origin tests. All cardinal axes/signs, signed1e16/MAX_VALUE origins, explicit edits, unchanged rotations/IDs/source, native read/expand checked against literal positions. Model type, targeted lint and diff check PASS.
- Actual Chrome first run PASS: seed[30,0,1], Z90° count4, originZ=1e16 then -1e16. Copies[0,30,1],[-30,0,1],[0,-30,1]; Undo/Redo, actual native Save download/fresh Open and shared source/IDs preserved. Screenshot directly reviewed; no page/console errors or frozen-source mutation.

NOT_RUN: actual X/Y/opposite-axis/MAX_VALUE browser flow (Model tested); arbitrary large transverse coordinates, oblique-axis cancellation, overflow of meaningful transverse displacements, general geometric/solver precision or exchange qualification. Existing HOLDs remain.

Commands: `node packages/barocss-cad-model/scripts/test.mjs instance-patterns instance-pattern-axis-origin instance-pattern-direction-range`; `node node_modules/typescript/bin/tsc --noEmit -p packages/barocss-cad-model/tsconfig.json`; `PATTERN_AXIS_ORIGIN_FROZEN=1 PW_DIR=<existing playwright> CHROME=<Chrome> node apps/cad-studio/test/instance-pattern-axis-origin-browser.mjs <artifact-dir>`.
