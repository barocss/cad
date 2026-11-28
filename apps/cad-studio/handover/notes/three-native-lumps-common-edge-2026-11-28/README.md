# D2182 — Separate three closed solids along a shared edge

P1 [row 16](../../roadmap-rows/16.md) and [row 30](../../roadmap-rows/30.md) · [#7](https://github.com/barocss/cad/issues/7) · Base `2d3cf0072b29efc43bd2eb85b180a9f02cd24922`.

Original seed 20261023 case 4 already fails at the third 120° circular copy. All six uses of the common edge belong to three components, connected separately through their other edge pairs. Each component contributes one forward use and one reversed use. The stitcher now gives each such component its own copy of the common edge. A component with more than one pair at that edge still follows the existing non-manifold refusal.

## Verification

- **FAIL, reproduced baseline.** Studio Union of a source box and a disjoint sphere succeeds. The following three-copy circular pattern refuses while preparing its preview and identifies the edge with six uses. The accepted Union stays intact.
- **PASS, actual desktop Studio.** The same pattern returns a single history output with three box solids and three sphere solids. Each has one strict closed shell and genus zero. The total volume is 220.5309649148725 mm³ and the centroid is [0, 0, −1] mm. The independent volume is 120 + 32π mm³. Undo returns the original Union and Redo returns the pattern. Browser-project Save, Close, reload and Open preserve the exact document and native digest. Both desktop runs kept 1,289 source files unchanged with no page or console errors and no downloads.
- **PASS, native original case.** Seed 20261023 case 4 yields 18 strict genus-zero solids and volume about 789.243668 mm³. It lies within the original independent oracle's 789.407648 ± 3.916981 mm³. Separate candidate trials with three and four steps agree within 4e−9 mm³. The existing two-lump cases and the self-touch controls at cases 56 and 114 preserve their original behaviors. Case 49 still refuses during a later linear pattern.
- **PASS, affected checks.** The full seed 20261023 rerun gives 190 OK, 10 REFUSED, zero WRONG, zero INVALID, zero crashes and zero timeouts. Case 4 moves from REFUSED to OK. Case 49 reaches the later refusal and the other nine diagnostics match. The 43 focused Boolean tests, Kernel TypeScript, scoped ESLint and production Studio build also pass.
- **FAIL, inherited.** Every stage of the 202-case robustness corpus matches D2181, including the three boxed-Fillet exchange area mismatches. The broad code-shape findings and counts also match.
- **NOT_RUN.** Full candidate reruns of the other seeds, full commutativity audit, full local suites and mobile. #7 retains the broader acceptance. First mechanical CAD remains 8/10. Overall CAD and natural-language completion remain unmeasured.

```sh
node packages/barocss-cad/scripts/tool.mjs build:fast
node --test --test-concurrency=1 packages/barocss-cad/test/analytic-boolean.test.mjs packages/barocss-cad/test/boolean-*.test.mjs
THREE_LUMP_PATTERN_FROZEN=1 node apps/cad-studio/test/three-lump-circular-pattern-browser.mjs "$OUT/baseline" --baseline
THREE_LUMP_PATTERN_FROZEN=1 node apps/cad-studio/test/three-lump-circular-pattern-browser.mjs "$OUT/final"
node packages/barocss-cad/scripts/rb/fuzz.mjs --runs 200 --seed 20261023 --jobs 1
node packages/barocss-cad/scripts/rb/run.mjs robustness/corpus --jobs 1 --out "$OUT/robustness.jsonl"
node packages/barocss-cad/scripts/code-shape.mjs --check
```
