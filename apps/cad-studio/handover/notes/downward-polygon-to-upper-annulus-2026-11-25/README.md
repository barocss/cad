# D1977 — End a downward polygonal Extrude at the original upper annulus

P1 [row 8](../../roadmap-rows/08.md) and [row 16](../../roadmap-rows/16.md). [#222](https://github.com/barocss/cad/issues/222). Base `aed04a193885cd1f033106b5f6fd04b5627376a7`.

A literal downward convex polygon can end at the original upper annulus of one forward upright circular Extrude and its current coaxial through Hole. The reflected world vertices feed the existing exact segment and interior bore test and the native outer-rim test. The saved recipe names body `n2` and original cap `n1.top`.

- **FAIL, previous desktop Studio.** The previous target admission refuses the same clear polygon and original annulus.
- **PASS, actual desktop Studio.** A polygon is refused when its vertices all clear the bore but an edge crosses it. Exact edge contact with the bore and exact vertex contact with the outer rim also refuse. The clear polygon previews and applies as a separate solid. Undo, Redo, target edits, Save and fresh Open retain the binding. The accepted 5 to 8 mm stock edit reduces post travel from 15 to 12 mm. A later reverse stock edit is refused and a valid edit back restores the original result.
- **PASS, independent native geometry.** The R13 outer radius and R4 bore are centred at (10,10) mm. The reflected triangle is (16,12), (12,17), (19,17), with area 17.5 mm² and XY centroid (47/3, 46/3) mm. Its minimum bore distance is 38/√41 mm and maximum corner radius √130 mm. Both native windings give 262.5 and 210 mm³. The two cap normals oppose each other, all reflected endpoint coordinates match, and the target retains its two-loop cap and native prefix. The exact tangencies refuse. The limited inward and outward clearance controls pass at 0.000001 mm.
- **PASS, retained workflows and reader.** The downward rectangle and upward annular polygon both pass actual Studio. Four rectangle native records match D1972 byte for byte. The pinned previous reader accepts the rectangle and D1976 polygon-to-disk references. It explicitly refuses the newly saved polygon-to-annulus binding.
- **PASS, affected checks.** 85 Model checks, one Studio pick check, Model and Studio types, Studio production build, scoped ESLint and diff check.
- **NOT_RUN.** General annular targets, other new frames, STEP, full local suites and mobile. #222 remains open. First mechanical CAD is 8/10. Overall CAD is unmeasured.

```sh
D1977_SOURCE_FROZEN=1 node apps/cad-studio/test/annular-face-end-extrude-browser.mjs "$OUT/prior" --downward-polygon --baseline
D1977_SOURCE_FROZEN=1 node apps/cad-studio/test/annular-face-end-extrude-browser.mjs "$OUT/studio" --downward-polygon
D1972_SOURCE_FROZEN=1 node apps/cad-studio/test/annular-face-end-extrude-browser.mjs "$OUT/rectangle-control" --downward-rectangle
D1621_SOURCE_FROZEN=1 node apps/cad-studio/test/annular-face-end-extrude-browser.mjs "$OUT/upward-control" --polygon
node packages/barocss-cad-model/scripts/test.mjs face-end-extrude face-commands profiles-parameters
node apps/cad-studio/scripts/test.mjs extrude-end-face-pick
pnpm --filter @barocss/cad-model type-check
pnpm --dir apps/cad-studio build
git diff --check
```
