# #273 bounded evaluated-mesh reference circle

Existing issue #273 remains **OPEN**. This is a useful, explicitly narrower profile, not completion of the original-file vertex provenance research. No original issue criteria or HOLD has been removed.

## Supported meaning

Explicit Measure → Reference circle (mesh), one direct unrepaired imported mesh node, three visible qualified unmerged evaluated welded B-rep endpoints from the same current base body. These are **not original file indices**, and the importer does not retain the raw-index/welding-multiplicity map. Missing endpoint authority, ambiguous overlapping endpoints, changed source, instances, generated/preview/section contexts are not promoted to supported inputs. Separate WeakMap authority does not confer native Sketch authority.

The displayed center/radius/diameter and plane normal describe only the selected three points, not hole size, circularity, a fitted analytic object or manufacturing certification. The test uses three corners of a rectangular front face, deliberately not a circular hole. Numeric admission: finite dense triples, coordinate/center/radius ≤1e12 mm, pair distances ≥1e-6 mm, normalized area >1e-8. A diameter may reach 2e12 mm. Rejection limits are not accuracy guarantees. Computation is unrounded; existing quantity formatting ends in two decimal places and preserves tiny nonzero values through exponent text.

## Actual Chrome evidence

Synthetic repository `packages/barocss-cad-model/test/fixtures/block-cm.stl`, public unit choice cm, actual Front/Ortho viewport pointer clicks at evaluated points (0,0,10), (40,0,10), (40,0,0) mm. Read-only projection helper locates clicks; no state injection. Accepted IDs are n0_v4/n0_v5/n0_v3 in this evaluation only.

Actual03 PASS: center (20,0,5), displayed radius 20.62 and diameter 41.23, normal (0,1,0). Independent Python uses the right triangle's hypotenuse midpoint and sqrt(425). Exact displayed strings and 0.00501 display tolerance are checked separately from a product-helper invocation with the actual displayed integer coordinates (1e-10 independent raw-value comparison). The helper invocation is **not** a read of hidden UI calculation state.

Reset, Back to two-target mode, Done and Escape clear transient capture. Camera orientation change preserves values. Reopening the same STL in mm discards partial cm capture. Actual native Save download → fresh browser context Open preserves decoded document and permits remeasurement; measurement is not persisted. Document and displayed feature-history rows are unchanged by measurement. This does not certify internal Undo stack entries or Undo/Redo UI behavior.

Both browser contexts, browser and Vite server closed; source changes, page errors and console errors were empty. Measured and Escape-cleared images were visually inspected. Screenshots and native file contain only the synthetic fixture.

## Earlier attempts and remaining limits

- Actual01 FAIL before three-point entry: Space invoked from a focused Frame button did not open the command palette. Fixture changed to the existing public Inspect → Measure rail helper. Three-point path was NOT_RUN in this attempt.
- Actual02 reached and visibly rendered the correct three points, but the oracle incorrectly assumed three decimal display places. Corrected against the existing `fmt` two-decimal contract, preserving independent raw arithmetic; no product math change.
- Actual03 then passed the complete bounded flow above.
- Unit/related regressions: Model 24/24; Studio 64/64. First Studio run had two fixture ENOENT failures caused by import.meta.url after bundling, corrected to the runner cwd. Model callback type annotations and UI formatter argument were corrected before passing both package type checks. Final Studio related regressions 64/64, Studio type check and scoped lint all PASS after the final UI wording and fixture corrections.
- No raw-file index/multiplicity proof, arbitrary ring/ellipse certification, full import format matrix, direct/placed/section UI matrix, delayed callback race injection, persisted annotation or original #273 completion claim.

Run after freezing all writers, with a fresh external artifact directory:

```sh
MESH_CIRCLE_FROZEN=1 PW_DIR=/path/to/playwright CHROME=/path/to/chrome node test/mesh-circle-browser.mjs /absolute/external/artifacts
```

The driver records source digests, independent oracle inputs, native download, screenshots, failures and cleanup. Existing HOLD and schema/history contracts remain unchanged.
