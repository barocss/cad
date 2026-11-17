# #654: retained occurrence identity across new patterns

Base: `73319d093`. Existing #650 reserves ordinary instance IDs; this change covers the separate freshPatternId allocator.

## Actual baseline
Synthetic A9-7 bearing/housing fixture: housing seed at X=-40, linear count 2 / spacing 40 / X creates pat1-1 at X=0. The existing bearing explicitly references that occurrence and evaluates successfully. Actual Studio Delete pattern retains the reference and yields missing pat1-1. Make pattern then reused pat1, and the existing bearing incorrectly evaluated successfully against the new occurrence. Both focused model and first Chrome baseline failed at the identity assertion. This is a new pattern operation, not a same-pattern skip restoration.

## Bounded change
Use takenInstanceIds in freshPatternId alongside the existing pattern/referrer checks. Existing held drawing geometry and root/immediate-child/pending bearing references reserve their occurrence prefix. Deeper child-local namespaces do not reserve root IDs. No reference is deleted or rewritten; deletion, normal pattern editing, same-pattern skip restoration and Undo contracts stay unchanged. Unreferenced removed pattern IDs remain reusable.

## Validation
Final focused suite: 48/48 PASS (pattern-retained-identity, instance-patterns, bearing-housing-identity, assembly-steps). Model tsc and scoped ESLint PASS. Initial new test omitted DrawingSettings defaults; corrected the test fixture and reran types and all 48 tests. No product type regression.

The browser inspector uses actual product resolveShopTree/evaluatePart on accepted Docs. It is not an independent physical/manufacturing oracle. Existing synthetic fit/shoulder warnings remain outside this identity fix. No drawing export or broad pattern qualification is claimed. Existing PDF golden and unrelated Workspace lint limitations were not rerun or reclassified.

Browser command: `PATTERN_RETAINED_IDENTITY_FROZEN=1 node apps/cad-studio/test/pattern-retained-identity-browser.mjs <fresh-output>` with installed Chrome/PW_DIR. The final driver additionally frames all geometry for readable screenshots; this does not alter accepted documents or action sequence.

Final actual Chrome run PASS on first corrected-product execution: new pat2, old pat1-1 reference retained/missing, two Undo operations restore original pat1 with successful bearing evaluation, Redo restores missing state. Native Save/fresh Open preserves it. Frozen source capsule unchanged. Screenshots reviewed: missing housing warning is intentional correct behavior, not a regression.
