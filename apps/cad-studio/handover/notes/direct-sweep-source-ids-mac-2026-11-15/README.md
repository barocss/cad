# D1318 — Direct Sweep across source-local IDs (#499)

## Cause and bounded repair

Separate Make curves sources legitimately both contain `c1`. The Direct adapter previously passed these source-local IDs unchanged into native translational Sweep, whose distinct-ID guard rejected them. `directOps.sweep` now creates shallow geometry copies with unique temporary composition aliases from one reserved-ID set. Original object IDs, geometry IDs, source text and curve data are not renamed, moved or hidden. Native builder guards remain unchanged. Selecting the same object twice is explicitly refused before aliasing.

Files: `packages/barocss-cad-model/src/engine/direct.ts`, `packages/barocss-cad-model/test/direct-sweep-source-ids.test.ts`, `apps/cad-studio/test/direct-sweep-source-ids-browser.mjs`.

## Independent Mac verification

- Actual public Studio creates two separate XY sketches, each Line → Select → Make curves, without imports or a zero Move workaround. Distinct source/object IDs and identical local `c1` are asserted.
- Actual producer emits quadratic lines with controls [10,10,0], [20,10,0], [30,10,0] and [45,10,0], [45,20,0], [45,30,0], knots [0,0,0,1,1,1], unit weights.
- Sweep succeeds, source objects/text remain identical. Independent native recompile verifies midpoint [20,20,0], normal +Z, source controls/knots/weights. Undo/Redo and native Save/fresh Open preserve results. 1024 screenshot visually reviewed.
- Final browser receipt SHA256 `12c3427b8184edd8cd8a7e4ef7ab0f1e599fca376c31f195a87ddb6f5e071b9b`, PASS with frozen product source.
- Model tests 17/17: existing Direct same-source sweep plus new source-local collision, repeat allocation, same-object/missing/noncurve refusal, original preservation, unequal-degree rational 20-sample translational oracle.
- Model and Studio type-check, focused ESLint, production Vite build, independent review PASS.

## Corrected checkpoints and limits

First browser attempt used the wrong Select scope (toolbar, not Sketch panel). Second exposed the actual quadratic producer representation rather than the initially assumed two-control linear representation. The final test checks the observed representation and the independently expected line geometry; no product workaround was added.

Unequal-degree rational coverage is unit-only. Other producer families, AT/mobile and full suites NOT_RUN. No broad Sweep admission changes; all existing HOLDs remain. Generated-doc consistency failures remain separate. Next D1319 / #500: make profile/path roles and surface-direction consequences understandable without changing geometry.
