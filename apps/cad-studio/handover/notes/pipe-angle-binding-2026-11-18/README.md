# Pipe History numeric angle boundary (#683)

Original main `d32689007`: actual circle r5 → Pipe Run8/Bend radius20/90° creation. History offered Bend 2 angle parameter even though saved Sweep angle and native admission are number-only. Selecting Angle90 made both numeric input and selector blank. Apply remained enabled but native rejected `path[1].angle must be in (0, 180]`. Accepted document, History and native output stayed exactly unchanged. This is unsupported UI binding, not data loss.

One product line excludes only Sweep `bendAngle` plus numeric index fields from the generic parameter wrapper. Numeric bend angle, other features, profile fields and supported Run/Bend radius Dim references remain unchanged. No schema, kernel, evaluation or geometry expansion.

## Verification

- Original unit3 PASS/1 RED. Final Pipe angle-binding/angle/Revolve binding checks9/9 PASS; scoped ESLint/diff PASS; Studio tsc --noEmit and Vite build PASS (11.13s).
- Actual fixed Chrome: angle parameter absent while Run/Radius parameter controls remain; numeric90→120→60 with Undo/Redo;181 refusal retaining accepted60; changed100 Cancel; Run1→Run12 and Bend2 radius→Radius25 bindings, each with exact document assertions and Undo/Redo; native Save/fresh Open and re-opened controls PASS.
- Existing Pipe angle and bend-radius full actual regression flows at1024×900 and1440×900 PASS, including refusal/recovery, Undo/Redo and Save/fresh Open.
- Four original/fixed/regression source capsules unchanged, errors0 and owned browser/context/server cleanup verified. Screenshots visually inspected. No fixed-run failure.

## Independent physical checks and limits

For this circle radius5, +X non-overlapping path only, independent volume is `pi*25*(run1+run3+R*theta)`. Initial runs8/8, R20 and angles90/120/60; final run1=12 via parameter, run3=8, R25 via parameter and numeric60°. Final expected3626.963910355180 and native3626.963910355179 mm³. One strict-valid native solid, displayed volume, initial cap radius and final cap vertices are checked. Final cap centre is `[R*(1-cos(theta))+run3*sin(theta),0,run1+R*sin(theta)+run3*cos(theta)]` with normal `[sin(theta),0,cos(theta)]`, radial distance5; native terminal cylinder axis also agrees.

The kernel can Boolean overlapping path pieces; additive mass is not claimed for those cases. Actual coverage is this one admitted +X circular profile family plus existing creation regressions, not arbitrary paths/profiles or new angular parameter support. Multiple bend field keys and other-document/source preservation are focused unit coverage. Existing HOLDs and doc-sync pause remain. This is task-local evidence. Final heavy run had21.5→20.4 GiB available, above the task-added2 GiB reserve; no cleanup was performed.
