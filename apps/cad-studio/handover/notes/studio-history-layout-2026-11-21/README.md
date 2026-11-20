# D1423 — Studio History layout ownership

P4, row 22. Base: `710fa3ec36e8e2da9a82706375158b86fba08e3b`.

`useFeatureHistoryLayout` owns the History bar's width measurements, expansion, step labels and focus fallback. It uses the existing chip-fitting and bottom-row hooks. App supplies the available width from the current work area and keeps ownership of document edits and the History editor. The work area width now feeds the existing row measurement directly.

## Verification

- **PASS, desktop Studio before and after.** In a 1440 × 1000 desktop, turn on step names, expand History, open the hidden feature editor, and collapse the steps again. Select the replacement face in the viewport and confirm the Linked Inset review with the keyboard. Both runs return focus to `21 more history steps` without scrolling and measure the same 1024.0000000000014 mm³ extrusion. The recorded document, bodies, selection, panel state and History entries match exactly. Visually checked the final screenshot with the focused overflow button.
- **PASS, desktop Drawing regression.** Auto-layout refusal preserved the existing drawing and authored dimensions. Save and fresh Open retained the data and allowed recovery by editing. Both final desktop flows recorded zero page errors, console errors and watched source changes.
- **PASS, affected checks.** Scoped lint, `git diff --check` and the Studio production build with type-check.
- **FAIL.** None in these checks.
- **NOT_RUN.** Mobile, WebGL2 and full local suites.

Use Node 22.19.0 and local Chrome and Playwright. Run one desktop flow at a time under the heavy gate. Keep images and receipts outside the repository.

```sh
pnpm exec eslint apps/cad-studio/src/App.tsx apps/cad-studio/src/ui/useFeatureHistoryLayout.ts
pnpm --filter @barocss/cad-studio-app build
cd apps/cad-studio
D1204_SOURCE_FROZEN=1 node test/linked-inset-review-focus-browser.mjs "$FOCUS_OUT" --collapsed-history
D697_SOURCE_FROZEN=1 node test/auto-layout-no-fit-browser.mjs "$DRAWING_OUT"
```
