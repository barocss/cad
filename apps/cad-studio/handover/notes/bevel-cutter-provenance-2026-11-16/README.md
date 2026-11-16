# Spiral bevel cutter provenance (#30 partial)

On main760aec28, editing only Spiral angle in History adds `cutterEstimate: true` to an existing explicitly entered cutter radius. The radius remains numerically correct, but the body inspector incorrectly calls it an estimate. The default object was spread before the existing spiral; an absent flag could not override the inserted `true`.

The angle setter now copies an existing spiral and changes only its angle. Only a straight-to-spiral transition initializes the previous left-hand, mean-cone-distance estimate. Explicit false, absent and true provenance, hand, and numeric radius remain unchanged. The existing Cutter radius setter still removes the estimate flag. No schema, generator, geometry tolerance, App props or commit ownership changes.

## Verification

- Pre-fix focused suite: 3 FAIL / 1 PASS; failures cover absent provenance, radius-then-angle edits and evaluated notes. After fix, new4 + existing editFields5 = 9/9 PASS.
- Explicit radii40/60, absent/false/true flags, input immutability, straight/spiral transitions, explicit radius after estimate. Edited evaluation matches a directly authored angle change in mesh positions, indices, volume and notes. Estimate versus explicit metadata does not alter geometry. These are product-level equivalence checks, not independent manufacturing qualification.
- Target lint, Studio type check, diff check PASS. Production build3.94s PASS with existing bundler warnings.
- Frozen actual Studio run `/tmp/cad-bevel-provenance-browser-02` PASS: explicit40 radius with35→30° angle, Undo/Redo, in-memory native JSON reopen, closing an unapplied25° draft; estimated radius retains warning after angle change, direct radius45 removes it and later angle32 does not restore it. Rendered Generator note and warning class match the accepted document and separate evaluation; worker/evaluation volumes agree within1e-6mm³. `09-own-radius-retained.png` visually reviewed. No errors, console errors, source changes or downloads.
- Browser attempt01 failed only on a start-anchored text locator that ignored the note's leading whitespace; screenshot showed the correct baseline note. Removed the regex start anchor, not a product assertion. Attempt02 completed all assertions.

The model remains an ideal spiral bevel model, not a face-milled/face-hobbed manufacturing solution. #30 remains open for Rack pitch, Throated Worm History support and V/Timing Belt inputs. Existing #126 WIP and HOLD scopes unchanged.

Run from model: `node scripts/test.mjs bevel-cutter-provenance editFields`.
Run from Studio under the heavy gate with standard PW_DIR/CHROME: `BEVEL_CUTTER_FROZEN=1 node test/bevel-cutter-provenance-browser.mjs <output>`.
