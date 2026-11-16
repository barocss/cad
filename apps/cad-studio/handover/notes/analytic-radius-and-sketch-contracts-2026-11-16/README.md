# Analytic radius boundary and sketch regression contracts

Read baseline `3eadafea28fc456acecaed7f08be624b840a68f9`. No production geometry, rendering, schema, rounding or golden changed.

## #35 independent provenance review

The previous native circle→Extrude→top-projection witness remains relevant: authored radius 6.35 becomes projected 6.3500000000000005 and diameter 12.700000000000001. The independent Fraction check in `../remaining-validation-triage-2026-11-16/` establishes that the current asymmetric deviations do not widen the raw interval; it does not establish equality with the authored nominal.

A second source review confirmed the earliest conversion and missing ownership contract:

- `packages/barocss-cad/src/part/part-model.ts` `sketchOuter` converts circle radius to an arc start `[center.x + radius, center.y]`. It does not carry the independent radius through that profile segment.
- `src/types.ts` Curve contains degree, knots, control points and weights. `src/brep/brep-core.ts` BrepEdge holds that Curve, vertices, tolerance and optional name. Brep source only identifies family/id. None is an authored analytic radius receipt.
- `src/brep/brep-tessellate.ts` `circleOf` reconstructs radius from chord/weights using `acos`, `hypot` and `sin`. `brep-hidden-line.ts` propagates it into projected circles. Model `drawing/dimensions.ts` doubles it for diameter.
- Face geometry and cylinder-frame recovery use the same reconstruction, so they are not an independent source. Boolean face-origin candidate sets do not prove an edge's unchanged analytic radius.

Thus there is no safe existing-metadata substitution. Do not infer a radius by feature name, choose an apparent decimal, force symmetry, or replace the kernel formula just to pass this witness. Even an algebraically equivalent reconstruction is not authored provenance. The native test need not be repeated to establish this missing contract.

A future bounded solution must carry an analytic receipt from authored evaluation to the exact current output/edge, with revision identity and explicit preservation/invalidation. Terminal circle→straight Extrude is a potential first profile, not currently implemented support. Boolean operations, deformation, placements and unknown inputs need proven preservation or fallback/refusal; parameters and changed revisions must invalidate stale receipts. Independent authored analytic bounds, translated/rotated cases, native strict checks and inward rounding must be compared before the display may consume it. This is a new provenance contract, not a schema migration or permission to widen the fitter. #35 remains open; PDF HOLD remains untouched.

## #264 display ownership and no-op Finish

Added renderer-only tests for Parallel, Perpendicular, Equal, Fixed and Coincident glyphs: all eight glyphs survive, a relation on two edges retains two glyphs, repeated input is deterministic, zoom recomputes placement, displaced leaders originate at the original edge midpoint/point, and another sketch using rule index zero does not inherit the old title/leader. Callback traps and source comparison check rendering does not author changes. These synthetic renderer fixtures do not claim solver admission, actual DOM bounds, high-DPI, file roundtrip or complete issue acceptance.

Corrected stale `sketch-edit-identity` expectations to the existing no-op Finish contract: no evaluation/commit, editor closes, exact accepted document reference and all fields remain. The normal canonical-equivalent cases preserve their records; duplicate/pending/current construction cases now make a real profile edit to exercise allocation. The SSR harness remounts refs, so it cannot qualify the identity-reference early return for unchanged malformed records. An attempted extra three-case check failed for this harness reason and was removed rather than changing production or mocking React internals. Existing actual-edit and positional migration expectations remain. This hook harness has no actual history stack; it does not newly prove Redo. Prior browser history receipts remain separate.

## Validation

Focused renderer tests: 3/3 PASS. Updated sketch identity suite: 34/34 PASS. The preceding baseline retained its known 5 failures; an intermediate 34/37 run exposed the SSR limitation above. Final aggregate/type/lint results follow. No repeated native geometry run, browser run, file download, golden regeneration or production build was needed for this test/document-only batch. Existing original-checkout WIP and all HOLDs remain unchanged.

Final Node 22 aggregate `node scripts/test.mjs sketch-constraint-mark constraints sketch-edit-identity`: **70/70 PASS**. Studio `tsc --noEmit`, affected two test files ESLint, and `git diff --check`: **PASS**. No production change, hence no new runtime-feature or browser acceptance claim. #264 remains open for its actual multi-type/high-DPI/transition/file matrix. Remote baseline was confirmed unchanged before publication.
