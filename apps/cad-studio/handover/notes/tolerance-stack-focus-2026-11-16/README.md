# Tolerance stack removal focus (#104)

Removing a focused stack row now transfers focus to the next surviving dimension select, or the previous one for the last row. Stable term keys select the target after React commits the removal. Arithmetic and authored drawing data are unchanged.

## Evidence

- Chrome baseline reproduced BODY focus after Enter on Remove stack term 3.
- Focused real-browser checks PASS at 1440x900 and 1024x900: last, middle and first row removal; immediate surviving dimension focus; keyboard Add term; reselect dimensions; original document unchanged.
- Two-term minimum 29.85 mm; restored three-term nominal/min/max 10 / 9.77 / 10.27 mm. Python Decimal endpoint oracle also checks positive-shim interval and restored values.
- `node scripts/test.mjs tolerance-stack` in model: 6/6 PASS.
- Changed-file ESLint and Studio build (includes TypeScript): PASS.
- Driver: `drawing-tolerance-stack-browser.mjs OUTPUT WIDTH --focus-only`, with `D1256_SOURCE_FROZEN=1` and installed Chrome/Playwright paths.

## Limits

The full existing driver was also attempted. It passed the focus, tolerance edit/Undo, inch and tangent-option stages, then timed out waiting for the missing-dimension message after clicking Remove dimension. That later removal path is not qualified here; the full driver is not reported as passing. Its cause was not established in this change. Four-plus terms, assistive technology, other browsers and the full repository suite were not run. This fixes stack-term removal only, not drawing-dimension removal.
