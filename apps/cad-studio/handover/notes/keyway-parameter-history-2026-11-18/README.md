# Keyway History parameters: two separately qualified fixes

Qualification base: `170b83744` (#710 included). #711 and #712 share the Keyway editor but have different failure modes.

## #711: unsupported Angle binding
The original explicit Angle 30° model exposes a generic parameter selector. Selecting Angle=90 leaves its numeric/selector display blank; Apply safely refuses with native `angle must be a number of degrees`. Accepted document, History and native shape stay unchanged. The independent original Chrome run passed this observation plus numeric 90°, zero-width/depth refusal, Cancel, Undo/Redo and Save/Open. The patch removes only Angle's binding interface, not numeric angle editing.

## #712: supported Width/Depth, broken UI display
Native evaluation and the existing reader already accept Width/Depth parameter dimensions. Model tests compare their strict B-rep, volume/centroid and saved roundtrip to literal equivalents. The original actual Width Apply triggers `featureLabel → fmt(object) → toFixed` and unmounts the React UI. Its accepted document remains exactly unchanged. The empty History DOM is an unmounted screen, not demonstrated data deletion. Original Depth UI was not reached. The failed receipt is preserved; it is not described as a passing browser run.

The patch uses existing `num(Dim)` getters and `n(Dim)` label formatting, and aligns the Keyway width/depth TypeScript declaration with existing native/reader Dim support. No schema/native capability is added. Angle stays numeric.

## Fixed actual and regressions
Chrome WebGPU on a saved synthetic Ø40/20 tube H22, center (0,16), Keyway 6×2.8 at30°: numeric 7×3.4 at90°, Undo/Redo, invalid zero dimensions, draft Cancel, Save/fresh Open. Width=7 then Depth=3.4 bindings both remain through later Angle90 editing, Undo/Redo and Save/fresh Open; reopened UI shows values and correct parameter names. WrongWidth21 exceeds bore diameter20 and is safely refused; accepted source and native shape remain intact. No Angle picker remains.

Native checks are independent of UI meshes: strict B-rep, one solid, outer/bore cylinder radii20/10, expected floor normal and radial offset10+depth at the requested angle. Removed cross-section is `w(10+d) − [h√(100−h²)+100 asin(h/10)]`, h=w/2; volume is `(300π−removed)*22` with1e−6 mm³ tolerance. Floor position/direction tolerance1e−8. Existing Keyway History and open-slot Chrome regressions pass at1024/1440 desktop widths. All fixed/regression browser runs report errors0, consoleErrors0, changes[], normal browser/server cleanup.

Focused Model11/11 and Studio numeric1/1 PASS. Model tests also cover changed parameter values, missing parameter refusal, numeric edits preserving the other binding, labels, supported tube Height binding and Save/Open. Scoped lint, syntax and diff checks PASS. Model type check and Studio type check/build PASS. Whole-suite, other browsers, mobile, arbitrary hubs and manufacturing validation NOT_RUN. Existing HOLDs, Gizmo and doc-sync untouched.

Initial investigation incorrectly suspected all three fields were number-only. Native/reader evidence disproved Width/Depth refusal; that assumption was corrected before product changes. A separate original Angle run avoids the Width UI crash. No hidden fallback or broad binding removal was used.
