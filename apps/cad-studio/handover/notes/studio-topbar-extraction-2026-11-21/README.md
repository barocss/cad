# D1417 — Extract the Studio top bar

2026-11-21 · P4, row 22 · Base `a1203f50a7130379fef44d746e392c659fd28842`

`StudioTopBar` owns the header markup, both file inputs and their focus handoff, and the template picker controls. It receives six typed groups for file actions, workspace, history, panels, templates and exchange. App supplies the document and commands that need to coordinate across workspaces. App decreased from 3972 to 3953 lines. The next code structure seam is the SceneViewport call, which currently has 82 JSX attributes including ref.

- **PASS, static checks.** ESLint on both React modules, `git diff --check`, and Studio production build including type-check.
- **PASS, desktop Studio.** Five Chrome/WebGPU flows passed at desktop sizes. In the baseline and final resize tests, the two recorded focus-transfer observations were identical with Chat open and closed. The 14 regular toolbar controls stayed reachable at the tested widths. More tools handled focus transfer, keyboard navigation, template navigation and closure, the STEP options dialog, and both pointer and keyboard entry to the Insert part chooser.
- **PASS, file and mode ownership.** Keep editing and Escape retained the original sketch draft during Open. Explicit Discard loaded the other file. Undo recovered the former file name and document, Save wrote matching native JSON, and Redo returned to the replacement. The independent oracle checked that a preserved 20 × 12 mm sketch finished and extruded 18 mm to 4320 mm³ after the workspace switch tests. The five final receipts reported zero page errors, console errors or watched source changes.
- **FAIL.** None in these checks.
- **NOT_RUN.** Mobile, full local suites, and native export generation. The STEP check opens and cancels the options dialog.

Run with Node 22.19.0, a configured desktop Chrome and Playwright, and an output directory outside the repository. Run one browser flow at a time under the heavy gate.

```sh
pnpm exec eslint apps/cad-studio/src/App.tsx apps/cad-studio/src/ui/StudioTopBar.tsx
cd apps/cad-studio
pnpm build
D977_SOURCE_FROZEN=1 node test/top-toolbar-overflow-browser.mjs "$OUTPUT/resize" --resize-focus-fixed
D685_SOURCE_FROZEN=1 node test/top-toolbar-overflow-browser.mjs "$OUTPUT/overflow" --fixed
PENDING_SKETCH_FILE_OPEN_FROZEN=1 node test/pending-sketch-file-open-browser.mjs "$OUTPUT/open"
D663_SOURCE_FROZEN=1 node test/sketch-mode-exit-browser.mjs "$OUTPUT/modes" --fixed
D666_SOURCE_FROZEN=1 node test/more-tools-keyboard-browser.mjs "$OUTPUT/templates" --fixed
```
