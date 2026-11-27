# D2101 — Reverse an Offset on the same original rectangular wall

P5 [row 07](../../roadmap-rows/07.md) and [row 31](../../roadmap-rows/31.md) · [#17](https://github.com/barocss/cad/issues/17) · Base `eb59d7c1af13fb2d73daa9a451643514da3dc77c`.

A second signed Offset on the same original upright rectangular wall remains a native feature. The kernel verifies the current named B-rep against the first authored Offset, checks the second movement and rebuilds the signed total from the original. An exact zero total returns the original native B-rep. Both authored operations remain in History.

## Verification

- **PASS, baseline reproduction.** Actual Chrome WebGPU applies the first native +2 mm Offset and selects the same original face. The old −2 mm action restores the 24,000 mm³ volume through a sketch, tool extrusion and Difference. The restored B-rep has different native owners.
- **PASS, actual desktop candidate.** A −32 mm second preview refuses at the opposite wall and preserves the accepted +2 mm result. The −2 mm preview and Apply keep two native Offset nodes. Undo restores +2 mm and 25,600 mm³. Redo restores the original 24,000 mm³. The serialized B-rep hash equals the original both before Save and after fresh Open. History opens the second signed value and cancels an independent −1 mm preview. The original box and polygon Distance controls also pass. The four recorded flows freeze 1,268 files each and report zero source changes, page errors or console errors.
- **PASS, independent native geometry and fuzz-style property.** Eight varied fractional boxes restore exact original native geometry in an inverse move, including all six faces, twelve edges, eight vertices and twenty-four pcurves. Another eight fixtures verify nonzero totals. The unchanged independent ray oracle evaluates sixteen seeded cases at seed 2101, N = 32 and K = 4. It uses the existing fuzz runner bounds. The largest volume and centroid errors are 0.500 and 0.5694 of their respective bounds. The independent closed-form check retains a volume tolerance of 0.0000001 mm³ and a centroid tolerance of 0.000000001 mm. Each refusal preserves the original accepted snapshot. Both cap orientations keep their established native chains.
- **PASS, affected checks.** The 100 Kernel, 145 Model and 21 Studio tests, Kernel emit, all three type checks, scope lint, driver syntax, diff checks and Studio production build pass on Node 22.19.0. A revision-pinned local Agent command restores the original fractional rectangular wall and reopens the same native result.
- **FAIL, corrected intermediate scope.** The first second-offset branch would have blocked the prior same-cap chain. Unadmitted wall candidates now continue through the existing Kernel routes. Both cap controls pass on the final code.
- **NOT_RUN.** A third native wall Offset, rotated and derived stock, actual desktop Agent approval for this exact inverse, full local suites, mobile and live providers. First mechanical CAD remains 8/10 accepted. Whole CAD completion remains unmeasured.

## Original #17 acceptance

| Original check | Evidence |
| --- | --- |
| Move the top of a 10×20×30 mm box by +5 mm | [D1458](../native-box-cap-offset-2026-11-21/README.md) verifies 7,000 mm³, six faces and retained native names. |
| Delete the 2 mm L-bracket fillet | [D1426](../delete-union-l-fillet-2026-11-21/README.md) matches the independently built sharp union at 4,020 mm³ within the required relative tolerance. |
| Delete the single through bore of a plate | [D1424](../delete-through-bore-face-2026-11-21/README.md) restores the 12,000 mm³ plate and its exterior faces. |
| Move the slanted hexagonal wall +1 mm | [D1264](../offset-hexagonal-wall-2026-11-14/README.md) matches the independent section volume of 3,934.791666666667 mm³. |
| Reverse a sampled planar move and use the independent ray oracle | D2101 restores the original volume and face count, and the seeded comparison stays within both original fuzz bounds. |
| Preserve the input on refusal | The original geometry remains exact after the current strict and desktop collapse refusals. The prior named controls retain the same atomic behavior. |

The original issue can close on these measured cases. Row 31 retains wider adjacent-surface and topology-change work.

```sh
# Node 22.19.0. Run Studio flows and affected checks under the heavy gate.
OFFSET_POLYGON_WALL_FROZEN=1 node apps/cad-studio/test/offset-polygon-wall-browser.mjs "$OUT/baseline" roundtrip --baseline
node packages/barocss-cad/scripts/tool.mjs build:fast
OFFSET_POLYGON_WALL_FROZEN=1 node apps/cad-studio/test/offset-polygon-wall-browser.mjs "$OUT/candidate" roundtrip
OFFSET_POLYGON_WALL_FROZEN=1 node apps/cad-studio/test/offset-polygon-wall-browser.mjs "$OUT/box-control" box
OFFSET_POLYGON_WALL_FROZEN=1 node apps/cad-studio/test/offset-polygon-wall-browser.mjs "$OUT/polygon-control"
node --test --test-concurrency=1 packages/barocss-cad/test/{box-wall-second-offset,box-wall-offset,box-wall-replacement,drafted-cap-offset,prism-wall-offset,polygon-wall-offset,bored-face-delete,prismatic-fillet-heal,analytic-l-fillet-heal}.test.mjs
pnpm --dir packages/barocss-cad-model test native-offset-face offset-face offset-hexagonal-wall offset-to-plane delete-bore-face replace-face references toolset tool-contract
pnpm --dir apps/cad-studio test offset-cap-feedback offset-collapse-feedback offset-plane-pick-feedback offset-face-launch-view offset-hex-side-feedback toolset-mcp tool-contract-mcp
pnpm --dir apps/cad-studio exec vite build --outDir "$OUT/studio-dist"
```
