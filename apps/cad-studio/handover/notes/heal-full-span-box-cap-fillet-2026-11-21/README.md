# D1467 — Restore a box cap edge by deleting its outside fillet

P5, row 31, [#17](https://github.com/barocss/cad/issues/17). Base: `2ea90f6debead2db0de018e3ae8f087bfb97da70`.

Select one full-span constant circular fillet between a cap and side wall of a straight rectangular box. Delete face proves the two end arcs, outward quarter-cylinder and tangent generators on the named supports. Continue the cap and wall to their original sharp edge. Keep the six stock face identities and the other edge names. The existing planar trim representation also serves the restored box.

## Verification

- **FAIL, baseline.** Actual desktop Studio selected `n2.face` at the upper and lower front edges and disabled Delete face. Stdio MCP refused at revisions `f255364bacdb5c62` and `d82aebb349dfcb39`. Both original files and the 11965.664 mm³ reported volume stayed.
- **PASS, native kernel.** All four side directions on both caps pass. For R2 and span `L` of 40 or 30 mm, the independent rounded volume is `12000 − L(4 − π)` mm³. The healed box is 12000 mm³ at centroid `[20, 15, 5]` mm with six faces, six loops, 24 coedges, 12 edges and eight vertices. The original sharp name and exact endpoints return. Face IDs and 11 other edge names and IDs survive. A separate 16-case probe covers translated R1.7, negative Z and exact replay. Elliptical, wrong-name, non-rectangular and partial-span examples refuse.
- **PASS, actual desktop Studio and stdio MCP.** Upper and lower front-edge edits independently restore 11965.663706 to 12000 mm³. Both preserve the six face IDs, complete Undo, Redo, Save and fresh Open, and match the native MCP file. A wrong stored radius, unrelated face and stale revision refuse. The full-height convex and inside L-section controls pass. All four final receipts have zero page errors, console errors and watched source changes.
- **PASS, affected checks.** 168 Kernel, 139 Model and 44 Studio tests. Kernel and Studio builds, affected lint, Model type-check and generated agent tool table. The first Kernel build found a widened span-axis type. The type now matches the two possible axes and the build passes.
- **NOT_RUN.** Full local suites, actual WebGL2, mobile, STEP and multiple or partial convex fillets. #17 stays open.

Use Node 22.19.0 and existing desktop Chrome and Playwright. For the D1466 stock, apply R2 to `n1.side0|n1.top` on one copy and `n1.bottom|n1.side0` on the other. Keep the full-height source for comparison. Run heavy commands under the shared gate. Freeze worktree writes during desktop runs and keep evidence outside Git.

```sh
pnpm --filter @barocss/cad build:library
node --test packages/barocss-cad/test/{prismatic-fillet-heal,prismatic-chamfer-heal,boss-face-delete,box-wall-replacement,drafted-cap-offset,prism-wall-offset,bored-cap-offset,bored-face-delete,d148-hole-face,analytic-l-fillet-heal}.test.mjs
node packages/barocss-cad-model/scripts/test.mjs offset-bored-cap offset-to-plane delete-chamfer-face delete-boss-face delete-bore-face delete-fillet-face replace-face revision-pinned-command selectors observe views rematch references toolset tool-contract fields spec
node apps/cad-studio/scripts/test.mjs body-selection-query-ui document-file command-apply failed-feature offset-hex-side-feedback task-run-handoff toolset-mcp tool-contract-mcp
pnpm --filter @barocss/cad-model type-check
pnpm --filter @barocss/cad-studio-app build
node apps/library-docs/scripts/agent-tools.mjs --check
cd apps/cad-studio
for end in top bottom; do
  DELETE_FILLET_FACE_FROZEN=1 node test/delete-fillet-face-browser.mjs "$EVIDENCE/studio-$end" "--cap-$end" "$EVIDENCE/$end-fillet.bcad"
done
DELETE_FILLET_FACE_FROZEN=1 node test/delete-fillet-face-browser.mjs "$EVIDENCE/studio-vertical-control" --convex "$EVIDENCE/convex-fillet.bcad"
DELETE_FILLET_FACE_FROZEN=1 node test/delete-fillet-face-browser.mjs "$EVIDENCE/studio-concave-control"
```
