# D1764 — Extract the Studio sketch and Direct Browser rows

P4 Studio maintenance, row 22. [Issue #44](https://github.com/barocss/cad/issues/44). Base `9047e289220bc214f5d293843a4b96086b554f47`.

Move the Sketch and Direct Browser rows and their click behavior to BrowserGeometryRows. Keep the document, selection, Sweep preview and commit ownership in App. Keep the row order, labels, icons and focusable buttons. App.tsx goes from 3,100 to 3,089 lines and no longer imports the Sweep path reader.

- **PASS, actual desktop Studio WebGPU.** A curve click keeps one selected whole sketch. Shift adds and removes paths. A surface and a whole sketch clear the incompatible selection. Browser collapse and expand preserve the current selection. Clicking the hidden rail reveals it as one undoable change. Undo and Redo restore the expected visibility.
- **PASS, Sweep and fresh Open.** Replace Rail A with Rail B and keep Sketch 1. A surface is refused with both valid inputs retained. Switch to Sketch 2 and back while retaining Rail B. Apply the sweep, Undo, Redo, Save and fresh Open. The rebuilt part has one body, 6 × 6 × 22 mm bounds and an unchanged copied Rail B.
- **PASS, before and after.** The two desktop runs match all 16 captured states and 14 observations exactly. Two native inspector records, two native inspector input documents and the Studio save match byte for byte. Both runs report zero source, page or console errors.
- **PASS, affected checks.** 18 Studio tests, scoped ESLint, Studio production build with types, driver syntax and Git diff check.
- **FAIL.** None in this item.
- **NOT_RUN.** Full local suites, alternate GPU backends, live providers and mobile. Issue #44 remains open. First mechanical CAD remains 8/10. Whole-product completion remains unmeasured.

## Reproduction

Use Node 22.19.0, the heavy gate, installed desktop Chrome and Playwright, and external evidence directories. Run the first desktop command on the base with the candidate driver.

```sh
D1764_SOURCE_FROZEN=1 node apps/cad-studio/test/sweep-preview-retarget-browser.mjs "$OUT/base" --browser-rows
D1764_SOURCE_FROZEN=1 node apps/cad-studio/test/sweep-preview-retarget-browser.mjs "$OUT/candidate" --browser-rows --extracted
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test sweep-path-feedback sweep-path-geometry body-browser-reveal direct-pole-selection
pnpm exec eslint apps/cad-studio/src/{App.tsx,ui/BrowserGeometryRows.tsx} apps/cad-studio/test/sweep-preview-retarget-browser.mjs
pnpm --dir apps/cad-studio build
node --check apps/cad-studio/test/sweep-preview-retarget-browser.mjs
git diff --check
```
