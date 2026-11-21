# D1466 — Restore a box corner by deleting its outside fillet

P5, row 31, [#17](https://github.com/barocss/cad/issues/17). Base: `939219eb94aca72c311cd15d7389e8228afef351`.

Select the exact constant circular fillet that spans the height of one convex corner of rectangular stock. Delete face proves its quarter-cylinder, both cap arcs, side tangency and original sharp edge. It extends the two wall planes and both cap trims to the recovered corner and keeps all six stock face IDs. The wall coordinates come from the original straight edges. The tolerance only admits rounding error from the fillet construction.

## Verification

- **FAIL, baseline.** Actual desktop Studio selected the R2 face `n2.face` and disabled Delete face. Stdio MCP refused at revision `498a7c3caa2265f4`. Original bytes and the reported 11991.416 mm³ stayed.
- **PASS, native kernel.** Each of the four box corners passes. For the independent 40 × 30 × 10 mm stock the rounded volume is `12000 − 10(4 − π)` mm³. The result is exactly 12000 mm³ with centroid `[20, 15, 5]` mm and all six original faces. The strict body has six loops, 24 coedges, 12 edges and eight vertices. The original sharp edge name and exact endpoints return. Unaffected 3D edges stay identical. A separate native probe checks all four corners at R2 and translated R1.7, negative Z, same IDs and exact replay. Wrong radius, unrelated face, non-circular carrier and unsupported stock refuse.
- **PASS, actual desktop Studio and stdio MCP.** Select the front left R2 face and apply. Both paths agree on the feature recipe and native box. Undo, Redo, Save, fresh Open and Open from MCP pass. Stale revision, unrelated face and an incorrect saved radius refuse. Actual concave L-section control restores 4020 mm³. Both final receipts have zero page errors, console errors and watched source changes.
- **PASS, affected checks.** 160 Kernel, 137 Model and 44 Studio tests. Kernel and Studio builds, affected lint, Model type-check and generated agent tool table. The first Native test run omitted the required measured-area field from its stored signature. The first Model run also caught changed bore refusal wording. Both reruns pass with the measured area and the original bore guidance.
- **NOT_RUN.** Full local suites, actual WebGL2, mobile, STEP, horizontal fillet healing and multiple convex fillets. #17 stays open.

Use Node 22.19.0 and the existing desktop Chrome and Playwright. In the D1462 stock replace the Chamfer with an R2 Fillet on `n1.side0|n1.side3`. Run heavy commands under the shared gate. Freeze worktree writes during desktop runs and keep evidence outside Git.

```sh
pnpm --filter @barocss/cad build:library
node --test packages/barocss-cad/test/{prismatic-fillet-heal,prismatic-chamfer-heal,boss-face-delete,box-wall-replacement,drafted-cap-offset,prism-wall-offset,bored-cap-offset,bored-face-delete,d148-hole-face,analytic-l-fillet-heal}.test.mjs
node packages/barocss-cad-model/scripts/test.mjs offset-bored-cap offset-to-plane delete-chamfer-face delete-boss-face delete-bore-face delete-fillet-face replace-face revision-pinned-command selectors observe views rematch references toolset tool-contract fields spec
node apps/cad-studio/scripts/test.mjs body-selection-query-ui document-file command-apply failed-feature offset-hex-side-feedback task-run-handoff toolset-mcp tool-contract-mcp
pnpm --filter @barocss/cad-model type-check
pnpm --filter @barocss/cad-studio-app build
node apps/library-docs/scripts/agent-tools.mjs --check
cd apps/cad-studio
DELETE_FILLET_FACE_FROZEN=1 node test/delete-fillet-face-browser.mjs "$EVIDENCE/studio-convex" --convex "$EVIDENCE/convex-fillet.bcad"
DELETE_FILLET_FACE_FROZEN=1 node test/delete-fillet-face-browser.mjs "$EVIDENCE/studio-concave-control"
```
