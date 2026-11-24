# D1906 — Add a straight tangent outlet to a perpendicular Exact Sweep

P5 [row 08](../../roadmap-rows/08.md) and [row 16](../../roadmap-rows/16.md), [#10](https://github.com/barocss/cad/issues/10). Base `427e5f61a2760f4888a333292dd9dfdff53c8454`.

Admit a native quadratic arc–arc–line path with two perpendicular tangent quarter arcs and one forward tangent straight outlet. Use the existing two-bend Sweep and fit the outlet cylinder in its second exit frame. Check the represented centreline, the native outlet supports, the first-bend separation and full shared sections. Both inner and outer chart lanes keep their original owner at each join. The existing Exact opt-in, copied path and circular section contract apply.

- **FAIL, previous Studio.** Two public Join operations produce the intended 7-pole path. The old preview classifies its result outside the line–arc–line range and refuses without editing the document.
- **PASS, native geometry.** The independent R12/R18 and 10 mm tail fixture has total path length `15π+10` mm. Outer R2 and bore R1 give `45π²+30π = 538.3799776567149` mm³. The original R1 bore's measured centroid is `(10.582997913195083, 18.302091843468194, 7.241943980041914)` mm. The outlet runs from Z18 to Z28 at `(12,30)` mm and retains separate exact outer and inward-facing inner cylinders. One shell has genus 1, 14 faces, 16 loops, 56 coedges, 28 edges and 16 vertices. Eight shared half-circle edges carry reciprocal uses and a pcurve on each face. The measured maximum pcurve gap is about 7.11e−15 mm. The largest measured tangent angle is below 1.5e−13 degrees. Native tests verify length 10→6 mm, both joint planes, forward tangent continuity, untouched bend surfaces, saved replay and refusal of unsupported path and section cases.
- **PASS, actual desktop Studio.** Nine actual WebGPU states and fifteen original perpendicular-annulus control states pass. Exact preview and Apply use the joined route. Bore wall contact refuses. Editing the bore R1→R1.5 keeps the six exterior surfaces and gives `314.054986966417` mm³. Undo/Redo and native Save/fresh Open preserve the actual output and its open outlet. Explicit approval of the local Agent proposal creates the same native digest as the manual command.
- **PASS, affected checks.** 263 Kernel, 35 Model and 10 Studio tests, Kernel and Model type checks, Studio production build, focused lint, browser syntax and Git diff check. The scratch mutation that disables the outlet selector restores the expected line–arc–line refusal in the new native positive test.
- **NOT_RUN.** Whole local suites, general additional path spans, Offset or Replace Face on this outlet, fitted frames, mobile and paid providers. #10 remains open for the wider family. First mechanical CAD is 8/10. Whole-product completion is unmeasured.

```sh
node packages/barocss-cad/scripts/tool.mjs build:fast
node --test --test-concurrency=1 packages/barocss-cad/test/exact-*-sweep.test.mjs
pnpm --dir packages/barocss-cad-model test sweep-path-history sweep-agent-remap sweep-history-edit arc-sweep-display arc-sweep-mixed-display toolset tool-contract
pnpm --dir apps/cad-studio test sweep-path-feedback sweep-path-geometry tool-contract-mcp
D1906_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-perpendicular-outlet-sweep-browser.mjs "$OUT/studio"
D1904_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-s-bend-sweep-browser.mjs "$OUT/quarter-control" --orthogonal --annular
pnpm --dir packages/barocss-cad type-check
pnpm --dir packages/barocss-cad-model type-check
pnpm --dir apps/cad-studio build
git diff --check
```
