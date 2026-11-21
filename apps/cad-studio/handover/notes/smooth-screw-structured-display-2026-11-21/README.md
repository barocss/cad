# D1555 — Use a shared display grid on the external-axis Smooth Screw

2026-11-21 · P4 · [Roadmap row 06](../../roadmap-rows/06.md) · [#630](https://github.com/barocss/cad/issues/630) · Base 474c8577a23f49816a24a098c502a1a9d634cf2b.

For the admitted external-axis rectangular Screw, sample all four native rails at the same axial parameters. Use 96 uniform intervals and include the interior knots. Share the exact sampled rails between adjacent walls, with two intervals across each native ruling. Close both planar caps on the same rim vertices and use analytic wall normals. Keep the canonical face and edge owners. If the grid cannot be constructed, use the existing refined packet. The canonical B-rep and shared renderers retain their existing paths.

- **PASS, actual desktop WebGPU at the D1554 camera with AO off.** The live packet contains 1,712 triangles. At 444 witness pixel centres the independent CPU ray comparison finds maximum depth differences of 0.732737 and 0.733717 mm. The q24 maxima were 11.434423 and 9.099457 mm. Face assignments and coverage match the sampled native hits at these witnesses. The upper crease has less visible speckling. Small marks remain, especially at the lower glancing crease. This check measures the uploaded packet with the captured camera and CPU rays. It does not certify additional pixels or exact GPU depth.
- **PASS, actual desktop WebGPU and WebGL2 after native open.** Both renderers pick native edge 8, persistent ID `c0`, on the same Screw. At their fixed comparison camera, the maximum projected rail deviation from 1,001 samples per native rail falls from 1.039655 px for the canonical q8 mesh to 0.163325 px for the live grid. Both report six faces, twelve edges, eight vertices, 4,800.2801298565255 mm³ and native digest `c91e769225d1c08554ca7556ca23ed70b32cbac73530d0f4ee1278889f02a661`. All three frozen Studio runs record zero runtime errors, console errors and source changes.
- **PASS, affected checks.** Scoped ESLint and browser syntax, 24 focused Model tests, Model type check, 43 Studio viewport, display mode and STEP export preparation tests, Studio type check and production build, and Git diff. The focused Screw tests verify the paired directed triangle edges, canonical owners and live grid samples.
- **FAIL, corrected during development.** An initial assertion assumed the regular grid always contains more triangles than the old refined packet. Replace it with the exact expected grid count of 1,552 on the test shape and rerun the affected tests.
- **NOT_RUN.** Exact per-pixel GPU depth, full-view error certification, arbitrary Screw profiles, external CAD and full local suites. #630 remains open.

Use Node 22.19.0 and installed desktop Chrome and Playwright. Run each heavy operation through the local gate. Keep the D1552 saved project, D1554 camera and new evidence outside Git.

```sh
pnpm exec eslint packages/barocss-cad-model/src/engine/{evaluate,loftDisplay,screwDisplay}.ts packages/barocss-cad-model/test/smooth-screw-command.test.ts apps/cad-studio/test/{smooth-screw-depth,smooth-turn-rail-display}-browser.mjs
pnpm --dir packages/barocss-cad-model test smooth-screw-command api-loft-guide smooth-turn-angle smooth-triangular-turn
pnpm --dir packages/barocss-cad-model type-check
pnpm --dir apps/cad-studio test viewport display-mode step-export-preparation
pnpm --dir apps/cad-studio build
node --check apps/cad-studio/test/smooth-screw-depth-browser.mjs
node --check apps/cad-studio/test/smooth-turn-rail-display-browser.mjs
git diff --check
SCREW_DEPTH_FROZEN=1 node apps/cad-studio/test/smooth-screw-depth-browser.mjs "$EVIDENCE/depth" "$D1552/agent-approved-smooth-screw.bcad" --grid "--camera=$D1554/view.json"
python3 -BI apps/cad-studio/test/smooth-screw-depth-oracle.py "$EVIDENCE/depth" --grid
TURN_PROJECT_FROZEN=1 node apps/cad-studio/test/smooth-turn-rail-display-browser.mjs "$EVIDENCE/webgpu" "$D1552/agent-approved-smooth-screw.bcad" --screw
TURN_PROJECT_FROZEN=1 node apps/cad-studio/test/smooth-turn-rail-display-browser.mjs "$EVIDENCE/webgl2" "$D1552/agent-approved-smooth-screw.bcad" --screw --webgl2
```
