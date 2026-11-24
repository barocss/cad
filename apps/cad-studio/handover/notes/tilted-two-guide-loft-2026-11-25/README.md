# D1936 — Loft two offset rectangles in a shared tilted frame

P5 [row 7](../../roadmap-rows/07.md), [row 8](../../roadmap-rows/08.md), [row 24](../../roadmap-rows/24.md) and [row 30](../../roadmap-rows/30.md). [#174 PART-05](https://github.com/barocss/cad/issues/174) and [#177 SURF-04](https://github.com/barocss/cad/issues/177). Base `ad4ad60901f6b37715f00f88481048e29788e3e4`. FULL geometry change.

Two-guide Loft accepts two four-line rectangular sketches with identical certified rigid axes and an exactly reconstructed offset along their common normal. Studio sorts them by height and saves their existing explicit section frames. The two quadratic guides remain copied world-mm values. Each guide control must reconstruct its original world point at its section height or the midplane. The existing polynomial construction uses the resulting section coordinates and places the exact solid once. The edge, face and pcurve ownership and native minimum lengths carry through. History edits guide middles in section X and Y. The existing +Z route still uses the original height sections and field labels. The display adapter checks a planar cap in its native orientation and preserves shared sampled boundary points.

- **FAIL, previous desktop Studio.** Selected the two tilted sketches in reverse order and chose both guides. The existing command reported that a section must face +Z. The document was unchanged.
- **FAIL, first candidate.** The existing displacement decomposition introduced a lateral residual for the exact 10 mm normal offset. The final admission checks the reconstruction of the normal offset and projects the guide controls in their required section planes. It still refuses an actual lateral displacement. The final History editor reads the middle values from the section midplane so a zero section Y displays as zero.
- **PASS, desktop Studio.** Created the tapered solid with two copied guides. History refused a crossed guide position and retained the complete document. It applied the second guide's section X from 16 to 18 mm, then passed Undo, Redo, Save and fresh Open. A post-Open section Y edit from 0 to 2.5 mm produced the intended change and Undo restored the saved document. Six current scenes passed visual inspection. The existing unequal +Z Loft also passed creation, guide edit, Undo/Redo and fresh Open in the desktop control.
- **PASS, independent geometry.** The Studio fixture has a 10 × 6 mm section and a 14 × 4 mm section 10 mm apart in the shared frame with origin (20, −10, 7) mm and normal (0, 0.8, 0.6). Integrate each rectangular slice with width vector D and depth vector (−Dᵧ, Dₓ)(3/5 − 11t/35). The world rails, four wall charts and sampled sections match within 1e−8 mm. The accepted sequence has volumes 4836/7, 80636/105 and 162047/210 mm³. The native and Studio Worker volumes agree within 1e−8 mm³. The native solid has 6 faces, 12 edges, 8 vertices, reciprocal guide uses and genus 0. The display uses 2080 triangles at a certified mesh error bound of 0.008386 mm, compared with 166 base triangles. The separate 25 mm native fixture has volume 1708 mm³ with independent centroid and reciprocal UV checks.
- **PASS, affected checks.** 108 Kernel, 36 Model and two Studio tests. Kernel and Studio production builds, Model and Studio types, scoped ESLint and diff check. The final native test detects mutations that accept lateral frame displacement or omit the world placement.
- **FAIL, existing checks on base and candidate.** The wider profile group has one existing Sweep test mismatch. Its path description expects Faceted in the label, and the current panel reports the Line path with a separate Faceted solid row. The pinned base reproduces the same mismatch. The code-shape check has the same five prior B-rep findings as the baseline recorded in D1931. The current change does not alter those paths.
- **NOT_RUN.** General rotated bases outside strict admission, unequal axes, nonrectangular profiles, lateral frame offsets, broader guide types, Agent authoring of framed two-guide features, new STEP exchange for tilted sections, local full suites and mobile. Both parent issues remain open. First mechanical CAD remains 8/10 accepted. Whole CAD remains unmeasured.

```sh
D1280_SOURCE_FROZEN=1 node apps/cad-studio/test/two-guide-loft-taper-browser.mjs "$OUT/studio" --framed
D1280_SOURCE_FROZEN=1 node apps/cad-studio/test/two-guide-loft-taper-browser.mjs "$OUT/horizontal" --check-display
pnpm --filter @barocss/cad build:library
node --test packages/barocss-cad/test/{loft-two-guides,two-guide-loft-display,oriented-loft,loft-nurbs-guide,loft-cubic-guide,loft-guide-control-range,loft-multi-conic}.test.mjs
node packages/barocss-cad-model/scripts/test.mjs loft-guide loft-section-history-edit api-multi-conic-loft loft-legacy-label
node apps/cad-studio/scripts/test.mjs loft-two-guide-feedback
pnpm --filter @barocss/cad-model type-check
pnpm build
git diff --check
```

The baseline flow uses the new driver at the previous source with `--framed --baseline`. The two Studio runs require the installed desktop Chrome and Playwright. Evidence files remain outside Git. The Studio build command used for D1935 was also `pnpm build`, which selects `@barocss/cad-studio-app`.
