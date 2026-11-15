# D1351 — Settled Sketch state and plane disclosure (#59, partial)

## Scope

Remove repeated plane text from the Sketch panel heading, retaining the current plane in the workspace control and Plane/Offset/Angle inputs with units. Rectangle uses concise Fully defined state; completed Slot no longer explains its internal extrusion representation, while the intermediate next-click prompt remains. Hide unsupported empty Mobility disclosures; supported movable and fully locked native results remain inspectable. Geometry and solver admission are unchanged.

## Verification

- Focused status/Offset regressions10/10, Studio typecheck, changed-file lint, diff check and production build PASS. Initial extracted helper import omission was caught by typecheck and fixed before frozen browser testing.
- Actual source-frozen Chrome/WebGPU1024/1440 first run PASS. Rectangle plane XZ/offset7/angle15 controls and units remain, draft document unchanged until Finish, then one rectangle sketch and actual Save/fresh Open. Actual narrow screenshot confirms a single plane caption, concise status and no empty Mobility disclosure.
- Slot three-click intermediate guidance preserved; completed shape shows Slot without internal extrusion prose. Native3mm extrusion volume matches3×(20×8+π×16), Undo/Redo PASS.
- H/V polygon Mobility opens by keyboard, movable-row focus highlights geometry, fixed width/height produce No locally movable points or edges. Redundant constraint entry retains native refusal, not a false success. Actual1440 screenshot reviewed with locked state and refusal together.
- Browser receipt SHA256 `a03672adcc6f8c14896bedeb6945631bb5c454b1b606756e2da6697178d85768`.
- Five older browser drivers have expectation-only updates for the single plane caption/absent unsupported disclosure, syntax checked; their full historical scenarios were not rerun here.

## Remaining

#59 stays OPEN: comments add duplicate Solver DOF diagnostics, same-point-pair Dimension/Distance controls and Ellipse implementation-copy/help cleanup. These are deliberately separate D1352 work. No complete issue closure or full-suite/assistive-technology claim. Existing HOLDs unchanged.
