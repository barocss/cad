# D2179 — Intersect exactly coincident native gear solids

P1 [row 16](../../roadmap-rows/16.md) and [row 30](../../roadmap-rows/30.md) · [#7](https://github.com/barocss/cad/issues/7) · Base `81186e6cfb206b99650ee739821cfff6ada41479`.

Intersect recognizes two closed, single-shell native gear solids when their ordered boundary records agree exactly. Compare coordinates, native curve and surface coefficients, per-entity tolerances, orientations, parameter curves and all topology links by record position. This lets separately authored IDs refer to the same geometry. The identity result uses the original boundary with IDs for the new feature. Each output face has a complete source receipt with the matching face from both inputs.

## Verification

- **FAIL, reproduced baseline in Studio.** Two independently authored 18-tooth helical gears at the identical origin and angle refused Intersect in both selection orders with the same edge 116 incidence fault. Both inputs and history availability stayed intact.
- **PASS, actual desktop Studio.** Both orders produce one strict solid with 110 faces, 324 edges and 216 vertices. Its 6,729.533143424496 mm³ volume and centroid [0, 0, 3] mm match the original native part. Independent integration of the involute, root and tip boundaries gives 6,729.551724057286 mm³. Undo recovers both inputs. Redo and browser-project Save, Close, reload and Open restore the exact document and native digest. The 3° crossing regression still returns its two original overlap solids. The two successful flows each froze 1,289 source files and observed zero page errors, console errors, downloads or source changes.
- **PASS, focused checks.** Seven helical tests, 41 Boolean tests, Kernel TypeScript, scoped ESLint and the Studio build. The exact-source tests verify same-object and separately named inputs, complete two-operand provenance and unmodified inputs. Additional candidate checks in both pick orders cover a common rigid pose and 72 valid planar parameter curves preserved byte for byte. Independent baseline comparisons for a 1e−10 mm translation, a 1e−10 mm tooth-thickness change and a 0.001° rotation retain the existing refusal in each order.
- **FAIL, inherited.** Every stage result in the 202-case robustness corpus matches D2178. This includes the three inherited boxed-Fillet exchange area mismatches. The broad code-shape checker reports the same eight findings and counts.
- **NOT_RUN.** Broad coincidence across different record orders and parameterizations, general nonplanar parameter-curve fixtures, full seeded fuzz and commutativity, full local tests and mobile. #7 retains its other acceptance. First mechanical CAD remains 8/10. Overall CAD and natural-language completion remain unmeasured.

```sh
node packages/barocss-cad/scripts/tool.mjs build:fast
node --test packages/barocss-cad/test/gear-helical.test.mjs
node --test --test-concurrency=1 packages/barocss-cad/test/analytic-boolean.test.mjs packages/barocss-cad/test/boolean-*.test.mjs
HELICAL_PAIR_FROZEN=1 node apps/cad-studio/test/helical-intersection-refusal-browser.mjs "$OUT/baseline" --coincident
HELICAL_PAIR_FROZEN=1 node apps/cad-studio/test/helical-intersection-refusal-browser.mjs "$OUT/identity" --coincident --intersect
HELICAL_PAIR_FROZEN=1 node apps/cad-studio/test/helical-intersection-refusal-browser.mjs "$OUT/crossing" --intersect
node packages/barocss-cad/scripts/rb/run.mjs robustness/corpus --jobs 1 --out "$OUT/robustness.jsonl"
node packages/barocss-cad/scripts/code-shape.mjs --check
node "$OUT/gear-identity-oracle.mjs"
```
