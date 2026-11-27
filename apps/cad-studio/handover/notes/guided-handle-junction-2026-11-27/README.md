# D2073 — Fill one guided handle-to-body junction

P5 [row 08](../../roadmap-rows/08.md), [row 31](../../roadmap-rows/31.md) · [#753](https://github.com/barocss/cad/issues/753) · Base `1df94600451be22d50ada0a4b12d2eca02bf2dd9`.

Select the three Direct boundary curves, the cubic interior guide, and the planar body surface. Choose **Guided Fill**. Set **G1 seam** and **Interior guide**. Select **Apply** after checking the wire preview, the two G0 boundaries and the open surface status. The operation preserves all sources and adds a native support with an exact triangular UV trim. It validates an independent three-edge native sheet. The BCAD stores the Direct support and trim as a separate open surface.

The admitted chart has an affine planar projection, two quadratic shoulder curves with the same rise, and a straight seam that matches the complete regular donor edge. The guide runs from within the seam to the opposite shoulder along one constant projected coordinate. Its authored coefficients determine the interior height. A disconnected guide, an ambiguous role, a folded chart, a nonmatching donor or same-side overlap gives a refusal. The renderer clips the preview to the same triangle. Tangent Fill uses the shared inspector and retains its existing behavior.

## Verification

- **PASS, independent geometry.** The test fixture is `S(u,v) = (30u, 24v, 12v² + 96uv²(1−u−v))` on `u ≥ 0, v ≥ 0, u+v ≤ 1`. Its projected Jacobian is 720. The guide intersects the interior at `(7.5, 12, 4.5)` mm. The zero-shape control at the same XY point is 3 mm high. The original three boundary curves and guide match the reopened surface at all 65 readback stations per curve, with a maximum gap of 0 mm. On the interior subtriangle at least `1/8` parameter from each seam, the minimum projected distance to the three opposing half-planes is `2.342606428329091 mm`. The tessellated display mesh remains inside the selected trim.
- **PASS, continuity and topology.** The body seam measures 0°. The two shoulder normal angles rise to `21.677781517638575°` and `38.24419903079077°` over 65 stations. The source coefficient proof bounds the complete body seam. A strict independent reconstruction from the reopened support, the original body, both original shoulders and their boundary curves has 4 faces, 12 edges, 9 vertices, three reciprocal seam pairs and nine open boundary uses. The maximum pcurve gap is 0 mm. Declaring that reconstruction a closed solid refuses.
- **PASS, desktop Studio WebGPU.** The existing four-curve Fill refuses when given the guide as the fourth boundary. Guided Fill refuses the disconnected guide and preserves history. Select the valid guide, preview, cancel, reopen, and apply. Undo and Redo restore the expected documents. Native Save and fresh Open preserve identical source, trim, guide, donor and boundary readbacks. The final run retains 1,103 frozen source hashes through cleanup with zero page and console errors. The previous Tangent Fill desktop regression also passes.
- **PASS, focused checks.** Guided Junction, Tangent Fill, original Direct Fill and Bridge Curve tests pass 28/28. The guided cases cover authored directions and selection order, signed height, a sheared and oblique projection, decimals, invalid guides, overlapping or bent donors, and native open topology. Scoped ESLint, driver syntax, Studio and Model type checks, diff check, and the Studio production build pass.
- **FAIL, initial exploratory harness.** A project Open had already enabled Undo. The final driver compares both history controls before and after the refused operation. The first geometry-test lint run flagged redundant decimal literal formatting. The corrected files pass lint.
- **NOT_RUN.** Multiple junctions, a pipe branch, multi-span or rational guides, persistent sewing, closed solid creation, the full local suites, and mobile. WebGL2 was not run for Guided Fill. First mechanical CAD remains 8/10. Product-wide completion remains unmeasured.

```sh
# Node 22.19.0. Use the heavy gate for desktop runs and the build.
pnpm --dir packages/barocss-cad-model test guided-junction planar-tangent-fill direct-fill-exact bridge-curve
tsc --noEmit -p apps/cad-studio
tsc --noEmit -p packages/barocss-cad-model
pnpm --dir apps/cad-studio exec vite build --outDir "$OUT/studio-dist"
GUIDED_JUNCTION_FROZEN=1 node --import "$LOCAL_PLAYWRIGHT_PRELOAD" apps/cad-studio/test/guided-junction-browser.mjs "$OUT/final"
TANGENT_FILL_FROZEN=1 node --import "$LOCAL_PLAYWRIGHT_PRELOAD" apps/cad-studio/test/tangent-fill-browser.mjs "$OUT/tangent-regression"
```
