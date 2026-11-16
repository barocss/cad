# Independent memory-output checks after A4 Detail recovery

Input is the actual reopened document and HTML from `/tmp/cad-detail-position-fixed-03/06-reopened.json` and its browser receipt. This is a bounded #34 acceptance supplement to `585da4b61`, not a writer behavior change.

`test/detail-paper-export.mjs` builds the exact local Model/native sources, produces both sheets' SVG/DXF strings in memory, verifies source-document immutability and passes the strings to `detail-paper-export-reader.py`. The reader uses Python stdlib ElementTree and independent DXF group-code parsing, with no product imports. No browser download or PDF action occurs.

PASS evidence `/tmp/cad-detail-paper-export-02/receipt.json`:
- A4 sheet2 size297×210 and DXF mm units/extents.
- Detail box [163,14,223,74] matches the actual reopened browser observation. Crop R6 at scale5 gives paper R30; native Hole R4 gives paper R20, at the authored recovered paper centre.
- SVG and DXF retain the diameter, standalone frame0.07, DETAIL B (5:1), FROM SHEET1 and the parent's SEE SHEET2 cross-reference. The detail is not duplicated on the parent sheet.
- Authored symmetric tolerance0.15 remains unchanged. Known #35 precision boundary is not hidden: raw DXF measurement is8.000000000000002, and actual browser/SVG/DXF text is `Ø8 THRU +0.15/-0.14`. The first reader expected an idealized symmetric text and failed; it now explicitly checks the observed shared text while separately asserting the authored tolerance. No rounding workaround was applied.

Commands (Node22, under the heavy gate):

```
node test/detail-paper-export.mjs /tmp/cad-detail-position-fixed-03/06-reopened.json /tmp/cad-detail-position-fixed-03/receipt.json /tmp/cad-detail-paper-export-02
```

Parser/runner lint has zero errors (one existing-style console warning); diff-check passes. This checks selected exact structures and geometry, not a complete DXF audit, physical export transport, PDF, all detail layouts or standards conformance. #34 and #35 remain open; WIP/HOLD preserved.
