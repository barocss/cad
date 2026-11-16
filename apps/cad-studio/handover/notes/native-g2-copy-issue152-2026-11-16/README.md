# G2 As a curve closure verification (#152)

Verified on `91ed656404241348dc5e55a32a9f35320042a119`. This is closure evidence for an existing implementation, not a new geometry change.

## Existing implementation

- `b5acee64740407aa0523d1b065aeae3e36efd7a2` preserves selected native edge coefficients through `src/sketch/useSketchActions.ts`, `src/app/ownedNativeEdgeCopy.ts`, `src/app/nativeEdgeCurveSource.ts` and the native edge engine request. Non-native supported circular display fallback is explicitly named `Display approximation`; unsupported displayed edges are refused rather than silently tessellated. Straight fallback remains straight.
- `9edc54a8c85682c5b21e38fee3e11038947ee478` distinguishes copied Sweep path geometry from the resulting solid representation. Copying a degree-4 path does not claim an analytic Sweep solid.

## Verification

Existing `native-edge-copy.test.ts`: 4/4 PASS, including coefficient precision, import append behavior, owner/stale-result checks and legacy line/circular fallback.

Existing `native-g2-edge-copy-browser.mjs`: PASS in actual Chrome WebGPU at 1024×900 and 1440×900. The original 30×12×20 mm Box / R2 / G2 tension 0.5 fixture and Right-view point [30, 0.375, 19.625] selected native edge `n2_e13`.

- Copy is degree 4, not the former degree-1 nine-point polyline. Knots, weights and control points match the selected original edge exactly. Sampled curvature matches and remains nonzero/varying; no approximation label on this native copy.
- Line and R4 semicircle controls retain degree 1 / 2 and curvature 0 / 0.25 mm^-1.
- Body history nodes remain unchanged. Undo/Redo, actual Save download and fresh Open preserve each copy and its coefficients/curvature.
- Additional actual Sweep command/History flows use both copied native degree-4 and generated polyline paths. The UI distinguishes `Degree 4 NURBS` / `Polyline` from `Faceted` solid representation. Strict B-rep checks, Undo/Redo and Save/fresh Open pass for both.
- Reviewed the narrow-view G2 copy screenshot, including degree 4 in the Selection panel. Previous exact source commit CI completed successfully.

## Limits

Native G2 and capsule documents were generated fixtures opened in Studio, not UI Fillet creation. Sweep profile and polyline control are generated fixture inputs. Curvature was checked from saved native coefficients, not by comparing the rendered comb pixels. No Loft, external CAD, screen-reader or other browser claim. No code or schema changes, no new kernel capability. Protected #126 WIP untouched.
