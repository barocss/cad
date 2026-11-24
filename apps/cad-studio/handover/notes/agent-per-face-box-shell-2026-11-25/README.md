# D1955 — Propose a per-face box Shell through local MCP

P1 [row 7](../../roadmap-rows/07.md), [row 12](../../roadmap-rows/12.md) and [row 16](../../roadmap-rows/16.md). [#324](https://github.com/barocss/cad/issues/324) and [D1954](../per-face-lateral-box-shell-2026-11-25/README.md). Base `989cc6fc3ead258ff1f33d01939339e4868596ff`. Agent command feature.

The local Shell command describes per-face values and uses the same current box selection and dynamic fields as Studio. It requires the current reviewed revision, one unique original opening face and all five finite kept wall values. The proposal uses the existing approval workflow.

- **FAIL, previous local MCP.** It resolves the original side face but rejects the kept wall inputs because it only reads the default field list. The original file remains byte-identical.
- **PASS, local MCP and actual desktop Studio.** A stale or missing revision, duplicate or lower face, missing top wall, value for the opening and a collapsed cavity refuse. Local L1 direct edit and acceptance refuse. A valid proposal leaves 24000 mm³ committed. Studio preview shows the cut without changing the document. Explicit approval yields 15120 mm³ and records the human decision. Undo and Redo, a 6→7 mm top wall History edit, Save and fresh Open pass.
- **PASS, native geometry and fresh Agent process.** Strict native checks retain one original two-loop opening and five wall owners. Closed-form volume and centroid match. The edited result is 16008 mm³ and the same saved feature and approved status are visible in a fresh local MCP process. The saved file hash remains unchanged.
- **PASS, affected checks.** Sixteen Model and 57 Studio checks, affected types, Studio production build, scoped ESLint and diff check pass. The first baseline harness used an incorrect import path and failed before Studio started. The corrected driver reproduced the old command refusal and completed the current proof.
- **NOT_RUN.** Paid providers, broader automation benchmark, general Shell and full local suites. #324 remains open. First mechanical CAD remains 8/10. Overall CAD stays unmeasured.

```sh
D1955_SOURCE_FROZEN=1 node apps/cad-studio/test/per-face-shell-agent-proposal-browser.mjs "$OUT/prior" --baseline
D1955_SOURCE_FROZEN=1 node apps/cad-studio/test/per-face-shell-agent-proposal-browser.mjs "$OUT/studio"
node packages/barocss-cad-model/scripts/test.mjs toolset.test revision-pinned-command shell-walls
node apps/cad-studio/scripts/test.mjs shell-opening-history parameter-height-finish
pnpm --filter @barocss/cad-model type-check
pnpm build
git diff --check
```

Screenshots and actual MCP transcripts stay outside Git.
