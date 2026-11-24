# D1915 — Qualify section hatch text clearance through edits

P2 [row 11](../../roadmap-rows/11.md), [#247](https://github.com/barocss/cad/issues/247). Base `d703427ce00ab1a8cd63d4facf6a9dff1b857e63`. Complete the remaining acceptance for the Screen/SVG profile delivered at `699af2fa5a16cdbf87cb70aa7bbd2c1b63d02685`. Production code and native storage stay unchanged.

- **PASS, desktop Drawing and original SVG.** On one native solid with a full section at 1:2, the actual dual label has one text mark. Switching off dual units displays three marks for the same deviation. The independent SVG parser compares each hatch segment with the live sheet and tests the text bounds with a 0.6 mm visible margin plus half the stroke width. It finds no intrusion. A source edit changes the dimension from 60 to 64 mm. The original edge IDs and authored endpoints remain. The application supplies their line signatures on the first source edit. Native Save and fresh Open retain the file. The upper deviation edits from 0.4 to 0.6 mm with the lower deviation fixed at −0.2 mm. The second sheet has no copy of the first sheet's section or dimension.
- **PASS, result ownership.** Hold one successful, unmodified Drawing Worker reply for an earlier document with the same section and dimension IDs. Open the new file with an unresolved witness before releasing that reply. The document, selection, dirty state and sheet text match across all six observations. Both actual SVGs have the same 15 hatch segments. Cancel removal to preserve the authored tolerance, then confirm removal. The hatch stays the same. Undo and Redo restore or remove the original dimension atomically.
- **PASS, 1:1 section DXF.** The original downloads use millimetres and one closed HATCH material path with four distinct corners. The 60 × 40 mm path is identical before and after applying the dual deviation and 1:2 paper scale. The source edit makes it 64 × 40 mm. Deleting the lost label preserves that larger path exactly. The exported material has no text-clearance cutout.
- **PASS, actual controls.** The original label placement workflow covers drag, Undo, Redo, native Save and fresh Open. The existing section Worker control covers a held valid cut, Undo to an invalid cut, then Redo to the valid cut.
- **PASS, focused checks.** 33 Model and 13 Studio tests. The Model checks cover union subtraction across a material hole and byte-equivalence for PDF and sheet DXF with section text metadata on and off. Driver syntax and Git diff checks pass.
- **FAIL, earlier driver revisions.** Corrected five assertions or omitted interactions: a DXF path includes its closing point, an inline label can cross the material boundary, the dual label uses one text mark, first source regeneration adds the two witness signatures, and the application requires confirmation before deleting an authored tolerance. The corrected desktop lifecycle passed, including the late reply.
- **NOT_RUN.** Live PDF and sheet DXF exports, 3D annotations, glyph certification, pointer authoring of the seeded witnesses, excluded section and annotation families, mobile and paid providers. The separate PDF golden HOLD stays in force. The first mechanical CAD baseline remains 8/10. Whole-product readiness remains unmeasured.

```sh
SECTION_HATCH_TEXT_CLEARANCE_FROZEN=1 node apps/cad-studio/test/section-hatch-text-clearance-actual-browser.mjs "$OUT/studio" --lifecycle
SECTION_HATCH_TEXT_CLEARANCE_FROZEN=1 node apps/cad-studio/test/section-hatch-text-clearance-actual-browser.mjs "$OUT/studio-placement"
SECTION_CURRENT_FROZEN=1 node apps/cad-studio/test/drawing-section-result-currentness-browser.mjs "$OUT/studio-currentness"
pnpm --dir packages/barocss-cad-model test section-hatch-text-clearance drawing-section-hatch drawing-round-section-hatch section-dimensions
pnpm --dir apps/cad-studio test drawing-delete-policy
pnpm --dir apps/cad-studio test section-hatch drawing-hatch-scope-commit
node --check apps/cad-studio/test/section-hatch-text-clearance-actual-browser.mjs
git diff --check
```
