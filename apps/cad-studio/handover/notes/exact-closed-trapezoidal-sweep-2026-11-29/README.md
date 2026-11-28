# D2264 — Sweep a radial trapezoid around an exact closed circle

P5 [row 07](../../roadmap-rows/07.md) and [row 30](../../roadmap-rows/30.md) · [#10](https://github.com/barocss/cad/issues/10) · Base `2c9bf43a6`.

- **FAIL, base capability.** Actual Studio created the original R20 four-quarter circular rail. The exact closed Sweep refused the filled trapezoid before Apply.
- **Decision.** Admit one current straight trapezoid with two opposite unequal radial sides at distinct exact axial stations. Keep its authored point order, side IDs and sketch axes. Carry the centre of the section bounds on the rail. The same full native revolution and half-face chart binding used by the triangle produce the trapezoid. The existing rectangle, cavities and circular branches retain their own admission rules.
- **PASS, native geometry.** The section has height 6 mm and one fixed radial side of length 2 mm. A lower width `w` gives `π(118w + 248 − w²)` mm³. The two actual widths 4 and 6 mm measure 2,211.681228127214 and 2,890.2652413026094 mm³. Independent Pappus volume and axial centroid agree with the native checks. The eight faces comprise four planar half-walls, two cylindrical half-walls and two conical half-walls. The sixteen edges have thirty-two matching coedge charts and eight smooth split seams. Clockwise and shifted point order preserve authored side ownership. Radial-Y also passes. Nonradial sides, a displaced axial vertex, holes and axis contact refuse.
- **PASS, actual Studio.** The original Sketch circle and trapezoid preview and Apply as Exact closed circle. The 40 mm contact case keeps the last accepted part. The width edit, Undo/Redo, Save, Close and fresh Open preserve the exact shape and original History owner. The final desktop run froze 1,308 sources with zero console errors.
- **PASS, automated.** Node 22.19.0 passed 293 Sweep, 32 Model and 10 Studio checks. The full kernel run passed 3,344 with 0 failures and 2 existing skips. Kernel, Model and Studio type checks, changed-file lint and the production Studio build passed.
- **NOT_RUN.** General quadrilaterals or closed rails, more than one region, mobile and live models. The wider Sweep issue stays open.

```sh
node packages/barocss-cad/scripts/tool.mjs build:fast
(cd packages/barocss-cad && node --test test/*sweep*.test.mjs)
(cd packages/barocss-cad && node --test test/*.test.mjs)
node packages/barocss-cad-model/scripts/test.mjs sweep-history-edit sweep-agent-remap sweep-path-history toolset tool-contract
(cd apps/cad-studio && node scripts/test.mjs sweep-path-geometry sweep-path-feedback edge-continuity-scope)
bash "$OUT/desktop.sh" baseline baseline
bash "$OUT/desktop.sh" fixed-01
git diff --check
```
