# Varying Fillet contact recovery (#158)

`varyingFilletFailure` scopes the History recovery hint to CONTACT_LEAVES_FACE on the edited varying Fillet itself. The failure contains no trustworthy station identity, so it explicitly does not blame one radius. The user is directed to Start, End and interior radii/positions, smaller radii, or Reset in this editor, rather than an impossible instruction to round another edge first. The title, kernel detail and failed-feature identity remain intact. Unrelated/downstream failures and constant Fillets retain their original guidance.

Validation:
- Final production TypeScript/Vite build PASS (`/tmp/cad-varying-contact-build.log`); focused changed-file ESLint PASS.
- Helper unit tests 2/2 PASS, including scope guards and evidence preservation.
- Extended `drafted-extrude-variable-fillet-browser.mjs` PASS (`/tmp/cad-varying-contact-20261116`). Existing native four-radius Draft 8→12 workflow, independent geometric oracle, Save/Open remain passing. At 1024×800 and 1440×900 actual Interior 1 radius 14 mm is refused once in the editor without document mutation; Reset restores 3 mm and clears the error; repeat refusal then 8 mm repair preserves other radii/positions, passes strict native B-rep validation and Undo/Redo.
- Narrow screenshot reviewed. The recovery hint uses the existing single error owner rather than duplicating a field error without a proven station location.

Limits: no new precise station diagnosis, kernel capability, arbitrary section/angle or assistive-technology claim; no aggregate suite. #126 WIP untouched.
