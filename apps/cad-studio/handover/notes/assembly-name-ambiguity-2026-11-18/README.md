# #719: ambiguous public Assembly names

Base: f692994d7c394147e2bb5f6d26336c7e908dfdfd. Public name-based API only; Studio's ID selection is not defective.

## Actual baseline

A 10×10×10 Pin plus a 30×10×10 authored `Pin 2`, then a linear count-2 pattern of Pin, gives both `pat1-1` and `p2` the name `Pin 2`. Studio's actual selection of p2 shows **3000 mm³**. The public `idOf/part('Pin 2')` consumes that same opened document but returns pat1-1 and **1000 mm³**. Actual native Save and fresh Open reproduce it. Pattern removal restores p2/3000; input is unchanged.

## Fix and boundaries

`Assembly.idOf` rejects multiple matching names with typed `PART_AMBIGUOUS`, listing the colliding IDs. It does not add ID lookup, rename data, remove pattern occurrences, change geometry or edit the source. Unique names (including generated pattern names), base and missing-name behavior remain unchanged. Nested mate ID/name path lookup has a separate existing contract and is outside this fix.

Actual fixed Chrome run: same rendered selection and saved duplicate names, but the public API explicitly refuses both before and after fresh Open. The UI appearance intentionally does not change; the JSON receipts prove the API result. Pattern removal and original document preservation pass.

## Verification

- Frozen Chrome baseline: expected FAIL on missing ambiguity error. Fixed: PASS.
- Source changes during each browser run: none; contexts/browser/server closed.
- Focused plus existing `api-assembly` / `instance-patterns`: 34/34 PASS.
- Model TypeScript PASS; Studio TypeScript PASS; owned-file ESLint PASS (all exit 0).
- Screenshots directly inspected locally. Public GitHub rendering is a separate check, not inferred from a successful upload.

## Harness recovery note

The initial shell wrapper used zsh's read-only variable `status` after the baseline browser finished. This aborted its intended automatic source restoration. The browser receipt and cleanup had already completed; the two owned product files were immediately restored from their saved copies and SHA256-verified. The replacement wrapper uses bash and `run_exit`; `--restore-check` executes the EXIT restoration and verifies both hashes. No unrelated WIP was changed.
