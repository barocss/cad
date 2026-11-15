# D1319 — Direct curve roles and local surface direction (#500)

The existing two-curves section identifies Sweep profile/path and Ruled first/second. Swap curve order uses App's selection setter, never document commit. A memoized immutable preview reports the actual parameter-domain midpoint normal, explicitly local rather than a global curved-surface direction. Failed analysis remains unavailable without blocking native creation.

Sources: `App.tsx`, `ui/DirectInspector.tsx`, `ui/DirectPanel.tsx`, `ui/TwoCurveRoles.tsx`, `ui/ruledMidpointNormal.ts`. Tests: `two-curve-roles.test.ts`, `two-curve-roles-browser.mjs`.

## Independent Mac evidence

- Actual1024×800 desktop, four authored native line-pair cases (not new Make curves producer qualification).
- Orthogonal pair both orders: role/swap with document and Undo state unchanged; actual Sweep midpoint [20,20,0]/[55,20,0], normal +Z/−Z. Sources unchanged; Undo/Redo and native Save/fresh Open PASS.
- Parallel pair both orders: local preview and generated midpoint normal agree at [10,10,0]. Thicken normal2 mm yields strict800 mm³, Z0…2/−2…0; History3 mm yields1200 mm³, Z0…3/−3…0. Undo/Redo and Save/fresh Open/native reinspection PASS.
- Reverse-order screenshot visually reviewed; role, swap, normal and actions visible together.
- Browser receipt SHA256 `fbad54b2ad68ee0d660fd4a19c1d1e13cbd0905118fd9c33e614fc84fa4c76cd`.
- Unit1/1, Studio type-check, focused lint excluding App, production build and independent review PASS.

## Limits / corrected checkpoint

App lint remains FAIL at pre-existing line2359 unused `_k`, identical in pre-change HEAD; unrelated sheet code unchanged. Existing generated-doc drift is not addressed. Initial case-only helper/component import ambiguity was corrected to `ruledMidpointNormal.ts` before validation.

General curved/weighted pair UI, alternate-domain fixture, AT, mobile and full suites NOT_RUN. Local normal is not a global/manufacturing guarantee. All HOLDs remain. Next D1320/#501: crossed endpoints and undefined Thicken normals, no automatic source reversal.
