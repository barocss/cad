# D1771 — Extract Studio workspace navigation

P4 Studio maintenance, row 22. [Issue #44](https://github.com/barocss/cad/issues/44). Base `0ae26863160601b60a8e9691eff19d8f5d23e379`.

Move Model, Drawing, Render and Sketch transition rules into the existing workspace-exit module. App passes the state changes and reads the live feature-editor draft at transition time. Keep command and editor draft detection, destination focus, the order of state changes and document ownership. App.tsx goes from 3,089 to 3,077 lines.

- **PASS, actual desktop Studio, Sketch draft.** Keep editing from each of Model, Drawing and Render. The original input regains focus, and the fixed corner and driving length stay in the draft. Finish once and extrude the 20 × 12 mm profile by 18 mm. The independent volume is 4,320 mm³. Explicitly discard a second draft. An empty sketch exits directly.
- **PASS, actual desktop Studio, feature draft.** Keep a 48 mm Box width through the Drawing, Sketch and Render requests. Apply the retained Box at 18 mm height for 27,648 mm³. Undo and Redo reproduce the expected history. Discard a 60 mm draft explicitly. When both drafts are present, keep both together and discard both with one confirmation.
- **PASS, before and after.** Eleven captured JSON states match byte for byte. The eleven receipt observations match exactly. The physical oracle input and output also match byte for byte. Both desktop flows report zero page, console or frozen source errors in both runs.
- **PASS, affected checks.** 36 Studio tests, scoped ESLint, Studio production build with types and Git diff check. The build emits its existing bundler warnings.
- **FAIL.** None in the selected checks.
- **NOT_RUN.** Full local suites, alternate GPU backends, live providers and mobile. Issue #44 remains open. First mechanical CAD remains 8/10. Whole-product completion remains unmeasured.

## Reproduction

Use Node 22.19.0, the heavy gate, installed desktop Chrome and Playwright, and external evidence directories. Run both desktop commands on the base and the candidate with separate output directories.

```sh
D663_SOURCE_FROZEN=1 node apps/cad-studio/test/sketch-mode-exit-browser.mjs "$OUT/sketch" --fixed
D686_SOURCE_FROZEN=1 node apps/cad-studio/test/feature-mode-exit-browser.mjs "$OUT/feature" --fixed
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test history-feature-editor draft-selection-history
pnpm exec eslint apps/cad-studio/src/App.tsx apps/cad-studio/src/ui/useWorkspaceModeExit.tsx
pnpm --dir apps/cad-studio build
git diff --check
```
