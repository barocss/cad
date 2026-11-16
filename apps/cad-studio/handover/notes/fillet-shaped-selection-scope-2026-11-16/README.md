# Shaped Fillet source-selection scope (#23)

## Scope

The current preview evidence path supplies exact picked/added native targets for qualified Circular Fillets only. A successful Conic/G2 preview must not present its selected-source count as the full affected scope. This change labels the existing Edges row as `Selected source edges` and states that exact tangent scope is unavailable. It does not derive a target count from preview topology, silently assume zero additions or alter the native operation. Source selection includes both explicit picked edges and edges around selected faces; it is not universally described as direct edge picks.

The notice is limited to accepted Edge Fillet Conic/G2 previews with no exact Fillet scope. It disappears for pending/refused previews, Circular, unrelated commands and an available exact report. Existing exact Circular scope rendering remains unchanged. No preview hook, stored feature, API, geometry algorithm, Shell or manufacturing HOLD changes.

## Reproduction and verification

Baseline actual Chrome at 1024 × 900 used a stadium prism (20 mm straight span, R4 ends, height 6 mm). One original top edge at R1 showed Circular 1 picked / 3 tangent additions, but Conic and G2 .4 both lost this distinction and returned to `Edges 1 edge`. Both shaped previews succeeded; Circular restoration and G2 Apply/Undo/Redo passed. Baseline output: `/tmp/cad-shaped-scope-baseline01`.

PASS: new/adjacent Hud tests 5/5, Studio TypeScript, affected-file ESLint and production build (4.11 s). Final frozen-source Chrome passed at 1024 × 900 (`/tmp/cad-shaped-scope-final01`); both Conic and G2 screenshots were visually reviewed. Page errors, console errors and downloads were all zero. Existing Vite directive/dynamic-import warnings remain. The final browser exercises both sections, input refusal/recovery, Circular restoration and authored one-edge Apply/Undo/Redo. This is a truthful evidence-display fix, not new numerical geometry qualification or proof of exact shaped tangent targets. #23 remains open for its other acceptance conditions. No downloads or full repository suites.

Commands from Studio under the shared heavy lane:
- `node scripts/test.mjs fillet-shaped-scope`
- TypeScript no-emit, changed-file ESLint and Vite production build
- `SHAPED_SCOPE_FROZEN=1 PW_DIR=... CHROME=... node test/fillet-shaped-scope-browser.mjs OUTPUT`
