# D1995 — Diagnose an earlier held finish before a downstream held finish through local MCP

P1 [row 15](../../roadmap-rows/15.md) and [row 16](../../roadmap-rows/16.md), [#20](https://github.com/barocss/cad/issues/20) and [#322](https://github.com/barocss/cad/issues/322). Base `db3076bc330c82697d4175648d27aa0e79342778`.

`heldChainedFinishRecovery` (`packages/barocss-cad-model/src/chat/part/heldFinishRecovery.ts`) extends read-only local MCP `query.summary` (`response_format: 'detailed'`) to diagnose the earliest held constant single-edge Chamfer or Fillet (`n2`) whose displayed body (`b3`) passes exclusively through held downstream finishes (`n3`). It verifies prefix parent ownership (`b1`), reports authored slot metadata, live signature matches, and paginated native `pick_edges` with exact endpoints (`mode: 'studio_history_review'`), leaves the document untouched, and retires cleanly once `n2` is repaired.

- **Previous local MCP (FAIL):** Calling `query.summary` (`detailed`) on the saved D1991 chained held Chamfer `.bcad` returned `held_finish_recovery: undefined`, leaving an Agent unable to diagnose the recoverable edge on `n2`.
- **Actual Chrome + Local MCP PASS:** Saving the both-held D1991 Studio document and calling local MCP `query.summary` (`detailed`, `body: 'b3'`) returns `feature: 'n2'`, `body: 'b3'`, `source_body: 'b1'`, `downstream_feature: 'n3'`, exact document `revision`, `slots: [{ slot: 1, authored_edge: 'n1.side[e1]|n1.side[e4]', signature_matches: ['n1.side[e4]|n1.side[e5]'] }]`, and 12 unmerged native straight `pick_edges` including `n1.side[e4]|n1.side[e5]` (`[-20, -18, 0]..[-20, -18, 10]`). Studio document and history remain unchanged after MCP read. Using the MCP-diagnosed edge midpoint in Studio History `Replace edge` applies `n2` (`30,320 mm³`), refreshes `n3`'s candidate to `n1.side[e5]|n2.face`, confirms `n3` (`30,400 − 80 − 5√2/2 mm³`, `planar-exact`, strict B-rep, genus 0), passes two-step Undo/Redo and fresh Open, and retires `held_finish_recovery` on the repaired `.bcad` with an updated revision.
- **Focused checks & regressions:** 6 Model tests (`held-finish-recovery`, including concise omission, manually suppressed exclusion, and post-repair retirement), `@barocss/cad-model` `type-check`, scoped ESLint, and live Chrome+MCP regression replay of D1989 (`held-paired-fillet-through-hole-browser.mjs --mcp`) pass.
- **Remaining scope:** Multi-edge/variable-radius held chains and non-finish downstream features remain open on [#20](https://github.com/barocss/cad/issues/20) and [#322](https://github.com/barocss/cad/issues/322).

[Unchanged after MCP read](studio/01b-unchanged-after-mcp-read.png) · [MCP-diagnosed edge preview](studio/02-history-replace-preview.png) · [After History Apply (n3 refreshed)](studio/03-history-applied-downstream-refreshed.png) · [Fresh Open](studio/06-fresh-open.png)

```sh
D1991_SOURCE_FROZEN=1 node apps/cad-studio/test/held-finish-history-refresh-browser.mjs /tmp/cad-d1995-studio --mcp
D1986_SOURCE_FROZEN=1 node apps/cad-studio/test/held-paired-fillet-through-hole-browser.mjs /tmp/cad-d1995-reg-d1989 --mcp
```
