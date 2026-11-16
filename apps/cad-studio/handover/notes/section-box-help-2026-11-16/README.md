# Section Box contextual help (#85)

Moved the persistent `drag a face's arrow` text into the Box mode control's shared hover/focus tooltip. No section geometry, pointer handling, reset, face-pick or error-rendering code changed.

## Verification

- `SECTION_BOX_HELP_FROZEN=1` with `test/section-box-help-browser.mjs`: desktop Chrome WebGPU PASS at 1024×800 and 1440×900 on default Bracket-01. Six handles, actual arrow-head mouse drag, exact section after drag, Reset restores all planes, document unchanged, Plane face-pick next-action prompt and Escape cancellation.
- X boundary: 6.4→11 mm at 1024, 6.4→10.5 mm at 1440; Reset→6.4. Remaining planes unchanged.
- Actual hover and keyboard-modality focus help checked, including aria-describedby and screenshot review. Persistent inline text absent.
- Section view/span/planes/face-pick unit tests: 18/18 PASS.
- Existing section-face-pick-escape browser regression: PASS at both desktop widths, including repeat Escape, selection/focus preservation, rearm/reclick, palette priority and Plane/Planes modes.
- Changed-file lint and Studio type-check/production build PASS.

## Limits

No assistive devices or other renderers. No newly induced kernel section error; its rendering path is unchanged. Existing #126 WIP excluded.
