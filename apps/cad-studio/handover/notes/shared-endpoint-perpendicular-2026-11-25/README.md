# D1980 — Constrain a line perpendicular to an arc at their shared endpoint

P1, rows 09 and 16, [#281](https://github.com/barocss/cad/issues/281). One closed outline with an adjacent line and circular arc gets one signed-angle constraint between the line and the shared endpoint's radial segment. The radius, authored branch, native side names and downstream Extrude are retained. The stored rule is marked and ordered line then arc independently of pick order. This is perpendicular to the tangent, not to the arc chord.

| Result | Evidence |
| --- | --- |
| PASS | Chrome WebGPU: both pick orders, both glyphs and hover highlights, 6 → 5 DOF, draft remove/Undo/Redo, Sketch Finish and model Undo/Redo. |
| PASS | R8 → R9 and line length 11 mm retain the same side IDs, analytic cylinder and one strictly valid closed native shell. Save, fresh Open and sketch re-entry preserve the relation and dimensions. |
| PASS | A Python oracle independent of Model code checks the line–tangent dot product, both radii, sweep, length and extruded volume. Absolute normalized tangent dot is under 1.7e-11 in the three measured states; native volume is 972.519046855 mm³ after Apply and 951.156736279 mm³ after edit and fresh Open. |
| PASS | Current Open rejects both an unmarked legacy mixed rule and a marked rule whose stored geometry violates the relation. The working Sketch controls, accepted document, bodies and history are unchanged. D860's schema 3/4 inspections and straight-edge control also pass in Model tests. |
| PASS | Previous reader pinned to `4d723c72b77c1f48fb8ef5f8f6ffef0947ccd742` (575 archived sources) accepts the unchanged control but explicitly rejects the new saved file in both raw and file readers with `BAD_REFERENCE`. No schema bump. |
| PASS | Model 31 selected tests and Studio 32 constraint tests. The Model matrix adds CW start, CCW end, outline wraparound, nonadjacent refusal and marked malformed admission. Both package type checks, scoped lint and driver syntax. |
| NOT RUN | Full suite did not finish in this run. Studio on other renderers, a tilted workplane, and the remaining conflict/degenerate fixture matrix were not qualified here. No scope expansion to two arcs, free circles, general curves or 3D. |

The early driver runs exposed stale assumptions about a hidden diagnostics node and the app's dev hooks. The first sketch seed also developed a sliver at the unrelated upper edge after solve; raising the fixture's upper-left point avoids that crossing and the final test independently requires one closed shell. Reversed selection originally serialized the two indices differently despite matching geometry; canonicalizing them fixes it. An interaction with existing Fixed rules was caught by the regression suite and corrected before the final browser run.

Chrome receipt: 11 states, 3 independent geometry readings, 1,234 frozen sources and zero page/console/source-change errors. Oracle SHA-256: `1264e1cd2f74b7cc40939a9111906366dd5db4b12899a1c6e80564a2e2425b7b`. Saved sample SHA-256: `4ae8b25558264c371299daf1775746df8af962311ea87dd84ed252e094fe7b09`.

- [Actual Studio: line and arc highlight](studio/03-perpendicular-arc-and-line-highlight.png)
- [Actual Studio: reopened solid](studio/08-saved-perpendicular-reopened.png)
- [Actual Studio: reopened sketch, R9 and 11 mm](studio/09-reopen-shared-endpoint-constraint.png)
- [Actual Studio: legacy rule refused without replacing the sketch](studio/10-refused-legacy.png)

Run the [desktop driver](../../../test/shared-endpoint-perpendicular-browser.mjs) with `PW_DIR`, `CHROME`, `D1980_SOURCE_FROZEN=1` and an output directory. Run the [previous reader check](../../../test/shared-endpoint-perpendicular-previous-reader.mjs) with the repository root, an empty existing output directory, and the driver's `oblique-source.bcad` and `perpendicular-edited.bcad`. The earlier `line-arc-perpendicular-browser.mjs` refusal driver is a historical baseline for the previous pin, not a current capability assertion.
