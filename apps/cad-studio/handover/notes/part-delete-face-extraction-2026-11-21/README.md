# D1468 — Give Delete face planning and dispatch a private module

Row 22, kernel structure. Base: `d0cd0fa8834d5931042260654f08fdcf8165d751`. The qualified repair families are tracked in [#17](https://github.com/barocss/cad/issues/17).

Move Delete face planning, native dispatch and the second-chamfer reference lookup into `part-delete-face.ts`. Part provides the same named-body converter and solid result constructor. The original operation still resolves its extra dependencies before evaluation. The operation body and earlier chamfer lookup match the prior source after adjusting indentation. `part-model.ts` drops from 1224 to 1145 lines.

## Verification

- **PASS, source equivalence.** The moved operation body's SHA-256 is `09a61dccc095c2e28889c70480b2c1dca5d3a2811e9e22a6fea875619e35cc5e` after removing its common indent. The earlier chamfer lookup has SHA-256 `3d669097c0ac9e2b69a6a493ae7113edbcb7b167e013edeb2ece9d808f5fb4ca`. The new module uses a type-only import for Part tools.
- **PASS, actual desktop Studio and stdio MCP.** Four cases pass. A cap-edge fillet returns 11965.663706 → 12000 mm³. Two adjacent chamfers return 11960 → 11980 → 12000 mm³. Two through bores return 11591.592955 → 11874.336294 → 12000 mm³ with the remaining Ø4 bore after the first edit. A cylindrical boss returns 12169.646003 → 12000 mm³. The named targets, native identities, refusal and earlier history work through Save and fresh Open. Four final receipts have zero page errors, console errors and watched source changes.
- **PASS, affected checks.** 168 Kernel, 139 Model and 44 Studio tests. Kernel and Studio builds, affected lint, Model type-check and generated agent tool table.
- **NOT_RUN.** Full local suites, actual WebGL2, mobile, STEP and performance measurement.

The current tracker marks #126, #152, #22 and #613 closed. The roadmap now matches those dispositions. Those separate workflows use their own prior evidence.

Use Node 22.19.0, existing Chrome and Playwright, and the prior decision inputs. Run heavy commands under the shared gate. Freeze worktree writes during desktop runs and keep evidence outside Git.

```sh
pnpm --filter @barocss/cad build:library
node --test packages/barocss-cad/test/{prismatic-fillet-heal,prismatic-chamfer-heal,boss-face-delete,box-wall-replacement,drafted-cap-offset,prism-wall-offset,bored-cap-offset,bored-face-delete,d148-hole-face,analytic-l-fillet-heal}.test.mjs
node packages/barocss-cad-model/scripts/test.mjs offset-bored-cap offset-to-plane delete-chamfer-face delete-boss-face delete-bore-face delete-fillet-face replace-face revision-pinned-command selectors observe views rematch references toolset tool-contract fields spec
node apps/cad-studio/scripts/test.mjs body-selection-query-ui document-file command-apply failed-feature offset-hex-side-feedback task-run-handoff toolset-mcp tool-contract-mcp
pnpm exec eslint packages/barocss-cad/src/part/{part-model,part-delete-face}.ts
pnpm --filter @barocss/cad-model type-check
pnpm --filter @barocss/cad-studio-app build
node apps/library-docs/scripts/agent-tools.mjs --check
cd apps/cad-studio
DELETE_FILLET_FACE_FROZEN=1 node test/delete-fillet-face-browser.mjs "$EVIDENCE/studio-cap" --cap-top "$EVIDENCE/top-fillet.bcad"
DELETE_PLANAR_FACE_FROZEN=1 node test/delete-planar-face-browser.mjs "$EVIDENCE/studio-adjacent-sequence" "$EVIDENCE/adjacent-chamfers.bcad" adjacent-sw sequence
DELETE_BORE_FACE_FROZEN=1 node test/delete-bore-face-browser.mjs "$EVIDENCE/studio-bore-sequence" first successive
DELETE_PLANAR_FACE_FROZEN=1 node test/delete-planar-face-browser.mjs "$EVIDENCE/studio-boss" "$EVIDENCE/boss.bcad" boss
```
