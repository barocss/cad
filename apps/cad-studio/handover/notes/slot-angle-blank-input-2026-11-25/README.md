# D1951 — Keep a blank Slot angle out of sketch geometry

P1 [row 7](../../roadmap-rows/07.md), [row 9](../../roadmap-rows/09.md) and [row 21](../../roadmap-rows/21.md). [#21](https://github.com/barocss/cad/issues/21). Base `c70e4846020ac9c48a4521402c53d0f9438e5d1e`. Small Studio correction.

The Slot Angle field uses the Sketch panel's existing numeric draft input. Clearing the field leaves the current sketch geometry intact. Blur restores the accepted angle. A finite explicit value still uses the existing endpoint calculation. The draft belongs to the exact current shape and field.

- **FAIL, previous Studio.** Backspace on 30° reset the field and outline to 0°. Finishing moved the actual second cap center from (40.310889132, 32.5) to (45, 15) mm. Volume stayed unchanged, so the endpoint and centroid reveal the defect.
- **PASS, fixed desktop Studio.** A blank input keeps the outline and sketch Undo/Redo state. Blur and Finish preserve 30°. Explicit zero rotates to 0°. Replacing it with −20° gives (42.889241728, 3.029294984) mm. Sketch and document Undo/Redo pass. The reopened native part keeps both exact cap centers, R4, the original feature references and 990.796447372 mm³, within 1e-8 of the independent (3(2×4×35 + π×4²)) volume.
- **PASS, affected checks.** Twenty-one focused Studio checks, the actual prior Slot precision and numeric Sketch controls, Studio type/production build, scoped ESLint and diff check.
- **NOT_RUN.** Plane angle, disconnected sketch families, other browsers and the full local suite. #21 stays open. First mechanical CAD is 8/10. Overall CAD completion is unmeasured.

```sh
SLOT_ANGLE_BLANK_SOURCE_FROZEN=1 node apps/cad-studio/test/slot-angle-blank-browser.mjs "$OUT/baseline" --baseline
SLOT_ANGLE_BLANK_SOURCE_FROZEN=1 node apps/cad-studio/test/slot-angle-blank-browser.mjs "$OUT/studio"
SLOT_LENGTH_ANGLE_PRECISION_SOURCE_FROZEN=1 node apps/cad-studio/test/slot-length-angle-precision-browser.mjs "$OUT/angle-precision" --angle
SKETCH_NUMBER_SOURCE_FROZEN=1 node apps/cad-studio/test/sketch-number-blank-browser.mjs "$OUT/circle-control"
node apps/cad-studio/scripts/test.mjs slot-centre slot-width slot-endpoint slot-placement-history
pnpm build
git diff --check
```

Actual screenshots and native inspection files stay outside Git.
