# D1992 — Validate released non-finish held parents and refresh downstream held candidates

P1 [row 15](../../roadmap-rows/15.md) and [row 16](../../roadmap-rows/16.md), [#20](https://github.com/barocss/cad/issues/20). Base `b346ae8b2837a7d02567e0beaf2e7be6a72bf521`.

In `apps/cad-studio/src/state/referenceDecisions.ts`, `settleRef` previously checked `pending`, validated the rebuilt part with `readPart`, and called `refreshDownstreamProblems` only when the released feature was a held `fillet` or `chamfer`. Generalizing that gate to any held parent (`heldNode && !pending`) ensures confirming a held `Shell` (or `Draft`/other held parent) validates the rebuilt body before committing and refreshes downstream held feature candidates against the restored geometry without mutating downstream features.

- **Previous Studio (FAIL):** On an `80 × 40 × 12 mm` part with `Shell 2 mm (n2)` (open `n1.side[e1]`) and `Chamfer 0.5 (n3)` (`n1.side[e1]#3|n2.ceiling`), replacing the base rectangle with an orthogonal U-block polygon held both `n2` (`31,200 mm³`) and `n3`. Confirming Candidate 1 (`n1.side[s1]`) on `n2` built the shell (`14,656 − 16(4 − π) = 14,642.265482 mm³`) but left `n3` with stale outer-box candidates (`n1.side[s1]|n1.top`), so confirming Candidate 1 on `n3` failed with `Reference not applied`.
- **Actual Chrome PASS:** Confirming Candidate 1 (`n1.side[s1]`) on held `Shell 2 mm (n2)` validates the rebuilt shell (`14,642.265482 mm³`, strict B-rep, genus 0) and refreshes `Chamfer 0.5 (n3)`'s Candidate 1 to the live opening rim `n1.side[s1]#3|n2.ceiling`. Previewing Candidate 1 highlights that rim with zero notices and unchanged document/history; confirming Candidate 1 restores the chamfered shell (`14,638.615482 mm³`, strict B-rep, genus 0). Two-step Undo/Redo restores the refreshed `n3` state and both-held state; `.bcad` Save and fresh Open reopen cleanly with zero `References` issues.
- **Focused checks & regressions:** 24 Studio tests (`candidate-references` including invalid-face Shell refusal, `held-finish-replacement`), Studio `type-check`, scoped ESLint, driver syntax check, and actual Chrome regression replays of D1990 and D1991 pass.
- **Remaining scope:** History pick-on-viewport replacement for held `Shell` faces and broader topology recovery remain open on [#20](https://github.com/barocss/cad/issues/20).

[Previous stale candidate failure](studio/03-previous-stale-shell-candidate-failed.png) · [After Shell confirmed (n3 refreshed)](studio/02-shell-confirmed.png) · [Refreshed rim preview](studio/03-refreshed-rim-preview.png) · [Shell + Chamfer restored](studio/04-shell-and-chamfer-restored.png) · [Fresh Open](studio/05-fresh-open.png)

```sh
D1992_SOURCE_FROZEN=1 node apps/cad-studio/test/dependent-shell-chamfer-reverify-browser.mjs /tmp/cad-d1992-studio
D1990_SOURCE_FROZEN=1 node apps/cad-studio/test/dependent-chamfer-reverify-browser.mjs /tmp/cad-d1992-reg-d1990
D1991_SOURCE_FROZEN=1 node apps/cad-studio/test/held-finish-history-refresh-browser.mjs /tmp/cad-d1992-reg-d1991
```
