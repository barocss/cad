# D1277 — Preserve both Loft section references during proposal rebase

2026-11-15 · FEATURE · P0, rows 07 and 16

The proposal stores the feature order at authoring. The existing rebase logic resolves both Loft section indices by stable feature ID before evaluating the same guide controls. The Studio and agent error mapping now explains how to recover when the two rectangles have different sizes.

- **PASS — missing section.** A real local MCP process wrote `P1` for two of three congruent rectangles. In desktop Studio, deleted the second referenced sketch. The unreferenced rectangle occupied its former index. Rebase reported the original missing ID, kept the proposal open, and left zero accepted bodies. Accept was unavailable.
- **PASS — incompatible section.** Changed the original upper sketch width from 10 to 11 mm in History. Rebase refused and explained that the two rectangles need the same width and depth. The proposal, the edited sketch, and the accepted body list remained unchanged.
- **PASS — safe index shift and native file.** Moved the unreferenced sketch earlier in History. The old second section index now named the unreferenced sketch. Rebase mapped the two original section IDs to indices 0 and 2 and retained both guide controls. Preview showed `+819.84 mm³` and zero accepted bodies. After explicit approval, the native and worker volumes were `819.8399999999998 mm³`. Strict B-rep, both guide contacts and the independent side samples passed. Save and fresh Open restored the same native inspection and both section references. Reviewed four screenshots.
- **PASS — regressions.** Model type check, lint, and 37 focused Model tests.
- **FAIL, corrected.** The first product run to reach the width change correctly refused but displayed a generic kernel notice. Added the section-size message and reran Studio. Two earlier test attempts used a locator that did not match the free-sketch History row or the Delete menu item. The corrected driver used the actual UI actions.
- **NOT_RUN.** Full local suites, mobile, paid inference, and broader section types.

## Commands and evidence

Node 22.19.0. The gate serialized the runs. Desktop Studio reported zero page errors, console errors, or source changes over 906 frozen files. Receipt SHA-256 `ced7b384b67560f01cb8fd5fe38e399597d14c2baa9277cd41796d8d40499a8d`. Saved `.bcad` SHA-256 `70d4f0e78b2d7df54ba22c8b77ada7f91cde008b01754f1f6f07ca43730fe6e0`. Approved and reopened native inspection SHA-256 `d15d0c4d7b648d3e38c8fc73596497326edadffb493afb80bb8a3fed6c83346a`.

```sh
D1277_SOURCE_FROZEN=1 node apps/cad-studio/test/two-guide-loft-rebase-browser.mjs <external-evidence>
pnpm --filter @barocss/cad-model type-check
TEST_CONCURRENCY=1 pnpm --filter @barocss/cad-model test loft proposals rebase-moves-ops
pnpm exec eslint packages/barocss-cad-model/src/engine/errors.ts apps/cad-studio/test/two-guide-loft-rebase-browser.mjs
git diff --check
```
