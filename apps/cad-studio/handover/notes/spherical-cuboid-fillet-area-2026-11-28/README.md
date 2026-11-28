# D2143 — Measure analytic area on rounded rectangular cuboids

P5 [row 07](../../roadmap-rows/07.md), [row 24](../../roadmap-rows/24.md) and [row 30](../../roadmap-rows/30.md) · [#12](https://github.com/barocss/cad/issues/12) · Base `428cd5f01df7f3b01dbfddb055b2c41c889f62d1`.

The existing complete circular Fillet can round all twelve edges of an original cardinal cuboid. Its default surface-area read now uses the analytic result for the exact B-rep object produced by the verified twelve-cylinder and eight-corner branch. The cube keeps its existing calculation. Explicit quadrature, copies and later transforms use the existing general measure.

## Verification

- **PASS, actual desktop baseline and candidate.** Local MCP proposes the same twelve original edges and Studio approves R2 after Preview and Hide. On the 40 × 30 × 20.0004 mm cuboid, the baseline reads 4,886.50350579199 mm². The analytic result is 4,886.497016925698 mm². The chosen height crosses the existing integer display boundary, so the inspector changes from 4,887 to 4,886 mm². The same strict 34-face boundary digest `68065f9a63af732c83f12b883cecebfd9e2935b53fade7cf2edcb7f09212916a` and volume 23,702.165856471358 mm³ appear before and after. Explicit quadrature retains its prior reading.
- **PASS, editing and local Agent.** Actual History edits R2 to R2.5. Undo/Redo and native Save/fresh Open retain the new boundary. Studio displays 4,807 mm² and the exact current area is 4,806.691344621225 mm². The revision-pinned local full-area reads match both analytic values, refuse a stale revision and retain the saved file bytes.
- **PASS, independent measure and affected checks.** With inset lengths `a,b,c`, split the area into `2(ab+ac+bc)` for six planes, `2πr(a+b+c)` for twelve quarter cylinders and `4πr²` for the eight octants. Independent review verifies the scope and cube scalar equality. 72 Kernel, 37 Model and 57 Studio tests, all types, scoped ESLint, driver syntax, diff check and production build pass on Node 22.19.0. Restoring the previous receipt rejects the cuboid regression. Baseline and candidate freeze 1,279 and 1,282 files with zero source changes, page errors or console errors.
- **NOT_RUN.** Other Fillet families, external CAD, mobile and full local suites. #12 remains open. First mechanical CAD remains 8/10 accepted. Overall completion is unmeasured.

```sh
# Node 22.19.0. Run desktop and affected checks under the heavy gate.
ROUNDED_CUBE_AREA_FROZEN=1 node apps/cad-studio/test/rounded-cube-area-browser.mjs "$OUT/baseline" --baseline --cuboid
node packages/barocss-cad/scripts/tool.mjs build:fast
ROUNDED_CUBE_AREA_FROZEN=1 node apps/cad-studio/test/rounded-cube-area-browser.mjs "$OUT/candidate" --cuboid --agent-area
node --test --test-concurrency=1 packages/barocss-cad/test/{edge-finish,brep-mass-translation,part-model}.test.mjs
pnpm --dir packages/barocss-cad-model test toolset tool-contract measure
pnpm --dir apps/cad-studio test toolset-mcp tool-contract-mcp proposal-review-availability measure
pnpm --dir apps/cad-studio exec vite build --outDir "$OUT/studio-dist"
```
