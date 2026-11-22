# D1645 — Extract Studio Browser actions from App

P4, row 22. Base `3832ab04fc073b0e46c7ec1ef90c48a6c6dfc726`.

`ModelBrowser` owns the Browser frame, visibility button, feedback and body query view. `useBrowserActions` owns the query, reveal and isolation actions and their separate revision checks. App supplies the current mode restrictions and commits an explicitly selected body set. App goes from 3,556 to 3,522 lines.

- **PASS, focused checks.** 25 tests cover body queries, exact Browser row targeting, view transitions and isolation admission. Scoped ESLint, Studio type check, production build and Git diff check passed.
- **PASS, actual Studio WebGPU.** Seven affected flows produced 39 checkpoints. They verify body queries after material changes, deletion, delayed replies and mode changes, exact selection reveal in a closed Browser and on nested paths, and additive isolation through member deletion, Undo and a linked revision change. The final runs recorded equal source capsules and zero source changes, page errors or console errors.
- **PASS, before/after control.** The corrected isolation driver passed on the base App and on the extracted App. All three checkpoint JSON files were byte-identical. The corrected assertion still requires the complete camera state, document and history to remain equal during isolation.
- **FAIL, corrected type and timing checks.** The first type check found that the extracted options declared the document-open token as a number. The hook now accepts the existing object identity. The next type check and build passed. The first isolation run took a camera baseline before the native file Open fit completed. The first observer targeted the separate project Open path and timed out. The final driver observes the actual Model file timer and waits for its completion without changing the callback.
- **NOT_RUN.** Full local suites, WebGL2 and mobile.

Use Node 22.19.0, installed Chrome and Playwright (`CHROME`, `PW_DIR`), the heavy gate and output directories outside Git. Use the loopback-only preload with an empty external font stylesheet for desktop runs.

```sh
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test body-selection-query body-browser-reveal browser-selection-reveal add-to-isolation
pnpm exec eslint apps/cad-studio/src/App.tsx apps/cad-studio/src/app/useBrowserActions.tsx apps/cad-studio/src/ui/ModelBrowser.tsx apps/cad-studio/test/instance-isolation-add-browser.mjs
pnpm --dir apps/cad-studio build
git diff --check
BODY_SELECTION_QUERY_FROZEN=1 node --import "$LOOPBACK" apps/cad-studio/test/body-selection-query-browser.mjs "$OUT/query"
BODY_QUERY_IDENTITY_FROZEN=1 node --import "$LOOPBACK" apps/cad-studio/test/body-selection-query-identity-browser.mjs "$OUT/query-identity"
BODY_QUERY_INTERRUPTION_FROZEN=1 node --import "$LOOPBACK" apps/cad-studio/test/body-selection-query-interruption-browser.mjs "$OUT/query-interruption"
BODY_BROWSER_REVEAL_FROZEN=1 node --import "$LOOPBACK" apps/cad-studio/test/body-browser-reveal-browser.mjs "$OUT/reveal"
BROWSER_REVEAL_TRANSITIONS_FROZEN=1 node --import "$LOOPBACK" apps/cad-studio/test/browser-reveal-transitions-browser.mjs "$OUT/reveal-transitions"
ISOLATION_ADD_FROZEN=1 node --import "$LOOPBACK" apps/cad-studio/test/instance-isolation-add-browser.mjs "$OUT/isolation"
ISOLATION_ADD_FROZEN=1 node --import "$LOOPBACK" apps/cad-studio/test/instance-isolation-add-browser.mjs "$OUT/isolation-lifecycle" --lifecycle
```
