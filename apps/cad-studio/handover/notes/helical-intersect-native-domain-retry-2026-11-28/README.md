# D2178 — Recover the original helical Intersect

P1 [row 16](../../roadmap-rows/16.md) and [row 30](../../roadmap-rows/30.md) · [#7](https://github.com/barocss/cad/issues/7) · Base `8be9c1dfe90ef34cba2017cfbe01e0f828841c10`.

The sampled inverse face chart overshoots near a steep flank and loses a closed region. Direct evaluation of the existing Newton projection recovers that region and passes stitching without endpoint bridges. Intersect retries with direct domain maps once after an edge-incidence fault when an actual clipped march between two general surfaces supplied a cut. A retry must return a nonempty, strict and closed B-rep. The original refusal remains available for a failed retry. The first-pass success path, tolerances and face-source receipt contract stay in place.

The first oracle assumed one solid. Independent involute sections at 480 axial levels locate two long-lived overlap components with volumes of approximately 14.66826 and 9.48208 mm³. They occupy disjoint Y ranges on opposite sides of Y = −1 mm. The conservative chord and axial motion bounds leave at least 1.020365 mm between the ideal gear sections on that plane over the full face width. The native shells' conservative control hulls also lie on opposite sides of the plane. Only the assumed count and topology in the fixture change. The original volume value, centroid and acceptance tolerances stay in place.

## Verification

- **PASS, native and independent.** Original input pair and generated transverse controls at zero phase clear. Independent analytic profile integration at 240 axial levels gives 24.150350573 mm³ for the 3° original pair. The 120-level result differs by 0.000257114 mm³. The existing fixture target remains 24.1495 mm³ within 0.1% and centroid [19.14239, −0.33067, 3.07265] mm within 0.005 mm per axis. Both native orders match at 24.148699792 mm³ and [19.142386682, −0.330647234, 3.072668741] mm, with two strict genus-zero shells. They carry 37 and 36 native edges because one boundary has an extra subdivision in one order.
- **PASS, actual desktop Studio.** Both pick orders returned the two pieces and preserved the original editable source nodes. Undo restored both original gears. Redo and browser-project Save, Close, reload and fresh Open restored the exact accepted document and native result. The run recorded 1,288 unchanged source files and no page errors, console errors or downloads.
- **PASS, focused controls.** Six helical tests and 41 Boolean tests, Kernel and Studio TypeScript checks, scoped ESLint and the Studio production build. The independent spur control gives 20.241500607 mm³ and the direct-chart retry gives 20.240261832 mm³ in both orders. The zero-phase control remains identical to the baseline. The internal native face-source receipt stays complete through a successful retry. The original helical corpus now passes all six stages, including tessellation and exchange roundtrip. Its obsolete refusal leaves the known-failure list.
- **FAIL, prior paths.** The original Intersect refused in both orders. D2174's endpoint bridges left 13 unmatched uses each. A separate temporary endpoint relocation reduced that to six; direct projection recovered the complete result without those endpoint changes. The identical full gear self-Intersect still has its original refusal.
- **FAIL, inherited.** The 202-case robustness corpus reports 1,138 OK, four REFUSED, one KNOWN and three WRONG stages. The three boxed-Fillet roundtrip area mismatches are identical on the exact base in the same runner. The broad code-shape report has the same eight findings and counts as the base.
- **NOT_RUN.** Full seeded fuzz and commutativity audit, full local tests and mobile. #7 retains its other acceptance. The first mechanical CAD baseline is 8/10. Overall CAD and natural-language completion remain unmeasured.

```sh
node packages/barocss-cad/scripts/tool.mjs build:fast
node --test packages/barocss-cad/test/gear-helical.test.mjs
node --test --test-concurrency=1 packages/barocss-cad/test/analytic-boolean.test.mjs packages/barocss-cad/test/boolean-*.test.mjs
HELICAL_PAIR_FROZEN=1 node apps/cad-studio/test/helical-intersection-refusal-browser.mjs "$OUT/studio" --intersect
node packages/barocss-cad/scripts/rb/run.mjs robustness/corpus --jobs 1 --out "$OUT/robustness.jsonl"
node "$OUT/compare-baseline.mjs" "$OUT"
node packages/barocss-cad/scripts/code-shape.mjs --check
node "$OUT/involute-overlap.mjs"
node "$OUT/involute-connectivity.mjs"
node "$OUT/involute-separating-plane.mjs"
```
