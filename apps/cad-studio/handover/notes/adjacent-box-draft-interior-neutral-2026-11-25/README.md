# D1968 — Draft two adjacent box sides around an interior neutral plane

P5 [row 7](../../roadmap-rows/07.md) and [row 30](../../roadmap-rows/30.md). [#14](https://github.com/barocss/cad/issues/14). Base `842b053f8d582a8361306cbb9c921d1ec4cdd2ff`. Full native geometry change.

Two original adjacent transverse sides of a cardinal box accept a fixed coordinate between the original pull endpoints. The producer computes both cap footprints around that coordinate and keeps the six supporting face identities. It checks coordinate range and positive wall gaps at both ends. An affine gap between two positive end values remains positive throughout. The saved Draft uses its existing recipe fields.

- **FAIL, previous Studio.** The original two selected box sides rejected fixed neutral Z4 mm.
- **PASS, actual desktop Studio.** Create the 40 × 30 × 40 mm box and pick its original front and right sides. Fix the neutral plane at Z4 mm, preview +10° and apply. A +40° collapse refuses in History. An edit to −12°, Undo, Redo, Save and fresh Open preserve both original side names and the fixed coordinate.
- **PASS, independent geometry.** With `s = z − 4` and `k = tan(angle)`, the section area is `(40 − ks)(30 − ks)`. At +10° the volume is 40584.744949846 mm³ and the centroid is (18.72085906, 16.27914094, 18.50873752) mm. At −12° the volume is 58226.141708813 mm³ and the centroid is (21.85936980, 13.14063020, 21.49529433) mm. The shared straight edge passes through the original neutral intersection (40,0,4) mm. Both end footprints, the opposite planes and all six faces, 12 edges and eight vertices pass. The largest measured edge-surface gap is 3.56e−15 mm.
- **PASS, native scope and controls.** Native checks cover both angle signs, negative pull, both end-collapse cases and both coordinate-range limits. Actual two-side and three-side body-end controls match eight D1934 native records byte for byte.
- **PASS, affected checks.** 35 Kernel, 19 Model and seven Studio tests, Kernel library and Studio production builds, affected types, scoped lint and diff check.
- **NOT_RUN.** General multi-side or curved Draft, three-side interior neutral, new pcurves, STEP, full local suites and mobile. #14 remains open. First mechanical CAD is 8/10 accepted. Overall CAD remains unmeasured.

```sh
D1968_SOURCE_FROZEN=1 node apps/cad-studio/test/adjacent-planar-draft-browser.mjs "$OUT/prior" --interior --baseline
D1968_SOURCE_FROZEN=1 node apps/cad-studio/test/adjacent-planar-draft-browser.mjs "$OUT/studio" --interior
D1252_SOURCE_FROZEN=1 node apps/cad-studio/test/adjacent-planar-draft-browser.mjs "$OUT/two-control"
D1934_SOURCE_FROZEN=1 node apps/cad-studio/test/adjacent-planar-draft-browser.mjs "$OUT/three-control" --three
pnpm --filter @barocss/cad build:library
node --test packages/barocss-cad/test/{draft-neutral-plane,drafted-extrusion,drafted-cap-offset,offset-drafted-wall}.test.mjs
node packages/barocss-cad-model/scripts/test.mjs draft-command-pull draft-angle-binding draft-angle-feedback api-draft-pull extrude-draft-binding
node apps/cad-studio/scripts/test.mjs draft-neutral-feedback draft-selection-history draft-angle-number
pnpm --filter @barocss/cad-model type-check
pnpm build
git diff --check
```
