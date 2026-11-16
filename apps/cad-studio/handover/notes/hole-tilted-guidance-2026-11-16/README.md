# Tilted Hole entry-face recovery (#91)

Shared Hole availability now distinguishes a tilted planar entry face from a non-flat face. Each refusal identifies the current face and asks the person to select a flat face facing ±X, ±Y or ±Z instead. Zero/multiple-face guidance remains unchanged. No inclined-hole support, extra permanent panel or geometry-rule change.

## Verification

- `HOLE_TILTED_FROZEN=1` / `test/hole-tilted-guidance-browser.mjs`: Chrome WebGPU PASS at 1024×800 and 1440×900. Actual canvas Back+Top picks on 20×20×10 box, Draft −X/10°/Body end created through UI. Tilted top selected through canvas; search refusal retains query, selection and document. H shortcut shows the same refusal and does not open Hole HUD.
- Right face recovery through H, blind Ø2/depth2 at Y10/Z5 previews and applies. Strict native B-rep valid before/after, analytic removed volume 2π mm³ within 1e-7. Undo/Redo and native Save/fresh Open pass. Narrow refusal and reopened model screenshots reviewed.
- Hole model suite: 7/7 PASS, covering zero, multiple, valid, tilted and curved entry-face availability.
- Changed-file lint and Studio type-check/production build PASS.

## Limits

One axis-aligned box with two-face Draft, desktop WebGPU. Curved-face wording covered at model level, not browser. Assistive devices and other renderers not qualified. Existing #126 WIP untouched.
