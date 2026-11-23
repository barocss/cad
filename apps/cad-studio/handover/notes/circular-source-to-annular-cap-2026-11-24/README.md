# D1861 — End a circular Extrude on an original annular cap

P1/P5 [row 07](../../roadmap-rows/07.md) and [row 16](../../roadmap-rows/16.md), [#222](https://github.com/barocss/cad/issues/222). Base `3679f58dd2b887bdae82a4f25462651b332146a0`.

To face now supports a complete circular source on the original lower cap of an upright circular Extrude with one original coaxial through Hole. The existing native cap proof derives conservative outer and bore radii. A native probe at the actual depth supplies the source disk, including represented centre and radius. Exact squared comparisons check both trims, with strict clearance. The existing saved relationship tracks the original target body, feature and face.

- **PASS, actual desktop Studio.** The circular source at (6, 6) mm and radius 3 mm fits on the R12/R4 annulus. Its bounding square extends past the rim. A source crossing the bore and one crossing the outer trim both refuse Apply and retain the current document. The accepted original `n1.bottom` face follows Z20 to Z28. Undo, Redo, Save and fresh Open retain the original reference and exact native result.
- **PASS, independent geometry.** The two current solids are strict. The R3 post has two native cylindrical faces and the top plane coincides with the original target. Analytic area 9π gives 180π and 252π mm³. The centroid is (6, 6, h/2) mm. The tube retains its original trim and material. Focused tests refuse inner and outer tangency, accept a 0.000001 mm gap at either boundary and compare the unchanged tube against its independent prefix.
- **PASS, affected checks.** 83 Model tests, 1 Studio test, Model and Studio type checks, production build, scoped ESLint and Git diff check. The prior convex-triangle Studio flow is the desktop control.
- **FAIL, initial Model check.** An old regression asserted that every circular source on the annulus was unsupported. Updated that assertion to retain refusal of a circular source with a hole. All affected checks passed after the update.
- **NOT_RUN.** Full local suites, other renderers, general annular or placed targets, and independent STEP. The wider #222 remains open. First mechanical CAD remains 8/10 and overall completion remains unmeasured.

```sh
pnpm --dir packages/barocss-cad-model test face-end-extrude engine profile-commands
pnpm --dir packages/barocss-cad-model type-check
pnpm --dir apps/cad-studio test extrude-end-face-pick
pnpm --dir apps/cad-studio build
D1861_SOURCE_FROZEN=1 node apps/cad-studio/test/annular-face-end-extrude-browser.mjs "$OUT/circle" --circle
D1621_SOURCE_FROZEN=1 node apps/cad-studio/test/annular-face-end-extrude-browser.mjs "$OUT/polygon" --polygon
git diff --check
```
