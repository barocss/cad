# D1407 — supported Fillet station binding controls

Issue #145. Only the generic parameter wrapper for Fillet `stationAt`/`station2At` is excluded in `packages/barocss-cad-model/src/app/editFields.ts`. The numeric setters, supported radius binding, native admission and document schema are unchanged. No parameterized fraction support is claimed.

## Verification

- Focused Model tests: 20/20 PASS; Model tsc and owned lint PASS.
- Expanded parameter selection: 61/62 PASS. The same pre-existing Sweep selector expectation failure reproduces using HEAD editFields (17/18 profiles tests). Not a clean full-suite claim.
- Actual isolated Chrome at 1024×900 and 1440×900: no percentage binding selector for one/two interior positions, direct 40% application, supported middleRadius binding, Undo/Redo and native Save/fresh Open PASS.
- Independent analytic volume and seven native surface sections PASS; numeric and bound documents produce identical B-rep digest `e22343ee9eb58da5cb2c417ac4dda4c841d540d3259f06cade3b94e65d69a6f8` and volume 11944.666903486164 mm³. This is one convex right-angle box edge, not broad Fillet qualification.
- Root visually inspected the 1024px unsupported-selector-hidden and 1440px reopened screenshots. Position 40% and retained radius parameter are visible without an unsupported selector.
- Actual receipt `d1407-first/receipt.json`: SHA256 `ab12a11bf34ae7fea3d6248c14c4ced08ab459c94ca9aea522e829c414a17b69`; no browser/console errors or source changes, all four contexts/browser/server closed. Evidence is local, not a public artifact link.
- Combined D1406/D1407 production build PASS; final integrated Studio type check PASS. No CI or assistive-technology claim.

The companion #144 UI input validation was present during this browser run and is published separately. Existing drawing baseline failures, #613 overlaps, #608 Rendering HOLD, legacy provenance and broader geometry HOLDs remain unchanged.
