# D1946 — Keep cleared Outline coordinates local to the input

P1 [row 7](../../roadmap-rows/07.md), [row 12](../../roadmap-rows/12.md) and [row 21](../../roadmap-rows/21.md), [#21](https://github.com/barocss/cad/issues/21). Base `6d9605007f020ebb2ed6a24fa1d889f05ff682a7`. Small input fix.

Outline Point X and Y fields reuse the existing live numeric input behavior. Blank text belongs to the exact active shape and field. No coordinate update or dimension unlock runs while the input is empty. Blur shows the accepted value. Entering a finite number applies the existing coordinate and neighbour rules.

- **FAIL, previous desktop behavior.** Backspace changed Point 1 X from 10 mm to 0 mm, moved the aligned point, and removed two adjacent length locks. Finish changed a 2 mm triangle extrusion from 600 mm³ to 800 mm³.
- **PASS, actual desktop Studio.** The blank X and Y fields leave the outline, both 30 and 20 mm locks, and Undo/Redo availability intact. Blur restores the accepted value. Finish while X is blank preserves both locks and the native 600 mm³ extrusion. An explicit 0 still moves the outline and releases adjacent locks. A valid −5 mm replacement reaches native 900 mm³. Sketch Undo and Redo after another blank return the prior accepted coordinates and leave no extra entry. Document Undo, Redo, Save and fresh Open preserve the correct volume. Existing circle, rectangle, slot number entry and coordinate feedback controls pass.
- **PASS, affected checks.** Three Studio tests. Scoped ESLint, Studio types, production build and diff check pass.
- **NOT_RUN.** Slot Angle input changes, other shape solvers, full local suites and mobile. The wider #21 stays open. First mechanical CAD stays at 8/10. Overall CAD remains unmeasured.

```sh
OUTLINE_POINT_BLANK_SOURCE_FROZEN=1 node apps/cad-studio/test/outline-point-blank-browser.mjs "$OUT/studio"
SKETCH_NUMBER_SOURCE_FROZEN=1 node apps/cad-studio/test/sketch-number-blank-browser.mjs "$OUT/number-control"
SKETCH_COORDINATE_FEEDBACK_FROZEN=1 node apps/cad-studio/test/sketch-coordinate-feedback-browser.mjs "$OUT/coordinate-control"
node apps/cad-studio/scripts/test.mjs sketch-coordinate-feedback
pnpm build
git diff --check
```

The same Outline driver with `--baseline` records the previous coordinate change. Desktop scenes and native measurements stay outside Git.
