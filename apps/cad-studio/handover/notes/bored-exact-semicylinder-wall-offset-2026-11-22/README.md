# D1666 — Offset the outer wall of a bored Exact semicylinder

P5, row 31. [#17](https://github.com/barocss/cad/issues/17) and [#629](https://github.com/barocss/cad/issues/629). Base `6db672b54f613e87ae3c1d6f8a08fb03927b28f5`.

The original outer wall of the upright two-quarter Exact semicylinder accepts a signed Offset after one central radial Difference. The stock retains its original wall Offset and linked inclined upper-cap replacement in either order. The kernel replays the stock at the new outer radius and re-cuts with the same exact tool and Difference identity. It accepts the result only if the original bore keeps both openings, the fixed inner geometry stays equal and the topology IDs and incidence match. Studio uses the existing signed Offset face command and History editor. A +3 mm Offset would leave a blind hole. The command refuses it and preserves the last accepted part and Undo entry.

- **FAIL, base.** The native terminal −1 and +1 mm moves were refused. Applying the equivalent Offset before the cut produced valid R11/R8 and R13/R8 solids with both openings. At +3 mm the outer radius would be 15 mm. The same cutter stops inside the wall and the candidate loses its outer opening.
- **PASS, affected checks.** 92 kernel, 74 Model and 16 Studio tests with zero failures or skips. Kernel, Model and Studio type checks, scoped lint, driver syntax, Studio production build and Git diff check passed. In an isolated copy of the compiled kernel, removing the topology identity comparison made the regression fail on a re-cut that changes only the Difference IDs.
- **PASS, actual desktop Studio WebGPU and local MCP.** Both authoring orders pass seven captured checkpoints with 1,174 frozen worktree files per run, zero worktree changes and zero page or console errors. Studio picked the outer face and applied −1 mm by dragging its handle. History refused +3 mm and accepted +1 mm, and Undo and Redo restored the signed edit and exact solid. Local MCP produced the same document as Studio for −1 mm and refused the unsafe value and a stale revision. Moving the linked donor −1 mm updated the cap without losing either opening. Native Save and fresh Open reproduced the moved geometry.
- **PASS, independent geometry check.** Both orders retained the 3 mm bore diameter, both openings and the fixed R8 inner skin. The native solid remained genus one with 8 faces, 10 loops, 30 edges, 60 coedges and 24 vertices. Native volumes were 1199.9368986051506 mm³ at R12, 869.685871983059 mm³ at R11, 1547.0309745691027 mm³ at R13 and 1382.097360255641 mm³ at R13 after donor motion and Open. Worker and independent integral values agreed within 1e−7 mm³. The sampled pcurve gap was 0 mm.
- **NOT_RUN.** Full local suites, WebGL2, mobile, exchange and paid live providers. This change covers the certified signed outer-wall edit. Both issues remain open for their wider scope.

Use Node 22.19.0, the heavy gate and installed Chrome and Playwright (`CHROME`, `PW_DIR`). Keep output directories outside Git. The two inputs come from the matching D1664 Studio runs.

```sh
pnpm --dir packages/barocss-cad exec node scripts/tool.mjs build:fast
pnpm --dir packages/barocss-cad type-check
pnpm --dir packages/barocss-cad exec eslint src/features/{exact-cylinder-cap-offset,heal-exact-cylinder-bore}.ts src/part/{part-delete-face,part-exact-cylinder-bore,part-model}.ts
node --test --test-concurrency=1 packages/barocss-cad/test/{exact-cylinder-bore-delete,bored-face-delete,exact-cylinder-cap-offset,analytic-boolean}.test.mjs
TEST_CONCURRENCY=1 pnpm --dir packages/barocss-cad-model test replace-face offset-exact-cylinder-wall offset-exact-cylinder-cap offset-face-native agent-offset-wall agent-axial-wall delete-bore-face
pnpm --dir packages/barocss-cad-model type-check
pnpm exec eslint packages/barocss-cad-model/src/{app/nativeOffsetFace,app/profileCommands,engine/doc}.ts packages/barocss-cad-model/test/replace-face.test.ts apps/cad-studio/test/bored-exact-semicylinder-wall-offset-browser.mjs
node --check apps/cad-studio/test/bored-exact-semicylinder-wall-offset-browser.mjs
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test offset-face-launch-view offset-plane-pick-feedback history-feature-apply tool-contract-mcp
pnpm --dir apps/cad-studio build
D1666_SOURCE_FROZEN=1 node apps/cad-studio/test/bored-exact-semicylinder-wall-offset-browser.mjs "$OUT/replace-first" "$D1664/studio-replace-final/02-drilled-stock-doc.bcad"
D1666_SOURCE_FROZEN=1 node apps/cad-studio/test/bored-exact-semicylinder-wall-offset-browser.mjs "$OUT/wall-first" "$D1664/studio-wall-final/02-drilled-stock-doc.bcad"
git diff --check
```
