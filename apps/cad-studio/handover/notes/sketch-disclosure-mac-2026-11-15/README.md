# D1352 — Sketch diagnostics, point-pair and Ellipse disclosure (#59 closeout)

## Change

Keep Solver rank/DOF inside a native closed-by-default diagnostics disclosure instead of repeating the normal constraint status. For two actual distinct points with an available Dimension key, omit only the duplicate Distance button; Dimension and Horizontal/Vertical retain native behavior. Circle/edge combinations are unchanged. Matching Ellipse has concise status; existing Make curves help explains exact ellipse conversion and retained sketch, available on hover/focus.

## Verification

- Six focused presentation/status tests, Studio tsc, changed-file lint, diff check and production build PASS.
- Actual source-frozen Chrome/WebGPU1024/1440 first run PASS. Diagnostics initially hidden, keyboard Enter reveals rank6/2DOF and closes again. Two opposite points expose a single Dimension plus H/V; each opens expected44.72135955/40/20 value, Escape preserves document. Horizontal42 reduces2→1DOF; Finish and5mm Extrude produce4200mm³, Undo/Redo and actual Save/fresh Open PASS.
- Draw12×6 ellipse: concise status and one192-arc constraint row; actual hovered Make curves tooltip explains exact result. Finish/reopen/Make curves retains original sketch nodes and creates one degree2 curve.65 native curve samples independently satisfy ((x−20)/12)²+((y−20)/6)²=1 within1e−9 and z=0.
- Actual1024 two-point controls and1440 ellipse-help screenshots visually reviewed. Receipt SHA256 `57adf51e0aa3faf2c81c721d09b9a5ca4cf2c48da49f43959f28f7d066fd0931`.

Together with D1351, #59 body and later comment criteria are covered. Native geometry/constraint admission unchanged. No full-suite or assistive-technology claim. Existing HOLDs unchanged. Next D1353/#131 open-chain next-action guidance.
