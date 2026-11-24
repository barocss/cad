# D1871 — Read held Fillet recovery choices at the current revision

P3 [row 15](../../roadmap-rows/15.md), [row 16](../../roadmap-rows/16.md), [#322](https://github.com/barocss/cad/issues/322) and [#20](https://github.com/barocss/cad/issues/20). Base `4cb001356de40c3913b22652a9cb1275016f5a7d`.

Local `query.summary` exposes a read-only recovery view for three held straight edges in a terminal Constant Fillet on the visible root part. The response names the feature, current body and document revision. It keeps the authored slot order, shows tentative signature matches separately and lists the current page of eligible viewport picks with native endpoints in mm. Studio and Model share the group admission and edge eligibility rules. The view directs the user to choose in Studio History. Studio Apply still verifies the complete set on the native body.

- **FAIL, original local MCP.** The held node and 18 current body edges were available separately. The result lacked per-slot matches, owned picks and a recovery revision.
- **PASS, local MCP and desktop Studio.** The saved held model has body `b2`, feature `n2` and revision `4ea0a48a1d957a9f`. Three explicit slots have 6, 4 and 4 tentative matches and 18 selectable native edges. The three independently known viewport picks lie at XY (5,5), (20,0) and (0,20) mm from Z0 to Z3. Structured and text results agree. File bytes, Studio document and History remain identical after reading. Concise omits the view.
- **PASS, actual Chrome desktop.** Duplicate and missing picks refuse. Cancel and one Apply keep the existing workflow. Undo restores all three held slots and Redo restores the exact accepted result. The saved model at `a605a543b6bff9ef` omits the view after fresh Open. Independent native geometry retains the expected three cylinders and `513 + 3π` mm³, and rejects the wrong edge with the same volume. Nine desktop states, zero page errors and no source changes.
- **PASS, affected checks.** 17 Model tests, 24 Studio tests, both type checks, scoped lint, production build, driver syntax and diff check. The list and prompt use 24,994 characters under their existing 25,000 cap. Controls cover a partial match, hidden or duplicated ownership, a foreign body ref, a placed part scope and a second page.
- **FAIL, first candidate desktop attempt.** The local tool description did not advertise the new output. The description now names the optional field and the final actual MCP read verifies it.
- **NOT_RUN.** Agent-authored replacement, other held kinds, other renderers, live models, mobile and full local suites. Parent issues remain open. First mechanical CAD remains 8/10. Whole-product completion remains unmeasured.

```sh
pnpm --dir packages/barocss-cad-model test held-finish-recovery tool-contract toolset
pnpm --dir apps/cad-studio test held-finish-replacement candidate-references reference-focus
pnpm --dir packages/barocss-cad-model type-check
pnpm --dir apps/cad-studio type-check
pnpm --dir apps/cad-studio build
D1871_SOURCE_FROZEN=1 node --import "$PLAYWRIGHT_LOCAL_ONLY" apps/cad-studio/test/three-held-chamfer-browser.mjs "$OUT/studio-final" --fillet --mcp
git diff --check
```
