# D1948 — Loft three tilted rectangles along two exact guides

P5 [row 7](../../roadmap-rows/07.md), [row 8](../../roadmap-rows/08.md), [row 24](../../roadmap-rows/24.md) and [row 30](../../roadmap-rows/30.md). [#174 PART-05](https://github.com/barocss/cad/issues/174). Base `c774d4673f07302bdc252bca7effe84a72e03ef8`. Full geometry change.

Three rectangular sections can use one certified rigid orientation. Their origins must reconstruct exactly along the common normal at 0, H/2 and H. The kernel projects both quadratic guides to the same local frame and reuses the exact horizontal three-section builder. It places the result in world coordinates once. Studio retains the saved middle frame for the History guide coordinates. The Part API accepts the same document fields.

- **FAIL, previous Studio.** The same valid stepped selection with two guides was refused because the three selected sections did not face +Z.
- **PASS, fixed desktop Studio.** Three sketches selected out of height order produce the same accepted shape as height order. Preview leaves the starting document intact. Apply makes one solid. History shows the correct section coordinates and rejects a guide that misses the middle front corner. Reset, Undo, Redo, Save and fresh Open pass. The prior horizontal three-section and tilted two-section desktop controls also pass.
- **PASS, independent geometry.** Volume is 16808/7 mm³. The centroid from the lower-half width and aspect integrals is (26.492826545, 0.938186636, 9.082417819) mm after rigid placement. Kernel, Part API and desktop measurement agree within 1e-8. One genus-zero shell retains 10 faces, 20 named edges, 12 vertices, all 40 pcurves and the four exact rail spans. Shifted middle/end frames, an off-midpoint frame and mixed position fields refuse.
- **PASS, affected checks.** 112 Kernel, 48 Model and two Studio checks, library and Studio production builds, affected types, scoped ESLint and diff check.
- **NOT_RUN.** STEP, general nonuniform/shifted three-section frames, a specialized display mesh and full local suites. The middle source replacement in a tilted frame is D1949. #174 stays open. First mechanical CAD remains 8/10. Overall CAD remains unmeasured.

```sh
THREE_SECTION_TWO_GUIDE_SOURCE_FROZEN=1 node apps/cad-studio/test/three-section-two-guide-loft-browser.mjs "$OUT/studio" --tilted
THREE_SECTION_TWO_GUIDE_SOURCE_FROZEN=1 node apps/cad-studio/test/three-section-two-guide-loft-browser.mjs "$OUT/horizontal"
D1280_SOURCE_FROZEN=1 node apps/cad-studio/test/two-guide-loft-taper-browser.mjs "$OUT/old-pair" --framed
pnpm --filter @barocss/cad build:library
node --test packages/barocss-cad/test/{loft-three-section-two-guides,loft-two-guides,two-guide-loft-display,oriented-loft,loft-nurbs-guide,loft-cubic-guide,loft-guide-control-range,loft-multi-conic}.test.mjs
node packages/barocss-cad-model/scripts/test.mjs loft-guide loft-section-history-edit api-multi-conic-loft loft-legacy-label toolset.test
node apps/cad-studio/scripts/test.mjs loft-two-guide-feedback
pnpm --filter @barocss/cad-model type-check
pnpm build
git diff --check
```

The previous Studio uses the same driver with `--tilted --baseline`. Screenshots and actual inspection receipts stay outside Git.
