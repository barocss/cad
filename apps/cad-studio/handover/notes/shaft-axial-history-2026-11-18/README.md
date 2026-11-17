# Shaft keyseat and groove axial History editing · #644 · 2026-11-18

The existing Shaft node stores each keyseat's `offset` and groove's `at`, but History previously exposed only their sizes. New fields identify the step and item and explicitly measure from that step's start. They change one existing number leaf, not the shaft's world Z or the slot's centre. No schema, generator, native geometry or tolerance change.

## Identity boundary

Native groove names are assigned in axial sorted order, not the array's order. Moving one groove past another could silently redirect named downstream references. Therefore **only a step with exactly one groove gets a groove-position field**. Multiple-groove steps retain existing size fields and an explicit History explanation. Other single-groove steps in the same shaft remain editable. Keyseat names follow authored order, and the editor preserves that order/count.

Model `offset`/`at` are number-only, so the two new fields deliberately do not expose parameter binding. Existing step diameter/length binding remains. Invalid positions are not clamped or repaired: existing native step, overlap and cutter rules govern Apply.

## Verification

Focused new5 + shaft3 + ring-rows2 = **10/10 PASS**. Checks cover field labels/getters, exact immutable leaf changes and untouched siblings, number-only fields with a nonempty parameter table, independent volume/centroid and roundtrip, negative/nonfinite/out-of-step/overlap refusal, multiple-groove exclusion, and existing key/retaining-ring ordinal references following the edited positions with exact volume/centroid.

Independent static review found the groove-order issue before browser qualification. The scope was narrowed rather than changing the native naming contract. In-memory mutations on two pure tests detect removal of the single-groove guard, wrong offset getter and mutation of the original object. The first mutation pass's wrong getter survived because getters were not explicitly asserted; that test gap was corrected and the repeat killed all three. No product files changed during mutation. Native/browser/type checks are separate, not implied by these two tests.

Actual Chrome baseline/fixed PASS. Original fields absent on baseline; fixed positions 4→10 / 8→15, overflow rejection with geometry/history preservation, recovered draft Cancel, two-step Undo/Redo, OPFS save/reload/Open, and multiple-groove limitation PASS. Each run froze 1074 source files, reported zero errors, and closed context/browser/server. Temporary baseline source restored and byte-compared to the fixed files. Model type-check and Studio tsc + Vite build PASS (6.24s, existing bundler warnings). Reopened/refused/limitation screenshots visually inspected. Native final volume 46887.1921827975 mm³ and axial centroid 56.995913591031226 mm agree with the independent oracle. Receipt summaries accompany the screenshots; full local driver receipts include the frozen source capsule.

## Declared geometry oracle

Synthetic shaft: centre[12,-8], from7, three steps Ø20×30, Ø30×40, Ø20×30. Square keyseat width4/depth3/length10 starts at step1 offset4, then10. Ring groove Ø18×2 starts at step3 offset8, then15. No fillets/chamfers in this fixture.

Stock volume is π(100×60 + 225×40). The removed square keyseat's section is the independent integral `∫[-2,2](sqrt(100-y²)-7)dy = 2sqrt(96)+100asin(.2)-28`, multiplied by10. Removed groove volume is π(100−81)×2. Position edits preserve volume but change the axial first moment: subtract each removed volume times its independently expected centre from the stock's step-wise axial moment. Native named keyseat boundary endpoints must move from7+offset to17+offset; groove walls must be at77+at and79+at. These location checks prevent unchanged-volume wrong-location success.

## Limits

Existing CAD shape and metadata editing only; dimensions are synthetic, not shop/standard rows. `manufacturingValidated:false` remains. No CAM, machining validation, real-part acceptance, Physics, schema5/migration or other HOLD is opened. Actual square cutter and single groove do not certify every end-mill/disc-runout/undercut/fillet arrangement, general Boolean accuracy, or arbitrary downstream face repairs. Connected key/ring checks are focused tests, not a claim of general assembly validation. OPFS reopen is not external STEP/DXF interoperability or a fresh browser process.
