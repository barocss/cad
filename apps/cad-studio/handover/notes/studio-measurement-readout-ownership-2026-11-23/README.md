# D1802 — Extract the Studio measurement session and readouts

P4 Studio structure and measurement, rows 15 and 22. [Issue #44](https://github.com/barocss/cad/issues/44). Base `44d57fb81144d7441c5fed8ed29b31723dbd278a`.

Move measurement targets, focus state, pin session, mesh-circle routing, readout panels and overlay output into `useStudioMeasurementReadouts`. App supplies the current document and evaluation, mode and source permissions, selection and material. The native geometry and viewport continue to use the same measurement outputs. App.tsx goes from 2,948 to 2,930 lines.

- **PASS — actual desktop Studio WebGPU, pinned face.** Pin the 8 mm distance between opposite Extrude faces, then Save and fresh Open. The pin preserves the accepted document, dirty flag and History controls. Fresh Open keeps the part and clears the session measurement. Independent JSON inspection confirms the saved bytes are the accepted document. Both versions save SHA-256 `d5aed626652f09d755a65e2fae23b0df8102e13dc6c76f9d839ff3813136c0e3`.
- **PASS — actual mesh circle workflow.** The same three actual pointer picks on the imported synthetic STL give center (20, 0, 5) mm and displayed radius 20.62 mm. Camera movement, Reset, Back, Done, Escape and retargeting preserve the existing session behavior. Source replacement clears the partial picks. The saved native file is byte-identical before and after and reopens with the same model.
- **PASS — actual pinned mass workflow.** Two native 1,000 mm³ cubes with different materials give 10.55 g and center (27.322274881516588, 5, 5) mm. Hiding either selected member preserves its contribution. Material change gives 5.4 g and center (20, 5, 5) mm. Undo, Redo, Clear, Open and New retain the original session behavior.
- **PASS — affected checks.** The three paired desktop flows record 26 snapshots and match all 13 states, three workflow observations, independent oracle output hashes and saved file hashes. Source capsules remain unchanged in each run. No page or console errors occur. All 16 focused Studio tests, scoped ESLint, Studio type check and production build, and Git diff check pass.
- **FAIL.** None in the affected checks.
- **NOT_RUN.** Full local suites, other backends, mobile, performance benchmarking and broader measurement qualification. First mechanical CAD remains at 8/10 accepted. Overall completion is unmeasured. Issue #44 stays open.

## Reproduction

Use Node 22.19.0, the heavy gate, installed Chrome and Playwright, and external output directories. Run all three browser flows before and after the extraction. Candidate source capsules include the new hook.

```sh
pnpm --dir apps/cad-studio exec eslint src/App.tsx src/app/useStudioMeasurementReadouts.tsx
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test pinned-face-measure pinned-mass mesh-circle-session mesh-circle-pick measure-pick-hint measure-quantity-text
pnpm --dir apps/cad-studio build
PINNED_FACE_FILE_FROZEN=1 node apps/cad-studio/test/pinned-face-save-file-browser.mjs "$OUT/face"
MESH_CIRCLE_FROZEN=1 node apps/cad-studio/test/mesh-circle-browser.mjs "$OUT/circle"
PINNED_MASS_FROZEN=1 node apps/cad-studio/test/pinned-mass-browser.mjs "$OUT/mass"
git diff --check
```
