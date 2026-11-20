# D1462 — Heal either of two opposite box chamfers

P5, row 31, [#17](https://github.com/barocss/cad/issues/17). Base: `5c19e0ec30de1f96598f82341fff96d9537cd06f`.

Apply **Delete face** to one of two equal full-height chamfers on opposite corners of a straight rectangular box. Identify each bevel by its original native face name. Extend only the two walls and both caps that bound the selected bevel. Keep the other bevel and its complete boundary records.

Studio shows the distinct native name on the selected face. The agent can read it in `query.summary` or the `query.render` legend. The shared display alias refuses as ambiguous. Save stores one original face name and one signed planar signature.

## Verification

- **FAIL, baseline.** Actual desktop Studio picked either bevel but displayed the shared name `n2.face` and disabled Delete face. Stdio MCP refused both qualified names at revision `81daec34189be18c`. The source bytes and 11960 mm³ were unchanged.
- **PASS, native kernel.** Both opposing diagonals, both authored edge orders and either selected face pass at their tested origins. With the 40 × 30 × 10 mm stock and 2 mm equal legs, each removed triangular cut is 20 mm³. The source is 11960 mm³ and either heal is exactly 11980 mm³. The healed shell has seven faces, seven loops, 30 coedges, 15 edges and ten vertices at genus zero. The other face record, its trim uses, their twins and pcurves match exactly. Seven face identities and 14 unaffected edge identities stay. The recovered edge takes the original sharp edge name. Adjacent chamfers, unequal legs and mismatched names refuse.
- **PASS, actual desktop Studio and stdio MCP.** Front and Back picks show distinct labels. Either Delete face checks the independent retained-cut centroid and volume, the surviving bevel and original sharp edge. Both pass Undo, Redo, Save and fresh Open. The MCP document matches the Studio document and opens to the same native body. The shared alias, unrelated stock plane, incorrect saved direction and stale revision refuse. The single vertical chamfer and boss controls pass. Four final receipts record zero page errors, console errors and watched source changes.
- **PASS, affected checks.** 146 Kernel, 135 Model and 44 Studio tests. Kernel and Studio builds, affected lint, Model type-check and generated agent tool table. An existing observation test still expected the old concise sketch row shape after `7ed7ad0aa` added the sketch ID. The test now checks that sketch rows keep the ID and other concise rows keep only the index and label.
- **NOT_RUN.** Full local suites, actual WebGL2, mobile, STEP, adjacent chamfer healing and sequential deletion of the remaining bevel. #17 stays open.

Use Node 22.19.0 and the existing Chrome and Playwright. Use the 40 × 30 × 10 mm rectangular stock from [D1460](../heal-full-height-box-chamfer-2026-11-21/README.md). Chamfer `n1.side0|n1.side3` and `n1.side1|n1.side2` in one feature at 2 mm. Keep the D1460 single chamfer and [D1459 boss](../delete-cylindrical-boss-top-2026-11-21/README.md) inputs as controls. Run heavy commands under the shared gate and keep browser evidence outside Git. Freeze worktree writes while the desktop runs.

```sh
pnpm --filter @barocss/cad build:library
node --test packages/barocss-cad/test/{prismatic-chamfer-heal,boss-face-delete,box-wall-replacement,drafted-cap-offset,prism-wall-offset,bored-cap-offset,bored-face-delete,d148-hole-face,analytic-l-fillet-heal}.test.mjs
node packages/barocss-cad-model/scripts/test.mjs offset-bored-cap offset-to-plane delete-chamfer-face delete-boss-face delete-bore-face delete-fillet-face replace-face revision-pinned-command selectors observe views rematch references toolset tool-contract fields spec
node apps/cad-studio/scripts/test.mjs body-selection-query-ui document-file command-apply failed-feature offset-hex-side-feedback task-run-handoff toolset-mcp tool-contract-mcp
pnpm --filter @barocss/cad-model type-check
pnpm --filter @barocss/cad-studio-app build
node apps/library-docs/scripts/agent-tools.mjs --check
cd apps/cad-studio
for end in sw ne; do
  DELETE_PLANAR_FACE_FROZEN=1 node test/delete-planar-face-browser.mjs "$EVIDENCE/studio-$end" "$EVIDENCE/two-chamfers.bcad" "double-$end"
done
DELETE_PLANAR_FACE_FROZEN=1 node test/delete-planar-face-browser.mjs "$EVIDENCE/studio-vertical-control" "$EVIDENCE/chamfer.bcad" chamfer
DELETE_PLANAR_FACE_FROZEN=1 node test/delete-planar-face-browser.mjs "$EVIDENCE/studio-boss-control" "$EVIDENCE/boss.bcad" boss
```
