# D2189 — Classify contact between a cylinder and a connected box wall

P1 [row 16](../../roadmap-rows/16.md) and [row 30](../../roadmap-rows/30.md) · [#7](https://github.com/barocss/cad/issues/7) · [#9](https://github.com/barocss/cad/issues/9) · Base `23423ef5aa87cd9f0c83c939fdd08590678de524`.

Seed 20261023 case 15 refuses Union at feature n8 near [2.4721, 1, −1] mm. The cylinder runs along X with radius 1 mm and axis y = 1 mm, z = −2 mm. It touches the ordinary box's bottom plane along y = 1 mm, z = −1 mm. The rounded box ends at x = 2 mm. Around [2.5, 1, −1] mm it cannot fill the gap between the two local material regions.

The two regions belong to one globally connected solid. The point [1.25, 1.75, −2] mm lies in the strict interior of both the cylinder and rounded box. The point [1.25, 2, −0.5] mm lies in the strict interior of both the rounded and ordinary boxes. A segment inside the convex rounded box joins the witnesses. Retain the typed refusal for the same solid touching itself along a line. Classify the case under #9 for the #7 acceptance count.

## Verification

- **PASS, native classification.** Both native inputs are strict valid. The original full case and the reduced Union refuse, with the reduced refusal reproduced in both operand orders. Moving the cylinder down 0.01 mm creates a gap to the ordinary box while retaining the connection through the rounded box. Moving it up 0.01 mm creates positive overlap. Both controls pass strict validity in both orders. The 262144-panel physical section integral agrees with the native volume within 1.3e-12 mm³.
- **PASS, actual desktop Studio.** The exact case refuses and preserves the two input outputs and exact document. The −0.01 mm control applies as one strict native solid of 345.515927484 mm³. Undo, Redo and Save, Close, reload and fresh Open preserve the exact result and native digest. No page errors, console errors, downloads or source changes occurred.
- **NOT_RUN.** Explicit non-manifold output, full local suites and mobile. This classification changes no runtime code. First mechanical CAD remains 8/10. Overall CAD and natural-language completion remain unmeasured.

```sh
node "$OUT/probe.mjs"
node "$OUT/physical-oracle.mjs"
WALL_CYLINDER_UNION_FROZEN=1 node "$OUT/wall-cylinder-union-browser.mjs" "$OUT/baseline"
WALL_CYLINDER_UNION_FROZEN=1 node "$OUT/separated-wall-cylinder-union-browser.mjs" "$OUT/control"
```
