# D1790 — Drag the saved paired duct outlet Offset

P5 advanced modeling, rows 20 and 31. [Issue #17](https://github.com/barocss/cad/issues/17). Base `70e27228f0ea33e0ef522fa72705fff2af2b0f9e`.

Add the distance handle to the saved D1788 outlet Offset when History still owns the original and moved native caps. The original cap sets the signed origin and outward direction. The current and preview caps set the visible position. The editor reuses the existing scalar drag session and only commits at Apply. Typed edits retain both valid signs.

- **PASS, baseline reproduction.** Opening the saved −4 mm Offset in History shows no distance handle. A typed −6 mm preview and Cancel leave the part unchanged.
- **PASS, native ownership and edit.** The guard checks the source signature and the original and current face, body and incidence IDs. The two 2 × 2 mm passages and both groups of 12 native tangent joins stay intact. The drag moves the native cap plane from y=30 to y=28 mm, and the 32 mm² section gives an independent −64 mm³ increment. Native volume changes from 1,645.3096491487372 to 1,581.3096491487358 mm³. Maximum chart gap is 1.066e−14 mm. Moved native body SHA-256 is `4a1a87bcc70f2d58f5a33b64fcc0536a5933379978dbb51bd1f192eeb278ff4a`. Focused tests cover both signs, typed reverse, stale ownership, altered cap and signature, and saved native Open.
- **PASS, actual Studio WebGPU.** Physical pointer steps changed −4 to −6 mm with both a standalone Sweep and the same Sweep retaining the original visible Direct rail. The preview and Cancel kept the document and Undo state. Apply changed only the saved distance. Undo, Redo, the equivalent typed edit, Save and fresh Open reproduced the result. Top orthographic projection measured 36.07 and 33.98 CSS px of travel. The handle-to-cap gap stayed below 0.00004 CSS px through preview and reopen. Pointer-start to settled-preview took 251 and 258 ms in these two recorded runs, including simulated pointer steps.
- **PASS, controls and affected checks.** D1789 returned the same two Agent PNGs. The existing drafted-cap distance handle completed its own physical drag, Cancel, saved edit and fresh Open. The five passing desktop runs recorded 36 snapshots with zero page or console errors and unchanged source capsules. 64 Model tests, 56 Studio tests, changed-file ESLint, Model type check, Studio type check and production build, and Git diff check pass.
- **FAIL, corrected verification attempts.** The first standalone browser driver kept locators from the prior page after fresh Open. The retained-rail run first selected a receipt with an edited aperture. The drafted-cap control initially blocked the font request at DNS, which the console assertion rejected. The first type check needed an explicit type on the test build result. The qualified runs rebind to the current page, read the original Studio-authored rail and serve empty CSS locally for the external font request.
- **NOT_RUN.** Full local suites, other viewport backends, mobile, live providers, pointer sign crossing and nonterminal or generic Offset faces. First mechanical CAD remains at 8/10 accepted. Overall completion remains unmeasured. Issue #17 stays open.

## Reproduction

Use Node 22.19.0, the heavy gate, installed Chrome and Playwright, and external output directories. Run the outlet driver with `--expect-history-handle-absent` on the base Model sources. The retained-rail input is `applied-native-doc.bcad` from the D1787 desktop driver with `--straight-tail --review`. The drafted-cap control uses local Chrome with external hosts disabled and a Playwright request handler that returns empty CSS for the font stylesheet.

```sh
D1788_SOURCE_FROZEN=1 node apps/cad-studio/test/offset-paired-elbow-outlet-browser.mjs "$OUT/drag" --history-handle
D1790_RETAINED_RAIL="$RAIL_RECEIPT/applied-native-doc.bcad" D1788_SOURCE_FROZEN=1 node apps/cad-studio/test/offset-paired-elbow-outlet-browser.mjs "$OUT/rail-drag" --history-handle
D1788_SOURCE_FROZEN=1 node apps/cad-studio/test/offset-paired-elbow-outlet-browser.mjs "$OUT/control-review" --review-outlet
D1254_SOURCE_FROZEN=1 node apps/cad-studio/test/offset-drafted-cap-browser.mjs "$OUT/control-drafted" --history-handle
TEST_CONCURRENCY=1 pnpm --dir packages/barocss-cad-model test paired-elbow-outlet-offset-handle paired-elbow-outlet-offset-evidence offset-face-native offset-drafted-wall native-offset-face
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test offset-cap-feedback offset-collapse-feedback offset-face-launch-view history-feature-editor scalar-handle-drag
pnpm --dir packages/barocss-cad-model exec eslint src/app/{offsetFaceEdit,pairedElbowOutletOffsetHandle}.ts test/paired-elbow-outlet-offset-handle.test.ts
pnpm --dir packages/barocss-cad-model type-check
pnpm --dir apps/cad-studio build
git diff --check
```
