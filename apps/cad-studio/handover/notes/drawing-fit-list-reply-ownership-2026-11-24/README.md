# D1875 — Keep delayed fit-list replies bound to their drawing

P2 [row 11](../../roadmap-rows/11.md), [row 12](../../roadmap-rows/12.md), [#269](https://github.com/barocss/cad/issues/269). Base `70fa63a3e7b2290a80943218c3778d0e8f61291d`. SMALL evidence qualification.

- **PASS, actual Chrome desktop.** Hold a completed Drawing worker reply for the signed, paired `synthetic-A` document. Open its replacement with the same feature, dimension, sheet and fit-table IDs, but with the `synthetic-B` limits. Wait for the replacement's actual sheet before delivering the old event. Across six samples the current sheet, document, export provenance, selection and unsaved indicator stay with the replacement. The older rows do not appear.
- **PASS, New part.** Hold a second actual reply for the old paired fit source. Create a blank part and deliver that reply. Six samples retain the blank document, empty table state and its selection and unsaved indicator. Fresh Open restores the `synthetic-B` sheet and its two estimated-pair rows.
- **PASS, affected checks.** Three delayed-flow SVG/DXF reads and the prior paired-control flow agree with the independent decimal oracle. 18 Model and eight Studio tests, driver syntax and Git diff check. Two final desktop runs record twelve states with no page errors or source changes. The harness delays only the selected events and lets newer events reach the app normally.
- **FAIL.** None in the selected desktop and affected checks.
- **NOT_RUN.** The remaining unsupported-scope matrix, other Drawing worker operations, PDF, other backends, mobile and full local suites. #269 remains open. First mechanical CAD remains 8/10. Whole-product completion remains unmeasured.

```sh
D1875_SOURCE_FROZEN=1 node --import "$PLAYWRIGHT_LOCAL_ONLY" apps/cad-studio/test/drawing-fit-list-browser.mjs "$OUT/late-final" --late
D1874_SOURCE_FROZEN=1 node --import "$PLAYWRIGHT_LOCAL_ONLY" apps/cad-studio/test/drawing-fit-list-browser.mjs "$OUT/pair-control" --pair
pnpm --dir packages/barocss-cad-model test drawing-fit-list fit-drawing p2-drawing-table-contract
pnpm --dir apps/cad-studio test fit-list-settings document-ownership drawing-section-revision
node --check apps/cad-studio/test/drawing-fit-list-browser.mjs
node --check apps/cad-studio/test/hold-fit-drawing-reply.mjs
git diff --check
```
