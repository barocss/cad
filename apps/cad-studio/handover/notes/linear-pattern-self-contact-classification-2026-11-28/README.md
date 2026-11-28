# D2184 — Classify the remaining seeded Linear Pattern refusal

P1 [row 16](../../roadmap-rows/16.md) and [row 30](../../roadmap-rows/30.md) · [#7](https://github.com/barocss/cad/issues/7) · [#9](https://github.com/barocss/cad/issues/9) · Base `24f23f330ce41c33bede9f44a2fff3fa50e89ef2`.

Seed 20261023 case 49 passes the inner Circular Pattern after D2182. The outer Linear Pattern uses X spacing −2 mm and Count 4. Its first pair of copies reaches four edge uses along x = −4 mm, y = 2 mm and z ∈ [−9, −2] mm. The four uses attach to one connected face component through ordinary two-use edges.

The lower layer contains only the 2 × 7 mm rectangular prisms. Each set of three rectangles rotates through 0°, 120° and 240° about its translated pivot. An independent check uses inverse rotations and strict rectangle interiors to establish a connected overlap and face-weld graph. At the leftmost pivot, the occupied sectors are [330°, 540°] and [210°, 300°], giving two local material regions separated by gaps of 30° each. All other rectangles stay at least 1 mm from this pivot. The final copy fills the original diagnostic location. The final set still has the same self-contact at x = −8 mm, y = 2 mm and z ∈ [−9, −2] mm. The rounded upper features lie at z ∈ [0, 3] mm.

Retain the typed refusal under the existing manifold-solid contract. Classify this case under #9 when counting the #7 requirements. Splitting the four uses into two coincident edges would leave the connection elsewhere in the same solid.

## Verification

- **PASS, independent geometry and native reproduction.** Two and four copies each have one connected lower layer with two local material sectors at the leftmost pivot. The lower-layer volume is 490 mm³ for two copies and 841.585481157 mm³ for four. The kernel reproduces the four-use refusal at both counts. The prior six-body circular result passes strict native checks.
- **PASS, actual desktop Studio.** Open the original circular prefix. Select its output and choose Pattern → Linear pattern, Direction X, Result One body, Count 4 and Spacing −2 mm. Apply remains disabled. Cancel retains the exact source. As a control, Spacing −30 mm previews and applies, with 24 strict native solids and volume 1888.274333882 mm³, four times the source volume of 472.068583471 mm³. Undo and Redo preserve both exact documents. Undo, Save, Close, reload and fresh Open preserve the original native digest. No page errors, console errors, downloads or source changes occurred.
- **NOT_RUN.** Explicit non-manifold output, full local suites, and mobile. This classification changes no runtime code. First mechanical CAD remains 8/10. Overall CAD and natural-language completion remain unmeasured.

```sh
node "$OUT/physical-oracle.mjs"
node "$OUT/probe.mjs"
LINEAR_PATTERN_PINCH_FROZEN=1 node "$OUT/linear-pattern-pinch-browser.mjs" "$OUT/desktop"
```
