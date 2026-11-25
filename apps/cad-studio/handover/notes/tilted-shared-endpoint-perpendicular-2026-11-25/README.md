# D1981 — Verify a tilted shared-endpoint Perpendicular and reject the competing tangent

P1 rows 09 and 16, [#281](https://github.com/barocss/cad/issues/281). Completes the bounded D1980 shared-endpoint line–circular arc constraint. A joint cannot carry both its perpendicular and tangent rules. The sketch solver now diagnoses that exact conflict before numerical iteration, rather than letting an incompatible combination move entities or degenerate the joint.

- **PASS, tilted and XY Chrome WebGPU:** actual canvas selections both ways, constraint inspection and deletion, draft and model Undo/Redo, Finish, R8 → R9, straight length 11 mm, native Save and fresh Open. The tilted run has 13 captured states and three independent geometry checks; the XY control has 11 states and three checks.
- **PASS, independent placement:** use the authored 30° plane at (3, 4, 7) and transform the sketch vertices to world space at depths 0 and 6 mm. The native vertex positions agree to 1e-8 mm and the R9 cylinder axis is parallel to the original plane normal. Fresh Open retains one strict valid closed solid, the original side names, and the independent volume of 951.156736279 mm³.
- **PASS, actual Studio conflict:** after fresh Open choose the same line and arc. The duplicate perpendicular is unavailable. Tangent reports the conflict while retaining the selection, sketch values, constraints, rank/DOF, document, bodies and model undo history. Model tests also add the rules in the opposite order and retain the earlier outline.
- **PASS, file boundary:** current Open still refuses an unmarked mixed rule or a marked but unsatisfied one without replacing working state. The D1979 reader compiled from its exact source accepts the original tilted file and explicitly refuses the new file through both readers.
- **PASS, local regression:** 32 selected Model tests and 32 Studio constraint tests, both type checks, scoped lint and syntax/diff checks.
- **NOT RUN:** other renderers, rotation angles and general curved/3D constraints. The result does not broaden the allowed pair beyond one line and one adjacent circular arc at their single shared endpoint.

[Reopened tilted solid](studio/08-saved-perpendicular-reopened.png) · [Actual Studio conflict and preserved sketch](studio/09c-competing-tangent-refused.png)

Run the [desktop driver](../../../test/shared-endpoint-perpendicular-browser.mjs) with `D1980_SOURCE_FROZEN=1`, `PW_DIR`, `CHROME`, the output directory, and `--tilted` for this acceptance (omit the flag for XY). Use its saved files with the [previous-reader test](../../../test/shared-endpoint-perpendicular-previous-reader.mjs).
