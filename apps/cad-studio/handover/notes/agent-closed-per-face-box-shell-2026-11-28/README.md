# D2139 — Approve a closed six-wall Shell through the local Agent

P0 [row 04](../../roadmap-rows/04.md), B09 and P5 [row 07](../../roadmap-rows/07.md) · [#324](https://github.com/barocss/cad/issues/324) · Base `f03164acafc10bb1aab6fea5a2802be6ae08b2ee`.

The existing local Shell command accepts a closed per-face proposal for one explicit original rectangular body key when every wall thickness and the current `expectedRevision` are present. The per-face contract lives in `reviewedShellWalls.ts` and reuses the manual Shell command. Open-shell proposals continue to require original opening face names. Local L1 still requires user approval in Studio.

## Verification

- **PASS, baseline.** Local MCP identifies `b1` and the current revision but refuses a body-only per-face Shell. It leaves the original file unchanged. Chrome Desktop opens one 24,000 mm³ solid from that file.
- **PASS, local MCP and desktop.** Discovery gives the closed contract. Missing and stale revisions, an absent or duplicate body key, a mixed body/face pick, missing or text thickness and a cavity collapse all refuse with the original native file bytes intact. The local Client cannot mutate the document directly at L1 or approve its own proposal. Actual Studio previews the −11,520 mm³ change and Hide preserves the pending document. Explicit user approval records the original six signatures and the exact closed Shell.
- **PASS, native agreement.** The final one-body, two-shell result is 12,480 mm³ and 8,416 mm². Its native B-rep digest `cc628f965b16b1013d97213e29993f1b2a51690fa85fb4b98bc7c8c75b89dc6f` matches the actual manual [D2138](../closed-per-face-box-shell-2026-11-28/README.md) document, remains unchanged after Undo/Redo and native Save/fresh Open, and the reopened MCP query agrees. Both desktop flows freeze 1,281 files, with zero changes, page errors or console errors.
- **PASS, affected checks.** 24 Model and 66 Studio tests. Both type checks, scoped lint, driver syntax, diff check and the production build pass on Node 22.19.0.
- **NOT_RUN.** Hosted providers, additional Shell geometries, full local suites and mobile. #324 remains open for the larger Agent acceptance. First mechanical CAD remains 8/10 accepted. Overall completion is unmeasured.

```sh
# Node 22.19.0. Use the heavy gate and freeze sources while Chrome runs.
CLOSED_BOX_WALL_AGENT_FROZEN=1 node apps/cad-studio/test/closed-box-wall-shell-agent-browser.mjs "$OUT/baseline" --baseline
CLOSED_BOX_WALL_AGENT_FROZEN=1 node apps/cad-studio/test/closed-box-wall-shell-agent-browser.mjs "$OUT/candidate"
pnpm --dir packages/barocss-cad-model test toolset tool-contract shell-walls
pnpm --dir apps/cad-studio test toolset-mcp tool-contract-mcp proposal-review-availability shell
pnpm --dir apps/cad-studio exec vite build --outDir "$OUT/studio-dist"
```
