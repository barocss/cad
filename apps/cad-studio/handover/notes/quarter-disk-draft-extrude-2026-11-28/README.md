# D2128 — Draft Extrude an original quarter disk

P5 [row 07](../../roadmap-rows/07.md) and [row 30](../../roadmap-rows/30.md) · [#14](https://github.com/barocss/cad/issues/14) · Base `30e01bd7e116355b37b053a84cbdbf573dc610b4`.

Draft Extrude accepts a closed original quarter disk made of one cardinal circular arc and two radii. The two radial walls remain planar. Two rational cone charts share a diagonal seam. Each curved intersection with a radial wall is an exact polynomial quadratic. The native path checks stored endpoints before construction and refuses a section that collapses before the top.

## Verification

- **PASS, baseline reproduction.** Desktop Studio refused +10° on a radius-10 mm quarter disk with a height of 10 mm. Apply stayed disabled and the finished sketch remained available.
- **PASS, desktop candidate.** Desktop Chrome verified +10° Preview, Cancel and Apply, refused +30° in History, and accepted the −10° edit. Undo, Redo, native Save and fresh Open preserved the source sketch and the applied feature. The runs froze 1,273 and 1,274 files respectively. Both recorded zero source changes, page errors and console errors.
- **PASS, independent geometry.** At height `z`, set `d = z tan(θ)`, `r = R − d` and `q = √(R² − 2Rd)`. The cross section obeys `x ≥ d`, `y ≥ d` and `x² + y² ≤ r²`. Integrating its area `r²(π/4 − atan2(d,q)) + d² − dq` gives 510.3499758161529 and 1139.04131773899 mm³ at +10° and −10°. The native volumes are 510.34997581646195 and 1139.0413177528624 mm³. The two measured seam gaps stay below 2 × 10⁻¹⁵ mm. Each solid has one shell, six faces, 12 edges and eight vertices. Focused tests verify both signs, centroid, strict topology, watertight meshes at three densities, rotated and reversed input, off-circle fallback and collapse refusal in both directions. Restoring the old route reproduces the non-tangent refusal and fails the new acceptance.
- **PASS, affected checks.** 71 kernel, 98 model and 88 Studio tests. Kernel emit, kernel/model/Studio type checks, scoped ESLint, driver syntax, diff check and Studio production build pass on Node 22.19.0.
- **FAIL, corrected observation.** An initial probe evaluated a chart at a repeated knot and sampled beyond a trimmed planar boundary. The final probe samples native coedges on their segment domains.
- **NOT_RUN.** General arc-and-line profiles, general face Draft, full local test suites, mobile and live providers. The broader #14 remains open. First mechanical CAD remains 8/10. Overall completion is unmeasured.

```sh
# Use Node 22.19.0 and the heavy gate for each Studio or affected check run.
QUARTER_DISK_DRAFT_FROZEN=1 node apps/cad-studio/test/quarter-disk-draft-extrude-browser.mjs "$OUT/baseline" --baseline
node packages/barocss-cad/scripts/tool.mjs build:fast
QUARTER_DISK_DRAFT_FROZEN=1 node apps/cad-studio/test/quarter-disk-draft-extrude-browser.mjs "$OUT/candidate"
node --test --test-concurrency=1 packages/barocss-cad/test/{drafted-extrusion,drafted-half-disk-outward,drafted-circular-segment,drafted-major-circular-segment,drafted-oblique-circular-segment,drafted-quarter-disk,drafted-cap-offset,box-wall-replacement,prismatic-cap-identity}.test.mjs
pnpm --dir packages/barocss-cad-model test extrude draft-command offset-drafted-wall toolset tool-contract
pnpm --dir apps/cad-studio test extrude-draft-failure draft toolset-mcp tool-contract-mcp
pnpm --dir apps/cad-studio exec vite build --outDir "$OUT/studio-dist"
```
