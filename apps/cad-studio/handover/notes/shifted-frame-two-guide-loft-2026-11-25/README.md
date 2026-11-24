# D1941 — Admit a shifted upper frame in an exact two-guide Loft

P5 [row 7](../../roadmap-rows/07.md), [row 8](../../roadmap-rows/08.md), [row 24](../../roadmap-rows/24.md) and [row 30](../../roadmap-rows/30.md). [#174 PART-05](https://github.com/barocss/cad/issues/174). Base `6603d1dda5a6aa5ca35472222a25a3da261954ae`. Full geometry change.

Two-guide Loft can use a laterally shifted upper rectangular sketch when the two frames have identical certified rigid axes. The kernel measures the normal height, projects the residual in the upper station and verifies exact reconstruction of the origin and all four upper corners. The existing build uses the carried upper coordinates and places the solid once. Studio retains the authored section frames and copied world rails in the native file. An existing way to describe the same solid is to shift the upper profile coordinates on a pure-normal frame.

- **FAIL, previous desktop behavior.** The upper sketch origin was 5 mm off the common normal. Studio refused the Loft before preview and preserved the document.
- **PASS, desktop Studio.** The accepted case has a 5 mm upper-frame shift, a 10 mm section spacing and 10 × 6 / 14 × 4 mm rectangles. Studio creates the Loft from two copied world curves, refuses a crossing, applies guide X, and passes Undo, Redo, native Save and fresh Open. It then applies the guide Y edit in section coordinates. The original tilted pure-normal control also passes. After the guide edits, exact volume changes from 690.857142857 to 767.961904762 to 771.652380952 mm³ based on independent polynomial slice integration. The direct display has a certified mesh error below 0.01 mm.
- **PASS, native invariance.** With a 25 mm normal height, lateral shifts (5, 0) and (5, 25) mm each produce bit-identical topology, points, rail controls, reciprocal pcurves, names, IDs and mass to the equivalent profile-coordinate representation. The independent volume is 1708 mm³. Strict validation confirms six faces, six loops, 24 coedges, 12 edges, eight vertices and genus zero. A mismatch between an upper corner and the corresponding guide still refuses. A shifted frame that reconstructs its origin but cannot reconstruct each upper corner exactly also refuses.
- **PASS, affected checks.** 109 Kernel tests and production library build. 36 Model and two Studio tests. Model and Studio types, scoped ESLint, Studio production build and diff check pass.
- **FAIL, intermediate verification.** A baseline harness tried to read the collapsed native diagnostic as visible. The rerun checked the current refusal state and diagnostic text. The original candidate's untyped callback failed the build. A subsequent candidate tried to project the whole displacement and produced a residual for the 10 mm Studio stack. The final kernel projects after subtracting the normal origin. The origin (20, −10, 7) still refused a shifted fixture whose last upper corner did not round-trip under binary64. The accepted shifted Studio fixture uses origin (20, −6, 7) and passes the strict corner guard. The crossing test also used the prior section origin at first. The accepted test subtracts half the new in-plane shift to use the existing History coordinate. The unchanged pure-normal desktop control still uses (20, −10, 7).
- **NOT_RUN.** General placement outside exact reconstruction, unequal frames, three sections with two guides, other profile families, downstream STEP requalification, full local suites and mobile. The parent epic remains open. First mechanical CAD remains 8/10 accepted. Whole CAD remains unmeasured.

```sh
D1280_SOURCE_FROZEN=1 node apps/cad-studio/test/two-guide-loft-taper-browser.mjs "$OUT/studio" --framed --shifted
D1280_SOURCE_FROZEN=1 node apps/cad-studio/test/two-guide-loft-taper-browser.mjs "$OUT/control" --framed
pnpm --filter @barocss/cad build:library
node --test packages/barocss-cad/test/{loft-two-guides,two-guide-loft-display,oriented-loft,loft-nurbs-guide,loft-cubic-guide,loft-guide-control-range,loft-multi-conic}.test.mjs
node packages/barocss-cad-model/scripts/test.mjs loft-guide loft-section-history-edit api-multi-conic-loft loft-legacy-label
node apps/cad-studio/scripts/test.mjs loft-two-guide-feedback
pnpm --filter @barocss/cad-model type-check
pnpm build
git diff --check
```

The old-source control uses `--framed --shifted --baseline` with the original fixture origin. Retain desktop scenes, independent native observations and source-freeze receipts outside Git.
