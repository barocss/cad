# D2190 — Classify a cylinder notch tangent to two stock walls

P1 [row 16](../../roadmap-rows/16.md) and [row 30](../../roadmap-rows/30.md) · [#7](https://github.com/barocss/cad/issues/7) · [#9](https://github.com/barocss/cad/issues/9) · Base `e890f479134643e9f26def9403f4ec0482fc6f4c`.

Seed 20261023 case 56 refuses analytic Difference at n1. The relevant stock spans [−8, 0] × [−3, 0] × [−2, 6] mm. The cutter is a radius 2 mm cylinder centred at x = −2 mm and y = −2 mm with z from 1 to 5 mm. Its circle crosses y = −3 mm and touches y = 0 mm and x = 0 mm. Near each tangent point, the material regions on either side of the contact connect through the uncut stock at z = 0 mm. The contact is a line of self-contact in one connected result. Retain the typed refusal and classify it under #9 for the #7 acceptance count.

The separate cutter box retains the analytic route in the Studio reduction. An upright-only reduction instead uses the existing D195 prismatic route. Its strict native report passes, while the mesh has two four-use edges covered by the existing crescent classifier. This is the D195 compatibility boundary recorded in [D2188](../prismatic-crescent-compatibility-2026-11-28/README.md).

## Verification

- **PASS, independent geometry and native route.** The original analytic case and the reduced analytic route both refuse the exact contact. Radii 1.99 and 2.01 mm produce valid closed results on both sides of that contact. Independent circular-segment calculation gives reduced volumes of 151.895971659 and 151.247135603 mm³, respectively. The upright D195 case measures 151.561475131 mm³ and retains the known mesh contact.
- **PASS, actual desktop Studio.** Both original inputs pass strict validation. The exact radius 2 mm Subtract refuses and preserves the input document. Radius 1.99 mm gives one strict-valid solid of 151.895971659 mm³. Undo, Redo and Save, Close, reload and fresh Open preserve the exact accepted document and native digest. No page errors, console errors, downloads or source changes occur.
- **NOT_RUN.** Explicit non-manifold production support, full local suites and mobile. No runtime source is changed. First mechanical CAD remains 8/10. Overall CAD and natural-language completion remain unmeasured.

```sh
node "$OUT/physical-oracle.mjs"
node "$OUT/route.mjs"
TANGENT_WALL_D2190_FROZEN=1 node "$OUT/tangent-wall-difference-browser.mjs" "$OUT/desktop"
git diff --check
```
