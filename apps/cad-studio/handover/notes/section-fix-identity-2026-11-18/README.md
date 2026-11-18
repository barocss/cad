# #696 Automatic section fixes preserve retained identities

Baseline: 46e474d5781d5ad8471ef150e23bc0b68f5497c3. A shaft/keyway drawing retains a manual dimension originally attached to section B at Z14. Without B the dimension is unresolved. The real hidden-dimension Fix button generated another B at Z15, making that old dimension resolve and render as 16.5 despite its stored Z14 references.

The automatic proposal and application now reserve existing/retained letters, including other sheets via transient SheetContext. Existing annotations and duplicate data are not cleaned up or rebound. An already present local section still makes a repeated fix a no-op. Stored format is unchanged.

## Verification
- Frozen actual Chrome baseline: expected assertion FAIL after Add B–B produced the incorrect resolved dimension; image inspected.
- Frozen actual Chrome fix: PASS. Adds C–C at Z15; retained B stays unresolved and unchanged. Undo/Redo restores exact documents. Native Save/fresh Open keeps C and the retained B dimension. Image inspected.
- No source changes during either run; browser/context/server cleanup complete.
- section-dimensions plus first identity regression: 9/9 PASS, including existing aligned-section and SVG/DXF behavior. Expanded identity suite: 2/2 PASS (other-sheet reservations, stale fix, duplicate preservation, existing-section no-op).
- Owned-file ESLint PASS. Studio type result recorded in issue.

Run test/section-fix-identity-browser.mjs with SECTION_FIX_IDENTITY_FROZEN=1. This does not repair old topology or claim a fully approved manufacturing drawing. Existing unrelated PDF golden/lint limits remain separate.
