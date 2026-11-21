# D1624 — Inspect a Direct surface point and normal through the local Agent

P5, row 24, [#29](https://github.com/barocss/cad/issues/29) and [#322](https://github.com/barocss/cad/issues/322). Base `f065844ecb500f6cf3279dc3081120eb973d94cb`.

`query.summary` lists each unique visible untrimmed Direct surface and its native U,V bounds. It returns the existing Direct revision pin, including for a document with surfaces alone. `query.inspect` takes `surface`, `u`, `v` and `expectedDirectRevision`. It reads the native point in mm and the oriented unit normal from the same analysis as Studio. The operation is read-only.

- **PASS, desktop Studio WebGPU and local MCP.** Save and open the straight-to-cubic Ruled surface. Studio confirms the point at the domain corner and then shows the midpoint at (u, v) = (3, 0.5). The actual local Agent returns (25, 20.375, 3.9375) mm and the unit normal (−0.0009999415051328768, −0.08999473546195871, 0.9959417391123431). Both match the independent D1623 values and the rounded Studio inspector. The file bytes and Studio document stay exact.
- **PASS, focused controls.** A same-ID source edit changes the read pin and the new point. The local server refuses a stale pin after rename, a missing pin and out-of-domain V. Model also covers literal discovery IDs, the inclusive boundary, duplicate and hidden IDs, trimmed sources, degenerate normals, placed-part scope and mixed selectors. Existing curve and face/edge inspection still pass.
- **PASS, affected checks.** 46 Model and 13 Studio tests, Model and Studio types, scoped lint, generated Agent table, production build, browser syntax and Git diff. The desktop run checks 1,020 frozen files with zero file changes and zero page or console errors. The V2 prompt and tools list total 24,817 characters, within the 25,000 cap.
- **FAIL, base capability by source inspection.** The prior Agent inspector accepted Direct curve joins, with no Direct surface discovery or point-and-normal read.
- **NOT_RUN.** Inspection on trimmed regions, live models, other renderers, exchange, mobile and full local suites. The two issues remain open.

Use Node 22.19.0 and installed desktop Chrome and Playwright. Gate heavy runs and keep screenshots and saved evidence outside Git.

```sh
pnpm --dir packages/barocss-cad-model test agent-direct-surface-inspection agent-direct-join-inspection direct-ruled-degree direct-sweep-source-ids toolset tool-contract
pnpm --dir packages/barocss-cad-model type-check
pnpm exec eslint packages/barocss-cad-model/src/chat/{contract.ts,groups.ts,sweepSource.ts,toolDefinitions.ts,part/query.ts,part/views.ts} packages/barocss-cad-model/test/agent-direct-surface-inspection.test.ts apps/cad-studio/test/direct-ruled-line-quadratic-browser.mjs
node apps/library-docs/scripts/agent-tools.mjs --check
pnpm --dir apps/cad-studio test surface-inspection ruled-endpoint toolset-mcp tool-contract-mcp
pnpm --dir apps/cad-studio build
node --check apps/cad-studio/test/direct-ruled-line-quadratic-browser.mjs
D1624_SOURCE_FROZEN=1 node apps/cad-studio/test/direct-ruled-line-quadratic-browser.mjs "$EVIDENCE/surface" --cubic --agent-inspect
git diff --check
```
