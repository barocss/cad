# D1690 — Show changed drawing callouts in Studio proposal preview

Studio and Agent review, rows 09, 11, 16 and 20. Issue [#322](https://github.com/barocss/cad/issues/322). Parent `3bdf08782b7d6504eeee4c7db5e264f3605455ed`. This is the reviewer-facing counterpart of [D1689](../drawing-proposal-callout-review-2026-11-22/README.md).

## Behavior

The existing proposal card shows changed printed diameter and radius marks with the sheet, view and dimension ID. Each change has a Before and After value. Unchanged marks are omitted. An addition or removal has an empty side. Duplicate callout references produce an explicit unavailable result.

The engine worker compares the authored working snapshot and the exact displayed candidate, including the selected subset of proposed features. It uses the same literal sheet marks as the Agent read. The open proposal and engine session own the reply. Hide, stale proposals and engine invalidation retire their comparison. Engine Retry retires the model preview as well. An explicit Preview after Retry computes both again. Rejecting a different proposal keeps the current comparison on its original authored snapshots.

## Verification

- **FAIL, parent product gap.** The captured D1689 Studio preview shows the volume delta and no drawing callout comparison.
- **PASS, desktop Studio WebGPU.** The two open proposals show Sheet 2 Top d4 as 4→2 mm and 4→3 mm respectively. Switching cards replaces the comparison. Hide removes it and Before/After model toggling keeps the same comparison. Rejecting the other proposal keeps P1's preview. P1's comparison matches the Agent read, and its after text matches actual SVG after explicit approval, native Save, and fresh Open. The untouched P2 remains stale and supplies no comparison after Open. The fixture files and accepted model remain read-only until explicit edits. 17 desktop captures and five independent SVG checks passed. Reopened native SHA-256 is `76e959a02b2d8501a7ac9b87f3f02cb3f92d81f87263d1285a04009116753a1b`.
- **PASS, controlled reply delivery and recovery.** A real P2 worker reply delivered after the P1 reply cannot replace P1's text. A controlled failure with an actual comparison reply pending retires the complete preview. After Retry, explicit Preview restores the +75.4 mm³ model delta and the 4→2 mm drawing comparison together.
- **PASS, focused checks.** Scoped lint, model and Studio types, 39 model tests, 20 Studio tests and the B06 scripted reference at 5/5. The focused Studio tests cover radius addition, diameter removal and ambiguous IDs. Independent review found issues in preview ownership and identity. The fixes were rechecked. The grouped MCP contract stays at 13 tools.
- **NOT_RUN.** PDF, live provider, mobile, partial-preview browser matrix, and full local suites. B06 remains 6/7 qualified groups and the first mechanical CAD baseline remains 8/10 accepted. Whole CAD and live provider success remain unmeasured.

## Reproduction

Use Node 22.19.0, the installed desktop Chrome and Playwright, the workspace gate and an external evidence directory.

```sh
pnpm --dir packages/barocss-cad-model type-check
pnpm --dir apps/cad-studio type-check
TEST_CONCURRENCY=1 pnpm --dir packages/barocss-cad-model test drawing-stack-tool drawing-radius-read drawing-diameter-read toolset tool-contract
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test tool-contract-mcp proposal-review-availability proposal-history-focus proposal-drawing-callouts
node apps/cad-studio/scripts/ai-eval/ai-eval.mjs validate --briefs b06-counterbore-drawing-revision
D1690_SOURCE_FROZEN=1 node apps/cad-studio/test/counterbore-drawing-agent-revision-browser.mjs "$OUT/studio"
git diff --check
```
