# D2055 — Discover and review a mixed through-cut Path proposal

P1 [row 4](../../roadmap-rows/04.md) and [row 8](../../roadmap-rows/08.md) · FEATURE · [#324](https://github.com/barocss/cad/issues/324). Product base `40f61cdb8c3e3db9cbba40b4a21f376189ed9e7a`. Reuse the mixed quadratic geometry qualified in [D2054](../mixed-quadratic-path-closeout-2026-11-27/README.md).

- **FAIL, previous stdio MCP.** Describe reported an earlier round cut followed by one rectangular through-cut. At revision `4572dbf89d2194c0`, the same transport successfully dry-ran an explicit source with both a later rectangular cut and a later round cut. A colliding dry run said to undo the last change even though nothing had been applied.
- **PASS, real local MCP.** Describe names the supported original rectangular and circular through-cut chains, the same-part revision, and the existing linked level path choices. `query.summary` identifies `n4`, `b10` and `obj_1`. A dry run at spacing 14 mm and count 2 predicts −125.664 mm³. A stale revision and an overlap at 17 mm are refused and retain the exact file bytes. The overlap response directs the caller to adjust Path or Spacing. The pending proposal leaves the part revision unchanged. MCP at L1 refuses direct approval.
- **PASS, actual desktop Chrome/WebGPU and native geometry.** Studio shows the candidate without changing the accepted stock. Hiding it restores the accepted display. User acceptance adds only the Path feature and records user attribution. Undo returns to the original solid and pending proposal. Redo and native Save/fresh Open keep the chosen source and curve IDs. The remaining stock is 23,385.9292488897 mm³. The new R2 centre is (23.3044521190, 13.5515674438) mm, in agreement with an independent quadratic arc-length integral. Both original round cuts, the rectangular cut, and the copied wall owner are verified on one strict native solid.
- **PASS, affected checks.** Model tests 23/23, Studio tests 13/13, pinned TypeScript 5.9.2 for both, scoped ESLint, syntax, diff check and Studio production build. The direct History path regression passes. The two desktop receipts report no source changes, page errors or console errors.
- **FAIL, first browser driver.** It assumed Describe returned structured content. Describe's existing MCP contract returns JSON text. The corrected driver reads the actual contract. Scoped ESLint reports two existing explicit-any warnings in the Model toolset test.
- **NOT_RUN.** Full local suites, another MCP client, live model use, cost measurement and mobile are outside this run. #324 remains open for its client and cost evaluation. First mechanical CAD remains 8/10. Overall CAD remains unmeasured.

The production change updates command help and maps the exact native Path collision to an actionable refusal. The existing evaluator, supported path geometry, approval rules and tool shapes carry the workflow.

```sh
D2055_SOURCE_FROZEN=1 node apps/cad-studio/test/prior-circular-path-cut-pattern-browser.mjs "$OUT/agent" --mixed --quadratic --agent
D2035_SOURCE_FROZEN=1 node apps/cad-studio/test/prior-circular-path-cut-pattern-browser.mjs "$OUT/manual" --mixed --quadratic --history --relink
pnpm --dir packages/barocss-cad-model test api-curve-feature-pattern toolset tool-contract
pnpm --dir apps/cad-studio test direct-curve-candidate toolset-mcp tool-contract-mcp
node "$TSC_592" --noEmit -p packages/barocss-cad-model
node "$TSC_592" --noEmit -p apps/cad-studio/tsconfig.json
pnpm --dir apps/cad-studio build
git diff --check
```

Agent desktop receipt SHA-256 `ea30641b62150162601a8de5de8f6beb42f62f68090a171ef727b6525788ad1d`. Saved native file SHA-256 `c225714af7f29cb9d3677cd501c1aef1d9580062565a98d46de28226efec5424`.

Manual desktop receipt SHA-256 `9bc8b050f2223bc9866dccbfab5c464038b0ea41c870a60d72b35c70d2faa438`.
