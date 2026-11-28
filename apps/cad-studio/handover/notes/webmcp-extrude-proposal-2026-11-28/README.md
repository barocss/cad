# D2172 — Browser Extrude proposal with Studio approval

P1 [row 04](../../roadmap-rows/04.md) and [row 16](../../roadmap-rows/16.md) · [#204](https://github.com/barocss/cad/issues/204) · Base `7942339c7d7b2047dc04db460abf28622bb7cc27`.

Sharing the current part exposes its read tools. A separate opt-in registers `cad_part_propose_extrude` for one current body made by a positive literal Extrude of a plain rectangle. The tool takes an exact body key, revision and finite positive distance in millimetres. The native Worker evaluates the existing revision-pinned `features.edit` operation through the proposal contract. A successful call records one open proposal with browser authorship and retires the edit grant. The author and approval decision persist with the project. Agent acceptance is refused at every autonomy level. Studio displays the candidate using its ordinary proposal controls.

The grant binds to the current document object, evaluated body list and Open scope. The callback checks ownership before evaluation and before staging. A second in-flight request is refused, and a revoked or replaced part cannot receive a late result even when its geometry revision and body key repeat.

## Verification

- **PASS.** Chrome 158.0.8127.89 registered and invoked the actual WebMCP tools. The original 80 × 50 × 10 mm box measured 40,000 mm³. The 12 mm preview displayed +8,000 mm³ and rejection kept the accepted shape at 10 mm. Accepting a separate 15 mm proposal gave 60,000 mm³. Undo and Redo restored their exact documents. Project Save, Close, browser reload and fresh Open retained both decisions and the 15 mm solid.
- **PASS.** The original read grant alone exposed no edit, revocation retired the old handle, an unsupported cylinder offered no proposal, and invalid values, extra arguments, wrong body, stale revision and a redundant distance were refused. Concurrent calls returned one proposal and one `proposal_pending`. A real successful Agent Worker reply held during Open of an identical body and revision returned `stale_part` after delivery. The accepted document stayed exact.
- **PASS.** Both existing summary and plane measurement tools still matched local stdio MCP in flagged Chrome. Ordinary desktop Studio also passed with the API unavailable. Across the three browser profiles, no page or console errors, downloads or source changes were observed.
- **PASS.** 22 Model tests, 18 Studio tests, both TypeScript checks, scoped ESLint and the production Vite build.
- **FAIL, first driver only.** The driver waited for an Open button on the already active saved project row. The save had succeeded and the row showed its filename. The final driver waits for the active row text before Close and the Open button after reload.
- **NOT_RUN.** A live natural-language browser agent, additional editing actions, provider qualification, browser restart during an active Worker request, full local suites and mobile. #204 remains open for the rest of its adapter acceptance. The mechanical baseline remains 8/10. Overall CAD and natural-language completion remain unmeasured.

```sh
pnpm --dir packages/barocss-cad-model test browser-extrude-proposal proposals revision-pinned-edit tool-contract-mcp
BROWSER_EXTRUDE_FROZEN=1 node apps/cad-studio/test/browser-extrude-proposal.mjs "$OUT/browser"
BROWSER_PART_SUMMARY_FROZEN=1 node apps/cad-studio/test/browser-part-summary.mjs "$OUT/read-regression"
BROWSER_PART_SUMMARY_FROZEN=1 node apps/cad-studio/test/browser-part-summary.mjs "$OUT/no-browser-api" --unsupported
pnpm --dir apps/cad-studio test tool-contract-mcp proposal-review-availability proposal-history-focus
pnpm --dir apps/cad-studio exec vite build --outDir "$OUT/studio-dist"
```
