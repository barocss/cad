# Inclined wall inward Offset recovery (#128)

The existing field-local collapse receipt recognized the cap refusal but not the distinct side-wall refusal. The exact native `close a section or cross the opposite wall` detail now participates in the same feature/dependency ownership checks. The user sees side-specific closure wording beside Offset and, for the edited feature's own negative distance, instructions to reduce the inward move with a less negative value. Original feature/face basis, saved value and optional technical detail remain available. No numeric threshold or geometry admission was added.

## Verification

- Unit tests 3/3 PASS, using actual native cap, dependent cap and inclined-wall refusals. Side controls: −36 refused; −35.9 and −2 accepted.
- Changed-file lint and Studio typecheck/build PASS.
- Chrome WebGPU 1024×900 and 1440×900 PASS: 40×30×10, Draft 10°, +X wall, real handle +3; −36 refusal has one field-associated error, original side identity, collapsed detail and disabled Apply; accepted document unchanged.
- −35.9 preview accepted; precision values −35.918/−35.916 and −35.92 refusal retained. Strict B-rep, topology/identity, planes, analytic volume, Undo/Redo, native Save/fresh Open and invalid-file preservation all pass in existing wall driver.
- Reopened wall repeated −36 refusal then −2 recovery in same editor; Undo/Redo and actual Save/fresh Open retain native side, geometry and analytic volume. Narrow screenshot reviewed.

The first run confirmed that existing cap-only matching did not cover the side error (aria-invalid absent); exact side matching was added and both widths rerun successfully.

## Limits

One rectangular taper wall/draft angle; no universal numeric limit, other body classes or assistive-device coverage. #126 WIP untouched, no kernel/release/deployment change.
