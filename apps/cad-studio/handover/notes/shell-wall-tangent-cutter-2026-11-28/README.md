# D2191 — Classify a cutter tangent to the outside of a shell wall

P1 [row 16](../../roadmap-rows/16.md) and [row 30](../../roadmap-rows/30.md) · [#7](https://github.com/barocss/cad/issues/7) · [#9](https://github.com/barocss/cad/issues/9) · Base `b80cbfe9811020aa39923163206d85c6d2de6930`.

Seed 20261023 case 85 refuses Difference at n9. A 1 mm radius cutter centred at [2, 0] mm and spanning z = 2 to 6 mm touches the shell's outer wall at y = 1 mm. Local material witnesses [1.9, 0.9975, 4.5] and [2.1, 0.9975, 4.5] mm lie in the front wall and outside the cutter. The two lobes connect above the cutter. The boundary touches itself, so the typed analytic refusal belongs to #9.

An upright construction of the same part takes the existing D195 prismatic route. Its cap fails the strict check and one mesh edge has four uses. The existing crescent classifier recognizes this result. See the compatibility decision in [D2188](../prismatic-crescent-compatibility-2026-11-28/README.md).

## Verification

- **PASS, native and independent geometry.** The original and analytic reduction refuse the exact tangent case. Radii 0.99 and 1.01 mm give strict-valid, watertight solids across the tested routes. Independent section integration gives 83.976953975 and 83.815079305 mm³.
- **PASS, actual desktop Studio.** The exact 1 mm radius Subtract refuses and preserves the source document. Radius 0.99 mm applies as one strict-valid solid of 83.976953975 mm³. Undo and Redo restore the exact documents. Save, Close, reload and fresh Open retain the native digest. No page errors, console errors, downloads or source changes occur.
- **PASS, first seed dispositions.** The D2187 200-case run has six typed refusals. D2189 covers case 15, D2184 covers 49, D2190 covers 56, this decision covers 85, D2188 covers 92, and the existing D275 regression covers 114. D275 passed again in this checkout for both Union orders of the case 114 reduction.
- **NOT_RUN.** Other seed audits, full commutativity, mixed facet acceptance, full local suites and mobile. #7 remains open. This decision changes no runtime code. First mechanical CAD remains 8/10. Overall CAD and natural-language completion remain unmeasured.

```sh
node "$OUT/physical-oracle.mjs"
node "$OUT/probe.mjs"
SHELL_TANGENT_D2191_FROZEN=1 node "$OUT/shell-tangent-difference-browser.mjs" "$OUT/desktop"
node --test --test-name-pattern='a union whose parts touch along a line from outside' packages/barocss-cad/test/commute-k16-findings.test.mjs
git diff --check
```
