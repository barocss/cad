# D1971 — Draft four original box sides around an interior neutral plane

P5 [row 7](../../roadmap-rows/07.md) and [row 30](../../roadmap-rows/30.md). [#14](https://github.com/barocss/cad/issues/14). Base `51b1862499e162070ea5e0a456bb3ac159784cc6`.

An exact cardinal box can draft all four original side faces about an explicit neutral plane strictly inside the body. The existing analytic box producer intersects both opposing wall pairs with the end caps. The original names and four shared lines survive. The default +Z whole-Extrude Draft still edits the original Extrude. Raw four-side Draft at the body end, outside the body or with no neutral retains its previous refusal.

- **FAIL, previous desktop Studio.** Four selected sides, +10° and neutral Z4 produce a refusal on the previous product build. The refusal keeps the original box.
- **PASS, actual desktop Studio.** The four sides of a 40 × 30 × 40 mm box preview and apply at +10°. History refuses a collapsing 40° edit and preserves the accepted body. An outward −12° edit, Undo, Redo, Save and fresh Open preserve the four original face names, angle and neutral Z4.
- **PASS, independent geometry.** Integrate the section area `(40 - 2s tan(angle)) (30 - 2s tan(angle))` over `s = Z - 4`. Native and Studio volumes are 34137.8772708624 and 69859.4989096175 mm³. Both centroids have X20 and Y15. Z is 16.7651020194 and 22.7133314956 mm. Strict topology retains six faces, twelve edges and eight vertices. All four shared lines pass through the original corners at Z4. The maximum measured edge-to-surface gap is below 4e-15 mm.
- **PASS, controls.** Native signed pull, reversed pick order, saved native replay, both ends of both opposing-wall axes, near-collapse acceptance, range overflow and invalid selection controls pass. The three-side interior desktop control reproduces four D1969 native records byte for byte.
- **PASS, affected checks.** 39 Kernel, 20 Model and seven Studio checks. Kernel build, Model types, Studio types and production build, scoped ESLint and diff check.
- The first scoped lint run flagged three unused destructuring bindings in the test. The final lint and native tests pass after correcting the binding names.
- **NOT_RUN.** General curved Draft, non-cardinal pull, full local suites and mobile. #14 remains open for its wider acceptance. First mechanical CAD is 8/10. Overall CAD is unmeasured.

```sh
D1971_SOURCE_FROZEN=1 node apps/cad-studio/test/adjacent-planar-draft-browser.mjs "$OUT/prior" --four --baseline
D1971_SOURCE_FROZEN=1 node apps/cad-studio/test/adjacent-planar-draft-browser.mjs "$OUT/studio" --four
D1969_SOURCE_FROZEN=1 node apps/cad-studio/test/adjacent-planar-draft-browser.mjs "$OUT/three-control" --three --interior
pnpm --filter @barocss/cad build:library
node --test packages/barocss-cad/test/{draft-neutral-plane,drafted-extrusion,drafted-cap-offset,offset-drafted-wall}.test.mjs
node packages/barocss-cad-model/scripts/test.mjs draft-command-pull draft-angle-binding draft-angle-feedback api-draft-pull extrude-draft-binding
node apps/cad-studio/scripts/test.mjs draft-neutral-feedback draft-selection-history draft-angle-number
pnpm --filter @barocss/cad-model type-check
pnpm --dir apps/cad-studio build
git diff --check
```
