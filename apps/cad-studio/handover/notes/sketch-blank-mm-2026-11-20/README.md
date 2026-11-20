# Empty sketch dimensions (#21)

On main `7ff873555`, deleting Centre X or Diameter with Backspace changed an existing circle. In desktop Chrome, Finish moved the centre from X=11 to X=0 mm or reduced the diameter from 10 to 0.5 mm. The latter changed a 2 mm extrusion from 157.079632679490 to 0.392699081699 mm³.

The shared Rectangle, Circle and Slot mm controls now keep an empty string in the focused field. The draft belongs to the field ID and current shape object. Blur restores the model value. A shape replacement discards the draft. Finite input still edits the shape immediately.

- **PASS, desktop Chrome.** Backspace left the live outline, draft Undo/Redo and finished circle intact. Changing focus restored the prior value. A pending Redo survived deletion. Undo/Redo also restored 10/12 mm while the same input retained focus. An explicit diameter of zero still produced 0.5 mm. Centre X accepted both 0 and −11 mm. Rectangle and Slot width returned to 10 and 8 mm on blur and their finished dimensions matched the drawn points.
- **PASS, native solid.** With the blank diameter the radius stayed 5 mm and the volume was 157.079632679490 mm³. With diameter 12 and centre X=−11 the radius was 6 mm and the volume was 226.194671058465 mm³. The worker volumes, cap samples on both planes and strict closed native solid passed at an absolute tolerance of 1e−8 in the measured units.
- **PASS, Studio build and changed-path lint.** Run `pnpm --filter @barocss/cad-studio-app build` and `pnpm exec eslint apps/cad-studio/src/ui/SketchPanel.tsx apps/cad-studio/test/sketch-number-blank-browser.mjs`.
- **Reproduction.** Set `SKETCH_NUMBER_SOURCE_FROZEN=1`, `PW_DIR` and `CHROME`. Run `node apps/cad-studio/test/sketch-number-blank-browser.mjs <fresh external directory>`. Add `--baseline` with the original panel. Desktop checks cover the shared mm fields only. Other #21 acceptance criteria remain open.
