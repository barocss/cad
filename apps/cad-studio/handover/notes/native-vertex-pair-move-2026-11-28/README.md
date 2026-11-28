# D2221 — Place a solid from one native vertex to another

P5 [row 07](../../roadmap-rows/07.md) and [row 31](../../roadmap-rows/31.md) · [#629](https://github.com/barocss/cad/issues/629) · Base `8d0eceab8`.

Pick a native vertex and Shift-select another on a separate solid. Move uses the first pick as the source and the second coordinate as the destination. Its existing numeric fields and gizmo use the same displacement. The saved feature is an ordinary translation. The second body stays fixed.

- **PASS, actual desktop.** The baseline refused Move with two native picks. The revised tool moved `(14.25, −4.5, 8.125)` to `(32.75, −9.25, 11.625)` mm by `(18.5, −4.75, 3.5)` mm. The gizmo matched the destination within 1 px. Same-body picks refused and a valid retry cleared the refusal. Reversed pick order reversed the displacement. The ordinary body Move still began at its existing box corner with zero displacement. The source vertices, volume and centroid match an independent translation. The destination native B-rep matched byte for byte. Cancel, Undo, Redo and project Save → Close → reload → Open passed. The actual native-vertex Rotate control also passed.
- **PASS, affected checks.** 12 Studio and 12 Model focused tests, scoped lint, both type checks, production Studio build and whitespace. Focused evidence refuses copied, old-document, changed-mesh, same-body and reordered picks without a fresh proof.
- **FAIL, initial test fixtures.** A dependent translation consumed the original fixture body. A face-on synthetic pick lacked the required incident-edge witness. The first desktop driver read its view locator before opening the page. The test now uses the project's supported array API. Corrected unit, type and desktop runs passed.
- **NOT_RUN.** Placed assembly occurrences, linked point constraints, other modeling operations from #629, mobile and full local suites. First mechanical CAD remains 8/10. Overall CAD and natural-language completion remain unmeasured.

```sh
bash "$OUT/desktop.sh"
bash "$OUT/checks.sh"
git diff --check
```
