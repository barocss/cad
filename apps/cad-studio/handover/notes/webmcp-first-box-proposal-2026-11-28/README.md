# D2177 — Browser proposal for the first Box

P1 [row 04](../../roadmap-rows/04.md) and [row 16](../../roadmap-rows/16.md) · [#204](https://github.com/barocss/cad/issues/204) · Base `7026b931b0cf63428588af6afff217c55d4db8cb`.

After the user shares the current empty part, a distinct opt-in grants one call to `cad_part_propose_box`. The call takes three numeric dimensions in mm and the current document revision. It uses the normal Box command at the origin. Before approval, Studio records the proposal and its history event. The accepted model stays empty. The same grant cannot stage another proposal. Reject leaves the model empty. Accept writes the two standard Box nodes and one body through Studio's existing approval flow.

After acceptance, a new read grant and a separate Extrude grant can propose changing the height. The feature edit keeps the Box command when its original two nodes still replay exactly. Box height keeps the standard 1 mm minimum. The previous literal rectangular Extrude contract retains its positive distance range. Browser proposals require a person to approve them in Studio.

## Verification

- **PASS, actual desktop Studio.** Chrome 158.0.8127.89 registered and invoked the browser tools. The empty revision `1e2e3c74c0c7ad7e` exposed only reads until a separate Box grant. Extra fields, wrong argument types, dimensions outside the supported minimum and a stale revision were refused. Concurrent calls returned one proposal and one `proposal_pending`. The retired handle could not be used again.
- **PASS, actual desktop Studio.** The first preview showed +40,000 mm³ while the accepted model had zero bodies. Reject kept zero bodies. A second explicit grant and Studio approval created one native solid with bounds [0, 0, 0] to [80, 50, 10] mm, 40,000 mm³, six faces and twelve edges. Undo and Redo restored the exact proposal state and accepted solid. Browser-project Save, Close, reload and fresh Open retained the exact document.
- **PASS, actual desktop Studio.** After Open, a fresh grant offered only the supported Extrude action. It rejected 0.5 mm and staged 15 mm. Studio approval gave [0, 0, 0] to [80, 50, 15] mm and 60,000 mm³ with the same body, Box command and node IDs. Undo and Redo restored the two exact revisions. The older literal Extrude, its late successful Worker result after same-revision Open, the two read tools against stdio MCP and Studio without WebMCP also passed. No page errors, console errors, downloads or source changes were observed in the four desktop runs.
- **PASS.** 23 focused Model tests, 18 Studio tests, both TypeScript checks, scoped ESLint and the production Vite build.
- **FAIL, initial verification.** The first desktop driver comparison omitted the expected proposal history event. The next one omitted the standard Box command record. A first attempt to retain that record by passing it in a raw replacement was refused by the existing tool schema. The final implementation uses the existing scalar edit and updates the replayable Box record internally. The final tests verify both records. The Studio type check required an explicit `ChatState` annotation to retain the literal approval requirement.
- **NOT_RUN.** A live natural-language client, full local suites, mobile and the remaining #204 autonomy and lifecycle acceptance. The first mechanical CAD baseline remains 8/10. Overall CAD and natural-language completion remain unmeasured.

```sh
pnpm --dir packages/barocss-cad-model test browser-extrude-proposal proposals revision-pinned-edit tool-contract-mcp
BROWSER_EXTRUDE_FROZEN=1 node apps/cad-studio/test/browser-extrude-proposal.mjs "$OUT/box" --box
BROWSER_EXTRUDE_FROZEN=1 node apps/cad-studio/test/browser-extrude-proposal.mjs "$OUT/extrude"
BROWSER_PART_SUMMARY_FROZEN=1 node apps/cad-studio/test/browser-part-summary.mjs "$OUT/read"
BROWSER_PART_SUMMARY_FROZEN=1 node apps/cad-studio/test/browser-part-summary.mjs "$OUT/no-api" --unsupported
pnpm --dir apps/cad-studio test tool-contract-mcp proposal-review-availability proposal-history-focus
pnpm --dir apps/cad-studio exec vite build --outDir "$OUT/studio-dist"
```
