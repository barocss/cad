# Thread History supported dimensions (#714)

Qualification base `f02c4db77` includes #713. Existing #42 numeric History scope is preserved. No native/schema feature or manufacturing capability is added.

## Four independent original actual baselines
- Pitch=.75 on Ø6×30 shaft, original pitch1/length12: Apply crashes React `featureLabel → fmt(object) → toFixed`; accepted=false, accepted document preserved.
- Nominal Ø=6 on an existing Ø5 bore/M6 thread in30×30×10 box: same actual label crash and unchanged accepted document.
- Length=4 and Relief=.5: Apply, strict native/literal equivalence, Undo/Redo and Save/fresh Open already succeed, but numeric value and parameter selector reopen blank. These are display defects, not unsupported binding.
- Both crash runs retain FAIL receipts; both successful observation runs retain PASS receipts. All source changes[] and normal browser/server cleanup. No demonstrated data-loss claim. Original native shaft and bore both strict-valid, issues[].

## Minimal correction
The four exposed fields' TypeScript declarations now reflect existing Dim evaluation/reader support. Their getters use existing numeric dimension resolution, and the label uses existing parameter-name formatting for Pitch/Nominal Ø. Clearance, Hand, From, whole-face Length0 omission, source-face ownership and native topology rules are unchanged.

Omitted Relief follows Pitch but is not explicitly bound. Its getter resolves the current Pitch value without reporting the Relief field as bound. Explicit Relief binding still reports its own parameter. Model regression changes bound Pitch .75→.8, preserves omission, compares literal native geometry and checks Save/Open; explicit Relief and numeric Relief states also retain the Pitch binding and roundtrip. Existing generic new-leaf binding restrictions are not broadened.

## Fixed actual qualification
Four isolated Chrome WebGPU runs exercise each parameter Apply, exact payload/preceding nodes, correct numeric value and selector after reopen, Hand=left and From=negative-end changes preserving the binding, Undo/Redo, invalid parameter refusal/recovery/Cancel, and final Save/fresh Open. Pitch additionally imports the independent omitted-Relief source, binds Pitch=.75, verifies Relief=.75 with an empty selector and absent relief key through Undo/Redo and Save/Open.

Native validation checks strict B-rep, one solid and finite positive volume. Bound recipes are compared to literal-substituted recipes for native volume, vertices and semantic face names; displayed mass-volume matches native. This is a dimension-evaluation equivalence test, not an independent analytic thread-volume oracle or arbitrary topology claim. No tolerance was loosened to admit the patch. Original partial-bore triangulation refusal noted by #42 remains outside scope.

Focused Model13/13 and Studio numeric1/1 PASS. Scoped lint/syntax/diff and independent review PASS. Actual four new runs PASS with errors0/consoleErrors0/changes[] and cleanup. New frozen existing Thread regression PASS at1024/1440 on shaft/bore, errors0/consoleErrors0/changes[] and normal cleanup. Model type check and Studio type check/build PASS. Whole-suite/other browsers/mobile/manufacturing NOT_RUN. Existing HOLDs, Gizmo and doc-sync untouched.

The first existing Thread regression attempt reached final whole-bore1440 but failed its final changes[] invariant because evidence note files were added during the run. This is a validation-process failure, not a newly observed product failure. That run is not claimed PASS; type/build stages did not run. All writers are stopped for the new frozen rerun.

The frozen rerun completed after all writers stopped; the first watcher failure remains recorded separately.
