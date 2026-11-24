# D1953 — Keep a blank Sketch Plane Angle out of placement

P1 [row 7](../../roadmap-rows/07.md), [row 9](../../roadmap-rows/09.md) and [row 21](../../roadmap-rows/21.md). [#21](https://github.com/barocss/cad/issues/21). Base `5968c57ea12a0df93199fc28c050a069c25723b1`. Small Studio correction.

The Plane Angle field uses the existing numeric draft input. A blank belongs to the exact placement draft. Blur restores its accepted angle. A finite value strictly between −90° and 90° still uses the existing plane placement action.

- **FAIL, previous Studio.** Backspace on 30° immediately made the sketch horizontal. Finish and Extrude used Z=7 instead of the original tilted plane. The native centroid became (20, 16, 8.5) mm while volume stayed 720 mm³.
- **PASS, fixed desktop Studio.** Backspace leaves the accepted 30° placement, 7 mm normal offset and sketch History intact. Blur restores 30°. Finish while the field is blank saves the 30° plane. Explicit 0° and −20° and focused sketch Undo/Redo pass. Document Undo/Redo, Save and fresh Open preserve the edited extrusion.
- **PASS, independent geometry.** The rectangular solid is 20 × 12 × 3 mm. Its eight corners and centroid agree with an independent rigid transform within 1e-8 mm. The 30° centroid is (20, 18.106406461, −0.638784068) mm and the reopened −20° centroid is (20, 12.127910714, 13.459709570) mm. Native and worker volume agree with 720 mm³.
- **PASS, affected checks.** Twenty-five focused Studio tests, the previous Slot angle desktop control, Studio type/production build, scoped ESLint and diff check.
- **NOT_RUN.** General placement and reference qualification, full local suites and other browsers. #21 remains open. First mechanical CAD stays at 8/10. Overall CAD stays unmeasured.

```sh
PLANE_ANGLE_BLANK_SOURCE_FROZEN=1 node apps/cad-studio/test/sketch-plane-angle-blank-browser.mjs "$OUT/baseline" --baseline
PLANE_ANGLE_BLANK_SOURCE_FROZEN=1 node apps/cad-studio/test/sketch-plane-angle-blank-browser.mjs "$OUT/studio"
SLOT_ANGLE_BLANK_SOURCE_FROZEN=1 node apps/cad-studio/test/slot-angle-blank-browser.mjs "$OUT/slot-control"
node apps/cad-studio/scripts/test.mjs rectangle-placement-history sketch-settled-state draft-selection-history slot-placement-history
pnpm build
git diff --check
```

Screenshots and native inspection files stay outside Git.
