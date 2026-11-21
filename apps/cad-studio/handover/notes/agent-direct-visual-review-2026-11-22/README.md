# D1626 — Review Direct geometry visually through the local Agent

P5, row 24, [#324](https://github.com/barocss/cad/issues/324) and [#322](https://github.com/barocss/cad/issues/322). Base `3c9c8be880279b0a5da9ab0b14c402d7bef3a54c`.

In a Direct-only base document, read `query.summary` and pass its `direct_revision` as `expectedDirectRevision` to `query.render`. The local Agent receives a 1,000 × 1,000 PNG of four orthographic views with the exact revision, the PNG SHA-256 and literal IDs of the drawn objects. It uses Studio's Direct curve samples and sheet tessellation. The solid-body review retains its existing hidden-line workflow and revision.

- **PASS, desktop Studio WebGPU.** Opened one straight rail, a cubic rail and their native Ruled sheet. Real Top-view clicks at the two rail midpoints and one sheet interior selected the corresponding three objects. Hid the Crown rail in Studio, used native Save and opened the edited file in a fresh context. The sheet and both authored source strings retained their identity and values.
- **PASS, local MCP.** The initial PNG contains the two traces and sheet fill. The new PNG removes the hidden trace and keeps the straight trace and sheet fill. Independent Top-projection checks use x = 10–40 mm, y = 10–33 mm and four 5 × 5 px neighborhoods for the rails, sheet interior and exterior. The images are 30,433 and 19,019 bytes with distinct verified SHA-256 values. The earlier pin returns `DIRECT_RENDER_STALE` with zero image blocks. Reads preserve the native file bytes. Studio froze 1,020 source files and reported zero file changes, page errors and console errors.
- **PASS, affected checks.** Model 29, Model type check, scoped ESLint with one pre-existing test warning, Agent docs generation check, Studio build and browser syntax. Agent tool budget is 24,880 of 25,000 characters per turn.
- **FAIL.** No unexpected failures in final checks.
- **NOT_RUN.** Mixed solid and Direct views, other rail families, WebGL2 product run, paid live model and full local suites. The two issues remain open.

Use Node 22.19.0, installed Chrome and Playwright, the heavy gate and an external output directory.

```sh
pnpm --dir packages/barocss-cad-model type-check
pnpm --dir packages/barocss-cad-model test views toolset tool-contract agent-direct
node apps/library-docs/scripts/agent-tools.mjs --check
pnpm --dir apps/cad-studio build
node --check apps/cad-studio/test/direct-agent-visual-review-browser.mjs
D1626_SOURCE_FROZEN=1 node apps/cad-studio/test/direct-agent-visual-review-browser.mjs "$OUT"
git diff --check
```
