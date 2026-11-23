# D1864 — Anchor Constant Fillet creation to a complete circular rim

P4/P5 [row 08](../../roadmap-rows/08.md), [row 16](../../roadmap-rows/16.md) and [row 20](../../roadmap-rows/20.md), [#214](https://github.com/barocss/cad/issues/214). Base `88c876327b339625d01cffb4e82f8146e4c45e6c`.

The original round prism has two native half-edges per circular rim. Studio displays each pair as one edge. Model now verifies the two native owners and closed cap loop before attaching the existing Constant Fillet frame. The handle starts at the native +X seam, along the bisector of the exact radial and outward cap normals. Other finish modes and open rims retain their previous frame contracts. The recipe, Kernel, renderer and file schema remain unchanged.

- **FAIL, original Studio handle alignment.** On the unchanged product, one pick makes a valid native R0.6 Fillet on the R8 by 10 mm cylinder. Its handle misses the independent original seam anchor by 24.757383 CSS px in Top and 19.302226 CSS px in Iso.
- **PASS, fixed actual desktop Studio.** The same selection attaches the Constant Fillet handle to the certified seam with 0.000008743 CSS px Top error and 0.000019063 CSS px Iso error. With the guide projected to 0.000002594 CSS px, drag from R0.6 to R1.5 while viewing the guide end-on. The preview leaves the source unchanged. Apply, Undo/Redo and typed R1.5 produce the same native result. Save and fresh Open retain both native edge names.
- **PASS, independent geometry.** Strict one-shell result, six faces, ten edges and six vertices. Both toroidal patches match the independent circular section and blend radius. Integrating the removed revolved fillet volume gives the R1.5 solid at 1987.364903628 mm³. The saved native result agrees within `2e-6` mm³ and reproduces digest `e89e3ffe2b8df908d0cc755ecf64e20405f965ee3eb2b7bcd85704e99942f6c0`.
- **PASS, affected checks.** 82 Model tests, 29 Studio tests, Model and Studio types, Studio production build, scoped ESLint and Git diff check. Model checks both rims, non-Constant modes, annular refusal and placed metadata removal. An independent source review and the original open-quarter-rim desktop control pass. The two final runs recorded 9 states.
- **NOT_RUN.** Whole local suites, saved closed-rim History drag, other closed-rim owners, other renderers, mobile and live providers. The wider #214 remains open. First mechanical CAD remains 8/10. Whole-product completion remains unmeasured.

```sh
pnpm --dir packages/barocss-cad-model test circular-fillet-handle fillet command-curves native-rim
pnpm --dir packages/barocss-cad-model type-check
pnpm --dir apps/cad-studio test scalar-handle-drag history-fillet-radius command-build-failure
pnpm --dir apps/cad-studio build
D1864_SOURCE_FROZEN=1 node apps/cad-studio/test/closed-circular-fillet-handle-browser.mjs "$OUT/fixed"
CIRCULAR_FILLET_HANDLE_FROZEN=1 node apps/cad-studio/test/circular-fillet-radius-handle-browser.mjs "$OUT/open-rim-control"
git diff --check
```
