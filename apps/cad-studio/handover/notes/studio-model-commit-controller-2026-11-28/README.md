# D2162 — Extract accepted Model commit handling from Studio App

P4 [row 22](../../roadmap-rows/22.md) · Base `0e13cb7c40b85d209ab383e2175e57d89737891f`.

The Model commit controller merges the evaluated prefix with authored document state, captures current reference signatures, records the original Undo entry and restores selection after acceptance. The App keeps its existing commit entry point and owns the document, worker state and setters. App.tsx shrinks from 2,320 to 2,294 lines.

## Verification

- **PASS, actual baseline and final Studio.** A two-body document rolls back before its second extrusion. A radius-1 Fillet picked on `n1.side0|n1.top` removes one later feature with the existing notice. The straight original edge signature preserves midpoint (15, 0, 8) mm, direction +X and length 30 mm. The original authored parameter survives. Undo restores the original document and rollback marker. Redo and native Save/fresh Open restore the exact Fillet. The 4,793.5619449019 mm³ native volume and digest `667114633b4a5e2dd1bcc2dad599ea7d8d9ea7e68999e6a396164ef53e1bac9f` match before and after. All five captured Doc, body, selection, History, notice, editor and HUD states match.
- **PASS, actual sketch selection and affected checks.** Deleting the only solid preserves the selected free sketch ID. It remains usable for a new extrusion. The final browser records no source changes, console errors or page errors. 64 Studio history, draft, Save and Stop-work checks, Studio TypeScript, scoped ESLint, driver syntax and production build pass.
- **Corrected test failure.** The first baseline used a Hole and assumed the `face` field receives a generic signature. The current reference scanner handles named lists such as Fillet edges. The final baseline and candidate exercise that supported capture path.
- **NOT_RUN.** Full local suites and mobile. First mechanical CAD is 8/10 accepted. Overall completion is unmeasured.

```sh
MODEL_COMMIT_HISTORY_FROZEN=1 node apps/cad-studio/test/model-commit-history-browser.mjs "$OUT/final"
D810_SOURCE_FROZEN=1 node apps/cad-studio/test/deleted-profile-selection-browser.mjs "$OUT/selection"
pnpm --dir apps/cad-studio test stop-work-ownership history-feature-apply history-feature-editor draft-selection-history autosave-save-boundary
pnpm --dir apps/cad-studio exec vite build --outDir "$OUT/studio-dist"
```
