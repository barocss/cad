# Current section results during projection changes

Baseline: `44c648578`. Own synthetic 20×10×8 native box, scale 2:1.

## Reproduced and fixed

A section at Y=50 correctly reports that no material lies behind the cut. Changing Y to 5 and holding the actual native Worker reply leaves the previous Y=50 error visible beside the new input. `cutsMade` checked only model identity although views checked the complete projection key.

The hook now admits section results only when views from that same request are current. This uses the existing model, orientation, cut, engine and worker-session guards; it does not change native geometry, request payloads or authored settings.

## Verification

- Actual Chrome baseline: old error visible during the valid Y=5 reply hold.
- Actual Chrome fixed: old error absent while pending; release shows the valid cut.
- Held Undo, release and Redo: pending/result transitions pass.
- Independent SVG DOM bounds: section 40×16 at 2:1, matching the 20×8 section. Cut-trace annotation is excluded from the bounds reader.
- Source nodes unchanged; body volume 1600 mm³.
- Studio adjacent hatch/scope tests: 7/7 PASS.
- Before/pending and after/pending screenshots directly viewed; synthetic data only.

First fixed run passed currentness and Undo/Redo but its bounds selector also included the cut trace, causing an oracle failure. Narrowing the test to the section geometry produced the final PASS. Product code did not change between those fixed runs.

Not run: general orientation/session race matrix, persistence, exports or PDF acceptance. No HOLD expansion and no claim that #270 is complete.

Reproduction: `SECTION_CURRENT_FROZEN=1 PW_DIR=<existing playwright> CHROME=<Chrome> node apps/cad-studio/test/drawing-section-result-currentness-browser.mjs <artifact-dir>`; add `--baseline` against the pre-fix source to verify the reproduced error.
