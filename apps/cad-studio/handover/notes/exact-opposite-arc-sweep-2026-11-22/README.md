# D1681 — Sweep an exact circular disk through two opposite tangent arcs

2026-11-22 · P5 row 07 and kernel row 30 · [#10](https://github.com/barocss/cad/issues/10) · Base `c3f2bc9e0a43bb9a2ac0b856e3d23e057e33b5a9`

An open planar rational quadratic rail with two tangent circular spans of opposite curvature can carry a circular disk as one Exact Sweep. Each span is 30° to 120°. Require the section radius to stay below both path radii. Use one exact analytic Revolve for each span. Each swept piece lies strictly in its own open half-space at the shared section except for the common cap. Glue the common disk, retain both outer end caps and bind both native junction edges to the two original torus charts. The positive volume follows Pappus. The independent centroid weights the annular radial moment of each toroidal sector.

- **FAIL, base.** Actual Studio joined the two Direct arcs and refused Exact Sweep. The base kernel refused the joined rail at the 2 and 3 mm section radii. Its Faceted control produced 588.186812509 mm³ against the exact 592.176264065 mm³ oracle.
- **PASS, native geometry.** Strict topology has one closed genus-zero shell, 6 faces, 10 edges and 20 reciprocal coedges. Both exterior caps and both toroidal carriers match independent samples. The two native junction edges are tangent and have the expected longitudinal curvature jump as the rail turns from one curvature sign to the other. Refuse a kink, reversed tangent, noncoplanarity, same-side unequal carriers, out-of-range spans, a section touching a bend axis, a noncircular section and a disk with a hole. An oblique translated 120°/30° rail also passes with section radius 8 mm. The same-circle two-span control retains the existing single-carrier Sweep.
- **PASS, actual desktop Studio WebGPU.** Join the 12 mm and 18 mm arcs. Refuse the kinked contour and create the Exact S-bend at diameter 4 mm. Inspect both native junction edges at 0° with eight samples each. Refuse diameter 24 mm and preserve the accepted shape. Edit to diameter 6 mm, Undo, Redo, Save and fresh Open. Both seams and the editable diameter survive. The largest sampled torus, cap, seam or chart gap is 4.00e-15 mm, sampled curvature-jump error is 2.22e-16 mm⁻¹, and volume differs from the independent theory by at most 3e-13 mm³.
- **PASS, local Agent.** Discover the supported rail and bounds through MCP. Refuse the wrong rail revision and dry-run the valid command on unchanged saved bytes. Explicit Studio approval produces the same native shape as direct creation.
- **PASS, affected checks.** Kernel 52, Model 9, Studio 12 tests. Kernel fast build and types, Model types, scoped lint, driver syntax, Studio production build with types and Git diff check pass. The S-bend flow has 12 captures. The prior tangent elbow control has 12 captures and retains all earlier native digests, topology and volumes. Both runs report zero source changes or page and console errors. Temporary in-memory mutations that drop seam parameter curves, reverse the second bend direction, or disable forward tangency each fail the corresponding focused native test.
- **FAIL, inherited.** The aggregate kernel code-shape check reports the same findings as base in `cylindrical-bore.ts`, `thicken-cylinder.ts` and `thicken-planar.ts`.
- **NOT_RUN.** Full local suites, WebGL2, sweep with annular or general sections, general rails and frame laws, and a live model provider. Keep #10 open.

| Studio stage | Diameter (mm) | Native volume (mm³) | Independent volume (mm³) | Maximum sampled curvature jump (mm⁻¹) |
| --- | --- | --- | --- | --- |
| accepted | 4 | 592.176264065361 | 592.176264065361 | 0.147250796 |
| diameter-six | 6 | 1332.396594147063 | 1332.396594147063 | 0.155587525 |
| reopened | 6 | 1332.396594147063 | 1332.396594147063 | 0.155587525 |
| local-approved | 4 | 592.176264065361 | 592.176264065361 | 0.147250796 |

The roadmap snapshot records first product scenarios, local command and approval evidence, natural-language task success, and full CAD requirement readiness. Each describes its own coverage and remaining evidence.

## Reproduction

Use Node 22.19.0, the heavy gate, installed Chrome and Playwright, and output paths outside Git. Use the driver's `--expect-refused` mode for the base.

```sh
pnpm --dir packages/barocss-cad exec node scripts/tool.mjs build:fast
pnpm --dir packages/barocss-cad type-check
pnpm --dir packages/barocss-cad exec node scripts/code-shape.mjs --check
pnpm --dir packages/barocss-cad exec eslint src/brep/exact-sweep.ts test/exact-opposite-arc-sweep.test.mjs
node --test --test-concurrency=1 packages/barocss-cad/test/{exact-opposite-arc-sweep,exact-elbow-sweep,exact-rectangular-duct-sweep,exact-closed-circle-sweep,exact-offset-ring-intersect,edge-continuity,exact-arc-sweep,exact-rectangular-elbow-sweep,exact-tangent-sweep}.test.mjs
pnpm exec eslint packages/barocss-cad-model/src/{app/profileCommands,chat/part/features,engine/errors}.ts apps/cad-studio/test/{sweep-path-geometry.test.ts,exact-s-bend-sweep-browser.mjs}
node --check apps/cad-studio/test/exact-s-bend-sweep-browser.mjs
pnpm --dir packages/barocss-cad-model type-check
TEST_CONCURRENCY=1 pnpm --dir packages/barocss-cad-model test edge-continuity sweep-path-history arc-sweep-display
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test sweep-path-geometry continuity-angle-label edge-continuity-scope tool-contract-mcp
pnpm --dir apps/cad-studio build
D1681_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-s-bend-sweep-browser.mjs "$OUT/verified"
D1671_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-tangent-sweep-browser.mjs "$OUT/elbow-control" --elbow
git diff --check
```
