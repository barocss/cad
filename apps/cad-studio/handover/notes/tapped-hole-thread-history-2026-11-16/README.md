# Existing tapped Hole Thread in History (#22)

Baseline: `8cd4c8d6a`. Original checklist rows 1297/2436 lacked a Thread input in History. This absence was confirmed by source inspection and prior D1176/D1364 scope statements, not a new baseline browser failure.

## Contract

Only an existing tapped Hole gets the choice. A different explicitly selected unique, valid user-loaded fastener-size row changes the cosmetic designation and actual radius to half its tap drill together, as creation does. No default rows or manufacturing claims are introduced. Missing, duplicate, invalid or pitch-mismatched rows retain a Saved placeholder; loading rows does not rewrite a feature. Same designation preserves a custom drill and parameter binding. A different Thread with parameter-bound radius is refused rather than automatically unbound.

Identity, parent/entry face/axis/side/centre/depth/pattern and other features remain unchanged. Existing History Apply ownership/tickets are reused. This is not new modeled thread geometry or group/counterbore ownership inference. Like other ordinary History fields, native geometry is checked on Apply, not a new live native preview.

The editor clears only stale typed Diameter after a real Thread change. A no-op Thread choice does not mark the draft changed. Placement/readout uses the current draft Hole, so its designation and matching row agree with the draft drill.

## Verification

- PASS: Model related tests 11/11, existing editFields tests 5/5. Unique/missing/duplicate/invalid/pitch-changed rows, custom drill, bound radius, stale non-tapped setter, blind/pattern field preservation, native through-hole oracle.
- PASS: Studio readout 3/3; Model and Studio type checks; scoped product/driver lint and diff check.
- PASS: production build 4.00s.
- PASS actual Chrome 1440×900: M6×1/custom Ø5.5 same selection remains unchanged; manual Ø4 then explicit M8×1.25 shows Ø6.8 and matching draft readout. Reset and Close preserve the accepted document. Apply changes exactly thread/radius; Undo/Redo and native Save/fresh Open preserve the full model and loaded rows.
- PASS independent native oracle: strict B-rep, one solid; 64×32×12 through hole volume equals `24576 − π×3.4²×12` within the existing 1e-6 check. No tolerance change.
- PASS actual UI: bound radius refuses Thread replacement without unbinding; missing M6 row retains Saved M6×1/custom Ø5.5 rather than choosing M8 automatically.
- Final receipt `/tmp/cad-thread-history-03/receipt.json`: PASS, no page/console errors or source changes, one expected native Save. Browser/context/server closed. Draft screenshot reviewed and matches M8×1.25/Ø6.8/readout.

## Failures retained and fixes

Run01 stopped at same-choice Apply-enabled behavior: the generic choice handler installed a cloned nodes array even though the Hole was unchanged. A thread-only node-identity no-op gate fixes it.

Run02 passed automated assertions, but visual review found the readout still received the original M6 Hole while the draft choice/drill was M8/Ø6.8. The readout now receives the existing draft Hole. Run03 adds explicit draft designation/tap/match assertions and passes. Run02 is not used as evidence of correct draft readout.

## Limits

Actual UI blind/pattern geometry, delayed Worker Apply→New/Open injection, all browsers/DPI and full suites NOT_RUN. Existing async ownership code was not changed; this is not a fresh claim that all interruption paths were executed. #22's broader preview/placement requirements remain separate. Physics/Motion, manufacturing and existing WIP/HOLD unchanged.

Driver: `test/tapped-hole-thread-history-browser.mjs` (`TAPPED_THREAD_HISTORY_FROZEN=1`, existing heavy gate). Model test: `packages/barocss-cad-model/test/hole-history-thread.test.ts`.
