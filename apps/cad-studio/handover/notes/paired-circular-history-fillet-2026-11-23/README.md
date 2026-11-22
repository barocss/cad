# D1715 — Drag one History Fillet radius for two circular rims

P4 Studio interaction, row 20. [Issue #214](https://github.com/barocss/cad/issues/214). Base `2f1d5bc403e274129168fe8b70773f36ad021fed`.

One terminal Constant Fillet rounds the upper and lower open quarter-circle edges of an R8 sector extruded 10 mm. The Model reads two distinct resolved targets and the two native toroidal faces of the accepted result. Studio matches each torus to the original source rim by its centre, axis and radii. Both original native joints must share the original cylindrical wall and have distinct caps. Use the upper rim for one shared handle, independent of target or face order. Both rims keep the original IDs as the radius changes.

## Verification

- **FAIL, base interaction.** The original History handle was `79.2886553699 CSS px` from the projected upper-rim anchor and lacked verified end-on behavior. Desktop Studio typed R0.6 to R1.5 correctly. Both native tori and their volume were present on the base. The first new Studio receipt test also exposed that curved display edges do not carry the straight-edge vertex evidence. The final receipt checks their exact native joint IDs and shared wall.
- **PASS, native geometry.** Each accepted torus has four reciprocal trims, one with each radial face, the cylindrical wall and its own cap. The eight trim IDs are distinct. Top and bottom centers are at Z=10−r and Z=r. Both toroidal radii agree with independent shape measurements. The accepted R1.5 body matches the original typed result.
- **PASS, desktop Studio WebGPU.** A saved feature with lower-first target order places the handle `0.000029223 CSS px` from the independently projected upper-rim anchor. The 1.4 mm guide projects to `0.000005159 CSS px` when end-on. The drag conversion is `55.357488 CSS px/mm`. Physical upward drags preview R1.5 for both rims. Cancel restores R0.6. Apply, Undo, Redo and typing R1.5 agree. Save and fresh Open reproduce the exact native body. History reloads the same upper reference frame. Seven checkpoints recorded zero source changes, page errors and console errors.
- **PASS, desktop controls.** The original single circular History drag and adjacent straight pair History drag still pass through native Save and fresh Open.
- **PASS, affected checks.** Five new Model checks and nine related Model controls passed. Model type check, 45 Studio tests, scoped ESLint, production Studio build and type check, driver syntax and Git diff check passed.
- **NOT_RUN.** New command creation for the circular pair, other curved edge pairs, mobile, WebGL2 and full local suites. The first mechanical CAD baseline remains 8/10. Issue #214 stays open.

The independent paired volume is `160π − π[8(1−π/4)r² − (5/6−π/4)r³]` in mm³.

| Radius (mm) | Native volume (mm³) | Native body SHA-256 |
| --- | ---: | --- |
| 0.6 | 500.74568094072845 | `a55df8c49d4a68dc53deae4006d84280450fc17db1b934e9b543d3366d716590` |
| 1.5 | 491.02762723977276 | `2fa753284327819e9c0148bdfff18bfaad10c7063b5e9843d0397dc20292f9a2` |

## Reproduction

Use Node 22.19.0, the heavy gate, installed desktop Chrome and Playwright, and an external evidence directory. Use `--expect-generic` on the base.

```sh
TEST_CONCURRENCY=1 pnpm --dir packages/barocss-cad-model test native-fillet-torus-pair circular-fillet-handle native-fillet-pair
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test history-fillet-radius-receipt scalar-handle-drag gizmo
pnpm --dir packages/barocss-cad-model type-check
pnpm --dir apps/cad-studio build
pnpm exec eslint packages/barocss-cad-model/src/engine/{nativeFilletTorus,evaluate}.ts packages/barocss-cad-model/test/native-fillet-torus-pair.test.ts apps/cad-studio/src/state/historyFilletRadiusReceipt.ts apps/cad-studio/test/{history-fillet-radius-receipt.test.ts,paired-circular-history-fillet-browser.mjs}
node --check apps/cad-studio/test/paired-circular-history-fillet-browser.mjs
D1715_SOURCE_FROZEN=1 node apps/cad-studio/test/paired-circular-history-fillet-browser.mjs "$OUT/verified"
CIRCULAR_FILLET_HANDLE_FROZEN=1 node apps/cad-studio/test/circular-fillet-radius-handle-browser.mjs "$OUT/single-circular-control" --history
FILLET_END_ON_SOURCE_FROZEN=1 node apps/cad-studio/test/fillet-end-on-handle-browser.mjs "$OUT/straight-pair-control" --history-adjacent
git diff --check
```
