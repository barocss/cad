# D1835 — Preview and explicitly reattach a lost drawing diameter

P2, rows [11](../../roadmap-rows/11.md) and [13](../../roadmap-rows/13.md). [#738](https://github.com/barocss/cad/issues/738), related [#202](https://github.com/barocss/cad/issues/202). Base `fd3384ee30b373e39bc680f4b857c181a07ac6b4`. Extend [D1527](../drawing-bore-regeneration-2026-11-21/README.md) using the existing References panel and Drawing workflow.

- **PASS, desktop Studio.** Author the middle Top bore callout and change its diameter from 8 mm to 10 mm. Suppress that bore. Both remaining bores are 10 mm in diameter at X22 and X58, 18 mm from the original center. Preview each available Top rim by its actual SVG overlay. Each preview leaves the document, model body and Undo/Redo controls unchanged. The bottom rim candidates have no visible segments in Top and show that reason. The authored callout remains lost until the explicit choice.
- **PASS, exact reattachment.** Use the previewed X58 rim, `n1.top|n3.side0#1`. Its signature changes as expected. The replacement retains dimension d1, the same label placement, the authored 0.1254 mm symmetric tolerance and both existing holes. Undo restores the unresolved callout and candidates. Redo and fresh Open retain the selected rim. The native geometry and current drawing source mark stay the same through reattachment.
- **PASS, independent SVG read.** Parse 11 Studio exports as XML. Check the A4 Top outline, hole centers and radii, callout ID, printed tolerance, and leader contact with the expected rim to 0.00015 mm. The right-hand leader begins at sheet coordinates `[153.4818,69.4254]` mm in the reattached, Redo and fresh Open files. Unresolved exports omit the dimension group. The source mark is `1c09478be4d39f29` after suppression and reattachment.
- **PASS, affected checks.** 50 Model tests, 23 Studio tests, browser syntax, scoped ESLint and Git diff check. 18 final desktop checkpoints, with 661 frozen source files and zero source, console or page errors.
- **FAIL, recovered harness checks.** Early attempts assumed empty history after Open, omitted a native edge alias prefix and read a locator from the closed browser page. Use the actual pre-preview history controls, verify the exact candidate name and query each current page. No product change was needed for this verified path.
- **NOT_RUN.** Separate fit-impact review after a nominal change, manufacturing approval, general ambiguous features, PDF/DXF from this fixture, local full suites and mobile. #738 remains open for fit-impact review. First mechanical CAD remains 8/10 accepted. Whole-product completion is unmeasured.

```sh
DRAWING_BORE_FROZEN=1 node apps/cad-studio/test/drawing-bore-regeneration-browser.mjs "$OUT/studio" --reattach
TEST_CONCURRENCY=1 node packages/barocss-cad-model/scripts/test.mjs drawing-issues references
TEST_CONCURRENCY=1 pnpm --dir apps/cad-studio test drawing-dimension-changes reference-focus drawing-commit-roundtrip
pnpm exec eslint apps/cad-studio/test/drawing-bore-regeneration-browser.mjs
node --check apps/cad-studio/test/drawing-bore-regeneration-browser.mjs
git diff --check
```
