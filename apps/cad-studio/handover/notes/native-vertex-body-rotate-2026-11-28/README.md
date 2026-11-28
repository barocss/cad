# D2219 — Start body Rotate at one native vertex

P5 [row 07](../../roadmap-rows/07.md) and [row 31](../../roadmap-rows/31.md) · [#629](https://github.com/barocss/cad/issues/629) · Base `2a24e1c52`.

Pick one current native vertex of a standalone solid and open Rotate. The command and gizmo use the picked point as their initial pivot. The feature stores editable numeric coordinates in its existing Rotate node. A body or face selection still starts at the body centre. A successful retry clears the prior selection refusal from the same command.

- **PASS, actual desktop.** The baseline refused Rotate when the corner was selected. The revised Studio showed the Rotate controls at `(4.125, −3.75, 18.375)` mm and placed the gizmo within 1 px of that point. Cancel kept the stock. Selecting two vertices refused. A valid retry cleared that notice and the ordinary face selection still used the body centre. A 30° Z rotation kept the pivot and 9,600 mm³ volume. All eight native vertices and the centroid `(16.445508, 14.910254, 12.375)` mm match the independent rigid transform. Undo, Redo and project Save → Close → reload → Open retained the result.
- **PASS, affected checks.** 11 Studio and 12 Model focused tests, scoped lint, both type checks, production Studio build and whitespace. Focused tests refuse unbound, copied, old-document, changed-mesh and multiple picks. The actual run reported no console errors.
- **FAIL, initial desktop checks.** The first applied screenshot retained the earlier refusal until the retry cleared it. A later driver expected a visible Z arc from an edge-on view. The final driver checks the actual visible gizmo origin.
- **NOT_RUN.** Agent vertex selection, arbitrary vertex deformation, other solids in this desktop flow, mobile and full local suites. #629 remains open for its broader acceptance. First mechanical CAD remains 8/10. Overall CAD and natural-language completion remain unmeasured.

```sh
bash "$OUT/desktop.sh" before --baseline
bash "$OUT/checks.sh"
bash "$OUT/desktop.sh" final
git diff --check
```
