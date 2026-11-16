# Tolerance stack selection units (#103)

The existing one-axis explanation now distinguishes `Choices: mm` or `Choices: inch` from `Results: mm`. Dual drawing units state primary and bracketed secondary units in their displayed order, for example `Choices: inch [mm]`. No extra panel or arithmetic change.

Validation: full drawing-tolerance-stack browser flow passes in Chrome at 1440x900 and 1024x900. Initial mm, inch, both dual-unit orders and return to single-unit labels are asserted. Nominal/min/max remain 10 / 9.77 / 10.27 mm with the independent Decimal oracle. Removal confirmation/cancel, reused-ID refusal, Undo, save/reopen and lost occurrence refusal also pass. ESLint and Studio build/typecheck pass. The 1024px screenshot was reviewed for readable wrapping.

Run `D1256_SOURCE_FROZEN=1 ... node apps/cad-studio/test/drawing-tolerance-stack-browser.mjs OUTPUT WIDTH` with installed Chrome/Playwright. Other browsers, assistive technology and the full repository suite were not run.
