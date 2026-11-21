# D1534 — Move preview panel rendering and annotation status into PreviewSection

P4, row 22. Base `0eee2c47a9bb62ad6c7fcf4d11e04548cc72c849`.

PreviewSection now owns the selected Print, CNC, Clearance and Analysis panel. It renders the existing annotation checkbox, selected annotation text and collapsed status. App supplies typed state and actions. The annotation and manufacturing model computation stays in its existing hooks. App.tsx moves from 3713 to 3704 lines and drops five display imports.

- **PASS, before and after desktop Studio.** The existing preview status flow at 1024 and 1440 CSS px shows the same annotation counts, Print readiness, mode suspension, empty-part state, Undo and Redo. Four recorded state checkpoints match exactly.
- **PASS, native 3D annotation control.** The same 21 before/after checkpoints match exactly from actual WebGPU glyph clicks through native Save, fresh Open and reselect. The two actual saved files are byte-identical, SHA-256 `cfe2f3a7b0f399158bcaebbc1a38e5e389e509893db427135ca9e49bd91e5c25`. No browser errors or frozen source changes occur.
- **PASS, affected checks.** Twelve Studio tests for preview status, body previews and CNC computation, scoped lint, Studio type check and build, and Git diff.
- **FAIL.** None in the completed checks.
- **NOT_RUN.** Interactive CNC, Clearance and Analysis end-to-end scenarios, mobile and full local suites. The change is panel presentation and leaves the existing manufacturing HOLD in place.

Use Node 22.19.0 and installed Chrome and Playwright. Gate heavy work and write evidence outside Git. Run each desktop command before and after the change with distinct output directories.

```sh
pnpm --dir apps/cad-studio test preview-status made-bodies-previews cnc-preview
pnpm exec eslint apps/cad-studio/src/App.tsx apps/cad-studio/src/layout/PreviewSection.tsx
pnpm --filter @barocss/cad-studio-app build
git diff --check
PREVIEW_STATUS_FROZEN=1 node apps/cad-studio/test/preview-visible-status-browser.mjs "$EVIDENCE/status"
PMI_GPU_HIT_FROZEN=1 node apps/cad-studio/test/pmi-gpu-hit-browser.mjs "$EVIDENCE/pmi" --save-reopen
```
