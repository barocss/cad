# D1333 — Hidden-root export scope (#567)

## Implementation

STL's existing target list now states root/hidden body counts and marks hidden rows; success repeats the captured scope. STEP reports actual included root/hidden-root and placed output counts with contributing visible top-level occurrences. Counts follow existing exporter filters and stored look ownership; empty BReps contribute no body count. Native pieces remain distinct from Model outputs. Prepared scope belongs to the same document/name/generation as the downloadable bytes and clears on edits. Existing STEP text, omission behavior and public Part.stepReport contract are unchanged. No Print/3MF visibility rules changed.

## Independent Mac verification

- Model29/29 PASS: scope4, public report19, fixed-byte/loss6. Includes hidden roots, hidden/infill occurrences, nested outputs and empty intersections.
- Studio preparation/metadata16/16 PASS, including current-scope copy and visibility invalidation. Model/Studio type-check, changed Model/Studio focused lint, production build, independent source/ownership review and diff check PASS.
- Source-frozen real Chrome at1024×900 and1440×900: separated10×10 boxes of height6/20; zero/one/two hidden roots. Before download STL and STEP show2 included bodies with0/1/2 hidden. Automatic and Standard16 STL each download2 files of12 triangles; STEP contains2 MANIFOLD_SOLID_BREP records. Print remains100/30/no layers; downloaded3MF XML has2/1 objects and all-hidden refuses download. Exports preserve document; two Undo operations restore baseline visibility.
- Actual1024px STL one-hidden and STEP all-hidden screenshots reviewed; counts readable within existing dialogs. Driver test/hidden-export-scope-browser.mjs receipt SHA256 `5afac4e44f40d2967c6c2df163ea91d9d8f39fa60b0c2e4ce57232dfd5333c06`.

## Limits / next

Placed scope is Model-tested, not browser-tested. External STEP reader/slicer, mobile/AT and full suite NOT_RUN. No new watertight/manufacturing claim. Existing generated-doc drift and all HOLDs persist; CI not awaited. Next D1334/#569: purchased-body Print/canvas/3MF scope guidance.
