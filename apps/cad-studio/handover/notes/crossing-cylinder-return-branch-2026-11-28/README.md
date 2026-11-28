# D2187 — Keep the return branch of a partial cylinder crossing

P1 [row 16](../../roadmap-rows/16.md) and [row 30](../../roadmap-rows/30.md) · [#7](https://github.com/barocss/cad/issues/7) · Base `be8511821a90f933f326b29d159f671d3ef7d94c`.

Seed 20261023 case 53 refuses Difference at a one-use edge after the tool's lower cap crosses a partial cylinder loop. A valid trim point with normalized parameter 0.9942372404 is [6.0605772746, −1.1013251518, −0.469] mm. The closed-loop trim lookup chooses the other end near parameter 0. The evaluated point misses by 0.157311464 mm. The remaining cut stops near the loop's angular extremum and fails to divide the stock wall.

Supply the same analytic partial-loop carrier over two open parameter intervals. This keeps both square-root branches available to trim lookup, including the return to the loop's starting point. Retain the existing generic closed-curve ownership rule and tolerances.

## Verification

- **FAIL, reproduced baseline.** The original two cylinders are valid. Actual desktop Studio rejects Subtract with the one-use edge diagnostic and retains the two inputs. The full seeded Difference reproduces the same open result.
- **PASS, actual desktop Studio.** Subtract produces one strict native solid of 92.935643759 mm³. Independent convex-polygon section integration gives 92.935643681 mm³ and centroid [3.401958802, 0.423248069, 0.198190466] mm. Undo, Redo and Save, Close, reload and fresh Open retain the exact source or result document and native digest. No page errors, console errors, downloads or source changes occurred.
- **PASS, native and related controls.** The full seeded result is strict valid at 122.314165397 mm³, within the original independent volume and centroid tolerances. Four upright tool positions across three Boolean operations and two input orders give 24 controls. The 18 previously supported cases keep strict validity, volume within 1e−6 mm³ and centroid within 1e−7 mm. The six previously refused cases at position 2 now return strict solids. The 48 focused tests, types, lint and Studio build pass.
- **PASS, affected seed.** Seed 20261023 gives 194 OK and six typed refusals in 200 cases. No WRONG, INVALID, CRASH or TIMEOUT outcomes occur. Case 53 is the only change in the refusal list.
- **FAIL, inherited broad checks.** The 202-case corpus reproduces the same three boxed-Fillet STEP area findings and all other stage results from D2186. Code-shape reports the same eight existing findings.
- **NOT_RUN.** Full local suites, other seeds, full commutativity and mobile. First mechanical CAD remains 8/10. Overall CAD and natural-language completion remain unmeasured.

```sh
node "$OUT/physical-oracle.mjs"
node --test --test-concurrency=1 packages/barocss-cad/test/analytic-boolean.test.mjs packages/barocss-cad/test/boolean-*.test.mjs packages/barocss-cad/test/surface-intersection-boundary-seed.test.mjs
UPRIGHT_CYLINDER_DIFFERENCE_FROZEN=1 node "$OUT/upright-cylinder-difference-browser.mjs" "$OUT/baseline"
UPRIGHT_CYLINDER_DIFFERENCE_FROZEN=1 node "$OUT/upright-cylinder-difference-candidate-browser.mjs" "$OUT/final"
tsc --noEmit -p packages/barocss-cad
pnpm exec eslint packages/barocss-cad/src/brep/analytic-boolean.ts packages/barocss-cad/test/analytic-boolean.test.mjs
pnpm --dir apps/cad-studio exec vite build --outDir "$OUT/studio-dist"
node packages/barocss-cad/scripts/code-shape.mjs --check
node packages/barocss-cad/scripts/rb/run.mjs robustness/corpus --jobs 1 --out "$OUT/robustness.jsonl"
node packages/barocss-cad/scripts/rb/fuzz.mjs --runs 200 --seed 20261023 --jobs 1
```
