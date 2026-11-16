# Refuse XML-invalid SVG text (#623)

Base: `72dd3bcaeb21b10d4297fa5b5d26210a499657a2`. Narrow P2 drawing/exchange quality work; no geometry, PDF, schema or importer redesign.

## Reproduced before the fix

The existing `sheetSvg` returned 447 bytes for a minimal sheet containing literal U+0001 in a note. Python stdlib ElementTree rejected that output as not well-formed at line 6, column 96. This is an executed writer/export-byte reproduction, not a physical downloaded-file claim.

## Change

A private export-only check applies the [XML 1.0 Fifth Edition Char production](https://www.w3.org/TR/xml/#charsets) to the complete SVG string before UTF-8 encoding. Forbidden C0 controls, lone surrogates and U+FFFE/U+FFFF throw the existing VALUE refusal with the offending codepoint. Valid tab/LF/CR, Korean, engineering symbols and supplementary pairs are retained. No text is silently replaced or written back to the model.

Group identity, view, role and text-anchor attributes use ordinary delimiter escaping. The inline `sheetGroupsSvg`/`marksSvg` functions intentionally do not throw for invalid XML characters: the HTML-rendered Drawing must remain available so the user can repair its text. `sheetsSvg` eagerly serializes the full set before returning, so a bad later sheet cannot return a partial array.

Studio serializes before export-loss confirmation or file delivery. Failure clears any pending export confirmation and reports **SVG not written**, with no download. The actual Studio SVG command still exports only the current sheet; this change does not invent a multi-file Studio export.

## Verification

- New focused writer tests: **5/5 PASS**, including every forbidden C0 character, surrogate boundaries, text/title/attribute checks, input immutability, multi-sheet refusal and independent Python XML parsing of valid Unicode/escaping.
- Combined writer/ordinary-text/sheets/units-golden: **43 PASS, 2 existing FAIL**. Repeating the two affected files with the original writer substituted in memory gives the same two failures and all 70 expected/actual golden hashes in the same order. The failures are the absent-sheets PDF byte check and the units golden hash collection; they are not repaired or claimed passing here. Existing ordinary-text plain/ISO SVG byte golden checks pass.
- Model source plus the new test focused typecheck and affected Model lint: PASS. Full Model test typecheck retains unrelated `hole-types.test.ts:97` TS7022. The default Model runner cannot resolve this isolated checkout's native workspace dependency; explicit local source aliases were used instead, without editing the protected checkout.
- Studio typecheck: PASS. DrawingWorkspace lint reports the same five pre-existing unused bindings when run on both HEAD and changed content (`DrawingFix`, `_sig`, `_was`, `_leader`, `_sheet`); no whole-file clean lint claim.
- Actual Chrome 1440×1000: **PASS**. The real Drawing title input accepts U+0001 and U+FFFE; each export is refused, original accepted document retained, no export confirmation or captured file appears. Repair through the same input to Korean/Ø/±/markup delimiters/emoji allows serialization. Independent browser DOMParser accepts it and verifies exact title, A3 420×297 mm dimensions, viewBox and geometric marks. First Undo/Redo restores invalid/repaired documents. No runtime/console errors, watched-file changes or downloads. Refusal screenshot visually reviewed.
- Browser bytes are intercepted at the existing Blob/anchor delivery boundary; this is not a downloaded file. Physical download/open acceptance remains **NOT_RUN** pending its separate permission boundary. #623 remains open for that final gate.

## Harness corrections and source custody

The first UI attempt incorrectly used JSON string-order equality across the importer, which legitimately reorders drawing settings. It was corrected to structural equality. A launch from the wrong directory never started a browser.

The next UI attempt exposed that shared installed workspace links loaded the protected checkout's original writer. The test now explicitly aliases the changed SVG module and native package exports to the intended sources. An incomplete first alias configuration failed dependency resolution and was stopped; no product result is inferred from it. The final frozen run uses the complete source mapping and passes. The helper's optional `viteAliases` changes only tests that explicitly supply it.

Run after the normal heavy gate with `PW_DIR` and `CHROME`:

```sh
SVG_TEXT_FROZEN=1 node test/svg-invalid-text-browser.mjs <output>
```

Existing WIP, native-folder, ASME/PDF and all other HOLDs remain untouched. No download, package install, deployment or release was performed.

Production Vite build with the same explicit changed-writer/native source aliases: **PASS, 4.41 s**, with the existing chunk-size warning. Build artifacts were written outside the checkout. This is a build proof, not hosted CI or deployment acceptance.
