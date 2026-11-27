# D2102 — Draft a half-disk extrusion outward

P5 [row 07](../../roadmap-rows/07.md) and [row 30](../../roadmap-rows/30.md) · [#14](https://github.com/barocss/cad/issues/14) · Base `343e7daebc96c1fdbb692e5166ef9f958e5692b5`.

Draft Extrude accepts outward signed draft on the original exact half-disk profile. The two rational cone charts cover the major upper arc. The flat wall chart encloses both exact parabolic seams, and the top cap covers the full outward circular extent. One authored Draft Extrude retains the source sketch and signed angle.

## Verification

- **PASS, baseline reproduction.** Actual desktop Chrome WebGPU refuses −10° on the original radius-10 half-disk and leaves the sketch intact.
- **PASS, actual desktop candidate.** With a 10 mm extrusion, −10° previews and applies. History accepts −14° after the inward-collapse control. Undo, Redo, native Save and fresh Open preserve the signed angle and corresponding geometry. With a 1,800 mm extrusion, −80° exceeds the ±10,000 mm modeling range and Studio points to Draft and Distance while preserving the sketch. The inward control from [D1253](../half-disk-draft-extrude-2026-11-14/README.md) repeats successfully at +10° and +14°. Each final desktop flow freezes 1,268 files and reports zero source changes, page errors or console errors.
- **PASS, native geometry and independent section integral.** For `d = z tan(θ)`, the radius is `10 − d`, the chord is at `y = d`, and the seam follows `x² = 100 − 20d`. Independent Simpson volumes are 2,060.702291439762 mm³ at −10° and 2,284.677365080201 mm³ at −14°. Native differences are 0.000000052973 and 0.000000034373 mm³. The strict closed solid has 5 faces, 5 loops, 9 edges and 6 vertices, with a maximum observed edge-to-support gap below 3 × 10⁻¹⁵ mm. Native controls verify watertight mesh, major-arc charts, translated and reversed stock, range and angle refusals and three unchanged inward native hashes.
- **PASS, affected checks.** The 46 Kernel tests, 94 Model tests, 88 Studio tests, Kernel emit, all three type checks, scope lint, driver syntax, diff checks and Studio production build pass on Node 22.19.0.
- **NOT_RUN.** General off-centre chord profiles, UV pcurve generation, arbitrary joined surfaces, full local suites, mobile and live providers. The broader #14 criteria remain open. First mechanical CAD remains 8/10 accepted. Whole CAD completion remains unmeasured.

```sh
# Node 22.19.0. Run Studio flows and affected checks under the heavy gate.
D1253_SOURCE_FROZEN=1 node apps/cad-studio/test/half-disk-draft-extrude-browser.mjs "$OUT/baseline" outward --baseline
node packages/barocss-cad/scripts/tool.mjs build:fast
D1253_SOURCE_FROZEN=1 node apps/cad-studio/test/half-disk-draft-extrude-browser.mjs "$OUT/candidate" outward
D1253_SOURCE_FROZEN=1 node apps/cad-studio/test/half-disk-draft-extrude-browser.mjs "$OUT/inward-control"
node --test --test-concurrency=1 packages/barocss-cad/test/{drafted-extrusion,drafted-half-disk-outward,drafted-cap-offset,box-wall-replacement,prismatic-cap-identity}.test.mjs
pnpm --dir packages/barocss-cad-model test extrude draft-command offset-drafted-wall toolset tool-contract
pnpm --dir apps/cad-studio test extrude-draft-failure draft toolset-mcp tool-contract-mcp
pnpm --dir apps/cad-studio exec vite build --outDir "$OUT/studio-dist"
```
