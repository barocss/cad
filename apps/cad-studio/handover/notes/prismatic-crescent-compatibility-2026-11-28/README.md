# D2188 — Record the existing prismatic internal-tangency contract

P0 investigation [row 16](../../roadmap-rows/16.md) and [row 30](../../roadmap-rows/30.md) · [#7](https://github.com/barocss/cad/issues/7) · [#9](https://github.com/barocss/cad/issues/9) · Base `ebec27182622460174773e70c27de19baac3988f`.

Seed 20261023 case 92 refuses its full mixed-body Difference at a four-use edge. The two-cylinder reduction uses parallel axes at [−1, −2] and [−2, −2] mm, radii 3 mm and 2 mm, and common cut height z ∈ [1, 3] mm. The centre distance equals the radius difference, so the blind cavity boundary touches the stock at [−4, −2] mm along that height. The shape has the same volume as a cut with a small positive wall thickness.

The reduced operation uses the prismatic Boolean and B-rep builder. The existing D195 contract admits this crescent and the current robustness runner recognizes its coincident edges. A strict B-rep check rejects the touching cap loop. The full mixed case continues to reject the non-manifold result.

Retain D195 for native project compatibility. Any change to the exact tangency admission requires an explicit compatibility decision for existing documents under #9. The external guard trial could refuse this result with the current tolerance and preserved the 17 valid controls in an 18-case matrix. It serves as evidence for that policy decision.

## Verification

- **FAIL, strict geometry for existing D195.** The cap loop touches itself at the original tangent. The standard validator accepts the B-rep and the existing crescent classifier identifies the two coincident edges from z = 1 mm to z = 3 mm.
- **PASS, actual desktop compatibility.** Studio applies Subtract at the exact contact, with 144.513262065 mm³ = 46π mm³. Undo and Redo preserve both documents. Save, Close, reload and fresh Open preserve the strict issue and exact native digest.
- **PASS, adjacent valid controls.** Moving the tool centre to x = −1.99 mm leaves a 0.01 mm wall and keeps the same analytic volume. The actual Studio result passes strict validation and preserves the result through history and fresh Open. The native x = −2.01 mm control yields a strict open-sided cut of 144.522456077 mm³. The pinned D195 prismatic test passes.
- **NOT_RUN.** Integrated policy change, new export qualification, full local suites and mobile. First mechanical CAD remains 8/10. Overall CAD and natural-language completion remain unmeasured.

```sh
TANGENT_CYLINDER_DIFFERENCE_FROZEN=1 node "$OUT/tangent-cylinder-difference-browser.mjs" "$OUT/desktop-legacy" --baseline
TANGENT_CYLINDER_DIFFERENCE_FROZEN=1 node "$OUT/tangent-cylinder-difference-browser.mjs" "$OUT/desktop-control"
TANGENT_CYLINDER_DIFFERENCE_FROZEN=1 node "$OUT/tangent-cylinder-bottom-scenes.mjs" "$OUT/desktop-bottom"
node --test --test-name-pattern='prismatic Booleans give valid' packages/barocss-cad/test/prismatic-solid.test.mjs
```
