# D1670 — Sweep a circular disk along a tangent line and arc

2026-11-22 · P5 row 07 · [#10](https://github.com/barocss/cad/issues/10) · Base `7eddca2f0f75e957a5644ae7d1d1b379abb96936`

Exact Sweep accepts one open Direct join of a straight segment followed by a 30°–120° circular arc. It requires a forward common tangent and a centred circular disk whose radius clears the bend axis. The prism and bend share a verified disk boundary. The kernel removes the shared disk, keeps the two end caps and binds both half-circle junction edges to the native face charts. The ordinary Studio command and local L1 proposal use the same saved Exact mode.

- **FAIL, base.** Exact arc and Exact straight both returned `CAPABILITY` for the joined rail. The faceted control built a body on the same rail.
- **PASS, affected checks.** Kernel 26, Model 23 and Studio 9 tests with zero failures or skips. Kernel fast build and types, Model types, scoped lint, driver syntax, Studio production build with types and Git diff check passed. The native tests also cover 30°, 90°, an oblique 120° bend, a kink and bend-axis contact.
- **PASS, actual desktop Studio WebGPU and local MCP.** In Studio, join the Direct line and arc, refuse a kink, preview and apply Exact line and arc, then inspect both real junction edges. Studio displays 0° for both. Refuse a diameter of 40 mm at contact. Apply Ø4 → Ø6 mm, Undo, Redo, Save and use fresh Open. The History editor retains the joined path, representation and diameter. Studio preview and approval of the local L1 proposal produce the same exact solid as direct creation. The tangent run records 11 captures, 1,174 frozen files and zero changes or page or console errors. Single-arc and authored two-span circular Sweep controls also passed in Studio with 7 and 6 captures respectively.
- **PASS, native geometry.** A 10 mm straight and an R20 mm quarter arc give a volume of 520.447882187166 mm³ at Ø4 and 1171.007734921124 mm³ at Ø6 using disk area times path length. Independent native quadrature agrees within 1.2e−12 mm³. The closed shell has six faces and ten edges. The two junctions have a maximum sampled normal angle below 2.55e−14° and a maximum sampled pcurve gap below 1e−15 mm. Cross-edge curvature differs by about 0.055 mm⁻¹ at Ø4. The two junctions have sampled tangent continuity (G1). Fresh Open has the same Ø6 native digest, `2f668b93adb836baf9440e6542f9ea64710e9f78bfbceec2c406270a0172f94a`. Direct and Agent-approved Ø4 digests agree at `150e2a017a82cd3e9fea165a9c9d06fb7f549d13e9fc344864a2b707e276b12f`.
- **FAIL, inherited.** The aggregate kernel code-shape check reports the same baseline excess in `cylindrical-bore.ts` (3), `thicken-cylinder.ts` (3) and `thicken-planar.ts` (2) before and after. The changed Sweep source adds no excess to that check.
- **NOT_RUN.** Full local suites, WebGL2, general Sweep inputs, manufacturing and live provider. The supported mixed path is one line followed by one arc. Issue #10 remains open.

## Reproduction

Use Node 22.19.0, the heavy gate, an installed Chrome and Playwright, and output paths outside Git.

```sh
pnpm --dir packages/barocss-cad exec node scripts/tool.mjs build:fast
pnpm --dir packages/barocss-cad type-check
pnpm --dir packages/barocss-cad exec node scripts/code-shape.mjs --check
pnpm --dir packages/barocss-cad exec eslint src/brep/exact-sweep.ts test/exact-tangent-sweep.test.mjs
node --test --test-concurrency=1 packages/barocss-cad/test/{exact-tangent-sweep,exact-arc-sweep,exact-straight-sweep,arc-sweep-bore-fillet,sweep-solid}.test.mjs
pnpm exec eslint packages/barocss-cad-model/src/{app/profileCommands,chat/part/features,engine/errors}.ts apps/cad-studio/src/ui/SweepHistoryInputs.tsx apps/cad-studio/test/{sweep-path-geometry.test.ts,exact-tangent-sweep-browser.mjs}
node --check apps/cad-studio/test/exact-tangent-sweep-browser.mjs
pnpm --dir packages/barocss-cad-model type-check
TEST_CONCURRENCY=1 pnpm --dir packages/barocss-cad-model test arc-sweep-display arc-sweep-mixed-display arc-sweep-exterior-detail sweep-agent-remap direct-sweep-source-ids sweep-history-edit sweep-path-history
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test sweep-path-geometry continuity-angle-label edge-continuity-scope tool-contract-mcp
pnpm --dir apps/cad-studio build
D1670_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-tangent-sweep-browser.mjs "$OUT/tangent"
D1288_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-arc-sweep-browser.mjs "$OUT/pure-arc"
D1310_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-arc-bore-sweep-browser.mjs "$OUT/two-span-arc" --make-curves
git diff --check
```
