# D1904 — Sweep an exact circular tube through perpendicular quarter arcs

P5 [row 08](../../roadmap-rows/08.md) and [row 16](../../roadmap-rows/16.md), [#10](https://github.com/barocss/cad/issues/10). Base `042da58479bf4320ee217cd556023af063a68763`.

Admit one concentric circular bore in the existing opt-in perpendicular quarter-arc Sweep. The first bend's exit frame carries both the outer seam and the bore seam. The existing concentricity, clearance, aperture-line binding and strict solid checks apply. The local Agent command description and the Studio capability message describe the same bound.

- **FAIL, previous Studio.** The selected rational quarter arcs joined. The exact annular preview refused the noncoplanar path and left the document unchanged. The actual refusal uses the arc-plane caption. The first baseline harness waited for a retired caption.
- **PASS, native geometry.** The R12/R18 path has length `15π` mm. Outer R2 and bore R1 give `45π²` mm³. Bore R1.5 gives `26.25π²` mm³. The measured volumes are 444.1321980490213 and 259.07711552859575 mm³. The first centroid is `(10.28230073121304, 15.819718634205481, 3.89798063458148)` mm. Strict topology is one shell of genus 1 with 10 faces, 12 loops, 40 coedges, 20 edges and 12 vertices. Both annular ends and inward-facing bore walls match independent torus and circle evaluations. The four inner and outer shared half-circles have reciprocal uses, two pcurves each, maximum pcurve gap about `1.83e−15` mm and tangent angles below `2e−14` degrees. Their curvature differs across the joins.
- **PASS, actual desktop Studio.** Fifteen actual WebGPU states and fifteen coplanar annular control states pass. Join, exact preview, Apply, all four joint measurements and both actual bore openings pass. Non-tangent path and bore touching the outer wall refuse without changing the model. Bore edit, Undo, Redo, native Save, fresh Open and another bore edit preserve the outer surfaces and reproduce the original native digest when restored.
- **PASS, local Agent.** A stale curve revision refuses. Dry run leaves the source exact. The explicit Studio approval creates the same native solid as the manual command. The first fixed harness reached the proposal but still expected obsolete Describe wording. The final harness checks the current concentric-bore contract.
- **PASS, affected checks.** 259 Kernel, 35 Model and 10 Studio tests. Kernel and Model type checks, focused lint, Studio production build, browser syntax and Git diff check. Focusing the new native test on a scratch loader that restores the disk-only selector produces the expected coplanarity failure.
- **NOT_RUN.** Whole local suites, general fitted path frames, additional accepted path families and other bore profiles, twist/scale and live providers. #10 stays open. First mechanical CAD is 8/10. Whole-product completion is unmeasured.

```sh
node packages/barocss-cad/scripts/tool.mjs build:fast
node --test --test-concurrency=1 packages/barocss-cad/test/exact-*-sweep.test.mjs
pnpm --dir packages/barocss-cad-model test sweep-path-history sweep-agent-remap sweep-history-edit arc-sweep-display arc-sweep-mixed-display toolset tool-contract
pnpm --dir apps/cad-studio test sweep-path-feedback sweep-path-geometry tool-contract-mcp
D1904_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-s-bend-sweep-browser.mjs "$OUT/studio" --orthogonal --annular
D1682_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-s-bend-sweep-browser.mjs "$OUT/coplanar" --annular
pnpm --dir packages/barocss-cad type-check
pnpm --dir packages/barocss-cad-model type-check
pnpm --dir apps/cad-studio build
git diff --check
```
