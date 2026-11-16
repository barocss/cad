# Hole position completion audit (#43)

No new product fix was needed. Existing changes 73375f852 (picked coordinates / Snap off) and 1286ac3dc (keyboard Type stays in preview), along with right-click pick handling, already satisfy the positional completion criteria. This audit reran them at main 73f909bb09157af241470143364d830f24a29170 without changing product files.

- `hole-pick-position-browser.mjs`: PASS. Pick one top point then right-click a different point; Hole defaults to [24,24], not the first selection, and shows the native entry face. A self-authored STEP box with Snap off retains the fractional [46.5,4] pick within pointer tolerance. Apply creates the expected hole; independent native face/volume checks and strict B-rep check pass; History retains the centre and Undo restores the original document. Screenshot inspected.
- Same browser with `--type-keyboard`: PASS. Enter on Type stays in preview rather than prematurely committing; invalid counterbore recovery and supported blind result verified by the existing driver.
- `hole-types` model suite: 7/7 PASS, including unsnapped coordinates and explicit step behavior.
- Existing issue QA comment independently covers moved left/right faces, grid snapping, diameter/depth History edits and Save/Open; those historical checks are not claimed as rerun here.

Current runs use Chrome WebGPU at the harness desktop viewport. Other renderers, tilted faces, and new full-suite/build validation were not run in this documentation-only audit. Counterbore linked pattern editing remains separate #45, not solved by closing #43. Protected #126 WIP remains unchanged and excluded.
