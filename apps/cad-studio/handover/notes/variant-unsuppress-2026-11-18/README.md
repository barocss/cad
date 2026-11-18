# #703 Variant-owned default suppression can be lifted

Baseline 3835ff053e8d74721f8719279716a05ea29aa73a. Public set_inputs accepts a default-suppressed optional bracket with Include bracket=false and suppression when=false. Choosing With bracket (true) in the actual Variants panel left the bracket absent: body0, volume0, BOM mass0.

Only suppression owned by a matching input default is lifted at a nonmatching value. A nonmatching default with independently authored manual suppression remains suppressed. The master, stable feature identity and existing active-default suppression direction stay unchanged. Boolean/choice and base/occurrence cases are covered.

## Verification
- Actual frozen baseline: expected FAIL after selected variant still had no bracket.
- Fixed frozen Chrome: PASS; optional body1, volume500mm³ (floating tolerance), BOM mass1.35g. Downloaded purchase CSV matches the existing format and item/quantity rows; it has no mass column, so no CSV numeric-change claim is made.
- Native Save/fresh Open keeps active variant and master suppression; Show the master restores omission, Undo/Redo restore exact documents. Images inspected; both runs changes=[] and full context/browser/server cleanup.
- variant-unsuppress + existing O11 variability 10/10 PASS, including STEP/BOM/cache comparisons. First fixture equality500 vs500.00000000000006 was corrected to tolerance, then rerun.
- Owned ESLint and Model/Studio tsc PASS. Disk after14GiB.

Run variant-unsuppress-browser.mjs with VARIANT_UNSUPPRESS_FROZEN=1. No mate repair, nested input expansion, manufacturing qualification or schema change.
