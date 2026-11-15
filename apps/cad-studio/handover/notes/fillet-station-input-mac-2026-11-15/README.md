# D1406 — Fillet interior input boundaries

Issue #144. Creation and History now report invalid interior percentages beside their owning inputs, with custom HTML validity, ARIA linkage and Apply/Enter guards. Fraction endpoint and pair ordering use exactly the existing native 1e-9 margin after percentage division. Untouched History fractions are read directly rather than round-tripped through percent. Native geometry admission and schema are unchanged; valid numerical positions can still receive an unrelated native geometry refusal.

## Changes and verification

- Private helper `src/app/filletInteriorInput.ts`; Hud and NodeEditor field-local presentation; App prevents invalid busy Apply reservation and cancels an older queue on invalid edits; useCommandPreview refuses invalid input before dispatch while retaining current-owner/late-result rules.
- Read-only High numerical review found no blocking defect. Adjacent-double/native margin tests and controlled History Apply payload tests preserve lossy untouched fractions when radius or the other station changes.
- Studio focused tests 37/37 PASS, retained Model interior/API tests 13/13 PASS, Studio type check, targeted lint, driver syntax and diff check PASS. Production build PASS (combined with independent D1407).
- Actual Chrome 1024×800 and 1440×900: range/order errors, empty input, native custom validity, correction, invalid Enter while a real worker reply is held, and separately valid pending Enter followed by invalid editing without Enter all PASS. Correction/release never implicitly commits. Mode change/Constant/Cancel, History Reset/feature switch, same-ID document Open, valid edit, Undo/Redo, Save/fresh Open PASS.
- Independent polynomial integration: initial analytic volume 11964.57664564985 mm³, native 11964.576645649728; edited analytic 11957.92398871517, native 11957.923988715233. Strict B-rep and seven native surface sections PASS with maximum residual 1.051e-12 mm. Acceptance limits remain 1e-7 mm³ and 1e-6 mm.
- Edited/reopened native digest `bdb4efbc9822d9dd40b29fa9e215cceff1702298e9d00ea1fd71cf38807f3333` matches at both widths. Root visually reviewed 1024 range error, 1440 order error and reopened solid screenshots.
- Final local receipt `d1406-second/receipt.json` SHA256 `7134226f1ed59efc1d909a1f578099f04cdf39888884fad2c1df3035798185e2`: PASS, zero browser/console errors/source changes, four contexts/browser/server closed.

## Preserved first failures and limits

The first typed worker test fixture omitted required wallTime; corrected test-only. First browser attempt reached same-ID Open but its existing same-node-count/same-JSON waits returned before asynchronous file loading, leaving the old 0% draft. The driver now waits for the actual Discard changes confirmation, clicks it and waits for editor retirement before retaining the original 62.5% assertion. That first run also observed the concurrent test-fixture correction and is not a frozen-source PASS. Its failure evidence remains intact; no product change was made to resolve that driver race.

Evidence is local, not a public artifact link. Desktop convex right-angle box Fillet scope only; assistive technology/mobile/full CAD qualification and CI are not claimed. Companion D1407 binding-affordance change was present during browser validation and is committed separately. Existing baseline drawing failures, #613 overlaps and HOLDs remain.
