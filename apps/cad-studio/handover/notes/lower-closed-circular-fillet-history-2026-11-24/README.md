# D1878 — Anchor the lower complete Fillet rim in History

P1/P5 [row 08](../../roadmap-rows/08.md) and [row 20](../../roadmap-rows/20.md), [#214](https://github.com/barocss/cad/issues/214). Base `02bda8df117bc5961d16120eb6c36a82b57410ac`.

History now uses the original +X seam for the terminal Constant Fillet of the complete lower rim of a plain upright circular extrusion. Both saved half-rim names must belong to the same cap. The native proof checks the signed meridional net, both full trims and the original cap and cylinder neighbors. The authenticated top plane height must match the authored stock so a complete lower round from a taller part cannot supply the receipt. The lower grip follows the radial and downward directions. This metadata belongs to evaluation and does not enter the saved document.

- **FAIL, unchanged Studio.** Creating the lower Fillet from an actual Bottom-view pointer selection produced a strict native solid. The History grip missed the independent seam position by 274.587012 CSS px. A typed R1.5 edit still worked.
- **PASS, actual desktop Studio.** The lower rim has 0.000042 CSS px anchor error in Bottom view and 0.000016 CSS px end-on. The lower and upper closed-rim flows record eight states each. The open-quarter control records six. No page or console errors were reported. A press during the held source read cannot start a drag after the reply is released. A fresh end-on drag changes R0.6 to R1.5. Cancel preserves the accepted model. Apply, Undo/Redo, typed R1.5 and native Save/fresh Open agree. Releasing a delayed original source reply after opening a different part leaves the new document intact.
- **PASS, independent geometry.** The fixture is an R8 × H10 cylinder. Both native source names survive. Strict output has one closed genus-zero shell, six faces, ten edges and six vertices. Two independently checked lower toroidal halves meet z=0 at radius 8−r and the cylinder at z=r. Calculated R1.5 volume is 1987.364903628 mm³. The measured native volume is 1987.364903628 mm³. Drag, typed edit and reopened native result share digest `bbcf3709ff54c230400c15f0639b03336c80861b3d2eadadafd9171535650a62`.
- **PASS, affected checks.** 11 Model and 31 Studio tests, scoped lint, Model type check and Studio production build. Cases reject mixed or duplicated cap names, substituted opposite cap, modified native trims or weights, wrong source direction, altered saved signature, stale ownership and actual results from a taller stock. Sol High independently reviewed the native orientation and height binding.
- **FAIL, first test attempts.** The first lower test fixture looked only at the first display name. It now finds the pick by membership. Another assertion treated the derived upper height as an exact machine number. The certificate now reads the actual retained top plane and the donor test uses a 1e−9 mm comparison.
- **NOT_RUN.** Whole local suites, arbitrary curved or multiple rims, other renderers and mobile. The wider [#214](https://github.com/barocss/cad/issues/214) remains open. First mechanical CAD stays 8/10.

## Reproduce the affected checks

Use Node 22.19.0 and the existing local Chrome and Playwright. Run heavy steps one at a time and freeze the worktree during Studio.

```sh
pnpm --dir packages/barocss-cad-model test native-fillet-torus-pair circular-fillet-handle
pnpm --dir apps/cad-studio test history-fillet-radius-receipt scalar-handle-drag command-build-failure
pnpm --dir packages/barocss-cad-model type-check
pnpm --dir apps/cad-studio build
D1878_SOURCE_FROZEN=1 node apps/cad-studio/test/closed-circular-fillet-handle-browser.mjs "$OUT/lower" --history --lower
D1865_SOURCE_FROZEN=1 node apps/cad-studio/test/closed-circular-fillet-handle-browser.mjs "$OUT/upper" --history
CIRCULAR_FILLET_HANDLE_FROZEN=1 node apps/cad-studio/test/circular-fillet-radius-handle-browser.mjs "$OUT/quarter" --history
```
