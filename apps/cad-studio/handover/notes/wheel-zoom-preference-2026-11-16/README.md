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
