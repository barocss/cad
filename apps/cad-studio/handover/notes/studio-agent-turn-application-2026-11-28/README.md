# D2103 — Extract Studio Agent turn application from App

P4 [row 15](../../roadmap-rows/15.md) and [row 22](../../roadmap-rows/22.md) · Base `896c5a2c5a08e6f47106c5e17b6c1d0f8948e8c4`.

A typed Studio action owns the direct and merged Agent commit, retained selection and Undo notice. App passes its current document, native bodies, commit and Undo handlers. Its line count changes from 2,463 to 2,447. The chat turn lifecycle and transport continue to use their existing interface.

## Verification

- **PASS, actual desktop before and after.** The local Model tool produces a height change from 16 to 20 mm. The existing development-only scripted transport delivers those events through the real Studio chat UI. Direct application selects the original body and an explicit Undo restores the starting part. During the second turn the person places a second box. The merge retains heights 20 and 16 mm, and one Undo restores 16 and 16 mm with the second body retained.
- **PASS, equivalence.** Across four saved desktop snapshots, the feature nodes, outputs, selection, notices and reported body results compare exactly before and after. Chrome WebGPU freezes 1,587 and 1,588 files respectively with zero source changes, page errors or console errors.
- **PASS, affected checks.** The 16 Model and 19 focused Studio tests, Studio type check, scoped lint, driver syntax, diff checks and Studio production build pass on Node 22.19.0.
- **FAIL, reproduced on the baseline.** The legacy full CLI browser controls time out before the local stand-in completes its turn. The broad chat suite reports the same three failures before and after this extraction (tool catalog list, old scripted plate scenario and Loft guide list). The separate CLI reasoning fixture also reports the same missing event sequence before and after. The extracted Studio actions are qualified through the local tool and scripted transport described above.
- **NOT_RUN.** Live provider, mobile, full local suites and broader Studio restructuring. The first mechanical CAD baseline remains 8/10 accepted. Whole CAD completion remains unmeasured.

```sh
# Node 22.19.0. Run actual Studio and affected checks under the heavy gate.
AGENT_TURN_COMMIT_FROZEN=1 node apps/cad-studio/test/agent-turn-app-commit-browser.mjs "$OUT/focused-baseline"
AGENT_TURN_COMMIT_FROZEN=1 node apps/cad-studio/test/agent-turn-app-commit-browser.mjs "$OUT/candidate" --candidate
pnpm --dir packages/barocss-cad-model test chat-merge merge-turn transactions tool-contract
pnpm --dir apps/cad-studio test o17-scripted o17-chat merge-conflict toolset-mcp tool-contract-mcp
pnpm --dir apps/cad-studio test chat o17-scripted merge-conflict toolset-mcp tool-contract-mcp
pnpm --dir apps/cad-studio test o17c-reasoning
pnpm --dir apps/cad-studio exec vite build --outDir "$OUT/studio-dist"
```
