# Draft angle field boundaries (#74)

Draft and Edit Draft now share a signed angle input rule: finite, nonzero, strictly between -45 and 45 degrees. HTML bounds no longer falsely flag -44.5 / -44.25. Because HTML min/max are inclusive, custom validity excludes zero and both endpoints; aria-invalid, described-by range guidance and Apply state agree. Duplicate DRAFT_ANGLE command errors are suppressed only while this owned angle field is invalid. Other geometry refusals remain visible. Native geometry validation is unchanged.

## Verification

- Focused angle/radius tests: 2/2 PASS; both command IDs, signed interior fractions, zero/endpoints/outside, blank/nonfinite, bounds and negative controls.
- Changed-file ESLint and Studio typecheck/build PASS. Initial test union narrowing and unused copied browser helpers were corrected before final checks.
- Chrome WebGPU, 1024×900 and 1440×900: generated STEP box X4..24, Y-3..7, Z6..11; select Front side, Pull +X, Body end X4. Creation and History reject 0, +/-45, +/-46 and blank with field guidance/custom validity and disabled Apply, retaining saved document.
- Create -44.5 and edit -44.25: valid native HTML state and preview, independently calculated corners/volume and strict B-rep pass. Undo/Redo, actual Save download/fresh Open, repeated invalid-to-valid recovery followed by Cancel all preserve expected state.
- Changing Pull to a geometrically invalid parallel direction still exposes its separate recovery message; the valid Angle is not mislabeled invalid.
- Narrow-view refused screenshot reviewed; final driver rerun PASS after helper cleanup. #126 WIP untouched.

## Limits

Positive near-boundary angles are covered by pure input-rule tests, not a second expanding-side browser geometry fixture. STEP fixture is generated locally. No screen-reader/device, other browser, broad Draft topology or full browser-suite claim. Empty input retains the existing separate Enter a value notice in addition to the angle range.
