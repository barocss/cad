# D1759 — Resize a saved angle-constrained Sketch Chamfer

P1 daily Sketch editing, row 09. [Issue #21](https://github.com/barocss/cad/issues/21). Base `a5aca99229a2284b47d99c3d95d58e642a21084f`.

Read the saved bevel's length, its first joint angle and the authored angle between the two original sides. Recover the equal setback from the length and turn. Use that same recovered size for the Sketch editor, viewport handle and Agent. Keep the right-angle formula exact. Normalize floating-point division noise in the new oblique case so the original D6 is a no-op.

- **FAIL, original Studio capability.** Create the D6 Chamfer from D1758, Save and fresh Open, and select its bevel. The accepted native D6 body is current. Edit Chamfer and its setback handle are absent.
- **PASS, desktop Studio WebGPU.** The editor reads D6. Re-entering 6 leaves Apply disabled. Refuse 100 without changing the document. Set D9 and apply it. Undo, Redo, Save and fresh Open retain both carrier planes, the two angle rules and the side IDs. The physical handle then edits the reopened D9 to D12. Before Apply the accepted document remains at D9. Both new native edge setbacks are 12 mm after Apply.
- **PASS, native and local Agent checks.** Measure both vertical edges against the original 30 mm corner and the original 10 mm Extrude. The D9 local proposal discovers the original D6 by side ID, refuses a stale revision and reproduces the manual D9 feature nodes and native B-rep after explicit Studio approval. Focused Model cases include reflected and reflex geometry, swapped angle rule order, mismatched recipes, crossing, anchor and other constraint refusals, and small valid changes.
- **PASS, affected and control checks.** 19 focused and 50 additional Model tests, 53 Studio tests, Model types, scoped lint, Studio types and production build, driver syntax and Git diff check. 61 existing right-angle discovery and edit results match byte for byte. The original physical right-angle C6 to C8 control reproduces the D1719 native digest `40b2dbef36d61300a322886b40ebb35f2705924408a483ec11c586c862e35c42`. Three passing Studio runs record 30 checkpoints with zero source, page or console errors.
- **FAIL, recovered harness.** The first candidate passed numeric D9 and fresh Open. The drag step retained the prior Chrome page's locator. The final run resolves controls from the current page after Open and verifies the drag and native result.
- **NOT_RUN.** Full local suites, general multi-corner or unqualified-angle resizing, alternate GPU backends, mobile and live providers. First mechanical CAD remains 8/10. Whole-product completion is unmeasured. Issue #21 stays open.

| Equal setback | Native Extrude volume | Native B-rep digest |
| --- | --- | --- |
| 6 mm | 20,892.000000000004 mm³ | `7f318268836989796a5e237e991d434d138200893b558bc5e6613a043019ad7a` |
| 9 mm | 20,757.000000000004 mm³ | `a401f685a70826d513fae4e6c74fbd5d4d2e481041e4b5fa5c268c96269e68a1` |
| 12 mm | 20,568 mm³ | `0d17afe7d73259952403edc7556c80f1906f792ad75a8178d6b27f10b17a9cf3` |

## Reproduction

Use Node 22.19.0, the heavy gate, installed desktop Chrome and Playwright, and external evidence directories. Run the first desktop command on the base with the candidate driver.

```sh
TEST_CONCURRENCY=1 pnpm --dir packages/barocss-cad-model test sketch-chamfer-edit sketch-chamfer-retention
TEST_CONCURRENCY=1 pnpm --dir packages/barocss-cad-model test corner sketch-chamfer-retention revision-pinned-edit
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test sketch-edit-identity sketchIds draft-history scalar-handle-drag
pnpm --dir packages/barocss-cad-model type-check
pnpm exec eslint packages/barocss-cad-model/{src/sketch/chamferEdit.ts,test/sketch-chamfer-edit.test.ts} \
  apps/cad-studio/src/viewport/SketchCornerSizeHandle.tsx apps/cad-studio/test/sketch-oblique-chamfer-browser.mjs
pnpm --dir apps/cad-studio build
node --check apps/cad-studio/test/sketch-oblique-chamfer-browser.mjs
D1759_SOURCE_FROZEN=1 node apps/cad-studio/test/sketch-oblique-chamfer-browser.mjs "$OUT/base" --resize --expect-refused
D1759_SOURCE_FROZEN=1 node apps/cad-studio/test/sketch-oblique-chamfer-browser.mjs "$OUT/candidate" --resize
D1719_SOURCE_FROZEN=1 node apps/cad-studio/test/sketch-chamfer-drag-browser.mjs "$OUT/right-angle-control" --resize-drag
git diff --check
```
