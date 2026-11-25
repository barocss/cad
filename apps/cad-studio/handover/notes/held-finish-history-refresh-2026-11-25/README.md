# D1991 — History Replace edge on an earlier held finish refreshes downstream held candidates

P1 [row 15](../../roadmap-rows/15.md) and [row 16](../../roadmap-rows/16.md), [#20](https://github.com/barocss/cad/issues/20). Base `2d21cd33eb437f99b367609f8454016569193ecb`.

When a held single-edge constant Chamfer or Fillet (`n2`) is followed solely by held/suppressed downstream finishes along its body chain (`n3`), the displayed body (`b3`) is the unmodified passthrough of `n2`'s parent solid (`b1`). `heldFinishPassthroughBody` exposes that single solid passthrough to `useHeldFinishEdge`, retires `Edge not selected` refusal notices cleanly when picking/cancelling, and refreshes remaining downstream `References` candidates via `refreshDownstreamProblems` before committing History `Apply edge`.

- **Previous Studio (FAIL):** Opening `Chamfer 4 (n2)` in History while `Chamfer 1 (n3)` was also held showed no `Replace edge` button because the passthrough body key was `b3` rather than `b2`. Applying History edge replacement in `App.tsx` also filtered out resolved entries without refreshing downstream `References` candidates.
- **Actual Chrome PASS:** On the `80 × 38 × 10 mm` plate with retired sketch side `e1 → e5`, both `Chamfer 4 (n2)` and `Chamfer 1 (n3)` hold on Open (`30,400 mm³`). In History on `n2`, clicking the top face refuses with `Edge not selected` (unchanged document/history), picking `n1.side[e4]|n1.side[e5]` retires the refusal toast and previews the vertical edge without changing document or history, Cancel restores cleanly, and `Apply edge` restores `n2` (`30,320 mm³`) while refreshing `Chamfer 1 (n3)`'s candidate to `n1.side[e5]|n2.face`. Previewing and confirming `n3` restores the full double bevel (`30,400 − 80 − 5√2/2 = 30,316.464466094 mm³`, `planar-exact`, strict B-rep, genus 0). Two-step Undo/Redo restores the refreshed `n3` state and both-held state; `.bcad` Save and fresh Open reopen with zero `References` issues and identical native geometry.
- **Focused checks & regressions:** 23 Studio tests (`held-finish-replacement`, `candidate-references`), Studio `type-check`, scoped ESLint, driver syntax check, and actual Chrome regression replays of D1990 (`dependent-chamfer-reverify-browser.mjs`) and D1986 (`held-paired-fillet-through-hole-browser.mjs`) pass.
- **Remaining scope:** Non-finish downstream features, multi-edge/variable-radius earlier finishes in a held chain, and general topology recovery remain open on [#20](https://github.com/barocss/cad/issues/20).

[Previous no Replace edge](studio/00-previous-no-replace-edge.png) · [History Replace preview](studio/02-history-replace-preview.png) · [After History Apply (n3 refreshed)](studio/03-history-applied-downstream-refreshed.png) · [Both restored](studio/05-both-restored.png) · [Fresh Open](studio/06-fresh-open.png)

```sh
D1991_SOURCE_FROZEN=1 node apps/cad-studio/test/held-finish-history-refresh-browser.mjs /tmp/cad-d1991-studio
D1990_SOURCE_FROZEN=1 node apps/cad-studio/test/dependent-chamfer-reverify-browser.mjs /tmp/cad-d1991-reg-d1990
D1986_SOURCE_FROZEN=1 node apps/cad-studio/test/held-paired-fillet-through-hole-browser.mjs /tmp/cad-d1991-reg-d1986
```
