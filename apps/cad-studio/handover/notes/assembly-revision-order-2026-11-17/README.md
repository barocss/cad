# Shared part revision order during file replacement

Base: `54bf8d5ce`. This fixes the definition revision contract, not a numeric-input control.

## Contract and failure

`assembly/definitions.ts` documents that an incoming file retains its revision only when newer than the placed definition; otherwise its changed geometry is offered at the next placed revision. `newerRevision` documents comparison within one numbering scheme (letters or digits), keeping the first when incomparable. Existing `definitions.test.ts` already asserts that editing a definition never goes backwards.

The previous `offerRevision` accepted any different non-A label. A changed thickness file labelled B against placed D was offered as B. Its ordering helper also compared numeric and alphabetic ranks across schemes (D + 12 → 12). New controlled tests first failed both cases, with the six existing tests passing. Actual Chrome independently displayed **Rev D / Accept Rev B** before the fix (`before.png`).

The fix reuses the existing ordering helper for offers and bounds that helper to same-scheme comparisons. Older/equal/incomparable files use the next current revision; genuinely later labels remain exact. Original file `drawing.revision` is retained: assembly definition E can deliberately contain source file B. This is not approval/release history, an auto-accept mechanism, or a rewriting of source metadata. Previously saved pending revisions are not migrated. Public file schema and geometry/source identities are unchanged.

## Verification

- Model tests: 93/93 PASS across definitions, instance-looks, assembly-cut and instance-patterns. New table covers D+B→E, D+D→E, D+F→F, 09+02→10, 09+12→12, D+12→E, 09+Z→10, and noncomparable label fallback. In-place edit retains numeric scheme instead of changing 09 to AA.
- Actual Chrome baseline FAIL; fixed PASS on three drilled mounting plates, two sharing `mount` and an independent `spare`. Changed file takes thickness 8→12 mm, label B. Before Accept, both placed instances remain D/8. Keep leaves them unchanged. Accept takes both to E/12 while spare stays D/8; definition IDs, transforms (including a 90° occurrence), source hole features and independent instance stay intact.
- Undo returns pending E and old height8; Redo returns E/12. Native Save and fresh-context Open reproduce accepted state. A later comparable G file is offered as G and can be dismissed without changing E.
- Visual review: pending E versus current D and accepted E shared by2 are visible. Existing placement overlap is retained; no interference certification is claimed.
- Model and Studio TypeScript, focused ESLint and diff whitespace checks PASS. Browser frozen source unchanged before/after/cleanup.

Reproduce from root with Node22:

```
node packages/barocss-cad-model/scripts/test.mjs definitions instance-looks assembly-cut instance-patterns
node node_modules/typescript/bin/tsc --noEmit -p packages/barocss-cad-model/tsconfig.json
node node_modules/typescript/bin/tsc --noEmit -p apps/cad-studio/tsconfig.json
ASSEMBLY_REVISION_ORDER_FROZEN=1 PW_DIR=<playwright package> CHROME=<Chrome executable> node apps/cad-studio/test/assembly-revision-order-browser.mjs <fresh output>
```

Limits: no nested/mated assembly or external project-file watcher browser validation; no neutral exports or BOM revision-release certification. Existing Number-based successor limits for enormous revision labels are not changed or claimed. #178 remains open and all HOLDs remain intact.
