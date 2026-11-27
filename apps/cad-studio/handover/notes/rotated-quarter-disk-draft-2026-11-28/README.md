# D2130 — Draft a quarter disk rotated in its sketch plane

P5 [row 07](../../roadmap-rows/07.md) and [row 30](../../roadmap-rows/30.md) · [#14](https://github.com/barocss/cad/issues/14) · Base `2e15aa7f8f83375a2e593bfcc82d9a9ca0406efb`.

Draft Extrude accepts an original circular arc with two radii that meet at the centre and span an exact positive quarter turn. A dyadic comparison proves the relation from the stored coordinates. Both signs reuse the local plane and rational cone construction. The rotated result retains the original centre and arc endpoints and the ends of their incident edges. The previous cardinal path and two-vertex oblique chord use the same native results.

## Verification

- **PASS, baseline reproduction.** Desktop Studio refused +10° on the radius-10 mm loop through (0, 0), (8, 6) and (−6, 8) at height 10 mm. Apply stayed disabled and the finished sketch remained available.
- **PASS, actual desktop candidate.** +10° Preview, Cancel and Apply, +30° collapse refusal in History, −10° edit, Undo, Redo, native Save and fresh Open. The −10° native SHA256 is `655ee70ac627e3d2eb4b705fb4be8704094fabdef1349f4199a63d7b46cde8a0` before and after reopen. The runs froze 1,274 and 1,275 files respectively and recorded zero source changes, page errors and console errors.
- **PASS, independent geometry.** With `u=(4x+3y)/5`, `v=(-3x+4y)/5` and `d=z tan(θ)`, both non-tangent joins obey `u=d` or `v=d` and `u²+v²=(10−d)²`. Native volumes 510.3499758171844 and 1139.0413177485577 mm³ agree with independent volumes 510.3499758161529 and 1139.04131773899 mm³. Native tests check rotated centroid and seam laws, translated/reversed/cyclic sources, strict topology and three watertight mesh densities. A one-ULP off-circle case and a major arc stay refused. The (1, 12) endpoint test catches an actual one-ULP loss when source restoration is removed. The two old cardinal and two old oblique chord native digests match.
- **PASS, affected checks.** 75 kernel, 98 Model and 88 Studio tests. Kernel emit, three type checks, scoped ESLint, driver syntax, diff check and Studio production build on Node 22.19.0.
- **NOT_RUN.** General arc–line profiles, general face Draft, full local suites, mobile and live providers. The broader #14 remains open. First mechanical CAD remains 8/10 accepted. Overall completion is unmeasured.

```sh
# Node 22.19.0. Run each Studio flow and the affected checks under the heavy gate.
QUARTER_DISK_DRAFT_FROZEN=1 node apps/cad-studio/test/quarter-disk-draft-extrude-browser.mjs "$OUT/baseline" --rotated --baseline
node packages/barocss-cad/scripts/tool.mjs build:fast
QUARTER_DISK_DRAFT_FROZEN=1 node apps/cad-studio/test/quarter-disk-draft-extrude-browser.mjs "$OUT/candidate" --rotated
node --test --test-concurrency=1 packages/barocss-cad/test/{drafted-extrusion,drafted-half-disk-outward,drafted-circular-segment,drafted-major-circular-segment,drafted-oblique-circular-segment,drafted-quarter-disk,drafted-cap-offset,box-wall-replacement,prismatic-cap-identity}.test.mjs
pnpm --dir packages/barocss-cad-model test extrude draft-command offset-drafted-wall toolset tool-contract
pnpm --dir apps/cad-studio test extrude-draft-failure draft toolset-mcp tool-contract-mcp
pnpm --dir apps/cad-studio exec vite build --outDir "$OUT/studio-dist"
```
