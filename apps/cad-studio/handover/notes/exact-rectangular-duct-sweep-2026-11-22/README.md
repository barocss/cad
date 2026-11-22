# D1675 — Sweep a through-open rectangular duct around a tangent elbow

2026-11-22 · P5 row 07 and kernel row 30 · [#10](https://github.com/barocss/cad/issues/10) · Base `afe1600a63e8ab2c98bf615ea10647ec25af7278`

Exact line–arc–line Sweep accepts one bend-aligned rectangular outer section with one centered, parallel rectangular opening. It certifies radial clearance and positive wall clearance at the native gluing tolerance. The paired joints each match four outer and four inner edges by their full coefficients and loop ownership. The inner walls connect the two exterior openings. Both exterior caps are planar faces with one outer and one inner trim. Studio keeps the copied Direct path and the opening in editable sketch History.

- **FAIL, base.** Exact line–arc–line refused the 4 × 6 mm outer section and centered 2 × 4 mm opening. Faceted built a strict genus-one solid at 885.827548271111 mm³. Independent native prism and quarter-revolution controls had two trimmed openings each and agreed with their area-times-length volumes.
- **PASS, affected checks.** Kernel 41, Model 23 and Studio 12 tests. Kernel fast build and types, Model types, scoped lint, driver syntax, Studio production build with types and Git diff check passed. Native coverage includes long oblique 120° travel, both projected alignments, winding and side identity, offset or rotated holes, additional holes, wall contact, sub-tolerance wall thickness and bend-axis contact.
- **PASS, actual desktop Studio WebGPU and local MCP.** Apply the Exact rectangular duct on the saved Direct path. View the inlet and outlet separately. In each view the center ray passes the cap plane through the opening while the wall ray hits the cap. Measure all 16 native junction edges at 0°. In Sweep History, the off-center opening is refused and preserves the accepted document. Restore the center and edit the opening height from 4 to 2 mm. Undo, Redo, Save and fresh Open pass with the new aperture still editable. Local MCP discovers the opening and dry-runs it without changing file bytes. Explicit Studio approval produces the same native solid as direct creation. The duct, solid rectangular elbow and solid circular elbow runs record 11, 10 and 12 captures respectively, with zero source changes or page or console errors. The duct source capsule covers 1,172 files.
- **PASS, native shape.** One strict genus-one shell has 26 faces, 28 loops, 56 edges and 112 coedges. The inlet and outlet retain separate inner and outer trims with the original wall tags. The two cylindrical outer walls and the two cylindrical inner walls have radii and outward senses of 18 mm (−), 19 mm (+), 21 mm (−) and 22 mm (+). The material areas are 16 and 20 mm² before and after the opening edit. On the 10 mm lead, R20 mm quarter arc and 14 mm tail, the native volumes are 886.654824574367 and 1108.318530717958 mm³. Native quadrature and the worker agree with the independent area-times-length oracle. The peak sampled pcurve gap is 1.07e-14 mm and seam normal angle is 1.89e-14°. The reopened digest is `a0384a98a4dc624d47bc70e1ed6e4f58a579c3a667de5b85d86042f841273eaa`. Direct and Agent-approved inputs share `3ca876c5252cddc1f678b0a3c4f31902440481d4973e9ff1ba929565d0252069`.
- **PASS, existing Sweep controls.** The solid rectangular and solid circular elbow native digests, volumes and topology counts match the prior Studio runs.
- **Observed display limitation.** The bend outline shows straight display segments in the selection and approval captures. The original bend and its tangent joints pass the native checks above. Viewport tessellation was unchanged in this delivery.
- **FAIL, inherited.** Aggregate kernel code shape reports the same excess at base and after the change in `cylindrical-bore.ts` (3), `thicken-cylinder.ts` (3) and `thicken-planar.ts` (2).
- **NOT_RUN.** Full local suites, WebGL2, downstream Boolean and Fillet on the duct, general closed or freeform paths, other aperture shapes, and live provider. Issue #10 remains open.

## Reproduction

Use Node 22.19.0, the heavy gate, installed Chrome and Playwright, and output paths outside Git.

```sh
pnpm --dir packages/barocss-cad exec node scripts/tool.mjs build:fast
pnpm --dir packages/barocss-cad type-check
pnpm --dir packages/barocss-cad exec node scripts/code-shape.mjs --check
pnpm --dir packages/barocss-cad exec eslint src/brep/exact-sweep.ts test/{exact-rectangular-duct-sweep,exact-rectangular-elbow-sweep}.test.mjs
node --test --test-concurrency=1 packages/barocss-cad/test/{exact-rectangular-duct-sweep,exact-rectangular-elbow-sweep,exact-closed-circle-sweep,exact-elbow-sweep,exact-tangent-sweep,exact-arc-sweep,exact-straight-sweep,arc-sweep-bore-fillet,sweep-solid}.test.mjs
pnpm exec eslint packages/barocss-cad-model/src/{chat/part/features,engine/errors}.ts apps/cad-studio/test/exact-rectangular-duct-sweep-browser.mjs
node --check apps/cad-studio/test/exact-rectangular-duct-sweep-browser.mjs
pnpm --dir packages/barocss-cad-model type-check
TEST_CONCURRENCY=1 pnpm --dir packages/barocss-cad-model test arc-sweep-display arc-sweep-mixed-display arc-sweep-exterior-detail sweep-agent-remap direct-sweep-source-ids sweep-history-edit sweep-path-history
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test sweep-path-geometry continuity-angle-label edge-continuity-scope tool-contract-mcp
pnpm --dir apps/cad-studio build
D1675_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-rectangular-duct-sweep-browser.mjs "$OUT/duct"
D1674_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-rectangular-elbow-sweep-browser.mjs "$OUT/rectangular"
D1671_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-tangent-sweep-browser.mjs "$OUT/elbow" --elbow
git diff --check
```
