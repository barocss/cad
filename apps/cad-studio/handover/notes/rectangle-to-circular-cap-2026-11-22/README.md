# D1601 — Extrude a rectangle to an upright circular cap

P1, row 07, [#222](https://github.com/barocss/cad/issues/222). Base `7be31a16c0596d5786a43f7ad958884cd9de98ad`.

Extrude to face now accepts the original lower cap of one intact upright circular extrusion when a literal XY rectangle approaches it from below. The Kernel certifies the current native disk. Both native cylinder supports bound the usable radius with a roundoff margin. The four corners must fit inside that disk. The operation keeps the original stable feature and face reference and derives the height on each rebuild. It produces a separate body with the existing saved recipe.

- **FAIL, base capability.** The pre-change Model evaluator refuses the circular cap with `VALUE`, "the target face needs one convex straight trim of 3 to 16 edges without holes." The same pinned evaluator refuses the actual candidate file saved by Studio. It does not build a substitute distance.
- **PASS, desktop Studio WebGPU.** Select the finished 10 × 10 mm rectangle. To face refuses the cylinder's top cap and the generated preview face. Pick the original `n1.bottom` on the R12 stock at Z20 and apply. Edit the target Start Z to 30 mm. The source follows. Shrinking the target diameter to 12 mm is refused with accepted geometry, history and selection intact. Undo and Redo restore 20 and 30 mm. Studio project Save and Open preserve the 929-byte document. After Open, a move to Z40 updates the same bound extrusion.
- **PASS, native geometry and containment.** The target centre stays at (5, 5) mm. Its 5 mm extrusion has volume 720π mm³. The rectangular body has four corners on Z0 and four at the named target level. Its volumes are 2000, 3000 and 4000 mm³, with both bodies independently valid. The R6 target's bounding square covers the rectangle, but its disk does not. The Model also rejects exact and uncertain near-tangency, held targets, reversed starts and unsupported cap or source types.
- **PASS, affected checks.** 37 Model and 27 Studio tests, Model and Studio types, scoped lint, production build, browser syntax and Git diff. The desktop run covered 1161 frozen files with zero changed files, runtime errors and console errors.
- **NOT_RUN.** Old desktop reader, other renderers, exchange, Join or Cut, arbitrary target axes, mobile and full local suites. #222 remains open.

Use Node 22.19.0, installed Chrome and Playwright. Gate heavy runs and keep browser captures and the saved fixture outside Git.

```sh
pnpm --dir packages/barocss-cad-model test face-end-extrude native-offset-face
pnpm --dir packages/barocss-cad-model type-check
pnpm exec eslint packages/barocss-cad-model/src/engine/faceEndExtrude.ts packages/barocss-cad-model/test/face-end-extrude.test.ts apps/cad-studio/test/face-end-extrude-browser.mjs
pnpm --dir apps/cad-studio test extrude-end-face-pick history-feature-apply document-file
pnpm --dir apps/cad-studio build
D1601_SOURCE_FROZEN=1 node apps/cad-studio/test/face-end-extrude-browser.mjs "$EVIDENCE" --create --circular-target
node --check apps/cad-studio/test/face-end-extrude-browser.mjs
git diff --check
```
