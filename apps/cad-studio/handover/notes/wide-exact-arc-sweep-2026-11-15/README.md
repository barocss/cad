# D1309 — Extend the exact circular Sweep to 120°

2026-11-15 · FEATURE · P5, rows 07 and 30

Exact circular Sweep now admits one open 30°–120° circle in a single rational quadratic input span. It corrects the middle pole and weight only within the existing whole-curve linear tolerance. A rounded quarter circle that already fit the 90° boundary keeps its single output span. At 120°, native longitudinal edges and curved walls use two 60° rational spans. The middle knot adds no topological edge or vertex. A D-shaped section retains its original walls and two end caps with one offset bore. Studio and local MCP use the same admission rules.

- **PASS — desktop Studio WebGPU and local MCP.** The agent discovered the saved Direct rail and dry-ran the exact Sweep while preserving the source bytes. Studio refused a 121° rail and a bore tangent to the exterior with Apply disabled and the part preserved. Selected the 120° Direct rail and the original sketch, applied the Sweep, and edited the bore diameter from 2 to 3 mm. Undo, Redo, native Save, fresh Open and local MCP readback passed. The rounded display uses the standard mesh at angles above 90°.
- **PASS — native geometry.** Both bore sizes form one strict genus-1 solid with eight faces, ten loops, 18 edges, 12 vertices and 36 coedges. Each cap has two shared quadratic bore edges. At 17 samples per rim edge the maximum plane or radius residual was 9.55e-15 mm. The strict sampled edge-to-surface gap was 3.56e-15 mm. The native volume changed from 5708.763285743 to 5552.562053378 mm³. Independent area moments and Pappus match the measured volume and centroid. The bore edit preserves the outer wall coefficients. Kernel checks include inward torus normals, two-span longitudinal weights, reversed path with matching frame, and the 30°, near-90°, 105° and 120° cases.
- **PASS — regressions and build.** 10 focused Kernel tests and seven Model tests passed. The 90° Studio control saved the same bytes as D1300. Kernel and Model type checks, Kernel fast build and code shape, focused lint and Studio production build passed.
- **FAIL, recovered — first 90° control attempt.** The browser stopped responding before the first UI snapshot. The owned process was terminated. The same driver then passed with the same product sources.
- **FAIL — aggregate docs gate.** The refusal reference has inherited generated drift. The bracketed refusal inputs in the four edited product source files are identical to the baseline. The public inventory gate reports the same first mismatch before and after the change (`coreResultChecks[0].directMembers`, expected 44, found 46). The wider inventory may also differ. This decision retains the baseline inventory and updates the Sweep instructions.
- **NOT_RUN.** Two or more authored input spans, Studio Make curves and Edge as a curve for arcs over 90°, specialized viewport refinement above 90°, downstream blends or cuts at 120°, WebGL2, mobile, paid live inference and full local suites. The broader [Sweep issue](https://github.com/barocss/cad/issues/10) remains open.

## Commands and evidence

Node 22.19.0. The heavy gate serialized the checks. Both passing desktop runs matched 910 frozen sources and recorded zero page errors, console errors or observed file changes.

| Desktop run | Receipt SHA-256 | Native Save SHA-256 |
| --- | --- | --- |
| 120° arc | `7868a20f7c705606627232a8a04591a0dca703724586a3461e110fd2c4609808` | `d4e0aa1107a6228a06cb56a4ba1a8eff6c4e60313c32dfb6352a3effecd2f229` |
| 90° control | `8b79e35c5cba65fbb81571e47768da9dbe021873189961c8d95f804c53b92749` | `01ae351298dae66f993532dc973ae719881410dce2b463359f32a976c7a21bd6` |

```sh
pnpm --filter @barocss/cad type-check
(cd packages/barocss-cad && node scripts/tool.mjs build:fast && node scripts/code-shape.mjs --check)
node --test --test-concurrency=1 packages/barocss-cad/test/{exact-arc-sweep,arc-sweep-bore-fillet}.test.mjs
pnpm --filter @barocss/cad-model type-check
TEST_CONCURRENCY=1 pnpm --filter @barocss/cad-model test arc-sweep sweep-agent-remap
D1309_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-arc-bore-sweep-browser.mjs <external-evidence> --120
D1300_SOURCE_FROZEN=1 node apps/cad-studio/test/exact-arc-bore-sweep-browser.mjs <external-control>
pnpm --filter @barocss/cad-studio-app build --outDir <external-build>
pnpm --filter @barocss/library-docs check:docs
git diff --check
```
