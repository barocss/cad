# D2183 — Retain a short boundary supported by its cylinder

P1 [row 16](../../roadmap-rows/16.md) and [row 30](../../roadmap-rows/30.md) · [#7](https://github.com/barocss/cad/issues/7) · Base `985fe2ad4ab2793cb3f57cf48d802f17cf8cf3b5`.

Seed 20261023 case 131 fails when the final Difference reads a straight edge created by an earlier Union of a cone and a cylinder. The source Union passes strict validation. Its native edge is shared by the cone and cylinder and has an entity tolerance of 1e−6 mm. Across the line, the cylinder's chart coordinate changes by 1.1360e−4 mm. The physical line stays within 8.45e−10 mm of the cylindrical support, so the constant chart-coordinate rule for a generator does not apply.

For a straight edge with a nonconstant cylinder chart coordinate, check the minimum and maximum radial distances over the entire segment. A line inside the current support tolerance and a continuous chart window maps to a curve in the face chart with its original three-dimensional source line. Require strict result validation for a Boolean that used this mapping.

## Verification

- **FAIL, reproduced baseline.** Both inputs to Subtract pass native validation. Actual desktop Studio refuses the original reduced cut at the straight edge and retains both inputs.
- **PASS, actual desktop Studio.** Subtract applies to the reduced original part and yields one strict native solid of 105.318242709 mm³. Independent disk-section integration gives 105.318242750 mm³. Undo and Redo retain the exact input and result documents. Browser-project Save, Close, reload and fresh Open preserve the result digest. The flow has no page errors, console errors, downloads or source changes.
- **PASS, native original and controls.** The full case gives 432.906540239 mm³ and centroid [0.616407326, −0.354305006, −3.185959117] mm. The independent 512-grid oracle gives 432.904049868 ± 0.034920767 mm³ and agrees with the centroid within its measured bound. The original and reduced native results pass strict validity. Private projection controls preserve the exact axial line, accept a supported short chord, and refuse lines with the wrong radius, an out-of-tolerance interior, an axis crossing, or a discontinuous chart jump.
- **PASS, focused and comparative checks.** The 44 Boolean tests, kernel type check, scoped lint and Studio build pass. All stage results and details in the 202-case corpus agree with D2182.
- **PASS, affected seed.** Seed 20261023 gives 191 OK and nine typed refusals in 200 cases, with no WRONG, INVALID, CRASH or TIMEOUT outcomes. Case 131 is the only change in the refusal list.
- **FAIL, inherited broad checks.** The corpus retains three existing boxed-Fillet STEP area round-trip findings. The code-shape check has the same eight existing findings as D2182.
- **NOT_RUN.** Full candidate reruns of the other seeds, full commutativity audit, full local suites and mobile. #7 retains its broader acceptance. First mechanical CAD remains 8/10. Overall CAD and natural-language completion remain unmeasured.

```sh
node packages/barocss-cad/scripts/tool.mjs build:fast
node --test --test-concurrency=1 packages/barocss-cad/test/analytic-boolean.test.mjs packages/barocss-cad/test/boolean-*.test.mjs
tsc --noEmit -p packages/barocss-cad
pnpm exec eslint packages/barocss-cad/src/brep/analytic-boolean.ts packages/barocss-cad/test/analytic-boolean.test.mjs apps/cad-studio/test/cylinder-short-chord-browser.mjs
pnpm --dir apps/cad-studio exec vite build --outDir "$OUT/studio-dist"
CYLINDER_SHORT_CHORD_FROZEN=1 node apps/cad-studio/test/cylinder-short-chord-browser.mjs "$OUT/baseline" --baseline
CYLINDER_SHORT_CHORD_FROZEN=1 node apps/cad-studio/test/cylinder-short-chord-browser.mjs "$OUT/final"
node packages/barocss-cad/scripts/code-shape.mjs --check
node packages/barocss-cad/scripts/rb/run.mjs robustness/corpus --jobs 1 --out "$OUT/robustness.jsonl"
node packages/barocss-cad/scripts/rb/fuzz.mjs --runs 200 --seed 20261023 --jobs 1
node "$OUT/reduced-oracle.mjs"
```
