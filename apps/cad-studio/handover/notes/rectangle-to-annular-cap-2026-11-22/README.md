# D1609 — Extrude a rectangle to the original lower annular cap

P1, row 07, [#222](https://github.com/barocss/cad/issues/222). Base `038bbd65c0225d1d3743c43ef82252bd9f523468`.

A literal XY rectangle can terminate on the original lower annular cap of an upright circular Extrude with one coaxial through Hole. The recipe retains the current Hole output and the original lower face name. The existing native cap check certifies both trim loops and cylindrical walls. The projected corners establish coverage by the outside disk. The closest point of the whole rectangle to the bore centre establishes clearance of the hole. Both tests use conservative bounds on the native supports. The retained source Extrude must stay forward to keep the original start cap identity.

- **PASS, desktop Studio WebGPU.** All four corners of the refused rectangle are outside the bore, but the intervening footprint crosses it. To face refuses the pick and preserves the document. A separate profile with X extent 6 to 9 mm and Y extent −2 to +2 mm previews on `n1.bottom` of output `n2`. Apply, Undo and Redo retain the exact two-body document. Change the source Extrude start from Z20 to Z28 and verify that the named target and dependent height follow.
- **PASS, native geometry.** Both original cap loops remain. The four post corners reach the current Z station. Two strict solids pass, and the two cylinders of each wall retain R12 outside and R4 inside. Tube volume matches 768π mm³. Post volume follows 12 × height, from 240 to 336 mm³. Save and fresh Open reproduce the exact inspected native result.
- **PASS, affected checks.** 65 Model and 12 Studio tests, Model and Studio types, scoped lint, production build, browser syntax and Git diff. Model cases exercise edge and interior bore overlap, bore and outer contact, lost identity and reverse source. The intact circular target still passes in actual Studio. The annulus and disk runs cover 1159 and 1161 frozen files with zero changes, runtime errors or console errors.
- **FAIL, corrected first inspector setup.** The browser driver used an invalid package path in its diagnostic inspector. Correct the import and repeat the actual tests. The preceding product also refused two-loop annular targets.
- **NOT_RUN.** Other target or source profiles in the new branch, placed assembly targets, other renderers, exchange, mobile and the full local suites. #222 remains open.

Use Node 22.19.0 and installed desktop Chrome and Playwright. Acquire the heavy gate and keep screenshots and native outputs outside Git.

```sh
pnpm --dir packages/barocss-cad-model test face-end-extrude offset-face-native
pnpm --dir packages/barocss-cad-model type-check
pnpm exec eslint packages/barocss-cad-model/src/engine/faceEndExtrude.ts packages/barocss-cad-model/test/face-end-extrude.test.ts apps/cad-studio/test/annular-face-end-extrude-browser.mjs
pnpm --dir apps/cad-studio test extrude-end-face history-feature-apply tool-contract-mcp
pnpm --dir apps/cad-studio build
node --check apps/cad-studio/test/annular-face-end-extrude-browser.mjs
D1609_SOURCE_FROZEN=1 node apps/cad-studio/test/annular-face-end-extrude-browser.mjs "$EVIDENCE/annular"
D1601_SOURCE_FROZEN=1 node apps/cad-studio/test/face-end-extrude-browser.mjs "$EVIDENCE/disk" --create --circular-target
git diff --check
```
