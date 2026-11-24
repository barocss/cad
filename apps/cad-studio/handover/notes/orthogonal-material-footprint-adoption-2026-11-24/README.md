# D1910 — Adopt the independent orthogonal material footprint

P1 [row 09](../../roadmap-rows/09.md), [row 16](../../roadmap-rows/16.md) and [row 30](../../roadmap-rows/30.md), [#221](https://github.com/barocss/cad/issues/221). Base `a10b91da2a80f0ac4aee57e865e75942b7d7e071`.

Adopt the existing [D853 material-footprint command](../orthogonal-material-footprint-2026-11-12/README.md) for one exact axis-aligned solid and an independent XY sketch. The native worker unions the material projected by complete horizontal face trims. A through void stays a hole. A blind pocket contributes material through its floor. The existing Sketch transaction owns the new editable snapshot. Drawing visibility, the chosen face outline and the intersecting Section remain separate consumers with their existing behavior.

Defer inclined source faces, oblique projection, linked recomputation, multiple bodies and assembly projection. Keep the existing closed-solid, straight-edge and valid-output-loop checks. This decision resolves the adoption question in the original research issue.

- **PASS, current desktop Studio.** A 32 × 20 × 4 mm source with a 4 × 6 mm through-hole and a 4 × 4 × 2 mm blind pocket has 2432 mm³. Project its footprint at Z10, preserve the single through-hole and extrude it by 2 mm to 1232 mm³. Cancel, Undo/Redo, browser project Save and fresh File Open pass. The 3200 saved bytes match D853, SHA-256 `46d0aa91d90b801c79d275c2f1ba00df72ba8cac470da962256f7c7d35ab50b9`.
- **PASS, fresh Open and edit.** Open the copied sketch through its Extrude. Set X to 34 mm at the (32, 20) corner. The existing aligned-point edit moves both ends of its vertical edge. The original remains 2432 mm³. The 40 mm² added strip gives the copied result 1312 mm³. The hole, sketch identity, XY plane and consuming feature remain in place. Undo and Redo recover the corresponding exact documents. The separate source width edit gives 2592 mm³ in the source and leaves the restored copy at 1232 mm³.
- **PASS, refusal and ownership.** The curved-body refusal and the cancelled draft preserve the accepted state. The harness holds an actual native projection reply and delivers it after starting a newer History draft or opening another document with the same IDs. Both late replies leave the newer work untouched.
- **PASS, affected checks.** 26 Model tests, browser driver syntax and Git diff check. The focused tests cover missing and curved bodies, a projected point contact, opposed blind pockets and fractional XY translation. Desktop geometry matches the independent area, volume and centroid within 1e−7 in the respective model units. D853 measured the original analytic geometry and saved bytes; D1910 adds the actual edited snapshot and checks its native corners, volume and centroid independently.
- **FAIL, first browser oracle.** The first comparison expected a trapezoid from the corner edit. The existing coordinate field preserves the aligned edge, and the raw vertices recorded the two translated endpoints. The corrected rectangle oracle checks the actual edit, the saved hole, identities and unchanged source.
- **NOT_RUN.** Full local suites, inclined or general planar projection, linked projection, multi-body/assembly projection, an actual source translation and reproject cycle, mobile and vendor equivalence. First mechanical CAD stays at 8/10. Whole-product completion remains unmeasured.

```sh
pnpm --dir packages/barocss-cad-model test material-footprint sketch-associative-inset sketch-profile-precision
D853_SOURCE_FROZEN=1 node apps/cad-studio/test/material-footprint-browser.mjs "$OUT/footprint"
git diff --check
```
