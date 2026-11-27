# D2109 — Bind an Agent Shell corner proposal to its original body

P1 [row 04](../../roadmap-rows/04.md) and [row 07](../../roadmap-rows/07.md) · [#324](https://github.com/barocss/cad/issues/324) · Base `29f024584080c255cb424ddbf3b56654b4e17727`.

An explicit Sharp or Round Shell through the local `features.command` path requires the current part revision and one exact original body ID. The command uses the shared original upright L profile admission and the existing proposal approval flow.

## Verification

- **PASS, baseline reproduction.** Local L1 stdio MCP refuses a stale revision and stages the explicit Round command when the revision is omitted. Desktop Studio can preview that pending proposal. The original L prism stays at 12,000 mm³ until approval.
- **PASS, candidate admission.** For base revision `bab2365d2b474ed4`, a missing revision, stale revision, duplicate body key, extra face selection and 5 mm closed-wall collapse all refuse. Each rejection preserves the complete original file. A current revision and exact `b1` stage a 2 mm Round Shell without applying it. Direct execution and Agent self-approval refuse at L1.
- **PASS, actual desktop approval and native readback.** Preview and Hide preserve the exact pending document and 12,000 mm³ accepted stock. Explicit Studio approval authors a Round Shell on the original Extrude. The actual Worker and native evaluation give 6,610.265482457433 mm³, within 4 × 10⁻¹² mm³ of the independent formula. The closed solid has one cavity and a radius-2 mm cylindrical inner corner. Undo, Redo, Save and fresh Open reproduce the identical B-rep SHA-256 `b9fbf20b1a97e0d84d4b9f597f2e06dfe95ab9fc8d8dd7bef96010a436be7b7e`. The reopened local MCP summary returns the stored node and 6,610.265 mm³. Both Studio runs freeze 1,272 files with zero source changes, page errors or console errors.
- **PASS, affected checks.** All 33 Model and 54 Studio tests, scope lint, Model and Studio types, driver syntax, diff check and Studio production build pass on Node 22.19.0.
- **FAIL, corrected test setup.** The first baseline compared the rounded MCP volume change with the unrounded oracle. The driver now verifies the three-decimal wire values and checks unrounded precision independently in native and Worker output. The corrected baseline and candidate pass.
- **NOT_RUN.** Raw feature mutation and other Agent edit paths, provider-driven dialogue, token cost, additional geometry, full local suites and mobile. First mechanical CAD is 8/10 accepted. Whole CAD completion remains unmeasured. [#324](https://github.com/barocss/cad/issues/324) stays open for its broader evaluation.

```sh
# Node 22.19.0. Use the heavy gate for each actual Studio flow and the affected checks.
CLOSED_L_SHELL_AGENT_FROZEN=1 node apps/cad-studio/test/closed-l-shell-agent-browser.mjs "$OUT/baseline-final" --baseline
CLOSED_L_SHELL_AGENT_FROZEN=1 node apps/cad-studio/test/closed-l-shell-agent-browser.mjs "$OUT/candidate"
pnpm --dir packages/barocss-cad-model test shell toolset tool-contract
pnpm --dir apps/cad-studio test shell toolset-mcp tool-contract-mcp
pnpm --dir apps/cad-studio exec vite build --outDir "$OUT/studio-dist"
```
