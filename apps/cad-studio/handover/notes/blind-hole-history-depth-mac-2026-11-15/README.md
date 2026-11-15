# D1363 — Blind-hole History depth input (Mac)

Base `f8ffae23bdaf1d02cf84537aca61522f523beafc`. Partial #22; umbrella remains open.

`featureNumberInput.ts` connects literal History Depth on a hole with an authored depth to the existing positive-number rule. Existing NodeEditor retains raw invalid text, local linked error and Apply/Enter refusal. Through holes and unrelated fields are unchanged. No new geometry, kernel or 0.5 mm minimum restriction is introduced.

## Verified

- Focused 6/6 (3 blind-depth and 3 Countersink), Studio TypeScript, scoped lint, production build and diff check PASS. Focused checks include allowing 0.05 mm and leaving Through/other fields unchanged.
- Actual Chrome at 1024/1440: X/min blind entry, Centre Y draft 36.125 retained while literal Depth 0, -1 and blank refuse with disabled Apply and unchanged source. Linked positive feedback is exposed for numeric refusals. Correcting only Depth to 8.25 retains that centre draft.
- Exact node change asserted; native strict B-rep remains one solid. Independent analytic volume `19200 - 4π × 8.25` matches within 1e-6 mm³. Document Undo/Redo and downloaded Save/fresh Open passed.
- Actual 1024 refusal screenshot reviewed for visible input, error and disabled Apply; 1440 reopened screenshot reviewed for stable layout. The left-side hole is occluded in the default isometric view, so geometry acceptance comes from strict native checks and analytic volume, not visible bore pixels.
- Frozen-source browser receipt `d1363-first/receipt.json`: SHA256 `110685c1ca6c7100c8e71d03a4870849bdf8354db021b1259e06db34db9736a9`, PASS. This records actual visual review after the receipt placeholder.

Parameter-bound zero, initial malformed imported history, other axes, full-suite, CI and assistive-technology checks are not claimed. Existing HOLDs retained. Next D1364 reviews remaining #22 History feedback gaps without closing the umbrella.
