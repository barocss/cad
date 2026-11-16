# Native edge selector keyboard focus (#115)

Inspect native joints disables its button while reading native edges. The new select appears before that button, so browser focus could fall to BODY and forward Tab skipped the selector.

The component now records a keyboard activation for the initial list request. After the list settles, it focuses Native shared edge if focus is still on the triggering button or BODY. It does not request this focus for pointer activation or subsequent measurements, and does not move focus from another control. The component's existing live/owner remount guard remains unchanged.

Verification:
- Baseline actual Studio failed the assertion that the new native-edge selector owns focus.
- Fixed actual Chrome at 1440×900 and 1024×900 PASS: Enter opens the native list, selector receives focus, selecting tangent edge then forward Tab reaches Measure continuity, Enter returns the measurement.
- Existing sharp-rim and tangent-joint independent angle oracle, changing edge clears old result, and document replacement invalidates prior owner all PASS in both runs. The documents remain unchanged.
- Focused model continuity tests: 7/7 PASS. Changed source and browser driver lint: PASS. Studio TypeScript and production build PASS (existing import/directive warnings).
- Browser runtime/console and source-frozen checks PASS. Result screenshot reviewed at 1024.

The existing `test/edge-continuity-browser.mjs` now contains the regression and accepts optional width as its third argument. Use `D1258_SOURCE_FROZEN=1`, configured `PW_DIR`/`CHROME` and an artifact output directory.

Limits: desktop Chrome only; other browsers, assistive technology and artificial delayed-response focus diversion were not qualified. The guard against moving focus from another control was source-reviewed. No native geometry or measurement precision change. Full workspace suites not run.
