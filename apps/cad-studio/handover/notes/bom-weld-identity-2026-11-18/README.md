# #694 Weld geometry in placed-part BOM identity

Baseline 8af077eb08412734bf3f0a5592d16958189d55ec: two inline welded frames differ only by authored fillet leg 2/3 mm. Evaluated bead volumes 330.6666667/756 mm³ and part masses 3178.901/3180.049 g differ. Actual Studio BOM and downloaded CSV nevertheless merged them as first part, qty 2.

The fingerprint now includes only converted weld-bead features after evaluation. Existing feature/parameter identity and library-backed conversion remain unchanged. Notes, symbol flags, nonmodeled/orphan/suppressed and kernel-refused beads do not introduce false grouping distinctions. No new bead BOM line or document mutation.

## Verification
- Actual Chrome frozen baseline: expected FAIL after observing one row and downloading CSV.
- Actual Chrome frozen fix: PASS, two rows qty 1, total qty 2 and 6358.95 g unchanged; downloaded CSV matches computed data; native Save/fresh Open retains both rows.
- Both receipts: source changes empty, contexts/browser/server cleaned up. Images inspected.
- Focused model suite: 22/22 (bom-weld-identity, weld-beads, bom-body-materials, bom-nested). Includes nested grouping, kernel refusal/incomplete accounting and immutable input controls.
- Owned-file ESLint and Studio TypeScript: PASS.

Run browser with BOM_WELD_IDENTITY_FROZEN=1 and test/bom-weld-identity-browser.mjs. Manufacturing approval, general geometric equivalence and new weld support are outside scope. Existing unrelated PDF golden/lint limits are unchanged.
