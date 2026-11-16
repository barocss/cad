# Chamfer Distance field validation (#72)

Creation and ordinary History now use the same finite-positive Distance input rule. Creation no longer advertises 0.1 mm as a minimum; valid 0.05 mm stays valid. Zero/negative inputs have associated Distance guidance, aria-invalid and custom validity, and History refuses submission before Enter rather than waiting for a kernel failure. Native geometry validation and existing references are unchanged.

## Verification

- Focused Chamfer/Draft number tests: 2/2 PASS; creation/history rule mapping, small positives, zero/negative/blank/nonfinite and unrelated-field negative control.
- Changed-file ESLint, Studio typecheck/build PASS.
- Actual Chrome WebGPU at 1024×900 and 1440×900. Generated equivalent rounded rectangle 20×10, R2, 1 mm detached inset, 10 mm extrusion; select the inner top straight and adjacent arc.
- Creation and History reject 0 / -0.1 before submission, including Enter attempts with unchanged document. Native input checkValidity and aria-invalid agree; field descriptions identify the positive Distance requirement. Reset restores saved value.
- Creation 0.05 mm produces strict-valid B-rep and volume 534.1847926772 mm³. Two selected references preserved. History 0.1 then 0.05, Undo/Redo, actual Save/fresh Open, repeated rejection and Reset/Close pass.
- Positive but excessive 100 mm creation remains a geometry refusal with Kernel detail, not an invalid positive-range field; recovery to 0.05 succeeds.
- Narrow creation and History screenshots reviewed. First driver attempt incorrectly used a mouse-click modifiers option; corrected to actual Shift keyboard down/up, then both-width run and final geometry-error extension passed.

## Limits

Fixture is regenerated from the same rounded-inset dimensions, not the original QA file bytes. No other Chamfer families, screen-reader, browser or full regression-suite claim. Existing creation failure summary remains alongside the linked field range. No protected #126 WIP changes.
