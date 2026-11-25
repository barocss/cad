# D1989 — Read-only local MCP diagnosis of a held paired Constant Fillet before a Through Hole

P1 [row 15](../../roadmap-rows/15.md) and [row 16](../../roadmap-rows/16.md), [#20](https://github.com/barocss/cad/issues/20) and [#322](https://github.com/barocss/cad/issues/322). Base `abbc5a807e27f72c949b34e5d1a5f20b336fdfd4`.

Extend `query.summary` (`response_format: 'detailed'`) in `heldFinishRecovery.ts` to report `held_finish_recovery` for a held two-edge Constant Fillet (`n2`, one or both straight slots retired) before an independent top Through Hole (`n3`). Reuse `heldPairedFilletThroughHole` and `parentPairedFilletEdge` so only complete original straight edges on `b1` clear of the Through Hole are exposed in `pick_edges`. When only one slot is retired, re-check the retained edge's saved signature on both `b3` and `b1` and exclude the retained edge from `pick_edges`. Concise reads, hidden/non-root bodies, stale retained signatures and repaired revisions omit `held_finish_recovery`.

- **PASS, local MCP + desktop Studio (`--mcp`):** Detailed `query.summary` on the saved held Studio file pinned revision `0d161a409b214008`, reporting feature `n2`, visible body `b3`, source body `b1`, downstream feature `n3`, `mode: 'studio_history_review'`, authored slot 1 (`n1.side[retired]|n1.side[e4]`), and 11 eligible original straight `pick_edges` (including `n1.side[e1]|n1.side[e4]` from `(-20, -20, 0)` to `(-20, -20, 10)` mm while excluding the circular Hole rim and already-used `n1.side[e2]|n1.side[e3]`). Concise read omitted `held_finish_recovery`, and saved bytes, Studio document and history stayed unchanged. Using the diagnosed edge midpoint in Studio History refused the Hole rim and duplicate `stable` edge, previewed and cancelled cleanly, applied explicit replacement, passed Undo/Redo and fresh native Open (`31,874.33629385641 → 31,857.168146928205` mm³), and retired `held_finish_recovery` at the repaired revision `ad225581f1d16525`. Eight desktop states, zero errors, and 1,237 unchanged frozen source paths.
- **PASS, affected checks:** 49 Model tests (`held-finish-recovery`, `references`), 16 Studio `held-finish-replacement` tests, Model and Studio `type-check`, scoped ESLint, driver syntax, and `git diff --check`. Regression Chrome+MCP replay for D1940 (`held-chamfer-through-hole-browser.mjs --mcp`) also passes.
- **NOT_RUN:** Live LLM provider calls, automatic replacement without Studio approval, three-slot or Chamfer group downstream diagnosis, and mobile. #20 and #322 stay open.

[Studio unchanged after local MCP read](studio/01b-unchanged-after-mcp-read.png) · [Diagnosed edge previewed in History](studio/04-original-edge-preview.png) · [Explicit History repair with Hole retained](studio/05-repaired-with-hole.png) · [Fresh native Open](studio/07-fresh-open-with-hole.png)

```sh
export PATH="$HOME/Library/pnpm/nodejs/22.19.0/bin:$PATH"
pnpm --filter @barocss/cad-model test held-finish-recovery references
pnpm --filter @barocss/cad-studio-app test held-finish-replacement
export PW_DIR="$HOME/github/barocss/math"
export CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
D1986_SOURCE_FROZEN=1 node apps/cad-studio/test/held-paired-fillet-through-hole-browser.mjs "$(mktemp -d /tmp/cad-d1989-replay.XXXXXX)" --mcp
```
