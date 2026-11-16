# Measure close help (#86)

Moved Escape help from the always-visible Measure footer to the Done measuring button's shared hover/focus tooltip. First/next-target and restart instructions remain visible. An unavailable target retains its own reselection status without an empty extra footer row. Measurement/geometry logic is unchanged.

## Verification

- Existing `measure-target-suppression-browser.mjs` expanded with width argument, first/next instructions, actual hover and keyboard-modality focus tooltip assertions including aria-describedby, no inline kbd/no orphan footer, Escape close and button close with unchanged document.
- Chrome WebGPU at 1024×900 and 1440×900: PASS. Three 20×12×8 extrusions: initial distance 10 mm and normal distance 8 mm; suppression clears stale distance/overlay, Undo restores, Redo refuses stale target; explicitly picking third body gives 28.28 mm and normal distance 20 mm. Screenshot review confirms help and retained reselection prompt.
- Measurement quantity/pinned-face unit tests: 5/5 PASS.
- Changed-file lint and Studio type-check/production build: PASS.

Initial browser assertion mistakenly counted the required unavailable-target `.measure-item.empty` status as an orphan footer. Corrected selector to exclude that status and reran both widths successfully; no production change was needed.

## Limits

Desktop WebGPU/native cap fixtures only. No assistive-device or other-renderer qualification. Existing #126 WIP and broader measurement behavior untouched.
