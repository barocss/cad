# Cosmetic threads on every tapped-hole copy (#46)

The kernel expands a Hole pattern into early copy IDs (`n2_p0`, `n2_p1`, …) and retains `n2` for the final cut. Thread metadata and the viewport/drawing face-name matchers previously recognized only the authored ID, leaving all earlier copies without cosmetic thread marks. Metadata now includes the exact earlier-copy IDs and both matchers recognize them. The drill geometry, thread parameters, pattern layout and saved schema are unchanged.

## Verification

- New per-copy and existing thread tests: 10/10 PASS. X/Z axes × linear/circular × 4/6 copies: six pitch rings at each expected hole center, expected radius, correct drawing three-quarter arc count and nominal radius. Plain holes and bolt/nut/washer behavior remain covered.
- Actual Chrome WebGPU `tapped-pattern-marks-browser.mjs`: PASS at 1024×800 and 1440×900 for circular Z and linear X. History Copies 4→6; Undo/Redo; Save/fresh Open. Every step checks strict native B-rep, exact renderer ring input at every expected center, and actual sheet SVG paths for all Ø6 three-quarter symbols. Frozen-source receipt PASS, no browser/console errors. Narrow-screen drawing screenshot inspected.
- All changed-file lint and Studio TypeScript/Vite production build PASS.
- Extended drawing + legacy-fastener regression: 42/45 PASS. Three legacy snapshot failures remain: die-casting-zinc and sand-casting-a356 setup-order text (+X/−X order), drawing-holes pre-existing TEXT_OVER_LINES diagnostic. A separate temporary bundle using both thread source files from the previous committed HEAD reproduces the same three failures (6/9 legacy tests pass). No working files were reverted and no snapshots were updated to hide them. The drawing test file itself passes all 36 tests.
- Evidence: `/tmp/cad-tapped-pattern-marks-20261116`; `/tmp/cad-thread-pattern-tests.log`; `/tmp/cad-thread-pattern-regression.log`; `/tmp/cad-thread-pattern-legacy-baseline.log`; `/tmp/cad-tapped-pattern-marks-build.log`.

The Model check validates renderer input, not pixels of occluded rings. WebGL2, new production size-table authoring, and broad cosmetic-thread standards certification were not run. No HOLD scope or protected #126 WIP changes.
