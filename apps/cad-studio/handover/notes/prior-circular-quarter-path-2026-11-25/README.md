# D1931 — Repeat the original circular through-cut along a canonical quarter arc

P1 [row 7](../../roadmap-rows/07.md), [row 8](../../roadmap-rows/08.md) and [row 16](../../roadmap-rows/16.md), [#25](https://github.com/barocss/cad/issues/25). Base `8a652d17139a76a25d91cf022bea06df4ce82a0e`. FULL native feature-family change.

The existing path planner identifies the admitted geometry. The earlier circular through-cut accepts exact straight spans and one canonical XY quarter arc. The same original upright stock, original circular cut, single later rectangular cut and fixed-orientation translation still pass the existing containment and pairwise clearance checks. The certified points go directly to the established upright subtraction. No geometry tolerance, file format or B-rep Boolean implementation changes.

- **FAIL, previous Studio.** The real Sketch Centre arc at R20 produced the exact rational quarter path. The original through-cut could be selected, but Apply refused the quarter because that source accepted only straight spans.
- **PASS, current Studio.** Count 4 and pitch 8 mm create three new circular bores. Pitch 4 mm refuses because the actual round cells overlap. Pitch 11 mm refuses because the final station exceeds the path. The original document and history are preserved in both refusals. History edits pitch 8 to 9 mm. Undo, Redo, native Save and fresh Open keep the original `n4` source, later rectangular cut and Direct path ID. Six current quarter checkpoints and six unchanged straight controls passed.
- **PASS, independent native geometry.** The copy offsets are `(20 sin(s/20), 20(1−cos(s/20)))` from the original circular cut centre. At pitch 8 mm the three centres are approximately (17.788367,11.578780), (24.347122,16.065866) and (28.640782,22.752845) mm. Both pitches retain a strict single shell of genus 5 with 18 faces and 28 loops. All eight inward native cylinder halves and both sets of exact circular cap openings retain R2. The later rectangular walls and original cylinder identities remain. The volume is `23920−160π = 23417.345175425635 mm³`. The centroids at pitches 8 and 9 are (30.224150056,20.142771263,5) and (30.207492921,20.117113889,5) mm.
- **PASS, affected checks.** The 41 focused native tests check strict topology, every pcurve, old straight and rectangular path behaviour, a single circular source and Count 1, malformed and unsupported curves and atomic refusals. The 16 focused Model action and native file tests use the existing certified Sketch curve producer. Two scratch mutants restore the old straight-only gate or bypass circular clearance. The focused native oracle detects both. Kernel library build, Model and Studio types, Studio production build, scoped ESLint and diff check passed.
- **FAIL, first Model fixture.** An uncertified synthetic curve went through nine-decimal source serialization and lost the exact middle weight. The Model fixture now uses the same canonical outline producer as Studio.
- **FAIL, existing code-shape baseline.** The checker reports the same five B-rep files and exact counts on the pinned base and current sources. None of those files changed in this delivery.
- **NOT_RUN.** General polynomial or mixed curves for the earlier circular source, arbitrary subsequent source histories, more remote callers, full local suites and mobile. #25 remains open. First mechanical CAD is 8/10 accepted. Whole-product completion is unmeasured.

```sh
D1931_SOURCE_FROZEN=1 node apps/cad-studio/test/prior-circular-path-cut-pattern-browser.mjs "$OUT/baseline" --baseline --quarter
D1931_SOURCE_FROZEN=1 node apps/cad-studio/test/prior-circular-path-cut-pattern-browser.mjs "$OUT/studio" --quarter
D1911_SOURCE_FROZEN=1 node apps/cad-studio/test/prior-circular-path-cut-pattern-browser.mjs "$OUT/straight"
pnpm --filter @barocss/cad build:library
node --test packages/barocss-cad/test/{prior-circular-path-cut-pattern,prior-path-cut-pattern,curve-cut-pattern,three-cut-feature-pattern}.test.mjs
node packages/barocss-cad-model/scripts/test.mjs rectangular-feature-pattern-source
pnpm --filter @barocss/cad-model type-check
pnpm build
git diff --check
```
