# D1527 — Keep a regenerated drawing diameter attached to its bore

P2, row 11, [#738](https://github.com/barocss/cad/issues/738) and [#202](https://github.com/barocss/cad/issues/202). Base `bfe44128fc99038179b38677917eae9486e9d7e7`. This is a test-only verification of the existing Studio drawing flow.

- **PASS, desktop Studio.** On an 80 × 40 × 8 mm plate, physically pick the middle bore in the Top view and place a diameter callout. Enter a symmetric 0.1254 mm tolerance. Edit the Hole in Model from Ø8 to Ø10. Drawing updates the dimension with its original ID, edge, near point, placement and authored tolerance. Save and fresh Open preserve the semantic document.
- **PASS, unresolved reference.** Suppress the middle bore. The two remaining bores are both Ø10 and each is 18 mm from its centre. The callout keeps its authored data and shows as lost. Undo restores the Ø10 label. Redo, Save and fresh Open retain the unresolved reference. The reopened sheet reports one reference that needs a choice and displays four candidate rim actions. It does not assign the callout to a different bore.
- **PASS, independent SVG read.** Parse all seven actual SVG files as XML, including their bore arcs, current source tag and dimension group. The initial and edited labels read Ø8.000 THRU ±0.125 and Ø10.000 THRU ±0.125. Original and reopened tags agree at each measured state. The two-hole SVG contains both Ø10 bores and omits the lost dimension group. The independent stock-minus-bores volume agrees with the Worker within 1e-7 mm³ at 23941.239078904608, 23715.044407846122 and 24343.36293856408 mm³.
- **PASS, affected checks.** 77 Model tests in the combined run, 31 Studio tests, browser syntax and Git diff. The final desktop run has zero runtime errors, console errors and frozen source changes.
- **FAIL, recorded separately.** One existing `drawing-units-golden` assertion still gives different SVG/DXF hashes with the dimension data hashes unchanged. An initial browser fixture at exactly 0.125 mm also reproduced the lower rounding issue in [#35](https://github.com/barocss/cad/issues/35). The final reference fixture uses 0.1254 mm at 3 decimal places to exercise association independently of that rounding boundary. No tolerance code or golden was edited. The earlier driver attempts compared property order on Open and expected a Boolean instead of the text reason for a lost reference. Both harness assertions were corrected.
- **NOT_RUN.** Product build and types locally for this test-only change, full local suites, explicit reattachment, manufacturing approval, PDF/DXF from this fixture and mobile. #738 and #202 remain open.

Use Node 22.19.0 and installed Chrome and Playwright. Gate heavy work and write evidence outside Git.

```sh
node packages/barocss-cad-model/scripts/test.mjs drawing-issues references drawing-units
pnpm --dir apps/cad-studio test drawing-commit-roundtrip drawing-revision-print drawing-dimension-changes
node --check apps/cad-studio/test/drawing-bore-regeneration-browser.mjs
git diff --check
cd apps/cad-studio
DRAWING_BORE_FROZEN=1 node test/drawing-bore-regeneration-browser.mjs "$EVIDENCE/drawing"
```
