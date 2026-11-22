# D1636 — Propose a Ruled surface and its exact Thicken together

P5, row 08, [#322](https://github.com/barocss/cad/issues/322) and [#368](https://github.com/barocss/cad/issues/368). Base `292a69ad58c8497157434ec4a4d9ea5d4cc64dd2`.

The agent can use the existing `direct-thicken` command inside `proposals.propose` with `values.first` and `values.second` in rail order. It takes the current `direct_revision` from `query.summary` as `expectedRevision`. The command uses the existing Ruled and Thicken builders on one private candidate. It needs one user approval in Studio and both outputs are accepted together. The original `values.surface` form remains available.

- **PASS, reproduced composition limit.** The old two-command sequence refuses the second operation when it reuses the first operation's revision. The new command needs the revision of the original rails only.
- **PASS, focused checks.** Model 15/15 unique checks and Studio 12/12. Existing single-surface Thicken and standalone Ruled approval still pass. Mixed inputs, equal IDs, hidden or ambiguous rails, a stale revision, axis collapse, agent acceptance and partial acceptance are refused. Model type check, scoped ESLint, browser syntax, generated agent docs check, Studio build and Git diff pass. MCP inventory stays at 13 groups and 24,915 per-turn characters.
- **PASS, local MCP and desktop Studio WebGPU.** Start with two R10 semicircular rails 12 mm apart. The L4 client proposes an inward 2 mm Exact cylinder Thicken using the two IDs from `query.summary`. Direct execution, stale submission, axis collapse and agent acceptance preserve the file bytes. Studio shows one pending sheet and one added solid while the document still contains the two original rails. Hiding a rail makes the proposal stale and rebase refuses it. Undo restores the source. One user approval adds both outputs. Undo and Redo remove and restore both together. Save and fresh Open retain both outputs, with the pending input file still byte-identical to its earlier bytes.
- **PASS, native inspection.** The new solid has six strict-valid faces and coaxial radii 8 and 10 mm. Preview and native volume are 678.584013175393 mm³, within 1e−8 mm³ of 216π. Reopened digest `f41ce4f456834492a37cf01c78e45705d9be3c6fba7c0d2e78b7710324fe3cea`. Studio checked 1,167 frozen source files with zero changes, page errors and console errors.
- **FAIL, intermediate checks.** Initial assertions expected the same outer state wrapper, a detailed axis-error string, and face tint on a solid-delta preview. They were corrected to check unchanged document ownership, the actual atomic refusal and the active preview mode. Studio type check also caught the new preview flag in older test fixtures. The flag now defaults to ordinary partial review for existing callers.
- **NOT_RUN.** Full local suites, additional rail families in Studio, agent-side candidate images, WebGL2 and paid live models. The linked issues remain open.

Use Node 22.19.0, installed desktop Playwright and Chrome, the heavy gate and an output directory outside the worktree.

```sh
pnpm --dir packages/barocss-cad-model test agent-direct-thicken agent-direct-ruled toolset
pnpm --dir packages/barocss-cad-model type-check
pnpm --dir apps/cad-studio test proposal-review-availability
node apps/library-docs/scripts/agent-tools.mjs --check
node --check apps/cad-studio/test/direct-thicken-agent-proposal-browser.mjs
pnpm --dir apps/cad-studio build
D1636_SOURCE_FROZEN=1 node apps/cad-studio/test/direct-thicken-agent-proposal-browser.mjs "$OUT" --rails
git diff --check
```
