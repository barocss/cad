# D1942 — Move Model command entry and return focus out of App

P4 [row 12](../../roadmap-rows/12.md) and [row 20](../../roadmap-rows/20.md), [#44](https://github.com/barocss/cad/issues/44). Base `3a4a48677196f83c09fbfe8305483eb56741f11b`. Behavior-preserving refactor.

App now delegates field command setup, camera presets and the return-focus callbacks to the command entry module. App retains workspace changes, the command's admission and source capture, and the Apply and Cancel owners. The focus module keeps the distinct Extrude and Hole opener rules. The independent Extrude still captures the current Open and evaluated body owners and reads the live Join scope. App shrinks from 2488 to 2450 lines.

- **PASS, actual before and after.** Six identical desktop checkpoints at 1024 and 1440 CSS px cover keyboard Cancel, Escape, History editor Close, Extrude Apply with volume 250π mm³, Undo, Redo, Save and fresh Open. Document, selection, native body readings, History, editor, HUD and notices match.
- **PASS, affected desktop flows.** Hole returns to the active tool after Escape, Cancel and Apply. The Hole test also verifies Undo, Redo and the independent blind-bore balance 14400 − 45π mm³. Extrude Join keeps admission and late body ownership. Fillet keeps the Edge, Face and Full round launch paths.
- **PASS, affected checks.** 26 Studio tests, scoped ESLint, Studio type check and production build. Source stays frozen throughout each accepted desktop run.
- **FAIL, corrected.** The first extraction missed the Hole focus callback used by Apply. Type check and Studio Open failed. The final module exports the same Hole-specific callback to Apply and uses it on Cancel. The unused old import was removed.
- **NOT_RUN.** An operating system picker, assistive technology, full local suites, mobile and paid Agent calls. The parent issue remains open. First mechanical CAD remains 8/10 accepted. Overall CAD is unmeasured.

```sh
D1346_SOURCE_FROZEN=1 node apps/cad-studio/test/extrude-cancel-focus-browser.mjs "$OUT/studio"
D1249_SOURCE_FROZEN=1 node apps/cad-studio/test/hole-presets-browser.mjs "$OUT/hole" --focus-close
EXTRUDE_JOIN_SOURCE_FROZEN=1 node apps/cad-studio/test/extrude-join-suggestion-browser.mjs "$OUT/join"
FILLET_FAMILY_SOURCE_FROZEN=1 node apps/cad-studio/test/fillet-family-browser.mjs "$OUT/fillet"
node apps/cad-studio/scripts/test.mjs editor-return-focus offset-face-launch-view fillet-family
pnpm build
git diff --check
```

The baseline uses the same Extrude driver at the base revision. Browser screenshots, state comparisons and source records stay outside Git.
