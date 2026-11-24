# D1870 — Replace three held Constant Fillet edges together in History

P1/P4 [row 15](../../roadmap-rows/15.md), [row 16](../../roadmap-rows/16.md), [#20](https://github.com/barocss/cad/issues/20). Base `b75a90f5b6b616fc05b561b76b2151aeac96ac9b`. Extends the D1834 group action to a terminal Constant Fillet whose three straight-edged slots all have independent held problems. The current authored radius, including a parameter binding, follows the existing evaluation. Partial single-slot repair remains limited to the separately checked two-edge case.

- **FAIL, original desktop Studio.** After an upstream outline change the original references are all held. The held part passes through its 525 mm³ stock. History offers neither the grouped nor the single-edge action.
- **PASS, actual desktop Studio.** The three authored slots accept distinct explicit viewport picks. A duplicate is refused and an empty slot disables Apply. Picks can be assigned out of order. Cancel retains the original three held problems. One Apply stores the replacement names and signatures in the original slot order. First Undo restores all three held states and Redo restores the exact accepted result. Native Save and fresh Open retain the numeric value and `Radius` parameter binding.
- **PASS, independent shape.** The old 590 mm² profile has three convex corners rounded at R2. Volume is `1734 + 9π = 1762.274333882` mm³. The new 175 mm² profile has two convex and one concave blend at R2. Volume is `513 + 3π = 522.424777961` mm³. The 11-face, 27-edge and 18-vertex strict native result has cylinders about (18,2), (7,7) and (2,18) mm with outward, inward and outward senses. A wrong third edge gives the same volume and topology and moves its cylinder to (3,18). The oracle rejects it. Sol High reviewed both physical cases independently.
- **PASS, affected checks.** 24 focused tests, Model and Studio types, scoped lint, production build and driver syntax. Three desktop runs record 27 states across three Fillets, the existing three Chamfers and the two-edge native refusal control.
- **FAIL, first fixed browser attempt.** The starter part never became current before the 60-second wait expired. There were no page or console errors. The same flow passed in a fresh server and desktop context. The startup cause was not determined.
- **NOT_RUN.** Four or more held references, curved or varying three-edge finishes, downstream recipes, other backends, mobile and full local suites. #20 stays open for broader reference recovery. First mechanical CAD stays 8/10.

```sh
D1870_SOURCE_FROZEN=1 node apps/cad-studio/test/three-held-chamfer-browser.mjs "$OUT/baseline" --fillet --baseline
D1870_SOURCE_FROZEN=1 node apps/cad-studio/test/three-held-chamfer-browser.mjs "$OUT/fillet" --fillet
D1834_SOURCE_FROZEN=1 node apps/cad-studio/test/three-held-chamfer-browser.mjs "$OUT/chamfer"
TWO_EDGE_CONCAVE_REFERENCE_SOURCE_FROZEN=1 node apps/cad-studio/test/two-edge-concave-reference-browser.mjs "$OUT/pair" --dual-native-refusal
pnpm --dir apps/cad-studio test held-finish-replacement candidate-references reference-focus
pnpm --dir packages/barocss-cad-model type-check
pnpm --dir apps/cad-studio build
```
