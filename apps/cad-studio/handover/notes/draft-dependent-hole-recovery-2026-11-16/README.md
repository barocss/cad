# Edit Draft downstream Hole recovery (#90)

A scoped HUD helper follows the candidate dependency graph: only an edited Draft with an actual later dependent Hole failure receives current-editor recovery copy. It explains the Draft change, restoring Pull/Angle or cancelling, and explicitly names Hole History if its centre must move. The existing single error notice retains kernel detail and failed feature; no speculative geometry limit or preview-worker changes.

Validation:
- Production TypeScript/Vite build PASS (`/tmp/cad-draft-hole-recovery-build.log`).
- Focused changed-file ESLint PASS. Feedback unit tests plus existing neutral feedback regression: 4/4 PASS; independent Hole, direct Draft, unchanged/pending previews are not relabelled.
- Extended `hole-tilted-guidance-browser.mjs` PASS at 1024×800 and 1440×900 (`/tmp/cad-draft-hole-recovery-20261116`). Real Back+Top Draft -X10°, right-face Hole Ø2/depth2, upstream Angle20 accepted; +X twice refuses with one contextual hint, disabled Apply, retained Hole identity and document; -X restores preview; Cancel leaves accepted document, Undo/Redo and actual Save/Open preserve it. Strict B-rep and independent expected volume 2163.1602929137 mm³ within 1e-6. Existing tilted-face selection refusal/axis-normal Hole recovery also passes. Narrow refusal screenshot reviewed.

Scope: this two-face Draft and dependent Hole; no new Hole/Draft kernel support, arbitrary downstream failure handling or assistive-technology claim. Protected #126 preview source and other WIP untouched.
