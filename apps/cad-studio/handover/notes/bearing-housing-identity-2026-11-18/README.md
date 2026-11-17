# Deleted bearing housing occurrence identity (#650)

Base `c666bd18d`. Existing A9-7 synthetic shaft/bearing and tube housing, renamed to `inst1` (housing) and `inst2` (bearing owner). The original document evaluates successfully. Delete the housing: the exact saved `housingRef` remains and evaluation refuses `housing part inst1 no longer exists`. In actual Chrome, Insert part then reuses `inst1`; resetting the new housing's placement to zero causes the accepted document to evaluate successfully again, with housing bore47/covered=true. The old link has silently bound to a newly inserted occurrence.

`assembly/takenIds.ts` now reserves housing links in root nodes, immediate child definition nodes and pending revision root nodes. Suppressed references remain reserved because they can be restored. Deeper child-local namespaces are not recursively mixed into the root. No reference or node is changed or silently removed. Explicitly removing the reference releases its ID. All existing Insert/Duplicate/library/fastener callers share this allocator. Newly read root fields are optional to preserve the previous partial-object helper contract.

## Verification

- Focused unit baseline **FAIL**: new ID is inst1 and the old bearing evaluates ok=true against the replacement.
- Initial focused/bearing-context/assembly-step regression **26/26 PASS**. After adding the partial-input compatibility control, final **27/27 PASS**. Includes drawing reference ID allocation, suppressed/pending refs and namespace separation.
- Initial type check found a new test fixture's `suppressed` inferred as boolean rather than literal true; corrected. Final Model and Studio TypeScript **PASS**. Scoped source/test lint and diff whitespace **PASS**.
- Actual browser baseline **FAIL**, with preserved accepted Docs and native evaluator reports: original valid → deletion missing → replacement reuses inst1 → at zero pose valid again. This is not merely an ID observation.
- Fixed01 **PASS**. Read-only review then recommended preserving partial helper input compatibility; nodes became optional and a unit control was added. Final fixed02 **PASS** against that final source, without driver changes. All three frozen capsules match cleanup.
- Final browser creates **inst3**, and the unchanged bearing reference still reports missing inst1 even at the old housing pose. Three Undo operations restore the original housing and successful evaluation; three Redo operations restore the safe missing state. Native Save/fresh Open preserves the original link and missing result. Downloaded file semantically equals accepted Doc.
- Baseline, retained-missing and reopened screenshots visually inspected. Evaluator outputs are results of the existing native/model implementation applied to each actual accepted Doc, not a new independent physical certification.

No new bearing geometry, housing scope, manufacturing/equipment approval or nested addressing contract. Existing fixture warnings (bearing/housing shoulder location) and its supplied test row remain test data, not design certification. Existing WIP/HOLD unchanged.

Reproduce with Node22 from repository root:

```
node packages/barocss-cad-model/scripts/test.mjs bearing-housing-identity bearing-housing-context assembly-steps
node node_modules/typescript/bin/tsc --noEmit -p packages/barocss-cad-model/tsconfig.json
node node_modules/typescript/bin/tsc --noEmit -p apps/cad-studio/tsconfig.json
BEARING_HOUSING_IDENTITY_FROZEN=1 PW_DIR=<playwright package> CHROME=<Chrome executable> node apps/cad-studio/test/bearing-housing-identity-browser.mjs <fresh output>
```
