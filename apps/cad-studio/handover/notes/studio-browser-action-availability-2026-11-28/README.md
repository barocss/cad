# D2127 — Move Browser action availability out of App

P4 [row 15](../../roadmap-rows/15.md) and [row 22](../../roadmap-rows/22.md) · Base `e1c56c90335fc766005e59d63e4da5b426f83189`.

App passes the current model, edit, view, drag and dialog conditions to the existing Browser actions hook. A pure helper chooses the first reveal and additive isolation reason. Shared conditions are supplied once. Each action retains its own priority and its distinct editing or view restrictions. The deferred document and dialog getter runs only when a preceding condition permits it. App drops from 2,386 to 2,380 lines.

- **PASS, actual desktop.** The base and candidate each reveal an exact selected body at two desktop widths, including reopening the collapsed Browser. Add to isolation operates on the chosen placed instance, respects the Measure restriction and resets on accepted Open. Seven pairs of scenes match by document, selection, history, notices, editor and HUD. The isolation flow matches all nine opaque/faded instance states. Runtime errors, console errors and source changes are zero. The before/after reveal freezes 1,272/1,273 files and the isolation freezes 694/695 files.
- **PASS, affected checks.** 20 Studio tests, including reason priority, separate reveal/isolation conditions and lazy dialog reads. Final Model and Studio type checks, scoped ESLint, Studio production build and diff check pass on Node 22.19.0.
- **FAIL, corrected type check.** The first extraction passed the active Variant name as a boolean condition. The App now passes its explicit truth value and the actual Studio flows rerun on the final source.
- **NOT_RUN.** Nested occurrence races, other view backends, full local suites, mobile and live providers.

```sh
# Node 22.19.0. Use the heavy gate and freeze sources while Chrome runs.
BODY_BROWSER_REVEAL_FROZEN=1 node apps/cad-studio/test/body-browser-reveal-browser.mjs "$OUT/reveal"
ISOLATION_ADD_FROZEN=1 node apps/cad-studio/test/instance-isolation-add-browser.mjs "$OUT/isolation"
pnpm --dir apps/cad-studio test body-browser-reveal browser-selection-reveal add-to-isolation
pnpm --dir apps/cad-studio exec vite build --outDir "$OUT/studio-dist"
git diff --check
```
