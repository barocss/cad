# D1976 — End a downward polygonal Extrude at the original upper disk

P1 [row 8](../../roadmap-rows/08.md) and [row 16](../../roadmap-rows/16.md). [#222](https://github.com/barocss/cad/issues/222). Base `1b93ea21f9ce1b825073f44188e972e0717ffecb`.

A literal straight convex polygon of three to eight points on the exact −Z XY frame can extrude to the original upper disk of an intact forward circular stock. The source projection reflects its local Y coordinate. The existing native disk certification checks every actual projected vertex. The convex polygon reaches its maximum distance from the disk centre at a vertex. The new polygon admission is specific to this upper disk.

- **FAIL, previous desktop capability.** Studio offers only Fixed distance for the same downward polygon source.
- **PASS, actual Studio.** Pick the original upper disk and apply the separate triangular Extrude. The stock height changes from 5 to 8 mm and travel from 15 to 12 mm. Undo, Redo, browser-project Save and fresh Open retain the same source and cap. A subsequent stock edit still rebuilds the post. Reversed or unreachable target edits and an exact rim contact are refused.
- **PASS, independent native geometry.** The translated and reflected vertices are (2,10), (11,2), (16,16) mm. All fit inside the R10 disk centred at (10,10). The unused bounding corner (2,2) lies outside. The independent area is 83 mm² and XY centroid (29/3, 28/3) mm. Native volumes are 1245 and 996 mm³. Both source windings produce the same physical geometry. The cap normals oppose each other, all six endpoint coordinates match and the original target is unchanged. Exact contact at (16,18) refuses. A 0.000001 mm inward change clears it.
- **PASS, retained behavior.** Seven native records of the actual reversed rectangle control match D1964 byte for byte. The previous reader accepts the rectangle and explicitly refuses the newly saved downward polygon. The new binding uses the same recipe fields.
- **PASS, affected checks.** 83 Model checks, one Studio pick check, Model and Studio types, Studio production build, scoped ESLint and diff check. The first Model run still classified every downward polygon as unsupported. The negative test now uses a collinear polygon. The first rim check found the generic error panel and needed to expand Kernel detail.
- **NOT_RUN.** Downward polygon-to-annulus, downward polygon-to-rectangle, general target families, STEP, full local suites and mobile. #222 remains open. First mechanical CAD is 8/10. Overall CAD is unmeasured.

```sh
D1976_SOURCE_FROZEN=1 node apps/cad-studio/test/reversed-extrude-end-face-browser.mjs "$OUT/prior" --polygon-disk --baseline
D1976_SOURCE_FROZEN=1 node apps/cad-studio/test/reversed-extrude-end-face-browser.mjs "$OUT/studio" --polygon-disk
D1976_SOURCE_FROZEN=1 node apps/cad-studio/test/reversed-extrude-end-face-browser.mjs "$OUT/rim" --polygon-disk --rim-contact
D1964_SOURCE_FROZEN=1 node apps/cad-studio/test/reversed-extrude-end-face-browser.mjs "$OUT/rectangle-control" --rectangle-disk
node packages/barocss-cad-model/scripts/test.mjs face-end-extrude face-commands profiles-parameters
node apps/cad-studio/scripts/test.mjs extrude-end-face-pick
pnpm --filter @barocss/cad-model type-check
pnpm --dir apps/cad-studio build
git diff --check
```
