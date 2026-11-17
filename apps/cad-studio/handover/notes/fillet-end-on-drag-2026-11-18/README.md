# New Fillet end-on scalar fallback (#653, partial #214)

## Actual baseline

At main5c66cdd3f, a real edge pick on a40×30×10 rectangle box starts Fillet R2. Actual right-button orbit sets orthographic yaw−π/2,pitchπ/4. The outward direction projects to0.00002482px. The handle remains clickable and the real drag readout says Radius2mm, but horizontal/up/down movement up to50px does not change R2. The document and Cancel remain correct. This is an unusable scalar interaction, not native geometry loss.

## Narrow implementation

Only active new Fillet `radius` opts in. At pointer-down, capture screen-direction→mm coefficients and command-context identity. Below the existing4px projected-direction threshold, up increases/down decreases with down-time world-mm-per-pixel (`P.size/84`). Horizontal motion is neutral. Otherwise use exactly the existing projected-axis formula in its captured frame. The generic `dragAlong` end-on-zero contract is unchanged.

Capture the original value and snap/clamp conversion too. Preview geometry, pointer-hold zoom and release cannot recalculate the conversion from moved geometry or a different camera scale. A changed handle id/owner/context invalidates this pointer rather than changing another command. Invalid projection/scale/overflow is rejected, not treated as valid fallback. SVG title gives conditional end-on direction/sensitivity guidance; no general handle redesign or new kernel API.

Scope excludes History/idle re-edit handles, Chamfer and all other gizmos. A new gesture may choose a different4px mode; this is not a claim of continuous sensitivity across every camera orientation. Native surface validity still belongs to the existing preview/evaluation path, not the display-derived handle frame.

## Verification

- Focused17/17 PASS:11 scalar tests +6 existing gizmo tests. Existing projected formula/hit behavior, end-on generic0, three down-time scales, positive-depth perspective projection/optical-axis fallback, four-pixel boundary, malformed/nonfinite/overflow, identity/session changes, frozen preview/value/converter/camera, snap/clamp/round trip. New same-command contexts are distinguished; source review confirms App creates a new context per command and preview spreads retain it.
- Scoped ESLint/diff-check PASS. Studio tsc+production build PASS5.89s. Latest73319d093 assembly fix included before actual fixed run, no overlapping paths.
- Actual fixed Chrome: same real edge/orbit/handle path gives R2→4→5→2 with final release2. Two fresh24px gestures at16.39295 and30.77958px/mm yield3.5 and3 using an independent screen-scale/0.5mm snap oracle. During held pointer, wheel zoom then the same displacement and release stay3.5. Cancel preserves original box. Fresh explicit edge pick→drag Apply R3.5, Undo/Redo, typed3.5 produces exactly the same document; physical Save/fresh-context Open retains native geometry.
- Independent Python volume `40*30*10−40*3.5²*(1−π/4)`=11894.84510006475mm³. Native/worker11894.845100064756; strict B-rep, contact vertices (x,0,6.5)/(x,3.5,10), old-corner absence and native surface midpoint checked, x=0/40. Image baseline and final fresh-open inspected.
- Actual fixed source capsule1075 files unchanged; page/console errors0; contexts/browser/server closed. A transient Mac attachment change occurred after execution; recovered final PASS receipt/source-after-cleanup and no remaining owned process/gate. No rerun or partial receipt is counted as an additional pass.

## Explicit limits

Actual perspective end-on rays, command replacement while pointer held, OS pointercancel/lostcapture, invalid native-radius wall and old Fillet re-edit were NOT_RUN in this browser. Identity/refusal/math are focused tests and pointer-cancel wiring was read, not misreported as real OS input. Full suite and all-camera/latency performance certification are not claimed. Original #214 remains OPEN for broader interaction and re-edit qualification. Schema/migration, owner redesign, native widening, manufacturing and Physics HOLDs unchanged; doc-sync paused.

Driver: `FILLET_END_ON_SOURCE_FROZEN=1 node test/fillet-end-on-handle-browser.mjs <output> [--baseline]` with Node22/standard Chrome/PW configuration and heavy gate. The baseline receipt predates later added fixed-tail native inspector, so its560-file capsule is not compared as if it had the fixed1075-file dependency set. Both runs check their own unchanged source. Exact main CI and public image rendering recorded on #653 after push.
