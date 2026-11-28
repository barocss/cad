# D2180 — Union exactly coincident native gear solids

P1 [row 16](../../roadmap-rows/16.md) and [row 30](../../roadmap-rows/30.md) · [#7](https://github.com/barocss/cad/issues/7) · Base `b9a831f70536f2ff12e85ff947f662e70f5ef0a5`.

The exact native gear identity check from D2179 also serves Union. Two separately authored gear solids with equal geometry, topology and tolerance records produce one strict solid with the original boundary and both matching face sources. The check uses all placements as part of the geometry.

## Verification

- **FAIL, reproduced baseline.** The exact original same-pose gear pair refused Union in both orders at edge 116. Actual desktop Studio preserved both input gears and history availability.
- **PASS, actual desktop Studio.** Both pick orders return one solid of 6,729.533143424496 mm³ with centroid [0, 0, 3] mm, 110 faces, 324 edges and 216 vertices. Undo recovers both input gears. Redo and browser-project Save, Close, reload and fresh Open restore the exact document and native digest. The desktop flow froze 1,289 files and recorded no runtime errors, downloads or source changes.
- **PASS, native controls.** Seven helical tests, 41 Boolean tests, Kernel TypeScript, scoped ESLint and the Studio build. The same-object and separately authored Union and Intersect results pass strict native checks in either order and provide both source faces. The 80 mm translated Union control gives two strict result solids with twice the original native volume.
- **FAIL, inherited.** All 202 robustness-case stage results match D2179, including the three boxed-Fillet exchange area mismatches. The eight broad code-shape findings and their counts also match.
- **NOT_RUN.** General identity across different representations, full seeded fuzz and commutativity, full local suites and mobile. #7 remains open for the rest of its original acceptance. The first mechanical CAD baseline remains 8/10. Overall CAD and natural-language completion remain unmeasured.

```sh
node packages/barocss-cad/scripts/tool.mjs build:fast
node --test packages/barocss-cad/test/gear-helical.test.mjs
node --test --test-concurrency=1 packages/barocss-cad/test/analytic-boolean.test.mjs packages/barocss-cad/test/boolean-*.test.mjs
HELICAL_PAIR_FROZEN=1 node apps/cad-studio/test/helical-intersection-refusal-browser.mjs "$OUT/baseline" --coincident --union
HELICAL_PAIR_FROZEN=1 node apps/cad-studio/test/helical-intersection-refusal-browser.mjs "$OUT/union" --coincident --union --result
node packages/barocss-cad/scripts/rb/run.mjs robustness/corpus --jobs 1 --out "$OUT/robustness.jsonl"
node packages/barocss-cad/scripts/code-shape.mjs --check
```
