# D2111 — Draft an original cylinder on a cardinal sketch plane

P5 [row 07](../../roadmap-rows/07.md) and [row 30](../../roadmap-rows/30.md) · [#14](https://github.com/barocss/cad/issues/14) · Base `2d495abc5b367ab912718db08cd9bbbd4e12f445`.

An original circular extrusion with an exact non-XY cardinal frame now accepts signed axial face Draft. Studio resolves a complete wall pick to both native half-face names, selects the corresponding world axis, and uses either a body end or a fixed world coordinate. The kernel proves the authored placement and permutes the original B-rep into the axial frame. It returns unchanged world records directly and preserves every original coedge and parameter curve. Only the new witnessed placement permits a 64-machine-epsilon bound on dimensionless cap UV reconstruction. Stored coefficients and the exact admission used by Offset are unchanged.

## Verification

- **PASS, baseline reproduction.** Desktop Chrome WebGPU selects the original wall of the YZ cylinder. Draft reports that it requires flat side faces and preserves the source. The baseline freezes 1,271 files with zero source changes, runtime errors or console errors.
- **PASS, actual desktop candidate and control.** A radius-10 mm circle on the YZ sketch plane extrudes between X = 13 and 33 mm. The radius and the axis through Y = 32 and Z = 23 mm remain fixed at neutral X = 21 mm. At +10°, Preview, Cancel and Apply pass. The +44° edit refuses axis collapse and preserves the accepted result. A −10° edit, Undo, Redo, Save and fresh Open pass. The full Draft editor restores the +X pull. Original incidence and parameter curves compare exactly, and the reopened digest matches the saved result. The corresponding original XY cylinder with +Z pull passes the same flow at neutral Z = 11 mm. Both runs freeze 1,271 files with zero source changes, runtime errors or console errors.
- **PASS, independent native geometry.** For +X pull, `R(x) = 10 − tan(θ)(x − 21)`. The independent frustum volumes are 5,912.958606927207 and 6,799.274682484619 mm³ at +10° and −10°. Native discrepancies are below 1 × 10⁻¹¹ mm³. The independent axial centres are X = 21.794935208007374 and 24.124595889412074 mm. Native tests exercise 16 exact non-XY frames in 64 signed cases, three neutral stations on YZ, strict closed topology, exact fixed-cap records, independent mass properties and cold reload. They also refuse incomplete walls, wrong pull, ambiguous near-cardinal source frames, axis collapse and the changed trim control. Two prior Z Draft hashes and two prior planar Draft hashes match.
- **PASS, affected checks.** 128 Kernel, 37 Model and 88 Studio tests pass. Kernel emit, three type checks, scoped ESLint, browser driver syntax, diff check and Studio production build pass on Node 22.19.0.
- **FAIL, corrected checks.** The first desktop candidate looked for Pull in the compact History editor after successful native reopen. The final run enters the full Draft editor and confirms Pull there. The first Model regression supplied an automatic mode with a fixed value. The corrected test switches to fixed mode before asserting the persisted coordinate.
- **NOT_RUN.** Arbitrary sketch planes, explicit placed XY frames, a cap-mode switch in the full History editor, archived incomplete-wall recipes, broader Draft families, full local suites, mobile and live providers. The native coverage for all signed axes and frames is wider than the two desktop fixtures. First mechanical CAD is 8/10 accepted. Whole CAD completion is unmeasured. [#14](https://github.com/barocss/cad/issues/14) remains open.

```sh
# Node 22.19.0. Use the heavy gate and freeze source during each desktop run.
CYLINDRICAL_WALL_DRAFT_FROZEN=1 node apps/cad-studio/test/cylindrical-wall-draft-browser.mjs "$OUT/baseline" axial-x --baseline
node packages/barocss-cad/scripts/tool.mjs build:fast
CYLINDRICAL_WALL_DRAFT_FROZEN=1 node apps/cad-studio/test/cylindrical-wall-draft-browser.mjs "$OUT/candidate-final" axial-x
CYLINDRICAL_WALL_DRAFT_FROZEN=1 node apps/cad-studio/test/cylindrical-wall-draft-browser.mjs "$OUT/world-z-control"
node --test --test-concurrency=1 packages/barocss-cad/test/{draft-cardinal-circular-wall,draft-circular-wall,drafted-extrusion,drafted-cap-offset,bored-cap-offset,circular-wall-offset,box-wall-replacement,prismatic-cap-identity}.test.mjs
pnpm --dir packages/barocss-cad-model test draft-command draft-angle offset-drafted-wall toolset tool-contract
pnpm --dir apps/cad-studio test draft toolset-mcp tool-contract-mcp
pnpm --dir apps/cad-studio exec vite build --outDir "$OUT/studio-dist"
```
