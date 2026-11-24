# D1912 — Extract Studio document replacement from App

P4 [row 12](../../roadmap-rows/12.md) and [row 15](../../roadmap-rows/15.md), [#44](https://github.com/barocss/cad/issues/44). Base `a7531311ad2fdaf56ea48a61ad3186ef3138e53c`.

Studio App delegates whole-document replacement to its own module. The module validates the rounded inset before changing active work. It cancels the current STEP export, invalidates pending work, captures the existing title, dirty state and binding at the same history boundary, and scopes the ordinary whole-document commit. Accepted commits clear editor state in the existing order, retain the root checkpoint during in-place editing, and detach the project for detached Open and New. The commit releases its replacement intent even when the commit refuses or throws. App keeps its existing state and calls the same replacement entry points. App changed from 2532 to 2513 lines.

- **PASS, desktop Studio before and after.** All nine recorded states match for accepted document, bodies, selection, history, title, project binding and dirty state. The route covers STEP Open, Undo/Redo, a colliding project filename, New, detached native Open and the detached save filename and bytes. The imported volume is 11,497.345175425628 mm³. The two original project files retain SHA-256 `f762c8a89eb3ed915c761ee4892fd101b6c1e605f6e725310d560707d55b7605` and `5413e6cf7d1e2d00eb4385caf0af197456bfb116c44d765def27546a14179f20`. Detached Undo restores the first model and its save name, `Detached A.bcad`. The harness intercepts this download after Studio forms its bytes.
- **PASS, desktop in-place edit.** Fifteen actual states cover entering a child, refusing the parent clipboard inside, Cancel, editing and finishing a child, refusing its clipboard back in the assembly, Undo/Redo and a fresh Copy/Paste. The assembly and child remain separately owned.
- **PASS, affected checks.** 66 Studio tests for open ownership, document files and work ownership. Changed-file lint, Studio production build and Git diff check pass.
- **NOT_RUN.** Whole local suites, a fresh machine, native-folder storage, mobile and PDF. No production defect was observed in the exercised before/after flows. First mechanical CAD stays at 8/10. Whole-product completion remains unmeasured. The desktop checklist stays open for its other acceptance items.

```sh
pnpm --dir apps/cad-studio test project-open-ownership document-file stop-work-ownership
pnpm --dir apps/cad-studio build
D960_SOURCE_FROZEN=1 node apps/cad-studio/test/project-open-save-history-browser.mjs "$OUT/base" --file-controls
D960_SOURCE_FROZEN=1 node apps/cad-studio/test/project-open-save-history-browser.mjs "$OUT/studio" --file-controls
D564_SOURCE_FROZEN=1 node apps/cad-studio/test/body-clipboard-in-place-browser.mjs "$OUT/in-place"
git diff --check
```
