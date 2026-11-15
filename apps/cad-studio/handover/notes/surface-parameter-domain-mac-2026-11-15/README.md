# D1387 — surface parameter domain guidance

Completes #165 at the tested desktop scope. Direct inspection now shows finite inclusive U/V domains beside each input. Invalid drafts show no previous measurement. Split states its strictly interior condition before application and disables invalid input. Raw drafts reset with geometry, selected object, axis and domain ownership. Native geometry admission remains unchanged.

## Implementation

- `src/ui/DirectPanel.tsx`: owned raw surface parameters and local accessible domain feedback. Inspection includes endpoints; Split excludes them.
- Iso-curve and Insert knot retain native handling for finite values, including endpoint semantics. Blank/nonfinite drafts do not execute. No generic NumberField or kernel change.
- `test/direct-surface-domain.test.ts`: component/native regressions for ranges, stale-result removal, ownership and adjacent operations.
- `test/direct-surface-parameter-browser.mjs`: actual desktop lifecycle with independent geometry checks.

## Verification

Mac Node 22.19.0: 12/12 focused surface-domain, pole-weight and crossings tests PASS; targeted ESLint, Studio TypeScript and production build PASS. Only an unused test import was removed after the build started; product code did not change.

Actual Chrome at 1024×800 and 1440×900 PASS on the D341 panel, U[-2,6], V[1,7]. u7 shows the local numeric range, aria-invalid and no Point/old D2 failure. u2 recovers. All four domain endpoints inspect successfully. Split excludes each endpoint in U and V. U2 creates two visible native surfaces while retaining the hidden original; native domains are [-2,2] and [2,6] × [1,7]. Independent corner oracle: `[10+5*(u+2), -6+5*(v-1), 3]`. Original source, Undo/Redo and native Save/fresh Open PASS. Screenshot review confirms readable local guidance and disabled Split at both widths. No source changes or browser errors recorded.

Receipt: `d1387-first/receipt.json`, SHA256 `c6161dc264a71b6eaf58a55095739a2b2b5122b76a3bcbd3c6c79b8dc8c408c2`. Local evidence is retained outside the repository. This is first-run browser PASS.

Other degrees, assistive technology and the full CAD suite were not run. Existing unrelated App lint and aggregate documentation inventory drift remain separate. No HOLD, geometry family or native capability was widened.
