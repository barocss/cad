# D2119 — Pin a local Agent Shell corner to the original bottom cap

P0 [row 04](../../roadmap-rows/04.md), B09 and [rows 07](../../roadmap-rows/07.md) and [30](../../roadmap-rows/30.md) · [#324](https://github.com/barocss/cad/issues/324) · Base `77b95a7405085eddb93d19cf38760505ddab2df9`.

The local Agent shares the supported single end-cap selection with the manual L Shell command. For an explicit corner it requires a current revision and the literal, unique original native cap name. A pending proposal still needs explicit user approval in Studio.

- **PASS, baseline.** A local L1 stdio MCP session refuses the original bottom cap at the current revision. The native file stays identical and actual Studio opens the unchanged 12,000 mm³ stock.
- **PASS, current local Agent.** Action discovery names the exact original end-cap form. Missing or stale revisions, a side face, duplicate faces, both caps, a role selector, mixed face/body input and a 5 mm wall refuse and preserve the original file bytes. An L1 direct edit and autonomous approval refuse. A single current pinned `n1.bottom` stages one proposal without changing the feature tree.
- **PASS, actual Studio.** Preview and Hide retain the accepted source and the proposal. User approval produces the same 2 mm Round shell as the independently measured manual D2118 result. It preserves the original bottom signature. Undo and Redo restore the exact pending and accepted states. Save, fresh Open and a second MCP read reproduce 5,936.548667764618 mm³ and native digest `5271414d1534ed86dbc9ff8902459b831d25768661a5b88248e025cac06ce0e1`. The actual top-opening control passes. All three desktop runs retain 1,273 source files with zero source changes, runtime errors or console errors.
- **PASS, affected checks.** 47 Model and 17 Studio tests, both type checks, scoped ESLint, driver syntax, production build and diff check on Node 22.19.0.
- **FAIL.** None unexpected in the selected checks.
- **NOT_RUN.** Other Agent transports, live providers and token usage, wider Shell inputs, full local suites and mobile. [#324](https://github.com/barocss/cad/issues/324) remains open. First mechanical CAD stays at 8/10. Whole CAD completion remains unmeasured.

```sh
# Node 22.19.0. Use the heavy gate and freeze sources while Chrome runs.
CLOSED_L_SHELL_AGENT_FROZEN=1 node apps/cad-studio/test/closed-l-shell-agent-browser.mjs "$OUT/baseline" --open-bottom --baseline
CLOSED_L_SHELL_AGENT_FROZEN=1 node apps/cad-studio/test/closed-l-shell-agent-browser.mjs "$OUT/candidate" --open-bottom
CLOSED_L_SHELL_AGENT_FROZEN=1 node apps/cad-studio/test/closed-l-shell-agent-browser.mjs "$OUT/top-control" --open-top
pnpm --dir packages/barocss-cad-model test shell toolset tool-contract proposals
pnpm --dir apps/cad-studio test toolset-mcp tool-contract-mcp proposal-review-availability
pnpm --dir apps/cad-studio exec vite build --outDir "$OUT/studio-dist"
```
