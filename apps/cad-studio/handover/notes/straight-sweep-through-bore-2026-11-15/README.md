# D1292 — Cut a through bore with an exact straight Sweep

2026-11-15 · FEATURE qualification · P5, rows 07 and 30

Use a circular disk and the Exact straight path representation to build a separate tool solid. Select the 20 × 16 × 8 mm box first and the Sweep second, then run Subtract. The current analytic Boolean already consumes this native pair. The saved Subtract references the box and Sweep, and an edit to the Sweep diameter regenerates the cut.

- **PASS — desktop Studio WebGPU.** Created the Sweep and Subtract through ordinary commands. Editing the Sweep diameter from 4 to 5 mm changed the through bore. A 6 mm diameter would touch the bottom face. The Kernel refused that non-manifold result and Studio retained the 4 mm bore. Undo, Redo, Save and Open in a fresh context passed. The reopened body volume was 2167.30091830127 mm³.
- **PASS — native oracle.** Both accepted diameters produced one strict genus-one solid with eight faces, ten loops, 18 edges and 12 vertices. Two native cylinder carriers and four rational arcs agree with the bore equation about `(y,z)=(7,3)`. The entry and exit arcs lie on `x=0` and `x=20`. The native and Studio Worker volumes agree with `2560 − 20πr²`. The centroid agrees with the box and removed-cylinder first moments within 0.0000001 mm per axis.
- **FAIL, corrected.** The first browser driver waited for a Subtract dialog. The existing Subtract command applies directly when the selection has two bodies. The final driver waits for the committed node.
- **NOT_RUN.** Full local suites, mobile, WebGL2, nonperpendicular cuts, Boolean on circular-arc Sweep, and downstream Fillet. [Issue #10](https://github.com/barocss/cad/issues/10) remains open.

## Commands and evidence

Node 22.19.0. The final run passed against 906 frozen files and had zero page errors, console errors or source changes. Receipt SHA-256 `f3a7b1adf0ece30cf4d0eded54f3ca797f5562470d14e9756318b3117e8bcf8a`. Native Save SHA-256 `0ee095c6dcabb21b31c7c0998be39d3d36417c1b09e371788b860f7bdb19d214`.

```sh
pnpm exec eslint apps/cad-studio/test/sweep-boolean-browser.mjs
D1292_SOURCE_FROZEN=1 node apps/cad-studio/test/sweep-boolean-browser.mjs <external-evidence>
git diff --check
```
