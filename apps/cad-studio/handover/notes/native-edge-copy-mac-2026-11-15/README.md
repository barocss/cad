# D1376 — faithful selected native edge copy

Completes #151. Worker reads the unique native edge with both matching face/coedge memberships in the current displayed evaluation prefix. Degree, knots, poles and weights are copied without fitting. A separate shortest-round-trip decimal serializer expands exponents without 1e-9 rounding; the existing direct parser still refuses unsupported input.

The request owns accepted document, displayed evaluation, fresh/nonbusy state, bodies, selection, scope and latest request. Obsolete successes/errors cannot append or notify. Up to16 edges are atomic. The button visibly distinguishes selected edge from whole Sketch outline and explains unavailable/pending states.

Compatibility: existing straight and merged circular display copying remains. Circular fallback is visibly labelled Display approximation and named accordingly; arbitrary unowned polyline fallback is not silent. Mixed batches conservatively carry the approximation label. This does not resolve all #152 provenance/Sweep display requirements.

## Evidence

- Model3/3: four representative ellipse arcs, native line/semicircle/G2degree4 coefficients/endpoints/curvature, missing/wrong selection and failed source rejection. Not an exhaustive192-arc benchmark.
- Studio4/4: round-trip source/import coefficients and retained prior object, all-or-nothing/obsolete results, legacy box-hole rim/line, evaluated ownership predicate.
- Model/Studio tsc, scoped lint, diff check, final production build PASS. Existing App full lint `_k` remains separate.
- Actual Chrome1024/1440: authored ellipse12x6 Extrude6, existing wholeellipse Direct fixture retained, native n1_e2 and n1_e144 selected, exactly one new object per click. Compiled copied source coefficients match original native curve; endpoint/domain and curvature samples agree. Original nodes and earlier objects preserved; Undo/Redo/downloaded Save/fresh Open PASS.
- Receipt SHA256 `8eaf3aea6a4a237c714ae49fad260b2ee4e699efa1aed02b51e8daab18269c06`. Final1024 screenshot and earlier1440 screenshot visually reviewed. Wholeellipse Direct object was an explicitly generated fixture, not a UI Make curves assertion.

## Failed checks and limits

Five existing hook suites contain12 failures both with HEAD hook and changed hook (59cases:47PASS/12FAIL, identical named failures). These old Finish/reopen harness failures were isolated with in-memory baseline source substitution, not hidden or fixed here. Combined current run with four new tests is51PASS/12FAIL. Fixture options were updated for required freshness inputs; standalone copy tests pass. New Model readNativeEdgeCurve and NativeEdgeCurveReply exports add to unresolved broad API-inventory drift. No whole-suite/CI, assistive-technology, arbitrary merged-native reconstruction, parser expansion or new fitting claim. Exact-copy UI was rerun after review added freshness/prefix ownership. Existing HOLDs remain. Next: #152 remaining copy/path provenance wording and actual G2 UI acceptance.
