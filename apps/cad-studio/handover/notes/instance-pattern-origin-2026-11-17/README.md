# Circular instance pattern axis origin

Baseline `6af9873ad`. Studio now creates and edits circular instance patterns around an explicit axis origin (X/Y/Z, mm), using the existing Model `origin` field and transactions. Previously creation fixed it to world zero and axis choices incorrectly said “through the origin” even for an imported nonzero origin.

Unchanged origin/custom axis values are omitted from edits, preserving exact authored values. Blank coordinates are invalid rather than coerced to zero. Linear patterns ignore hidden circular coordinates. No new schema, geometry algorithm, public API or dependency. This is not #263 seed-orientation preservation.

## Actual verification

- Chrome: Cancel preserves source; blank origin on Make/Apply refuses unchanged; explicit origin creation/edit succeeds.
- Independent literal position expectations, Z quarter turns, seed at [50,0,0]: origin [10,20,30] produces [30,60,0], [-30,40,0], [-10,-20,0]. Origin [20,20,30] produces [40,50,0], [-10,40,0], [0,-10,0].
- Stable occurrence IDs/shared definitions, unchanged seed/base nodes, Undo/Redo, actual native Save download, fresh Open and post-open editing PASS.
- Focused Studio draft tests 4/4 PASS, including custom-axis precision and blank/nonfinite inputs.
- Existing Model instance-pattern tests 26/26; final Studio type check, targeted lint and diff check PASS.
- UI screenshots directly reviewed; synthetic fixture only.

First browser run stopped before product edits because its legacy icon-text selector expected `widgetsCube`; the current SVG icon contributes no text. The corrected driver uses the existing instance-path attribute and passed. A test-only union narrowing diagnostic was corrected before final type validation.

NOT_RUN: non-rotate orientation mode, arbitrary-axis actual browser flow, nested patterns/mate solve, STEP/3MF output or new accuracy claims. Existing Model behavior remains the authority. All HOLDs unchanged.

Run from repository root with installed Chrome/Playwright: `PATTERN_ORIGIN_FROZEN=1 PW_DIR=<existing playwright> CHROME=<Chrome> node apps/cad-studio/test/instance-pattern-origin-browser.mjs <artifact-dir>`.
