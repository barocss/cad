# D2220 — Set both cap thicknesses on a closed L Shell

P5 [row 07](../../roadmap-rows/07.md), [row 16](../../roadmap-rows/16.md) and [row 30](../../roadmap-rows/30.md) · [#13](https://github.com/barocss/cad/issues/13) · Base `3f860fbf5`.

On a closed original upright orthogonal L extrusion, choose **Separate floor and ceiling**. This keeps the side wall thickness independent of both caps. The original eight outer supports enclose one native cavity. The cavity planes are `zmin + floorThickness` and `zmax − ceilingThickness`. Default Round, explicit Round and Sharp use the existing exact side profiles. The existing schema stores the two literal fields together for a closed Shell.

- **PASS, actual desktop.** The baseline offered only a uniform closed wall. On the 40 × 30 × 20 mm stock, 2 mm side walls and 3/4 mm caps produced a strict Sharp solid of 9,480 mm³. Cancel kept the original. Caps of 3/17 mm refused Apply and preserved the source. History changed the ceiling to 5 mm for 10,080 mm³, then changed the floor to 4 mm and the corner to Round for 10,670.557519 mm³. Undo, Redo and project Save → Close → reload → Open preserved a sealed cavity at Z4–15 with the original outer caps at Z0 and Z20.
- **PASS, actual local Agent and Studio.** The command describes the new mode. Unpinned or stale requests, a face in place of the body, and colliding caps refused. The revision-pinned proposal remained pending until explicit Studio approval. The approved 4/5 mm Round part matched the manual native planes and volume. Undo and Redo preserved the proposal and accepted states.
- **PASS, affected checks.** 65 Kernel, 21 Model and 16 Studio focused tests. Independent volume, area, centroid, side and cap supports, material-ray and trim checks pass. Seven previous Shell native byte controls pass. Scoped lint, Kernel/Model/Studio types, production Studio build and whitespace pass.
- **FAIL, first Agent driver.** Its refusal check looked for the raw Kernel text. The local Agent correctly presented the friendly text and preserved the document. The corrected driver passed. The source-shape guard reports the same eight entries as the parent. Its script, baseline and scanned source directories match the parent.
- **NOT_RUN.** Other stock and opening combinations, general freeform Shell, external readers, full local suites, mobile and live models. #13 retains its wider acceptance. First mechanical CAD remains 8/10. Overall CAD and natural-language completion remain unmeasured.

```sh
bash "$OUT/desktop.sh" before baseline
bash "$OUT/checks.sh"
bash "$OUT/remaining-checks.sh"
bash "$OUT/desktop.sh" section fixed
git diff --check
```
