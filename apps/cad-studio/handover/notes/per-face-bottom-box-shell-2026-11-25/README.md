# D1957 — Open the bottom of a box with five independent walls

P5 [row 7](../../roadmap-rows/07.md), [row 16](../../roadmap-rows/16.md) and [row 30](../../roadmap-rows/30.md). [#13](https://github.com/barocss/cad/issues/13). Base `42767e039e711e3546b42402b1eb1c44f16bcf56`. Full geometry change.

The exact upright box Shell accepts one original bottom opening. It uses the existing top-opening producer in an exact right-handed cardinal frame with axes +X, −Y and −Z. The top and four side walls keep their names and independent thickness values. The saved feature uses the existing schema 3, opening signature and five wall values.

- **FAIL, previous Studio.** After the camera reached Bottom, the original bottom face offered Uniform wall only. The first baseline run picked before the camera settled. The corrected driver waits for pitch below −1.3 radians.
- **PASS, actual desktop Studio.** Open the original bottom of a 40 × 30 × 20 mm box. Apply five wall thicknesses. Refuse a 20 mm Top wall that collapses the cavity. Reset, edit the Top wall from 6 to 7 mm, Undo, Redo, Save and fresh Open. The original upper and right desktop controls pass. Seven native records match the D1954 records byte for byte.
- **PASS, independent geometry.** With X walls 3/5 mm and Y walls 2/4 mm, the cavity spans `[3,35] × [2,26] × [0,14]` mm before the edit and `[3,35] × [2,26] × [0,13]` mm after it. The native volume is 13248 → 14016 mm³. The centroid is (20.8115942, 15.8115942, 12.4347826) → (20.7123288, 15.7123288, 12.4931507) mm. The solid has one two-loop ring at `n1.bottom`, five original retained supports and five named inner supports, 11 faces, 24 edges, 16 vertices and all 48 pcurves.
- **PASS, actual local Agent approval.** The exact bottom face and five wall values bind to the active revision. The invalid controls refuse. Preview retains the 24000 mm³ box until approval. Approve, edit, Save and fresh Open. A new local MCP session inspects the 14016 mm³ shell.
- **PASS, checks and reader compatibility.** The exact previous reader guard accepts the actual saved top and right files. It explicitly refuses the new bottom file before replay. Eighteen Kernel, 20 Model and 57 Studio checks pass. Native library and Studio production builds, affected types, scoped ESLint and diff check pass.
- **NOT_RUN.** General or multiple-opening Shell, STEP, full local suites and mobile. #13 remains open. First mechanical CAD remains 8/10. Overall CAD stays unmeasured.

```sh
D1957_SOURCE_FROZEN=1 node apps/cad-studio/test/box-wall-shell-browser.mjs "$OUT/studio" --bottom
D1957_SOURCE_FROZEN=1 node apps/cad-studio/test/per-face-shell-agent-proposal-browser.mjs "$OUT/agent" --bottom
D1954_SOURCE_FROZEN=1 node apps/cad-studio/test/box-wall-shell-browser.mjs "$OUT/right" --right
D1938_SOURCE_FROZEN=1 node apps/cad-studio/test/box-wall-shell-browser.mjs "$OUT/top"
pnpm --filter @barocss/cad build:library
node --test packages/barocss-cad/test/{part-shell-walls,prismatic-cap-identity,prismatic-solid}.test.mjs
node packages/barocss-cad-model/scripts/test.mjs shell-walls shell-opening-history
node apps/cad-studio/scripts/test.mjs shell-opening-history parameter-height-finish
pnpm --filter @barocss/cad-model type-check
pnpm build
git diff --check
```

The reader comparison uses the unchanged reader entry and the exact base `shellWalls.ts` guard on the three actual Studio saves. Screenshots and native inspection records stay outside Git.
