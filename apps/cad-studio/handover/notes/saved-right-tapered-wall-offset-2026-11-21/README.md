# D1533 — Drag a saved right tapered wall Offset from its native plane

P5, row 31, [#629](https://github.com/barocss/cad/issues/629). Base `f1330c3ba52bdb7a53c64751a9714b678e3ba46d`.

History can drag the saved right inclined wall of one terminal rectangular positive Draft Extrude. The proof compares the authored source signature with the native source face and checks the current exact face identity, normal and signed plane displacement. The drag points along the native outward normal. The anchor remains at the wall's middle height while the wall plane translates. A same-sign bound keeps the distance away from zero. The proof reuses the existing native taper frame and is cached for the accepted face within the opened edit.

- **PASS, actual baseline.** Reopen the 40 × 30 × 10 mm, 10° taper with +3 mm on `n1.side1`. The earlier History editor has no distance handle and accepts typed +4 mm.
- **PASS, actual desktop Studio.** Reopen the saved wall using the new editor. The handle starts within 0.000056 CSS px of the independent mid-height anchor. The physical drag along the projected native normal is [13.01238, 2.65540] CSS px for the +3 to +4 mm edit. The camera and original document stay exact during preview. Apply, Undo, Redo, typed parity, native Save and fresh Open pass.
- **PASS, independent native geometry.** The moved wall, five fixed support planes, all eight corners, finite trims and native topology IDs agree with the analytic oracle. Both cap elevations stay at Z0 and Z10 mm. One strict closed solid has six faces and 12 edges. Studio, native and the independent volume read all give 11954.059164696055 mm³. Maximum plane residual is 3.553e-15 mm. The reopened native digest matches exactly.
- **PASS, affected checks and controls.** The signed typed wall and collapse/refusal control and the saved inward cap control pass in desktop Studio. 50 Model and 74 Studio tests, scoped lint, Model type check, Studio types and build, browser syntax and Git diff pass. The Model verifies both signs, finite mid-height frames and stale native support rejection. Independent native review confirms the signed displacement and why a handle translated along the normal can leave the finite wall.
- **FAIL, corrected test check.** The first Model type check found an optional plane type in the stale-frame test assertion. The corrected tuple is typed explicitly and the final type check passes.
- **NOT_RUN.** Other wall shapes and orientations, actual inward wall dragging, other browsers, mobile and full local suites. #629 remains open.

Use Node 22.19.0 and installed Chrome and Playwright. Gate heavy work and write evidence outside Git. Run the baseline command before the product change.

```sh
node packages/barocss-cad-model/scripts/test.mjs offset-face-native native-offset-face offset-to-plane
pnpm --dir apps/cad-studio test history-fillet-radius-receipt scalar-handle-drag offset-face-launch-view offset-collapse-feedback offset-plane-pick-feedback command-hud-actions preview-lifetime history-feature-editor
pnpm exec eslint packages/barocss-cad-model/src/app/offsetFaceEdit.ts packages/barocss-cad-model/test/offset-face-native.test.ts
pnpm --filter @barocss/cad-model type-check
pnpm --filter @barocss/cad-studio-app build
node --check apps/cad-studio/test/offset-drafted-wall-browser.mjs
git diff --check
cd apps/cad-studio
D1261_SOURCE_FROZEN=1 node test/offset-drafted-wall-browser.mjs "$EVIDENCE/baseline" --saved-handle-baseline
D1261_SOURCE_FROZEN=1 node test/offset-drafted-wall-browser.mjs "$EVIDENCE/wall" --saved-handle
D1261_SOURCE_FROZEN=1 node test/offset-drafted-wall-browser.mjs "$EVIDENCE/typed-wall"
D1255_SOURCE_FROZEN=1 node test/offset-drafted-cap-browser.mjs "$EVIDENCE/cap" --lower --history-handle --history-inward
```
