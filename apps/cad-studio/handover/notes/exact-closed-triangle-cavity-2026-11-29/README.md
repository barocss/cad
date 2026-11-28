# D2275 — Sweep a triangular ring with a sealed rectangular cavity

P5 [row 07](../../roadmap-rows/07.md) and [row 30](../../roadmap-rows/30.md) · [#10](https://github.com/barocss/cad/issues/10) · Base `f78fe797e`.

- **FAIL, base capability.** Headed Studio opened the original authored straight triangle and rectangular void, drew an R20 closed native rail and refused Exact Sweep. Apply stayed disabled and the source remained accepted.
- **Decision.** Reuse the exact hollow Revolution and the D2266 convex-wall clearance check for one axis-aligned rectangular cavity. Check the shell sizes in producer order. Bind all six exterior and all eight inward cavity half-faces against their original charts. Existing straight rectangle, trapezoid and filled triangle keep their original admission, dimensions and reference names.
- **PASS, independent native evidence.** The area 12 mm² triangle at centroid radius `20 − 2/3` gives `464π` mm³. The area 1 mm² rectangular void at radius 19 subtracts `38π` mm³. The original strict B-rep retains one body, two closed shells, 14 faces, 28 edges and 56 bound coedges. Signed native shell quadrature agrees with both independent volumes. Each of seven authored side names owns two half-faces. Reversed winding, the radial-Y frame and exact saved B-rep replay pass. Sloping-wall crossing, contact, sub-tolerance wall clearance, rotated rectangular or circular holes and more than one hole refuse.
- **PASS, actual desktop.** Preview, Cancel and Apply use the original Sketch and exact closed rail. Editing the cavity's right coordinate from −0.5 to 0 mm updates the native net volume from 1,338.318470429 to 1,276.272015521 mm³, and the world axial centroid from 0.992957746 to 0.968307692 mm. Both values match the independent section-moment calculation. A crossing edit to 1.5 mm is refused with the accepted document intact. Undo/Redo and Save, Close and fresh Open retain the same native B-rep. The WebGPU Y section displays both cavity cuts after fresh Open. No page or console errors, writes to frozen sources or downloads.
- **FAIL, test driver.** Two intermediate desktop attempts stopped after successful Apply at an obsolete trapezoid centroid assertion in the driver. The final run removed that assertion and checks both native volume and the triangle centroid against independent expressions.
- **PASS, code review and mutations.** Independent source review checked shell order, native side names, retained admission and both analytic moments. A scratch inspector that requires uniform shell sizes fails the accepted original. A second scratch inspector that bypasses the clearance guard loses the original crossing diagnostic. The repository was unchanged during both mutations.
- **PASS, automated.** Node 22.19.0 passed 297 Sweep, 32 Model and 10 Studio tests. Full kernel passed 3,348 with zero failures and 2 existing skips. Kernel, Model and Studio type checks, changed-file lint and the Studio production build passed.
- **NOT_RUN.** General cavities, free-form closed paths, mobile, STEP or external exchange for this newly supported profile. Wider #10 acceptance remains open.

```sh
bash "$OUT/desktop.sh" baseline baseline
bash "$OUT/focused.sh"
bash "$OUT/desktop.sh" fixed-r2 fixed
bash "$OUT/validate.sh"
node "$OUT/mutate.mjs"
git diff --check
```
