# D1972 — End a downward rectangular Extrude at the original upper annulus

P1 [row 8](../../roadmap-rows/08.md) and [row 16](../../roadmap-rows/16.md). [#222](https://github.com/barocss/cad/issues/222). Base `b0e39a5862c6296a7aedb6bb57e8d315c80c687f`.

A rectangle on the exact −Z XY frame can end at the original upper annulus of one forward upright circular Extrude and its current coaxial through Hole. The same native cap certification and full-footprint clearance checks apply. The reflected rectangle must clear the whole bore, and all four corners must stay inside the outer rim. The saved recipe retains current body `n2` and original cap `n1.top`.

- **FAIL, previous desktop Studio.** The previous target admission refused the same clear rectangle and original upper annulus.
- **PASS, actual desktop Studio.** An overlapping rectangle is refused even when all its corners are outside the bore. Exact bore contact and outer-rim contact are refused. The clear rectangle previews and applies as a separate body. Undo and Redo work. Reversing the target stock is refused. Changing its height from 5 to 8 mm changes the travel from 15 to 12 mm. Save and fresh Open retain the same cap. The inverse stock edit after Open restores the original body.
- **PASS, independent native geometry.** The R13 target and R4 bore are centred at (10,10) mm. The reflected source spans X16–19 and Y12–15 mm. Its four end corners, opposed cap normals and two separate strict bodies pass. Post volumes are 135 and 108 mm³, with centroid Z12.5 and Z14 mm. Stock volumes are 765π and 1224π mm³ and match the unchanged native prefix. The outer contact uses the exact 5–12–13 triangle. Clearance by 0.000001 mm passes the focused bore and outer-rim controls.
- **PASS, retained readers and Studio controls.** Downward circle to upper annulus and upward rectangle to lower annulus still pass. The four native downward-circle records match D1967 byte for byte. The pinned previous reader accepts both controls and explicitly refuses the new rectangle.
- **PASS, affected checks.** 81 Model checks, one Studio pick check, Model and Studio types, production Studio build, scoped ESLint and diff check. The first focused run expected the unsupported polygon refusal at a later guard. Its assertion now checks the actual earlier saved-recipe refusal.
- **NOT_RUN.** Downward polygons, general annular targets, STEP, full local suites and mobile. #222 remains open for broader Extrude-to-face scope. First mechanical CAD is 8/10 accepted. Overall CAD is unmeasured.

```sh
D1972_SOURCE_FROZEN=1 node apps/cad-studio/test/annular-face-end-extrude-browser.mjs "$OUT/prior" --downward-rectangle --baseline
D1972_SOURCE_FROZEN=1 node apps/cad-studio/test/annular-face-end-extrude-browser.mjs "$OUT/studio" --downward-rectangle
D1967_SOURCE_FROZEN=1 node apps/cad-studio/test/annular-face-end-extrude-browser.mjs "$OUT/circle-control" --downward
D1609_SOURCE_FROZEN=1 node apps/cad-studio/test/annular-face-end-extrude-browser.mjs "$OUT/lower-control"
node packages/barocss-cad-model/scripts/test.mjs face-end-extrude face-commands profiles-parameters
node apps/cad-studio/scripts/test.mjs extrude-end-face-pick
pnpm --filter @barocss/cad-model type-check
pnpm --dir apps/cad-studio build
git diff --check
```

The previous-reader check uses the unchanged migration entry with the original Face End Extrude guard. Evidence stays outside Git.
