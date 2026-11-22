# D1659 — Extract Studio pinned face measurement

P4, row 22. Base `8b92ebc303282dca379b6a95d8cdefd275939826`.

Move pinned face measurement state, document and Worker ownership, capture and native readout into `usePinnedFaceMeasurement.ts`. App supplies the current project and viewport eligibility and clears the pin on document boundaries. App.tsx decreases from 3,431 to 3,427 lines.

- **FAIL, initial baseline driver.** One assertion attempted to convert the displayed `-8 mm` to a number. The driver now checks the full displacement string, including the sign and unit. The product source was unchanged for the second baseline.
- **PASS, affected checks.** Seven Studio tests, scoped ESLint, driver syntax, Studio type check and production build, and Git diff check.
- **PASS, actual desktop Studio WebGPU.** Six flows passed before and after the refactor. Opposite-face measurement through the Inspect tool and context menu, keyboard pin, independent picking, and History editing retain the expected values. The pin follows 8 → 13.25 → 8 → 13.25 mm through edit, Undo and Redo. The corresponding native volumes are 1,920 and 3,180 mm³. Clearing while a real Worker reply is deliberately held persists after delivery. A separately injected Worker failure retires the pin, and Retry permits a new pin. Closing the project and opening a document with the same feature IDs clear the pin.
- **PASS, equivalence and Save/Open.** All 51 captured state records and recorded observations match. This includes documents, bodies, selection, History, readout and overlay when captured. A pin stays available on return from Drawing and Render. The 465-byte browser-project file and the file from Studio Save each have SHA-256 `d5aed626652f09d755a65e2fae23b0df8102e13dc6c76f9d839ff3813136c0e3` before and after. An independent JSON read verifies the expected file. A fresh Open shows neither a pin nor an overlay. Final runs retain 631–1,170 frozen files per flow with zero source changes or page or console errors.
- **NOT_RUN.** Full local suites, WebGL2, mobile and natural Worker failure.

Use Node 22.19.0, the heavy gate, installed Chrome and Playwright (`CHROME`, `PW_DIR`), and output directories outside Git. Run the same desktop commands on the base with the driver assertion correction and on the changed source.

```sh
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test pinned-face-measure measure-pick-hint measure-quantity-text measure-secondary-units-ui
pnpm exec eslint apps/cad-studio/src/{App.tsx,state/usePinnedFaceMeasurement.ts}
node --check apps/cad-studio/test/measure-opposite-face-edit-browser.mjs
pnpm --dir apps/cad-studio build
D928_SOURCE_FROZEN=1 node apps/cad-studio/test/measure-opposite-face-edit-browser.mjs "$OUT/pin" --pin
D957_SOURCE_FROZEN=1 node apps/cad-studio/test/measure-opposite-face-edit-browser.mjs "$OUT/clear-held" --clear-held
D956_SOURCE_FROZEN=1 node apps/cad-studio/test/measure-opposite-face-edit-browser.mjs "$OUT/worker" --worker-retry
D931_SOURCE_FROZEN=1 node apps/cad-studio/test/measure-opposite-face-edit-browser.mjs "$OUT/project" --project
D1038_SOURCE_FROZEN=1 node apps/cad-studio/test/measure-context-pin-browser.mjs "$OUT/context"
PINNED_FACE_FILE_FROZEN=1 node apps/cad-studio/test/pinned-face-save-file-browser.mjs "$OUT/save"
git diff --check
```
