# D2181 — Refuse an invalid sphere-cylinder Difference

P0 [row 16](../../roadmap-rows/16.md) and [row 30](../../roadmap-rows/30.md) · [#7](https://github.com/barocss/cad/issues/7) · Base `e75e47eac86cf5f7f605ff4d2fcc1553a0c075e1`.

The four original Boolean seeds at 200 cases each give 762 OK, 37 REFUSED and one INVALID. No case reports WRONG, CRASH or TIMEOUT. The invalid result takes priority over the manifold-answer refusals. Full seed 20261025 case 137 has valid inputs at `n7` and `n9`. Difference `n6` is the first invalid output and Union `n0` carries the invalid edge into the final result.

The reduced fixture subtracts a radius 2 mm through-cylinder from a radius 3 mm sphere with a 1 mm axis offset. The retained solid touches itself at [2, −2, −5] mm. Near the point, the sphere and the outside of the cylinder leave a gap between two quadratic surfaces on opposite sides of the axis-normal direction. Those two local pieces connect elsewhere in the same retained body. The full seed removes one side of the cutter with a flat wall at the same point, and the remaining material still pinches there. The final Union has no material at the pinch that closes it.

Difference strictly checks its output if a recognized spherical support and a cylinder supplied a clipped cut. Invalid output returns a typed geometry refusal before a result can enter Studio history. The check uses the existing native tolerance and geometry rules.

## Verification

- **FAIL, inherited baseline.** The reduced case returns an invalid solid on the exact base and the pre-D2178 comparison. Both baseline evaluators report the same eight issues and maximum edge-to-surface gap 7.66235e−5 mm. Actual Studio accepted the invalid Difference and exposed it in History. The full seed's first invalid output has maximum gap 4.59603e−5 mm.
- **PASS, native targeted checks.** The reduced input refuses at `n0` and the complete seed refuses at `n6`. The full 20261025 seed rerun gives 189 OK, 11 REFUSED, zero INVALID, zero WRONG and zero crashes. The other ten refusals retain their case IDs and diagnostics. Independent disk intersection integration gives 53.267498993 and 52.965818544 mm³ for the ±0.01 mm offsets. Both native controls are strict valid and match within 2e−6 mm³. Separate candidate comparisons at ±0.001 mm also match the prior native results.
- **PASS, actual desktop Studio.** The operation reports the native validity failure. Both original solids retain their volumes of 36π and 24π mm³. Undo and Redo availability, the accepted document, and browser-project Save, Close, reload and fresh Open preserve the original part. The desktop flow froze 1,288 source files with no page or console errors, downloads or source changes.
- **PASS, affected checks.** 42 focused Boolean tests, Kernel TypeScript, scoped ESLint and the production Studio build.
- **FAIL, inherited.** The same three boxed-Fillet exchange area mismatches remain in the 202-case robustness corpus. Every case stage matches D2180. The broad code-shape checker has the same eight findings and counts.
- **NOT_RUN.** Candidate reruns of the other three seeds, general sphere-cylinder topology certification, full local tests and mobile. The first mechanical CAD baseline remains 8/10. Overall CAD and natural-language completion remain unmeasured.

```sh
node packages/barocss-cad/scripts/tool.mjs build:fast
node --test --test-concurrency=1 packages/barocss-cad/test/analytic-boolean.test.mjs packages/barocss-cad/test/boolean-*.test.mjs
SPHERE_TANGENT_BORE_FROZEN=1 node apps/cad-studio/test/sphere-tangent-bore-browser.mjs "$OUT/baseline" --baseline
SPHERE_TANGENT_BORE_FROZEN=1 node apps/cad-studio/test/sphere-tangent-bore-browser.mjs "$OUT/final"
node packages/barocss-cad/scripts/rb/fuzz.mjs --runs 200 --seed 20261025 --jobs 1
node packages/barocss-cad/scripts/rb/run.mjs robustness/corpus --jobs 1 --out "$OUT/robustness.jsonl"
node packages/barocss-cad/scripts/code-shape.mjs --check
```
