# D1511 — Select linked SubD faces within explicit creases

P5, row 08, [#626](https://github.com/barocss/cad/issues/626). Base `77fa5a21a1251cf275d08f3fb7f747aa3e5d2058`.

Face mode now offers **Linked within creases**. It selects the union of the regions that contain the picked faces. Two faces are neighbours for this action when they share a cage edge that has no explicit crease. A crease only blocks its own crossing. An open border has no face on its other side. The action changes selection without adding a geometry or document history step. Existing Linked still crosses creases.

## Verification

- **PASS, actual desktop before and after.** Load one 30 × 20 × 16 mm SubD box with four quads per side and 16 explicit creases around its upper perimeter. One upper seed and ordinary Linked select 96 faces. From the same seed, the new action selects exactly faces 80–95. It preserves the accepted recipe, all cage coordinates and cage Undo. Ordinary Linked still selects 96 on the candidate.
- **PASS, exact cage and native Studio consumer.** A separate +1 mm Z move changes exactly the 25 vertices of the picked region. All other coordinates, faces and 16 creases match byte for byte in the cage. The move adds one cage step. Cage Undo restores the selected region, and Redo restores the move. Done, document Undo/Redo and native Save and fresh Open pass. Strict native checks confirm one closed solid and 60 faces. The native volume changes from 9222.111975893842 to 9809.611975893917 mm³. The independent cage oracle uses the fixture coordinates and face memberships. The reopened native digest is `2c0436e40803cde189331ed5cf95248e036417885357f7b266ae091a75ed7e2f`.
- **PASS, focused checks.** 24 Model and 15 Studio tests, scoped lint, Model and Studio types, Studio build, browser syntax and Git diff checks. Actual Studio Grow, Shrink, ordinary Linked and Shortest path controls pass. Model tests cover both sides of a crease, reversed crease endpoints, multiple seeds, an overlapping disconnected component, empty selection, a wrong mode and an invalid face ID.
- **NOT_RUN.** Desktop cases on open or mirrored cages, creases added or removed during this same flow, local Agent selection, other browsers, mobile and full local suites. #626 remains open.

Use Node 22.19.0 and installed desktop Chrome and Playwright. Gate heavy work, freeze worktree writes during Studio and keep evidence outside Git.

```sh
node packages/barocss-cad-model/scripts/test.mjs cage-connected-selection cage-shortest-path cage-selection-mode cage-boundary-loop cage-crease-noop
pnpm --dir apps/cad-studio test cage-transform-draft cage-inset-draft cage-loop-draft
pnpm exec eslint packages/barocss-cad-model/src/subd/cageEdit.ts packages/barocss-cad-model/test/cage-connected-selection.test.ts apps/cad-studio/src/ui/CagePanel.tsx
pnpm --filter @barocss/cad-model type-check
pnpm --filter @barocss/cad-studio-app build
node --check apps/cad-studio/test/cage-connected-selection-browser.mjs
git diff --check
cd apps/cad-studio
CAGE_CONNECTED_SOURCE_FROZEN=1 node test/cage-connected-selection-browser.mjs "$EVIDENCE/baseline" --crease-baseline
CAGE_CONNECTED_SOURCE_FROZEN=1 node test/cage-connected-selection-browser.mjs "$EVIDENCE/candidate" --crease-fence
CAGE_CONNECTED_SOURCE_FROZEN=1 node test/cage-connected-selection-browser.mjs "$EVIDENCE/ordinary-control"
CAGE_PATH_SOURCE_FROZEN=1 node test/cage-shortest-path-browser.mjs "$EVIDENCE/shortest-path-control"
```

Run the first desktop flow before the product change. Use a separate output folder for every run.
