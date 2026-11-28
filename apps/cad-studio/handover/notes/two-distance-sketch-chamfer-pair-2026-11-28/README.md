# D2158 — Apply two Sketch Chamfer distances to two corners

P1 [row 09](../../roadmap-rows/09.md) and [row 16](../../roadmap-rows/16.md) · [#171](https://github.com/barocss/cad/issues/171) · Base `8071f2c2d86c8dce7dd71410562b9920017c69a0`.

Two selected perpendicular corners on one independent outline can share an incoming distance and an outgoing distance. Each corner uses the direction of its own incoming and outgoing carriers. The existing batch checks both plans against the original outline, validates the remaining shared edge and applies both bevels together. The recipe keeps existing sketch IDs and stores each bevel with the existing length and joint-angle representation.

## Verification

- **PASS, actual Studio baseline and final.** The baseline offers only one distance for the two selected points. The final command previews 3 mm incoming and 4 mm outgoing on the two right corners of a 40 × 30 mm original outline. The surviving shared side is 23 mm. Increasing outgoing to 27 mm consumes the shared edge and refuses Apply while the original stays in place. Cancel restores the current sketch. Applying both and finishing once produces 11,880 mm³ at height 10 mm. Undo/Redo and native Save/fresh Open preserve the exact endpoints, eight faces, both native bevel owners and digest `0329dcb82edb8aeeeb843bc24588baaa77fbcc45e858ce12d860b6a0536100a4`. Both unequal single-corner and equal batch desktop controls pass.
- **PASS, Model and independent geometry.** The rectangle removes two triangles of area 6 mm² each. The mixed convex/reflex notch case preserves original untrimmed lengths and the fixed anchor, gives four independent expected endpoints, opposite turn signs and exact new planar wall owners. Reversing selection order yields identical output. A locked carrier, an exhausted or below-minimum shared span and a third unequal corner are refused. No partial edit changes the input.
- **PASS, affected checks.** 66 Model and 55 Studio checks, Model and Studio types, scoped ESLint, driver syntax, production build and diff check pass. Final browser runs report no frozen-file changes, console errors or page errors. An independent geometry review verified direction, adjacency and stable carrier constraints.
- **Corrected test failure.** The first baseline asked for preview markers before opening the command. The corrected driver checks the markers after the Chamfer controls appear.
- **NOT_RUN.** Unequal oblique corners, simultaneous resizing of two saved unequal bevels, local Agent pair creation, mobile and full local suites. #171 remains open for the full sketch tool group. First mechanical CAD is 8/10 accepted. Overall completion is unmeasured.

```sh
TWO_SETBACK_CHAMFER_FROZEN=1 node apps/cad-studio/test/sketch-two-setback-chamfer-browser.mjs "$OUT/baseline-verified" --batch --baseline
TWO_SETBACK_CHAMFER_FROZEN=1 node apps/cad-studio/test/sketch-two-setback-chamfer-browser.mjs "$OUT/candidate" --batch
TWO_SETBACK_CHAMFER_FROZEN=1 node apps/cad-studio/test/sketch-two-setback-chamfer-browser.mjs "$OUT/single-control" --edit
D1695_SOURCE_FROZEN=1 node apps/cad-studio/test/sketch-corner-batch-browser.mjs "$OUT/equal-control"
pnpm --dir packages/barocss-cad-model test corner-batch sketch-chamfer-retention sketch-chamfer-edit corner
pnpm --dir apps/cad-studio test constraints sketch-constraint corner
pnpm --dir apps/cad-studio exec vite build --outDir "$OUT/studio-dist"
```
