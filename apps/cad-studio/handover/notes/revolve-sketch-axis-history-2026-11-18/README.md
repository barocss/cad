# Terminal Revolve sketch-axis History (#688)

Original main `007532cba`: UI creation supports Sketch X/Y, but a saved standalone Revolve had only a readonly Axis display. Existing Replace axis requires an earlier suitable stock edge and does not cover this simple sketch-only workflow. Actual creation, native Y geometry and Save/fresh Open confirmed the editing gap.

History now offers **Axis: Sketch X / Sketch Y** only for a terminal plain Revolve whose current axis is x/y and whose origin/dir/axisRef are all omitted. It excludes held/suppressed/made nodes, invalid profile indices and held/suppressed/associated/pocket-floor sketches. Every setter rechecks eligibility; same-axis and invalid values are no-ops. Only the axis property changes. Explicit `[0,0]` origins are not silently reinterpreted. Linked/fixed-edge replacement and existing drag HUD numeric edits are unchanged. Guidance names the sketch-local origin and plane, not world axes.

## Verification

- Original focused tests1 PASS/4 RED (missing mode); final22/22 including six new tests, linked-axis, Angle binding and Cut mode regressions. Unit coverage includes captured-setter rejection, shared sketch identity, codec/native checks, crossing-axis refusal, HUD injected-choice exclusion and a rotated sketch frame's centroid.
- Scoped lint/syntax/diff PASS; Model/Studio type checks PASS; Studio Vite build11.08s. Full suite NOT_RUN.
- Actual frozen Chrome: rectangle→Revolve Y360 via creation UI; History Y→X changes only axis; Undo/Redo, changed-axis Cancel, actual X Save/fresh Open, X→Y and Y Save/fresh Open. A draft CornerY−10 plus X crosses the axis; native refuses while accepted document, History and exact native result stay Y. Recovery/Cancel preserves it.
- Existing actual Angle numerical/binding workflow and linked-edge History replacement (including legacy fixed-axis recovery, wrong-source refusal, Cancel, Undo/Redo and Save/Open) PASS.
- Baseline/final/regression capsules unchanged (1075–1078 sources); page/console errors0; own contexts/browser/server closed. Actual screenshots inspected.

## Independent geometry

Profile rectangle `[10,10]..[20,30]`, full360 turn. Around Y: radii10/20 and length20, volume6000π, centroid `[0,20,0]`. Around X: radii10/30 and length10, volume8000π, centroid `[15,0,0]`. Native X volume25132.741228718343 mm³; centroid `[14.999999999999995,-8.45e-16,0]`. Strict-valid single native body, cylinder wall radii/axis/origin and displayed volume match independent expectations within1e-7. Rotated-frame semantics are focused unit coverage, not an additional actual-browser profile qualification.

## Retained failure and limits

First actual fixed run passed X geometry, history, X Save/Open and Y return, then its fixture expected raw `profile crosses the axis` inside the visible friendly explanation. The UI correctly showed “Keep the profile on one side of the axis”; raw detail was collapsed. Product unchanged; fixture separately checks visible summary and existing code-detail text. Subsequent stages were NOT_RUN in that stopped batch. Final frozen run completed all actual and type/build checks.

No linked/offset/free-axis conversion, downstream topology rematch, new angular binding, arbitrary profile qualification or schema/kernel expansion. Existing HOLDs remain and doc-sync is paused; these are task-local results. Final heavy available space19.0→17.5GiB with checks before every stage, above the task-added2GiB reserve. No cleanup performed.

Commands: `node packages/barocss-cad-model/scripts/test.mjs revolve-sketch-axis-history revolve-axis revolve-angle-binding cut-depth-mode-history`; actual `revolve-sketch-axis-history-browser.mjs`, `revolve-angle-binding-browser.mjs`, `revolve-history-axis-browser.mjs` under frozen envs/shared heavy gate; `pnpm --dir packages/barocss-cad-model type-check`; `pnpm --dir apps/cad-studio build`.
