# D1481 — Keep an explicit Flange radius during a rectangular Sheet resize

P1, row 16, [#20](https://github.com/barocss/cad/issues/20). Base: `6901ebfcce838f1cd52390054cedf70f6f9e811a`.

Apply the D1480 source-extent proof when the same full-width terminal inside Flange has a positive numeric radius of its own. The existing recipe check verifies both old and new sheet dimensions and the original edge signature. The update replaces only the verified rim signature after both complete parent solids prove the same side. A final native evaluation verifies the resulting fold before History accepts it.

## Verification

- **FAIL, original Studio workflow.** Width 80→100 mm and Depth 50→60 mm were refused on the signed Flange with explicit R2.5 and Sheet default R1.5. The original document, shape, selection, dirty state and History remained intact.
- **PASS, actual desktop Studio.** Pick the original X-max rim and author R2.5 in the Flange command. One Apply changes both source dimensions and updates `n1.side1|n1.top` to midpoint [100, 30, 1.5] and length 60 mm. After fresh Open, the Flange editor reports Own radius and 2.5 mm while the Sheet recipe keeps default R1.5. Undo and Redo preserve the exact recipes. Reversing both values restores the original document, including its explicit override, through a second fresh Open.
- **PASS, independent geometry.** The native folded solid and Worker agree with the analytic 10539.457925587507 mm³. Native volume is 10539.457925587530 mm³. The inner and outer cylinders are R2.5 and R4, at x=96 and z=4 with axis along Y. The flat outer loop measures 60 × 116.963716392672 mm and the allowance is 4.963716392672 mm. The independent folded bounds, end sections and strict B-rep checks pass.
- **PASS, controls.** Actual inherited-radius combined resize, 114 focused Studio checks, scoped lint, Studio production build with typecheck, browser syntax and diff checks pass. Mixed extent and radius changes, dropped overrides, bound and invalid radius values, foreign topology and stale signatures remain rejected by the relevant focused checks.
- **NOT_RUN.** Actual other rim orientations, partial or multiple flanges, parametric or nonrectangular sources, alternate desktop GPU backends, mobile and full local suites. #20 stays open.

Use Node 22.19.0 and the installed desktop Chrome and Playwright. Run heavy checks through the shared gate. Freeze worktree writes during browser runs and preserve evidence outside Git.

```sh
node --check apps/cad-studio/test/flange-source-size-history-browser.mjs
git diff --check
node apps/cad-studio/scripts/test.mjs flange-source-size-history flange-source-thickness-history flange-radius-source-history-apply
pnpm exec eslint apps/cad-studio/src/state/{flangeSourceSizeHistory,historyFeatureApply}.ts apps/cad-studio/test/flange-source-size-history.test.ts
pnpm --filter @barocss/cad-studio-app build
cd apps/cad-studio
export FLANGE_SOURCE_SIZE_HISTORY_SOURCE_FROZEN=1
# Run the expected refusal on the original runtime.
node test/flange-source-size-history-browser.mjs "$EVIDENCE/baseline" --both --own-radius --expect-refused
node test/flange-source-size-history-browser.mjs "$EVIDENCE/own-radius" --both --own-radius
node test/flange-source-size-history-browser.mjs "$EVIDENCE/inherited-control" --both
```
