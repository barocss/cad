# D1695 — Apply several sketch Fillets or Chamfers together

P1 sketch authoring, rows 09, 16 and 20. [Issue #21](https://github.com/barocss/cad/issues/21).

Select vertices or a chain of straight sides on one independent closed outline. A pair of sides selects its shared vertex. Preview marks the targets and uses one radius or distance. Each corner follows its own convex or reflex turn.

The model stages the edits in original outline order. It keeps the side IDs and protected constraints, checks the remaining span along each shared side, and verifies the settled outline and contacts. Studio refuses a batch that would lose a parameter binding. One Apply creates one sketch edit.

## Verification

- **Parent boundary.** At `76bc693c998afcda9ef0a485a42ce0400f3cdcc3`, the corner controls required exactly one selected point. D1694 covered that workflow.
- **PASS, actual desktop Studio WebGPU.** Three selected sides identified vertices 4 and 5 for R6. Selecting those two vertices directly produced the 6 mm Chamfer. The same selection included one convex and one reflex turn and left 13 mm of the original 25 mm shared side. Both operations refused 12.5 mm before Apply. The refused and canceled groups left the original document and all eight outline points intact.
- **PASS, native geometry and history.** One Apply and one sketch Undo changed or restored both corners. Document Undo/Redo, Save and fresh Open retained the editable outlines. Native checks verified strict closed B-reps, the eight original wall IDs and two new walls. R6 made quarter-cylinder walls centered at (44, 34) and (32, 21), with opposite orientations. The bevels made separate planar walls. The removed and added areas cancel in this fixture, so both Extrudes remain at 20000 mm³. The checks also inspect both new walls and their endpoints. Saved SHA-256 for Fillet `f82556751b09d27fc68931a4c9bf682f342a045f4e8470fe53891f5ed140a8fd`. Saved SHA-256 for Chamfer `f04dd0a186a3955bf1819b2e30e7a682d6310a6dc563e55c0395fa6c7d818e6f`.
- **PASS, regression controls.** The D1694 single-corner desktop test passed. Five batch model tests include reversed selection order, protected constraints, a nonincident contact, wraparound IDs, sparse and duplicate IDs, ID exhaustion and refusal when only 0.00004 mm of a shared side would remain.
- **PASS, local checks.** 49 focused model tests, 76 focused Studio tests, model and Studio type checks, Studio production build, scoped ESLint and diff check.
- **NOT_RUN.** Agent batch approval, mobile, live AI provider and the held B06 PDF. First mechanical CAD remains 8/10. B06 remains 6/7. Overall completion remains unmeasured.

## Reproduction

Use Node 22.19.0, the workspace gate, installed desktop Chrome and Playwright, and an external evidence directory.

```sh
pnpm --dir packages/barocss-cad-model type-check
TEST_CONCURRENCY=1 pnpm --dir packages/barocss-cad-model test corner-batch corner revision-pinned-edit tool-contract toolset
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test constraints sketch-edit-identity sketchIds sketch-presentation sketch-constraint-mark-render
pnpm --dir apps/cad-studio build
D1695_SOURCE_FROZEN=1 node apps/cad-studio/test/sketch-corner-batch-browser.mjs "$OUT/batch"
D1691_SOURCE_FROZEN=1 node apps/cad-studio/test/sketch-chamfer-browser.mjs "$OUT/single"
git diff --check
```
