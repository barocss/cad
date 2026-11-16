# Angular placement side guidance (#111)

After the second edge is selected, the current drawing status says to choose the side of the corner to measure and click to place the angle. Before that, the existing first/second-edge prompts remain. Placement removes the side prompt. Preview and angle geometry are unchanged.

Chrome real triangle extrusion PASS at 1440x900 and 1024x900: same horizontal/diagonal edges produce 45° and 135° on opposite sides; prompt appears only after the second edge; preview and committed arc paths/values match; arrowheads/text remain filled and arcs unfilled; each Undo restores the original document. Studio TypeScript/build passes. Driver ESLint passes. DrawingWorkspace ESLint reports five pre-existing unused-variable errors, reproduced unchanged against HEAD via stdin (DrawingFix, _sig, _was, _leader, _sheet); this change adds no lint error and does not alter those unrelated lines.

Run `ANGLE_PREVIEW_FROZEN=1 ... node apps/cad-studio/test/drawing-angle-preview-fill-browser.mjs OUTPUT`. Save/reopen, export, Section/Detail angles, other browsers, assistive technology and full repository suite not run.
