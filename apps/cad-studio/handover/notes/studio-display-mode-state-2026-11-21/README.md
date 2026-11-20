# D1419 — Isolate Studio display mode state

2026-11-21 · P4, row 22 · Base `3cef943490b59278a8e670bb43ef2c595f1cedc4`

`useSceneDisplayMode` owns the requested mode, display control state, renderer feedback, and the current scope's fallback. The hook supplies the display controls and one typed input to SceneViewport. App supplies the current workspace and editing scope. App went from 3950 to 3932 lines and the SceneViewport call went from 74 to 71 JSX attributes including ref.

- **PASS, baseline comparison.** The eight original desktop checkpoints matched document, selection, History, notices, and instance bounds. Frame diagnostics and six recorded observations matched after excluding frame sequence numbers and CPU timings. The renderer drew all five modes on the same assembly, including its eight occurrences, and reproduced the isolation and clearance checks.
- **PASS, display scope.** With Wireframe requested, opening Analysis disabled the selector, used Shaded with edges, and showed the current scope reason. The selector and viewport retained the Wireframe request. Closing Analysis restored Wireframe and cleared the notice. The native document still matched the open source.
- **PASS, native project.** The existing isolation test kept the full four-part BOM in the normal view, isolation and fresh OPFS Open. Save preserved the authored placements and visibility. Fresh Open reset the session isolation. There were zero page errors, console errors or watched source changes in both final flows.
- **PASS, affected checks.** Scoped ESLint, browser script syntax, `git diff --check`, and Studio production build including type-check passed.
- **FAIL.** None in these checks.
- **NOT_RUN.** Actual WebGL2, mobile, export generation and full local suites.

Run with Node 22.19.0 and configured desktop Chrome and Playwright. Use the heavy gate for one browser flow at a time and store output outside the repository.

```sh
pnpm exec eslint apps/cad-studio/src/App.tsx apps/cad-studio/src/viewport/{SceneViewport.tsx,useSceneDisplayMode.ts}
node --check apps/cad-studio/test/gpu-display-smoke-browser.mjs
cd apps/cad-studio
pnpm build
GPU_DISPLAY_SOURCE_FROZEN=1 node test/gpu-display-smoke-browser.mjs "$OUTPUT/display"
ISOLATION_PERSISTENCE_FROZEN=1 node test/instance-isolation-persistence-browser.mjs "$OUTPUT/isolation"
```
