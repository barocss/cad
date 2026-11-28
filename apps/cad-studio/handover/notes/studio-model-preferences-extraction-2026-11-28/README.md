# D2176 — Extract browser-persisted Studio preferences

P4 [row 20](../../roadmap-rows/20.md) · Base `48fe593784ceadf059cb0bfa7e1cedb44c2ed2d5`.

`useStudioPreferences` owns the stored theme, selection filter, grid snap, Browser visibility and default material. The controls dispatch the existing preference operations through callbacks. Temporary Browser opens still use the session setter, while an explicit Browser toggle persists the choice. Theme updates reach the document and the viewport together. `App.tsx` changes from 2,288 to 2,281 lines.

## Verification

- **PASS.** On both actual desktop versions, selecting Light, Faces, 0.5 mm grid, collapsed Browser and Steel (mild) wrote the expected five keys. The controls showed those values after reload. A freshly opened body with no explicit material used Steel and retained its exact 12,000 mm³ native volume. Preference changes preserved the exact saved document and Undo/Redo state.
- **PASS.** The actual Browser reveal regression retained body selection, camera, history and geometry. Source checks covered 704 baseline files, 705 final files and 1,287 reveal-regression files with zero changes, page errors, console errors or downloads.
- **PASS.** Eight Studio tests, Studio type check, scoped ESLint, driver syntax, diff check and production Vite build.
- **NOT_RUN.** Full local suites, other browser engines and mobile. The first mechanical baseline remains 8/10. Overall CAD and natural-language completion remain unmeasured.

```sh
MODEL_PREFERENCES_FROZEN=1 node apps/cad-studio/test/model-preferences-browser.mjs "$OUT/final"
BODY_BROWSER_REVEAL_FROZEN=1 node apps/cad-studio/test/body-browser-reveal-browser.mjs "$OUT/reveal-regression"
pnpm --dir apps/cad-studio test scene-selection wheel-zoom-preference
pnpm --dir apps/cad-studio exec vite build --outDir "$OUT/studio-dist"
```
