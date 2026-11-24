# D1969 — Draft three original box sides around an interior neutral plane

P5 [row 7](../../roadmap-rows/07.md) and [row 30](../../roadmap-rows/30.md). [#14](https://github.com/barocss/cad/issues/14). Base `f83e8c402d41b881630e505339d717c0b7c5bc6e`. Full native geometry change.

The exact cardinal box Draft permits three original transverse sides around a fixed coordinate between the pull endpoints. The selected side on one axis and the opposing pair on the other use the same two end-range checks and six-face producer as D1968. The saved recipe retains its existing fields.

- **FAIL, previous Studio.** Picking the three original sides and fixing the neutral plane at Z4 mm refused.
- **PASS, actual desktop Studio.** Pick the right, front and back faces of a 40 × 30 × 40 mm box. Preview and apply a +10° Draft around Z4 mm. Reject an edit that closes the opposing walls. Edit to −12°, Undo, Redo, Save and fresh Open. The original three faces, signed angle and fixed neutral coordinate persist.
- **PASS, independent native geometry.** For `s=z−4`, `k=tan(angle)`, area is `(40−ks)(30−2ks)`. Volume at +10° is 36554.9679292945 mm³ with centroid (18.81327861, 15, 17.46046289) mm. Volume at −12° is 64371.1974335613 mm³ with centroid (21.93179603, 15, 22.17677152) mm. Both original shared straight edges cross Z4 at (40,0,4) and (40,30,4) mm. Six faces, 12 edges, eight vertices and genus 0 persist. The largest edge-surface gap is 4.00e−15 mm.
- **PASS, controls.** Both signed pull directions, reversed pick order, cold/recompute parity, opposing-wall collapse and near-limit acceptance at both ends pass. Actual two-side interior and three-side body-end controls match eight D1968 native records byte for byte.
- **PASS, affected checks.** 36 Kernel, 19 Model and seven Studio tests, Kernel library and Studio production builds, affected types, scoped lint and diff check.
- **NOT_RUN.** General four-face or curved Draft, new pcurves, STEP, full local suites and mobile. #14 remains open. First mechanical CAD remains 8/10 accepted. Overall CAD stays unmeasured.

```sh
D1969_SOURCE_FROZEN=1 node apps/cad-studio/test/adjacent-planar-draft-browser.mjs "$OUT/prior" --three --interior --baseline
D1969_SOURCE_FROZEN=1 node apps/cad-studio/test/adjacent-planar-draft-browser.mjs "$OUT/studio" --three --interior
D1968_SOURCE_FROZEN=1 node apps/cad-studio/test/adjacent-planar-draft-browser.mjs "$OUT/two-interior-control" --interior
D1934_SOURCE_FROZEN=1 node apps/cad-studio/test/adjacent-planar-draft-browser.mjs "$OUT/three-end-control" --three
pnpm --filter @barocss/cad build:library
node --test packages/barocss-cad/test/{draft-neutral-plane,drafted-extrusion,drafted-cap-offset,offset-drafted-wall}.test.mjs
node packages/barocss-cad-model/scripts/test.mjs draft-command-pull draft-angle-binding draft-angle-feedback api-draft-pull extrude-draft-binding
node apps/cad-studio/scripts/test.mjs draft-neutral-feedback draft-selection-history draft-angle-number
pnpm --filter @barocss/cad-model type-check
pnpm build
git diff --check
```
