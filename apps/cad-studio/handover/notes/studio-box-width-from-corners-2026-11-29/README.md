# D2258 — Match Box width from two native viewport corners

P5 [row 07](../../roadmap-rows/07.md) and [row 31](../../roadmap-rows/31.md) · [#629](https://github.com/barocss/cad/issues/629) · Base `16c7c8dd6`.

- **FAIL, base capability.** The two native corner picks were valid in actual Studio. The Selection inspector displayed both coordinates and had no width edit for them.
- **Decision.** Offer Match Box Width when the first pick is an original +X corner of the first authored Box and the second pick belongs to the other independent authored Box. The two picks must belong to the current native solids. Their exact X values set the initial width in the existing preview and Apply session. The action edits the original Box footprint, with only Width X in the command. The Agent and Studio share the authored corner check. This is a one-time match.
- **PASS, actual desktop.** Picked source `[14.25, -4.5, 8.125]` mm and reference `[32.75, 9, -2]` mm through the viewport. Same-body and reversed roles offered no match action. Preview showed width 30.5 mm without changing the stored part. Cancel retained both Boxes and their selection. Apply, Undo, Redo, Project Save, Close, reload and Open passed. The base and candidate matched their 1,379 and 1,381 frozen source files. Both runs had zero console errors.
- **PASS, native ownership.** Source X remained 2.25 mm on the fixed side and became 32.75 mm on the edited side. All Y/Z coordinates and four feature IDs remained. The source volume is 1,464 mm³. The reference native result is byte-identical. Both originals retain their authored Box commands and valid strict solids. The reopened native result matches the applied result.
- **PASS, affected checks.** Node 22.19.0 reported 11 Model and 12 Studio tests. Model and Studio type checks, affected lint, production Studio build and whitespace passed.
- **NOT_RUN.** Other stock, placed parts, both source orders, general deformation, full local suites, mobile and live agents. The wider #629 scope stays open.

```sh
node packages/barocss-cad-model/scripts/test.mjs box-vertex-width-agent vertex-move-agent edge-rotate-agent
(cd apps/cad-studio && node scripts/test.mjs vertex-pick-filter history-editor command-apply)
node node_modules/vite/bin/vite.js build apps/cad-studio --outDir "$OUT/dist"
git diff --check
```
