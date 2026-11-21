# D1622 — Extrude a circular source to an original lower circular cap

P1, row 07, [#222](https://github.com/barocss/cad/issues/222). Base `ef4a1b1abbf59bf24e3f57546fb1c9ca91dd646e`.

A literal XY circular sketch can terminate at the original lower disk of a supported upright circular Extrude. A two-feature native probe builds the same compiled sketch at the actual depth and certifies its complete disk. It accounts for the radius reconstructed from represented arc endpoints. The certified target radius and source supports give a strict squared-distance coverage check with native roundoff margins. The probe stays outside the document.

- **PASS, desktop Studio WebGPU.** Select an R9 source at (5, 5) mm and the original R12 lower disk at Z20. Its footprint fits even though its bounding square has corners outside the target. The top cap and the generated preview face are rejected as end targets. Apply, Undo and Redo keep the expected document. Edit the target to Z30, refuse shrinking it to R6, then Save and re-open the project. Move the same target again to Z40 and confirm the original `n1.bottom` binding.
- **PASS, independent geometry.** Both native solids are valid. The target R12 wall retains its centre and the original cap. The R9 source has two native half cylinders and a top cap at the edited depth. Its volumes at 20, 30 and 40 mm are 1620π, 2430π and 3240π mm³, with the final volume 10178.760197630929 mm³. The centroid follows (5, 5, depth/2) mm.
- **PASS, controls.** Model covers shifted inclusion, exact contact, slightly outside and margin cases, rounded endpoint radius, fractional XY translation, a short depth at the coordinate limit, legacy source identity and exact read and rebuild. It retains the circle-to-rectangle and circle-to-annulus boundaries. The actual rectangle-to-disk control passes.
- **PASS, affected checks.** 86 Model and 12 Studio tests, Model and Studio types, scoped lint, production build, browser syntax and Git diff. Both actual runs check 1,161 frozen files, with zero changes and zero page or console errors.
- **FAIL, base capability by source inspection.** The existing lower disk branch accepted only a rectangular source.
- **NOT_RUN.** Circle-to-annular end faces, arbitrary target axes, placed part targets, other renderers, exchange, mobile and full local suites. #222 remains open.

Use Node 22.19.0 and installed desktop Chrome and Playwright. Gate heavy runs and keep screenshots and saved evidence outside Git.

```sh
pnpm --dir packages/barocss-cad-model test face-end-extrude face-end-polygon offset-face-native revision-pinned-command
pnpm --dir packages/barocss-cad-model type-check
pnpm exec eslint packages/barocss-cad-model/src/engine/faceEndExtrude.ts packages/barocss-cad-model/test/face-end-extrude.test.ts apps/cad-studio/test/face-end-extrude-browser.mjs
pnpm --dir apps/cad-studio test extrude-end-face history-feature-apply tool-contract-mcp
pnpm --dir apps/cad-studio build
node --check apps/cad-studio/test/face-end-extrude-browser.mjs
D1622_SOURCE_FROZEN=1 node apps/cad-studio/test/face-end-extrude-browser.mjs "$EVIDENCE/circle" --create --circular-target --circular-source
D1601_SOURCE_FROZEN=1 node apps/cad-studio/test/face-end-extrude-browser.mjs "$EVIDENCE/rectangle" --create --circular-target
git diff --check
```
