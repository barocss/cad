# D1692 — Propose a sketch chamfer

P1 sketch authoring and Agent tools, rows 04, 09 and 16. [Issue #21](https://github.com/barocss/cad/issues/21).

`query.edit_fields` can return straight corner points and their two saved side IDs. `features.edit` requires the exact sketch ID, one incident side pair and the current part revision. The edit calls the same `chamferCorner` as Studio and uses the existing proposal, reference rematch and rebuild path. There is no document schema or grouped tool list change. The first Agent scope is one independent saved material outline without holes. Construction shapes and the sketch plane carry through the profile replacement.

## Verification

- **FAIL, parent capability.** On `c2487c89ad1e4510cc76220de63127e3f010da4c`, the live MCP handler returned `UNKNOWN_ARGUMENT` for the chamfer request. The native file was unchanged.
- **PASS, local MCP.** Discovery identified sketch `n0` and sides `e1` and `e2` at (40, 0), in sketch mm. Dry run reported −180 mm³. Missing and stale revision, wrong sketch, nonincident sides and a 30 mm setback refused. The negative calls and dry run preserved file bytes. MCP could stage P1 and could not approve it. The saved pending geometry was still the original Extrude.
- **PASS, actual desktop Studio.** P1 Preview showed −180 mm³, with the original model intact before Accept. Accept recorded user approval. A 40 × 30 mm outline and 10 mm Extrude changed from 12000 to 11820 mm³. The strict closed B-rep had seven planar faces. The original four wall IDs survived and the bevel wall used `e5`. The 40 mm length and fixed-point rule survived. Save and fresh Open restored the same native geometry and five editable sketch points. Six desktop captures. Saved SHA-256 `67a884b81253c15316dfc24e7c2a5cdde13279a1518b2c7109d7fa67392ebe5f`.
- **PASS, local checks.** 53 focused model tests cover read-only discovery, reversed side order, preserved construction and plane, refusal before evaluation, a protected width binding and the existing wire budget. Model and Studio type checks, Studio production build, scoped lint and diff check passed.
- **NOT_RUN.** Live AI provider, mobile, PDF and Agent Round. First mechanical CAD remains 8/10 accepted. B06 remains 6/7 accepted. Overall CAD completion remains unmeasured.

The first browser qualification run stopped at an incorrect test accessor for the `describe` reply. The rerun used the existing `input` field and passed. The reopened outline retained the fixture's authored constraints and the existing redundant-constraint notice.

## Reproduction

Use Node 22.19.0, the workspace gate, installed desktop Chrome and Playwright, and an external evidence directory.

```sh
pnpm --dir packages/barocss-cad-model type-check
TEST_CONCURRENCY=1 pnpm --dir packages/barocss-cad-model test revision-pinned-edit tool-contract toolset corner sketch-reopen-side-ids
pnpm --dir apps/cad-studio build
D1692_SOURCE_FROZEN=1 node apps/cad-studio/test/sketch-chamfer-agent-browser.mjs "$OUT"
git diff --check
```
