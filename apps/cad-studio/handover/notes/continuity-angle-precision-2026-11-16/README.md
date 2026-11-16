# Sampled angle display precision (#114)

Angles round to 0.000001 degree for display. Equal displayed endpoints collapse to one angle. Floating-point roundoff at the tangent joint reads 0 degrees rather than a scientific-notation interval; a constant right angle reads 90 degrees. The value tooltip states the precision and that sampled angles do not establish a continuity grade. Raw results, sample counts, curvature and classification are unchanged.

Validation:
- Display unit tests 2/2 PASS: near-zero roundoff, constant 90, equal rounded endpoints, a 0.000001–0.000002 interval, values across the rounding boundary, and wide/near-90 variable ranges.
- Real Chrome 1440x900 and 1024x900 PASS: capsule extrusion sharp/tangent edges read exactly 90° and 0° with 8 samples. Independent native-normal oracle passes. Keyboard discovery focus, clearing stale results and replacement document ownership remain covered.
- 1024px tangent screenshot reviewed: readable value and sample count, no added panel.
- ESLint and Studio TypeScript/build PASS.

Driver: `D1258_SOURCE_FROZEN=1 ... node apps/cad-studio/test/edge-continuity-browser.mjs OUTPUT WIDTH` with installed Chrome/Playwright.

Limits: small genuine nonzero and variable ranges are formatter unit inputs, not new physical browser fixtures. Other browsers, assistive technology, full suites and geometric continuity certification are not qualified.
