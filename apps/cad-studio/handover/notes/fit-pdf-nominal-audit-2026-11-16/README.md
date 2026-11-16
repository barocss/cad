# H7 nominal/PDF investigation (#35, held semantic change)

`lookupFit` uses `nominalOf`, rounded to 1e-6 mm, for table selection and model limits. Drawing `limitsOf` receives the raw measured diameter. A value like 8.000000000000002 therefore becomes an exact decimal tolerance endpoint above 8; inward rounding prints lower +0.001 instead of 0.

Candidate use of the lookup nominal produced the expected +0.015/0 in a real PDF and passed focused new tests. However, drawing-units then failed two existing tests: the ISO/ASME SVG/DXF golden baseline and the explicit raw-nominal point-zone contract. This changes an established safety/formatting contract, not just incidental text. The candidate was reverted; no golden or production formatter changed. #35 stays open and #44 stays unchecked pending resolution of that held contract.

Independent tooling improvement retained: on macOS the existing PDF regression now uses built-in PDFKit through Swift instead of requiring absent `pdfinfo`. Other platforms retain pdfinfo. No software installation. Actual page count and A3 media-box are checked, and existing PDF text assertions remain unchanged.

Final current-contract browser PASS: `/tmp/cad-fit-pdf-contract-20261116`, including missing-row export refusal, restored fit actual PDF, and missing fit on an unselected continuation sheet. This does NOT assert exact original lower=0: the existing conservative-narrowing allowance remains. Candidate-only run `/tmp/cad-fit-pdf-fixed-20261116` is not evidence of a published semantic fix.

Protected #126 WIP untouched. No ASME policy or PDF product implementation changes.
