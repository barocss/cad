# D1365 — Owned Hole-array miss location (Mac)

Base `0f882aa6976a0962e6cf7da727baf8f355edffa0`. Partial #22; umbrella remains open.

## Bounded change

Model `evaluate.ts` supplies its current evaluation document to `holeMissLocation.ts`. Only an actual native CadPartError with SELECTION category, exact expanded feature ID and exact authored centre/axis message acquires a 1-based copy/total and named-plane-coordinate hint. Last-copy IDs are matched against the actual expansion, not inferred from a suffix. Detail/code/feature remain unchanged. Stale, forged, malformed or ambiguous cases retain the original failure; defensive bounds/catch keep reporting from masking native errors. Ambiguous placed/base evaluation deliberately does not enrich. No cutting, admission or notch restriction changes.

## Verified

- Focused 10/10, Model and Studio TypeScript, scoped lint, production build and diff check PASS. Native final/intermediate row failures, circle order, valid notch and recovery, stale/forged/other errors and malformed later inputs are covered.
- Actual Chrome 1024/1440: four blind Ø4 holes at [8,20], depth6, StepX12 refuse creation and History with Hole4of4/X44/Y20 visible without expanding Kernel detail. Source and raw History spacing are retained.
- StepX11 remains an admitted edge notch, with native strict B-rep and independent volume `19200 - 80π + 6√3`. StepX9 gives four complete holes, volume `19200 - 96π`. Agreement within 1e-6 mm³; exact centre/pattern delta, Undo/Redo and downloaded Save/fresh Open passed.
- Actual 1024 creation and 1440 History failure screenshots reviewed: location/action wording visible with Kernel detail collapsed, original/notched model retained.
- Browser receipt `d1365-first/receipt.json`, SHA256 `096879b0929faa8926ee6bb3472271262e0c496a42828ce88c3d0cb39761221f`, PASS. Visual review performed after receipt placeholder.

## API inventory limitation

Canonical TS5.9.3 inventory generated to a separate review file. Current expected inventory has broad accumulated drift: 380 added, 3 removed and 416 changed exposures, plus package/core check differences. This change contributes the one `./engine/holeMissLocation` export; it does not justify accepting the unrelated drift. Existing generated baseline is intentionally untouched. Full documentation/API gate is not claimed green. Native API/schema/geometry remain unchanged.

Other axes in actual UI, complete #22, full-suite, CI and assistive technology are not claimed. HOLDs retained. D1366 next refreshes the stale two-guide Loft browser assertion reported by independent QA, then continues remaining #22 scope.
