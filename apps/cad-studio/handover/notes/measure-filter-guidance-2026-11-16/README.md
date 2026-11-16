# Measure filter-aware guidance (#81)

Measure's first, next and unavailable-target recovery copy now follows the current Selection filter. Edges asks for an edge; Faces and Bodies ask for a face (active Measure consumes the face supplied by Bodies mode). Pick all retains face/edge/vertex wording. Restricted-filter guidance explains switching Selection filter to Pick all. Already accepted targets and geometric picking logic are unchanged.

## Verification

- Chrome WebGPU Bracket-01 at 1024×800 and 1440×900: actual Edges filter ignores interior-face click, accepts 64 mm boundary; From persists through Faces and Pick all changes. Pick all accepts planar To and displays 0 mm (mesh approximation). Faces/Bodies each accepts an actual planar face; first/next hints track mode. Escape/close preserve document. Screenshots reviewed.
- Existing target-suppression desktop regression at 1024: PASS including stale-distance removal, Undo/Redo, explicit replacement, hover/focus Escape help and closing.
- Final Studio type-check/production build: PASS.
- Measurement unit set: 6/6 PASS, including both slots and all four filters.
- Helper, inspector and changed-test lint PASS. App.tsx lint reports existing unused `_k` at line 2427, verified identical in HEAD before this change; unrelated code not modified.

Initial build detected the existing static-render test missing the newly required pickFilter prop. Test explicitly updated to Pick all; no runtime fallback that hides missing wiring.

## Limits

Placed instances, section-specific target filtering, assistive devices and non-WebGPU renderers not qualified by this pass. No new geometry support or picker changes. #126 WIP remains excluded.
