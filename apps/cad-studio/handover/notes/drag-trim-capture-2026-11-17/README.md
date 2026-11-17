# #233: bounded native pointer-capture cancellation verification

Parent `951fe302f2ea9e11a028f1ea008eed114a255e79`. No product code changed. A new focused actual-browser driver and an optional headed-mode switch in the shared harness are added. Existing callers retain `headless: true` by default.

## Existing implementation, not new work

D876 (`d16c104c7`) already implements continuous recorded strokes over at most three straight intervals, candidate preview, whole-draft commit/Undo/Redo and owner-bound cancellation. D877 (`d22afb1be`) covers newly drawn material lines, open-chain Finish refusal, explicit Line repair and Save/fresh Open. D1058 covers tool-rail cancellation. D1073 (`59bae2e86`) covers repair Line history followed by the prior Drag Trim. Those retained records are not rerun or newly claimed as PASS here.

## New accepted boundary

`PW_DIR=... CHROME=... DRAG_TRIM_INTERRUPTION_FROZEN=1 node apps/cad-studio/test/drag-trim-interruption-browser.mjs <output> --capture-only`, under the shared heavy gate. See the driver for the exact environment key.

Run 05 PASS in headed Chrome. Read-only instrumentation observes three preview intervals and an active captured pointer before calling the standard DOM `releasePointerCapture`. The browser emits a trusted `lostpointercapture` event. This is a deliberate native capture release, not synthetic event dispatch, and **not a claim about every OS-generated capture-loss cause**.

The late pointer-up leaves the accepted document, bodies, selection, history, dirty state and Undo/Redo availability unchanged. The preview disappears and Trim stays active. A separate new stroke removes the three intervals; one Undo restores all three and enables Redo. Hover endpoints are checked against the source fixture's projected coordinates. No native numerical geometry or Save/Open check is repeated.

The driver and helper pass syntax and targeted lint; independent read-only review found no blocker. Product tsc/build/full suites were not repeated because product sources did not change. Run 05 source freeze stayed equal over 521 inputs through context/browser/server cleanup; no page/console errors or source changes. Actual post-release/retry/Undo PNGs were visually reviewed and contain synthetic geometry only.

## First failures and remaining limits

- Run 01: headless tab-switch `document.hidden` wait timeout.
- Run 02: headed tab-switch wait also timed out. The default requestAnimationFrame polling could itself pause in a hidden tab, so neither run proves that a visibility event did not occur.
- Run 03: timer polling and failure event instrumentation still did not qualify hidden→visible. Captured failure state stayed visible with no trusted visibilitychange/blur events; a trusted lostcapture was observed. No more tab trials were run. Actual tab-switch acceptance remains **NOT_QUALIFIED**, not product FAIL or PASS.
- Run 04: capture-only prerequisite failed. Held JSON recorded active capture/three preview intervals, but capture was already released after the intervening full-page screenshot. The exact external cause is not proven. Run 05 removed screenshots during a held gesture, records state read-only, and checks capture and release in one evaluation. Screenshots are taken only after release.
- All four first failure receipts remain preserved and are hashed in `qualification.json`; they are not overwritten by the final PASS.

Issue #233 remains OPEN. Its proposed hidden-construction policy differs from the current intentional shared click/drag policy: hidden construction is protected as a target but remains a cutting boundary (`sketchCutInputs`). This work does not silently change that policy or declare the original requirement satisfied. Existing WIP/HOLD are untouched.
