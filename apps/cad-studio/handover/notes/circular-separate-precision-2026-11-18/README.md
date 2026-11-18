# Separate circular-copy angle precision (#726)

## Bounded change
New Separate circular body copies store the computed `step * copy` Rotate angle without decimal rounding. Existing saved Rotate nodes, One-body rounded span/angle compatibility, schema, source graphs, pivots and copy IDs are unchanged. No native geometry algorithm change, downstream rematch or HOLD expansion.

## Baseline
On ed3934e14670b198772a3e31fee794a0385c962a, actual UI Spread over 120.123456789° remained in the field. Separate Count4 saved angles 40.041152 / 80.082305 / 120.123457 rather than 40.041152263 / 80.082304526 / 120.123456789. Independent native corner comparison measured maximum target discrepancy 3.6136401884437413e-7 mm. The rounded geometry was valid; this is unnecessary quantization, not malformed geometry or document loss. Undo/Redo and Save/fresh Open preserved it.

## Verification
- New focused baseline: 4 failures and 5 passes, as expected from stored-angle/native target assertions.
- Final focused plus adjacent span/handle checks: 34/34 PASS. Includes X/Y quarter turns, invalid Count, original document retention, legacy rounded Separate file replay and unchanged One-body reader contract.
- Actual fixed partial Count4 and full360° Count7: PASS. UI creation, strict native B-rep, each volume192 mm³, independently rotated centroids and eight-corner bijection, original bodies, first Undo/Redo and Save/fresh Open. Maximum corner discrepancies: 1.0048591735576161e-14 and 1.4210854715202004e-14 mm, below the 1e-8 mm test comparison threshold. These are observations for the declared boxes, not a general accuracy guarantee.
- First existing Count-regression attempt: failed on stale expected text containing “with separate bodies”. Both original HEAD and actual failure HTML use “Z circular patterns use a whole-number Count from 2 to 36, including the original.” Apply refusal had already passed. Fixture corrected only that obsolete phrase; all Count/Enter/document/history assertions retained.
- Final existing Count browser and Model typecheck: PASS. Count2.5/0/1/37 reject with Apply/Enter and source/history retained; Count2 applies normally.
- First Studio build attempt used the wrong package filter and ran no project. It is NOT_RUN, not a build success. Correct cwd-based Studio typecheck/build then PASS (Vite 6.42 s).
- Scoped lint, driver syntax and diff whitespace: PASS before final integration.
- Exact main CI and public image loading: PENDING until publication; final issue comment is authoritative.

## Limits
Actual X/Y browser flows and broad downstream/assembly patterns are NOT_RUN. X/Y focused/native checks pass. One-body authored precision remains its existing rounded contract; this issue does not change it. Screenshots cannot prove subpixel precision; native observations and saved synthetic documents supply numeric evidence. Browser/source freeze and cleanup succeeded for both fixed runs. Doc-sync remains paused.
