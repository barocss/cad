# D1294 — Fillet the mouth of an exact straight Sweep bore

2026-11-15 · FEATURE qualification · P5, rows 07 and 30

Studio's Edge Fillet accepts the exposed circular mouth of the D1292 through bore. The single displayed rim represents two native half-circle edges. The authored Fillet retains both native names and builds two rational toroidal patches. This qualification uses the 4 mm bore with at least 0.25 mm floor clearance at the larger fillet radius.

- **PASS — desktop Studio WebGPU.** A real pointer pick on the right mouth selected one displayed rim. The preview listed two picked native edges and zero added tangent edges. The flow applied a 0.5 mm fillet, edited it to 0.75 mm in History, then completed Undo, Redo, Save and fresh Open. Both native references survived the radius edit.
- **PASS — native shape and volume.** Each accepted radius gives one strict genus-one solid with ten faces, including two bidegree-2 blend patches. Fifty samples across the two patches agree with the independent toroidal equation and lie within the intended meridian bounds. The native and Studio worker volumes match the first moment of the square-minus-quarter-disk meridian to 0.0000001 mm³. Measured native volumes were 2307.960747965084 and 2307.028594061645 mm³. Reopened volume matched the edited value.
- **NOT_RUN.** Full local suites, mobile, WebGL2, floor-breaking trims in Studio, Fillet on the toroidal Sweep itself, and general Sweep profiles. [Issue #10](https://github.com/barocss/cad/issues/10) remains open.

## Commands and evidence

Node 22.19.0. The desktop run had zero page errors, console errors or source changes through cleanup and verified 905 frozen files. Receipt SHA-256 `fb4059410010610ea3238411c99d7d524a4d913e1d3356d15bae4290d1eceae1`. Native Save SHA-256 `3902ba4f46fb6a2b10669f0fff87867203737a97e1e501e44074b4c7b4dbb295`.

```sh
pnpm exec eslint apps/cad-studio/test/sweep-bore-fillet-browser.mjs
D1294_SOURCE_FROZEN=1 node apps/cad-studio/test/sweep-bore-fillet-browser.mjs <external-evidence>
git diff --check
```
