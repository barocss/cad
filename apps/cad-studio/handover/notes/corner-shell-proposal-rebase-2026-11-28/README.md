# D2154 — Rebase an unchanged corner Shell from its own review history

P1/P4 [row 04](../../roadmap-rows/04.md), [row 12](../../roadmap-rows/12.md) and [row 16](../../roadmap-rows/16.md) · [#324](https://github.com/barocss/cad/issues/324) · Base `432fd2fa14cd96812d2d725b4ca8522502e982ee`.

Studio can rebase one revision-pinned three-opening Shell after an independent body edit. The tool needs the exact reviewed revision in the current document’s Undo history. The original rectangle and Extrude records, named output key and exact native B-rep must match. Rebase only refreshes the pin and proposal review. The existing command checks the three openings and all kept wall values again. A separate Studio approval applies the proposal.

## Verification

- **PASS, desktop reproduction and repair.** The base rejects the stale pin after a second box height changes from 5 to 8 mm. Its volume changes from 500 to 800 mm³. The original 24,000 mm³ stock keeps digest `3aff73f1c2f6dbebc5d3d22471b74945f689886dbfcdce78d0003faf0629f047`. Rebase & preview leaves these native bodies unchanged. Explicit Accept gives the three-wall Shell 6,684 mm³ and keeps the updated second box at 800 mm³ with the same digest. Undo/Redo and native Save/fresh Open preserve both bodies. The reopened Shell digest is `fdcd8c97cc80547ef6240676fcb4361111bdcad83ee5f0132d9abf7dc784b22b`.
- **PASS, guarded refusal.** Editing the original Extrude to 22 mm keeps the stale proposal open. An implementation audit found that the first candidate could borrow a matching previous file from undoable Open. Desktop reproduced it. The final code stops at the most recent document boundary and refuses the previous-file match. Missing history, hidden stock and non-user refresh are refused in Model checks. An agent at level 4 still needs a user to approve the refreshed revision. The existing D2066 Fillet rebase and its missing-history control still pass in Studio.
- **PASS, affected checks.** 50 Model and 19 Studio checks, Model and Studio TypeScript, scoped ESLint with one existing warning, browser syntax, production build and diff check pass. Final desktop runs have zero page errors and frozen-file changes. The initial Studio command launched from the repository root and could not find a relative drawing fixture. Running its package script from Studio resolves that test setup error.
- **NOT_RUN.** Placed-part rebases, other Shell input forms, paid providers, mobile and full local suites. #324 remains open for its wider evaluation. The first mechanical CAD baseline is 8/10 accepted. Overall completion is unmeasured.

```sh
CORNER_SHELL_PROPOSAL_FROZEN=1 node apps/cad-studio/test/corner-shell-proposal-rebase-browser.mjs "$OUT/baseline" --baseline
CORNER_SHELL_PROPOSAL_FROZEN=1 node apps/cad-studio/test/corner-shell-proposal-rebase-browser.mjs "$OUT/final"
D2066_SOURCE_FROZEN=1 node apps/cad-studio/test/sketch-corner-proposal-rebase-browser.mjs "$OUT/fillet-control"
node packages/barocss-cad-model/scripts/test.mjs proposals rebase-moves-ops shell-walls proposal-review
pnpm --dir apps/cad-studio test proposal-review proposal-drawing proposal-history
pnpm --dir apps/cad-studio exec vite build --outDir "$OUT/studio-dist"
```
