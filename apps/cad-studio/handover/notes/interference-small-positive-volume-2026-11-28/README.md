# D2213 — Show small positive interference volumes

P0 [row 15](../../roadmap-rows/15.md) and [row 16](../../roadmap-rows/16.md) · [#771](https://github.com/barocss/cad/issues/771) · Base `a834d0d1b`.

The Interference row keeps its usual one-decimal rounding. When that display would show zero, it uses the existing quantity formatter on the raw volume. This shows small volumes in decimal or scientific notation. Detection, raw sorting and original pair ownership use the same values.

- **FAIL, original desktop.** A native overlap of 0.01000000000005219 mm³ displayed as 0 mm³. The genuine Worker replies were recorded without changes. Exact face contact had no overlap.
- **PASS, actual desktop.** The same Chrome 158.0.8127.89 Studio flow displayed 0.01 mm³, 0.3 mm³ and 999.7 mm³ for native overlaps of about 0.01, 0.3 and 999.71 mm³. Exact face contact still reported no overlap. Largest and Smallest sorted the raw volumes without rechecking. Enter selected the original two bodies. A new selected-pair run returned 0.01 mm³ and reset the order. Document contents remained equal. The passing run froze 704 sources and recorded zero page errors, console errors or downloads.
- **PASS, 11 focused tests.** The Inspector regression covers 0.01 mm³, the existing 0.3 mm³ display for 0.34 mm³, a scientific-notation fallback for 0.001 mm³, and existing partial and failure rows. Scoped lint, Studio type-check and whitespace passed.
- **NOT_RUN.** Full local suites and mobile. First mechanical CAD remains 8/10. Overall CAD and natural-language completion remain unmeasured.

```sh
bash "$OUT/run.sh" desktop-before --baseline
bash "$OUT/run.sh" desktop-fixed
pnpm --dir apps/cad-studio test interference-order interference-result measure-quantity-text
git diff --check
```
