# D1945 — Loft three horizontal rectangles along two exact guides

P5 [row 7](../../roadmap-rows/07.md), [row 8](../../roadmap-rows/08.md), [row 24](../../roadmap-rows/24.md) and [row 30](../../roadmap-rows/30.md). [#174 PART-05](https://github.com/barocss/cad/issues/174). Base `543dc08a2353f22ea540507c46cf0a2b658d472e`. Full geometry change.

The ruled two-guide Loft accepts three axis-aligned rectangular sections at 0, H/2 and H. Both full quadratic rails must contact the front corners of the middle rectangle exactly. The kernel splits both curves at one half with exact dyadic arithmetic. It builds two native spans, proves the complete matching middle line ring and opposite cap orientations, then joins the spans across that ring. No Boolean fallback occurs. Studio can replace the uniquely owned middle sketch copy from a source at the same station, subject to the same guide checks. The public Part API accepts the same shape. The existing file fields hold the copied guides and sections.

- **FAIL, previous product.** Actual Studio exposed one guide with three sketches selected. Its pinned kernel rejected the same three-section input even with two exact guide curves.
- **PASS, exact native result.** One genus-zero body has 10 faces, 10 loops, 40 coedges, 20 edges and 12 vertices. All 40 pcurves are present. Four middle edges each have two reciprocal uses. The original end caps and four exact rail spans remain. Nonmidpoint spacing, off-rail rectangles and smooth mode refuse.
- **PASS, independent geometry.** For half-span parameter u, width is 10+8u−4u². For the 12 mm middle depth, the aspect ratio is (21+9u)/35. Integrating the two mirrored halves gives 16808/7 mm³ and centroid (95490/14707, 12603474/2573725, 10) mm. A 14 mm middle depth gives 2656 mm³. Native mass and the Studio worker agree within 1e−8 mm³.
- **PASS, actual desktop Studio.** Starts from three selected rectangular sketches and two copied guides. A History guide change that misses the middle section is refused. Selecting the alternate middle depth changes the measured solid with the same copied guides and shared ring. Undo, Redo, Save and fresh Open pass. The original tilted two-section desktop control passes.
- **PASS, affected checks.** 111 Kernel and 47 Model tests, plus two Studio tests. Library and Studio production builds, Model and Studio types, scoped ESLint and diff check pass.
- **FAIL, corrected intermediate checks.** The first build needed explicit types for the two-guide tuple and validated section array. The next candidate already refused the invalid section as intended. The diagnostic now names the halfway requirement and the refusal check passes.
- **NOT_RUN.** Tilted three-section layouts, nonuniform stations, arbitrary guide laws, new STEP round trip, specialized display refinement for the ten-face result, full local suites and mobile. #174 remains open. First mechanical CAD stays at 8/10. Overall CAD remains unmeasured.

```sh
THREE_SECTION_TWO_GUIDE_SOURCE_FROZEN=1 node apps/cad-studio/test/three-section-two-guide-loft-browser.mjs "$OUT/studio"
D1280_SOURCE_FROZEN=1 node apps/cad-studio/test/two-guide-loft-taper-browser.mjs "$OUT/control" --framed
pnpm --filter @barocss/cad build:library
node --test packages/barocss-cad/test/{loft-three-section-two-guides,loft-two-guides,two-guide-loft-display,oriented-loft,loft-nurbs-guide,loft-cubic-guide,loft-guide-control-range,loft-multi-conic}.test.mjs
node packages/barocss-cad-model/scripts/test.mjs loft-guide loft-section-history-edit api-multi-conic-loft loft-legacy-label toolset.test
node apps/cad-studio/scripts/test.mjs loft-two-guide-feedback
pnpm --filter @barocss/cad-model type-check
pnpm build
git diff --check
```

The old source uses the same three-section desktop driver with `--baseline`. Native measurements and screenshots stay outside Git.
