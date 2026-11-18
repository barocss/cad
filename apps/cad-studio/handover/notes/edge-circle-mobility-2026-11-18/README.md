# Edge-to-circle local mobility — existing issue #21

## Scope

Admit the existing `cedge` solver rule into read-only local first-order diagnosis for one circle in a straight closed outline. The rule must name a finite nondegenerate edge, circle0, a finite distance >=0.001 and the axis perpendicular to the effective HV constraint. Missing or contradictory HV, malformed endpoints and unsatisfied residuals remain unavailable. The underlying solver, coordinates, radius, file schema and UI wording are unchanged. Radius freedom and finite movement are not diagnosed. General curved/compound geometry is not added; #21 remains open.

## Actual before/after

Original 75fb2c0e14b02948c5ff2607d96c5bd96fb01b48: open a synthetic 40×30 rectangle with saved horizontal/vertical and width/height constraints, one R3 hole centred [12,10], and Extrude5. Use actual Dimension picks on the left and bottom edges and the circle. The free centre already shows two directions, but adding a supported edge-distance rule hides mobility entirely. Geometry and lifecycle still pass; this is a diagnostic coverage gap, not data loss.

Modified actual Chrome: left-edge distance12 shows ±(0,1); adding bottom-edge distance10 fixes the centre; removing the first distance shows ±(1,0). Hover/focus identifies circle0 and clears correctly. Draft Undo/Redo, Finish, document Undo/Redo, Save/fresh Open and reopened constraints pass. Original outline points, circle and radius, HV, lengths, side tags and Extrude are retained. Native strict solid validity and independent plate-minus-hole volume/centroid pass before, after and after fresh Open: volume5858.62833058845 mm³; centroid[20.193044052545133,15.120652532840722,2.5].

Baseline and fixed flows each close two contexts, browser and server with errors=[] and source changes=[]. The actual specimen is XY and one circle. Exterior-circle unsigned derivatives and moving-edge coupled motion are unit-only checks, not actual manufactured-part claims.

## Validation

- `SKETCH_EDGE_CIRCLE_MOBILITY_SOURCE_FROZEN=1 node apps/cad-studio/test/sketch-edge-circle-mobility-browser.mjs <output> --baseline`: PASS, gap observed.
- Same driver without baseline: PASS.
- Existing `sketch-circle-centre-mobility-browser.mjs` and `sketch-two-arc-mobility-browser.mjs`: PASS, clean receipts.
- New edge-circle unit6/6; existing outline/circle/arc/two-arc21/21: PASS.
- Model type-check, Studio tsc/Vite build, scoped ESLint, syntax and diff checks: PASS.
- Initial implementation had an unquoted case label; first focused run5/6 failed with ReferenceError. Corrected before actual execution; subsequent focused and type/build checks pass. Independent review also added fail-closed malformed endpoint checks. No failed result is counted as a pass.

All writers ended before frozen actual runs. No unrelated WIP or HOLD was changed. Public exact-commit CI and image rendering are recorded in the existing issue after push.
