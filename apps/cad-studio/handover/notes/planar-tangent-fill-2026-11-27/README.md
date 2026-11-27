# D2072 — Match one planar seam with Tangent Fill

P5 [row 08](../../roadmap-rows/08.md), [row 31](../../roadmap-rows/31.md) · [#751](https://github.com/barocss/cad/issues/751) · Base `39f1e423702c2c9ec79ed58fc4803413e01077a2`.

Shift-select four polynomial Direct boundary curves and one original planar Direct surface. Choose **Tangent Fill** and select the shared edge in **G1 seam**. The grid previews a separate native patch, with the original inputs in place. Apply adds one Direct surface. Cancel discards the candidate. The existing four-curve Fill remains available.

The new construction starts with the existing exact Bézier Coons control net. It keeps its four boundaries and projects only the interior poles next to the seam onto the donor plane. The stored donor and patch normal fields have bounds from their polynomial coefficients. The seam has the same complete straight native edge, regular opposite sides, and compatible corner tangents. Invalid or unsupported inputs refuse before Apply. The donor is a whole degree-one by degree-one planar patch. The output source preserves the accepted coefficients through compilation.

## Verification

- **PASS, independent geometry.** On the 30 × 24 mm fixture with an 8 mm crown, the ordinary patch is `(30u, 24v, 32u(1−u)v)`. Tangent Fill is `(30u, 24v, 32u(1−u)(2v²−v³))`. The four boundaries agree pointwise. The projected Jacobian is 720. Desktop native readback gives 0 mm maximum error over 33 stations per boundary. The maximum angle to the donor plane changes from `18.43494882292201°` to `0°` over 33 seam stations. The independent native coefficient bound covers the full seam.
- **PASS, desktop Chrome WebGPU.** Apply the existing G0 Fill and Undo. Select all four curves and the original planar donor in the Browser. A non-shared crown refuses with Apply disabled. Select the actual seam, preview, cancel, reopen the tool and apply. Preview and refusal preserve the document and the existing Undo/Redo state. The new patch has native degrees `[2,3]`. All original objects and sources remain byte-identical. Undo, Redo, BCAD Save and fresh Open preserve the expected states and identical native readback. The final run verifies 1,102 frozen source hashes through cleanup with zero page and console errors.
- **PASS, focused native and Studio checks.** The Tangent Fill, existing Fill and Bridge Curve tests pass 20/20. Coverage includes a biquadratic patch, donor direction permutations, an oblique plane, corner conflict, a seam fold, same side, an incomplete edge and source precision. The prior Bridge Curve desktop regression passes on WebGPU and WebGL2. Scoped ESLint, Studio and Model type checks, driver syntax, diff check, and Studio production build pass.
- **FAIL, first two browser harnesses.** The first expected the donor label on one line. The second expected an exact decimal 15 for an existing Coons interior X coordinate stored as `14.999999999999998`. The final check compares that stored coordinate directly and verifies that the projection changes only Z.
- **NOT_RUN.** Curved or trimmed donors, multiple tangent seams, global fold certification for arbitrary inputs, sewing, solid generation, full local suites and mobile. First mechanical CAD remains 8/10. Product-wide completion remains unmeasured.

```sh
# Node 22.19.0. Use the heavy gate for desktop runs and the build.
pnpm --dir packages/barocss-cad-model test planar-tangent-fill direct-fill-exact bridge-curve
tsc --noEmit -p apps/cad-studio
tsc --noEmit -p packages/barocss-cad-model
pnpm --dir apps/cad-studio exec vite build --outDir "$OUT/studio-dist"
TANGENT_FILL_FROZEN=1 node --import "$LOCAL_PLAYWRIGHT_PRELOAD" apps/cad-studio/test/tangent-fill-browser.mjs "$OUT/final"
BRIDGE_CURVE_SOURCE_FROZEN=1 node --import "$LOCAL_PLAYWRIGHT_PRELOAD" apps/cad-studio/test/bridge-curve-browser.mjs "$OUT/bridge-regression"
```
