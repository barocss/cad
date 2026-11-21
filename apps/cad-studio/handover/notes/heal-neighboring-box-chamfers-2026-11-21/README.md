# D1465 — Heal either of two box chamfers that share a wall

P5, row 31, [#17](https://github.com/barocss/cad/issues/17). Base: `b435bf3740f02a0e935c0e7c4fff62a08adc3ac2`.

Select either of two equal full-height bevels made by one Chamfer on a rectangular box. The two bevels can share one wall with an intact strip between them. Delete face restores the selected sharp corner by extending that wall, the other incident wall and both caps. The other bevel keeps its native face, surface, loop, own trims and four world-space edges. The shared wall's trim uses the same ID and world curve with the parameters of the extended support. A separate Delete face can then restore the remaining corner.

## Verification

- **FAIL, baseline.** Actual desktop Studio identified both exact numbered bevels but disabled Delete face. Stdio MCP refused both at revision `53136f70095ade85`. The original bytes and 11960 mm³ stayed.
- **PASS, native kernel.** The four shared walls, both edge orders and both selections pass. The 40 × 30 × 10 mm stock loses two separate 20 mm³ triangular cuts. One heal leaves 11980 mm³, seven faces, seven loops, 30 coedges, 15 edges and ten vertices. The second leaves 12000 mm³ with six faces, six loops, 24 coedges, 12 edges and eight vertices. The original six support planes and face identities stay. Both sharp edge names return. The adjacent and opposite native routes refuse each other's input.
- **PASS, native boundary probe.** The separate probe covered 32 combinations of wall, edge order, first choice and origin. In 20 cases the shared-wall UV poles changed. At six probe parameters on every reparameterized trim, the worst world-space gap was `1.4211e-14 mm`. A 1 mm uncut strip passes. Touching or crossing chamfers refuse at the producer. Unequal legs, an unrelated face, the common alias and two simultaneous face selections refuse.
- **PASS, actual desktop Studio and stdio MCP.** Select either front bevel, verify the exact peer and centroid, Undo, Redo, Save and fresh Open. An unrelated wall, a wrong saved normal and stale revision refuse. One actual two-edit sequence visits 11960 → 11980 → 12000 mm³, keeps each Undo step and reopens both the Studio and MCP files. The opposite-corner sequence control passes. All four final receipts have zero page errors, console errors and watched source changes.
- **PASS, affected checks.** 153 Kernel, 136 Model and 44 Studio tests. Kernel and Studio builds, affected lint, Model type-check and generated agent tool table.
- **NOT_RUN.** Full local suites, actual WebGL2, mobile, STEP and repairs on more than two chamfers. #17 stays open.

Use Node 22.19.0 and the existing Chrome and Playwright. Use D1462 stock and substitute `n1.side0|n1.side1` for `n1.side1|n1.side2` in the two-edge Chamfer. Keep the original opposite fixture for comparison. Run heavy commands under the shared gate. Freeze worktree writes during desktop runs and keep evidence outside Git.

```sh
pnpm --filter @barocss/cad build:library
node --test packages/barocss-cad/test/{prismatic-chamfer-heal,boss-face-delete,box-wall-replacement,drafted-cap-offset,prism-wall-offset,bored-cap-offset,bored-face-delete,d148-hole-face,analytic-l-fillet-heal}.test.mjs
node packages/barocss-cad-model/scripts/test.mjs offset-bored-cap offset-to-plane delete-chamfer-face delete-boss-face delete-bore-face delete-fillet-face replace-face revision-pinned-command selectors observe views rematch references toolset tool-contract fields spec
node apps/cad-studio/scripts/test.mjs body-selection-query-ui document-file command-apply failed-feature offset-hex-side-feedback task-run-handoff toolset-mcp tool-contract-mcp
pnpm exec eslint packages/barocss-cad/src/{features/heal-prismatic-chamfer,part/part-model}.ts packages/barocss-cad-model/{src/engine/doc,test/delete-chamfer-face.test}.ts
pnpm --filter @barocss/cad-model type-check
pnpm --filter @barocss/cad-studio-app build
node apps/library-docs/scripts/agent-tools.mjs --check
cd apps/cad-studio
for end in sw se; do
  DELETE_PLANAR_FACE_FROZEN=1 node test/delete-planar-face-browser.mjs "$EVIDENCE/studio-$end" "$EVIDENCE/adjacent-chamfers.bcad" "adjacent-$end"
done
DELETE_PLANAR_FACE_FROZEN=1 node test/delete-planar-face-browser.mjs "$EVIDENCE/studio-sequence" "$EVIDENCE/adjacent-chamfers.bcad" adjacent-sw sequence
DELETE_PLANAR_FACE_FROZEN=1 node test/delete-planar-face-browser.mjs "$EVIDENCE/studio-opposite-control" "$EVIDENCE/two-chamfers.bcad" double-ne sequence
```
