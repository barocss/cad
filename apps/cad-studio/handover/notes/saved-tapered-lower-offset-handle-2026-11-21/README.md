# D1526 — Drag a saved tapered lower-cap Offset from its native face

P5, row 31, [#629](https://github.com/barocss/cad/issues/629). Base `faa0406bb600fbc8291d86c5909ea515e1fa5341`.

History's existing **Edit offset** command now shows a distance handle for the positive terminal lower-cap Offset of one ordinary authored rectangular taper. The saved face name fixes the outward sign. Its original signed signature and the current exact native cap must agree. The handle uses the accepted cap plane and rectangle centre. Dragging toward a larger positive distance moves this cap along −Z. The existing scalar gesture and edit ownership apply.

- **PASS, actual baseline.** Save and reopen the 20 × 10 × 12 mm, 15° taper with a lower cap Offset of +2 mm. The previous History editor has no distance handle and accepts typed +4 mm. Its strict solid volume is 2342.6215161928726 mm³.
- **PASS, actual desktop Studio.** Reopen the same saved profile and edit the Offset from Bottom/Ortho. The native axis projects to 0.00605 CSS px per mm. The handle anchor is within 0.000033 CSS px of the independent cap centre. A physical 61 CSS px upward drag previews +4 mm without changing the camera or accepted document. Cancel preserves +2 mm, and a late move and release after Cancel and reopening cannot change the new edit. Apply, Undo, Redo, typed parity, native Save and fresh Open pass.
- **PASS, independent native shape.** The lower cap moves from Z−2 to Z−4 mm. The upper cap stays at Z12 mm and all four wall support planes remain exact. The strict read confirms one closed solid with six named faces and 12 named edges. At +4 mm the independent volume is 2342.621516192872 mm³ and both Studio and native read give 2342.6215161928726 mm³. Dragged, typed and reopened native receipts match. An independent geometry review verifies the direction and the equal treatment of signed zero before and after reopening.
- **PASS, controls and affected checks.** An upper saved handle and existing signed lower-cap typed paths pass in actual Studio. 47 Model and 74 Studio tests, scoped lint, Model type check, Studio types and build, browser syntax and Git diff pass.
- **FAIL, corrected harness attempts.** The first baseline sampled Bottom during its camera transition. The first upper control incorrectly expected Bottom's stable endpoint rule. The corrected driver waits for Bottom only. The first Model run also found a duplicate local name in the new assertion. Final checks pass.
- **NOT_RUN.** Additional browsers, mobile and full local suites. This handle scope is a positive terminal cap on supported rectangular stock. General direct B-rep manipulation in #629 remains open.

Use Node 22.19.0 and installed Chrome and Playwright. Gate heavy work and keep receipts outside Git. Run the baseline desktop command before the product change.

```sh
node packages/barocss-cad-model/scripts/test.mjs offset-face-native native-offset-face
pnpm --dir apps/cad-studio test history-fillet-radius-receipt scalar-handle-drag offset-face-launch-view offset-collapse-feedback offset-plane-pick-feedback command-hud-actions preview-lifetime history-feature-editor
pnpm exec eslint packages/barocss-cad-model/src/app/offsetFaceEdit.ts packages/barocss-cad-model/test/offset-face-native.test.ts
pnpm --filter @barocss/cad-model type-check
pnpm --filter @barocss/cad-studio-app build
node --check apps/cad-studio/test/offset-drafted-cap-browser.mjs
git diff --check
cd apps/cad-studio
D1255_SOURCE_FROZEN=1 node test/offset-drafted-cap-browser.mjs "$EVIDENCE/baseline" --lower --history-handle-baseline
D1255_SOURCE_FROZEN=1 node test/offset-drafted-cap-browser.mjs "$EVIDENCE/lower" --lower --history-handle
D1254_SOURCE_FROZEN=1 node test/offset-drafted-cap-browser.mjs "$EVIDENCE/upper" --history-handle
D1255_SOURCE_FROZEN=1 node test/offset-drafted-cap-browser.mjs "$EVIDENCE/lower-typed" --lower
```
