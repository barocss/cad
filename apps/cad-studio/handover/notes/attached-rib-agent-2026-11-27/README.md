# D2078 — Review a face-attached Rib from the local Agent

P1 [row 04](../../roadmap-rows/04.md) and [row 08](../../roadmap-rows/08.md) · [#324](https://github.com/barocss/cad/issues/324) · Base `100aed5de4ea39b1f355e9b38bfc227101788382`.

Studio and `features.command` share the same Rib command and native evaluator. The Agent reads the current part revision and a unique original native cap name. It can stage a Rib with `proposals.propose`. Local autonomy L1 leaves the proposal for explicit Studio approval. The command takes finite millimetre values and rejects stale pins, face aliases, duplicate picks and unsupported faces.

`proposals.list` exposes the review revision for one pending attached Rib. `query.render` and `query.inspect` replay the proposal on a copy and verify its native result. The shared evidence includes the original cap, signed direction, dimensions, engagement and added volume. Native readback checks the resulting outer Z, one strict closed solid and the analytic volume increment. The inspection uses the same image and proposal revisions as the private review.

## Verification

- **PASS, baseline reproduction.** Actual local MCP at the base commit returns `No command "rib"` from `describe` and refuses the typed proposal with `Unknown command "rib"`. The document bytes stay unchanged.
- **PASS, local stdio MCP.** Discover `n1.top` and its +Z normal from the current part. Wrong or missing part revisions, duplicate names, a vertical face and an empty coordinate refuse without changing the file. Autonomy L1 refuses direct execution and Agent acceptance. The pending proposal leaves the stock nodes unchanged. Render and pinned native inspection agree on the 20 × 2 × 5 mm Rib, 1 mm engagement and 200 mm³ addition. A wrong image pin returns `MODEL_REVIEW_IMAGE_STALE`.
- **PASS, actual Studio desktop Chrome WebGPU.** Preview adds a green 200 mm³ overlay while the stock recipe stays intact. Hide returns to the stock, and explicit Accept attributes the change to `user`. Undo restores the pending state and Redo restores the accepted result. The 1,000 × 1,000 local MCP preview and accepted fresh Open render match byte for byte. Both use SHA-256 `ce19a1e1f340ecf2c503f9434b98448d3c9ccdb40b04e4b6b68bb228e950a2c1`.
- **PASS, edited and reopened geometry.** The accepted top Rib stays on `n1.top` when `H` changes from 10 to 12 mm. Volume changes from 12,200 to 14,600 mm³, and maximum Z changes from 15 to 17 mm. The second fresh Open retains the same authored bounds, native result and closed solid. The Agent browser run retained 1,270 frozen source hashes and reported zero page or console errors. The separate manual Studio regression also passes for both attachment sides.
- **PASS, focused checks.** The 28 Model and five Studio tool-contract checks pass. Scoped ESLint, both type checks, both driver syntax checks, diff check and the Studio production build pass.
- **FAIL, initial integration checks.** The candidate initially lacked `modelReviewRevision`. The final review route provides it and gates image readback. An early driver looked for `native_name` on an unaggregated face. The actual response exposes that native name as `name`. The initial Model type check caught missing numeric tuple narrowing. The final evidence checker uses the existing finite-vector guard.
- **NOT_RUN.** Paid or live language models, lower-cap Agent browser approval, full local suites and mobile. The manual lower-cap path retains its qualified coverage. First mechanical CAD acceptance remains 8/10. Product-wide completion remains unmeasured.

```sh
# Node 22.19.0. Use the heavy gate for desktop execution and feature checks.
ATTACHED_RIB_AGENT_FROZEN=1 node --import "$LOCAL_PLAYWRIGHT_PRELOAD" apps/cad-studio/test/attached-rib-agent-browser.mjs "$OUT/final"
ATTACHED_RIB_FROZEN=1 node --import "$LOCAL_PLAYWRIGHT_PRELOAD" apps/cad-studio/test/attached-rib-browser.mjs "$OUT/manual"
pnpm --dir packages/barocss-cad-model test attached-rib api-rib toolset tool-contract agent-direct-ruled-proposal
pnpm --dir apps/cad-studio test toolset-mcp tool-contract-mcp
tsc --noEmit -p packages/barocss-cad-model
tsc --noEmit -p apps/cad-studio
pnpm --dir apps/cad-studio exec vite build --outDir "$OUT/studio-dist"
```
