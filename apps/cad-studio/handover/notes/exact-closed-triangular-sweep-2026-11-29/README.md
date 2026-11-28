# D2263 — Sweep a straight triangle around an exact closed circle

P5 [row 07](../../roadmap-rows/07.md) and [row 30](../../roadmap-rows/30.md) · [#10](https://github.com/barocss/cad/issues/10) · Base `4317c830b`.

- **FAIL, base capability.** Studio created the R20 circle through Sketch and Make curves. The exact closed Sweep refused the original filled triangle and disabled Apply.
- **Decision.** Carry the centre of the section bounds on the original four-quarter circle. The triangle has three straight sides, no holes and positive radial clearance. Its authored sketch axes align with the radial and binormal axes. Reuse the axis alignment, exact revolve producer and binding for the native half-faces. Keep the original sketch identity, three side tags and path. Six faces form one genus-one solid with 12 edges and 24 bound coedges.
- **PASS, independent geometry.** For a 6 mm high section of base width `w`, Pappus gives `π(120w − w²)` mm³. At 4 and 6 mm, native mass checks give 1,457.6989912656638 and 2,148.849375055418 mm³. The original supports are planar, cylindrical and conical. Native coedge evaluation matches the curves and separates six smooth split seams from six sharp boundaries. Both travel directions and radial-Y preserve the correct support and centroid. The translated triangle has the same native result. Unsupported roll, holes and axis contact refuse. Existing disk, rectangle and cavity cases pass.
- **PASS, actual Studio.** The same R20 Sketch rail previews and applies the exact triangular section. A width of 40 mm is refused with positive-radial-clearance detail and the accepted part remains at width 4 mm. The width 6 mm edit, Undo/Redo and Project Save, Close and fresh Open retain the exact authored ring. The reopened History preserves Exact closed circle. The final source capsule contains 1,308 files, with zero source changes or console errors.
- **PASS, native STEP readback.** Both actual saved solids pass strict internal STEP readback. Area agrees with the independent sum of the planar annulus, inner cylinder and conical frustum to within 1e-8 mm². The actual Studio STEP export command was outside this checkpoint.
- **PASS, affected checks.** Node 22.19.0. 291 Kernel Sweep tests, 32 Model tests, 10 Studio tests, Kernel/Model/Studio types, scoped lint, production Studio build and whitespace. The full Kernel run passed 3,342 tests with zero failures and two existing skips.
- **FAIL, corrected harness.** Early checks used the wrong serialization argument, omitted a required hole tag and looked for the geometry-specific toast title instead of the actual parameter refusal detail. The final native and actual Studio runs qualify the intended inputs and control.
- **NOT_RUN.** Trapezoids, general closed rails, triangular sections with holes, external STEP readers, mobile and live models. Visible Model tessellation remains on the existing renderer path. The wider Sweep issue stays open.

```sh
node packages/barocss-cad/scripts/tool.mjs build:fast
(cd packages/barocss-cad && node --test test/*sweep*.test.mjs)
(cd packages/barocss-cad && node --test test/*.test.mjs)
node packages/barocss-cad-model/scripts/test.mjs sweep-history-edit sweep-agent-remap sweep-path-history toolset tool-contract
(cd apps/cad-studio && node scripts/test.mjs sweep-path-geometry sweep-path-feedback edge-continuity-scope)
bash "$OUT/desktop.sh" baseline-02 baseline
bash "$OUT/desktop.sh" fixed-final-02
git diff --check
```
