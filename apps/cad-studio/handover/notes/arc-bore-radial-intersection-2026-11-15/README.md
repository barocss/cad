# D1301 — Intersect a circular Sweep with a bore at a radial plane

2026-11-15 · FEATURE qualification · P5, rows 07 and 30

Studio Intersect clips the D1300 exact quarter-arc Sweep at 45° with the radial face of a box. The remaining box faces lie outside the retained bend. The existing analytic Boolean retains the original start cap and creates a planar cut cap. Each cap keeps an inner loop paired with the inward bore walls.

- **PASS — desktop Studio WebGPU.** Selected the Sweep and box and applied Intersect. Edited the upstream bore diameter from 2 to 3 mm while retaining the copied path and Boolean references. Undo, Redo, native Save, fresh Open, and local MCP readback of the saved feature and volume passed.
- **PASS — native geometry.** Each result was one strict solid of genus 1 with eight faces, ten loops, 19 edges, 13 vertices, and 38 coedges. The original cap has four outer edges and two quadratic bore edges. The new cap has five outer edges, including two quadratic pieces of the semicircle, and two quadratic bore edges. The test checks reciprocal coedges, original wall owners, radial planes and analytic profiles at 65 samples per cap edge. Maximum cap-edge profile residual was 1.25e-12 mm. Strict edge-to-surface gap was at most 1.49e-12 mm. Volume agreed with the independent Pappus subtraction to within 1.25e-8 mm³ and with the Studio worker. Native volume was 2140.786232166 → 2082.210770028 mm³. The independent centroid also matched at both sizes.
- **PASS — focused lint and whitespace.** The milestone adds repeatable product-level coverage through the existing Kernel, Model, and Studio entries.
- **NOT_RUN.** Production rebuild for this test-only change, nonradial clipping, Fillet on the toroidal bore, WebGL2, full local suites and mobile. Wider Sweep acceptance remains open in [#10](https://github.com/barocss/cad/issues/10).

## Commands and evidence

Node 22.19.0. The heavy gate serialized the desktop flow. All 908 frozen source files matched after cleanup. No page errors, console errors or worktree changes were recorded.

Receipt SHA-256 `42aaee70e5a6527d2778633b8cade16c39d2ba3b00675d6f5467fda0fabce618`. Native Save SHA-256 `ee46b78deee00a67ff8c94d76c8bc0244952e57b1ee53eec2835f2be982893d5`.

```sh
D1301_SOURCE_FROZEN=1 node apps/cad-studio/test/arc-bore-intersect-browser.mjs <external-evidence>
pnpm exec eslint apps/cad-studio/test/arc-bore-intersect-browser.mjs
git diff --check
```
