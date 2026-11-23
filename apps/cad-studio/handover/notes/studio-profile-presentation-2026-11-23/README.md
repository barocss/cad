# D1815 — Extract Studio profile and grouped History presentation

P4 Studio structure, rows 15 and 22. [Issue #44](https://github.com/barocss/cad/issues/44). Base `cb28a0d7d105b65a76e3e4a633eaa48c38c3321c`.

Move the Browser's free-sketch list, the viewport's profiles and the History bar's grouped feature indices into `useStudioProfilePresentation`. The hook reads free and retained profile geometry from the evaluated document, parameters from the shown document and feature group membership from the authored nodes. It uses the existing profile geometry and pick routes. `App.tsx` goes from 2925 to 2913 lines.

- **PASS — canvas region selection and exact Extrude.** Select two finished regions to see the existing one-region refusal, deselect one and extrude the shared region by 2 mm. The native result has volume 240 mm³ and centroid (19, 12, 1) mm. Undo, Redo, face/body pick scope and another retained profile region remain available.
- **PASS — linked profile and file lifecycle.** Edit the source widths to 60 and 64 mm. Current footprints are pickable and superseded footprints miss. Undo, Redo and Save and fresh Open preserve the current result and selection behavior.
- **PASS — grouped Fastener History.** Edit the single M6 × 20 mm feature group, cancel an axial move and verify the fit rejection at M8. Apply X = 44 mm, Undo and Redo and reopen the fixture after New part. The grouped editor retains its accepted size and location.
- **PASS — affected checks.** 44 Studio tests, scoped ESLint, Studio types and production build and Git diff check pass. Three desktop Chrome WebGPU runs have 25 checkpoints, zero source changes and zero browser errors.
- **FAIL — corrected initial Fastener harness.** The first run used the repository root as its current directory and could not read its sample table. The existing driver passed from the Studio directory. The source was the same.
- **NOT_RUN.** Full local suites, other viewport backends, mobile and live providers. First mechanical CAD remains at 8/10 accepted. Overall completion remains unmeasured.

Use Node 22.19.0, the heavy gate, installed desktop Chrome and Playwright and external output directories.

```sh
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test free-sketch-profile history-feature-editor history-feature-apply
pnpm exec eslint apps/cad-studio/src/App.tsx apps/cad-studio/src/app/useStudioProfilePresentation.ts
pnpm --dir apps/cad-studio build
D1134_SOURCE_FROZEN=1 node apps/cad-studio/test/multi-region-profile-pick-browser.mjs "$OUT/regions" --canvas-region
LINKED_PROFILE_CURRENT_FROZEN=1 node apps/cad-studio/test/linked-profile-current-browser.mjs "$OUT/linked"
(cd apps/cad-studio && FASTENER_HISTORY_FROZEN=1 node test/fastener-history-browser.mjs "$OUT/fastener")
git diff --check
```
