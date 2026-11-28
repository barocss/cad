# D2186 — Keep a cone tip when opposite sphere and cone seams meet

P1 [row 16](../../roadmap-rows/16.md) and [row 30](../../roadmap-rows/30.md) · [#7](https://github.com/barocss/cad/issues/7) · Base `02770885bddc8254ff7d558b449e46658aead128`.

Seed 20261023 case 30 refuses Union of a cone and sphere at feature n7. The radius 1 mm, height 5 mm cone starts at [−2, −2, −2] mm. The radius 4 mm sphere is centered at [−3, −2, −1] mm. The two surfaces intersect in one closed transverse curve. In an opposing patch pair the seed lies on both patch boundaries. One marching direction leaves the first patch and the opposite direction leaves the second. A large failed correction makes the current boundary recovery refuse before neighboring patches can supply the curve.

When this specific bracket refusal occurs, verify the native sphere and cone half-turn control nets, including the interior control points, weights and knots. The positive-weight hulls lie on opposite sides of their meridian plane within binary64 roundoff. In that plane, two finite cone generators cross the sphere's circle at two isolated transverse points, away from all endpoints and poles. That pair supplies no interior curve. Other pairs still trace normally, and the final body must pass strict validation.

## Verification

- **FAIL, reproduced baseline.** Actual desktop Studio refuses the original n7 Union without replacing either source output. Both inputs pass strict validation. Native reproduction refuses in both orders.
- **PASS, actual desktop Studio.** Both operand orders yield one strict genus-zero solid with its original apex. The result gives 268.082659077 mm³ and 0.000085970773 mm³ above the sphere volume. Independent analytic disk-section integration gives 0.000086269314 mm³ above the sphere. Undo and Redo preserve both exact documents, and Save, Close, reload and fresh Open preserve the native result digest. No page errors, console errors, downloads or source changes occurred.
- **PASS, native and comparative checks.** Full case volume is 152.979270450 mm³, within the original independent volume and centroid tolerances. The 47 Boolean and surface intersection tests, types, lint and Studio build pass. The 17 direct certificate controls cover odd control points, knot and weight changes, real overlap beyond roundoff, non-cardinal axes, a pole/apex coincidence and near tangency.
- **PASS, affected seed.** Seed 20261023 gives 193 OK and seven typed refusals in 200 cases. No WRONG, INVALID, CRASH or TIMEOUT outcomes occur. Case 30 is the only change in the refusal list.
- **FAIL, inherited broad checks.** The 202-case corpus reproduces the same three boxed-Fillet STEP area findings and all other stage results from D2185. Code-shape reports the same eight existing findings.
- **NOT_RUN.** Full local suites, the remaining seeds, the full commutativity audit and mobile. First mechanical CAD remains 8/10. Overall CAD and natural-language completion remain unmeasured.

```sh
node "$OUT/physical-oracle.mjs"
node --experimental-strip-types "$OUT/production-seam-controls.mts"
node --test --test-concurrency=1 packages/barocss-cad/test/analytic-boolean.test.mjs packages/barocss-cad/test/boolean-*.test.mjs packages/barocss-cad/test/surface-intersection-boundary-seed.test.mjs
CONE_SPHERE_UNION_FROZEN=1 node "$OUT/cone-sphere-union-candidate-browser.mjs" "$OUT/final"
tsc --noEmit -p packages/barocss-cad
pnpm exec eslint packages/barocss-cad/src/brep/analytic-boolean.ts packages/barocss-cad/src/brep/sphere-cone-seams.ts packages/barocss-cad/test/analytic-boolean.test.mjs
pnpm --dir apps/cad-studio exec vite build --outDir "$OUT/studio-dist"
node packages/barocss-cad/scripts/code-shape.mjs --check
node packages/barocss-cad/scripts/rb/run.mjs robustness/corpus --jobs 1 --out "$OUT/robustness.jsonl"
node packages/barocss-cad/scripts/rb/fuzz.mjs --runs 200 --seed 20261023 --jobs 1
```
