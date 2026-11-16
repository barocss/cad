# Contextual Cage checks (#79)

Closed valid cages no longer show zero-count legends, repeated face counts or preview timing at rest. Existing Cage checks retains active open-edge/ngon/dart counts and non-manifold warnings. A collapsed, keyboard-operable Cage details disclosure preserves all marker legends (including ringed G1 poles), counts and available preview time. No editing, topology validation or commit logic changed.

## Verification

- `CAGE_CHECKS_FROZEN=1`, `test/cage-checks-browser.mjs`: Chrome WebGPU PASS at 1024×900 and 1440×900. Actual 30×20×16 SubD box with 4 quads/side (96 total), Box/Smooth switching, collapsed checks at rest, keyboard Enter opens/closes details, actual face selection and Delete gives 95 faces and visible 4 open edges. Undo restores quiet closed state, Redo restores warning; Cancel preserves original document.
- Render tests verify zero-count legends/timing reside only inside initially closed details. Synthetic validation-result fixtures verify non-manifold/ngon/dart/open-edge warnings remain outside details. These are presentation tests, not native topology qualification.
- Existing Fill/Bridge boundary browser regression: PASS at both widths, including actual boundary deletion/fill/bridge, disabled-action recovery, Undo/Redo, Cancel and accepted native Save/fresh Open. First run completed the behavior but its source-freeze check caught a handover-note creation; rerun with all sources/notes frozen passed.
- Final Studio type-check/production build PASS.
- Cage render/commit-readiness/begin-policy tests: 9/9 PASS. Changed-file lint PASS.
- Narrow open-edge and diagnostic screenshots reviewed.

## Limits

No browser-created n-gon/non-manifold fixture; their conditional warning rendering is covered by synthetic render fixtures. Preview timing visibility covered by render fixture, not an actual timed drag. No assistive-device or alternative-renderer qualification. Existing #126 WIP excluded.
