# Centre arc completed-placement draft history (#672)

Baseline: main `a94676902967777ddeea556bd3110f272d19611a`. Actual three-click upper semicircle, centre (20,15), radius10, endpoints (30,15)/(10,15), had Undo disabled. Existing Line point history and open-profile Finish restrictions are not new features.

## Bounded change

Only the final Centre arc click records a full-draft history step. Pending centre/radius remain viewport-local. Tool switch drops unfinished arcs; first Escape exits Sketch, and pending-only New part exits without a confirmation. These observed original contracts are unchanged.

Parking a completed open two-point single arc may add `pending:false`; every other enumerable value, nested geometry/source identity and ordered owner must remain identical. This is an owner representation check, not a claim of tool provenance. General polygons, reversed/regenerated/cloned geometry, newly merged joinOpen geometry, foreign documents and Trim do not gain inferred identity matching. Current tool is retained on Undo/Redo as before. Schema, native admission and geometric construction are unchanged.

## Verification

- Combined Centre arc/Ellipse/Slot/Circle/Rectangle/draft selection/history tests: 68/68 PASS, including actual switchTool parking, two Line point records, Undo3/Redo3, Clear references and rejected ambiguous joins. Prepatch new-unit RED was NOT_RUN; original actual baseline independently proves the missing Undo.
- Frozen actual Chrome Centre arc PASS: first/repeated placement; original pending tool/Escape/New part behavior; rectangle companion and construction; completed arc plus pending next arc Keep/Discard; fresh document isolation; Line diameter Undo3/Redo3; Finish, Extrude3, document Undo/Redo, Save and fresh Open.
- Independent actual Ellipse, Slot, Circle and Rectangle drivers PASS. All five final runs preserve 1075 source hashes with zero reported page/console errors and confirmed context/browser/server cleanup.
- Studio tsc --noEmit and Vite build PASS. Latest main #673 was fast-forwarded after browser runs; its frame-section changes do not overlap sketch paths. Focused tests were rerun after integration.
- Baseline, replayed Line/arc and reopened solid images visually inspected.

## Retained failures and fixture correction

Fixed01 mistook the active live-cursor segment for authored geometry. Fixed02 was interrupted by disconnection before any actual result, so is NOT_RUN, never PASS. Fixed03 expected active Point inputs on a parked shape. Fixed04 removed the last point unconditionally even when replay cleared the cursor. Fixed05 compared SVGPointList float32 coordinates with serialized marker coordinates and mistakenly removed the real endpoint. The final helper parses original serialized polyline coordinates, reads only the number of authored Point markers (not the extra arc centre marker), and excludes local arc previews. No tolerance was widened and no product geometry was altered to satisfy the fixture. An independent read-only review confirmed the exact saved endpoint equality. Final frozen run is separate from every failed attempt.

## Geometry and limits

The diameter closes the semicircle explicitly before extrusion. One strict-valid native B-rep has four faces, six edges and four vertices. Cylinder radius10, centreXY(20,15), Z axis and diameter endpoints at Z0/Z3 are checked. Native/display volume is 471.2388980384685 mm3, differing from independent analytic 150*pi by 4.55e-13. Save/Open and document Undo/Redo preserve accepted document and native result.

This qualifies the tested XY semicircle and completion history, not arbitrary sweep directions, general spline history, connected-arc reselection after joinOpen, full CAD parity or a whole-suite pass. Existing HOLDs and paused doc-sync remain; this is task-local evidence.
