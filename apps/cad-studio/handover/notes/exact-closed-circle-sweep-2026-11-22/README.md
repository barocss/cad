# D1673 — Sweep a circular disk around a closed circle

2026-11-22 · P5 row 07 and kernel row 30 · [#10](https://github.com/barocss/cad/issues/10) · Base `85800bc4a53edbd44a7d14a235ceb49af7f39679`

Exact Sweep accepts a circular disk on a single closed circular Direct curve made from four rational quadratic quarter spans. The kernel checks the ordered control points, weights and tangents against one circle. This admits Studio's rounded Direct curve within the native tolerance. The disk must clear the axis. A full native revolution emits one ring without end caps. The kernel binds each coedge to its unique rational surface isocurve for native seam inspection.

- **FAIL, base.** Exact and Exact straight returned `CAPABILITY` for the closed result of three native Curve joins. The faceted mode refused the closed path. The independent full Revolve control built a genus-one solid with volume 1579.136704174297 mm³, equal to `2π²Rr²` for R20 and r2 mm.
- **PASS, affected checks.** Kernel 35, Model 23 and Studio 11 tests. Kernel fast build and types, Model types, scoped lint, driver syntax, Studio production build with types and Git diff check passed. Native cases cover reversed travel, translated and tilted circles, Studio decimal roundoff, noncircular and open paths, axis contact and existing open Sweep controls.
- **PASS, real desktop Studio WebGPU and local MCP.** Draw the 40 mm circle in a Studio sketch and use Make curves. The Exact operation refuses an ellipse and previews the authored circle. Studio creates one ring and reads 0° at all eight native seams, with eight samples per seam. The 40 mm disk edit is refused at the axis. Apply Ø4 → Ø6 mm, Undo, Redo, Save and fresh Open. History retains the exact representation and editable diameter. Local MCP discovers the command and rejects the wrong path revision. A valid dry run preserves file bytes. Explicit Studio approval produces the same native solid as direct creation. The closed, elbow and authored two-span arc runs record 11, 12 and 6 captures respectively. The closed run checked 1,173 frozen files with zero source changes or page or console errors.
- **PASS, native geometry.** The ring has one genus-one shell with four faces, eight edges and 16 pcurves. No planar end caps are present. Native volumes are 1579.136704174297 mm³ at Ø4 and 3553.057584392170 mm³ at Ø6. Native quadrature and the Studio worker agree with the independent volume. Sampled surfaces match the torus equation within 4.44e-15 mm. The maximum pcurve gap is 5.63e-15 mm. The largest sampled seam angle and curvature jump are 1.55e-13° and 7.77e-16 mm⁻¹. The reopened Ø6 digest is `b757ede8b37d20a405b2378ce9b22c5b7a4d4dca0b29615fcf64d37d171a29cb`. Direct and Agent-approved Ø4 digests agree at `13c61ca5745b29fa41a682b6d51690ff811aa51d91c98f92297aa1cd0ff3db93`.
- **FAIL, first browser attempt.** The test clicked at a point shared by the source curve gizmo and the ring in Top view. The valid ring had already been created. The test now selects the solid through the Browser before measuring its seams.
- **FAIL, inherited.** The aggregate kernel code-shape check reports the same excess at base and after the change in `cylindrical-bore.ts` (3), `thicken-cylinder.ts` (3) and `thicken-planar.ts` (2).
- **Observed display limitation.** Parts of the ring outline look segmented in the viewport. The native surface and seam checks pass.
- **NOT_RUN.** Full local suites, WebGL2, other closed paths or sections, downstream Boolean and Fillet, and live provider. Issue #10 remains open.

## Reproduction

Use Node 22.19.0, the heavy gate, installed Chrome and Playwright, and output paths outside Git.

```sh
pnpm --dir packages/barocss-cad exec node scripts/tool.mjs build:fast
pnpm --dir packages/barocss-cad type-check
pnpm --dir packages/barocss-cad exec node scripts/code-shape.mjs --check
pnpm --dir packages/barocss-cad exec eslint src/brep/exact-sweep.ts test/exact-closed-circle-sweep.test.mjs
node --test --test-concurrency=1 packages/barocss-cad/test/{exact-closed-circle-sweep,exact-elbow-sweep,exact-tangent-sweep,exact-arc-sweep,exact-straight-sweep,arc-sweep-bore-fillet,sweep-solid}.test.mjs
pnpm exec eslint packages/barocss-cad-model/src/{app/profileCommands,chat/part/features,engine/errors}.ts apps/cad-studio/test/{sweep-path-geometry.test.ts,exact-closed-circle-sweep-browser.mjs}
node --check apps/cad-studio/test/exact-closed-circle-sweep-browser.mjs
pnpm --dir packages/barocss-cad-model type-check
TEST_CONCURRENCY=1 pnpm --dir packages/barocss-cad-model test arc-sweep-display arc-sweep-mixed-display arc-sweep-exterior-detail sweep-agent-remap direct-sweep-source-ids sweep-history-edit sweep-path-history
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test sweep-path-geometry continuity-angle-label edge-continuity-scope tool-contract-mcp
pnpm --dir apps/cad-studio build
D1673_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-closed-circle-sweep-browser.mjs "$OUT/closed-circle"
D1671_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-tangent-sweep-browser.mjs "$OUT/elbow" --elbow
D1310_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-arc-bore-sweep-browser.mjs "$OUT/arc-pair" --make-curves
git diff --check
```
