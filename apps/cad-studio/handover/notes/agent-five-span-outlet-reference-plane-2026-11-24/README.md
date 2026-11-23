# D1855 — Review and approve a plane-bound outlet through the local Agent

P5 [row 16](../../roadmap-rows/16.md) and [row 31](../../roadmap-rows/31.md), [#324](https://github.com/barocss/cad/issues/324). Base `05892fb10eeb9c755e150c035671a5982f179969`.

The local Agent can use the existing two-face Offset command to propose the original five-span outlet move. The dry-run result and proposal summary name the actual source and donor from the resulting feature. The stored proposal keeps the current revision. Actual Studio displays the candidate and its volume change before the explicit user decision.

- **PASS, local MCP.** The command description identifies the supported Sweep outlet. Dry run reports `n1.end` and `n3.side3` on `n4` from the resolved candidate. The model volume changes by +128 mm³. A stale command revision and a nonparallel reference refuse. Staging preserves the original model and MCP cannot accept the proposal.
- **PASS, actual desktop Studio.** Preview and Hide preserve the accepted document. After changing the donor Move, the old proposal shows stale, disables Preview and offers no Accept action. On the original reviewed revision, explicit user Accept persists the source, donor face and plane binding. The exact native result keeps both passages and 48 joins. Native Save and fresh Open reproduce the approved geometry and donor. The manual Offset control passes. Two desktop runs capture 14 states with no page, console or source-change errors.
- **PASS, affected checks.** 30 Model and 6 Studio tests, Model and Studio types, the Studio production build, scoped ESLint, driver syntax and Git diff check.
- **FAIL.** None in the affected checks.
- **NOT_RUN.** Revision-pinned Agent rendering and independent inspect, full local suites, other renderers, mobile and live providers. First mechanical CAD remains 8/10. Whole-product completion remains unmeasured.

```sh
pnpm --dir packages/barocss-cad-model test paired-elbow-outlet-offset-handle proposals.test offset-to-plane tool-contract
pnpm --dir apps/cad-studio test tool-contract-mcp command-build-failure offset-plane-pick-feedback
pnpm --dir packages/barocss-cad-model type-check
pnpm --dir apps/cad-studio build
D1855_SOURCE_FROZEN=1 node apps/cad-studio/test/paired-outlet-reference-plane-browser.mjs "$OUT/agent" --agent
D1854_SOURCE_FROZEN=1 node apps/cad-studio/test/paired-outlet-reference-plane-browser.mjs "$OUT/studio-control"
git diff --check
```
