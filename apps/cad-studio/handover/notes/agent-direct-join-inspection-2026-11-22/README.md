# D1615 — Read the exact Direct Join angle from the local Agent

P5, row 24, [#322](https://github.com/barocss/cad/issues/322) and [#29](https://github.com/barocss/cad/issues/29). Base `22ce3fae8a705b87a7065f5680f40c74bd98f626`.

Read `direct_curves` and `direct_revision` with `query.summary`. Pass the visible curve ID, the exact native knot parameter and the pin as `curve`, `parameter` and `expectedDirectRevision` to `query.inspect`. The result gives the knot point in model units and the one-sided tangent angle in degrees. The pin covers the part's revision fields and authored Direct source and object data. It applies to the base part. The admission and tangent calculation are the same as in the Studio inspector.

- **PASS, desktop Studio WebGPU and local MCP.** Join the line and quadratic, Save and fresh Open the native file. At t=1 Studio shows (25, 10, 0) mm and 54.462°. Query the same file through the local JSON-RPC server. It returns 54.46232220802562° at the same point, in agreement with the independent atan2(14, 10) reference. The native file bytes and the Studio document stay identical.
- **PASS, refusal and read ownership.** The actual server refuses a missing pin and a parameter inside the straight span. Renaming the Direct object invalidates the old pin, and the new pin gives the original angle. A changed control point leaves the ordinary part revision equal in the Model test and invalidates the Direct pin. The angle then changes to 45° at the new pin. Also cover literal IDs, hidden or duplicate IDs in discovery, a replaced part scope and the ordinary face/edge input.
- **PASS, affected checks.** 27 Model and 9 Studio tests, Model and Studio types, scoped lint, production build, browser syntax and Git diff. The per-turn Agent contract is 24,807 characters of a 25,000 limit. The 1,014 Studio/geometry source files and eight additional Agent source files match across the actual run. Zero runtime errors, console errors and file changes.
- **FAIL, baseline by source inspection.** The existing Agent inspection only admits face and edge selectors. The ordinary rebuild revision excludes Direct edits.
- **NOT_RUN.** Live model interpretation, general or weighted joins, other renderers, exchange, mobile and full local suites. Both issues remain open.

Use Node 22.19.0 and installed desktop Chrome and Playwright. Use the heavy gate and keep the output directory outside Git.

```sh
pnpm --dir packages/barocss-cad-model test agent-direct-join-inspection direct-join-tangents direct-join-degree direct-sweep-source-ids toolset
pnpm --dir packages/barocss-cad-model type-check
pnpm exec eslint packages/barocss-cad-model/src/chat/{contract.ts,groups.ts,sweepSource.ts,toolDefinitions.ts,part/query.ts,part/views.ts} packages/barocss-cad-model/test/agent-direct-join-inspection.test.ts apps/cad-studio/test/direct-join-line-quadratic-browser.mjs
pnpm --dir apps/cad-studio test curve-analysis-error join-endpoint-guidance
pnpm --dir apps/cad-studio build
node --check apps/cad-studio/test/direct-join-line-quadratic-browser.mjs
D1615_SOURCE_FROZEN=1 node apps/cad-studio/test/direct-join-line-quadratic-browser.mjs "$EVIDENCE" --agent-inspect
git diff --check
```
