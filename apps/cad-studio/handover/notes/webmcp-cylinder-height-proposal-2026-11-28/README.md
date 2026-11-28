# D2192 — Propose a Cylinder height change from the browser

P1 [row 04](../../roadmap-rows/04.md) and [row 16](../../roadmap-rows/16.md) · [#204](https://github.com/barocss/cad/issues/204) · Base `3801a7c925b19ea1ae4c4f6873bf28bf70554ab7`.

The current-part read grant exposes the body key and revision. A distinct, single-use edit grant now admits a standalone circle with a positive literal Extrude distance and a literal base on the default sketch plane. The browser sends the current body key, revision and new height to the normal revision-pinned feature edit. For a saved Cylinder, Studio must reproduce the sketch and extrusion from the command record. The edit keeps the command record and its 1 mm minimum height. A literal circle Extrude uses its existing positive distance range. Drafted or nonliteral profiles and dependent features remain outside this grant.

## Verification

- **PASS, actual desktop Studio.** Chrome 158.0.8127.89 registered the real WebMCP tool after the distinct edit grant. Wrong revision and subminimum Cylinder requests refused. A 5 mm radius Cylinder at centre [8, −3] mm and base Z = 4 mm measured 785.398163397 mm³ at height 10 mm. The 15 mm proposal preview showed +392.7 mm³ with the accepted body still at 10 mm. The fulfilled grant retired and its old tool handle refused reuse.
- **PASS, actual user approval and persistence.** Studio approval produced 1178.097245096 mm³ and bounds [3, −8, 4] to [13, 2, 19] mm. The exact Cylinder command remained replayable, with its height updated and its sketch, base and output identity preserved. Undo, Redo and browser-project Save, Close, reload and fresh Open preserved the expected documents. The reopened project required a new tool grant.
- **PASS, regressions.** The rectangular Extrude and first Box desktop flows pass, including typed draft refusal, late Worker delivery after Open and user approval. The focused Model tests cover a standalone Cylinder command, literal circle Extrude and their distinct distance rules. 24 Model tests, 18 Studio tests, both type checks, scoped lint and the Studio production build pass.
- **FAIL, first Model type check.** Two new volume assertions assumed an optional volume was always present. The final assertions check that the volume is present before comparing it with the analytic value.
- **NOT_RUN.** A live natural-language browser client, full policy parity, full local suites and mobile. #204 remains open. First mechanical CAD remains 8/10. Overall CAD and natural-language completion remain unmeasured.

```sh
BROWSER_EXTRUDE_FROZEN=1 node apps/cad-studio/test/browser-extrude-proposal.mjs "$OUT/desktop-cylinder" --cylinder
BROWSER_EXTRUDE_FROZEN=1 node apps/cad-studio/test/browser-extrude-proposal.mjs "$OUT/desktop-rectangle"
BROWSER_EXTRUDE_FROZEN=1 node apps/cad-studio/test/browser-extrude-proposal.mjs "$OUT/desktop-box" --box
pnpm --dir packages/barocss-cad-model test browser-extrude-proposal proposals revision-pinned-edit tool-contract-mcp
pnpm --dir apps/cad-studio test tool-contract-mcp proposal-review-availability proposal-history-focus
pnpm --dir apps/cad-studio exec vite build --outDir "$OUT/studio-dist"
```
