# D2106 — Draft a circular segment with a noncardinal chord

P5 [row 07](../../roadmap-rows/07.md) and [row 30](../../roadmap-rows/30.md) · [#14](https://github.com/barocss/cad/issues/14) · Base `baff64883747608cb9a050ba10399bebf172ed23`.

Draft Extrude accepts either sign for one arc and one oblique chord when the two stored endpoints have exactly equal squared distances from the stored centre. The exact binary64 predicate uses the shared dyadic representation. The stable chord frame reuses the existing plane and cone producer and keeps both authored vertices and incident curve endpoints. The previous cardinal paths retain their native results.

## Verification

- **PASS, baseline reproduction.** Desktop Chrome WebGPU refuses +10° on a radius-50 sketch with an oblique chord from (0, −50) to (48, 14) mm. The Apply button stays disabled and the source sketch remains available.
- **PASS, actual desktop candidate.** The 50 mm extrusion previews +10°, cancels without changing the document or Undo state and applies on retry. History refuses +40° when the section closes before the top. The −10° edit, Undo, Redo, native Save and fresh Open pass. The two exact authored chord endpoints stay identical in every applied document. Both desktop runs freeze 1,269 files with zero changed sources, page errors or console errors.
- **PASS, independent native checks.** In the orthonormal chord frame with X direction (3/5, 4/5), `d = z tan(θ)`, the radius is `50 − d`, the chord is at `Y = −30 + d` and both seams satisfy `X² = 1600 − 40d`. Independent Simpson volumes at +10° and −10° are 274,521.41052412626 and 407,382.45034103276 mm³. Native and Worker volumes are within 7.32 × 10⁻⁷ mm³. The maximum measured edge-to-support gap is 1.47 × 10⁻¹⁴ mm. Exact native checks cover both signs for the major, minor and diameter cases, watertight tessellation, finite cap and wall charts, centroid, source tags after reversal and an irrational chord frame. Two near-circle inputs still refuse when their exact stored squared radii differ. Eleven cardinal native hashes match.
- **PASS, affected verification.** 67 Kernel, 94 Model and 88 Studio tests pass. Kernel emit, all three type checks, scoped ESLint, browser-driver syntax, diff check and Studio production build pass on Node 22.19.0.
- **FAIL, corrected test setup.** The first focused run reports 30/32. Two inverse flat-chart probes round one ULP below the parameter domain. The test now measures the raw parameter against an explicit enclosure before clamping only the probe. The corrected focused run reports 32/32. The native solids passed strict and watertight checks in both runs.
- **NOT_RUN.** Other line–arc profiles, general face Draft, UV pcurve generation, full local suites, mobile and live providers. The broader [#14](https://github.com/barocss/cad/issues/14) stays open. First mechanical CAD remains 8/10 accepted. Whole CAD completion remains unmeasured.

```sh
# Node 22.19.0. Use the heavy gate for each desktop flow and the affected checks.
D1253_SOURCE_FROZEN=1 node apps/cad-studio/test/half-disk-draft-extrude-browser.mjs "$OUT/baseline" oblique --baseline
node packages/barocss-cad/scripts/tool.mjs build:fast
D1253_SOURCE_FROZEN=1 node apps/cad-studio/test/half-disk-draft-extrude-browser.mjs "$OUT/candidate" oblique
node --test --test-concurrency=1 packages/barocss-cad/test/{drafted-extrusion,drafted-half-disk-outward,drafted-circular-segment,drafted-major-circular-segment,drafted-oblique-circular-segment,drafted-cap-offset,box-wall-replacement,prismatic-cap-identity}.test.mjs
pnpm --dir packages/barocss-cad-model test extrude draft-command offset-drafted-wall toolset tool-contract
pnpm --dir apps/cad-studio test extrude-draft-failure draft toolset-mcp tool-contract-mcp
pnpm --dir apps/cad-studio exec vite build --outDir "$OUT/studio-dist"
```
