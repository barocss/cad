# Library placement → Assembly cut (#39)

The geometry command context retains the evaluated document, whose `instances` can lag behind metadata-only Library placement. Assembly cut availability previously read that old array even though its HUD correctly read the current document. Studio now supplies `placedPartCount` from the current document for this assembly-only availability check. Geometry context identity, accepted bodies, and model command inputs are unchanged. Non-Studio callers retain the document-array fallback; explicit zero overrides stale nonempty instances.

## Verification

- Focused availability unit: 1/1 PASS, covering empty, newly placed, fallback, and explicit removal.
- New `library-assembly-cut-browser.mjs`: Chrome WebGPU at 1024×900 and 1440×900 PASS. New empty part → actual built-in Library Place angle-bracket → select occurrence → Assembly cut without reopening or adding a base body. Preview, radius 0.5 cut, radius 0.75 history edit, two Undo operations, Redo, native Save and fresh Open passed. Base nodes stayed empty; original occurrence definitions stayed unchanged. Reopened screenshots inspected and show the new hole.
- Existing `assembly-cut-browser.mjs`: PASS including two placed plates, target editing, contextual controls at both widths, independent arithmetic volume oracle, Undo/Redo, Save/Open, and cut deletion.
- Production build (TypeScript + Vite), focused commands/test lint, and diff whitespace: PASS. Whole App lint is not claimed clean; existing unrelated `_k` finding remains.

No new kernel algorithm, assembly transform, part-definition mutation, schema migration, or external provider was introduced. WebGL2, live team library, and the full browser aggregate suite were not run. #126 WIP remains excluded.
