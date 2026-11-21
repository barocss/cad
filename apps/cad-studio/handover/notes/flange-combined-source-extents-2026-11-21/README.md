# D1480 — Resize both Sheet extents with the same inherited-radius Flange

P1, row 16, [#20](https://github.com/barocss/cad/issues/20). Base: `bd0600e764231d7228b43163006eb66fe767f094`.

Studio previously allowed a single extent change for the signed rectangular Sheet and terminal full-width inside Flange. The same action can now apply Width and Depth together. The existing admission still requires the plain three-node recipe and numeric dimensions. Both complete parent solids must prove the same named top rim and its semantic side. Full native evaluation must succeed before the one History commit.

## Verification

- **FAIL, original combined edit.** Editing Width 80→100 mm and Depth 50→60 mm before one Apply hit the single-extent guard. The original document, selection, bodies, dirty state, history and both buttons were preserved. The original file opened with its existing reference.
- **PASS, actual desktop Studio.** Create the Flange from the real X-max top edge, with sheet R1.5, 90° and outer length 20 mm. One Apply changes both numeric extents and refreshes only `n1.side1|n1.top` from midpoint [80, 25, 1.5], length 50 mm to [100, 30, 1.5], length 60 mm. Radius remains inherited. One Undo recovers the original document and Redo recovers the combined edit. Save and fresh Open preserve the exact recipe. Reversing both values restores the original document and a second fresh Open preserves it.
- **PASS, independent geometry.** Strict native folded B-rep and Studio Worker volume match the analytic 10578.086256175966 mm³ within 1e-7 mm³. The measured native volume is 10578.086256175977 mm³. The 100 × 60 × 20 mm folded box bounds, two bend radii, native end sections, one flat loop (60 × 117.392920065877 mm), and bend allowance agree with the independent calculation.
- **PASS, controls.** Both single-extent desktop modes pass after the change. 113 focused Studio checks cover all four semantic rim roles and retained refusal of unrelated edits. A combined edit to Width 2 mm and Depth 60 mm reaches full native evaluation, then refuses with `BEND_DOES_NOT_FIT` and leaves the original document intact. Scoped lint, Studio production build with typecheck, browser syntax and diff checks pass.
- **NOT_RUN.** Explicit flange radius, partial or multiple flanges, nonrectangular sources, actual desktop picks on the other three sides, alternate desktop GPU backends, mobile and full local suites. #20 stays open.

Use Node 22.19.0 and the installed desktop Chrome and Playwright. Run heavy checks through the shared gate. Freeze worktree writes during browser runs and retain evidence outside Git.

```sh
node --check apps/cad-studio/test/flange-source-size-history-browser.mjs
git diff --check
node apps/cad-studio/scripts/test.mjs flange-source-size-history flange-source-thickness-history flange-radius-source-history-apply
pnpm exec eslint apps/cad-studio/src/state/{flangeSourceSizeHistory,historyFeatureApply}.ts apps/cad-studio/test/flange-source-size-history.test.ts
pnpm --filter @barocss/cad-studio-app build
cd apps/cad-studio
export FLANGE_SOURCE_SIZE_HISTORY_SOURCE_FROZEN=1
# Observe the original refusal before installing the code change.
node test/flange-source-size-history-browser.mjs "$EVIDENCE/baseline" --both --expect-refused
node test/flange-source-size-history-browser.mjs "$EVIDENCE/combined" --both
node test/flange-source-size-history-browser.mjs "$EVIDENCE/width-only"
node test/flange-source-size-history-browser.mjs "$EVIDENCE/depth-only" --depth
```
