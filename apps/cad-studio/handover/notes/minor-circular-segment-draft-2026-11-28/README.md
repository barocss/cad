# D2104 — Draft a minor circular segment with an off-centre chord

P5 [row 07](../../roadmap-rows/07.md) and [row 30](../../roadmap-rows/30.md) · [#14](https://github.com/barocss/cad/issues/14) · Base `976b5ef7ef0720b51e7f160d0a9aeab841cf65e0`.

Draft Extrude admits an original minor circular segment whose single straight chord is cardinal and symmetric about the circle centre's perpendicular axis. The original half-disk and the new minor segment share the exact plane and cone producers. The authored profile and signed angle stay in the native feature.

## Verification

- **PASS, baseline reproduction.** Actual desktop Chrome WebGPU refuses +6° for the radius-10 profile with chord Y = 6 mm and endpoints X = ±8 mm. The positive-height source sketch stays intact.
- **PASS, actual desktop candidate.** The 10 mm tall extrusion previews and applies +6°. History refuses +12°, which would close the section before the top. It then applies −10°. Undo/Redo, native Save and fresh Open preserve the signed edit. A 1,800 mm extrusion at −80° refuses on the ±10,000 mm modeling range and leaves the accepted sketch intact. Existing positive and negative half-disk controls pass. Each final flow freezes 1,269 files and reports zero source changes, page errors or console errors.
- **PASS, independent native geometry.** With `d = z tan(θ)`, the radius is `10 − d` and the chord is at `Y = 6 + d`. The seams satisfy `X² = 64 − 32d`. Independent Simpson volumes are 284.849094275040 mm³ at +6° and 800.077033111857 mm³ at −10°. The largest native discrepancy is 0.000000015431 mm³. The strict closed solid has 5 faces, 9 edges and 6 vertices, with a maximum measured edge-to-support gap of 2.56 × 10⁻¹⁵ mm. Native controls verify exact support membership, the independent centroid, watertight mesh, all four shifted cardinal orientations, reversed source tags and a larger upper arc at −35°. All tested half-disk native bytes stay the same.
- **PASS, affected checks.** The 52 Kernel tests, 94 Model tests, 88 Studio tests, Kernel emit, all three type checks, scope lint, driver syntax, diff checks and Studio production build pass on Node 22.19.0.
- **NOT_RUN.** Major original circular segments, general noncardinal chord profiles, UV pcurve generation, full local suites, mobile and live providers. The wider #14 criteria remain open. First mechanical CAD remains 8/10 accepted. Whole CAD completion remains unmeasured.

```sh
# Node 22.19.0. Run Studio flows and affected checks under the heavy gate.
D1253_SOURCE_FROZEN=1 node apps/cad-studio/test/half-disk-draft-extrude-browser.mjs "$OUT/baseline" segment --baseline
node packages/barocss-cad/scripts/tool.mjs build:fast
D1253_SOURCE_FROZEN=1 node apps/cad-studio/test/half-disk-draft-extrude-browser.mjs "$OUT/candidate-final" segment
D1253_SOURCE_FROZEN=1 node apps/cad-studio/test/half-disk-draft-extrude-browser.mjs "$OUT/outward-control" outward
D1253_SOURCE_FROZEN=1 node apps/cad-studio/test/half-disk-draft-extrude-browser.mjs "$OUT/inward-control"
node --test --test-concurrency=1 packages/barocss-cad/test/{drafted-extrusion,drafted-half-disk-outward,drafted-circular-segment,drafted-cap-offset,box-wall-replacement,prismatic-cap-identity}.test.mjs
pnpm --dir packages/barocss-cad-model test extrude draft-command offset-drafted-wall toolset tool-contract
pnpm --dir apps/cad-studio test extrude-draft-failure draft toolset-mcp tool-contract-mcp
pnpm --dir apps/cad-studio exec vite build --outDir "$OUT/studio-dist"
```
