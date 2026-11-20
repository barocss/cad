# D1421 — Bind a feature edit to a reviewed model revision

2026-11-21 · P4, row 04 · [#324](https://github.com/barocss/cad/issues/324) · Base `150a1fc177f2a65d8b1ffc70579ab1c21abb22e4`

`features.edit` accepts optional `expectedRevision` from `query.render` or `query.rebuild` in the same part scope. It checks the current authored revision before resolving the target feature and evaluating a candidate. `EDIT_STALE` reports the requested and current revisions. Invalid revision syntax returns `EDIT_INPUT`. Existing edit requests can omit the pin.

- **Baseline.** The actual grouped-v2 stdio session refused the pinned edit with `UNKNOWN_ARGUMENT`. The same unpinned edit set the extrusion start to 2 mm on the newer model. Its accepted hard volume requirement still passed.
- **PASS, actual local MCP.** In one 25-request session, `describe` exposed the optional field. The A pin allowed the height edit from 8 to 12 mm. The resulting B revision `8168a3f064c2d702` refused A's `05a9fd55be312f4d` and preserved the exact saved B bytes. A malformed pin also preserved them. The decoded A and B PNG hashes matched their model-specific replies. B passed the hard volume requirement at 9600 mm³. The per-turn discovery and prompt total was 24995 characters with 13 tools.
- **PASS, executable scope.** Focused tests cover both edit forms, absent and malformed pins, the same revision as rebuild on a placed part, and atomic refusal when the second edit in a batch tries to reuse the first edit's pin. Removing the mismatch branch in an external test bundle made all three new tests fail. The base-part refusal test proves that the stale call does not evaluate a candidate.
- **PASS, actual Studio.** Desktop Chrome opened the exact MCP-authored B file. A user changed the height to 16 mm, saved and reopened it in a fresh context. The reopened strict solid had the expected eight corners and volume 12800.000000000002 mm³. The original MCP file was byte-identical, and the authored volume requirement stayed in the edited file. The browser receipt recorded zero page errors, console errors, and watched source changes.
- **PASS, affected checks.** 43 Model and 7 Studio MCP tests, scoped lint, Model type-check, Studio production build and the generated agent tool table check.
- **FAIL, intermediate.** The first focused test compared an evaluated floating-point volume to 9600 with exact equality. The existing `1e-7` mm³ tolerance gives the expected result. The full docs checker still reports refusal-table drift and the public API inventory mismatch of 44 versus 46 direct members. The base refusal source and a HEAD overlay of the public inventory inputs reproduced the respective same failures.
- **NOT_RUN.** External AI clients, paid model calls, mobile, full local suites, and whole-issue acceptance.

Use Node 22.19.0 and existing local dependencies. Run heavy tasks under the shared gate. Store the wire and browser outputs outside the repository.

```sh
node packages/barocss-cad-model/scripts/test.mjs revision-pinned-edit toolset tool-contract views batch-changes proposals
node apps/cad-studio/scripts/test.mjs toolset-mcp tool-contract-mcp batch-changes-mcp
pnpm --filter @barocss/cad-model type-check
node apps/library-docs/scripts/agent-tools.mjs --check
pnpm --filter @barocss/cad-studio-app build
node apps/cad-studio/test/agent-review-part-mcp.mjs "$WIRE_OUT"
cd apps/cad-studio
AGENT_REVIEW_SOURCE_FROZEN=1 node test/agent-review-part-browser.mjs "$STUDIO_OUT" "$WIRE_OUT/edited-stock-part.bcad"
```
