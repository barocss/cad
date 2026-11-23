# D1836 — Identify fit changes in a drawing proposal

P2, rows [11](../../roadmap-rows/11.md) and [13](../../roadmap-rows/13.md), [#738](https://github.com/barocss/cad/issues/738). Base `2fad7b7df320299814912fd416b7ad77eb42b300`. Use the existing pending proposal comparison and SVG export.

- **FAIL, base.** Studio lists the working and candidate H7 callouts, but a change in the fit deviations has no separate review indication.
- **PASS, scoped fit comparison.** The review reads the exact deviations from the same scoped fit table and face as the printed callout. A change in the limits, class, availability or estimate status gets a review indication. A focused check verifies that a 0.0000001 mm change still appears in the comparison and that moving the label leaves the fit unchanged. The ordinary counterbore comparison has its existing before/after behavior.
- **PASS, actual local MCP and desktop Studio.** The 60 × 40 × 8 mm test plate changes from Ø12 to Ø19 across two synthetic H7 intervals. Raw upper deviations are +0.018 and +0.030 mm. The proposal keeps the original source live until explicit user approval and shows the fit review indication. The local L1 agent cannot accept. Approval retains the authored fit table, records the user decision, and leaves the previous exported SVG and original geometry in the staged file intact. Native Save and fresh Open retain the approved part and drawing.
- **PASS, independent readback.** Four actual XML files confirm the Top rim and callout, including absence of both on the missing-source control. The current printed lower deviation is +0.001 mm in both fitted states under the existing inward formatter. The approved SVG prints `Ø19 THRU H7 (+0.03/+0.001)` before and after fresh Open, with source `5ef3807baed65db2`. The volume agrees with stock minus the cylindrical bore within 1e-7 mm³.
- **PASS, independent loss case.** In a separate unclassed copy, suppress its sole bore. Drawing reports the lost Top diameter, with no rim candidate. The SVG omits the circle and annotation, while the authored reference remains. Undo restores the original callout. [D1835](../drawing-bore-reference-reattachment-2026-11-24/README.md) separately verifies the two equivalent candidates and explicit reattachment.
- **PASS, affected checks.** Model 37, Studio 5, both type checks, Studio production build, scoped lint, syntax and diff check. Fit and counterbore desktop runs give 26 checkpoints, 9 SVG reads and zero console, page or frozen source errors.
- **FAIL, recovered checks.** The first oracle expected a printed zero lower bound. The final oracle checks the existing inward rounding. The first exact comparison reused formatted deviations and missed a sub-display change. The final comparison uses the shared raw fit lookup. A narrowed TypeScript inference and two diagnostic locator assumptions were also corrected before qualification.
- **NOT_RUN.** PDF/DXF from this fixture, manufacturing certification, full local suites, mobile and paid providers. The synthetic fit table does not qualify standard data. The first mechanical CAD baseline remains 8/10 accepted. Whole-product completion is unmeasured.

```sh
D1836_SOURCE_FROZEN=1 node apps/cad-studio/test/drawing-fit-proposal-browser.mjs "$OUT/base" --baseline
D1836_SOURCE_FROZEN=1 node apps/cad-studio/test/drawing-fit-proposal-browser.mjs "$OUT/studio"
D1690_SOURCE_FROZEN=1 node apps/cad-studio/test/counterbore-drawing-agent-revision-browser.mjs "$OUT/control"
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test proposal-drawing-callouts tool-contract-mcp
TEST_CONCURRENCY=1 pnpm --dir packages/barocss-cad-model test fit-drawing drawing-fit-list drawing-stack-tool drawing-radius-read drawing-diameter-read
pnpm --dir packages/barocss-cad-model type-check
pnpm --dir apps/cad-studio build
git diff --check
```
