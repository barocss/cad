# D2114 — Extract Studio assembly document edits from App

P4 [row 10](../../roadmap-rows/10.md) and [row 22](../../roadmap-rows/22.md) · Base `b08a275ebf9e37d7ebce3896015f9611624903d0`.

Assembly placements, linked revisions and mate edits share one document acceptance path. The module checks the existing document gate, records Undo, expands pattern occurrences, commits, then updates the dirty state and optional instance selection. Separate callbacks retain the existing inline and notice routes for pattern and assembly cut refusals. App keeps the existing document, History marker and acceptance scope as the memo keys. Its source falls from 2,418 to 2,386 lines.

- **PASS, actual desktop equivalence.** Twenty source-frozen Chrome checkpoints match before and after for document, bodies, selection, History, editors, command overlays and notices. The four flows cover custom linear and circular occurrence patterns, an assembly cut with independent volumes, linked revision acceptance and supersession, and batch fixation with mate refusal. The flows exercise relevant Undo/Redo and native Save/fresh Open. Pattern and revision observations also match. All eight desktop runs report zero source changes, runtime errors and console errors.
- **PASS, affected validation.** 245 Studio tests, Studio types, scoped ESLint, production build and diff check pass on Node 22.19.0.
- **FAIL.** None observed in the selected baseline, candidate or affected suite.
- **NOT_RUN.** Performance measurements, full local suites, mobile, live providers and broader assembly edits outside the selected profiles. First mechanical CAD remains 8/10 accepted. Whole CAD completion remains unmeasured.

```sh
# Node 22.19.0. Use the heavy gate and freeze the source for each desktop flow.
PATTERN_DIRECTION_FROZEN=1 node apps/cad-studio/test/instance-pattern-direction-browser.mjs "$OUT/pattern"
ASSEMBLY_CUT_SOURCE_FROZEN=1 node apps/cad-studio/test/assembly-cut-browser.mjs "$OUT/cut"
ASSEMBLY_REVISION_OWNER_FROZEN=1 node apps/cad-studio/test/assembly-revision-owner-browser.mjs "$OUT/revision"
ASSEMBLY_GROUND_SELECTION_FROZEN=1 node apps/cad-studio/test/assembly-ground-selection-browser.mjs "$OUT/ground"
pnpm --dir apps/cad-studio test assembly-cut assembly-instance placement pattern revision assembly-pick project-open-ownership
pnpm --dir apps/cad-studio exec vite build --outDir "$OUT/studio-dist"
```
