# D1612 — Offset the original lower annular cap of a coaxial tube

P5, row 31, [#629](https://github.com/barocss/cad/issues/629). Base `ec7189d813700abdfca2b80f20be103023cae158`.

Offset face admits the original lower cap of the same upright coaxial tube as D1610. A positive signed distance moves the lower station outward along −Z. A negative distance moves it toward the upper cap. The native axial map preserves both radii, their axis, the original upper station and trim ownership. History retains a distance-only edit on the original face.

- **PASS, desktop Studio WebGPU.** Pick `n1.bottom` from the underside. The normal drag previews +3 mm along −Z. Apply +2 mm. The lower station moves from Z0 to Z−2 and the height is 18 mm. A −16 mm request reaches the opposite cap and is refused with the current part intact. Apply −2 mm in History. The lower station is now Z2 and the height is 14 mm. Undo, Redo, Save and fresh Open preserve the approved distance and original cap.
- **PASS, native geometry.** The upper cap remains at Z16. The two R12 outside walls and R4 bore walls keep the (14, 9) mm axis. Native owners, incidence and all trim parameter records agree with the source. Native volumes are 6433.981754551888, 7238.229473870887 and 5629.734035232882 mm³ at heights 16, 18 and 14 mm, within 3e−11 mm³ of 128π × height. The measured edge-to-surface gap is 0 mm for this fixture. Reopening reproduces the measured solid and its topology. The upper cap control also passes in actual Studio.
- **PASS, affected checks.** 99 Kernel, 76 Model and 44 Studio tests. Kernel, Model and Studio types, scoped lint, production build, driver syntax and Git diff pass. Both frozen Studio runs track 1161 files with zero file changes, runtime errors and console errors. Focused tests verify opposite contact and reject reverse source, invalid face ownership, chained and plane-based edits.
- **FAIL, base capability and corrected test assumption.** D1610 refused the lower cap. The first new range test expected +10000 mm to exceed the coordinate boundary. The derived lower station was exactly Z−10000 and remains inside the existing policy. The refusal test now uses +10001 mm.
- **NOT_RUN.** Other stock families and chained or tilted cap edits as supported changes, other renderers, exchange, mobile and full local suites. #629 remains open.

Use Node 22.19.0 and installed desktop Chrome and Playwright. Acquire the heavy gate and keep screenshots and native files outside Git.

```sh
pnpm --dir packages/barocss-cad exec node scripts/tool.mjs build:fast
node --test --test-concurrency=1 packages/barocss-cad/test/{bored-cap-offset,bore-wall-offset,circular-wall-offset,drafted-cap-offset}.test.mjs
pnpm --dir packages/barocss-cad type-check
pnpm --dir packages/barocss-cad-model test offset-face-native face-end-extrude native-offset-result
pnpm --dir packages/barocss-cad-model type-check
pnpm exec eslint packages/barocss-cad/src/{features/bored-cap-offset,part/part-model}.ts packages/barocss-cad/test/bored-cap-offset.test.mjs packages/barocss-cad-model/src/{app/nativeOffsetFace,app/profileCommands,app/offsetFaceEdit,engine/doc}.ts packages/barocss-cad-model/test/offset-face-native.test.ts apps/cad-studio/test/offset-bored-cap-browser.mjs
pnpm --dir apps/cad-studio test offset-face-launch-view offset-cap-feedback history-feature-apply viewport
pnpm --dir apps/cad-studio build
node --check apps/cad-studio/test/offset-bored-cap-browser.mjs
D1612_SOURCE_FROZEN=1 node apps/cad-studio/test/offset-bored-cap-browser.mjs "$EVIDENCE/lower" --tube --lower
D1610_SOURCE_FROZEN=1 node apps/cad-studio/test/offset-bored-cap-browser.mjs "$EVIDENCE/upper" --tube
git diff --check
```
