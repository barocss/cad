# D1293 — Intersect a circular-arc Sweep at a radial plane

2026-11-15 · FEATURE qualification · P5, rows 07 and 30

Studio Intersect consumes a native quarter-torus Sweep and a rectangular box. One box face on `x=z` crosses the rotation axis at the 45° station and clips the 90° arc. The other five box faces lie outside the retained segment. The Kernel retains the original start cap and both toroidal carriers and creates a planar cap at the cut.

- **PASS — desktop Studio WebGPU.** Selected the Sweep and box and applied Intersect from the command palette. Editing the Sweep diameter from 4 to 5 mm regenerated the cut and retained the copied arc. The 40 mm limiting diameter was refused and preserved the accepted result. Undo, Redo, Save and fresh Open passed.
- **PASS — native oracle.** Both outputs were strict single solids with four faces, six edges, four vertices and 12 coedges. The two cut-rim edges are degree-2 rational curves with reciprocal coedges and lie on the radial plane and the expected disk circle. Sampled toroidal wall points obey the analytic torus equation. Native quadrature and the Studio worker agree with `5π²r²` within 5.2e-9 mm³ at radii 2 and 2.5 mm. The centroid agrees with the independent section moments. The reopened volume was 308.4251375391778 mm³.
- **NOT_RUN.** Full local suites, mobile, WebGL2, nonradial clipping, production build for this test-only change, and fillets on toroidal Sweep. [Issue #10](https://github.com/barocss/cad/issues/10) remains open.

## Commands and evidence

Node 22.19.0. The final run passed against 906 frozen files with zero page errors, console errors or source changes. Receipt SHA-256 `17344644606f74f728a0b7752b4a599b1d39b273f224969a43d588a2ac787543`. Native Save SHA-256 `fb4a1bdbb7ffc24d01073730ca33ec27b65e5ad7f1a1949043d51dabc8e9314b`.

```sh
pnpm exec eslint apps/cad-studio/test/arc-sweep-intersect-browser.mjs
D1293_SOURCE_FROZEN=1 node apps/cad-studio/test/arc-sweep-intersect-browser.mjs <external-evidence>
git diff --check
```
