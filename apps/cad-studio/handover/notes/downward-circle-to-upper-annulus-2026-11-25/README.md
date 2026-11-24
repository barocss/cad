# D1967 — End a downward circular Extrude at the original upper annulus

P1 [row 8](../../roadmap-rows/08.md) and [row 16](../../roadmap-rows/16.md). [#222](https://github.com/barocss/cad/issues/222). Base `d6d72bae8f302ecb24d26c5c874ea86193a3a3f1`. Full geometry change in Model.

A literal circular profile on the exact −Z XY frame can end at the original upper annulus of a forward upright circular Extrude and its current coaxial through Hole. The saved recipe names the current Hole body `n2` and the original stock cap `n1.top`. The existing exact annulus and circle support checks certify both trims.

- **FAIL, previous desktop Studio.** The original upper annulus was refused at the downward target gate.
- **PASS, actual desktop Studio.** Refuse circular footprints tangent to the bore and the outer rim. Preview and apply the clear source. Undo and Redo retain the two exact bodies. A reversed stock height refuses without changing the accepted part. The live stock height edit from 5 to 8 mm changes the post travel from 15 to 12 mm. Save and fresh Open preserve the named cap. Editing its height back to 5 mm after Open restores the original geometry.
- **PASS, independent native geometry.** The R12 target and R4 bore are centred at (10,10) mm. The reflected R3 source is centred at (16,16) mm. Its entire disk clears both rims despite a bounding-square corner outside the target. At target heights 5 and 8 mm, source volumes are 135π and 108π mm³ and source centroids are (16,16,12.5) and (16,16,14) mm. The target volumes are 640π and 1024π mm³ and match the unchanged native prefix. Stations, opposed cap normals, the two-loop original annulus and distinct bodies pass. Near and exact contact cases also pass their expected focused admissions and refusals.
- **PASS, controls and reader.** Actual upward circle-to-lower-annulus and downward circle-to-upper-disk controls pass. Ten prior native inspection records match byte for byte. The previous reader admits both controls and explicitly refuses the new upper annulus binding before replay.
- **PASS, affected checks.** 79 Model and one Studio check, affected types, production Studio build, scoped ESLint and diff check.
- **FAIL, corrected test typing.** The first type check widened an eccentric Hole test tuple to an array. The typed test data pass.
- **NOT_RUN.** General downward annular profiles, STEP, full local suites and mobile. #222 remains open. First mechanical CAD is 8/10 accepted. Overall CAD remains unmeasured.

```sh
D1967_SOURCE_FROZEN=1 node apps/cad-studio/test/annular-face-end-extrude-browser.mjs "$OUT/prior" --downward --baseline
D1967_SOURCE_FROZEN=1 node apps/cad-studio/test/annular-face-end-extrude-browser.mjs "$OUT/studio" --downward
D1861_SOURCE_FROZEN=1 node apps/cad-studio/test/annular-face-end-extrude-browser.mjs "$OUT/lower-control" --circle
D1958_SOURCE_FROZEN=1 node apps/cad-studio/test/reversed-extrude-end-face-browser.mjs "$OUT/disk-control" --disk
node packages/barocss-cad-model/scripts/test.mjs face-end-extrude face-commands profiles-parameters
node apps/cad-studio/scripts/test.mjs extrude-end-face-pick
pnpm --filter @barocss/cad-model type-check
pnpm build
git diff --check
```

The previous-reader check uses the unchanged migration entry with the exact base Face End Extrude guard. Evidence files stay outside Git.
