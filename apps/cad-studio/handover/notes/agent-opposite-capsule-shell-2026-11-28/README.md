# D2125 — Bind both capsule Shell openings in the local Agent

P0 [row 04](../../roadmap-rows/04.md), B09 and P5 [row 07](../../roadmap-rows/07.md) · [#324](https://github.com/barocss/cad/issues/324) · Base `1e7f4c1d4d32b208955f40c7abfc4160644fb216`.

The local shell command checks for repeated names after face selectors resolve and before a duplicate becomes one display pick. Discovery tells the client how to select the complete hemisphere groups and supply the reviewed part revision. Proposal and explicit user approval run through the existing local L1 path.

- **FAIL, reproduced base behavior.** Two references to the lower hemisphere stage a one-end Shell under a title naming both ends. The proposed volume change is −11,209.203 mm³. Actual Studio shows the pending preview with the original accepted stock and the wrong one-end result. The base proposal stays pending.
- **PASS, actual local MCP.** On base revision `ae409dc2724d9482`, query discovery reads the three original face names. Duplicate literals, a literal and selector resolving to the same name, a partial hemisphere chart, a stale revision and an axis-reaching wall all refuse with original file bytes intact. L1 refuses direct edit and Agent self-approval. Selected current faces `n1.side0` and `n1.side2` stage a single pending proposal with a −12,231.268 mm³ volume change.
- **PASS, actual Studio and native read.** Preview and Hide retain the exact pending document. User approval stores both distinct curved source signatures. Undo, Redo, Save and fresh Open give a strict genus-one solid of 4,523.8934211693 mm³ and the [D2124](../opposite-open-revolved-capsule-shell-2026-11-28/README.md) manual digest `462e66fc687aee99eb3d9d2befd45b4ef7affda9c78dbc0ac5c1eec1991ff493`. The reopened MCP summary returns both opening names and the same volume at its stated precision. Both completed flows have zero runtime or console errors and zero changes to the 1,273 frozen source files.
- **PASS, affected checks.** 34 Model and 66 Studio tests, Model and Studio types, scoped ESLint, driver syntax, production build and diff check on Node 22.19.0.
- **FAIL, corrected driver.** One candidate assertion expected the inner kernel radius detail in the outer proposal response. The present response gives a general rejection with no file change. Another assertion omitted the curved source signatures that Studio stores at approval. The final driver checks their distinct names, radius, positions and symmetry.
- **NOT_RUN.** Live providers, other clients, arbitrary curved opening families, full local suites and mobile. The broader [#324](https://github.com/barocss/cad/issues/324) acceptance remains open. First mechanical CAD stays at 8/10. Whole CAD completion remains unmeasured.

```sh
# Node 22.19.0. Use the heavy gate and freeze sources while Chrome runs.
CAPSULE_SHELL_AGENT_FROZEN=1 node apps/cad-studio/test/capsule-shell-agent-browser.mjs "$OUT/baseline" --baseline
CAPSULE_SHELL_AGENT_FROZEN=1 node apps/cad-studio/test/capsule-shell-agent-browser.mjs "$OUT/studio"
pnpm --dir packages/barocss-cad-model test toolset tool-contract shell
pnpm --dir apps/cad-studio test toolset-mcp tool-contract-mcp proposal-review-availability shell
pnpm --dir apps/cad-studio exec vite build --outDir "$OUT/studio-dist"
git diff --check
```
