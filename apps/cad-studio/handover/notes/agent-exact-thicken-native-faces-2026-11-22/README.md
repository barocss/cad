# D1638 — Inspect native faces in a pending Exact Thicken

P5, row 08, [#322](https://github.com/barocss/cad/issues/322) and [#324](https://github.com/barocss/cad/issues/324). Base `90878d796e7ab285d7f1c18028d5e38274a252ad`.

Pass exact face names from the image legend to `query.inspect` with the proposal ID and both review pins used by `query.render`. Render and inspect replay the same pinned proposal privately. The inspection resolves each name to one native B-rep face and reads the plane or cylinder geometry. A cylinder reports its axis, radius and the sense of its outward normal. After approval, the same inspection takes the current part's `expectedRevision`. Literal face names remain intact in the MCP image legend and measurements.

- **PASS, focused checks.** Model 16/16. An exact planar candidate with an existing box reports the top plane and its normal. The approved part returns the same face details. Unknown names, non-name selectors, missing or stale pins, rejected proposals and accepted proposals passed as pending are refused. Model type check, scoped ESLint, generated agent tools check, browser syntax, Studio build and Git diff pass. MCP inventory stays at 13 groups and 24,915 characters per turn.
- **PASS, local MCP and desktop Studio WebGPU.** Resolve `n0.normal` and `n0.reverse` from the pending semicylinder image at model revision `8354e1b3edac790f`. The radii are 10.000000000000002 and 8.000000000000002 mm. Their axes run in +Z through XY (20, 20), within 1e−8 mm. The outer wall normal points away from the axis and the inner wall normal points toward it. The response's structured content matches its JSON text. Studio shows the same 2 mm candidate. One approval, Save and fresh Open reproduce both complete face records. The two files remain byte-identical across read calls.
- **PASS, stale controls.** Hiding one rail in Studio makes both the source and proposal pins stale. The inspection refuses and returns no faces. After approval the old proposal is no longer inspectable as pending. Studio checked 1,170 frozen files with zero worktree changes, page errors or console errors.
- **FAIL, initial dispatch wiring.** The first candidate inspection used the ordinary query dispatch and the existing approval guard refused replay. The corrected route uses private proposal replay and returns only the read result.
- **NOT_RUN.** Full local suites, WebGL2, placed assemblies, native face kinds beyond planes and cylinders, and paid live models. The linked issues remain open.

Use Node 22.19.0, installed desktop Playwright and Chrome, the heavy gate and an output directory outside the worktree.

```sh
pnpm --dir packages/barocss-cad-model test agent-direct-thicken agent-direct-ruled toolset
pnpm --dir packages/barocss-cad-model type-check
node apps/library-docs/scripts/agent-tools.mjs --check
node --check apps/cad-studio/test/direct-thicken-agent-proposal-browser.mjs
pnpm --dir apps/cad-studio build
D1638_SOURCE_FROZEN=1 node apps/cad-studio/test/direct-thicken-agent-proposal-browser.mjs "$OUT" --candidate-faces
git diff --check
```
