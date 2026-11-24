# D1954 — Set each wall thickness on a box with one side open

P5 [row 7](../../roadmap-rows/07.md), [row 16](../../roadmap-rows/16.md) and [row 30](../../roadmap-rows/30.md). [#13](https://github.com/barocss/cad/issues/13). Base `4d1d5204f201baf94a177cb974d0c97a1f623fbe`. Full geometry change.

An original upright cardinal box extrusion accepts the same five named wall thicknesses with one lateral face open. The exact cardinal coordinate permutation reuses the existing top-opening producer and preserves a single two-loop ring. The world upright cavity uses the same exact face supports for mass and downstream consumption. The document retains schema 3, the opening name, five wall values and six original signatures.

- **FAIL, previous Studio.** An original lateral face offered only the Uniform wall input.
- **PASS, actual desktop Studio.** Create right-open and front-open shells from the same 40 × 30 × 20 mm box. Each offers five kept faces including Top wall. A 16 mm top wall with a 4 mm bottom collapses the cavity and refuses. Undo/Redo, Save and fresh Open pass after a valid 6→7 mm top wall edit. The existing upper-opening desktop control gives the same four native inspection records byte for byte as D1938.
- **PASS, independent geometry.** The original right cavity spans [3,40] × [2,26] × [4,14] mm and the original front cavity spans [3,35] × [0,26] × [4,14] mm. Their volumes are 15120 and 15680 mm³ after subtraction from the outer box. The edited volumes are 16008 and 16512 mm³. Both representations match closed-form volume and centroid within 1e-7. All four lateral directions strictly validate with one genus-zero shell, 11 faces, 24 edges, 16 vertices and 48 pcurves. Each kept wall retains its original exterior and named inner support. The lower opening still refuses.
- **PASS, compatibility and affected checks.** The exact prior reader guard accepts the actual top-open file and refuses both actual lateral files. Eighteen Kernel, six Model and 57 Studio checks, library and Studio production builds, affected types, scoped ESLint and diff check pass.
- **NOT_RUN.** General Shell and STEP qualification, multiple openings, Agent proposal integration, full local suites and mobile. #13 remains open. First mechanical CAD stays 8/10. Overall CAD stays unmeasured.

```sh
D1954_SOURCE_FROZEN=1 node apps/cad-studio/test/box-wall-shell-browser.mjs "$OUT/baseline" --right --baseline
D1954_SOURCE_FROZEN=1 node apps/cad-studio/test/box-wall-shell-browser.mjs "$OUT/right" --right
D1954_SOURCE_FROZEN=1 node apps/cad-studio/test/box-wall-shell-browser.mjs "$OUT/front" --front
D1938_SOURCE_FROZEN=1 node apps/cad-studio/test/box-wall-shell-browser.mjs "$OUT/top"
pnpm --filter @barocss/cad build:library
node --test packages/barocss-cad/test/{part-shell-walls,prismatic-cap-identity,prismatic-solid}.test.mjs
node packages/barocss-cad-model/scripts/test.mjs shell-walls shell-opening-history
node apps/cad-studio/scripts/test.mjs shell-opening-history parameter-height-finish
pnpm --filter @barocss/cad-model type-check
pnpm build
git diff --check
```

The previous-reader check bundles the unchanged reader entry with the exact `shellWalls.ts` guard from the base SHA. It reads the three actual Studio files. Evidence files stay outside Git.
