# D2216 — Extract Studio evaluated-source ownership and Interference launch

P4 [row 16](../../roadmap-rows/16.md) and [row 20](../../roadmap-rows/20.md) · Base `1c90f31e5`.

The Model evaluation module owns the captured document, input, work generation, worker session and History marker. Its callback compares the same live refs as the former App code. The Interference hook owns the ready check, selection scope and launch. App uses the existing command entry and result panel. App is 2,267 lines, down from 2,281.

- **PASS, actual desktop ownership.** Chrome's native body calculations returned controlled delayed replies. Closing the check, opening another document with reused keys, superseding the check, editing a parameter, changing History and restarting the Worker all retired the former result. The current result owned the original pair. Undo/Redo retained the expected source, and disposing the browser host left the new host clean.
- **PASS, actual desktop values.** Exact face contact had no overlap. Interference showed 0.01, 0.3 and 999.7 mm³ for the same native fixtures. Raw numeric order, keyboard pair selection and selected-pair recheck passed. The two runs froze 705 and 704 sources and recorded zero page errors, console errors and downloads.
- **PASS, checks.** 35 focused Studio tests, scoped lint, Studio type-check and whitespace.
- **FAIL.** Zero failures in this delivery.
- **NOT_RUN.** Full local suites, mobile and a separate browser workflow for every caller of the shared source guard. First mechanical CAD remains 8/10. Overall CAD and natural-language completion remain unmeasured.

```sh
pnpm --dir apps/cad-studio test interference-order interference-result work-ownership proposal-review-availability tool-contract-mcp
D745_SOURCE_FROZEN=1 node apps/cad-studio/test/interference-ownership-browser.mjs "$OUT/desktop-ownership"
git diff --check
```
