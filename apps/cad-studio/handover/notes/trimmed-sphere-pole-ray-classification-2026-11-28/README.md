# D2185 — Classify a Boolean ray past an excluded sphere pole

P1 [row 16](../../roadmap-rows/16.md) and [row 30](../../roadmap-rows/30.md) · [#7](https://github.com/barocss/cad/issues/7) · Base `d490f17b09a601b0964268e3722cc243c2c858a1`.

Seed 20261023 case 158 refuses Intersect at feature n5. Its cylinder cap sample [−1, −3, −2] mm coincides with the carrier sphere's south pole. The cut hollow box starts at z = 0 mm. The pole is outside the actual face. Newton's singular derivative invalidates the classification ray before the ordinary face-region test runs.

Retain the ray when its singular hit reaches a recorded surface pole within the existing solve tolerance, and the fixed chart coordinate excludes the whole collapsed side by the existing 20-tolerance classification margin. The varying coordinate can take more than one value at the pole. The original cut face has a pole coordinate of 9.364045457 and a padded chart upper bound of 5.919445034. Continue testing other candidates and faces. A true retained pole or an unresolved tangent keeps the earlier degenerate result.

## Verification

- **FAIL, reproduced baseline.** Actual desktop Studio refuses the Intersect and retains both source outputs. Both input native results pass strict validation. The reduced and original native cases refuse in both orders.
- **PASS, actual desktop Studio.** Both pick orders return one strict solid of 4.5 mm³ with centroid [3.5, −0.25, 3.5] mm. The cylinder contributes zero positive volume. The box and the remaining shell overlap in x = [2, 5], y = [−0.5, 0], z = [2, 5] mm, which gives the exact result. Undo and Redo preserve the source and result documents. Save, Close, reload and fresh Open preserve the result's native digest. No page errors, console errors, downloads or source changes occurred.
- **PASS, native and independent checks.** The full original returns 150.782290387 mm³, within 2.04e−7 mm³ of the independent 262144-panel section integral. The centroid agrees within 5e−9 mm. The two unique circular copies contribute 48π mm³ before the cone removes 4.514157189 mm³. The wall adds 4.5 mm³. External classifier controls retain real sphere-pole degeneracy, forward tangency and shell/cavity classification. The 45 focused Boolean tests, kernel types, lint and Studio build pass.
- **PASS, affected seed.** Seed 20261023 gives 192 OK and eight typed refusals in 200 cases. No WRONG, INVALID, CRASH or TIMEOUT outcomes occur. Case 158 is the only change in the refusal list.
- **FAIL, inherited broad checks.** All 202 corpus case stages and details agree with D2183, including the three inherited boxed-Fillet STEP area findings. The code-shape check retains the same eight existing findings.
- **NOT_RUN.** Full local suites, the remaining seeds, the full commutativity audit and mobile. First mechanical CAD remains 8/10. Overall CAD and natural-language completion remain unmeasured.

```sh
node "$OUT/physical-oracle.mjs"
node --test --test-concurrency=1 packages/barocss-cad/test/analytic-boolean.test.mjs packages/barocss-cad/test/boolean-*.test.mjs
HOLLOW_WALL_INTERSECT_FROZEN=1 node "$OUT/hollow-wall-intersect-browser.mjs" "$OUT/baseline" --baseline
HOLLOW_WALL_INTERSECT_FROZEN=1 node "$OUT/hollow-wall-intersect-browser.mjs" "$OUT/final"
tsc --noEmit -p packages/barocss-cad
pnpm exec eslint packages/barocss-cad/src/brep/analytic-boolean.ts packages/barocss-cad/test/analytic-boolean.test.mjs
pnpm --dir apps/cad-studio exec vite build --outDir "$OUT/studio-dist"
node packages/barocss-cad/scripts/code-shape.mjs --check
node packages/barocss-cad/scripts/rb/run.mjs robustness/corpus --jobs 1 --out "$OUT/robustness.jsonl"
node packages/barocss-cad/scripts/rb/fuzz.mjs --runs 200 --seed 20261023 --jobs 1
```
