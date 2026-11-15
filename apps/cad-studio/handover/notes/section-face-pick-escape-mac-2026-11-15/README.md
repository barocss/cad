# D1397 — Section face-pick Escape

## Scope

Resolves #607. Idle Escape cancels only the waiting Section face pick, after existing palette/sketch/active-command/assembly/measurement priorities and before ordinary selection clearing. The ref retires synchronously so a queued face click cannot consume the canceled request before React rerenders. Section geometry, document and selection remain unchanged; no focus command is added.

Held Escape repeats from the cancellation press are consumed without clearing selection. A new nonrepeat Escape follows the ordinary idle selection-clear behavior. All plane indices use the same path. Existing capture/modal/HUD/route/drawing guards remain unchanged. Preview workspace switching policy is not changed.

## Verification

- Focused 16/16 PASS, including real hook indices0/1/2, live section retention, repeats/new press/rearm, real viewport picking after synchronous cancellation before rerender, and SectionBar pressed/status rendering.
- Hook/test lint, diff check, complete Studio TypeScript and production Vite build PASS. Existing unrelated App `_k` remains; full App lint is not claimed.
- Actual Chrome WebGPU at1024×800 and1440×900: eight cancel/rearm trials and two Command palette priority cases. Button keyboard focus and actual viewport keyboard context; single/multiple planes1/2; held repeats; section/document/selection and exact activeElement identity preserved; next top-face click is ordinary selection rather than a new section direction.
- A real blank-canvas click establishes BODY keyboard context. The canvas is not focusable; this is not a claim of canvas DOM focus. State preservation is measured after establishing that context. The button path covers preservation of a selected original face.
- Actual Command palette first Escape closes the palette while preserving the pending pick; second Escape cancels the pick. Other HUD/sketch/modal priority combinations are browser NOT_RUN; their existing guards were not changed.
- Actual 1024 single-plane and1440 multiple-plane screenshots reviewed: original top-face properties and section controls remain intact. Final source watcher changes/errors empty; both contexts/browser/server closed.

## Evidence

Final browser `/tmp/d1310-publish.1Wqzsz/d1397-second`; receipt SHA256 `8cd56335a0b7187416b932f2be009cd0ce6b5a8987f97bad289169c33c328f78`.
Build log `/tmp/d1310-publish.1Wqzsz/d1397-build.log`.
The first run failed on palette setup because canvas.focus did not transfer focus from a button. It is retained as nonqualifying; only the driver was corrected to real viewport keyboard context. Final second run qualifies the declared scope.
No mobile, assistive-technology, exhaustive keyboard-priority or whole-CAD claim. Existing HOLDs remain unchanged; #608 Rendering remains held, next is #609 reference placement draft ownership.
