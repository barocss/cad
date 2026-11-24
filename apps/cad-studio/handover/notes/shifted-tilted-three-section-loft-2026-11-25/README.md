# D1956 — Shift the middle and end frames of a tilted three-section Loft

P5 [row 7](../../roadmap-rows/07.md), [row 8](../../roadmap-rows/08.md), [row 24](../../roadmap-rows/24.md) and [row 30](../../roadmap-rows/30.md). [#174 PART-05](https://github.com/barocss/cad/issues/174). Base `68c38ed21d60dd0b3396d6230e7e5147af64a3ec`. Full geometry change.

The exact three-section, two-guide Loft accepts lateral frame shifts at the existing normal stations 0, H/2 and H. Each shifted origin and each authored rectangle corner must reconstruct exactly in the common frame. The two full guides still split at one half and join across the exact middle ring. Existing two-section and three-section pure-normal paths retain their prior producers.

- **FAIL, previous Studio.** Valid matching guides and exact 2 mm middle and 4 mm end shifts were refused by the pure-normal-only guard.
- **PASS, actual desktop Studio.** Select the three original sketches out of height order, preview both copied guides, apply, refuse a History control that misses the middle corner, Reset, Undo, Redo, Save and fresh Open. The previous pure-normal three-section and shifted two-section desktop controls pass.
- **PASS, independent geometry.** The 10×5, 14×10 and 10×5 mm sections with H=20 are the D1945 sections with depth scaled by 5/6. The lateral shear preserves volume. Native and worker agree with 42020/21 mm³. The world centroid is (28.492826545, 0.448488863, 9.735348182) mm. Exact rail poles and the shared ring persist. Native checks cover both signed X shifts and a combined X/Y shift. Each solid has 10 faces, 20 edges, 12 vertices and 40 pcurves in one genus-zero shell.
- **PASS, affected checks.** 113 Kernel, 50 Model and two Studio checks, native library and Studio production builds, affected types, scoped ESLint and diff check.
- **FAIL, corrected intermediate checks.** The baseline driver first looked for a collapsed native detail. The corrected run expands it. The first focused Kernel test used the wrong expected text for the existing middle-contact refusal. The corrected assertion passes.
- **NOT_RUN.** Separate STEP or Agent proposal qualification for the shifted layout, new display refinement, general frame rotation, full local suites and mobile. #174 stays open. First mechanical CAD is 8/10. Overall CAD remains unmeasured.

```sh
THREE_SECTION_TWO_GUIDE_SOURCE_FROZEN=1 node apps/cad-studio/test/three-section-two-guide-loft-browser.mjs "$OUT/prior" --shifted --baseline
THREE_SECTION_TWO_GUIDE_SOURCE_FROZEN=1 node apps/cad-studio/test/three-section-two-guide-loft-browser.mjs "$OUT/studio" --shifted
THREE_SECTION_TWO_GUIDE_SOURCE_FROZEN=1 node apps/cad-studio/test/three-section-two-guide-loft-browser.mjs "$OUT/pure-normal" --tilted
D1280_SOURCE_FROZEN=1 node apps/cad-studio/test/two-guide-loft-taper-browser.mjs "$OUT/old-pair" --framed
pnpm --filter @barocss/cad build:library
node --test packages/barocss-cad/test/{loft-three-section-two-guides,loft-two-guides,two-guide-loft-display,oriented-loft,loft-nurbs-guide,loft-cubic-guide,loft-guide-control-range,loft-multi-conic}.test.mjs
node packages/barocss-cad-model/scripts/test.mjs loft-guide loft-section-history-edit api-multi-conic-loft loft-legacy-label toolset.test
node apps/cad-studio/scripts/test.mjs loft-two-guide-feedback
pnpm --filter @barocss/cad-model type-check
pnpm build
git diff --check
```

Screenshots and native inspection files stay outside Git.
