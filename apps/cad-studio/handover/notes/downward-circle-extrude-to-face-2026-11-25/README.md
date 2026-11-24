# D1932 — Extrude a downward XY circle to the original upper face

P1 [row 8](../../roadmap-rows/08.md) and [row 16](../../roadmap-rows/16.md), [#222](https://github.com/barocss/cad/issues/222). Base `9d8c7e736dcd65fa1e2659bacb177542f5fbdd2d`. FULL native geometry admission.

The exact -Z XY plane with +X local X admits a literal circle. It reaches the original upper rectangular face of a forward upright Extrude in the same document. The existing source and target ownership checks stay in use. A native probe uses the compiled source and actual depth. It checks the reflected centre, both cylinder supports and the lower end cap. The represented disk must fit strictly inside the native rectangular face. Its clearance check uses the existing roundoff bound. No Kernel geometry or file format change.

- **FAIL, previous Studio.** The literal downward circle offered fixed Distance only.
- **PASS, actual Studio.** Picked the original `n1.top` and applied. Negative, zero-travel and behind-source targets refuse without changing the accepted model or history. The target height changes from 5 to 8 mm. Undo, Redo, a native project Save, fresh Open and a later height edit keep the same binding. The existing downward rectangle control also passed.
- **PASS, actual reopened source edit.** The native file reopens at height 8. Sketch Finish at diameter 8 mm refuses exact contact with the target edge and preserves the accepted document. Diameter 5 mm succeeds using the normal Sketch Finish path and retains the same target reference. Finish assigns the existing native side tag `e1` to the previously untagged source.
- **PASS, independent geometry.** The authored local centre (5,−4) mm becomes (5,4) mm. The cylinder spans Z5–20 then Z8–20 mm, with volumes (60π) and (48π) mm³ and centroid Z12.5 and Z14 mm. The reopened R2.5 edit has volume (75π = 235.61944901923417) mm³. The exact native shell has genus 0, four faces and two outward cylinder halves. The original target remains a separate body. Tests also check a translated origin, an off-footprint target and a near-edge interior control.
- **PASS, affected checks.** All 71 focused Model tests, one focused Studio test, Model and Studio types, scoped ESLint and Studio build. Two scratch mutations omit the Y reflection or allow tangent contact. The focused native tests detect both. The Studio build precedes the final help-text edit. The later desktop and Model checks include it.
- **FAIL, earlier harness attempts.** A consumed sketch does not have its own History tile. The final driver uses Edit sketch from the linked Extrude. Earlier checks also expected property order and untagged source bytes on a supported Sketch Finish. The final checks use the actual accepted document and its new side tag.
- **NOT_RUN.** Other reversed profiles, nonrectangular or placed target faces, STEP export of this slice, full local suites and mobile. #222 remains open. First mechanical CAD is 8/10 accepted. Whole-product completion is unmeasured.

```sh
D1932_SOURCE_FROZEN=1 node apps/cad-studio/test/reversed-extrude-end-face-browser.mjs "$OUT/baseline" --circle --baseline
D1932_SOURCE_FROZEN=1 node apps/cad-studio/test/reversed-extrude-end-face-browser.mjs "$OUT/studio" --circle
D1932_SOURCE_FROZEN=1 D1932_EDIT_FROM="$PRIOR_NATIVE_FILE" node apps/cad-studio/test/reversed-extrude-end-face-browser.mjs "$OUT/diameter" --circle
D1896_SOURCE_FROZEN=1 node apps/cad-studio/test/reversed-extrude-end-face-browser.mjs "$OUT/rectangle"
node packages/barocss-cad-model/scripts/test.mjs face-end
pnpm --dir apps/cad-studio test extrude-end-face-pick
pnpm --filter @barocss/cad-model type-check
pnpm build
git diff --check
```
