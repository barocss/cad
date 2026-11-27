# D2052 — Report held Fillet edges beside an independent box to the local Agent

P1 [row 4](../../roadmap-rows/04.md), [row 15](../../roadmap-rows/15.md) and [row 16](../../roadmap-rows/16.md). [#20](https://github.com/barocss/cad/issues/20). Public base `37b950a5ce8230d4805a813273786bb9707eb6f5`.

Share D2051's read-only body and slot checks between Studio History and Model. The local `query.summary` response reports the original stock, held output, independent box, two authored slots and eligible edges on the held output. The parent prefix must agree on all six original rectangular faces. Studio retains explicit Apply authority.

- **FAIL, previous local MCP on an actual Studio save.** At revision `f8f9a54e3d5ae038`, desktop History has the D2051 Replace edges action. Detailed stdio `query.summary` lists both solids and omits `held_finish_recovery`.
- **PASS, actual local MCP and desktop Studio.** On the same saved document and revision, the response reports feature `n2`, body `b2`, source `b1`, independent body `b4`, two authored slots and 12 native edges on `b2`. Second-page picks are empty and the authored slots stay present. A query for `b4` and concise responses omit recovery. The response agrees in JSON text and structured content. The saved file bytes, revision, Studio document and Undo/Redo stay unchanged during the reads.
- **PASS, actual review and fresh Open.** Both chosen edges are clicked in Studio at the midpoints reported by MCP. The independent box edge is refused. Cancel keeps the original state. Explicit Apply, Undo, Redo and Save/fresh Open pass. The strict native Fillet part is 31,982.8318530718 mm³. The same 500 mm³ companion B-rep survives. A subsequent MCP read returns the repaired revision `7b91abd887e3296e` and omits the resolved diagnostic.
- **PASS, affected checks.** 53 focused Model checks, 33 Studio checks and 15 tool contract checks, scoped ESLint, Model and Studio types with CI-pinned TypeScript 5.9.2, and Studio production build. The retained Through Hole MCP and mixed Draft desktop cases pass. Final desktop receipts have no console errors or frozen-source changes.
- **FAIL, first updated test driver.** It expected grouped action description to publish output properties. The final driver checks the public description and actual result separately.
- **NOT_RUN.** Live provider tasks and full local suites. The original #20 two-Flange file roundtrip in checklist rows 1915–1917 still needs a current replay. First mechanical CAD is 8/10. Overall CAD is unmeasured.

```sh
# On the previous main with the extended driver:
D2051_SOURCE_FROZEN=1 node apps/cad-studio/test/held-paired-fillet-group-through-hole-browser.mjs "$OUT/prior" --prior-mcp-companion
D2051_SOURCE_FROZEN=1 node apps/cad-studio/test/held-paired-fillet-group-through-hole-browser.mjs "$OUT/fixed" --mcp-companion
D1986_SOURCE_FROZEN=1 node apps/cad-studio/test/held-paired-fillet-through-hole-browser.mjs "$OUT/hole-control" --mcp
D2037_SOURCE_FROZEN=1 node apps/cad-studio/test/held-draft-companion-browser.mjs "$OUT/draft-control" --mixed
pnpm --dir packages/barocss-cad-model test held-finish-recovery references
pnpm --dir packages/barocss-cad-model test tool-contract toolset
pnpm --dir apps/cad-studio test held-fillet-box-companion held-finish-replacement held-draft-face-replacement
node "$TSC_592" --noEmit -p packages/barocss-cad-model
node "$TSC_592" --noEmit -p apps/cad-studio/tsconfig.json
pnpm --dir apps/cad-studio build
git diff --check
```
