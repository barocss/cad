# D1849 — Extract the active Studio Fillet picking actions

P4 [row 16](../../roadmap-rows/16.md) and [row 20](../../roadmap-rows/20.md), [#44](https://github.com/barocss/cad/issues/44). Base `014fea39d8ef962720efea42546d78537a9914d7`.

App supplies the current document, evaluated source and bodies to the Fillet picking controller. The controller owns changing type and radius mode, taking a viewport pick, removing a selected seed and locating its source edge. The existing Fillet builder, preview and Apply ownership checks still decide the transition. Rejected picks keep the current accepted selection and cancel queued Apply. Changing a stale active command retires it. Stale remove and locate requests leave the current command in place.

App.tsx is 2,875 lines, down from 2,896.

- **PASS, affected checks.** 31 focused Studio tests, Studio type and production build, scoped ESLint, browser driver syntax and Git diff check.
- **PASS, actual desktop Studio.** Hover, keyboard focus and delayed preview locate the original edge. Removing the first stadium seed keeps all three bottom tangent edges at R1.5, including after Apply and fresh Open. A generated preview pick is refused and clears pending Apply. Edge, Face and Full round still create; the type switch retires the held preview and queued Apply. The saved Varying feature retains source identity while its start radius is edited. Four runs capture 30 structured states and two further refusal screenshots, with zero source changes, page or console errors.
- **FAIL, corrected driver expectation.** The old family test expected no Along field in saved Full round. The field shipped previously and defaults to Auto. The corrected driver checks the current choice and completes the full flow.
- **NOT_RUN.** Whole local test suites, other renderers, mobile, live providers and release. #44 remains open, with 211 of 220 accepted items. First mechanical CAD remains 8/10. Whole-product completion remains unmeasured.

```sh
pnpm --dir apps/cad-studio test fillet-family fillet-picked-edge-highlight fillet-pick-failure fillet-face-selection-feedback fillet-interior-hud
pnpm --dir apps/cad-studio build
FILLET_PICKED_EDGE_HIGHLIGHT_SOURCE_FROZEN=1 node apps/cad-studio/test/fillet-picked-edge-highlight-browser.mjs "$OUT/locate"
FILLET_REMOVE_SEED_CHAIN_SOURCE_FROZEN=1 node apps/cad-studio/test/fillet-remove-seed-chain-browser.mjs "$OUT/remove"
PICK_RECOVERY_FROZEN=1 node apps/cad-studio/test/fillet-preview-pick-recovery-browser.mjs "$OUT/recovery" --mode-switch
FILLET_FAMILY_SOURCE_FROZEN=1 node apps/cad-studio/test/fillet-family-browser.mjs "$OUT/family"
git diff --check
```
