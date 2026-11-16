# Reverse wheel zoom preference

Issue #267; parent f14f4fd24059a624d6b4b31efb4cd43cbca6596d (push CI43941180230 SUCCESS).

Display offers Reverse wheel zoom for Model/Sketch. Origin-local studio.reverse-wheel-zoom stores on/off, defaults off for absent/invalid values, and reports session-only behavior on storage failure. Only unmodified wheel delta sign changes; exponential speed, camera algorithm, cursor anchor, orbit/pan and document data remain unchanged. Latest propsRef supplies direction. Render, Print, print/CAM preview, Drawing and modified gestures retain existing behavior. No new framework or dependency.

## Verified
- Focused25/25 PASS: strict storage admission/errors, exact factors, actual pointer handler's latest preference, camera/projection behavior, all16 mode combinations and adjacent camera/pointer tests.
- Final Studio TypeScript, scoped lint (including both new browser drivers) and production build PASS after Mac reconnect. Previous disconnect-aborted build is NOT_COMPLETED, not a pass.
- `/tmp/cad-wheel-preference-01` frozen actual Chrome PASS: perspective/ortho and Model/Sketch, +120/-120 wheel, Ctrl/Meta/Alt/Shift in Model; independent exp(.18) ratio and target-plane cursor projection. Maximum observed cursor drift0.1324122881 CSS px, within the predeclared0.5px bound. Preference toggle retains camera/document/selection/dirty. Panel wheel does not move camera. Reload/Open/New persistence, invalid storage, denied read/write session behavior, and exact browser-project Save/fresh-context Open all pass. Fresh context defaults off, proving no preference in saved document.
- `/tmp/cad-wheel-input-02` PASS: active edited coordinate input blocks the preference toggle, preserves its current draft value/camera/document/selection/dirty and displays recovery guidance; Cancel preserves original document. The coordinate control applies its typed edit to the sketch draft before the toggle, so this does not claim preservation of a literal incomplete '-' string. Run01 used fill('-') on input[type=number] and was rejected by Playwright; final run uses keyboard input. Screenshot reviewed.
- Both browser runs errors/console/source changes empty. No external dependency or sample download. WIP/HOLD unchanged.

NOT_RUN: physical trackpad pinch/natural-scroll behavior, alternate devices/DPI/browser, dedicated renderer-recreation and tiny-model/clamp browser cases. Existing camera implementation/tests remain unchanged; no whole-navigation certification. #267 remains open for explicit remaining acceptance accounting.

Run with Node22/shared heavy gate: `node scripts/test.mjs wheel-zoom-preference small-camera-scale camera-projector camera-relative-query analysis-hover-pointer`; `WHEEL_ZOOM_PREFERENCE_FROZEN=1 PW_DIR=... CHROME=... node test/wheel-zoom-preference-browser.mjs OUTPUT` (add `--input-only` for focused active-input check).

## Contract closeout

The eight first-scope functional requirements are met: accessible off-by-default control; immediate unmodified canvas-wheel direction only; explicit touchpad-scroll inclusion and preserved modifier paths; unchanged deltaMode/speed; origin-only safe persistence; no document/history/selection/view-preset writes; Model/Sketch scope with other consumers excluded; and active-input/panel boundaries. Hardware/alternate-browser items in the broader verification plan remain NOT_RUN, not new feature requirements or promises of device certification.

Additional actual-pointer-consumer tests cover tiny distance0.002, ordinary160 and near-upper19999 in both projections/directions with ±120 and ±10000 deltas. Independent target-plane arithmetic verifies cursor anchoring and exact existing clamps[0.001,20000]; no product camera helper is used for the expected projection/factor. Final focused5/5 (one added test includes48 cases), tsc/lint/build PASS. Existing broader25/25 and actual Chrome receipts are retained, not rerun. Tooltip explicitly includes unmodified touchpad scrolling. No camera numerical changes.
