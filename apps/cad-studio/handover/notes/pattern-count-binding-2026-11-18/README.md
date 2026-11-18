# Numeric-only pattern Count — existing issue #25

The single product condition excludes Count from generic parameter binding for ordinary `linear-pattern` and `circular-pattern`. Count remains numeric. Existing setters/ranges, Z spread-to-angle calculation, Linear Spacing and Z axis-position Dim binding are unchanged. Feature-cut patterns, schema/native support and HOLDs are not expanded. The broader issue remains OPEN.

## Baseline

On 8e67dcf3c2ad775e076b6dc66b50fb96f71952d2, four independently executed actual Chrome flows opened a synthetic rectangle [10,20]–[14,26], Extrude8 fromZ30, and a terminal Count3 pattern. One output contains three disjoint closed solids, each192 mm³.

- Linear X spacing30 and Circular X/Y step90: Count parameter4 produces an empty numeric display; Apply refuses with native integer-count detail. Accepted document/history/native geometry stay intact.
- Circular Z count3, span360, angle120: selection is immediately refused with `Cannot bind that value`; Count3 remains and Apply is disabled. This is not the same failure as the other axes.
- Numeric3→4, Cancel, Undo/Redo and Save/fresh Open pass in all four original flows. Supported Linear Spacing35 and Z PivotX3 binding lifecycle also pass.

No data loss is claimed. The problem is exposing an operation the saved/native Count contract does not support.

## Modified actual checks

All four actual flows pass with Count selector absent. Numeric4 remains editable before/after Save/Open and has four disjoint solids,768 mm³. Independent eight-corner-per-copy bijection, rotation signs, volume and centroid agree. X/Y preserve90° step; Z changes120→90° with Count3→4. Linear Spacing35 and Z PivotX3 bindings remain available, stored as references and restored by fresh Open with correct transformed native geometry.

The fixture uses file Open to reach existing History, not pointer-created pattern generation. Later Parameters-value recomputation is unit-only, not newly claimed actual coverage. Native validity does not certify manufacturing output.

## Verification

- Four baseline and four fixed runs of `pattern-count-binding-browser.mjs`, selected by `--kind linear|circular-x|circular-y|circular-z`; env `PATTERN_COUNT_BINDING_SOURCE_FROZEN=1`. All PASS with errors=[], source changes=[] and contexts/browser/server closed.
- Existing `circular-count-parity-browser.mjs` (D1141) and `circular-z-spread-history-browser.mjs`: PASS.
- New4 plus existing Count/axis/spread14 focused tests:18/18 PASS.
- Model type-check, Studio tsc/Vite build, scoped ESLint, syntax and diff checks: PASS.
- Initial new unit-test lint had an unused destructuring variable; replaced with an explicit assertion, then tests/lint rerun successfully. Product and actual checks had no failing run in this unit.
- Independent source/fixture/test reviews completed before frozen verification. Task-local evidence only; doc-sync remains paused.

Exact-commit CI and public image rendering are recorded in existing #25 after integration.
