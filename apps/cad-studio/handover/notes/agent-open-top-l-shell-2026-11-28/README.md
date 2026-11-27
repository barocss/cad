# D2117 — Pin a local Agent Shell corner to the original top cap

P0 [row 04](../../roadmap-rows/04.md), B09 and [rows 07](../../roadmap-rows/07.md) and [30](../../roadmap-rows/30.md) · [#324](https://github.com/barocss/cad/issues/324) · Base `a0af9f695e89226934d4c1362c854f71b0ec12b3`.

The L1 local Agent may propose the same open-top L Shell corner as the manual Studio command. The request binds the current revision and one exact native top-face name on the original stock. The existing closed-body route continues to accept one literal original body ID. Studio owns approval of the pending proposal.

- **PASS, baseline.** A local stdio MCP session with revision `bab2365d2b474ed4` refuses the exact top-face name because its guard only accepts a closed-body pick. The native file is byte-identical. Actual Studio opens its original stock and checks 12,000 mm³.
- **PASS, current MCP admission.** Action discovery names the original top-cap form. Missing or stale revisions, a bottom cap, duplicate names, a role selector, a combined face/body input and the 5 mm wall limit refuse while preserving the exact original file. A direct L1 edit and MCP approval both refuse. The exact top cap and current revision stage P1 without changing the feature tree. The pending wire reports a volume change of −6,063.451 mm³ at wire precision.
- **PASS, actual desktop approval.** Preview and Hide preserve the pending document and 12,000 mm³ original. Explicit Studio approval creates the 2 mm Round Shell and keeps the original planar top signature. Undo and Redo restore the exact pending and accepted states. Native Save, fresh Open and another stdio read return 5,936.548667764616 mm³ with the same native digest as the independently verified manual D2116 result, `eb4262eceedfc28daffb702dcd47614b2632e85302c3d6fc6b3db4d68710984f`. The closed-body control also passes explicit approval and native reopen. All three desktop runs retain 1,273 source files with zero source changes, runtime errors or console errors.
- **PASS, affected checks.** 47 Model and 17 Studio tests, driver syntax, scoped ESLint, both type checks, Studio production build and diff check on Node 22.19.0.
- **FAIL.** None unexpected in the selected checks.
- **NOT_RUN.** Other Agent transports, paid models, provider-side token usage, wider Shell inputs, full local suites and mobile. [#324](https://github.com/barocss/cad/issues/324) stays open. First mechanical CAD stays at 8/10. Whole CAD completion remains unmeasured.

```sh
# Node 22.19.0. Use the heavy gate and freeze sources while actual Chrome runs.
CLOSED_L_SHELL_AGENT_FROZEN=1 node apps/cad-studio/test/closed-l-shell-agent-browser.mjs "$OUT/baseline" --open-top --baseline
CLOSED_L_SHELL_AGENT_FROZEN=1 node apps/cad-studio/test/closed-l-shell-agent-browser.mjs "$OUT/candidate" --open-top
CLOSED_L_SHELL_AGENT_FROZEN=1 node apps/cad-studio/test/closed-l-shell-agent-browser.mjs "$OUT/closed-control"
pnpm --dir packages/barocss-cad-model test shell toolset tool-contract proposals
pnpm --dir apps/cad-studio test toolset-mcp tool-contract-mcp proposal-review-availability
pnpm --dir apps/cad-studio exec vite build --outDir "$OUT/studio-dist"
```
