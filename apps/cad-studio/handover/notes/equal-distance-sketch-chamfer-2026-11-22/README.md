# D1691 — Add an equal-distance chamfer to a sketch corner

P1 sketch authoring, rows 09, 16 and 20. Related Studio sketch issue [#21](https://github.com/barocss/cad/issues/21). Parent `5f6bb337df018e55593873e6cdb42fdf345ab2fd`.

## Behavior

Use Select on one corner of an independent closed outline. Set Chamfer distance in millimeters and apply. Both straight sides are shortened by that distance and joined by a new straight side. Their existing side IDs and unrelated constraints remain. The bevel gets a new ID. The resulting points, surviving constraints and side IDs use the existing sketch document format.

The command refuses a bevel that cannot fit, touches another boundary, changes a circle's region, removes an existing parameter binding or would drop a constraint. Settlement must keep both setback distances within 2e-6 mm and preserve the direction of both resulting turns. The profile goes through the native prismatic boundary check. The stored outline has the bevel geometry. The setback is an input to the corner edit.

## Verification

- **FAIL, parent capability.** Closed-outline corner editing offered Round. There was no 2D Chamfer action. The existing corner suite passed 18/18 at the parent.
- **PASS, desktop Studio WebGPU.** A 40 × 30 mm sketch feeding a 10 mm Extrude changes from 12000 to 11820 mm³. The analytic result is `(40 × 30 − 6 × 6 / 2) × 10`. Cut points are (34, 0) and (40, 6). Native strict B-rep validation checks the closed shell, all seven planar faces and the original four wall names. The new wall is e5. It contains both bevel endpoints at Z0 and Z10. The old (40, 0) corner is gone. Sketch Undo/Redo and document Undo/Redo restore exact points and document content. Save and fresh Open retain the solid and editable outline. Nine desktop captures. Saved native SHA-256 `3ee800b46e7258fda718a65197d3547849e8b1cf508390bab82c5c6897dbae55`.
- **PASS, refusal and numerical controls.** Studio Enter on an empty distance leaves the sketch open. A 30 mm distance leaves the source and current draft geometry unchanged. A rectangle driven by W refuses the chamfer before losing its binding. Model tests cover reversed wraparound IDs, oblique setbacks, a remote arc, a valid reflex bevel, boundary crossing, an enclosed circle leaving its region and two near-straight grid cases.
- **PASS, scoped regressions.** 46 model tests, 38 Studio sketch tests, independent geometry review, model and Studio type checks and scoped lint. The existing D890 line/arc refusal and straight Round control were also replayed in desktop Studio. The first local type check caught a test passing a B-rep wrapper instead of a part output to the mass accessor. The corrected test uses the native part output.
- **NOT_RUN.** PDF, a live AI provider, mobile, general multi-profile chamfers and dedicated persisted setback editing. First mechanical CAD remains 8/10 accepted and B06 remains 6/7. Whole CAD progress is unmeasured.

## Reproduction

Use Node 22.19.0, installed desktop Chrome and Playwright, the workspace gate and an external evidence directory.

```sh
pnpm --dir packages/barocss-cad-model type-check
pnpm --dir apps/cad-studio type-check
TEST_CONCURRENCY=1 pnpm --dir packages/barocss-cad-model test corner sketch-ellipse
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test sketch-edit-identity sketchIds
D1691_SOURCE_FROZEN=1 node apps/cad-studio/test/sketch-chamfer-browser.mjs "$OUT/studio"
D890_SOURCE_FROZEN=1 node apps/cad-studio/test/line-arc-round-browser.mjs "$OUT/round-control"
git diff --check
```
